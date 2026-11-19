// Role names, colours and limits (Figma "P6 · Tier colors and permissions").
type R = { role: "contributor" | "editor" | "admin" | "system"; tier: number };

/** "Tier 1 Contributor", "Tier 2 Editor", "Admin". */
export function roleLabel(v: R) {
  if (v.role === "admin") return "Admin";
  if (v.role === "system") return "Catalog sync";
  return `Tier ${v.tier} ${v.role === "editor" ? "Editor" : "Contributor"}`;
}

/** The "MusicBrainz" account: changes from the catalog sync. */
export const MUSICBRAINZ_TEAL = "#2ec4b6";

const COLORS = {
  contributor: ["#ffffff", "#5999fa", "#7ad98f"],
  editor: ["#f5d44d", "#f59945", "#eb544d"],
};

/** Badge background and username colour. */
export function tierColor(v: R) {
  if (v.role === "admin") return "#f26694";
  if (v.role === "system") return MUSICBRAINZ_TEAL;   // the MusicBrainz account
  return COLORS[v.role][Math.min(Math.max(v.tier, 1), 3) - 1];
}

/** Edits a contributor may suggest each month (editors and admins: no cap). */
export function monthlyAllowance(v: R): number | null {
  if (v.role !== "contributor") return null;
  return [10, 25, 50][v.tier - 1] ?? 10;
}
