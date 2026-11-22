"use client";
// Genres as tags (Graham, 2026-11-21): typing suggests genres already in the catalog, so people
// add to existing ones rather than inventing near-duplicates ("Hip Hop" vs "hip-hop"). Enter,
// comma or a click adds the highlighted genre as a tag; Backspace in an empty box removes the
// last one. Something not in the list can still be added, marked "new" so reviewers notice.
// The value stays the same comma-separated text the rest of the form already uses.
import { useEffect, useId, useMemo, useRef, useState } from "react";

let all: Promise<string[]> | null = null;
const loadGenres = () => (all ??= fetch("/api/genres").then((r) => (r.ok ? r.json() : [])).catch(() => { all = null; return []; }));

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export default function GenreTags({ id, value, onChange, className, invalid, autoFocus, placeholder = "Start typing a genre" }: {
  id?: string; value: string; onChange: (v: string) => void; className: string; invalid?: boolean; autoFocus?: boolean; placeholder?: string;
}) {
  const [genres, setGenres] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const tags = split(value);
  const known = useMemo(() => new Set(genres.map(key)), [genres]);

  useEffect(() => { loadGenres().then(setGenres); }, []);

  const matches = useMemo(() => {
    const k = key(text);
    if (!k) return [];
    const taken = new Set(tags.map(key));
    const starts: string[] = [], within: string[] = [];
    for (const g of genres) {
      const gk = key(g);
      if (taken.has(gk)) continue;
      if (gk.startsWith(k)) starts.push(g); else if (gk.includes(k)) within.push(g);
      if (starts.length >= 8) break;
    }
    return [...starts, ...within].slice(0, 8);
  }, [text, genres, tags]);

  const exact = matches.find((m) => key(m) === key(text));
  const add = (g: string) => {
    const name = g.trim();
    if (!name || tags.some((t) => key(t) === key(name))) { setText(""); return; }
    // A genre typed in other capitals or spacing becomes the catalog's own spelling.
    const canonical = genres.find((x) => key(x) === key(name)) ?? name;
    onChange([...tags, canonical].join(", "));
    setText(""); setActive(0);
  };
  const remove = (i: number) => onChange(tags.filter((_, n) => n !== i).join(", "));

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % matches.length); }
    else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === ",") {
      if (!text.trim()) { if (e.key === ",") e.preventDefault(); return; }
      e.preventDefault();
      add(open && matches[active] ? matches[active] : exact ?? text);
    } else if (e.key === "Backspace" && !text && tags.length) remove(tags.length - 1);
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative">
      <div onClick={() => input.current?.focus()}
        className={`${className} flex min-h-[34px] w-full cursor-text flex-wrap items-center gap-1.5 py-1 ${invalid ? "border-[#eb544d]" : ""}`}>
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-white/12 py-0.5 pr-1 pl-2.5 font-sans text-[13px]">
            {t}
            {genres.length > 0 && !known.has(key(t)) && <span className="rounded-full border border-teal/60 px-1.5 text-[10px] text-teal">new</span>}
            <button type="button" aria-label={`Remove ${t}`} onClick={(e) => { e.stopPropagation(); remove(i); }}
              className="grid size-4 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
              {/* A drawn ×, so it sits in the exact middle (the text character rides high). */}
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className="block">
                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input ref={input} id={id} value={text} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listId} aria-autocomplete="list"
          onChange={(e) => { setText(e.target.value.replace(",", "")); setOpen(true); setActive(0); }}
          onKeyDown={onKey} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-[8ch] flex-1 bg-transparent font-mono text-[14px] outline-none placeholder:text-white/30" />
      </div>
      {open && text.trim() && (
        <ul id={listId} role="listbox" className="absolute top-[calc(100%+4px)] left-0 z-40 w-full overflow-hidden rounded-[6px] border border-white/15 bg-[#141415] py-1 text-[14px] shadow-[0_12px_32px_rgb(0_0_0/.6)]">
          {matches.map((m, i) => (
            <li key={m} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); add(m); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-white/10" : ""}`}>{m}</li>
          ))}
          {!exact && (
            <li role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); add(text); }}
              className="cursor-pointer border-t border-white/10 px-3 py-1.5 text-white/60 hover:bg-white/5">
              Add “{text.trim()}” as a new genre
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
