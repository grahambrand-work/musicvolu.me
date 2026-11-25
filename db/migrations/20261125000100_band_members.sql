-- Band member edits (Graham, 2026-11-24): an artist edit can change who is in a band and the
-- order they're listed in. publish() learns the 'members' field: the band's artist_members rows
-- are replaced by the new list, positions 1, 2, 3… in the order given, and 'members' is marked
-- hand-edited so the MusicBrainz sync keeps it (supabase_merge.sql already skips those bands).
--
-- Apply as the catalog table owner after 20261122000100_artist_photos. Safe to run twice.

begin;

-- publish(), unchanged except for the new 'artist:members' field.
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
        -- The cover is downloaded and stored by the site at publish time; apply_cover() sets it.
        when 'release:cover' then null;
        -- An artist photo works the same way (Graham, 2026-11-21): apply_cover() sets it.
        when 'artist:cover' then null;
        -- Band members (Graham, 2026-11-24): the full new list, in order [{name, role, artistId}].
        -- Position is the order musicvolu.me and Noteworthy show them in. artistId links a member
        -- to their own artist page (never the band itself). 'members' in edited_fields stops the
        -- MusicBrainz sync from replacing the list.
        when 'artist:members' then
          delete from public.artist_members where band_id = eid;
          insert into public.artist_members (band_id, position, name, role, member_artist_id)
          select eid, n0::smallint, left(x->>'name', 300), nullif(left(coalesce(x->>'role', ''), 60), ''),
                 (select a.id from public.artists a where a.id::text = x->>'artistId' and a.id <> eid)
            from jsonb_array_elements(coalesce(c->k->'to', '[]')) with ordinality u(x, n0)
           where coalesce(trim(x->>'name'), '') <> '';
          edited := edited || 'members'::text;
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
    if exists (select 1 from musicvolume.members where id = s.member_id and role = 'system')
       and not exists (select 1 from musicvolume.submission_events e join musicvolume.members who on who.id = e.member_id
                        where e.submission_id = s.id and e.action = 'edited' and who.role <> 'system') then
      -- MusicBrainz's own change, accepted as it came (no editor changed it): those fields stop
      -- being hand-edited, so later MusicBrainz changes to them apply without review again.
      execute format('update public.%I set edited_fields = array(select x from unnest(edited_fields) x where x <> all ($2)), updated_at = now() where id = $1', tbl)
        using eid, edited;
    else
      execute format('update public.%I set edited_fields = array(select distinct unnest(edited_fields || $2)), updated_at = now() where id = $1', tbl)
        using eid, edited;
    end if;

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

commit;
