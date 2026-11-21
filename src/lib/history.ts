// Edit history of one entry, and the site-wide Activity log (Figma "Phase 5a": A history
// timeline, B activity log). Two sources: submissions (and every move logged on them) and
// musicvolume.catalog_activity (changes the MusicBrainz sync applied or kept back).
//
// Who sees what (Graham, 2026-11-18): signed-out visitors and tier 1–2 contributors see only
// what went live; tier 3 contributors, editors and admins also see pending and rejected
// edits, and get the log's filters and CSV export.
import "server-only";
import { db } from "./db";
import type { Kind } from "./edits";
import { fieldLabel, type Person, type Status } from "./review";
import type { Viewer } from "./viewer";

export const seesAll = (v: Viewer | null) => !!v && (v.role !== "contributor" || v.tier >= 3);

/** One changed field, as shown: "Label  Lava → Lava / Republic". */
export type FieldChange = { label: string; was: string; now: string };

const MB_LABEL: Record<string, string> = {
  name: "Name", disambiguation: "Note", kind: "Type", origin: "From", years: "Active", genres: "Genres",
  aliases: "Also known as", members: "Members", title: "Title", type: "Type", release_date: "Release date",
  year: "Year", duration_seconds: "Length", tracks: "Tracklist",
};
const secs = (v: string) => (/^\d+$/.test(v) ? `${Math.floor(+v / 60)}:${String(+v % 60).padStart(2, "0")}` : v);

function show(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    if (!v.length) return "";
    if (typeof v[0] === "object") {
      return v.map((r: Record<string, string>) => (r.role ? `${r.role}: ${r.name}` : r.title ?? "")).filter(Boolean).join(" · ");
    }
    return v.join(", ");
  }
  return String(v);
}

/** A submission's changes ({field: {from, to}}) as rows. Tracklists collapse to a count. */
export function changeRows(changes: Record<string, { from?: unknown; to?: unknown }>): FieldChange[] {
  return Object.entries(changes ?? {}).map(([k, c]) => {
    if (k === "tracks" && Array.isArray(c?.to)) {
      const before = Array.isArray(c.from) ? c.from.length : 0;
      return { label: "Tracklist", was: before ? `${before} tracks` : "", now: `${(c.to as unknown[]).length} tracks` };
    }
    return { label: fieldLabel(k), was: show(c?.from), now: show(c?.to) };
  });
}

export function mbRow(field: string, was: string | null, now: string | null): FieldChange {
  const f = field === "duration_seconds" ? secs : (x: string) => x;
  return { label: MB_LABEL[field] ?? field, was: f(was ?? ""), now: f(now ?? "") };
}

export type HistoryItem = {
  key: string; when: Date;
  /** null = MusicBrainz (the sync account shows as "MusicBrainz" in teal). */
  who: Person | null;
  verb: string;
  state: "published" | "pending" | "rejected" | "withdrawn" | "kept";
  status: Status | "applied" | "kept";
  rows: FieldChange[];
  lines: { text: string; who?: Person }[];
  number?: number;
};

type P = { username: string | null; role: Viewer["role"] | null; tier: Viewer["tier"] | null };
const person = (p: P): Person | null => (p.username ? { username: p.username, role: p.role!, tier: p.tier! } : null);

