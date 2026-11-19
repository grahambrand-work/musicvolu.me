import type { Metadata, Viewport } from "next";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import "@fontsource/jost/700.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "musicvolu.me", template: "%s · musicvolu.me" },
  description: "An open, reviewed database of music info. Anyone can search it. Members suggest edits, and editors check every one.",
  robots: { index: false }, // until launch
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink text-white">{children}</body>
    </html>
  );
}
