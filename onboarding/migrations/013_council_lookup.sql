-- Public council records (Tim, 18 November 2026): after an address is entered, Tim can look the property up on the public
-- records of the Otago Regional Council, the district council and LINZ (fn/property_lookup.ts). Nothing found is used until
-- he ticks it and taps "Use these".
--   * council_lookups: every lookup, as a cache (reused for 30 days unless Tim taps "Look again") and an audit of what was
--     asked of whom. Agent only: vendors have no policy, so they never read it; nobody writes it directly.
--   * properties.found: the public-record values Tim accepted, each with its source, the source's own date, when it was
--     found, who used it and when. properties.provenance: per field key, where the value came from and who accepted it.
--     Both are written only by agent_council_accept (guard_found refuses any other write).
--   * Accepted values go to the matching property-file field where one exists (title_ref, legal_description, and the land
--     area pLand in description). A value already on the file is replaced only when Tim chose to (p_replace); a value that
--     an agreement in force holds differently is never written here. No agreement, signature or fingerprint is touched.
--   * Vendors: properties is readable by a party to the property (prop_party_read, migration 002), so found and provenance
--     are readable by them through the database, though no vendor screen shows them. Tim is comfortable with that (rating
--     information is public); every hazard and zone value carries "Not a substitute for a LIM."
-- Additive only: two new columns with defaults, one new table, new functions and one new trigger. No DELETE or DROP.

alter table public.properties add column if not exists found jsonb not null default '{}'::jsonb;
alter table public.properties add column if not exists provenance jsonb not null default '{}'::jsonb;

create table public.council_lookups (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  asked text not null,                       -- the address Tim typed or chose
  asked_norm text not null,                  -- the same, lower case without punctuation, for the cache
  matched_address text,                      -- the address the locator matched (always shown to Tim)
  council text,                              -- for example 'Dunedin City Council'
  result jsonb not null default '{}'::jsonb, -- what fn/property_lookup.ts returned: values, sources and their status, links
  created_by text not null,
  created_at timestamptz not null default now()
);
create index council_lookups_property_idx on public.council_lookups (property_id, created_at desc);
create index council_lookups_asked_idx on public.council_lookups (asked_norm, created_at desc);
alter table public.council_lookups enable row level security;
create policy cl_agent_read on public.council_lookups for select using (public.is_agent());
-- vendors have no policy at all, so they never read it; nobody writes it directly (the functions below do)
revoke all on public.council_lookups from anon;
revoke insert, update, delete, truncate on public.council_lookups from authenticated;

create or replace function public.council_norm(t text) returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

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

-- the newest lookup for this property or this address, if it is less than 30 days old
create or replace function public.agent_council_cached(p_asked text, p_property uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.council_lookups;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.council_lookups l
   where l.created_at > now() - interval '30 days'
     and ((p_property is not null and l.property_id = p_property)
       or (length(public.council_norm(p_asked)) >= 3 and (l.asked_norm = public.council_norm(p_asked) or public.council_norm(l.matched_address) = public.council_norm(p_asked))))
   order by (p_property is not null and l.property_id = p_property) desc, l.created_at desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'property_id', r.property_id, 'asked', r.asked, 'matched_address', r.matched_address, 'council', r.council, 'result', r.result, 'created_at', r.created_at);
end $$;