/** Everything that happened to one entry, newest first. */
export async function getEntryHistory(kind: Kind, id: string, v: Viewer | null): Promise<HistoryItem[]> {
  const sql = db();
  if (!sql) return [];
  const all = seesAll(v);
  const subs = await sql<({
    id: string; number: string; kind: string; changes: Record<string, { from?: unknown; to?: unknown }>; status: Status;
    created_at: Date; published_at: Date | null; updated_at: Date;
  } & P)[]>`
    select s.id, s.number, s.kind, s.changes, s.status, s.created_at, s.published_at, s.updated_at, m.username, m.role, m.tier
      from musicvolume.submissions s join musicvolume.members m on m.id = s.member_id
     where s.entity_type = ${kind} and s.entity_id = ${id} ${all ? sql`` : sql`and s.status = 'published'`}
     order by s.created_at desc limit 200`.catch(() => []);
  const ids = subs.map((s) => s.id);
  const events = ids.length ? await sql<({ submission_id: string; to_status: string | null; action: string } & P)[]>`
    select e.submission_id, e.to_status, e.action, m.username, m.role, m.tier from musicvolume.submission_events e
      left join musicvolume.members m on m.id = e.member_id
     where e.submission_id in ${sql(ids)} order by e.created_at`.catch(() => []) : [];
  const byStatus = (sid: string, to: string) => events.filter((e) => e.submission_id === sid && e.to_status === to).at(-1);

  const items: HistoryItem[] = subs.map((s) => {
    const author = person(s)!;
    const mb = s.role === "system";
    const state: HistoryItem["state"] = s.status === "published" ? "published" : s.status === "rejected" ? "rejected"
      : s.status === "withdrawn" ? "withdrawn" : "pending";
    const lines: HistoryItem["lines"] = [];
    const picked = byStatus(s.id, "in_review");
    const fin = byStatus(s.id, "final_review");
    const pub = byStatus(s.id, "published");
    const rej = byStatus(s.id, "rejected");
    if (state === "pending" && s.status === "in_review" && picked) lines.push({ text: "Picked up by", who: person(picked) ?? undefined });
    if (state === "published") {
      if (fin && person(fin)) lines.push({ text: "Reviewed by", who: person(fin)! });
      if (pub && person(pub)) lines.push({ text: "Published by", who: person(pub)! });
    }
    if (state === "rejected" && rej && person(rej)) lines.push({ text: "Rejected by", who: person(rej)! });
    return {
      key: s.id, when: s.published_at ?? s.created_at, who: mb ? null : author,
      verb: s.kind === "new" ? "added this entry" : mb ? "suggested a change from MusicBrainz" : state === "published" ? "changed" : "suggested a change",
      state, status: s.status, rows: s.kind === "new" ? [] : changeRows(s.changes), lines, number: Number(s.number),
    };
  });

  // MusicBrainz sync runs: one card per run (rows logged in the same minute) and outcome.
  const mb = await sql<{ at: Date; action: "applied" | "kept"; field: string; old_value: string | null; new_value: string | null }[]>`
    select date_trunc('minute', created_at) as at, action, field, old_value, new_value
      from musicvolume.catalog_activity
     where entity_type = ${kind} and entity_id = ${id} and action in ('applied', 'kept')
     order by created_at desc, id limit 300`.catch(() => []);
  const runs = new Map<string, HistoryItem>();
  for (const r of mb) {
    if (r.action === "kept" && !all) continue;
    const key = `${r.at.toISOString()}-${r.action}`;
    let it = runs.get(key);
    if (!it) {
      it = { key, when: r.at, who: null, verb: r.action === "applied" ? "updated from MusicBrainz" : "kept our edit; MusicBrainz differs",
        state: r.action === "applied" ? "published" : "kept", status: r.action, rows: [], lines: [] };
      runs.set(key, it);
    }
    it.rows.push(mbRow(r.field, r.old_value, r.new_value));
  }
  return [...items, ...runs.values()].sort((a, b) => b.when.getTime() - a.when.getTime());
}

// ------------------------------------------------------------------ activity log

