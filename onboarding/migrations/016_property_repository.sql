-- 016: photos and documents on the property file (Tim, 18 November 2026: "a photo and document uploader and repository that
-- can talk to dwellhub", "the property information in a format that can be sent to dwellhub").
--
-- Additive. Builds on property_documents (001), which already holds what Tim drops in (source 'dropped') and the PDFs the
-- system files after signing (source 'generated'). Nothing is dropped and nothing is deleted.
--
-- PART A (tables, functions, triggers): tested in a rollback block on the live project (tests/repo-rollback.sql).
-- PART B (the storage bucket and its policies): at the end, run once when this is applied. Not run by the rollback test.
--
-- What it does:
--   * repo_kinds: the kinds of item, the same names and folders as DwellHub's document types (one to one), plus the agency's
--     own papers (folder 'agency': never exported; appraisals, offers, identity documents, AML records and CRM exports are
--     never shared).
--   * property_documents gains: folder (set from the kind by the database), title, issued_on, mime_type, size_bytes, sha256,
--     thumb_path, bucket ('private' for everything before this; 'property-files' for new uploads), client_key (the phone's
--     id for the item, so a retry never makes a second one), inspection_id, room, caption, taken_at, width, height,
--     shared_at and shared_by (shared with the vendors), archived_at and archived_by (removed, kept), updated_at.
--   * guard_property_document: no row is ever deleted; a generated (signed) document never changes at all; where a file is,
--     what it is and its fingerprint never change once set; only a kind that may be shared can be shared; an archived item is
--     not shared; a file in the new bucket must sit under its own property's folder.
--   * property_document_events: a permanent record (added, changed, shared, unshared, archived, restored, exported).
--   * Functions (agent only unless named vendor_): agent_repo_add (files an uploaded item once the file has arrived; the same
--     client key returns the same row), agent_repo_set, agent_repo_share, agent_repo_archive, agent_property_export (the
--     "mre.property/1" JSON), vendor_repo_list (what a party to the property may see), repo_vendor_can_read (for the storage
--     policy), repo_object (internal: the stored file's size and type).

-- ═══════════════ PART A ═══════════════

create table public.repo_kinds (
  kind text primary key,
  folder text not null check (folder in ('title','council','plans','reports','work','systems','insurance','photos','rental','valuation','other','agency')),
  position integer not null,
  shareable boolean not null,   -- may be shared with the vendors
  exportable boolean not null   -- goes in the mre.property/1 export (DwellHub's own kinds only)
);
insert into public.repo_kinds (kind, folder, position, shareable, exportable) values
  ('Record of title','title',10,true,true), ('Sale and purchase agreement','title',11,false,true), ('Easement or covenant','title',12,true,true),
  ('Cross lease or unit title document','title',13,true,true),
  ('LIM report','council',20,true,true), ('Building consent','council',21,true,true), ('Code compliance certificate','council',22,true,true),
  ('Resource consent','council',23,true,true), ('Property file from council','council',24,true,true),
  ('Floor plan','plans',30,true,true), ('Building plans','plans',31,true,true), ('Survey plan','plans',32,true,true),
  ('Builder''s report','reports',40,true,true), ('Meth test','reports',41,true,true), ('Healthy homes assessment','reports',42,true,true),
  ('Electrical certificate','reports',43,true,true), ('Gas certificate','reports',44,true,true), ('Engineer''s report','reports',45,true,true),
  ('Invoice','work',50,true,true), ('Quote','work',51,true,true), ('Producer statement','work',52,true,true),
  ('Warranty','systems',60,true,true), ('Manual','systems',61,true,true), ('Service record','systems',62,true,true),
  ('Insurance policy','insurance',70,true,true), ('Insurance renewal','insurance',71,true,true), ('Insurance claim','insurance',72,true,true),
  ('Photo','photos',80,true,true),
  ('Tenancy agreement','rental',90,true,true), ('Bond lodgement','rental',91,true,true), ('Property management agreement','rental',92,true,true),
  ('Rates notice','valuation',100,true,true), ('Registered valuation','valuation',101,true,true),
  ('Listing ad','other',110,true,true), ('Other','other',111,true,true),
  ('Agency agreement','agency',200,true,false), ('Variation','agency',201,true,false), ('Notice','agency',202,true,false),
  ('Vendor Declaration','agency',203,true,false), ('Healthy Homes checklist and statement','agency',204,true,false),
  ('Marketing proof','agency',205,true,false),
  ('Appraisal','agency',210,false,false), ('Offer','agency',211,false,false), ('Identity document','agency',212,false,false),
  ('AML record','agency',213,false,false), ('CRM export','agency',214,false,false);
alter table public.repo_kinds enable row level security;
create policy rk_read on public.repo_kinds for select to authenticated using (true);
revoke insert, update, delete, truncate on public.repo_kinds from anon, authenticated;
create trigger repo_kinds_fixed before update or delete on public.repo_kinds for each row execute function public.no_change();

alter table public.property_documents
  add column folder text,
  add column title text,
  add column issued_on date,
  add column mime_type text,
  add column size_bytes bigint,
  add column sha256 text,
  add column thumb_path text,
  add column bucket text not null default 'private' check (bucket in ('private','property-files')),
  add column client_key uuid,
  add column inspection_id uuid references public.property_inspections(id),
  add column room text,
  add column caption text,
  add column taken_at timestamptz,
  add column width integer,
  add column height integer,
  add column shared_at timestamptz,
  add column shared_by text,
  add column archived_at timestamptz,
  add column archived_by text,
  add column updated_at timestamptz not null default now();
alter table public.property_documents add constraint property_documents_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
alter table public.property_documents add constraint property_documents_size_check check (size_bytes is null or (size_bytes > 0 and size_bytes <= 26214400));
alter table public.property_documents add constraint property_documents_text_check check (coalesce(length(title),0) <= 200 and coalesce(length(caption),0) <= 1000 and coalesce(length(room),0) <= 60);
create unique index property_documents_client_key on public.property_documents (client_key) where client_key is not null;
create index property_documents_inspection on public.property_documents (inspection_id) where inspection_id is not null;
-- the folder of what is already there (nothing is live yet; generated PDFs are 'Vendor Declaration' or the Healthy Homes label)
update public.property_documents d set folder = k.folder from public.repo_kinds k where k.kind = d.kind and d.folder is distinct from k.folder;

create table public.property_document_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id),
  document_id uuid references public.property_documents(id),
  at timestamptz not null default now(),
  actor text not null,
  kind text not null check (kind in ('added','changed','shared','unshared','archived','restored','exported')),
  detail jsonb not null default '{}'::jsonb
);
create index on public.property_document_events (property_id, at);
alter table public.property_document_events enable row level security;
create policy pde_agent_read on public.property_document_events for select using (public.is_agent());
revoke insert, update, delete, truncate on public.property_document_events from anon, authenticated;
create trigger property_document_events_immutable before update or delete on public.property_document_events for each row execute function public.no_change();

-- may this item be shared with the vendors? a kind from the list that may be shared, and never a generated (signed) document
create or replace function public.repo_shareable(p_kind text, p_source text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_source, '') <> 'generated' and exists (select 1 from public.repo_kinds k where k.kind = p_kind and k.shareable);
$$;
revoke execute on function public.repo_shareable(text, text) from public, anon;
grant execute on function public.repo_shareable(text, text) to authenticated;

create or replace function public.guard_property_document() returns trigger language plpgsql set search_path = public as $$
declare who text := coalesce(auth.jwt()->>'email', 'system');
begin
  if tg_op = 'DELETE' then
    raise exception 'Items on a property file are kept. Remove one with Remove, which archives it';
  end if;
  new.folder := (select k.folder from public.repo_kinds k where k.kind = new.kind);
  if new.bucket = 'property-files' and new.path not like 'properties/' || new.property_id::text || '/%' then
    raise exception 'A file must sit in its own property''s folder';
  end if;
  if new.thumb_path is not null and new.thumb_path not like 'properties/' || new.property_id::text || '/%' then
    raise exception 'A preview must sit in its own property''s folder';
  end if;
  if tg_op = 'INSERT' then
    if new.shared_at is not null or new.archived_at is not null then raise exception 'Share or remove an item after it is filed'; end if;
    new.shared_by := null; new.archived_by := null; new.updated_at := now();
    return new;
  end if;
  -- a signed document the system filed is kept exactly as it is
  if old.source = 'generated' and (to_jsonb(new) - 'updated_at' - 'folder') is distinct from (to_jsonb(old) - 'updated_at' - 'folder') then
    raise exception 'A signed document is kept exactly as it was filed';
  end if;
  if new.id <> old.id or new.property_id <> old.property_id or new.path <> old.path or new.bucket <> old.bucket or new.source <> old.source
     or new.created_at <> old.created_at or new.created_by is distinct from old.created_by
     or new.client_key is distinct from old.client_key or new.inspection_id is distinct from old.inspection_id
     or (old.thumb_path is not null and new.thumb_path is distinct from old.thumb_path)
     or (old.sha256 is not null and new.sha256 is distinct from old.sha256)
     or (old.size_bytes is not null and new.size_bytes is distinct from old.size_bytes)
     or (old.mime_type is not null and new.mime_type is distinct from old.mime_type)
     or (old.taken_at is not null and new.taken_at is distinct from old.taken_at) then
    raise exception 'Where a file is kept, what it is and its fingerprint can''t change';
  end if;
  if new.bucket = 'property-files' and not exists (select 1 from public.repo_kinds k where k.kind = new.kind) then
    raise exception 'Choose a kind from the list';
  end if;
  -- removing unshares it; restoring does not share it again
  if new.archived_at is not null and old.archived_at is null then new.shared_at := null; new.shared_by := null; new.archived_by := who; end if;
  if new.archived_at is null then new.archived_by := null; end if;
  if new.shared_at is not null then
    if new.archived_at is not null then raise exception 'A removed item can''t be shared'; end if;
    if not public.repo_shareable(new.kind, new.source) then raise exception 'This kind of item is never shared with the vendors'; end if;
    if old.shared_at is null then new.shared_by := who; else new.shared_at := old.shared_at; new.shared_by := old.shared_by; end if;
  else new.shared_by := null; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_property_document() from public, anon, authenticated;
create trigger guard_property_document before insert or update or delete on public.property_documents for each row execute function public.guard_property_document();

-- the record of what happened to each item (written by the database, never by the page)
create or replace function public.log_property_document() returns trigger language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt()->>'email', 'system'); ch jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.property_document_events (property_id, document_id, actor, kind, detail)
    values (new.property_id, new.id, who, 'added', jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'name', new.name, 'source', new.source, 'sha256', new.sha256, 'size_bytes', new.size_bytes, 'inspection_id', new.inspection_id)));
    return new;
  end if;
  foreach k in array array['kind','title','issued_on','room','caption'] loop
    if (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then ch := ch || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old)->k, 'to', to_jsonb(new)->k)); end if;
  end loop;
  if ch <> '{}'::jsonb then insert into public.property_document_events (property_id, document_id, actor, kind, detail) values (new.property_id, new.id, who, 'changed', ch); end if;
  if old.archived_at is null and new.archived_at is not null then insert into public.property_document_events (property_id, document_id, actor, kind, detail) values (new.property_id, new.id, who, 'archived', jsonb_build_object('was_shared', old.shared_at is not null)); end if;
  if old.archived_at is not null and new.archived_at is null then insert into public.property_document_events (property_id, document_id, actor, kind) values (new.property_id, new.id, who, 'restored'); end if;
  if old.shared_at is null and new.shared_at is not null then insert into public.property_document_events (property_id, document_id, actor, kind) values (new.property_id, new.id, who, 'shared'); end if;
  if old.shared_at is not null and new.shared_at is null and new.archived_at is null then insert into public.property_document_events (property_id, document_id, actor, kind) values (new.property_id, new.id, who, 'unshared'); end if;
  return new;
