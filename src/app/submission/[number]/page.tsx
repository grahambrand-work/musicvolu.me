// One submission (#1042): a suggested edit or a new entry, what it changes, its sources,
// and everything that has happened to it. New entries still in review link here from search.
import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { Cover, FieldRows, ReviewDot, SectionLabel, Tag } from "@/components/ui";
import { countChanges, describeChanges, FIELDS, type Kind, type Values } from "@/lib/edits";
import { shortDate } from "@/lib/format";
import type { PickedArtist } from "@/lib/newEntry";
import { getSubmission, type Submission } from "@/lib/submissions";
import { roleLabel, tierColor } from "@/lib/viewer";

const STATUS: Record<string, string> = {
  needs_review: "Waiting for review", in_review: "In review", changes_requested: "Changes requested",
  final_review: "Final review", published: "Published", rejected: "Not accepted", withdrawn: "Withdrawn",
};
const OPEN = ["needs_review", "in_review", "changes_requested", "final_review"];
const NOUN: Record<Kind, string> = { artist: "artist", release: "release", song: "song" };

export async function generateMetadata({ params }: PageProps<"/submission/[number]">): Promise<Metadata> {
  const s = await getSubmission(Number((await params).number));
  return { title: s ? `#${s.number} · ${s.entityName}` : "Submission" };
}

