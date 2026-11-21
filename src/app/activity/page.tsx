// The site-wide Activity log (Figma "Phase 5a · B activity log", 89:950): every move on a
// submission and every MusicBrainz update, newest first. Tier 3 contributors, editors and
// admins get filters, the full trail under each row, and CSV export; everyone else sees only
// what went live (Graham, 2026-11-18).
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { Change, MusicBrainz } from "@/components/history/HistoryPage";
import { Name } from "@/components/review/ReviewCard";
import { Tag } from "@/components/ui";
import type { Kind } from "@/lib/edits";
import { getActivity, getTrails, LOG_ACTIONS, seesAll, type LogFilter, type LogRow } from "@/lib/history";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/review";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Activity log" };

const RANGES = [{ key: "2d", label: "Today + yesterday" }, { key: "7d", label: "Last 7 days" }, { key: "30d", label: "Last 30 days" }, { key: "all", label: "All time" }];
const TYPES = [{ key: "all", label: "All types" }, { key: "artist", label: "Artists" }, { key: "release", label: "Releases" }, { key: "song", label: "Songs" }];
const TAG: Record<Kind, string> = { artist: "Artist", release: "Release", song: "Song" };

function when(d: Date) {
  const tz = "America/Chicago";
  const day = (x: Date) => x.toLocaleDateString("en-US", { timeZone: tz });
  const now = new Date();
  if (day(d) === day(now)) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).toLowerCase();
  if (day(d) === day(new Date(now.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

function Status({ s }: { s: string }) {
  const label = s === "published" ? "Live" : STATUS_LABEL[s] ?? s;
  const c = STATUS_COLOR[s] ?? "#808080";
  return (
    <span className="flex items-center gap-1.5 text-[12px]" style={{ color: s === "needs_review" ? "#ffffffb3" : c }}>
      <span className="size-[7px] rounded-full" style={{ background: c, border: s === "needs_review" ? "1px solid #ffffffb3" : undefined }} />{label}
    </span>
  );
}

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const v = await getViewer();
  const all = seesAll(v);
  const f: LogFilter = {
    q: str("q"), action: LOG_ACTIONS.some((a) => a.key === str("action")) ? str("action") : "all",
    type: (TYPES.some((t) => t.key === str("type")) ? str("type") : "all") as LogFilter["type"],
    range: (RANGES.some((r) => r.key === str("range")) ? str("range") : all ? "7d" : "all") as LogFilter["range"],
    limit: Math.min(Number(str("limit")) || 50, 1000),
  };
  const rows = await getActivity(v, f);
  const trails = all ? await getTrails([...new Set(rows.flatMap((r) => (r.submission ? [r.submission.id] : [])))]) : new Map();
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, x]) => typeof x === "string") as [string, string][]).toString();
  const select = "h-9 rounded-full border border-white/50 bg-black px-3.5 text-[13px] hover:border-white";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pb-24 md:px-[60px]">
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 md:mt-12">
          <h1 className="text-[30px] font-semibold md:text-[34px]">Activity log</h1>
          {all && <a href={`/activity/export?${qs({ limit: "1000" })}`} className="rounded-full border border-white/60 px-4 py-2 text-[13px] hover:bg-white/10">Export CSV</a>}
        </div>
        {!all && <p className="mt-2 text-[14px] text-white/65">Every change that went live on musicvolu.me, newest first.</p>}

        {all && (
          <form method="get" className="mt-6 flex flex-wrap items-center gap-2.5">
            <input name="q" defaultValue={f.q} placeholder="Filter by person or entry…" className="h-9 w-full rounded-full bg-white px-4 text-[14px] text-black outline-none placeholder:text-black/40 md:w-[310px]" />
            <select name="action" defaultValue={f.action} className={select}>{LOG_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
            <select name="type" defaultValue={f.type} className={select}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            <select name="range" defaultValue={f.range} className={select}>{RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
            <button type="submit" className="h-9 rounded-full bg-white px-4 text-[13px] font-medium text-black hover:bg-white/85">Filter</button>
            {(f.q || f.action !== "all" || f.type !== "all" || f.range !== "7d") && <Link href="/activity" className="text-[13px] text-white/70 hover:text-white">Clear</Link>}
          </form>
        )}

        <div className="mt-7">
          <div className="hidden grid-cols-[90px_150px_190px_minmax(0,1fr)_110px_minmax(0,1fr)_140px] gap-4 border-b border-rule pb-2.5 md:grid">
            {["When", "Who", "Action", "Entry", "Field", "Change", "Status"].map((h) => <span key={h} className="field-label">{h}</span>)}
          </div>
          <ul>
            {rows.map((r) => <Row key={r.key} r={r} trail={r.submission ? trails.get(r.submission.id) : undefined} me={v?.username} />)}
          </ul>
          {rows.length === 0 && <p className="py-8 text-white/60">Nothing here yet{all ? " with these filters" : ""}.</p>}
          {rows.length >= (f.limit ?? 50) && f.limit! < 1000 && (
            <Link href={`/activity?${qs({ limit: String((f.limit ?? 50) + 50) })}`} scroll={false} className="mt-6 inline-block text-[14px] font-medium hover:underline">Show 50 more</Link>
          )}
        </div>
      </main>
    </>
  );
}

