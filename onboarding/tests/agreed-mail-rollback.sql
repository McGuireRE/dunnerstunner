-- Rollback test for migration 030 (Agreed emails filled in: the purchasers' email may be cc'd to their lawyer as the agreed draft's
-- contact page has them). Run with onboarding/tests/agreed-mail-rollback.js, which puts the whole migration inside the block, so one
-- statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception
-- message: lower case reads as expected; a line in CAPITALS means something was wrong.
-- Needs 024 to 026 (and what they build on) applied first. The fixture (one agreed offer with its draft, document, round and agreement,
-- and a second offer) is written in replica mode, so the foreign keys and fixed-record guards don't ask for a whole signing history;
-- the mode is switched back before the migration, and every check runs with all triggers live.
do $t$
declare out text := ''; pid uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid(); drid uuid := gen_random_uuid(); dr2 uuid := gen_random_uuid();
  docid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); agid uuid := gen_random_uuid(); aid uuid := gen_random_uuid(); x text; e text;
  kinds text[] := array['agreed_vendors', 'sign_link', 'reopened', 'withdraw_party', 'withdraw_lawyer']; before_ text[] := '{}'; after_ text[] := '{}'; k text;
  det jsonb := jsonb_build_object('email', 'rb-buyer@example.com', 'phone', '021 555 0100', 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Testbuyer', 'email', 'rb-ana@example.com', 'phone', '021 111 2222')),
    'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  placed jsonb := jsonb_build_array(jsonb_build_object('id', 'pl_email', 'text', 'Pat.Contract@law.example'), jsonb_build_object('id', 'pl_service', 'text', 'notices@law.example'),
    jsonb_build_object('id', 'vl_email', 'text', 'sam@counsel.example'), jsonb_build_object('id', 'price', 'text', '$650,000'));
  allowed_ text[]; h text := repeat('a1', 32);
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
  -- 5. still not runnable by anyone but the database's own functions
  if has_function_privilege('authenticated', 'public.offer_mail_allowed(uuid, text, uuid)', 'execute') or has_function_privilege('anon', 'public.offer_mail_allowed(uuid, text, uuid)', 'execute') then out := out || 'OFFER_MAIL_ALLOWED RUNNABLE BY A SIGNED-IN USER; ';
  else out := out || 'not runnable by anon or signed-in users; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;
