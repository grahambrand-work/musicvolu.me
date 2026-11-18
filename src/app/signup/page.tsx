import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { getViewer } from "@/lib/viewer";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = (await searchParams).next;
  if (await getViewer()) redirect(typeof next === "string" ? next : "/");
  return (
    <AuthShell title="Create your account" intro="Free. Start suggesting edits right away.">
      <SignupForm next={typeof next === "string" ? next : ""} />
    </AuthShell>
  );
}
