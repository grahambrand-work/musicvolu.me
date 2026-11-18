# musicvolu.me

The open, reviewed music database that sits beside [Noteworthy](https://noteworthy.my).
Anyone can search it; members suggest edits and new music, editors review every change,
and admins publish it into the catalog. Designs live in the Figma file "Musicvolu.me"
(page "Drafts by Claude").

## How it fits together

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind 4). Fonts: Jost for the
  interface, Courier Prime for anything editable (titles, names, dates) and usernames.
- **Data**: the same Postgres database as Noteworthy (self-hosted Supabase on the Hetzner
  server). The catalog (`public.artists`, `releases`, `tracks`, `songs`, …) is read
  directly with [`postgres`](https://github.com/porsager/postgres); see `src/lib/db.ts`
  and `src/lib/catalog.ts`. Musicvolu.me's own tables (accounts, submissions, the edit
  log) will go in a separate `musicvolume` schema.
- **Pre-launch password**: while `SITE_ACCESS_PASSWORD` is set, every page asks for it once
  (`src/proxy.ts`, `src/lib/gate.ts`).
- **Hosting**: Coolify on the Hetzner server, at https://musicvolu.me.

## Pages so far

| Page | Path | Figma |
|---|---|---|
| Home (signed out) | `/` | Initial Design + P7 Home signed out |
| Search results + preview | `/search?q=…&open=release:melodrama` | Phase 1 option C |
| Release (album, EP, single…) | `/release/[slug]` | Phase 2 Album view |
| Artist | `/artist/[slug]` | Phase 2 Artist view |
| Song | `/song/[slug]` | Phase 2 Song view |
| Password screen | `/gate` | Home style |

Log in, Create account and Contribute are placeholders until the accounts step.

## Run it on your own computer

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run dev                  # http://localhost:3000
```

For a throwaway local database: create a Postgres 16 database, stub the `auth` and
`storage` schemas that Supabase normally provides, apply the Noteworthy repo's
`supabase/migrations/*.sql` in order, then `psql -f dev/seed.sql` for a small sample
(Lorde, Lordi).

## Before going live on the full catalog

Search uses "contains these words" matching. On the full MusicBrainz catalog it needs the
trigram indexes from Noteworthy's `20261114000300_catalog_search_indexes.sql`; without
them each search reads every row.
