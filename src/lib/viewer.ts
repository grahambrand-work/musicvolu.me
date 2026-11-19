// Who is looking at the page. Accounts (email sign-up, log in) arrive in the next step; until
// then everyone is signed out, so pages show "Log in" and "Create account".
import "server-only";

export type Role = "contributor" | "editor" | "admin";
export type Viewer = { username: string; role: Role; tier: 1 | 2 | 3 };

export async function getViewer(): Promise<Viewer | null> {
  return null;
}

/** "Tier 1 Contributor", "Tier 2 Editor", "Admin". */
export function roleLabel(v: Viewer) {
  if (v.role === "admin") return "Admin";
  return `Tier ${v.tier} ${v.role === "editor" ? "Editor" : "Contributor"}`;
}
