-- Phase 4, change of approach (Tim): the app's translations go straight to vendors with no speaker check. They are
-- indicative only, the English always prevails, and every translated page says so. Nothing unchecked by the machine
-- checks reaches vendors: every row still has to pass translation_problem() (placeholders, tags, every number and
-- amount, names, no dashes) before it is stored. Additive: nothing is dropped or deleted, no signed record is touched.
-- Tim can still pull a language back to English (agent_withdraw_translations, unchanged) and put it back
-- (agent_publish_translations). That choice is recorded for the set (translation_sets), so translating again does not put a
-- withdrawn language back in front of vendors. The set record is used rather than "are there any held-back rows" because
-- it still holds when a language had nothing stored yet, when every row was later corrected, or for a plan or variation that
-- is translated again after it was pulled back; a row count cannot tell "pulled back" from "not translated yet".

-- one row per language and set that Tim has pulled back to English; the row is removed-by-flag (withdrawn = false) when he shows it again
create table if not exists public.translation_sets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('screens','guide','plan','variation')),
  ref uuid,
  lang text not null check (lang in ('mi','sm','to','hi','ko','zh')),
  withdrawn boolean not null default false,
  changed_at timestamptz not null default now(),
  changed_by text,
  check ((scope in ('plan','variation')) = (ref is not null))
);
create unique index if not exists translation_sets_one on public.translation_sets (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang);
alter table public.translation_sets enable row level security;
create policy ts_agent_read on public.translation_sets for select to authenticated using (public.is_agent());   -- no write policies: only the functions below write

-- sets already pulled back under the earlier rule (the log's latest entry for the set is a withdrawal)
insert into public.translation_sets (scope, ref, lang, withdrawn, changed_at, changed_by)
select l.scope, l.ref, l.lang, true, max(l.at), 'earlier withdrawal'
  from public.translation_log l
 where l.kind = 'withdrawn' and l.lang in ('mi','sm','to','hi','ko','zh')
   and not exists (select 1 from public.translation_log a where a.kind = 'approved' and a.scope = l.scope and a.lang = l.lang
                      and coalesce(a.ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(l.ref, '00000000-0000-0000-0000-000000000000'::uuid) and a.at > l.at)
 group by l.scope, l.ref, l.lang
on conflict do nothing;

-- Tim: store machine translations. p_rows is [{"source": "...", "text": "..."}]. Each row is checked; a row that fails is
-- skipped and reported, never stored. A row that passes is shown to vendors at once, marked as automatic. A string Tim or a
-- checker has corrected is left as corrected. If Tim has pulled that language and set back to English, new rows are kept but held
-- back ("held"), not shown. Returns {"saved": n, "held": n, "skipped": n, "problems": [{"source","reason"}, ...]}.
create or replace function public.agent_store_translations(p_scope text, p_ref uuid, p_lang text, p_rows jsonb, p_model text) returns jsonb
 language plpgsql security definer set search_path = public as $$
declare r jsonb; why text; saved integer := 0; skipped integer := 0; held integer := 0; problems jsonb := '[]'::jsonb; ins integer; pulled boolean; st text;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  if p_scope not in ('screens','guide','plan','variation') or p_lang not in ('mi','sm','to','hi','ko','zh') then raise exception 'Unknown set'; end if;
  if (p_scope in ('plan','variation')) <> (p_ref is not null) then raise exception 'A plan or variation needs its id'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Nothing to save'; end if;
  -- a language and set that Tim has pulled back to English stays pulled back: new rows are kept but not shown
  select coalesce(bool_or(withdrawn), false) into pulled from public.translation_sets
   where scope = p_scope and lang = p_lang and coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_ref, '00000000-0000-0000-0000-000000000000'::uuid);
  st := case when pulled then 'awaiting_check' else 'approved' end;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(btrim(r->>'source'), '') = '' or coalesce(btrim(r->>'text'), '') = '' then skipped := skipped + 1; continue; end if;
    why := public.translation_problem(r->>'source', r->>'text');
    if why <> '' then
      skipped := skipped + 1;
      if jsonb_array_length(problems) < 200 then problems := problems || jsonb_build_array(jsonb_build_object('source', r->>'source', 'reason', why)); end if;
      continue;
    end if;
    insert into public.translations (scope, ref, lang, source, text, model, translated_at, status, approved_by, approved_at)
    values (p_scope, p_ref, p_lang, r->>'source', r->>'text', p_model, now(), st,
            case when pulled then null else 'Automatic (not checked by a person)' end, case when pulled then null else now() end)
    on conflict (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang, source_md5) do update
      set text = excluded.text, model = excluded.model, translated_at = now(), status = st,
          approved_by = case when pulled then null else 'Automatic (not checked by a person)' end,
          approved_at = case when pulled then null else now() end, updated_at = now()
      where public.translations.edited_by is null;                -- a correction is never overwritten by a machine translation
    get diagnostics ins = row_count;
    if pulled then held := held + ins; else saved := saved + ins; end if;
  end loop;
  if saved > 0 then
    insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings)
    values ('approved', p_scope, p_ref, p_lang, 'Automatic (not checked by a person)', lower(coalesce(auth.jwt()->>'email','')), saved);
  end if;
  return jsonb_build_object('saved', saved, 'held', held, 'skipped', skipped, 'problems', problems);
