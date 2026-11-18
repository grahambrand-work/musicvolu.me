// The entry preview beside the results (desktop) or in the phone sheet: key facts, the
// tracklist or discography, and a line about its edit history.
import Link from "next/link";
import { ArrowIcon, ClockIcon } from "@/components/icons";
import { Cover, FieldRows, SectionLabel, SuggestEditLink, Tag } from "@/components/ui";
import { getArtist, getRelease, getSong, type Kind, type Source } from "@/lib/catalog";
import { duration, genreList, longDate, trackNo } from "@/lib/format";
import { suggestHref } from "@/lib/links";

const SHOW_ROWS = 5; // phone shows the first few tracks, then "Show all"

export default async function Preview({ kind, slug, q, compact = false }: { kind: Kind; slug: string; q: string; compact?: boolean }) {
  const page = `/${kind}/${slug}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  if (kind === "release") {
    const r = await getRelease(slug);
    if (!r) return null;
    const tracks = compact ? r.tracks.slice(0, SHOW_ROWS) : r.tracks;
    return (
      <Shell cover={r.coverSmall ?? r.cover} tag={r.type} title={r.title} sub={[r.artists.map((a) => a.name).join(", "), r.year ? String(r.year) : ""]} page={page} kind={kind} slug={slug} compact={compact}>
        <FieldRows size="sm" labelWidth={compact ? 126 : 126} rows={[
          { label: "Artist", value: r.artists.map((a) => a.name).join(", ") },
          { label: "Type", value: r.type },
          { label: "Released", value: longDate(r.releaseDate) || (r.year ? String(r.year) : "") },
          { label: "Genres", value: genreList(r.genres) },
          { label: "Source", value: r.source.from === "user" ? "Members" : "MusicBrainz" },
        ]} />
        <div>
          <SectionLabel right={<Link href={suggestHref(kind, slug, "tracks")} className="text-[13px] text-white/80 hover:text-white">Suggest a tracklist fix</Link>}>
            Tracklist · {r.tracks.length}
          </SectionLabel>
          {tracks.map((t, i) => (
            <div key={i} className="flex items-baseline gap-3.5 py-1.5">
              <span className="w-5 shrink-0 font-mono text-[12px] text-white/45">{trackNo(t.no)}</span>
              <Link href={`/song/${t.slug}`} className="min-w-0 flex-1 truncate font-mono text-[14px] hover:underline">{t.title}</Link>
              <span className="font-mono text-[12px] text-white/60">{duration(t.duration)}</span>
            </div>
          ))}
          {compact && r.tracks.length > SHOW_ROWS && <Link href={page} className="mt-1 block text-[13px] text-white/80">Show all {r.tracks.length} tracks</Link>}
        </div>
        <HistoryLine source={r.source} />
      </Shell>
    );
  }
  if (kind === "artist") {
    const a = await getArtist(slug);
    if (!a) return null;
    const list = compact ? a.releases.slice(0, SHOW_ROWS) : a.releases.slice(0, 12);
    return (
      <Shell cover={a.image} round tag="Artist" title={a.name} sub={[a.origin ?? "", a.years ?? ""]} page={page} kind={kind} slug={slug} compact={compact}>
        <FieldRows size="sm" labelWidth={126} rows={[
          { label: "Type", value: a.kind === "Band" ? "Group" : "Person" },
          { label: "From", value: a.origin ?? "" },
          { label: "Active", value: a.years ?? "" },
          { label: "Genres", value: genreList(a.genres) },
          { label: "Source", value: a.source.from === "user" ? "Members" : "MusicBrainz" },
        ]} />
        <div>
          <SectionLabel>Discography · {a.releases.length}</SectionLabel>
          {list.map((r) => (
            <Link key={r.slug} href={`/release/${r.slug}`} className="flex items-baseline gap-3.5 py-1.5 hover:underline">
              <span className="w-9 shrink-0 font-mono text-[12px] text-white/45">{r.year ?? "····"}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{r.title}</span>
              <span className="font-mono text-[11px] text-white/55 uppercase">{r.type}</span>
            </Link>
          ))}
          {a.releases.length > list.length && <Link href={page} className="mt-1 block text-[13px] text-white/80">See all {a.releases.length} releases</Link>}
        </div>
        <HistoryLine source={a.source} />
      </Shell>
    );
  }
  const s = await getSong(slug);
  if (!s) return null;
  const main = s.artists.filter((x) => x.role === "main").map((x) => x.name).join(", ");
  return (
    <Shell cover={s.cover} tag="Song" title={s.title} sub={[main, duration(s.duration)]} page={page} kind={kind} slug={slug} compact={compact}>
      <FieldRows size="sm" labelWidth={126} rows={[
        { label: "Artist", value: main },
        { label: "Length", value: duration(s.duration) },
        { label: "First released", value: s.firstReleased ? String(s.firstReleased) : "" },
        { label: "Genres", value: genreList(s.genres) },
        { label: "Source", value: s.source.from === "user" ? "Members" : "MusicBrainz" },
      ]} />
      <div>
        <SectionLabel>Appears on · {s.appearsOn.length}</SectionLabel>
        {s.appearsOn.slice(0, compact ? SHOW_ROWS : 12).map((r) => (
          <Link key={r.slug} href={`/release/${r.slug}`} className="flex items-baseline gap-3.5 py-1.5 hover:underline">
            <span className="w-9 shrink-0 font-mono text-[12px] text-white/45">{r.year ?? "····"}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{r.title}</span>
            <span className="font-mono text-[11px] text-white/55 uppercase">{r.type}</span>
          </Link>
        ))}
      </div>
      <HistoryLine source={s.source} />
    </Shell>
  );
}

function Shell({ cover, round, tag, title, sub, page, kind, slug, compact, children }: {
  cover: string | null; round?: boolean; tag: string; title: string; sub: string[]; page: string; kind: Kind; slug: string; compact: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-5">
        <Cover src={cover} size={compact ? 88 : 120} round={round} />
        <div className="min-w-0 pt-0.5">
          <Tag>{tag}</Tag>
          <h2 className={`mt-1.5 font-mono font-bold leading-tight break-words ${compact ? "text-[24px]" : "text-[32px]"}`}>{title}</h2>
          <p className="mt-1 font-mono text-[15px] text-white/65">{sub.filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Link href={page} className="inline-flex items-center gap-1.5 rounded-full bg-white py-[7px] pr-3.5 pl-4 text-[14px] font-medium text-black hover:bg-white/85">
          Open full page <ArrowIcon />
        </Link>
        <SuggestEditLink href={suggestHref(kind, slug)} />
      </div>
      {children}
    </div>
  );
}

function HistoryLine({ source }: { source: Source }) {
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-white/60">
      <ClockIcon />
      <span>Edit history · {source.from === "user" ? "added by members" : <>imported from <span className="font-mono text-mbsync">MusicBrainz</span></>}</span>
    </p>
  );
}
