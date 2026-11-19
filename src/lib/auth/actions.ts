"use server";
// Create account, confirm email, log in, log out, forgot / reset password.
import { redirect } from "next/navigation";
import { db } from "../db";
import { safeNext } from "../gate";
import { sendMail, siteUrl } from "../mail";
import { DUMMY_HASH, hashPassword, newToken, tokenId, verifyPassword } from "./crypto";
import { endSession, startSession } from "./session";

export type FormState = { error?: string; field?: string; values?: Record<string, string> } | undefined;

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function sendVerify(memberId: string, email: string, username: string) {
  const sql = db()!;
  const { token, id } = newToken();
  await sql`insert into musicvolume.email_tokens (id, member_id, purpose, expires_at) values (${id}, ${memberId}, 'verify', now() + interval '24 hours')`;
  await sendMail({
    to: email, subject: "Confirm your musicvolu.me account",
    heading: `Welcome, ${username}`,
    body: "Click the button to confirm your email and finish creating your account. The link works for 24 hours.",
    button: "Confirm my email", link: siteUrl(`/verify?token=${token}`),
    footer: "If you didn’t sign up for musicvolu.me, you can ignore this email.",
  });
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const sql = db();
  if (!sql) return { error: "Accounts aren’t connected yet." };
  const username = str(form, "username").toLowerCase();
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const values = { username, email };
  if (!USERNAME.test(username)) return { field: "username", values, error: "Usernames are 3–30 letters, numbers, dots, dashes or underscores, starting and ending with a letter or number." };
  if (!EMAIL.test(email)) return { field: "email", values, error: "That email doesn’t look right." };
  if (password.length < 10) return { field: "password", values, error: "Passwords need at least 10 characters." };
  if (password.length > 200) return { field: "password", values, error: "That password is too long." };
  if (!form.get("sources") || !form.get("terms")) return { field: "terms", values, error: "Please tick both boxes to continue." };

  const [taken] = await sql<{ username: boolean; email: boolean; verified: boolean }[]>`
    select bool_or(lower(username) = ${username}) as username, bool_or(lower(email) = ${email}) as email,
           bool_or(lower(email) = ${email} and email_verified_at is not null) as verified
      from musicvolume.members where lower(username) = ${username} or lower(email) = ${email}`;
  if (taken?.username && !taken.email) return { field: "username", values, error: "That username is taken." };
  if (taken?.email) {
    // Don't reveal whether an address has an account: an unconfirmed one gets a fresh link,
    // a confirmed one goes to "check your email" with no new mail.
    if (!taken.verified) {
      const [m] = await sql<{ id: string; username: string }[]>`select id, username from musicvolume.members where lower(email) = ${email}`;
      await sendVerify(m.id, email, m.username);
    }
    redirect(`/signup/check?email=${encodeURIComponent(email)}`);
  }

  const hash = await hashPassword(password);
  let id: string;
  try {
    [{ id }] = await sql<{ id: string }[]>`
      insert into musicvolume.members (username, email, password_hash, agreed_terms_at, agreed_sources_at)
      values (${username}, ${email}, ${hash}, now(), now()) returning id`;
  } catch {
    return { field: "username", values, error: "That username or email is already in use." };
  }
  await sendVerify(id, email, username);
  redirect(`/signup/check?email=${encodeURIComponent(email)}`);
}

export async function resendVerify(form: FormData) {
  const sql = db();
  const email = str(form, "email").toLowerCase();
  if (sql && EMAIL.test(email)) {
    const [m] = await sql<{ id: string; username: string; recent: number }[]>`
      select m.id, m.username,
             (select count(*) from musicvolume.email_tokens t where t.member_id = m.id and t.purpose = 'verify'
                and t.created_at > now() - interval '1 hour')::int as recent
        from musicvolume.members m where lower(m.email) = ${email} and m.email_verified_at is null`;
    if (m && m.recent < 5) await sendVerify(m.id, email, m.username);
  }
  redirect(`/signup/check?email=${encodeURIComponent(email)}&sent=1`);
}

