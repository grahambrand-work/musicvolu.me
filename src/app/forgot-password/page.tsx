import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import ForgotForm from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPage({ searchParams }: PageProps<"/forgot-password">) {
  const sent = (await searchParams).sent;
  if (typeof sent === "string") {
    return (
      <AuthShell title="Check your email" intro={<>If <span className="text-white/85">{sent}</span> has an account, we sent it a link to choose a new password. The link works for 1 hour.</>}>
        <Link href="/login" className="w-full rounded-full border border-white py-2.5 text-center text-[15px] hover:bg-white/10">Back to log in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Forgot your password?" intro="Enter your email and we’ll send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
