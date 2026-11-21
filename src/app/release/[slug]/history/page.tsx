// A release's full edit history.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HistoryPage from "@/components/history/HistoryPage";
import { getRelease } from "@/lib/catalog";

export const metadata: Metadata = { title: "Edit history" };

export default async function ReleaseHistory({ params, searchParams }: PageProps<"/release/[slug]/history">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const r = await getRelease(slug);
  if (!r) notFound();
  return <HistoryPage kind="release" slug={r.slug} id={r.id} tag={r.type} title={r.title} cover={r.coverSmall ?? r.cover}
    sub={<span className="font-mono">{r.artists.map((a) => a.name).join(", ")}{r.year ? ` · ${r.year}` : ""}</span>}
    show={typeof sp.show === "string" ? sp.show : undefined} />;
}
