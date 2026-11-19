// Home: the wave picture, the big wordmark, search and "Contribute".
// Figma: Graham's "Initial Design" homepage, plus "P7 · Home · signed out" for visitors.
import Link from "next/link";
import HomeBackdrop from "@/components/HomeBackdrop";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchBox from "@/components/SearchBox";
import { getViewer, roleLabel } from "@/lib/viewer";

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <HomeBackdrop className="z-0" />

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
            <>
              <p className="mt-2 hidden text-center text-[14px] leading-[1.45] text-white/70 md:-mx-4 md:block">
                An open, reviewed database of music info. Anyone can search it. Members suggest edits, and editors check every one.
              </p>
              <div className="mt-2 flex justify-center gap-2.5 md:hidden">
                <Link href="/login" className="rounded-full border border-white/70 px-3.5 py-[5px] text-[14px]">Log in</Link>
                <Link href="/signup" className="rounded-full bg-white px-3.5 py-[5px] text-[14px] text-black">Create account</Link>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer className="relative z-10" />
    </div>
  );
}
