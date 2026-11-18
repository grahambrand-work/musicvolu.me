-- Suggested edits and new entries ("submissions"), and the log of everything that happens
-- to them. Also adds the catalog fields the entry pages show that the catalog didn't store
-- yet (label, country, language, born, website, song credits). All additions; nothing in
-- the catalog is changed or removed, and the nightly MusicBrainz sync ignores these columns.
--
-- Apply as the database owner after 20261118000100. Safe to run twice.

begin;

-- ---------------------------------------------------------------- catalog fields
alter table public.releases add column if not exists label    text check (char_length(label) <= 300);
alter table public.releases add column if not exists country  text check (char_length(country) <= 100);
alter table public.releases add column if not exists language text check (char_length(language) <= 100);
alter table public.songs    add column if not exists language text check (char_length(language) <= 100);
alter table public.artists  add column if not exists born     text check (born ~ '^\d{4}(-\d{2}(-\d{2})?)?$');
alter table public.artists  add column if not exists website  text check (char_length(website) <= 300);

-- Who wrote, produced or played on a song (people, not necessarily artists with a page).
create table if not exists public.song_credits (
  id        uuid primary key default gen_random_uuid(),
  song_id   uuid not null references public.songs (id) on delete cascade,
  role      text not null check (char_length(role) between 1 and 60),   -- Songwriter, Producer, Vocals…
  name      text not null check (char_length(name) between 1 and 300),
  artist_id uuid references public.artists (id) on delete set null,
  position  smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists song_credits_song_idx on public.song_credits (song_id, position);
alter table public.song_credits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'song_credits' and policyname = 'Catalog is public') then
    create policy "Catalog is public" on public.song_credits for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------- submissions
-- One row per suggestion: edits to an existing entry, or a new artist / release / song.
-- changes: for an edit, {"field": {"from": …, "to": …}, …}; for a new entry, {"field": {"to": …}}.
-- Status follows the review board: needs_review → in_review → (changes_requested ↔ in_review)
-- → final_review → published, or rejected / withdrawn.
create table if not exists musicvolume.submissions (
  id           uuid primary key default gen_random_uuid(),
  number       bigint generated always as identity unique,   -- shown as #1042
  member_id    uuid not null references musicvolume.members (id),
  kind         text not null check (kind in ('edit', 'new')),
  entity_type  text not null check (entity_type in ('artist', 'release', 'song')),
  entity_id    uuid,                       -- the entry edited, or the new entry once published
  entity_name  text not null,              -- title or name, for lists
  -- A new release or song by an artist that is itself still a submission.
  depends_on   uuid references musicvolume.submissions (id),
  changes      jsonb not null,
  note         text check (char_length(note) <= 4000),       -- note for editors
  sources      text check (char_length(sources) <= 2000),    -- where the information came from (new entries)
  status       text not null default 'needs_review'
               check (status in ('needs_review', 'in_review', 'changes_requested', 'final_review', 'published', 'rejected', 'withdrawn')),
  reviewer_id  uuid references musicvolume.members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  check (kind = 'new' or entity_id is not null)
);
create index if not exists submissions_entity_idx on musicvolume.submissions (entity_type, entity_id, created_at desc);
create index if not exists submissions_status_idx on musicvolume.submissions (status, created_at);
create index if not exists submissions_new_name_idx on musicvolume.submissions (lower(entity_name)) where kind = 'new';
create index if not exists submissions_member_idx on musicvolume.submissions (member_id, created_at desc);

-- Every action on a submission, who did it and when: submitted, edited, status changes,
-- published. Never updated or deleted.
create table if not exists musicvolume.submission_events (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references musicvolume.submissions (id) on delete cascade,
  member_id     uuid references musicvolume.members (id),     -- null = the system
  action        text not null,   -- submitted, edited, status, published, withdrawn…
  from_status   text,
  to_status     text,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists submission_events_sub_idx on musicvolume.submission_events (submission_id, created_at);
create index if not exists submission_events_member_idx on musicvolume.submission_events (member_id, created_at desc);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant select, insert, update, delete on all tables in schema musicvolume to musicvolume_app';
    execute 'grant select on public.song_credits to musicvolume_app';
  end if;
end $$;

commit;
