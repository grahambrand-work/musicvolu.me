// What can be edited on each kind of entry, and how a set of edits is described
// ("Your changes"). Shared by the edit form (browser) and the submit action (server), so both
// count and describe changes the same way. The server always recomputes "before" from the
// database; it never trusts what the browser says the old values were.

export type Kind = "artist" | "release" | "song";

export type TrackRow = { id: string; title: string; duration: string };
export type CreditRow = { id: string; role: string; name: string };

export type ReleaseValues = {
  title: string; artists: string; type: string; releaseDate: string;
  label: string; country: string; language: string; genres: string;
  /** Live: the current cover's address. Suggested: a link to the new picture (stored only once it's published). */
  cover: string;
  tracks: TrackRow[];
};
export type ArtistValues = {
  name: string; note: string; legalName: string; kind: string; born: string;
  origin: string; years: string; genres: string; aliases: string; website: string;
};
export type SongValues = {
  title: string; artists: string; duration: string; language: string; genres: string;
  credits: CreditRow[];
};
export type Values = ReleaseValues | ArtistValues | SongValues;

export const RELEASE_TYPES = ["Album", "EP", "Single", "Live", "Compilation"];
export const ARTIST_KINDS = [{ value: "Solo artist", label: "Person" }, { value: "Band", label: "Group" }];
export const CREDIT_ROLES = ["Songwriter", "Composer", "Lyricist", "Producer", "Co-producer", "Vocals", "Featured", "Guitar", "Bass", "Drums", "Keyboards", "Mixing", "Mastering", "Engineer", "Arranger", "Other"];

type FieldSpec = {
  key: string; label: string;
  type: "text" | "select" | "list" | "date" | "duration" | "readonly" | "image";
  options?: { value: string; label: string }[];
  /** Suggestions under a free-text box (country, language). */
  suggest?: "country" | "language";
  placeholder?: string;
  max?: number;
};

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export const FIELDS: Record<Kind, FieldSpec[]> = {
  release: [
    { key: "title", label: "Title", type: "text", max: 300 },
    { key: "artists", label: "Artist", type: "list", placeholder: "Artist names, separated by commas" },
    { key: "type", label: "Type", type: "select", options: opts(RELEASE_TYPES) },
    { key: "releaseDate", label: "Release date", type: "date", placeholder: "YYYY-MM-DD" },
    { key: "label", label: "Label", type: "text", max: 300, placeholder: "e.g. Lava · Republic" },
    { key: "country", label: "Country", type: "text", suggest: "country", max: 100 },
    { key: "language", label: "Language", type: "text", suggest: "language", max: 100 },
    { key: "genres", label: "Genres", type: "list", placeholder: "Separated by commas" },
    { key: "cover", label: "Cover", type: "image", max: 1000, placeholder: "Link to the cover image (https://…)" },
  ],
  artist: [
    { key: "name", label: "Name", type: "text", max: 300 },
    { key: "note", label: "Note", type: "text", max: 300, placeholder: "Tells apart artists with the same name" },
    { key: "legalName", label: "Legal name", type: "text", max: 300 },
    { key: "kind", label: "Type", type: "select", options: ARTIST_KINDS },
    { key: "born", label: "Born", type: "date", placeholder: "YYYY-MM-DD" },
    { key: "origin", label: "From", type: "text", max: 200, placeholder: "City, country" },
    { key: "years", label: "Active", type: "text", max: 100, placeholder: "e.g. 2009 – present" },
    { key: "genres", label: "Genres", type: "list", placeholder: "Separated by commas" },
    { key: "aliases", label: "Also known as", type: "list", placeholder: "Other names, separated by commas" },
    { key: "website", label: "Website", type: "text", max: 300 },
  ],
  song: [
    { key: "title", label: "Title", type: "text", max: 300 },
    { key: "artists", label: "Artist", type: "list", placeholder: "Artist names, separated by commas" },
    { key: "duration", label: "Length", type: "duration", placeholder: "m:ss" },
    { key: "firstReleased", label: "First released", type: "readonly" },
    { key: "language", label: "Language", type: "text", suggest: "language", max: 100 },
    { key: "genres", label: "Genres", type: "list", placeholder: "Separated by commas" },
  ],
};

