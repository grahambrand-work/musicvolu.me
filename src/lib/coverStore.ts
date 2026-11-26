// Saving a published cover on our own storage: the "album-covers" bucket in the Noteworthy
// Supabase (public, so both sites can show it). Needs SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in the site's settings; without them publishing a cover says so.
import "server-only";
import { createHash } from "node:crypto";
import { coverJpeg, fetchCover } from "./coverFetch";

const BUCKET = "album-covers";

export const coverStorageReady = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export type StoredCover = { large: string; small: string; sha: string; width: number; height: number };

async function put(path: string, body: Buffer) {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "true",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Downloads the link once, makes a 1200 px and a 300 px square JPEG, and saves both. */
export async function storeCover(link: string): Promise<StoredCover> {
  const img = await fetchCover(link);  // (reads our own pending uploads straight from storage)
  const [large, small] = await Promise.all([coverJpeg(img.buffer, Math.min(1200, img.width, img.height)), coverJpeg(img.buffer, 300, 80)]);
  // Named by content, so the same picture is only ever stored once.
  const sha = createHash("sha256").update(large).digest("hex");
  const dir = `${sha.slice(0, 2)}/${sha.slice(0, 24)}`;
  const [l, s] = await Promise.all([put(`${dir}-1200.jpg`, large), put(`${dir}-300.jpg`, small)]);
  return { large: l, small: s, sha, width: img.width, height: img.height };
}

// Uploaded pictures (Graham, 2026-11-25): admins and tier 3 editors can upload a cover or artist
// photo instead of linking one. The upload waits in "pending/" with a random name, and the edit
// carries its address like any other link. Once the edit is published (the picture is then saved
// under its own name, as for a link) or rejected, the pending file is deleted, so the only copy
// left is the one the catalog uses. Unsent uploads are swept after a day.

const PENDING = "pending/";
const base = () => process.env.SUPABASE_URL!.replace(/\/$/, "");
const publicPrefix = () => `${base()}/storage/v1/object/public/${BUCKET}/`;

/** "pending/abc.jpg" when the link is one of our uploads waiting for review, else null. */
export function pendingPath(link: unknown): string | null {
  if (typeof link !== "string" || !coverStorageReady()) return null;
  const pre = publicPrefix() + PENDING;
  if (!link.startsWith(pre)) return null;
  const name = link.slice(pre.length);
  return /^[0-9a-f-]{36}\.jpg$/.test(name) ? PENDING + name : null;
}

/** Saves an uploaded picture (already checked) in pending/ and returns its address. */
export async function storePending(jpeg: Buffer): Promise<string> {
  await sweepPending().catch((e) => console.error("sweep pending:", (e as Error).message));
  return put(`${PENDING}${crypto.randomUUID()}.jpg`, jpeg);
}

/** Downloads one of our pending uploads straight from storage. */
export async function readPending(path: string): Promise<Buffer> {
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`storage read ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Deletes files from the bucket. Missing files are fine. */
export async function removeFiles(paths: string[]) {
  if (!paths.length || !coverStorageReady()) return;
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`storage delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Path inside the bucket for one of our stored files' public addresses. */
export function bucketPath(url: unknown): string | null {
  if (typeof url !== "string" || !coverStorageReady() || !url.startsWith(publicPrefix())) return null;
  return url.slice(publicPrefix().length);
}

/** Pending uploads over a day old that no open edit uses. */
async function sweepPending() {
  const res = await fetch(`${base()}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ prefix: "pending", limit: 1000, sortBy: { column: "created_at", order: "asc" } }),
  });
  if (!res.ok) return;
  const files = (await res.json()) as { name: string; created_at: string | null }[];
  const old = files.filter((f) => f.name && f.created_at && Date.now() - Date.parse(f.created_at) > 24 * 3600_000);
  if (!old.length) return;
  const { db } = await import("./db");
  const urls = old.map((f) => publicPrefix() + PENDING + f.name);
  const used = await db()!<{ link: string }[]>`
    select changes->'cover'->>'to' as link from musicvolume.submissions
     where status in ('needs_review', 'in_review', 'changes_requested', 'final_review') and changes->'cover'->>'to' = any(${urls})`;
  const keep = new Set(used.map((u) => u.link));
  await removeFiles(old.filter((f) => !keep.has(publicPrefix() + PENDING + f.name)).map((f) => PENDING + f.name));
}

/**
 * After an edit is published or rejected: deletes its pending upload, and (rejected) any copies
 * made while checking it for publishing that nothing in the catalog uses. Never throws; a file
 * left behind is only logged (the pending sweep catches it later).
 */
export async function cleanUpCover(number: number, published: boolean) {
  if (!coverStorageReady()) return;
  try {
    const { db } = await import("./db");
    const sql = db()!;
    const [s] = await sql<{ link: string | null; large: string | null; small: string | null }[]>`
      select changes->'cover'->>'to' as link, cover_stored->>'large' as large, cover_stored->>'small' as small
        from musicvolume.submissions where number = ${number}`;
    if (!s) return;
    const paths: string[] = [];
    const pending = pendingPath(s.link);
    if (pending) paths.push(pending);
    if (!published) {
      const stored = [s.large, s.small].filter((x): x is string => !!x);
      if (stored.length) {
        const used = await sql<{ url: string }[]>`
          select u.url from unnest(${stored}::text[]) u(url)
           where exists (select 1 from public.releases r where r.cover_url = u.url or r.cover_small_url = u.url)
              or exists (select 1 from public.artists a where a.image_url = u.url)`;
        const keep = new Set(used.map((u) => u.url));
        for (const u of stored) if (!keep.has(u)) { const p = bucketPath(u); if (p) paths.push(p); }
      }
    }
    await removeFiles(paths);
  } catch (e) {
    console.error("cover clean-up", number, (e as Error).message);
  }
}
