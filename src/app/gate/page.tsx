// Pre-launch password screen, in the homepage's style.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/icons";
import { safeNext } from "@/lib/gate";
import GateForm from "./GateForm";

export const metadata: Metadata = { title: "Enter password" };

export default async function GatePage({ searchParams }: PageProps<"/gate">) {
  const next = safeNext((await searchParams).next);
  if (!process.env.SITE_ACCESS_PASSWORD) redirect(next);
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-[30px] overflow-hidden px-6 pb-[60px]">
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home-wave.jpg" alt="" className="size-full object-cover object-[50%_70%]" />
        <div className="absolute inset-0 bg-black/80" />
      </div>
      <Logo className="absolute top-[30px] left-4 md:left-[60px]" />
      <h1 className="text-[52px] leading-none font-bold md:text-[80px]">musicvolu.me</h1>
      <GateForm next={next} />
      <p className="text-[14px] text-white/60">musicvolu.me is in private testing.</p>
    </div>
  );
}
