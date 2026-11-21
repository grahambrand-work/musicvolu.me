// The search dropdown's results while typing (GET /api/suggest?q=lorde). A plain request
// rather than a server action, so the browser can cancel one that's out of date: server
// actions run one at a time, so every outdated keystroke used to finish before the newest.
import { NextResponse, type NextRequest } from "next/server";
import { suggest } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  if (q.trim().length < 2) return NextResponse.json(null);
  try {
    return NextResponse.json(await suggest(q));
  } catch (e) {
    console.error("suggest:", (e as Error).message);
    return NextResponse.json(null);
  }
}
