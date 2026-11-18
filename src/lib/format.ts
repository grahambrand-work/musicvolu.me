// Small helpers for showing catalog values the way the designs do.

/** 190 -> "3:10"; 3600+ -> "1:02:03". */
export function duration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Total of several durations, e.g. an album's length "42:47". */
export function totalDuration(list: (number | null | undefined)[]): string {
  const sum = list.reduce<number>((a, b) => a + (b ?? 0), 0);
  return duration(sum);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2017-06-16" -> "16 Jun 2017". Dates come from Postgres as Date or string. */
export function longDate(d: Date | string | null | undefined): string {
  const iso = isoDate(d);
  if (!iso) return "";
  const [y, m, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

/** "2017-06-16", as stored (the entry pages show the raw value, since that's what gets edited). */
export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** "Sep 12" this year, "Sep 12, 2025" otherwise. */
export function shortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const thisYear = new Date().getUTCFullYear() === date.getUTCFullYear();
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}${thisYear ? "" : `, ${date.getUTCFullYear()}`}`;
}

/** First and last 4 characters of a MusicBrainz id: "2f0a…c7e1". */
export function shortId(id: string | null | undefined): string {
  if (!id) return "";
  const hex = id.replace(/-/g, "");
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Track number as two digits: 1 -> "01". */
export function trackNo(n: number | null | undefined) {
  return n == null ? "··" : String(n).padStart(2, "0");
}

/** "Art pop, electropop": genre names joined, first letter of the list capitalised. */
export function genreList(names: string[]): string {
  const s = names.join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
