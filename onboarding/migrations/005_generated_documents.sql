-- Phase 2: generated documents. The Vendor Declaration and the Healthy Homes checklist and statement are
-- filled in on screen after the agreement is signed, signed with the same pad, and filed on the property as PDFs.
-- The licensee countersigns the Vendor Declaration once the vendors have signed. The REA sale and purchase guide
-- gets its own dated receipt ("Before you sell").
-- Additive only: no existing table, trigger, signature or fingerprint is changed.

-- one form per agreement and kind; data is the vendors' answers, agent_data is Tim's (Healthy Homes measurements)
create table public.property_forms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  agreement_id uuid not null references public.agreements(id),
  kind text not null check (kind in ('vendor_declaration','healthy_homes')),
  form_version text not null,
  status text not null default 'draft' check (status in ('draft','ready','signed')),
  data jsonb not null default '{}'::jsonb,
  agent_data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  signed_at timestamptz,                            -- every vendor (landlord) has signed
  countersigned_at timestamptz,                     -- the licensee has signed (Vendor Declaration)
  filing_at timestamptz,                            -- the PDF is being made (claimed by one call at a time)
  document_id uuid references public.property_documents(id),
  pdf_error text,
  unique (agreement_id, kind)
);
create index on public.property_forms (property_id);

create table public.form_signatures (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.property_forms(id),
  agreement_id uuid not null references public.agreements(id),
  person_id uuid references public.agreement_people(id),
  signer_role text not null default 'client' check (signer_role in ('client','agent')),
  signer_name text not null,
  image_path text,
  snapshot jsonb not null,
  snapshot_sha256 text not null,
  user_agent text,
  signed_at timestamptz not null default now()
);
create index on public.form_signatures (form_id);

create table public.guide_receipts (
  id bigint generated always as identity primary key,
  agreement_id uuid not null references public.agreements(id),
  person_id uuid not null references public.agreement_people(id),
  guide text not null check (guide in ('sale_purchase')),
  version text not null check (version <> ''),
  file text not null check (file ~ '^[A-Za-z0-9._-]+\.pdf$'),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  user_agent text,
  unique (person_id, guide, version)
);

-- signatures and receipts are permanent, like the agreement's own signatures
create trigger form_signatures_immutable before update or delete on public.form_signatures for each row execute function public.no_change();
create trigger guide_receipts_immutable before update or delete on public.guide_receipts for each row execute function public.no_change();
create trigger touch_property_forms before update on public.property_forms for each row execute function public.touch_updated();

