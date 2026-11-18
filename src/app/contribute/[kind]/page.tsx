// New artist / release / song form.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import NewEntryForm from "@/components/NewEntryForm";
import { getArtist } from "@/lib/catalog";
import type { NewKind, PickedArtist } from "@/lib/newEntry";
import { allowanceFor } from "@/lib/submissions";
import { getViewer } from "@/lib/viewer";

const KINDS: Record<string, NewKind> = { artist: "artist", release: "release", song: "song" };
const TITLES: Record<NewKind, string> = { artist: "New artist", release: "New release", song: "New song" };

export async function generateMetadata({ params }: PageProps<"/contribute/[kind]">): Promise<Metadata> {
  const kind = KINDS[(await params).kind];
  return { title: kind ? TITLES[kind] : "Add something new" };
}

export default async function NewEntryPage({ params, searchParams }: PageProps<"/contribute/[kind]">) {
  const [{ kind: k }, sp] = await Promise.all([params, searchParams]);
  const kind = KINDS[k];
  if (!kind) notFound();
  const viewer = await getViewer();
  const str = (x: string) => (typeof sp[x] === "string" ? (sp[x] as string).slice(0, 300) : "");
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/contribute/${kind}${str("title") ? `?title=${encodeURIComponent(str("title"))}` : ""}`)}`);
  let artist: PickedArtist | null = null;
  if (str("artist")) {
    const a = await getArtist(str("artist"));
    if (a) artist = { id: a.id, name: a.name };
  }
  const allowance = await allowanceFor(viewer).catch(() => ({ limit: null, used: 0, left: null }));
  return (
    <>
      <Header />
      <NewEntryForm kind={kind} prefill={{ title: str("title"), artist, type: str("type") }} allowance={allowance} />
    </>
  );
}
