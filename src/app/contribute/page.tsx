// "Add something new": search first so nothing gets added twice (Figma "Search-first add").
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getViewer } from "@/lib/viewer";
import ContributeStart from "./ContributeStart";

export const metadata: Metadata = { title: "Add something new" };

export default async function ContributePage({ searchParams }: PageProps<"/contribute">) {
  const sp = await searchParams;
  const artist = typeof sp.artist === "string" ? sp.artist : "";
  if (artist) redirect(`/contribute/release?artist=${encodeURIComponent(artist)}`);
  if (!(await getViewer())) redirect("/login?next=%2Fcontribute");
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  return (
    <>
      <Header />
      <ContributeStart initial={q} />
    </>
  );
}
