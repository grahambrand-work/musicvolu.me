"use client";
// The cover field on the edit and new-album forms: paste a link to an image. Shows a preview
// through the site (so the browser never contacts the other website) and says what's wrong if
// the link won't work. Only the link is saved; the picture is stored once it's published.
// Admins and tier 3 editors can also upload a picture (upload): it waits in storage until the
// edit is published or rejected, then only the catalog's copy is kept.
import { useEffect, useRef, useState } from "react";
import { isUpload } from "@/lib/uploads";

type Check = { ok: true; width: number; height: number } | { ok: false; error: string };

export default function CoverLink({ id, value, onChange, placeholder, className, autoFocus, invalid, emptyHint = "Leave empty to keep the current cover.", upload = false }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; invalid?: boolean; emptyHint?: string;
  /** Admins and tier 3 editors: offer "Upload a picture". */
  upload?: boolean;
}) {
  const link = value.trim();
  const uploaded = isUpload(link);
  const file = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [upErr, setUpErr] = useState("");
  async function send(f: File) {
    setUpErr("");
    if (f.size > 10 * 1024 * 1024) { setUpErr("That picture is over 10 MB."); return; }
    setSending(true);
    try {
      const body = new FormData();
      body.append("file", f);
      const r = await fetch("/api/cover-upload", { method: "POST", body });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) onChange(j.url); else setUpErr(j.error ?? "Couldn't upload that picture. Try again.");
    } catch { setUpErr("Couldn't upload that picture. Check your connection and try again."); }
    finally { setSending(false); if (file.current) file.current.value = ""; }
  }
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
      {uploaded ? (
        <div className={`${className} flex items-center gap-3`}>
          <span className="min-w-0 flex-1 truncate font-sans text-[14px]">Uploaded picture</span>
          <button type="button" onClick={() => onChange("")} className="shrink-0 font-sans text-[13px] text-white/60 hover:text-white">Remove</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
            inputMode="url" spellCheck={false} aria-invalid={invalid} className={`${className} min-w-0 flex-1`} />
          {upload && (
            <>
              <span className="shrink-0 text-[13px] text-white/45">or</span>
              <button type="button" onClick={() => file.current?.click()} disabled={sending}
                className="h-[34px] shrink-0 rounded-full border border-white/50 px-3.5 text-[13px] hover:border-white disabled:opacity-60">
                {sending ? "Uploading…" : "Upload"}
              </button>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); }} />
            </>
          )}
        </div>
      )}
      {upErr && <p role="alert" className="mt-1 text-[12px] text-[#ff8a80]">{upErr}</p>}
      {link && /^https:\/\/\S+$/i.test(link) && (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          {r?.ok ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/cover-preview?url=${encodeURIComponent(link)}`} alt="New cover" width={72} height={72} className="size-[72px] rounded-[2px] bg-[#1a1c1f] object-cover" />
              <span className="text-teal">Looks good · {r.width} × {r.height}. {uploaded ? "It’s kept until this edit is published or rejected; only the published copy stays." : "It’s saved on musicvolu.me once an editor publishes it."}</span>
            </>
          ) : r ? <span className="text-[#ff8a80]">{r.error}</span> : <span className="text-white/50">Checking the link…</span>}
        </div>
      )}
      {!link && <p className="mt-1 text-[12px] text-white/45">JPEG, PNG or WebP, at least 500 × 500. {emptyHint}</p>}
    </div>
  );
}
