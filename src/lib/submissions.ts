// Suggested edits: what the edit form starts from, how many edits a member has left this
// month, and saving a submission with its log entry.
import "server-only";
import { getArtist, getRelease, getSong } from "./catalog";
import { db } from "./db";
import type { ArtistValues, Kind, MemberRow, ReleaseValues, SongValues, Values } from "./edits";
import { duration, isoDate } from "./format";
import { limitFor } from "./members";
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
      cover: r.cover ?? r.coverSmall ?? "",
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
      cover: a.image ?? "",
      members: a.members.map((m) => ({ name: m.name, role: m.role ?? "", artistId: m.artistId ?? "", slug: m.slug ?? "", image: m.image ?? "" })),
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

/**
 * Band members as the catalog knows them: a member linked to an artist page gets that page's
 * name, address and photo from the database (a link to a missing page, or to the band itself,
 * becomes a plain name).
 */
export async function resolveMembers(members: MemberRow[], bandId: string): Promise<MemberRow[]> {
  const sql = db()!;
  const ids = [...new Set(members.map((m) => m.artistId).filter((x) => /^[0-9a-f-]{36}$/i.test(x) && x !== bandId))];
  const rows = ids.length ? await sql<{ id: string; name: string; slug: string; image_url: string | null }[]>`
    select id, name, slug, image_url from public.artists where id = any(${ids}::uuid[])` : [];
  const by = new Map(rows.map((r) => [r.id, r]));
  return members.map((m) => {
    const a = by.get(m.artistId);
    return a ? { name: a.name, role: m.role, artistId: a.id, slug: a.slug, image: a.image_url ?? "" }
      : { name: m.name, role: m.role, artistId: "", slug: "", image: "" };
  });
}

export type Allowance = { limit: number | null; used: number; left: number | null };

