-- A local PostgreSQL 16 stand-in for migration 035's rollback test (tests/appraisal-reports-rollback.js). NEVER run on the live project.
-- Run on an empty database, in this order (each with psql -v ON_ERROR_STOP=1 -f):
--   1. tests/appraisal-setup-standin.sql, 2. migrations/033_appraisal_setup.sql, 3. tests/appraisal-comps-standin.sql,
--   4. migrations/034_appraisal_comps.sql (035 builds on 034, which is not live yet), 5. this file. Then the rollback block.
-- What 035 adds to beyond 034: the one store for documents (016 and 019), at its LIVE definition, read with SELECTs on pg_catalog and
-- information_schema on 27 November 2026 (nothing was written there): property_documents with its live columns, checks and foreign
-- keys, Row Level Security and its live policy and grants; repo_kinds with every live kind; property_document_events; these functions
-- word for word (the block at the end refuses to finish if any differs from the live md5): repo_shareable, guard_property_document,
-- log_property_document, repo_object, repo_mime_ok, agent_repo_add, guard_blank_document, no_change; and the live triggers on
-- property_documents. Left out: profile_from_document (028), which fires only for an official document's read_result, kind or
-- removal (a comparables report is never one), and property_inspections beyond the two columns its foreign key and agent_repo_add use.
-- The live storage policies on property-files are added (agent add and read).

create table public.property_inspections (id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id));
create or replace function public.no_change() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Records in % cannot be changed or deleted', tg_table_name; end $$;
create table public.repo_kinds (
  kind text primary key,
  folder text not null check (folder in ('title','council','plans','reports','work','systems','insurance','photos','rental','valuation','other','agency')),
  position integer not null, shareable boolean not null, exportable boolean not null);
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
insert into public.repo_kinds (kind, folder, position, shareable, exportable) values ('REINZ agreement blank', 'agency', 215, false, false);
alter table public.repo_kinds enable row level security;
create policy rk_read on public.repo_kinds for select to authenticated using (true);
revoke insert, update, delete, truncate, references, trigger on public.repo_kinds from anon, authenticated;
create trigger repo_kinds_fixed before update or delete on public.repo_kinds for each row execute function public.no_change();

create table public.property_documents (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade, kind text, name text not null, path text not null,
  source text not null default 'dropped' check (source = any (array['dropped', 'uploaded', 'generated'])), created_by text, created_at timestamptz not null default now(), read_result jsonb,
  folder text, title text, issued_on date, mime_type text, size_bytes bigint, sha256 text, thumb_path text, bucket text not null default 'private' check (bucket = any (array['private', 'property-files'])),
  client_key uuid, inspection_id uuid references public.property_inspections(id), room text, caption text, taken_at timestamptz, width integer, height integer,
  shared_at timestamptz, shared_by text, archived_at timestamptz, archived_by text, updated_at timestamptz not null default now(),
  constraint property_documents_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint property_documents_size_check check (size_bytes is null or (size_bytes > 0 and size_bytes <= 26214400)),
  constraint property_documents_text_check check (coalesce(length(title),0) <= 200 and coalesce(length(caption),0) <= 1000 and coalesce(length(room),0) <= 60));
create unique index property_documents_client_key on public.property_documents (client_key) where client_key is not null;
alter table public.property_documents enable row level security;
create policy pd_agent on public.property_documents for all using (public.is_agent()) with check (public.is_agent());
revoke truncate, references, trigger on public.property_documents from anon, authenticated;
create table public.property_document_events (
  id bigint generated always as identity primary key, property_id uuid not null references public.properties(id), document_id uuid references public.property_documents(id),
  at timestamptz not null default now(), actor text not null, kind text not null check (kind in ('added','changed','shared','unshared','archived','restored','exported')), detail jsonb not null default '{}'::jsonb);
