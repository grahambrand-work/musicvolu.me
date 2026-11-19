// The link in the confirmation email. It opens a page that confirms with one tap (done
// automatically when the page loads), so link-checkers in some inboxes can't use up the link.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { getViewer } from "@/lib/viewer";
import VerifyForm from "./VerifyForm";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const token = (await searchParams).token;
  if (await getViewer()) redirect("/welcome"); // already confirmed and signed in
  return (
    <AuthShell title="Confirm your email" intro="One moment while we finish creating your account.">
      <VerifyForm token={typeof token === "string" ? token : ""} />
    </AuthShell>
  );
}
