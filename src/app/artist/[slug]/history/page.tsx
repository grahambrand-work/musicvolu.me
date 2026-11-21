// An artist's full edit history.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HistoryPage from "@/components/history/HistoryPage";
import { getArtist } from "@/lib/catalog";

export const metadata: Metadata = { title: "Edit history" };

export default async function ArtistHistory({ params, searchParams }: PageProps<"/artist/[slug]/history">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const a = await getArtist(slug);
  if (!a) notFound();
  return <HistoryPage kind="artist" slug={a.slug} id={a.id} tag="Artist" title={a.name} cover={a.image}
    sub={<span className="font-mono">{[a.origin, a.years].filter(Boolean).join(" · ")}</span>}
    show={typeof sp.show === "string" ? sp.show : undefined} />;
}