/** "a,  b ,c" → ["a", "b", "c"], dropping blanks and repeats (case-insensitive). */
export function splitList(s: string): string[] {
  const seen = new Set<string>();
  return s.split(",").map((x) => x.trim().replace(/\s+/g, " ")).filter((x) => {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const clean = (s: string) => (s ?? "").trim().replace(/\s+/g, " ");

/** Tidies values the way they'll be stored, so "Art pop,electropop" equals "Art pop, electropop". */
export function normalize(kind: Kind, v: Values): Values {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) {
    if (f.type === "readonly") continue;
    const raw = (v as Record<string, string>)[f.key] ?? "";
    out[f.key] = f.type === "list" ? splitList(raw).join(", ") : clean(raw);
  }
  if (kind === "release") {
    out.tracks = (v as ReleaseValues).tracks
      .map((t) => ({ id: t.id, title: clean(t.title), duration: clean(t.duration) }))
      .filter((t) => t.title || !t.id.startsWith("n:"));
  }
  if (kind === "song") {
    out.credits = (v as SongValues).credits
      .map((c) => ({ id: c.id, role: clean(c.role), name: clean(c.name) }))
      .filter((c) => c.name);
  }
  return out as Values;
}

export type Change = {
  /** Field (or row) that changed: "Label", "Track 6 title". */
  label: string;
  key: string;
  was?: string;
  now?: string;
  added?: string[];
  removed?: string[];
};

/** The list on the "Your changes" panel. Both sides should be normalized first. */
export function describeChanges(kind: Kind, before: Values, after: Values): Change[] {
  const out: Change[] = [];
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
  for (const f of FIELDS[kind]) {
    if (f.type === "readonly") continue;
    const was = (b[f.key] as string) ?? "", now = (a[f.key] as string) ?? "";
    if (was === now) continue;
    if (f.type === "image") {
      out.push({ key: f.key, label: f.label, was: was ? "Current cover" : "", now: now ? "New picture from a link" : "" });
      continue;
    }
    if (f.type === "list") {
      const w = splitList(was), n = splitList(now);
      const wl = new Set(w.map((x) => x.toLowerCase())), nl = new Set(n.map((x) => x.toLowerCase()));
      const added = n.filter((x) => !wl.has(x.toLowerCase())), removed = w.filter((x) => !nl.has(x.toLowerCase()));
      if (added.length || removed.length) out.push({ key: f.key, label: f.label, added, removed });
      else out.push({ key: f.key, label: f.label, was, now }); // only spelling or order changed
    } else {
      const label = f.options?.find((o) => o.value === was)?.label ?? was;
      const labelNow = f.options?.find((o) => o.value === now)?.label ?? now;
      out.push({ key: f.key, label: f.label, was: label, now: labelNow });
    }
  }
  if (kind === "release") out.push(...trackChanges((before as ReleaseValues).tracks, (after as ReleaseValues).tracks));
  if (kind === "song") {
    const fmt = (c: CreditRow) => `${c.role}: ${c.name}`;
    const w = (before as SongValues).credits.map(fmt), n = (after as SongValues).credits.map(fmt);
    const added = n.filter((x) => !w.includes(x)), removed = w.filter((x) => !n.includes(x));
    if (added.length || removed.length) out.push({ key: "credits", label: "Credits", added, removed });
  }
  return out;
}

function trackChanges(before: TrackRow[], after: TrackRow[]): Change[] {
  const out: Change[] = [];
  const old = new Map(before.map((t, i) => [t.id, { ...t, no: i + 1 }]));
  const kept = after.filter((t) => old.has(t.id));
  after.forEach((t, i) => {
    const o = old.get(t.id);
    if (!o) return;
    if (o.title !== t.title) out.push({ key: `track:${t.id}:title`, label: `Track ${i + 1} title`, was: o.title, now: t.title });
    if (o.duration !== t.duration) out.push({ key: `track:${t.id}:duration`, label: `Track ${i + 1} length`, was: o.duration, now: t.duration });
  });
  const added = after.map((t, i) => ({ t, i })).filter(({ t }) => !old.has(t.id)).map(({ t, i }) => `${i + 1}. ${t.title}`);
  const removed = before.filter((t) => !after.some((x) => x.id === t.id)).map((t) => `${old.get(t.id)!.no}. ${t.title}`);
  if (added.length || removed.length) out.push({ key: "tracks", label: "Tracklist", added, removed });
  // Same tracks kept but in a different order?
  const keptBefore = before.filter((t) => after.some((x) => x.id === t.id)).map((t) => t.id);
  if (kept.map((t) => t.id).join() !== keptBefore.join()) out.push({ key: "order", label: "Track order", now: "Reordered" });
  return out;
}

/** How many separate changes: each field, each added or removed item, each track tweak. */
export function countChanges(changes: Change[]) {
  return changes.reduce((n, c) => n + (c.added || c.removed ? (c.added?.length ?? 0) + (c.removed?.length ?? 0) : 1), 0);
}

/** Problems that stop a submit, by field key. Empty object = fine. */
export function validate(kind: Kind, v: Values): Record<string, string> {
  const err: Record<string, string> = {};
  const r = v as Record<string, unknown>;
  for (const f of FIELDS[kind]) {
    const val = r[f.key] as string | undefined;
    if (f.type === "readonly" || val === undefined) continue;
    if (f.max && val.length > f.max) err[f.key] = `Keep this under ${f.max} characters.`;
    if (f.type === "date" && val && !isPartialDate(val)) err[f.key] = "Use YYYY, YYYY-MM or YYYY-MM-DD.";
    if (f.type === "duration" && val && !isDuration(val)) err[f.key] = "Use minutes:seconds, like 3:54.";
    if (f.type === "select" && !f.options!.some((o) => o.value === val)) err[f.key] = "Pick one from the list.";
    if (f.type === "list" && splitList(val).some((x) => x.length > 200)) err[f.key] = "One of these is too long.";
    if (f.type === "image" && val && !/^https:\/\/\S+$/i.test(val)) err[f.key] = "Paste a link that starts with https://";
  }
  const nameKey = kind === "artist" ? "name" : "title";
  if (!(r[nameKey] as string)?.trim()) err[nameKey] = kind === "artist" ? "An artist needs a name." : "This needs a title.";
  if ((kind === "release" || kind === "song") && !splitList(r.artists as string).length) err.artists = "Add at least one artist.";
  if (kind === "artist" && r.website && !/^(https?:\/\/)?[^\s/]+\.[^\s]+$/.test(r.website as string)) err.website = "That doesn't look like a web address.";
  if (kind === "release") {
    const tracks = (v as ReleaseValues).tracks;
    if (tracks.length > 400) err.tracks = "That's too many tracks.";
    tracks.forEach((t) => {
      if (!t.title) err[`track:${t.id}`] = "Every track needs a title.";
      else if (t.title.length > 300) err[`track:${t.id}`] = "That title is too long.";
      else if (t.duration && !isDuration(t.duration)) err[`track:${t.id}`] = "Use minutes:seconds, like 3:54.";
    });
  }
  if (kind === "song") {
    const credits = (v as SongValues).credits;
    if (credits.length > 100) err.credits = "That's too many credits.";
    credits.forEach((c) => {
      if (!CREDIT_ROLES.includes(c.role)) err[`credit:${c.id}`] = "Pick a role.";
      else if (c.name.length > 300) err[`credit:${c.id}`] = "That name is too long.";
    });
  }
  return err;
}

export const isDuration = (s: string) => /^(\d{1,2}:)?\d{1,3}:[0-5]\d$/.test(s);

/** "3:54" → 234. "1:02:03" → 3723. */
export function parseDuration(s: string): number | null {
  if (!s || !isDuration(s)) return null;
  return s.split(":").map(Number).reduce((t, n) => t * 60 + n, 0) || null;
}

/** Common choices offered under the Country and Language boxes. Anything else can be typed. */
export const SUGGEST: Record<"country" | "language", string[]> = {
  country: ["Argentina", "Australia", "Austria", "Belgium", "Brazil", "Canada", "Chile", "China", "Colombia", "Czechia", "Denmark", "Finland", "France", "Germany", "Ghana", "Greece", "Hong Kong", "Iceland", "India", "Indonesia", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Mexico", "Netherlands", "New Zealand", "Nigeria", "Norway", "Philippines", "Poland", "Portugal", "Puerto Rico", "Russia", "South Africa", "South Korea", "Spain", "Sweden", "Switzerland", "Taiwan", "Thailand", "Turkey", "Ukraine", "United Kingdom", "United States", "Worldwide"],
  language: ["Arabic", "Chinese", "Danish", "Dutch", "English", "Finnish", "French", "German", "Greek", "Hebrew", "Hindi", "Icelandic", "Indonesian", "Instrumental", "Italian", "Japanese", "Korean", "Norwegian", "Polish", "Portuguese", "Russian", "Spanish", "Swedish", "Tagalog", "Thai", "Turkish", "Ukrainian", "Yoruba", "Multiple languages"],
};

/** 2017, 2017-06 or 2017-06-16. */
export const isPartialDate = (s: string) => /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(s);
