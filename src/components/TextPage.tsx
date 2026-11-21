// Plain reading pages (About, Help, Privacy, Terms): a title, an intro, then sections.
import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="text-[19px] font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.6] text-white/80 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-white">{children}</div>
    </section>
  );
}

export default function TextPage({ title, intro, updated, children }: { title: string; intro: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-10 pb-24 md:pt-16">
        <h1 className="text-[34px] leading-tight font-semibold md:text-[44px]">{title}</h1>
        <p className="mt-4 text-[17px] leading-[1.55] text-white/80">{intro}</p>
        {updated && <p className="mt-2 text-[13px] text-white/50">Last updated {updated}</p>}
        <div className="mt-10 flex flex-col gap-9">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
