// Top bar. Desktop: logo, search, Contribute, then Review board (+ Final review) + your name + tier badge (or Log in /
// Create account when signed out). Phone: logo, then search, add and menu icons.
// On Home the bar has no search box, sits on the video, and (signed in) has the ☰ menu on desktop too.
import Link from "next/link";
import { can, getCounts } from "@/lib/review";
import { getViewer, roleLabel, tierColor } from "@/lib/viewer";
import AccountMenu from "./AccountMenu";
import { Logo, PlusIcon, SearchIcon } from "./icons";
import PhoneMenu from "./PhoneMenu";
import SearchBox from "./SearchBox";

/** home: on the wave picture, no search. bare: account pages (no search; phones show "Close"). */
export default async function Header({ home = false, bare = false, q = "" }: { home?: boolean; bare?: boolean; q?: string }) {
  const viewer = await getViewer();
  // "Review board" always opens the whole board, with what needs review; tier 3 editors and admins
  // also get "Final review" to its right, with what waits to publish (Graham, 2026-11-21).
  const counts = viewer && can.see(viewer) ? await getCounts(viewer) : null;
  const publisher = can.publish(viewer);
  const buttons = counts ? [
    { label: "Review board", n: counts.needs_review, href: "/review", badge: "bg-white text-black" },
    ...(publisher ? [{ label: "Final review", n: counts.final_review, href: "/review?view=list&stage=final_review", badge: "bg-[#fa99cc] text-black" }] : []),
  ] : [];
  const review = buttons.length > 0;
  return (
    <header className={home ? "relative z-20" : `sticky top-0 z-30 border-b bg-black ${bare ? "border-white/15" : "border-line"}`}>
      <div className={`flex items-center gap-10 px-4 md:px-[60px] ${home ? "h-[58px] md:h-auto md:pt-[30px]" : "h-[58px] md:h-[72px]"}`}>
        <Link href="/" aria-label="musicvolu.me home" className="shrink-0"><Logo /></Link>

        {!home && !bare && (
          <div className="hidden w-full max-w-[520px] md:block">
            <SearchBox key={q} initial={q} />
          </div>
        )}
        {!home && !bare && viewer && (
          <Link href="/contribute" className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white py-[5px] pr-4 pl-3 text-[14px] hover:bg-white/10 md:inline-flex">
            <PlusIcon /> Contribute
          </Link>
        )}

        <div className="ml-auto hidden items-center gap-5 md:flex">
          {viewer ? (
            <>
              {!bare && buttons.map((b) => (
                <Link key={b.label} href={b.href} className="inline-flex items-center gap-2 rounded-full border border-white py-[5px] pr-1.5 pl-4 text-[14px] whitespace-nowrap hover:bg-white/10">
                  {b.label} <span className={`min-w-5 rounded-full px-1.5 text-center text-[12px] font-medium ${b.badge}`}>{b.n}</span>
                </Link>
              ))}
              <AccountMenu username={viewer.username} badge={roleLabel(viewer)} color={tierColor(viewer)} admin={viewer.role === "admin"} />
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <Link href="/login" className="rounded-full border border-white/70 px-3.5 py-[5px] text-[14px] hover:border-white hover:bg-white/10">Log in</Link>
              <Link href="/signup" className="rounded-full bg-white px-3.5 py-[5px] text-[14px] text-black hover:bg-white/85">Create account</Link>
            </div>
          )}
          {home && viewer && <PhoneMenu signedIn review={review} username={viewer.username} admin={viewer.role === "admin"} />}
        </div>

        <div className="ml-auto flex items-center gap-5 md:hidden">
          {bare && <Link href="/" className="text-[14px] text-white/60">Close</Link>}
          {!home && !bare && (
            <>
              <Link href={`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`} aria-label="Search"><SearchIcon size={22} className="text-white" /></Link>
              <Link href="/contribute" aria-label="Contribute"><PlusIcon size={22} /></Link>
            </>
          )}
          {!bare && (viewer || !home) && <PhoneMenu signedIn={!!viewer} review={review} username={viewer?.username} admin={viewer?.role === "admin"} />}
        </div>
      </div>
    </header>
  );
}
