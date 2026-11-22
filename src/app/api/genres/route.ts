// Every genre in the catalog (GET /api/genres), for the genre field's autocomplete. About 1,800
// names, most-used first. Counting uses takes a few seconds, so the list is worked out at most
// once an hour per server and browsers keep it for an hour too.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

let cache: { at: number; names: string[] } | null = null;

export async function GET() {
  const sql = db();
  if (!sql) return NextResponse.json([]);
  try {
    if (!cache || Date.now() - cache.at > 3_600_000) {
      const rows = await sql<{ name: string }[]>`
        select g.name from public.genres g
          left join (select genre_id, count(*) as n from public.artist_genres group by genre_id) a on a.genre_id = g.id
          left join (select genre_id, count(*) as n from public.release_genres group by genre_id) r on r.genre_id = g.id
         order by coalesce(a.n, 0) + coalesce(r.n, 0) desc, g.name`;
      cache = { at: Date.now(), names: rows.map((r) => r.name) };
    }
    return NextResponse.json(cache.names, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("genres:", (e as Error).message);
    return NextResponse.json([]);
  }
}
