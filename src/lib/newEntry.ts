// Adding something new: the values each "new" form collects, how they're checked, and how
// they're stored as a submission's changes ({ field: { to } }). Shared by browser and server.
import { CREDIT_ROLES, isDuration, isPartialDate, RELEASE_TYPES, splitList, type CreditRow, type TrackRow } from "./edits";

/** An artist on a new release or song: one from the catalog (id) or one still in review (review = its submission number). */
export type PickedArtist = { id?: string; review?: number; name: string };

export type NewArtist = { name: string; kind: string; origin: string; started: string; genres: string; website: string; sources: string };
export type NewRelease = {
  type: string; artists: PickedArtist[]; title: string; releaseDate: string; label: string; country: string;
  language: string; genres: string; tracks: TrackRow[]; sources: string;
  /** A link to the cover image; stored on our side only once it's published. */
  cover: string;
};
export type NewSong = {
  title: string; artists: PickedArtist[]; duration: string; releaseDate: string; language: string; genres: string;
  credits: CreditRow[]; sources: string;
};
export type NewKind = "artist" | "release" | "song";
export type NewValues = NewArtist | NewRelease | NewSong;

export const ARTIST_TYPES = [{ value: "Solo artist", label: "Person" }, { value: "Band", label: "Group" }];

export function emptyNew(kind: NewKind, prefill: { title?: string; artist?: PickedArtist | null; type?: string } = {}): NewValues {
  const artists = prefill.artist ? [prefill.artist] : [];
  if (kind === "artist") return { name: prefill.title ?? "", kind: "Solo artist", origin: "", started: "", genres: "", website: "", sources: "" };
  if (kind === "release") {
    return {
      type: RELEASE_TYPES.includes(prefill.type ?? "") ? prefill.type! : "Album", artists, title: prefill.title ?? "",
      releaseDate: "", label: "", country: "", language: "", genres: "", tracks: [], sources: "", cover: "",
    };
  }
  return { title: prefill.title ?? "", artists, duration: "", releaseDate: "", language: "", genres: "", credits: [], sources: "" };
}

/** Keeps the browser's row id (so error messages land on the right row) when it looks sane. */
const rowId = (id: unknown, i: number) => (typeof id === "string" && /^n:\d{1,6}$/.test(id) ? id : `n:x${i}`);
const clean = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");
const cleanArtists = (xs: unknown): PickedArtist[] => (Array.isArray(xs) ? xs : []).slice(0, 10).map((a) => {
  const r = (a ?? {}) as Record<string, unknown>;
  return {
    ...(typeof r.id === "string" && /^[0-9a-f-]{36}$/i.test(r.id) ? { id: r.id } : {}),
    ...(Number.isSafeInteger(r.review) && (r.review as number) > 0 ? { review: r.review as number } : {}),
    name: clean(r.name).slice(0, 300),
  };
}).filter((a) => a.name && (a.id || a.review));

/** Tidies untrusted input into the right shape (the server runs this on whatever the browser sent). */
export function tidyNew(kind: NewKind, raw: unknown): NewValues {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, max = 300) => clean(r[k]).slice(0, max);
  const list = (k: string) => splitList(typeof r[k] === "string" ? (r[k] as string) : "").join(", ").slice(0, 1000);
  const sources = (typeof r.sources === "string" ? r.sources.trim() : "").slice(0, 2000);
  if (kind === "artist") {
    return { name: str("name"), kind: str("kind"), origin: str("origin", 200), started: str("started", 10), genres: list("genres"), website: str("website"), sources };
  }
  const rows = (k: string) => (Array.isArray(r[k]) ? (r[k] as Record<string, unknown>[]) : []).slice(0, 400);
  if (kind === "release") {
    return {
      type: str("type"), artists: cleanArtists(r.artists), title: str("title"), releaseDate: str("releaseDate", 10),
      label: str("label"), country: str("country", 100), language: str("language", 100), genres: list("genres"),
      tracks: rows("tracks").map((t, i) => ({ id: rowId(t?.id, i), title: clean(t?.title).slice(0, 300), duration: clean(t?.duration).slice(0, 8) }))
        .filter((t) => t.title || t.duration),
      sources, cover: (typeof r.cover === "string" ? r.cover.trim() : "").slice(0, 1000),
    };
  }
  return {
    title: str("title"), artists: cleanArtists(r.artists), duration: str("duration", 8), releaseDate: str("releaseDate", 10),
    language: str("language", 100), genres: list("genres"),
    credits: rows("credits").map((c, i) => ({ id: rowId(c?.id, i), role: clean(c?.role).slice(0, 60), name: clean(c?.name).slice(0, 300) })).filter((c) => c.name),
    sources,
  };
}

