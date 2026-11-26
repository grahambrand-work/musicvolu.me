"use server";
// Submitting suggested edits from an entry page's edit mode.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { lastDecision, reviseBlock } from "@/lib/review";
import { countChanges, describeChanges, normalize, validate, type ArtistValues, type Kind, type Values } from "@/lib/edits";
import { getEditable, getSubmission, OutOfEdits, resolveMembers, saveSubmission } from "@/lib/submissions";
import { getViewer } from "@/lib/viewer";
import { CoverError, fetchCover } from "@/lib/coverFetch";
import { pendingPath, removeFiles } from "@/lib/coverStore";

export type SubmitResult = { error: string; fields?: Record<string, string> } | undefined;

const KINDS: Kind[] = ["artist", "release", "song"];

export async function submitEdit(kind: Kind, slug: string, after: Values, note: string, final = false): Promise<SubmitResult> {
  if (!KINDS.includes(kind)) return { error: "Something went wrong. Reload the page and try again." };
  const viewer = await getViewer();
  if (!viewer) return { error: "You've been signed out. Log in again to submit." };

  const entry = await getEditable(kind, slug);
  if (!entry) return { error: "This entry no longer exists." };

  // Rebuild "before" from the database and keep only fields this form can edit.
  const before = normalize(kind, entry.values);
  const cleaned = normalize(kind, { ...entry.values, ...pick(after, entry.values) } as Values);
  if (kind === "artist") {
    const c = cleaned as ArtistValues;
    c.members = await resolveMembers(c.members, entry.id);
  }
  const fields = validate(kind, cleaned);
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields first.", fields };

  const changes = describeChanges(kind, before, cleaned);
  if (!countChanges(changes)) return { error: "You haven't changed anything yet." };

  const text = note.trim().slice(0, 4000) || null;
  const b = before as Record<string, unknown>, a = cleaned as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(a)) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) diff[k] = { from: b[k], to: a[k] };

  const coverErr = await checkCover(diff);
  if (coverErr) return { error: "Fix the highlighted fields first.", fields: { cover: coverErr } };

  let number: number;
  try {
    number = await saveSubmission(viewer, {
      kind: "edit", entityType: kind, entityId: entry.id, entityName: entry.name, changes: diff, note: text, final,
    });
  } catch (e) {
    if (e instanceof OutOfEdits) return { error: "You've used all your edits for this month. They reset on the 1st." };
    console.error("submitEdit", e);
    return { error: "Couldn't save your edit. Try again in a moment." };
  }
  redirect(`/${kind}/${entry.slug}?submitted=${number}`);
}

/**
 * Change what a sent edit suggests (Graham, 2026-11-19: the sender, plus editors). The diff is
 * rebuilt against the live entry. Logged as "edited" with who did it and which fields moved.
 * When the sender answers "Ask for changes", it goes back to the reviewer.
 */
