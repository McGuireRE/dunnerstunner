-- 034: appraisal comparables, photos, the comparables rule's never-mix list and the shared Dunedin market store (LW3 phase C,
-- APPRAISAL-PLAN.md), with two safety fixes from the phase A review. Additive only: five new tables, one new private storage bucket
-- with agent-only policies, new functions and triggers. One function is replaced with the same signature (agent_appraisal_create:
-- the same rules, plus near-duplicate addresses). No existing column, row, policy or signed-record protection is changed or weakened.
--
--   appraisal_comps    one comparable on one appraisal: sold, on the market (listed) or for context only; price, dates, method, days
--                      to sell, figures, agency, sold by Tim, the advertisement wording (quoted data), how it compares (with a ticked
--                      flag: only ticked wording reaches a vendor), Tim's private note (never on a vendor page), ring and distance,
--                      source, link and the date it was gathered, shown or hidden, and its order.
--   appraisal_media    photos per comparable, stored in the private bucket appraisal-media under appraisals/<appraisal>/comps/<comp>/.
--   suburb_groups      Tim's never-mix list for the comparables rule (a group of suburbs whose sales are never mixed with others).
--   market_months      the shared monthly market store (Dunedin and any suburb): median with its spread, sales, days to sell and
--                      price bands. Shared by every appraisal that month and by the Quarterly market update.
--   market_sales       individual REINZ sales. The suburb and price are public; the address is Tim's only (no vendor ever reads
--                      this table; a later vendor view leaves the address out).
--
-- Packs: agent_comps_import reads the "mre.comps/1" pack and agent_market_import the "mre.market/1" pack (APPRAISAL-PLAN.md has both).
-- Text from a listing is data only: it is stored as plain text, never read as an instruction, and drawn escaped.
--
-- Safety fixes from the phase A review:
--   (a) guard_appraisal_view, on appraisal_views: a row whose status is 'sent' never changes and is never removed; 'sent' is set only
--       by phase E's send function (it sets app.appraisal_send for its own transaction); and the wording guard (no "as is", fee or
--       commission) runs on every insert, and on every update of title, sections, fields or setup, so the direct update the 032
--       policy allows is guarded too. Private notes are Tim's own and are not checked.
--   (b) agent_appraisal_create treats "Rd"/"Road", "St"/"Street", extra commas and a missing suburb or postcode as the same address
--       when the number and street match a property on file in the same suburb (or when no suburb is given), and asks Tim to choose
--       that property. Different streets, numbers or suburbs stay apart.
--
-- Row Level Security on every new table, agent only (is_agent()). Vendors and anon get nothing (vendor views come in phase E).
-- Every function checks is_agent() where it is called by a person, sets its search_path, and is revoked from public and anon.

