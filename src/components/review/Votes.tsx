"use client";
// Thumbs up / down with counts (Figma "Vote buttons"). Clicking your own choice again takes it back.
// People who can't vote see the counts only.
import { useState, useTransition } from "react";
import { vote } from "@/app/review/actions";
import { ThumbDownIcon, ThumbUpIcon } from "../icons";

export default function Votes({ target, id, up, down, mine, canVote, big = false }: {
  target: "submission" | "comment"; id: string; up: number; down: number; mine: number; canVote: boolean; big?: boolean;
}) {
  const [state, setState] = useState({ up, down, mine });
  const [, start] = useTransition();
  const press = (value: 1 | -1) => {
    const next = state.mine === value ? 0 : value;
    setState((s) => ({
      up: s.up - (s.mine === 1 ? 1 : 0) + (next === 1 ? 1 : 0),
      down: s.down - (s.mine === -1 ? 1 : 0) + (next === -1 ? 1 : 0),
      mine: next,
    }));
    start(async () => {
      const r = await vote(target, id, next as -1 | 0 | 1);
      if (r?.error) setState({ up, down, mine }); // put it back
    });
  };
  const btn = (value: 1 | -1, n: number, Icon: typeof ThumbUpIcon, label: string) => {
    const on = state.mine === value;
    const cls = big
      ? `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] ${on ? "border-white bg-white text-black" : "border-white/50 hover:bg-white/10"}`
      : `inline-flex items-center gap-1.5 text-[13px] ${on ? "text-white" : "text-white/70"} ${canVote ? "hover:text-white" : ""}`;
    const inner = <><Icon size={big ? 15 : 14} />{big ? label : n}</>;
    return canVote
      ? <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); press(value); }} aria-pressed={on} aria-label={`${label} (${n})`} className={cls}>{inner}</button>
      : <span className={cls} aria-label={`${n} ${label.toLowerCase()}s`}>{inner}</span>;
  };
  return (
    <span className={`inline-flex items-center ${big ? "gap-2.5" : "gap-3"}`}>
      {btn(1, state.up, ThumbUpIcon, "Like")}
      {btn(-1, state.down, ThumbDownIcon, "Dislike")}
    </span>
  );
}
