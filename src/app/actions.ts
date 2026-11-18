"use server";
import { suggest } from "@/lib/catalog";

/** Dropdown results while typing in a search box. */
export async function suggestAction(q: string) {
  if (q.trim().length < 2) return null;
  try {
    return await suggest(q);
  } catch {
    return null;
  }
}