-- ═══════════════ the comparables ═══════════════
create table public.appraisal_comps (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  position integer not null default 0,
  shown boolean not null default true,
  status text not null default 'sold' check (status in ('sold', 'listed', 'context')),
  address text not null check (length(btrim(address)) between 3 and 300),
  suburb text not null default '' check (length(suburb) <= 100),
  price integer check (price > 0 and price < 1000000000),
  sold_on date,
  listed_on date,
  method text not null default '' check (length(method) <= 100),
  days_to_sell integer check (days_to_sell between 0 and 3650),
  bedrooms integer check (bedrooms between 0 and 50),
  bathrooms numeric(4,1) check (bathrooms between 0 and 50),
  floor_m2 numeric(10,1) check (floor_m2 > 0 and floor_m2 < 100000),
  land_m2 numeric(12,1) check (land_m2 > 0 and land_m2 < 100000000),
  cv integer check (cv > 0 and cv < 1000000000),
  agency text not null default '' check (length(agency) <= 150),
  sold_by_tim boolean not null default false,
  ad_text text not null default '' check (length(ad_text) <= 8000),
  compare_text text not null default '' check (length(compare_text) <= 4000),
  compare_ticked boolean not null default false,
  private_note text not null default '' check (length(private_note) <= 4000),
  ring text check (ring in ('suburb', '750m', '1500m', 'further')),
  distance_m integer check (distance_m between 0 and 1000000),
  source text not null default 'tim' check (source in ('reinz', 'relab', 'listing', 'tim', 'other')),
  source_ref text check (length(source_ref) between 1 and 200),
  source_url text check (source_url ~ '^https://' and length(source_url) <= 1000),
  gathered_at timestamptz,
  photo_hints jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_hints) = 'array'),
  created_by text not null default coalesce(auth.jwt()->>'email', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appraisal_comps_appraisal_idx on public.appraisal_comps (appraisal_id, position);
create unique index appraisal_comps_ref_idx on public.appraisal_comps (appraisal_id, source, source_ref) where source_ref is not null;

-- ═══════════════ photos per comparable ═══════════════
create table public.appraisal_media (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  comp_id uuid references public.appraisal_comps(id) on delete cascade,
  path text not null unique check (length(path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  mime_type text,
  size_bytes bigint,
  width integer check (width > 0),
  height integer check (height > 0),
  position integer not null default 0,
  cover boolean not null default false,
  source text not null default 'upload' check (source in ('upload', 'folder', 'url')),
  source_url text check (source_url ~ '^https://' and length(source_url) <= 1000),
  created_by text not null default coalesce(auth.jwt()->>'email', ''),
  created_at timestamptz not null default now()
);
create index appraisal_media_comp_idx on public.appraisal_media (comp_id, position);
create index appraisal_media_appraisal_idx on public.appraisal_media (appraisal_id);

-- ═══════════════ the never-mix list ═══════════════
create table public.suburb_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'never_mix' check (kind in ('never_mix')),
  suburbs text[] not null check (cardinality(suburbs) between 1 and 40),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════ the shared market store ═══════════════
create table public.market_months (
  id uuid primary key default gen_random_uuid(),
  area text not null check (length(btrim(area)) between 1 and 100),
  month date not null check (extract(day from month) = 1),
  median integer check (median > 0),
  lower_quartile integer check (lower_quartile > 0),
  upper_quartile integer check (upper_quartile > 0),
  sales integer check (sales >= 0),
  days_to_sell integer check (days_to_sell between 0 and 3650),
  bands jsonb not null default '[]'::jsonb check (jsonb_typeof(bands) = 'array'),
  source text not null default 'reinz' check (source in ('reinz', 'other')),
  source_url text check (source_url ~ '^https://' and length(source_url) <= 1000),
  gathered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area, month),
  check (lower_quartile is null or median is null or lower_quartile <= median),
  check (upper_quartile is null or median is null or median <= upper_quartile)
);
create table public.market_sales (
  id uuid primary key default gen_random_uuid(),
  suburb text not null check (length(btrim(suburb)) between 1 and 100),
  sold_on date not null,
  price integer not null check (price > 0 and price < 1000000000),
  address text not null default '' check (length(address) <= 300),
  bedrooms integer check (bedrooms between 0 and 50),
  bathrooms numeric(4,1) check (bathrooms between 0 and 50),
  floor_m2 numeric(10,1) check (floor_m2 > 0 and floor_m2 < 100000),
  land_m2 numeric(12,1) check (land_m2 > 0 and land_m2 < 100000000),
  property_type text not null default '' check (length(property_type) <= 60),
  days_to_sell integer check (days_to_sell between 0 and 3650),
  source text not null default 'reinz' check (source in ('reinz', 'other')),
  source_ref text check (length(source_ref) between 1 and 200),
  gathered_at timestamptz not null default now(),
  unique (source, source_ref)
);
create index market_sales_suburb_idx on public.market_sales (suburb, sold_on);

-- ═══════════════ Row Level Security: Tim only, on every new table ═══════════════
alter table public.appraisal_comps enable row level security;
alter table public.appraisal_media enable row level security;
alter table public.suburb_groups enable row level security;
alter table public.market_months enable row level security;
alter table public.market_sales enable row level security;
create policy appraisal_comps_agent on public.appraisal_comps for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy appraisal_media_agent on public.appraisal_media for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy suburb_groups_agent on public.suburb_groups for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy market_months_agent on public.market_months for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy market_sales_agent on public.market_sales for all to authenticated using (public.is_agent()) with check (public.is_agent());
revoke all on public.appraisal_comps, public.appraisal_media, public.suburb_groups, public.market_months, public.market_sales from anon;
revoke truncate, trigger, references on public.appraisal_comps, public.appraisal_media, public.suburb_groups, public.market_months, public.market_sales from authenticated;

create trigger appraisal_comps_touch before update on public.appraisal_comps for each row execute function public.touch_updated();
create trigger suburb_groups_touch before update on public.suburb_groups for each row execute function public.touch_updated();
create trigger market_months_touch before update on public.market_months for each row execute function public.touch_updated();

-- ═══════════════ (a) a sent appraisal never changes; the wording guard on every write ═══════════════
create function public.guard_appraisal_view() returns trigger
language plpgsql security definer set search_path = public as $$
declare prob text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'sent' then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.status = 'sent' and coalesce(current_setting('app.appraisal_send', true), '') <> 'on' then
    raise exception 'An appraisal is marked sent only by sending it';
  end if;
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.sections is distinct from old.sections
     or new.fields is distinct from old.fields or new.setup is distinct from old.setup then
    prob := public.appraisal_wording_problem(jsonb_build_array(new.title, new.sections, new.fields, new.setup));
    if prob <> '' then raise exception '%', prob; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_view() from public, anon, authenticated;
create trigger appraisal_views_guard before insert or update or delete on public.appraisal_views for each row execute function public.guard_appraisal_view();

-- the comparables and photos of a sent appraisal never change either; a comparable stays on its appraisal; Tim's wording (how it
-- compares, the method) passes the wording guard. The advertisement wording is a quote: stored as given, and shown to a vendor only
-- when it passes the guard (the portal checks before drawing it).
create function public.guard_appraisal_comp() returns trigger
language plpgsql security definer set search_path = public as $$
declare prob text;
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.appraisal_id is distinct from old.appraisal_id then raise exception 'A comparable stays on its own appraisal'; end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  prob := public.appraisal_wording_problem(jsonb_build_array(new.compare_text, new.method));
  if prob <> '' then raise exception '%', prob; end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_comp() from public, anon, authenticated;
create trigger appraisal_comps_guard before insert or update or delete on public.appraisal_comps for each row execute function public.guard_appraisal_comp();

-- a photo sits in its own appraisal's folder, belongs to a comparable of the same appraisal, and is in storage already (its type and
-- size are read from storage, never taken from the page). Once filed, where it is kept, its type and size never change.
create function public.guard_appraisal_media() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if new.comp_id is not null and not exists (select 1 from public.appraisal_comps c where c.id = new.comp_id and c.appraisal_id = new.appraisal_id) then
    raise exception 'That comparable isn''t on this appraisal';
  end if;
  if tg_op = 'UPDATE' then
    if new.appraisal_id is distinct from old.appraisal_id or new.path is distinct from old.path or new.mime_type is distinct from old.mime_type
       or new.size_bytes is distinct from old.size_bytes or new.source is distinct from old.source or new.created_at is distinct from old.created_at then
      raise exception 'Where a photo is kept, and what it is, can''t change';
    end if;
    return new;
  end if;
  if new.path not like 'appraisals/' || new.appraisal_id::text || '/comps/%' or new.path like '%..%' then
    raise exception 'A photo must sit in its own appraisal''s folder';
  end if;
  select o.metadata into m from storage.objects o where o.bucket_id = 'appraisal-media' and o.name = new.path limit 1;
  if not found then raise exception 'The photo isn''t in storage yet. Try again'; end if;
  new.mime_type := m->>'mimetype';
  new.size_bytes := nullif(m->>'size', '')::bigint;
  if new.mime_type is null or new.mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Photos must be JPEG, PNG or WebP'; end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_media() from public, anon, authenticated;
