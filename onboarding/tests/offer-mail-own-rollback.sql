-- Rollback test for migration 025 (Offers fixes 2: the agent's own contact details in the email privacy check, and what the offer-sign
-- function needs to email Tim the agreed copy). Run with onboarding/tests/offer-mail-own-rollback.js, which puts the whole migration
-- inside the block, so one statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept. The
-- output is the exception message: lower case reads as expected; a line in CAPITALS means something was wrong.
-- Needs 024 (and what it builds on) applied first. The agent is simulated with request.jwt.claims and the authenticated role.
do $t$
declare out text := ''; pid uuid; oid uuid; oid2 uuid; x text; good jsonb; before_ text[]; after_ text[]; texts text[]; i int; tim_phone text := '027 562 7207';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  a_email text := (select lower(email) from public.agents order by created_at limit 1);
begin
  -- a property Tim sells for himself: the vendor's phone on the property file is the agent's own mobile; their own other phone is on the agency agreement
  insert into public.properties (address, stage) values ('RB 25 Own Street, Dunedin', 'live') returning id into pid;
  -- the agreement first: on the live database, agreement people are copied back onto the property's owners, so the property file is written after it
  insert into public.agreements (property_id, status) values (pid, 'countersigned') returning id into x;
  insert into public.agreement_people (agreement_id, legal_name, email, phone) values (x::uuid, 'Tess Vendor', 'rb-own-vendor@example.com', '022 987 6543');
  delete from public.property_people where property_id = pid;
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 1, 'Tess Vendor', 'rb-own-vendor@example.com', tim_phone, 'owner'),
    (pid, 2, 'Agent As Vendor', a_email, '', 'owner');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)), 'kiwisaver', false,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Testbuyer', 'email', 'ana@example.com', 'phone', '021 111 2222')),
    'related', false, 'privacy', true, 'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  oid := public.agent_offer_add(pid, good);
  execute 'reset role';
  texts := array['Any questions, just call me on ' || tim_phone || '.', 'Call me on 027-562-7207', 'Ring +64 27 562 7207', 'Email me at ' || a_email,
    'The vendor is on 022 987 6543', 'The vendor is on 022/987/6543', 'Write to rb-own-vendor@example.com', 'Nothing private here: settlement 20/12/2026, price $1 250 000', 'Their lawyer: pat@law.example, 03 477 0000'];
  -- 024 as it is: the agent's own phone and email read as the vendor's (the bug Tim met)
  select array_agg(coalesce(public.offer_mail_side_hit(oid, 'vendor', t), '-') order by o_) into before_ from unnest(texts) with ordinality u(t, o_);
  out := out || '024 vendor side=' || array_to_string(before_, ',') || '; ';
  if before_[1] <> 'a vendor' then out := out || 'EXPECTED 024 TO REFUSE THE AGENT PHONE (TEST SET-UP WRONG); '; end if;

  execute $mig$__MIGRATION__$mig$;

  -- 1. the settings hold the agent's own phone and email, and offer_agent_own reads them (with every agent's email)
  out := out || 'settings=' || (select s.agent_phone || '/' || s.agent_email from public.offer_settings s) || '; own=' || (select row_to_json(a)::text from public.offer_agent_own() a) || '; ';
  if (select nsn from public.offer_agent_own()) <> '275627207' then out := out || 'AGENT PHONE NSN WRONG; '; end if;
  if not (a_email = any((select emails from public.offer_agent_own())::text[])) then out := out || 'AGENT EMAIL MISSING; '; end if;
  -- 2. after: the agent's own phone (any spacing, +64) and email pass; a real vendor's own phone and email are still refused; the rest as before
  select array_agg(coalesce(public.offer_mail_side_hit(oid, 'vendor', t), '-') order by o_) into after_ from unnest(texts) with ordinality u(t, o_);
  out := out || '025 vendor side=' || array_to_string(after_, ',') || '; ';
  if after_[1] <> '-' or after_[2] <> '-' or after_[3] <> '-' then out := out || 'AGENT PHONE STILL REFUSED; '; end if;
  if after_[4] <> '-' then out := out || 'AGENT EMAIL STILL REFUSED; '; end if;
  if after_[5] <> 'a vendor' or after_[6] <> 'a vendor' then out := out || 'A REAL VENDOR PHONE PASSED; '; end if;
  if after_[7] <> 'a vendor' then out := out || 'A REAL VENDOR EMAIL PASSED; '; end if;
  for i in 5..9 loop if after_[i] is distinct from before_[i] then out := out || 'CHANGED FOR TEXT ' || i || '; '; end if; end loop;
  -- 3. the purchasers' side the same way: the agent's own phone passes (Tim buying), a purchaser's own phone and email are refused
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  oid2 := public.agent_offer_add(pid, good || jsonb_build_object('phone', tim_phone));
  execute 'reset role';
  out := out || 'purchaser side: agent phone=' || coalesce(public.offer_mail_side_hit(oid2, 'purchaser', 'Call me on ' || tim_phone), '-') || ' own phone=' || coalesce(public.offer_mail_side_hit(oid2, 'purchaser', 'Ana is on 021 111 2222'), '-')
    || ' own email=' || coalesce(public.offer_mail_side_hit(oid2, 'purchaser', 'ana@example.com'), '-') || '; ';
  if public.offer_mail_side_hit(oid2, 'purchaser', 'Call me on ' || tim_phone) is not null or public.offer_mail_side_hit(oid2, 'purchaser', 'Ana is on 021 111 2222') is distinct from 'a purchaser' then out := out || 'PURCHASER SIDE WRONG; '; end if;
  -- 4. a different agent phone in the settings: that one is the agent's now, and the old one reads as the vendor's again
  update public.offer_settings set agent_phone = '021 444 5555';
  if public.offer_mail_side_hit(oid, 'vendor', 'Call me on ' || tim_phone) is distinct from 'a vendor' then out := out || 'SETTINGS NOT THE ONE SOURCE; '; end if;
  update public.offer_settings set agent_phone = tim_phone;
  -- 5. offer_mail_check end to end: the agent's sign-off to the purchasers passes; a real vendor's phone is refused
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['ana@example.com'], '{}', 'Congratulations', 'Dear Ana, call me on ' || tim_phone || '. Tim', false); out := out || 'sign-off check: passes; ';
  exception when others then out := out || 'SIGN-OFF REFUSED: ' || sqlerrm || '; '; end;
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['ana@example.com'], '{}', 'Congratulations', 'Dear Ana, the vendor is on 022 987 6543. Tim', false); out := out || 'VENDOR PHONE PASSED THE CHECK; ';
  exception when others then out := out || 'vendor phone: ' || sqlerrm || '; '; end;
  -- 6. the agreed-copy material: nothing before an agreement; only the service role may run it (and offer_agent_own)
  out := out || 'material before an agreement=' || coalesce(public.offer_agreed_notice_material(oid)::text, 'null') || '; ';
  out := out || 'privileges: anon=' || has_function_privilege('anon', 'public.offer_agreed_notice_material(uuid)', 'execute') || ' authenticated=' || has_function_privilege('authenticated', 'public.offer_agreed_notice_material(uuid)', 'execute')
    || ' service_role=' || has_function_privilege('service_role', 'public.offer_agreed_notice_material(uuid)', 'execute') || ' own(authenticated)=' || has_function_privilege('authenticated', 'public.offer_agent_own()', 'execute')
    || ' side_hit(authenticated)=' || has_function_privilege('authenticated', 'public.offer_mail_side_hit(uuid, text, text)', 'execute') || '; ';
  if has_function_privilege('anon', 'public.offer_agreed_notice_material(uuid)', 'execute') or has_function_privilege('authenticated', 'public.offer_agreed_notice_material(uuid)', 'execute') or not has_function_privilege('service_role', 'public.offer_agreed_notice_material(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.offer_agent_own()', 'execute') or has_function_privilege('authenticated', 'public.offer_mail_side_hit(uuid, text, text)', 'execute') then out := out || 'PRIVILEGES WRONG; '; end if;
  -- 7. the agent's contact as written (for the function's wording), and the integrity alarm on the offer's timeline
  out := out || 'contact=' || public.offer_agent_contact()::text || '; ';
  if public.offer_agent_contact()->>'phone' <> tim_phone then out := out || 'CONTACT PHONE WRONG; '; end if;
  perform public.offer_integrity_alarm(oid, 'agreed copy fingerprint mismatch', jsonb_build_object('path', 'x', 'sha256', repeat('a', 64)));
  out := out || 'alarm=' || coalesce((select kind || ' ' || (detail->>'what') || ' chained=' || (hash is not null) from public.offer_events where offer_id = oid order by id desc limit 1), 'NONE') || '; ';
  if not exists (select 1 from public.offer_events where offer_id = oid and kind = 'integrity_alarm' and detail->>'what' = 'agreed copy fingerprint mismatch') then out := out || 'ALARM NOT RECORDED; '; end if;
  begin perform public.offer_integrity_alarm(oid, repeat('x', 500), '"not an object"'); out := out || 'alarm with odd detail kept: ' || (select length(detail->>'what') from public.offer_events where offer_id = oid order by id desc limit 1) || '; ';
  exception when others then out := out || 'ODD ALARM REFUSED: ' || sqlerrm || '; '; end;
  if has_function_privilege('authenticated', 'public.offer_integrity_alarm(uuid, text, jsonb)', 'execute') or has_function_privilege('authenticated', 'public.offer_agent_contact()', 'execute') or not has_function_privilege('service_role', 'public.offer_agent_contact()', 'execute') then out := out || 'ALARM OR CONTACT PRIVILEGES WRONG; '; end if;
  -- 8. Tim's screen may read the two new columns (column privileges), and still never the salt; an alarm's own what wins over its detail's
  out := out || 'columns: phone=' || has_column_privilege('authenticated', 'public.offer_settings', 'agent_phone', 'select') || ' email=' || has_column_privilege('authenticated', 'public.offer_settings', 'agent_email', 'select') || ' salt=' || has_column_privilege('authenticated', 'public.offer_settings', 'net_salt', 'select') || '; ';
  if not has_column_privilege('authenticated', 'public.offer_settings', 'agent_phone', 'select') or not has_column_privilege('authenticated', 'public.offer_settings', 'agent_email', 'select') or has_column_privilege('authenticated', 'public.offer_settings', 'net_salt', 'select') then out := out || 'COLUMN PRIVILEGES WRONG; '; end if;
  perform public.offer_integrity_alarm(oid, 'the fixed what', jsonb_build_object('what', 'from the detail', 'path', 'y'));
  if (select detail->>'what' from public.offer_events where offer_id = oid order by id desc limit 1) <> 'the fixed what' then out := out || 'DETAIL OVERRODE WHAT; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;
