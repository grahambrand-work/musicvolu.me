"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { suggester } from "@/lib/suggestClient";
import SearchPill, { searchInput } from "@/components/SearchPill";
import { Cover, ReviewDot, Tag } from "@/components/ui";
import type { Hit } from "@/lib/catalog";
import { hitHref } from "@/lib/links";

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export default function ContributeStart({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [, start] = useTransition();
  const seq = useRef(0);
  const [ask] = useState(suggester);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return;
    const n = ++seq.current;
    const timer = setTimeout(() => start(async () => {
      const r = await ask(t);
      if (r !== "stale" && n === seq.current) setFound({ q: t, hits: r ? [...r.artists, ...r.releases, ...r.songs].sort((a, b) => a.score - b.score).slice(0, 6) : [] });
    }), 200);
    return () => clearTimeout(timer);
  }, [q, ask]);

  const t = q.trim();
  const hits = t.length >= 2 && found?.q === t ? found.hits : null;
  const exact = hits?.some((h) => h.title.toLowerCase() === t.toLowerCase());
  const name = encodeURIComponent(titleCase(t));
  const options = [
    { href: `/contribute/release?title=${name}`, label: "An album, EP or single", icon: <Disc /> },
    { href: `/contribute/song?title=${name}`, label: "A song", icon: <Note /> },
    { href: `/contribute/artist?title=${name}`, label: "An artist", icon: <Person /> },
  ];

  return (
    <main className="mx-auto max-w-[534px] px-4 pt-14 pb-24 md:pt-[72px]">
      <h1 className="text-center text-[30px] font-semibold md:text-[34px]">Add something new</h1>
      <p className="mt-3 text-center text-[15px] text-white/65">First, let’s make sure it isn’t already here.</p>
      <SearchPill className="mt-8 h-[42px]">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Title or artist name" aria-label="What are you adding?"
          className={searchInput} />
      </SearchPill>

      {hits && (
        <>
          <p className="field-label mt-6 pb-2 text-[11px]">{hits.length === 0 ? "No matches" : exact ? "Possible matches" : "Close matches · no exact match"}</p>
          <ul className="border-t border-white/10">
            {hits.map((h) => (
              <li key={`${h.kind}:${h.slug}`} className="border-b border-white/10">
                <Link href={hitHref(h)} className="flex items-center gap-3 py-2 hover:bg-white/4">
                  <Cover src={h.cover} size={32} round={h.kind === "artist"} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-2 truncate font-mono text-[14px] font-bold">{h.title}{h.review && <ReviewDot />}</span>
                    <span className="block truncate font-mono text-[12px] text-white/55">{h.sub.join(" · ")}</span>
                  </span>
                  <Tag>{h.tag}</Tag>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[15px]">{hits.length ? "Not here? Add it as:" : "Add it as:"}</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {options.map((o) => (
              <Link key={o.href} href={o.href} className="flex h-[42px] items-center gap-2.5 rounded-[8px] border border-white/25 px-3.5 text-[14px] hover:border-white">
                {o.icon} {o.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-white/50">We’ll fill in “{titleCase(t)}” for you. Every submission is checked by an editor before it goes live.</p>
        </>
      )}
      {!hits && t.length < 2 && (
        <p className="mt-10 text-center text-[14px] text-white/60">
          Or start from scratch:{" "}
          {options.map((o, i) => <span key={o.href}>{i > 0 && " · "}<Link href={o.href.replace(/\?.*/, "")} className="underline hover:text-white">{o.label.toLowerCase()}</Link></span>)}
        </p>
      )}
    </main>
  );
}

const Disc = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.5" /></svg>;
const Note = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M6 12V3.5l7-1.5V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="4.3" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.5" /><circle cx="11.3" cy="10.5" r="1.8" stroke="currentColor" strokeWidth="1.5" /></svg>;
const Person = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="5.3" r="2.6" stroke="currentColor" strokeWidth="1.5" /><path d="M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
