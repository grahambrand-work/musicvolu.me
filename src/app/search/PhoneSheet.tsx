"use client";
// Phone: the preview slides up from the bottom over the results. Tap outside or swipe the
// handle down (or press Escape) to close.
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export default function PhoneSheet({ closeHref, children }: { closeHref: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const mq = window.matchMedia("(width < 48rem)");
    if (mq.matches) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.replace(closeHref, { scroll: false }); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [closeHref, router]);
  const close = () => router.replace(closeHref, { scroll: false });
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label="Close preview" onClick={close} className="absolute inset-0 bg-black/60" />
      <div role="dialog" aria-modal="true"
        className="absolute inset-x-0 bottom-0 top-[150px] overflow-y-auto overscroll-contain rounded-t-[16px] border-t border-white/15 bg-[#121213] px-5 pb-10 animate-[sheet-up_220ms_ease-out]">
        <button type="button" onClick={close} aria-label="Close preview" className="sticky top-0 z-10 -mx-5 flex w-[calc(100%+40px)] justify-center bg-[#121213] pt-2.5 pb-4">
          <span className="h-1 w-10 rounded-full bg-white/30" />
        </button>
        {children}
      </div>
    </div>
  );
}
