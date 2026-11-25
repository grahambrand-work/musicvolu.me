"use client";
// Band members as tags, like genres (Graham, 2026-11-24). Typing searches the catalog's artists:
// picking one links the member to their own artist page (and shows its photo); anything else
// can be added as a plain name. Drag a tag (or use the arrow keys on it) to change the order,
// which is the order musicvolu.me and Noteworthy list the members in. Clicking a tag opens its
// Role box underneath ("vocals, guitar").
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { findArtistsAction } from "@/app/contribute/actions";
import { MEMBER_ROLES, memberKey, type MemberRow } from "@/lib/edits";
import type { ArtistChoice } from "@/lib/submissions";
import { Cover } from "./ui";

export default function MemberTags({ id, value, initial, onChange, className, invalid }: {
  id?: string; value: MemberRow[]; initial: MemberRow[]; onChange: (v: MemberRow[]) => void; className: string; invalid?: boolean;
}) {
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ q: string; list: ArtistChoice[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const moved = useRef(false);
  const [, start] = useTransition();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  const seq = useRef(0);
  const old = new Set(initial.map(memberKey));
  const oldRole = new Map(initial.map((m) => [memberKey(m), m.role]));
  const plain = className.split(" ").filter((c) => !c.startsWith("border-")).join(" ");
  const editIndex = editing ? value.findIndex((m) => memberKey(m) === editing) : -1;
  const taken = new Set(value.map(memberKey));

  useEffect(() => {
    const t = text.trim();
    if (!t) return;
    const n = ++seq.current;
    const timer = setTimeout(() => start(async () => {
      const list = await findArtistsAction(t);
      if (n === seq.current) setFound({ q: t, list });
    }), 180);
    return () => clearTimeout(timer);
  }, [text]);

  const q = text.trim();
  const matches = q && found?.q === q ? found.list.filter((a) => a.id && !taken.has(`a:${a.id}`)) : [];
  const options = q ? matches.length + (taken.has(`n:${q.toLowerCase()}`) ? 0 : 1) : 0;

  const add = (m: MemberRow) => {
    if (!taken.has(memberKey(m))) onChange([...value, m]);
    setText(""); setActive(0); setFound(null);
    input.current?.focus();
  };
  const pickActive = () => {
    const a = matches[active];
    if (a) add({ name: a.name, role: "", artistId: a.id!, slug: "", image: a.image ?? "" });
    else if (q && !taken.has(`n:${q.toLowerCase()}`)) add({ name: q.replace(/\s+/g, " "), role: "", artistId: "", slug: "", image: "" });
  };
  const remove = (i: number) => onChange(value.filter((_, n) => n !== i));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = value.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % options); }
    else if (e.key === "ArrowUp" && options) { e.preventDefault(); setActive((a) => (a - 1 + options) % options); }
    else if (e.key === "Enter") { if (q) { e.preventDefault(); pickActive(); } }
    else if (e.key === "Backspace" && !text && value.length) remove(value.length - 1);
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative">
      <div onClick={() => input.current?.focus()}
        className={`${className} flex min-h-[34px] w-full cursor-text flex-wrap items-center gap-1.5 py-1 ${invalid ? "border-[#eb544d]" : ""}`}>
        {value.map((m, i) => {
          const isNew = !old.has(memberKey(m));
          const roleChanged = !isNew && oldRole.get(memberKey(m)) !== m.role.trim();
          const isEditing = editing === memberKey(m);
          return (
            <span key={memberKey(m)} ref={(el) => { chips.current[i] = el; }} tabIndex={0} role="button"
              aria-label={`${m.name}, member ${i + 1} of ${value.length}. Drag, or use the left and right arrow keys, to move.`}
              onClick={(e) => {
                e.stopPropagation();
                if (moved.current) return;
                setEditing((cur) => (cur === memberKey(m) ? null : memberKey(m)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(memberKey(m)); return; }
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const to = i + (e.key === "ArrowLeft" ? -1 : 1);
                move(i, to);
                requestAnimationFrame(() => chips.current[to]?.focus());
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                e.currentTarget.setPointerCapture(e.pointerId); setDrag(i); moved.current = false;
              }}
              onPointerMove={(e) => {
                if (drag === null) return;
                const to = chips.current.findIndex((el) => {
                  if (!el) return false;
                  const r = el.getBoundingClientRect();
                  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
                });
                if (to >= 0 && to !== drag) { move(drag, to); setDrag(to); moved.current = true; }
              }}
              onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
              className={`inline-flex cursor-grab touch-none items-center gap-1.5 rounded-full border py-0.5 pr-1 font-sans text-[13px] select-none active:cursor-grabbing ${m.image ? "pl-0.5" : "pl-2.5"} ${isNew || roleChanged ? "border-teal/70 bg-teal/10" : isEditing ? "border-white/60 bg-white/12" : "border-transparent bg-white/12"} ${drag === i ? "opacity-60" : ""}`}>
              {m.image && <Cover src={m.image} size={20} round />}
              {m.name}
              {m.role && <span className="text-white/50">{m.role}</span>}
              {isNew && <span className="rounded-full border border-teal/60 px-1.5 text-[10px] text-teal">new</span>}
              <button type="button" aria-label={`Remove ${m.name}`} onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="grid size-4 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className="block">
                  <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          );
        })}
        <input ref={input} id={id} value={text} autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open && options > 0} aria-controls={listId} aria-autocomplete="list"
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKey} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={value.length ? "" : "Start typing a name"}
          className="min-w-[10ch] flex-1 bg-transparent font-mono text-[14px] outline-none placeholder:text-white/30" />
      </div>
      {editIndex >= 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <label htmlFor="member-role" className="shrink-0 text-[13px] text-white/70">Role · {value[editIndex].name}</label>
          <input id="member-role" autoFocus value={value[editIndex].role} list="member-roles" maxLength={60} autoComplete="off"
            placeholder="e.g. vocals, guitar"
            onChange={(e) => onChange(value.map((x, n) => (n === editIndex ? { ...x, role: e.target.value } : x)))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditing(null); } }}
            className={`${plain} h-[30px] min-w-0 flex-1 ${oldRole.has(editing!) && oldRole.get(editing!) !== value[editIndex].role.trim() ? "border-teal" : "border-white/25"}`} />
          <button type="button" onClick={() => setEditing(null)} className="shrink-0 text-[13px] text-white/60 hover:text-white">Done</button>
          {oldRole.has(editing!) && oldRole.get(editing!) && oldRole.get(editing!) !== value[editIndex].role.trim() && (
            <span className="hidden shrink-0 text-[12px] text-teal md:inline">Was: {oldRole.get(editing!)}</span>
          )}
        </div>
      )}
      <datalist id="member-roles">{MEMBER_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
      {open && q && (
        <ul id={listId} role="listbox" className="absolute top-[calc(100%+4px)] left-0 z-40 w-full overflow-hidden rounded-[6px] border border-white/15 bg-[#141415] py-1 text-[14px] shadow-[0_12px_32px_rgb(0_0_0/.6)]">
          {matches.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); setActive(i); add({ name: a.name, role: "", artistId: a.id!, slug: "", image: a.image ?? "" }); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${i === active ? "bg-white/10" : ""}`}>
              <Cover src={a.image} size={24} round />
              <span className="min-w-0 truncate">{a.name}{a.detail && <span className="ml-2 text-[12px] text-white/50">{a.detail}</span>}</span>
            </li>
          ))}
          {!taken.has(`n:${q.toLowerCase()}`) && (
            <li role="option" aria-selected={active === matches.length}
              onMouseDown={(e) => { e.preventDefault(); add({ name: q.replace(/\s+/g, " "), role: "", artistId: "", slug: "", image: "" }); }}
              onMouseEnter={() => setActive(matches.length)}
              className={`cursor-pointer border-t border-white/10 px-3 py-1.5 text-white/60 ${active === matches.length ? "bg-white/10" : ""}`}>
              Add “{q}” without an artist page
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
