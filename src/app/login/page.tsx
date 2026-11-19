import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { safeNext } from "@/lib/gate";
import { getViewer } from "@/lib/viewer";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  return (
    <AuthShell title="Log in">
      <LoginForm next={next} />
    </AuthShell>
  );
}
