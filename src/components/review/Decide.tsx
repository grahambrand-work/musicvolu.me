"use client";
// The buttons at the bottom of an opened card: Reject / Ask for changes / Send to final review,
// or in final review Reject / Send back to editors / Publish. Which ones show depends on who is looking.
import { useState, useTransition } from "react";
import { moveSubmission } from "@/app/review/actions";

type Move = Parameters<typeof moveSubmission>[1];
export type Button = { move: Move | "publish"; label: string; style: "danger" | "outline" | "primary"; disabled?: boolean; title?: string };

export default function Decide({ number, buttons, note, locked }: { number: number; buttons: Button[]; note?: string; locked?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const go = (b: Button) => {
    if (b.move === "publish") return;
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
      {err && <p role="alert" className="mt-3 text-[13px] text-[#ff8a80]">{err}</p>}
    </div>
  );
}
