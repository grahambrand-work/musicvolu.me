// Small building blocks shared by every page, matching the "Draft components" frame in Figma.
import type { CSSProperties, ReactNode } from "react";

/** Outlined type tag: ALBUM, ARTIST, SONG… (Jost Medium 11, 6% tracking). */
export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-[3px] border border-white/30 px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-[0.06em] text-white/70 uppercase ${className}`}>
      <span className="translate-y-[0.5px]">{children}</span>
    </span>
  );
}

/** Cover art, or the grey placeholder disc when there is none. Artists are round. */
export function Cover({ src, size, round = false, className = "" }: { src?: string | null; size: number; round?: boolean; className?: string }) {
  const shape = round ? "rounded-full" : "rounded-[2px]";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} loading="lazy"
        className={`shrink-0 object-cover bg-[#1a1c1f] ${shape} ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center bg-[linear-gradient(135deg,#383d40_0%,#1a1c1f_50%)] ${shape} ${className}`} style={{ width: size, height: size }}>
      <span className="rounded-full border border-white/18" style={{ width: size * 0.4, height: size * 0.4 }} />
    </span>
  );
}

/** Section heading over a list of fields: "DETAILS", "TRACKLIST · 11". */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between pb-2.5">
      <h2 className="field-label text-white/55">{children}</h2>
      {right}
    </div>
  );
}

/** Label / value rows with hairlines between them, as on the entry pages and preview panel. */
export function FieldRows({ rows, labelWidth = 176, size = "lg" }: {
  rows: { label: string; value: ReactNode }[];
  labelWidth?: number;
  size?: "sm" | "lg";
}) {
  return (
    <dl className="border-t border-rule">
      {rows.map((r) => (
        <div key={r.label} className={`flex items-baseline gap-4 border-b border-hair leading-[1.25] ${size === "lg" ? "px-2 py-[9px]" : "py-[8px]"}`}>
          <dt className={`field-label shrink-0 ${size === "lg" ? "w-[110px] md:w-[var(--lw)]" : "w-[var(--lw)]"}`} style={{ "--lw": `${labelWidth - (size === "lg" ? 16 : 0)}px` } as CSSProperties}>{r.label}</dt>
          <dd className={`min-w-0 font-mono break-words text-white ${size === "lg" ? "text-[15px]" : "text-[14px]"}`}>
            {r.value === "" || r.value == null ? <span className="text-white/40">—</span> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Teal dot: this entry has an edit waiting for review. */
export function ReviewDot({ className = "" }: { className?: string }) {
  return <span aria-label="Edit in review" className={`inline-block size-1.5 shrink-0 rounded-full bg-teal ${className}`} />;
}

/** "Not connected" note for when the site has no database settings (local preview). */
export function NoDatabase() {
  return (
    <p className="mx-auto max-w-md px-4 py-24 text-center text-sm text-white/60">
      The catalog isn’t connected yet. Set <code className="font-mono text-white">DATABASE_URL</code> in the site’s settings to show real music.
    </p>
  );
}
