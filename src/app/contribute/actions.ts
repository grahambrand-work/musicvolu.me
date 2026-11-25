"use server";
// Adding new artists, releases and songs. Each one is saved as a "new" submission straight
// away, so it shows up in search marked "in review" until an editor checks it.
import { CoverError, fetchCover } from "@/lib/coverFetch";
import { redirect } from "next/navigation";
import { checkNew, nameOf, newChanges, tidyNew, type NewArtist, type NewKind, type PickedArtist } from "@/lib/newEntry";
import { findArtists, OutOfEdits, saveSubmission, type ArtistChoice } from "@/lib/submissions";
import { getViewer } from "@/lib/viewer";

const KINDS: NewKind[] = ["artist", "release", "song"];
export type NewResult = { error: string; fields?: Record<string, string> } | undefined;

/** Artist search for the pickers on the new-entry forms. */
export async function findArtistsAction(q: string): Promise<ArtistChoice[]> {
  if (!(await getViewer())) return [];
  try { return await findArtists(q.slice(0, 100)); } catch { return []; }
}

/** The "Add a new artist" pop-up: saves the artist now so it can be picked straight away. */
export async function quickAddArtist(raw: unknown): Promise<{ artist: PickedArtist } | { error: string; fields?: Record<string, string> }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You've been signed out. Log in again to add music." };
  const v = tidyNew("artist", raw) as NewArtist;
  const fields = checkNew("artist", v, true);
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields first.", fields };
  try {
    const number = await saveSubmission(viewer, {
      kind: "new", entityType: "artist", entityId: null, entityName: v.name,
      changes: newChanges("artist", v), note: null, sources: v.sources || null,
    });
    return { artist: { review: number, name: v.name } };
  } catch (e) {
    if (e instanceof OutOfEdits) return { error: "You've used all your edits for this month. They reset on the 1st." };
    console.error("quickAddArtist", e);
    return { error: "Couldn't add the artist. Try again in a moment." };
  }
}

/** The full new artist / release / song forms. */
export async function submitNew(kind: NewKind, raw: unknown, note: string, final = false): Promise<NewResult> {
  if (!KINDS.includes(kind)) return { error: "Something went wrong. Reload the page and try again." };
  const viewer = await getViewer();
  if (!viewer) return { error: "You've been signed out. Log in again to submit." };
  const v = tidyNew(kind, raw);
  const fields = checkNew(kind, v);
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields first.", fields };

  if ("cover" in v && v.cover) {
    try { await fetchCover(v.cover); } catch (e) {
      return { error: "Fix the highlighted fields first.", fields: { cover: e instanceof CoverError ? e.message : "That link didn't load. Check it opens in your browser." } };
    }
  }
  const by = "artists" in v ? v.artists : [];
  let number: number;
  try {
    number = await saveSubmission(viewer, {
      kind: "new", entityType: kind, entityId: null, entityName: nameOf(kind, v),
      changes: newChanges(kind, v), note: note.trim().slice(0, 4000) || null, sources: v.sources,
      dependsOn: by.find((a) => a.review)?.review ?? null, final,
    });
  } catch (e) {
    if (e instanceof OutOfEdits) return { error: "You've used all your edits for this month. They reset on the 1st." };
    console.error("submitNew", e);
    return { error: "Couldn't save this. Try again in a moment." };
  }
  redirect(`/submission/${number}?sent=1`);
}
