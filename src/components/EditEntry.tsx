"use client";
// Edit mode for an artist, release or song (Figma "Album · Melodrama · edit", "Artist · Lorde ·
// edit", "Song · Royals · edit" and the phone version). Changed fields get a teal outline and a
// "Was:" line; the "Your changes" panel lists every change and sends them for review together.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { reviseEdit, submitEdit, type SubmitResult } from "@/app/edit-actions";
import {
  CREDIT_ROLES, FIELDS, SUGGEST, countChanges, describeChanges, normalize,
  type Change, type CreditRow, type Kind, type ReleaseValues, type SongValues, type TrackRow, type Values,
} from "@/lib/edits";
import { parseTracklist } from "@/lib/newEntry";
import { PlusIcon } from "./icons";
import CoverLink from "./CoverLink";
import { Cover, Tag } from "./ui";

type Props = {
  kind: Kind; slug: string; name: string; tag: string; cover: string | null; round?: boolean;
  initial: Values; fixed: Record<string, string>;
  allowance: { limit: number | null; left: number | null };
  focus?: string;
  /** Changing a sent edit: the live values (initial holds what the edit suggests) and its number. */
  revise?: { number: number; base: Values; note: string; back: string };
  /** Read-only sections under the form (Discography, Appears on). */
  children?: ReactNode;
};

export const box = "rounded-[4px] border bg-[#0b0b0c] px-3 font-mono text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/80";
export const boxH = "h-[34px]";
export const border = (changed: boolean, err?: string) => (err ? "border-[#eb544d]" : changed ? "border-teal" : "border-white/25");

