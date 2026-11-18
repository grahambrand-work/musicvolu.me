"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/AuthForm";
import { login, type FormState } from "@/lib/auth/actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <FormError>{state?.error}</FormError>
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={state?.values?.email} />
      <div className="flex flex-col gap-2">
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <Link href="/forgot-password" className="self-end text-[13px] text-white/70 hover:text-white">Forgot password?</Link>
      </div>
      <Submit busy="Logging in…">Log in</Submit>
      <p className="flex items-baseline gap-1.5 text-[14px]">
        <span className="text-white/60">New to musicvolu.me?</span>
        <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium hover:underline">Create an account</Link>
      </p>
    </form>
  );
}
