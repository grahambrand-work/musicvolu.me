// Search results: one list ranked by best match, with a preview of the selected entry on the
// right (desktop) or in a sheet that slides up (phone). Figma: Phase 1, option C.
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import SearchBox from "@/components/SearchBox";
import { Cover, NoDatabase, Tag } from "@/components/ui";
import { searchCatalog, searchTooShort, SearchTooSlow, type Hit, type SearchFilter } from "@/lib/catalog";
import { hitHref } from "@/lib/links";
import Preview from "./Preview";
import PhoneSheet from "./PhoneSheet";

const FILTERS: { key: SearchFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "artists", label: "Artists" }, { key: "releases", label: "Releases" }, { key: "songs", label: "Songs" },
];

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = String((await searchParams).q ?? "").trim();
  return { title: q ? `“${q}”` : "Search" };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const filter = (FILTERS.find((f) => f.key === sp.type)?.key ?? "all") as SearchFilter;
  const open = typeof sp.open === "string" ? sp.open : null;
  const short = !!q && searchTooShort(q);
  let slow = false;
  let hits: Hit[] | null = [];
  if (q && !short) {
    try { hits = await searchCatalog(q, filter); }
    catch (e) { if (e instanceof SearchTooSlow) slow = true; else throw e; }
  }

  // Links back to this page: the selected entry ("open") is only kept when asked for.
  const qs = ({ type = filter, open = null }: { type?: SearchFilter; open?: string | null }) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (type !== "all") p.set("type", type);
    if (open) p.set("open", open);
    return `/search?${p}`;
  };
  const keyOf = (h: Hit) => `${h.kind}:${h.slug}`;
  const selected = hits?.find((h) => keyOf(h) === open && !h.review) ?? null;
  const shown = selected ?? hits?.find((h) => !h.review) ?? null; // desktop always previews something

  return (
    <>
      <Header q={q} />
      <div className="px-4 pt-4 md:hidden">
        <SearchBox key={q} initial={q} autoFocus={!q} />
      </div>
      {hits === null ? <NoDatabase /> : (
        <main className="flex items-start pb-20 md:pt-8 md:pr-[60px] md:pl-12">
          <section className="w-full shrink-0 md:w-[560px] md:pr-9">
            {q && (
              <div className="hidden items-baseline justify-between pb-4 pl-3 md:flex">
                <h1 className="text-[22px] font-semibold">{hits.length >= 40 ? "40+" : hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”</h1>
                <span className="text-[13px] text-white/70">Best match</span>
              </div>
            )}
            {q && (
              <nav className="flex gap-1.5 px-4 pt-3 pb-4 md:px-3 md:pt-0" aria-label="Show">
                {FILTERS.map((f) => (
                  <Link key={f.key} href={qs({ type: f.key })}
                    scroll={false}
                    className={`rounded-full px-3 py-1 text-[13px] ${filter === f.key ? "bg-white text-black" : "border border-white/35 hover:border-white"}`}>
                    {f.label}
                  </Link>
                ))}
              </nav>
            )}
            {!q && <p className="px-4 py-10 text-[14px] text-white/60 md:px-3">Search for an artist, album or song.</p>}
            {short && <p className="px-4 py-10 text-[14px] text-white/60 md:px-3">Type at least 3 letters to search.</p>}
            {slow && (
              <div className="px-4 py-10 md:px-3">
                <p className="text-[15px]">That search took too long.</p>
                <p className="mt-1 text-[14px] text-white/60">Try more words, like the artist and the title together.</p>
              </div>
            )}
            {q && !short && !slow && hits.length === 0 && (
              <div className="px-4 py-10 md:px-3">
                <p className="text-[15px]">Nothing found for “{q}”.</p>
                <p className="mt-1 text-[14px] text-white/60">Check the spelling, or <Link href="/contribute" className="underline">add it to musicvolu.me</Link>.</p>
              </div>
            )}
            <ul className="flex flex-col md:gap-0.5">
              {hits.map((h) => {
                const isShown = shown && keyOf(h) === keyOf(shown);
                return (
                  <li key={keyOf(h)} className="border-b border-white/10 md:border-0">
                    <Link href={h.review ? hitHref(h) : qs({ open: keyOf(h) })} scroll={false}
                      className={`flex items-center gap-3.5 px-4 py-[9px] md:rounded-[8px] md:px-3 ${isShown ? "md:bg-white/9" : "md:hover:bg-white/5"}`}>
                      <Cover src={h.cover} size={40} round={h.kind === "artist"} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-mono text-[15px] font-bold">{h.title}</span>
                        <span className="mt-0.5 block truncate font-mono text-[12px] text-white/55">
                          {h.review ? <><span className="font-sans text-teal">In review</span>{h.sub.slice(1).map((x) => ` · ${x}`)}</> : h.sub.join(" · ")}
                        </span>
                      </span>
                      <Tag>{h.tag}</Tag>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {shown && (
            <>
              <div aria-hidden className="hidden w-px self-stretch bg-line md:block" />
              <aside className="hidden min-w-0 flex-1 pt-2 pl-12 md:block">
                <Preview kind={shown.kind} slug={shown.slug} q={q} />
              </aside>
            </>
          )}
          {selected && (
            <PhoneSheet closeHref={qs({})}>
              <Preview kind={selected.kind} slug={selected.slug} q={q} compact />
            </PhoneSheet>
          )}
        </main>
      )}
    </>
  );
}