/** Edits used this calendar month (UTC). Editors and admins have no limit; tier limits are set on the Members page. */
export async function allowanceFor(v: Viewer, sql = db()!): Promise<Allowance> {
  const limit = await limitFor(v);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from musicvolume.submissions s
     where s.member_id = ${v.id} and s.status <> 'withdrawn'
       and s.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
       -- An artist added from an album or song form goes in with it as one edit.
       and not exists (select 1 from musicvolume.submissions d where d.depends_on = s.id and d.member_id = s.member_id)`;
  return { limit, used: n, left: limit == null ? null : Math.max(limit - n, 0) };
}

export class OutOfEdits extends Error {}

/** Editors and admins may send their own edits straight to final review. */
export const canPushFinal = (v: Pick<Viewer, "role">) => v.role === "editor" || v.role === "admin";

/** Saves one submission and its "submitted" log entry. Returns its number (#1042). */
export async function saveSubmission(viewer: Viewer, input: { kind: "edit" | "new"; entityType: Kind; entityId: string | null; entityName: string;
  changes: Record<string, { from?: unknown; to: unknown }>; note: string | null;
  sources?: string | null;
  /** A new artist (still in review) this new release or song is by: that artist's submission number. */
  dependsOn?: number | null;
  /** "Push to final review" (editors and admins, Graham 2026-11-24): skips the board and goes
   * straight to final review, where a tier 3 editor or an admin publishes it. */
  final?: boolean;
}): Promise<number> {
  const final = !!input.final && canPushFinal(viewer);
  const sql = db()!;
  return sql.begin(async (tx) => {
    // One submit at a time per member, so two quick clicks can't go over the monthly limit.
    await tx`select 1 from musicvolume.members where id = ${viewer.id} for update`;
    const { left } = await allowanceFor(viewer, tx as unknown as typeof sql);
    if (left === 0) throw new OutOfEdits();
    let dependsOn: string | null = null;
    if (input.dependsOn) {
      const [d] = await tx<{ id: string }[]>`
        select id from musicvolume.submissions where number = ${input.dependsOn} and kind = 'new' and entity_type = 'artist'
           and status not in ('rejected', 'withdrawn')`;
      dependsOn = d?.id ?? null;
    }
    const [row] = await tx<{ id: string; number: string }[]>`
      insert into musicvolume.submissions (member_id, kind, entity_type, entity_id, entity_name, changes, note, sources, depends_on)
      values (${viewer.id}, ${input.kind}, ${input.entityType}, ${input.entityId}, ${input.entityName},
              ${tx.json(input.changes as never)}, ${input.note}, ${input.sources ?? null}, ${dependsOn})
      returning id, number`;
    await tx`insert into musicvolume.submission_events (submission_id, member_id, action, to_status)
             values (${row.id}, ${viewer.id}, 'submitted', 'needs_review')`;
    if (final) {
      // The new artist it depends on (sent by the same member and still waiting) goes with it,
      // so the release or song can be published.
      const ids = [row.id, ...(dependsOn ? (await tx<{ id: string }[]>`
        select id from musicvolume.submissions where id = ${dependsOn} and member_id = ${viewer.id} and status = 'needs_review'`).map((d) => d.id) : [])];
      for (const id of ids) {
        await tx`update musicvolume.submissions set status = 'final_review', updated_at = now() where id = ${id}`;
        await tx`insert into musicvolume.submission_events (submission_id, member_id, action, from_status, to_status, detail)
                 values (${id}, ${viewer.id}, 'status', 'needs_review', 'final_review', ${tx.json({ move: "push_final" })})`;
      }
    }
    return Number(row.number);
  });
}

export type Submission = {
  id: string; number: number; kind: "edit" | "new"; entityType: Kind; entityId: string | null; entityName: string;
  changes: Record<string, { from?: unknown; to: unknown }>; note: string | null; sources: string | null;
  status: string; createdAt: Date; author: { username: string; role: Viewer["role"]; tier: Viewer["tier"] };
  entitySlug: string | null;
  dependsOn: { number: number; name: string; status: string } | null;
  events: { action: string; fromStatus: string | null; toStatus: string | null; when: Date; who: string | null; whoRole: Viewer["role"] | null; whoTier: Viewer["tier"] | null }[];
};

const SLUG_TABLE: Record<Kind, string> = { artist: "artists", release: "releases", song: "songs" };

export async function getSubmission(number: number): Promise<Submission | null> {
  const sql = db();
  if (!sql || !Number.isSafeInteger(number)) return null;
  const [s] = await sql<{ id: string; number: string; kind: "edit" | "new"; entity_type: Kind; entity_id: string | null; entity_name: string; changes: Submission["changes"]; note: string | null; sources: string | null; status: string; created_at: Date; username: string; role: Viewer["role"]; tier: Viewer["tier"]; dep_number: string | null; dep_name: string | null; dep_status: string | null }[]>`
    select s.id, s.number, s.kind, s.entity_type, s.entity_id, s.entity_name, s.changes, s.note, s.sources, s.status, s.created_at,
           m.username, m.role, m.tier, d.number as dep_number, d.entity_name as dep_name, d.status as dep_status
      from musicvolume.submissions s
      join musicvolume.members m on m.id = s.member_id
      left join musicvolume.submissions d on d.id = s.depends_on
     where s.number = ${number}`.catch(() => []);
  if (!s) return null;
  const [events, slug] = await Promise.all([
    sql<{ action: string; from_status: string | null; to_status: string | null; created_at: Date; username: string | null; role: Viewer["role"] | null; tier: Viewer["tier"] | null }[]>`
      select e.action, e.from_status, e.to_status, e.created_at, m.username, m.role, m.tier from musicvolume.submission_events e
        left join musicvolume.members m on m.id = e.member_id
       where e.submission_id = ${s.id} order by e.created_at`,
    s.entity_id ? sql<{ slug: string }[]>`select slug from ${sql("public." + SLUG_TABLE[s.entity_type])} where id = ${s.entity_id}` : Promise.resolve([]),
  ]);
  return {
    id: s.id, number: Number(s.number), kind: s.kind, entityType: s.entity_type, entityId: s.entity_id, entityName: s.entity_name,
    changes: s.changes, note: s.note, sources: s.sources, status: s.status, createdAt: s.created_at,
    author: { username: s.username, role: s.role, tier: s.tier },
    entitySlug: slug[0]?.slug ?? null,
    dependsOn: s.dep_number ? { number: Number(s.dep_number), name: s.dep_name!, status: s.dep_status! } : null,
    events: events.map((e) => ({ action: e.action, fromStatus: e.from_status, toStatus: e.to_status, when: e.created_at, who: e.username, whoRole: e.role, whoTier: e.tier })),
  };
}

export type ArtistChoice = { id?: string; review?: number; name: string; detail: string; image: string | null };

/** Artists to pick from on the new-entry forms: catalog artists, then new ones still in review. */
export async function findArtists(q: string): Promise<ArtistChoice[]> {
  const sql = db();
  const t = q.trim().replace(/[%_\\]/g, " ");
  if (!sql || t.length < 1) return [];
  const [found, pending] = await Promise.all([
    sql<{ id: string; name: string; origin: string | null; disambiguation: string | null; image_url: string | null }[]>`
      select id, name, origin, disambiguation, image_url from public.artists
       where name ilike ${`%${t}%`}
       order by lower(name) = lower(${t}) desc, lower(name) like lower(${`${t}%`}) desc, length(name) limit 8`,
    sql<{ number: string; entity_name: string; origin: string | null }[]>`
      select number, entity_name, changes->'origin'->>'to' as origin from musicvolume.submissions
       where kind = 'new' and entity_type = 'artist' and status in ('needs_review', 'in_review', 'changes_requested', 'final_review')
         and entity_name ilike ${`%${t}%`} order by created_at desc limit 5`.catch(() => []),
  ]);
  return [
    ...found.map((a) => ({ id: a.id, name: a.name, detail: [a.disambiguation, a.origin].filter(Boolean).join(" · "), image: a.image_url })),
    ...pending.map((p) => ({ review: Number(p.number), name: p.entity_name, detail: p.origin ?? "", image: null })),
  ];
}
