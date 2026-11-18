"use client";
import { useActionState } from "react";
import { Field, FormError, Submit } from "@/components/AuthForm";
import { resetPassword, type FormState } from "@/lib/auth/actions";

export default function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {state?.field !== "password" && <FormError>{state?.error}</FormError>}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" type="password" required minLength={10} autoComplete="new-password"
        hint="At least 10 characters." error={state?.field === "password" ? state.error : undefined} />
      <Submit busy="Saving…">Save password</Submit>
    </form>
  );
}
