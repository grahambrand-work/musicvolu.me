// Password hashing (scrypt, built into Node) and random tokens for sessions and email links.
import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** "scrypt$N$r$p$salt$hash", all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A random token for a cookie or an email link, and the fingerprint we store instead of it. */
export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, id: tokenId(token) };
}

export function tokenId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** A hash used only to make wrong-email logins take as long as real ones. */
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
