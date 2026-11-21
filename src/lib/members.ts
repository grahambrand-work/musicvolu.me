// Members: monthly edit allowances per tier, each person's contributions (Figma 90:993) and
// the Members and roles admin list (93:1098). Allowances and role changes live in
// db/migrations/20261121000100_members_admin.sql; until that is applied the site falls back
// to 10 / 25 / 50 edits a month.
import "server-only";
import { db } from "./db";
import type { Kind } from "./edits";
import { summary, type Person, type Status } from "./review";
import type { Viewer } from "./viewer";

export type Tier = 1 | 2 | 3;
export const DEFAULT_ALLOWANCE: Record<Tier, number> = { 1: 10, 2: 25, 3: 50 };
/** Published edits that move a contributor up: tier 2 at 25, tier 3 at 100. */
export const PROMOTE_AT: Record<2 | 3, number> = { 2: 25, 3: 100 };

type R = Pick<Viewer, "role" | "tier">;

export type Allowances = {
  /** In force this month. */
  now: Record<Tier, number>;
  /** Saved for the 1st of next month, where different from now. */
  next: Partial<Record<Tier, number>>;
  last: { by: Person | null; at: Date } | null;
};

/** First of next month, as a Date (UTC) and "1 Dec". */
export function nextMonth() {
  const d = new Date();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { date: first, label: `1 ${first.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}` };
}

export async function getAllowances(): Promise<Allowances> {
  const sql = db();
  const fallback = { now: { ...DEFAULT_ALLOWANCE }, next: {}, last: null };
  if (!sql) return fallback;
  try {
    const rows = await sql<{ tier: Tier; monthly: number; current: boolean }[]>`
      select tier, monthly, starts_on <= date_trunc('month', now() at time zone 'utc')::date as current
        from musicvolume.tier_allowances order by created_at`;
    // Newest saved row wins: one for this month, and maybe one waiting for the 1st.
    const now = { ...DEFAULT_ALLOWANCE };
    const later: Partial<Record<Tier, number>> = {};
    for (const r of rows) {
      if (r.current) { now[r.tier] = r.monthly; delete later[r.tier]; } else later[r.tier] = r.monthly;
    }
    const next: Partial<Record<Tier, number>> = {};
    for (const t of [1, 2, 3] as Tier[]) if (later[t] != null && later[t] !== now[t]) next[t] = later[t];
    const [l] = await sql<{ at: Date; username: string | null; role: Viewer["role"] | null; tier: Tier | null }[]>`
      select a.created_at as at, m.username, m.role, m.tier from musicvolume.tier_allowances a
        left join musicvolume.members m on m.id = a.changed_by
       where a.changed_by is not null order by a.created_at desc limit 1`;
    return { now, next, last: l ? { at: l.at, by: l.username ? { username: l.username, role: l.role!, tier: l.tier! } : null } : null };
  } catch {
    return fallback; // allowance table not there yet
  }
}

/** Edits a month for this member; null = no limit (editors and admins). */
export async function limitFor(v: R, a?: Allowances): Promise<number | null> {
  if (v.role !== "contributor") return null;
  return (a ?? (await getAllowances())).now[v.tier as Tier] ?? DEFAULT_ALLOWANCE[1];
}

// ------------------------------------------------------------------ one member

export type MemberInfo = Person & { id: string; joined: Date };

export async function getMember(username: string): Promise<MemberInfo | null> {
  const sql = db();
  if (!sql) return null;
  const [m] = await sql<{ id: string; username: string; role: Viewer["role"]; tier: Tier; created_at: Date }[]>`
    select id, username, role, tier, created_at from musicvolume.members
     where lower(username) = ${username.toLowerCase()} and role <> 'system' and email_verified_at is not null`;
  return m ? { id: m.id, username: m.username, role: m.role, tier: m.tier, joined: m.created_at } : null;
}

export type Stats = { submitted: number; published: number; waiting: number; rejected: number; thisMonth: number; reviews: number };

export async function getStats(memberId: string): Promise<Stats> {
  const sql = db()!;
  const [s] = await sql<Omit<Stats, "reviews">[]>`
    select count(*) filter (where status <> 'withdrawn')::int as submitted,
           count(*) filter (where status = 'published')::int as published,
           count(*) filter (where status in ('needs_review', 'in_review', 'changes_requested', 'final_review'))::int as waiting,
           count(*) filter (where status = 'rejected')::int as rejected,
           count(*) filter (where status <> 'withdrawn' and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
                              and not exists (select 1 from musicvolume.submissions d where d.depends_on = s.id and d.member_id = s.member_id))::int as this_month
      from musicvolume.submissions s where member_id = ${memberId}`;
  const [r] = await sql<{ n: number }[]>`
    select count(distinct e.submission_id)::int as n from musicvolume.submission_events e
      join musicvolume.submissions s on s.id = e.submission_id
     where e.member_id = ${memberId} and e.action = 'status' and s.member_id <> ${memberId}`;
  const x = s as unknown as Record<string, number>;
  return { submitted: x.submitted, published: x.published, waiting: x.waiting, rejected: x.rejected, thisMonth: x.this_month, reviews: r.n };
}

