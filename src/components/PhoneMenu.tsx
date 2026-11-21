"use client";
// The ☰ menu (phones, and Home on desktop).
import Link from "next/link";
import { useState } from "react";
import { logout } from "@/lib/auth/actions";
import { MenuIcon } from "./icons";

export default function PhoneMenu({ signedIn, review = false }: { signedIn: boolean; review?: boolean }) {
  const [open, setOpen] = useState(false);
  const links = signedIn
    ? [...(review ? [["Review board", "/review"]] : []), ["Contribute", "/contribute"], ["Activity log", "/activity"], ["About", "/about"], ["Help", "/help"]]
    : [["Log in", "/login"], ["Create account", "/signup"], ["About", "/about"], ["Help", "/help"]];
  return (
    <>
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><MenuIcon /></button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <nav className="absolute top-[88px] right-4 w-56 md:top-[80px] md:right-[60px] overflow-hidden rounded-[10px] border border-white/15 bg-[#0d0d0e]" onClick={(e) => e.stopPropagation()}>
            {links.map(([label, href]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="block border-b border-white/8 px-4 py-3 text-[15px] last:border-0 hover:bg-white/5">{label}</Link>
            ))}
            {signedIn && (
              <form action={logout}>
                <button type="submit" className="block w-full px-4 py-3 text-left text-[15px] hover:bg-white/5">Log out</button>
              </form>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
