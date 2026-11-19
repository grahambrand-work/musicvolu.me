// The review board: who may do what (Figma "P6 · What each tier can do"), the cards on the
// board and in the queue, and everything shown on an opened card.
import "server-only";
import { db } from "./db";
import { FIELDS, type Kind } from "./edits";
import type { Viewer } from "./viewer";

export type Status = "needs_review" | "in_review" | "changes_requested" | "final_review" | "published" | "rejected" | "withdrawn";
export const STAGES: { key: Status | "live_today"; label: string; short: string }[] = [
  { key: "needs_review", label: "Needs review", short: "Needs review" },
  { key: "in_review", label: "In review", short: "In review" },
  { key: "changes_requested", label: "Changes requested", short: "Changes" },
  { key: "final_review", label: "Final review", short: "Final review" },
  { key: "live_today", label: "Live today", short: "Live today" },
];
export const STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs review", in_review: "In review", changes_requested: "Changes requested",
  final_review: "Final review", published: "Published", rejected: "Rejected", withdrawn: "Withdrawn",
};
/** Dot colours per stage (Figma: final review pink, in review teal, changes amber, live green, rejected red). */
export const STATUS_COLOR: Record<string, string> = {
  needs_review: "transparent", in_review: "#5cc7bd", changes_requested: "#f5b84d", final_review: "#fa99cc",
  published: "#7ad98f", live_today: "#7ad98f", rejected: "#eb544d", withdrawn: "#808080",
};

type Who = Pick<Viewer, "role" | "tier">;
/** Rank for "same or lower tier": tier 1–3 editors, admins above all. */
const rank = (w: Who) => (w.role === "admin" ? 4 : w.role === "editor" ? w.tier : 0);

export const can = {
  /** Open the board: tier 2–3 contributors, editors, admins. */
  see: (v: Who | null) => !!v && (v.role !== "contributor" || v.tier >= 2),
  vote: (v: Who | null) => can.see(v),
  comment: (v: Who | null) => !!v && v.role !== "contributor",
  decide: (v: Who | null) => !!v && v.role !== "contributor",
  /** Change what a sent edit suggests, and reject: tier 2–3 editors and admins (Graham, 2026-11-19). */
  revise: (v: Who | null) => !!v && (v.role === "admin" || (v.role === "editor" && v.tier >= 2)),
  reject: (v: Who | null) => can.revise(v),
  publish: (v: Who | null) => !!v && (v.role === "admin" || (v.role === "editor" && v.tier === 3)),
  /** May v change a decision last made by `by`? Admins always; editors only over the same or a lower tier. */
  override: (v: Who, by: Who | null) => !by || v.role === "admin" || rank(v) >= rank(by),
};

export type Person = { username: string; role: Viewer["role"]; tier: Viewer["tier"] };

/**
 * May v change what a sent edit suggests? null = yes, otherwise why not.
 * The sender: while it waits for review or after changes were asked for.
 * Editors: until it's published (final review: tier 3 editors and admins), not their own,
 * and not over a decision made by a higher tier.
 */
export function reviseBlock(v: Who & { username: string }, s: { status: string; author: Person }, last: Person | null): string | null {
  if (s.author.username === v.username) {
    return ["needs_review", "changes_requested"].includes(s.status) ? null
      : s.status === "in_review" || s.status === "final_review" ? "An editor is reviewing it, so it can't be changed right now. Leave a comment instead." : "It's closed, so it can't be changed.";
  }
  if (!can.revise(v)) return "Only the person who sent it, or a tier 2 or 3 editor, can change it.";
  if (!["needs_review", "in_review", "changes_requested", "final_review"].includes(s.status)) return "It's closed, so it can't be changed.";
  if (s.status === "final_review" && !can.publish(v)) return "Only a tier 3 editor or an admin can change it in final review.";
  if (last && last.username !== v.username && !can.override(v, last)) return `${last.username} (a higher-tier editor) made the last decision here, so only someone of their tier or an admin can change it.`;
  return null;
}

export type Card = {
  id: string; number: number; kind: "edit" | "new"; entityType: Kind; entityId: string | null; entityName: string;
  tag: string; cover: string | null; summary: string; status: Status; createdAt: Date; movedAt: Date;
  author: Person; reviewer: Person | null; movedBy: Person | null;
  up: number; down: number; myVote: number; comments: number; mentionsMe: boolean;
};

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(FIELDS).flat().map((f) => [f.key, f.label]).concat([["tracks", "Tracklist"], ["credits", "Credits"]]),
);
export const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;

const NOUN: Record<Kind, string> = { artist: "artist", release: "release", song: "song" };

