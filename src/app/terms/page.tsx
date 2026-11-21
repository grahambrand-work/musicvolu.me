import type { Metadata } from "next";
import TextPage, { Section } from "@/components/TextPage";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <TextPage title="Terms" updated="November 21, 2026" intro="By using musicvolu.me you agree to these terms. They're short, so please read them.">
      <Section title="Your account">
        <p>Keep your password to yourself. You&rsquo;re responsible for what&rsquo;s done with your account. One account per person.</p>
      </Section>
      <Section title="What you contribute">
        <p>Only add information that&rsquo;s accurate and that you can back up with a source. Don&rsquo;t copy text, images or data you don&rsquo;t have the right to share.</p>
        <p>When you submit an edit or a new entry, you agree that musicvolu.me may publish it, change it, and share it as part of an open music database, without payment, and with credit to your username in the edit history.</p>
      </Section>
      <Section title="Being fair">
        <p>No spam, vandalism, harassment, or editing to promote yourself or others. Editors and admins may reject edits, reduce a tier, or close an account that breaks these terms.</p>
      </Section>
      <Section title="The data">
        <p>Much of the catalog comes from MusicBrainz and is shared under its licenses. We work hard to keep it right, but it&rsquo;s provided as it is, without guarantees.</p>
      </Section>
      <Section title="Changes">
        <p>We may update these terms. If the changes matter, we&rsquo;ll tell members by email or on the site. Questions: <a href="mailto:hello@musicvolu.me">hello@musicvolu.me</a>.</p>
      </Section>
    </TextPage>
  );
}
