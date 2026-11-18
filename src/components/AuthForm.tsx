"use client";
// Pieces of the account forms (Figma "P7 · Create account / Log in / Check your email").
import type { InputHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function Field({ label, hint, error, ...input }: { label: string; hint?: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <input {...input} aria-invalid={!!error}
        className={`rounded-[6px] border bg-transparent px-3.5 py-3 font-mono text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white ${error ? "border-[#eb544d]" : "border-white/35"}`} />
      {error ? <span role="alert" className="text-[12px] text-[#ff8a80]">{error}</span> : hint && <span className="text-[12px] text-white/50">{hint}</span>}
    </label>
  );
}

export function Check({ name, children, defaultChecked }: { name: string; children: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-white/80">
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
        className="mt-px size-4 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-white/50 bg-transparent bg-center bg-no-repeat checked:border-white checked:bg-white checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22><path d=%22M2.5 6.2l2.3 2.3 4.7-5%22 fill=%22none%22 stroke=%22black%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')]" />
      <span>{children}</span>
    </label>
  );
}

export function Submit({ children, busy }: { children: ReactNode; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-full bg-white px-[18px] py-2.5 text-[16px] font-medium text-black hover:bg-white/85 disabled:opacity-60">
      {pending ? busy : children}
    </button>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="rounded-[6px] border border-[#eb544d]/60 bg-[#eb544d]/10 px-3.5 py-2.5 text-[14px] text-[#ffb3ad]">{children}</p>;
}