function summary(r: { kind: string; entity_type: Kind; changes: Record<string, { to: unknown }>; dep_name: string | null; linked_name: string | null }) {
  if (r.kind === "new") {
    const type = r.entity_type === "release" ? String(r.changes.type?.to ?? "release").toLowerCase() : NOUN[r.entity_type];
    if (r.dep_name) return `New ${type} + new artist`;
    if (r.linked_name) return `New ${type} (linked to ${r.linked_name})`;
    return `New ${type}`;
  }
  const keys = Object.keys(r.changes);
  if (keys.length === 1 && Array.isArray(r.changes[keys[0]].to) && (keys[0] === "credits" || keys[0] === "tracks")) {
    return `${fieldLabel(keys[0])} · ${keys.length} field`;
  }
  return `${keys.map(fieldLabel)[0] ?? "Edit"} · ${keys.length} field${keys.length === 1 ? "" : "s"}`;
}

/** Postgres regex for "@username" as a whole word (usernames are a-z 0-9 . _ -). */
const mentionRe = (u: string) => `(^|[^a-z0-9._-])@${u.replace(/[.\-]/g, "\\$&")}([^a-z0-9._-]|$)`;

type Filter = { stage?: Status | "live_today" | "all_open"; type?: Kind | "all"; mine?: boolean; mentions?: boolean; limit?: number };

/** Cards for the board, the list view and the queue beside an opened card. */
export async function getCards(v: Viewer, f: Filter = {}): Promise<Card[]> {
  const sql = db();
  if (!sql) return [];
  const stage = f.stage ?? "all_open";
  const where = [
    stage === "all_open" ? sql`s.status in ('needs_review', 'in_review', 'changes_requested', 'final_review')`
      : stage === "live_today" ? sql`s.status = 'published' and s.published_at >= date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago'`
      : sql`s.status = ${stage}`,
    f.type && f.type !== "all" ? sql`s.entity_type = ${f.type}` : sql`true`,
    f.mine ? sql`(s.member_id = ${v.id} or s.reviewer_id = ${v.id})` : sql`true`,
    f.mentions ? sql`exists (select 1 from musicvolume.submission_comments c where c.submission_id = s.id and lower(c.body) ~ ${mentionRe(v.username.toLowerCase())})` : sql`true`,
  ].reduce((a, b) => sql`${a} and ${b}`);
  const rows = await sql<{
    id: string; number: string; kind: "edit" | "new"; entity_type: Kind; entity_id: string | null; entity_name: string;
    changes: Record<string, { to: unknown }>; status: Status; created_at: Date; moved_at: Date | null;
    a_name: string; a_role: Viewer["role"]; a_tier: Viewer["tier"];
    r_name: string | null; r_role: Viewer["role"] | null; r_tier: Viewer["tier"] | null;
    m_name: string | null; m_role: Viewer["role"] | null; m_tier: Viewer["tier"] | null;
    up: number; down: number; my_vote: number | null; comments: number; mentions_me: boolean;
    dep_name: string | null; linked_name: string | null; rel_type: string | null; cover: string | null;
  }[]>`
    select s.id, s.number, s.kind, s.entity_type, s.entity_id, s.entity_name, s.changes, s.status, s.created_at,
           ev.created_at as moved_at,
           a.username as a_name, a.role as a_role, a.tier as a_tier,
           r.username as r_name, r.role as r_role, r.tier as r_tier,
           m.username as m_name, m.role as m_role, m.tier as m_tier,
           coalesce(vt.up, 0)::int as up, coalesce(vt.down, 0)::int as down, mv.value as my_vote,
           (select count(*) from musicvolume.submission_comments c where c.submission_id = s.id)::int as comments,
           exists (select 1 from musicvolume.submission_comments c where c.submission_id = s.id and lower(c.body) ~ ${mentionRe(v.username.toLowerCase())}) as mentions_me,
           d.entity_name as dep_name,
           (select x.entity_name from musicvolume.submissions x where x.depends_on = s.id order by x.created_at limit 1) as linked_name,
           rel.type as rel_type,
           coalesce(rel.cover_small_url, rel.cover_url, sg.cover_small_url, sg.cover_url, ar.image_url) as cover
      from musicvolume.submissions s
      join musicvolume.members a on a.id = s.member_id
      left join musicvolume.members r on r.id = s.reviewer_id
      left join lateral (select e.member_id, e.created_at from musicvolume.submission_events e
                          where e.submission_id = s.id and e.to_status = s.status order by e.created_at desc limit 1) ev on true
      left join musicvolume.members m on m.id = ev.member_id
      left join lateral (select count(*) filter (where value = 1) as up, count(*) filter (where value = -1) as down
                           from musicvolume.votes where target_type = 'submission' and target_id = s.id) vt on true
      left join musicvolume.votes mv on mv.target_type = 'submission' and mv.target_id = s.id and mv.member_id = ${v.id}
      left join musicvolume.submissions d on d.id = s.depends_on
      left join public.releases rel on s.entity_type = 'release' and rel.id = s.entity_id
      left join public.songs sg on s.entity_type = 'song' and sg.id = s.entity_id
      left join public.artists ar on s.entity_type = 'artist' and ar.id = s.entity_id
     where ${where}
     order by ${stage === "live_today" ? sql`s.published_at desc` : sql`s.created_at desc`}
     limit ${f.limit ?? 200}`;
  const person = (n: string | null, role: Viewer["role"] | null, tier: Viewer["tier"] | null): Person | null => (n ? { username: n, role: role!, tier: tier! } : null);
  return rows.map((r) => ({
    id: r.id, number: Number(r.number), kind: r.kind, entityType: r.entity_type, entityId: r.entity_id, entityName: r.entity_name,
    tag: r.entity_type === "release" ? String((r.kind === "new" ? r.changes.type?.to : r.rel_type) ?? "Release") : r.entity_type,
    cover: r.cover, summary: summary(r), status: r.status, createdAt: r.created_at, movedAt: r.moved_at ?? r.created_at,
    author: person(r.a_name, r.a_role, r.a_tier)!, reviewer: person(r.r_name, r.r_role, r.r_tier), movedBy: person(r.m_name, r.m_role, r.m_tier),
    up: r.up, down: r.down, myVote: r.my_vote ?? 0, comments: r.comments, mentionsMe: r.mentions_me,
  }));
}

