-- Members and roles (Figma "Members and roles", 93:1098) and Contributions pages (90:993):
--   * tier_allowances: edits a month for each contributor tier. Admins change them on the
--     Members page; a change starts on the 1st of the next month, and every change is kept;
--   * role_changes: every role or tier change, by an admin or by the automatic promotion;
--   * automatic promotion: a tier 1 contributor becomes tier 2 at 25 published edits, and
--     tier 3 at 100. Promotion only goes up; an admin can still set any role by hand.
--
-- Apply as the catalog table owner after 20261118000200 (needs musicvolume.submissions).
-- Safe to run twice. Until it is applied the site uses 10 / 25 / 50 and nobody is promoted.

begin;

create table if not exists musicvolume.tier_allowances (
  id         uuid primary key default gen_random_uuid(),
  tier       smallint not null check (tier between 1 and 3),
  monthly    integer not null check (monthly between 1 and 10000),
  starts_on  date not null check (extract(day from starts_on) = 1),   -- always the 1st of a month
  changed_by uuid references musicvolume.members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tier_allowances_tier_idx on musicvolume.tier_allowances (tier, starts_on desc, created_at desc);

insert into musicvolume.tier_allowances (tier, monthly, starts_on)
select t, m, date '2026-01-01' from (values (1, 10), (2, 25), (3, 50)) v (t, m)
 where not exists (select 1 from musicvolume.tier_allowances);

create table if not exists musicvolume.role_changes (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references musicvolume.members (id) on delete cascade,
  from_role  text not null,
  from_tier  smallint not null,
  to_role    text not null,
  to_tier    smallint not null,
  changed_by uuid references musicvolume.members (id) on delete set null,   -- null = automatic promotion
  created_at timestamptz not null default now()
);
create index if not exists role_changes_member_idx on musicvolume.role_changes (member_id, created_at desc);

-- Automatic promotion when a contributor's submission is published.
create or replace function musicvolume.promote_contributor() returns trigger
language plpgsql set search_path = '' as $$
declare
  m musicvolume.members;
  n integer;
  target smallint;
begin
  select * into m from musicvolume.members where id = new.member_id for update;
  if m.id is null or m.role <> 'contributor' or m.tier >= 3 then return null; end if;
  select count(*) into n from musicvolume.submissions where member_id = m.id and status = 'published';
  target := case when n >= 100 then 3 when n >= 25 then 2 else 1 end;
  if target > m.tier then
    update musicvolume.members set tier = target where id = m.id;
    insert into musicvolume.role_changes (member_id, from_role, from_tier, to_role, to_tier, changed_by)
    values (m.id, m.role, m.tier, m.role, target, null);
  end if;
  return null;
end $$;

drop trigger if exists submissions_promote on musicvolume.submissions;
create trigger submissions_promote
  after update of status on musicvolume.submissions
  for each row when (new.status = 'published' and old.status is distinct from 'published')
  execute function musicvolume.promote_contributor();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'musicvolume_app') then
    execute 'grant select, insert on musicvolume.tier_allowances, musicvolume.role_changes to musicvolume_app';
  end if;
end $$;

commit;
