"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Submit } from "@/components/AuthForm";
import { verifyAction } from "./actions";

export default function VerifyForm({ token }: { token: string }) {
  const [error, action] = useActionState<string | undefined, FormData>(verifyAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (!sent.current && token) { sent.current = true; form.current?.requestSubmit(); }
  }, [token]);
  if (error) {
    return (
      <>
        <p role="alert" className="text-[15px] text-[#ffb3ad]">{error}</p>
        <Link href="/login" className="w-full rounded-full bg-white py-2.5 text-center text-[16px] font-medium text-black">Log in</Link>
      </>
    );
  }
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="token" value={token} />
      <Submit busy="Confirming…">Confirm my email</Submit>
    </form>
  );
}
