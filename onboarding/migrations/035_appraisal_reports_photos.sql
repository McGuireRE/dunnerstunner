-- 035: comparables from an uploaded report, photos from a listing page, and case-by-case suburbs (LW3 phase C2, APPRAISAL-PLAN.md).
-- Builds on 034 (not yet applied; apply 034 first). Additive only: one new kind of document, two new tables, three new columns with
-- defaults, new functions and triggers. No existing column, row, policy, function or signed-record protection is changed or weakened.
--
--   repo_kinds 'Comparables or market report'  agency papers, never shared, never exported. The PDF Tim uploads on an appraisal's
--                      Comparables screen is filed in the one store (property_documents, bucket property-files), like any other
--                      document, and keeps that kind: it can't be shared, and no other item becomes one later.
--   appraisal_reports  what the reader proposed from one report (each comparable and market month with its page). Written only by the
--                      doc-prefill function (service role, appraisal_report_save). Tim ticks; only ticked items go through
--                      agent_comps_import and agent_market_import; agent_report_imported records what he ticked.
--   appraisal_media.page_url  for a photo fetched from a listing: the listing page it came from (source_url keeps the image's own link).
--                      Set when the photo is filed, never changed.
--   suburb_groups.mode 'never_mix' (every group so far, and the default) or 'case_by_case': sales there are counted, and the AI says
--                      who each likely appealed to, so the rule flags only a mismatch with the subject property.
--   appraisal_buyer_checks  each case-by-case check: the subject's verdict and each comparable's, with a one-line reason. Tim's only:
--                      never on a vendor page. Written only by the doc-prefill function (service role, appraisal_buyer_save).
--
-- Row Level Security on both new tables: Tim reads (is_agent()); nobody writes them directly; vendors and anon get nothing. Rows of a
-- sent appraisal never change. Every function sets its search_path; the service-role ones are revoked from public, anon and
-- authenticated; agent ones check is_agent().

-- ═══════════════ the kind of document ═══════════════
insert into public.repo_kinds (kind, folder, position, shareable, exportable) values ('Comparables or market report', 'agency', 216, false, false);
create function public.guard_report_document() returns trigger language plpgsql set search_path = public as $$
begin
  if old.kind = 'Comparables or market report' and (new.kind is distinct from old.kind or new.shared_at is not null) then
    raise exception 'A comparables or market report stays one, and is never shared';
  end if;
  if new.kind = 'Comparables or market report' and old.kind is distinct from new.kind then
    raise exception 'Add a comparables or market report from an appraisal''s Comparables screen';
  end if;
  return new;
end $$;
revoke all on function public.guard_report_document() from public, anon, authenticated;
create trigger guard_report_document before update on public.property_documents for each row execute function public.guard_report_document();

-- ═══════════════ what the reader proposed ═══════════════
create table public.appraisal_reports (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  document_id uuid not null references public.property_documents(id),
  result jsonb not null check (jsonb_typeof(result) = 'object' and length(result::text) <= 500000),
  model text not null check (length(model) between 1 and 100),
  pages integer check (pages between 1 and 1000),
  read_by text not null check (length(read_by) between 1 and 254),
  read_at timestamptz not null default now(),
  imported jsonb check (imported is null or (jsonb_typeof(imported) = 'object' and length(imported::text) <= 20000)),
  imported_by text,
  imported_at timestamptz
);
create index appraisal_reports_appraisal_idx on public.appraisal_reports (appraisal_id, read_at);
alter table public.appraisal_reports enable row level security;
create policy appraisal_reports_agent_read on public.appraisal_reports for select to authenticated using (public.is_agent());
revoke all on public.appraisal_reports from anon;
revoke insert, update, delete, truncate, trigger, references on public.appraisal_reports from authenticated;

-- a reading never changes, except that Tim's ticks are recorded once; nothing on a sent appraisal changes; a reading goes only with
-- its appraisal
create function public.guard_appraisal_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id) then raise exception 'A report''s reading is kept'; end if;
    return old;
  end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'imported' - 'imported_by' - 'imported_at') is distinct from (to_jsonb(old) - 'imported' - 'imported_by' - 'imported_at') then
      raise exception 'A report''s reading never changes';
    end if;
    if old.imported_at is not null then raise exception 'What you ticked from this report is already recorded'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_report() from public, anon, authenticated;
