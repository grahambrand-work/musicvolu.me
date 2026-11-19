"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { unlock, type GateState } from "./actions";

export default function GateForm({ next }: { next: string }) {
  const [state, action] = useActionState<GateState, FormData>(unlock, undefined);
  return (
    <form action={action} className="flex w-full max-w-[360px] flex-col gap-[15px]">
      <input type="hidden" name="next" value={next} />
      <input name="password" type="password" required autoFocus autoComplete="off" placeholder="Password" aria-label="Password"
        className="h-11 rounded-full bg-white px-5 font-mono text-[16px] text-black outline-none placeholder:text-black/40 md:h-9" />
      {state?.error && <p role="alert" className="text-center text-[14px] text-[#ff8a80]">{state.error}</p>}
      <Enter />
    </form>
  );
}

function Enter() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 rounded-full border border-white text-[14px] hover:bg-white/10 disabled:opacity-60 md:h-9">
      {pending ? "Checking…" : "Enter"}
    </button>
  );
}
