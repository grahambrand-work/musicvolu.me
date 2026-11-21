import type { Metadata } from "next";
import Link from "next/link";
import TextPage, { Section } from "@/components/TextPage";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <TextPage title="Help" intro="How to find music, fix mistakes and add what's missing.">
      <Section title="Searching">
        <p>Type an artist, album or song into the search box. You can mix them, like &ldquo;lorde royals&rdquo;. Results are grouped into artists, releases and songs.</p>
      </Section>
      <Section title="Fixing a mistake">
        <p>Open the entry and press <strong>Suggest edit</strong>. Change any field: changed fields are outlined, and &ldquo;Your changes&rdquo; lists them. Add a note for the editors if it helps, then submit. It goes live once an editor has reviewed it and it has been published.</p>
        <p>You can change your edit while it&rsquo;s waiting for review, or after an editor asks for changes. Open it from the link you got after submitting.</p>
      </Section>
      <Section title="Adding missing music">
        <p>Go to <Link href="/contribute">Contribute</Link> and search first, so nothing gets added twice. If it isn&rsquo;t there, add the artist, release or song. A new artist shows up in search straight away, marked &ldquo;in review&rdquo;, so you can add their music right after.</p>
        <p>Please only add information you can back up with a source, like the official release, the label or the artist&rsquo;s own site.</p>
      </Section>
      <Section title="Tiers">
        <ul>
          <li><strong>Tier 1 contributors</strong> suggest up to 10 edits a month.</li>
          <li><strong>Tier 2 contributors</strong> suggest up to 25 a month, and can open the review board and like or dislike suggestions.</li>
          <li><strong>Tier 3 contributors</strong> suggest up to 50 a month, and also see pending and rejected edits in histories and the activity log.</li>
          <li><strong>Editors</strong> comment, ask for changes and send edits to final review. Tier 2 and 3 editors can also change and reject edits. Tier 3 editors publish.</li>
          <li><strong>Admins</strong> can do everything.</li>
        </ul>
        <p>Monthly allowances reset on the 1st. Editors can&rsquo;t review their own edits, and can&rsquo;t overturn a decision made by a higher-tier editor.</p>
      </Section>
      <Section title="Your account">
        <p>Log in with your email or your username. If you&rsquo;ve forgotten your password, use <Link href="/forgot-password">Forgot password</Link> on the log-in page. The link in the email works for 1 hour.</p>
        <p>To change your email or delete your account, write to <a href="mailto:hello@musicvolu.me">hello@musicvolu.me</a> from the address on your account.</p>
      </Section>
    </TextPage>
  );
}
