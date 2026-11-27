-- 033: appraisal set-up (LW3 phase A, APPRAISAL-PLAN.md). Tim starts an appraisal report from a property on file or from an address,
-- sets it up (browser tabs checklist, a range per part, campaign length, sale method, pricing basis, marketing plan, header) and the
-- portal writes the standard sections. Additive only: three new columns on appraisal_views, two new status values, one new column on
-- ai_calls, and three new functions. No existing column, row, policy, trigger or signed-record protection is changed. The row loaded by
-- hand on 27 November keeps every value it has (its setup stays '{}', its kind 'standard', its private notes empty).
--
--   setup          jsonb object: Tim's choices on the set-up page (v, tabs, campaign, method, basis, plan, header, suburb, note ...).
--                  The portal writes the sections from it; the sections are what a vendor reads.
--   kind           'standard' now; 'bespoke' (several titles, parts and options) comes in phase D.
--   private_notes  Tim's own notes on the appraisal, weak points of the home included. Never drawn on the vendor's page.
--   status         adds 'ready' and 'sent' to draft, presented, archived. Only phase E's send function will set 'sent'; the save
--                  function here refuses to set it, and refuses to change an appraisal once it is sent (a sent copy never changes).
--   ai_calls.appraisal_id  the appraisal a model call was made for, so every call for an appraisal is logged against it.
--
-- The wording guard runs on the server as well as in the portal: nothing a vendor can read may say "as is", fee or commission.
-- Every function checks is_agent(), sets its search_path, and is executable by signed-in users only (never public or anon).

alter table public.appraisal_views add column setup jsonb not null default '{}'::jsonb check (jsonb_typeof(setup) = 'object');
alter table public.appraisal_views add column kind text not null default 'standard' check (kind in ('standard', 'bespoke'));
alter table public.appraisal_views add column private_notes text not null default '';
alter table public.appraisal_views drop constraint appraisal_views_status_check;
alter table public.appraisal_views add constraint appraisal_views_status_check check (status in ('draft', 'presented', 'archived', 'ready', 'sent'));

alter table public.ai_calls add column appraisal_id uuid references public.appraisal_views(id) on delete set null;
create index ai_calls_appraisal_idx on public.ai_calls (appraisal_id) where appraisal_id is not null;

-- the wording guard: every string anywhere in p (sections, fields, set-up, title), joined, checked once.
-- Returns '' when the wording is fine, or the problem in plain words (the same words the portal shows).
create function public.appraisal_wording_problem(p jsonb) returns text
language sql immutable set search_path = public as $$
  select case
    when s.t ~* '\mas[[:space:]-]+is\M' then 'Please write "current condition" rather than "as is".'
    when s.t ~* '\m(fees?|commissions?)\M' then 'Fees and commission are never shown on an appraisal.'
    else '' end
  from (select coalesce(string_agg(v #>> '{}', ' '), '') as t
          from jsonb_path_query(coalesce(p, 'null'::jsonb), 'strict $.**') as v
         where jsonb_typeof(v) = 'string') as s
$$;
revoke all on function public.appraisal_wording_problem(jsonb) from public, anon, authenticated;

-- a new appraisal report: from a property on file (p_property), or from an address (a new property file is made, unless the
-- address is already on file, when Tim is asked to choose it). Returns the appraisal, the property and whether the file was new.
create function public.agent_appraisal_create(p_property uuid, p_address text, p_kind text default 'standard') returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid := p_property; addr text := trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g'));
  k text := coalesce(nullif(trim(p_kind), ''), 'standard'); made boolean := false; aid uuid; prob text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if k not in ('standard', 'bespoke') then raise exception 'Unknown kind of appraisal'; end if;
  if pid is null then
    if length(addr) < 3 then raise exception 'Add the address'; end if;
    if length(addr) > 300 then raise exception 'That address is too long'; end if;
    if exists (select 1 from public.properties where lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) = lower(addr)) then
      raise exception 'That address is already on file. Choose it from the list';
    end if;
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

-- saves an appraisal's set-up and what the portal wrote from it. A null argument leaves that part as it is. Refused: anyone but
-- Tim; a sent appraisal; "as is", a fee or commission in anything a vendor can read; a range without both figures or with its low
-- not below its high; setting 'sent' (phase E sends). The date it was prepared is set the first time it is saved.
create function public.agent_appraisal_save(p_id uuid, p_setup jsonb, p_fields jsonb, p_sections jsonb, p_title text,
  p_prepared_for text, p_private_notes text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.appraisal_views; prob text; x jsonb;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.appraisal_views where id = p_id for update;
  if not found then raise exception 'Appraisal not found'; end if;
  if r.status = 'sent' then raise exception 'This appraisal has been sent, and a sent copy never changes'; end if;
  if p_setup is not null and jsonb_typeof(p_setup) <> 'object' then raise exception 'The set-up must be a set of choices'; end if;
  if p_fields is not null and jsonb_typeof(p_fields) <> 'object' then raise exception 'The figures must be a set of fields'; end if;
  if p_sections is not null and jsonb_typeof(p_sections) <> 'array' then raise exception 'The sections must be a list'; end if;
  if length(coalesce(p_setup::text, '')) + length(coalesce(p_fields::text, '')) + length(coalesce(p_sections::text, '')) + length(coalesce(p_private_notes, '')) > 500000 then
    raise exception 'Too much to save at once';
  end if;
  if p_status is not null and p_status not in ('draft', 'ready', 'presented', 'archived') then raise exception 'That status can''t be set here'; end if;
  prob := public.appraisal_wording_problem(jsonb_build_array(p_sections, p_fields, p_setup, p_title, p_prepared_for));
  if prob <> '' then raise exception '%', prob; end if;
  if p_fields is not null and p_fields ? 'ranges' then
    if jsonb_typeof(p_fields->'ranges') <> 'array' then raise exception 'Each range needs a low and a high figure'; end if;
    for x in select value from jsonb_array_elements(p_fields->'ranges') loop
      if jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'low') is distinct from 'number' or jsonb_typeof(x->'high') is distinct from 'number'
         or (x->>'low')::numeric <= 0 or (x->>'high')::numeric <= 0 then
        raise exception 'Each range needs a low and a high figure';
      end if;
      if (x->>'low')::numeric >= (x->>'high')::numeric then
        raise exception 'The low figure must be below the high figure (%)', coalesce(nullif(x->>'option', ''), x->>'key', 'a range');
      end if;
    end loop;
  end if;
  update public.appraisal_views set
      setup = coalesce(p_setup, setup), fields = coalesce(p_fields, fields), sections = coalesce(p_sections, sections),
      title = coalesce(p_title, title), prepared_for = coalesce(p_prepared_for, prepared_for),
      private_notes = coalesce(p_private_notes, private_notes), status = coalesce(p_status, status),
      prepared_on = coalesce(prepared_on, (now() at time zone 'Pacific/Auckland')::date)
    where id = p_id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.agent_appraisal_save(uuid, jsonb, jsonb, jsonb, text, text, text, text) from public, anon;
grant execute on function public.agent_appraisal_save(uuid, jsonb, jsonb, jsonb, text, text, text, text) to authenticated;
