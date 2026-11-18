-- Public council records (Tim, 18 November 2026): after an address is entered, Tim can look the property up on the public
-- records of the Otago Regional Council, the district council and LINZ (fn/property_lookup.ts). Nothing found is used until
-- he ticks it and taps "Use these".
--   * council_lookups: every lookup, as a cache (reused for 30 days unless Tim taps "Look again") and a record of what was asked
--     of whom. Written only by the edge function (service role), so what is stored is what the councils answered, never what a
--     page sent. Tim reads it; vendors have no policy, so they never read it; nobody writes it directly.
--   * council_use_log: who used or removed which public-record value on which property, from which lookup, and when; and when a
--     new round of owners cleared them. Agent reads; nobody writes directly; it is never changed.
--   * properties.found: the public-record values Tim used, each with its source, the source's own date, when it was found and
--     used, and whether it was written to a field. properties.provenance: per field (title_ref, legal_description, pLand), where
--     the value now on the file came from, and what the field held before. Neither holds who used it or any lookup id (vendors
--     who are a party can read properties; who and which lookup are in council_use_log, agent only). Both are written only by the
--     functions below; guard_found refuses any other change.
--   * Accepted values go to the matching property-file field when it is empty or already the same. A different value already on
--     the file, or on the agreement in force, waits for Tim: p_replace uses the public record, p_keep keeps what is there and
--     stores the public record beside it in found. The agreement is brought into line only while it is a draft nobody has signed
--     and that hasn't gone to the vendors; a sent or parked agreement is left alone (as agent_inspection_resolve does, migration
--     012), and a signed one is never changed. A lookup is used only on a property whose address fits it.
--   * agent_council_remove takes one value back out of found (and its provenance), putting back what the field held before when
--     nothing else holds the public record's value. agent_reopen_property clears found and provenance for new owners (the safer
--     choice: a new round starts clean, and the lookups and the use log keep the history).
--   * Vendors: properties is readable by a party to the property (prop_party_read, migration 002), so found and provenance are
--     readable by them through the database, though no vendor screen shows them. Tim's decision: rating information is public,
--     so that is fine. Every hazard and zone value carries "Not a substitute for a LIM.", every rating valuation "Council rating
--     valuation (as at {date}), not a market value.", and rates their own note.
-- Additive only: two new columns with defaults, two new tables, new functions, one new trigger, and agent_reopen_property replaced
-- with the same signature (its earlier steps unchanged). No DELETE or DROP.

alter table public.properties add column if not exists found jsonb not null default '{}'::jsonb;
alter table public.properties add column if not exists provenance jsonb not null default '{}'::jsonb;

create or replace function public.council_norm(t text) returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create table public.council_lookups (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  asked text not null,                                                     -- the address Tim typed or chose
  asked_norm text generated always as (public.council_norm(asked)) stored, -- the same, for the cache
  matched_address text,                                                    -- the address the locator matched (always shown)
  council text,                                                            -- for example 'Dunedin City Council'
  status text not null,                                                    -- ok, weak, choose, choose_unit, not_found, slow, unavailable
  result jsonb not null default '{}'::jsonb,                               -- what fn/property_lookup_core.ts returned
  created_by text not null,
  created_at timestamptz not null default now()
);
create index council_lookups_property_idx on public.council_lookups (property_id, created_at desc);
create index council_lookups_asked_idx on public.council_lookups (asked_norm, created_at desc);
alter table public.council_lookups enable row level security;
create policy cl_agent_read on public.council_lookups for select using (public.is_agent());
revoke all on public.council_lookups from anon;
revoke insert, update, delete, truncate on public.council_lookups from authenticated;

create table public.council_use_log (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id),
  lookup_id uuid references public.council_lookups(id),
  kind text not null check (kind in ('used', 'removed', 'cleared')),
  keys jsonb not null default '[]'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  actor text not null,
  at timestamptz not null default now()
);
create index council_use_log_property_idx on public.council_use_log (property_id, at desc);
alter table public.council_use_log enable row level security;
create policy cul_agent_read on public.council_use_log for select using (public.is_agent());
revoke all on public.council_use_log from anon;
revoke insert, update, delete, truncate on public.council_use_log from authenticated;

-- found and provenance change only inside the functions below, which set app.council_accept for their own transaction
create or replace function public.guard_found() returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.council_accept', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.found, '{}'::jsonb) <> '{}'::jsonb or coalesce(new.provenance, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Public record values are only saved with Use these';
    end if;
  elsif new.found is distinct from old.found or new.provenance is distinct from old.provenance then
    raise exception 'Public record values are only saved with Use these';
  end if;
  return new;
