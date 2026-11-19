// An opened card on the review board (Figma 85:1103 / phone 85:1516, final review 92:1489):
// the queue on the left, and on the right the entry side by side, live now vs suggested,
// with comments on each field, discussion of the whole submission, likes, the activity
// log, and the buttons for whoever is looking.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import Comments, { type People } from "@/components/review/Comments";
import Decide, { type Button } from "@/components/review/Decide";
import { Dot, Name, QueueRow } from "@/components/review/ReviewCard";
import Votes from "@/components/review/Votes";
import { CommentIcon } from "@/components/icons";
import { Cover, Tag } from "@/components/ui";
import { describeChanges, FIELDS, parseDuration, type Change, type CreditRow, type Kind, type TrackRow, type Values } from "@/lib/edits";
import { duration } from "@/lib/format";
import type { PickedArtist } from "@/lib/newEntry";
import { ago, can, fieldLabel, getCards, getComments, getCounts, lastDecision, STATUS_LABEL, type Card, type Comment, type Person } from "@/lib/review";
import { roleLabel, tierColor } from "@/lib/roles";
import { getEditable, getSubmission, type Submission } from "@/lib/submissions";
import { getViewer, type Viewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/review/[number]">): Promise<Metadata> {
  const n = Number((await params).number);
  const s = Number.isSafeInteger(n) ? await getSubmission(n) : null;
  return { title: s ? `Review: ${s.entityName}` : "Review" };
}

const QUEUES = [
  { key: "needs", label: "Needs review" }, { key: "mine", label: "Mine" }, { key: "at", label: "@ me" }, { key: "final", label: "Final review" },
] as const;
type Queue = (typeof QUEUES)[number]["key"];

