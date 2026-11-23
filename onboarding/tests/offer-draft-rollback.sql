-- Rollback test for migration 019 (drafting offers onto the REINZ blank). Run with onboarding/tests/offer-draft-rollback.js, which
-- puts the whole migration inside the block, so one statement creates everything, runs the checks and then raises, which undoes it
-- all. Nothing is kept. The output is the exception message: refusals read in lower case; a line in CAPITALS means something that
-- should have been refused was allowed, or a value was wrong. Roles: the agent and a vendor are simulated with request.jwt.claims and
-- the authenticated role; the offer-draft edge function with service_role; anyone not signed in with anon.
-- Needs 018 (and 016, 010) applied first.
-- Local run (after the first review): 23 November 2026, on a local PostgreSQL 16 stand-in (tests/pg-standin.sql, then 010, 016 part A and 018): every line as
-- expected, no CAPITALS. NOT yet run on the live project: that run, with Tim's approval, comes before 019 is applied.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; oid uuid; oid2 uuid; doc uuid; doc2 uuid; doc3 uuid; bl uuid; bl2 uuid; m1 uuid; m2 uuid; m3 uuid; d1 uuid; d2 uuid; n int; x text; lk bigint;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-draft-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111e2","role":"authenticated"}';
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid();
  sha_b text := repeat('ab', 32); sha_b2 text := repeat('cd', 32); sha_d1 text := repeat('e1', 32); sha_d2 text := repeat('e2', 32);
  sizes jsonb := '[[595.32,842.04],[595.32,842.04],[595.32,842.04]]';
  places jsonb := '[{"id":"purchaser","key":"purchaser","kind":"area","page":1,"x":31,"y":637,"w":450,"h":40,"label":"Purchaser","source":"anchor"},{"id":"ai1","key":"ack","kind":"initial","page":3,"x":500,"y":400,"w":60,"h":18,"label":"Initial","source":"ai","reason":"Buyer acknowledges the LIM"}]';
  good jsonb;
  nz date := (now() at time zone 'Pacific/Auckland')::date;