export default async function SubmissionPage({ params, searchParams }: PageProps<"/submission/[number]">) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const s = /^\d{1,12}$/.test(number) ? await getSubmission(Number(number)) : null;
  if (!s) notFound();
  const to = (k: string) => s.changes[k]?.to;
  const tag = s.entityType === "artist" ? "Artist" : s.entityType === "song" ? "Song" : String(to("type") ?? "Release");
  const open = OPEN.includes(s.status);
  const viewer = await getViewer();
  const mine = !!viewer && viewer.username === s.author.username;
  const canChange = mine && s.kind === "edit" && ["needs_review", "changes_requested"].includes(s.status);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[960px] px-4 pb-24 md:px-[60px]">
        <Link href="/search" className="mt-6 inline-block text-[14px] text-white/70 hover:text-white">← Search</Link>
        {sp.sent && (
          <p role="status" className="mt-5 flex items-center gap-2.5 rounded-[10px] border border-teal/60 bg-teal/8 px-4 py-3 text-[14px] md:text-[15px]">
            <ReviewDot /> Thanks! It’s in. {s.kind === "new" ? "It shows up in search now, marked “in review”." : ""} An editor checks every submission before it goes live.
          </p>
        )}

        {sp.updated && (
          <p role="status" className="mt-5 flex items-center gap-2.5 rounded-[10px] border border-teal/60 bg-teal/8 px-4 py-3 text-[14px] md:text-[15px]">
            <ReviewDot /> Saved. Editors see your updated edit{s.status === "in_review" ? ", and it's back in review" : ""}.
          </p>
        )}
        {canChange && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-white/20 px-4 py-3 text-[14px] md:text-[15px]">
            <span className="text-white/80">{s.status === "changes_requested" ? "An editor asked for changes. Update your edit and it goes back to them." : "Spotted a mistake? You can change this edit until an editor picks it up."}</span>
            <Link href={`/submission/${s.number}/edit`} className="ml-auto rounded-full bg-white px-4 py-[7px] text-[14px] font-medium text-black hover:bg-white/85">Change edit</Link>
          </div>
        )}

        <div className="mt-6 flex items-start gap-4 md:mt-9 md:gap-6">
          <Cover size={88} round={s.entityType === "artist"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{tag}</Tag>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] ${open ? "border-teal/60 text-teal" : "border-white/30 text-white/70"}`}>
                {open && <ReviewDot />}{STATUS[s.status] ?? s.status}
              </span>
            </div>
            <h1 className="mt-2 font-mono text-[28px] leading-[1.1] font-bold break-words md:text-[40px]">{s.entityName}</h1>
            <p className="mt-2 text-[14px] text-white/70">
              #{s.number} · {s.kind === "new" ? `New ${NOUN[s.entityType]}` : <>Edits to <Link href={`/${s.entityType}/${s.entitySlug}`} className="underline">this {NOUN[s.entityType]}</Link></>}
              {" "}· by <span className="font-mono" style={{ color: tierColor(s.author) }} title={roleLabel(s.author)}>{s.author.username}</span> · {shortDate(s.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-10">
          {s.kind === "new" ? <NewDetails s={s} /> : <EditDetails s={s} />}

          {s.dependsOn && (
            <section>
              <SectionLabel>Goes in with</SectionLabel>
              <p className="text-[14px]">New artist <Link href={`/submission/${s.dependsOn.number}`} className="font-mono underline">{s.dependsOn.name}</Link> (#{s.dependsOn.number}, {STATUS[s.dependsOn.status]?.toLowerCase()})</p>
            </section>
          )}
          {(s.sources || s.note) && (
            <section>
              <SectionLabel>{s.sources ? "Sources" : "Note for editors"}</SectionLabel>
              {s.sources && <p className="border-t border-rule pt-3 text-[14px] whitespace-pre-line break-words">{s.sources}</p>}
              {s.note && s.sources && <p className="field-label mt-5 pb-2">Note for editors</p>}
              {s.note && <p className={`text-[14px] whitespace-pre-line break-words ${s.sources ? "" : "border-t border-rule pt-3"}`}>{s.note}</p>}
            </section>
          )}
          <section>
            <SectionLabel>Activity</SectionLabel>
            <ul className="flex flex-col gap-3 border-t border-rule pt-3">
              {s.events.map((e, i) => (
                <li key={i} className="text-[14px]">
                  <span className="font-mono">{e.who ?? "musicvolu.me"}</span>{" "}
                  <span className="text-white/75">{e.action === "submitted" ? "submitted this" : e.toStatus ? `moved it to ${STATUS[e.toStatus]?.toLowerCase() ?? e.toStatus}` : e.action === "edited" ? "changed the edit" : e.action}</span>
                  <span className="ml-2 text-[12px] text-white/45">{shortDate(e.when)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}

function NewDetails({ s }: { s: Submission }) {
  const to = (k: string) => s.changes[k]?.to;
  const artists = (to("artists") as PickedArtist[] | undefined) ?? [];
  const labels: Record<string, string> = {
    name: "Name", title: "Title", kind: "Type", origin: "From", started: "Started", website: "Website",
    type: "Type", releaseDate: s.entityType === "song" ? "First released" : "Release date", label: "Label", country: "Country",
    language: "Language", duration: "Length", genres: "Genres",
  };
  const rows = Object.entries(labels).filter(([k]) => typeof to(k) === "string" && to(k)).map(([k, label]) => ({
    label, value: k === "kind" ? (to(k) === "Band" ? "Group" : "Person") : String(to(k)),
  }));
  const tracks = (to("tracks") as { title: string; duration: string }[] | undefined) ?? [];
  const credits = (to("credits") as { role: string; name: string }[] | undefined) ?? [];
  return (
    <>
      <section>
        <SectionLabel>Details</SectionLabel>
        <FieldRows rows={[
          ...(artists.length ? [{
            label: "Artist", value: <>{artists.map((a, i) => (
              <span key={i}>{i > 0 && ", "}{a.review ? <Link href={`/submission/${a.review}`} className="underline">{a.name}</Link> : a.name}{a.review && <span className="ml-1.5 font-sans text-[12px] text-teal">in review</span>}</span>
            ))}</>,
          }] : []),
          ...rows,
        ]} />
      </section>
      {tracks.length > 0 && (
        <section>
          <SectionLabel>Tracklist · {tracks.length}</SectionLabel>
          <ol className="border-t border-rule">
            {tracks.map((t, i) => (
              <li key={i} className="flex items-baseline gap-3.5 border-b border-hair px-2 py-[9px]">
                <span className="w-5 font-mono text-[12px] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 font-mono text-[15px]">{t.title}</span>
                <span className="font-mono text-[12px] text-white/60">{t.duration}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {credits.length > 0 && (
        <section>
          <SectionLabel>Credits · {credits.length}</SectionLabel>
          <FieldRows rows={credits.map((c) => ({ label: c.role, value: c.name }))} />
        </section>
      )}
    </>
  );
}

function EditDetails({ s }: { s: Submission }) {
  // Rebuild before/after from the stored diff; fields not in it count as unchanged.
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const f of FIELDS[s.entityType]) { before[f.key] = ""; after[f.key] = ""; }
  before.tracks = after.tracks = before.credits = after.credits = [];
  for (const [k, c] of Object.entries(s.changes)) { before[k] = c.from ?? (Array.isArray(c.to) ? [] : ""); after[k] = c.to; }
  const changes = describeChanges(s.entityType, before as Values, after as Values);
  return (
    <section>
      <SectionLabel>Changes · {countChanges(changes)}</SectionLabel>
      <ul className="flex flex-col border-t border-rule">
        {changes.map((c) => (
          <li key={c.key} className="flex flex-col gap-1 border-b border-hair px-2 py-3 md:flex-row md:gap-4">
            <span className="field-label shrink-0 md:w-[160px] md:pt-0.5">{c.label}</span>
            <span className="min-w-0 font-mono text-[14px] leading-[1.5] break-words">
              {c.was ? <span className="block text-white/45 line-through">{c.was}</span> : null}
              {c.now !== undefined && <span className="block text-teal">{c.now || <span className="text-white/45">(empty)</span>}</span>}
              {c.added?.map((x) => <span key={`+${x}`} className="block text-teal">+ {x}</span>)}
              {c.removed?.map((x) => <span key={`-${x}`} className="block text-white/45 line-through">− {x}</span>)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
