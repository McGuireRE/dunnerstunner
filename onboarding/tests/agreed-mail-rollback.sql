-- Rollback test for migration 030 (Agreed emails filled in: the purchasers' email may be cc'd to their lawyer as the agreed draft's
-- contact page has them). Run with onboarding/tests/agreed-mail-rollback.js, which puts the whole migration inside the block, so one
-- statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception
-- message: lower case reads as expected; a line in CAPITALS means something was wrong.
-- Needs 024 to 026 (and what they build on) applied first. The fixture (one agreed offer with its draft, document, round and agreement,
-- and a second offer) is written in replica mode, so the foreign keys and fixed-record guards don't ask for a whole signing history;
-- the mode is switched back before the migration, and every check runs with all triggers live.
-- Part 2 (the vendors' lawyer's phone) writes the agency agreement's tables in the normal way, with every trigger and key live. The local
-- stand-in needs tests/pg-standin-agency.sql for them (those tables, auth.users and the lawyer functions as live; run once after 029).
-- The vendor is a made-up auth.users row (no email), made in the block and rolled back with it: agreement_people.user_id references
-- auth.users on live. A fixture that doesn't fit the schema shows as a line in CAPITALS, never as a rule working.
do $t$
declare out text := ''; pid uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid(); drid uuid := gen_random_uuid(); dr2 uuid := gen_random_uuid();
  docid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); agid uuid := gen_random_uuid(); aid uuid := gen_random_uuid(); x text; e text;
  kinds text[] := array['agreed_vendors', 'sign_link', 'reopened', 'withdraw_party', 'withdraw_lawyer']; before_ text[] := '{}'; after_ text[] := '{}'; k text;
  det jsonb := jsonb_build_object('email', 'rb-buyer@example.com', 'phone', '021 555 0100', 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Testbuyer', 'email', 'rb-ana@example.com', 'phone', '021 111 2222')),
    'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  placed jsonb := jsonb_build_array(jsonb_build_object('id', 'pl_email', 'text', 'Pat.Contract@law.example'), jsonb_build_object('id', 'pl_service', 'text', 'notices@law.example'),
    jsonb_build_object('id', 'vl_email', 'text', 'sam@counsel.example'), jsonb_build_object('id', 'price', 'text', '$650,000'));
  allowed_ text[]; h text := repeat('a1', 32); aid2 uuid := gen_random_uuid(); vuser uuid := gen_random_uuid(); lid uuid; old_ text[]; new_ text[];
  vendor text; agentc text;
