// A list of releases (artist discography, song "appears on"). Used by server pages and by
// the client-side DiscographySearch, so it has no server-only imports.
import Link from "next/link";
import { Cover } from "./ui";

export type ReleaseItem = { slug: string; title: string; type: string; year: number | null; right: string; cover: string | null };

export default function ReleaseList({ items }: { items: ReleaseItem[] }) {
  return (
    <ul className="border-t border-rule">
      {items.map((r) => (
        <li key={r.slug} className="border-b border-hair">
          <Link href={`/release/${r.slug}`} className="flex items-center gap-3.5 px-2 py-2 hover:bg-white/4">
            <Cover src={r.cover} size={32} />
            <span className="min-w-0 flex-1 truncate font-mono text-[15px]">{r.title}</span>
            <span className="flex shrink-0 items-baseline gap-3 text-white/60">
              <span className="hidden font-mono text-[12px] uppercase md:inline">{r.type}</span>
              <span className="font-mono text-[12px]">{r.year ?? ""}</span>
              <span className="w-16 text-right text-[13px]">{r.right}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

