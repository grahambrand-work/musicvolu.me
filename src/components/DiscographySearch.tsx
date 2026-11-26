"use client";
// Search box above an artist's Discography. Narrows the list with every letter typed:
// each typed word has to match the start of a word in the title ("dau" finds
// "Eldest Daughter"). Case, accents and punctuation don't matter. Same rules as
// Noteworthy's discography search. Under the search box, the same release tabs as Noteworthy's
// artist pages (Albums, EPs, Singles, Live, Compilations; empty ones hidden); the search
// narrows the open tab.
import { useMemo, useState, type ReactNode } from "react";
import ReleaseList, { type ReleaseItem } from "./ReleaseList";
import SearchPill, { searchInput } from "./SearchPill";

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

export default function DiscographySearch({ items, label }: { items: ReleaseItem[]; label: ReactNode }) {
  const [q, setQ] = useState("");
  const tabs = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of items) n.set(tabOf(r.type), (n.get(tabOf(r.type)) ?? 0) + 1);
    return [...TABS, { key: "Other", label: "Other" }].filter((t) => n.get(t.key)).map((t) => ({ ...t, n: n.get(t.key)! }));
  }, [items]);
  const [picked, setTab] = useState<string | null>(null);
  const tab = tabs.some((t) => t.key === picked) ? picked! : tabs[0]?.key;
  const shown = useMemo(() => items.filter((r) => tabOf(r.type) === tab && matchesTitle(r.title, q)), [items, tab, q]);
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
            placeholder="Search discography"
            aria-label="Search discography"
            className={searchInput}
          />
        </SearchPill>
      )}
      {tabs.length > 1 && (
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
      {shown.length > 0 || !q ? <ReleaseList items={shown} /> : (
        <p className="border-t border-rule pt-3 text-[14px] text-white/60">Nothing in {tabs.find((t) => t.key === tab)?.label ?? "the discography"} matches “{q.trim()}”.</p>
      )}
    </>
  );
}
