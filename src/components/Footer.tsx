import Link from "next/link";

const LINKS = [["About", "/about"], ["Help", "/help"], ["Privacy", "/privacy"], ["Terms", "/terms"]];

export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`flex flex-col items-center gap-2 px-4 pb-8 text-[14px] text-white/60 md:flex-row md:justify-between md:px-[60px] md:pb-[30px] ${className}`}>
      <nav className="flex gap-[30px]">
        {LINKS.map(([label, href]) => <Link key={href} href={href} className="hover:text-white">{label}</Link>)}
      </nav>
      <p className="text-[13px] text-white/45 md:text-[14px] md:text-white/60">© {new Date().getFullYear()} musicvolu.me</p>
    </footer>
  );
}
