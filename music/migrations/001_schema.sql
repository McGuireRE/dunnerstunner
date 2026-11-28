-- Cornerstone music site. Own Supabase project (cornerstone-music), separate from the agency database.
-- No personal data lives in this file or anywhere in the repo: people, roster and songs are loaded straight into the database.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table public.people(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  level text not null default 'member' check (level in ('member','admin','webmaster')),
  active boolean not null default true,
  left_on date,
  created_at timestamptz not null default now());
create table public.person_emails(
  email text not null check (email = lower(email) and email like '%@%'),
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (email, person_id));
create index on public.person_emails(person_id);
create table public.roles(id text primary key, label text not null, sort int not null, grp text not null default 'music');
create table public.person_roles(
  person_id uuid not null references public.people(id) on delete cascade,
  role_id text not null references public.roles(id) on delete cascade,
  primary key (person_id, role_id));
create table public.services(
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null default 'sunday' check (kind in ('sunday','special')),
  title text, passage text, notes text,
  songs_confirmed_at timestamptz,
  songs_confirmed_by uuid references public.people(id),
  created_at timestamptz not null default now());
create unique index services_one_sunday on public.services(date) where kind = 'sunday';
create table public.slots(
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  role_id text not null references public.roles(id),
  person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  unique (service_id, role_id, person_id));
create index on public.slots(person_id);
create table public.away(
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  from_date date not null, to_date date not null, note text,
  check (to_date >= from_date));
create table public.songs(
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  key text, era text check (era in ('modern','old')),
  preferred boolean not null default false,
  sheet_url text, active boolean not null default true,
  created_at timestamptz not null default now());
create unique index songs_title on public.songs(lower(title));
create table public.service_songs(
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  song_id uuid not null references public.songs(id),
  position int not null default 0, bracket int not null default 1, key text,
  unique (service_id, song_id));
create table public.swaps(
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete cascade,
  requested_by uuid not null references public.people(id),
  note text,
  status text not null default 'open' check (status in ('open','covered','cancelled')),
  covered_by uuid references public.people(id),
  created_at timestamptz not null default now(), covered_at timestamptz);
create unique index swaps_one_open on public.swaps(slot_id) where status = 'open';
create table public.app_settings(key text primary key, value text);

create table private.settings(key text primary key, value text);
create table private.outbox(
  id bigint generated always as identity primary key, kind text not null, to_emails text[] not null,
  subject text not null, html text not null, created_at timestamptz not null default now(),
  sent_at timestamptz, error text);
create table private.marks(kind text, ref uuid, primary key (kind, ref));
create table private.signin_log(email text not null, at timestamptz not null default now());

-- Who is asking. One login email can belong to more than one person (couples who share an address).
create function public.me_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.people p join public.person_emails e on e.person_id = p.id
  where p.active and e.email = lower(coalesce(auth.jwt() ->> 'email', '')) $$;
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.me_ids()) $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where id in (select public.me_ids()) and level in ('admin','webmaster')) $$;
create function public.is_webmaster() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where id in (select public.me_ids()) and level = 'webmaster') $$;
create function public.can_pick(p_service uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (select 1 from public.slots where service_id = p_service
    and role_id in ('lead','chooser') and person_id in (select public.me_ids())) $$;

-- Only a webmaster can make, change or remove a webmaster, or add a login to one.
create function private.guard_people() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_webmaster() then return coalesce(new, old); end if;
  if (tg_op = 'INSERT' and new.level = 'webmaster')
     or (tg_op = 'UPDATE' and (old.level = 'webmaster' or new.level = 'webmaster'))
     or (tg_op = 'DELETE' and old.level = 'webmaster') then
    raise exception 'Only the webmaster can change a webmaster';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_people before insert or update or delete on public.people for each row execute function private.guard_people();
create function private.guard_emails() returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.person_id, old.person_id);
begin
  if auth.uid() is null or public.is_webmaster() then return coalesce(new, old); end if;
  if exists (select 1 from public.people where id = v and level = 'webmaster')
     or (tg_op = 'UPDATE' and exists (select 1 from public.people where id = old.person_id and level = 'webmaster')) then
    raise exception 'Only the webmaster can change a webmaster''s login';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_emails before insert or update or delete on public.person_emails for each row execute function private.guard_emails();

alter table public.people enable row level security;
alter table public.person_emails enable row level security;
alter table public.roles enable row level security;
alter table public.person_roles enable row level security;
alter table public.services enable row level security;
alter table public.slots enable row level security;
alter table public.away enable row level security;
alter table public.songs enable row level security;
alter table public.service_songs enable row level security;
alter table public.swaps enable row level security;
alter table public.app_settings enable row level security;