-- Signing and filing are only done by the functions below (and the edge function's service role): a write made
-- directly by a signed-in user can't mark a form signed, countersigned, filed or being filed. Once anyone has
-- signed, what they signed can't change and the form can't be removed.
create or replace function public.guard_form() returns trigger language plpgsql set search_path = public as $$
declare signed boolean; direct boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if direct and (new.status = 'signed' or new.signed_at is not null or new.countersigned_at is not null or new.document_id is not null or new.filing_at is not null) then
      raise exception 'A document is only signed or filed by signing it';
    end if;
    return new;
  end if;
  select exists (select 1 from public.form_signatures where form_id = old.id) into signed;
  if tg_op = 'DELETE' then
    if signed then raise exception 'This document has been signed, so it can''t be removed'; end if;
    return old;
  end if;
  if direct and ((new.status = 'signed') is distinct from (old.status = 'signed') or new.signed_at is distinct from old.signed_at
     or new.countersigned_at is distinct from old.countersigned_at or new.document_id is distinct from old.document_id or new.filing_at is distinct from old.filing_at) then
    raise exception 'A document is only signed or filed by signing it';
  end if;
  if signed then
    if new.data is distinct from old.data or new.agent_data is distinct from old.agent_data or new.kind is distinct from old.kind
       or new.form_version is distinct from old.form_version or new.agreement_id is distinct from old.agreement_id or new.property_id is distinct from old.property_id then
      raise exception 'This document has been signed, so it can no longer be changed';
    end if;
    if old.status = 'signed' and new.status <> 'signed' then raise exception 'This document has been signed by everyone'; end if;
    if old.countersigned_at is not null and new.countersigned_at is distinct from old.countersigned_at then raise exception 'This document has been countersigned'; end if;
    if old.document_id is not null and new.document_id is distinct from old.document_id then raise exception 'This document has been filed'; end if;
  end if;
  return new;
end $$;
create trigger guard_form before insert or update or delete on public.property_forms for each row execute function public.guard_form();

alter table public.property_forms enable row level security;
alter table public.form_signatures enable row level security;
alter table public.guide_receipts enable row level security;
create policy pf_agent on public.property_forms for all using (public.is_agent()) with check (public.is_agent());
create policy pf_party_read on public.property_forms for select using (public.is_party(agreement_id));
create policy fs_agent_read on public.form_signatures for select using (public.is_agent());
create policy fs_party_read on public.form_signatures for select using (public.is_party(agreement_id));
create policy gr_agent_read on public.guide_receipts for select using (public.is_agent());
create policy gr_party_read on public.guide_receipts for select using (public.is_party(agreement_id));

-- the current wording of each form; recorded on the form when it is started (the PDF prints that wording)
create or replace function public.form_version(k text) returns text language sql immutable as $$
  select case k when 'vendor_declaration' then 'VD-2026-11' when 'healthy_homes' then 'HH-2026-11' end;
$$;

-- a vendor who signed the agreement starts (or reopens) a form for it
create or replace function public.vendor_form_start(a uuid, p_kind text) returns uuid language plpgsql security definer set search_path = public as $$
declare ag public.agreements; fid uuid;
begin
  if not public.is_party(a) then raise exception 'Not your agreement'; end if;
  select * into ag from public.agreements where id = a;
  if ag.status not in ('signed','countersigned') then raise exception 'This comes after the agreement is signed'; end if;
  if public.form_version(p_kind) is null then raise exception 'Unknown document'; end if;
  if ag.property_id is null then raise exception 'This agreement has no property file'; end if;
  select id into fid from public.property_forms where agreement_id = a and kind = p_kind;
  if fid is not null then return fid; end if;
  insert into public.property_forms (property_id, agreement_id, kind, form_version, created_by)
  values (ag.property_id, a, p_kind, public.form_version(p_kind), coalesce(auth.jwt()->>'email','vendor')) returning id into fid;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'form_started', jsonb_build_object('form', p_kind));
  return fid;
end $$;

-- vendors fill in the declaration; Tim fills in the Healthy Homes measurements himself (agent policy)
create or replace function public.vendor_form_save(f uuid, patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare fm public.property_forms;
begin
  select * into fm from public.property_forms where id = f for update;
  if fm.id is null or not public.is_party(fm.agreement_id) then raise exception 'Not found'; end if;
  if fm.kind <> 'vendor_declaration' then raise exception 'Tim fills in this one'; end if;
  if fm.status <> 'draft' then raise exception 'This document can no longer be changed'; end if;
  if jsonb_typeof(patch) <> 'object' or length(patch::text) > 60000 then raise exception 'Too much to save at once'; end if;
  update public.property_forms set data = data || patch where id = f;
end $$;

-- checks shared by every way of signing a form: the agreement is still in force, the form isn't finished,
-- and the signature image was uploaded for this form and this signer
create or replace function public.form_sign_check(fm public.property_forms, signer text, p_image_path text) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.agreements where id = fm.agreement_id and status in ('signed','countersigned')) then
    raise exception 'The agreement for this document is no longer in force';
  end if;
  if coalesce(p_image_path, '') not like 'agreements/' || fm.agreement_id::text || '/signatures/%form-' || fm.id::text || '-' || signer || '-%' then
    raise exception 'Bad signature path';
  end if;
end $$;
revoke execute on function public.form_sign_check(public.property_forms, text, text) from public, anon, authenticated;

