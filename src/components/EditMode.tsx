// Server side of edit mode (?edit=1): loads the entry and the member's monthly allowance,
// then hands over to the EditEntry form. Signed-out visitors are sent to log in first.
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Kind } from "@/lib/edits";
import { allowanceFor, canPushFinal, getEditable } from "@/lib/submissions";
import { tierColor } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import EditEntry from "./EditEntry";
import Header from "./Header";

const TAG: Record<Kind, string> = { artist: "Artist", release: "", song: "Song" };

export default async function EditMode({ kind, slug, focus, tag, children }: {
  kind: Kind; slug: string; focus?: string; tag?: string; children?: ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/${kind}/${slug}?edit=1`)}`);
  const entry = await getEditable(kind, slug);
  if (!entry) notFound();
  const allowance = await allowanceFor(viewer).catch(() => ({ limit: null, used: 0, left: null }));
  return (
    <>
      <div className="hidden md:contents"><Header /></div>
      <EditEntry kind={kind} slug={entry.slug} name={entry.name} tag={tag ?? TAG[kind]} cover={entry.cover} round={kind === "artist"}
        initial={entry.values} fixed={entry.fixed} allowance={allowance} focus={focus}
        pushColor={canPushFinal(viewer) ? tierColor(viewer) : undefined}>
        {children}
      </EditEntry>
    </>
  );
}
