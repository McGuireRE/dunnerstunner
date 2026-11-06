-- Phase 4: translation. Vendors can read the vendor screens, the plain-English Vendor Guide and the acknowledgements
-- in their own language. Each translation is made once by the app's AI (fn/doc_prefill.ts, translate mode), stored
-- here as "awaiting_check", and shown to vendors only after a speaker has approved it. Unchecked text shows English.
-- Additive only: no existing table, trigger, signature, snapshot or fingerprint is changed. Nothing here deletes.
--
-- scope: screens (the wording of the vendor screens), guide (the Vendor Guide, the acknowledgements and the reading
-- aids for signed documents; needs a professional check), plan (Tim's updated plan, ref = prelisting id) and
-- variation (a variation's changes, ref = variation id). plan and variation are translated by Haiku when Tim
-- publishes them, and Tim approves them before the vendor sees them.

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('screens','guide','plan','variation')),
  ref uuid,                                         -- the plan or variation; null for screens and guide
  lang text not null check (lang in ('mi','sm','to','hi','ko','zh')),
  source text not null check (length(source) between 1 and 8000),     -- the English, exactly as the screen shows it
  source_md5 text generated always as (md5(source)) stored,
  text text not null check (length(text) between 1 and 12000),        -- the translation
  status text not null default 'awaiting_check' check (status in ('awaiting_check','approved')),
  model text,                                       -- which model made it
  translated_at timestamptz,
  edited_by text,                                   -- the checker's free-text name, when they corrected it
  edited_at timestamptz,
  approved_by text,                                 -- free text: the name of whoever checked it
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope in ('plan','variation')) = (ref is not null))
);
create unique index translations_one on public.translations (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang, source_md5);
create index translations_lookup on public.translations (lang, scope, status);

-- append-only record of who approved or withdrew a set, and when
create table public.translation_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('approved','withdrawn','edited')),
  scope text not null,
  ref uuid,
  lang text not null,
  by_name text,                                     -- the checker's name, as typed
  by_email text,                                    -- the signed-in account that pressed the button
  strings integer not null default 0,
  translation_id uuid                               -- for a correction: the string that was corrected
);

-- each signed-in person's language choice (their own record). Written only by set_my_language().
create table public.user_language (
  user_id uuid primary key,
  lang text not null check (lang in ('en','mi','sm','to','hi','ko','zh')),
  updated_at timestamptz not null default now()
);

alter table public.translations enable row level security;
alter table public.translation_log enable row level security;
alter table public.user_language enable row level security;

