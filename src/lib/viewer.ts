// Who is looking at the page, and how their role shows (name colour + badge).
import "server-only";
import { currentMember, type Member } from "./auth/session";

export type Role = Member["role"];
export type Viewer = Member;

/** Signed in with a confirmed email, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const m = await currentMember();
  return m && m.emailVerified ? m : null;
}

export { roleLabel, tierColor } from "./roles";
