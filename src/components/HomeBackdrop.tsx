"use client";
// The moving ripples behind Home and the password screen, under an 80% black wash and film grain.
// Small files: 480p on phones (0.4 MB AV1 / 0.6 MB H.264), 720p on bigger screens (0.7 / 1.2 MB), no sound, and a
// tiny poster frame that shows at once while the video loads. People who ask their device
// for less motion get the still frame only.
import { useEffect, useRef } from "react";

export default function HomeBackdrop({ className = "-z-10" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => { if (still.matches) v.pause(); else v.play().catch(() => {}); };
    apply();
    still.addEventListener("change", apply);
    return () => still.removeEventListener("change", apply);
  }, []);
  return (
    <div aria-hidden className={`absolute inset-0 overflow-hidden bg-[#a9a9a9] ${className}`}>
      <video ref={ref} autoPlay muted loop playsInline disablePictureInPicture preload="auto"
        poster="/media/ripples-v1-poster.webp" className="size-full object-cover">
        {/* AV1 (about half the size) where the browser can play it, H.264 everywhere else. */}
        <source src="/media/ripples-v1-720-av1.mp4" type='video/mp4; codecs="av01.0.05M.08"' media="(min-width: 768px)" />
        <source src="/media/ripples-v1-720.mp4" type="video/mp4" media="(min-width: 768px)" />
        <source src="/media/ripples-v1-480-av1.mp4" type='video/mp4; codecs="av01.0.04M.08"' />
        <source src="/media/ripples-v1-480.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/80" />
      {/* Moving film grain on top (Graham, 2026-11-19): one small noise tile, jumped around a few
          times a second. Stops for people who ask for less motion. */}
      <div className="grain pointer-events-none absolute inset-[-100%] motion-reduce:animate-none" />
    </div>
  );
}
