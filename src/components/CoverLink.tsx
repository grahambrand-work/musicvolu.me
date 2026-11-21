"use client";
// The cover field on the edit and new-album forms: paste a link to an image. Shows a preview
// through the site (so the browser never contacts the other website) and says what's wrong if
// the link won't work. Only the link is saved; the picture is stored once it's published.
import { useEffect, useState } from "react";

type Check = { ok: true; width: number; height: number } | { ok: false; error: string };

export default function CoverLink({ id, value, onChange, placeholder, className, autoFocus, invalid, emptyHint = "Leave empty to keep the current cover." }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; invalid?: boolean; emptyHint?: string;
}) {
  const link = value.trim();
  const [check, setCheck] = useState<{ link: string; r: Check } | null>(null);
  useEffect(() => {
    if (!/^https:\/\/\S+$/i.test(link)) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/cover-preview?check=1&url=${encodeURIComponent(link)}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<Check>)
        .then((r) => setCheck({ link, r }))
        .catch(() => {});
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [link]);
  const r = check?.link === link ? check.r : null;
  return (
    <div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        inputMode="url" spellCheck={false} aria-invalid={invalid} className={className} />
      {link && /^https:\/\/\S+$/i.test(link) && (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          {r?.ok ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/cover-preview?url=${encodeURIComponent(link)}`} alt="New cover" width={72} height={72} className="size-[72px] rounded-[2px] bg-[#1a1c1f] object-cover" />
              <span className="text-teal">Looks good · {r.width} × {r.height}. It&rsquo;s saved on musicvolu.me once an editor publishes it.</span>
            </>
          ) : r ? <span className="text-[#ff8a80]">{r.error}</span> : <span className="text-white/50">Checking the link…</span>}
        </div>
      )}
      {!link && <p className="mt-1 text-[12px] text-white/45">JPEG, PNG or WebP, at least 500 × 500. {emptyHint}</p>}
    </div>
  );
}
