// Where "Suggest edit" goes: the entry page in edit mode. Signed-out visitors see the
// "Create an account to suggest edits" dialog first (components/SuggestEdit.tsx).
export function suggestHref(kind: string, slug: string, focus?: string) {
  return `/${kind}/${slug}?edit=1${focus ? `&focus=${focus}` : ""}`;
}

/** Where a search hit goes: its page, or the submission for a new entry still in review. */
export function hitHref(h: { kind: string; slug: string; review?: number }) {
  return h.review ? `/submission/${h.review}` : `/${h.kind}/${h.slug}`;
}
