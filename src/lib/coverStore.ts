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
  const img = await fetchCover(link);
  const [large, small] = await Promise.all([coverJpeg(img.buffer, Math.min(1200, img.width, img.height)), coverJpeg(img.buffer, 300, 80)]);
  // Named by content, so the same picture is only ever stored once.
  const sha = createHash("sha256").update(large).digest("hex");
  const dir = `${sha.slice(0, 2)}/${sha.slice(0, 24)}`;
  const [l, s] = await Promise.all([put(`${dir}-1200.jpg`, large), put(`${dir}-300.jpg`, small)]);
  return { large: l, small: s, sha, width: img.width, height: img.height };
}