/** The link in the confirmation email. Returns an error message, or signs in and goes to Welcome. */
export async function confirmEmail(token: string): Promise<string | void> {
  const sql = db();
  if (!sql || !token) return "That link isn’t valid.";
  const [t] = await sql<{ member_id: string; expired: boolean; used: boolean }[]>`
    update musicvolume.email_tokens set used_at = coalesce(used_at, now())
     where id = ${tokenId(token)} and purpose = 'verify'
     returning member_id, expires_at < now() as expired, used_at < now() - interval '5 seconds' as used`;
  if (!t || t.expired) return "That link has expired. Log in to get a new one.";
  if (t.used) return "That link has already been used. Log in to continue.";
  await sql`update musicvolume.members set email_verified_at = coalesce(email_verified_at, now()) where id = ${t.member_id}`;
  await startSession(t.member_id);
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const sql = db();
  if (!sql) return { error: "Accounts aren’t connected yet." };
  // Email or username (Graham, 2026-11-19). Usernames are unique ignoring case and can't hold "@".
  const login = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const values = { email: login };
  const byEmail = login.includes("@");
  const [m] = await sql<{ id: string; username: string; email: string; password_hash: string; verified: boolean; locked: boolean }[]>`
    select id, username, email, password_hash, email_verified_at is not null as verified, coalesce(locked_until > now(), false) as locked
      from musicvolume.members
     where role <> 'system' and ${byEmail ? sql`lower(email) = ${login}` : sql`lower(username) = ${login}`}`;
  const email = m?.email ?? login;
  const ok = await verifyPassword(password, m?.password_hash ?? DUMMY_HASH);
  if (m?.locked) return { values, error: "Too many tries. Wait 15 minutes, or reset your password." };
  if (!m || !ok) {
    if (m) await sql`update musicvolume.members set failed_logins = failed_logins + 1,
                       locked_until = case when failed_logins + 1 >= 8 then now() + interval '15 minutes' end
                     where id = ${m.id}`;
    return { values, error: byEmail ? "That email and password don’t match." : "That username and password don’t match." };
  }
  if (!m.verified) {
    await sendVerify(m.id, email, m.username);
    redirect(`/signup/check?email=${encodeURIComponent(email)}&sent=1`);
  }
  await startSession(m.id);
  redirect(next);
}

export async function logout() {
  await endSession();
  redirect("/");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const sql = db();
  if (!sql) return { error: "Accounts aren’t connected yet." };
  const email = str(form, "email").toLowerCase();
  if (!EMAIL.test(email)) return { values: { email }, error: "That email doesn’t look right." };
  const [m] = await sql<{ id: string; recent: number }[]>`
    select m.id, (select count(*) from musicvolume.email_tokens t where t.member_id = m.id and t.purpose = 'reset'
                    and t.created_at > now() - interval '1 hour')::int as recent
      from musicvolume.members m where lower(m.email) = ${email}`;
  if (m && m.recent < 5) {
    const { token, id } = newToken();
    await sql`insert into musicvolume.email_tokens (id, member_id, purpose, expires_at) values (${id}, ${m.id}, 'reset', now() + interval '1 hour')`;
    await sendMail({
      to: email, subject: "Reset your musicvolu.me password",
      heading: "Reset your password", body: "Click the button to choose a new password. The link works for 1 hour.",
      button: "Choose a new password", link: siteUrl(`/reset-password?token=${token}`),
      footer: "If you didn’t ask for this, you can ignore this email. Your password hasn’t changed.",
    });
  }
  // Same answer either way, so nobody can test which emails have accounts.
  redirect(`/forgot-password?sent=${encodeURIComponent(email)}`);
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const sql = db();
  if (!sql) return { error: "Accounts aren’t connected yet." };
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { field: "password", error: "Passwords need at least 10 characters." };
  if (password.length > 200) return { field: "password", error: "That password is too long." };
  const [t] = await sql<{ member_id: string }[]>`
    update musicvolume.email_tokens set used_at = now()
     where id = ${tokenId(token)} and purpose = 'reset' and used_at is null and expires_at > now()
     returning member_id`;
  if (!t) return { error: "That link has expired or was already used. Ask for a new one." };
  const hash = await hashPassword(password);
  // A new password signs out every other browser; following the link also confirms the email.
  await sql`update musicvolume.members set password_hash = ${hash}, email_verified_at = coalesce(email_verified_at, now()),
              failed_logins = 0, locked_until = null where id = ${t.member_id}`;
  await sql`delete from musicvolume.sessions where member_id = ${t.member_id}`;
  await startSession(t.member_id);
  redirect("/");
}
