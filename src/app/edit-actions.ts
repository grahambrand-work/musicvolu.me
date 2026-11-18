"use server";
// Submitting suggested edits from an entry page's edit mode.
import { redirect } from "next/navigation";
import { countChanges, describeChanges, normalize, validate, type Kind, type Values } from "@/lib/edits";
import { getEditable, OutOfEdits, saveSubmission } from "@/lib/submissions";
import { getViewer } from "@/lib/viewer";

export type SubmitResult = { error: string; fields?: Record<string, string> } | undefined;

const KINDS: Kind[] = ["artist", "release", "song"];

export async function submitEdit(kind: Kind, slug: string, after: Values, note: string): Promise<SubmitResult> {
  if (!KINDS.includes(kind)) return { error: "Something went wrong. Reload the page and try again." };
  const viewer = await getViewer();
  if (!viewer) return { error: "You've been signed out. Log in again to submit." };

  const entry = await getEditable(kind, slug);
  if (!entry) return { error: "This entry no longer exists." };

  // Rebuild "before" from the database and keep only fields this form can edit.
  const before = normalize(kind, entry.values);
  const cleaned = normalize(kind, { ...entry.values, ...pick(after, entry.values) } as Values);
  const fields = validate(kind, cleaned);
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields first.", fields };

  const changes = describeChanges(kind, before, cleaned);
  if (!countChanges(changes)) return { error: "You haven't changed anything yet." };

  const text = note.trim().slice(0, 4000) || null;
  const b = before as Record<string, unknown>, a = cleaned as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(a)) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) diff[k] = { from: b[k], to: a[k] };

  let number: number;
  try {
    number = await saveSubmission(viewer, {
      kind: "edit", entityType: kind, entityId: entry.id, entityName: entry.name, changes: diff, note: text,
    });
  } catch (e) {
    if (e instanceof OutOfEdits) return { error: "You've used all your edits for this month. They reset on the 1st." };
    console.error("submitEdit", e);
    return { error: "Couldn't save your edit. Try again in a moment." };
  }
  redirect(`/${kind}/${entry.slug}?submitted=${number}`);
}

/** Only the keys the entry actually has, as strings or the row arrays. Ignores anything extra. */
function pick(after: Values, shape: Values): Partial<Values> {
  const out: Record<string, unknown> = {};
  const src = (after ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(shape)) {
    const x = src[k];
    if (Array.isArray(v)) {
      if (!Array.isArray(x)) continue;
      out[k] = x.slice(0, 500).map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return Object.fromEntries(Object.keys(v[0] ?? (k === "tracks" ? { id: 0, title: 0, duration: 0 } : { id: 0, role: 0, name: 0 }))
          .map((f) => [f, typeof r[f] === "string" ? (r[f] as string).slice(0, 400) : ""]));
      });
    } else if (typeof x === "string") {
      out[k] = x.slice(0, 2000);
    }
  }
  return out as Partial<Values>;
}
