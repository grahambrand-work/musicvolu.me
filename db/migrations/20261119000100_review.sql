-- The review board: comments on a submission (on the whole thing or on one field), and
-- likes / dislikes on submissions and comments. Status moves are already logged in
-- musicvolume.submission_events (from 20261118000200).
--
-- Apply as the database owner after 20261118000200. Safe to run twice. Only adds tables.

begin;

-- A comment on a submission. field = null: on the whole submission ("Discussion");
-- otherwise the field it is about ("label", "tracks"...). Mentions are plain "@username" text.
create table if not exists musicvolume.submission_comments (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references musicvolume.submissions (id) on delete cascade,
  member_id     uuid not null references musicvolume.members (id),
  field         text check (char_length(field) <= 80),
  body          text not null check (char_length(body) between 1 and 4000),
  created_at    timestamptz not null default now()
);
create index if not exists submission_comments_sub_idx on musicvolume.submission_comments (submission_id, created_at);

-- One like (+1) or dislike (-1) per member per submission or comment.
create table if not exists musicvolume.votes (
  target_type text not null check (target_type in ('submission', 'comment')),
  target_id   uuid not null,
  member_id   uuid not null references musicvolume.members (id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, member_id)
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant select, insert, update, delete on musicvolume.submission_comments, musicvolume.votes to musicvolume_app';
  end if;
end $$;

commit;
