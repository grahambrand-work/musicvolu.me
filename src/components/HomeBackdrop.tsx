"use client";
// The moving ripples behind Home and the password screen, under an 80% black wash.
// Small files: 480p on phones (~0.6 MB), 720p on bigger screens (~1.2 MB), no sound, and a
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
    <div aria-hidden className={`absolute inset-0 bg-[#a9a9a9] ${className}`}>
      <video ref={ref} autoPlay muted loop playsInline disablePictureInPicture preload="auto"
        poster="/media/ripples-v1-poster.webp" className="size-full object-cover">
        <source src="/media/ripples-v1-720.mp4" type="video/mp4" media="(min-width: 768px)" />
        <source src="/media/ripples-v1-480.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/80" />
    </div>
  );
}
