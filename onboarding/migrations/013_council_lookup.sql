-- Public council records (Tim, 18 November 2026): after an address is entered, Tim can look the property up on the public
-- records of the Otago Regional Council, the district council and LINZ (fn/property_lookup.ts). Nothing found is used until
-- he ticks it and taps "Use these".
--   * council_lookups: every lookup, as a cache (reused for 30 days unless Tim taps "Look again") and a record of what was asked
--     of whom. Written only by the edge function (service role), so what is stored is what the councils answered, never what a
--     page sent. Tim reads it; vendors have no policy, so they never read it; nobody writes it directly.
--   * properties.found: the public-record values Tim used, each with its source, the source's own date, when it was found, who
--     used it and when, and whether it was written to a field. properties.provenance: per field (title_ref, legal_description,
--     pLand), where the value now on the file came from. Both are written only by agent_council_accept (guard_found refuses any
--     other change; every existing writer of properties leaves them alone).
--   * Accepted values go to the matching property-file field (title_ref, legal_description, description.pLand) when it is
--     empty or already the same. A different value already on the file, or on an unsigned agreement in force, waits for Tim:
--     p_replace uses the public record (an unsigned agreement is brought into line, as the inspection does), p_keep keeps what
--     is there and stores the public record beside it in found. A signed agreement is never changed, and a field it holds
--     differently is never written here. No signature, fingerprint or signed term is touched.
--   * Vendors: properties is readable by a party to the property (prop_party_read, migration 002), so found and provenance are
--     readable by them through the database, though no vendor screen shows them. Tim's decision: rating information is public,
--     so that is fine. Every hazard and zone value carries "Not a substitute for a LIM.", and every rating valuation and rates
--     value "Council rating valuation (as at {date}), not a market value."
-- Additive only: two new columns with defaults, one new table, new functions and one new trigger. No DELETE or DROP.

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
  status text not null,                                                    -- ok, weak, choose, not_found, unavailable
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

-- found and provenance change only inside agent_council_accept, which sets app.council_accept for its own transaction
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

-- the newest usable lookup for this property, or for this address and not tied to another property, if under 30 days old
create or replace function public.agent_council_cached(p_asked text, p_property uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.council_lookups; n text := public.council_norm(p_asked);
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.council_lookups l
   where l.created_at > now() - interval '30 days' and l.status = 'ok'
     and ((p_property is not null and l.property_id = p_property)
       or (length(n) >= 3 and (l.property_id is null or l.property_id = p_property)
           and (l.asked_norm = n or public.council_norm(l.matched_address) = n)))
   order by (p_property is not null and l.property_id = p_property) desc, l.created_at desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'property_id', r.property_id, 'asked', r.asked, 'matched_address', r.matched_address,
    'council', r.council, 'status', r.status, 'result', r.result, 'created_at', r.created_at, 'created_by', r.created_by);
end $$;