export default function EditEntry({ kind, slug, name, tag, cover, round, initial: suggested, fixed, allowance, focus, revise, children }: Props) {
  const initial = revise?.base ?? suggested;
  const [values, setValues] = useState<Values>(suggested);
  const [note, setNote] = useState(revise?.note ?? "");
  const [result, setResult] = useState<SubmitResult>();
  const [sheet, setSheet] = useState(false);
  const [busy, start] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  const before = useMemo(() => normalize(kind, initial), [kind, initial]);
  const changes = useMemo(() => describeChanges(kind, before, normalize(kind, values)), [kind, before, values]);
  const count = countChanges(changes);
  const changedKeys = new Set(changes.map((c) => c.key));
  const errors = result?.fields ?? {};
  const outOfEdits = allowance.left === 0;

  // Leaving with unsaved changes asks first.
  const dirty = count > 0 && !busy;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (key: string, v: unknown) => setValues((cur) => ({ ...cur, [key]: v }) as Values);
  const entryHref = revise?.back ?? `/${kind}/${slug}`;

  function submit() {
    setResult(undefined);
    start(async () => {
      const r = revise ? await reviseEdit(revise.number, values, note) : await submitEdit(kind, slug, values, note);
      if (r) setResult(r);
    });
  }

  function cancel(e: React.MouseEvent) {
    if (count > 0 && !window.confirm("Throw away your changes?")) e.preventDefault();
  }

  const nameOf = (c: Change) => c.label;
  const left = allowance.left == null ? "" : `${allowance.left} left this month`;

  const panel = (
    <>
      <h2 className="text-[18px] font-semibold">Your changes</h2>
      {count === 0 ? (
        <p className="mt-3 text-[14px] text-white/55">Change any field and it shows up here.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {changes.map((c) => (
            <li key={c.key}>
              <p className="field-label">{nameOf(c)}</p>
              <div className="mt-1 font-mono text-[13px] leading-[1.45] break-words">
                {c.was !== undefined && c.was !== "" && <p className="text-white/45 line-through">{c.was}</p>}
                {c.was === "" && c.now === "" ? null : c.now !== undefined && <p className="text-teal">{c.now || <span className="text-white/45">(empty)</span>}</p>}
                {c.added?.map((x) => <p key={`+${x}`} className="text-teal">+ {x}</p>)}
                {c.removed?.map((x) => <p key={`-${x}`} className="text-white/45 line-through">− {x}</p>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="my-5 border-t border-white/12" />
      <label htmlFor="edit-note" className="field-label block text-white/80">Note for editors</label>
      <textarea id="edit-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={3}
        placeholder="Why are you making these changes? Add sources."
        className="mt-3 min-h-[86px] w-full resize-y rounded-[6px] border border-white/30 bg-transparent px-3 py-2.5 text-[14px] leading-snug outline-none placeholder:text-white/40 focus:border-white/80" />
      <p className="mt-3 text-[13px] text-white/55">
        {revise ? <>Updates #{revise.number}. Doesn&rsquo;t count as a new edit.</> : outOfEdits ? `You've used all ${allowance.limit} edits this month. They reset on the 1st.` : <>Counts as 1 edit{left && ` · ${left}`}</>}
      </p>
      {result?.error && <p role="alert" className="mt-3 rounded-[6px] border border-[#eb544d]/60 bg-[#eb544d]/10 px-3 py-2 text-[13px] text-[#ffb3ad]">{result.error}</p>}
      <button type="button" onClick={submit} disabled={busy || count === 0 || outOfEdits}
        className="mt-4 rounded-full bg-white px-4 py-2 text-[14px] font-medium text-black hover:bg-white/85 disabled:opacity-50 max-md:w-full max-md:py-3 max-md:text-[16px]">
        {revise ? (busy ? "Saving…" : `Save ${count} change${count === 1 ? "" : "s"} to #${revise.number}`) : busy ? "Submitting…" : count === 0 ? "Submit for review" : `Submit ${count} change${count === 1 ? "" : "s"} for review`}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop: teal bar under the header. */}
      <div className="sticky top-[72px] z-20 hidden border-y border-teal/45 bg-[#0c1717] md:block">
        <div className="mx-auto flex h-[62px] max-w-[1440px] items-center gap-3 px-[60px]">
          <span className="size-2 rounded-full bg-teal" />
          <p className="text-[15px] font-medium">{revise ? <>You’re changing #{revise.number}, edits to {name}</> : <>You’re suggesting edits to {name}</>}</p>
          <p className="text-[15px] text-white/55">· {count === 0 ? "no changes yet" : `${count} change${count === 1 ? "" : "s"} so far`}</p>
          <Link href={entryHref} onClick={cancel} className="ml-auto rounded-full border border-white/50 px-4 py-[7px] text-[14px] hover:border-white">Cancel</Link>
          <button type="button" onClick={() => noteRef.current?.focus()} className="rounded-full bg-white px-4 py-[7px] text-[14px] font-medium text-black hover:bg-white/85">Review &amp; submit</button>
        </div>
      </div>

      {/* Phone: Cancel · Editing … · Done. */}
      <div className="sticky top-0 z-30 border-b border-teal/45 bg-[#0c1717] md:hidden">
        <div className="flex h-[48px] items-center gap-3 px-4">
          <Link href={entryHref} onClick={cancel} className="text-[15px] text-white/70">Cancel</Link>
          <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">Editing {name}</p>
          <button type="button" onClick={() => setSheet(true)} className="text-[15px] font-semibold">Done</button>
        </div>
      </div>

      <main className="mx-auto max-w-[1440px] px-4 pb-40 md:px-[60px] md:pb-24">
        <div className="flex flex-col gap-[60px] md:flex-row">
          <div className="min-w-0 flex-1">
            <div className="mt-9 hidden items-start gap-6 md:flex">
              <Cover src={cover} size={116} round={round} />
              <div className="min-w-0 pt-6">
                <Tag>{tag}</Tag>
                <h1 className="mt-2 font-mono text-[32px] leading-[1.1] font-bold break-words">{name}</h1>
              </div>
            </div>

            <h2 className="field-label mt-6 md:mt-12">Details</h2>
            <div className="mt-3 flex flex-col gap-4 md:gap-[14px]">
              {FIELDS[kind].map((f) => {
                const raw = f.type === "readonly" ? fixed[f.key] ?? "" : ((values as Record<string, string>)[f.key] ?? "");
                const was = (initial as Record<string, string>)[f.key] ?? "";
                const changed = changedKeys.has(f.key);
                const err = errors[f.key];
                const id = `f-${f.key}`;
                const wasLabel = f.options?.find((o) => o.value === was)?.label ?? was;
                return (
                  <div key={f.key} className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-4">
                    <label htmlFor={id} className="field-label shrink-0 md:w-[144px] md:pt-[9px]">{f.label}</label>
                    <div className="min-w-0 flex-1">
                      {f.type === "select" ? (
                        <Select id={id} value={raw} onChange={(v) => set(f.key, v)} options={f.options!} className={border(changed, err)} autoFocus={focus === f.key} />
                      ) : f.type === "image" ? (
                        <CoverLink id={id} value={raw === was ? "" : raw} onChange={(x) => set(f.key, x.trim() ? x : was)}
                          placeholder={f.placeholder} className={`${box} ${boxH} w-full ${border(changed, err)}`} autoFocus={focus === f.key} invalid={!!err} />
                      ) : f.type === "readonly" ? (
                        <div id={id} className={`${box} ${boxH} flex w-full items-center border-white/12 text-white/50`} title="Worked out from its releases">{raw || "—"}</div>
                      ) : (
                        <input id={id} value={raw} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                          list={f.suggest ? `list-${f.suggest}` : undefined} autoFocus={focus === f.key}
                          inputMode={f.type === "date" || f.type === "duration" ? "numeric" : undefined}
                          spellCheck={f.type === "text" || f.type === "list" ? undefined : false}
                          aria-invalid={!!err}
                          className={`${box} ${boxH} w-full ${border(changed, err)}`} />
                      )}
                      {err ? <p role="alert" className="mt-1 text-[12px] text-[#ff8a80]">{err}</p>
                        : changed && f.type !== "image" && <p className="mt-1 text-[12px] text-teal">{was ? `Was: ${wasLabel}` : "New"}</p>}
                      {f.type === "readonly" && <p className="mt-1 text-[12px] text-white/40">Worked out from the releases it appears on.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <datalist id="list-country">{SUGGEST.country.map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="list-language">{SUGGEST.language.map((x) => <option key={x} value={x} />)}</datalist>

            {kind === "release" && (
              <Tracklist rows={(values as ReleaseValues).tracks} initial={(initial as ReleaseValues).tracks} errors={errors}
                onChange={(rows) => set("tracks", rows)} newId={() => `n:${++seq.current}`} />
            )}
            {kind === "song" && (
              <Credits rows={(values as SongValues).credits} initial={(initial as SongValues).credits} errors={errors}
                onChange={(rows) => set("credits", rows)} newId={() => `n:${++seq.current}`} />
            )}
            {children && <div className="mt-12">{children}</div>}
          </div>

          <aside className="hidden w-[330px] shrink-0 md:block">
            <div className="sticky top-[170px] mt-9 rounded-[12px] border border-white/15 px-5 py-6">{panel}</div>
          </aside>
        </div>
      </main>

      {/* Phone: bar at the bottom, and the review sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/12 bg-[#121213] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] md:hidden">
        <div className="flex items-baseline justify-between text-[14px]">
          <span className="font-semibold">{count === 0 ? "No changes yet" : `${count} change${count === 1 ? "" : "s"}`}</span>
          {allowance.left != null && <span className="text-white/55">{allowance.left} edit{allowance.left === 1 ? "" : "s"} left this month</span>}
        </div>
        <button type="button" onClick={() => setSheet(true)} className="mt-3 h-12 w-full rounded-full bg-white text-[16px] font-medium text-black">Review &amp; submit</button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/70 md:hidden" onClick={() => setSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label="Review your changes" onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full animate-[sheet-up_.2s_ease-out] overflow-y-auto rounded-t-[14px] border-t border-white/15 bg-[#161617] px-5 pt-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="mb-3 flex justify-end"><button type="button" onClick={() => setSheet(false)} className="text-[14px] text-white/60">Keep editing</button></div>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}

export function Select({ id, value, onChange, options, className, autoFocus }: {
  id?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className: string; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        className={`${box} ${boxH} w-full appearance-none pr-9 ${className}`}>
        {!options.some((o) => o.value === value) && <option value={value}>{value || "Choose…"}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Chevron className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" />
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className={className}>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Grip() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
      {[0, 1].flatMap((x) => [0, 1, 2].map((y) => <circle key={`${x}${y}`} cx={1.5 + x * 5} cy={1.5 + y * 4.5} r="1.2" />))}
    </svg>
  );
}

/** Tracks: rename, change length, drag (or arrow keys on the handle) to reorder, remove, add. */
export function Tracklist({ rows, initial, errors, onChange, newId, plain = false, paste = false, heading = true }: {
  rows: TrackRow[]; initial: TrackRow[]; errors: Record<string, string>; onChange: (rows: TrackRow[]) => void; newId: () => string;
  /** New entries: no teal "changed" outlines. */
  plain?: boolean;
  /** Offer "or paste a whole tracklist". */
  paste?: boolean;
  heading?: boolean;
}) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const old = useMemo(() => new Map(initial.map((t) => [t.id, t])), [initial]);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const added = useRef<string | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = rows.slice();
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    onChange(next);
  };
  const update = (i: number, patch: Partial<TrackRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  useEffect(() => {
    if (!added.current) return;
    document.getElementById(`t-${added.current}`)?.focus();
    added.current = null;
  }, [rows.length]);

  return (
    <section className={heading ? "mt-12" : ""}>
      <div className="flex items-baseline justify-between pb-3">
        {heading ? <h2 className="field-label">Tracklist · {rows.length}</h2> : <span />}
        {rows.length > 1 && <span className="text-[13px] text-white/50">Drag to reorder</span>}
      </div>
      {errors.tracks && <p role="alert" className="pb-2 text-[12px] text-[#ff8a80]">{errors.tracks}</p>}
      <ol className="flex flex-col gap-1.5">
        {rows.map((t, i) => {
          const o = old.get(t.id);
          const titleChanged = !plain && (!o || o.title !== t.title.trim());
          const lenChanged = !plain && (!o || o.duration !== t.duration.trim());
          const err = errors[`track:${t.id}`];
          return (
            <li key={t.id} ref={(el) => { refs.current[i] = el; }} className={drag === i ? "opacity-70" : undefined}>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={`Move track ${i + 1}. Use the arrow keys.`}
                  className="grid h-[34px] w-4 shrink-0 cursor-grab touch-none place-items-center text-white/40 hover:text-white active:cursor-grabbing"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(i, i + (e.key === "ArrowUp" ? -1 : 1));
                      requestAnimationFrame(() => (refs.current[i + (e.key === "ArrowUp" ? -1 : 1)]?.querySelector("button") as HTMLButtonElement | null)?.focus());
                    }
                  }}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(i); }}
                  onPointerMove={(e) => {
                    if (drag === null) return;
                    const y = e.clientY;
                    let to = drag;
                    refs.current.forEach((el, j) => {
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      if (y > r.top && y < r.bottom) to = j;
                    });
                    if (to !== drag) { move(drag, to); setDrag(to); }
                  }}
                  onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
                  <Grip />
                </button>
                <span className="w-6 shrink-0 text-center font-mono text-[12px] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                <input id={`t-${t.id}`} value={t.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Track ${i + 1} title`}
                  placeholder="Track title" className={`${box} ${boxH} w-0 min-w-0 flex-1 ${border(titleChanged, err)}`} />
                <input value={t.duration} onChange={(e) => update(i, { duration: e.target.value })} aria-label={`Track ${i + 1} length`}
                  placeholder="0:00" inputMode="numeric" spellCheck={false}
                  className={`${box} ${boxH} w-16 shrink-0 text-center md:w-20 ${border(lenChanged, err)}`} />
                <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove track ${i + 1}`}
                  className="grid size-6 shrink-0 place-items-center text-white/50 hover:text-white"><XIcon /></button>
              </div>
              {err && <p role="alert" className="mt-1 pl-[58px] text-[12px] text-[#ff8a80]">{err}</p>}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex h-[38px] w-full items-center gap-2 rounded-[6px] border border-dashed border-white/25 px-3.5 text-[14px] hover:border-white/60">
        <button type="button" className="flex items-center gap-2" onClick={() => { const id = newId(); added.current = id; onChange([...rows, { id, title: "", duration: "" }]); }}>
          <PlusIcon /> Add a track
        </button>
        {paste && <><span className="text-white/40">·</span><button type="button" onClick={() => setPasting((x) => !x)} className="text-white/70 hover:text-white">or paste a whole tracklist</button></>}
      </div>
      {pasting && (
        <div className="mt-2 rounded-[6px] border border-white/20 p-3">
          <label htmlFor="paste-tracks" className="text-[13px] text-white/70">One track per line. Numbers and lengths like “3:41” are picked up.</label>
          <textarea id="paste-tracks" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} autoFocus
            placeholder={"1. Undertow 3:41\n2. Low Tide Letters 4:05"}
            className="mt-2 w-full rounded-[4px] border border-white/25 bg-[#0b0b0c] px-3 py-2 font-mono text-[14px] outline-none focus:border-white/80" />
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-full bg-white px-3.5 py-1.5 text-[14px] font-medium text-black disabled:opacity-50" disabled={!pasted.trim()}
              onClick={() => {
                const found = parseTracklist(pasted);
                onChange([...rows.filter((r) => r.title.trim() || r.duration.trim()), ...found.map((t) => ({ id: newId(), ...t }))]);
                setPasted(""); setPasting(false);
              }}>Add these tracks</button>
            <button type="button" onClick={() => setPasting(false)} className="rounded-full border border-white/40 px-3.5 py-1.5 text-[14px]">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Song credits: role + name rows. */
export function Credits({ rows, initial, errors, onChange, newId, plain = false }: {
  rows: CreditRow[]; initial: CreditRow[]; errors: Record<string, string>; onChange: (rows: CreditRow[]) => void; newId: () => string;
  plain?: boolean;
}) {
  const old = useMemo(() => new Map(initial.map((c) => [c.id, c])), [initial]);
  const update = (i: number, patch: Partial<CreditRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="mt-12">
      <h2 className="field-label pb-3">Credits</h2>
      {errors.credits && <p role="alert" className="pb-2 text-[12px] text-[#ff8a80]">{errors.credits}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((c, i) => {
          const o = old.get(c.id);
          const changed = !plain && (!o || o.role !== c.role || o.name !== c.name.trim());
          const err = errors[`credit:${c.id}`];
          return (
            <li key={c.id}>
              <div className="flex items-center gap-2">
                <div className="w-[130px] shrink-0 md:w-[166px]">
                  <Select value={c.role} onChange={(v) => update(i, { role: v })} options={CREDIT_ROLES.map((r) => ({ value: r, label: r }))}
                    className={border(changed, err)} />
                </div>
                <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Credit ${i + 1} name`} placeholder="Name"
                  className={`${box} ${boxH} w-0 min-w-0 flex-1 ${border(changed, err)}`} />
                <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove credit ${i + 1}`}
                  className="grid size-6 shrink-0 place-items-center text-white/50 hover:text-white"><XIcon /></button>
              </div>
              {err ? <p role="alert" className="mt-1 text-[12px] text-[#ff8a80]">{err}</p> : !o && !plain && <p className="mt-1 pl-[138px] text-[12px] text-teal md:pl-[174px]">New</p>}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => onChange([...rows, { id: newId(), role: "Songwriter", name: "" }])}
        className="mt-2 flex h-[38px] w-full items-center gap-2 rounded-[6px] border border-dashed border-white/25 px-3.5 text-[14px] hover:border-white/60">
        <PlusIcon /> Add a credit
      </button>
    </section>
  );
}
