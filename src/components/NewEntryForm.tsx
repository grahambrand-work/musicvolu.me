"use client";
// "New album / song / artist" (Figma "B · Long form with live preview"): numbered sections on
// the left with a step list beside them, and a live preview with Submit on the right.
import GenreTags from "./GenreTags";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { submitNew, type NewResult } from "@/app/contribute/actions";
import { RELEASE_TYPES, SUGGEST, splitList } from "@/lib/edits";
import { ARTIST_TYPES, emptyNew, type NewArtist, type NewKind, type NewRelease, type NewSong, type NewValues, type PickedArtist } from "@/lib/newEntry";
import ArtistPicker from "./ArtistPicker";
import { box, Credits, Tracklist } from "./EditEntry";
import CoverLink from "./CoverLink";
import { Cover, Tag } from "./ui";

const TITLES: Record<NewKind, string> = { artist: "New artist", release: "New release", song: "New song" };

type Props = {
  kind: NewKind;
  prefill: { title?: string; artist?: PickedArtist | null; type?: string };
  allowance: { limit: number | null; left: number | null };
};

export default function NewEntryForm({ kind, prefill, allowance }: Props) {
  const [v, setV] = useState<NewValues>(() => emptyNew(kind, prefill));
  const [note, setNote] = useState("");
  const [result, setResult] = useState<NewResult>();
  const [busy, start] = useTransition();
  const seq = useRef(0);
  const f = result?.fields ?? {};
  const set = (k: string, x: unknown) => setV((cur) => ({ ...cur, [k]: x }) as NewValues);
  const val = (k: string) => ((v as Record<string, unknown>)[k] as string) ?? "";
  const r = v as NewRelease, s = v as NewSong, a = v as NewArtist;
  const outOfEdits = allowance.left === 0;

  const touched = useMemo(() => JSON.stringify(v) !== JSON.stringify(emptyNew(kind, prefill)), [v, kind, prefill]);
  useEffect(() => {
    if (!touched || busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [touched, busy]);

  const title = kind === "artist" ? a.name : r.title;
  const artists = kind === "artist" ? [] : r.artists;
  const heading = kind === "release" ? `New ${r.type === "Album" ? "album" : r.type === "EP" ? "EP" : r.type.toLowerCase()}` : TITLES[kind];

  // Step list: done when the required bits of that section are filled in.
  const steps: { id: string; label: string; done: boolean }[] = kind === "artist"
    ? [{ id: "s-details", label: "Details", done: !!a.name }, { id: "s-sources", label: "Photo & sources", done: !!a.sources.trim() }]
    : [
      { id: "s-artist", label: kind === "release" ? "Type & artist" : "Artist", done: artists.length > 0 },
      { id: "s-details", label: "Details", done: !!title },
      kind === "release" ? { id: "s-tracks", label: "Tracklist", done: r.tracks.some((t) => t.title.trim()) } : { id: "s-credits", label: "Credits", done: s.credits.length > 0 },
      { id: "s-sources", label: kind === "release" ? "Cover art & sources" : "Sources", done: !!val("sources").trim() },
    ];
  const missing = [
    !title && (kind === "artist" ? "a name" : "a title"),
    kind !== "artist" && artists.length === 0 && "an artist",
    !val("sources").trim() && "a source for this information",
  ].filter(Boolean) as string[];

  function submit() {
    setResult(undefined);
    start(async () => {
      const res = await submitNew(kind, v, note);
      if (res) setResult(res);
    });
  }

  const field = (k: string, label: string, opts: { required?: boolean; placeholder?: string; list?: "country" | "language"; mode?: "numeric"; max?: number } = {}) => (
    <label className="block">
      <span className="field-label block pb-2 text-white/80">{label}{opts.required && <span className="ml-1.5 text-[11px] normal-case tracking-normal text-white/45">Required</span>}</span>
      <input value={val(k)} onChange={(e) => set(k, e.target.value)} placeholder={opts.placeholder} list={opts.list ? `new-${opts.list}` : undefined}
        inputMode={opts.mode} maxLength={opts.max ?? 300} aria-invalid={!!f[k]}
        className={`${box} h-[38px] w-full ${f[k] ? "border-[#eb544d]" : "border-white/30"}`} />
      {f[k] && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f[k]}</span>}
    </label>
  );

  const preview = (
    <>
      <p className="field-label">Preview</p>
      <div className="mt-4 flex gap-3.5 border-b border-white/12 pb-4">
        <Cover size={72} round={kind === "artist"} />
        <div className="min-w-0 pt-1">
          <Tag>{kind === "artist" ? "Artist" : kind === "song" ? "Song" : r.type}</Tag>
          <p className="mt-1.5 truncate font-mono text-[17px] font-bold">{title || <span className="text-white/35">{kind === "artist" ? "Name" : "Title"}</span>}</p>
          <p className="truncate font-mono text-[13px] text-white/60">
            {kind === "artist"
              ? [ARTIST_TYPES.find((t) => t.value === a.kind)?.label, a.origin, a.started].filter(Boolean).join(" · ")
              : [artists.map((x) => x.name).join(", "), val("releaseDate").slice(0, 4)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-2.5 border-b border-white/12 py-4 text-[13px]">
        {(kind === "release" ? [["Label", r.label], ["Country", r.country], ["Genres", r.genres], ["Tracks", r.tracks.filter((t) => t.title.trim()).length ? `${r.tracks.filter((t) => t.title.trim()).length} so far` : ""]]
          : kind === "song" ? [["Length", s.duration], ["Language", s.language], ["Genres", s.genres], ["Credits", s.credits.length ? String(s.credits.length) : ""]]
            : [["Genres", a.genres], ["Website", a.website]]).map(([k, x]) => (
          <div key={k} className="flex gap-3">
            <dt className="field-label w-[76px] shrink-0 pt-px">{k}</dt>
            <dd className="min-w-0 font-mono break-words">{x || <span className="text-white/30">—</span>}</dd>
          </div>
        ))}
      </dl>
      <p className="pt-4 text-[13px] text-teal">{missing.length ? `Still needed: ${missing.join(", ")}.` : "Ready to send for review."}</p>
      <label htmlFor="new-note" className="field-label mt-4 block text-white/80">Note for editors <span className="text-[11px] normal-case tracking-normal text-white/45">Optional</span></label>
      <textarea id="new-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000}
        className="mt-2 w-full resize-y rounded-[6px] border border-white/30 bg-transparent px-3 py-2 text-[14px] outline-none focus:border-white/80" />
      <p className="mt-3 text-[13px] text-white/55">
        {outOfEdits ? `You've used all ${allowance.limit} edits this month. They reset on the 1st.` : <>Counts as 1 edit{allowance.left != null && ` · ${allowance.left} left this month`}</>}
      </p>
      {result?.error && <p role="alert" className="mt-3 rounded-[6px] border border-[#eb544d]/60 bg-[#eb544d]/10 px-3 py-2 text-[13px] text-[#ffb3ad]">{result.error}</p>}
      <button type="button" onClick={submit} disabled={busy || outOfEdits}
        className={`mt-4 h-11 w-full rounded-full text-[15px] font-medium disabled:opacity-60 ${missing.length ? "bg-white/45 text-black" : "bg-white text-black hover:bg-white/85"}`}>
        {busy ? "Submitting…" : "Submit for review"}
      </button>
    </>
  );

  return (
    <main className="mx-auto flex max-w-[1440px] gap-12 px-4 pt-6 pb-24 md:px-[60px] md:pt-10">
      <nav className="sticky top-[110px] hidden w-[194px] shrink-0 self-start lg:block" aria-label="Steps">
        <p className="field-label pb-4">{heading}</p>
        <ol className="flex flex-col gap-1">
          {steps.map((st) => (
            <li key={st.id}>
              <a href={`#${st.id}`} className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[15px] hover:bg-white/6">
                {st.done
                  ? <span className="grid size-[18px] place-items-center rounded-full bg-teal text-black"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  : <span className="size-[18px] rounded-full border border-white/45" />}
                <span className={st.done ? "" : "text-white/75"}>{st.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 flex-1">
        <Link href="/contribute" className="text-[14px] text-white/60 hover:text-white">← Back to search</Link>
        <h1 className="mt-3 text-[30px] font-semibold md:text-[34px]">{heading}</h1>

        {kind !== "artist" && (
          <Section n={1} id="s-artist" title={kind === "release" ? "Type & artist" : "Artist"} done={steps[0].done}>
            {kind === "release" && (
              <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
                {RELEASE_TYPES.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={r.type === t} onClick={() => set("type", t)}
                    className={`rounded-full px-3.5 py-1 font-mono text-[14px] ${r.type === t ? "bg-white font-bold text-black" : "border border-white/40 hover:border-white"}`}>{t}</button>
                ))}
              </div>
            )}
            <span className="field-label block pb-2 text-white/80">Artist <span className="ml-1 text-[11px] normal-case tracking-normal text-white/45">Required</span></span>
            <ArtistPicker value={artists} onChange={(x) => set("artists", x)} error={f.artists} />
            {artists.some((x) => x.review) && <p className="mt-2 text-[13px] text-white/50">New artists can be used now. An editor checks them together with this {kind === "song" ? "song" : "release"}.</p>}
          </Section>
        )}

        <Section n={kind === "artist" ? 1 : 2} id="s-details" title="Details" done={!!title}>
          <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
            <div className="md:col-span-2">{field(kind === "artist" ? "name" : "title", kind === "artist" ? "Name" : "Title", { required: true })}</div>
            {kind === "artist" && (
              <>
                <fieldset className="md:col-span-2">
                  <legend className="field-label block pb-2 text-white/80">Type</legend>
                  <div className="flex gap-2">
                    {ARTIST_TYPES.map((t) => (
                      <button key={t.value} type="button" aria-pressed={a.kind === t.value} onClick={() => set("kind", t.value)}
                        className={`rounded-full px-3.5 py-1 font-mono text-[14px] ${a.kind === t.value ? "bg-white font-bold text-black" : "border border-white/40"}`}>{t.label}</button>
                    ))}
                  </div>
                </fieldset>
                {field("origin", "From", { placeholder: "City, country", list: "country", max: 200 })}
                {field("started", "Started", { placeholder: "YYYY", mode: "numeric", max: 4 })}
                {field("website", "Website")}
              </>
            )}
            {kind === "release" && (
              <>
                {field("releaseDate", "Release date", { placeholder: "YYYY-MM-DD", mode: "numeric", max: 10 })}
                {field("label", "Label")}
                {field("country", "Country", { list: "country", max: 100 })}
                {field("language", "Language", { list: "language", max: 100 })}
              </>
            )}
            {kind === "song" && (
              <>
                {field("duration", "Length", { placeholder: "m:ss", mode: "numeric", max: 8 })}
                {field("releaseDate", "First released", { placeholder: "YYYY-MM-DD", mode: "numeric", max: 10 })}
                {field("language", "Language", { list: "language", max: 100 })}
              </>
            )}
            <div className="md:col-span-2">
              <span className="field-label block pb-2 text-white/80">Genres</span>
              <GenreTags value={val("genres")} onChange={(v) => set("genres", v)} className={`${box} ${f.genres ? "border-[#eb544d]" : "border-white/30"}`} invalid={!!f.genres} />
              {f.genres && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f.genres}</span>}
            </div>
          </div>
          {splitList(val("genres")).length > 8 && <p className="mt-2 text-[12px] text-white/50">Keep genres to the few that fit best.</p>}
          <datalist id="new-country">{SUGGEST.country.map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="new-language">{SUGGEST.language.map((x) => <option key={x} value={x} />)}</datalist>
        </Section>

        {kind === "release" && (
          <Section n={3} id="s-tracks" title="Tracklist">
            <Tracklist rows={r.tracks} initial={[]} errors={f} plain paste heading={false}
              onChange={(rows) => set("tracks", rows)} newId={() => `n:${++seq.current}`} />
          </Section>
        )}
        {kind === "song" && (
          <Section n={3} id="s-credits" title="Credits">
            <p className="-mt-2 mb-3 text-[13px] text-white/50">Who wrote, produced or played on it. Optional.</p>
            <Credits rows={s.credits} initial={[]} errors={f} plain onChange={(rows) => set("credits", rows)} newId={() => `n:${++seq.current}`} />
          </Section>
        )}

        <Section n={kind === "artist" ? 2 : 4} id="s-sources" title={kind === "release" ? "Cover art & sources" : kind === "artist" ? "Photo & sources" : "Sources"}>
          {(kind === "release" || kind === "artist") && (
            <div className="mb-6">
              <label htmlFor="new-cover" className="field-label block pb-2 text-white/80">{kind === "artist" ? "Photo" : "Cover"} <span className="ml-1 text-[11px] normal-case tracking-normal text-white/45">Optional</span></label>
              <CoverLink id="new-cover" value={val("cover")} onChange={(x) => set("cover", x)} invalid={!!f.cover}
                placeholder={kind === "artist" ? "Link to a photo of the artist (https://…)" : "Link to the cover image (https://…)"} emptyHint="You can also add one later."
                className={`h-10 w-full rounded-[4px] border bg-[#0b0b0c] px-3 text-[14px] outline-none placeholder:text-white/35 focus:border-white/80 ${f.cover ? "border-[#eb544d]" : "border-white/30"}`} />
              {f.cover && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f.cover}</span>}
            </div>
          )}
          <label className="block">
            <span className="field-label block pb-2 text-white/80">Where did this information come from? <span className="ml-1 text-[11px] normal-case tracking-normal text-white/45">Required</span></span>
            <textarea value={val("sources")} onChange={(e) => set("sources", e.target.value)} rows={2} maxLength={2000} aria-invalid={!!f.sources}
              placeholder="Bandcamp page, label website, liner notes…"
              className={`w-full rounded-[4px] border bg-[#0b0b0c] px-3 py-2.5 text-[14px] outline-none placeholder:text-white/35 focus:border-white/80 ${f.sources ? "border-[#eb544d]" : "border-white/30"}`} />
            {f.sources && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{f.sources}</span>}
          </label>
        </Section>

        <div className="mt-12 rounded-[12px] border border-white/15 p-5 md:hidden">{preview}</div>
      </div>

      <aside className="hidden w-[330px] shrink-0 md:block">
        <div className="sticky top-[110px] rounded-[12px] border border-white/15 p-5">{preview}</div>
      </aside>
    </main>
  );
}

function Section({ n, id, title, done, children }: { n: number; id: string; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-[100px] md:mt-12">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-white/45">{n}</span>
        <h2 className="flex-1 text-[22px] font-semibold">{title}</h2>
        {done && <span className="text-[13px] text-teal">✓ Done</span>}
      </div>
      {children}
    </section>
  );
}