function Row({ r, trail, me }: { r: LogRow; trail?: { when: Date; who: import("@/lib/review").Person | null; text: string }[]; me?: string }) {
  const body = (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 py-3 text-[14px] md:grid-cols-[90px_150px_190px_minmax(0,1fr)_110px_minmax(0,1fr)_140px] md:items-baseline md:gap-4">
      <span className="text-[13px] text-white/60 max-md:order-2 max-md:text-right">{when(r.when)}</span>
      <span className="max-md:order-1">{r.who ? <Name p={r.who} you={me} /> : <MusicBrainz />} <span className="text-white/80 md:hidden">{r.action}</span></span>
      <span className="text-white/85 max-md:hidden">{r.action}</span>
      <span className="flex min-w-0 items-baseline gap-2 max-md:order-3 max-md:col-span-2">
        <Tag>{TAG[r.entityType]}</Tag>
        <Link href={r.href} className="truncate font-mono font-bold hover:underline">{r.entityName}</Link>
      </span>
      <span className="text-[13px] text-white/65 max-md:hidden">{r.field}</span>
      <span className="min-w-0 max-md:order-4 max-md:col-span-2">{r.change ? <Change c={r.change} bare /> : <span className="text-white/35 max-md:hidden">—</span>}</span>
      <span className="max-md:order-5 max-md:col-span-2"><Status s={r.status} /></span>
    </div>
  );
  if (!trail?.length) return <li className="border-b border-hair">{body}</li>;
  return (
    <li className="border-b border-hair">
      <details className="group">
        <summary className="cursor-pointer list-none hover:bg-white/3 [&::-webkit-details-marker]:hidden">{body}</summary>
        <div className="mb-3 rounded-[6px] bg-[#141415] px-4 py-4 md:ml-[106px] md:px-6">
          <p className="field-label mb-2.5">Full trail</p>
          <ol className="flex flex-col gap-1.5">
            {trail.map((t, i) => (
              <li key={i} className="grid grid-cols-[130px_1fr] gap-3 text-[13px] md:grid-cols-[170px_1fr]">
                <span className="text-white/55">{t.when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}</span>
                <span>{t.who ? <Name p={t.who} you={me} /> : "system"} <span className="text-white/80">{t.text}</span></span>
              </li>
            ))}
          </ol>
          {r.submission && <Link href={`/review/${r.submission.number}`} className="mt-3 inline-block text-[13px] hover:underline">Open submission →</Link>}
        </div>
      </details>
    </li>
  );
}
