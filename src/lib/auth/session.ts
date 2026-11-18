// Sign-in sessions: a random token in an httpOnly cookie, its fingerprint in
// musicvolume.sessions. Sessions last 60 days and renew themselves when used.
import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { newToken, tokenId } from "./crypto";

export const SESSION_COOKIE = "mv_session";
const DAYS = 60;

export type Member = {
  id: string; username: string; email: string; role: "contributor" | "editor" | "admin"; tier: 1 | 2 | 3;
  emailVerified: boolean;
};

export async function startSession(memberId: string) {
  const sql = db()!;
  const { token, id } = newToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await sql`insert into musicvolume.sessions (id, member_id, expires_at, user_agent)
            values (${id}, ${memberId}, now() + ${`${DAYS} days`}::interval, ${ua})`;
  await sql`update musicvolume.members set last_login_at = now(), failed_logins = 0, locked_until = null where id = ${memberId}`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const sql = db();
  if (token && sql) await sql`delete from musicvolume.sessions where id = ${tokenId(token)}`.catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** The signed-in member, or null. Cached for the length of one page render. */
export const currentMember = cache(async (): Promise<Member | null> => {
  const sql = db();
  if (!sql) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const [row] = await sql<{ id: string; username: string; email: string; role: Member["role"]; tier: number; email_verified_at: Date | null; renew: boolean }[]>`
      select m.id, m.username, m.email, m.role, m.tier, m.email_verified_at,
             s.expires_at < now() + make_interval(days => ${DAYS - 1}) as renew
        from musicvolume.sessions s join musicvolume.members m on m.id = s.member_id
       where s.id = ${tokenId(token)} and s.expires_at > now()`;
    if (!row) return null;
    if (row.renew) await sql`update musicvolume.sessions set expires_at = now() + ${`${DAYS} days`}::interval where id = ${tokenId(token)}`;
    return { id: row.id, username: row.username, email: row.email, role: row.role, tier: row.tier as 1 | 2 | 3, emailVerified: !!row.email_verified_at };
  } catch {
    return null; // accounts tables not there yet: everyone is signed out
  }
});
