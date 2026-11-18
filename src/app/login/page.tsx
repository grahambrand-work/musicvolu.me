import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <ComingSoon title="Log in">Accounts are coming in the next update. Until then you can search and browse everything.</ComingSoon>;
}
