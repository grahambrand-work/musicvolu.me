// The artist page search box (GET /api/artist-search?artist=lorde&q=royals): search within one
// artist, ranked like the main search (public.search_artist, shared with Noteworthy). A plain
// request so the browser can cancel outdated ones. null = no database: the page filters instead.
import { NextResponse, type NextRequest } from "next/server";
import { searchArtist } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const artist = (request.nextUrl.searchParams.get("artist") ?? "").slice(0, 200);
  if (!artist) return NextResponse.json({ hits: [] });
  try {
    return NextResponse.json({ hits: await searchArtist(artist, q) });
  } catch (e) {
    console.error("artist search:", (e as Error).message);
    return NextResponse.json({ hits: [], failed: true });
  }
}
