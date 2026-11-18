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

| Create account → check email → confirm → Welcome | `/signup`, `/signup/check`, `/verify`, `/welcome` | P7 |
| Log in, forgot / reset password | `/login`, `/forgot-password`, `/reset-password` | P7 |

Contribute is still a placeholder.

## Accounts

Musicvolu.me has its own members, separate from Noteworthy's logins: email and password
only. Tables live in the `musicvolume` schema (`db/migrations/`): `members` (username,
email, scrypt password hash, role contributor/editor/admin and tier 1-3), `sessions`
(only a SHA-256 of each browser's cookie token is stored) and `email_tokens` (confirm
email, 24 h; reset password, 1 h). Eight wrong passwords in a row lock an account for 15
minutes. Code: `src/lib/auth/`.

Apply a migration as the database owner. The site itself should connect as its own
login, `musicvolume_app`, which the migration grants: read the catalog, read and write
`musicvolume`. Supabase's public API roles get no access to the schema.

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
