-- Musicvolu.me accounts, in their own "musicvolume" schema inside the Noteworthy database.
-- Separate from Noteworthy's Supabase logins (auth.users): a Musicvolu.me member is not a
-- Noteworthy user. Only the site's own database login (musicvolume_app) can read these
-- tables; Supabase's public API roles (anon, authenticated) have no access to the schema.
--
-- Apply as the database owner (supabase_admin / postgres). Safe to run twice.

begin;

create schema if not exists musicvolume;
revoke all on schema musicvolume from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema musicvolume from anon, authenticated';
  end if;
end $$;

-- Members. Role and tier decide what someone can do (see Figma "P6 · Tier colors and
-- permissions"): contributors 1-3, editors 1-3, admins.
create table if not exists musicvolume.members (
  id               uuid primary key default gen_random_uuid(),
  username         text not null check (username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'),
  email            text not null check (position('@' in email) > 1 and char_length(email) <= 254),
  password_hash    text not null,
  email_verified_at timestamptz,
  role             text not null default 'contributor' check (role in ('contributor', 'editor', 'admin')),
  tier             smallint not null default 1 check (tier between 1 and 3),
  agreed_terms_at  timestamptz not null,
  agreed_sources_at timestamptz not null,   -- "I'll only add information I can back up with a source."
  failed_logins    smallint not null default 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists members_username_key on musicvolume.members (lower(username));
create unique index if not exists members_email_key on musicvolume.members (lower(email));

-- Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored here.
create table if not exists musicvolume.sessions (
  id          text primary key,            -- sha256(token), hex
  member_id   uuid not null references musicvolume.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);
create index if not exists sessions_member_idx on musicvolume.sessions (member_id);

-- One-time links sent by email: confirm an address, reset a password.
create table if not exists musicvolume.email_tokens (
  id          text primary key,            -- sha256(token), hex
  member_id   uuid not null references musicvolume.members (id) on delete cascade,
  purpose     text not null check (purpose in ('verify', 'reset')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists email_tokens_member_idx on musicvolume.email_tokens (member_id, purpose, created_at desc);

-- The site's database login, if it exists yet (created by hand with its own password):
-- read and write its own schema, read only the music catalog. Not "all tables in public":
-- that schema also holds Noteworthy's user data (profiles, profile_private, logs, reviews…).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant usage on schema musicvolume to musicvolume_app';
    execute 'grant select, insert, update, delete on all tables in schema musicvolume to musicvolume_app';
    execute 'alter default privileges in schema musicvolume grant select, insert, update, delete on tables to musicvolume_app';
    execute 'grant usage on schema public to musicvolume_app';
    foreach t in array array['artists', 'artist_aliases', 'artist_credits', 'artist_genres', 'artist_members',
                             'similar_artists', 'genres', 'images', 'releases', 'release_genres', 'tracks',
                             'songs', 'song_genres', 'song_versions', 'albums', 'album_tracks', 'videos', 'video_credits'] loop
      if to_regclass('public.' || t) is not null then
        execute format('grant select on public.%I to musicvolume_app', t);
      end if;
    end loop;
    -- Edit history on entry pages: what changed and when, not who edited or reviewed it.
    if to_regclass('public.catalog_edits') is not null then
      execute 'grant select (entity_type, entity_id, action, note, status, reviewed_at, created_at) on public.catalog_edits to musicvolume_app';
    end if;
  end if;
end $$;

commit;
