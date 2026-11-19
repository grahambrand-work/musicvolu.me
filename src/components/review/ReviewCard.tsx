// A submission on the review board (Figma "Phase 4 · Review queue"): the board card, and the
// shorter row in the queue beside an opened card. The whole card opens it; likes stay clickable.
import Link from "next/link";
import { ago, STATUS_COLOR, STATUS_LABEL, type Card, type Person, type Status } from "@/lib/review";
import { tierColor } from "@/lib/roles";
import { CommentIcon } from "../icons";
import { Cover, Tag } from "../ui";
import Votes from "./Votes";

export function Name({ p, you }: { p: Person; you?: string }) {
  return <span className="font-mono" style={{ color: tierColor(p) }}>{you && p.username === you ? "you" : p.username}</span>;
}

/** "Picked up by you", "Waiting on marlowe.k", "Sent by marco.v · waiting to publish", "Published by mbadmin". */
function StatusLine({ c, me }: { c: Card; me: string }) {
  if (c.status === "in_review" && c.reviewer) return <p className="text-[12px] text-teal">Picked up by <Name p={c.reviewer} you={me} /></p>;
  if (c.status === "changes_requested") return <p className="text-[12px] text-[#f5b84d]">Waiting on <Name p={c.author} you={me} /></p>;
  if (c.status === "final_review") return <p className="text-[12px] text-white/60">Sent by {c.movedBy ? <Name p={c.movedBy} you={me} /> : "an editor"} · waiting to publish</p>;
  if (c.status === "published") return <p className="text-[12px] text-white/60">Published by {c.movedBy ? <Name p={c.movedBy} you={me} /> : "an admin"}</p>;
  return null;
}

const YouChip = () => <span className="rounded-[3px] bg-teal/15 px-1.5 py-0.5 text-[11px] text-teal">@ you</span>;

export function BoardCard({ c, me, canVote, selected = false }: { c: Card; me: string; canVote: boolean; selected?: boolean }) {
  return (
    <article className={`relative rounded-[6px] border bg-[#141415] p-3.5 transition-colors hover:border-white/35 ${selected ? "border-teal/80" : "border-white/15"}`}>
      <Link href={`/review/${c.number}`} className="absolute inset-0 rounded-[6px]" aria-label={`Open ${c.entityName}`} />
      <div className="flex items-center gap-2.5">
        <Cover src={c.cover} size={32} round={c.entityType === "artist"} />
        <Tag>{c.tag}</Tag>
        <span className="ml-auto text-[12px] text-white/50">{ago(c.status === "published" ? c.movedAt : c.createdAt, c.status === "published")}</span>
      </div>
      <h3 className="mt-2.5 truncate font-mono text-[15px] font-bold">{c.entityName}</h3>
      <p className="mt-1 truncate text-[13px] text-white/65">{c.summary}</p>
      <p className="mt-2 truncate text-[13px] text-white/65">by <Name p={c.author} /></p>
      <div className="mt-2"><StatusLine c={c} me={me} /></div>
      <div className="relative z-10 mt-2.5 flex items-center gap-3 pointer-events-none [&_button]:pointer-events-auto">
        {c.mentionsMe && <YouChip />}
        <Votes target="submission" id={c.id} up={c.up} down={c.down} mine={c.myVote} canVote={canVote} />
        {c.comments > 0 && <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-white/70"><CommentIcon size={13} />{c.comments}</span>}
      </div>
    </article>
  );
}

export function QueueRow({ c, selected }: { c: Card; selected: boolean }) {
  const color = STATUS_COLOR[c.status];
  return (
    <li className={`relative border-b border-hair px-3.5 py-3.5 ${selected ? "rounded-[6px] bg-white/7" : "hover:bg-white/4"}`}>
      <Link href={`/review/${c.number}`} className="absolute inset-0" aria-label={`Open ${c.entityName}`} aria-current={selected ? "page" : undefined} />
      <div className="flex items-center gap-2.5">
        <Tag>{c.tag}</Tag>
        <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-bold">{c.entityName}</span>
        <span className="text-[12px] text-white/50">{ago(c.createdAt)}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2 text-[13px] text-white/65">
        <span className="min-w-0 flex-1 truncate">{c.summary} · by <Name p={c.author} /></span>
        {c.comments > 0 && <span className="inline-flex items-center gap-1 self-center"><CommentIcon size={12} />{c.comments}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px]">
        <span className="size-1.5 rounded-full border" style={{ background: color, borderColor: color === "transparent" ? "rgb(255 255 255 / .6)" : color }} />
        <span style={{ color: color === "transparent" ? undefined : color }}>{STATUS_LABEL[c.status]}</span>
        {c.mentionsMe && <YouChip />}
        <span className="ml-auto text-white/70"><Votes target="submission" id={c.id} up={c.up} down={c.down} mine={c.myVote} canVote={false} /></span>
      </div>
    </li>
  );
}

/** Stage dot: hollow for Needs review, coloured for the rest. */
export function Dot({ status }: { status: Status | "live_today" }) {
  const c = STATUS_COLOR[status];
  return <span aria-hidden className="inline-block size-1.5 shrink-0 -translate-y-px self-center rounded-full border" style={{ background: c, borderColor: c === "transparent" ? "rgb(255 255 255 / .6)" : c }} />;
}

