// Band members shown as tags (review card, submission page): photo when the member has their
// own artist page, teal when new, struck through when taken off.
import Link from "next/link";
import { memberKey, type MemberRow } from "@/lib/edits";
import { Cover } from "./ui";

export default function MemberChips({ list, was }: { list: MemberRow[]; was?: MemberRow[] }) {
  const before = was ? new Set(was.map(memberKey)) : null;
  const after = new Set(list.map(memberKey));
  const gone = was ? was.filter((m) => !after.has(memberKey(m))) : [];
  if (!list.length && !gone.length) return null;
  const chip = (m: MemberRow, state: "same" | "new" | "gone") => {
    const body = (
      <>
        {m.image && <Cover src={m.image} size={20} round />}
        <span className={state === "gone" ? "line-through" : ""}>{m.name}</span>
        {m.role && <span className={state === "new" ? "text-teal/70" : "text-white/50"}>{m.role}</span>}
      </>
    );
    const cls = `inline-flex items-center gap-1.5 rounded-full border py-0.5 font-sans text-[13px] ${m.image ? "pl-0.5 pr-2.5" : "px-2.5"} ${
      state === "new" ? "border-teal/70 bg-teal/10 text-teal" : state === "gone" ? "border-white/15 text-white/45" : "border-transparent bg-white/12"}`;
    return m.slug && state !== "gone"
      ? <Link key={memberKey(m)} href={`/artist/${m.slug}`} className={`${cls} hover:border-white/50`}>{body}</Link>
      : <span key={memberKey(m)} className={cls}>{body}</span>;
  };
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map((m) => chip(m, before && !before.has(memberKey(m)) ? "new" : "same"))}
      {gone.map((m) => chip(m, "gone"))}
    </span>
  );
}
