// A member's contributions (Figma 90:993 desktop, 90:1154 phone): their numbers, edits used
// this month, how close they are to the next tier, and everything they sent, newest first.
// Editors and admins also get a Reviews tab (submissions they moved). Members see their own
// page; editors and admins can open anyone's (admins via "View log" on the Members page).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { Name } from "@/components/review/ReviewCard";
import { Cover, Tag } from "@/components/ui";
import {
  getAllowances, getContributions, getMember, getStats, limitFor, nextMonth, PROMOTE_AT,
  type ContribFilter, type ContribRow, type Tier,
} from "@/lib/members";
import { STATUS_COLOR, STATUS_LABEL, type Person } from "@/lib/review";
import { roleLabel } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/members/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)} · Contributions` };
}

const TZ = "America/Chicago";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** TODAY, YESTERDAY, 3 DAYS AGO, LAST WEEK, then month names. */
function bucket(d: Date): string {
  const days = Math.round((Date.parse(dayKey(new Date())) - Date.parse(dayKey(d))) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: TZ });
}

export default async function ContributionsPage({ params, searchParams }: PageProps<"/members/[username]">) {
  const v = await getViewer();
  const { username } = await params;
  if (!v) redirect(`/login?next=/members/${encodeURIComponent(username)}`);
  const m = await getMember(decodeURIComponent(username));
  if (!m) notFound();
  const own = m.id === v.id;
  if (!own && v.role === "contributor") notFound();

  const sp = await searchParams;
  const reviewer = m.role === "editor" || m.role === "admin";
  const tabs: ContribFilter[] = ["all", "waiting", "published", "rejected", ...(reviewer ? (["reviews"] as const) : [])];
  const f = (tabs.includes(sp.show as ContribFilter) ? sp.show : "all") as ContribFilter;
  const limit = Math.min(Number(sp.limit) || 30, 500);
  const [stats, allowances, rows] = await Promise.all([getStats(m.id), getAllowances(), getContributions(m.id, f, limit)]);
  const limitN = await limitFor(m, allowances);
  const count: Record<ContribFilter, number> = { all: stats.submitted, waiting: stats.waiting, published: stats.published, rejected: stats.rejected, reviews: stats.reviews };
  const label: Record<ContribFilter, string> = { all: "All", waiting: "Waiting", published: "Published", rejected: "Rejected", reviews: "Reviews" };
  const href = (show: ContribFilter, more?: number) => {
    const p = new URLSearchParams();
    if (show !== "all") p.set("show", show);
    if (more) p.set("limit", String(more));
    const s = p.toString();
    return `/members/${m.username}${s ? `?${s}` : ""}`;
  };

  const groups: [string, ContribRow[]][] = [];
  for (const r of rows) {
    const b = bucket(r.when);
    if (groups.at(-1)?.[0] === b) groups.at(-1)![1].push(r);
    else groups.push([b, [r]]);
  }
  const since = m.joined.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: TZ });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pb-24 md:px-[60px]">
        <h1 className="mt-6 font-mono text-[24px] font-bold md:mt-12 md:text-[28px]">{m.username}</h1>
        <p className="mt-2 text-[13px] text-white/60">
          {roleLabel(m).replace(/ (Contributor|Editor)$/, (x) => x.toLowerCase())}<span className="max-md:hidden"> · member since {since}</span>
          {own ? " · Your contributions" : v.role === "admin" ? <> · <Link href="/members" className="hover:underline">Members and roles</Link></> : null}
        </p>

        <div className="mt-6 grid gap-3 md:mt-8 lg:items-start lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)] lg:gap-4">
          <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-4 lg:col-span-4">
            <Stat n={stats.submitted} label="Submitted" className="max-md:hidden" />
            <Stat n={stats.published} label="Published" color="#7ad98f" />
            <Stat n={stats.waiting} label={<><span className="md:hidden">Waiting</span><span className="max-md:hidden">Waiting for review</span></>} color="#5cc7bd" />
            <Stat n={stats.rejected} label="Rejected" color="#eb544d" />
          </div>
          <Allowance used={stats.thisMonth} limit={limitN} published={stats.published} m={m} next={m.role === "contributor" && m.tier < 3 ? allowances.now[(m.tier + 1) as Tier] : null} />
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 md:mt-10">
          <nav className="flex gap-2 overflow-x-auto max-md:-mx-4 max-md:px-4">
            {tabs.map((t) => (
              <Link key={t} href={href(t)} scroll={false}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${f === t ? "border-white bg-white text-black" : "border-white/50 hover:border-white"}`}>
                {label[t]} · {count[t].toLocaleString("en-US")}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-6 md:mt-8">
          {groups.map(([title, list]) => (
            <section key={title} className="mb-2">
              <h2 className="field-label mt-6 mb-1 text-white/55 first:mt-0">{title}</h2>
              <ul>{list.map((r) => <Row key={`${r.number}`} r={r} owner={m} reviews={f === "reviews"} />)}</ul>
            </section>
          ))}
          {rows.length === 0 && (
            <p className="py-8 text-white/60">
              {f === "reviews" ? "No reviews yet." : f === "all" ? <>Nothing sent yet.{own && <> <Link href="/contribute" className="text-white underline">Contribute</Link> to add music or fix an entry.</>}</> : `Nothing ${label[f].toLowerCase()}.`}
            </p>
          )}
          {rows.length >= limit && limit < 500 && (
            <Link href={href(f, limit + 30)} scroll={false} className="mt-6 inline-block text-[14px] font-medium hover:underline">Show older</Link>
          )}
        </div>
      </main>
    </>
  );
}