export type ContribFilter = "all" | "waiting" | "published" | "rejected" | "reviews";

export type ContribRow = {
  number: number; entityType: Kind; tag: string; entityName: string; cover: string | null; summary: string;
  status: Status; when: Date;
  /** Who moved it last (picked up, sent on, published, rejected), and the rejecter's latest comment. */
  by: Person | null; note: string | null;
  /** Reviews tab: what this member did last on it, and who sent it. */
  move: string | null; author: Person | null;
};

const WAITING = ["needs_review", "in_review", "changes_requested", "final_review"];

function moveLabel(to: string | null, from: string | null) {
  if (to === "in_review") return from === "changes_requested" ? "Moved back to review" : from === "final_review" ? "Sent back to editors" : "Picked up";
  return ({ changes_requested: "Asked for changes", final_review: "Sent to final review", published: "Published", rejected: "Rejected", needs_review: "Moved back to the queue" } as Record<string, string>)[to ?? ""] ?? "Moved";
}

/** The member's own submissions (or, for "reviews", ones they moved), newest first. */
export async function getContributions(memberId: string, f: ContribFilter, limit: number): Promise<ContribRow[]> {
  const sql = db()!;
  const reviews = f === "reviews";
  const where = reviews
    ? sql`s.member_id <> ${memberId} and exists (select 1 from musicvolume.submission_events e where e.submission_id = s.id and e.member_id = ${memberId} and e.action = 'status')`
    : f === "waiting" ? sql`s.member_id = ${memberId} and s.status in ${sql(WAITING)}`
    : f === "published" || f === "rejected" ? sql`s.member_id = ${memberId} and s.status = ${f}`
    : sql`s.member_id = ${memberId} and s.status <> 'withdrawn'`;
  const rows = await sql<{
    number: string; kind: "edit" | "new"; entity_type: Kind; entity_name: string; changes: Record<string, { to: unknown }>;
    status: Status; created_at: Date; rel_type: string | null; cover: string | null; dep_name: string | null; linked_name: string | null;
    b_name: string | null; b_role: Viewer["role"] | null; b_tier: Tier | null; moved_at: Date | null;
    mine_to: string | null; mine_from: string | null; mine_at: Date | null;
    a_name: string; a_role: Viewer["role"]; a_tier: Tier;
  }[]>`
    select s.number, s.kind, s.entity_type, s.entity_name, s.changes, s.status, s.created_at,
           rel.type as rel_type,
           coalesce(rel.cover_small_url, rel.cover_url, sg.cover_small_url, sg.cover_url, ar.image_url) as cover,
           d.entity_name as dep_name,
           (select x.entity_name from musicvolume.submissions x where x.depends_on = s.id order by x.created_at limit 1) as linked_name,
           b.username as b_name, b.role as b_role, b.tier as b_tier, ev.created_at as moved_at,
           my.to_status as mine_to, my.from_status as mine_from, my.created_at as mine_at,
           a.username as a_name, a.role as a_role, a.tier as a_tier
      from musicvolume.submissions s
      join musicvolume.members a on a.id = s.member_id
      left join lateral (select e.member_id, e.created_at from musicvolume.submission_events e
                          where e.submission_id = s.id and e.to_status = s.status and e.action = 'status'
                          order by e.created_at desc limit 1) ev on true
      left join musicvolume.members b on b.id = ev.member_id
      left join lateral (select e.to_status, e.from_status, e.created_at from musicvolume.submission_events e
                          where ${reviews} and e.submission_id = s.id and e.member_id = ${memberId} and e.action = 'status'
                          order by e.created_at desc limit 1) my on true
      left join musicvolume.submissions d on d.id = s.depends_on
      left join public.releases rel on s.entity_type = 'release' and rel.id = s.entity_id
      left join public.songs sg on s.entity_type = 'song' and sg.id = s.entity_id
      left join public.artists ar on s.entity_type = 'artist' and ar.id = s.entity_id
     where ${where}
     order by ${reviews ? sql`my.created_at desc` : sql`s.created_at desc`}
     limit ${limit}`;
  // The rejecter's latest comment, as the reason (comments arrive with the review board tables).
  const rejected = rows.filter((r) => r.status === "rejected" && r.b_name).map((r) => Number(r.number));
  const notes = new Map<number, string>();
  if (rejected.length) {
    const ns = await sql<{ number: string; body: string }[]>`
      select distinct on (s.number) s.number, c.body from musicvolume.submissions s
        join lateral (select e.member_id from musicvolume.submission_events e where e.submission_id = s.id and e.to_status = 'rejected'
                       order by e.created_at desc limit 1) ev on true
        join musicvolume.submission_comments c on c.submission_id = s.id and c.member_id = ev.member_id
       where s.number in ${sql(rejected)} order by s.number, c.created_at desc`.catch(() => []);
    for (const n of ns) notes.set(Number(n.number), n.body);
  }
  return rows.map((r) => {
    let sum = summary(r);
    if (r.kind === "new") sum += ` · ${Object.keys(r.changes ?? {}).length} fields`;
    return {
      number: Number(r.number), entityType: r.entity_type, entityName: r.entity_name, cover: r.cover, summary: sum,
      tag: r.entity_type === "release" ? String((r.kind === "new" ? r.changes.type?.to : r.rel_type) ?? "Release") : r.entity_type,
      status: r.status, when: reviews ? r.mine_at ?? r.created_at : r.created_at,
      by: r.b_name ? { username: r.b_name, role: r.b_role!, tier: r.b_tier! } : null,
      note: notes.get(Number(r.number)) ?? null,
      move: reviews ? moveLabel(r.mine_to, r.mine_from) : null,
      author: reviews ? { username: r.a_name, role: r.a_role, tier: r.a_tier } : null,
    };
  });
}

