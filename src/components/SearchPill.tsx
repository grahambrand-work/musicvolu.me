// The look for every search box on musicvolu.me except the main catalog search in the
// header and on Home: black pill, thin white outline, white magnifying glass on the left,
// white text. Used by Discography, Activity log, Members and Add something new.
import type { ReactNode } from "react";
import { SearchIcon } from "./icons";

export const searchInput =
  "min-w-0 flex-1 bg-transparent font-mono text-[16px] text-white outline-none placeholder:text-white/50 md:text-[14px]";

export default function SearchPill({ children, right, className = "h-9" }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border border-white/50 bg-black pr-2 pl-4 text-white focus-within:border-white hover:border-white ${className}`}>
      <SearchIcon className="shrink-0 text-white" />
      {children}
      {right}
    </div>
  );
}
