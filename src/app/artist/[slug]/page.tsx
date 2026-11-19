// An artist. Figma: "Artist · Lorde · view".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { getViewer } from "@/lib/viewer";
import { Dot, EntryPage, ReleaseList } from "@/components/Entry";
import { PlusIcon } from "@/components/icons";
import { FieldRows, NoDatabase, SectionLabel } from "@/components/ui";
import { getArtist } from "@/lib/catalog";
import { genreList, plural } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/artist/[slug]">): Promise<Metadata> {
  const a = await getArtist((await params).slug);
  return { title: a?.name ?? "Artist" };
}

export default async function ArtistPage({ params, searchParams }: PageProps<"/artist/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const viewer = await getViewer();
  const a = await getArtist(slug);
  if (a === null) notFound();
  return (
    <>
      <Header q={q} />
      {!a ? <NoDatabase /> : (
        <EntryPage signedIn={!!viewer} kind="artist" slug={slug} q={q} cover={a.image} round tag="Artist" title={a.name}
          source={a.source} history={a.history} pending={a.pending}
          sub={<>
            {a.origin && <><span className="font-mono">{a.origin}</span><Dot /></>}
            {a.years && <><span className="font-mono">{a.years}</span><Dot /></>}
            <span>{plural(a.releases.length, "release")}</span>
          </>}>
          <section>
            <SectionLabel>Details</SectionLabel>
            <FieldRows rows={[
              { label: "Name", value: a.name },
              ...(a.disambiguation ? [{ label: "Note", value: a.disambiguation }] : []),
              { label: "Legal name", value: a.legalName ?? "" },
              { label: "Type", value: a.kind === "Band" ? "Group" : "Person" },
              { label: "From", value: a.origin ?? "" },
              { label: "Active", value: a.years ?? "" },
              { label: "Genres", value: genreList(a.genres) },
              { label: "Also known as", value: a.aliases.join(", ") },
            ]} />
          </section>
          {a.members.length > 0 && (
            <section>
              <SectionLabel>Members · {a.members.length}</SectionLabel>
              <FieldRows rows={a.members.map((m, i) => ({
                label: m.role || `Member ${i + 1}`,
                value: m.slug ? <Link href={`/artist/${m.slug}`} className="hover:underline">{m.name}</Link> : m.name,
              }))} />
            </section>
          )}
          <section>
            <SectionLabel right={<Link href={`/contribute?artist=${a.slug}`} className="inline-flex items-center gap-1.5 text-[14px] hover:underline"><PlusIcon /> Add a release</Link>}>
              Discography · {a.releases.length}
            </SectionLabel>
            <ReleaseList items={a.releases.map((r) => ({ ...r, right: plural(r.tracks, "track") }))} />
            <p className="pt-3 text-[13px] text-white/50">Releases are edited on their own pages.</p>
          </section>
        </EntryPage>
      )}
    </>
  );
}