/** Counts per stage, for the column headings, stage tabs and the header link. */
export async function getCounts(v: Viewer): Promise<Record<string, number> & { mentions: number; mine: number }> {
  const sql = db();
  const empty = { needs_review: 0, in_review: 0, changes_requested: 0, final_review: 0, live_today: 0, mentions: 0, mine: 0 };
  if (!sql) return empty;
  try {
    const [c] = await sql<typeof empty[]>`
      select count(*) filter (where status = 'needs_review')::int as needs_review,
             count(*) filter (where status = 'in_review')::int as in_review,
             count(*) filter (where status = 'changes_requested')::int as changes_requested,
             count(*) filter (where status = 'final_review')::int as final_review,
             count(*) filter (where status = 'published' and published_at >= date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago')::int as live_today,
             count(*) filter (where status in ('needs_review', 'in_review', 'changes_requested', 'final_review')
                                and exists (select 1 from musicvolume.submission_comments c where c.submission_id = s.id and lower(c.body) ~ ${mentionRe(v.username.toLowerCase())}))::int as mentions,
             count(*) filter (where status in ('needs_review', 'in_review', 'changes_requested', 'final_review') and (member_id = ${v.id} or reviewer_id = ${v.id}))::int as mine
        from musicvolume.submissions s
       where status in ('needs_review', 'in_review', 'changes_requested', 'final_review') or published_at > now() - interval '2 days'`;
    return c;
  } catch (e) {
    console.error("review counts:", (e as Error).message);
    return empty; // review tables not there yet
  }
}

export type Comment = {
  id: string; field: string | null; body: string; createdAt: Date; author: Person;
  up: number; down: number; myVote: number;
};

/** Comments on a submission, oldest first, with likes. */
export async function getComments(submissionId: string, v: Viewer): Promise<Comment[]> {
  const sql = db();
  if (!sql) return [];
  const rows = await sql<{ id: string; field: string | null; body: string; created_at: Date; username: string; role: Viewer["role"]; tier: Viewer["tier"]; up: number; down: number; my_vote: number | null }[]>`
    select c.id, c.field, c.body, c.created_at, m.username, m.role, m.tier,
           (select count(*) from musicvolume.votes x where x.target_type = 'comment' and x.target_id = c.id and x.value = 1)::int as up,
           (select count(*) from musicvolume.votes x where x.target_type = 'comment' and x.target_id = c.id and x.value = -1)::int as down,
           (select value from musicvolume.votes x where x.target_type = 'comment' and x.target_id = c.id and x.member_id = ${v.id}) as my_vote
      from musicvolume.submission_comments c join musicvolume.members m on m.id = c.member_id
     where c.submission_id = ${submissionId}
     order by c.created_at`.catch(() => []);
  return rows.map((r) => ({
    id: r.id, field: r.field, body: r.body, createdAt: r.created_at, author: { username: r.username, role: r.role, tier: r.tier },
    up: r.up, down: r.down, myVote: r.my_vote ?? 0,
  }));
}

/** Who made the last decision on a submission (the member who moved it to its current status). */
export async function lastDecision(submissionId: string): Promise<(Person & { id: string; toStatus: string }) | null> {
  const sql = db()!;
  const [r] = await sql<{ id: string; username: string; role: Viewer["role"]; tier: Viewer["tier"]; to_status: string }[]>`
    select m.id, m.username, m.role, m.tier, e.to_status from musicvolume.submission_events e
      join musicvolume.members m on m.id = e.member_id
     where e.submission_id = ${submissionId} and e.action = 'status' order by e.created_at desc limit 1`;
  return r ? { id: r.id, username: r.username, role: r.role, tier: r.tier, toStatus: r.to_status } : null;
}

/** "2 h", "3 d", "9:12 am" (today, for Live today), "Nov 3". */
export function ago(d: Date, clock = false) {
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (clock) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).toLowerCase();
  if (mins < 60) return `${Math.max(mins, 1)} m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / 1440)} d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}