begin
  set local session_replication_role = replica;
  insert into public.properties (id, address, stage) values (pid, 'RB 30 Mail Street, Dunedin', 'under_offer');
  insert into public.agreements (id, property_id, status) values (aid, pid, 'countersigned');
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 1, 'Vera Vendor', 'rb-vera@example.com', '022 987 6543', 'owner');
  insert into public.property_offers (id, property_id, source, details, status) values (oid, pid, 'agent', det, 'accepted'), (oid2, pid, 'agent', det, 'received');
  insert into public.offer_drafts (id, offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (drid, oid, pid, 1, gen_random_uuid(), h, gen_random_uuid(), det, placed, '[]', 'rb-p1', h, 1, 'rb'),
           (dr2, oid2, pid, 1, gen_random_uuid(), h, gen_random_uuid(), det, jsonb_build_array(jsonb_build_object('id', 'pl_email', 'text', 'other-offer@law.example'), jsonb_build_object('id', 'pl_service', 'text', 'none')), '[]', 'rb-p2', h, 1, 'rb');
  insert into public.offer_documents (id, offer_id, property_id, number, draft_id, draft_sha256) values (docid, oid, pid, 1, drid, h);
  insert into public.offer_rounds (id, offer_id, property_id, signing_id, number, draft_id, draft_sha256, places_sha256, path, sha256, size_bytes, execution, chain_last, locked_by)
    values (rid, oid, pid, gen_random_uuid(), 1, drid, h, h, 'rb-r1', h, 1, '{}', h, 'rb');
  insert into public.offer_agreements (id, offer_id, property_id, document_id, round_id, path, sha256, size_bytes, agreement_date, date_text, accepted_at, round_sha256, draw_version, terms, record, chain_last, confirmed_by)
    values (agid, oid, pid, docid, rid, 'agreed.pdf', h, 1, current_date, '26 November 2026', now(), h, 'v1.0', '{}', '{}', h, 'rb');
  set local session_replication_role = origin;

  -- 024 as it is: the lawyer email on the agreed draft's contact page is refused as the purchasers' cc
  allowed_ := public.offer_mail_allowed(oid, 'agreed_purchasers', null); out := out || '024 purchasers=' || array_to_string(allowed_, ',') || '; ';
  if 'pat.contract@law.example' = any(allowed_) then out := out || 'EXPECTED 024 TO REFUSE THE DRAFT''S LAWYER EMAIL (TEST SET-UP WRONG); '; end if;
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['rb-ana@example.com'], array['pat.contract@law.example'], 'Congratulations!', 'Hello'); out := out || '024 CC ACCEPTED; ';
  exception when others then out := out || '024 cc refused: ' || sqlerrm || '; '; end;
  foreach k in array kinds loop before_ := before_ || coalesce(array_to_string(public.offer_mail_allowed(oid, k, null), ','), ''); end loop;

  -- a vendor on two agency agreements (one signed, one not), and an agent
  insert into auth.users (id) values (vuser);   -- made up, no email; rolled back with the block
  insert into public.agreements (id, property_id, status) values (aid2, pid, 'sent');
  insert into public.agreement_people (agreement_id, user_id, legal_name, email, phone) values (aid, vuser, 'Vera Vendor', 'rb-vera@example.com', '022 987 6543'), (aid2, vuser, 'Vera Vendor', 'rb-vera@example.com', '022 987 6543');
  insert into public.agents (email, name) values ('rb-agent@example.com', 'RB Agent') on conflict do nothing;
  vendor := json_build_object('sub', vuser, 'email', 'rb-vera@example.com', 'role', 'authenticated')::text; agentc := json_build_object('sub', gen_random_uuid(), 'email', 'rb-agent@example.com', 'role', 'authenticated')::text;
  select array_agg(md5(pg_get_functiondef(fn_::regprocedure)) order by fn_) into old_ from unnest(array['public.agent_send_to_lawyer(uuid,text,text,text)', 'public.vendor_forward_to_lawyer(uuid,text,text,text)', 'public.vendor_send_to_lawyer(uuid,text,text,text)']) fn_;

  execute $mig$__MIGRATION__$mig$;

  -- 1. the purchasers' lawyer on the agreed draft (email and notices address, lower case) may now receive it; what was allowed still is
  allowed_ := public.offer_mail_allowed(oid, 'agreed_purchasers', null); out := out || '030 purchasers=' || array_to_string(allowed_, ',') || '; ';
  foreach x in array array['rb-buyer@example.com', 'rb-ana@example.com', 'pat@law.example', 'pat.contract@law.example', 'notices@law.example'] loop
    if not (x = any(allowed_)) then out := out || 'MISSING ' || upper(x) || '; '; end if; end loop;
  -- 2. never another offer's draft, the vendors' lawyer, a vendor, or a placed value that isn't an email
  foreach x in array array['other-offer@law.example', 'sam@counsel.example', 'rb-vera@example.com', 'none'] loop
    if x = any(allowed_) then out := out || 'WRONGLY ALLOWED ' || upper(x) || '; '; end if; end loop;
  allowed_ := public.offer_mail_allowed(oid2, 'agreed_purchasers', null);
  if 'other-offer@law.example' = any(allowed_) or 'none' = any(allowed_) then out := out || 'AN OFFER WITHOUT AN AGREEMENT TAKES ITS DRAFT''S ADDRESS; '; else out := out || 'no agreement: only the offer''s own addresses (' || array_to_string(allowed_, ',') || '); '; end if;
  -- 3. every other kind of email: exactly as before
  foreach k in array kinds loop after_ := after_ || coalesce(array_to_string(public.offer_mail_allowed(oid, k, null), ','), ''); end loop;
  if after_ is distinct from before_ then out := out || 'OTHER KINDS CHANGED ' || array_to_string(before_, '|') || ' -> ' || array_to_string(after_, '|') || '; '; else out := out || 'other kinds unchanged; '; end if;
  -- 4. the check now accepts the cc from the agreed draft; a stranger, and the vendor's own email in the body, are still refused
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['rb-ana@example.com'], array['Pat.Contract@law.example', 'notices@law.example'], 'Congratulations!', 'Your lawyer: Pat Lawyer, pat.contract@law.example. Notices are served to: notices@law.example');
    out := out || 'cc from the agreed draft accepted; '; exception when others then out := out || 'CC REFUSED: ' || upper(sqlerrm) || '; '; end;
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['rb-ana@example.com'], array['stranger@example.com'], 'Congratulations!', 'Hello'); out := out || 'A STRANGER WAS ACCEPTED; ';
  exception when others then out := out || 'stranger refused (' || sqlerrm || '); '; end;
  begin perform public.offer_mail_check(oid, 'agreed_purchasers', null, array['rb-ana@example.com'], array['pat.contract@law.example'], 'Congratulations!', 'The vendor is at rb-vera@example.com'); out := out || 'THE VENDOR''S OWN EMAIL WAS ACCEPTED; ';
  exception when others then out := out || 'privacy guard unchanged (' || sqlerrm || '); '; end;
  -- 4b. after review: a purchasers' lawyer address on the agreed draft that is a vendor's own is refused; the mirror for the vendors'
  -- lawyer (on the draft, or the agency agreement's lawyer link) that is a purchaser's own; Tim's own address is never a party's
  set local session_replication_role = replica;
  update public.offer_drafts d0 set placed = d0.placed || jsonb_build_array(jsonb_build_object('id', 'pl_service', 'text', 'RB-Vera@example.com'), jsonb_build_object('id', 'pl_service', 'text', 'rb-agent@example.com'),
    jsonb_build_object('id', 'vl_service', 'text', 'rb-ana@example.com')) where d0.id = drid;
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 2, 'Agent On File', 'rb-agent@example.com', '', 'contact');
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email) values (aid, 'Buyer Self', '', 'rb-buyer@example.com');
  set local session_replication_role = origin;
  allowed_ := public.offer_mail_allowed(oid, 'agreed_purchasers', null);
  if 'rb-vera@example.com' = any(allowed_) then out := out || 'A VENDOR''S OWN ADDRESS ALLOWED AS THE PURCHASERS'' LAWYER; '; else out := out || 'a vendor''s own address on the contract''s purchasers'' lawyer: refused; '; end if;
  if not ('rb-agent@example.com' = any(allowed_)) then out := out || 'TIM''S OWN ADDRESS REFUSED; '; else out := out || 'Tim''s own address still allowed; '; end if;
  if not ('pat.contract@law.example' = any(allowed_) and 'notices@law.example' = any(allowed_) and 'rb-ana@example.com' = any(allowed_)) then out := out || 'THE PURCHASERS'' OWN OR THEIR LAWYER LOST; '; end if;
  allowed_ := public.offer_mail_allowed(oid, 'agreed_vendors', null); out := out || 'vendors now=' || array_to_string(allowed_, ',') || '; ';
  if 'rb-ana@example.com' = any(allowed_) or 'rb-buyer@example.com' = any(allowed_) then out := out || 'A PURCHASER''S OWN ADDRESS ALLOWED AS THE VENDORS'' LAWYER; '; else out := out || 'a purchaser''s own address as the vendors'' lawyer (draft or lawyer link): refused; '; end if;
  if not ('sam@counsel.example' = any(allowed_)) then out := out || 'THE VENDORS'' LAWYER LOST; '; end if;
  if has_function_privilege('authenticated', 'public.offer_vendor_own_emails(uuid)', 'execute') or has_function_privilege('authenticated', 'public.offer_purchaser_own_emails(uuid)', 'execute') then out := out || 'THE OWN-ADDRESS LISTS ARE RUNNABLE BY SIGNED-IN USERS; '; end if;
  -- the fixture back as it was, for part 2
  set local session_replication_role = replica;
  delete from public.lawyer_links where email = 'rb-buyer@example.com'; delete from public.property_people where property_id = pid and position = 2;
  set local session_replication_role = origin;
  -- 5. still not runnable by anyone but the database's own functions
  if has_function_privilege('authenticated', 'public.offer_mail_allowed(uuid, text, uuid)', 'execute') or has_function_privilege('anon', 'public.offer_mail_allowed(uuid, text, uuid)', 'execute') then out := out || 'OFFER_MAIL_ALLOWED RUNNABLE BY A SIGNED-IN USER; ';
  else out := out || 'not runnable by anon or signed-in users; '; end if;

  -- ── Part 2: the vendors' lawyer's phone ──
  -- 6. the four-argument functions are word for word as they were; the new column refuses words
  select array_agg(md5(pg_get_functiondef(fn_::regprocedure)) order by fn_) into new_ from unnest(array['public.agent_send_to_lawyer(uuid,text,text,text)', 'public.vendor_forward_to_lawyer(uuid,text,text,text)', 'public.vendor_send_to_lawyer(uuid,text,text,text)']) fn_;
  if new_ is distinct from old_ then out := out || 'A FOUR-ARGUMENT LAWYER FUNCTION CHANGED; '; else out := out || 'four-argument lawyer functions unchanged; '; end if;
  begin insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, phone) values (aid, 'X', '', 'x@law.example', 'call me'); out := out || 'A WORDY PHONE WAS STORED; ';
  exception when check_violation then out := out || 'the column refuses a phone that isn''t a number; '; end;
  -- 7. as the vendor: the page's calls, without a phone (four arguments, named, as the page sends them) and with one
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  lid := public.vendor_forward_to_lawyer(a => aid, l_name => 'Sam Counsel', l_firm => 'Counsel and Co', l_email => 'sam@counsel.example');
  out := out || 'no phone: ' || coalesce((select coalesce(phone, 'null') from public.lawyer_links where id = lid), 'NO ROW') || '; ';
  lid := public.vendor_forward_to_lawyer(a => aid, l_name => 'Sam Counsel', l_firm => 'Counsel and Co', l_email => 'sam@counsel.example', l_phone => ' 03 455 0000 ');
  out := out || 'forward with phone: ' || coalesce((select phone from public.lawyer_links where id = lid), 'MISSING') || ', logged ' || coalesce((select detail->>'phone' from public.agreement_events where agreement_id = aid and kind = 'forwarded_to_lawyer' order by id desc limit 1), 'NOT LOGGED') || '; ';
  lid := public.vendor_forward_to_lawyer(a => aid, l_name => 'Sam Counsel', l_firm => '', l_email => 'sam@counsel.example', l_phone => '  ');
  out := out || 'a blank phone: ' || coalesce((select coalesce(phone, 'null') from public.lawyer_links where id = lid), 'NO ROW') || '; ';
  begin perform public.vendor_forward_to_lawyer(a => aid, l_name => 'Sam', l_firm => '', l_email => 'sam@counsel.example', l_phone => 'ring Sam'); out := out || 'A WORDY PHONE WAS ACCEPTED; ';
  exception when others then out := out || 'refused (' || sqlerrm || '); '; end;
  begin perform public.vendor_forward_to_lawyer(a => aid2, l_name => 'Sam', l_firm => '', l_email => 'sam@counsel.example', l_phone => '03 455 0000'); out := out || 'FORWARDED AN UNSIGNED AGREEMENT; ';
  exception when others then out := out || 'unsigned: ' || sqlerrm || '; '; end;
  lid := public.vendor_send_to_lawyer(a => aid2, l_name => 'Sam Counsel', l_firm => 'Counsel and Co', l_email => 'sam@counsel.example', l_phone => '+64 3 455 0000');
  out := out || 'send before signing: ' || coalesce((select phone from public.lawyer_links where id = lid), 'MISSING') || ', ' || (select status from public.agreements where id = aid2) || '; ';
  begin perform public.agent_send_to_lawyer(a => aid2, l_name => 'Sam', l_firm => '', l_email => 'sam@counsel.example', l_phone => '03 455 0000'); out := out || 'A VENDOR RAN THE AGENT''S FUNCTION; ';
  exception when others then out := out || 'the agent''s function refuses a vendor (' || sqlerrm || '); '; end;
  -- 8. as Tim: at the appointment, with the phone
  perform set_config('request.jwt.claims', agentc, true);
  lid := public.agent_send_to_lawyer(a => aid2, l_name => 'Sam Counsel', l_firm => 'Counsel and Co', l_email => 'sam@counsel.example', l_phone => '03 455 0001');
  out := out || 'agent send: ' || coalesce((select phone from public.lawyer_links where id = lid), 'MISSING') || ', logged ' || coalesce((select detail->>'phone' from public.agreement_events where agreement_id = aid2 and kind = 'sent_to_lawyer' order by id desc limit 1), 'NOT LOGGED') || '; ';
  execute 'reset role';
  -- 9. who can run the new ones: signed-in users and the service role, never anon
  foreach x in array array['public.vendor_send_to_lawyer(uuid,text,text,text,text)', 'public.vendor_forward_to_lawyer(uuid,text,text,text,text)', 'public.agent_send_to_lawyer(uuid,text,text,text,text)'] loop
    if has_function_privilege('anon', x, 'execute') or not has_function_privilege('authenticated', x, 'execute') or not has_function_privilege('service_role', x, 'execute') then out := out || 'WRONG PRIVILEGES ON ' || upper(x) || '; '; end if; end loop;
  out := out || 'new functions: signed-in users and the service role only; ';
  -- 10. the vendors' email may still go to that lawyer (the agency agreement in force), and only as before
  if not ('sam@counsel.example' = any(public.offer_mail_allowed(oid, 'agreed_vendors', null))) then out := out || 'THE AGENCY AGREEMENT''S LAWYER IS NOT ALLOWED ON THE VENDORS'' EMAIL; '; else out := out || 'the vendors'' email may go to the agency agreement''s lawyer; '; end if;
  -- 029's guard: an error from a fixture that doesn't fit the schema can't pass as a rule working
  if out ~* 'null value in column|violates foreign key|violates unique|does not exist' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;
