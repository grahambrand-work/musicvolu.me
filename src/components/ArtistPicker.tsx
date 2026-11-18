"use client";
// Picking the artist on a new release or song: search the catalog (and new artists still in
// review), or add a new artist in a small pop-up (Figma "Add a new artist"). A new artist is
// saved at once, so it can be used straight away and editors check it with the release.
import { useEffect, useRef, useState, useTransition } from "react";
import { findArtistsAction, quickAddArtist } from "@/app/contribute/actions";
import { SUGGEST } from "@/lib/edits";
import { ARTIST_TYPES, type PickedArtist } from "@/lib/newEntry";
import type { ArtistChoice } from "@/lib/submissions";
import { box, boxH, XIcon } from "./EditEntry";
import { PlusIcon } from "./icons";
import { Cover } from "./ui";

/** "juniper hale" → "Juniper Hale"; anything with capitals already is left as typed. */
const niceName = (q: string) => {
  const t = q.trim().replace(/\s+/g, " ");
  return t === t.toLowerCase() ? t.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : t;
};

export default function ArtistPicker({ value, onChange, error }: { value: PickedArtist[]; onChange: (v: PickedArtist[]) => void; error?: string }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; list: ArtistChoice[] } | null>(null);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const t = q.trim();
    if (!t) return;
    const n = ++seq.current;
    const timer = setTimeout(() => start(async () => {
      const list = await findArtistsAction(t);
      if (n === seq.current) setFound({ q: t, list });
    }), 180);
    return () => clearTimeout(timer);
  }, [q]);

  const list = q.trim() && found?.q === q.trim() ? found.list.filter((a) => !value.some((v) => (a.id && v.id === a.id) || (a.review && v.review === a.review))) : [];
  const open = q.trim().length > 0;
  const pick = (a: PickedArtist) => { onChange([...value, a]); setQ(""); setActive(0); };

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((a, i) => (
            <li key={a.id ?? `r${a.review}`} className={`flex items-center gap-2 rounded-full border py-1 pr-2 pl-1.5 ${a.review ? "border-teal/70" : "border-white/30"}`}>
              <Cover size={20} round />
              <span className="font-mono text-[14px] font-bold">{a.name}</span>
              {a.review && <span className="text-[12px] text-teal">in review</span>}
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`} className="text-white/50 hover:text-white"><XIcon /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} aria-invalid={!!error}
          placeholder={value.length ? "Add another artist" : "Search for the artist"} aria-label="Artist" role="combobox" aria-expanded={open} aria-controls="artist-picker-list" autoComplete="off"
          onKeyDown={(e) => {
            const n = list.length + 1;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((x) => (x + 1) % n); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((x) => (x - 1 + n) % n); }
            else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (active < list.length) pick({ id: list[active].id, review: list[active].review, name: list[active].name });
              else setAdding(niceName(q));
            } else if (e.key === "Escape") setQ("");
          }}
          className={`${box} ${boxH} w-full ${error ? "border-[#eb544d]" : "border-white/25"}`} />
        {open && (
          <ul id="artist-picker-list" role="listbox" className="absolute top-[calc(100%+4px)] right-0 left-0 z-30 overflow-hidden rounded-[6px] border border-white/20 bg-[#0d0d0e] shadow-2xl">
            {list.map((a, i) => (
              <li key={a.id ?? `r${a.review}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick({ id: a.id, review: a.review, name: a.name })}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-white/9" : ""}`}>
                  <Cover src={a.image} size={28} round />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-mono text-[14px]">{a.name}</span>
                    {(a.detail || a.review) && <span className="block truncate text-[12px] text-white/50">{a.review ? <span className="text-teal">In review</span> : null}{a.review && a.detail ? " · " : ""}{a.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
            <li role="option" aria-selected={active === list.length}>
              <button type="button" onMouseEnter={() => setActive(list.length)} onClick={() => setAdding(niceName(q))}
                className={`flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-left text-[14px] ${active === list.length ? "bg-white/9" : ""}`}>
                <PlusIcon /> {list.length ? <>Not listed? Create “{q.trim()}”</> : <>No artist called “{q.trim()}” yet. Create this artist</>}
              </button>
            </li>
          </ul>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-[#ff8a80]">{error}</p>}
      {adding !== null && <AddArtist name={adding} onClose={() => setAdding(null)} onAdded={(a) => { pick(a); setAdding(null); }} />}
    </div>
  );
}

function AddArtist({ name, onClose, onAdded }: { name: string; onClose: () => void; onAdded: (a: PickedArtist) => void }) {
  const [v, setV] = useState({ name, kind: "Solo artist", origin: "", started: "", sources: "" });
  const [err, setErr] = useState<{ error: string; fields?: Record<string, string> } | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const f = err?.fields ?? {};
  const label = "field-label block pb-1.5 text-white/80";
  const input = (k: keyof typeof v) => `${box} h-[38px] w-full ${f[k] ? "border-[#eb544d]" : "border-white/30"}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 md:items-center" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby="add-artist-title" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          start(async () => {
            const r = await quickAddArtist(v);
            if ("artist" in r) onAdded(r.artist); else setErr(r);
          });
        }}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[14px] border border-white/15 bg-[#161617] px-6 pt-6 pb-8 md:max-w-[544px] md:rounded-[14px] md:px-7 md:pb-7">
        <div className="flex items-start justify-between">
          <h2 id="add-artist-title" className="text-[22px] font-semibold">Add a new artist</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/80 hover:text-white"><XIcon /></button>
        </div>
        <p className="mt-2 text-[14px] text-white/70">Just the basics for now. You can add more on the artist’s page later.</p>

        <label className="mt-5 block"><span className={label}>Name <span className="ml-1 text-[11px] normal-case tracking-normal text-white/45">Required</span></span>
          <input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={300} className={input("name")} />
          {f.name && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f.name}</span>}
        </label>

        <fieldset className="mt-4">
          <legend className={label}>Type</legend>
          <div className="flex gap-2">
            {ARTIST_TYPES.map((t) => (
              <button key={t.value} type="button" aria-pressed={v.kind === t.value} onClick={() => setV({ ...v, kind: t.value })}
                className={`rounded-full px-3.5 py-1 font-mono text-[14px] ${v.kind === t.value ? "bg-white font-bold text-black" : "border border-white/40"}`}>{t.label}</button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block"><span className={label}>Country</span>
            <input value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} list="add-artist-countries" maxLength={200} className={input("origin")} />
          </label>
          <label className="block"><span className={label}>Started</span>
            <input value={v.started} onChange={(e) => setV({ ...v, started: e.target.value })} inputMode="numeric" placeholder="YYYY" maxLength={4} className={input("started")} />
            {f.started && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f.started}</span>}
          </label>
        </div>
        <datalist id="add-artist-countries">{SUGGEST.country.map((c) => <option key={c} value={c} />)}</datalist>

        <label className="mt-4 block"><span className={label}>Source</span>
          <input value={v.sources} onChange={(e) => setV({ ...v, sources: e.target.value })} placeholder="A link or where you found this" maxLength={2000} className={input("sources")} />
        </label>

        <p className="mt-5 flex items-center gap-2.5 rounded-[8px] bg-teal/10 px-3.5 py-2.5 text-[13px] text-teal">
          <span className="size-1.5 shrink-0 rounded-full bg-teal" /> You can use this artist straight away. It’s sent to editors with your submission.
        </p>
        {err && !err.fields && <p role="alert" className="mt-3 text-[13px] text-[#ffb3ad]">{err.error}</p>}
        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="rounded-full border border-white/50 px-4 py-2 text-[14px]">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-black disabled:opacity-60">{busy ? "Adding…" : "Add artist"}</button>
        </div>
      </form>
    </div>
  );
}