export async function reviseEdit(number: number, after: Values, note: string): Promise<SubmitResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You've been signed out. Log in again." };
  const s = await getSubmission(number);
  if (!s || s.kind !== "edit" || !s.entitySlug) return { error: "That edit no longer exists." };
  const last = await lastDecision(s.id);
  const block = reviseBlock(viewer, s, last && last.id !== viewer.id ? last : null);
  if (block) return { error: block };

  const kind = s.entityType;
  const entry = await getEditable(kind, s.entitySlug);
  if (!entry) return { error: "The entry this edit is for no longer exists." };
  const before = normalize(kind, entry.values);
  const cleaned = normalize(kind, { ...entry.values, ...pick(after, entry.values) } as Values);
  if (kind === "artist") {
    const c = cleaned as ArtistValues;
    c.members = await resolveMembers(c.members, entry.id);
  }
  const fields = validate(kind, cleaned);
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields first.", fields };
  if (!countChanges(describeChanges(kind, before, cleaned))) {
    return { error: "That leaves nothing to change. Reject it instead if it isn't needed." };
  }
  const b = before as Record<string, unknown>, a = cleaned as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(a)) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) diff[k] = { from: b[k], to: a[k] };
  const coverErr = await checkCover(diff);
  if (coverErr) return { error: "Fix the highlighted fields first.", fields: { cover: coverErr } };
  const old = s.changes as Record<string, { to?: unknown }>;
  const moved = [...new Set([...Object.keys(diff), ...Object.keys(old)])]
    .filter((k) => JSON.stringify(old[k]?.to) !== JSON.stringify(diff[k]?.to));

  const mine = s.author.username === viewer.username;
  const text = note.trim().slice(0, 4000) || null;
  const sql = db()!;
  const ok = await sql.begin(async (tx) => {
    const [row] = await tx<{ status: string; reviewer_id: string | null }[]>`
      select status, reviewer_id from musicvolume.submissions where id = ${s.id} for update`;
    if (!row || row.status !== s.status) return false;
    // The sender's answer to "Ask for changes" goes back to whoever was reviewing it.
    const to = mine && row.status === "changes_requested" ? (row.reviewer_id ? "in_review" : "needs_review") : row.status;
    await tx`update musicvolume.submissions
                set changes = ${tx.json(diff as never)}, entity_name = ${entry.name}, updated_at = now(),
                    note = case when ${mine} then ${text} else note end, status = ${to}
              where id = ${s.id}`;
    await tx`insert into musicvolume.submission_events (submission_id, member_id, action, detail)
             values (${s.id}, ${viewer.id}, 'edited', ${tx.json({ fields: moved })})`;
    if (to !== row.status) {
      await tx`insert into musicvolume.submission_events (submission_id, member_id, action, from_status, to_status, detail)
               values (${s.id}, ${viewer.id}, 'status', ${row.status}, ${to}, ${tx.json({ move: "updated" })})`;
    }
    // An editor's note goes in the discussion, so the sender's own note stays as they wrote it.
    if (!mine && text) {
      await tx`insert into musicvolume.submission_comments (submission_id, member_id, body) values (${s.id}, ${viewer.id}, ${text})`;
    }
    return true;
  });
  if (!ok) return { error: "Someone else moved this one already. Reload to see where it is now." };
  // An uploaded picture this edit no longer uses is deleted straight away.
  const dropped = pendingPath(old.cover?.to);
  if (dropped && JSON.stringify(old.cover?.to) !== JSON.stringify(diff.cover?.to)) {
    await removeFiles([dropped]).catch((e) => console.error("drop upload", (e as Error).message));
  }
  revalidatePath("/review", "layout");
  revalidatePath(`/submission/${number}`);
  redirect(mine ? `/submission/${number}?updated=1` : `/review/${number}?updated=1`);
}

/** A suggested cover must be a link that loads as a usable image (nothing is stored yet). */
async function checkCover(diff: Record<string, { from: unknown; to: unknown }>): Promise<string | null> {
  if (!diff.cover) return null;
  const link = String(diff.cover.to ?? "");
  if (!link) return "Covers can't be removed here. Leave a note for the editors instead.";
  try { await fetchCover(link); return null; } catch (e) {
    return e instanceof CoverError ? e.message : "That link didn't load. Check it opens in your browser.";
  }
}

/** Row fields, for a list the entry has no rows in yet. */
const SHAPES: Record<string, object> = {
  tracks: { id: 0, title: 0, duration: 0 }, credits: { id: 0, role: 0, name: 0 },
  members: { name: 0, role: 0, artistId: 0, slug: 0, image: 0 },
};

/** Only the keys the entry actually has, as strings or the row arrays. Ignores anything extra. */
function pick(after: Values, shape: Values): Partial<Values> {
  const out: Record<string, unknown> = {};
  const src = (after ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(shape)) {
    const x = src[k];
    if (Array.isArray(v)) {
      if (!Array.isArray(x)) continue;
      out[k] = x.slice(0, 500).map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return Object.fromEntries(Object.keys(v[0] ?? SHAPES[k] ?? { id: 0, role: 0, name: 0 })
          .map((f) => [f, typeof r[f] === "string" ? (r[f] as string).slice(0, 400) : ""]));
      });
    } else if (typeof x === "string") {
      out[k] = x.slice(0, 2000);
    }
  }
  return out as Partial<Values>;
}