create policy read on public.people for select to authenticated using (public.is_member());
create policy ins on public.people for insert to authenticated with check (public.is_admin());
create policy upd on public.people for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy read on public.person_emails for select to authenticated using (public.is_member());
create policy ins on public.person_emails for insert to authenticated with check (public.is_admin());
create policy del on public.person_emails for delete to authenticated using (public.is_admin());
create policy read on public.roles for select to authenticated using (public.is_member());
create policy read on public.person_roles for select to authenticated using (public.is_member());
create policy ins on public.person_roles for insert to authenticated with check (public.is_admin() or person_id in (select public.me_ids()));
create policy del on public.person_roles for delete to authenticated using (public.is_admin() or person_id in (select public.me_ids()));
create policy read on public.services for select to authenticated using (public.is_member());
create policy ins on public.services for insert to authenticated with check (public.is_admin());
create policy upd on public.services for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy del on public.services for delete to authenticated using (public.is_admin());
create policy read on public.slots for select to authenticated using (public.is_member());
create policy ins on public.slots for insert to authenticated with check (public.is_admin());
create policy del on public.slots for delete to authenticated using (public.is_admin());
create policy read on public.away for select to authenticated using (public.is_member());
create policy ins on public.away for insert to authenticated with check (public.is_admin() or person_id in (select public.me_ids()));
create policy del on public.away for delete to authenticated using (public.is_admin() or person_id in (select public.me_ids()));
create policy read on public.songs for select to authenticated using (public.is_member());
create policy ins on public.songs for insert to authenticated with check (public.is_member() and (public.is_admin() or (preferred = false and active)));
create policy upd on public.songs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy read on public.service_songs for select to authenticated using (public.is_member());
create policy ins on public.service_songs for insert to authenticated with check (public.can_pick(service_id));
create policy upd on public.service_songs for update to authenticated using (public.can_pick(service_id)) with check (public.can_pick(service_id));
create policy del on public.service_songs for delete to authenticated using (public.can_pick(service_id));
create policy read on public.swaps for select to authenticated using (public.is_member());
create policy read on public.app_settings for select to authenticated using (public.is_member());
create policy ins on public.app_settings for insert to authenticated with check (public.is_admin());
create policy upd on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Email queue. Nothing is queued until emails are switched on.
create function private.queue(p_kind text, p_people uuid[], p_subject text, p_html text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_to text[];
begin
  if coalesce((select value from private.settings where key = 'emails_on'), 'false') <> 'true' then return; end if;
  select array_agg(distinct e.email) into v_to from public.person_emails e join public.people p on p.id = e.person_id
    where p.active and e.person_id = any(p_people);
  if v_to is null then return; end if;
  insert into private.outbox(kind, to_emails, subject, html) values (p_kind, v_to, p_subject, p_html);
end $$;
create function private.site() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value from private.settings where key = 'site_url'), '') $$;
create function private.esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;
create function private.day(d date) returns text language sql immutable as $$ select trim(to_char(d, 'FMDay FMDD FMMonth')) $$;

