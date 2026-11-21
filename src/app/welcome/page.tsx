// After confirming an email. Figma "P7 · Welcome".
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { getAllowances, limitFor, PROMOTE_AT } from "@/lib/members";
import { getViewer, roleLabel, tierColor } from "@/lib/viewer";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const v = await getViewer();
  if (!v) redirect("/login");
  const a = await getAllowances();
  const allowance = await limitFor(v, a);
  const points = [
    allowance && { title: `${allowance} edits a month`, text: "Suggest changes or add new music. An editor checks each one before it goes live." },
    v.role === "contributor" && v.tier < 3 && { title: "Move up tiers", text: v.tier === 1
      ? `${PROMOTE_AT[2]} published edits makes you a tier 2 contributor, with ${a.now[2]} edits a month and access to the review board.`
      : `${PROMOTE_AT[3]} published edits makes you a tier 3 contributor, with ${a.now[3]} edits a month.` },
    { title: "Credit where it’s due", text: "Your username shows on every change you make, in its edit history." },
  ].filter(Boolean) as { title: string; text: string }[];
  return (
    <AuthShell title={<>Welcome, <span className="font-mono font-bold">{v.username}</span></>}>
      <span className="-mt-2 w-fit rounded-full px-2.5 py-0.5 text-[12px] text-black" style={{ background: tierColor(v) }}>{roleLabel(v)}</span>
      <ul className="border-t border-white/15">
        {points.map((p) => (
          <li key={p.title} className="border-b border-white/15 py-4">
            <p className="text-[15px] font-medium">{p.title}</p>
            <p className="mt-1 text-[14px] leading-snug text-white/60">{p.text}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2.5 pt-2">
        <Link href="/" className="rounded-full bg-white py-2.5 text-center text-[16px] font-medium text-black hover:bg-white/85">Get started</Link>
      </div>
    </AuthShell>
  );
}
