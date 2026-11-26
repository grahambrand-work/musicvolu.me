"use client";
// Search box above an artist's Discography. Searches everything by this artist, ranked like the
// main search (public.search_artist, shared with Noteworthy): releases of every type, plus songs
// by the artist and every track on their releases. Under the search box, the same release tabs as
// Noteworthy's artist pages (Albums, EPs, Singles, Live, Compilations; empty ones hidden). While
// searching, the results take the place of the tabs and the list. Without the database it filters
// the whole discography instead: each typed word has to match the start of a word in the title
// ("dau" finds "Eldest Daughter").
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

const TABS = [
  { key: "Album", label: "Albums" }, { key: "EP", label: "EPs" }, { key: "Single", label: "Singles" },
  { key: "Live", label: "Live" }, { key: "Compilation", label: "Compilations" },
];
const tabOf = (type: string) => (TABS.some((t) => t.key === type) ? type : "Other");

export default function DiscographySearch({ items, label, artistSlug }: { items: ReleaseItem[]; label: ReactNode; artistSlug: string }) {
  const [q, setQ] = useState("");
  const text = q.trim();
  const tabs = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of items) n.set(tabOf(r.type), (n.get(tabOf(r.type)) ?? 0) + 1);
    return [...TABS, { key: "Other", label: "Other" }].filter((t) => n.get(t.key)).map((t) => ({ ...t, n: n.get(t.key)! }));
  }, [items]);
  const [picked, setTab] = useState<string | null>(null);
  const tab = tabs.some((t) => t.key === picked) ? picked! : tabs[0]?.key;
  const inTab = useMemo(() => items.filter((r) => tabOf(r.type) === tab), [items, tab]);

  // Results for the text typed (fetched a moment after typing stops; outdated requests are cancelled).
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
  const note = (t: string) => <p className="border-t border-rule pt-3 text-[14px] text-white/60">{t}</p>;
  const none = note(`Nothing matches “${text}”.`);
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
      {!text && tabs.length > 1 && (
        <nav aria-label="Release types" className="mb-5 flex gap-2 overflow-x-auto max-md:-mx-4 max-md:px-4">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={t.key === tab}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${t.key === tab ? "border-white bg-white text-black" : "border-white/50 hover:border-white"}`}>
              {t.label}<span className={t.key === tab ? "text-black/55" : "text-white/50"}> · {t.n}</span>
            </button>
          ))}
        </nav>
      )}
      {label}
      {!text ? <ReleaseList items={inTab} />
        : !ready ? note("Searching…")
        : ready.hits === null ? (local.length ? <ReleaseList items={local} /> : none)
        : ready.failed ? note("Search didn’t work just now. Please try again.")
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
