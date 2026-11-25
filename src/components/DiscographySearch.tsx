"use client";
// Search box above an artist's Discography. Narrows the list with every letter typed:
// each typed word has to match the start of a word in the title ("dau" finds
// "Eldest Daughter"). Case, accents and punctuation don't matter. Same rules as
// Noteworthy's discography search.
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

export default function DiscographySearch({ items, label }: { items: ReleaseItem[]; label: ReactNode }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter((r) => matchesTitle(r.title, q)), [items, q]);
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
      {label}
      {shown.length > 0 || !q ? <ReleaseList items={shown} /> : (
        <p className="border-t border-rule pt-3 text-[14px] text-white/60">No releases match “{q.trim()}”.</p>
      )}
    </>
  );
}
