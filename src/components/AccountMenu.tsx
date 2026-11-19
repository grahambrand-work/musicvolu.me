"use client";
// Desktop: your username and tier badge; click for the account menu.
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/auth/actions";

export default function AccountMenu({ username, badge, color }: { username: string; badge: string; color: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-5">
        <span className="font-mono text-[16px] text-white">{username}</span>
        <span className="rounded-full px-4 py-0.5 text-[14px] text-black" style={{ background: color }}>{badge}</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+12px)] right-0 z-40 w-52 overflow-hidden rounded-[10px] border border-white/15 bg-[#0d0d0e] text-[14px]">
          <form action={logout}>
            <button type="submit" className="block w-full px-4 py-3 text-left hover:bg-white/5">Log out</button>
          </form>
        </div>
      )}
    </div>
  );
}
