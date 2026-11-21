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
  /** Lower is better: 0 exact, 1 starts with, 2 by a matching artist, 3 contains,
   *  minus up to 2 for popularity (so a popular match can rank above a closer obscure one). */
  score: number;
  /** Tie-breaker: bigger first (releases for artists, track count for releases, appearances for songs). */
  weight: number;
  /** A new entry someone has submitted that isn't published yet: its submission number. */
  review?: number;
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

type ArtistRow = { id: string; slug: string; name: string; genre: string | null; image_url: string | null; matched: string; releases: number; pop: number };
type ReleaseRow = { id: string; slug: string; title: string; type: string; year: number | null; cover: string | null; artist: string; tracks: number; pop: number };
type SongRow = { id: string; slug: string; title: string; duration_seconds: number | null; cover: string | null; artist: string; album: string | null; appearances: number; pop: number };

/** A popular entry ranks up to two steps higher ("Royals" by Lorde above other songs called Royals). */
const BOOST = 2;

// public.search_popular (from Noteworthy's migration 20261121000100_search_popularity) lists the
// catalog entries people are most likely looking for, each with a popularity from 0 to 1. Until it
// is on the database, search works as before without it.
let popularReady: Promise<boolean> | null = null;
function hasPopular(sql: NonNullable<ReturnType<typeof db>>) {
  popularReady ??= sql<{ ok: boolean }[]>`select to_regclass('public.search_popular') is not null as ok`
    .then((r) => r[0]?.ok === true)
    .catch(() => false)
    .then((ok) => { if (!ok) setTimeout(() => { popularReady = null; }, 60_000); return ok; });
  return popularReady;
}

