import type { Metadata } from "next";
import Link from "next/link";
import TextPage, { Section } from "@/components/TextPage";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <TextPage title="About musicvolu.me" intro="musicvolu.me is an open, reviewed database of music: artists, albums, EPs, singles and songs. Anyone can search it. Members suggest edits and add missing music, and editors check every change before it goes live.">
      <Section title="Where the music comes from">
        <p>The catalog starts from <a href="https://musicbrainz.org">MusicBrainz</a>, the open music encyclopedia, and is updated from it regularly. Updates from MusicBrainz show up in each entry&rsquo;s edit history under the name <strong>MusicBrainz</strong>.</p>
        <p>When a member has corrected something here, a later MusicBrainz update never overwrites it on its own. It goes to the editors for review instead.</p>
      </Section>
      <Section title="How edits work">
        <p>Every entry has a <strong>Suggest edit</strong> button, and <Link href="/contribute">Contribute</Link> adds music that&rsquo;s missing. Each suggestion goes on the review board, where editors comment, ask for changes and send it to final review. A tier 3 editor or an admin publishes it.</p>
        <p>Everything is logged with who did it and when. You can see an entry&rsquo;s full edit history from its page, and all recent changes in the <Link href="/activity">activity log</Link>.</p>
      </Section>
      <Section title="Contributors and editors">
        <p>New members start as tier 1 contributors and move up as their edits are published. Editors are picked from experienced contributors. <Link href="/help">Help</Link> explains what each tier can do.</p>
      </Section>
      <Section title="Contact">
        <p>Questions or problems: <a href="mailto:hello@musicvolu.me">hello@musicvolu.me</a>.</p>
      </Section>
    </TextPage>
  );
}