create or replace function public.agent_council_save(p_property uuid, p_asked text, p_matched text, p_council text, p_result jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if length(btrim(coalesce(p_asked, ''))) < 3 or length(p_asked) > 300 then raise exception 'Add the address'; end if;
  if length(coalesce(p_matched, '')) > 300 or length(coalesce(p_council, '')) > 120 then raise exception 'Too long'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(coalesce(p_result->'values', '[]'::jsonb)) <> 'array' then raise exception 'Not a lookup result'; end if;
  if length(p_result::text) > 200000 then raise exception 'Too much to save at once'; end if;
  if p_property is not null and not exists (select 1 from public.properties where id = p_property) then raise exception 'Property not found'; end if;
  insert into public.council_lookups (property_id, asked, asked_norm, matched_address, council, result, created_by)
  values (p_property, btrim(p_asked), public.council_norm(p_asked), nullif(btrim(coalesce(p_matched, '')), ''), nullif(btrim(coalesce(p_council, '')), ''), p_result, coalesce(auth.jwt()->>'email', 'agent'))
  returning id into nid;
  return nid;
end $$;

-- Tim's ticked values, taken from the stored lookup (never from the page). p_replace: the field keys where he chose the
-- public record over a different value already on the file. Returns what was written, stored, refused and why.
create or replace function public.agent_council_accept(p_property uuid, p_lookup uuid, p_keys text[], p_replace text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.council_lookups; p public.properties; ag public.agreements;
  k text; it jsonb; v text; cur text; held text; field text; who text := coalesce(auth.jwt()->>'email', 'agent');
  f jsonb; pv jsonb; written jsonb := '[]'::jsonb; stored jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
  new_title text; new_legal text; new_desc jsonb;
  lim constant text := 'Not a substitute for a LIM.';
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into l from public.council_lookups where id = p_lookup;
  if l.id is null then raise exception 'Lookup not found'; end if;
  if l.property_id is not null and l.property_id <> p_property then raise exception 'That lookup is for another property'; end if;
  select * into p from public.properties where id = p_property for update;
  if p.id is null then raise exception 'Property not found'; end if;
  if coalesce(array_length(p_keys, 1), 0) = 0 then raise exception 'Tick at least one'; end if;
  if array_length(p_keys, 1) > 60 then raise exception 'Too many at once'; end if;
  -- the newest agreement in force: a value it holds differently is never written to the file from here
  select * into ag from public.agreements a where a.property_id = p_property and a.status not in ('ended', 'cancelled') order by a.created_at desc limit 1;
  f := coalesce(p.found, '{}'::jsonb); pv := coalesce(p.provenance, '{}'::jsonb);
  new_title := p.title_ref; new_legal := p.legal_description; new_desc := coalesce(p.description, '{}'::jsonb);
  foreach k in array p_keys loop
    it := null;
    select x into it from jsonb_array_elements(coalesce(l.result->'values', '[]'::jsonb)) x where x->>'key' = k limit 1;
    if it is null or coalesce(it->>'checkable', 'true') = 'false' or coalesce(jsonb_typeof(it->'value'), '') not in ('string', 'number') then skipped := skipped || to_jsonb(k); continue; end if;
    v := btrim(it->>'value');
    if v = '' or length(v) > 1000 then skipped := skipped || to_jsonb(k); continue; end if;
    field := case k when 'title_ref' then 'title_ref' when 'legal_description' then 'legal_description' when 'land_area' then 'pLand' else null end;
    if field is not null then
      cur := case field when 'title_ref' then new_title when 'legal_description' then new_legal else new_desc->>'pLand' end;
      held := case field when 'title_ref' then ag.config->>'title' when 'pLand' then ag.answers->>'pLand' else null end;
      if ag.id is not null and coalesce(btrim(held), '') <> '' and btrim(held) <> v then
        conflicts := conflicts || jsonb_build_object('key', k, 'label', it->>'label', 'found', v, 'current', held, 'where', 'agreement', 'ref', ag.ref);
        continue;
      end if;
      if coalesce(btrim(cur), '') <> '' and btrim(cur) <> v and not (k = any(coalesce(p_replace, '{}'))) then
        conflicts := conflicts || jsonb_build_object('key', k, 'label', it->>'label', 'found', v, 'current', cur, 'where', 'file');
        continue;
      end if;
      if field = 'title_ref' then new_title := v; elsif field = 'legal_description' then new_legal := v; else new_desc := new_desc || jsonb_build_object('pLand', v); end if;
      written := written || to_jsonb(k);
    end if;
    -- hazards and zoning always carry the standard note
    if it->>'kind' in ('hazard', 'zone') and position(lim in coalesce(it->>'note', '')) = 0 then
      it := it || jsonb_build_object('note', btrim(coalesce(it->>'note', '') || ' ' || lim));
    end if;
    f := f || jsonb_build_object(k, (it - 'checkable') || jsonb_build_object('field', field, 'matched_address', l.matched_address, 'council', l.council, 'lookup_id', l.id, 'used_by', who, 'used_at', now()));
    pv := pv || jsonb_build_object(coalesce(field, k), jsonb_build_object('from', 'public_records', 'key', k, 'value', it->'value', 'source', it->>'source', 'source_name', it->>'source_name', 'source_url', it->>'source_url', 'as_of', it->>'as_of', 'fetched_at', it->>'fetched_at', 'by', who, 'at', now()));
    stored := stored || to_jsonb(k);
  end loop;
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = f, provenance = pv, title_ref = new_title, legal_description = new_legal, description = new_desc where id = p_property;
  perform set_config('app.council_accept', 'off', true);
  update public.council_lookups set property_id = p_property where id = p_lookup and property_id is null;
  return jsonb_build_object('written', written, 'stored', stored, 'conflicts', conflicts, 'skipped', skipped);
end $$;

revoke execute on function public.agent_council_cached(text, uuid), public.agent_council_save(uuid, text, text, text, jsonb),
  public.agent_council_accept(uuid, uuid, text[], text[]) from public, anon;
grant execute on function public.agent_council_cached(text, uuid), public.agent_council_save(uuid, text, text, text, jsonb),
  public.agent_council_accept(uuid, uuid, text[], text[]) to authenticated;
revoke execute on function public.guard_found() from public, anon, authenticated;
revoke execute on function public.council_norm(text) from public, anon;
