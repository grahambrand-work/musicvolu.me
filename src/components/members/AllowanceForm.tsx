"use client";
// "Edit allowance by tier" panel on the Members page (Figma 93:1098).
import { useActionState } from "react";
import { saveAllowances, type ActionResult } from "@/app/members/actions";

type Row = { tier: 1 | 2 | 3; label: string; hint: string; now: number; next?: number };

export default function AllowanceForm({ rows, starts, last }: { rows: Row[]; starts: string; last: string | null }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveAllowances, undefined);
  return (
    <form action={action} id="allowances" className="scroll-mt-28 rounded-[8px] border border-white/20 p-5 md:p-6">
      <h2 className="text-[17px] font-medium">Edit allowance by tier</h2>
      <ul className="mt-4">
        {rows.map((r) => (
          <li key={r.tier} className="border-b border-white/12 py-4 first:pt-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`tier${r.tier}`} className="text-[14px]">{r.label}</label>
              <span className="flex items-center gap-2 text-[13px] text-white/60">
                <input id={`tier${r.tier}`} name={`tier${r.tier}`} type="number" min={1} max={10000} required defaultValue={r.next ?? r.now}
                  className="h-8 w-[52px] rounded-[4px] border border-white/40 bg-black text-center font-mono text-[14px] text-white [appearance:textfield] focus:border-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none" />
                / month
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-white/55">{r.hint}{r.next != null && <span className="text-[#f5b84d]"> · {r.now} until {starts}</span>}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] leading-relaxed text-white/55">
        Editors and admins have no edit limit. Changes here apply from the next month and are logged.{last && <> {last}</>}
      </p>
      <button type="submit" disabled={pending} className="mt-4 h-9 rounded-full bg-white px-4 text-[14px] font-medium text-black hover:bg-white/85 disabled:opacity-60">
        {pending ? "Saving…" : "Save allowances"}
      </button>
      {state && <p role="status" className={`mt-3 text-[13px] ${"error" in state ? "text-[#eb544d]" : "text-[#7ad98f]"}`}>{"error" in state ? state.error : state.ok}</p>}
    </form>
  );
}
