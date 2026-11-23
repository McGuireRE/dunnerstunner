-- 022 Condition timing (24 November 2026). Additive only: one function replaced, no table or column changed, no data touched.
--
-- Tim often lines his conditions up to confirm on the same day, and a condition may be satisfied within so many working days of the
-- date another condition is satisfied or waived. offer_clean (018) is replaced so an offer's conditions may now be, besides the
-- { key, days } and { key, date } every live offer already holds (unchanged, and read exactly as before):
--   { key, after, days }  within so many working days (1 to 250) of the date the condition `after` (another condition on the same
--                         offer) is satisfied or waived. Refused: one that waits for itself or for a condition that isn't on the
--                         offer, a loop, and a chain of more than three steps.
-- and the offer may carry line_up: true (the buyer ticked "Confirm all conditions on the same day"; kept only when true).
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