export default async function OpenedCard({ params, searchParams }: PageProps<"/review/[number]">) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const v = await getViewer();
  if (!v) redirect(`/login?next=/review/${number}`);
  if (!can.see(v)) redirect("/review");
  const s = /^\d{1,12}$/.test(number) ? await getSubmission(Number(number)) : null;
  if (!s) notFound();

  const queue: Queue = (QUEUES.find((q) => q.key === sp.q)?.key ?? (s.status === "final_review" && can.publish(v) ? "final" : "needs"));
  const only = sp.only === "changes";
  const [cards, counts, comments, last, live] = await Promise.all([
    getCards(v, queue === "needs" ? { stage: "needs_review", limit: 50 } : queue === "final" ? { stage: "final_review", limit: 50 } : queue === "mine" ? { mine: true, limit: 50 } : { mentions: true, limit: 50 }),
    getCounts(v),
    getComments(s.id, v),
    lastDecision(s.id),
    s.kind === "edit" && s.entitySlug ? getEditable(s.entityType, s.entitySlug) : Promise.resolve(null),
  ]);
  const self = (await getCards(v, { stage: s.status === "published" ? "live_today" : s.status as never, limit: 200 }).catch(() => [] as Card[])).find((c) => c.id === s.id);

  const people: People = {};
  for (const c of comments) people[c.author.username.toLowerCase()] = tierColor(c.author);
  people[s.author.username.toLowerCase()] = tierColor(s.author);
  const agoOf = Object.fromEntries(comments.map((c) => [c.id, ago(c.createdAt)]));
  const byField = (k: string | null) => comments.filter((c) => c.field === k);
  const rows = s.kind === "edit" ? editRows(s, live?.values ?? null) : newRows(s);
  const shownRows = only ? rows.filter((r) => r.changed) : rows;
  const tag = self?.tag ?? (s.entityType === "release" ? String(s.changes.type?.to ?? "Release") : s.entityType);
  const decide = buttonsFor(v, s, last);

  return (
    <>
      <Header />
      <div className="md:grid md:grid-cols-[minmax(320px,410px)_1fr] md:border-t-0">
        {/* Queue (computer only) */}
        <aside className="hidden border-r border-line px-12 pt-8 pb-16 md:block">
          <Link href="/review" className="text-[14px] text-white/70 hover:text-white">← Back to board</Link>
          <h1 className="mt-5 text-[26px] font-semibold">{queue === "final" ? "Final review" : "Review queue"}</h1>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Queues">
            {QUEUES.filter((q) => q.key !== "final" || can.publish(v) || counts.final_review > 0).map((q) => {
              const n = q.key === "needs" ? counts.needs_review : q.key === "mine" ? counts.mine : q.key === "at" ? counts.mentions : counts.final_review;
              return (
                <Link key={q.key} href={`/review/${s.number}?q=${q.key}`} aria-current={q.key === queue ? "page" : undefined}
                  className={`rounded-full border px-3 py-[5px] text-[13px] ${q.key === queue ? "border-white bg-white text-black" : "border-white/50 hover:bg-white/10"}`}>{q.label} · {n}</Link>
              );
            })}
          </nav>
          <ul className="mt-5 -mx-3.5">
            {cards.length ? cards.map((c) => <QueueRow key={c.id} c={c} selected={c.id === s.id} />) : <li className="px-3.5 py-4 text-[14px] text-white/50">Nothing in this queue.</li>}
          </ul>
        </aside>

        <main className="min-w-0 px-4 pt-6 pb-20 md:px-10 md:pt-8 lg:px-[60px]">
          <Link href="/review" className="text-[14px] text-white/70 hover:text-white md:hidden">← Back to board</Link>
          <div className="mt-5 flex flex-wrap items-start gap-4 md:mt-0">
            <Cover src={self?.cover} size={64} round={s.entityType === "artist"} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2.5 text-[13px]">
                <Tag>{tag}</Tag>
                <span className="text-white/70">{s.kind === "edit" ? "Edit" : "New"}</span>
                <StatusText s={s} last={last} me={v.username} reviewer={self?.reviewer ?? null} />
              </p>
              <h2 className="mt-1.5 font-mono text-[26px] leading-[1.15] font-bold break-words md:text-[30px]">
                {s.entitySlug ? <Link href={`/${s.entityType}/${s.entitySlug}`} className="hover:underline">{s.entityName}</Link> : s.entityName}
              </h2>
              <p className="mt-1.5 text-[14px] text-white/65">
                {self?.summary} · by <Name p={s.author} /> · {roleLabel(s.author).replace("Editor", "editor").replace("Contributor", "contributor")} · {ago(s.createdAt)} ago
              </p>
            </div>
            <div className="flex gap-2 max-md:w-full">
              <Link href={`/review/${s.number}?${new URLSearchParams({ ...(sp.q ? { q: String(sp.q) } : {}) })}`} className={`rounded-full border px-3.5 py-[6px] text-[14px] ${!only ? "border-white bg-white text-black" : "border-white/50"}`}>All fields</Link>
              <Link href={`/review/${s.number}?${new URLSearchParams({ only: "changes", ...(sp.q ? { q: String(sp.q) } : {}) })}`} className={`rounded-full border px-3.5 py-[6px] text-[14px] ${only ? "border-white bg-white text-black" : "border-white/50"}`}>Changes only</Link>
            </div>
          </div>

          {/* Live now vs suggested */}
          <div className="mt-8">
            <div className={`hidden gap-4 border-b border-rule px-3 pb-2.5 md:grid ${s.kind === "edit" ? "grid-cols-[150px_1fr_1fr_40px]" : "grid-cols-[150px_1fr_40px]"}`}>
              <span className="field-label">Field</span>
              {s.kind === "edit" && <span className="field-label">Live now</span>}
              <span className="field-label">{s.kind === "edit" ? "Suggested" : "New entry"}</span>
            </div>
            {shownRows.map((r) => {
              const thread = byField(r.key);
              const canThread = can.comment(v) || thread.length > 0;
              return (
                <details key={r.key} id={`f-${r.key}`} open={thread.length > 0} className="group border-b border-hair">
                  <summary className={`grid cursor-pointer list-none gap-x-4 gap-y-1 py-3 md:items-baseline [&::-webkit-details-marker]:hidden ${s.kind === "edit" ? "md:grid-cols-[150px_1fr_1fr_40px]" : "md:grid-cols-[150px_1fr_40px]"} px-3 ${r.changed ? "rounded-[4px] bg-teal/6 max-md:border max-md:border-teal/40" : ""}`}>
                    <span className="field-label flex items-center justify-between">{r.label}
                      {canThread && <span className="inline-flex items-center gap-1 text-[12px] text-teal md:hidden"><CommentIcon size={13} />{thread.length || ""}</span>}
                    </span>
                    {s.kind === "edit" && (
                      <span className="min-w-0 font-mono text-[15px] break-words">
                        <span className="field-label mr-2 normal-case md:hidden">Live now</span>
                        <span className={r.changed && r.live ? "text-white/50 line-through" : ""}>{r.live || <span className="text-white/40">—</span>}</span>
                      </span>
                    )}
                    <span className={`min-w-0 font-mono text-[15px] break-words ${r.changed ? "text-teal" : "font-sans text-[14px] text-white/45"}`}>
                      {r.changed ? r.suggested : "No change"}
                    </span>
                    <span className="hidden justify-end md:flex">
                      {canThread && <span className={`inline-flex items-center gap-1 text-[13px] ${thread.length ? "text-teal" : "text-white/35 group-hover:text-white/70"}`}><CommentIcon size={13} />{thread.length || ""}</span>}
                    </span>
                  </summary>
                  {canThread && (
                    <div className="mb-3 border-l-2 border-teal/70 bg-white/4 px-5 py-4 md:ml-[178px]">
                      <p className="mb-3 text-[12px] text-white/60">Comments on <span className="font-medium text-teal uppercase">{r.label}</span></p>
                      <Comments number={s.number} field={r.key} comments={thread} people={people} canComment={can.comment(v)} canVote={can.vote(v)} ago={agoOf} placeholder="Reply about this field… type @ to tag an editor" />
                    </div>
                  )}
                </details>
              );
            })}
            {only && rows.length > shownRows.length && (
              <p className="mt-3 text-[13px] text-white/50">{rows.length - shownRows.length} unchanged fields hidden · <Link href={`/review/${s.number}`} className="underline">Show all</Link></p>
            )}
          </div>

          {s.dependsOn && (
            <Block title="Goes in with">
              <p className="text-[14px]">New artist <Link href={`/review/${s.dependsOn.number}`} className="font-mono underline">{s.dependsOn.name}</Link> ({STATUS_LABEL[s.dependsOn.status]?.toLowerCase()}). Publishing this also needs that artist published.</p>
            </Block>
          )}
          {(s.sources || s.note) && (
            <Block title={s.sources ? "Sources given" : "Note for editors"}>
              {s.sources && <p className="font-mono text-[14px] break-words whitespace-pre-line"><Linkify text={s.sources} /></p>}
              {s.sources && s.note && <p className="field-label mt-5 pb-2">Note for editors</p>}
              {s.note && <p className="text-[15px] break-words whitespace-pre-line">{s.note}</p>}
            </Block>
          )}
          {can.comment(v) && <p className="mt-4 text-[13px] text-white/50">Click any row to comment on just that field.</p>}

          {can.vote(v) && !can.comment(v) && (
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[8px] border border-white/15 px-4 py-3.5">
              <span className="text-[15px]">Do you agree with this change?</span>
              {self && <Votes target="submission" id={s.id} up={self.up} down={self.down} mine={self.myVote} canVote big />}
              <span className="text-[12px] text-white/50 md:ml-auto">Only editors can comment or decide</span>
            </div>
          )}

          <Block title={<>Discussion · whole submission{byField(null).length ? ` · ${byField(null).length}` : ""}</>}>
            {self && can.comment(v) && (
              <div className="mb-5 flex items-center gap-3 text-[13px] text-white/60">
                Submission <Votes target="submission" id={s.id} up={self.up} down={self.down} mine={self.myVote} canVote />
              </div>
            )}
            <Comments number={s.number} field={null} comments={byField(null)} people={people} canComment={can.comment(v)} canVote={can.vote(v)} ago={agoOf} placeholder="Comment on the whole submission…" boxed />
            {!byField(null).length && !can.comment(v) && <p className="text-[14px] text-white/50">No comments yet.</p>}
          </Block>

          <Block title="Activity">
            <ul className="flex flex-col">
              {activity(s, comments).map((e, i) => (
                <li key={i} className="flex items-baseline gap-3 border-b border-hair py-2.5 text-[14px]">
                  <span className="min-w-0 flex-1">{e.who ? <Name p={e.who} /> : <span className="font-mono text-mbsync">musicvolu.me</span>} <span className="text-white/75">{e.text}</span></span>
                  <span className="text-[12px] text-white/45">{ago(e.when)}</span>
                </li>
              ))}
            </ul>
          </Block>

          {s.status === "published" && (
            <p className="mt-10 border-t border-rule pt-6 text-[15px] text-[#7ad98f]">
              Published{last ? <> by <Name p={last} you={v.username} /></> : null}.{" "}
              {s.entitySlug && <Link href={`/${s.entityType}/${s.entitySlug}`} className="underline">See it live</Link>}
            </p>
          )}
          {decide && <div className="mt-10"><Decide number={s.number} {...decide} /></div>}
        </main>
      </div>
    </>
  );
}

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h3 className="field-label border-b border-rule pb-2.5 text-white/60">{title}</h3>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function Linkify({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s]+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="underline">{p}</a> : p))}</>;
}