/** Problems by field. `quick` = the "Add a new artist" pop-up, where a source is optional. */
export function checkNew(kind: NewKind, v: NewValues, quick = false): Record<string, string> {
  const e: Record<string, string> = {};
  if (kind === "artist") {
    const a = v as NewArtist;
    if (!a.name) e.name = "An artist needs a name.";
    if (!ARTIST_TYPES.some((t) => t.value === a.kind)) e.kind = "Pick Person or Group.";
    if (a.started && !/^\d{4}$/.test(a.started)) e.started = "Just the year, like 2019.";
    if (a.website && !/^(https?:\/\/)?[^\s/]+\.[^\s]+$/.test(a.website)) e.website = "That doesn't look like a web address.";
    if (!quick && !a.sources) e.sources = "Tell editors where this information came from.";
    return e;
  }
  const x = v as NewRelease | NewSong;
  if (!x.title) e.title = "This needs a title.";
  if (!x.artists.length) e.artists = "Pick an artist, or add a new one.";
  if (x.releaseDate && !isPartialDate(x.releaseDate)) e.releaseDate = "Use YYYY, YYYY-MM or YYYY-MM-DD.";
  if (!x.sources) e.sources = "Tell editors where this information came from.";
  if (kind === "release") {
    const r = v as NewRelease;
    if (!RELEASE_TYPES.includes(r.type)) e.type = "Pick a type.";
    if (r.cover && !/^https:\/\/\S+$/i.test(r.cover)) e.cover = "Paste a link that starts with https://";
    r.tracks.forEach((t) => {
      if (!t.title) e[`track:${t.id}`] = "Every track needs a title.";
      else if (t.duration && !isDuration(t.duration)) e[`track:${t.id}`] = "Use minutes:seconds, like 3:54.";
    });
  } else {
    const s = v as NewSong;
    if (s.duration && !isDuration(s.duration)) e.duration = "Use minutes:seconds, like 3:54.";
    s.credits.forEach((c) => { if (!CREDIT_ROLES.includes(c.role)) e[`credit:${c.id}`] = "Pick a role."; });
  }
  return e;
}

/** The submission's changes: every filled-in field as { to }. Sources are stored separately. */
export function newChanges(kind: NewKind, v: NewValues): Record<string, { to: unknown }> {
  const out: Record<string, { to: unknown }> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === "sources") continue;
    if (Array.isArray(val) ? val.length === 0 : val === "") continue;
    out[k] = { to: Array.isArray(val) && (k === "tracks" || k === "credits") ? val.map((row) => Object.fromEntries(Object.entries(row).filter(([f]) => f !== "id"))) : val };
  }
  return out;
}

export const nameOf = (kind: NewKind, v: NewValues) => (kind === "artist" ? (v as NewArtist).name : (v as NewRelease | NewSong).title);

/** Pasted tracklists: "1. Undertow 3:41", "Undertow - 3:41", "01 Undertow (3:41)". */
export function parseTracklist(text: string): { title: string; duration: string }[] {
  return text.split(/\r?\n/).map((line) => {
    let l = line.trim();
    if (!l) return null;
    l = l.replace(/^(\d{1,3}|[A-Z]\d{1,2})[.)\s-]+\s*/, "");
    const m = l.match(/^(.*?)[\s\-–—(]*((?:\d{1,2}:)?\d{1,3}:[0-5]\d)\)?\s*$/);
    const title = (m ? m[1] : l).replace(/[\s\-–—]+$/, "").replace(/^["“]|["”]$/g, "").trim();
    return title ? { title, duration: m ? m[2] : "" } : null;
  }).filter((x): x is { title: string; duration: string } => !!x).slice(0, 400);
}
