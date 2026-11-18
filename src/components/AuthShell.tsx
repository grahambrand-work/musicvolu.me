// The frame around account pages: plain header, one centred 420px column.
import type { ReactNode } from "react";
import Header from "./Header";

export default function AuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <Header bare />
      <main className="flex justify-center px-4 pt-8 pb-[120px] md:pt-20">
        <div className="flex w-full max-w-[420px] flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] font-semibold md:text-[30px]">{title}</h1>
            {intro && <p className="text-[14px] leading-snug text-white/60 md:text-[15px]">{intro}</p>}
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
