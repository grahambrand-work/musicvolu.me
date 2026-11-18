import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { resendVerify } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/signup/check">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  return (
    <AuthShell title="Check your email" intro={<>We sent a link to <span className="text-white/85">{email || "your email"}</span>. Click it to finish creating your account. The link works for 24 hours.</>}>
      <form action={resendVerify}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="w-full rounded-full border border-white py-2.5 text-[15px] hover:bg-white/10">Resend link</button>
      </form>
      {sp.sent && <p className="text-[13px] text-white/60">If that address has an unconfirmed account, a new link is on its way.</p>}
      <p className="flex items-baseline gap-1.5 text-[14px]">
        <span className="text-white/60">Wrong email?</span>
        <Link href="/signup" className="font-medium hover:underline">Go back</Link>
      </p>
    </AuthShell>
  );
}