function StatusText({ s, last, me, reviewer }: { s: Submission; last: Person | null; me: string; reviewer: Person | null }) {
  const extra = s.status === "in_review" && reviewer ? <> · picked up by <Name p={reviewer} you={me} /></>
    : s.status === "final_review" && last ? <> · sent by <Name p={last} you={me} /></>
    : s.status === "changes_requested" && last ? <> · asked by <Name p={last} you={me} /></>
    : (s.status === "published" || s.status === "rejected") && last ? <> by <Name p={last} you={me} /></> : null;
  const color = { in_review: "text-teal", final_review: "text-[#fa99cc]", changes_requested: "text-[#f5b84d]", published: "text-[#7ad98f]", rejected: "text-[#ff8a80]" }[s.status] ?? "text-white/75";
  return <span className={`inline-flex items-center gap-1.5 ${color}`}><Dot status={s.status as never} />{STATUS_LABEL[s.status] ?? s.status}{extra}</span>;
}

type Row = { key: string; label: string; live: ReactNode; suggested: ReactNode; changed: boolean };

const text = (x: unknown) => (x == null ? "" : String(x));
const selectLabel = (kind: Kind, key: string, value: string) => FIELDS[kind].find((f) => f.key === key)?.options?.find((o) => o.value === value)?.label ?? value;
function tracksSummary(ts: TrackRow[]) {
  if (!ts.length) return "";
  const secs = ts.map((t) => parseDuration(t.duration) ?? 0).reduce((a, b) => a + b, 0);
  return `${ts.length} track${ts.length === 1 ? "" : "s"}${secs ? ` · ${duration(secs)}` : ""}`;
}
function ChangeLines({ cs }: { cs: Change[] }) {
  return (
    <span className="flex flex-col gap-0.5">
      {cs.map((c) => (
        <span key={c.key}>
          {c.label !== "Tracklist" && c.label !== "Credits" && cs.length > 1 && <span className="mr-2 font-sans text-[12px] text-white/50">{c.label}</span>}
          {c.now !== undefined && <span>{c.now || <span className="text-white/45">(empty)</span>}</span>}
          {c.added?.map((x) => <span key={`+${x}`} className="block">+ {x}</span>)}
          {c.removed?.map((x) => <span key={`-${x}`} className="block text-white/45 line-through">− {x}</span>)}
        </span>
      ))}
    </span>
  );
}