/** The full search behind the results page and the dropdown. */
export async function searchCatalog(raw: string, filter: SearchFilter = "all", limit = 40): Promise<Hit[] | null> {
  const sql = db();
  if (!sql) return null;
  const q = raw.trim().toLowerCase();
  const { words, pattern } = likePattern(q);
  if (!pattern) return [];
  const like = `%${pattern}%`;
  const want = (f: SearchFilter) => filter === "all" || filter === f;
  const popular = await hasPopular(sql);
  // How popular an entry is (0 when it isn't on the list).
  const popCol = (kind: Kind, id: ReturnType<typeof sql>) => popular
    ? sql`coalesce((select max(sp.popularity) from public.search_popular sp where sp.kind = ${kind} and sp.item_id = ${id}), 0)::float8`
    : sql`0::float8`;
  // The most popular entries of one kind whose name contains the words (or by the given artists).
  const popIds = (kind: Kind, where: ReturnType<typeof sql>, n: number) =>
    sql`(select sp.item_id from public.search_popular sp where sp.kind = ${kind} and ${where} order by sp.popularity desc limit ${n})`;

  // Artists by their main name or any other name they go by ("ye" finds Kanye West),
  // the most popular ones first.
  const findArtists = (p: string, n: number) => sql<ArtistRow[]>`
    with m as (
      ${popular ? sql`(select item_id as artist_id, name from public.search_popular where kind = 'artist' and name ilike ${`%${p}%`} order by popularity desc limit 40)
      union all` : sql``}
      (select id as artist_id, name from public.artists where name ilike ${`%${p}%`} limit 200)
      union all
      (select artist_id, name from public.artist_aliases where name ilike ${`%${p}%`} limit 200)
    ), best as (
      select distinct on (artist_id) artist_id, name
        from m
       order by artist_id, (lower(name) = ${p.replace(/%/g, " ")}) desc, length(name)
    )
    select a.id, a.slug, a.name, a.image_url, b.name as matched,
           coalesce((select g.name from public.artist_genres ag join public.genres g on g.id = ag.genre_id
                        where ag.artist_id = a.id order by ag.position limit 1), a.genres[1]) as genre,
           (select count(*) from public.releases r
             where r.artist_id = a.id and r.has_page and r.edition_of is null)::int as releases,
           ${popCol("artist", sql`a.id`)} as pop
      from best b join public.artists a on a.id = b.artist_id
     order by (lower(b.name) = ${p.replace(/%/g, " ")}) desc, pop desc, releases desc, length(a.name)
     limit ${n}`;

  const artists = await findArtists(pattern, 20);
  const artistHits: Hit[] = artists.map((a) => ({
    kind: "artist", slug: a.slug, title: a.name, tag: "ARTIST", cover: a.image_url,
    sub: [genreLabel(a.genre), `${a.releases} release${a.releases === 1 ? "" : "s"}`].filter(Boolean) as string[],
    score: Math.min(rank(a.name, q), rank(a.matched, q)) - BOOST * a.pop, weight: a.releases,
  }));

  // Releases and songs by the best-matching artists ("lorde" lists Lorde's music).
  const top = artists.filter((a) => Math.min(rank(a.name, q), rank(a.matched, q)) <= 1)
    .sort((a, b) => b.pop - a.pop).slice(0, 2).map((a) => a.id);

  // "lorde royals" / "royals lorde": some words name the artist and the rest the title.
  const splits: { artist: string; title: string }[] = [];
  if (words.length > 1 && words.length <= 5) {
    for (let i = 1; i < words.length; i++) {
      splits.push({ artist: words.slice(0, i).join(" "), title: words.slice(i).join("%") });
      splits.push({ artist: words.slice(i).join(" "), title: words.slice(0, i).join("%") });
    }
  }
  const combos = await Promise.all(splits.map(async (s) => {
    const ids = (await sql<{ id: string }[]>`
      select a.id from public.artists a where a.name ilike ${s.artist}
       order by ${popCol("artist", sql`a.id`)} desc limit 3`).map((r) => r.id);
    return { ...s, ids };
  }));

  const releaseCols = (rows: ReleaseRow[], score: (r: ReleaseRow) => number): Hit[] => rows.map((r) => ({
    kind: "release", slug: r.slug, title: r.title, tag: r.type.toUpperCase(), cover: r.cover,
    sub: [r.artist, r.year ? String(r.year) : null, `${r.tracks} track${r.tracks === 1 ? "" : "s"}`].filter(Boolean) as string[],
    score: score(r) - BOOST * r.pop, weight: r.tracks + (r.type === "Album" ? 1000 : 0),
  }));
  const songCols = (rows: SongRow[], score: (s: SongRow) => number): Hit[] => rows.map((s) => ({
    kind: "song", slug: s.slug, title: s.title, tag: "SONG", cover: s.cover,
    sub: [s.artist, s.album, s.duration_seconds ? fmt(s.duration_seconds) : null].filter(Boolean) as string[],
    score: score(s) - BOOST * s.pop, weight: s.appearances,
  }));

  const releaseSelect = (where: ReturnType<typeof sql>, n: number) => sql<ReleaseRow[]>`
    select r.id, r.slug, r.title, r.type, r.year, coalesce(r.cover_small_url, r.cover_url) as cover, a.name as artist,
           (select count(*) from public.tracks t where t.release_id = r.id)::int as tracks,
           ${popCol("release", sql`r.id`)} as pop
      from public.releases r join public.artists a on a.id = r.artist_id
     where r.has_page and r.edition_of is null and ${where}
     limit ${n}`;
  const songSelect = (where: ReturnType<typeof sql>, n: number) => sql<SongRow[]>`
    select s.id, s.slug, s.title, s.duration_seconds, coalesce(s.cover_small_url, s.cover_url) as cover, a.name as artist,
           (select coalesce(p.title, r.title) from public.tracks t
              join public.releases r on r.id = t.release_id
              left join public.releases p on p.id = r.edition_of
             where t.song_id = s.id order by coalesce(p.year, r.year) nulls last limit 1) as album,
           (select count(*) from public.tracks t where t.song_id = s.id)::int as appearances,
           ${popCol("song", sql`s.id`)} as pop
      from public.songs s join public.artists a on a.id = s.artist_id
     where ${where}
     limit ${n}`;

  // New entries waiting for review show up straight away, marked "in review".
  type PendingRow = { number: string; entity_type: Kind; entity_name: string; artist: string | null; rtype: string | null };
  const pending = sql<PendingRow[]>`
    select number, entity_type, entity_name, changes->'artists'->'to'->0->>'name' as artist, changes->'type'->>'to' as rtype
      from musicvolume.submissions
     where kind = 'new' and status in ('needs_review', 'in_review', 'changes_requested', 'final_review')
       and entity_name ilike ${like}
     order by created_at desc limit 20`.catch(() => [] as PendingRow[]);

  // The most popular matches, which the "contains" searches below can miss among millions of rows.
  const none = <T,>() => Promise.resolve([] as T[]);
  const popularRows = Promise.all([
    popular && want("releases") ? releaseSelect(sql`r.id in ${popIds("release", sql`sp.name ilike ${like}`, 40)}`, 40) : none<ReleaseRow>(),
    popular && want("releases") && top.length ? releaseSelect(sql`r.id in ${popIds("release", sql`sp.artist_id in ${sql(top)}`, 40)}`, 40) : none<ReleaseRow>(),
    popular && want("songs") ? songSelect(sql`s.id in ${popIds("song", sql`sp.name ilike ${like}`, 60)}`, 60) : none<SongRow>(),
    popular && want("songs") && top.length ? songSelect(sql`s.id in ${popIds("song", sql`sp.artist_id in ${sql(top)}`, 80)}`, 80) : none<SongRow>(),
  ]);

  const [relByTitle, relByArtist, songByTitle, songByArtist, pendingRows, ...comboRows] = await Promise.all([
    want("releases") ? releaseSelect(sql`r.title ilike ${like}`, 60) : Promise.resolve([] as ReleaseRow[]),
    want("releases") && top.length ? releaseSelect(sql`r.artist_id in ${sql(top)}`, 60) : Promise.resolve([] as ReleaseRow[]),
    want("songs") ? songSelect(sql`s.title ilike ${like}`, 60) : Promise.resolve([] as SongRow[]),
    want("songs") && top.length ? songSelect(sql`s.artist_id in ${sql(top)} and s.kind = 'original'`, 200) : Promise.resolve([] as SongRow[]),
    pending,
    ...combos.filter((c) => c.ids.length).flatMap((c) => [
      want("releases") ? releaseSelect(sql`r.artist_id in ${sql(c.ids)} and r.title ilike ${`%${c.title}%`}`, 20) : Promise.resolve([] as ReleaseRow[]),
      want("songs") ? songSelect(sql`s.artist_id in ${sql(c.ids)} and s.title ilike ${`%${c.title}%`}`, 20) : Promise.resolve([] as SongRow[]),
    ]),
  ]);

  const [relPopular, relPopularByArtist, songPopular, songPopularByArtist] = await popularRows;

  const comboTitles = combos.filter((c) => c.ids.length).flatMap((c) => [c.title.replace(/%/g, " "), c.title.replace(/%/g, " ")]);
  const comboHits = comboRows.flatMap((rows, i) => {
    const t = comboTitles[i];
    return "type" in (rows[0] ?? {})
      ? releaseCols(rows as ReleaseRow[], (r) => rank(r.title, t))
      : songCols(rows as SongRow[], (s) => rank(s.title, t));
  });

  const filterOf: Record<Kind, SearchFilter> = { artist: "artists", release: "releases", song: "songs" };
  const pendingHits: Hit[] = pendingRows.filter((p) => want(filterOf[p.entity_type])).map((p) => ({
    kind: p.entity_type, slug: `review-${p.number}`, title: p.entity_name, cover: null, review: Number(p.number),
    tag: p.entity_type === "artist" ? "ARTIST" : p.entity_type === "song" ? "SONG" : (p.rtype ?? "Album").toUpperCase(),
    sub: ["In review", p.artist].filter(Boolean) as string[],
    score: rank(p.entity_name, q) + 0.1, weight: 0,
  }));

  const all = [
    ...(want("artists") ? artistHits : []),
    ...pendingHits,
    ...releaseCols(relPopular, (r) => rank(r.title, q)),
    ...releaseCols(relPopularByArtist, (r) => Math.min(rank(r.title, q), 2)),
    ...songCols(songPopular, (s) => rank(s.title, q)),
    ...songCols(songPopularByArtist, (s) => Math.min(rank(s.title, q), 2)),
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

/** An artist's main genre for the grey line under their name: "hip hop" → "Hip hop". */
const genreLabel = (g: string | null) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : null);

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type Suggestions = { artists: Hit[]; releases: Hit[]; songs: Hit[] };
const SHOW: Record<Kind, number> = { artist: 2, release: 3, song: 3 };

/**
 * The dropdown while typing: a few of each kind, fast. It looks in public.search_popular (the
 * catalog entries people are most likely after, ~1/20 of the catalog, with its own index) and
 * only fetches details for the handful it shows. When a kind has too few popular matches it
 * tops up from the full catalog, from 3 letters on (2-letter "contains" searches can't use the
 * title index and would read millions of rows). The results page still runs the full search.
 */
export async function suggest(raw: string): Promise<Suggestions> {
  const sql = db();
  const empty: Suggestions = { artists: [], releases: [], songs: [] };
  if (!sql) return empty;
  const q = raw.trim().toLowerCase();
  const { words, pattern } = likePattern(q);
  if (!pattern) return empty;
  if (!(await hasPopular(sql))) {
    const hits = (await searchCatalog(q, "all", 60)) ?? [];
    return { artists: hits.filter((h) => h.kind === "artist").slice(0, 2), releases: hits.filter((h) => h.kind === "release").slice(0, 3), songs: hits.filter((h) => h.kind === "song").slice(0, 3) };
  }
  const like = `%${pattern}%`;
  const plain = pattern.replace(/%/g, " ");

  // "lorde royals" / "royals lorde": one part names a popular artist, the rest the title.
  const splits: { artist: string; title: string }[] = [];
  if (words.length > 1 && words.length <= 4) {
    for (let i = 1; i < words.length; i++) {
      splits.push({ artist: words.slice(0, i).join(" "), title: `%${words.slice(i).join("%")}%` });
      splits.push({ artist: words.slice(i).join(" "), title: `%${words.slice(0, i).join("%")}%` });
    }
  }
  type Cand = { kind: Kind; item_id: string; name: string; popularity: number; combo: boolean };
  const [byName, ...byCombo] = await Promise.all([
    // Per kind, exact and starts-with first, then the most popular.
    sql<Cand[]>`
      select * from (
        select kind, item_id, name, popularity, false as combo,
               row_number() over (partition by kind order by (lower(name) = ${plain}) desc,
                                  (lower(name) like ${`${pattern}%`}) desc, popularity desc) as n
          from public.search_popular
         -- Two letters can't use the name index: leave out songs (most of the list) until a third.
         where name ilike ${like} ${q.length < 3 ? sql`and kind <> 'song'` : sql``}) x
       where n <= 12`,
    // An artist part under 3 letters can't use the name index, so those splits are skipped.
    ...splits.filter((c) => c.artist.length >= 3).map((c) => sql<Cand[]>`
      select sp.kind, sp.item_id, sp.name, sp.popularity, true as combo from public.search_popular sp
       where sp.kind in ('release', 'song') and sp.name ilike ${c.title}
         and sp.artist_id in (select a.item_id from public.search_popular a where a.kind = 'artist' and a.name ilike ${c.artist.replace(/[%_\\]/g, "")})
       order by sp.popularity desc limit 6`),
  ]);

  // "lorde" also lists Lorde's best-known music.
  const top = byName.filter((c) => c.kind === "artist" && rank(c.name, q) <= 1)
    .sort((a, b) => b.popularity - a.popularity).slice(0, 2).map((c) => c.item_id);
  const byArtist = top.length ? await sql<Cand[]>`
    select * from (
      select sp.kind, sp.item_id, sp.name, sp.popularity, true as combo,
             row_number() over (partition by sp.kind order by sp.popularity desc) as n
        from public.search_popular sp where sp.kind in ('release', 'song') and sp.artist_id in ${sql(top)}) x
     where n <= 6` : [];

  // Best score per entry, as on the results page: closer text, then popularity.
  const best = new Map<string, { kind: Kind; id: string; score: number }>();
  for (const c of [...byName, ...byCombo.flat(), ...byArtist.map((c) => ({ ...c, combo: false, artistMatch: true }))]) {
    const text = "artistMatch" in c ? Math.min(rank(c.name, q), 2) : c.combo ? Math.min(rank(c.name, q), 1.5) : rank(c.name, q);
    const score = text - BOOST * c.popularity;
    const key = `${c.kind}:${c.item_id}`;
    if (!best.has(key) || best.get(key)!.score > score) best.set(key, { kind: c.kind, id: c.item_id, score });
  }
  const pick = (k: Kind) => [...best.values()].filter((b) => b.kind === k).sort((a, b) => a.score - b.score).slice(0, SHOW[k] + 2);
  const scoreOf = (k: Kind, id: string) => best.get(`${k}:${id}`)?.score ?? 3;
  const ids = (k: Kind) => pick(k).map((b) => b.id);

  // Top up a kind from the whole catalog when the popular list has too few (3+ letters only).
  const topUp = <T,>(k: Kind, run: () => Promise<T[]>) => (q.length >= 3 && pick(k).length < SHOW[k] ? run() : Promise.resolve([] as T[]));
  const none = ["00000000-0000-0000-0000-000000000000"];

  const [artists, releases, songs, moreArtists, moreReleases, moreSongs, pending] = await Promise.all([
    hydrateArtists(sql`a.id in ${sql(ids("artist").length ? ids("artist") : none)}`),
    hydrateReleases(sql`r.id in ${sql(ids("release").length ? ids("release") : none)}`),
    hydrateSongs(sql`s.id in ${sql(ids("song").length ? ids("song") : none)}`),
    topUp("artist", () => hydrateArtists(sql`a.id in (select id from public.artists where name ilike ${like} limit 5)`)),
    topUp("release", () => hydrateReleases(sql`r.id in (select id from public.releases where title ilike ${like} and has_page and edition_of is null limit 5)`)),
    topUp("song", () => hydrateSongs(sql`s.id in (select id from public.songs where title ilike ${like} limit 5)`)),
    sql<{ number: string; entity_type: Kind; entity_name: string; artist: string | null; rtype: string | null }[]>`
      select number, entity_type, entity_name, changes->'artists'->'to'->0->>'name' as artist, changes->'type'->>'to' as rtype
        from musicvolume.submissions
       where kind = 'new' and status in ('needs_review', 'in_review', 'changes_requested', 'final_review') and entity_name ilike ${like}
       order by created_at desc limit 5`.catch(() => []),
  ]);

  const seen = new Set<string>();
  const finish = (k: Kind, list: Hit[]) => list
    .filter((h) => { const key = `${h.kind}:${h.slug}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => a.score - b.score || b.weight - a.weight)
    .slice(0, SHOW[k]);
  const pend = (k: Kind): Hit[] => pending.filter((p) => p.entity_type === k).map((p) => ({
    kind: k, slug: `review-${p.number}`, title: p.entity_name, cover: null, review: Number(p.number),
    tag: k === "artist" ? "ARTIST" : k === "song" ? "SONG" : (p.rtype ?? "Album").toUpperCase(),
    sub: ["In review", p.artist].filter(Boolean) as string[], score: rank(p.entity_name, q) + 0.1, weight: 0,
  }));
  return {
    artists: finish("artist", [...artists.map((h) => ({ ...h, score: scoreOf("artist", h.id) })),
      ...moreArtists.map((h) => ({ ...h, score: rank(h.title, q) })), ...pend("artist")]),
    releases: finish("release", [...releases.map((h) => ({ ...h, score: scoreOf("release", h.id) })),
      ...moreReleases.map((h) => ({ ...h, score: rank(h.title, q) })), ...pend("release")]),
    songs: finish("song", [...songs.map((h) => ({ ...h, score: scoreOf("song", h.id) })),
      ...moreSongs.map((h) => ({ ...h, score: rank(h.title, q) })), ...pend("song")]),
  };

  // Details for the few entries shown.
  type Sql = NonNullable<ReturnType<typeof db>>;
  type Frag = ReturnType<Sql>;
  async function hydrateArtists(where: Frag): Promise<(Hit & { id: string })[]> {
    const rows = await sql!<{ id: string; slug: string; name: string; genre: string | null; image_url: string | null; releases: number }[]>`
      select a.id, a.slug, a.name, a.image_url,
             coalesce((select g.name from public.artist_genres ag join public.genres g on g.id = ag.genre_id
                        where ag.artist_id = a.id order by ag.position limit 1), a.genres[1]) as genre,
             (select count(*) from public.releases r where r.artist_id = a.id and r.has_page and r.edition_of is null)::int as releases
        from public.artists a where ${where}`;
    return rows.map((a) => ({ id: a.id, kind: "artist", slug: a.slug, title: a.name, tag: "ARTIST", cover: a.image_url, score: 3, weight: a.releases,
      sub: [genreLabel(a.genre), `${a.releases} release${a.releases === 1 ? "" : "s"}`].filter(Boolean) as string[] }));
  }
  async function hydrateReleases(where: Frag): Promise<(Hit & { id: string })[]> {
    const rows = await sql!<{ id: string; slug: string; title: string; type: string; year: number | null; cover: string | null; artist: string; tracks: number }[]>`
      select r.id, r.slug, r.title, r.type, r.year, coalesce(r.cover_small_url, r.cover_url) as cover, a.name as artist,
             (select count(*) from public.tracks t where t.release_id = r.id)::int as tracks
        from public.releases r join public.artists a on a.id = r.artist_id
       where r.has_page and r.edition_of is null and ${where}`;
    return rows.map((r) => ({ id: r.id, kind: "release", slug: r.slug, title: r.title, tag: r.type.toUpperCase(), cover: r.cover, score: 3,
      weight: r.tracks + (r.type === "Album" ? 1000 : 0),
      sub: [r.artist, r.year ? String(r.year) : null, `${r.tracks} track${r.tracks === 1 ? "" : "s"}`].filter(Boolean) as string[] }));
  }
  async function hydrateSongs(where: Frag): Promise<(Hit & { id: string })[]> {
    const rows = await sql!<{ id: string; slug: string; title: string; duration_seconds: number | null; cover: string | null; artist: string; album: string | null }[]>`
      select s.id, s.slug, s.title, s.duration_seconds, coalesce(s.cover_small_url, s.cover_url) as cover, a.name as artist,
             (select coalesce(p.title, r.title) from public.tracks t
                join public.releases r on r.id = t.release_id
                left join public.releases p on p.id = r.edition_of
               where t.song_id = s.id order by coalesce(p.year, r.year) nulls last limit 1) as album
        from public.songs s join public.artists a on a.id = s.artist_id where ${where}`;
    return rows.map((s) => ({ id: s.id, kind: "song", slug: s.slug, title: s.title, tag: "SONG", cover: s.cover, score: 3, weight: 0,
      sub: [s.artist, s.album, s.duration_seconds ? fmt(s.duration_seconds) : null].filter(Boolean) as string[] }));
  }
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
