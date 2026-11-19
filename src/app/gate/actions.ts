"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GATE_COOKIE, gateToken, safeNext } from "@/lib/gate";

export type GateState = { error?: string } | undefined;

export async function unlock(_: GateState, form: FormData): Promise<GateState> {
  const expected = process.env.SITE_ACCESS_PASSWORD;
  const next = safeNext(form.get("next"));
  if (!expected) redirect(next);
  if (String(form.get("password") ?? "") !== expected) return { error: "That password isn’t right." };
  (await cookies()).set(GATE_COOKIE, await gateToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(next);
}
