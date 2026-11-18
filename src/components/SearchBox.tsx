"use client";
// The white pill search box. While typing, a dropdown shows the best artists, releases and
// songs (Figma "Home · desktop · typing"); Enter or "See all results" opens the results page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { suggestAction } from "@/app/actions";
import type { Hit } from "@/lib/catalog";
import { ArrowIcon, SearchIcon } from "./icons";
import { Cover } from "./ui";

type Groups = { artists: Hit[]; releases: Hit[]; songs: Hit[] };

export default function SearchBox({ initial = "", variant = "header", autoFocus = false }: {
  initial?: string;
  /** header: 36px tall with a magnifier. home: the hero box with an arrow (bigger on phones). */
  variant?: "header" | "home";
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [found, setGroups] = useState<Groups | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [, startTransition] = useTransition();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef("");

  useEffect(() => {
    const term = q.trim();
    latest.current = term;
    if (term.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await suggestAction(term);
        if (latest.current === term) setGroups(res);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Fewer than 2 letters: no dropdown (old results are kept but hidden).
  const groups = q.trim().length >= 2 ? found : null;
  const flat = groups ? [...groups.artists, ...groups.releases, ...groups.songs] : [];
  const href = (h: Hit) => `/${h.kind}/${h.slug}?q=${encodeURIComponent(q.trim())}`;
  const go = (path: string) => { setOpen(false); router.push(path); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && flat[active]) return go(href(flat[active]));
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    if (e.key === "Escape") setOpen(false);
  };

  const home = variant === "home";
  const showDrop = open && groups && flat.length > 0;

  return (
    <div ref={box} className="relative w-full">
      <form role="search" onSubmit={submit}
        className={`flex items-center justify-between rounded-full bg-white pr-4 pl-5 text-black ${home ? "h-11 md:h-9" : "h-9"}`}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          autoFocus={autoFocus}
          placeholder="Search musicvolu.me"
          aria-label="Search musicvolu.me"
          role="combobox"
          aria-expanded={!!showDrop}
          aria-controls={listId}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[16px] text-black outline-none placeholder:text-black/40"
        />
        <button type="submit" aria-label="Search" className="-mr-1 grid size-7 place-items-center">
          {home ? <><ArrowIcon size={12} className="hidden text-black/40 md:block" /><SearchIcon className="md:hidden" /></> : <SearchIcon />}
        </button>
      </form>

      {showDrop && (
        <div id={listId} role="listbox"
          className="absolute top-[calc(100%+8px)] right-0 left-0 z-40 overflow-hidden rounded-[10px] border border-white/15 bg-[#0d0d0e] text-left shadow-2xl">
          {(["artists", "releases", "songs"] as const).map((g) => groups[g].length > 0 && (
            <div key={g} className="pt-3">
              <p className="field-label px-4 pb-1.5 text-[11px]">{g}</p>
              {groups[g].map((h) => {
                const i = flat.indexOf(h);
                return (
                  <Link key={`${h.kind}:${h.slug}`} href={href(h)} role="option" aria-selected={i === active}
                    onClick={() => setOpen(false)} onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-3 px-4 py-1.5 ${i === active ? "bg-white/9" : ""}`}>
                    <Cover src={h.cover} size={32} round={h.kind === "artist"} />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate font-mono text-[14px] text-white">{h.title}</span>
                      <span className="block truncate font-mono text-[12px] text-white/55">
                        {[h.kind === "release" ? cap(h.tag) : h.kind === "artist" ? "Artist" : "Song", ...h.sub.filter((s) => !/tracks?$|releases?$/.test(s))].join(" · ")}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
          <Link href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)}
            className="mt-2 flex items-baseline justify-between border-t border-white/12 px-4 py-3 text-[14px] font-medium text-white hover:bg-white/5">
            <span>See all results for “{q.trim()}”</span>
            <span className="hidden font-mono text-[12px] text-white/40 md:inline">Enter ↵</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
