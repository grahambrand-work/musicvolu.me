// An entry's full edit history (Figma "Phase 5a · A history timeline", Melodrama 88:925):
// newest first, one card per edit or MusicBrainz update, filter pills, and "People who
// edited this" beside it on desktop.
import Link from "next/link";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import { Name } from "@/components/review/ReviewCard";
import { Cover, Tag } from "@/components/ui";
import type { Kind } from "@/lib/edits";
import { longDate } from "@/lib/format";
import { getEntryHistory, seesAll, type FieldChange, type HistoryItem } from "@/lib/history";
import { roleLabel, MUSICBRAINZ_TEAL } from "@/lib/roles";
import { STATUS_COLOR, STATUS_LABEL, type Person } from "@/lib/review";
import { getViewer } from "@/lib/viewer";

const SHOW = ["all", "published", "pending", "rejected"] as const;
type Show = (typeof SHOW)[number];

export const MusicBrainz = () => <span className="font-mono" style={{ color: MUSICBRAINZ_TEAL }}>MusicBrainz</span>;

export function Change({ c, bare = false }: { c: FieldChange; bare?: boolean }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-6">
      {!bare && <span className="field-label w-[120px] shrink-0">{c.label}</span>}
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[14px]">
        {c.was && <span className="break-words text-white/45 line-through">{c.was}</span>}
        {c.was && <span className="text-white/40">→</span>}
        <span className="break-words text-teal">{c.now || <span className="text-white/45">(empty)</span>}</span>
      </span>
    </div>
  );
}

function StateDot({ it }: { it: HistoryItem }) {
  const label = it.status === "applied" ? "Published" : it.status === "kept" ? "Kept ours" : STATUS_LABEL[it.status] ?? it.status;
  const color = it.status === "applied" ? STATUS_COLOR.published : it.status === "kept" ? "#808080" : STATUS_COLOR[it.status];
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: it.status === "needs_review" ? "#ffffffb3" : color }}>
      <span className="size-[7px] rounded-full" style={{ background: color, border: it.status === "needs_review" ? "1px solid #ffffffb3" : undefined }} />{label}
    </span>
  );
}

function Card({ it, me }: { it: HistoryItem; me?: string }) {
  return (
    <article className="rounded-[6px] border border-white/15 bg-[#141415] px-[18px] py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px]">
          {it.who ? <><span className="font-bold"><Name p={it.who} you={me} /></span><span className="text-[11px] text-white/50">{roleLabel(it.who).replace("Editor", "editor").replace("Contributor", "contributor")}</span></>
            : <><span className="font-bold"><MusicBrainz /></span><span className="text-[11px] text-white/50">Catalog sync</span></>}
          <span className="text-white/85">{it.verb}</span>
        </p>
        <StateDot it={it} />
      </div>
      {it.rows.length > 0 && <div className="mt-3.5 flex flex-col gap-2.5">{it.rows.map((c, i) => <Change key={i} c={c} />)}</div>}
      {it.lines.length > 0 && (
        <p className="mt-3 text-[13px] text-white/60">
          {it.lines.map((l, i) => <span key={i}>{i > 0 && " · "}{l.text} {l.who && <Name p={l.who} you={me} />}</span>)}
        </p>
      )}
      {it.number && <Link href={`/submission/${it.number}`} className="mt-3 inline-block text-[13px] hover:underline">View submission #{it.number}</Link>}
    </article>
  );
}

export default async function HistoryPage({ kind, slug, id, tag, title, sub, cover, show: raw }: {
  kind: Kind; slug: string; id: string; tag: string; title: string; sub: ReactNode; cover: string | null; show?: string;
}) {
  const v = await getViewer();
  const all = seesAll(v);
  const items = await getEntryHistory(kind, id, v);
  const show: Show = all && SHOW.includes(raw as Show) ? (raw as Show) : "all";
  const count = (s: Show) => (s === "all" ? items.length : items.filter((i) => i.state === s).length);
  const shown = show === "all" ? items : items.filter((i) => i.state === show);

  // People who edited this: one line each, with what they did.
  const people = new Map<string, { p: Person | null; published: number; pending: number; rejected: number }>();
  for (const it of items) {
    const k = it.who?.username ?? "MusicBrainz";
    const e = people.get(k) ?? { p: it.who, published: 0, pending: 0, rejected: 0 };
    if (it.state === "published") e.published++; else if (it.state === "pending") e.pending++; else if (it.state === "rejected") e.rejected++;
    people.set(k, e);
  }
  const what = (e: { published: number; pending: number; rejected: number }) =>
    [e.published && `${e.published} change${e.published === 1 ? "" : "s"}`, e.pending && `${e.pending} pending`, e.rejected && `${e.rejected} rejected`].filter(Boolean).join(" · ");

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pb-24 md:px-[60px]">
        <Link href={`/${kind}/${slug}`} className="mt-6 inline-block text-[14px] text-white/70 hover:text-white md:mt-9">← {title}</Link>
        <div className="mt-6 flex items-center gap-4 md:gap-5">
          <Cover src={cover} size={62} round={kind === "artist"} />
          <div className="min-w-0">
            {tag && <Tag>{tag}</Tag>}
            <h1 className="mt-1.5 font-mono text-[22px] leading-[1.15] font-bold break-words md:text-[26px]">{title}</h1>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-white/70">{sub}</p>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[24px] font-semibold">Edit history</h2>
          {all && (
            <nav className="flex flex-wrap gap-2">
              {SHOW.map((s) => (
                <Link key={s} href={s === "all" ? `/${kind}/${slug}/history` : `/${kind}/${slug}/history?show=${s}`}
                  className={`rounded-full border px-3.5 py-[6px] text-[13px] ${show === s ? "border-white bg-white text-black" : "border-white/50 hover:border-white"}`}>
                  {s[0].toUpperCase() + s.slice(1)} · {count(s)}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="mt-7 grid gap-10 md:grid-cols-[1fr_310px] md:gap-12">
          <ol className="flex flex-col gap-3.5">
            {shown.map((it) => (
              <li key={it.key} className="flex flex-col gap-2 md:flex-row md:gap-14">
                <time className="w-[90px] shrink-0 pt-4 text-[13px] text-white/60 max-md:pt-0">{longDate(it.when)}</time>
                <div className="min-w-0 flex-1"><Card it={it} me={v?.username} /></div>
              </li>
            ))}
            {shown.length === 0 && <li className="text-white/60">{items.length ? "Nothing here with that filter." : "No edits yet. Everything here came from MusicBrainz as it is."}</li>}
          </ol>
          <aside>
            <h3 className="field-label border-b border-rule pb-3">People who edited this</h3>
            <ul className="mt-2 flex flex-col">
              {[...people.entries()].map(([k, e]) => (
                <li key={k} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                  {e.p ? <Name p={e.p} you={v?.username} /> : <MusicBrainz />}
                  <span className="text-[12px] text-white/60">{what(e)}</span>
                </li>
              ))}
              {people.size === 0 && <li className="py-2 text-[14px] text-white/60">No one yet.</li>}
            </ul>
            <p className="mt-3 text-[12px] leading-[1.5] text-white/55">
              {all ? "Anyone can see published changes here. Pending and rejected edits show only for tier 3 contributors, editors and admins."
                : "This shows every change that went live."}
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