begin
  execute $mig$__MIGRATION__$mig$;
  insert into public.properties (address, stage) values ('RB 19 Draft Street, Dunedin', 'live') returning id into pid;
  insert into public.properties (address, stage) values ('RB 20 Other Street, Dunedin', 'live') returning id into pid2;
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Vera Vendor', 'rb-draft-vendor@example.com', 'owner');
  -- the stored files, as storage.objects holds them
  insert into storage.objects (bucket_id, name, metadata) values
    ('property-files', 'properties/' || pid || '/docs/' || k1 || '-Blank.pdf', '{"size": 2366517, "mimetype": "application/pdf"}'),
    ('property-files', 'properties/' || pid || '/docs/' || k2 || '-Blank-old-edition.pdf', '{"size": 1000, "mimetype": "application/pdf"}'),
    ('property-files', 'properties/' || pid || '/docs/' || k3 || '-LIM.pdf', '{"size": 2000, "mimetype": "application/pdf"}');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)),
    'kiwisaver', false, 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Aroha Mere', 'last', 'Smith', 'email', 'aroha@example.com', 'phone', '021 111 2222')), 'related', false, 'privacy', true,
    'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', '', 'phone', ''));

  -- 1. Tim files two blanks and a LIM, and registers them
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  doc := (public.agent_repo_add(pid, jsonb_build_object('key', k1, 'kind', 'REINZ agreement blank', 'name', 'Blank.pdf', 'path', 'properties/' || pid || '/docs/' || k1 || '-Blank.pdf', 'mime_type', 'application/pdf', 'size_bytes', 2366517, 'sha256', sha_b)) ->> 'id')::uuid;
  doc2 := (public.agent_repo_add(pid, jsonb_build_object('key', k2, 'kind', 'REINZ agreement blank', 'name', 'Blank old edition.pdf', 'path', 'properties/' || pid || '/docs/' || k2 || '-Blank-old-edition.pdf', 'mime_type', 'application/pdf', 'size_bytes', 1000, 'sha256', sha_b2)) ->> 'id')::uuid;
  doc3 := (public.agent_repo_add(pid, jsonb_build_object('key', k3, 'kind', 'LIM report', 'name', 'LIM.pdf', 'path', 'properties/' || pid || '/docs/' || k3 || '-LIM.pdf', 'mime_type', 'application/pdf', 'size_bytes', 2000, 'sha256', repeat('11', 32))) ->> 'id')::uuid;
  out := out || 'blank folder=' || (select folder from public.property_documents where id = doc) || '; ';
  begin perform public.agent_blank_add(doc, 3, sizes, 'Eleventh Edition 2022 (4)'); out := out || 'BLANK WITHOUT A CONFIRMED FINGERPRINT; '; exception when others then out := out || 'unconfirmed: ' || sqlerrm || '; '; end;
  begin perform public.offer_file_confirm('properties/' || pid || '/docs/' || k1 || '-Blank.pdf', sha_b, 2366517, 'x'); out := out || 'AGENT CONFIRMED A FINGERPRINT; '; exception when others then out := out || 'agent confirm: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role service_role';   -- the offer-draft edge function, having hashed the stored files
  perform public.offer_file_confirm('properties/' || pid || '/docs/' || k1 || '-Blank.pdf', sha_b, 2366517, 'agent@example.test');
  perform public.offer_file_confirm('properties/' || pid || '/docs/' || k2 || '-Blank-old-edition.pdf', sha_b2, 1000, 'agent@example.test');
  perform public.offer_file_confirm('properties/' || pid || '/docs/' || k1 || '-Blank.pdf', sha_b, 2366517, 'again');
  begin perform public.offer_file_confirm('properties/' || pid || '/docs/' || k1 || '-Blank.pdf', sha_b2, 2366517, 'x'); out := out || 'FINGERPRINT REPLACED; '; exception when others then out := out || 'reconfirm: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_blank_add(doc3, 3, sizes, 'Eleventh Edition 2022 (4)'); out := out || 'A LIM BECAME A BLANK; '; exception when others then out := out || 'lim as blank: ' || sqlerrm || '; '; end;
  begin perform public.agent_blank_add(doc, 3, '[[595,842]]', 'Eleventh Edition 2022 (4)'); out := out || 'SIZES NOT CHECKED; '; exception when others then out := out || 'sizes: ' || sqlerrm || '; '; end;
  r := public.agent_blank_add(doc, 3, sizes, 'Eleventh Edition 2022 (4)'); bl := (r ->> 'id')::uuid;
  out := out || 'blank checked=' || (r ->> 'edition_checked') || ' sha from the file=' || ((select sha256 from public.offer_blanks where id = bl) = sha_b) || '; ';
  r := public.agent_blank_add(doc, 3, sizes, 'Eleventh Edition 2022 (4)'); out := out || 'again existing=' || (r ->> 'existing') || '; ';
  r := public.agent_blank_add(doc2, 3, sizes, 'Tenth Edition 2019 (2)'); bl2 := (r ->> 'id')::uuid; out := out || 'old edition checked=' || (r ->> 'edition_checked') || '; ';
  out := out || 'blanks kept=' || (select count(*) from public.offer_blanks where property_id = pid) || '; ';
  begin perform public.agent_blank_map_save(bl2, places, '[]', '[]', '[]', '[]', true); out := out || 'UNCHECKED EDITION MAPPED; '; exception when others then out := out || 'unchecked edition: ' || sqlerrm || '; '; end;

  -- 2. a blank stays a blank: never shared, never another kind; no other item becomes one
  begin perform public.agent_repo_share(doc, true); out := out || 'BLANK SHARED; '; exception when others then out := out || 'share blank: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_set(doc, '{"kind": "Other"}'); out := out || 'BLANK KIND CHANGED; '; exception when others then out := out || 'blank kind: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_set(doc3, '{"kind": "REINZ agreement blank"}'); out := out || 'LIM TURNED INTO A BLANK; '; exception when others then out := out || 'into blank: ' || sqlerrm || '; '; end;

  -- 3. the map: versions, checks on every place, approval sets the chattels buyers see
  begin perform public.agent_blank_map_save(bl, '[{"id":"x","key":"x","kind":"text","page":9,"x":1,"y":1,"w":1,"h":1}]', '[]', '[]', '[]', '[]', false); out := out || 'PLACE OFF THE BLANK SAVED; '; exception when others then out := out || 'off page: ' || sqlerrm || '; '; end;
  begin perform public.agent_blank_map_save(bl, '[{"id":"x","key":"x","kind":"text","page":1,"x":900,"y":1,"w":1,"h":1}]', '[]', '[]', '[]', '[]', false); out := out || 'PLACE OFF THE PAGE SAVED; '; exception when others then out := out || 'off width: ' || sqlerrm || '; '; end;
  begin perform public.agent_blank_map_save(bl, '[{"id":"x","key":"x","kind":"text","page":1,"x":1,"y":1,"w":1,"h":1},{"id":"x","key":"y","kind":"text","page":1,"x":1,"y":1,"w":1,"h":1}]', '[]', '[]', '[]', '[]', false); out := out || 'DUPLICATE IDS SAVED; '; exception when others then out := out || 'dup ids: ' || sqlerrm || '; '; end;
  begin perform public.agent_blank_map_save(bl, '[{"id":"x","key":"x","kind":"script","page":1,"x":1,"y":1,"w":1,"h":1}]', '[]', '[]', '[]', '[]', false); out := out || 'UNKNOWN KIND SAVED; '; exception when others then out := out || 'kind: ' || sqlerrm || '; '; end;
  m1 := (public.agent_blank_map_save(bl, places, '[{"id":"ai1","decision":"kept"},{"id":"ai2","decision":"deleted"}]', '[]', '[]', '["tenancies"]', false) ->> 'id')::uuid;

  -- 4. drafting: only on an approved map
  oid := public.agent_offer_add(pid, good); oid2 := public.agent_offer_add(pid2, good);
  execute 'reset role';   -- the browser's upload, as storage holds it
  insert into storage.objects (bucket_id, name, metadata) values
    ('property-files', 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', '{"size": 2370000, "mimetype": "application/pdf"}'),
    ('property-files', 'properties/' || pid || '/docs/offer-draft-' || oid || '-2-' || left(sha_d2, 12) || '.pdf', '{"size": 2370100, "mimetype": "application/pdf"}');
  execute 'set local role service_role';
  perform public.offer_file_confirm('properties/' || pid || '/docs/offer-draft-' || oid || '-2-' || left(sha_d2, 12) || '.pdf', sha_d2, 2370100, 'agent@example.test');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_draft_add(oid, m1, 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000, '[]', '[]', '{}', null); out := out || 'DRAFTED ON AN UNAPPROVED MAP; '; exception when others then out := out || 'unapproved: ' || sqlerrm || '; '; end;
  m2 := (public.agent_blank_map_save(bl, places, '[{"id":"ai1","decision":"moved"}]', '["Stove", "Heat pump", "  "]', '[{"text":"An extra LIM page is inserted"}]', '[]', true) ->> 'id')::uuid;
  out := out || 'versions=' || (select string_agg(version::text || ':' || approved, ',' order by version) from public.offer_blank_maps where blank_id = bl) || '; ';
  out := out || 'chattels on the form=' || (select chattels::text from public.offer_links where property_id = pid) || '; ';
  begin perform public.agent_draft_add(oid2, m2, 'properties/' || pid2 || '/docs/offer-draft-' || oid2 || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000, '[]', '[]', '{}', null); out := out || 'DRAFTED ON ANOTHER PROPERTY''S BLANK; '; exception when others then out := out || 'other property: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/elsewhere.pdf', sha_d1, 2370000, '[]', '[]', '{}', null); out := out || 'DRAFT ANYWHERE; '; exception when others then out := out || 'path: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_b, 12) || '.pdf', sha_b, 2370000, '[]', '[]', '{}', null); out := out || 'THE BLANK FILED AS A DRAFT; '; exception when others then out := out || 'blank as draft: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 999, '[]', '[]', '{}', null); out := out || 'WRONG SIZE FILED; '; exception when others then out := out || 'size: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000, '[]', '[]', '{}', null); out := out || 'DRAFT WITHOUT A CONFIRMED FINGERPRINT; '; exception when others then out := out || 'draft unconfirmed: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role service_role';
  perform public.offer_file_confirm('properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000, 'agent@example.test');
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  r := public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000,
    '[{"id":"price","text":"$650,000"}]', '[{"id":"electrical","text":"[Tim to add his electrical report clause]","blocking":true}]', '{}', null);
  d1 := (r ->> 'id')::uuid;
  out := out || 'draft 1 number=' || (r ->> 'number') || ' blank fingerprint=' || ((select blank_sha256 from public.offer_drafts where id = d1) = sha_b) || ' details from the server=' || ((select details from public.offer_drafts where id = d1) = (select details from public.property_offers where id = oid)) || '; ';
  begin perform public.agent_draft_approve(d1, sha_d1); out := out || 'APPROVED WITH A PLACEHOLDER; '; exception when others then out := out || 'placeholder: ' || sqlerrm || '; '; end;
  r := public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-2-' || left(sha_d2, 12) || '.pdf', sha_d2, 2370100, '[{"id":"price","text":"$650,000"}]', '[{"id":"gst","text":"Check GST","blocking":false},{"id":"printed","text":"Printed terms","blocking":true,"ackable":true}]', '{"electrical":"Wording"}', 'Re-draft after a change');
  d2 := (r ->> 'id')::uuid; out := out || 'draft 2 number=' || (r ->> 'number') || ' drafts kept=' || (select count(*) from public.offer_drafts where offer_id = oid) || '; ';
  begin perform public.agent_draft_approve(d1, sha_d1); out := out || 'OLDER DRAFT APPROVED; '; exception when others then out := out || 'older: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_approve(d2, sha_d1); out := out || 'WRONG FINGERPRINT APPROVED; '; exception when others then out := out || 'fingerprint: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_approve(d2, sha_d2); out := out || 'APPROVED WITHOUT TICKING THE CHECK; '; exception when others then out := out || 'ackable unticked: ' || sqlerrm || '; '; end;
  -- the offer changes after the draft: refused until re-drafted
  perform public.agent_offer_correct(oid, good || '{"price": "651000"}', 'Buyer rang');
  begin perform public.agent_draft_approve(d2, sha_d2, array['printed']); out := out || 'APPROVED A STALE DRAFT; '; exception when others then out := out || 'offer changed: ' || sqlerrm || '; '; end;
  perform public.agent_offer_correct(oid, good, 'Back as it was');
  r := public.agent_draft_approve(d2, sha_d2, array['printed']); out := out || 'approved=' || (r ->> 'ok') || ' with sha=' || ((select sha256 from public.offer_draft_approvals where draft_id = d2) = sha_d2) || ' checked=' || (select checked::text from public.offer_draft_approvals where draft_id = d2) || '; ';
  out := out || 'events=' || (select string_agg(kind, ',' order by id) from public.offer_events where property_id = pid and kind in ('blank_loaded','map_saved','map_approved','drafted','draft_approved')) || '; ';
  m3 := (public.agent_blank_map_save(bl, places, '[]', '[]', '[]', '[]', true) ->> 'id')::uuid;
  begin perform public.agent_draft_add(oid, m2, 'properties/' || pid || '/docs/offer-draft-' || oid || '-3-' || left(sha_d1, 12) || '.pdf', sha_d1, 2370000, '[]', '[]', '{}', null); out := out || 'DRAFTED ON A SUPERSEDED MAP; '; exception when others then out := out || 'superseded: ' || sqlerrm || '; '; end;
  -- a second offer's draft on the old map: approval refused once newer places are approved, and once a newer checked blank is loaded
  oid2 := public.agent_offer_add(pid, good);
  execute 'reset role';
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid2, pid, 1, bl, sha_b, m2, (select details from public.property_offers where id = oid2), '[]', '[]', 'rb-stale-draft', repeat('f1', 32), 1, 'test') returning id into d1;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_draft_approve(d1, repeat('f1', 32)); out := out || 'APPROVED ON SUPERSEDED PLACES; '; exception when others then out := out || 'newer places: ' || sqlerrm || '; '; end;
  execute 'reset role';
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid2, pid, 2, bl, sha_b, m3, (select details from public.property_offers where id = oid2), '[]', '[]', 'rb-stale-draft-2', repeat('f2', 32), 1, 'test') returning id into d1;
  -- (inside one transaction now() doesn't move, so the newer blank is stamped a second later)
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by, created_at)
    values (pid, doc3, repeat('99', 32), 1, 'newer.pdf', 3, sizes, 'Eleventh Edition 2022 (4)', true, 'test', now() + interval '1 second');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_draft_approve(d1, repeat('f2', 32)); out := out || 'APPROVED ON AN OLDER BLANK; '; exception when others then out := out || 'newer blank: ' || sqlerrm || '; '; end;

  -- 5. Tim's clause library
  begin perform public.agent_offer_term('deposit_nzret', null, 'REINZ text here', null, null, null); out := out || 'PRINTED CLAUSE GIVEN WORDING; '; exception when others then out := out || 'printed: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_term('electrical', null, 'Words', null, null, null); out := out || 'CONDITION WORDING HELD TWICE; '; exception when others then out := out || 'wording_from: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_term('std_x', 'A term', 'Words', '{"when": {"moon": true}}', null, null); out := out || 'UNKNOWN RULE SAVED; '; exception when others then out := out || 'rule: ' || sqlerrm || '; '; end;
  perform public.agent_offer_term('std_pets', 'Pets', 'Tim''s own wording', '{"when": {"always": true}}', 50, true);
  perform public.agent_offer_term('deposit_nzret', null, null, '{"when": {"kiwisaver": false}, "strike_when_unused": true}', null, null);
  out := out || 'terms=' || (select count(*) from public.offer_terms) || ' changes=' || (select count(*) from public.offer_term_changes) || ' strike=' || (select rule->>'strike_when_unused' from public.offer_terms where key = 'deposit_nzret') || '; ';
  begin delete from public.offer_terms where key = 'std_pets'; out := out || 'TERM DELETED; '; exception when others then out := out || 'term delete: ' || sqlerrm || '; '; end;
  begin insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by) values (oid, pid, 9, bl, sha_b, m2, '{}', '[]', '[]', 'x', sha_d1, 1, 'me'); out := out || 'DIRECT DRAFT INSERT; '; exception when others then out := out || 'direct insert: ' || sqlerrm || '; '; end;
  begin update public.offer_terms set wording = 'x' where key = 'std_pets'; out := out || 'DIRECT TERM UPDATE; '; exception when others then out := out || 'direct term: ' || sqlerrm || '; '; end;
  begin perform public.offer_ai_read_save(bl, '{1}', 'm', true, '{}', 'x'); out := out || 'AGENT WROTE AI READ DIRECTLY; '; exception when others then out := out || 'ai save as agent: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 6. the edge function's records, then Tim ticks a found value
  execute 'set local role service_role';
  perform public.offer_ai_read_save(bl, '{1,2}', 'claude-haiku-5-5', true, '{"places":[]}', 'agent@example.test');
  lk := public.offer_lawyer_save(oid, 'Law Ltd', 'Pat Lawyer', 'claude-haiku-5-5', true, '{"values":[{"id":"v1","field":"phone","value":"03 477 0001","kind":"direct","source_url":"https://law.example/pat"},{"id":"v2","field":"email","value":"Pat@Law.example","kind":"email","source_url":"https://law.example/pat"},{"id":"v3","field":"home","value":"x"}]}', 'agent@example.test');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_lawyer_use(lk, array['v3']); out := out || 'OTHER FIELD USED; '; exception when others then out := out || 'other field: ' || sqlerrm || '; '; end;
  r := public.agent_lawyer_use(lk, array['v1', 'v2']);
  out := out || 'lawyer now=' || (r ->> 'phone') || '/' || (r ->> 'email') || ' buyer phone kept=' || ((select details->>'phone' from public.property_offers where id = oid) = '021 555 0100') || ' purchaser phone kept=' || ((select details->'purchasers'->0->>'phone' from public.property_offers where id = oid) = '021 111 2222') || '; ';
  execute 'reset role';

  -- 7. records stay as made, even for the table owner; nothing is emptied
  begin update public.offer_blanks set sha256 = sha_b2 where id = bl; out := out || 'BLANK FINGERPRINT CHANGED; '; exception when others then out := out || 'blank change: ' || sqlerrm || '; '; end;
  begin delete from public.offer_blanks where id = bl2; out := out || 'BLANK DELETED; '; exception when others then out := out || 'blank delete: ' || sqlerrm || '; '; end;
  begin update public.offer_blank_maps set approved = false where id = m2; out := out || 'MAP CHANGED; '; exception when others then out := out || 'map change: ' || sqlerrm || '; '; end;
  begin update public.offer_drafts set sha256 = sha_d1 where id = d2; out := out || 'DRAFT CHANGED; '; exception when others then out := out || 'draft change: ' || sqlerrm || '; '; end;
  begin delete from public.offer_drafts where id = d1; out := out || 'DRAFT DELETED; '; exception when others then out := out || 'draft delete: ' || sqlerrm || '; '; end;
  begin delete from public.offer_draft_approvals; out := out || 'APPROVAL DELETED; '; exception when others then out := out || 'approval delete: ' || sqlerrm || '; '; end;
  begin delete from public.offer_lawyer_lookups; out := out || 'LOOKUP DELETED; '; exception when others then out := out || 'lookup delete: ' || sqlerrm || '; '; end;
  begin update public.offer_file_hashes set sha256 = sha_b2; out := out || 'HASH CHANGED; '; exception when others then out := out || 'hash change: ' || sqlerrm || '; '; end;
  begin truncate public.offer_drafts cascade; out := out || 'DRAFTS EMPTIED; '; exception when others then out := out || 'truncate drafts: ' || sqlerrm || '; '; end;
  begin truncate public.offer_blanks cascade; out := out || 'BLANKS EMPTIED; '; exception when others then out := out || 'truncate blanks: ' || sqlerrm || '; '; end;
  begin delete from public.property_documents where id = doc; out := out || 'BLANK FILE ROW DELETED; '; exception when others then out := out || 'blank file delete: ' || sqlerrm || '; '; end;

  -- 8. a signed-in vendor of this property sees nothing and can do nothing
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees blanks=' || (select count(*) from public.offer_blanks) || ' maps=' || (select count(*) from public.offer_blank_maps) || ' reads=' || (select count(*) from public.offer_blank_reads)
    || ' drafts=' || (select count(*) from public.offer_drafts) || ' approvals=' || (select count(*) from public.offer_draft_approvals) || ' terms=' || (select count(*) from public.offer_terms)
    || ' lookups=' || (select count(*) from public.offer_lawyer_lookups) || ' hashes=' || (select count(*) from public.offer_file_hashes) || ' blank file=' || (select count(*) from public.property_documents where kind = 'REINZ agreement blank') || '; ';
  begin perform public.agent_blank_map_save(bl, places, '[]', '[]', '[]', '[]', true); out := out || 'VENDOR SAVED A MAP; '; exception when others then out := out || 'vendor map: ' || sqlerrm || '; '; end;
  begin perform public.agent_draft_approve(d2, sha_d2); out := out || 'VENDOR APPROVED; '; exception when others then out := out || 'vendor approve: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_term('std_v', 'V', 'x', '{}', 1, true); out := out || 'VENDOR ADDED A TERM; '; exception when others then out := out || 'vendor term: ' || sqlerrm || '; '; end;
  begin perform public.offer_lawyer_save(oid, 'x', 'y', 'm', true, '{}', 'v'); out := out || 'VENDOR SAVED A LOOKUP; '; exception when others then out := out || 'vendor lookup: ' || sqlerrm || '; '; end;
  begin perform public.offer_file_confirm('properties/' || pid || '/docs/x.pdf', sha_b, 1, 'v'); out := out || 'VENDOR CONFIRMED A FINGERPRINT; '; exception when others then out := out || 'vendor confirm: ' || sqlerrm || '; '; end;
  execute 'reset role';
  execute 'set local role anon'; perform set_config('request.jwt.claims', '', true);
  begin select count(*) into n from public.offer_drafts; out := out || 'ANON READ DRAFTS ' || n || '; '; exception when others then out := out || 'anon drafts: ' || sqlerrm || '; '; end;
  begin select count(*) into n from public.offer_blanks; out := out || 'ANON READ BLANKS ' || n || '; '; exception when others then out := out || 'anon blanks: ' || sqlerrm || '; '; end;
  begin perform public.agent_blank_add(doc, 3, sizes, 'x'); out := out || 'ANON RAN A FUNCTION; '; exception when others then out := out || 'anon fn: ' || sqlerrm || '; '; end;
  execute 'reset role';

  raise exception 'ROLLBACK %', out;
end $t$;
