// One shared connection pool to the Noteworthy database (the same Postgres that Supabase runs).
// The catalog lives in the "public" schema; Musicvolu.me's own tables (accounts, submissions,
// the edit log) will live in the "musicvolume" schema next to it.
//
// DATABASE_URL is set in Coolify (the site > Environment Variables). Without it, pages that
// need the catalog show a short "not connected" note instead of crashing.
import "server-only";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
const globalForDb = globalThis as unknown as { __mvSql?: Sql };

export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.__mvSql) {
    globalForDb.__mvSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idle_timeout: 30,
      connect_timeout: 10,
      connection: { application_name: "musicvolume", statement_timeout: 15000 },
      transform: { undefined: null },
    });
  }
  return globalForDb.__mvSql;
}