create function public.request_cover(p_slot uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s record; v_id uuid; v_who text; v_to uuid[];
begin
  select sl.id, sl.person_id, sl.role_id, sl.service_id, sv.date, r.label into s
    from public.slots sl join public.services sv on sv.id = sl.service_id join public.roles r on r.id = sl.role_id where sl.id = p_slot;
  if not found then raise exception 'That roster spot no longer exists'; end if;
  if s.date < (now() at time zone 'Pacific/Auckland')::date then raise exception 'That date has passed'; end if;
  if not (s.person_id in (select public.me_ids()) or public.is_admin()) then raise exception 'Only the person rostered or an admin can ask for cover'; end if;
  if exists (select 1 from public.swaps where slot_id = p_slot and status = 'open') then raise exception 'Cover has already been asked for'; end if;
  insert into public.swaps(slot_id, requested_by, note) values (p_slot, s.person_id, nullif(trim(p_note), '')) returning id into v_id;
  select name into v_who from public.people where id = s.person_id;
  select array_agg(p.id) into v_to from public.people p
    where p.active and p.id <> s.person_id
      and exists (select 1 from public.person_roles pr where pr.person_id = p.id and pr.role_id = s.role_id)
      and not exists (select 1 from public.slots x where x.service_id = s.service_id and x.person_id = p.id)
      and not exists (select 1 from public.away a where a.person_id = p.id and s.date between a.from_date and a.to_date);
  perform private.queue('cover_ask', v_to, 'Can you cover ' || s.label || ' on ' || private.day(s.date) || '?',
    '<p>' || private.esc(v_who) || ' can''t make ' || private.esc(s.label) || ' on ' || private.day(s.date) || '.</p>'
    || case when nullif(trim(p_note), '') is not null then '<p>"' || private.esc(p_note) || '"</p>' else '' end
    || '<p>If you can step in, open the roster and tap "I''ll cover it". First in gets it.</p><p><a href="' || private.site() || '">Open the roster</a></p>');
  return v_id;
end $$;

create function public.take_cover(p_swap uuid, p_as uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s record; v_me uuid; v_name text;
begin
  select sw.id, sw.status, sw.slot_id, sw.requested_by, sl.service_id, sl.role_id, sv.date, r.label into s
    from public.swaps sw join public.slots sl on sl.id = sw.slot_id join public.services sv on sv.id = sl.service_id
    join public.roles r on r.id = sl.role_id where sw.id = p_swap for update of sw;
  if not found then raise exception 'That request no longer exists'; end if;
  if s.status <> 'open' then raise exception 'Someone has already covered this'; end if;
  v_me := coalesce(p_as, (select m from public.me_ids() m limit 1));
  if v_me is null or v_me not in (select public.me_ids()) then raise exception 'Please sign in first'; end if;
  if v_me = s.requested_by then raise exception 'You asked for this cover. Cancel it instead if you can make it after all'; end if;
  if exists (select 1 from public.slots where service_id = s.service_id and role_id = s.role_id and person_id = v_me) then
    raise exception 'You are already on for that'; end if;
  update public.slots set person_id = v_me where id = s.slot_id;
  update public.swaps set status = 'covered', covered_by = v_me, covered_at = now() where id = p_swap;
  select name into v_name from public.people where id = v_me;
  perform private.queue('cover_done', array[v_me, s.requested_by], s.label || ' on ' || private.day(s.date) || ' is covered',
    '<p>' || private.esc(v_name) || ' is now on ' || private.esc(s.label) || ' for ' || private.day(s.date) || '. The roster has been updated.</p><p><a href="' || private.site() || '">Open the roster</a></p>');
end $$;

create function public.cancel_cover(p_swap uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.swaps set status = 'cancelled' where id = p_swap and status = 'open'
    and (requested_by in (select public.me_ids()) or public.is_admin());
  if not found then raise exception 'That request is no longer open'; end if;
end $$;

create function public.confirm_songs(p_service uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sv record; v_list text; v_to uuid[]; v_folder text;
begin
  if not public.can_pick(p_service) then raise exception 'Only the song leader or an admin can confirm the songs'; end if;
  select * into sv from public.services where id = p_service;
  select string_agg('<li>' || private.esc(sg.title) || case when coalesce(ss.key, sg.key) is not null then ' (' || private.esc(coalesce(ss.key, sg.key)) || ')' else '' end
      || case when sg.sheet_url is not null then ' <a href="' || private.esc(sg.sheet_url) || '">music</a>' else '' end || '</li>',
      '' order by ss.bracket, ss.position) into v_list
    from public.service_songs ss join public.songs sg on sg.id = ss.song_id where ss.service_id = p_service;
  if v_list is null then raise exception 'Choose at least one song first'; end if;
  update public.services set songs_confirmed_at = now(), songs_confirmed_by = (select m from public.me_ids() m limit 1) where id = p_service;
  select array_agg(distinct person_id) into v_to from public.slots where service_id = p_service;
  select value into v_folder from public.app_settings where key = 'music_folder_url';
  perform private.queue('songs', v_to, 'Songs for ' || private.day(sv.date) || coalesce(': ' || sv.title, ''),
    '<p>Here are the songs for ' || private.day(sv.date) || coalesce(' (' || private.esc(sv.passage) || ')', '') || '.</p><ol>' || v_list || '</ol>'
    || case when v_folder is not null then '<p><a href="' || private.esc(v_folder) || '">Music folder</a></p>' else '' end
    || '<p><a href="' || private.site() || '">Open the roster</a></p>');
end $$;

-- Runs every hour. Reminders go by New Zealand time, whatever daylight saving is doing.
create function private.hourly() returns void language plpgsql security definer set search_path = '' as $$
declare v_now timestamp := now() at time zone 'Pacific/Auckland'; v_day date := v_now::date;
  v_dow int := extract(isodow from v_now); v_hr int := extract(hour from v_now); sv record; sw record; v_to uuid[]; v_txt text;
begin
  if v_dow = 1 and v_hr = 9 then
    for sv in select * from public.services where date between v_day and v_day + 6 loop
      continue when exists (select 1 from private.marks where kind = 'reminder' and ref = sv.id);
      insert into private.marks values ('reminder', sv.id);
      select array_agg(distinct person_id) into v_to from public.slots where service_id = sv.id;
      select string_agg('<li>' || private.esc(r.label) || ': ' || private.esc(p.name) || '</li>', '' order by r.sort, p.name) into v_txt
        from public.slots sl join public.roles r on r.id = sl.role_id join public.people p on p.id = sl.person_id where sl.service_id = sv.id;
      perform private.queue('reminder', v_to, 'You''re on ' || private.day(sv.date),
        '<p>A reminder that you''re rostered for ' || private.day(sv.date) || coalesce(' (' || private.esc(sv.title) || ')', '') || '.</p><ul>' || coalesce(v_txt, '') || '</ul>'
        || '<p>Can''t make it? Open the roster and tap "I can''t make it" and the site will look for cover.</p><p><a href="' || private.site() || '">Open the roster</a></p>');
    end loop;
  end if;
  if v_dow = 2 and v_hr = 18 then
    for sv in select * from public.services where date between v_day and v_day + 5 and songs_confirmed_at is null loop
      continue when exists (select 1 from private.marks where kind = 'nudge' and ref = sv.id);
      insert into private.marks values ('nudge', sv.id);
      select array_agg(distinct person_id) into v_to from public.slots where service_id = sv.id and role_id in ('lead','chooser');
      if v_to is null then select array_agg(id) into v_to from public.people where active and level in ('admin','webmaster'); end if;
      perform private.queue('nudge', v_to, 'Songs needed for ' || private.day(sv.date),
        '<p>The songs for ' || private.day(sv.date) || ' haven''t been confirmed yet. When you have a moment, choose them and tap Confirm so the team gets the list.</p><p><a href="' || private.site() || '">Choose the songs</a></p>');
    end loop;
  end if;
  for sw in select w.id, r.label, sv2.date, p.name from public.swaps w join public.slots sl on sl.id = w.slot_id
      join public.services sv2 on sv2.id = sl.service_id join public.roles r on r.id = sl.role_id join public.people p on p.id = w.requested_by
      where w.status = 'open' and w.created_at < now() - interval '2 days' and sv2.date >= v_day loop
    continue when exists (select 1 from private.marks where kind = 'cover_flag' and ref = sw.id);
    insert into private.marks values ('cover_flag', sw.id);
    select array_agg(id) into v_to from public.people where active and level in ('admin','webmaster');
    perform private.queue('cover_flag', v_to, 'No cover yet: ' || sw.label || ' on ' || private.day(sw.date),
      '<p>' || private.esc(sw.name) || ' asked for cover on ' || private.esc(sw.label) || ' for ' || private.day(sw.date) || ' two days ago and nobody has picked it up yet.</p><p><a href="' || private.site() || '">Open the roster</a></p>');
  end loop;
end $$;

-- Used only by the mail function (service role).
create function public.signin_check(p_email text) returns boolean language plpgsql security definer set search_path = '' as $$
declare v text := lower(trim(p_email));
begin
  if not exists (select 1 from public.person_emails e join public.people p on p.id = e.person_id where e.email = v and p.active) then return false; end if;
  if (select count(*) from private.signin_log where email = v and at > now() - interval '1 hour') >= 5 then return false; end if;
  insert into private.signin_log(email) values (v);
  return true;
end $$;
create function public.outbox_take() returns table(id bigint, to_emails text[], subject text, html text)
language sql security definer set search_path = '' as $$
  select o.id, o.to_emails, o.subject, o.html from private.outbox o where o.sent_at is null and o.error is null
    and o.created_at > now() - interval '2 days' order by o.id limit 20 $$;
create function public.outbox_done(p_id bigint, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update private.outbox set sent_at = case when p_error is null then now() end, error = p_error where id = p_id $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.me_ids(), public.is_member(), public.is_admin(), public.is_webmaster(), public.can_pick(uuid),
  public.request_cover(uuid, text), public.take_cover(uuid, uuid), public.cancel_cover(uuid), public.confirm_songs(uuid) to authenticated;
grant execute on function public.signin_check(text), public.outbox_take(), public.outbox_done(bigint, text) to service_role;
revoke execute on function public.signin_check(text), public.outbox_take(), public.outbox_done(bigint, text) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