function Stat({ n, label, color, className = "" }: { n: number; label: React.ReactNode; color?: string; className?: string }) {
  return (
    <div className={`rounded-[6px] border border-white/20 px-3.5 py-3.5 md:px-4 md:py-4 ${className}`}>
      <p className="font-mono text-[22px] font-bold md:text-[24px]" style={{ color }}>{n.toLocaleString("en-US")}</p>
      <p className="mt-1 text-[12px] text-white/60 md:text-[13px]">{label}</p>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return (
    <div className="mt-2 h-[5px] rounded-full bg-white/12" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** EDITS THIS MONTH bar, and the NEXT TIER bar for tier 1–2 contributors. */
function Allowance({ used, limit, published, m, next }: { used: number; limit: number | null; published: number; m: { role: string; tier: number }; next: number | null }) {
  const { label: resets } = nextMonth();
  const target = m.role === "contributor" && m.tier < 3 ? PROMOTE_AT[(m.tier + 1) as 2 | 3] : null;
  return (
    <div className="rounded-[6px] border border-teal/70 px-4 py-4 md:px-4">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="field-label text-white/70">Edits this month</span>
        <span className="text-teal">{limit == null ? `${used} · no limit` : `${used} of ${limit}`}<span className="max-md:hidden">{limit != null && " used"}</span></span>
      </div>
      {limit != null && <Bar value={used} max={limit} color="#5cc7bd" />}
      {target != null && (
        <>
          <div className="mt-4 flex items-baseline justify-between text-[12px]">
            <span className="field-label text-white/70">Next tier</span>
            <span>{Math.min(published, target)} of {target}<span className="max-md:hidden"> published</span></span>
          </div>
          <Bar value={published} max={target} color="#ffffff" />
        </>
      )}
      <p className="mt-3 text-[11px] text-white/55 max-md:hidden">
        {target != null && next != null ? `Tier ${m.tier + 1} gets ${next} edits a month. ` : ""}
        {limit == null ? "Editors and admins have no edit limit." : `Resets ${resets}.`}
      </p>
    </div>
  );
}

function Row({ r, owner, reviews }: { r: ContribRow; owner: Person; reviews: boolean }) {
  const c = STATUS_COLOR[r.status] ?? "#808080";
  const hollow = r.status === "needs_review";
  const by = r.by ? <Name p={r.by} /> : null;
  const line = reviews ? <>Last move: {r.move}</>
    : r.status === "in_review" && by ? <>Picked up by {by}</>
    : r.status === "changes_requested" ? <>Waiting on <Name p={owner} /></>
    : r.status === "final_review" && by ? <>Sent by {by}</>
    : r.status === "published" && by ? <>Published by {by}</>
    : r.status === "rejected" && by ? <>Rejected by {by}</>
    : null;
  const status = (
    <div className="text-[12px]">
      <p className="flex items-center gap-1.5" style={{ color: hollow ? "#ffffffb3" : c }}>
        <span className="size-[7px] rounded-full" style={{ background: hollow ? "transparent" : c, border: hollow ? "1px solid #ffffffb3" : undefined }} />
        {r.status === "published" ? "Live" : STATUS_LABEL[r.status] ?? r.status}
      </p>
      {line && <p className="mt-1 text-white/60">{line}</p>}
      {r.note && <p className="mt-1.5 line-clamp-2 border-l-2 border-[#eb544d] pl-2 text-white/80">{r.note}</p>}
    </div>
  );
  return (
    <li className="relative border-b border-hair">
      <Link href={`/submission/${r.number}`} className="absolute inset-0" aria-label={`Open ${r.entityName}`} />
      <div className="flex gap-3.5 py-3.5 hover:bg-white/3 md:items-center md:gap-4">
        <Cover src={r.cover} size={34} round={r.entityType === "artist"} className="mt-0.5 md:mt-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Tag>{r.tag}</Tag>
            <span className="truncate font-mono text-[14px] font-bold">{r.entityName}</span>
          </div>
          <p className="mt-1 truncate text-[12px] text-white/60">{r.summary}{r.author && <> · by <Name p={r.author} /></>}</p>
          <div className="mt-2 md:hidden">{status}</div>
        </div>
        <div className="w-[220px] shrink-0 max-md:hidden">{status}</div>
      </div>
    </li>
  );
}
