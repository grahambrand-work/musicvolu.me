// Suggested edits: what the edit form starts from, how many edits a member has left this
// month, and saving a submission with its log entry.
import "server-only";
import { getArtist, getRelease, getSong } from "./catalog";
import { db } from "./db";
import type { ArtistValues, Kind, ReleaseValues, SongValues, Values } from "./edits";
import { duration, isoDate } from "./format";
import { monthlyAllowance } from "./roles";
import type { Viewer } from "./viewer";

export type Editable = {
  id: string; slug: string; name: string; cover: string | null;
  values: Values;
  /** Shown but not editable here (e.g. a song's first release year comes from its releases). */
  fixed: Record<string, string>;
  /** Counts for the read-only sections under the form ("Discography · 5"). */
  counts: Record<string, number>;
};

/** The entry as the edit form shows it, or null when there is no such entry. */
export async function getEditable(kind: Kind, slug: string): Promise<Editable | null> {
  if (kind === "release") {
    const r = await getRelease(slug);
    if (!r) return null;
    const values: ReleaseValues = {
      title: r.title,
      artists: r.artists.map((a) => a.name).join(", "),
      type: r.type,
      releaseDate: isoDate(r.releaseDate) || (r.year ? String(r.year) : ""),
      label: r.label ?? "", country: r.country ?? "", language: r.language ?? "",
      genres: r.genres.join(", "),
      tracks: r.tracks.map((t) => ({ id: t.id, title: t.title, duration: duration(t.duration) })),
    };
    return { id: r.id, slug: r.slug, name: r.title, cover: r.cover ?? r.coverSmall, values, fixed: {}, counts: {} };
  }
  if (kind === "artist") {
    const a = await getArtist(slug);
    if (!a) return null;
    const values: ArtistValues = {
      name: a.name, note: a.disambiguation ?? "", legalName: a.legalName ?? "",
      kind: a.kind === "Band" ? "Band" : "Solo artist", born: a.born ?? "", origin: a.origin ?? "", years: a.years ?? "",
      genres: a.genres.join(", "), aliases: a.aliases.join(", "), website: a.website ?? "",
    };
    return { id: a.id, slug: a.slug, name: a.name, cover: a.image, values, fixed: {}, counts: { releases: a.releases.length } };
  }
  const s = await getSong(slug);
  if (!s) return null;
  const values: SongValues = {
    title: s.title,
    artists: s.artists.filter((a) => a.role === "main").map((a) => a.name).join(", "),
    duration: duration(s.duration), language: s.language ?? "", genres: s.genres.join(", "),
    credits: s.credits.map((c, i) => ({ id: `c:${i}`, role: c.role, name: c.name })),
  };
  return {
    id: s.id, slug: s.slug, name: s.title, cover: s.cover, values,
    fixed: { firstReleased: s.firstReleased ? String(s.firstReleased) : "" },
    counts: { appearsOn: s.appearsOn.length },
  };
}

export type Allowance = { limit: number | null; used: number; left: number | null };

/** Edits used this calendar month (UTC). Editors and admins have no limit. */
export async function allowanceFor(v: Viewer, sql = db()!): Promise<Allowance> {
  const limit = monthlyAllowance(v);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from musicvolume.submissions
     where member_id = ${v.id} and status <> 'withdrawn' and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'`;
  return { limit, used: n, left: limit == null ? null : Math.max(limit - n, 0) };
}

export class OutOfEdits extends Error {}

/** Saves one submission and its "submitted" log entry. Returns its number (#1042). */
export async function saveSubmission(viewer: Viewer, input: { kind: "edit" | "new"; entityType: Kind; entityId: string | null; entityName: string;
  changes: Record<string, { from?: unknown; to: unknown }>; note: string | null;
}): Promise<number> {
  const sql = db()!;
  return sql.begin(async (tx) => {
    // One submit at a time per member, so two quick clicks can't go over the monthly limit.
    await tx`select 1 from musicvolume.members where id = ${viewer.id} for update`;
    const { left } = await allowanceFor(viewer, tx as unknown as typeof sql);
    if (left === 0) throw new OutOfEdits();
    const [row] = await tx<{ id: string; number: string }[]>`
      insert into musicvolume.submissions (member_id, kind, entity_type, entity_id, entity_name, changes, note)
      values (${viewer.id}, ${input.kind}, ${input.entityType}, ${input.entityId}, ${input.entityName},
              ${tx.json(input.changes as never)}, ${input.note})
      returning id, number`;
    await tx`insert into musicvolume.submission_events (submission_id, member_id, action, to_status)
             values (${row.id}, ${viewer.id}, 'submitted', 'needs_review')`;
    return Number(row.number);
  });
}