end $$;
revoke execute on function public.log_property_document() from public, anon, authenticated;
create trigger log_property_document after insert or update on public.property_documents for each row execute function public.log_property_document();

-- the stored file's size and type (from storage), or nothing when it hasn't arrived
create or replace function public.repo_object(p_path text) returns jsonb language sql stable security definer set search_path = public, storage as $$
  select jsonb_build_object('size', (o.metadata->>'size')::bigint, 'mime', o.metadata->>'mimetype')
  from storage.objects o where o.bucket_id = 'property-files' and o.name = p_path limit 1;
$$;
revoke execute on function public.repo_object(text) from public, anon, authenticated;

-- the types a file may be once checked on the phone (the bucket allows the same list)
create or replace function public.repo_mime_ok(p_mime text) returns boolean language sql immutable set search_path = public as $$
  select p_mime = any (array['application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword','application/vnd.ms-excel','text/plain','text/csv']);
$$;

-- files an item the phone has uploaded. p_item: key, kind, title, name, path, thumb_path, mime_type, size_bytes, sha256,
-- issued_on, room, caption, taken_at, width, height, inspection_id. The same key again returns the same row (a retry after the
-- answer was lost), so nothing is ever filed twice.
create or replace function public.agent_repo_add(p_property uuid, p_item jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare k uuid; ex record; kd record; obj jsonb; th jsonb; nm text; pth text; tp text; mm text; sz bigint; sh text; iid uuid; rid uuid; photo boolean;
begin
  if not public.is_agent() then raise exception 'Only Tim can add to a property file'; end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'Nothing to file'; end if;
  begin k := (p_item->>'key')::uuid; exception when others then k := null; end;
  if k is null then raise exception 'Each item needs its own key'; end if;
  select id, property_id into ex from public.property_documents where client_key = k;
  if ex.id is not null then
    if ex.property_id <> p_property then raise exception 'That item is filed on another property'; end if;
    return jsonb_build_object('id', ex.id, 'existing', true);
  end if;
  if not exists (select 1 from public.properties where id = p_property) then raise exception 'Property not found'; end if;
  select * into kd from public.repo_kinds where kind = p_item->>'kind';
  if kd.kind is null then raise exception 'Choose a kind from the list'; end if;
  photo := kd.kind = 'Photo';
  nm := left(regexp_replace(coalesce(p_item->>'name', ''), '[[:cntrl:]/\\]', '', 'g'), 200);
  if nm = '' then raise exception 'The item needs a file name'; end if;
  pth := p_item->>'path'; tp := nullif(p_item->>'thumb_path', '');
  if photo then
    if pth is distinct from 'properties/' || p_property || '/photos/' || k || '.jpg' then raise exception 'A photo is stored at its own key'; end if;
  elsif pth is null or pth !~ ('^properties/' || p_property || '/docs/' || k || '-[A-Za-z0-9._-]{1,120}$') then raise exception 'A document is stored at its own key';
  end if;
  if tp is not null and tp is distinct from 'properties/' || p_property || (case when photo then '/photos/' else '/docs/' end) || k || '.thumb.jpg' then raise exception 'A preview is stored beside its item'; end if;
  mm := p_item->>'mime_type';
  if not public.repo_mime_ok(mm) then raise exception 'That type of file isn''t accepted'; end if;
  if photo and mm <> 'image/jpeg' then raise exception 'Photos are stored as JPEG'; end if;
  begin sz := (p_item->>'size_bytes')::bigint; exception when others then sz := null; end;
  if sz is null or sz <= 0 or sz > 26214400 then raise exception 'Files can be up to 25 MB'; end if;
  sh := p_item->>'sha256';
  if sh is null or sh !~ '^[0-9a-f]{64}$' then raise exception 'The item needs its fingerprint'; end if;
  obj := public.repo_object(pth);
  if obj is null then raise exception 'The file hasn''t arrived yet'; end if;
  if (obj->>'size')::bigint is distinct from sz or (obj->>'mime') is distinct from mm then raise exception 'The stored file doesn''t match what the phone sent'; end if;
  if tp is not null then th := public.repo_object(tp); if th is null or (th->>'mime') is distinct from 'image/jpeg' then raise exception 'The preview hasn''t arrived yet'; end if; end if;
  if nullif(p_item->>'inspection_id', '') is not null then
    begin iid := (p_item->>'inspection_id')::uuid; exception when others then raise exception 'Inspection not found'; end;
    if not exists (select 1 from public.property_inspections i where i.id = iid and i.property_id = p_property) then raise exception 'That inspection is of another property'; end if;
  end if;
  begin
    insert into public.property_documents (property_id, kind, name, title, path, thumb_path, bucket, source, created_by, mime_type, size_bytes, sha256,
      client_key, inspection_id, room, caption, issued_on, taken_at, width, height)
    values (p_property, kd.kind, nm, left(nullif(trim(coalesce(p_item->>'title', '')), ''), 200), pth, tp, 'property-files', 'uploaded', coalesce(auth.jwt()->>'email', 'agent'), mm, sz, sh,
      k, iid, left(nullif(trim(coalesce(p_item->>'room', '')), ''), 60), left(nullif(trim(coalesce(p_item->>'caption', '')), ''), 1000),
      case when coalesce(p_item->>'issued_on', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_item->>'issued_on')::date end,
      case when coalesce(p_item->>'taken_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (p_item->>'taken_at')::timestamptz end,
      case when coalesce(p_item->>'width', '') ~ '^\d{1,5}$' then (p_item->>'width')::int end,
      case when coalesce(p_item->>'height', '') ~ '^\d{1,5}$' then (p_item->>'height')::int end)
    returning id into rid;
  exception when unique_violation then
    select id, property_id into ex from public.property_documents where client_key = k;
    if ex.property_id <> p_property then raise exception 'That item is filed on another property'; end if;
    return jsonb_build_object('id', ex.id, 'existing', true);
  end;
  return jsonb_build_object('id', rid, 'existing', false);
end $$;
revoke execute on function public.agent_repo_add(uuid, jsonb) from public, anon;
grant execute on function public.agent_repo_add(uuid, jsonb) to authenticated;

-- kind, title, date issued, room and caption (a blank clears)
create or replace function public.agent_repo_set(p_id uuid, p_patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if not public.is_agent() then raise exception 'Only Tim can change a property file'; end if;
  select * into d from public.property_documents where id = p_id;
  if d.id is null then raise exception 'Not found'; end if;
  if p_patch ? 'kind' and not exists (select 1 from public.repo_kinds where kind = p_patch->>'kind') then raise exception 'Choose a kind from the list'; end if;
  if p_patch ? 'issued_on' and coalesce(p_patch->>'issued_on', '') <> '' and (p_patch->>'issued_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Check the date'; end if;
  update public.property_documents set
    kind = case when p_patch ? 'kind' then p_patch->>'kind' else kind end,
    title = case when p_patch ? 'title' then left(nullif(trim(coalesce(p_patch->>'title', '')), ''), 200) else title end,
    issued_on = case when p_patch ? 'issued_on' then nullif(p_patch->>'issued_on', '')::date else issued_on end,
    room = case when p_patch ? 'room' then left(nullif(trim(coalesce(p_patch->>'room', '')), ''), 60) else room end,
    caption = case when p_patch ? 'caption' then left(nullif(trim(coalesce(p_patch->>'caption', '')), ''), 1000) else caption end
  where id = p_id;
end $$;
revoke execute on function public.agent_repo_set(uuid, jsonb) from public, anon;
grant execute on function public.agent_repo_set(uuid, jsonb) to authenticated;

create or replace function public.agent_repo_share(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Only Tim can share from a property file'; end if;
  if not exists (select 1 from public.property_documents where id = p_id) then raise exception 'Not found'; end if;
  update public.property_documents set shared_at = case when p_on then coalesce(shared_at, now()) else null end where id = p_id;
end $$;
revoke execute on function public.agent_repo_share(uuid, boolean) from public, anon;
grant execute on function public.agent_repo_share(uuid, boolean) to authenticated;

-- remove (archive) or restore; never a delete. Generated documents refuse (guard_property_document).
create or replace function public.agent_repo_archive(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Only Tim can remove from a property file'; end if;
  if not exists (select 1 from public.property_documents where id = p_id) then raise exception 'Not found'; end if;
  update public.property_documents set archived_at = case when p_on then coalesce(archived_at, now()) else null end where id = p_id;
end $$;
revoke execute on function public.agent_repo_archive(uuid, boolean) from public, anon;
grant execute on function public.agent_repo_archive(uuid, boolean) to authenticated;

-- what a party to the property may see: items Tim shared, not removed, of a kind that may be shared, never a generated one
create or replace function public.vendor_repo_list(p_property uuid) returns table (id uuid, kind text, folder text, title text, name text, issued_on date,
  mime_type text, size_bytes bigint, path text, thumb_path text, room text, caption text, taken_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.kind, d.folder, d.title, d.name, d.issued_on, d.mime_type, d.size_bytes, d.path, d.thumb_path, d.room, d.caption, d.taken_at, d.created_at
  from public.property_documents d
  where d.property_id = p_property and public.is_property_party(p_property) and d.bucket = 'property-files'
    and d.shared_at is not null and d.archived_at is null and public.repo_shareable(d.kind, d.source)
  order by d.folder, d.created_at desc;
$$;
revoke execute on function public.vendor_repo_list(uuid) from public, anon;
grant execute on function public.vendor_repo_list(uuid) to authenticated;

-- the storage policy's question: may this signed-in person read this file (an item or its preview) from property-files?
create or replace function public.repo_vendor_can_read(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.property_documents d
    where d.bucket = 'property-files' and (d.path = p_name or d.thumb_path = p_name)
      and d.shared_at is not null and d.archived_at is null and public.repo_shareable(d.kind, d.source) and public.is_property_party(d.property_id));
$$;
revoke execute on function public.repo_vendor_can_read(text) from public, anon;
grant execute on function public.repo_vendor_can_read(text) to authenticated;

-- the property as one JSON document, schema "mre.property/1" (onboarding/schema/mre.property-1.schema.json): the facts, the
-- public record values with their source and date, and the items (no file contents). Nothing about the people: no owners,
-- names, emails, phones or the owners on the title, and not what the vendors love about the place (their own words).
-- Left out and counted: agency papers, removed items, items with no kind from the list, and items filed before this
-- migration without a fingerprint.
create or replace function public.agent_property_export(p_property uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; d jsonb; s jsonb; land numeric; items jsonb; recs jsonb; prov jsonb; lo jsonb; out jsonb;
begin
  if not public.is_agent() then raise exception 'Only Tim can export a property file'; end if;
  select * into p from public.properties where id = p_property;
  if p.id is null then raise exception 'Property not found'; end if;
  d := coalesce(p.description, '{}'::jsonb); s := coalesce(p.disclosures, '{}'::jsonb);
  land := case when coalesce(d->>'pLand', '') ~ '^\s*\d+(\.\d+)?\s*(m2|m²|sqm|square metres)?\s*$' then substring(d->>'pLand' from '\d+(?:\.\d+)?')::numeric end;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', e.key, 'label', e.value->'label', 'value', e.value->'value', 'display', e.value->'display',
      'note', e.value->'note', 'source', e.value->'source', 'source_name', e.value->'source_name', 'source_url', e.value->'source_url',
      'as_of', e.value->'as_of', 'as_of_label', e.value->'as_of_label', 'fetched_at', e.value->'fetched_at')) order by e.key), '[]'::jsonb)
    into recs from jsonb_each(case when jsonb_typeof(p.found) = 'object' then p.found else '{}'::jsonb end) e where jsonb_typeof(e.value) = 'object';
  select coalesce(jsonb_object_agg(e.key, jsonb_strip_nulls(jsonb_build_object('from', e.value->'from', 'source', e.value->'source', 'source_name', e.value->'source_name',
      'as_of', e.value->'as_of', 'as_of_label', e.value->'as_of_label'))), '{}'::jsonb)
    into prov from jsonb_each(case when jsonb_typeof(p.provenance) = 'object' then p.provenance else '{}'::jsonb end) e where jsonb_typeof(e.value) = 'object';
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', x.id, 'kind', x.kind, 'folder', x.folder, 'title', coalesce(x.title, x.name), 'file_name', x.name,
      'date', to_char(coalesce(x.issued_on, (x.taken_at at time zone 'Pacific/Auckland')::date, (x.created_at at time zone 'Pacific/Auckland')::date), 'YYYY-MM-DD'),
      'issued_on', to_char(x.issued_on, 'YYYY-MM-DD'), 'taken_at', x.taken_at, 'added_at', x.created_at, 'size_bytes', x.size_bytes, 'sha256', x.sha256,
      'mime_type', x.mime_type, 'room', x.room, 'caption', x.caption, 'width', x.width, 'height', x.height, 'origin', x.source,
      'shared_with_vendors', x.shared_at is not null)) order by k.position, x.created_at), '[]'::jsonb)
    into items from public.property_documents x join public.repo_kinds k on k.kind = x.kind
    where x.property_id = p_property and x.archived_at is null and x.source <> 'generated' and k.exportable and x.sha256 is not null and x.size_bytes is not null and x.mime_type is not null;
  select jsonb_build_object(
      'agency_papers', count(*) filter (where x.archived_at is null and (x.source = 'generated' or k.folder = 'agency')),
      'removed', count(*) filter (where x.archived_at is not null),
      'not_sorted', count(*) filter (where x.archived_at is null and x.source <> 'generated' and k.kind is null),
      'missing_details', count(*) filter (where x.archived_at is null and x.source <> 'generated' and k.exportable and (x.sha256 is null or x.size_bytes is null or x.mime_type is null)))
    into lo from public.property_documents x left join public.repo_kinds k on k.kind = x.kind where x.property_id = p_property;
  out := jsonb_build_object(
    'schema', 'mre.property/1',
    'exported_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'source', jsonb_build_object('system', 'dunnerstunner onboarding', 'agency', 'McGuire Real Estate Limited'),
    'property', jsonb_strip_nulls(jsonb_build_object('ref', p.id, 'address', p.address, 'title_ref', nullif(p.title_ref, ''), 'legal_description', nullif(p.legal_description, ''),
      'land_area_m2', land,
      'description', jsonb_strip_nulls(jsonb_build_object('type', d->'pType', 'year_built', d->'pYear', 'bedrooms', d->'pBed', 'bathrooms', d->'pBath', 'floor_area', d->'pFloor',
        'land_area', d->'pLand', 'construction', d->'pBuild', 'parking', d->'pPark', 'heating', d->'pHeat', 'chattels', d->'chattels', 'other_chattels', d->'chatOther')),
      'disclosures', jsonb_strip_nulls(jsonb_build_object('work', s->'work', 'work_detail', s->'workDetail', 'weathertightness', s->'wt', 'weathertightness_detail', s->'wtDetail',
        'meth', s->'meth', 'meth_detail', s->'methDetail', 'defects', s->'def', 'defects_detail', s->'defDetail', 'hazards', s->'hazards', 'hazards_other', s->'hazOther')),
      'provenance', prov)),
    'public_records', recs,
    'items', items,
    'left_out', lo);
  insert into public.property_document_events (property_id, actor, kind, detail)
  values (p_property, coalesce(auth.jwt()->>'email', 'agent'), 'exported', jsonb_build_object('schema', 'mre.property/1', 'items', jsonb_array_length(items), 'public_records', jsonb_array_length(recs)));
  return out;
end $$;
revoke execute on function public.agent_property_export(uuid) from public, anon;
grant execute on function public.agent_property_export(uuid) to authenticated;

-- ═══════════════ PART B: the storage bucket (run once when applied; not run by the rollback test) ═══════════════
-- A private bucket of its own, so its limits (25 MB, the accepted types) don't touch the 'private' bucket's signatures,
-- imports and Quiet List files. Read only through signed links. Tim adds files; nobody overwrites or deletes one (no
-- update or delete policy). A party to the property may read a file (and its preview) only while Tim shares it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-files', 'property-files', false, 26214400, array['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.ms-excel','text/plain','text/csv'])
on conflict (id) do nothing;
create policy repo_agent_read on storage.objects for select to authenticated using (bucket_id = 'property-files' and public.is_agent());
create policy repo_agent_add on storage.objects for insert to authenticated with check (bucket_id = 'property-files' and public.is_agent()
  and (storage.foldername(name))[1] = 'properties' and (storage.foldername(name))[3] in ('docs', 'photos'));
create policy repo_party_read on storage.objects for select to authenticated using (bucket_id = 'property-files' and public.repo_vendor_can_read(name));
