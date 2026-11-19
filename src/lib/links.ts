// Where "Suggest edit" goes. Editing arrives with accounts; until then (and for anyone
// signed out) it asks people to log in first and then brings them back to the entry.
export function suggestHref(kind: string, slug: string, focus?: string) {
  const back = `/${kind}/${slug}?edit=1${focus ? `&focus=${focus}` : ""}`;
  return `/login?next=${encodeURIComponent(back)}`;
}
