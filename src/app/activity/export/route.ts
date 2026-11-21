// The activity log as CSV, with the same filters as the page (tier 3 contributors, editors, admins).
import { getActivity, seesAll, type LogFilter } from "@/lib/history";
import { getViewer } from "@/lib/viewer";

const cell = (x: string) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);

export async function GET(req: Request) {
  const v = await getViewer();
  if (!seesAll(v)) return new Response("Only tier 3 contributors, editors and admins can export the log.", { status: 403 });
  const p = new URL(req.url).searchParams;
  const f: LogFilter = {
    q: p.get("q") ?? undefined, action: p.get("action") ?? "all",
    type: (p.get("type") ?? "all") as LogFilter["type"], range: (p.get("range") ?? "7d") as LogFilter["range"], limit: 1000,
  };
  const rows = await getActivity(v, f);
  const lines = [["When (UTC)", "Who", "Action", "Type", "Entry", "Field", "From", "To", "Status", "Submission"].join(",")];
  for (const r of rows) {
    lines.push([r.when.toISOString(), r.who?.username ?? "MusicBrainz", r.action, r.entityType, r.entityName, r.field,
      r.change?.was ?? "", r.change?.now ?? "", r.status, r.submission ? `#${r.submission.number}` : ""].map((x) => cell(String(x))).join(","));
  }
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="musicvolume-activity.csv"` },
  });
}