/** Every editable field: what's live now, and what's suggested (from the stored diff). */
function editRows(s: Submission, live: Values | null): Row[] {
  const kind = s.entityType;
  const cur = (live ?? {}) as Record<string, unknown>;
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) { before[f.key] = ""; after[f.key] = ""; }
  before.tracks = after.tracks = before.credits = after.credits = [];
  for (const [k, c] of Object.entries(s.changes)) { before[k] = c.from ?? (Array.isArray(c.to) ? [] : ""); after[k] = c.to; }
  const changes = describeChanges(kind, before as Values, after as Values);
  const group = (k: string) => changes.filter((c) => (k === "tracks" ? c.key.startsWith("track") || c.key === "order" : c.key === k));

  const rows: Row[] = FIELDS[kind].filter((f) => f.type !== "readonly").map((f) => {
    const cs = group(f.key);
    const liveVal = f.type === "select" ? selectLabel(kind, f.key, text(cur[f.key])) : text(cur[f.key]);
    return { key: f.key, label: f.label, live: liveVal || (s.changes[f.key] ? text(s.changes[f.key].from) : ""), suggested: <ChangeLines cs={cs} />, changed: cs.length > 0 };
  });
  if (kind === "release") {
    const cs = group("tracks");
    rows.push({ key: "tracks", label: "Tracks", live: tracksSummary((cur.tracks as TrackRow[]) ?? []), suggested: <ChangeLines cs={cs} />, changed: cs.length > 0 });
  }
  if (kind === "song") {
    const cs = group("credits");
    const credits = (cur.credits as CreditRow[]) ?? [];
    rows.push({ key: "credits", label: "Credits", live: credits.length ? credits.map((c) => `${c.role}: ${c.name}`).join(", ") : "", suggested: <ChangeLines cs={cs} />, changed: cs.length > 0 });
  }
  return rows;
}

