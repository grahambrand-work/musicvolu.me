// A song. Figma: "Song · Royals · view".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { getViewer } from "@/lib/viewer";
import { Dot, EntryPage, ReleaseList } from "@/components/Entry";
import { FieldRows, NoDatabase, SectionLabel } from "@/components/ui";
import { getSong } from "@/lib/catalog";
import { duration, genreList } from "@/lib/format";

const KIND: Record<string, string> = { original: "Original", remix: "Remix", acoustic: "Acoustic version", "re-recording": "Re-recording" };
const ROLE: Record<string, string> = { main: "Artist", featured: "Featuring", with: "With" };

export async function generateMetadata({ params }: PageProps<"/song/[slug]">): Promise<Metadata> {
  const s = await getSong((await params).slug);
  return { title: s ? `${s.title} · ${s.artists[0]?.name ?? ""}` : "Song" };
}

export default async function SongPage({ params, searchParams }: PageProps<"/song/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const viewer = await getViewer();
  const s = await getSong(slug);
  if (s === null) notFound();
  const main = s?.artists.filter((a) => a.role === "main") ?? [];
  const others = s?.artists.filter((a) => a.role !== "main") ?? [];
  return (
    <>
      <Header q={q} />
      {!s ? <NoDatabase /> : (
        <EntryPage signedIn={!!viewer} kind="song" slug={slug} q={q} cover={s.cover} tag="Song" title={s.title}
          source={s.source} history={s.history} pending={s.pending}
          sub={<>
            <span className="font-mono">{main.map((a, i) => <span key={a.slug}>{i > 0 && ", "}<Link href={`/artist/${a.slug}`} className="hover:underline">{a.name}</Link></span>)}</span>
            {s.firstReleased && <><Dot /><span className="font-mono">{s.firstReleased}</span></>}
            {s.duration && <><Dot /><span className="font-mono">{duration(s.duration)}</span></>}
          </>}>
          <section>
            <SectionLabel>Details</SectionLabel>
            <FieldRows rows={[
              { label: "Title", value: s.title },
              { label: "Artist", value: main.map((a) => a.name).join(", ") },
              { label: "Length", value: duration(s.duration) },
              { label: "First released", value: s.firstReleased ? String(s.firstReleased) : "" },
              { label: "Version", value: KIND[s.kind] ?? s.kind },
              ...(s.original ? [{ label: "Original", value: <Link href={`/song/${s.original.slug}`} className="hover:underline">{s.original.title}</Link> }] : []),
              { label: "Genres", value: genreList(s.genres) },
            ]} />
          </section>
          {others.length > 0 && (
            <section>
              <SectionLabel>Credits · {others.length}</SectionLabel>
              <FieldRows rows={others.map((a) => ({ label: ROLE[a.role] ?? a.role, value: <Link href={`/artist/${a.slug}`} className="hover:underline">{a.name}</Link> }))} />
            </section>
          )}
          <section>
            <SectionLabel>Appears on · {s.appearsOn.length}</SectionLabel>
            <ReleaseList items={s.appearsOn.map((r) => ({ ...r, right: r.trackNo ? `Track ${r.trackNo}` : "" }))} />
          </section>
        </EntryPage>
      )}
    </>
  );
}
