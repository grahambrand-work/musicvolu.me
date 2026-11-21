"use server";
// Members and roles (admins only): change someone's role, and the monthly edit allowance per
// contributor tier. Both are logged (role_changes, tier_allowances keeps every saved value).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fromRoleKey, nextMonth, type Tier } from "@/lib/members";
import { getViewer } from "@/lib/viewer";

export type ActionResult = { error: string } | { ok: string } | undefined;

const NOT_YET = "The members database update isn't on the server yet, so this can't be saved.";
const missing = (e: unknown) => (e as { code?: string }).code === "42P01";

export async function setRole(memberId: string, key: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!v || v.role !== "admin") return { error: "Only admins can change roles." };
  if (memberId === v.id) return { error: "You can't change your own role. Ask another admin." };
  const to = fromRoleKey(key);
  if (!to || !/^[0-9a-f-]{36}$/i.test(memberId)) return { error: "Something went wrong." };
  const sql = db()!;
  try {
    await sql.begin(async (tx) => {
      const [m] = await tx<{ role: string; tier: number }[]>`
        select role, tier from musicvolume.members where id = ${memberId} and role <> 'system' for update`;
      if (!m) throw Object.assign(new Error("gone"), { code: "gone" });
      if (m.role === to.role && m.tier === to.tier) return;
      await tx`update musicvolume.members set role = ${to.role}, tier = ${to.tier} where id = ${memberId}`;
      await tx`insert into musicvolume.role_changes (member_id, from_role, from_tier, to_role, to_tier, changed_by)
               values (${memberId}, ${m.role}, ${m.tier}, ${to.role}, ${to.tier}, ${v.id})`;
    });
  } catch (e) {
    if (missing(e)) return { error: NOT_YET };
    if ((e as { code?: string }).code === "gone") return { error: "That member no longer exists." };
    throw e;
  }
  revalidatePath("/members", "layout");
  return undefined;
}

export async function saveAllowances(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!v || v.role !== "admin") return { error: "Only admins can change allowances." };
  const values: [Tier, number][] = [];
  for (const t of [1, 2, 3] as Tier[]) {
    const n = Number(String(form.get(`tier${t}`) ?? "").trim());
    if (!Number.isInteger(n) || n < 1 || n > 10000) return { error: `Tier ${t}: enter a whole number from 1 to 10,000.` };
    values.push([t, n]);
  }
  const sql = db()!;
  const { date, label } = nextMonth();
  const starts = date.toISOString().slice(0, 10);
  try {
    // Only tiers whose value for next month actually changes get a new row.
    const changed = await sql.begin(async (tx) => {
      let n = 0;
      for (const [t, monthly] of values) {
        const [cur] = await tx<{ monthly: number }[]>`
          select monthly from musicvolume.tier_allowances where tier = ${t} order by created_at desc limit 1`;
        if (cur?.monthly === monthly) continue;
        await tx`insert into musicvolume.tier_allowances (tier, monthly, starts_on, changed_by) values (${t}, ${monthly}, ${starts}, ${v.id})`;
        n++;
      }
      return n;
    });
    revalidatePath("/members", "layout");
    return { ok: changed ? `Saved. The new allowances start on ${label}.` : "Nothing changed." };
  } catch (e) {
    if (missing(e)) return { error: NOT_YET };
    throw e;
  }
}
