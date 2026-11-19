// The review board (Figma "Phase 4 · Review queue (chosen)", board 85:830, phone 85:1047):
// five stages side by side on a computer; on a phone, one stage at a time under stage tabs.
// Filters: type, Anyone / Mine, @ me; Board / List.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { BoardCard, Dot, QueueRow } from "@/components/review/ReviewCard";
import type { Kind } from "@/lib/edits";
import { can, getCards, STAGES, type Card } from "@/lib/review";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Review board" };

const TYPES: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "All types" }, { key: "release", label: "Releases" }, { key: "artist", label: "Artists" }, { key: "song", label: "Songs" },
];
type Stage = (typeof STAGES)[number]["key"];
const PER_COLUMN = 6;

export default async function ReviewBoard({ searchParams }: PageProps<"/review">) {
  const v = await getViewer();
  if (!v) redirect("/login?next=/review");
  const sp = await searchParams;
  if (!can.see(v)) return <NotYet />;

  const type = (TYPES.find((t) => t.key === sp.type)?.key ?? "all") as Kind | "all";
  const mine = sp.who === "mine";
  const mentions = sp.at === "me";
  const view = sp.view === "list" ? "list" : "board";
  const stage = (STAGES.find((s) => s.key === sp.stage)?.key ?? "needs_review") as Stage;

  const [open, live] = await Promise.all([
    getCards(v, { type, mine, mentions }),
    getCards(v, { stage: "live_today", type, mine, mentions, limit: 50 }),
  ]).catch(() => [[], []] as Card[][]);
  const byStage = (k: Stage) => (k === "live_today" ? live : open.filter((c) => c.status === k));

  const qs = (p: Partial<Record<"type" | "who" | "at" | "view" | "stage", string | null>>) => {
    const u = new URLSearchParams();
    const cur = { type: type === "all" ? null : type, who: mine ? "mine" : null, at: mentions ? "me" : null, view: view === "list" ? "list" : null, stage: sp.stage ? stage : null, ...p };
    for (const [k, val] of Object.entries(cur)) if (val) u.set(k, val);
    const s = u.toString();
    return `/review${s ? `?${s}` : ""}`;
  };
  const mentionCount = open.filter((c) => c.mentionsMe).length;
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[14px] ${on ? "border-white bg-white text-black" : "border-white/50 hover:bg-white/10"}`;
  const canVote = can.vote(v);

  return (
    <>
      <Header />
      <main className="px-4 pt-7 pb-20 md:px-[60px] md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold md:text-[32px]">Review board</h1>
          <div className="hidden flex-wrap items-center gap-2.5 md:flex">
            <Menu label={TYPES.find((t) => t.key === type)!.label} items={TYPES.map((t) => ({ label: t.label, href: qs({ type: t.key === "all" ? null : t.key }), on: t.key === type }))} />
            <Menu label={mine ? "Mine" : "Anyone"} items={[{ label: "Anyone", href: qs({ who: null }), on: !mine }, { label: "Mine (sent or picked up)", href: qs({ who: "mine" }), on: mine }]} />
            <Link href={qs({ at: mentions ? null : "me" })} className={pill(mentions)}>@ me · {mentionCount}</Link>
            <span className="inline-flex rounded-full border border-white/50 p-[3px]">
              <Link href={qs({ view: "list" })} className={`rounded-full px-3.5 py-[4px] text-[14px] ${view === "list" ? "bg-white text-black" : ""}`}>List</Link>
              <Link href={qs({ view: null, stage: null })} className={`rounded-full px-3.5 py-[4px] text-[14px] ${view === "board" ? "bg-white text-black" : ""}`}>Board</Link>
            </span>
          </div>
        </div>

        {/* Phone, or List view: one stage at a time. */}
        <div className={view === "list" ? "" : "md:hidden"}>
          <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Stages">
            {STAGES.map((s) => (
              <Link key={s.key} href={qs({ stage: s.key, view: view === "list" ? "list" : null })} aria-current={s.key === stage ? "page" : undefined}
                className={`shrink-0 ${pill(s.key === stage)}`}>
                <span className="md:hidden">{s.short}</span><span className="hidden md:inline">{s.label}</span> · {byStage(s.key).length}
              </Link>
            ))}
          </nav>
          <p className="mt-3 text-[12px] text-white/45 md:hidden">Swipe sideways to switch stage</p>
          {byStage(stage).length === 0 ? <Empty /> : (
            <>
              <div className="mt-4 flex flex-col gap-4 md:hidden">
                {byStage(stage).map((c) => <BoardCard key={c.id} c={c} me={v.username} canVote={canVote} />)}
              </div>
              <ul className="mt-5 hidden max-w-[760px] md:block">
                {byStage(stage).map((c) => <QueueRow key={c.id} c={c} selected={false} />)}
              </ul>
            </>
          )}
        </div>

        {view === "board" && (
          <div className="mt-9 hidden grid-cols-5 gap-4 md:grid">
            {STAGES.map((s) => {
              const cards = byStage(s.key);
              return (
                <section key={s.key} aria-label={s.label} className="min-w-0">
                  <h2 className="flex items-baseline gap-2 border-b border-rule pb-3 text-[15px] font-medium">
                    <Dot status={s.key} />{s.label}<span className="text-white/45">{cards.length}</span>
                  </h2>
                  <div className="mt-3 flex flex-col gap-3">
                    {cards.slice(0, PER_COLUMN).map((c) => <BoardCard key={c.id} c={c} me={v.username} canVote={canVote} />)}
                  </div>
                  {cards.length > PER_COLUMN && (
                    <Link href={qs({ view: "list", stage: s.key })} className="mt-3 inline-block text-[13px] text-white/60 hover:text-white">+ {cards.length - PER_COLUMN} more</Link>
                  )}
                </section>
              );
            })}
          </div>
        )}
        <p className="mt-10 text-[13px] text-white/55">Open a card and use the buttons at the bottom. Every move is logged with who made it.</p>
      </main>
    </>
  );
}

function Menu({ label, items }: { label: string; items: { label: string; href: string; on: boolean }[] }) {
  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/50 px-3.5 py-[7px] text-[14px] hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        {label} <span aria-hidden className="text-[8px] opacity-80">▼</span>
      </summary>
      <ul className="absolute top-[calc(100%+6px)] right-0 z-30 min-w-44 overflow-hidden rounded-[8px] border border-white/15 bg-[#0d0d0e] text-[14px]">
        {items.map((i) => (
          <li key={i.href}><Link href={i.href} className={`block px-3.5 py-2.5 hover:bg-white/6 ${i.on ? "text-white" : "text-white/70"}`}>{i.on ? "✓ " : ""}{i.label}</Link></li>
        ))}
      </ul>
    </details>
  );
}

function Empty() {
  return <p className="mt-8 text-[14px] text-white/55">Nothing here right now.</p>;
}

function NotYet() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[560px] px-4 py-24 text-center">
        <h1 className="text-[26px] font-semibold">The review board opens at Tier 2</h1>
        <p className="mt-3 text-[15px] text-white/70">Once you reach Tier 2 you can see what’s waiting for review and like or dislike changes. Until then, every edit you send still goes to the editors.</p>
        <Link href="/contribute" className="mt-6 inline-block rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-black">Contribute</Link>
      </main>
    </>
  );
}