end $$;
revoke execute on function public.agent_store_translations(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.agent_store_translations(text, uuid, text, jsonb, text) to authenticated;

-- The earlier name keeps working, with the same checks: it stores through agent_store_translations and returns the saved
-- count (its return type cannot change without dropping it, which is not done).
create or replace function public.agent_save_translations(p_scope text, p_ref uuid, p_lang text, p_rows jsonb, p_model text) returns integer
 language plpgsql security definer set search_path = public as $$
begin
  return (public.agent_store_translations(p_scope, p_ref, p_lang, p_rows, p_model)->>'saved')::integer;
end $$;
revoke execute on function public.agent_save_translations(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.agent_save_translations(text, uuid, text, jsonb, text) to authenticated;

-- Tim or a checker corrects one string. Same checks as before, but the corrected string stays visible to vendors (it does
-- not go back to awaiting). Who corrected it and when is recorded, and logged.
create or replace function public.agent_edit_translation(p_id uuid, p_text text, p_by text) returns void
 language plpgsql security definer set search_path = public as $$
declare r public.translations%rowtype; why text; pulled boolean;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select * into r from public.translations where id = p_id;
  if not found then raise exception 'Not found'; end if;
  if r.text is not distinct from p_text then return; end if;
  why := public.translation_problem(r.source, p_text);
  if why <> '' then raise exception 'That correction cannot be saved (%)', why; end if;
  select coalesce(bool_or(withdrawn), false) into pulled from public.translation_sets
   where scope = r.scope and lang = r.lang and coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(r.ref, '00000000-0000-0000-0000-000000000000'::uuid);
  update public.translations set text = p_text, status = case when pulled then 'awaiting_check' else 'approved' end,   -- a pulled-back language stays pulled back
         approved_by = coalesce(approved_by, 'Automatic (not checked by a person)'), approved_at = coalesce(approved_at, now()),
         edited_by = coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'Unnamed'), edited_at = now(), updated_at = now()
   where id = p_id;
  insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings, translation_id)
  values ('edited', r.scope, r.ref, r.lang, nullif(btrim(coalesce(p_by, '')), ''), lower(coalesce(auth.jwt()->>'email','')), 1, p_id);
end $$;
revoke execute on function public.agent_edit_translation(uuid, text, text) from public, anon;
grant execute on function public.agent_edit_translation(uuid, text, text) to authenticated;

-- Tim: show a language to vendors again after pulling it back. Only strings that pass the checks are shown.
create or replace function public.agent_publish_translations(p_scope text, p_ref uuid, p_lang text) returns integer
 language plpgsql security definer set search_path = public as $$
