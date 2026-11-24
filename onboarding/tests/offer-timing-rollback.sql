-- Rollback test for migration 021 (condition timing: a condition that waits for another, and "Confirm all conditions on the same
-- day"). Run with onboarding/tests/offer-timing-rollback.js, which puts the whole migration inside the block, so one statement
-- replaces offer_clean, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception message:
-- refusals read in lower case; a line in CAPITALS means something that should have been refused was allowed, or a value was wrong.
-- Roles: the agent is simulated with request.jwt.claims and the authenticated role; the offer-public edge function with service_role.
-- Needs 018 applied first (and 010, 016 for 018 itself).
-- Local run: 24 November 2026, on a local PostgreSQL 16 stand-in (tests/pg-standin.sql, then 010, 016 part A, 018 and 019): every
-- line as expected, no CAPITALS. NOT yet run on the live project: that run, with Tim's approval, comes before 022 is applied.
do $t$
declare out text := ''; r jsonb; pid uuid; tok text; oid uuid; x text; n bigint; good jsonb; before_days jsonb; before_date jsonb; after_days jsonb; after_date jsonb; cs jsonb;
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

  -- the correction with the details as the screen loaded them: saved; with details that have changed since: refused, nothing saved
  r := public.agent_offer_correct(oid, good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'builders', 'days', 6), jsonb_build_object('key', 'finance', 'days', 6))), 'Timing changed on the draft', (select details from public.property_offers where id = oid));
  out := out || 'expected same=' || ((select details -> 'conditions' -> 0 ->> 'days' from public.property_offers where id = oid) = '6') || '; ';
  x := (select count(*)::text from public.offer_events where offer_id = oid and kind = 'corrected');
  begin perform public.agent_offer_correct(oid, good, 'stale screen', (select details from public.property_offers where id = oid) || '{"price": 1}'::jsonb); out := out || 'STALE CORRECTION SAVED; ';
  exception when others then out := out || 'stale: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_correct(oid, good, 'no expected', null); out := out || 'CORRECTION WITHOUT EXPECTED SAVED; '; exception when others then out := out || 'no expected: ' || left(sqlerrm, 40) || '; '; end;
  out := out || 'events unchanged=' || ((select count(*)::text from public.offer_events where offer_id = oid and kind = 'corrected') = x) || ' days still=' || (select details -> 'conditions' -> 0 ->> 'days' from public.property_offers where id = oid) || '; ';
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

  -- 7. the review screen's edits (022): marks and moved places must sit on a page of the blank; the rest checked for shape
  x := '[[595.32,842.04],[595.32,842.04]]';
  out := out || 'edits ok=' || public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'initials', 'who', 'both', 'page', 1, 'x', 300, 'y', 600, 'w', 80, 'h', 18), jsonb_build_object('id', 'm2', 'type', 'text', 'text', 'Tim', 'page', 2, 'x', 10, 'y', 10, 'w', 100, 'h', 20)),
    'moves', jsonb_build_object('price', jsonb_build_object('from', jsonb_build_object('page', 1, 'x', 98, 'y', 340, 'w', 40, 'h', 11), 'to', jsonb_build_object('page', 1, 'x', 118, 'y', 345, 'w', 60, 'h', 11))),
    'added_terms', jsonb_build_array(jsonb_build_object('id', 'add_std_pool_1', 'key', 'std_pool')), 'term_order', jsonb_build_array('add_std_pool_1'), 'retired_numbers', jsonb_build_array(24), 'term_timing', jsonb_build_object('add_std_pool_1', jsonb_build_object('after', 'finance', 'days', 3))), x::jsonb) || '; ';
  if not public.offer_draft_edits_ok('{"date_format": "date", "items": {"price": "$1"}}'::jsonb, x::jsonb) then out := out || 'PHASE 2 EDITS REFUSED; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'initials', 'page', 3, 'x', 1, 'y', 1, 'w', 20, 'h', 20))), x::jsonb) then out := out || 'MARK ON A PAGE NOT ON THE BLANK; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'initials', 'page', 1, 'x', 580, 'y', 1, 'w', 40, 'h', 20))), x::jsonb) then out := out || 'MARK OFF THE PAGE EDGE; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'initials', 'page', 1, 'x', 1, 'y', 1, 'w', 4, 'h', 20))), x::jsonb) then out := out || 'MARK UNDER THE MINIMUM SIZE; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'erase', 'page', 1, 'x', 1, 'y', 1, 'w', 40, 'h', 20))), x::jsonb) then out := out || 'UNKNOWN MARK TYPE; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('id', 'm1', 'type', 'initials', 'who', 'anyone', 'page', 1, 'x', 1, 'y', 1, 'w', 40, 'h', 20))), x::jsonb) then out := out || 'UNKNOWN SIGNER; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('moves', jsonb_build_object('price', jsonb_build_object('from', jsonb_build_object('page', 1, 'x', 1, 'y', 1, 'w', 9, 'h', 9), 'to', jsonb_build_object('page', 2, 'x', 1, 'y', 1, 'w', 9, 'h', 9)))), x::jsonb) then out := out || 'MOVE ACROSS PAGES; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('term_timing', jsonb_build_object('t1', jsonb_build_object('days', 400))), x::jsonb) then out := out || 'TIMING 400 DAYS; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('added_terms', jsonb_build_array(jsonb_build_object('id', 'a b', 'key', 'std_pool'))), x::jsonb) then out := out || 'BAD ADDED TERM ID; '; end if;
  if not public.offer_draft_edits_ok(jsonb_build_object('extra_terms', jsonb_build_array('Tim typed this.', jsonb_build_object('id', 'ft_ai_k1', 'title', 'Spa pool', 'text', 'The Vendor shall {timing}.', 'ai', true)), 'term_order', jsonb_build_array('ft_ai_k1', 'ft_extra_1'), 'items', jsonb_build_object('price', '$1', 'ft_electrical', 'Words {timing}.'), 'custom_wording', 'Buyer words'), x::jsonb) then out := out || 'GOOD SHAPES REFUSED; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('extra_terms', jsonb_build_array(jsonb_build_object('id', 'bad id', 'title', 'T', 'text', 'X'))), x::jsonb) then out := out || 'EXTRA TERM BAD ID; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('extra_terms', jsonb_build_array(jsonb_build_object('id', 'ft_ai_1', 'title', 'T', 'text', 'X', 'ai', 'yes'))), x::jsonb) then out := out || 'EXTRA TERM AI NOT BOOLEAN; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('extra_terms', jsonb_build_array(jsonb_build_object('id', 'ft_ai_1', 'title', 'T', 'text', repeat('x', 4001)))), x::jsonb) then out := out || 'EXTRA TERM TOO LONG; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('extra_terms', jsonb_build_array(42)), x::jsonb) then out := out || 'EXTRA TERM A NUMBER; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('extra_terms', (select jsonb_agg('t'::text) from generate_series(1, 61))), x::jsonb) then out := out || '61 EXTRA TERMS; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('term_order', jsonb_build_array(1, 'ft_x')), x::jsonb) then out := out || 'TERM ORDER A NUMBER; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('term_order', jsonb_build_array('a b')), x::jsonb) then out := out || 'TERM ORDER BAD ID; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('items', jsonb_build_object('price', 5)), x::jsonb) then out := out || 'ITEM NOT TEXT; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('items', jsonb_build_object('bad key!', 'x')), x::jsonb) then out := out || 'ITEM BAD KEY; '; end if;
  if public.offer_draft_edits_ok(jsonb_build_object('items', '[]'::jsonb), x::jsonb) then out := out || 'ITEMS AN ARRAY; '; end if;
  out := out || 'shapes checked; ';
  out := out || 'draft_add checks edits=' || (pg_get_functiondef('public.agent_draft_add(uuid, uuid, text, text, bigint, jsonb, jsonb, jsonb, text)'::regprocedure) ~ 'offer_draft_edits_ok\(coalesce\(nullif\(p_edits') || '; ';
  begin execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true); perform public.offer_draft_edits_ok('{}'::jsonb, '[]'::jsonb); out := out || 'EDITS CHECK CALLABLE BY A USER; '; exception when others then out := out || 'edits check: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 8. the daily cap on Tim's clause writer: each claim reserves its row in ai_calls (service role only), so with the cap at 3 the
  --    fourth claim is refused even though no log was ever finished; a row from two days ago and another purpose don't count
  update public.offer_settings set ai_daily_cap = 3;
  insert into public.ai_calls (at, purpose, model, ok, agent) values (now() - interval '2 days', 'offer clause draft', 'claude-sonnet-5-5', true, 'agent');
  insert into public.ai_calls (purpose, model, ok, agent) values ('offer condition draft', 'claude-sonnet-5-5', true, 'buyer form');
  execute 'set local role service_role';
  r := public.offer_agent_ai_claim('agent', 'offer clause draft'); out := out || 'claim 1=' || (r ->> 'ok') || ' id=' || ((r ->> 'id') is not null) || '; ';
  n := (r ->> 'id')::bigint;
  r := public.offer_agent_ai_claim('agent', 'offer clause draft'); out := out || 'claim 2=' || (r ->> 'ok') || '; ';
  r := public.offer_agent_ai_claim('agent', 'offer clause draft'); out := out || 'claim 3=' || (r ->> 'ok') || '; ';
  r := public.offer_agent_ai_claim('agent', 'offer clause draft'); out := out || 'claim 4 (no logs finished)=' || (r ->> 'ok') || ' reason=' || coalesce(r ->> 'reason', '-') || ' used=' || (r ->> 'used') || '; ';
  if (r ->> 'ok')::boolean then out := out || 'CLAIM OVER THE CAP; '; end if;
  perform public.offer_agent_ai_done(n, true, null, 400, 90);
  execute 'reset role';
  out := out || 'pending rows=' || (select count(*) from public.ai_calls where purpose = 'offer clause draft' and error = 'pending') || ' finished=' || (select ok::text || '/' || input_tokens || '/' || coalesce(error, 'null') from public.ai_calls where id = n) || '; ';
  execute 'set local role service_role';
  begin perform public.offer_agent_ai_done(n, false, 'again', 0, 0); out := out || 'FINISHED TWICE; '; exception when others then out := out || 'finish twice: ' || sqlerrm || '; '; end;
  begin perform public.offer_agent_ai_claim('agent', 'something else'); out := out || 'OTHER PURPOSE CLAIMED; '; exception when others then out := out || 'other purpose: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true); perform public.offer_agent_ai_claim('agent', 'offer clause draft'); out := out || 'CLAIM CALLABLE BY A USER; '; exception when others then out := out || 'claim as a user: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true); perform public.offer_agent_ai_done(n, true, null, 1, 1); out := out || 'DONE CALLABLE BY A USER; '; exception when others then out := out || 'done as a user: ' || sqlerrm || '; '; end;
  execute 'reset role';
  out := out || 'claim takes a lock=' || (pg_get_functiondef('public.offer_agent_ai_claim(text, text)'::regprocedure) ~ 'pg_advisory_xact_lock') || '; ';

  raise exception 'ROLLBACK %', out;
end $t$;
