"use client";
// Search box above an artist's Discography. Searches everything by this artist, ranked like the
// main search (public.search_artist, shared with Noteworthy): releases of every type, plus songs
// by the artist and every track on their releases. While searching, the results replace the list.
// Without the database it filters the list instead: each typed word has to match the start of a
// word in the title ("dau" finds "Eldest Daughter").
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReleaseList, { type ReleaseItem } from "./ReleaseList";
import SearchPill, { searchInput } from "./SearchPill";
import { Cover, Tag } from "./ui";
import { hitHref } from "@/lib/links";
import type { Hit } from "@/lib/catalog";

const words = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['’`]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function matchesTitle(title: string, query: string) {
  const want = words(query);
  if (!want.length) return true;
  const have = words(title);
  return want.every((w) => have.some((h) => h.startsWith(w)));
}

export default function DiscographySearch({ items, label, artistSlug }: { items: ReleaseItem[]; label: ReactNode; artistSlug: string }) {
  const [q, setQ] = useState("");
  const text = q.trim();
  const [found, setFound] = useState<{ q: string; hits: Hit[] | null; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!text) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/artist-search?${new URLSearchParams({ artist: artistSlug, q: text })}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<{ hits: Hit[] | null; failed?: boolean }>)
        .then((b) => setFound({ q: text, hits: b.hits, failed: b.failed }))
        .catch((e) => { if ((e as Error).name !== "AbortError") setFound({ q: text, hits: [], failed: true }); });
    }, 200);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [text, artistSlug]);
  const ready = found && found.q === text ? found : null;
  const local = useMemo(() => items.filter((r) => matchesTitle(r.title, q)), [items, q]);
  const none = <p className="border-t border-rule pt-3 text-[14px] text-white/60">Nothing matches “{text}”.</p>;
  return (
    <>
      {items.length > 0 && (
        <SearchPill className="mb-4 h-9" right={q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search"
            className="grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            placeholder="Search this artist"
            aria-label="Search this artist's releases and songs"
            className={searchInput}
          />
        </SearchPill>
      )}
      {label}
      {!text ? <ReleaseList items={items} />
        : !ready ? <p className="border-t border-rule pt-3 text-[14px] text-white/60">Searching…</p>
        : ready.hits === null ? (local.length ? <ReleaseList items={local} /> : none)
        : ready.failed ? <p className="border-t border-rule pt-3 text-[14px] text-white/60">Search didn’t work just now. Please try again.</p>
        : !ready.hits.length ? none
        : (
          <ul className="flex flex-col border-t border-rule">
            {ready.hits.map((h) => (
              <li key={`${h.kind}:${h.slug}`} className="border-b border-white/10">
                <Link href={hitHref(h)} className="flex items-center gap-3.5 py-[9px] hover:bg-white/5">
                  <Cover src={h.cover} size={40} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-mono text-[15px] font-bold">{h.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[12px] text-white/55">{h.sub.join(" · ")}</span>
                  </span>
                  <Tag>{h.tag}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
