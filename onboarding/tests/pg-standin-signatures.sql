-- Added to the local PostgreSQL stand-in (tests/pg-standin.sql) for migration 029's identity rule: the agency agreement's signature
-- tables, their parent rows (property_forms, agreement_variations) and AML files, copied from the live definitions (read with SELECTs on
-- pg_catalog, 26 November 2026): the same columns, NOT NULLs, defaults, checks, keys and triggers. Left out: the aml_files.contact_id key
-- (no crm_contacts here) and the AML and vendor declaration triggers that
-- need functions the stand-in doesn't have (aml_on_lock, crm_aml_sync, aml_lock_guard, guard_form_checks, inspection_prefill_form); none
-- of them acts on what the 029 tests insert. Run once on the stand-in before 029. NEVER on the live project (it replaces tables).
do $$ begin if current_database() = 'postgres' then raise exception 'This file is for the local stand-in only'; end if; end $$;
alter table public.agreement_people add column if not exists signed_at timestamptz;
drop table if exists public.form_signatures, public.variation_signatures, public.signatures, public.property_forms, public.agreement_variations, public.aml_files cascade;

create table public.aml_files (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id) on delete restrict,
  person_id uuid unique references public.agreement_people(id) on delete restrict, data jsonb not null default '{}'::jsonb, locked_at timestamptz,
  locked_by text, retain_until date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), contact_id uuid);

create table public.agreement_variations (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id) on delete cascade,
  number integer not null, status text not null default 'draft' check (status = any (array['draft', 'sent', 'signed', 'withdrawn'])),
  changes jsonb not null default '{}'::jsonb, summary jsonb not null default '[]'::jsonb, reason text, created_by text, created_at timestamptz not null default now(),
  sent_at timestamptz, signing_mode text, signed_at timestamptz, withdrawn_at timestamptz, copy_sent_at timestamptz, copy_error text, unique (agreement_id, number));
create or replace function public.guard_variation() returns trigger language plpgsql set search_path to 'public' as $f$
begin
  if old.status <> 'draft' and (new.changes is distinct from old.changes or new.summary is distinct from old.summary or new.reason is distinct from old.reason or new.number is distinct from old.number or new.agreement_id is distinct from old.agreement_id) then
    raise exception 'This variation has been issued, so its terms can''t change';
  end if;
  return new;
end $f$;
create trigger guard_variation before update on public.agreement_variations for each row execute function public.guard_variation();

create table public.property_forms (id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),
  agreement_id uuid not null references public.agreements(id), kind text not null check (kind = any (array['vendor_declaration', 'healthy_homes'])),
  form_version text not null, status text not null default 'draft' check (status = any (array['draft', 'ready', 'signed'])),
  data jsonb not null default '{}'::jsonb, agent_data jsonb not null default '{}'::jsonb, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), ready_at timestamptz, signed_at timestamptz, countersigned_at timestamptz, filing_at timestamptz,
  document_id uuid references public.property_documents(id), pdf_error text, unique (agreement_id, kind));
create trigger touch_property_forms before update on public.property_forms for each row execute function public.touch_updated();

create table public.signatures (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id) on delete restrict,
  person_id uuid references public.agreement_people(id) on delete restrict, signer_role text not null check (signer_role = any (array['client', 'agent'])),
  signer_name text not null, image_path text, snapshot jsonb not null, snapshot_sha256 text not null, user_agent text, signed_at timestamptz not null default now());
create trigger signatures_immutable before delete or update on public.signatures for each row execute function public.no_change();

create table public.variation_signatures (id uuid primary key default gen_random_uuid(), variation_id uuid not null references public.agreement_variations(id) on delete cascade,
  agreement_id uuid not null references public.agreements(id) on delete cascade, person_id uuid references public.agreement_people(id),
  signer_role text not null check (signer_role = any (array['client', 'agent'])), signer_name text not null, image_path text, snapshot jsonb not null,
  snapshot_sha256 text not null, user_agent text, signed_at timestamptz not null default now());
create index variation_signatures_agreement_id_idx on public.variation_signatures (agreement_id);
create unique index variation_signatures_one_each on public.variation_signatures (variation_id, coalesce(person_id::text, 'agent'));

create table public.form_signatures (id uuid primary key default gen_random_uuid(), form_id uuid not null references public.property_forms(id),
  agreement_id uuid not null references public.agreements(id), person_id uuid references public.agreement_people(id),
  signer_role text not null default 'client' check (signer_role = any (array['client', 'agent'])), signer_name text not null, image_path text,
  snapshot jsonb not null, snapshot_sha256 text not null, user_agent text, signed_at timestamptz not null default now());
create index form_signatures_form_id_idx on public.form_signatures (form_id);
create trigger form_signatures_immutable before delete or update on public.form_signatures for each row execute function public.no_change();

create or replace function public.guard_form() returns trigger language plpgsql set search_path to 'public' as $f$
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
end $f$;
create trigger guard_form before insert or delete or update on public.property_forms for each row execute function public.guard_form();

-- the live check before a vendor signs a form, shortened (the live one also asks is_confirmed and decl_has_answer, which the stand-in
-- doesn't have); it only acts on a form's "pre" answers, which the 029 tests don't set
create or replace function public.form_sign_needs_checks() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare d jsonb;
begin
  if new.signer_role <> 'client' then return new; end if;
  select data into d from public.property_forms where id = new.form_id;
  if jsonb_typeof(d->'pre') = 'object' and exists (select 1 from jsonb_each_text(d->'pre') e where e.value = 'inspection') then
    raise exception 'Please check each answer Tim noted at the inspection before signing';
  end if;
  return new;
end $f$;
create trigger form_sign_needs_checks before insert on public.form_signatures for each row execute function public.form_sign_needs_checks();
