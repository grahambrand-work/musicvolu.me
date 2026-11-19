// Runs before each page: until launch, everything except the password screen (and Privacy /
// Terms) needs the site password once. See src/lib/gate.ts.
import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, OPEN_PATHS, gateToken } from "@/lib/gate";

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD;
  const { pathname, search } = request.nextUrl;
  if (password && !OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (request.cookies.get(GATE_COOKIE)?.value !== (await gateToken(password))) {
      const url = request.nextUrl.clone();
      url.pathname = "/gate";
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // Skip images, fonts and other files.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|mp4|webm)$).*)"],
};
