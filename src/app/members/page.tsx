// Members and roles (Figma 93:1098 desktop, 93:1311 phone), admins only: everyone with their
// role, edits this month, published and rejected counts, and the edit allowance per tier.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import AllowanceForm from "@/components/members/AllowanceForm";
import RoleSelect from "@/components/members/RoleSelect";
import { Name } from "@/components/review/ReviewCard";
import { getAllowances, getMembers, limitFor, nextMonth, PROMOTE_AT, ROLE_OPTIONS, roleKey, type MemberGroup, type MemberRow } from "@/lib/members";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Members and roles" };

const GROUPS: { key: MemberGroup; label: string }[] = [
  { key: "all", label: "All" }, { key: "contributors", label: "Contributors" }, { key: "editors", label: "Editors" }, { key: "admins", label: "Admins" },
];
const joined = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Chicago" });

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const v = await getViewer();
  if (!v) redirect("/login?next=/members");
  if (v.role !== "admin") notFound();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const group = (GROUPS.some((g) => g.key === str("show")) ? str("show") : "all") as MemberGroup;
  const q = str("q")?.slice(0, 60) ?? "";
  const limit = Math.min(Number(str("limit")) || 50, 1000);
  const [{ rows, counts }, allowances] = await Promise.all([getMembers({ q, group, limit }), getAllowances()]);
  const limits = new Map(await Promise.all(rows.map(async (r) => [r.id, await limitFor(r, allowances)] as const)));
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ q, show: group, ...extra }).filter(([k, x]) => x && !(k === "show" && x === "all")));
    const s = p.toString();
    return s ? `/members?${s}` : "/members";
  };
  const { label: starts } = nextMonth();
  const last = allowances.last
    ? `Last changed${allowances.last.by ? ` by ${allowances.last.by.username}` : ""} on ${allowances.last.at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}.`
    : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pb-24 md:px-[60px]">
        <h1 className="mt-8 text-[30px] font-semibold md:mt-12 md:text-[34px]">Members and roles</h1>
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <section>
            <form method="get" className="flex flex-wrap items-center gap-2.5">
              {group !== "all" && <input type="hidden" name="show" value={group} />}
              <input name="q" defaultValue={q} placeholder="Find a member…" aria-label="Find a member"
                className="h-10 w-full rounded-full bg-white px-4 text-[14px] text-black outline-none placeholder:text-black/40 md:w-[240px]" />
              <nav className="flex gap-2 overflow-x-auto max-md:-mx-4 max-md:px-4">
                {GROUPS.map((g) => (
                  <Link key={g.key} href={href({ show: g.key })}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${group === g.key ? "border-white bg-white text-black" : "border-white/50 hover:border-white"}`}>
                    {g.label}<span className="max-md:hidden"> · {counts[g.key].toLocaleString("en-US")}</span>
                  </Link>
                ))}
              </nav>
            </form>

            <div className="mt-6 hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_130px_80px_80px_90px_70px] gap-4 border-b border-rule pb-2.5 md:grid">
              {["Member", "Role", "Edits this month", "Published", "Rejected", "Joined", ""].map((h) => <span key={h || "x"} className="field-label">{h}</span>)}
            </div>
            <ul className="max-md:mt-4">
              {rows.map((r) => <Row key={r.id} r={r} limit={limits.get(r.id) ?? null} me={v.id} />)}
            </ul>
            {rows.length === 0 && <p className="py-8 text-white/60">No members{q ? ` matching “${q}”` : ""}.</p>}
            {rows.length >= limit && limit < 1000 && (
              <Link href={href({ limit: String(limit + 50) })} scroll={false} className="mt-6 inline-block text-[14px] font-medium hover:underline">Show 50 more</Link>
            )}
          </section>

          <aside className="lg:sticky lg:top-[96px] lg:self-start">
            <AllowanceForm starts={starts} last={last} rows={([1, 2, 3] as const).map((t) => ({
              tier: t, label: `Tier ${t} contributor`, now: allowances.now[t], next: allowances.next[t],
              hint: t === 1 ? "New members" : `After ${PROMOTE_AT[t]} published edits`,
            }))} />
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ r, limit, me }: { r: MemberRow; limit: number | null; me: string }) {
  const used = limit != null ? (
    <span className={r.thisMonth >= limit ? "text-[#f5b84d]" : r.thisMonth > 0 ? "text-teal" : undefined}>{r.thisMonth} / {limit}</span>
  ) : null;
  const log = <Link href={`/members/${r.username}`} className="text-[13px] font-medium hover:underline">View log</Link>;
  return (
    <li className="border-b border-hair">
      {/* Desktop: one table row. */}
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_130px_80px_80px_90px_70px] items-center gap-4 py-3 text-[14px] md:grid">
        <span className="truncate font-bold"><Name p={r} /></span>
        <RoleSelect memberId={r.id} username={r.username} value={roleKey(r)} options={ROLE_OPTIONS} disabled={r.id === me} />
        <span className="text-[14px]">{used ?? <span className="text-white/40">—</span>}</span>
        <span className="text-white/85">{r.role === "admin" && !r.published ? "—" : r.published}</span>
        <span className="text-white/65">{r.role === "admin" && !r.rejected ? "—" : r.rejected}</span>
        <span className="text-[13px] text-white/55">{joined(r.joined)}</span>
        {log}
      </div>
      {/* Phone: name and role on top, numbers under. */}
      <div className="py-4 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/members/${r.username}`} className="min-w-0 truncate text-[15px] font-bold"><Name p={r} /></Link>
          <RoleSelect memberId={r.id} username={r.username} value={roleKey(r)} options={ROLE_OPTIONS} disabled={r.id === me} />
        </div>
        <p className="mt-1.5 text-[13px] text-white/60">
          {used && <>{used} edits this month · </>}{r.published} published · {r.rejected} rejected
        </p>
      </div>
    </li>
  );
}