alter table public.property_document_events enable row level security;
create policy pde_agent_read on public.property_document_events for select using (public.is_agent());
revoke insert, update, delete, truncate, references, trigger on public.property_document_events from anon, authenticated;

create or replace function public.repo_shareable(p_kind text, p_source text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_source, '') <> 'generated' and exists (select 1 from public.repo_kinds k where k.kind = p_kind and k.shareable);
$$;
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
    if new.bucket <> 'property-files' then raise exception 'Only a file added under Photos and documents can be shared'; end if;
    if not public.repo_shareable(new.kind, new.source) then raise exception 'This kind of item is never shared with the vendors'; end if;
    if old.shared_at is null then new.shared_by := who; else new.shared_at := old.shared_at; new.shared_by := old.shared_by; end if;
  else new.shared_by := null; end if;
  new.updated_at := now();
  return new;
end $$;
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
create or replace function public.repo_object(p_path text) returns jsonb language sql stable security definer set search_path = public, storage as $$
  select jsonb_build_object('size', (o.metadata->>'size')::bigint, 'mime', o.metadata->>'mimetype')
  from storage.objects o where o.bucket_id = 'property-files' and o.name = p_path limit 1;
$$;
create or replace function public.repo_mime_ok(p_mime text) returns boolean language sql immutable set search_path = public as $$
  select p_mime = any (array['application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword','application/vnd.ms-excel','text/plain','text/csv']);
$$;
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

create or replace function public.guard_blank_document() returns trigger language plpgsql set search_path = public as $$
begin
  if old.kind = 'REINZ agreement blank' and (new.kind is distinct from old.kind or new.shared_at is not null) then raise exception 'An agreement blank stays an agreement blank, and is never shared'; end if;
  if new.kind = 'REINZ agreement blank' and old.kind is distinct from new.kind then raise exception 'Load an agreement blank from the property''s Offers tile'; end if;
  return new;
end $$;
create trigger guard_property_document before insert or update or delete on public.property_documents for each row execute function public.guard_property_document();
create trigger log_property_document after insert or update on public.property_documents for each row execute function public.log_property_document();
create trigger guard_blank_document before update on public.property_documents for each row execute function public.guard_blank_document();
revoke execute on function public.agent_repo_add(uuid, jsonb) from public, anon;
grant execute on function public.agent_repo_add(uuid, jsonb) to authenticated;
revoke execute on function public.repo_object(text) from public, anon, authenticated;
revoke execute on function public.guard_property_document() from public, anon, authenticated;
revoke execute on function public.log_property_document() from public, anon, authenticated;

create policy repo_agent_add on storage.objects for insert to authenticated with check (bucket_id = 'property-files' and public.is_agent()
  and (storage.foldername(name))[1] = 'properties' and (storage.foldername(name))[3] = any (array['docs', 'photos']));

-- these functions here must be the live ones, word for word (md5 of each body, read live on 27 November 2026)
do $c$
declare x text;
begin
  select string_agg(proname || '=' || md5(prosrc), ',' order by proname) into x from pg_proc
    where pronamespace = 'public'::regnamespace and proname in ('agent_repo_add', 'guard_blank_document', 'guard_property_document', 'log_property_document', 'no_change', 'repo_mime_ok', 'repo_object', 'repo_shareable');
  if x is distinct from 'agent_repo_add=1a8a4a0232c673908377564fafb77f64,guard_blank_document=3055e87f77c0002f79bbd5f332bcc1b6,guard_property_document=bf54f8fcea63eabb005f9512f842eeb9,log_property_document=3328bb9efc00d7ccdc59ee0a41da7648,no_change=b447dd5e6b40d08dbe4e3e8e97dc521d,repo_mime_ok=4f38bf11a51ae66e43a680ef5c44dde8,repo_object=0d412c6a57d02c95ba79f87fefcefa58,repo_shareable=999173f4aba51ec4516c778c3d9fef5a' then
    raise exception 'stand-in differs from live: %', x;
  end if;
end $c$;
