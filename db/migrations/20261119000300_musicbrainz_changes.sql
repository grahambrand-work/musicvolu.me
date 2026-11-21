-- MusicBrainz changes from the catalog sync: applied ones go in the activity log, ones that
-- contradict a musicvolu.me edit go to the review board as submissions by "MusicBrainz".
--
-- How the sync uses it (scripts/musicbrainz/sql/supabase_merge.sql in Noteworthy):
--   1. before each upsert, it inserts one row per changed field into musicvolume.mb_changes:
--      entity ('artist' | 'release' | 'song'), entity_id, field (the catalog column: name,
--      disambiguation, kind, origin, years, genres, aliases, members, title, type,
--      release_date, year, duration_seconds, tracks…), old_value / new_value as text
--      (lists joined with ', ', dates as YYYY-MM-DD, durations in seconds), and
--      conflict = (field is in the row's edited_fields, so the merge kept our value);
--   2. after the merge, it calls  select musicvolume.record_mb_changes();  once.
-- That writes the activity log, opens or updates review submissions, and empties mb_changes.
--
-- Rules:
--   * applied changes: one activity row each, by MusicBrainz;
--   * a contradiction joins MusicBrainz's open submission for that entry if one is still
--     waiting (needs review), otherwise opens a new one;
--   * a value MusicBrainz already proposed for that field (pending, published or rejected)
--     is not proposed again; a different value is.
--
-- Apply as the catalog table owner after 20261119000200. Safe to run twice.

begin;

-- ---------------------------------------------------------------- the MusicBrainz account
-- A system account: shown as "MusicBrainz" in teal, can't sign in, can't review.
alter table musicvolume.members drop constraint if exists members_role_check;
alter table musicvolume.members add constraint members_role_check
  check (role in ('contributor', 'editor', 'admin', 'system'));
alter table musicvolume.members drop constraint if exists members_username_check;
alter table musicvolume.members add constraint members_username_check
  check (username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' or role = 'system');

insert into musicvolume.members (username, email, password_hash, email_verified_at, role, tier,
                                 agreed_terms_at, agreed_sources_at, locked_until)
select 'MusicBrainz', 'musicbrainz@system.invalid', '!', now(), 'system', 3, now(), now(), 'infinity'
 where not exists (select 1 from musicvolume.members where role = 'system' and lower(username) = 'musicbrainz');

create or replace function musicvolume.musicbrainz_member() returns uuid
language sql stable set search_path = '' as $$
  select id from musicvolume.members where role = 'system' and lower(username) = 'musicbrainz'
$$;

-- ---------------------------------------------------------------- staging (filled by the sync)
create unlogged table if not exists musicvolume.mb_changes (
  entity    text not null check (entity in ('artist', 'release', 'song')),
  entity_id uuid not null,
  field     text not null,
  old_value text,
  new_value text,
  conflict  boolean not null default false,
  run_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- activity log
-- Every change to the catalog that didn't go through a review (today: the MusicBrainz sync).
-- action: applied = written to the catalog; submitted = sent to review instead;
-- kept = contradicted a hand edit on a field the review board can't take yet (members,
-- track lists), so ours was kept and nothing was sent.
create table if not exists musicvolume.catalog_activity (
  id            bigint generated always as identity primary key,
  member_id     uuid references musicvolume.members (id),
  entity_type   text not null check (entity_type in ('artist', 'release', 'song')),
  entity_id     uuid not null,
  field         text not null,
  old_value     text,
  new_value     text,
  action        text not null check (action in ('applied', 'submitted', 'kept')),
  submission_id uuid references musicvolume.submissions (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists catalog_activity_entity_idx on musicvolume.catalog_activity (entity_type, entity_id, created_at desc);
create index if not exists catalog_activity_time_idx on musicvolume.catalog_activity (created_at desc);

-- What MusicBrainz last proposed for a field we keep by hand, so it isn't proposed nightly.
create table if not exists musicvolume.mb_proposals (
  entity_type   text not null,
  entity_id     uuid not null,
  field         text not null,
  mb_value      text,
  submission_id uuid references musicvolume.submissions (id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (entity_type, entity_id, field)
);

-- ---------------------------------------------------------------- catalog column -> form field
-- The review board and publish() speak the edit form's field names.
create or replace function musicvolume.mb_form_field(p_entity text, p_field text) returns text
language sql immutable set search_path = '' as $$
  select case p_entity || ':' || p_field
    when 'artist:name' then 'name'          when 'artist:disambiguation' then 'note'
    when 'artist:kind' then 'kind'          when 'artist:origin' then 'origin'
    when 'artist:years' then 'years'        when 'artist:genres' then 'genres'
    when 'artist:aliases' then 'aliases'
    when 'release:title' then 'title'       when 'release:type' then 'type'
    when 'release:release_date' then 'releaseDate' when 'release:year' then 'releaseDate'
    when 'release:genres' then 'genres'
    when 'song:title' then 'title'          when 'song:duration_seconds' then 'duration'
    when 'song:genres' then 'genres'
  end
$$;

-- Form value: durations as m:ss, everything else as given.
create or replace function musicvolume.mb_form_value(p_field text, p_value text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_field = 'duration_seconds' and p_value ~ '^\d+$'
      then (p_value::int / 60)::text || ':' || lpad((p_value::int % 60)::text, 2, '0')
    else coalesce(p_value, '') end
$$;

-- ---------------------------------------------------------------- the entry point
create or replace function musicvolume.record_mb_changes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mb uuid := musicvolume.musicbrainz_member();
  n_applied int; n_new int := 0; n_joined int := 0; n_skipped int := 0;
  e record; sid uuid; ch jsonb; nm text;
begin
  if mb is null then raise exception 'The MusicBrainz account is missing (migration 20261119000300).'; end if;

  -- 1. Applied changes -> activity log.
  insert into musicvolume.catalog_activity (member_id, entity_type, entity_id, field, old_value, new_value, action, created_at)
  select mb, entity, entity_id, field, old_value, new_value, 'applied', run_at
    from musicvolume.mb_changes where not conflict and old_value is distinct from new_value;
  get diagnostics n_applied = row_count;

  -- 2. Contradictions -> review, one submission per entry. Leave out values already proposed,
  --    and fields the review board can't show or publish yet (logged as kept).
  create temp table mb_c on commit drop as
  select distinct on (c.entity, c.entity_id, f.form)
         c.entity, c.entity_id, c.field, f.form, c.old_value, c.new_value
    from musicvolume.mb_changes c
    cross join lateral (select musicvolume.mb_form_field(c.entity, c.field) as form) f
    left join musicvolume.mb_proposals p
      on p.entity_type = c.entity and p.entity_id = c.entity_id and p.field = c.field
   where c.conflict and c.old_value is distinct from c.new_value
     and p.mb_value is distinct from c.new_value
   order by c.entity, c.entity_id, f.form, (c.field = 'year')   -- release_date beats year
  ;
  insert into musicvolume.catalog_activity (member_id, entity_type, entity_id, field, old_value, new_value, action)
  select mb, entity, entity_id, field, old_value, new_value, 'kept' from mb_c where form is null;
  get diagnostics n_skipped = row_count;
  insert into musicvolume.mb_proposals (entity_type, entity_id, field, mb_value)
  select entity, entity_id, field, new_value from mb_c where form is null
  on conflict (entity_type, entity_id, field) do update set mb_value = excluded.mb_value, updated_at = now();

  for e in select entity, entity_id from mb_c where form is not null group by entity, entity_id loop
    ch := (select jsonb_object_agg(form, jsonb_build_object(
                    'from', musicvolume.mb_form_value(field, old_value),
                    'to',   musicvolume.mb_form_value(field, new_value)))
             from mb_c where entity = e.entity and entity_id = e.entity_id and form is not null);
    select id into sid from musicvolume.submissions
     where member_id = mb and entity_type = e.entity and entity_id = e.entity_id and status = 'needs_review'
     order by created_at desc limit 1;
    if sid is not null then
      update musicvolume.submissions set changes = changes || ch, updated_at = now() where id = sid;
      insert into musicvolume.submission_events (submission_id, member_id, action, detail)
      values (sid, mb, 'edited', jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(ch) k)));
      n_joined := n_joined + 1;
    else
      execute format('select %s from public.%I where id = $1',
                     case e.entity when 'artist' then 'name' else 'title' end,
                     case e.entity when 'artist' then 'artists' when 'release' then 'releases' else 'songs' end)
        into nm using e.entity_id;
      if nm is null then continue; end if;   -- entry gone
      insert into musicvolume.submissions (member_id, kind, entity_type, entity_id, entity_name, changes, note, sources)
      values (mb, 'edit', e.entity, e.entity_id, nm, ch,
              'MusicBrainz changed fields that were edited on musicvolu.me, so they were kept as they are. Publish to take MusicBrainz''s values, or reject to keep ours.',
              'https://musicbrainz.org')
      returning id into sid;
      insert into musicvolume.submission_events (submission_id, member_id, action, to_status, detail)
      values (sid, mb, 'submitted', 'needs_review', jsonb_build_object('source', 'musicbrainz'));
      n_new := n_new + 1;
    end if;

    insert into musicvolume.catalog_activity (member_id, entity_type, entity_id, field, old_value, new_value, action, submission_id)
    select mb, entity, entity_id, field, old_value, new_value, 'submitted', sid
      from mb_c where entity = e.entity and entity_id = e.entity_id and form is not null;
    insert into musicvolume.mb_proposals (entity_type, entity_id, field, mb_value, submission_id)
    select entity, entity_id, field, new_value, sid
      from mb_c where entity = e.entity and entity_id = e.entity_id and form is not null
    on conflict (entity_type, entity_id, field) do update
      set mb_value = excluded.mb_value, submission_id = excluded.submission_id, updated_at = now();
  end loop;

  truncate musicvolume.mb_changes;
  return jsonb_build_object('applied', n_applied, 'new_submissions', n_new,
                            'updated_submissions', n_joined, 'kept_not_reviewable', n_skipped);
end $$;

revoke execute on function musicvolume.record_mb_changes() from public;
revoke execute on function musicvolume.mb_form_field(text, text), musicvolume.mb_form_value(text, text),
                           musicvolume.musicbrainz_member() from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant select on musicvolume.catalog_activity to musicvolume_app';
  end if;
end $$;

commit;
