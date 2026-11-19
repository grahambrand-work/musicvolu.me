// Reading the music catalog (artists, releases, songs) from the Noteworthy database.
// Everything here is read-only; suggested edits live in musicvolume.submissions (lib/submissions.ts).
import "server-only";
import { cache } from "react";
import { db } from "./db";

export type Kind = "artist" | "release" | "song";

export type Hit = {
  kind: Kind;
  slug: string;
  title: string;
  /** Grey line under the title, e.g. ["Lorde", "2017", "11 tracks"]. */
  sub: string[];
  /** ARTIST, ALBUM, EP, SINGLE, LIVE, COMPILATION or SONG. */
  tag: string;
  cover: string | null;
  /** Lower is better: 0 exact, 1 starts with, 2 by a matching artist, 3 contains. */
  score: number;
  /** Tie-breaker: bigger first (releases for artists, track count for releases, appearances for songs). */
  weight: number;
};

export type SearchFilter = "all" | "artists" | "releases" | "songs";

/** Turns what was typed into a LIKE pattern: words in order, anything between them. */
function likePattern(q: string) {
  const words = q.toLowerCase().replace(/[%_\\*,()"':.]/g, " ").trim().split(/\s+/).filter(Boolean);
  return { words, pattern: words.join("%") };
}

function rank(title: string, q: string) {
  const t = title.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(` ${q}`)) return 2.5;
  return 3;
}

type ArtistRow = { id: string; slug: string; name: string; origin: string | null; image_url: string | null; matched: string; releases: number };
type ReleaseRow = { id: string; slug: string; title: string; type: string; year: number | null; cover: string | null; artist: string; tracks: number };
type SongRow = { id: string; slug: string; title: string; duration_seconds: number | null; cover: string | null; artist: string; album: string | null; appearances: number };

/** The full search behind the results page and the dropdown. */
export async function searchCatalog(raw: string, filter: SearchFilter = "all", limit = 40): Promise<Hit[] | null> {
  const sql = db();
  if (!sql) return null;
  const q = raw.trim().toLowerCase();
  const { words, pattern } = likePattern(q);
  if (!pattern) return [];
  const like = `%${pattern}%`;
  const want = (f: SearchFilter) => filter === "all" || filter === f;

  // Artists by their main name or any other name they go by ("ye" finds Kanye West).
  const findArtists = (p: string, n: number) => sql<ArtistRow[]>`
    with m as (
      (select id as artist_id, name from public.artists where name ilike ${`%${p}%`} limit 200)
      union all
      (select artist_id, name from public.artist_aliases where name ilike ${`%${p}%`} limit 200)
    ), best as (
      select distinct on (artist_id) artist_id, name
        from m
       order by artist_id, (lower(name) = ${p.replace(/%/g, " ")}) desc, length(name)
    )
    select a.id, a.slug, a.name, a.origin, a.image_url, b.name as matched,
           (select count(*) from public.releases r
             where r.artist_id = a.id and r.has_page and r.edition_of is null)::int as releases
      from best b join public.artists a on a.id = b.artist_id
     order by (lower(b.name) = ${p.replace(/%/g, " ")}) desc, releases desc, length(a.name)
     limit ${n}`;

  const artists = await findArtists(pattern, 20);
  const artistHits: Hit[] = artists.map((a) => ({
    kind: "artist", slug: a.slug, title: a.name, tag: "ARTIST", cover: a.image_url,
    sub: [a.origin, `${a.releases} release${a.releases === 1 ? "" : "s"}`].filter(Boolean) as string[],
    score: Math.min(rank(a.name, q), rank(a.matched, q)), weight: a.releases,
  }));

  // Releases and songs by the best-matching artists ("lorde" lists Lorde's music).
  const top = artistHits.filter((a) => a.score <= 1).slice(0, 2).map((h) => artists.find((a) => a.slug === h.slug)!.id);

  // "lorde royals" / "royals lorde": some words name the artist and the rest the title.
  const splits: { artist: string; title: string }[] = [];
  if (words.length > 1 && words.length <= 5) {
    for (let i = 1; i < words.length; i++) {
      splits.push({ artist: words.slice(0, i).join(" "), title: words.slice(i).join("%") });
      splits.push({ artist: words.slice(i).join(" "), title: words.slice(0, i).join("%") });
    }
  }
  const combos = await Promise.all(splits.map(async (s) => {
    const ids = (await sql<{ id: string }[]>`select id from public.artists where name ilike ${s.artist} limit 3`).map((r) => r.id);
    return { ...s, ids };
  }));

  const releaseCols = (rows: ReleaseRow[], score: (r: ReleaseRow) => number): Hit[] => rows.map((r) => ({
    kind: "release", slug: r.slug, title: r.title, tag: r.type.toUpperCase(), cover: r.cover,
    sub: [r.artist, r.year ? String(r.year) : null, `${r.tracks} track${r.tracks === 1 ? "" : "s"}`].filter(Boolean) as string[],
    score: score(r), weight: r.tracks + (r.type === "Album" ? 1000 : 0),
  }));
  const songCols = (rows: SongRow[], score: (s: SongRow) => number): Hit[] => rows.map((s) => ({
    kind: "song", slug: s.slug, title: s.title, tag: "SONG", cover: s.cover,
    sub: [s.artist, s.album, s.duration_seconds ? fmt(s.duration_seconds) : null].filter(Boolean) as string[],
    score: score(s), weight: s.appearances,
  }));

  const releaseSelect = (where: ReturnType<typeof sql>, n: number) => sql<ReleaseRow[]>`
    select r.id, r.slug, r.title, r.type, r.year, coalesce(r.cover_small_url, r.cover_url) as cover, a.name as artist,
           (select count(*) from public.tracks t where t.release_id = r.id)::int as tracks
      from public.releases r join public.artists a on a.id = r.artist_id
     where r.has_page and r.edition_of is null and ${where}
     limit ${n}`;
  const songSelect = (where: ReturnType<typeof sql>, n: number) => sql<SongRow[]>`
    select s.id, s.slug, s.title, s.duration_seconds, coalesce(s.cover_small_url, s.cover_url) as cover, a.name as artist,
           (select coalesce(p.title, r.title) from public.tracks t
              join public.releases r on r.id = t.release_id
              left join public.releases p on p.id = r.edition_of
             where t.song_id = s.id order by coalesce(p.year, r.year) nulls last limit 1) as album,
           (select count(*) from public.tracks t where t.song_id = s.id)::int as appearances
      from public.songs s join public.artists a on a.id = s.artist_id
     where ${where}
     limit ${n}`;

  const [relByTitle, relByArtist, songByTitle, songByArtist, ...comboRows] = await Promise.all([
    want("releases") ? releaseSelect(sql`r.title ilike ${like}`, 60) : Promise.resolve([] as ReleaseRow[]),
    want("releases") && top.length ? releaseSelect(sql`r.artist_id in ${sql(top)}`, 60) : Promise.resolve([] as ReleaseRow[]),
    want("songs") ? songSelect(sql`s.title ilike ${like}`, 60) : Promise.resolve([] as SongRow[]),
    want("songs") && top.length ? songSelect(sql`s.artist_id in ${sql(top)} and s.kind = 'original'`, 200) : Promise.resolve([] as SongRow[]),
    ...combos.filter((c) => c.ids.length).flatMap((c) => [
      want("releases") ? releaseSelect(sql`r.artist_id in ${sql(c.ids)} and r.title ilike ${`%${c.title}%`}`, 20) : Promise.resolve([] as ReleaseRow[]),
      want("songs") ? songSelect(sql`s.artist_id in ${sql(c.ids)} and s.title ilike ${`%${c.title}%`}`, 20) : Promise.resolve([] as SongRow[]),
    ]),
  ]);

  const comboTitles = combos.filter((c) => c.ids.length).flatMap((c) => [c.title.replace(/%/g, " "), c.title.replace(/%/g, " ")]);
  const comboHits = comboRows.flatMap((rows, i) => {
    const t = comboTitles[i];
    return "type" in (rows[0] ?? {})
      ? releaseCols(rows as ReleaseRow[], (r) => rank(r.title, t))
      : songCols(rows as SongRow[], (s) => rank(s.title, t));
  });

  const all = [
    ...(want("artists") ? artistHits : []),
    ...releaseCols(relByTitle, (r) => rank(r.title, q)),
    ...releaseCols(relByArtist, (r) => Math.min(rank(r.title, q), 2)),
    ...songCols(songByTitle, (s) => rank(s.title, q)),
    ...songCols(songByArtist, (s) => Math.min(rank(s.title, q), 2)),
    ...comboHits,
  ];
  // Same entry found more than one way: keep its best score.
  const seen = new Map<string, Hit>();
  for (const h of all) {
    const key = `${h.kind}:${h.slug}`;
    const was = seen.get(key);
    if (!was || h.score < was.score) seen.set(key, h);
  }
  const kindOrder: Record<Kind, number> = { artist: 0, release: 1, song: 2 };
  return [...seen.values()]
    .sort((a, b) => a.score - b.score || kindOrder[a.kind] - kindOrder[b.kind] || b.weight - a.weight || a.title.length - b.title.length)
    .slice(0, limit);
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The homepage dropdown: a few of each kind. */
export async function suggest(q: string) {
  const hits = (await searchCatalog(q, "all", 60)) ?? [];
  return {
    artists: hits.filter((h) => h.kind === "artist").slice(0, 2),
    releases: hits.filter((h) => h.kind === "release").slice(0, 3),
    songs: hits.filter((h) => h.kind === "song").slice(0, 3),
  };
}

// ---------------------------------------------------------------- entries

export type Source = { from: "musicbrainz" | "user"; label: string; id: string | null };
export type HistoryItem = { who: string; when: Date; status: string; text: string };

export type Artist = {
  id: string; slug: string; name: string; kind: string; disambiguation: string | null;
  origin: string | null; years: string | null; image: string | null;
  legalName: string | null; aliases: string[]; genres: string[];
  members: { name: string; role: string | null; slug: string | null }[];
  releases: { slug: string; title: string; type: string; year: number | null; tracks: number; cover: string | null }[];
  born: string | null; website: string | null;
  source: Source; history: HistoryItem[]; pending: number;
};

export type Release = {
  id: string; slug: string; title: string; type: string; year: number | null; releaseDate: Date | string | null;
  cover: string | null; coverSmall: string | null;
  artists: { name: string; slug: string }[];
  genres: string[]; editions: number;
  tracks: { id: string; disc: number; no: number | null; title: string; slug: string; duration: number | null }[];
  label: string | null; country: string | null; language: string | null;
  source: Source; history: HistoryItem[]; pending: number;
};

export type Song = {
  id: string; slug: string; title: string; kind: string; duration: number | null; cover: string | null;
  artists: { name: string; slug: string; role: string }[];
  original: { title: string; slug: string } | null;
  firstReleased: number | null; genres: string[];
  appearsOn: { slug: string; title: string; type: string; year: number | null; trackNo: number | null; cover: string | null }[];
  language: string | null; credits: { role: string; name: string }[];
  source: Source; history: HistoryItem[]; pending: number;
};

/** Published edits on an entry (newest first) and how many are still waiting for review. */
async function historyFor(entity: Kind, id: string): Promise<{ history: HistoryItem[]; pending: number }> {
  const sql = db()!;
  try {
    const [rows, open] = await Promise.all([
      sql<{ username: string; published_at: Date; number: string; changes: Record<string, unknown>; kind: string }[]>`
        select m.username, s.published_at, s.number, s.changes, s.kind
          from musicvolume.submissions s join musicvolume.members m on m.id = s.member_id
         where s.entity_type = ${entity} and s.entity_id = ${id} and s.status = 'published'
         order by s.published_at desc limit 5`,
      sql<{ n: number }[]>`
        select count(*)::int as n from musicvolume.submissions
         where entity_type = ${entity} and entity_id = ${id} and status in ('needs_review', 'in_review', 'changes_requested', 'final_review')`,
    ]);
    return {
      history: rows.map((r) => ({
        who: r.username, when: r.published_at, status: `#${r.number}`,
        text: r.kind === "new" ? "added this" : `changed ${Object.keys(r.changes).length} field${Object.keys(r.changes).length === 1 ? "" : "s"}`,
      })),
      pending: open[0]?.n ?? 0,
    };
  } catch {
    // The submissions tables aren't on this database yet.
    return { history: [], pending: 0 };
  }
}

/** Columns added by migration 20261118000200. Empty until it's applied. */
async function extras<T extends object>(q: () => Promise<T[]>, empty: T): Promise<T> {
  try { return (await q())[0] ?? empty; } catch { return empty; }
}

export const getArtist = cache(async (slug: string): Promise<Artist | null | undefined> => {
  const sql = db();
  if (!sql) return undefined;
  const [a] = await sql<{ id: string; slug: string; name: string; kind: string; disambiguation: string | null; origin: string | null; years: string | null; image_url: string | null; musicbrainz_id: string | null; source: string; genres: string[]; created_at: Date }[]>`
    select id, slug, name, kind, disambiguation, origin, years, image_url, musicbrainz_id, source, genres, created_at
      from public.artists where slug = ${slug}`;
  if (!a) return null;
  const [aliases, genres, members, releases, hist] = await Promise.all([
    sql<{ name: string; kind: string }[]>`select name, kind from public.artist_aliases where artist_id = ${a.id} order by kind, name`,
    sql<{ name: string }[]>`select g.name from public.artist_genres ag join public.genres g on g.id = ag.genre_id where ag.artist_id = ${a.id} order by ag.position`,
    sql<{ name: string; role: string | null; slug: string | null }[]>`
      select m.name, m.role, x.slug from public.artist_members m left join public.artists x on x.id = m.member_artist_id
       where m.band_id = ${a.id} order by m.position`,
    sql<{ slug: string; title: string; type: string; year: number | null; tracks: number; cover: string | null }[]>`
      select r.slug, r.title, r.type, r.year, coalesce(r.cover_small_url, r.cover_url) as cover,
             (select count(*) from public.tracks t where t.release_id = r.id)::int as tracks
        from public.releases r
       where r.has_page and r.edition_of is null
         and (r.artist_id = ${a.id} or exists (select 1 from public.artist_credits c where c.release_id = r.id and c.artist_id = ${a.id}))
       order by r.year desc nulls last, r.title`,
    historyFor("artist", a.id),
  ]);
  const more = await extras(() => sql<{ born: string | null; website: string | null }[]>`select born, website from public.artists where id = ${a.id}`, { born: null, website: null });
  return {
    id: a.id, slug: a.slug, name: a.name, kind: a.kind, disambiguation: a.disambiguation, origin: a.origin, years: a.years,
    image: a.image_url,
    legalName: aliases.find((x) => x.kind === "Legal name")?.name ?? null,
    aliases: aliases.filter((x) => x.kind === "Also known as").map((x) => x.name),
    genres: genres.length ? genres.map((g) => g.name) : a.genres,
    members, releases, ...more,
    source: { from: a.source === "user" ? "user" : "musicbrainz", label: "artist", id: a.musicbrainz_id },
    ...hist,
  };
});

export const getRelease = cache(async (slug: string): Promise<Release | null | undefined> => {
  const sql = db();
  if (!sql) return undefined;
  const [r] = await sql<{ id: string; slug: string; title: string; type: string; year: number | null; release_date: Date | null; cover_url: string | null; cover_small_url: string | null; source: string; genres: string[]; musicbrainz_release_group_id: string | null; edition_of: string | null; parent_slug: string | null; artist_id: string }[]>`
    select r.id, r.slug, r.title, r.type, r.year, r.release_date, r.cover_url, r.cover_small_url, r.source, r.genres,
           r.musicbrainz_release_group_id, r.edition_of, p.slug as parent_slug, r.artist_id
      from public.releases r left join public.releases p on p.id = r.edition_of
     where r.slug = ${slug}`;
  if (!r) return null;
  const [credits, main, genres, tracks, editions, hist] = await Promise.all([
    sql<{ name: string; slug: string }[]>`
      select coalesce(c.credited_as, a.name) as name, a.slug from public.artist_credits c join public.artists a on a.id = c.artist_id
       where c.release_id = ${r.id} and c.role = 'main' order by c.position`,
    sql<{ name: string; slug: string }[]>`select name, slug from public.artists where id = ${r.artist_id}`,
    sql<{ name: string }[]>`select g.name from public.release_genres rg join public.genres g on g.id = rg.genre_id where rg.release_id = ${r.id} order by rg.position`,
    sql<{ id: string; disc: number; no: number | null; title: string; slug: string; duration: number | null }[]>`
      select t.id, t.disc_no as disc, t.track_no as no, s.title, s.slug, coalesce(t.duration_seconds, s.duration_seconds) as duration
        from public.tracks t join public.songs s on s.id = t.song_id
       where t.release_id = ${r.id} order by t.disc_no, t.track_no nulls last, s.title`,
    sql<{ n: number }[]>`select count(*)::int as n from public.releases where edition_of = ${r.id}`,
    historyFor("release", r.id),
  ]);
  const more = await extras(() => sql<{ label: string | null; country: string | null; language: string | null }[]>`
    select label, country, language from public.releases where id = ${r.id}`, { label: null, country: null, language: null });
  return {
    id: r.id, slug: r.slug, title: r.title, type: r.type, year: r.year, releaseDate: r.release_date,
    cover: r.cover_url, coverSmall: r.cover_small_url,
    artists: credits.length ? credits : main,
    genres: genres.length ? genres.map((g) => g.name) : r.genres,
    editions: editions[0]?.n ?? 0,
    tracks, ...more,
    source: { from: r.source === "user" ? "user" : "musicbrainz", label: "release group", id: r.musicbrainz_release_group_id },
    ...hist,
  };
});

export const getSong = cache(async (slug: string): Promise<Song | null | undefined> => {
  const sql = db();
  if (!sql) return undefined;
  const [s] = await sql<{ id: string; slug: string; title: string; kind: string; duration_seconds: number | null; cover: string | null; source: string; artist_id: string; orig_title: string | null; orig_slug: string | null }[]>`
    select s.id, s.slug, s.title, s.kind, s.duration_seconds, coalesce(s.cover_url, s.cover_small_url) as cover, s.source, s.artist_id,
           o.title as orig_title, o.slug as orig_slug
      from public.songs s left join public.songs o on o.id = s.original_song_id
     where s.slug = ${slug}`;
  if (!s) return null;
  const [credits, main, genres, appears, recording, hist] = await Promise.all([
    sql<{ name: string; slug: string; role: string }[]>`
      select coalesce(c.credited_as, a.name) as name, a.slug, c.role from public.artist_credits c join public.artists a on a.id = c.artist_id
       where c.song_id = ${s.id} order by c.role = 'main' desc, c.position`,
    sql<{ name: string; slug: string; role: string }[]>`select name, slug, 'main' as role from public.artists where id = ${s.artist_id}`,
    sql<{ name: string }[]>`select g.name from public.song_genres sg join public.genres g on g.id = sg.genre_id where sg.song_id = ${s.id} order by sg.position`,
    // Editions (deluxe, remaster…) show as the album they belong to.
    sql<{ slug: string; title: string; type: string; year: number | null; track_no: number | null; cover: string | null }[]>`
      select distinct on (coalesce(p.id, r.id))
             coalesce(p.slug, r.slug) as slug, coalesce(p.title, r.title) as title, coalesce(p.type, r.type) as type,
             coalesce(p.year, r.year) as year, t.track_no, coalesce(p.cover_small_url, r.cover_small_url, p.cover_url, r.cover_url) as cover
        from public.tracks t join public.releases r on r.id = t.release_id left join public.releases p on p.id = r.edition_of
       where t.song_id = ${s.id}
       order by coalesce(p.id, r.id), (r.edition_of is null) desc, t.track_no`,
    sql<{ id: string | null }[]>`select musicbrainz_recording_id as id from public.tracks where song_id = ${s.id} and musicbrainz_recording_id is not null limit 1`,
    historyFor("song", s.id),
  ]);
  const [more, credits2] = await Promise.all([
    extras(() => sql<{ language: string | null }[]>`select language from public.songs where id = ${s.id}`, { language: null }),
    sql<{ role: string; name: string }[]>`select role, name from public.song_credits where song_id = ${s.id} order by position, created_at`.catch(() => []),
  ]);
  const appearsOn = appears.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title))
    .map((x) => ({ slug: x.slug, title: x.title, type: x.type, year: x.year, trackNo: x.track_no, cover: x.cover }));
  return {
    id: s.id, slug: s.slug, title: s.title, kind: s.kind, duration: s.duration_seconds, cover: s.cover,
    artists: credits.length ? credits : main,
    original: s.orig_slug ? { title: s.orig_title!, slug: s.orig_slug } : null,
    firstReleased: appearsOn.find((x) => x.year)?.year ?? null,
    genres: genres.map((g) => g.name),
    appearsOn, language: more.language, credits: credits2,
    source: { from: s.source === "user" ? "user" : "musicbrainz", label: "recording", id: recording[0]?.id ?? null },
    ...hist,
  };
});