declare n integer := 0; c integer; t record;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  insert into public.translation_sets (scope, ref, lang, withdrawn, changed_by) values (p_scope, p_ref, p_lang, false, lower(coalesce(auth.jwt()->>'email','')))
  on conflict (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang) do update set withdrawn = false, changed_at = now(), changed_by = excluded.changed_by;
  for t in select id, source, text from public.translations
            where scope = p_scope and lang = p_lang and status = 'awaiting_check'
              and coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_ref, '00000000-0000-0000-0000-000000000000'::uuid) loop
    if public.translation_problem(t.source, t.text) <> '' then continue; end if;
    update public.translations set status = 'approved', approved_by = coalesce(approved_by, 'Automatic (not checked by a person)'),
           approved_at = now(), updated_at = now() where id = t.id;
    get diagnostics c = row_count; n := n + c;
  end loop;
  if n > 0 then
    insert into public.translation_log (kind, scope, ref, lang, by_name, by_email, strings)
    values ('approved', p_scope, p_ref, p_lang, 'Automatic (not checked by a person)', lower(coalesce(auth.jwt()->>'email','')), n);
  end if;
  return n;
end $$;
revoke execute on function public.agent_publish_translations(text, uuid, text) from public, anon;
grant execute on function public.agent_publish_translations(text, uuid, text) to authenticated;

-- Tim: pull a language back so vendors see English again. Same signature and result as before; it now also records the
-- choice for the set, so translating again does not show it.
create or replace function public.agent_withdraw_translations(p_scope text, p_ref uuid, p_lang text) returns integer
 language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  if p_scope not in ('screens','guide','plan','variation') or p_lang not in ('mi','sm','to','hi','ko','zh') then raise exception 'Unknown set'; end if;
  insert into public.translation_sets (scope, ref, lang, withdrawn, changed_by) values (p_scope, p_ref, p_lang, true, lower(coalesce(auth.jwt()->>'email','')))
  on conflict (scope, coalesce(ref, '00000000-0000-0000-0000-000000000000'::uuid), lang) do update set withdrawn = true, changed_at = now(), changed_by = excluded.changed_by;
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

-- The read-then-approve step is gone and nothing calls it. It showed rows without the machine check, so it is switched off
-- (revoked, not dropped).
revoke execute on function public.agent_approve_translations(text, uuid, text, text, jsonb) from public, anon, authenticated;

-- Tim: what translating has used so far, from the log of AI calls (the wording itself is never logged)
create or replace function public.agent_translation_usage() returns jsonb
 language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  return (select jsonb_build_object('calls', count(*), 'failed', count(*) filter (where not ok),
            'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0),
            'by_model', coalesce((select jsonb_object_agg(model, jsonb_build_object('calls', c, 'input_tokens', i, 'output_tokens', o))
                                    from (select model, count(*) c, coalesce(sum(input_tokens), 0) i, coalesce(sum(output_tokens), 0) o
                                            from public.ai_calls where purpose like 'translate %' group by model) m), '{}'::jsonb))
          from public.ai_calls where purpose like 'translate %');
end $$;
revoke execute on function public.agent_translation_usage() from public, anon;
grant execute on function public.agent_translation_usage() to authenticated;

-- Machine translations that were stored under the earlier "awaiting check" rule and pass the checks are shown now, marked
-- automatic. Ones that fail the checks stay hidden.
update public.translations set status = 'approved', approved_by = coalesce(approved_by, 'Automatic (not checked by a person)'),
       approved_at = coalesce(approved_at, now()), updated_at = now()
 where status = 'awaiting_check' and public.translation_problem(source, text) = ''
   and not exists (select 1 from public.translation_sets ts where ts.withdrawn and ts.scope = translations.scope and ts.lang = translations.lang
                      and coalesce(ts.ref, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(translations.ref, '00000000-0000-0000-0000-000000000000'::uuid));