-- Tim's ticked values, taken from the stored lookup (never from the page). p_replace: keys where he chose the public record over
-- a different value on the file or an unsigned agreement. p_keep: keys where he kept what is there (the public record is stored
-- beside it in found). Returns what was written, stored and kept, what needs his choice, and what was skipped.
create or replace function public.agent_council_accept(p_property uuid, p_lookup uuid, p_keys text[], p_replace text[] default '{}', p_keep text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.council_lookups; p public.properties; ag public.agreements; ag_signed boolean := false;
  k text; it jsonb; v text; cur text; held text; field text; d_file boolean; d_ag boolean; do_write boolean; do_store boolean;
  who text := coalesce(auth.jwt()->>'email', 'agent');
  f jsonb; pv jsonb; written jsonb := '[]'::jsonb; stored jsonb := '[]'::jsonb; kept jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
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
  if coalesce(array_length(p_keys, 1), 0) = 0 then raise exception 'Tick at least one'; end if;
  if array_length(p_keys, 1) > 80 then raise exception 'Too many at once'; end if;
  -- the newest agreement in force, and whether anyone has signed it
  select * into ag from public.agreements a where a.property_id = p_property and a.status not in ('ended', 'cancelled') order by a.created_at desc limit 1;
  if ag.id is not null then
    ag_signed := ag.status in ('signed', 'countersigned') or exists (select 1 from public.agreement_people x where x.agreement_id = ag.id and x.signed_at is not null);
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
    do_write := false; do_store := true;
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
        else conflicts := conflicts || jsonb_build_object('key', k, 'label', it->>'label', 'found', v, 'current', case when d_ag then held else cur end, 'where', case when d_ag then 'agreement' else 'file' end, 'ref', case when d_ag then ag.ref end); continue; end if;
      else do_write := true;
      end if;
      if do_write then
        if field = 'title_ref' then new_title := v; elsif field = 'legal_description' then new_legal := v; else new_desc := new_desc || jsonb_build_object('pLand', v); end if;
        -- an unsigned agreement in force is kept in step (it is where page 1 reads these from)
        if ag.id is not null and not ag_signed and field in ('title_ref', 'pLand') and not public.council_same(field, held, v) then
          if field = 'title_ref' then ag_c := ag_c || jsonb_build_object('title', v); else ag_a := ag_a || jsonb_build_object('pLand', v); end if;
          ag_keys := ag_keys || k;
        end if;
        written := written || to_jsonb(k);
        pv := pv || jsonb_build_object(field, jsonb_build_object('from', 'public_records', 'key', k, 'value', v, 'source', it->>'source',
          'source_name', it->>'source_name', 'source_url', it->>'source_url', 'as_of', it->>'as_of', 'fetched_at', it->>'fetched_at',
          'lookup_id', l.id, 'by', who, 'at', now()));
      end if;
    end if;
    -- the standard notes, whatever the stored note says
    if it->>'kind' in ('hazard', 'zone') and position(lim in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim(coalesce(it->>'note', '') || ' ' || lim));
    elsif it->>'kind' in ('valuation', 'rates') and position('not a market value' in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim('Council rating valuation (as at ' || coalesce(nullif(it->>'as_of_label', ''), 'date not given') || '), not a market value. ' || coalesce(it->>'note', '')));
    end if;
    f := f || jsonb_build_object(k, it || jsonb_build_object('value', case when field = 'pLand' then to_jsonb(v::numeric) else it->'value' end,
      'field', field, 'written', do_write, 'matched_address', l.matched_address, 'council', l.council, 'lookup_id', l.id, 'used_by', who, 'used_at', now()));
    stored := stored || to_jsonb(k);
  end loop;
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = f, provenance = pv, title_ref = new_title, legal_description = new_legal, description = new_desc where id = p_property;
  perform set_config('app.council_accept', 'off', true);
  if array_length(ag_keys, 1) > 0 then
    update public.agreements set config = ag_c, answers = ag_a where id = ag.id;
    insert into public.agreement_events (agreement_id, at, actor, kind, detail) values (ag.id, now(), who, 'public_records_applied', jsonb_build_object('keys', to_jsonb(ag_keys), 'lookup_id', l.id));
  end if;
  update public.council_lookups set property_id = p_property where id = p_lookup and property_id is null;
  return jsonb_build_object('written', written, 'stored', stored, 'kept', kept, 'conflicts', conflicts, 'skipped', skipped, 'agreement_updated', array_length(ag_keys, 1) > 0, 'ref', ag.ref);
end $$;

revoke execute on function public.agent_council_cached(text, uuid), public.agent_council_accept(uuid, uuid, text[], text[], text[]) from public, anon;
grant execute on function public.agent_council_cached(text, uuid), public.agent_council_accept(uuid, uuid, text[], text[], text[]) to authenticated;
revoke execute on function public.guard_found() from public, anon, authenticated;
revoke execute on function public.council_norm(text), public.council_same(text, text, text) from public, anon;
