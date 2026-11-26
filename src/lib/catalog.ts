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

// The search itself (what matches, and in what order) lives in the database, shared with
// Noteworthy: public.search_catalog (results page) and public.search_suggest (dropdown), from
// Noteworthy's migration 20261121000200_shared_search. A fix there fixes both sites. This file
// only words the results and adds musicvolu.me's own new entries waiting for review.

/** Turns what was typed into a LIKE pattern: words in order, anything between them. */
function likePattern(q: string) {
  const words = q.toLowerCase().replace(/[%_\\*,()"':.]/g, " ").trim().split(/\s+/).filter(Boolean);
  return { words, pattern: words.join("%") };
}

/** Text match for entries in review (the catalog's own matches are scored in the database). */
function rank(title: string, q: string) {
  const t = title.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(` ${q}`) || t.includes(`(${q}`)) return 2;
  return 3;
}

/** An artist's main genre for the grey line under their name: "hip hop" → "Hip hop". */
const genreLabel = (g: string | null) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : null);

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One result from the database search (public.search_hit). Lower score is better. */
type DbHit = {
  kind: Kind; id: string; score: number; slug: string; title: string; subkind: string | null;
  artist: string | null; year: number | null; cover: string | null; cover_full: string | null; colors: string[] | null;
  genre: string | null; origin: string | null; releases: number | null; tracks: number | null; album: string | null; duration: number | null;
};

function toHit(r: DbHit): Hit {
  const base = { kind: r.kind, slug: r.slug, title: r.title, cover: r.cover ?? r.cover_full, score: Number(r.score) };
  if (r.kind === "artist") {
    const n = r.releases ?? 0;
    return { ...base, tag: "ARTIST", weight: n, sub: [genreLabel(r.genre), `${n} release${n === 1 ? "" : "s"}`].filter(Boolean) as string[] };
  }
  if (r.kind === "release") {
    const n = r.tracks ?? 0;
    return { ...base, tag: (r.subkind ?? "Album").toUpperCase(), weight: n + (r.subkind === "Album" ? 1000 : 0),
      sub: [r.artist, r.year ? String(r.year) : null, `${n} track${n === 1 ? "" : "s"}`].filter(Boolean) as string[] };
  }
  return { ...base, tag: "SONG", weight: r.tracks ?? 0, sub: [r.artist, r.album, r.duration ? fmt(r.duration) : null].filter(Boolean) as string[] };
}

/** New entries waiting for review show up straight away, marked "in review". */
async function pendingHits(sql: NonNullable<ReturnType<typeof db>>, q: string, like: string, n: number): Promise<Hit[]> {
  type PendingRow = { number: string; entity_type: Kind; entity_name: string; artist: string | null; rtype: string | null };
  const rows = await sql<PendingRow[]>`
    select number, entity_type, entity_name, changes->'artists'->'to'->0->>'name' as artist, changes->'type'->>'to' as rtype
      from musicvolume.submissions
     where kind = 'new' and status in ('needs_review', 'in_review', 'changes_requested', 'final_review')
       and entity_name ilike ${like}
     order by created_at desc limit ${n}`.catch(() => [] as PendingRow[]);
  return rows.map((p) => ({
    kind: p.entity_type, slug: `review-${p.number}`, title: p.entity_name, cover: null, review: Number(p.number),
    tag: p.entity_type === "artist" ? "ARTIST" : p.entity_type === "song" ? "SONG" : (p.rtype ?? "Album").toUpperCase(),
    sub: ["In review", p.artist].filter(Boolean) as string[],
    score: rank(p.entity_name, q) + 0.1, weight: 0,
  }));
}

const kindOrder: Record<Kind, number> = { artist: 0, release: 1, song: 2 };
const byScore = (a: Hit, b: Hit) => a.score - b.score || kindOrder[a.kind] - kindOrder[b.kind] || b.weight - a.weight || a.title.length - b.title.length;

/** Searches shorter than 3 letters would scan the whole catalog; the results page asks for more. */
export function searchTooShort(raw: string) {
  return likePattern(raw.trim().toLowerCase()).words.join("").length < 3;
}

/** The database gave up (statement timeout): the page says so instead of breaking. */
export class SearchTooSlow extends Error {}