export type LogFilter = { q?: string; action?: string; type?: Kind | "all"; range?: "2d" | "7d" | "30d" | "all"; limit?: number };
export const LOG_ACTIONS: { key: string; label: string }[] = [
  { key: "all", label: "All actions" }, { key: "submitted", label: "Submitted" }, { key: "edited", label: "Changed an edit" },
  { key: "in_review", label: "Picked up" }, { key: "changes_requested", label: "Asked for changes" },
  { key: "final_review", label: "Sent to final review" }, { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" }, { key: "musicbrainz", label: "MusicBrainz updates" },
];

export type LogRow = {
  key: string; when: Date; who: Person | null; action: string;
  entityType: Kind; entityName: string; href: string; field: string; change: FieldChange | null;
  status: string; submission?: { id: string; number: number };
};

function verbFor(action: string, to: string | null, from: string | null, kind: string): string {
  if (action === "submitted") return kind === "new" ? "submitted new" : "suggested an edit";
  if (action === "edited") return "changed the edit";
  if (action === "status") {
    if (to === "in_review") return from === "changes_requested" ? "moved back to review" : from === "final_review" ? "sent back to editors" : "picked up";
    return { changes_requested: "asked for changes", final_review: "sent to final review", published: "published", rejected: "rejected", needs_review: "moved back to the queue" }[to ?? ""] ?? "moved";
  }
  return action;
}

const SINCE: Record<string, string> = { "2d": "2 days", "7d": "7 days", "30d": "30 days" };

/** The activity log, newest first: moves on submissions, and MusicBrainz sync changes (one row per entry per run). */
export async function getActivity(v: Viewer | null, f: LogFilter = {}): Promise<LogRow[]> {
  const sql = db();
  if (!sql) return [];
  const all = seesAll(v);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 1000);
  const since = all && f.range && f.range !== "all" ? sql`and x.created_at > now() - ${SINCE[f.range]}::interval` : sql``;
  const type = all && f.type && f.type !== "all" ? sql`and x.entity_type = ${f.type}` : sql``;
  const sinceS = all && f.range && f.range !== "all" ? sql`and x.created_at > now() - ${SINCE[f.range]}::interval` : sql``;
  const typeS = all && f.type && f.type !== "all" ? sql`and s.entity_type = ${f.type}` : sql``;
  const q = all && f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, " ")}%` : null;
  const action = all ? f.action ?? "all" : "all";

  const wantSubs = action !== "musicbrainz";
  const wantMb = action === "all" || action === "musicbrainz";
  const subFilter = action === "submitted" || action === "edited" ? sql`and x.action = ${action}`
    : action !== "all" && action !== "musicbrainz" ? sql`and x.action = 'status' and x.to_status = ${action}` : sql``;

  const [subs, mb] = await Promise.all([
    wantSubs ? sql<({
      id: string; created_at: Date; action: string; from_status: string | null; to_status: string | null;
      sid: string; number: string; kind: string; entity_type: Kind; entity_id: string | null; entity_name: string;
      changes: Record<string, { from?: unknown; to?: unknown }>; status: string; slug: string | null;
    } & P)[]>`
      select x.id::text, x.created_at, x.action, x.from_status, x.to_status, s.id as sid, s.number, s.kind, s.entity_type,
             s.entity_id, s.entity_name, s.changes, s.status, m.username, m.role, m.tier,
             coalesce(ar.slug, re.slug, so.slug) as slug
        from musicvolume.submission_events x
        join musicvolume.submissions s on s.id = x.submission_id
        left join musicvolume.members m on m.id = x.member_id
        left join public.artists ar on s.entity_type = 'artist' and ar.id = s.entity_id
        left join public.releases re on s.entity_type = 'release' and re.id = s.entity_id
        left join public.songs so on s.entity_type = 'song' and so.id = s.entity_id
       where x.action in ('submitted', 'edited', 'status')
         ${all ? sql`` : sql`and x.action = 'status' and x.to_status = 'published'`}
         ${sinceS}
         ${typeS}
         ${subFilter}
         ${q ? sql`and (s.entity_name ilike ${q} or m.username ilike ${q})` : sql``}
       order by x.created_at desc limit ${limit}`.catch((e) => { console.error("activity", e.message); return []; }) : Promise.resolve([]),
    wantMb ? sql<{
      created_at: Date; entity_type: Kind; entity_id: string; field: string; old_value: string | null; new_value: string | null;
      n: number; name: string | null; slug: string | null;
    }[]>`
      select x.created_at, x.entity_type, x.entity_id, x.field, x.old_value, x.new_value, x.n,
             coalesce(ar.name, re.title, so.title) as name, coalesce(ar.slug, re.slug, so.slug) as slug
        from (select date_trunc('minute', created_at) as created_at, entity_type, entity_id,
                     min(field) as field, min(old_value) as old_value, min(new_value) as new_value, count(*)::int as n
                from musicvolume.catalog_activity x
               where action = 'applied' ${since} ${type}
               group by 1, 2, 3 order by 1 desc limit ${limit}) x
        left join public.artists ar on x.entity_type = 'artist' and ar.id = x.entity_id
        left join public.releases re on x.entity_type = 'release' and re.id = x.entity_id
        left join public.songs so on x.entity_type = 'song' and so.id = x.entity_id
       ${q ? sql`where coalesce(ar.name, re.title, so.title) ilike ${q} or 'musicbrainz' ilike ${q}` : sql``}
       order by x.created_at desc`.catch((e) => { console.error("activity mb", e.message); return []; }) : Promise.resolve([]),
  ]);

  const rows: LogRow[] = subs.map((s) => {
    const rowsC = s.kind === "new" ? [] : changeRows(s.changes);
    const keys = Object.keys(s.changes ?? {});
    return {
      key: `e${s.id}`, when: s.created_at, who: person(s), action: verbFor(s.action, s.to_status, s.from_status, s.kind),
      entityType: s.entity_type, entityName: s.entity_name,
      href: s.slug ? `/${s.entity_type}/${s.slug}` : `/submission/${s.number}`,
      field: s.kind === "new" ? `${keys.length} field${keys.length === 1 ? "" : "s"}` : keys.length === 1 ? fieldLabel(keys[0]) : `${keys.length} fields`,
      change: rowsC.length === 1 ? rowsC[0] : null,
      status: s.status, submission: { id: s.sid, number: Number(s.number) },
    };
  });
  for (const r of mb) {
    if (!r.slug) continue;
    rows.push({
      key: `m${r.entity_type}${r.entity_id}${r.created_at.toISOString()}`, when: r.created_at, who: null, action: "updated from MusicBrainz",
      entityType: r.entity_type, entityName: r.name ?? "", href: `/${r.entity_type}/${r.slug}`,
      field: r.n === 1 ? MB_LABEL[r.field] ?? r.field : `${r.n} fields`,
      change: r.n === 1 ? mbRow(r.field, r.old_value, r.new_value) : null, status: "published",
    });
  }
  return rows.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, limit);
}

/** Every move on these submissions, oldest first: the "Full trail" under a log row. */
export async function getTrails(ids: string[]): Promise<Map<string, { when: Date; who: Person | null; text: string }[]>> {
  const out = new Map<string, { when: Date; who: Person | null; text: string }[]>();
  const sql = db();
  if (!sql || !ids.length) return out;
  const rows = await sql<({ submission_id: string; created_at: Date; action: string; from_status: string | null; to_status: string | null; kind: string } & P)[]>`
    select e.submission_id, e.created_at, e.action, e.from_status, e.to_status, s.kind, m.username, m.role, m.tier
      from musicvolume.submission_events e join musicvolume.submissions s on s.id = e.submission_id
      left join musicvolume.members m on m.id = e.member_id
     where e.submission_id in ${sql(ids)} order by e.created_at`.catch(() => []);
  for (const r of rows) {
    const list = out.get(r.submission_id) ?? [];
    list.push({ when: r.created_at, who: person(r), text: verbFor(r.action, r.to_status, r.from_status, r.kind) });
    out.set(r.submission_id, list);
  }
  return out;
}

