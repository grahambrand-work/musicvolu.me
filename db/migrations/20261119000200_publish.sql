-- Publishing: the only way the site changes the music catalog. musicvolume.publish(number,
-- member) applies one submission that is in final review to the catalog tables (public.*),
-- marks it published and logs who did it. It runs with the rights of the database owner,
-- but the site's own login (musicvolume_app) can only call it; it still can't write the
-- catalog tables directly.
--
-- Rules it keeps (the same as the MusicBrainz sync, scripts/musicbrainz in Noteworthy):
--   * every field changed by hand goes into the row's edited_fields, so the sync never
--     overwrites it;
--   * new artists, releases and songs get source = 'user', which the sync never touches;
--   * page addresses (slugs) already in use never change.
--
-- Apply as the database owner after 20261119000100. Safe to run twice.

begin;

-- "Low Tide Letters" -> "low-tide-letters"; "low-tide-letters-2" if taken.
create or replace function musicvolume.free_slug(p_table text, p_text text) returns text
language plpgsql set search_path = '' as $$
declare
  base text := left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^[:alnum:]]+', '-', 'g')), 80);
  candidate text;
  n int := 1;
  taken boolean;
begin
  if base = '' then base := 'untitled'; end if;
  candidate := base;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1)', p_table) into taken using candidate;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- "Art pop, electropop" -> {"Art pop","electropop"} (blanks dropped).
create or replace function musicvolume.list_of(p text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x order by n), '{}') from (
    select trim(x) as x, n from unnest(string_to_array(coalesce(p, ''), ',')) with ordinality u(x, n)
  ) y where x <> ''
$$;

-- "3:54" -> 234; "1:02:03" -> 3723; "" -> null.
create or replace function musicvolume.seconds_of(p text) returns integer
language sql immutable set search_path = '' as $$
  select nullif(sum(v::int * (60 ^ (cnt - n)))::int, 0)
    from (select v, n, count(*) over () as cnt
            from unnest(string_to_array(nullif(trim(coalesce(p, '')), ''), ':')) with ordinality u(v, n)) x
   where p ~ '^\s*(\d{1,2}:)?\d{1,3}:[0-5]\d\s*$'
$$;

