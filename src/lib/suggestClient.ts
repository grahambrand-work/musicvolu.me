// Browser side of the search dropdown: asks /api/suggest and cancels the previous request
// when a newer one starts.
import type { Suggestions } from "./catalog";

export function suggester() {
  let ctl: AbortController | null = null;
  return async (q: string): Promise<Suggestions | null | "stale"> => {
    ctl?.abort();
    const mine = (ctl = new AbortController());
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: mine.signal });
      return r.ok ? ((await r.json()) as Suggestions | null) : null;
    } catch {
      return mine.signal.aborted ? "stale" : null;
    }
  };
}