/** A new entry: every field it was sent with. */
function newRows(s: Submission): Row[] {
  const to = (k: string) => s.changes[k]?.to;
  const labels: Record<string, string> = {
    name: "Name", title: "Title", kind: "Type", type: "Type", origin: "From", started: "Started", website: "Website",
    releaseDate: s.entityType === "song" ? "First released" : "Release date", label: "Label", country: "Country",
    language: "Language", duration: "Length", genres: "Genres",
  };
  const rows: Row[] = [];
  const artists = (to("artists") as PickedArtist[] | undefined) ?? [];
  if (artists.length) {
    rows.push({ key: "artists", label: "Artist", live: "", changed: true, suggested: (
      <>{artists.map((a, i) => <span key={i}>{i > 0 && ", "}{a.review ? <Link href={`/review/${a.review}`} className="underline">{a.name}</Link> : a.name}{a.review && <span className="ml-1.5 font-sans text-[12px] text-teal">in review</span>}</span>)}</>
    ) });
  }
  for (const [k, label] of Object.entries(labels)) {
    const val = to(k);
    if (typeof val !== "string" || !val) continue;
    rows.push({ key: k, label, live: "", changed: true, suggested: k === "kind" ? (val === "Band" ? "Group" : "Person") : val });
  }
  const tracks = (to("tracks") as { title: string; duration: string }[] | undefined) ?? [];
  if (tracks.length) {
    rows.push({ key: "tracks", label: `Tracks · ${tracks.length}`, live: "", changed: true, suggested: (
      <ol className="flex flex-col gap-1">{tracks.map((t, i) => <li key={i} className="flex gap-3"><span className="w-5 text-white/50">{String(i + 1).padStart(2, "0")}</span><span className="flex-1">{t.title}</span><span className="text-white/60">{t.duration}</span></li>)}</ol>
    ) });
  }
  const credits = (to("credits") as { role: string; name: string }[] | undefined) ?? [];
  if (credits.length) rows.push({ key: "credits", label: "Credits", live: "", changed: true, suggested: <>{credits.map((c, i) => <span key={i} className="block">{c.role}: {c.name}</span>)}</> });
  return rows;
}

