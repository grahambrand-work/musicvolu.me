"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Check, Field, FormError, Submit } from "@/components/AuthForm";
import { signup, type FormState } from "@/lib/auth/actions";

export default function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signup, undefined);
  const err = (f: string) => (state?.field === f ? state.error : undefined);
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {!state?.field && <FormError>{state?.error}</FormError>}
      <Field label="Username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false}
        defaultValue={state?.values?.username} error={err("username")}
        hint="Shown on every change you make. Letters, numbers, dots and dashes." />
      <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com"
        defaultValue={state?.values?.email} error={err("email")} />
      <Field label="Password" name="password" type="password" required minLength={10} autoComplete="new-password"
        error={err("password")} hint="At least 10 characters." />
      <div className="flex flex-col gap-3">
        <Check name="sources">I’ll only add information I can back up with a source.</Check>
        <Check name="terms">I agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</Check>
        {err("terms") && <p role="alert" className="text-[12px] text-[#ff8a80]">{err("terms")}</p>}
      </div>
      <input type="hidden" name="next" value={next} />
      <Submit busy="Creating account…">Create account</Submit>
      <p className="flex items-baseline gap-1.5 text-[14px]">
        <span className="text-white/60">Already have an account?</span>
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium hover:underline">Log in</Link>
      </p>
    </form>
  );
}