-- everyone who signed the agreement signs the form; it is signed when the last of them has
create or replace function public.form_after_sign(fm public.property_forms) returns int language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  select count(*) into remaining from public.agreement_people p
   where p.agreement_id = fm.agreement_id and p.legal_name <> '' and p.signed_at is not null
     and not exists (select 1 from public.form_signatures s where s.form_id = fm.id and s.person_id = p.id);
  if remaining = 0 then
    update public.properties set updated_at = now() where id = fm.property_id;
    update public.property_forms set status = 'signed', signed_at = now() where id = fm.id;
    perform public.log_event(fm.agreement_id, 'system', 'form_all_signed', jsonb_build_object('form', fm.kind));
  end if;
  return remaining;
end $$;
revoke execute on function public.form_after_sign(public.property_forms) from public, anon, authenticated;

create or replace function public.vendor_form_sign(f uuid, p_image_path text, p_snapshot jsonb, p_user_agent text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare fm public.property_forms; me public.agreement_people; snap jsonb;
begin
  select * into fm from public.property_forms where id = f for update;
  if fm.id is null or not public.is_party(fm.agreement_id) then raise exception 'Not found'; end if;
  if fm.status = 'signed' then raise exception 'Already signed by everyone'; end if;
  if fm.kind = 'healthy_homes' and fm.status <> 'ready' then raise exception 'Tim hasn''t finished the checklist yet'; end if;
  select * into me from public.agreement_people where agreement_id = fm.agreement_id and user_id = auth.uid() and signed_at is not null limit 1;
  if me.id is null then raise exception 'Signer not found'; end if;
  if exists (select 1 from public.form_signatures where form_id = f and person_id = me.id) then raise exception 'Already signed'; end if;
  perform public.form_sign_check(fm, me.id::text, p_image_path);
  -- the fingerprint covers exactly what is stored on the form, whatever the page sent
  snap := p_snapshot || jsonb_build_object('form_kind', fm.kind, 'form_version', fm.form_version, 'form_data', fm.data, 'agent_data', fm.agent_data);
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, image_path, snapshot, snapshot_sha256, user_agent)
  values (f, fm.agreement_id, me.id, 'client', me.legal_name, p_image_path, snap, encode(digest(snap::text, 'sha256'), 'hex'), p_user_agent);
  perform public.log_event(fm.agreement_id, coalesce(auth.jwt()->>'email','vendor'), 'form_signed', jsonb_build_object('form', fm.kind, 'name', me.legal_name));
  return jsonb_build_object('remaining', public.form_after_sign(fm));
end $$;

create or replace function public.agent_form_sign_in_person(f uuid, pid uuid, p_image_path text, p_snapshot jsonb, p_user_agent text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare fm public.property_forms; pr public.agreement_people; snap jsonb;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select * into fm from public.property_forms where id = f for update;
  if fm.id is null then raise exception 'Not found'; end if;
  if fm.status = 'signed' then raise exception 'Already signed by everyone'; end if;
  if fm.kind = 'healthy_homes' and fm.status <> 'ready' then raise exception 'Finish the checklist first'; end if;
  select * into pr from public.agreement_people where id = pid and agreement_id = fm.agreement_id and signed_at is not null;
  if pr.id is null then raise exception 'Signer not found'; end if;
  if exists (select 1 from public.form_signatures where form_id = f and person_id = pr.id) then raise exception 'Already signed'; end if;
  perform public.form_sign_check(fm, pr.id::text, p_image_path);
  snap := p_snapshot || jsonb_build_object('form_kind', fm.kind, 'form_version', fm.form_version, 'form_data', fm.data, 'agent_data', fm.agent_data,
                                           'signing_method', 'In person, on the licensee''s device', 'witnessed_by', 'Timothy McGuire');
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, image_path, snapshot, snapshot_sha256, user_agent)
  values (f, fm.agreement_id, pr.id, 'client', pr.legal_name, p_image_path, snap, encode(digest(snap::text, 'sha256'), 'hex'), p_user_agent);
  perform public.log_event(fm.agreement_id, coalesce(auth.jwt()->>'email','agent'), 'form_signed', jsonb_build_object('form', fm.kind, 'name', pr.legal_name, 'method', 'in person on licensee device'));
  return jsonb_build_object('remaining', public.form_after_sign(fm));
end $$;

