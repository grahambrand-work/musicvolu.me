import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <ComingSoon title="Create account">Accounts are coming in the next update. Until then you can search and browse everything.</ComingSoon>;
}