-- may the signed-in person (or an anonymous visitor) read this approved translation?
create or replace function public.can_read_translation(p_scope text, p_ref uuid) returns boolean
 language sql stable security definer set search_path = public as $$
  select case
    when p_scope in ('screens','guide') then true
    when auth.uid() is null then false
    when p_scope = 'plan' then exists (select 1 from public.prelistings pl where pl.id = p_ref and pl.status <> 'closed'
        and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email',''))))
    when p_scope = 'variation' then exists (select 1 from public.agreement_variations v where v.id = p_ref and v.status <> 'draft' and public.is_party(v.agreement_id))
    else false end;
$$;
revoke execute on function public.can_read_translation(text, uuid) from public;
grant execute on function public.can_read_translation(text, uuid) to anon, authenticated;

-- Tim can read everything. There is no insert, update or delete policy: the functions below (which check who is asking, check
-- the wording, and keep the log) are the only way to write, so nothing can be approved or changed without a name and a record.
create policy tr_agent_read on public.translations for select to authenticated using (public.is_agent());
-- vendors (and visitors on the sign-in page) read approved translations only
create policy tr_read_approved on public.translations for select to anon, authenticated using (status = 'approved' and public.can_read_translation(scope, ref));
create policy tl_agent_read on public.translation_log for select to authenticated using (public.is_agent());
create policy ul_own_read on public.user_language for select to authenticated using (user_id = auth.uid());
create policy ul_agent_read on public.user_language for select to authenticated using (public.is_agent());

-- The things a translation must keep from its English: placeholders, tags, every whole number and amount (in both
-- directions), the short names and acronyms, and no dashes. Returns '' when fine, otherwise the reason.
-- Kept in step with checkTranslation() in fn/prefill_shared.ts and trCheck() in the page.
create or replace function public.tr_tokens(s text, pat text) returns text[]
 language sql immutable set search_path = public as $$
  select coalesce(array_agg(x order by x), '{}'::text[]) from (select (regexp_matches(s, '(' || pat || ')', 'g'))[1] as x) q;
$$;
create or replace function public.translation_problem(p_source text, p_text text) returns text
 language plpgsql immutable set search_path = public as $$
declare
  t text := btrim(coalesce(p_text, ''));
  ph text := '\{[A-Za-z][A-Za-z0-9_]*\}';
  tg text := '<br/>|</?[0-9]+>';
  nm text := '\$?[0-9]+([,.:/][0-9]+)*%?';
  k text; re text;
begin
  if t = '' then return 'empty'; end if;
  if t ~ ('[' || chr(8212) || chr(8211) || ']') then return 'dash'; end if;
  if public.tr_tokens(p_source, ph) <> public.tr_tokens(t, ph) then return 'placeholders changed'; end if;
  if public.tr_tokens(p_source, tg) <> public.tr_tokens(t, tg) then return 'tags changed'; end if;
  if public.tr_tokens(regexp_replace(regexp_replace(p_source, ph, ' ', 'g'), tg, ' ', 'g'), nm)
     <> public.tr_tokens(regexp_replace(regexp_replace(t, ph, ' ', 'g'), tg, ' ', 'g'), nm) then return 'number changed'; end if;
  foreach k in array array['McGuire Real Estate','Timothy McGuire','Tim McGuire','McGuire','Tim','List Now','NZRET','Public Trust','LIM','GST','REA','AML/CFT','Real Estate Authority','Real Estate Agents Act'] loop
    re := '(^|[^A-Za-z])' || k || '($|[^A-Za-z])';
    if p_source ~ re and t !~ re then return 'name changed: ' || k; end if;
  end loop;
  return '';
end $$;
revoke execute on function public.tr_tokens(text, text) from public, anon;
revoke execute on function public.translation_problem(text, text) from public, anon;
grant execute on function public.translation_problem(text, text) to authenticated;
grant execute on function public.tr_tokens(text, text) to authenticated;

-- the approved translations of one set as { english: translation }, in one request (security invoker: row level security applies)
create or replace function public.get_translations(p_lang text, p_scope text, p_ref uuid default null) returns jsonb
 language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_object_agg(t.source, t.text), '{}'::jsonb) from public.translations t
   where t.lang = p_lang and t.scope = p_scope and t.status = 'approved'
     and coalesce(t.ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_ref, '00000000-0000-0000-0000-000000000000'::uuid);
$$;
revoke execute on function public.get_translations(text, text, uuid) from public;
grant execute on function public.get_translations(text, text, uuid) to anon, authenticated;

-- a signed-in person saves their own language choice
create or replace function public.set_my_language(p_lang text) returns void
 language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_lang is null or p_lang not in ('en','mi','sm','to','hi','ko','zh') then raise exception 'Unknown language'; end if;
  insert into public.user_language (user_id, lang) values (auth.uid(), p_lang)
  on conflict (user_id) do update set lang = excluded.lang, updated_at = now();
end $$;
revoke execute on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;