-- Genre join rows for an artist, release or song, from a list of names.
create or replace function musicvolume.set_genres(p_kind text, p_id uuid, p_names text[]) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.genres (slug, name)
  select distinct on (public.genre_slug(g)) public.genre_slug(g), g from unnest(p_names) g
   where public.genre_slug(g) <> ''
  on conflict (slug) do nothing;
  execute format('delete from public.%I where %I = $1', p_kind || '_genres', p_kind || '_id') using p_id;
  execute format(
    'insert into public.%I (%I, genre_id, position)
     select $1, g.id, min(u.n) - 1 from unnest($2) with ordinality u(name, n) join public.genres g on g.slug = public.genre_slug(u.name)
      group by g.id on conflict do nothing', p_kind || '_genres', p_kind || '_id') using p_id, p_names;
end $$;

-- Artist names typed in an edit ("Lorde, Khalid") -> artist ids, in order. Each name must
-- match exactly one catalog artist (ignoring case); otherwise publishing stops and says which.
create or replace function musicvolume.artist_ids(p_names text[]) returns uuid[]
language plpgsql set search_path = '' as $$
declare
  nm text; hit uuid[]; out uuid[] := '{}';
begin
  foreach nm in array p_names loop
    select array_agg(id) into hit from public.artists where lower(name) = lower(nm);
    if hit is null then raise exception using errcode = 'P0001', message = format('No artist called "%s" in the catalog. Fix the name, or add the artist first.', nm); end if;
    if cardinality(hit) > 1 then raise exception using errcode = 'P0001', message = format('More than one artist is called "%s". Edit the entry so it says which one.', nm); end if;
    out := out || hit[1];
  end loop;
  return out;
end $$;

-- Artists picked on a new release or song: [{"id": …} or {"review": <number>}] -> ids.
create or replace function musicvolume.picked_ids(p jsonb) returns uuid[]
language plpgsql set search_path = '' as $$
declare
  a jsonb; id uuid; out uuid[] := '{}';
begin
  for a in select * from jsonb_array_elements(coalesce(p, '[]')) loop
    if a ? 'id' then
      id := (a->>'id')::uuid;
    else
      select s.entity_id into id from musicvolume.submissions s where s.number = (a->>'review')::bigint and s.status = 'published';
      if id is null then raise exception using errcode = 'P0001', message = format('Publish the new artist "%s" first.', a->>'name'); end if;
    end if;
    out := out || id;
  end loop;
  if cardinality(out) = 0 then raise exception using errcode = 'P0001', message = 'This needs an artist.'; end if;
  return out;
end $$;

-- Main artist credits on a release or song, in order; the first is also the page's artist.
create or replace function musicvolume.set_main_artists(p_kind text, p_id uuid, p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('delete from public.artist_credits where %I = $1 and role = ''main''', p_kind || '_id') using p_id;
  execute format(
    'insert into public.artist_credits (artist_id, %I, role, position)
     select x, $1, ''main'', n - 1 from unnest($2) with ordinality u(x, n)
     on conflict (%I, artist_id) where %I is not null do update set role = ''main'', position = excluded.position',
    p_kind || '_id', p_kind || '_id', p_kind || '_id') using p_id, p_ids;
  execute format('update public.%I set artist_id = $2 where id = $1', p_kind || 's') using p_id, p_ids[1];
end $$;

-- A song for a new track: the artist's existing song of that title, or a new one.
create or replace function musicvolume.song_for(p_title text, p_artist uuid, p_seconds integer) returns uuid
language plpgsql set search_path = '' as $$
declare
  sid uuid; aslug text;
begin
  select slug into aslug from public.artists where id = p_artist;
  select id into sid from public.songs where artist_id = p_artist and lower(title) = lower(p_title) order by source = 'musicbrainz' desc, created_at limit 1;
  if sid is null then
    insert into public.songs (slug, title, artist_id, kind, duration_seconds, source)
    values (musicvolume.free_slug('songs', p_title || '-' || aslug), p_title, p_artist, 'original', p_seconds, 'user')
    returning id into sid;
    insert into public.artist_credits (artist_id, song_id, role, position) values (p_artist, sid, 'main', 0) on conflict do nothing;
  end if;
  return sid;
end $$;

-- Date fields: "2017-06-16" sets the date and year; "2017" or "2017-06" only the year.
create or replace function musicvolume.date_part_of(p text) returns date
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date end
$$;

create or replace function musicvolume.publish(p_number bigint, p_member uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s musicvolume.submissions;
  m musicvolume.members;
  c jsonb;
  k text;
  eid uuid;
  edited text[] := '{}';
  ids uuid[];
  t jsonb;
  n int;
  disc smallint;
  tid uuid;
  sid uuid;
  slug text;
  tbl text;
begin
  select * into m from musicvolume.members where id = p_member;
  if m.id is null or not (m.role = 'admin' or (m.role = 'editor' and m.tier = 3)) then
    raise exception using errcode = 'P0001', message = 'Only a tier 3 editor or an admin can publish.';
  end if;
  select * into s from musicvolume.submissions where number = p_number for update;
  if s.id is null then raise exception using errcode = 'P0001', message = 'That submission no longer exists.'; end if;
  if s.status <> 'final_review' then raise exception using errcode = 'P0001', message = 'Only submissions in final review can be published.'; end if;
  c := s.changes;
  tbl := s.entity_type || 's';

  if s.kind = 'edit' then
    eid := s.entity_id;
    execute format('select id from public.%I where id = $1 for update', tbl) into tid using eid;
    if tid is null then raise exception using errcode = 'P0001', message = 'The entry this edit is for no longer exists.'; end if;

    for k in select jsonb_object_keys(c) loop
      -- Each field the edit form knows, to its column(s).
      case s.entity_type || ':' || k
        when 'artist:name' then update public.artists set name = c->k->>'to' where id = eid; edited := edited || 'name'::text;
        when 'artist:note' then update public.artists set disambiguation = nullif(c->k->>'to', '') where id = eid; edited := edited || 'disambiguation'::text;
        when 'artist:kind' then update public.artists set kind = c->k->>'to' where id = eid; edited := edited || 'kind'::text;
        when 'artist:born' then update public.artists set born = nullif(c->k->>'to', '') where id = eid; edited := edited || 'born'::text;
        when 'artist:origin' then update public.artists set origin = nullif(c->k->>'to', '') where id = eid; edited := edited || 'origin'::text;
        when 'artist:years' then update public.artists set years = nullif(c->k->>'to', '') where id = eid; edited := edited || 'years'::text;
        when 'artist:website' then update public.artists set website = nullif(c->k->>'to', '') where id = eid; edited := edited || 'website'::text;
        when 'artist:genres' then
          update public.artists set genres = musicvolume.list_of(c->k->>'to') where id = eid;
          perform musicvolume.set_genres('artist', eid, musicvolume.list_of(c->k->>'to')); edited := edited || 'genres'::text;
        when 'artist:aliases' then
          delete from public.artist_aliases where artist_id = eid and kind = 'Also known as';
          insert into public.artist_aliases (artist_id, name, kind, source)
          select eid, x, 'Also known as', 'user' from unnest(musicvolume.list_of(c->k->>'to')) x;
          edited := edited || 'aliases'::text;
        when 'artist:legalName' then
          delete from public.artist_aliases where artist_id = eid and kind = 'Legal name';
          if coalesce(c->k->>'to', '') <> '' then
            insert into public.artist_aliases (artist_id, name, kind, source) values (eid, c->k->>'to', 'Legal name', 'user');
          end if;
          edited := edited || 'aliases'::text;

        when 'release:title' then update public.releases set title = c->k->>'to' where id = eid; edited := edited || 'title'::text;
        when 'release:type' then update public.releases set type = c->k->>'to' where id = eid; edited := edited || 'type'::text;
        when 'release:releaseDate' then
          update public.releases set release_date = musicvolume.date_part_of(c->k->>'to'), year = nullif(left(c->k->>'to', 4), '')::smallint where id = eid;
          edited := edited || array['release_date', 'year'];
        when 'release:label' then update public.releases set label = nullif(c->k->>'to', '') where id = eid; edited := edited || 'label'::text;
        when 'release:country' then update public.releases set country = nullif(c->k->>'to', '') where id = eid; edited := edited || 'country'::text;
        when 'release:language' then update public.releases set language = nullif(c->k->>'to', '') where id = eid; edited := edited || 'language'::text;
        when 'release:genres' then
          update public.releases set genres = musicvolume.list_of(c->k->>'to') where id = eid;
          perform musicvolume.set_genres('release', eid, musicvolume.list_of(c->k->>'to')); edited := edited || 'genres'::text;
        when 'release:artists' then
          perform musicvolume.set_main_artists('release', eid, musicvolume.artist_ids(musicvolume.list_of(c->k->>'to'))); edited := edited || 'artists'::text;
        when 'release:tracks' then
          -- The full new tracklist: [{id, title, duration}]. Known ids are existing tracks
          -- (a changed title renames that song everywhere); "n:…" ids are new tracks.
          select artist_id into tid from public.releases where id = eid;  -- (the release's artist)
          update public.tracks set track_no = null where release_id = eid;
          n := 0; disc := 1;
          for t in select * from jsonb_array_elements(c->k->'to') loop
            n := n + 1;
            if (t->>'id') ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.tracks where id = (t->>'id')::uuid and release_id = eid) then
              select disc_no, song_id into disc, sid from public.tracks where id = (t->>'id')::uuid;
              update public.tracks set track_no = n, duration_seconds = coalesce(musicvolume.seconds_of(t->>'duration'), duration_seconds)
               where id = (t->>'id')::uuid;
              update public.songs set title = t->>'title', edited_fields = array(select distinct unnest(edited_fields || '{title}'::text[]))
               where id = sid and title is distinct from t->>'title';
            else
              insert into public.tracks (release_id, song_id, disc_no, track_no, duration_seconds)
              values (eid, musicvolume.song_for(t->>'title', tid, musicvolume.seconds_of(t->>'duration')), coalesce(disc, 1), n, musicvolume.seconds_of(t->>'duration'));
            end if;
          end loop;
          -- Tracks taken off: removed, unless someone's log points at that version.
          delete from public.tracks tr where tr.release_id = eid and tr.track_no is null
             and not exists (select 1 from public.logs l where l.version_id = tr.id);
          edited := edited || 'tracks'::text;

        when 'song:title' then update public.songs set title = c->k->>'to' where id = eid; edited := edited || 'title'::text;
        when 'song:duration' then update public.songs set duration_seconds = musicvolume.seconds_of(c->k->>'to') where id = eid; edited := edited || 'duration_seconds'::text;
        when 'song:language' then update public.songs set language = nullif(c->k->>'to', '') where id = eid; edited := edited || 'language'::text;
        when 'song:genres' then perform musicvolume.set_genres('song', eid, musicvolume.list_of(c->k->>'to')); edited := edited || 'genres'::text;
        when 'song:artists' then
          perform musicvolume.set_main_artists('song', eid, musicvolume.artist_ids(musicvolume.list_of(c->k->>'to'))); edited := edited || 'artists'::text;
        when 'song:credits' then
          delete from public.song_credits where song_id = eid;
          insert into public.song_credits (song_id, role, name, position)
          select eid, x->>'role', x->>'name', (n0 - 1)::smallint from jsonb_array_elements(c->k->'to') with ordinality u(x, n0);
          edited := edited || 'credits'::text;
        else
          raise exception using errcode = 'P0001', message = format('This site can''t publish the field "%s" yet.', k);
      end case;
    end loop;
    execute format('update public.%I set edited_fields = array(select distinct unnest(edited_fields || $2)), updated_at = now() where id = $1', tbl)
      using eid, edited;

  else
    -- A new entry.
    if s.entity_type = 'artist' then
      insert into public.artists (slug, name, kind, origin, years, website, genres, source)
      values (musicvolume.free_slug('artists', c->'name'->>'to'), c->'name'->>'to', coalesce(c->'kind'->>'to', 'Solo artist'),
              nullif(c->'origin'->>'to', ''), nullif(c->'started'->>'to', ''), nullif(c->'website'->>'to', ''),
              musicvolume.list_of(c->'genres'->>'to'), 'user')
      returning id into eid;
      perform musicvolume.set_genres('artist', eid, musicvolume.list_of(c->'genres'->>'to'));
    elsif s.entity_type = 'release' then
      ids := musicvolume.picked_ids(c->'artists'->'to');
      insert into public.releases (slug, title, artist_id, type, release_date, year, genres, has_page, label, country, language, source)
      values (musicvolume.free_slug('releases', c->'title'->>'to'), c->'title'->>'to', ids[1], coalesce(c->'type'->>'to', 'Album'),
              musicvolume.date_part_of(c->'releaseDate'->>'to'), nullif(left(coalesce(c->'releaseDate'->>'to', ''), 4), '')::smallint,
              musicvolume.list_of(c->'genres'->>'to'), true,
              nullif(c->'label'->>'to', ''), nullif(c->'country'->>'to', ''), nullif(c->'language'->>'to', ''), 'user')
      returning id into eid;
      perform musicvolume.set_main_artists('release', eid, ids);
      perform musicvolume.set_genres('release', eid, musicvolume.list_of(c->'genres'->>'to'));
      n := 0;
      for t in select * from jsonb_array_elements(coalesce(c->'tracks'->'to', '[]')) loop
        n := n + 1;
        insert into public.tracks (release_id, song_id, disc_no, track_no, duration_seconds)
        values (eid, musicvolume.song_for(t->>'title', ids[1], musicvolume.seconds_of(t->>'duration')), 1, n, musicvolume.seconds_of(t->>'duration'));
      end loop;
    else
      ids := musicvolume.picked_ids(c->'artists'->'to');
      select a.slug into slug from public.artists a where a.id = ids[1];
      insert into public.songs (slug, title, artist_id, kind, duration_seconds, language, source)
      values (musicvolume.free_slug('songs', (c->'title'->>'to') || '-' || slug), c->'title'->>'to', ids[1], 'original',
              musicvolume.seconds_of(c->'duration'->>'to'), nullif(c->'language'->>'to', ''), 'user')
      returning id into eid;
      perform musicvolume.set_main_artists('song', eid, ids);
      perform musicvolume.set_genres('song', eid, musicvolume.list_of(c->'genres'->>'to'));
      insert into public.song_credits (song_id, role, name, position)
      select eid, x->>'role', x->>'name', (n0 - 1)::smallint from jsonb_array_elements(coalesce(c->'credits'->'to', '[]')) with ordinality u(x, n0);
    end if;
  end if;

  update musicvolume.submissions set status = 'published', published_at = now(), updated_at = now(), entity_id = eid where id = s.id;
  insert into musicvolume.submission_events (submission_id, member_id, action, from_status, to_status, detail)
  values (s.id, p_member, 'status', 'final_review', 'published', jsonb_build_object('move', 'publish', 'edited', edited));
  execute format('select slug from public.%I where id = $1', tbl) into slug using eid;
  return jsonb_build_object('type', s.entity_type, 'id', eid, 'slug', slug);
end $$;

-- Only the site may publish, and only through this function. The helpers are for publish only.
revoke execute on function musicvolume.publish(bigint, uuid) from public;
revoke execute on function musicvolume.free_slug(text, text), musicvolume.set_genres(text, uuid, text[]),
  musicvolume.artist_ids(text[]), musicvolume.picked_ids(jsonb), musicvolume.set_main_artists(text, uuid, uuid[]),
  musicvolume.song_for(text, uuid, integer) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant execute on function musicvolume.publish(bigint, uuid) to musicvolume_app';
  end if;
end $$;

commit;
