-- A tiny catalog for running the site on a laptop (see README). Not used on the server.
begin;
insert into public.artists (slug, name, kind, origin, years, genres, musicbrainz_id) values
  ('lorde', 'Lorde', 'Solo artist', 'New Zealand', '2009–present', '{art pop,electropop}', '8e494408-8620-4c6a-82c2-c2ca4a1e4f12'),
  ('lordi', 'Lordi', 'Band', 'Finland', '1992–present', '{hard rock,heavy metal}', null);
insert into public.artist_aliases (artist_id, name, kind) select id, 'Ella Marija Lani Yelich-O’Connor', 'Legal name' from public.artists where slug = 'lorde';
insert into public.artist_members (band_id, position, name, role) select id, 1, 'Mr Lordi', 'vocals' from public.artists where slug = 'lordi';

insert into public.releases (slug, title, artist_id, type, release_date, year, genres, musicbrainz_release_group_id)
select v.slug, v.title, a.id, v.type, v.d::date, v.y, v.g::text[], v.mb::uuid
  from (values
    ('melodrama', 'Melodrama', 'lorde', 'Album', '2017-06-16', 2017, '{art pop,electropop}', '2f0a2e1d-1111-4c11-9c11-0000c7e1c7e1'),
    ('pure-heroine', 'Pure Heroine', 'lorde', 'Album', '2013-09-27', 2013, '{art pop}', null),
    ('solar-power', 'Solar Power', 'lorde', 'Album', '2021-08-20', 2021, '{pop}', null),
    ('virgin', 'Virgin', 'lorde', 'Album', '2025-06-27', 2025, '{electropop}', null),
    ('the-love-club-ep', 'The Love Club EP', 'lorde', 'EP', '2013-03-08', 2013, '{indie pop}', null),
    ('hard-rock-hallelujah', 'Hard Rock Hallelujah', 'lordi', 'Single', '2006-01-01', 2006, '{hard rock}', null)
  ) v(slug, title, artist, type, d, y, g, mb)
  join public.artists a on a.slug = v.artist;

insert into public.songs (slug, title, artist_id, duration_seconds)
select v.slug, v.title, a.id, v.len
  from (values
    ('green-light','Green Light',234),('sober','Sober',197),('homemade-dynamite','Homemade Dynamite',189),('the-louvre','The Louvre',271),
    ('liability','Liability',172),('hard-feelings-loveless','Hard Feelings/Loveless',367),('sober-ii-melodrama','Sober II (Melodrama)',178),
    ('writer-in-the-dark','Writer in the Dark',216),('supercut','Supercut',277),('liability-reprise','Liability (Reprise)',136),('perfect-places','Perfect Places',221),
    ('royals','Royals',190),('team','Team',193),('tennis-court','Tennis Court',198),('solar-power-song','Solar Power',192)
  ) v(slug, title, len)
  cross join public.artists a where a.slug = 'lorde';

insert into public.tracks (release_id, song_id, disc_no, track_no, duration_seconds)
select r.id, s.id, 1, v.no, s.duration_seconds
  from (values
    ('melodrama','green-light',1),('melodrama','sober',2),('melodrama','homemade-dynamite',3),('melodrama','the-louvre',4),('melodrama','liability',5),
    ('melodrama','hard-feelings-loveless',6),('melodrama','sober-ii-melodrama',7),('melodrama','writer-in-the-dark',8),('melodrama','supercut',9),
    ('melodrama','liability-reprise',10),('melodrama','perfect-places',11),
    ('pure-heroine','tennis-court',1),('pure-heroine','royals',3),('pure-heroine','team',6),
    ('the-love-club-ep','royals',2),('solar-power','solar-power-song',3)
  ) v(rel, song, no)
  join public.releases r on r.slug = v.rel join public.songs s on s.slug = v.song;

insert into public.genres (slug, name) values ('art-pop','art pop'),('electropop','electropop') on conflict do nothing;
insert into public.release_genres (release_id, genre_id, position) select r.id, g.id, case g.slug when 'art-pop' then 0 else 1 end from public.releases r, public.genres g where r.slug = 'melodrama';
insert into public.artist_genres (artist_id, genre_id, position) select a.id, g.id, case g.slug when 'art-pop' then 0 else 1 end from public.artists a, public.genres g where a.slug = 'lorde';
commit;
