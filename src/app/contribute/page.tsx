import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Contribute" };

export default function ContributePage() {
  return <ComingSoon title="Contribute">Adding new artists, releases and songs arrives once accounts are ready.</ComingSoon>;
}