/** The full search behind the results page. */
export async function searchCatalog(raw: string, filter: SearchFilter = "all", limit = 40): Promise<Hit[] | null> {
  const sql = db();
  if (!sql) return null;
  const q = raw.trim().toLowerCase();
  const { pattern } = likePattern(q);
  if (!pattern || searchTooShort(q)) return [];
  const kindOf: Record<Exclude<SearchFilter, "all">, Kind> = { artists: "artist", releases: "release", songs: "song" };
  const kinds: Kind[] = filter === "all" ? ["artist", "release", "song"] : [kindOf[filter]];
  const [rows, pending] = await Promise.all([
    sql<DbHit[]>`select * from public.search_catalog(${raw}, ${`{${kinds.join(",")}}`}::text[], ${limit})`,
    pendingHits(sql, q, `%${pattern}%`, 20),
  ]).catch((e: { code?: string }) => {
    if (e?.code === "57014") throw new SearchTooSlow();
    throw e;
  });
  return [...rows.map(toHit), ...pending.filter((p) => kinds.includes(p.kind))].sort(byScore).slice(0, limit);
}

export type Suggestions = { artists: Hit[]; releases: Hit[]; songs: Hit[] };
const SHOW: Record<Kind, number> = { artist: 2, release: 3, song: 3 };

/** The dropdown while typing: a few of each kind, fast (public.search_suggest). */
export async function suggest(raw: string): Promise<Suggestions> {
  const sql = db();
  const empty: Suggestions = { artists: [], releases: [], songs: [] };
  if (!sql) return empty;
  const q = raw.trim().toLowerCase();
  const { pattern } = likePattern(q);
  if (!pattern) return empty;
  const [rows, pending] = await Promise.all([
    sql<DbHit[]>`select * from public.search_suggest(${raw})`,
    pendingHits(sql, q, `%${pattern}%`, 5),
  ]);
  const hits = [...rows.map(toHit), ...pending];
  const of = (k: Kind) => hits.filter((h) => h.kind === k).sort(byScore).slice(0, SHOW[k]);
  return { artists: of("artist"), releases: of("release"), songs: of("song") };
}

// ---------------------------------------------------------------- entries

export type Source = { from: "musicbrainz" | "user"; label: string; id: string | null };
export type HistoryItem = { who: string; when: Date; status: string; text: string };

export type Artist = {
  id: string; slug: string; name: string; kind: string; disambiguation: string | null;
  origin: string | null; years: string | null; image: string | null;
  legalName: string | null; aliases: string[]; genres: string[];
  members: { name: string; role: string | null; slug: string | null; artistId: string | null; image: string | null }[];
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
    sql<{ name: string; role: string | null; slug: string | null; artistId: string | null; image: string | null }[]>`
      select m.name, m.role, x.slug, x.id as "artistId", x.image_url as image
        from public.artist_members m left join public.artists x on x.id = m.member_artist_id
       where m.band_id = ${a.id} order by m.position`,
    sql<{ slug: string; title: string; type: string; year: number | null; tracks: number; cover: string | null }[]>`
      select r.slug, r.title, r.type, r.year, coalesce(r.cover_small_url, r.cover_url) as cover,
             (select count(*) from public.tracks t where t.release_id = r.id)::int as tracks
        from public.releases r
       where r.has_page and r.edition_of is null
         -- Two indexed lookups (their own releases, and ones they're credited on). An "or" here
         -- read all 5 million releases: about 2 seconds per artist page and search preview.
         and r.id in (select x.id from public.releases x where x.artist_id = ${a.id}
                      union select c.release_id from public.artist_credits c where c.artist_id = ${a.id} and c.release_id is not null)
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

/** Search within one artist (artist page search box): public.search_artist, shared with Noteworthy. */
export async function searchArtist(artistSlug: string, raw: string): Promise<Hit[] | null> {
  const sql = db();
  if (!sql) return null;
  if (!raw.trim()) return [];
  // One letter would match most of a big artist's catalog: the page filters what it shows instead.
  if (raw.trim().length < 2) return null;
  const rows = await sql<DbHit[]>`select * from public.search_artist(${raw}, ${artistSlug}, 12)`;
  return rows.map(toHit);
}