/** Status moves and comments, oldest first. */
function activity(s: Submission, comments: Comment[]) {
  const said: Record<string, string> = {
    in_review: "picked it up", changes_requested: "asked for changes", final_review: "sent it to final review",
    rejected: "rejected it", published: "published it", withdrawn: "withdrew it",
  };
  const events = s.events.map((e) => ({
    when: e.when, who: e.who ? { username: e.who, role: e.whoRole ?? "contributor", tier: e.whoTier ?? 1 } as Person : null,
    text: e.action === "submitted" ? (s.kind === "edit" ? "submitted the edit" : "submitted it") : e.toStatus ? (e.fromStatus === "final_review" && e.toStatus === "in_review" ? "sent it back to editors" : e.fromStatus === "changes_requested" && e.toStatus === "in_review" ? "moved it back to review" : said[e.toStatus] ?? `moved it to ${STATUS_LABEL[e.toStatus]?.toLowerCase()}`) : e.action,
  }));
  const seen = new Set<string>();
  const notes = comments.map((c) => {
    const key = `${c.field ?? ""}`;
    const first = !seen.has(key);
    seen.add(key);
    return { when: c.createdAt, who: c.author, text: `${first ? "commented" : "replied"}${c.field ? ` on ${fieldLabel(c.field)}` : ""}` };
  });
  return [...events, ...notes].sort((a, b) => a.when.getTime() - b.when.getTime());
}

/** Which buttons the viewer gets, given the stage, their role and who decided last. */
function buttonsFor(v: Viewer, s: Submission, last: (Person & { id: string }) | null): { buttons: Button[]; note?: string; locked?: string } | null {
  if (!can.decide(v)) return null;
  const open = ["needs_review", "in_review", "changes_requested", "final_review"].includes(s.status);
  if (!open) return null;
  if (s.author.username === v.username && v.role !== "admin") return { buttons: [], note: "This is your own submission. Another editor reviews it." };
  const locked = last && last.id !== v.id && !can.override(v, last)
    ? `${last.username} (${roleLabel(last)}) made the last decision. Only a ${last.role === "admin" ? "admin" : `tier ${last.tier} editor`} or higher can change it.` : undefined;
  const reject: Button = { move: "reject", label: "Reject", style: "danger" };
  switch (s.status) {
    case "needs_review":
      return { buttons: [reject, { move: "ask_changes", label: "Ask for changes", style: "outline" }, { move: "pick_up", label: "Pick up", style: "primary" }], note: "Picking it up tells other editors you’re on it", locked };
    case "in_review":
      return { buttons: [reject, { move: "ask_changes", label: "Ask for changes", style: "outline" }, { move: "send_final", label: "Send to final review", style: "primary" }], note: "A tier 3 editor or admin publishes after final review", locked };
    case "changes_requested":
      return { buttons: [reject, { move: "back_to_review", label: "Back to review", style: "primary" }], note: `Waiting on ${s.author.username} to update it`, locked };
    case "final_review":
      if (!can.publish(v)) return { buttons: [], note: "Waiting for a tier 3 editor or an admin to publish." };
      return {
        buttons: [reject, { move: "send_back", label: "Send back to editors", style: "outline" },
          { move: "publish", label: "Publish", style: "primary" }],
        note: "Publishing makes it live and logs it under your name", locked,
      };
  }
  return null;
}