create trigger appraisal_reports_guard before insert or update or delete on public.appraisal_reports for each row execute function public.guard_appraisal_report();

-- the report to read: the appraisal is written from its set-up and not sent; the document is a comparables or market report, a PDF in
-- the property-files bucket, on the appraisal's own property, not removed. Returns where it is, and the subject property's address so
-- the reader can leave it out (for the service role only).
create function public.appraisal_report_source(p_appraisal uuid, p_document uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.appraisal_views; d public.property_documents;
begin
  select * into a from public.appraisal_views where id = p_appraisal;
  if not found then raise exception 'Appraisal not found'; end if;
  if a.status = 'sent' then raise exception 'This appraisal has been sent, and a sent copy never changes'; end if;
  if not (coalesce(a.setup, '{}'::jsonb) ? 'v') then raise exception 'This appraisal was loaded by hand, so it has no comparables screen'; end if;
  select * into d from public.property_documents where id = p_document;
  if not found then raise exception 'That report isn''t on the property file'; end if;
  if d.property_id is distinct from a.property_id then raise exception 'That report is on another property'; end if;
  if d.kind is distinct from 'Comparables or market report' or d.bucket <> 'property-files' or d.mime_type is distinct from 'application/pdf' then
    raise exception 'Only a PDF added as a comparables or market report can be read here';
  end if;
  if d.archived_at is not null then raise exception 'That report has been removed from the property file'; end if;
  return jsonb_build_object('path', d.path, 'name', d.name, 'size', d.size_bytes, 'property_id', d.property_id, 'subject', a.address);
end $$;
revoke all on function public.appraisal_report_source(uuid, uuid) from public, anon, authenticated;

-- the reading, saved by doc-prefill (service role) with who asked for it
create function public.appraisal_report_save(p_appraisal uuid, p_document uuid, p_result jsonb, p_model text, p_pages integer, p_actor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  perform public.appraisal_report_source(p_appraisal, p_document);
  if p_result is null or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result->'comps') is distinct from 'array' or jsonb_typeof(p_result->'market') is distinct from 'array' then
    raise exception 'Not a reading';
  end if;
  if jsonb_array_length(p_result->'comps') > 60 or jsonb_array_length(p_result->'market') > 120 then raise exception 'Too much in one reading'; end if;
  insert into public.appraisal_reports (appraisal_id, document_id, result, model, pages, read_by)
    values (p_appraisal, p_document, p_result, left(coalesce(p_model, ''), 100), p_pages, left(coalesce(nullif(trim(p_actor), ''), 'agent'), 254))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.appraisal_report_save(uuid, uuid, jsonb, text, integer, text) from public, anon, authenticated;
grant execute on function public.appraisal_report_source(uuid, uuid), public.appraisal_report_save(uuid, uuid, jsonb, text, integer, text) to service_role;

-- Tim's ticks, recorded once he has imported them (or set the report aside with nothing ticked): the ids of the comparables and months
-- he ticked, each one that the reading holds
create function public.agent_report_imported(p_report uuid, p_comps text[], p_months text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.appraisal_reports; bad text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.appraisal_reports where id = p_report;
  if not found then raise exception 'Report not found'; end if;
  if r.imported_at is not null then raise exception 'What you ticked from this report is already recorded'; end if;
  select x into bad from unnest(coalesce(p_comps, '{}')) x where not exists (select 1 from jsonb_array_elements(r.result->'comps') e where e->>'id' = x) limit 1;
  if bad is not null then raise exception 'That comparable isn''t in this report''s reading'; end if;
  select x into bad from unnest(coalesce(p_months, '{}')) x where not exists (select 1 from jsonb_array_elements(r.result->'market') e where e->>'id' = x) limit 1;
  if bad is not null then raise exception 'That month isn''t in this report''s reading'; end if;
  update public.appraisal_reports set imported = jsonb_build_object('comps', to_jsonb(coalesce(p_comps, '{}')), 'months', to_jsonb(coalesce(p_months, '{}'))),
    imported_by = coalesce(auth.jwt()->>'email', 'agent'), imported_at = now() where id = p_report;
  return jsonb_build_object('id', p_report, 'comps', coalesce(cardinality(p_comps), 0), 'months', coalesce(cardinality(p_months), 0));
end $$;
revoke all on function public.agent_report_imported(uuid, text[], text[]) from public, anon;
grant execute on function public.agent_report_imported(uuid, text[], text[]) to authenticated;

-- ═══════════════ a fetched photo's listing page ═══════════════
alter table public.appraisal_media add column page_url text check (page_url is null or (page_url ~ '^https?://[^[:space:]]+$' and length(page_url) <= 1000));
create function public.guard_media_page_url() returns trigger language plpgsql set search_path = public as $$
begin
  if new.page_url is distinct from old.page_url then raise exception 'Where a photo is kept, and what it is, can''t change'; end if;
  return new;
end $$;
revoke all on function public.guard_media_page_url() from public, anon, authenticated;
create trigger appraisal_media_page_url before update on public.appraisal_media for each row execute function public.guard_media_page_url();

-- ═══════════════ case-by-case suburbs ═══════════════
alter table public.suburb_groups add column mode text not null default 'never_mix' check (mode in ('never_mix', 'case_by_case'));

create table public.appraisal_buyer_checks (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  subject jsonb not null check (jsonb_typeof(subject) = 'object' and subject->>'verdict' in ('owner', 'investor', 'unclear') and length(subject::text) <= 2000),
  comps jsonb not null check (jsonb_typeof(comps) = 'object' and length(comps::text) <= 60000),
  model text not null check (length(model) between 1 and 100),
  checked_by text not null check (length(checked_by) between 1 and 254),
  checked_at timestamptz not null default now()
);
create index appraisal_buyer_checks_appraisal_idx on public.appraisal_buyer_checks (appraisal_id, checked_at);
alter table public.appraisal_buyer_checks enable row level security;
create policy appraisal_buyer_checks_agent_read on public.appraisal_buyer_checks for select to authenticated using (public.is_agent());
revoke all on public.appraisal_buyer_checks from anon;
revoke insert, update, delete, truncate, trigger, references on public.appraisal_buyer_checks from authenticated;
-- a check never changes and is kept with its appraisal; none is added to a sent appraisal
create function public.guard_buyer_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'A check is kept as it was made'; end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id) then raise exception 'A check is kept as it was made'; end if;
    return old;
  end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  return new;
end $$;
revoke all on function public.guard_buyer_check() from public, anon, authenticated;
create trigger appraisal_buyer_checks_guard before insert or update or delete on public.appraisal_buyer_checks for each row execute function public.guard_buyer_check();

-- the check, saved by doc-prefill (service role): every comparable named is on this appraisal, every verdict one of the three
create function public.appraisal_buyer_save(p_appraisal uuid, p_subject jsonb, p_comps jsonb, p_model text, p_actor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; rid uuid;
begin
  if not exists (select 1 from public.appraisal_views where id = p_appraisal) then raise exception 'Appraisal not found'; end if;
  if p_subject is null or jsonb_typeof(p_subject) <> 'object' or p_subject->>'verdict' is null or p_subject->>'verdict' not in ('owner', 'investor', 'unclear') then raise exception 'Not a verdict'; end if;
  if p_comps is null or jsonb_typeof(p_comps) <> 'object' then raise exception 'Not a list of verdicts'; end if;
  for k, v in select key, value from jsonb_each(p_comps) loop
    if not exists (select 1 from public.appraisal_comps c where c.id::text = k and c.appraisal_id = p_appraisal) then raise exception 'That comparable isn''t on this appraisal'; end if;
    if jsonb_typeof(v) <> 'object' or v->>'verdict' is null or v->>'verdict' not in ('owner', 'investor', 'unclear') or length(coalesce(v->>'reason', '')) > 300 then raise exception 'Not a verdict'; end if;
  end loop;
  insert into public.appraisal_buyer_checks (appraisal_id, subject, comps, model, checked_by)
    values (p_appraisal, jsonb_build_object('verdict', p_subject->>'verdict', 'reason', left(coalesce(p_subject->>'reason', ''), 300)), p_comps, left(coalesce(p_model, ''), 100), left(coalesce(nullif(trim(p_actor), ''), 'agent'), 254))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.appraisal_buyer_save(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.appraisal_buyer_save(uuid, jsonb, jsonb, text, text) to service_role;
