"use server";
// Review board actions: pick up, ask for changes, send to final review, send back, reject;
// comment; like / dislike. Every status move is logged with who made it.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, lastDecision, type Status } from "@/lib/review";
import { getViewer } from "@/lib/viewer";
import { CoverError } from "@/lib/coverFetch";
import { coverStorageReady, storeCover } from "@/lib/coverStore";

export type ActionResult = { error: string } | undefined;

type Move = "pick_up" | "ask_changes" | "back_to_review" | "send_final" | "send_back" | "reject";
const MOVES: Record<Move, { from: Status[]; to: Status; publisher?: boolean }> = {
  pick_up: { from: ["needs_review"], to: "in_review" },
  back_to_review: { from: ["changes_requested"], to: "in_review" },
  ask_changes: { from: ["needs_review", "in_review"], to: "changes_requested" },
  send_final: { from: ["in_review"], to: "final_review" },
  send_back: { from: ["final_review"], to: "in_review", publisher: true },
  reject: { from: ["needs_review", "in_review", "changes_requested", "final_review"], to: "rejected" },
};

export async function moveSubmission(number: number, move: Move): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { error: "You've been signed out. Log in again." };
  const m = MOVES[move];
  if (!m || !can.decide(v)) return { error: "Only editors can do that." };
  const sql = db()!;
  const [s] = await sql<{ id: string; status: Status; member_id: string; by_system: boolean }[]>`
    select s.id, s.status, s.member_id, m.role = 'system' as by_system
      from musicvolume.submissions s join musicvolume.members m on m.id = s.member_id where s.number = ${number}`;
  if (!s) return { error: "That submission no longer exists." };
  if (s.by_system && move === "ask_changes") return { error: "MusicBrainz can't make changes. Reject it to keep the current value, or send it on to publish." };
  if (!m.from.includes(s.status)) return { error: "Someone else moved this one already. Reload to see where it is now." };
  if (s.status === "final_review" && !can.publish(v)) return { error: "Only a tier 3 editor or an admin can change a submission in final review." };
  if (move === "reject" && !can.reject(v)) return { error: "Only a tier 2 or 3 editor or an admin can reject. Ask for changes, or leave a comment." };
  if (m.publisher && !can.publish(v)) return { error: "Only a tier 3 editor or an admin can do that." };
  if (s.member_id === v.id && v.role !== "admin") return { error: "You can't review your own submission. Another editor will pick it up." };
  const last = await lastDecision(s.id);
  if (last && last.id !== v.id && !can.override(v, last)) {
    return { error: `${last.username} (a higher-tier editor) made the last decision here, so only someone of their tier or an admin can change it.` };
  }
  await sql.begin(async (tx) => {
    // Only moves it if nobody else did in the meantime.
    const done = await tx`
      update musicvolume.submissions set status = ${m.to}, updated_at = now(),
             reviewer_id = case when ${move === "pick_up"} then ${v.id}::uuid else reviewer_id end
       where id = ${s.id} and status = ${s.status}`;
    if (!done.count) throw new Error("moved");
    await tx`insert into musicvolume.submission_events (submission_id, member_id, action, from_status, to_status, detail)
             values (${s.id}, ${v.id}, 'status', ${s.status}, ${m.to}, ${tx.json({ move })})`;
  }).catch((e) => { if (e.message !== "moved") throw e; });
  revalidatePath("/review", "layout");
  return undefined;
}

export async function addComment(number: number, field: string | null, body: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { error: "You've been signed out. Log in again." };
  if (!can.comment(v)) return { error: "Only editors can comment. You can like or dislike instead." };
  const text = body.trim().slice(0, 4000);
  if (!text) return { error: "Write something first." };
  const f = field && /^[a-zA-Z]{1,40}$/.test(field) ? field : null;
  const sql = db()!;
  const [s] = await sql<{ id: string }[]>`select id from musicvolume.submissions where number = ${number}`;
  if (!s) return { error: "That submission no longer exists." };
  await sql`insert into musicvolume.submission_comments (submission_id, member_id, field, body) values (${s.id}, ${v.id}, ${f}, ${text})`;
  revalidatePath("/review", "layout");
  return undefined;
}

