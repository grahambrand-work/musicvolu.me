// A song's full edit history.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HistoryPage from "@/components/history/HistoryPage";
import { getSong } from "@/lib/catalog";

export const metadata: Metadata = { title: "Edit history" };

export default async function SongHistory({ params, searchParams }: PageProps<"/song/[slug]/history">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const s = await getSong(slug);
  if (!s) notFound();
  return <HistoryPage kind="song" slug={s.slug} id={s.id} tag="Song" title={s.title} cover={s.cover}
    sub={<span className="font-mono">{s.artists.filter((a) => a.role === "main").map((a) => a.name).join(", ")}{s.firstReleased ? ` · ${s.firstReleased}` : ""}</span>}
    show={typeof sp.show === "string" ? sp.show : undefined} />;
}
