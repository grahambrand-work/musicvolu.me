import type { Metadata } from "next";
import TextPage, { Section } from "@/components/TextPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <TextPage title="Privacy" updated="November 21, 2026" intro="musicvolu.me keeps as little about you as it can. There are no ads and no tracking, and we never sell or share your information.">
      <Section title="What we keep">
        <ul>
          <li><strong>Your account:</strong> your email address, username and password. The password is stored only as a scrambled fingerprint (scrypt), so nobody can read it, including us.</li>
          <li><strong>What you contribute:</strong> your edits, new entries, comments and likes, and when you made them.</li>
          <li><strong>Sign-in:</strong> a cookie that keeps you logged in, and a list of your signed-in browsers so you can be logged out everywhere when you reset your password.</li>
        </ul>
      </Section>
      <Section title="What's public">
        <p>Your username, your tier, and everything you contribute are shown on the site with your username: on the review board, in edit histories and in the activity log. Your email address is never shown.</p>
      </Section>
      <Section title="Emails">
        <p>We email you only to confirm your address and to reset your password. They are sent through Resend, an email service, which sees your address only to deliver them.</p>
      </Section>
      <Section title="Cookies">
        <p>Only the ones the site needs: one to keep you logged in, and, while the site is in preview, one that remembers you entered the preview password. No analytics or advertising cookies.</p>
      </Section>
      <Section title="Where it's stored">
        <p>On our own server, rented from Hetzner. It&rsquo;s backed up every night, and backups are kept for a limited time.</p>
      </Section>
      <Section title="Your choices">
        <p>You can ask for a copy of your information, or for your account to be deleted, by writing to <a href="mailto:hello@musicvolu.me">hello@musicvolu.me</a>. Published changes to the catalog stay, but are no longer linked to you.</p>
      </Section>
    </TextPage>
  );
}