/** Like (1), dislike (-1), or take back (0) on a submission or a comment. */
export async function vote(target: "submission" | "comment", id: string, value: -1 | 0 | 1): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { error: "You've been signed out. Log in again." };
  if (!can.vote(v)) return { error: "Tier 2 contributors and up can like or dislike." };
  if (!/^[0-9a-f-]{36}$/i.test(id) || ![-1, 0, 1].includes(value)) return { error: "Something went wrong." };
  const sql = db()!;
  if (value === 0) await sql`delete from musicvolume.votes where target_type = ${target} and target_id = ${id} and member_id = ${v.id}`;
  else {
    await sql`insert into musicvolume.votes (target_type, target_id, member_id, value) values (${target}, ${id}, ${v.id}, ${value})
              on conflict (target_type, target_id, member_id) do update set value = excluded.value, created_at = now()`;
  }
  revalidatePath("/review", "layout");
  return undefined;
}

/**
 * A linked cover, made ready to publish: downloaded once, checked, shrunk to 1200 px and 300 px,
 * saved in storage and remembered on the submission. The publisher sees this exact copy before
 * publishing, so a picture swapped behind the link afterwards can't slip in.
 */
export async function prepareCover(number: number): Promise<{ error: string } | { small: string; sha: string; width: number; height: number }> {
  const v = await getViewer();
  if (!v) return { error: "You've been signed out. Log in again." };
  if (!can.publish(v)) return { error: "Only a tier 3 editor or an admin can publish." };
  if (!coverStorageReady()) return { error: "Cover storage isn't set up on this site yet (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)." };
  const sql = db()!;
  const [s] = await sql<{ id: string; status: string; link: string | null }[]>`
    select id, status, changes->'cover'->>'to' as link from musicvolume.submissions where number = ${number}`;
  if (!s?.link) return { error: "This submission has no cover." };
  if (s.status !== "final_review") return { error: "Only submissions in final review can be published." };
  try {
    const c = await storeCover(s.link);
    await sql`update musicvolume.submissions set cover_stored = ${sql.json(c as never)} where id = ${s.id}`;
    return { small: c.small, sha: c.sha, width: c.width, height: c.height };
  } catch (e) {
    if (e instanceof CoverError) return { error: `The cover can't be used: ${e.message}` };
    console.error("prepareCover", number, (e as Error).message);
    return { error: "Couldn't save the cover. Nothing was published. Try again, or tell an admin." };
  }
}

/** Publish a submission in final review into the catalog (tier 3 editors and admins). */
export async function publishSubmission(number: number, coverSha?: string): Promise<ActionResult | { href: string }> {
  const v = await getViewer();
  if (!v) return { error: "You've been signed out. Log in again." };
  if (!can.publish(v)) return { error: "Only a tier 3 editor or an admin can publish." };
  const sql = db()!;
  const [c] = await sql<{ has_cover: boolean; sha: string | null }[]>`
    select changes ? 'cover' as has_cover, cover_stored->>'sha' as sha from musicvolume.submissions where number = ${number}`;
  if (c?.has_cover && (!c.sha || c.sha !== coverSha)) return { error: "Check the cover again before publishing." };
  try {
    const r = await sql.begin(async (tx) => {
      const [{ r }] = await tx<{ r: { type: string; slug: string } }[]>`select musicvolume.publish(${number}, ${v.id}) as r`;
      if (c?.has_cover) await tx`select musicvolume.apply_cover(${number}, ${v.id})`;
      return r;
    });
    revalidatePath("/", "layout");
    return { href: `/${r.type}/${r.slug}` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P0001" && err.message) return { error: err.message };
    console.error("publish", number, err.message);
    return { error: "Publishing failed. Nothing was changed. Try again, or tell an admin." };
  }
}
