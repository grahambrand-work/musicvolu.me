// Cover images people link to (Graham, 2026-11-21): a suggested cover is only a link until it's
// published, so nothing is stored for submissions that wait or get rejected. This file fetches
// such a link safely, checks it's a real image, and makes the sizes the site uses.
//
// Safety: the link is typed by a member, so the fetch only goes to public internet addresses
// over https (never this server, the database or anything on the private network), follows at
// most 3 redirects (each checked again), gives up after 10 seconds and stops reading at 10 MB.
import "server-only";
import { lookup } from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";
import { pendingPath, readPending } from "./coverStore";

export const MAX_BYTES = 10 * 1024 * 1024;
export const MIN_SIZE = 500;
const TIMEOUT_MS = 10_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

export class CoverError extends Error {}

/** Swappable only by local tests (no DNS there): the name lookup and TLS checks. Never set by the site. */
export const testHooks: { lookup: typeof lookup; insecureTls: boolean; allowPrivate: boolean } = { lookup, insecureTls: false, allowPrivate: false };

/** True for addresses that aren't on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9")
    || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff") || x.startsWith("64:ff9b") || x.startsWith("2001:db8");
}

/** The link as a URL we're willing to fetch, or a reason why not. */
export function checkLink(raw: string): URL | string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return "That isn't a working link. Paste the full address, starting with https://"; }
  if (u.protocol !== "https:") return "Use a link that starts with https://";
  if (u.username || u.password) return "Use a plain link to the image.";
  if (u.port && u.port !== "443") return "Use a plain link to the image.";
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) || !u.hostname.includes(".")) return "Use a link to a website, not an address.";
  if (raw.length > 1000) return "That link is too long.";
  return u;
}

/** Downloads the link (checked at every hop) and returns its bytes. */
async function download(start: URL): Promise<Buffer> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await get(url);
    if (res.redirect) {
      if (hop === 3) throw new CoverError("That link redirects too many times.");
      const next = checkLink(new URL(res.redirect, url).toString());
      if (typeof next === "string") throw new CoverError("That link redirects somewhere we can't follow.");
      url = next;
      continue;
    }
    return res.body!;
  }
  throw new CoverError("That link redirects too many times.");
}

function get(url: URL): Promise<{ redirect?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const fail = (m: string) => reject(new CoverError(m));
    const req = https.get(url, {
      headers: { "user-agent": "musicvolu.me cover check", accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      timeout: TIMEOUT_MS,
      // Resolve the name ourselves and refuse private addresses, so the check and the connection use the same address.
      rejectUnauthorized: !testHooks.insecureTls,
      lookup: (host, opts, cb) => testHooks.lookup(host, { all: true }, (err, addrs) => {
        if (err || !addrs.length) return cb(err ?? new Error("no address"), "", 0);
        const bad = testHooks.allowPrivate ? undefined : addrs.find((a) => isPrivateAddress(a.address));
        if (bad) return cb(Object.assign(new Error("private"), { code: "EPRIVATE" }), "", 0);
        const pickOne = addrs[0];
        if ((opts as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof addrs) => void)(null, [pickOne]);
        cb(null, pickOne.address, pickOne.family);
      }),
    }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) { res.resume(); return resolve({ redirect: res.headers.location }); }
      if (code === 401 || code === 403) { res.resume(); return fail("That website doesn't let other sites use its images. Try a different link."); }
      if (code !== 200) { res.resume(); return fail(`That link didn't load (the website answered ${code}).`); }
      const type = String(res.headers["content-type"] ?? "").toLowerCase();
      if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream") && !type.startsWith("binary/")) {
        res.resume();
        return fail("That link opens a web page, not an image. Right-click the picture and copy the image address instead.");
      }
      if (Number(res.headers["content-length"] ?? 0) > MAX_BYTES) { res.resume(); return fail("That image is over 10 MB."); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); fail("That image is over 10 MB."); } else chunks.push(c);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks) }));
      res.on("error", () => fail("That link stopped loading part way."));
    });
    req.on("timeout", () => { req.destroy(); fail("That link took too long to load."); });
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof CoverError) return reject(e);
      fail(e.code === "EPRIVATE" ? "That link points somewhere we can't load from." : "That link didn't load. Check it opens in your browser.");
    });
  });
}

export type CoverImage = { buffer: Buffer; width: number; height: number; format: string };

/** Fetches a cover link and checks it: JPEG, PNG or WebP, at least 500 × 500, under 10 MB. */
export async function fetchCover(link: string): Promise<CoverImage> {
  const pending = pendingPath(link);
  let buffer: Buffer;
  if (pending) {
    // One of our own uploads: read from storage directly.
    try { buffer = await readPending(pending); } catch { throw new CoverError("That uploaded picture is no longer there. Upload it again."); }
  } else {
    const u = checkLink(link);
    if (typeof u === "string") throw new CoverError(u);
    buffer = await download(u);
  }
  return checkImage(buffer);
}

/** Checks picture bytes: JPEG, PNG or WebP, at least 500 × 500. */
export async function checkImage(buffer: Buffer): Promise<CoverImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try { meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata(); } catch { throw new CoverError("That link isn't an image we can read. Use a JPEG, PNG or WebP."); }
  if (!meta.format || !FORMATS.has(meta.format)) throw new CoverError("Use a JPEG, PNG or WebP image.");
  const width = meta.width ?? 0, height = meta.height ?? 0;
  if (width < MIN_SIZE || height < MIN_SIZE) throw new CoverError(`That image is ${width} × ${height}. Covers need to be at least ${MIN_SIZE} × ${MIN_SIZE}.`);
  return { buffer, width, height, format: meta.format };
}

/** A square JPEG of the cover at the given size (covers are cropped to the middle square). */
export function coverJpeg(img: Buffer, size: number, quality = 85): Promise<Buffer> {
  return sharp(img, { limitInputPixels: 50_000_000 }).rotate().resize(size, size, { fit: "cover" }).flatten({ background: "#000" })
    .jpeg({ quality, mozjpeg: true }).toBuffer();
}
