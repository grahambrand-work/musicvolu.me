import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import ResetForm from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const token = (await searchParams).token;
  return (
    <AuthShell title="Choose a new password" intro="You’ll be logged in, and logged out everywhere else.">
      <ResetForm token={typeof token === "string" ? token : ""} />
    </AuthShell>
  );
}
