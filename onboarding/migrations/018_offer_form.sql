-- Offers phase 1: the "Make an offer" form (replaces Tim's Jotform). Additive only. Builds on property_offers (migration 010).
--
-- Buyers have no account. They never touch a table or a database function: the offer-public edge function (fn/offer_public.ts)
-- calls the offer_public_* functions below with the service role, passing the token from the property's link and the caller's
-- network address. Those functions check the token, the link being on, the property's stage and the rate limits, clean and
-- length-cap every field, and write one offer row. From a token a buyer learns only the property's address and whether offers are
-- open (plus the holiday province and the KiwiSaver warning setting, for the date help, Tim's own clause wording, and the chattels
-- list Tim typed for the property).
-- Contact details: the buyer's own email and phone (email, phone, purchasers[].email and .phone) and the lawyer's (lawyer.firm,
-- .person, .email, .phone) are kept as separate fields, because only the lawyers' details ever go on the REINZ form (phase 2).
-- Tim works through the agent_offer_* functions. Vendors have no policy on any of these tables, so they see nothing.
-- Nothing here touches agreements, signatures or their triggers.

-- ───── the per-property link ─────
create table public.offer_links (
  property_id uuid primary key references public.properties(id),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{40,64}$'),
  open boolean not null default false,
  province text not null default 'otago' check (province in ('otago','southland','canterbury','south_canterbury','wellington','auckland','nelson','taranaki','hawkes_bay','marlborough','westland','chatham','none')),
  chattels jsonb not null default '[]'::jsonb check (jsonb_typeof(chattels) = 'array' and jsonb_array_length(chattels) <= 60),   -- the chattels list Tim types for this sale (phase 2 fills it from the blank)
  opened_at timestamptz, closed_at timestamptz, regenerated_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one row of settings for the offer form
create table public.offer_settings (
  id boolean primary key default true check (id),
  ks_warn_working_days integer not null default 15 check (ks_warn_working_days between 1 and 60),
  ai_daily_cap integer not null default 40 check (ai_daily_cap between 0 and 500),
  net_salt text not null default encode(extensions.gen_random_bytes(16), 'hex'),   -- network addresses are only ever stored hashed with this
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.offer_settings (id) values (true);
-- Tim's own clause wording (electrical report, specified technical report, sale of another property, Specified Due Diligence).
-- Empty until Tim adds it; the form then says "Tim will confirm the exact wording with you". The REINZ conditions are never held here.
create table public.offer_clauses (
  key text primary key check (key in ('electrical','technical','sale','sdd')),
  wording text check (wording is null or length(wording) <= 4000),
  updated_by text,
  updated_at timestamptz not null default now()
);
-- a permanent record: link switched on or off, token made again, offers in, corrected, read, withdrawn or lapsed, date gap override
create table public.offer_events (
  id bigserial primary key,
  property_id uuid not null references public.properties(id),
  offer_id uuid references public.property_offers(id),
  at timestamptz not null default now(),
  actor text not null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb
);
create index on public.offer_events (property_id, at desc);
create index on public.offer_events (offer_id);
-- rate limiting for the public door (hashed network address, never the address itself). Kept two days.
create table public.offer_hits (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('info','bad','submit','ai')),
  property_id uuid,
  net text not null
);
create index on public.offer_hits (kind, net, at);
create index on public.offer_hits (kind, property_id, at);
create index on public.offer_hits (at);

-- ───── property_offers: the form's columns ─────
alter table public.property_offers
  add column source text not null default 'manual' check (source in ('manual','buyer','agent')),
  add column submission jsonb,                -- what the buyer (or Tim, for them) sent, never changed
  add column details jsonb,                   -- the offer as it stands now, with Tim's corrections
  add column kiwisaver boolean,
  add column lawyer_approval boolean,
  add column needs_date_help boolean not null default false,
  add column related_party boolean not null default false,
  add column province text,
  add column as_at date,                      -- the day the buyer's dates were counted from (New Zealand date at submission)
  add column read_at timestamptz, add column read_by text,
  add column status_at timestamptz, add column status_by text,
  add column gap_override_reason text check (gap_override_reason is null or length(gap_override_reason) between 5 and 500),
  add column gap_override_by text, add column gap_override_at timestamptz,
  add column net_hash text,
  add column notified_at timestamptz, add column notify_error text;
create index on public.property_offers (read_at) where read_at is null;

-- The form's rows change only through the functions below (each sets offers.fn while it works and clears it before it returns). What was sent never
-- changes, and no offer is ever removed. Rows Tim adds directly under migration 010 ('manual') work as before.
create or replace function public.guard_offer() returns trigger language plpgsql set search_path = public as $$
declare fn boolean := coalesce(current_setting('offers.fn', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'Offers are never removed. Mark it withdrawn or lapsed instead.'; end if;
  if tg_op = 'INSERT' then
    if (new.source <> 'manual' or new.submission is not null or new.details is not null) and not fn then raise exception 'Offers from the form are only added through the form'; end if;
    return new;
  end if;
  if new.submission is distinct from old.submission and old.submission is not null then raise exception 'What the buyer sent is kept as it was'; end if;
  if new.source is distinct from old.source or new.property_id is distinct from old.property_id or new.net_hash is distinct from old.net_hash then raise exception 'That cannot be changed'; end if;
  if old.source <> 'manual' and not fn and (new.details is distinct from old.details or new.amount is distinct from old.amount or new.status is distinct from old.status
      or new.status_at is distinct from old.status_at or new.read_at is distinct from old.read_at or new.gap_override_reason is distinct from old.gap_override_reason
      or new.kiwisaver is distinct from old.kiwisaver or new.related_party is distinct from old.related_party or new.needs_date_help is distinct from old.needs_date_help
      or new.lawyer_approval is distinct from old.lawyer_approval or new.conditions is distinct from old.conditions or new.buyer_ref is distinct from old.buyer_ref
      or new.received_at is distinct from old.received_at or new.as_at is distinct from old.as_at or new.province is distinct from old.province) then
    raise exception 'Offers from the form are changed through the Offers tile, so there is a record';
  end if;
  return new;
end $$;
create trigger guard_offer before insert or update or delete on public.property_offers for each row execute function public.guard_offer();
create or replace function public.guard_offer_event() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Offer records cannot be changed or removed'; end $$;
create trigger guard_offer_event before update or delete on public.offer_events for each row execute function public.guard_offer_event();
create trigger touch_offer_links before update on public.offer_links for each row execute function public.touch_updated();

-- ───── who sees what ─────
alter table public.offer_links enable row level security;
alter table public.offer_settings enable row level security;
alter table public.offer_clauses enable row level security;
alter table public.offer_events enable row level security;
alter table public.offer_hits enable row level security;
create policy ol_agent_read on public.offer_links for select using (public.is_agent());
create policy os_agent_read on public.offer_settings for select using (public.is_agent());
create policy oc_agent_read on public.offer_clauses for select using (public.is_agent());
create policy oe_agent_read on public.offer_events for select using (public.is_agent());
-- offer_hits: no policy at all
revoke all on public.offer_links, public.offer_settings, public.offer_clauses, public.offer_events, public.offer_hits from anon;
revoke insert, update, delete, truncate on public.offer_links, public.offer_settings, public.offer_clauses, public.offer_events, public.offer_hits from authenticated;
revoke all on public.offer_hits from authenticated;
revoke select on public.offer_settings from authenticated;
grant select (id, ks_warn_working_days, ai_daily_cap, updated_by, updated_at) on public.offer_settings to authenticated;   -- never the salt
revoke all on sequence public.offer_events_id_seq, public.offer_hits_id_seq from anon, authenticated;

-- ───── helpers (internal) ─────
create or replace function public.offer_token() returns text language sql volatile set search_path = public as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_') $$;
create or replace function public.offer_stage_ok(p_stage text) returns boolean language sql immutable as $$
  select p_stage in ('signed','live','under_offer') $$;
create or replace function public.offer_net(p_net text) returns text language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(coalesce(nullif(left(trim(p_net), 100), ''), 'unknown') || ':' || (select net_salt from public.offer_settings), 'sha256'), 'hex') $$;
create or replace function public.offer_nz_today() returns date language sql stable as $$ select (now() at time zone 'Pacific/Auckland')::date $$;

-- text from the form: trimmed, control characters removed, null when empty; refused when over the cap
create or replace function public.offer_txt(p jsonb, k text, cap int, need boolean default false, what text default null) returns text language plpgsql immutable set search_path = public as $$
declare v jsonb := p -> k; t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then t := null;
  elsif jsonb_typeof(v) in ('string','number') then t := v #>> '{}';
  else raise exception 'Please check %', coalesce(what, k); end if;
  t := nullif(trim(regexp_replace(coalesce(t, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g')), '');
  if t is not null and length(t) > cap then raise exception 'Please shorten %: % characters at most', coalesce(what, k), cap; end if;
  if need and t is null then raise exception 'Please add %', coalesce(what, k); end if;
  return t;
end $$;
create or replace function public.offer_bool(p jsonb, k text) returns boolean language sql immutable as $$
  select case when jsonb_typeof(p -> k) = 'boolean' then (p ->> k)::boolean end $$;
create or replace function public.offer_email_ok(t text) returns boolean language sql immutable as $$ select t is null or t ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$' $$;
create or replace function public.offer_phone_ok(t text) returns boolean language sql immutable as $$ select t is null or t ~ '^[0-9+()\-. ]{6,40}$' $$;
-- a date from the form: a real date, from today (for Tim correcting an older offer, from 90 days ago) to three years ahead
create or replace function public.offer_date(t text, what text, p_agent boolean default false) returns date language plpgsql stable set search_path = public as $$
declare d date;
begin
  if t is null then return null; end if;
  if t !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Please check the date for %', what; end if;
  begin d := t::date; exception when others then raise exception 'Please check the date for %', what; end;
  if d < public.offer_nz_today() - (case when p_agent then 90 else 0 end) or d > public.offer_nz_today() + 1100 then raise exception 'The date for % needs to be from today to three years ahead', what; end if;
  return d;
end $$;
create or replace function public.offer_int(p jsonb, k text, lo int, hi int, what text) returns int language plpgsql immutable as $$
declare v jsonb := p -> k; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '') then return null; end if;
  begin n := (v #>> '{}')::numeric; exception when others then raise exception 'Please check %', what; end;
  if n <> trunc(n) or n < lo or n > hi then raise exception 'Please check % (% to %)', what, lo, hi; end if;
  return n::int;
end $$;

-- The whole offer, cleaned: only known fields, every one checked and capped. Anything else in what was sent is dropped.
-- p_agent: Tim entering it for a buyer (their email may be missing).
create or replace function public.offer_clean(p jsonb, p_agent boolean default false) returns jsonb language plpgsql stable set search_path = public as $$
declare
  out jsonb := '{}'::jsonb; t text; s jsonb; c jsonb; cs jsonb := '[]'::jsonb; ps jsonb := '[]'::jsonb; pr jsonb; seen text[] := '{}'; k text; n int; d date; price numeric; law jsonb := '{}'::jsonb; lt text;
  keys text[] := array['builders','finance','lim','lawyer','electrical','technical','toxicology','oia','land_act','sale','sdd','custom'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing was sent'; end if;
  if length(p::text) > 60000 then raise exception 'That is more than the form can take'; end if;
  t := public.offer_txt(p, 'email', 254, not p_agent, 'your email'); if not public.offer_email_ok(t) then raise exception 'Please check your email address'; end if; out := out || jsonb_build_object('email', lower(t));
  t := public.offer_txt(p, 'phone', 40, not p_agent, 'your phone number'); if not public.offer_phone_ok(t) then raise exception 'Please check your phone number'; end if; out := out || jsonb_build_object('phone', t);
  t := public.offer_txt(p, 'seen_docs', 3, true, 'whether you have seen the property documents'); if t not in ('yes','no') then raise exception 'Please check whether you have seen the property documents'; end if; out := out || jsonb_build_object('seen_docs', t);
  t := public.offer_txt(p, 'sign', 9, true, 'how you would like to sign'); if t not in ('digital','in_person') then raise exception 'Please choose how you would like to sign'; end if; out := out || jsonb_build_object('sign', t);
  t := regexp_replace(coalesce(public.offer_txt(p, 'price', 30, true, 'your offer price'), ''), '[$, ]', '', 'g');
  if t !~ '^\d{1,10}(\.\d{1,2})?$' then raise exception 'Please check your offer price'; end if;
  price := t::numeric; if price < 1 or price > 1000000000 then raise exception 'Please check your offer price'; end if; out := out || jsonb_build_object('price', price);
  -- settlement: so many working days after confirmation, or a date
  s := p -> 'settlement'; if s is null or jsonb_typeof(s) <> 'object' then raise exception 'Please choose your settlement date'; end if;
  t := public.offer_txt(s, 'kind', 10, true, 'the settlement date');
  if t = 'relative' then n := public.offer_int(s, 'days', 1, 250, 'the settlement working days'); if n is null then raise exception 'Please add the settlement working days'; end if; out := out || jsonb_build_object('settlement', jsonb_build_object('kind', 'relative', 'days', n));
  elsif t = 'date' then d := public.offer_date(public.offer_txt(s, 'date', 10, true, 'settlement'), 'settlement', p_agent); out := out || jsonb_build_object('settlement', jsonb_build_object('kind', 'date', 'date', d));
  else raise exception 'Please choose your settlement date'; end if;
  -- conditions
  if p ? 'conditions' and jsonb_typeof(p -> 'conditions') <> 'array' then raise exception 'Please check the conditions'; end if;
  if jsonb_array_length(coalesce(p -> 'conditions', '[]')) > 12 then raise exception 'Please check the conditions'; end if;
  for c in select * from jsonb_array_elements(coalesce(p -> 'conditions', '[]')) loop
    if jsonb_typeof(c) <> 'object' then raise exception 'Please check the conditions'; end if;
    k := public.offer_txt(c, 'key', 20, true, 'the condition');
    if not (k = any(keys)) or k = any(seen) then raise exception 'Please check the conditions'; end if; seen := seen || k;
    s := jsonb_build_object('key', k);
    n := public.offer_int(c, 'days', 1, 250, 'the working days for a condition');
    d := public.offer_date(public.offer_txt(c, 'date', 10, false, 'a condition'), 'a condition', p_agent);
    if n is null and d is null then raise exception 'Please add the working days or a date for each condition'; end if;
    if d is not null then s := s || jsonb_build_object('date', d); else s := s || jsonb_build_object('days', n); end if;
    if k = 'technical' then s := s || jsonb_build_object('detail', public.offer_txt(c, 'detail', 300, true, 'the kind of technical report')); end if;
    if k = 'custom' then
      s := s || jsonb_strip_nulls(jsonb_build_object('wording', public.offer_txt(c, 'wording', 2000, false, 'your condition'), 'request', public.offer_txt(c, 'request', 600, false, 'your description'), 'ai', coalesce(public.offer_bool(c, 'ai'), false)));
      if s ->> 'wording' is null and s ->> 'request' is null then raise exception 'Please describe your own condition, or untick it'; end if;
    end if;
    cs := cs || jsonb_build_array(s);
  end loop;
  out := out || jsonb_build_object('conditions', cs, 'lawyer_approval', 'lawyer' = any(seen));
  t := public.offer_txt(p, 'sale_address', 300, 'sale' = any(seen), 'the address of the property you need to sell');
  out := out || jsonb_build_object('sale_address', case when 'sale' = any(seen) then t end);
  if public.offer_bool(p, 'kiwisaver') is null then raise exception 'Please answer the KiwiSaver question'; end if;
  out := out || jsonb_build_object('kiwisaver', public.offer_bool(p, 'kiwisaver'));
  out := out || jsonb_build_object('entity', public.offer_txt(p, 'entity', 200, false, 'the company or trust name'), 'nominee', coalesce(public.offer_bool(p, 'nominee'), true));
  -- purchasers: at least one, as many as needed up to 12 here
  if jsonb_typeof(p -> 'purchasers') is distinct from 'array' or jsonb_array_length(p -> 'purchasers') < 1 then raise exception 'Please add at least one purchaser'; end if;
  if jsonb_array_length(p -> 'purchasers') > 12 then raise exception 'Up to 12 purchasers can be added here. Tim can add more.'; end if;
  for pr in select * from jsonb_array_elements(p -> 'purchasers') loop
    if jsonb_typeof(pr) <> 'object' then raise exception 'Please check the purchasers'; end if;
    s := jsonb_build_object('first', public.offer_txt(pr, 'first', 120, true, 'each purchaser''s legal first names'), 'last', public.offer_txt(pr, 'last', 120, true, 'each purchaser''s last name'),
      'email', lower(public.offer_txt(pr, 'email', 254, false, 'a purchaser''s email')), 'phone', public.offer_txt(pr, 'phone', 40, false, 'a purchaser''s phone'));
    if not public.offer_email_ok(s ->> 'email') then raise exception 'Please check each purchaser''s email'; end if;
    if not public.offer_phone_ok(s ->> 'phone') then raise exception 'Please check each purchaser''s phone number'; end if;
    ps := ps || jsonb_build_array(s);
  end loop;
  out := out || jsonb_build_object('purchasers', ps, 'comments', public.offer_txt(p, 'comments', 3000, false, 'your comments'));
  -- chattels the buyer wants added, and any expressly excluded: free-text rows
  foreach k in array array['chattels_add', 'chattels_exclude'] loop
    if p ? k and jsonb_typeof(p -> k) not in ('array', 'null') then raise exception 'Please check the chattels'; end if;
    if jsonb_array_length(coalesce(nullif(p -> k, 'null'::jsonb), '[]')) > 30 then raise exception 'Up to 30 chattels can be listed here. Tim can add more.'; end if;
    s := '[]'::jsonb;
    for c in select * from jsonb_array_elements(coalesce(nullif(p -> k, 'null'::jsonb), '[]')) loop
      t := public.offer_txt(jsonb_build_object('x', c), 'x', 200, false, 'each chattel');
      if t is not null then s := s || jsonb_build_array(t); end if;
    end loop;
    out := out || jsonb_build_object(k, s);
  end loop;
  -- GST: only when they say they are registered for this purchase
  if p ? 'gst_registered' and jsonb_typeof(p -> 'gst_registered') not in ('boolean', 'null') then raise exception 'Please check the GST answer'; end if;
  out := out || jsonb_build_object('gst_registered', public.offer_bool(p, 'gst_registered'),
    'gst_number', case when public.offer_bool(p, 'gst_registered') then public.offer_txt(p, 'gst_number', 40, false, 'the GST number') end);
  if p ? 'lawyer' and jsonb_typeof(p -> 'lawyer') = 'object' then
    law := jsonb_build_object('firm', public.offer_txt(p -> 'lawyer', 'firm', 200, false, 'the law firm'), 'person', public.offer_txt(p -> 'lawyer', 'person', 200, false, 'your lawyer''s name'),
      'email', lower(public.offer_txt(p -> 'lawyer', 'email', 254, false, 'your lawyer''s email')), 'phone', public.offer_txt(p -> 'lawyer', 'phone', 40, false, 'your lawyer''s phone'));
    if not public.offer_email_ok(law ->> 'email') then raise exception 'Please check your lawyer''s email'; end if;
    if not public.offer_phone_ok(law ->> 'phone') then raise exception 'Please check your lawyer''s phone number'; end if;
  elsif p ? 'lawyer' and jsonb_typeof(p -> 'lawyer') <> 'null' then raise exception 'Please check your lawyer''s details'; end if;
  out := out || jsonb_build_object('lawyer', law);
  if public.offer_bool(p, 'related') is null then raise exception 'Please answer whether any purchaser is connected with Tim or McGuire Real Estate'; end if;
  out := out || jsonb_build_object('related', public.offer_bool(p, 'related'), 'date_help', coalesce(public.offer_bool(p, 'date_help'), false));
  if public.offer_bool(p, 'privacy') is not true then raise exception 'Please read and tick the privacy note'; end if;
  out := out || jsonb_build_object('privacy', true, 'v', 1);
  return out;
end $$;

-- a short label and condition line for lists (data, shown escaped)
create or replace function public.offer_label(d jsonb) returns text language sql immutable as $$
  select left(coalesce(nullif(d ->> 'entity', ''), (select string_agg(trim(coalesce(x ->> 'first', '') || ' ' || coalesce(x ->> 'last', '')), ', ') from jsonb_array_elements(coalesce(d -> 'purchasers', '[]')) x)), 200) $$;
create or replace function public.offer_cond_line(d jsonb) returns text language sql immutable as $$
  select coalesce((select string_agg(x ->> 'key', ', ') from jsonb_array_elements(coalesce(d -> 'conditions', '[]')) x), '') $$;

-- how many hits of a kind in the last so long
create or replace function public.offer_hit_count(p_kind text, p_net text, p_property uuid, p_since interval) returns int language sql stable set search_path = public as $$
  select count(*)::int from public.offer_hits h where h.kind = p_kind and h.at > now() - p_since and (p_net is null or h.net = p_net) and (p_property is null or h.property_id = p_property) $$;

-- the link a token names, if it is on and the property is at a stage that takes offers
create or replace function public.offer_link_live(p_token text) returns public.offer_links language sql stable set search_path = public as $$
  select l.* from public.offer_links l join public.properties p on p.id = l.property_id
   where p_token ~ '^[A-Za-z0-9_-]{40,64}$' and l.token = p_token and l.open and public.offer_stage_ok(p.stage) $$;

-- ───── the public door (service role only: the offer-public edge function) ─────
-- What the page may learn from a token. Unknown, off and wrong-stage links all answer the same: {ok: false}.
create or replace function public.offer_public_info(p_token text, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); l public.offer_links; addr text; w jsonb;
begin
  if public.offer_hit_count('bad', n, null, interval '1 hour') >= 30 or public.offer_hit_count('info', n, null, interval '1 hour') >= 120 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  l := public.offer_link_live(p_token);
  if l.property_id is null then insert into public.offer_hits (kind, net) values ('bad', n); return jsonb_build_object('ok', false); end if;
  insert into public.offer_hits (kind, net, property_id) values ('info', n, l.property_id);
  select address into addr from public.properties where id = l.property_id;
  select coalesce(jsonb_object_agg(key, wording) filter (where wording is not null), '{}'::jsonb) into w from public.offer_clauses;
  return jsonb_build_object('ok', true, 'open', true, 'address', addr, 'province', l.province, 'ks_days', (select ks_warn_working_days from public.offer_settings), 'wording', w, 'chattels', l.chattels);
end $$;

-- An offer from the buyer's form. Returns {ok, id, ref, address} or {ok: false, reason}. Bad input raises with a plain message.
create or replace function public.offer_public_submit(p_token text, p_offer jsonb, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); l public.offer_links; d jsonb; oid uuid; addr text;
begin
  delete from public.offer_hits where at < now() - interval '2 days';
  if public.offer_hit_count('bad', n, null, interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  l := public.offer_link_live(p_token);
  if l.property_id is null then insert into public.offer_hits (kind, net) values ('bad', n); return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if public.offer_hit_count('submit', n, null, interval '10 minutes') >= 3 or public.offer_hit_count('submit', n, null, interval '1 day') >= 10
     or public.offer_hit_count('submit', null, l.property_id, interval '10 minutes') >= 6 or public.offer_hit_count('submit', null, l.property_id, interval '1 day') >= 30
     or public.offer_hit_count('submit', null, null, interval '1 day') >= 150 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  d := public.offer_clean(p_offer, false) || jsonb_build_object('chattels_listed', l.chattels);   -- raises on anything wrong; the chattels list shown comes from the link, never the page
  insert into public.offer_hits (kind, net, property_id) values ('submit', n, l.property_id);
  perform set_config('offers.fn', 'on', true);
  insert into public.property_offers (property_id, buyer_ref, amount, conditions, status, entered_by, source, submission, details, kiwisaver, lawyer_approval, needs_date_help, related_party, province, as_at, net_hash)
  values (l.property_id, public.offer_label(d), (d ->> 'price')::numeric, public.offer_cond_line(d), 'received', 'buyer form', 'buyer', d, d, (d ->> 'kiwisaver')::boolean, (d ->> 'lawyer_approval')::boolean,
          (d ->> 'date_help')::boolean, (d ->> 'related')::boolean, l.province, public.offer_nz_today(), n)
  returning id into oid;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (l.property_id, oid, 'buyer form', 'submitted', jsonb_build_object('source', 'buyer'));
  select address into addr from public.properties where id = l.property_id;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'id', oid, 'ref', upper(left(replace(oid::text, '-', ''), 8)), 'address', addr);
end $$;

-- May the AI help word a custom condition now? Records the try. {ok, property_id} or {ok: false, reason}.
create or replace function public.offer_public_ai_claim(p_token text, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); l public.offer_links; cap int;
begin
  if public.offer_hit_count('bad', n, null, interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  l := public.offer_link_live(p_token);
  if l.property_id is null then insert into public.offer_hits (kind, net) values ('bad', n); return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  select ai_daily_cap into cap from public.offer_settings;
  if public.offer_hit_count('ai', null, null, interval '1 day') >= cap then return jsonb_build_object('ok', false, 'reason', 'cap'); end if;
  if public.offer_hit_count('ai', n, null, interval '1 hour') >= 5 or public.offer_hit_count('ai', n, null, interval '1 day') >= 12
     or public.offer_hit_count('ai', null, l.property_id, interval '1 hour') >= 8 or public.offer_hit_count('ai', null, l.property_id, interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  insert into public.offer_hits (kind, net, property_id) values ('ai', n, l.property_id);
  return jsonb_build_object('ok', true, 'property_id', l.property_id);
end $$;

-- after the email to Tim
create or replace function public.offer_public_notified(p_offer uuid, p_error text) returns void language sql security definer set search_path = public as $$
  update public.property_offers set notified_at = case when p_error is null then now() end, notify_error = left(p_error, 500) where id = p_offer and source = 'buyer' $$;

-- ───── Tim's side ─────
create or replace function public.offer_agent() returns text language plpgsql stable security definer set search_path = public as $$
begin if not public.is_agent() then raise exception 'Only Tim can do this'; end if; return coalesce(auth.jwt() ->> 'email', 'agent'); end $$;

-- the link: get (made, switched off, the first time), open, close, regenerate, or set the holiday province
create or replace function public.agent_offer_link(p_property uuid, p_action text, p_province text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); l public.offer_links; st text;
begin
  select stage into st from public.properties where id = p_property; if st is null then raise exception 'No such property'; end if;
  select * into l from public.offer_links where property_id = p_property for update;
  if l.property_id is null then
    insert into public.offer_links (property_id, token, province, updated_by) values (p_property, public.offer_token(), coalesce(p_province, 'otago'), me) returning * into l;
    insert into public.offer_events (property_id, actor, kind, detail) values (p_property, me, 'link_made', jsonb_build_object('province', l.province));
  end if;
  if p_action = 'get' then null;
  elsif p_action = 'open' then
    if not public.offer_stage_ok(st) then raise exception 'Offers open once the agreement is signed and the property is on the market (now: %)', st; end if;
    if not l.open then update public.offer_links set open = true, opened_at = now(), updated_by = me where property_id = p_property returning * into l; insert into public.offer_events (property_id, actor, kind) values (p_property, me, 'link_opened'); end if;
  elsif p_action = 'close' then
    if l.open then update public.offer_links set open = false, closed_at = now(), updated_by = me where property_id = p_property returning * into l; insert into public.offer_events (property_id, actor, kind) values (p_property, me, 'link_closed'); end if;
  elsif p_action = 'regenerate' then
    update public.offer_links set token = public.offer_token(), regenerated_at = now(), updated_by = me where property_id = p_property returning * into l;
    insert into public.offer_events (property_id, actor, kind) values (p_property, me, 'link_regenerated');
  elsif p_action = 'province' then
    update public.offer_links set province = p_province, updated_by = me where property_id = p_property returning * into l;
    insert into public.offer_events (property_id, actor, kind, detail) values (p_property, me, 'link_province', jsonb_build_object('province', p_province));
  else raise exception 'Unknown action'; end if;
  return jsonb_build_object('property_id', l.property_id, 'token', l.token, 'open', l.open, 'live', l.open and public.offer_stage_ok(st), 'province', l.province, 'stage', st);
end $$;

-- Tim fills the form in for a buyer (no link or limits needed)
create or replace function public.agent_offer_add(p_property uuid, p_offer jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); d jsonb; oid uuid; prov text;
begin
  perform set_config('offers.fn', 'on', true);
  if not exists (select 1 from public.properties where id = p_property) then raise exception 'No such property'; end if;
  d := public.offer_clean(p_offer, true) || jsonb_build_object('chattels_listed', coalesce((select chattels from public.offer_links where property_id = p_property), '[]'::jsonb));
  select province into prov from public.offer_links where property_id = p_property;
  insert into public.property_offers (property_id, buyer_ref, amount, conditions, status, entered_by, source, submission, details, kiwisaver, lawyer_approval, needs_date_help, related_party, province, as_at, read_at, read_by)
  values (p_property, public.offer_label(d), (d ->> 'price')::numeric, public.offer_cond_line(d), 'received', me, 'agent', d, d, (d ->> 'kiwisaver')::boolean, (d ->> 'lawyer_approval')::boolean,
          (d ->> 'date_help')::boolean, (d ->> 'related')::boolean, coalesce(prov, 'otago'), public.offer_nz_today(), now(), me)
  returning id into oid;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (p_property, oid, me, 'submitted', jsonb_build_object('source', 'agent'));
  perform set_config('offers.fn', '', true);
  return oid;
end $$;

-- Tim corrects an offer (often a tweak by phone). What was sent stays as it was; the change and its note are recorded.
create or replace function public.agent_offer_correct(p_offer uuid, p_details jsonb, p_note text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; d jsonb;
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 or length(p_note) > 500 then raise exception 'Say what changed and how you heard (3 to 500 characters)'; end if;
  d := public.offer_clean(p_details, true) || jsonb_build_object('chattels_listed', coalesce(o.details -> 'chattels_listed', '[]'::jsonb));
  update public.property_offers set details = d, amount = (d ->> 'price')::numeric, conditions = public.offer_cond_line(d), buyer_ref = public.offer_label(d), kiwisaver = (d ->> 'kiwisaver')::boolean,
    lawyer_approval = (d ->> 'lawyer_approval')::boolean, needs_date_help = (d ->> 'date_help')::boolean, related_party = (d ->> 'related')::boolean where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, 'corrected', jsonb_build_object('note', trim(p_note), 'before', o.details, 'after', d));
  perform set_config('offers.fn', '', true);
  return d;
end $$;

-- withdrawn or lapsed, with the time it happened (or back to received)
create or replace function public.agent_offer_status(p_offer uuid, p_status text, p_at timestamptz, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; at_ timestamptz := coalesce(p_at, now());
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if p_status not in ('withdrawn','lapsed','received') then raise exception 'Choose withdrawn or lapsed'; end if;
  if at_ > now() + interval '5 minutes' or at_ < o.received_at - interval '1 minute' then raise exception 'The time needs to be between when the offer came in and now'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  update public.property_offers set status = p_status, status_at = case when p_status = 'received' then null else at_ end, status_by = me where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, 'status', jsonb_build_object('from', o.status, 'to', p_status, 'at', at_, 'note', nullif(trim(coalesce(p_note, '')), '')));
  perform set_config('offers.fn', '', true);
end $$;

create or replace function public.agent_offer_read(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers;
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if o.read_at is null then update public.property_offers set read_at = now(), read_by = me where id = p_offer; insert into public.offer_events (property_id, offer_id, actor, kind) values (o.property_id, p_offer, me, 'read'); end if;
  perform set_config('offers.fn', '', true);
end $$;

-- Tim accepts dates that break the one-week gap, with his reason (null clears it). Both are recorded.
create or replace function public.agent_offer_gap(p_offer uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; r text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if r is not null and (length(r) < 5 or length(r) > 500) then raise exception 'Give your reason (5 to 500 characters)'; end if;
  update public.property_offers set gap_override_reason = r, gap_override_by = case when r is null then null else me end, gap_override_at = case when r is null then null else now() end where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, case when r is null then 'gap_override_cleared' else 'gap_override' end, jsonb_build_object('reason', r));
  perform set_config('offers.fn', '', true);
end $$;

-- the chattels list buyers see for this property (Tim types or edits it; phase 2 will fill it from the blank)
create or replace function public.agent_offer_chattels(p_property uuid, p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); x jsonb; t text; items jsonb := '[]'::jsonb; before jsonb;
begin
  if not exists (select 1 from public.properties where id = p_property) then raise exception 'No such property'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 60 then raise exception 'Up to 60 chattels'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    t := public.offer_txt(jsonb_build_object('x', x), 'x', 200, false, 'each chattel'); if t is not null then items := items || jsonb_build_array(t); end if;
  end loop;
  perform public.agent_offer_link(p_property, 'get');
  select chattels into before from public.offer_links where property_id = p_property;
  update public.offer_links set chattels = items, updated_by = me where property_id = p_property;
  insert into public.offer_events (property_id, actor, kind, detail) values (p_property, me, 'chattels', jsonb_build_object('before', before, 'after', items));
  return items;
end $$;

create or replace function public.agent_offer_settings(p_ks_days int) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent();
begin
  if p_ks_days is null or p_ks_days < 1 or p_ks_days > 60 then raise exception 'Choose 1 to 60 working days'; end if;
  update public.offer_settings set ks_warn_working_days = p_ks_days, updated_by = me, updated_at = now();
end $$;

-- Tim's own wording for one of his clauses (null clears it), kept in offer_clauses with who changed it and when.
create or replace function public.agent_offer_clause(p_key text, p_wording text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); w text := nullif(trim(coalesce(p_wording, '')), '');
begin
  if p_key not in ('electrical','technical','sale','sdd') then raise exception 'Only your own clauses are held here'; end if;
  if length(w) > 4000 then raise exception 'That wording is too long (4,000 characters at most)'; end if;
  insert into public.offer_clauses (key, wording, updated_by, updated_at) values (p_key, w, me, now())
    on conflict (key) do update set wording = excluded.wording, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

-- ───── execute rights ─────
revoke execute on function public.offer_token(), public.offer_stage_ok(text), public.offer_net(text), public.offer_nz_today(), public.offer_txt(jsonb, text, int, boolean, text), public.offer_bool(jsonb, text),
  public.offer_email_ok(text), public.offer_phone_ok(text), public.offer_date(text, text, boolean), public.offer_int(jsonb, text, int, int, text), public.offer_clean(jsonb, boolean), public.offer_label(jsonb),
  public.offer_cond_line(jsonb), public.offer_hit_count(text, text, uuid, interval), public.offer_link_live(text), public.offer_agent(), public.guard_offer(), public.guard_offer_event() from public, anon, authenticated;
revoke execute on function public.offer_public_info(text, text), public.offer_public_submit(text, jsonb, text), public.offer_public_ai_claim(text, text), public.offer_public_notified(uuid, text) from public, anon, authenticated;
grant execute on function public.offer_public_info(text, text), public.offer_public_submit(text, jsonb, text), public.offer_public_ai_claim(text, text), public.offer_public_notified(uuid, text) to service_role;
revoke execute on function public.agent_offer_link(uuid, text, text), public.agent_offer_add(uuid, jsonb), public.agent_offer_correct(uuid, jsonb, text), public.agent_offer_status(uuid, text, timestamptz, text),
  public.agent_offer_read(uuid), public.agent_offer_gap(uuid, text), public.agent_offer_settings(int), public.agent_offer_clause(text, text), public.agent_offer_chattels(uuid, jsonb) from public, anon;
grant execute on function public.agent_offer_link(uuid, text, text), public.agent_offer_add(uuid, jsonb), public.agent_offer_correct(uuid, jsonb, text), public.agent_offer_status(uuid, text, timestamptz, text),
  public.agent_offer_read(uuid), public.agent_offer_gap(uuid, text), public.agent_offer_settings(int), public.agent_offer_clause(text, text), public.agent_offer_chattels(uuid, jsonb) to authenticated;
