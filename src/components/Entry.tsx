// Shared layout for artist, release and song pages (Figma: "Phase 2 · Entry pages (B chosen)").
// Desktop: details on the left, edit history and source on the right. Phone: one column.
import Link from "next/link";
import type { ReactNode } from "react";
import type { HistoryItem, Kind, Source } from "@/lib/catalog";
import { shortDate, shortId } from "@/lib/format";
import { suggestHref } from "@/lib/links";
import { ClockIcon, PencilIcon } from "./icons";
import SuggestEdit from "./SuggestEdit";
import { Cover, ReviewDot, Tag } from "./ui";

export function EntryPage({ kind, slug, q, signedIn, cover, round, tag, title, sub, source, history, pending, children }: {
  kind: Kind; slug: string; q?: string; signedIn: boolean;
  cover: string | null; round?: boolean; tag: string; title: string;
  /** The grey line under the title. Editable values in Courier, counts in Jost. */
  sub: ReactNode;
  source: Source; history: HistoryItem[]; pending: number;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-24 md:px-[60px]">
      <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} className="mt-6 inline-block text-[14px] text-white/70 hover:text-white md:mt-[26px]">
        ← {q ? <>Results<span className="hidden md:inline"> for “{q}”</span></> : "Search"}
      </Link>

      <div className="mt-6 flex items-start gap-4 md:mt-9 md:gap-7">
        <div className="hidden md:block"><Cover src={cover} size={140} round={round} /></div>
        <div className="md:hidden"><Cover src={cover} size={88} round={round} /></div>
        <div className="min-w-0 flex-1 md:pt-4">
          <Tag>{tag}</Tag>
          <h1 className="mt-1.5 font-mono text-[28px] leading-[1.1] font-bold break-words md:mt-2 md:text-[44px]">{title}</h1>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[14px] text-white/80 md:mt-3 md:text-[16px]">{sub}</p>
        </div>
        <SuggestEdit href={suggestHref(kind, slug)} signedIn={signedIn} className="mt-14 hidden shrink-0 items-center gap-1.5 rounded-full border border-white/50 py-1.5 pr-3.5 pl-3 text-[14px] hover:border-white hover:bg-white/5 md:inline-flex">
          <PencilIcon /> Suggest edits
        </SuggestEdit>
      </div>

      <SuggestEdit href={suggestHref(kind, slug)} signedIn={signedIn} className="mt-6 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/50 text-[14px] md:hidden">
        <PencilIcon /> Suggest edits
      </SuggestEdit>

      <div className="mt-5 flex flex-col gap-10 md:mt-9 md:flex-row md:gap-[60px]">
        <div className="flex min-w-0 flex-1 flex-col gap-10 md:gap-12">
          {pending > 0 && <div className="md:hidden"><PendingBox pending={pending} /></div>}
          {children}
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-8 md:w-[340px]">
          {pending > 0 && <div className="hidden md:block"><PendingBox pending={pending} /></div>}
          <History history={history} source={source} />
          <div>
            <h2 className="field-label pb-2">Source</h2>
            <p className="text-[14px] text-white/70">
              {source.from === "user" ? "Added by members" : <>MusicBrainz{source.id ? <> · {source.label} {shortId(source.id)}</> : null}</>}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function PendingBox({ pending }: { pending: number }) {
  return (
    <div className="rounded-[10px] border border-teal/70 px-5 py-4">
      <p className="flex items-center gap-2.5 text-[16px]"><ReviewDot /> {pending} edit{pending === 1 ? "" : "s"} waiting for review</p>
    </div>
  );
}

function History({ history, source }: { history: HistoryItem[]; source: Source }) {
  return (
    <div>
      <h2 className="field-label flex items-center gap-2 pb-3"><ClockIcon className="text-white/70" /> Edit history</h2>
      <ul className="flex flex-col gap-4">
        {history.map((h, i) => (
          <li key={i} className="text-[14px]">
            <p className="flex items-baseline gap-2"><span className="font-mono">{h.who}</span><span className="text-[12px] text-white/50">{shortDate(h.when)}</span><span className="text-[12px] text-white/60">{h.status}</span></p>
            <p className="text-white/85">{h.text}</p>
          </li>
        ))}
        <li className="text-[14px]">
          <p className="font-mono text-[14px] text-mbsync">{source.from === "user" ? "members" : "mbsync"}</p>
          <p className="text-white/85">{source.from === "user" ? "added by a member" : "imported from MusicBrainz"}</p>
        </li>
      </ul>
    </div>
  );
}

/** A list of releases (discography, "appears on") with small covers. */
export function ReleaseList({ items }: { items: { slug: string; title: string; type: string; year: number | null; right: string; cover: string | null }[] }) {
  return (
    <ul className="border-t border-rule">
      {items.map((r) => (
        <li key={r.slug} className="border-b border-hair">
          <Link href={`/release/${r.slug}`} className="flex items-center gap-3.5 px-2 py-2 hover:bg-white/4">
            <Cover src={r.cover} size={32} />
            <span className="min-w-0 flex-1 truncate font-mono text-[15px]">{r.title}</span>
            <span className="flex shrink-0 items-baseline gap-3 text-white/60">
              <span className="hidden font-mono text-[12px] uppercase md:inline">{r.type}</span>
              <span className="font-mono text-[12px]">{r.year ?? ""}</span>
              <span className="w-16 text-right text-[13px]">{r.right}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Dot() {
  return <span className="text-white/40">·</span>;
}
