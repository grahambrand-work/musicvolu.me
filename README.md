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

## Review board

`/review` shows open submissions in five stages (Needs review, In review, Changes
requested, Final review, Live today); `/review/<number>` opens one with live vs suggested
side by side, comments per field and on the whole submission (with @-tags), likes, and
the status buttons. Who can do what follows Figma "P6 · What each tier can do"
(`can` in `src/lib/review.ts`): tier 2-3 contributors see the board and like/dislike;
editors comment and move cards, but can't change a decision made by a higher tier;
tier 3 editors and admins act in final review. Editors can't review their own
submissions (admins can). Comments and likes: migration `20261119000100_review.sql`.

Publishing (`20261119000200_publish.sql`): the site's login can't write the catalog
tables; it can only call `musicvolume.publish(number, member)`, which runs as the
database owner, checks the submission is in final review and the member is a tier 3
editor or admin, then writes the change. Every field changed by hand goes into the row's
`edited_fields` (the MusicBrainz sync never overwrites those) and new artists, releases
and songs get `source = 'user'` (the sync never touches those). A changed track title
renames that song everywhere; typed artist names must match exactly one catalog artist.
Apply it as the owner of the catalog tables.

## Accounts

Musicvolu.me has its own members, separate from Noteworthy's logins: email and password
only. Tables live in the `musicvolume` schema (`db/migrations/`): `members` (username,
email, scrypt password hash, role contributor/editor/admin and tier 1-3), `sessions`
(only a SHA-256 of each browser's cookie token is stored) and `email_tokens` (confirm
email, 24 h; reset password, 1 h). Eight wrong passwords in a row lock an account for 15
minutes. Code: `src/lib/auth/`.

Apply a migration as the database owner. The site itself should connect as its own
login, `musicvolume_app`, which the migration grants: read the catalog tables (not
Noteworthy's user tables in `public`), read and write `musicvolume`. Supabase's public API
roles get no access to the schema. A new catalog table the site reads must be added to the
grant list in the migration.

On the server (applied 2026-11-18): `musicvolume_app` exists with a 20-connection limit; its
connection string is in `/root/musicvolume/database-url` (root-only), for `DATABASE_URL` in
Coolify.

## Suggested edits

Every artist, release and song page has **Suggest edits**, which opens the page in edit
mode (`?edit=1`). Changed fields get a teal outline and a "Was:" line, and the "Your
changes" panel lists each change. Submitting saves one row in `musicvolume.submissions`
(what changed, before and after, plus the note for editors) and a "submitted" row in
`musicvolume.submission_events`, the log of everything that happens to it. "Before" is
always read again from the database on the server. Nothing in the catalog changes until an
editor and an admin publish it (review board, next step).

Contributors get 10, 25 or 50 edits a month (tier 1, 2, 3); one submission counts as one
edit however many fields it changes. Editors and admins have no limit. Field rules and the
change list: `src/lib/edits.ts`. Saving: `src/lib/submissions.ts`, `src/app/edit-actions.ts`.

## Adding new music

**Contribute** (`/contribute`) searches first, so nothing gets added twice, then offers
"An album, EP or single", "A song" or "An artist" (`/contribute/release|song|artist`).
The forms show a live preview and need a source. An artist that isn't in the catalog can be
created from the artist box in a small pop-up: it's saved at once as its own submission, so
it can be picked straight away, and the release that uses it is linked to it (`depends_on`).
The pair counts as one edit. New entries show up in search right away, marked "In review",
and link to their submission page (`/submission/1042`), which also shows the log.
Code: `src/lib/newEntry.ts`, `src/app/contribute/`, `src/components/NewEntryForm.tsx`,
`src/components/ArtistPicker.tsx`.

Migration `20261118000200_submissions.sql` adds the two tables and a few catalog fields
the pages now show (release label, country, language; song language and credits; artist
born and website). Pages still work before it's applied; those fields just show empty.

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

### MusicBrainz changes

The catalog sync (Noteworthy `scripts/musicbrainz/sql/supabase_merge.sql`) reports each changed
field into `musicvolume.mb_changes` and then calls `select musicvolume.record_mb_changes()`
(migration `20261119000300_musicbrainz_changes.sql`):

- a change to a field nobody edited on musicvolu.me is applied and logged in `musicvolume.catalog_activity`, by the account **MusicBrainz** (shown in teal, can't sign in);
- a change to a field edited on musicvolu.me (in the row's `edited_fields`) is not applied: it goes on the review board as a submission by MusicBrainz. Publishing takes MusicBrainz's value, rejecting keeps ours. A value already proposed once isn't proposed again;
- band members and track lists can't be reviewed yet, so a contradiction there is logged as "kept".

### Changing a sent edit

`/submission/[number]/edit` reopens the edit form with what the edit suggests. The sender can
change it while it waits for review or after "Ask for changes" (it then goes back to the
reviewer). Tier 2–3 editors and admins can change it until it's published (final review: tier 3
and admins), not over a higher tier's decision. Tier 1 editors comment, ask for changes and send
to final review, but can't change edits or reject. Every change is logged ("changed the edit").
A MusicBrainz submission an editor changed stays protected from the sync once published.
New-entry submissions can't be changed yet.

### Edit history and activity log

- `/{artist|release|song}/[slug]/history`: every edit and MusicBrainz update on one entry, newest first, with "People who edited this". The entry page's side panel links to it.
- `/activity`: the site-wide log (moves on submissions, plus one row per entry per MusicBrainz run), with the full trail under each submission row, filters and CSV export (`/activity/export`).
- Signed-out visitors and tier 1–2 contributors see only what went live; tier 3 contributors, editors and admins also see pending and rejected edits, filters and export (`src/lib/history.ts`).
