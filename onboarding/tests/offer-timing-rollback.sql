-- Rollback test for migration 022 (condition timing: a condition that waits for another, and "Confirm all conditions on the same
-- day"). Run with onboarding/tests/offer-timing-rollback.js, which puts the whole migration inside the block, so one statement
-- replaces offer_clean, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception message:
-- refusals read in lower case; a line in CAPITALS means something that should have been refused was allowed, or a value was wrong.
-- Roles: the agent is simulated with request.jwt.claims and the authenticated role; the offer-public edge function with service_role.
-- Needs 018 applied first (and 010, 016 for 018 itself).
-- Local run: 24 November 2026, on a local PostgreSQL 16 stand-in (tests/pg-standin.sql, then 010, 016 part A, 018 and 019): every
-- line as expected, no CAPITALS. NOT yet run on the live project: that run, with Tim's approval, comes before 022 is applied.
do $t$
declare out text := ''; r jsonb; pid uuid; tok text; oid uuid; x text; good jsonb; before_days jsonb; before_date jsonb; after_days jsonb; after_date jsonb; cs jsonb;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  nz date := (now() at time zone 'Pacific/Auckland')::date;
begin
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'kiwisaver', false, 'related', false, 'privacy', true,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Aroha Mere', 'last', 'Smith')));
  -- what 018 makes of offers as they are today, before 022: each must read exactly the same afterwards
  before_days := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10), jsonb_build_object('key', 'builders', 'days', '7'))));
  before_date := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'lim', 'date', (nz + 20)::text), jsonb_build_object('key', 'technical', 'days', 5, 'detail', 'Drainage'))));
  -- before 022 a condition that waits for another loses its link: why 022 goes on before the page that sends it
  out := out || '018 drops after=' || (public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10), jsonb_build_object('key', 'lim', 'after', 'finance', 'days', 3)))) -> 'conditions' -> 1 = '{"key": "lim", "days": 3}'::jsonb) || '; ';

  execute $mig$__MIGRATION__$mig$;

  -- 1. old offers read exactly as before
  after_days := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10), jsonb_build_object('key', 'builders', 'days', '7'))));
  after_date := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'lim', 'date', (nz + 20)::text), jsonb_build_object('key', 'technical', 'days', 5, 'detail', 'Drainage'))));
  out := out || 'old days same=' || (after_days = before_days) || ' old date same=' || (after_date = before_date) || ' no line_up key=' || (not (after_days ? 'line_up')) || '; ';
  if after_days <> before_days or after_date <> before_date then out := out || 'OLD OFFER CHANGED; '; end if;

  -- 2. a chain: builders by days, finance 5 working days after builders, LIM 3 after finance, custom 2 after LIM (three steps)
  cs := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 10), jsonb_build_object('key', 'finance', 'after', 'builders', 'days', 5, 'date', (nz + 9)::text),
    jsonb_build_object('key', 'lim', 'after', 'finance', 'days', '3'), jsonb_build_object('key', 'custom', 'after', 'lim', 'days', 2, 'wording', 'Subject to X {timing}.')))) -> 'conditions';
  out := out || 'chain=' || cs::text || '; ';
  if cs -> 1 <> '{"key": "finance", "days": 5, "after": "builders"}'::jsonb then out := out || 'FINANCE AFTER NOT KEPT (OR KEPT A DATE); '; end if;
  if cs -> 3 ->> 'after' <> 'lim' or cs -> 3 ->> 'wording' <> 'Subject to X {timing}.' then out := out || 'CUSTOM AFTER NOT KEPT; '; end if;

  -- 3. refusals
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'finance', 'days', 5)))); out := out || 'SELF ALLOWED; '; exception when others then out := out || 'self: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 5)))); out := out || 'MISSING TARGET ALLOWED; '; exception when others then out := out || 'missing: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'nonsense', 'days', 5)))); out := out || 'UNKNOWN TARGET ALLOWED; '; exception when others then out := out || 'unknown: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 5), jsonb_build_object('key', 'lim', 'after', 'finance', 'days', 5)))); out := out || 'LOOP ALLOWED; '; exception when others then out := out || 'loop: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 5), jsonb_build_object('key', 'lim', 'after', 'electrical', 'days', 5), jsonb_build_object('key', 'electrical', 'after', 'finance', 'days', 2)))); out := out || 'THREE-WAY LOOP ALLOWED; '; exception when others then out := out || 'loop3: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', 'builders', 'days', 1), jsonb_build_object('key', 'lim', 'after', 'finance', 'days', 1), jsonb_build_object('key', 'electrical', 'after', 'lim', 'days', 1), jsonb_build_object('key', 'technical', 'after', 'electrical', 'days', 1, 'detail', 'Roof')))); out := out || 'FOUR STEPS ALLOWED; '; exception when others then out := out || 'deep: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', 'builders')))); out := out || 'AFTER WITHOUT DAYS ALLOWED; '; exception when others then out := out || 'no days: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', 'builders', 'days', 251)))); out := out || '251 DAYS ALLOWED; '; exception when others then out := out || 'too many days: ' || sqlerrm || '; '; end;
  begin perform public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', jsonb_build_array('builders'), 'days', 2)))); out := out || 'ARRAY TARGET ALLOWED; '; exception when others then out := out || 'array: ' || sqlerrm || '; '; end;
  -- three steps is fine
  x := public.offer_clean(good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 4), jsonb_build_object('key', 'finance', 'after', 'builders', 'days', 1), jsonb_build_object('key', 'lim', 'after', 'finance', 'days', 1), jsonb_build_object('key', 'electrical', 'after', 'lim', 'days', 1)))) -> 'conditions' -> 3 ->> 'after';
  out := out || 'three steps ok=' || (x = 'lim') || '; ';

  -- 4. "Confirm all conditions on the same day": kept only when true
  out := out || 'line_up true=' || coalesce(public.offer_clean(good || '{"line_up": true}'::jsonb) ->> 'line_up', 'MISSING') || ' false kept=' || (public.offer_clean(good || '{"line_up": false}'::jsonb) ? 'line_up') || '; ';
  begin perform public.offer_clean(good || '{"line_up": "yes"}'::jsonb); out := out || 'LINE_UP TEXT ALLOWED; '; exception when others then out := out || 'line_up text: ' || sqlerrm || '; '; end;

  -- 5. through Tim's own functions: an offer for a buyer with a chain, then a correction lining them up
  insert into public.properties (address, stage) values ('RB 22 Timing Street, Dunedin', 'live') returning id into pid;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  oid := public.agent_offer_add(pid, good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 10), jsonb_build_object('key', 'finance', 'after', 'builders', 'days', 5))));
  out := out || 'added=' || (select (details -> 'conditions')::text from public.property_offers where id = oid) || '; ';
  r := public.agent_offer_correct(oid, good || jsonb_build_object('line_up', true, 'conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 8), jsonb_build_object('key', 'finance', 'days', 8))), 'Lined up the conditions: all within 8 working days');
  out := out || 'corrected line_up=' || (select details ->> 'line_up' from public.property_offers where id = oid) || ' submission kept=' || (select submission -> 'conditions' -> 1 ->> 'after' from public.property_offers where id = oid) || '; ';
  begin perform public.agent_offer_correct(oid, good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 5))), 'bad chain'); out := out || 'CORRECTION WITH A BAD CHAIN SAVED; '; exception when others then out := out || 'bad correction: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 6. through the public door (the edge function, service role)
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  tok := public.agent_offer_link(pid, 'open') ->> 'token';
  execute 'reset role'; execute 'set local role service_role';
  r := public.offer_public_submit(tok, good || jsonb_build_object('line_up', true, 'conditions', jsonb_build_array(jsonb_build_object('key', 'lim', 'days', 10), jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 2))), 'rb-timing-net', false);
  out := out || 'public ok=' || (r ->> 'ok') || '; ';
  begin perform public.offer_public_submit(tok, good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'after', 'lim', 'days', 2), jsonb_build_object('key', 'lim', 'after', 'finance', 'days', 2))), 'rb-timing-net', false); out := out || 'PUBLIC LOOP ALLOWED; '; exception when others then out := out || 'public loop: ' || sqlerrm || '; '; end;
  execute 'reset role';
  out := out || 'public stored=' || (select (details -> 'conditions')::text || ' line_up=' || (details ->> 'line_up') from public.property_offers where property_id = pid and source = 'buyer' order by received_at desc limit 1) || '; ';

  raise exception 'ROLLBACK %', out;
end $t$;
