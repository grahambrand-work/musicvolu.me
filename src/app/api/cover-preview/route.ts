// Previews of a linked cover, for signed-in members: on the edit and new-album forms (?url=…,
// with ?check=1 for "is this link usable?") and on the review board (?n=<submission number>).
// The picture is fetched by the server and shrunk, so nobody's browser contacts the other
// website, and nothing is kept beyond a short in-memory cache.
import { NextResponse, type NextRequest } from "next/server";
import { CoverError, coverJpeg, fetchCover } from "@/lib/coverFetch";
import { db } from "@/lib/db";
import { can } from "@/lib/review";
import { getViewer } from "@/lib/viewer";

type Entry = { at: number; jpeg?: Buffer; width?: number; height?: number; error?: string };
const cache = new Map<string, Entry>();
const TTL = 10 * 60_000;

async function preview(link: string): Promise<Entry> {
  const hit = cache.get(link);
  if (hit && Date.now() - hit.at < TTL) return hit;
  let e: Entry;
  try {
    const img = await fetchCover(link);
    e = { at: Date.now(), jpeg: await coverJpeg(img.buffer, 400, 80), width: img.width, height: img.height };
  } catch (err) {
    e = { at: Date.now(), error: err instanceof CoverError ? err.message : "That link didn't load. Check it opens in your browser." };
  }
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  cache.set(link, e);
  return e;
}

export async function GET(request: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ ok: false, error: "Log in to preview covers." }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  let link = sp.get("url") ?? "";
  const n = Number(sp.get("n"));
  if (Number.isSafeInteger(n) && n > 0) {
    const [s] = await db()!<{ member_id: string; link: string | null }[]>`
      select member_id, changes->'cover'->>'to' as link from musicvolume.submissions where number = ${n}`;
    if (!s?.link || (s.member_id !== v.id && !can.see(v))) return new NextResponse(null, { status: 404 });
    link = s.link;
  }
  if (!link || link.length > 1000) return NextResponse.json({ ok: false, error: "No link." }, { status: 400 });
  const e = await preview(link);
  if (sp.get("check")) return NextResponse.json(e.error ? { ok: false, error: e.error } : { ok: true, width: e.width, height: e.height });
  if (!e.jpeg) {
    // A grey square that says so, in place of a broken picture.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#1a1c1f"/><text x="200" y="190" fill="#ffffff99" font-family="sans-serif" font-size="22" text-anchor="middle">Couldn’t load</text><text x="200" y="222" fill="#ffffff99" font-family="sans-serif" font-size="22" text-anchor="middle">this link</text></svg>`;
    return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=60" } });
  }
  return new NextResponse(new Uint8Array(e.jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=600" } });
}
