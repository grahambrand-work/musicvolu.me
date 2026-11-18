// Top bar. Desktop: logo, search, then Contribute + your name + tier badge (or Log in /
// Create account when signed out). Phone: logo, then search, add and menu icons.
// On Home the bar has no search box and sits on the wave picture.
import Link from "next/link";
import { getViewer, roleLabel } from "@/lib/viewer";
import { Logo, PlusIcon, SearchIcon } from "./icons";
import PhoneMenu from "./PhoneMenu";
import SearchBox from "./SearchBox";

export default async function Header({ home = false, q = "" }: { home?: boolean; q?: string }) {
  const viewer = await getViewer();
  return (
    <header className={home ? "relative z-10" : "sticky top-0 z-30 border-b border-line bg-black"}>
      <div className={`flex items-center gap-10 px-4 md:px-[60px] ${home ? "h-[100px] pt-4 md:h-auto md:pt-[30px]" : "h-[100px] pt-[30px] md:h-[72px] md:pt-0"}`}>
        <Link href="/" aria-label="musicvolu.me home" className="shrink-0"><Logo /></Link>

        {!home && (
          <div className="hidden w-full max-w-[520px] md:block">
            <SearchBox key={q} initial={q} />
          </div>
        )}

        <div className="ml-auto hidden items-center gap-5 md:flex">
          {viewer ? (
            <>
              {!home && (
                <Link href="/contribute" className="inline-flex items-center gap-1.5 rounded-full border border-white py-[5px] pr-4 pl-3 text-[14px] hover:bg-white/10">
                  <PlusIcon /> Contribute
                </Link>
              )}
              <span className="font-mono text-[16px]">{viewer.username}</span>
              <span className="rounded-full bg-white px-4 py-0.5 text-[14px] text-black">{roleLabel(viewer)}</span>
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <Link href="/login" className="rounded-full border border-white/70 px-3.5 py-[5px] text-[14px] hover:border-white hover:bg-white/10">Log in</Link>
              <Link href="/signup" className="rounded-full bg-white px-3.5 py-[5px] text-[14px] text-black hover:bg-white/85">Create account</Link>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-5 md:hidden">
          {!home && (
            <>
              <Link href={`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`} aria-label="Search"><SearchIcon size={22} className="text-white" /></Link>
              <Link href="/contribute" aria-label="Contribute"><PlusIcon size={22} /></Link>
            </>
          )}
          <PhoneMenu signedIn={!!viewer} />
        </div>
      </div>
    </header>
  );
}
