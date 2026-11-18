import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return <ComingSoon title="Help" />;
}