create trigger appraisal_media_guard before insert or update or delete on public.appraisal_media for each row execute function public.guard_appraisal_media();

-- ═══════════════ (b) near-duplicate addresses ═══════════════
-- an address in parts: the number, the street and the suburb, with "Rd"/"Road", "St"/"Street"/"Saint" and the like written one way,
-- extra commas, the city, "New Zealand" and the postcode left out. known: the address had a separate suburb part (after a comma).
-- The same rules are APPR.addrParts in src/appraisal-core.js (the tests run one list of cases through both).
create function public.appraisal_addr_parts(p text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  canon constant jsonb := '{"street":"st","str":"st","saint":"st","road":"rd","avenue":"ave","av":"ave","crescent":"cres","cr":"cres","place":"pl","terrace":"tce","ter":"tce","drive":"dr","lane":"ln","highway":"hwy","court":"ct","crt":"ct","grove":"gr","parade":"pde","square":"sq","close":"cl","esplanade":"esp","boulevard":"blvd","mount":"mt","heights":"hts","track":"trk"}';
  seg text; t text; toks text[]; n int; segs text[] := '{}'; first text[]; num text := ''; street text := ''; suburb text := ''; known boolean := false;
begin
  foreach seg in array regexp_split_to_array(translate(lower(coalesce(p, '')), 'āēīōū', 'aeiou'), ',') loop
    t := btrim(regexp_replace(seg, '[^a-z0-9/-]+', ' ', 'g'));
    if t = '' then continue; end if;
    toks := string_to_array(t, ' ');
    loop
      n := coalesce(array_length(toks, 1), 0);
      exit when n = 0;
      if toks[n] ~ '^[0-9]{4}$' and (n > 1 or coalesce(array_length(segs, 1), 0) > 0) then toks := toks[1:n-1];
      elsif toks[n] in ('nz', 'otago', 'aotearoa') then toks := toks[1:n-1];
      elsif n > 1 and toks[n] = 'zealand' and toks[n-1] = 'new' then toks := toks[1:n-2];
      elsif n > 1 and toks[n] = 'city' and toks[n-1] = 'dunedin' then toks := toks[1:n-2];
      elsif toks[n] = 'dunedin' and not (n > 1 and toks[n-1] in ('north', 'south', 'east', 'west', 'central')) then toks := toks[1:n-1];
      else exit;
      end if;
    end loop;
    if coalesce(array_length(toks, 1), 0) = 0 then continue; end if;
    select array_agg(coalesce(canon->>x, x) order by o) into toks from unnest(toks) with ordinality as u(x, o);
    segs := segs || array_to_string(toks, ' ');
  end loop;
  if coalesce(array_length(segs, 1), 0) = 0 then
    return jsonb_build_object('num', '', 'street', '', 'suburb', '', 'known', false, 'toks', '');
  end if;
  first := string_to_array(segs[1], ' ');
  if first[1] ~ '^[0-9]+[a-z]?([/-][0-9]+[a-z]?)?$' then
    num := first[1]; first := first[2:];
    if coalesce(array_length(first, 1), 0) = 0 and array_length(segs, 1) >= 2 then first := string_to_array(segs[2], ' '); segs := segs[2:]; end if;
  end if;
  street := coalesce(array_to_string(first, ' '), '');
  if array_length(segs, 1) >= 2 and street <> '' then known := true; suburb := segs[2]; end if;
  return jsonb_build_object('num', num, 'street', street, 'suburb', suburb, 'known', known, 'toks', btrim(street || ' ' || suburb));
end $$;
revoke all on function public.appraisal_addr_parts(text) from public, anon, authenticated;

-- two addresses are the same property: the same number and street, and the same suburb, or no suburb on one of them. Without commas
-- the suburb can't be told from the street, so the shorter must be the longer's street (ending in a street type such as Road) and
-- what follows must not be a direction or another street type (Sample Road East is not Sample Road, and Lantern View Road is not
-- Lantern View). Unsure means not the same.
create function public.appraisal_addr_same(a text, b text) returns boolean
language plpgsql immutable set search_path = public as $$
declare x jsonb := public.appraisal_addr_parts(a); y jsonb := public.appraisal_addr_parts(b); st text; lt text; w text[];
  types constant text[] := array['st', 'rd', 'ave', 'cres', 'pl', 'tce', 'dr', 'ln', 'hwy', 'ct', 'gr', 'pde', 'sq', 'cl', 'esp', 'blvd', 'way', 'rise', 'hts', 'trk', 'mews', 'row', 'view', 'walk', 'quay', 'loop', 'glade', 'glen'];
  dirs constant text[] := array['north', 'south', 'east', 'west', 'upper', 'lower', 'extension', 'ext', 'n', 's', 'e', 'w'];
begin
  if x->>'num' = '' or x->>'num' is distinct from y->>'num' or x->>'street' = '' or y->>'street' = '' then return false; end if;
  if (x->>'known')::boolean and (y->>'known')::boolean then return x->>'street' = y->>'street' and x->>'suburb' = y->>'suburb'; end if;
  if (x->>'known')::boolean then return y->>'toks' in (x->>'street', x->>'toks'); end if;
  if (y->>'known')::boolean then return x->>'toks' in (y->>'street', y->>'toks'); end if;
  if x->>'toks' = y->>'toks' then return true; end if;
  if length(x->>'toks') <= length(y->>'toks') then st := x->>'toks'; lt := y->>'toks'; else st := y->>'toks'; lt := x->>'toks'; end if;
  if left(lt, length(st) + 1) <> st || ' ' then return false; end if;
  w := string_to_array(st, ' ');
  return w[array_length(w, 1)] = any (types) and split_part(substr(lt, length(st) + 2), ' ', 1) <> all (dirs || types);
end $$;
revoke all on function public.appraisal_addr_same(text, text) from public, anon, authenticated;

-- agent_appraisal_create, replaced with the same signature: the 033 body, plus a near-duplicate of an address on file is refused with
-- that property named, so Tim chooses it rather than filing the property twice.
create or replace function public.agent_appraisal_create(p_property uuid, p_address text, p_kind text default 'standard') returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid := p_property; addr text := trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g'));
  k text := coalesce(nullif(trim(p_kind), ''), 'standard'); made boolean := false; aid uuid; prob text; dup text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if k not in ('standard', 'bespoke') then raise exception 'Unknown kind of appraisal'; end if;
  if pid is null then
    if length(addr) < 3 then raise exception 'Add the address'; end if;
    if length(addr) > 300 then raise exception 'That address is too long'; end if;
    if exists (select 1 from public.properties where lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) = lower(addr)) then
      raise exception 'That address is already on file. Choose it from the list';
    end if;
    select address into dup from public.properties where public.appraisal_addr_same(address, addr) order by created_at limit 1;
    if found then raise exception 'That address is already on file as "%". Choose it from the list', dup; end if;
  else
    select address into addr from public.properties where id = pid;
    if not found then raise exception 'Property not found'; end if;
    addr := trim(regexp_replace(coalesce(addr, ''), '\s+', ' ', 'g'));
  end if;
  prob := public.appraisal_wording_problem(to_jsonb(addr));
  if prob <> '' then raise exception '%', prob; end if;
  if pid is null then
    insert into public.properties (address) values (addr) returning id into pid;
    made := true;
  end if;
  insert into public.appraisal_views (property_id, address, title, kind, setup, status)
    values (pid, addr, case when addr = '' then 'Market appraisal' else addr || ': Market Appraisal' end, k, jsonb_build_object('v', 1), 'draft')
    returning id into aid;
  return jsonb_build_object('appraisal_id', aid, 'property_id', pid, 'created_property', made);
