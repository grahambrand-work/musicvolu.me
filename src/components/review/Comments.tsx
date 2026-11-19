"use client";
// Comments on one field, or on the whole submission ("Discussion"). Editors write; "Reply"
// starts the box with @name so the other editor gets tagged. @names show in their colour.
import { useRef, useState, useTransition } from "react";
import { addComment } from "@/app/review/actions";
import type { Comment } from "@/lib/review";
import { roleLabel, tierColor } from "@/lib/roles";
import Votes from "./Votes";

export type People = Record<string, string>; // username -> colour

export function Body({ text, people }: { text: string; people: People }) {
  return (
    <>
      {text.split(/(@[a-z0-9][a-z0-9._-]*[a-z0-9])/gi).map((part, i) =>
        part.startsWith("@") ? <span key={i} className="font-mono" style={{ color: people[part.slice(1).toLowerCase()] ?? "#5cc7bd" }}>{part}</span> : part,
      )}
    </>
  );
}

export default function Comments({ number, field, comments, people, canComment, canVote, ago, placeholder, boxed = false }: {
  number: number; field: string | null; comments: Comment[]; people: People; canComment: boolean; canVote: boolean;
  ago: Record<string, string>; placeholder: string; boxed?: boolean;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    setErr(null);
    start(async () => {
      const r = await addComment(number, field, text);
      if (r?.error) setErr(r.error); else setText("");
    });
  };
  return (
    <div className="flex flex-col gap-5">
      {comments.map((c) => (
        <div key={c.id}>
          <p className="flex items-baseline gap-2 text-[12px] text-white/50">
            <span className="font-mono text-[14px] font-bold" style={{ color: tierColor(c.author) }}>{c.author.username}</span>
            {roleLabel(c.author).replace("Editor", "editor").replace("Contributor", "contributor")} <span>{ago[c.id]}</span>
          </p>
          <p className="mt-1.5 text-[15px] leading-[1.45] break-words whitespace-pre-line"><Body text={c.body} people={people} /></p>
          <div className="mt-2 flex items-center gap-4 text-[13px]">
            <Votes target="comment" id={c.id} up={c.up} down={c.down} mine={c.myVote} canVote={canVote} />
            {canComment && (
              <button type="button" className="text-white/70 hover:text-white" onClick={() => { setText((t) => (t.includes(`@${c.author.username}`) ? t : `@${c.author.username} ${t}`)); box.current?.focus(); }}>Reply</button>
            )}
          </div>
        </div>
      ))}
      {canComment && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(); }}
          className={boxed ? "rounded-[6px] border border-white/40 p-3.5 focus-within:border-white" : ""}>
          <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={boxed ? 2 : 1} maxLength={4000} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) send(); }}
            className={`w-full resize-none bg-transparent text-[15px] placeholder:text-white/45 focus:outline-none ${boxed ? "" : "rounded-[6px] border border-white/30 px-3.5 py-2.5 focus:border-white"}`} />
          {(boxed || text.trim()) && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-white/45">Type @ to tag an editor</span>
              <button type="submit" disabled={busy || !text.trim()} className="rounded-full bg-white px-4 py-1.5 text-[14px] font-medium text-black disabled:opacity-50">{busy ? "Sending…" : "Comment"}</button>
            </div>
          )}
          {err && <p role="alert" className="mt-2 text-[13px] text-[#ff8a80]">{err}</p>}
        </form>
      )}
    </div>
  );
}
