"use server";
import { redirect } from "next/navigation";
import { confirmEmail } from "@/lib/auth/actions";

export async function verifyAction(_: string | undefined, form: FormData): Promise<string | undefined> {
  const error = await confirmEmail(String(form.get("token") ?? ""));
  if (error) return error;
  redirect("/welcome");
}