-- Tim: store machine translations as awaiting_check. p_rows is [{"source": "...", "text": "..."}].
-- A string already approved with the same text stays approved; a changed text goes back to awaiting_check.
create or replace function public.agent_save_translations(p_scope text, p_ref uuid, p_lang text, p_rows jsonb, p_model text) returns integer
 language plpgsql security definer set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  if p_scope not in ('screens','guide','plan','variation') or p_lang not in ('mi','sm','to','hi','ko','zh') then raise exception 'Unknown set'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Nothing to save'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(btrim(r->>'source'), '') = '' or coalesce(btrim(r->>'text'), '') = '' then continue; end if;
    insert into public.translations (scope, ref, lang, source, text, model, translated_at)
    values (p_scope, p_ref, p_lang, r->>'source', r->>'text', p_model, now())
    on conflict (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang, source_md5) do update
      set status = case when public.translations.text = excluded.text then public.translations.status else 'awaiting_check' end,
          approved_by = case when public.translations.text = excluded.text then public.translations.approved_by end,
          approved_at = case when public.translations.text = excluded.text then public.translations.approved_at end,
          text = excluded.text, model = excluded.model, translated_at = now(), updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.agent_save_translations(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.agent_save_translations(text, uuid, text, jsonb, text) to authenticated;

-- Tim or the checker corrects one string. The correction must keep the placeholders, tags, numbers, names and have no
-- dashes, like the machine translation. It goes back to awaiting_check until it is approved again, and is logged.
create or replace function public.agent_edit_translation(p_id uuid, p_text text, p_by text) returns void
 language plpgsql security definer set search_path = public as $$
declare r public.translations%rowtype; why text;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select * into r from public.translations where id = p_id;
  if not found then raise exception 'Not found'; end if;
  if r.text is not distinct from p_text then return; end if;
  why := public.translation_problem(r.source, p_text);
  if why <> '' then raise exception 'That correction cannot be saved (%)', why; end if;
  update public.translations set text = p_text, status = 'awaiting_check', approved_by = null, approved_at = null,
         edited_by = nullif(btrim(coalesce(p_by, '')), ''), edited_at = now(), updated_at = now()
   where id = p_id;
  insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings, translation_id)
  values ('edited', r.scope, r.ref, r.lang, nullif(btrim(coalesce(p_by, '')), ''), lower(coalesce(auth.jwt()->>'email','')), 1, p_id);
end $$;
revoke execute on function public.agent_edit_translation(uuid, text, text) from public, anon;
grant execute on function public.agent_edit_translation(uuid, text, text) to authenticated;

-- Tim: a speaker has read these strings and they are right. p_items is [{"id": "...", "text": "..."}]: the strings that were
-- shown, with the text that was shown. Exactly those are approved, and only if they still have that text and are still
-- awaiting a check, so a string that arrived or changed after the screen was drawn is never approved by mistake.
-- Records who (free text) and when.
create or replace function public.agent_approve_translations(p_scope text, p_ref uuid, p_lang text, p_name text, p_items jsonb) returns integer
 language plpgsql security definer set search_path = public as $$
declare n integer := 0; c integer; r jsonb;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Type the name of the person who checked it'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nothing was shown to approve'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    update public.translations set status = 'approved', approved_by = btrim(p_name), approved_at = now(), updated_at = now()
     where id = (r->>'id')::uuid and scope = p_scope and lang = p_lang and status = 'awaiting_check' and text = r->>'text'
       and coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_ref, '00000000-0000-0000-0000-000000000000'::uuid);
    get diagnostics c = row_count; n := n + c;
  end loop;
  if n = 0 then raise exception 'Nothing is waiting to be checked, or it changed after you read it'; end if;
  insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings)
  values ('approved', p_scope, p_ref, p_lang, btrim(p_name), lower(coalesce(auth.jwt()->>'email','')), n);
  return n;
end $$;
revoke execute on function public.agent_approve_translations(text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.agent_approve_translations(text, uuid, text, text, jsonb) to authenticated;

-- Tim: pull a language back so vendors see English again (the translations are kept, marked awaiting_check)
create or replace function public.agent_withdraw_translations(p_scope text, p_ref uuid, p_lang text) returns integer
 language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  update public.translations set status = 'awaiting_check', updated_at = now()
   where scope = p_scope and lang = p_lang and status = 'approved'
     and coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_ref, '00000000-0000-0000-0000-000000000000'::uuid);
  get diagnostics n = row_count;
  insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings)
  values ('withdrawn', p_scope, p_ref, p_lang, null, lower(coalesce(auth.jwt()->>'email','')), n);
  return n;
end $$;
revoke execute on function public.agent_withdraw_translations(text, uuid, text) from public, anon;
grant execute on function public.agent_withdraw_translations(text, uuid, text) to authenticated;