-- the licensee signs the Vendor Declaration after the vendors, as the form says ("the Licensee, who has also signed below")
create or replace function public.agent_form_countersign(f uuid, p_image_path text, p_snapshot jsonb, p_user_agent text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare fm public.property_forms; snap jsonb;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select * into fm from public.property_forms where id = f for update;
  if fm.id is null then raise exception 'Not found'; end if;
  if fm.kind <> 'vendor_declaration' then raise exception 'Only the Vendor Declaration is countersigned'; end if;
  if fm.status <> 'signed' then raise exception 'Every vendor signs first'; end if;
  if fm.countersigned_at is not null then raise exception 'Already countersigned'; end if;
  perform public.form_sign_check(fm, 'agent', p_image_path);
  snap := p_snapshot || jsonb_build_object('form_kind', fm.kind, 'form_version', fm.form_version, 'form_data', fm.data, 'agent_data', fm.agent_data,
            'countersigned_by', 'Timothy McGuire REA#20117983, for McGuire Real Estate Limited',
            'vendor_signatures', (select jsonb_agg(snapshot_sha256 order by signed_at) from public.form_signatures where form_id = f and signer_role = 'client'));
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, image_path, snapshot, snapshot_sha256, user_agent)
  values (f, fm.agreement_id, null, 'agent', 'Timothy McGuire', p_image_path, snap, encode(digest(snap::text, 'sha256'), 'hex'), p_user_agent);
  update public.property_forms set countersigned_at = now() where id = f;
  perform public.log_event(fm.agreement_id, coalesce(auth.jwt()->>'email','agent'), 'form_countersigned', jsonb_build_object('form', fm.kind));
end $$;

-- "Before you sell": a vendor confirms they received the REA sale and purchase guide (a version Tim published)
create or replace function public.vendor_guide_receipt(a uuid, p_guide text, p_version text, p_file text, p_sha256 text, p_user_agent text) returns bigint language plpgsql security definer set search_path = public as $$
declare me public.agreement_people; rid bigint;
begin
  if not public.is_party(a) then raise exception 'Not your agreement'; end if;
  if not exists (select 1 from public.agreements where id = a and status in ('signed','countersigned')) then raise exception 'This comes after the agreement is signed'; end if;
  if coalesce(trim(p_version),'') = '' then raise exception 'Guide version missing'; end if;
  if coalesce(p_file,'') !~ '^[A-Za-z0-9._-]+\.pdf$' then raise exception 'Not a guide file'; end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Not a guide fingerprint'; end if;
  select * into me from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  if me.id is null then raise exception 'Signer not found'; end if;
  select id into rid from public.guide_receipts where person_id = me.id and guide = p_guide and version = p_version;
  if rid is not null then return rid; end if;
  insert into public.guide_receipts (agreement_id, person_id, guide, version, file, sha256, user_agent) values (a, me.id, p_guide, p_version, p_file, p_sha256, p_user_agent) returning id into rid;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'guide_received', jsonb_build_object('guide', p_guide, 'version', p_version, 'name', me.legal_name));
  return rid;
end $$;

revoke execute on function public.vendor_form_start(uuid, text) from public, anon;
revoke execute on function public.vendor_form_save(uuid, jsonb) from public, anon;
revoke execute on function public.vendor_form_sign(uuid, text, jsonb, text) from public, anon;
revoke execute on function public.agent_form_sign_in_person(uuid, uuid, text, jsonb, text) from public, anon;
revoke execute on function public.agent_form_countersign(uuid, text, jsonb, text) from public, anon;
revoke execute on function public.vendor_guide_receipt(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.guard_form() from public, anon, authenticated;
grant execute on function public.vendor_form_start(uuid, text) to authenticated;
grant execute on function public.vendor_form_save(uuid, jsonb) to authenticated;
grant execute on function public.vendor_form_sign(uuid, text, jsonb, text) to authenticated;
grant execute on function public.agent_form_sign_in_person(uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.agent_form_countersign(uuid, text, jsonb, text) to authenticated;
grant execute on function public.vendor_guide_receipt(uuid, text, text, text, text, text) to authenticated;
