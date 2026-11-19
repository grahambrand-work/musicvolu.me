"use client";
import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/AuthForm";
import { forgotPassword, type FormState } from "@/lib/auth/actions";

export default function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <FormError>{state?.error}</FormError>
      <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={state?.values?.email} />
      <Submit busy="Sending…">Send link</Submit>
    </form>
  );
}
