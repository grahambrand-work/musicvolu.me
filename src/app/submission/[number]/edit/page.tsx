// Change a sent edit: the edit form, filled with what the edit suggests, compared with the
// live entry. The sender and editors can use it (see reviseBlock in lib/review.ts).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import EditEntry from "@/components/EditEntry";
import Header from "@/components/Header";
import { lastDecision, reviseBlock } from "@/lib/review";
import { getEditable, getSubmission } from "@/lib/submissions";
import type { Values } from "@/lib/edits";
import { getViewer } from "@/lib/viewer";

const TAG = { artist: "Artist", release: "", song: "Song" } as const;

export default async function ReviseEdit({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = Number(raw);
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/submission/${raw}/edit`)}`);
  const s = await getSubmission(number);
  if (!s) notFound();
  const back = s.author.username === viewer.username ? `/submission/${number}` : `/review/${number}`;
  const last = await lastDecision(s.id);
  const block = s.kind !== "edit" ? "New entries can't be changed here yet. Leave a comment on it instead."
    : !s.entitySlug ? "The entry this edit is for no longer exists."
    : reviseBlock(viewer, s, last && last.id !== viewer.id ? last : null);
  const entry = !block && s.entitySlug ? await getEditable(s.entityType, s.entitySlug) : null;
  if (block || !entry) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-[640px] px-4 py-16">
          <h1 className="text-[24px] font-semibold">Can&rsquo;t change #{number}</h1>
          <p className="mt-3 text-white/70">{block ?? "The entry this edit is for no longer exists."}</p>
          <Link href={back} className="mt-6 inline-block underline">Back to #{number}</Link>
        </main>
      </>
    );
  }
  // What the edit suggests, on top of the live entry.
  const suggested = { ...entry.values } as Record<string, unknown>;
  for (const [k, c] of Object.entries(s.changes as Record<string, { to?: unknown }>)) {
    if (k in suggested && c?.to !== undefined) suggested[k] = c.to;
  }
  return (
    <>
      <div className="hidden md:contents"><Header /></div>
      <EditEntry kind={s.entityType} slug={entry.slug} name={entry.name} tag={s.entityType === "release" ? String((entry.values as Record<string, unknown>).type ?? "") : TAG[s.entityType]}
        cover={entry.cover} round={s.entityType === "artist"} initial={suggested as Values} fixed={entry.fixed}
        allowance={{ limit: null, left: null }}
        revise={{ number, base: entry.values, note: s.author.username === viewer.username ? s.note ?? "" : "", back }} />
    </>
  );
}
