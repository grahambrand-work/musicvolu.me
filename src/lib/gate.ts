// Pre-launch password. While SITE_ACCESS_PASSWORD is set (Coolify > the site > Environment
// Variables), every page asks for it once; the right password leaves a cookie that lets that
// browser in for a year. Remove the setting at launch to open the site to everyone.
export const GATE_COOKIE = "mv_access";

/** The cookie's value: a fingerprint of the password, so the password itself is never stored. */
export async function gateToken(password: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`musicvolume-gate:${password}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pages anyone may open without the password. */
export const OPEN_PATHS = ["/gate", "/privacy", "/terms"];

/** Only same-site paths are allowed as "go here next" targets. */
export function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}
