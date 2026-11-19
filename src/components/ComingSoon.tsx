import Link from "next/link";
import Header from "./Header";

/** Placeholder for pages that arrive in a later step. */
export default function ComingSoon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col items-center px-6 py-28 text-center">
        <h1 className="text-[28px] font-semibold">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/65">{children ?? "This page is on its way."}</p>
        <Link href="/" className="mt-8 rounded-full border border-white px-5 py-2 text-[14px] hover:bg-white/10">Back to search</Link>
      </main>
    </>
  );
}
