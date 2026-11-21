"use client";
// The buttons at the bottom of an opened card: Reject / Ask for changes / Send to final review,
// or in final review Reject / Send back to editors / Publish. Which ones show depends on who is looking.
import { useState, useTransition } from "react";
import Link from "next/link";
import { moveSubmission, prepareCover, publishSubmission } from "@/app/review/actions";

type Move = Parameters<typeof moveSubmission>[1];
export type Button = { move: Move | "publish"; label: string; style: "danger" | "outline" | "primary"; disabled?: boolean; title?: string };

export default function Decide({ number, buttons, note, locked, cover = false }: { number: number; buttons: Button[]; note?: string; locked?: string; cover?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [live, setLive] = useState<string | null>(null);
  // A linked cover is fetched and saved first, then shown, and only that copy is published.
  const [ready, setReady] = useState<{ small: string; sha: string; width: number; height: number } | null>(null);
  const publish = (sha?: string) => start(async () => {
    const r = await publishSubmission(number, sha);
    if (r && "error" in r) setErr(r.error); else if (r) { setLive(r.href); setReady(null); }
  });
  const go = (b: Button) => {
    if (b.move === "publish" && cover) {
      setErr(null);
      return start(async () => {
        const r = await prepareCover(number);
        if ("error" in r) setErr(r.error); else setReady(r);
      });
    }
    if (b.move === "publish") {
      if (!confirm("Publish this? It goes live in the catalog straight away, logged under your name.")) return;
      setErr(null);
      return start(async () => {
        const r = await publishSubmission(number);
        if (r && "error" in r) setErr(r.error); else if (r) setLive(r.href);
      });
    }
    if (b.move === "reject" && !confirm("Reject this submission? It leaves the board, and the person who sent it sees it was rejected.")) return;
    setErr(null);
    start(async () => {
      const r = await moveSubmission(number, b.move as Move);
      if (r?.error) setErr(r.error);
    });
  };
  const cls = (s: Button["style"]) => ({
    danger: "border border-[#eb544d] text-[#ff8a80] hover:bg-[#eb544d]/10",
    outline: "border border-white/60 hover:bg-white/10",
    primary: "bg-white font-medium text-black hover:bg-white/85",
  })[s];
  const left = buttons.filter((b) => b.style !== "primary"), right = buttons.filter((b) => b.style === "primary");
  const btn = (b: Button) => (
    <button key={b.move} type="button" disabled={busy || b.disabled || !!locked} title={b.title} onClick={() => go(b)}
      className={`rounded-full px-4 py-2 text-[15px] disabled:opacity-40 max-md:flex-1 ${cls(b.style)}`}>{b.label}</button>
  );
  return (
    <div className="border-t border-rule pt-6">
      {locked && <p className="mb-4 rounded-[6px] bg-[#eb544d]/10 px-3.5 py-2.5 text-[13px] text-white/80">🔒 {locked}</p>}
      <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center">
        <div className="flex gap-2.5">{left.map(btn)}</div>
        <div className="flex flex-col items-stretch gap-3 md:ml-auto md:flex-row md:items-center">
          {note && <span className="text-[12px] text-white/50 max-md:order-2 max-md:text-center">{note}</span>}
          {right.map(btn)}
        </div>
      </div>
      {ready && !live && (
        <div className="mt-5 flex flex-col gap-4 rounded-[8px] border border-white/20 p-4 md:flex-row md:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ready.small} alt="The cover that will be published" width={120} height={120} className="size-[120px] rounded-[2px] object-cover" />
          <div className="flex-1 text-[14px]">
            <p className="font-medium">This is the cover that will be published.</p>
            <p className="mt-1 text-[13px] text-white/60">Saved on musicvolu.me from the link ({ready.width} × {ready.height}). If it isn&rsquo;t the picture you reviewed, cancel and send it back.</p>
          </div>
          <div className="flex gap-2.5">
            <button type="button" disabled={busy} onClick={() => setReady(null)} className="rounded-full border border-white/60 px-4 py-2 text-[15px] hover:bg-white/10 disabled:opacity-40">Cancel</button>
            <button type="button" disabled={busy} onClick={() => publish(ready.sha)} className="rounded-full bg-white px-4 py-2 text-[15px] font-medium text-black hover:bg-white/85 disabled:opacity-40">Publish</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-[13px] text-[#ff8a80]">{err}</p>}
      {live && <p role="status" className="mt-3 text-[14px] text-[#7ad98f]">Published. <Link href={live} className="underline">See it live</Link></p>}
    </div>
  );
}
