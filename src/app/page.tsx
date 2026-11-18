// Home: the wave picture, the big wordmark, search and "Contribute".
// Figma: Graham's "Initial Design" homepage, plus "P7 · Home · signed out" for visitors.
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchBox from "@/components/SearchBox";
import { getViewer, roleLabel } from "@/lib/viewer";

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home-wave.jpg" alt="" className="size-full object-cover object-[50%_70%]" />
        <div className="absolute inset-0 bg-black/80" />
      </div>

      <Header home />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[30px] px-6 pb-[60px]">
        <h1 className="text-[52px] leading-none font-bold tracking-[-0.01em] md:text-[80px]">musicvolu.me</h1>
        <div className="flex w-full max-w-[354px] flex-col gap-[15px] md:max-w-[360px]">
          <SearchBox variant="home" />
          <Link href={viewer ? "/contribute" : "/signup?next=/contribute"}
            className="flex h-11 items-center justify-between rounded-full border border-white px-5 text-[14px] hover:bg-white/10 md:h-9">
            <span className="md:hidden">Can’t find it? Contribute.</span>
            <span className="hidden md:inline">Can’t find what you’re looking for? Contribute.</span>
            <span className="font-mono text-[16px]">+</span>
          </Link>
          {viewer ? (
            <p className="mt-3 flex items-baseline justify-center gap-3 md:hidden">
              <span className="font-mono text-[15px]">{viewer.username}</span>
              <span className="rounded-full bg-white px-3 py-0.5 text-[13px] text-black">{roleLabel(viewer)}</span>
            </p>
          ) : (
            <p className="mt-2 text-center text-[14px] leading-[1.45] text-white/70 md:-mx-4">
              An open, reviewed database of music info. Anyone can search it. Members suggest edits, and editors check every one.
            </p>
          )}
        </div>
      </main>

      <Footer className="relative z-10" />
    </div>
  );
}
