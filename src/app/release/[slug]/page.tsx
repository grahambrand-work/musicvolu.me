// An album, EP, single, live album or compilation. Figma: "Album · Melodrama · view".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { getViewer } from "@/lib/viewer";
import { Dot, EntryPage } from "@/components/Entry";
import { FieldRows, NoDatabase, SectionLabel } from "@/components/ui";
import { getRelease } from "@/lib/catalog";
import { duration, genreList, isoDate, plural, totalDuration, trackNo } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/release/[slug]">): Promise<Metadata> {
  const r = await getRelease((await params).slug);
  return { title: r ? `${r.title} · ${r.artists.map((a) => a.name).join(", ")}` : "Release" };
}

export default async function ReleasePage({ params, searchParams }: PageProps<"/release/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const viewer = await getViewer();
  const r = await getRelease(slug);
  if (r === null) notFound();
  const discs = r ? new Set(r.tracks.map((t) => t.disc)).size : 0;
  return (
    <>
      <Header q={q} />
      {!r ? <NoDatabase /> : (
        <EntryPage signedIn={!!viewer} kind="release" slug={slug} q={q} cover={r.cover ?? r.coverSmall} tag={r.type} title={r.title}
          source={r.source} history={r.history} pending={r.pending}
          sub={<>
            <span className="font-mono">{r.artists.map((a, i) => <span key={a.slug}>{i > 0 && ", "}<Link href={`/artist/${a.slug}`} className="hover:underline">{a.name}</Link></span>)}</span>
            {r.year && <><Dot /><span className="font-mono">{r.year}</span></>}
            {r.tracks.length > 0 && <><Dot /><span>{plural(r.tracks.length, "track")}{totalDuration(r.tracks.map((t) => t.duration)) && ` · ${totalDuration(r.tracks.map((t) => t.duration))}`}</span></>}
          </>}>
          <section>
            <SectionLabel>Details</SectionLabel>
            <FieldRows rows={[
              { label: "Title", value: r.title },
              { label: "Artist", value: r.artists.map((a) => a.name).join(", ") },
              { label: "Type", value: r.type },
              { label: "Release date", value: isoDate(r.releaseDate) || (r.year ? String(r.year) : "") },
              { label: "Genres", value: genreList(r.genres) },
              ...(r.editions ? [{ label: "Editions", value: `${r.editions} other edition${r.editions === 1 ? "" : "s"}` }] : []),
            ]} />
          </section>
          <section>
            <SectionLabel>Tracklist · {r.tracks.length}</SectionLabel>
            <ol className="border-t border-rule">
              {r.tracks.map((t, i) => (
                <li key={i} className="border-b border-hair">
                  {discs > 1 && (i === 0 || r.tracks[i - 1].disc !== t.disc) && <p className="field-label px-2 pt-4 pb-1">Disc {t.disc}</p>}
                  <Link href={`/song/${t.slug}`} className="flex items-baseline gap-3.5 px-2 py-[9px] leading-[1.2] hover:bg-white/4">
                    <span className="w-5 shrink-0 font-mono text-[12px] text-white/50">{trackNo(t.no)}</span>
                    <span className="min-w-0 flex-1 font-mono text-[15px]">{t.title}</span>
                    <span className="font-mono text-[12px] text-white/60">{duration(t.duration)}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {r.tracks.length === 0 && <p className="pt-3 text-[14px] text-white/60">No tracklist yet.</p>}
          </section>
        </EntryPage>
      )}
    </>
  );
}