end $$;
create trigger guard_found before insert or update on public.properties for each row execute function public.guard_found();

-- two values for one field are the same when they mean the same: land area as a number, text ignoring case, spaces and punctuation
create or replace function public.council_same(p_field text, a text, b text) returns boolean language sql immutable set search_path = public as $$
  select case
    when p_field = 'pLand' and btrim(coalesce(a, '')) ~ '^[0-9]+(\.[0-9]+)?$' and btrim(coalesce(b, '')) ~ '^[0-9]+(\.[0-9]+)?$'
      then round(btrim(a)::numeric) = round(btrim(b)::numeric)
    else regexp_replace(lower(coalesce(a, '')), '[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(b, '')), '[^a-z0-9]', '', 'g')
  end;
$$;

-- an address as unit, house number and the first word of the street: "Flat 2, 20 Thames Street" and "2/20 thames st" both give
-- {"unit":"2","number":"20","street":"thames"}; null when it has no house number
create or replace function public.council_addr_key(t text) returns jsonb language sql immutable set search_path = public as $$
  with s as (select regexp_replace(regexp_replace(lower(coalesce(t, '')), '^\s*(flat|unit|apartment|apt)\.?\s*([0-9]+[a-z]?|[a-z])\s*,?\s+', '\2/'), '[^a-z0-9/ ]+', ' ', 'g') as v),
       m as (select regexp_match((select v from s), '^\s*(?:([0-9]+[a-z]?|[a-z])\s*/\s*)?([0-9]+[a-z]?)\s+([a-z]+)') as g)
  select case when (select g from m) is null then null
    else jsonb_build_object('unit', (select g[1] from m), 'number', (select g[2] from m), 'street', (select g[3] from m)) end;
$$;
-- does a lookup's address fit the property's: the same house number and street, and the same unit when both name one; an
-- address with no house number (a rural road) fits only when the two are the same apart from punctuation
create or replace function public.council_addr_fits(p_prop text, p_lookup text) returns boolean language sql immutable set search_path = public as $$
  select case
    when public.council_addr_key(p_prop) is null or public.council_addr_key(p_lookup) is null
      then length(public.council_norm(p_prop)) >= 3 and public.council_norm(p_prop) = public.council_norm(p_lookup)
    else (public.council_addr_key(p_prop)->>'number') = (public.council_addr_key(p_lookup)->>'number')
     and (public.council_addr_key(p_prop)->>'street') = (public.council_addr_key(p_lookup)->>'street')
     and (public.council_addr_key(p_prop)->>'unit' is null or public.council_addr_key(p_lookup)->>'unit' is null
          or public.council_addr_key(p_prop)->>'unit' = public.council_addr_key(p_lookup)->>'unit')
  end;
$$;
create or replace function public.council_lookup_fits(p_prop text, l public.council_lookups) returns boolean language sql immutable set search_path = public as $$
  select public.council_addr_fits(p_prop, l.asked) or public.council_addr_fits(p_prop, l.matched_address)
      or public.council_addr_fits(p_prop, l.result->>'unit_address');
$$;

-- the newest usable lookup for this property (while it still fits both the property's address and the address asked), or for this
-- address and not tied to another property, if under 30 days old
create or replace function public.agent_council_cached(p_asked text, p_property uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.council_lookups; n text := public.council_norm(p_asked); addr text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_property is not null then select address into addr from public.properties where id = p_property; end if;
  select * into r from public.council_lookups l
   where l.created_at > now() - interval '30 days' and l.status = 'ok'
     and ((p_property is not null and l.property_id = p_property and public.council_lookup_fits(addr, l) and public.council_lookup_fits(p_asked, l))
       or (length(n) >= 3 and (l.property_id is null or l.property_id = p_property)
           and (l.asked_norm = n or public.council_norm(l.matched_address) = n)
           and (p_property is null or public.council_lookup_fits(addr, l))))
   order by (p_property is not null and l.property_id = p_property) desc, l.created_at desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'property_id', r.property_id, 'asked', r.asked, 'matched_address', r.matched_address,
    'council', r.council, 'status', r.status, 'result', r.result, 'created_at', r.created_at);
end $$;

-- Tim's ticked values, taken from the stored lookup (never from the page). p_replace: keys where he chose the public record over
-- a different value on the file or the agreement. p_keep: keys where he kept what is there (the public record is stored beside it
-- in found). Returns what was written, stored and kept, what needs his choice, what was skipped, and any agreement left alone.
create or replace function public.agent_council_accept(p_property uuid, p_lookup uuid, p_keys text[], p_replace text[] default '{}', p_keep text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.council_lookups; p public.properties; ag public.agreements; ag_signed boolean := false; ag_draft boolean := false;
  k text; it jsonb; v text; cur text; held text; field text; d_file boolean; d_ag boolean; do_write boolean;
  who text := coalesce(auth.jwt()->>'email', 'agent');
  f jsonb; pv jsonb; written jsonb := '[]'::jsonb; stored jsonb := '[]'::jsonb; kept jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb; left_alone jsonb := '[]'::jsonb;
  new_title text; new_legal text; new_desc jsonb; ag_c jsonb; ag_a jsonb; ag_keys text[] := '{}';
  lim constant text := 'Not a substitute for a LIM.';
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into l from public.council_lookups where id = p_lookup;
  if l.id is null then raise exception 'Lookup not found'; end if;
  if l.property_id is not null and l.property_id <> p_property then raise exception 'That lookup is for another property'; end if;
  if l.status <> 'ok' then raise exception 'Nothing usable was found in that lookup'; end if;
  if l.created_at < now() - interval '30 days' then raise exception 'That lookup is more than 30 days old. Look again first'; end if;
  select * into p from public.properties where id = p_property for update;
  if p.id is null then raise exception 'Property not found'; end if;
  if not public.council_lookup_fits(p.address, l) then
    raise exception 'That lookup is for %, but the property file says %. Look up the file''s address, or correct the address first', coalesce(l.result->>'unit_address', l.matched_address, l.asked), p.address;
  end if;
  if coalesce(array_length(p_keys, 1), 0) = 0 then raise exception 'Tick at least one'; end if;
  if array_length(p_keys, 1) > 80 then raise exception 'Too many at once'; end if;
  -- the newest agreement in force: signed (never changed), a draft nobody has signed (kept in step), or with the vendors (left alone)
  select * into ag from public.agreements a where a.property_id = p_property and a.status not in ('ended', 'cancelled') order by a.created_at desc limit 1;
  if ag.id is not null then
    ag_signed := ag.status in ('signed', 'countersigned') or exists (select 1 from public.agreement_people x where x.agreement_id = ag.id and x.signed_at is not null);
    ag_draft := not ag_signed and ag.status = 'draft';
    ag_c := coalesce(ag.config, '{}'::jsonb); ag_a := coalesce(ag.answers, '{}'::jsonb);
  end if;
  f := coalesce(p.found, '{}'::jsonb); pv := coalesce(p.provenance, '{}'::jsonb);
  new_title := p.title_ref; new_legal := p.legal_description; new_desc := coalesce(p.description, '{}'::jsonb);
  foreach k in array (select array_agg(distinct x order by x) from unnest(p_keys) x) loop
    if k is null or k !~ '^[a-z0-9_]{1,60}$' then skipped := skipped || to_jsonb(coalesce(k, '')); continue; end if;
    it := null;
    select x into it from jsonb_array_elements(coalesce(l.result->'values', '[]'::jsonb)) x where x->>'key' = k limit 1;
    if it is null or coalesce(jsonb_typeof(it->'value'), '') not in ('string', 'number') then skipped := skipped || to_jsonb(k); continue; end if;
    v := btrim(it->>'value');
    if v = '' or length(v) > 1000 then skipped := skipped || to_jsonb(k); continue; end if;
    field := case k when 'title_ref' then 'title_ref' when 'legal_description' then 'legal_description' when 'land_area' then 'pLand' else null end;
    if field = 'pLand' then
      if v !~ '^[0-9]+(\.[0-9]+)?$' then skipped := skipped || to_jsonb(k); continue; end if;
      v := round(v::numeric)::text;
    end if;
    do_write := false;
    if field is not null then
      cur := case field when 'title_ref' then new_title when 'legal_description' then new_legal else new_desc->>'pLand' end;
      held := case when ag.id is null then null when field = 'title_ref' then ag_c->>'title' when field = 'pLand' then ag_a->>'pLand' else null end;
      d_file := coalesce(btrim(cur), '') <> '' and not public.council_same(field, cur, v);
      d_ag := coalesce(btrim(held), '') <> '' and not public.council_same(field, held, v);
      if ag_signed and d_ag then
        -- a signed agreement holds it differently: never written from here
        if k = any(coalesce(p_keep, '{}')) then kept := kept || to_jsonb(k);
        else conflicts := conflicts || jsonb_build_object('key', k, 'label', it->>'label', 'found', v, 'current', held, 'where', 'signed_agreement', 'ref', ag.ref); continue; end if;
      elsif d_file or d_ag then
        if k = any(coalesce(p_replace, '{}')) then do_write := true;
        elsif k = any(coalesce(p_keep, '{}')) then kept := kept || to_jsonb(k);
        else conflicts := conflicts || jsonb_build_object('key', k, 'label', it->>'label', 'found', v, 'current', case when d_ag then held else cur end,
          'where', case when d_ag and ag_draft then 'agreement' when d_ag then 'agreement_sent' else 'file' end, 'ref', case when d_ag then ag.ref end); continue; end if;
      else do_write := true;
      end if;
      if do_write then
        pv := pv || jsonb_build_object(field, jsonb_build_object('from', 'public_records', 'key', k, 'value', v, 'source', it->>'source',
          'source_name', it->>'source_name', 'source_url', it->>'source_url', 'as_of', it->>'as_of', 'as_of_label', it->>'as_of_label',
          'fetched_at', it->>'fetched_at', 'at', now(),
          'was', case when coalesce(pv->field->>'from', '') = 'public_records' and public.council_same(field, cur, pv->field->>'value') then pv->field->'was' else to_jsonb(nullif(btrim(coalesce(cur, '')), '')) end));
        if field = 'title_ref' then new_title := v; elsif field = 'legal_description' then new_legal := v; else new_desc := new_desc || jsonb_build_object('pLand', v); end if;
        if ag.id is not null and field in ('title_ref', 'pLand') and not public.council_same(field, held, v) then
          if ag_draft then
            -- a draft nobody has signed and the vendors don't have yet: kept in step (page 1 reads these from it)
            if field = 'title_ref' then ag_c := ag_c || jsonb_build_object('title', v); else ag_a := ag_a || jsonb_build_object('pLand', v); end if;
            ag_keys := ag_keys || k;
          elsif not ag_signed then
            -- sent or parked: the vendors may be reading it, so it is left alone; Tim recalls it or raises the change with them
            left_alone := left_alone || jsonb_build_object('key', k, 'ref', ag.ref, 'status', ag.status, 'says', held);
          end if;
        end if;
        written := written || to_jsonb(k);
      end if;
    end if;
    -- the standard notes, whatever the stored note says
    if it->>'kind' in ('hazard', 'zone') and position(lim in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim(coalesce(it->>'note', '') || ' ' || lim));
    elsif it->>'kind' = 'valuation' and position('not a market value' in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim('Council rating valuation (as at ' || coalesce(nullif(it->>'as_of_label', ''), 'date not given') || '), not a market value. ' || coalesce(it->>'note', '')));
    elsif it->>'kind' = 'rates' and position('rates notice' in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim('Rates as the council publishes them (as at ' || coalesce(nullif(it->>'as_of_label', ''), 'date not given') || '). Check the latest rates notice. ' || coalesce(it->>'note', '')));
    end if;
    -- what vendors who are a party could read: the value, its source and dates; not who used it or which lookup
    f := f || jsonb_build_object(k, (it - 'lookup_id' - 'used_by') || jsonb_build_object('value', case when field = 'pLand' then to_jsonb(v::numeric) else it->'value' end,
      'field', field, 'written', do_write, 'matched_address', l.matched_address, 'unit_address', l.result->>'unit_address', 'council', l.council, 'used_at', now()));
    stored := stored || to_jsonb(k);
  end loop;
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = f, provenance = pv, title_ref = new_title, legal_description = new_legal, description = new_desc where id = p_property;
  perform set_config('app.council_accept', 'off', true);
  if array_length(ag_keys, 1) > 0 then
    update public.agreements set config = ag_c, answers = ag_a where id = ag.id;
    perform public.log_event(ag.id, who, 'public_records_applied', jsonb_build_object('keys', to_jsonb(ag_keys)));
  end if;
  update public.council_lookups set property_id = p_property where id = p_lookup and property_id is null;
  if jsonb_array_length(stored) > 0 then
    insert into public.council_use_log (property_id, lookup_id, kind, keys, detail, actor)
    values (p_property, l.id, 'used', stored, jsonb_build_object('written', written, 'kept', kept, 'agreement_updated', to_jsonb(ag_keys), 'agreement_left', left_alone), who);
  end if;
  return jsonb_build_object('written', written, 'stored', stored, 'kept', kept, 'conflicts', conflicts, 'skipped', skipped,
    'agreement_updated', coalesce(array_length(ag_keys, 1), 0) > 0, 'agreement_left', left_alone, 'ref', ag.ref);
end $$;

-- Take one used value back out. If it was written to a field that still holds it, the field gets back what it held before, unless
-- the agreement in force holds the public record's value too (then the field stays as it is, and the result says so).
create or replace function public.agent_council_remove(p_property uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.properties; e jsonb; field text; pr jsonb; cur text; held text; ag public.agreements; restored boolean := false; kept_by text;
  pv jsonb; f jsonb; new_title text; new_legal text; new_desc jsonb; who text := coalesce(auth.jwt()->>'email', 'agent');
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into p from public.properties where id = p_property for update;
  if p.id is null then raise exception 'Property not found'; end if;
  f := coalesce(p.found, '{}'::jsonb) - p_key;
  e := coalesce(p.found, '{}'::jsonb)->p_key;
  if e is null then raise exception 'That value isn''t on the property file'; end if;
  field := nullif(e->>'field', ''); pv := coalesce(p.provenance, '{}'::jsonb);
  new_title := p.title_ref; new_legal := p.legal_description; new_desc := coalesce(p.description, '{}'::jsonb);
  if field is not null and coalesce(pv->field->>'key', '') = p_key then
    pr := pv->field; pv := pv - field;
    cur := case field when 'title_ref' then p.title_ref when 'legal_description' then p.legal_description else new_desc->>'pLand' end;
    if public.council_same(field, cur, pr->>'value') then
      select * into ag from public.agreements a where a.property_id = p_property and a.status not in ('ended', 'cancelled') order by a.created_at desc limit 1;
      held := case when ag.id is null then null when field = 'title_ref' then ag.config->>'title' when field = 'pLand' then ag.answers->>'pLand' else null end;
      if coalesce(btrim(held), '') <> '' and public.council_same(field, held, pr->>'value') then kept_by := ag.ref;
      else
        if field = 'title_ref' then new_title := pr->>'was'; elsif field = 'legal_description' then new_legal := pr->>'was';
        elsif pr->>'was' is null then new_desc := new_desc - 'pLand'; else new_desc := new_desc || jsonb_build_object('pLand', pr->>'was'); end if;
        restored := true;
      end if;
    end if;
  end if;
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = f, provenance = pv, title_ref = new_title, legal_description = new_legal, description = new_desc where id = p_property;
  perform set_config('app.council_accept', 'off', true);
  insert into public.council_use_log (property_id, lookup_id, kind, keys, detail, actor)
  values (p_property, null, 'removed', jsonb_build_array(p_key), jsonb_build_object('value', e->'value', 'field', field, 'restored', restored, 'agreement_holds', kept_by), who);
  return jsonb_build_object('removed', p_key, 'field', field, 'restored', restored, 'agreement_holds', kept_by);
end $$;

-- Starting again: unchanged, except that new owners also start with no public-record values (cleared, and logged)
create or replace function public.agent_reopen_property(pid uuid, new_owners boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if not exists (select 1 from public.properties where id = pid and stage in ('withdrawn','settled')) then raise exception 'Only a withdrawn or settled property can start again'; end if;
  if new_owners then
    update public.property_people set role = 'former' where property_id = pid and role <> 'former';
    update public.properties set owners_on_title = null, ownership = '{}'::jsonb, disclosures = '{}'::jsonb, cycle_at = now() where id = pid;
    select count(*) into n from public.properties pp, jsonb_object_keys(pp.found) where pp.id = pid;
    if n > 0 then
      perform set_config('app.council_accept', 'on', true);
      update public.properties set found = '{}'::jsonb, provenance = '{}'::jsonb where id = pid;
      perform set_config('app.council_accept', 'off', true);
      insert into public.council_use_log (property_id, kind, detail, actor) values (pid, 'cleared', jsonb_build_object('reason', 'new owners', 'values', n), coalesce(auth.jwt()->>'email', 'agent'));
    end if;
  end if;
  update public.properties set stage = 'appraisal', stage_at = now() where id = pid;
end $$;

revoke execute on function public.agent_council_cached(text, uuid), public.agent_council_accept(uuid, uuid, text[], text[], text[]),
  public.agent_council_remove(uuid, text) from public, anon;
grant execute on function public.agent_council_cached(text, uuid), public.agent_council_accept(uuid, uuid, text[], text[], text[]),
  public.agent_council_remove(uuid, text) to authenticated;
revoke execute on function public.guard_found() from public, anon, authenticated;
revoke execute on function public.council_norm(text), public.council_same(text, text, text), public.council_addr_key(text),
  public.council_addr_fits(text, text), public.council_lookup_fits(text, public.council_lookups) from public, anon;
