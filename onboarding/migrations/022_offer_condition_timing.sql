-- 022 Condition timing (24 November 2026). Additive only: one function replaced, no table or column changed, no data touched.
--
-- Tim often lines his conditions up to confirm on the same day, and a condition may be satisfied within so many working days of the
-- date another condition is satisfied or waived. offer_clean (018) is replaced so an offer's conditions may now be, besides the
-- { key, days } and { key, date } every live offer already holds (unchanged, and read exactly as before):
--   { key, after, days }  within so many working days (1 to 250) of the date the condition `after` (another condition on the same
--                         offer) is satisfied or waived. Refused: one that waits for itself or for a condition that isn't on the
--                         offer, a loop, and a chain of more than three steps.
-- and the offer may carry line_up: true (the buyer ticked "Confirm all conditions on the same day"; kept only when true).
-- Also (Tim, 24 November 2026, the review screen): agent_draft_add (019) replaced to check what Tim did on the review screen
-- (offer_draft_edits_ok: marks and moved places on the blank's own pages, clauses from his library, order, timing, removed numbers),
-- and offer_agent_ai_claim, the daily cap for his clause writer (service role only).
-- Before 022 the live offer_clean silently drops `after` (the condition would then count from the agreement): apply 022 before the
-- page that sends it goes live. Everything else in offer_clean is exactly as in 018. offer_public_submit, agent_offer_add and
-- agent_offer_correct call it and are unchanged. Nothing here touches agreements, signatures, signed records or their triggers.

-- The whole offer, cleaned: only known fields, every one checked and capped. Anything else in what was sent is dropped.
-- p_agent: Tim entering it for a buyer (their email may be missing).
create or replace function public.offer_clean(p jsonb, p_agent boolean default false) returns jsonb language plpgsql stable set search_path = public as $$
declare
  out jsonb := '{}'::jsonb; t text; s jsonb; c jsonb; cs jsonb := '[]'::jsonb; ps jsonb := '[]'::jsonb; pr jsonb; seen text[] := '{}'; k text; n int; d date; price numeric; law jsonb := '{}'::jsonb; lt text;
  a text; chain text[]; steps int; nx jsonb;
  keys text[] := array['builders','finance','lim','lawyer','electrical','technical','toxicology','oia','land_act','sale','sdd','custom'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing was sent'; end if;
  if length(p::text) > 60000 then raise exception 'That is more than the form can take'; end if;
  t := public.offer_txt(p, 'email', 254, not p_agent, 'your email'); if not public.offer_email_ok(t) then raise exception 'Please check your email address'; end if; out := out || jsonb_build_object('email', lower(t));
  t := public.offer_txt(p, 'phone', 40, not p_agent, 'your phone number'); if not public.offer_phone_ok(t) then raise exception 'Please check your phone number'; end if; out := out || jsonb_build_object('phone', t);
  t := public.offer_txt(p, 'seen_docs', 3, true, 'whether you have seen the property documents'); if t not in ('yes','no') then raise exception 'Please check whether you have seen the property documents'; end if; out := out || jsonb_build_object('seen_docs', t);
  t := public.offer_txt(p, 'sign', 9, true, 'how you would like to sign'); if t not in ('digital','in_person') then raise exception 'Please choose how you would like to sign'; end if; out := out || jsonb_build_object('sign', t);
  t := regexp_replace(coalesce(public.offer_txt(p, 'price', 30, true, 'your offer price'), ''), '[$, ]', '', 'g');
  if t !~ '^\d{1,10}(\.\d{1,2})?$' then raise exception 'Please check your offer price'; end if;
  price := t::numeric; if price < 1 or price > 1000000000 then raise exception 'Please check your offer price'; end if; out := out || jsonb_build_object('price', price);
  -- settlement: so many working days after confirmation, or a date
  s := p -> 'settlement'; if s is null or jsonb_typeof(s) <> 'object' then raise exception 'Please choose your settlement date'; end if;
  t := public.offer_txt(s, 'kind', 10, true, 'the settlement date');
  if t = 'relative' then n := public.offer_int(s, 'days', 1, 250, 'the settlement working days'); if n is null then raise exception 'Please add the settlement working days'; end if; out := out || jsonb_build_object('settlement', jsonb_build_object('kind', 'relative', 'days', n));
  elsif t = 'date' then d := public.offer_date(public.offer_txt(s, 'date', 10, true, 'settlement'), 'settlement', p_agent); out := out || jsonb_build_object('settlement', jsonb_build_object('kind', 'date', 'date', d));
  else raise exception 'Please choose your settlement date'; end if;
  -- conditions
  if p ? 'conditions' and jsonb_typeof(p -> 'conditions') <> 'array' then raise exception 'Please check the conditions'; end if;
  if jsonb_array_length(coalesce(p -> 'conditions', '[]')) > 12 then raise exception 'Please check the conditions'; end if;
  for c in select * from jsonb_array_elements(coalesce(p -> 'conditions', '[]')) loop
    if jsonb_typeof(c) <> 'object' then raise exception 'Please check the conditions'; end if;
    k := public.offer_txt(c, 'key', 20, true, 'the condition');
    if not (k = any(keys)) or k = any(seen) then raise exception 'Please check the conditions'; end if; seen := seen || k;
    s := jsonb_build_object('key', k);
    n := public.offer_int(c, 'days', 1, 250, 'the working days for a condition');
    a := public.offer_txt(c, 'after', 20, false, 'the condition it waits for');
    if a is not null then
      -- 022: within so many working days of the date another condition on this offer is satisfied or waived (checked below)
      if n is null then raise exception 'Please add the working days for each condition'; end if;
      s := s || jsonb_build_object('after', a, 'days', n);
    else
      d := public.offer_date(public.offer_txt(c, 'date', 10, false, 'a condition'), 'a condition', p_agent);
      if n is null and d is null then raise exception 'Please add the working days or a date for each condition'; end if;
      if d is not null then s := s || jsonb_build_object('date', d); else s := s || jsonb_build_object('days', n); end if;
    end if;
    if k = 'technical' then s := s || jsonb_build_object('detail', public.offer_txt(c, 'detail', 300, true, 'the kind of technical report')); end if;
    if k = 'custom' then
      s := s || jsonb_strip_nulls(jsonb_build_object('wording', public.offer_txt(c, 'wording', 2000, false, 'your condition'), 'request', public.offer_txt(c, 'request', 600, false, 'your description'), 'ai', coalesce(public.offer_bool(c, 'ai'), false)));
      if s ->> 'wording' is null and s ->> 'request' is null then raise exception 'Please describe your own condition, or untick it'; end if;
    end if;
    cs := cs || jsonb_build_array(s);
  end loop;
  -- 022: a condition that waits for another points at a different condition on this offer, never round in a loop, and at most three
  -- steps in a row (the same rules as chainProblem in onboarding/src/offers-core.js)
  for c in select * from jsonb_array_elements(cs) loop
    continue when not (c ? 'after');
    if (c ->> 'after') = (c ->> 'key') or not ((c ->> 'after') = any(seen)) then raise exception 'Please check the conditions: a condition waits for one that isn''t on the offer'; end if;
  end loop;
  for c in select * from jsonb_array_elements(cs) loop
    continue when not (c ? 'after');
    chain := array[c ->> 'key']; t := c ->> 'after'; steps := 0;
    loop
      if t = any(chain) then raise exception 'Please check the conditions: they wait for each other in a loop'; end if;
      chain := chain || t; steps := steps + 1;
      if steps > 3 then raise exception 'Please check the conditions: too many wait for one another in a row'; end if;
      select x into nx from jsonb_array_elements(cs) x where x ->> 'key' = t limit 1;
      exit when nx is null or not (nx ? 'after');
      t := nx ->> 'after';
    end loop;
  end loop;
  out := out || jsonb_build_object('conditions', cs, 'lawyer_approval', 'lawyer' = any(seen));
  -- 022: the buyer asked for every condition to be confirmed on the same day (kept only when they did)
  if p ? 'line_up' and jsonb_typeof(p -> 'line_up') not in ('boolean', 'null') then raise exception 'Please check the conditions'; end if;
  if public.offer_bool(p, 'line_up') then out := out || jsonb_build_object('line_up', true); end if;
  t := public.offer_txt(p, 'sale_address', 300, 'sale' = any(seen), 'the address of the property you need to sell');
  out := out || jsonb_build_object('sale_address', case when 'sale' = any(seen) then t end);
  if public.offer_bool(p, 'kiwisaver') is null then raise exception 'Please answer the KiwiSaver question'; end if;
  out := out || jsonb_build_object('kiwisaver', public.offer_bool(p, 'kiwisaver'));
  out := out || jsonb_build_object('entity', public.offer_txt(p, 'entity', 200, false, 'the company or trust name'), 'nominee', coalesce(public.offer_bool(p, 'nominee'), true));
  -- purchasers: at least one, as many as needed up to 12 here
  if jsonb_typeof(p -> 'purchasers') is distinct from 'array' or jsonb_array_length(p -> 'purchasers') < 1 then raise exception 'Please add at least one purchaser'; end if;
  if jsonb_array_length(p -> 'purchasers') > 12 then raise exception 'Up to 12 purchasers can be added here. Tim can add more.'; end if;
  for pr in select * from jsonb_array_elements(p -> 'purchasers') loop
    if jsonb_typeof(pr) <> 'object' then raise exception 'Please check the purchasers'; end if;
    s := jsonb_build_object('first', public.offer_txt(pr, 'first', 120, true, 'each purchaser''s legal first names'), 'last', public.offer_txt(pr, 'last', 120, true, 'each purchaser''s last name'),
      'email', lower(public.offer_txt(pr, 'email', 254, false, 'a purchaser''s email')), 'phone', public.offer_txt(pr, 'phone', 40, false, 'a purchaser''s phone'));
    if not public.offer_email_ok(s ->> 'email') then raise exception 'Please check each purchaser''s email'; end if;
    if not public.offer_phone_ok(s ->> 'phone') then raise exception 'Please check each purchaser''s phone number'; end if;
    ps := ps || jsonb_build_array(s);
  end loop;
  out := out || jsonb_build_object('purchasers', ps, 'comments', public.offer_txt(p, 'comments', 3000, false, 'your comments'));
  -- chattels the buyer wants added, and any expressly excluded: free-text rows
  foreach k in array array['chattels_add', 'chattels_exclude'] loop
    if p ? k and jsonb_typeof(p -> k) not in ('array', 'null') then raise exception 'Please check the chattels'; end if;
    if jsonb_array_length(coalesce(nullif(p -> k, 'null'::jsonb), '[]')) > 30 then raise exception 'Up to 30 chattels can be listed here. Tim can add more.'; end if;
    s := '[]'::jsonb;
    for c in select * from jsonb_array_elements(coalesce(nullif(p -> k, 'null'::jsonb), '[]')) loop
      t := public.offer_txt(jsonb_build_object('x', c), 'x', 200, false, 'each chattel');
      if t is not null then s := s || jsonb_build_array(t); end if;
    end loop;
    out := out || jsonb_build_object(k, s);
  end loop;
  -- GST: only when they say they are registered for this purchase
  if p ? 'gst_registered' and jsonb_typeof(p -> 'gst_registered') not in ('boolean', 'null') then raise exception 'Please check the GST answer'; end if;
  out := out || jsonb_build_object('gst_registered', public.offer_bool(p, 'gst_registered'),
    'gst_number', case when public.offer_bool(p, 'gst_registered') then public.offer_txt(p, 'gst_number', 40, false, 'the GST number') end);
  if p ? 'lawyer' and jsonb_typeof(p -> 'lawyer') = 'object' then
    law := jsonb_build_object('firm', public.offer_txt(p -> 'lawyer', 'firm', 200, false, 'the law firm'), 'person', public.offer_txt(p -> 'lawyer', 'person', 200, false, 'your lawyer''s name'),
      'email', lower(public.offer_txt(p -> 'lawyer', 'email', 254, false, 'your lawyer''s email')), 'phone', public.offer_txt(p -> 'lawyer', 'phone', 40, false, 'your lawyer''s phone'));
    if not public.offer_email_ok(law ->> 'email') then raise exception 'Please check your lawyer''s email'; end if;
    if not public.offer_phone_ok(law ->> 'phone') then raise exception 'Please check your lawyer''s phone number'; end if;
  elsif p ? 'lawyer' and jsonb_typeof(p -> 'lawyer') <> 'null' then raise exception 'Please check your lawyer''s details'; end if;
  out := out || jsonb_build_object('lawyer', law);
  if public.offer_bool(p, 'related') is null then raise exception 'Please answer whether any purchaser is connected with Tim or McGuire Real Estate'; end if;
  out := out || jsonb_build_object('related', public.offer_bool(p, 'related'), 'date_help', coalesce(public.offer_bool(p, 'date_help'), false));
  if public.offer_bool(p, 'privacy') is not true then raise exception 'Please read and tick the privacy note'; end if;
  out := out || jsonb_build_object('privacy', true, 'v', 1);
  return out;
end $$;


-- ───── 022: the review screen (Tim, 24 November 2026) ─────
-- Tim's edits to a draft may now hold, besides what 019 took: clauses added from his library (added_terms), the order of the
-- further terms (term_order), a term's own timing (term_timing), the numbers of terms he removed (retired_numbers, never used
-- again), areas he marked on the pages (marks) and places he moved or resized (moves). The browser makes the PDF from them, as in
-- 019; this checks their shape, and that every mark and moved place sits on a page of the blank, in PDF points, at least 8 by 8.
create or replace function public.offer_box_ok(v jsonb, p_sizes jsonb, p_min numeric) returns boolean language plpgsql immutable as $$
declare pg int; w numeric; h numeric;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return false; end if;
  if not public.offer_num_ok(v->'page', 1, jsonb_array_length(p_sizes)) or (v->>'page')::numeric <> trunc((v->>'page')::numeric) then return false; end if;
  pg := (v->>'page')::int; w := (p_sizes->(pg - 1)->>0)::numeric; h := (p_sizes->(pg - 1)->>1)::numeric;
  if not (public.offer_num_ok(v->'x', -1, w + 1) and public.offer_num_ok(v->'y', -1, h + 1) and public.offer_num_ok(v->'w', p_min, w + 1) and public.offer_num_ok(v->'h', p_min, h + 1)) then return false; end if;
  return (v->>'x')::numeric + (v->>'w')::numeric <= w + 1 and (v->>'y')::numeric + (v->>'h')::numeric <= h + 1;
end $$;
create or replace function public.offer_draft_edits_ok(e jsonb, p_sizes jsonb) returns boolean language plpgsql immutable as $$
declare x jsonb; k text;
begin
  if jsonb_typeof(e) <> 'object' or length(e::text) > 200000 then return false; end if;
  if e ? 'marks' then
    if jsonb_typeof(e->'marks') <> 'array' or jsonb_array_length(e->'marks') > 100 then return false; end if;
    for x in select * from jsonb_array_elements(e->'marks') loop
      if coalesce(x->>'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' or coalesce(x->>'type', '') not in ('initials', 'signature', 'strike', 'text', 'highlight') then return false; end if;
      if x ? 'who' and jsonb_typeof(x->'who') <> 'null' and coalesce(x->>'who', '') not in ('purchasers', 'vendors', 'both') then return false; end if;
      if length(coalesce(x->>'text', '')) > 500 or not public.offer_box_ok(x, p_sizes, 8) then return false; end if;
    end loop;
  end if;
  if e ? 'moves' then
    if jsonb_typeof(e->'moves') <> 'object' or (select count(*) from jsonb_object_keys(e->'moves')) > 200 then return false; end if;
    for k, x in select * from jsonb_each(e->'moves') loop
      if k !~ '^[A-Za-z0-9_.:-]{1,80}$' or not public.offer_box_ok(x->'from', p_sizes, 0) or not public.offer_box_ok(x->'to', p_sizes, 4) or (x->'from'->>'page') <> (x->'to'->>'page') then return false; end if;
    end loop;
  end if;
  if e ? 'added_terms' then
    if jsonb_typeof(e->'added_terms') <> 'array' or jsonb_array_length(e->'added_terms') > 30 then return false; end if;
    for x in select * from jsonb_array_elements(e->'added_terms') loop
      if coalesce(x->>'id', '') !~ '^[A-Za-z0-9_]{1,80}$' or coalesce(x->>'key', '') !~ '^[a-z][a-z0-9_]{0,40}$' then return false; end if;
    end loop;
  end if;
  if e ? 'term_order' and (jsonb_typeof(e->'term_order') <> 'array' or jsonb_array_length(e->'term_order') > 120) then return false; end if;
  if e ? 'retired_numbers' then
    if jsonb_typeof(e->'retired_numbers') <> 'array' or jsonb_array_length(e->'retired_numbers') > 120 then return false; end if;
    for x in select * from jsonb_array_elements(e->'retired_numbers') loop if not public.offer_num_ok(x, 1, 999) then return false; end if; end loop;
  end if;
  if e ? 'term_timing' then
    if jsonb_typeof(e->'term_timing') <> 'object' then return false; end if;
    for k, x in select * from jsonb_each(e->'term_timing') loop
      if k !~ '^[A-Za-z0-9_]{1,80}$' or jsonb_typeof(x) <> 'object' then return false; end if;
      if x ? 'days' and jsonb_typeof(x->'days') <> 'null' and not public.offer_num_ok(x->'days', 1, 250) then return false; end if;
      if x ? 'date' and jsonb_typeof(x->'date') <> 'null' and coalesce(x->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      if x ? 'after' and jsonb_typeof(x->'after') <> 'null' and coalesce(x->>'after', '') !~ '^[a-z_]{1,20}$' then return false; end if;
    end loop;
  end if;
  return true;
end $$;

-- 019's agent_draft_add, unchanged but for the check of Tim's edits above (marked 022)
create or replace function public.agent_draft_add(p_offer uuid, p_map uuid, p_path text, p_sha256 text, p_size bigint, p_placed jsonb, p_needs jsonb, p_edits jsonb, p_note text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; m public.offer_blank_maps; b public.offer_blanks; n int; did uuid; obj jsonb; newest uuid;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' or o.details is null then raise exception 'No such offer'; end if;
  select * into m from public.offer_blank_maps where id = p_map; if m.id is null then raise exception 'No such map'; end if;
  if not m.approved then raise exception 'Approve the places on the blank first'; end if;
  select * into b from public.offer_blanks where id = m.blank_id;
  if b.property_id <> o.property_id then raise exception 'That blank is for another property'; end if;
  if not b.edition_checked then raise exception 'This edition of the agreement hasn''t been checked yet'; end if;
  select id into newest from public.offer_blank_maps where blank_id = b.id and approved order by version desc limit 1;
  if newest <> m.id then raise exception 'A newer version of the places on this blank has been approved. Draft again'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'The draft needs its fingerprint'; end if;
  if p_sha256 = b.sha256 then raise exception 'That is the blank itself, not a draft'; end if;
  if coalesce(p_path, '') !~ ('^properties/' || o.property_id || '/docs/offer-draft-' || o.id || '-[0-9]{1,4}-[0-9a-f]{12}\.pdf$') then raise exception 'A draft is stored at its own place'; end if;
  if p_size is null or p_size <= 0 or p_size > 26214400 then raise exception 'Files can be up to 25 MB'; end if;
  obj := public.repo_object(p_path);
  if obj is null then raise exception 'The draft hasn''t arrived yet'; end if;
  if (obj->>'size')::bigint is distinct from p_size or (obj->>'mime') is distinct from 'application/pdf' then raise exception 'The stored draft doesn''t match'; end if;
  if not exists (select 1 from public.offer_file_hashes h where h.path = p_path and h.sha256 = p_sha256 and h.size_bytes = p_size) then
    raise exception 'The draft''s fingerprint hasn''t been confirmed by the server yet. Try again';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  -- 022: what Tim did on the review screen is checked before it is kept (marks and moved places sit on the blank's own pages)
  if not public.offer_draft_edits_ok(coalesce(nullif(p_edits, 'null'::jsonb), '{}'::jsonb), b.sizes) then raise exception 'One of your marks or moved places doesn''t sit on a page of this blank. Draw it again'; end if;
  select coalesce(max(number), 0) + 1 into n from public.offer_drafts where offer_id = p_offer;
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, edits, placed, needs, path, sha256, size_bytes, note, created_by)
  values (p_offer, o.property_id, n, b.id, b.sha256, m.id, o.details, coalesce(nullif(p_edits, 'null'::jsonb), '{}'::jsonb), public.offer_json_list(p_placed, 600, 600000, 'places filled'), public.offer_json_list(p_needs, 200, 100000, 'items that need you'),
    p_path, p_sha256, p_size, nullif(trim(coalesce(p_note, '')), ''), me) returning id into did;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'drafted',
    jsonb_build_object('draft_id', did, 'number', n, 'sha256', p_sha256, 'blank_sha256', b.sha256, 'map_version', m.version, 'needs', jsonb_array_length(coalesce(p_needs, '[]'::jsonb)), 'note', nullif(trim(coalesce(p_note, '')), '')));
  return jsonb_build_object('id', did, 'number', n);
end $$;

-- The daily cap on Tim's own AI help (the clause writer on the review screen and in his clause library), the same setting as the
-- buyers' helper (offer_settings.ai_daily_cap). Counted from ai_calls for that purpose since midnight in New Zealand. Called by the
-- offer-draft edge function with the service role before each model call. {ok} or {ok: false, reason: 'cap'}.
create or replace function public.offer_agent_ai_claim(p_actor text, p_purpose text) returns jsonb language plpgsql security definer set search_path = public as $$
declare used int; cap int;
begin
  if coalesce(p_purpose, '') not in ('offer clause draft') then raise exception 'Not a purpose this checks'; end if;
  select ai_daily_cap into cap from public.offer_settings limit 1;
  select count(*) into used from public.ai_calls where purpose = p_purpose and at >= ((now() at time zone 'Pacific/Auckland')::date)::timestamp at time zone 'Pacific/Auckland';
  if used >= coalesce(cap, 40) then return jsonb_build_object('ok', false, 'reason', 'cap', 'used', used, 'cap', cap); end if;
  return jsonb_build_object('ok', true, 'used', used, 'cap', cap);
end $$;

revoke execute on function public.offer_box_ok(jsonb, jsonb, numeric), public.offer_draft_edits_ok(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.offer_agent_ai_claim(text, text) from public, anon, authenticated;
grant execute on function public.offer_agent_ai_claim(text, text) to service_role;
revoke execute on function public.agent_draft_add(uuid, uuid, text, text, bigint, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.agent_draft_add(uuid, uuid, text, text, bigint, jsonb, jsonb, jsonb, text) to authenticated;