// ------------------------------------------------------------------ everyone (admins)

export type RoleKey = "c1" | "c2" | "c3" | "e1" | "e2" | "e3" | "admin";
export const ROLE_OPTIONS: { key: RoleKey; label: string }[] = [
  { key: "c1", label: "Tier 1 contributor" }, { key: "c2", label: "Tier 2 contributor" }, { key: "c3", label: "Tier 3 contributor" },
  { key: "e1", label: "Tier 1 editor" }, { key: "e2", label: "Tier 2 editor" }, { key: "e3", label: "Tier 3 editor" },
  { key: "admin", label: "Admin" },
];
export const roleKey = (v: R): RoleKey => (v.role === "admin" ? "admin" : `${v.role === "editor" ? "e" : "c"}${v.tier}` as RoleKey);
export function fromRoleKey(k: string): { role: "contributor" | "editor" | "admin"; tier: Tier } | null {
  if (k === "admin") return { role: "admin", tier: 1 };
  const m = /^([ce])([123])$/.exec(k);
  return m ? { role: m[1] === "e" ? "editor" : "contributor", tier: Number(m[2]) as Tier } : null;
}

export type MemberGroup = "all" | "contributors" | "editors" | "admins";
export type MemberRow = Person & { id: string; joined: Date; thisMonth: number; published: number; rejected: number };

export async function getMembers(f: { q?: string; group?: MemberGroup; limit?: number }): Promise<{ rows: MemberRow[]; counts: Record<MemberGroup, number> }> {
  const sql = db()!;
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const group = f.group ?? "all";
  const role = group === "contributors" ? "contributor" : group === "editors" ? "editor" : group === "admins" ? "admin" : null;
  const rows = await sql<{ id: string; username: string; role: Viewer["role"]; tier: Tier; created_at: Date; this_month: number; published: number; rejected: number }[]>`
    select m.id, m.username, m.role, m.tier, m.created_at,
           coalesce(c.this_month, 0)::int as this_month, coalesce(c.published, 0)::int as published, coalesce(c.rejected, 0)::int as rejected
      from musicvolume.members m
      left join lateral (
        select count(*) filter (where s.status <> 'withdrawn' and s.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
                                  and not exists (select 1 from musicvolume.submissions d where d.depends_on = s.id and d.member_id = s.member_id)) as this_month,
               count(*) filter (where s.status = 'published') as published,
               count(*) filter (where s.status = 'rejected') as rejected
          from musicvolume.submissions s where s.member_id = m.id) c on true
     where m.role <> 'system' and m.email_verified_at is not null
       ${role ? sql`and m.role = ${role}` : sql``}
       ${q ? sql`and (lower(m.username) like ${q} or lower(m.email) like ${q})` : sql``}
     order by case m.role when 'contributor' then 0 when 'editor' then 1 else 2 end, m.tier, m.created_at
     limit ${Math.min(Math.max(f.limit ?? 50, 1), 1000)}`;
  const [c] = await sql<{ all: number; contributors: number; editors: number; admins: number }[]>`
    select count(*)::int as all, count(*) filter (where role = 'contributor')::int as contributors,
           count(*) filter (where role = 'editor')::int as editors, count(*) filter (where role = 'admin')::int as admins
      from musicvolume.members where role <> 'system' and email_verified_at is not null`;
  return {
    rows: rows.map((r) => ({ id: r.id, username: r.username, role: r.role, tier: r.tier, joined: r.created_at, thisMonth: r.this_month, published: r.published, rejected: r.rejected })),
    counts: c,
  };
}