end $$;
revoke all on function public.agent_appraisal_create(uuid, text, text) from public, anon;
grant execute on function public.agent_appraisal_create(uuid, text, text) to authenticated;

-- ═══════════════ reading a pack: plain values only ═══════════════
-- text: control characters taken out, trimmed, cut to its length. Text is data: nothing in it is ever followed.
create function public.appraisal_pack_text(v jsonb, maxlen integer) returns text
language sql immutable set search_path = public as $$
  select case when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) in ('string', 'number', 'boolean') then
      nullif(left(btrim(regexp_replace(replace(v #>> '{}', E'\r\n', E'\n'), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')), maxlen), '')
    else null end
$$;
-- a number: a JSON number, or text such as "$512,000"; within lo and hi; anything else is refused with what it was for
create function public.appraisal_pack_num(v jsonb, lo numeric, hi numeric, what text) returns numeric
language plpgsql immutable set search_path = public as $$
declare s text; x numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) = 'number' then x := (v #>> '{}')::numeric;
  elsif jsonb_typeof(v) = 'string' then
    s := regexp_replace(v #>> '{}', '[$,[:space:]]', '', 'g');
    if s = '' then return null; end if;
    if s !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception '% must be a number', what; end if;
    x := s::numeric;
  else raise exception '% must be a number', what;
  end if;
  if x < lo or x > hi then raise exception '% is out of range', what; end if;
  return x;
end $$;
create function public.appraisal_pack_date(v jsonb, what text) returns date
language plpgsql immutable set search_path = public as $$
declare s text := public.appraisal_pack_text(v, 40);
begin
  if s is null then return null; end if;
  if s ~ '^[0-9]{4}-[0-9]{2}$' then s := s || '-01'; end if;
  if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '% must be a date written YYYY-MM-DD', what; end if;
  begin return s::date; exception when others then raise exception '% must be a real date', what; end;
end $$;
create function public.appraisal_pack_url(v jsonb) returns text
language sql immutable set search_path = public as $$
  select case when u ~ '^https://[^[:space:]]+$' and length(u) <= 1000 then u else null end from (select public.appraisal_pack_text(v, 2000) as u) s
$$;
create function public.appraisal_pack_ts(v jsonb) returns timestamptz
language plpgsql stable set search_path = public as $$
declare s text := public.appraisal_pack_text(v, 60);
begin
  if s is null then return null; end if;
  begin return s::timestamptz; exception when others then raise exception 'gathered_at must be a date and time'; end;
end $$;
revoke all on function public.appraisal_pack_text(jsonb, integer), public.appraisal_pack_num(jsonb, numeric, numeric, text), public.appraisal_pack_date(jsonb, text),
  public.appraisal_pack_url(jsonb), public.appraisal_pack_ts(jsonb) from public, anon, authenticated;

-- ═══════════════ importing a comparables pack (mre.comps/1) ═══════════════
-- Each comparable is matched to one already on the appraisal by its source and reference, or else by its address (the near-duplicate
-- rules above). A match takes the gathered facts the pack holds (a blank in the pack never clears what Tim typed); keeps Tim's address,
-- his order, shown or hidden, his private note, "for context only" and "Sold by Tim"; and never overwrites how it compares once Tim has
-- ticked it. Wording from a pack is never ticked. Source and gathered date come from the pack (or the comparable within it). A
-- comparable the pack gets wrong is skipped with the reason; the rest still import. Returns what happened.
create function public.agent_comps_import(p_appraisal uuid, p_pack jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.appraisal_views; c jsonb; i int := 0; ex public.appraisal_comps; found_ex boolean;
  added int := 0; updated int := 0; kept int := 0; skipped jsonb := '[]'::jsonb; notes jsonb := '[]'::jsonb; nextpos int;
  d_src text; d_at timestamptz; src text; ref text; addr text; st text; ctext text; hints jsonb; h jsonb; prob text; x record;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into a from public.appraisal_views where id = p_appraisal;
  if not found then raise exception 'Appraisal not found'; end if;
  if a.status = 'sent' then raise exception 'This appraisal has been sent, and a sent copy never changes'; end if;
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' or p_pack->>'format' is distinct from 'mre.comps/1' then
    raise exception 'That isn''t a comparables pack (format mre.comps/1)';
  end if;
  if length(p_pack::text) > 1000000 then raise exception 'That pack is too big to import at once'; end if;
  if jsonb_typeof(p_pack->'comps') is distinct from 'array' then raise exception 'The pack has no list of comparables'; end if;
  if jsonb_array_length(p_pack->'comps') > 60 then raise exception 'At most 60 comparables in one pack'; end if;
  d_src := coalesce(lower(public.appraisal_pack_text(p_pack->'source', 20)), 'reinz');
  if d_src not in ('reinz', 'relab', 'listing', 'tim', 'other') then raise exception 'Unknown source %', d_src; end if;
  d_at := coalesce(public.appraisal_pack_ts(p_pack->'gathered_at'), now());
  select coalesce(max(position), 0) into nextpos from public.appraisal_comps where appraisal_id = p_appraisal;
  for c in select value from jsonb_array_elements(p_pack->'comps') loop
    i := i + 1;
    begin
      if jsonb_typeof(c) <> 'object' then raise exception 'not a comparable'; end if;
      addr := regexp_replace(coalesce(public.appraisal_pack_text(c->'address', 400), ''), '\s+', ' ', 'g');
      if length(addr) < 3 then raise exception 'no address'; end if;
      if length(addr) > 300 then raise exception 'the address is too long'; end if;
      st := coalesce(lower(public.appraisal_pack_text(c->'status', 20)), 'sold');
      if st not in ('sold', 'listed', 'context') then raise exception 'status must be sold, listed or context'; end if;
      src := coalesce(lower(public.appraisal_pack_text(c->'source', 20)), d_src);
      if src not in ('reinz', 'relab', 'listing', 'tim', 'other') then raise exception 'unknown source %', src; end if;
      ref := public.appraisal_pack_text(c->'ref', 200);
      if c ? 'ring' and public.appraisal_pack_text(c->'ring', 20) is not null and public.appraisal_pack_text(c->'ring', 20) not in ('suburb', '750m', '1500m', 'further') then
        raise exception 'ring must be suburb, 750m, 1500m or further';
      end if;
      -- the cleaned values, all at once (a wrong one skips this comparable)
      select public.appraisal_pack_text(c->'suburb', 100) as suburb,
        public.appraisal_pack_num(c->'price', 1, 999999999, 'price')::integer as price,
        public.appraisal_pack_date(c->'sold_on', 'sold_on') as sold_on, public.appraisal_pack_date(c->'listed_on', 'listed_on') as listed_on,
        public.appraisal_pack_text(c->'method', 100) as method, public.appraisal_pack_num(c->'days_to_sell', 0, 3650, 'days_to_sell')::integer as days_to_sell,
        public.appraisal_pack_num(c->'bedrooms', 0, 50, 'bedrooms')::integer as bedrooms, round(public.appraisal_pack_num(c->'bathrooms', 0, 50, 'bathrooms'), 1) as bathrooms,
        round(public.appraisal_pack_num(c->'floor_m2', 0.1, 99999, 'floor_m2'), 1) as floor_m2, round(public.appraisal_pack_num(c->'land_m2', 0.1, 99999999, 'land_m2'), 1) as land_m2,
        public.appraisal_pack_num(c->'cv', 1, 999999999, 'cv')::integer as cv, public.appraisal_pack_text(c->'agency', 150) as agency,
        (lower(coalesce(c->>'sold_by_tim', '')) = 'true') as sold_by_tim, public.appraisal_pack_text(c->'ad_text', 8000) as ad_text,
        public.appraisal_pack_text(c->'ring', 20) as ring, public.appraisal_pack_num(c->'distance_m', 0, 1000000, 'distance_m')::integer as distance_m,
        public.appraisal_pack_url(c->'url') as url, coalesce(public.appraisal_pack_ts(c->'gathered_at'), d_at) as gathered_at
        into x;
      ctext := public.appraisal_pack_text(c->'compare_text', 4000);
      if ctext is not null then
        prob := public.appraisal_wording_problem(to_jsonb(ctext));
        if prob <> '' then notes := notes || jsonb_build_object('n', i, 'note', 'How it compares was left out: ' || prob); ctext := null; end if;
      end if;
      if x.method is not null and public.appraisal_wording_problem(to_jsonb(x.method)) <> '' then
        notes := notes || jsonb_build_object('n', i, 'note', 'The method was left out: ' || public.appraisal_wording_problem(to_jsonb(x.method))); x.method := null;
      end if;
      hints := '[]'::jsonb;
      if jsonb_typeof(c->'photos') = 'array' then
        for h in select value from jsonb_array_elements(c->'photos') limit 30 loop
          if jsonb_typeof(h) = 'object' and (public.appraisal_pack_text(h->'file', 200) is not null or public.appraisal_pack_url(h->'url') is not null) then
            hints := hints || jsonb_strip_nulls(jsonb_build_object('file', nullif(regexp_replace(coalesce(public.appraisal_pack_text(h->'file', 200), ''), '^.*[/\\]', ''), ''), 'url', public.appraisal_pack_url(h->'url')));
          end if;
        end loop;
      end if;
      -- the match: by source and reference, else by address
      found_ex := false;
      if ref is not null then
        select * into ex from public.appraisal_comps where appraisal_id = p_appraisal and source = src and source_ref = ref;
        found_ex := found;
      end if;
      if not found_ex then
        select * into ex from public.appraisal_comps where appraisal_id = p_appraisal and (source_ref is null or ref is null)
          and (lower(regexp_replace(address, '\s+', ' ', 'g')) = lower(addr) or public.appraisal_addr_same(address, addr)) order by position limit 1;
        found_ex := found;
      end if;
      if found_ex then
        if ex.compare_ticked and ctext is not null and ctext is distinct from ex.compare_text then kept := kept + 1; end if;
        update public.appraisal_comps set
          status = case when ex.status = 'context' then 'context' else st end,
          suburb = coalesce(x.suburb, suburb), price = coalesce(x.price, price), sold_on = coalesce(x.sold_on, sold_on), listed_on = coalesce(x.listed_on, listed_on),
          method = coalesce(x.method, method), days_to_sell = coalesce(x.days_to_sell, days_to_sell), bedrooms = coalesce(x.bedrooms, bedrooms),
          bathrooms = coalesce(x.bathrooms, bathrooms), floor_m2 = coalesce(x.floor_m2, floor_m2), land_m2 = coalesce(x.land_m2, land_m2), cv = coalesce(x.cv, cv),
          agency = coalesce(x.agency, agency), sold_by_tim = sold_by_tim or x.sold_by_tim, ad_text = coalesce(x.ad_text, ad_text),
          compare_text = case when compare_ticked or ctext is null then compare_text else ctext end,
          ring = coalesce(x.ring, ring), distance_m = coalesce(x.distance_m, distance_m),
          source = src, source_ref = coalesce(ref, source_ref), source_url = coalesce(x.url, source_url), gathered_at = x.gathered_at,
          photo_hints = (select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(photo_hints || hints) e)
          where id = ex.id;
        updated := updated + 1;
      else
        nextpos := nextpos + 1;
        insert into public.appraisal_comps (appraisal_id, position, status, address, suburb, price, sold_on, listed_on, method, days_to_sell, bedrooms, bathrooms,
            floor_m2, land_m2, cv, agency, sold_by_tim, ad_text, compare_text, compare_ticked, ring, distance_m, source, source_ref, source_url, gathered_at, photo_hints)
          values (p_appraisal, nextpos, st, addr, coalesce(x.suburb, ''), x.price, x.sold_on, x.listed_on, coalesce(x.method, ''), x.days_to_sell, x.bedrooms, x.bathrooms,
            x.floor_m2, x.land_m2, x.cv, coalesce(x.agency, ''), x.sold_by_tim, coalesce(x.ad_text, ''), coalesce(ctext, ''), false, x.ring, x.distance_m, src, ref, x.url, x.gathered_at, hints);
        added := added + 1;
      end if;
    exception when others then
      skipped := skipped || jsonb_build_object('n', i, 'why', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'kept_ticked', kept, 'skipped', skipped, 'notes', notes);
end $$;
revoke all on function public.agent_comps_import(uuid, jsonb) from public, anon;
grant execute on function public.agent_comps_import(uuid, jsonb) to authenticated;

-- Tim's order: every comparable of the appraisal, in the order given (1, 2, 3 ...). Refused if the list isn't exactly its comparables.
create function public.agent_comps_order(p_appraisal uuid, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_ids is null or cardinality(p_ids) <> (select count(distinct v) from unnest(p_ids) v)
     or (select count(*) from public.appraisal_comps where appraisal_id = p_appraisal) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) v where not exists (select 1 from public.appraisal_comps c where c.id = v and c.appraisal_id = p_appraisal)) then
    raise exception 'The list must hold each comparable of this appraisal once';
  end if;
  update public.appraisal_comps c set position = o.n from unnest(p_ids) with ordinality as o(id, n) where c.id = o.id and c.position is distinct from o.n::integer;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.agent_comps_order(uuid, uuid[]) from public, anon;
grant execute on function public.agent_comps_order(uuid, uuid[]) to authenticated;

-- ═══════════════ importing market figures (mre.market/1) ═══════════════
-- months: one row per area and month; a newer gathering replaces an older one, never the other way round. sales: matched by source and
-- reference (or, with no reference, the same suburb, date, price and address), so loading the same sales twice adds nothing.
create function public.agent_market_import(p_pack jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m jsonb; s jsonb; i int := 0; d_at timestamptz; d_url text; ma int := 0; mu int := 0; sa int := 0; su int := 0; skipped jsonb := '[]'::jsonb;
  v_area text; mon date; v_bands jsonb; b jsonb; at_ timestamptz; x record; ref text; sub text; dt date; pr integer; addr text; ex_id uuid; ex_at timestamptz;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' or p_pack->>'format' is distinct from 'mre.market/1' then
    raise exception 'That isn''t a market pack (format mre.market/1)';
  end if;
  if length(p_pack::text) > 3000000 then raise exception 'That pack is too big to import at once'; end if;
  if jsonb_typeof(coalesce(p_pack->'months', '[]')) <> 'array' or jsonb_typeof(coalesce(p_pack->'sales', '[]')) <> 'array' then raise exception 'months and sales must be lists'; end if;
  if jsonb_array_length(coalesce(p_pack->'months', '[]')) > 400 or jsonb_array_length(coalesce(p_pack->'sales', '[]')) > 5000 then raise exception 'At most 400 months and 5,000 sales in one pack'; end if;
  d_at := coalesce(public.appraisal_pack_ts(p_pack->'gathered_at'), now());
  d_url := public.appraisal_pack_url(p_pack->'url');
  for m in select value from jsonb_array_elements(coalesce(p_pack->'months', '[]')) loop
    i := i + 1;
    begin
      if jsonb_typeof(m) <> 'object' then raise exception 'not a month'; end if;
      v_area := regexp_replace(coalesce(public.appraisal_pack_text(m->'area', 100), ''), '\s+', ' ', 'g');
      if v_area = '' then raise exception 'no area'; end if;
      mon := date_trunc('month', public.appraisal_pack_date(m->'month', 'month'))::date;
      if mon is null then raise exception 'no month'; end if;
      select public.appraisal_pack_num(m->'median', 1, 999999999, 'median')::integer as median, public.appraisal_pack_num(m->'lower_quartile', 1, 999999999, 'lower_quartile')::integer as lq,
        public.appraisal_pack_num(m->'upper_quartile', 1, 999999999, 'upper_quartile')::integer as uq, public.appraisal_pack_num(m->'sales', 0, 1000000, 'sales')::integer as sales,
        public.appraisal_pack_num(m->'days_to_sell', 0, 3650, 'days_to_sell')::integer as days into x;
      if x.lq is not null and x.median is not null and x.lq > x.median then raise exception 'the lower quartile is above the median'; end if;
      if x.uq is not null and x.median is not null and x.uq < x.median then raise exception 'the upper quartile is below the median'; end if;
      v_bands := '[]'::jsonb;
      if jsonb_typeof(m->'bands') = 'array' then
        for b in select value from jsonb_array_elements(m->'bands') limit 40 loop
          if jsonb_typeof(b) <> 'object' then raise exception 'a price band must have from, to and count'; end if;
          v_bands := v_bands || jsonb_strip_nulls(jsonb_build_object('from', public.appraisal_pack_num(b->'from', 0, 999999999, 'a band''s from')::integer,
            'to', public.appraisal_pack_num(b->'to', 0, 999999999, 'a band''s to')::integer, 'count', coalesce(public.appraisal_pack_num(b->'count', 0, 1000000, 'a band''s count')::integer, 0)));
        end loop;
      end if;
      at_ := coalesce(public.appraisal_pack_ts(m->'gathered_at'), d_at);
      select id, gathered_at into ex_id, ex_at from public.market_months where market_months.area = v_area and market_months.month = mon;
      if found then
        if at_ >= ex_at then
          update public.market_months set median = coalesce(x.median, median), lower_quartile = coalesce(x.lq, lower_quartile), upper_quartile = coalesce(x.uq, upper_quartile),
            sales = coalesce(x.sales, sales), days_to_sell = coalesce(x.days, days_to_sell), bands = case when jsonb_array_length(v_bands) > 0 then v_bands else market_months.bands end,
            source_url = coalesce(public.appraisal_pack_url(m->'url'), d_url, source_url), gathered_at = at_ where id = ex_id;
          mu := mu + 1;
        end if;
      else
        insert into public.market_months (area, month, median, lower_quartile, upper_quartile, sales, days_to_sell, bands, source_url, gathered_at)
          values (v_area, mon, x.median, x.lq, x.uq, x.sales, x.days, v_bands, coalesce(public.appraisal_pack_url(m->'url'), d_url), at_);
        ma := ma + 1;
      end if;
    exception when others then skipped := skipped || jsonb_build_object('n', i, 'what', 'month', 'why', sqlerrm);
    end;
  end loop;
  i := 0;
  for s in select value from jsonb_array_elements(coalesce(p_pack->'sales', '[]')) loop
    i := i + 1;
    begin
      if jsonb_typeof(s) <> 'object' then raise exception 'not a sale'; end if;
      sub := regexp_replace(coalesce(public.appraisal_pack_text(s->'suburb', 100), ''), '\s+', ' ', 'g');
      dt := public.appraisal_pack_date(s->'sold_on', 'sold_on');
      pr := public.appraisal_pack_num(s->'price', 1, 999999999, 'price')::integer;
      if sub = '' or dt is null or pr is null then raise exception 'a sale needs its suburb, sold_on and price'; end if;
      addr := regexp_replace(coalesce(public.appraisal_pack_text(s->'address', 300), ''), '\s+', ' ', 'g');
      ref := public.appraisal_pack_text(s->'ref', 200);
      select public.appraisal_pack_num(s->'bedrooms', 0, 50, 'bedrooms')::integer as bedrooms, round(public.appraisal_pack_num(s->'bathrooms', 0, 50, 'bathrooms'), 1) as bathrooms,
        round(public.appraisal_pack_num(s->'floor_m2', 0.1, 99999, 'floor_m2'), 1) as floor_m2, round(public.appraisal_pack_num(s->'land_m2', 0.1, 99999999, 'land_m2'), 1) as land_m2,
        coalesce(public.appraisal_pack_text(s->'property_type', 60), '') as ptype, public.appraisal_pack_num(s->'days_to_sell', 0, 3650, 'days_to_sell')::integer as days into x;
      if ref is not null then select id into ex_id from public.market_sales where source = 'reinz' and source_ref = ref;
      else select id into ex_id from public.market_sales where source_ref is null and suburb = sub and sold_on = dt and price = pr and address = addr; end if;
      if found then
        update public.market_sales set suburb = sub, sold_on = dt, price = pr, address = case when addr = '' then address else addr end, bedrooms = coalesce(x.bedrooms, bedrooms),
          bathrooms = coalesce(x.bathrooms, bathrooms), floor_m2 = coalesce(x.floor_m2, floor_m2), land_m2 = coalesce(x.land_m2, land_m2),
          property_type = case when x.ptype = '' then property_type else x.ptype end, days_to_sell = coalesce(x.days, days_to_sell), gathered_at = coalesce(public.appraisal_pack_ts(s->'gathered_at'), d_at) where id = ex_id;
        su := su + 1;
      else
        insert into public.market_sales (suburb, sold_on, price, address, bedrooms, bathrooms, floor_m2, land_m2, property_type, days_to_sell, source_ref, gathered_at)
          values (sub, dt, pr, addr, x.bedrooms, x.bathrooms, x.floor_m2, x.land_m2, x.ptype, x.days, ref, coalesce(public.appraisal_pack_ts(s->'gathered_at'), d_at));
        sa := sa + 1;
      end if;
    exception when others then skipped := skipped || jsonb_build_object('n', i, 'what', 'sale', 'why', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('months_added', ma, 'months_updated', mu, 'sales_added', sa, 'sales_updated', su, 'skipped', skipped);
end $$;
revoke all on function public.agent_market_import(jsonb) from public, anon;
grant execute on function public.agent_market_import(jsonb) to authenticated;

-- ═══════════════ the photo bucket: private, Tim only ═══════════════
-- Read only through signed links. Tim adds photos under appraisals/<appraisal>/comps/<comp>/ and may remove one, unless its appraisal
-- has been sent. No vendor policy: in phase E the vendor's page gets short-lived links from an edge function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appraisal-media', 'appraisal-media', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy appraisal_media_agent_read on storage.objects for select to authenticated using (bucket_id = 'appraisal-media' and public.is_agent());
create policy appraisal_media_agent_add on storage.objects for insert to authenticated with check (bucket_id = 'appraisal-media' and public.is_agent()
  and (storage.foldername(name))[1] = 'appraisals' and (storage.foldername(name))[3] = 'comps');
create policy appraisal_media_agent_remove on storage.objects for delete to authenticated using (bucket_id = 'appraisal-media' and public.is_agent()
  and not exists (select 1 from public.appraisal_views v where v.id::text = (storage.foldername(objects.name))[2] and v.status = 'sent'));
