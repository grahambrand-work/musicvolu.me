"use client";
// Role dropdown on the Members page (Figma 93:1098). Picking a new role asks "are you sure?"
// first (Graham, 2026-11-22); only "Change role" saves it.
import { useEffect, useRef, useState, useTransition } from "react";
import { setRole } from "@/app/members/actions";

type Option = { key: string; label: string };

export default function RoleSelect({ memberId, username, value, options, disabled = false }: { memberId: string; username: string; value: string; options: Option[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open && !asking) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setAsking(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setAsking(null); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, asking]);

  const pick = (key: string) => {
    setOpen(false);
    setAsking(key === current ? null : key);
  };

  const save = (key: string) => {
    setAsking(null);
    const before = current;
    setCurrent(key);
    setError(null);
    start(async () => {
      const r = await setRole(memberId, key);
      if (r && "error" in r) { setCurrent(before); setError(r.error); }
    });
  };

  const label = options.find((o) => o.key === current)?.label ?? current;
  return (
    <div ref={box} className="relative w-fit">
      <button type="button" disabled={disabled || pending} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        title={disabled ? "You can't change your own role" : undefined}
        className="inline-flex h-8 items-center gap-2.5 rounded-[4px] border border-white/40 bg-black pr-2.5 pl-3 text-[13px] whitespace-nowrap enabled:hover:border-white disabled:cursor-default disabled:border-white/20 disabled:text-white/60">
        {label}
        {!disabled && <span aria-hidden className="text-[9px] text-white/60">▾</span>}
      </button>
      {open && (
        <ul role="listbox" className="absolute top-[calc(100%+6px)] right-0 z-40 w-[184px] rounded-[8px] border border-white/15 bg-[#141415] p-1 shadow-[0_12px_32px_rgb(0_0_0/.6)] md:right-auto md:left-0">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === current}>
              <button type="button" onClick={() => pick(o.key)}
                className={`flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-left text-[13px] hover:bg-white/8 ${o.key === current ? "bg-white/10" : ""}`}>
                <span className="w-3 text-[12px]">{o.key === current ? "✓" : ""}</span>{o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <div role="alertdialog" aria-label="Confirm role change"
          className="absolute top-[calc(100%+6px)] right-0 z-40 w-[260px] rounded-[8px] border border-white/15 bg-[#141415] p-3.5 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/.6)] md:right-auto md:left-0">
          <p>Change <span className="font-mono">{username}</span> from {label} to {options.find((o) => o.key === asking)?.label ?? asking}?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" autoFocus onClick={() => save(asking)} className="rounded-full bg-white px-3.5 py-1 text-black hover:bg-white/85">Change role</button>
            <button type="button" onClick={() => setAsking(null)} className="rounded-full border border-white/40 px-3.5 py-1 hover:border-white">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="mt-1.5 max-w-[240px] text-[12px] text-[#eb544d]">{error}</p>}
    </div>
  );
}
