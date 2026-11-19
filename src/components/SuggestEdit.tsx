"use client";
// "Suggest edit(s)". Signed in: goes to edit mode. Signed out: a small dialog asks them to
// create an account or log in first (Figma "P7 · Suggest edit when signed out").
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export default function SuggestEdit({ href, signedIn, className, children }: { href: string; signedIn: boolean; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (signedIn) return <Link href={href} className={className}>{children}</Link>;
  const next = encodeURIComponent(href);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 md:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="suggest-title" onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[14px] border border-white/15 bg-[#161617] px-6 pt-6 pb-8 md:max-w-[430px] md:rounded-[12px] md:pb-5">
            <h2 id="suggest-title" className="text-[20px] font-semibold leading-snug">Create an account to suggest edits</h2>
            <p className="mt-2.5 text-[14px] leading-snug text-white/65">
              Anyone can browse musicvolu.me. To suggest a change or add music you need a free account, and an editor checks every edit.
            </p>
            <div className="mt-5 flex gap-2.5">
              <Link href={`/signup?next=${next}`} className="flex-1 rounded-full bg-white py-2.5 text-center text-[14px] font-medium text-black">Create account</Link>
              <Link href={`/login?next=${next}`} className="flex-1 rounded-full border border-white/70 py-2.5 text-center text-[14px]">Log in</Link>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mt-4 w-full text-center text-[13px] text-white/60 hover:text-white">Not now</button>
          </div>
        </div>
      )}
    </>
  );
}
