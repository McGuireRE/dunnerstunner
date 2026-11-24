-- Rollback test for migration 023 (purchaser signing; built as 020). Run with onboarding/tests/offer-sign-rollback.js, which puts the whole migration
-- inside the block, so one statement creates everything, runs the checks and then raises, which undoes it all. Nothing is kept. The
-- output is the exception message: refusals read in lower case; a line in CAPITALS means something that should have been refused was
-- allowed, or a value was wrong. Roles: the agent and a vendor are simulated with request.jwt.claims and the authenticated role; the
-- offer-sign edge function with service_role; anyone not signed in with anon. Needs 019 (and 018, 016, 010) applied first. The blank,
-- map, drafts and approvals are set up directly (019's own rollback test covers how they are made).
-- Local run: 24 November 2026, on a local PostgreSQL 16 stand-in (tests/pg-standin.sql, then 010, 016 part A, 018 and 019 applied):
-- every line as expected, no CAPITALS. Again 24 November 2026 as 023 on main's schema (stand-in, then 010, 016 part A, 018, 019, 021
-- and 022): no CAPITALS. NOT run on the live project: that run, with Tim's approval, comes before 023 is applied.
do $t$
declare out text := ''; r jsonb; pid uuid; oid uuid; oid2 uuid; bl uuid; m uuid; d1 uuid; d2 uuid; d3 uuid; sg uuid; sg2 uuid; sg3 uuid; s1 uuid; s2 uuid; l1 uuid; l2 uuid; tok1 text; tok2 text; ses text; code text; x text; n int; mk uuid; rid uuid;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-sign-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111e3","role":"authenticated"}';
  sizes jsonb := '[[595.32,842.04],[595.32,842.04],[595.32,842.04]]';
  png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
  good jsonb; places jsonb; places1 jsonb; sha_d1 text := repeat('d1', 32); sha_d2 text := repeat('d2', 32); sha_d3 text := repeat('d3', 32); rpath text; rsha text := repeat('5a', 32);
  ok_ boolean; d5 uuid; sg5 uuid; tk jsonb;
begin
  execute $mig$__MIGRATION__$mig$;
  -- the chain hash is SHA-256 of the previous fingerprint, a new line and the body (the same as SIGN.chainHash in src/sign-core.js)
  out := out || 'chain hash same as the browser=' || (public.offer_sha(repeat('0', 64) || E'\n' || 'x') = '0152f4f98e11e409b35bfa9b5e18c329427b7f29deedbc071733db222ce38158') || '; ';
  insert into public.properties (address, stage) values ('RB 20 Sign Street, Dunedin', 'live') returning id into pid;
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Vera Vendor', 'rb-sign-vendor@example.com', 'owner');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)), 'kiwisaver', false,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Testbuyer', 'email', 'ana@example.com', 'phone', '021 111 2222'), jsonb_build_object('first', 'Bo', 'last', 'Testbuyer', 'email', 'bo@example.com', 'phone', '021 333 4444')),
    'related', false, 'privacy', true, 'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', '', 'phone', ''));
  -- places for two signers on a three-page draft: the foot of each page, a filled box and a signature each
  places := '[]'::jsonb;
  for n in 1..2 loop
    places := places || jsonb_build_array(jsonb_build_object('id', 'foot:p1:s' || n, 'signer', n, 'kind', 'initial', 'why', 'foot', 'ref', 'p1', 'page', 1, 'x', 500 + n * 28, 'y', 5, 'w', 26, 'h', 13, 'label', 'Initial the foot of page 1'),
      jsonb_build_object('id', 'foot:p2:s' || n, 'signer', n, 'kind', 'initial', 'why', 'foot', 'ref', 'p2', 'page', 2, 'x', 500 + n * 28, 'y', 5, 'w', 26, 'h', 13, 'label', 'Initial the foot of page 2'),
      jsonb_build_object('id', 'foot:p3:s' || n, 'signer', n, 'kind', 'initial', 'why', 'foot', 'ref', 'p3', 'page', 3, 'x', 500 + n * 28, 'y', 5, 'w', 26, 'h', 13, 'label', 'Initial the foot of page 3'),
      jsonb_build_object('id', 'filled:price:s' || n, 'signer', n, 'kind', 'initial', 'why', 'filled', 'ref', 'price', 'page', 1, 'x', 300 + n * 28, 'y', 340, 'w', 26, 'h', 13, 'label', 'Initial: Purchase price'),
      jsonb_build_object('id', 'block:sig' || n || ':s' || n, 'signer', n, 'kind', 'signature', 'why', 'block', 'ref', 'sig' || n, 'page', 3, 'x', 40, 'y', 530 - n * 70, 'w', 150, 'h', 22, 'label', 'Signature'));
  end loop;
  places1 := (select jsonb_agg(e) from jsonb_array_elements(places) e where e->>'id' <> 'foot:p3:s2');
  -- set up as 019 leaves it: a blank, approved places, an offer drafted and the draft approved
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  oid := public.agent_offer_add(pid, good); oid2 := public.agent_offer_add(pid, good);
  execute 'reset role';
  insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'rb-blank') returning id into x;
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x::uuid, repeat('ab', 32), 10, 'Blank.pdf', 3, sizes, 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[]', true, 'test') returning id into m;
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = oid), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || oid || '-1-' || left(sha_d1, 12) || '.pdf', sha_d1, 100, 'test') returning id into d1;
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid2, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = oid2), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || oid2 || '-1-' || left(sha_d2, 12) || '.pdf', sha_d2, 100, 'test') returning id into d2;

  -- 1. the hash chain: every new offer event carries the fingerprint of the one before it
  out := out || 'chain on new events=' || (select bool_and(hash is not null and body is not null) from public.offer_events where property_id = pid) || ' seqs=' || (select string_agg(seq::text, ',' order by seq) from public.offer_events where offer_id = oid) || '; ';
  out := out || 'first prev is zeros=' || ((select prev_hash from public.offer_events where offer_id = oid and seq = 1) = repeat('0', 64)) || '; ';

  -- 2. release: only an approved draft; every signer's places checked; nothing sent
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_release(d1, 'in_person', sizes, places, '{3}'); out := out || 'RELEASED WITHOUT APPROVAL; '; exception when others then out := out || 'unapproved: ' || sqlerrm || '; '; end;
  execute 'reset role'; insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d1, sha_d1, 'test'), (d2, sha_d2, 'test');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_release(d1, 'in_person', sizes, places1, '{3}'); out := out || 'A PAGE FOOT LEFT OUT; '; exception when others then out := out || 'foot missing: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release(d1, 'in_person', sizes, (select jsonb_agg(e) from jsonb_array_elements(places) e where e->>'kind' <> 'signature' or (e->>'signer')::int = 1), '{3}'); out := out || 'A SIGNER WITHOUT A SIGNATURE; '; exception when others then out := out || 'no signature: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release(d1, 'in_person', sizes, places || '[{"id":"foot:p9:s1","signer":1,"kind":"initial","why":"foot","ref":"p9","page":9,"x":1,"y":1,"w":20,"h":10}]', '{3}'); out := out || 'A PLACE OFF THE DRAFT; '; exception when others then out := out || 'off page: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release(d1, 'in_person', sizes, places || '[{"id":"foot:p1:s3","signer":3,"kind":"initial","why":"foot","ref":"p1","page":1,"x":1,"y":1,"w":20,"h":10}]', '{3}'); out := out || 'A THIRD SIGNER INVENTED; '; exception when others then out := out || 'extra signer: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release(d1, 'email_all', sizes, places, '{3}'); out := out || 'UNKNOWN METHOD; '; exception when others then out := out || 'method: ' || sqlerrm || '; '; end;
  r := public.agent_signing_release(d1, 'in_person', sizes, places, '{3}'); sg := (r ->> 'id')::uuid;
  out := out || 'released status=' || (select status from public.offer_signings where id = sg) || ' signers=' || (select string_agg(name || ':' || coalesce(email, '-'), ',' order by position) from public.offer_signers where signing_id = sg)
    || ' places sha=' || ((select places_sha256 from public.offer_signings where id = sg) = encode(extensions.digest(places::text, 'sha256'), 'hex')) || '; ';
  r := public.agent_signing_release(d1, 'in_person', sizes, places, '{3}'); out := out || 'again existing=' || (r ->> 'existing') || '; ';
  select id into s1 from public.offer_signers where signing_id = sg and position = 1; select id into s2 from public.offer_signers where signing_id = sg and position = 2;

  -- 3. who sees what: a vendor and anyone not signed in see nothing; nobody writes directly; Tim can't read the link fingerprints
  perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees signings=' || (select count(*) from public.offer_signings) || ' signers=' || (select count(*) from public.offer_signers) || ' taps=' || (select count(*) from public.offer_sign_taps) || ' rounds=' || (select count(*) from public.offer_rounds) || '; ';
  begin perform public.agent_signing_start(sg); out := out || 'VENDOR STARTED SIGNING; '; exception when others then out := out || 'vendor start: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'VENDOR TAPPED; '; exception when others then out := out || 'vendor tap: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_open('x', 'n', 'ua'); out := out || 'VENDOR RAN THE LINK DOOR; '; exception when others then out := out || 'vendor door: ' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', agent, true);
  begin perform token_hash from public.offer_signers limit 1; out := out || 'TIM READ A TOKEN FINGERPRINT; '; exception when others then out := out || 'token column: ' || sqlerrm || '; '; end;
  out := out || 'tim reads signers=' || (select count(*) from (select name from public.offer_signers where signing_id = sg) z) || '; ';
  begin update public.offer_signings set status = 'locked' where id = sg; out := out || 'DIRECT SIGNING UPDATE; '; exception when others then out := out || 'direct update: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_taps (signing_id, signer_id, place_id) values (sg, s1, 'foot:p1:s1'); out := out || 'DIRECT TAP; '; exception when others then out := out || 'direct tap: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role anon';
  begin perform count(*) from public.offer_signings; out := out || 'ANON READ SIGNINGS; '; exception when others then out := out || 'anon read: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin update public.offer_signings set status = 'locked' where id = sg; out := out || 'UPDATE WITHOUT THE FUNCTIONS; '; exception when others then out := out || 'guard: ' || sqlerrm || '; '; end;
  begin delete from public.offer_signers where id = s1; out := out || 'SIGNER DELETED; '; exception when others then out := out || 'signer delete: ' || sqlerrm || '; '; end;

  -- 4. in person on Tim's device: each step in order, every place by the signer themselves
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'TAPPED BEFORE START; '; exception when others then out := out || 'not started: ' || sqlerrm || '; '; end;
  perform public.agent_signing_start(sg);
  begin perform public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'TAPPED BEFORE CONSENT; '; exception when others then out := out || 'no consent: ' || sqlerrm || '; '; end;
  perform public.agent_signing_consent(s1, 'Tim''s tablet');
  begin perform public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'TAPPED BEFORE THE GUIDES; '; exception when others then out := out || 'no guides: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_receipt(s1, 'cca', null, null, null, '{2}'); out := out || 'CCA WITH THE WRONG PAGES; '; exception when others then out := out || 'cca pages: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_receipt(s1, 'sale_purchase', 'August 2022', '../x.pdf', null, null); out := out || 'GUIDE WITH A BAD FILE; '; exception when others then out := out || 'guide file: ' || sqlerrm || '; '; end;
  perform public.agent_signing_receipt(s1, 'cca', null, null, null, '{3}');
  perform public.agent_signing_receipt(s1, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', repeat('c0', 32), null);
  begin perform public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'TAPPED WITHOUT DRAWING; '; exception when others then out := out || 'no marks: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_marks(s1, 'data:image/png;base64,AAAA', png); out := out || 'A TINY SIGNATURE KEPT; '; exception when others then out := out || 'tiny sig: ' || sqlerrm || '; '; end;
  perform public.agent_signing_marks(s1, png, png);
  begin perform public.agent_signing_tap(s1, 'foot:p1:s2'); out := out || 'TAPPED ANOTHER SIGNER''S PLACE; '; exception when others then out := out || 'not mine: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_tap(s1, 'foot:p7:s1'); out := out || 'TAPPED A MADE-UP PLACE; '; exception when others then out := out || 'made up: ' || sqlerrm || '; '; end;
  r := public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'first tap=' || (r ->> 'done') || ' of ' || (r ->> 'of') || '; ';
  r := public.agent_signing_tap(s1, 'foot:p1:s1'); out := out || 'same tap again=' || (r ->> 'done') || '; ';
  begin perform public.agent_signing_marks(s1, png || 'AA', png); out := out || 'SIGNATURE REDRAWN AFTER TAPPING; '; exception when others then out := out || 'redraw: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_finish(s1, 'passport', 'ua'); out := out || 'FINISHED WITH PLACES LEFT; '; exception when others then out := out || 'places left: ' || sqlerrm || '; '; end;
  perform public.agent_signing_tap(s1, z.pid_) from (select e->>'id' pid_ from jsonb_array_elements(places) e where (e->>'signer')::int = 1) z;
  begin perform public.agent_signing_finish(s1, 'AB123456', 'ua'); out := out || 'AN ID NUMBER RECORDED; '; exception when others then out := out || 'id number: ' || sqlerrm || '; '; end;
  r := public.agent_signing_finish(s1, 'passport', 'Tim''s tablet'); out := out || 'signer 1 finished complete=' || (r ->> 'complete') || ' witnessed=' || ((select witnessed_by from public.offer_signers where id = s1) is not null) || ' seen sha=' || ((select seen_sha256 from public.offer_signers where id = s1) ~ '^[0-9a-f]{64}$') || '; ';
  -- signer 2 strikes a line on Tim's screen: signing holds for Tim, who re-approves; both then initial the mark
  perform public.agent_signing_consent(s2, 'Tim''s tablet');
  begin perform public.agent_signing_mark(s2, 'strike', 1, '{"x0": 40, "x1": 42, "y": 600}', null); out := out || 'A DOT KEPT AS A STRIKE; '; exception when others then out := out || 'short strike: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(s2, 'cross', 1, '{"x": 560, "y": 500, "w": 100, "h": 40}', null); out := out || 'A BOX OFF THE PAGE; '; exception when others then out := out || 'cross off page: ' || sqlerrm || '; '; end;
  r := public.agent_signing_mark(s2, 'strike', 1, '{"x0": 40, "x1": 200, "y": 450}', null); mk := (r ->> 'id')::uuid;
  out := out || 'after a mark status=' || (select status from public.offer_signings where id = sg) || '; ';
  begin perform public.agent_signing_mark(s2, 'reinstate', 1, '{"x": 40, "y": 455}', gen_random_uuid()); out := out || 'REINSTATED NOTHING; '; exception when others then out := out || 'reinstate nothing: ' || sqlerrm || '; '; end;
  perform public.agent_signing_mark(s2, 'reinstate', 1, '{"x": 40, "y": 455}', mk);
  begin perform public.agent_signing_mark(s2, 'reinstate', 1, '{"x": 40, "y": 455}', mk); out := out || 'REINSTATED TWICE; '; exception when others then out := out || 'reinstate twice: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_receipt(s2, 'cca', null, null, null, '{3}'); out := out || 'RECEIPT WHILE HELD; '; exception when others then out := out || 'held: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_review(sg, '[]'); out := out || 'REVIEWED WITHOUT INITIALS; '; exception when others then out := out || 'review empty: ' || sqlerrm || '; '; end;
  r := public.agent_signing_review(sg, (select jsonb_agg(jsonb_build_object('id', 'mark:' || mm.id || ':s' || gs.nn, 'signer', gs.nn, 'kind', 'initial', 'why', 'mark', 'ref', mm.id, 'page', 1, 'x', 210 + gs.nn * 28 + (case when mm.kind = 'reinstate' then 60 else 0 end), 'y', 445, 'w', 26, 'h', 13, 'label', 'Initial the mark'))
    from public.offer_sign_marks mm, generate_series(1, 2) gs(nn) where mm.signing_id = sg));
  out := out || 'reviewed marks=' || (r ->> 'marks') || ' reopened=' || (r ->> 'reopened') || ' status=' || (select status from public.offer_signings where id = sg) || ' signer 1 finished=' || ((select finished_at from public.offer_signers where id = s1) is not null) || '; ';
  -- signer 1 initials both marks and finishes again; signer 2 does every place and finishes: complete
  perform public.agent_signing_tap(s1, 'mark:' || mm.id || ':s1') from public.offer_sign_marks mm where mm.signing_id = sg;
  perform public.agent_signing_finish(s1, 'passport', 'Tim''s tablet');
  perform public.agent_signing_receipt(s2, 'cca', null, null, null, '{3}'); perform public.agent_signing_receipt(s2, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); perform public.agent_signing_marks(s2, png, png);
  perform public.agent_signing_tap(s2, z.pid_) from (select e->>'id' pid_ from jsonb_array_elements(places) e where (e->>'signer')::int = 2 union select 'mark:' || mm.id || ':s2' from public.offer_sign_marks mm where mm.signing_id = sg) z;
  -- a turn's address is checked whole: the signer, the signing, the offer and the property must belong together
  out := out || 'turn ok=' || public.agent_signing_turn_ok(pid, oid, sg, s2) || case when public.agent_signing_turn_ok(pid, oid2, sg, s2) then ' A TURN OPENED UNDER ANOTHER OFFER' else ' other offer refused' end
    || case when public.agent_signing_turn_ok(gen_random_uuid(), oid, sg, s2) then ' A TURN OPENED UNDER ANOTHER PROPERTY' else ' other property refused' end || '; ';
  -- identity is optional (Tim, 24 November 2026): no choice at all finishes, and is recorded as none
  r := public.agent_signing_finish(s2, null, 'Tim''s tablet');
  out := out || 'signer 2 no identity choice=' || coalesce((select id_sighted from public.offer_signers where id = s2), 'none') || ' recorded on the trail=' || (select (detail ? 'id_sighted') and detail->>'id_sighted' is null from public.offer_events where kind = 'sign_finished' and detail->>'signing_id' = sg::text and (detail->>'signer')::int = 2 order by seq desc limit 1) || '; ';
  out := out || 'signer 2 finished complete=' || (r ->> 'complete') || ' status=' || (select status from public.offer_signings where id = sg) || ' taps=' || (select count(*) from public.offer_sign_taps where signing_id = sg) || '; ';
  begin perform public.agent_signing_tap(s2, 'foot:p1:s2'); out := out || 'TAPPED AFTER COMPLETE; '; exception when others then out := out || 'after complete: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_cancel(sg, 'x'); out := out || 'A FINISHED SIGNING CANCELLED; '; exception when others then out := out || 'cancel after complete: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set user_agent = 'changed' where id = s1; out := out || 'SIGNER CHANGED AFTER COMPLETE; '; exception when others then out := out || 'signer after complete: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);

  -- 5. Round 1: made by the edge function from the material, its fingerprint confirmed from the stored file, then locked
  begin perform public.offer_round_material(sg); out := out || 'AGENT READ THE ROUND MATERIAL; '; exception when others then out := out || 'material as agent: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role service_role';
  r := public.offer_round_material(sg);
  out := out || 'material signers=' || jsonb_array_length(r->'signers') || ' places=' || jsonb_array_length(r->'places') || ' marks=' || jsonb_array_length(r->'marks') || ' no emails=' || (position('@example.com' in (r->'signers')::text) = 0) || '; ';
  rpath := 'properties/' || pid || '/docs/offer-round-' || oid || '-1-' || left(rsha, 12) || '.pdf';
  begin perform public.offer_round_lock(sg, rpath, rsha, 5000, '{"signers": []}', 'agent@example.test'); out := out || 'LOCKED WITHOUT THE FILE; '; exception when others then out := out || 'no file: ' || sqlerrm || '; '; end;
  execute 'reset role'; insert into storage.objects (bucket_id, name, metadata) values ('property-files', rpath, '{"size": 5000, "mimetype": "application/pdf"}'); execute 'set local role service_role';
  begin perform public.offer_round_lock(sg, rpath, rsha, 5000, '{"signers": []}', 'agent@example.test'); out := out || 'LOCKED WITHOUT A CONFIRMED FINGERPRINT; '; exception when others then out := out || 'unconfirmed: ' || sqlerrm || '; '; end;
  perform public.offer_file_confirm(rpath, rsha, 5000, 'agent@example.test');
  begin perform public.offer_round_lock(sg, 'properties/' || pid || '/docs/elsewhere.pdf', rsha, 5000, '{}', 'x'); out := out || 'ROUND STORED ANYWHERE; '; exception when others then out := out || 'round path: ' || sqlerrm || '; '; end;
  r := public.offer_round_lock(sg, rpath, rsha, 5000, '{"signers": []}', 'agent@example.test'); rid := (r ->> 'id')::uuid;
  out := out || 'locked round=' || (r ->> 'number') || ' status=' || (select status from public.offer_signings where id = sg) || ' chain_last is the newest event=' || ((select chain_last from public.offer_rounds where id = rid) = (select hash from public.offer_events where offer_id = oid order by seq desc limit 1)) || '; ';
  r := public.offer_round_lock(sg, rpath, rsha, 5000, '{}', 'again'); out := out || 'lock again existing=' || (r ->> 'existing') || '; ';
  execute 'reset role';
  begin update public.offer_rounds set sha256 = repeat('00', 32) where id = rid; out := out || 'ROUND CHANGED; '; exception when others then out := out || 'round update: ' || sqlerrm || '; '; end;
  begin delete from public.offer_rounds where id = rid; out := out || 'ROUND REMOVED; '; exception when others then out := out || 'round delete: ' || sqlerrm || '; '; end;
  begin truncate public.offer_rounds; out := out || 'ROUNDS EMPTIED; '; exception when others then out := out || 'round truncate: ' || sqlerrm || '; '; end;
  begin truncate public.offer_sign_taps; out := out || 'TAPS EMPTIED; '; exception when others then out := out || 'taps truncate: ' || sqlerrm || '; '; end;
  begin perform set_config('offers.fn', 'on', true); update public.offer_signings set status = 'signing' where id = sg; out := out || 'LOCKED SIGNING REOPENED; '; exception when others then out := out || 'locked reopen: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_release(d1, 'in_person', sizes, places, '{3}'); out := out || 'RELEASED AFTER ROUND 1; '; exception when others then out := out || 'after round: ' || sqlerrm || '; '; end;
  r := public.agent_offer_chain_check(oid); out := out || 'chain ok=' || (r ->> 'ok') || ' events=' || (r ->> 'events') || '; ';

  -- 6. by link, on the second offer: a personal link and a one-time code by email
  -- Tim changes his mind about how they sign before anyone has started: cancelled, recorded, and released again the other way
  perform public.agent_signing_release(d2, 'link', sizes, places, '{3}');
  select id into sg2 from public.offer_signings where draft_id = d2;
  r := public.agent_signing_cancel(sg2, 'They would rather sign with me');
  out := out || 'cancelled=' || (select status from public.offer_signings where id = sg2) || ' recorded=' || exists (select 1 from public.offer_events where kind = 'sign_cancelled' and detail->>'signing_id' = sg2::text) || '; ';
  perform public.agent_signing_release(d2, 'in_person', sizes, places, '{3}');
  select id into sg3 from public.offer_signings where draft_id = d2 and status <> 'cancelled';
  out := out || 'released again=' || (select method from public.offer_signings where id = sg3) || '; ';
  perform public.agent_signing_cancel(sg3, 'Back to links after all');
  perform public.agent_signing_release(d2, 'link', sizes, places, '{3}');
  select id into sg2 from public.offer_signings where draft_id = d2 and status <> 'cancelled';
  out := out || 'link status=' || (select status from public.offer_signings where id = sg2) || ' tokens before send=' || (select count(*) from (select 1 from public.offer_signers where signing_id = sg2 and link_sent_at is not null) z) || '; ';
  begin perform public.offer_sign_issue(sg2, 'x'); out := out || 'AGENT ISSUED LINKS DIRECTLY; '; exception when others then out := out || 'issue as agent: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role service_role';
  r := public.offer_sign_issue(sg2, 'agent@example.test'); tok1 := r->'links'->0->>'token'; tok2 := r->'links'->1->>'token';
  out := out || 'links=' || jsonb_array_length(r->'links') || ' token kept only as a fingerprint=' || ((select token_hash from public.offer_signers where signing_id = sg2 and position = 1) = encode(extensions.digest(tok1, 'sha256'), 'hex') and not exists (select 1 from public.offer_signers where token_hash = tok1)) || '; ';
  select id into l1 from public.offer_signers where signing_id = sg2 and position = 1; select id into l2 from public.offer_signers where signing_id = sg2 and position = 2;
  r := public.offer_sign_open('not-a-token-at-all-not-a-token-at-all-xyz12', '203.0.113.9', 'ua'); out := out || 'bad token=' || (r ->> 'ok') || ' keys=' || (select count(*) from jsonb_object_keys(r)) || '; ';
  r := public.offer_sign_open(tok1, '203.0.113.9', 'ua'); out := out || 'open first=' || (r ->> 'first') || ' hint=' || (r ->> 'email_hint') || ' no other buyer=' || (position('Bo' in r::text) = 0) || ' no vendor=' || (position('Vera' in r::text) = 0 and position('rb-sign-vendor' in r::text) = 0) || '; ';
  begin perform public.offer_sign_state(tok1, 'no-session-no-session-no-session-no-sessi'); out := out || 'STATE WITHOUT THE CODE; '; exception when others then out := out || 'no session: ' || sqlerrm || '; '; end;
  r := public.offer_sign_code(tok1, '203.0.113.9'); code := r ->> 'code'; out := out || 'code to=' || (r ->> 'email') || ' six digits=' || (code ~ '^[0-9]{6}$') || ' kept only as a fingerprint=' || ((select code_hash from public.offer_signers where id = l1) <> code) || '; ';
  r := public.offer_sign_verify(tok1, case when code = '000000' then '111111' else '000000' end, '203.0.113.9', 'ua'); out := out || 'wrong code=' || (r ->> 'reason') || '; ';
  r := public.offer_sign_verify(tok2, code, '203.0.113.9', 'ua'); out := out || 'code on the other link=' || coalesce(r ->> 'reason', r ->> 'ok') || '; ';
  r := public.offer_sign_verify(tok1, code, '203.0.113.9', 'Phone browser'); ses := r ->> 'session'; out := out || 'right code ok=' || (r ->> 'ok') || ' verified=' || ((select verified_at from public.offer_signers where id = l1) is not null) || '; ';
  r := public.offer_sign_verify(tok1, code, '203.0.113.9', 'ua'); out := out || 'code used twice=' || coalesce(r ->> 'reason', 'ACCEPTED') || '; ';
  r := public.offer_sign_state(tok1, ses); out := out || 'draft before consent=' || coalesce(r->'signing'->>'draft_path', 'not given') || '; ';
  out := out || 'state own places only=' || (select bool_and((e->>'signer')::int = 1) from jsonb_array_elements(r->'signing'->'places') e) || ' count=' || jsonb_array_length(r->'signing'->'places') || ' no emails=' || (position('@' in r::text) = 0) || ' no other name=' || (position('Bo Testbuyer' in r::text) = 0) || '; ';
  begin perform public.offer_sign_state(tok2, ses); out := out || 'A SESSION OPENED ANOTHER SIGNER; '; exception when others then out := out || 'session on other link: ' || sqlerrm || '; '; end;
  perform public.offer_sign_consent(tok1, ses, '203.0.113.9', 'Phone browser');
  perform public.offer_sign_receipt(tok1, ses, 'cca', null, null, null, '{3}'); perform public.offer_sign_receipt(tok1, ses, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null);
  perform public.offer_sign_marks(tok1, ses, png, png);
  begin perform public.offer_sign_tap(tok1, ses, 'foot:p1:s2'); out := out || 'LINK TAPPED ANOTHER SIGNER''S PLACE; '; exception when others then out := out || 'link not mine: ' || sqlerrm || '; '; end;
  r := public.offer_sign_tap(tok1, ses, 'foot:p1:s1'); out := out || 'link tap=' || (r ->> 'done') || ' of ' || (r ->> 'of') || '; ';
  r := public.offer_sign_ask(tok1, ses, 'Could the settlement be a week later?'); out := out || 'ask ok=' || (r ->> 'ok') || ' asks=' || (select count(*) from public.offer_sign_asks where signer_id = l1) || '; ';
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_mark(l1, 'strike', 1, '{"x0": 40, "x1": 200, "y": 450}', null); out := out || 'A LINK SIGNER''S DOCUMENT MARKED; '; exception when others then out := out || 'no marks by link: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_tap(l1, 'foot:p2:s1'); out := out || 'TIM TAPPED FOR A LINK SIGNER; '; exception when others then out := out || 'tim taps for link: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_cancel(sg2, 'x'); out := out || 'CANCELLED AFTER SOMEONE STARTED; '; exception when others then out := out || 'cancel after start: ' || sqlerrm || '; '; end;
  -- Fin signs every place by link and finishes: his link then opens nothing further, and his device and network stay as recorded
  execute 'reset role'; execute 'set local role service_role';
  r := public.offer_sign_state(tok1, ses); out := out || 'draft after consent=' || ((r->'signing'->>'draft_path') is not null) || '; ';
  r := public.offer_sign_code(tok2, '203.0.113.20'); x := public.offer_sign_verify(tok2, r ->> 'code', '203.0.113.20', 'Fin phone') ->> 'session';
  perform public.offer_sign_consent(tok2, x, '203.0.113.20', 'Fin phone'); perform public.offer_sign_receipt(tok2, x, 'cca', null, null, null, '{3}'); perform public.offer_sign_receipt(tok2, x, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null);
  perform public.offer_sign_marks(tok2, x, png, png);
  perform public.offer_sign_tap(tok2, x, z.pid_) from (select e->>'id' pid_ from jsonb_array_elements(places) e where (e->>'signer')::int = 2) z;
  r := public.offer_sign_finish(tok2, x, '203.0.113.20', 'Fin phone'); out := out || 'fin finished complete=' || (r ->> 'complete') || '; ';
  rpath := (select user_agent || '|' || net_hash from public.offer_signers where id = l2);
  r := public.offer_sign_code(tok2, '203.0.113.99'); out := out || 'code after finishing=' || coalesce(r ->> 'reason', r ->> 'ok') || '; ';
  r := public.offer_sign_verify(tok2, '123456', '203.0.113.99', 'Someone else'); out := out || 'verify after finishing=' || coalesce(r ->> 'reason', r ->> 'ok') || '; ';
  begin perform public.offer_sign_state(tok2, x); out := out || 'A FINISHED SIGNER RE-ENTERED; '; exception when others then out := out || 're-entry after finishing: ' || sqlerrm || '; '; end;
  r := public.offer_sign_open(tok2, '203.0.113.99', 'Someone else'); out := out || 'open after finishing finished=' || (r ->> 'finished') || ' device kept=' || ((select user_agent || '|' || net_hash from public.offer_signers where id = l2) = rpath) || '; ';
  -- the per-network limits: 30 code tries and 20 code emails an hour from one network, whoever the link is for
  for n in 1..30 loop perform public.offer_sign_verify(tok1, '999999', '198.51.100.7', 'ua'); end loop;
  r := public.offer_sign_verify(tok1, '999999', '198.51.100.7', 'ua'); out := out || '31st try from one network=' || coalesce(r ->> 'reason', 'ALLOWED') || '; ';
  for n in 1..20 loop perform public.offer_sign_code(tok1, '198.51.100.8'); end loop;
  r := public.offer_sign_code(tok1, '198.51.100.8'); out := out || '21st code from one network=' || coalesce(r ->> 'reason', 'SENT') || ' hits kept=' || (select count(*) from public.offer_hits where kind = 'sign_code' and net = public.offer_net('198.51.100.8')) || '; ';
  out := out || 'codes for one signer capped=' || (select codes_sent from public.offer_signers where id = l1) || '; ';
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);

  -- 7. tweak and re-sign: Tim corrects the offer; the signing stops; a new draft is released; the old signatures stay, void
  perform public.agent_offer_correct(oid2, good || '{"price": "655000"}', 'Buyer rang: a little more');
  execute 'reset role'; execute 'set local role service_role';
  begin perform public.offer_sign_tap(tok1, ses, 'foot:p2:s1'); out := out || 'TAPPED A CHANGED OFFER; '; exception when others then out := out || 'offer changed: ' || sqlerrm || '; '; end;
  execute 'reset role';
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid2, pid, 2, bl, repeat('ab', 32), m, (select details from public.property_offers where id = oid2), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || oid2 || '-2-' || left(sha_d3, 12) || '.pdf', sha_d3, 100, 'test') returning id into d3;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d3, sha_d3, 'test');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  r := public.agent_signing_release(d3, 'link', sizes, places, '{3}'); sg3 := (r ->> 'id')::uuid;
  out := out || 'old signing=' || (select status from public.offer_signings where id = sg2) || ' old signers void=' || (select bool_and(void_at is not null) from public.offer_signers where signing_id = sg2) || ' old taps kept=' || (select count(*) from public.offer_sign_taps where signing_id = sg2) || ' new signers=' || (select count(*) from public.offer_signers where signing_id = sg3) || '; ';
  execute 'reset role'; execute 'set local role service_role';
  r := public.offer_sign_open(tok1, 'n', 'ua'); out := out || 'old link=' || coalesce(r ->> 'stopped', r ->> 'ok') || '; ';
  execute 'reset role';
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set finished_at = now() where id = l1; out := out || 'VOID SIGNER CHANGED; '; exception when others then out := out || 'void change: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  -- everyone signs the new version (complete, not yet locked); then a newer draft replaces it: they are marked void too, kept finished
  execute 'set local role service_role';
  tk := public.offer_sign_issue(sg3, 'agent@example.test');
  for n in 0..1 loop
    x := tk->'links'->n->>'token'; ses := public.offer_sign_verify(x, public.offer_sign_code(x, 'net-s' || n) ->> 'code', 'net-s' || n, 'ua') ->> 'session';
    perform public.offer_sign_consent(x, ses, 'n', 'ua'); perform public.offer_sign_receipt(x, ses, 'cca', null, null, null, '{3}'); perform public.offer_sign_receipt(x, ses, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null);
    perform public.offer_sign_marks(x, ses, png, png);
    perform public.offer_sign_tap(x, ses, z.pid_) from (select e->>'id' pid_ from jsonb_array_elements(places) e where (e->>'signer')::int = n + 1) z;
    perform public.offer_sign_finish(x, ses, 'n', 'ua');
  end loop;
  execute 'reset role';
  out := out || 'new version status=' || (select status from public.offer_signings where id = sg3) || '; ';
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (oid2, pid, 3, bl, repeat('ab', 32), m, (select details from public.property_offers where id = oid2), '[]', '[]', 'rb-draft-5', repeat('d5', 32), 100, 'test') returning id into d5;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d5, repeat('d5', 32), 'test');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  sg5 := (public.agent_signing_release(d5, 'in_person', sizes, places, '{3}') ->> 'id')::uuid;
  execute 'reset role';
  out := out || 'complete signing replaced=' || (select status from public.offer_signings where id = sg3) || ' its signers void=' || (select bool_and(void_at is not null) from public.offer_signers where signing_id = sg3)
    || ' still recorded as finished=' || (select bool_and(finished_at is not null and seen_sha256 is not null) from public.offer_signers where signing_id = sg3) || ' links closed=' || (select bool_and(token_hash is null) from public.offer_signers where signing_id = sg3) || '; ';
  -- the guard still blocks any other change to a finished signer, and voiding the signers of a locked round
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null, user_agent = 'changed' where id = s1; out := out || 'FINISHED SIGNER CHANGED WHILE VOIDED; '; exception when others then out := out || 'void with a change: ' || sqlerrm || '; '; end;
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null where id = s1; out := out || 'LOCKED ROUND''S SIGNER VOIDED; '; exception when others then out := out || 'void a locked round: ' || sqlerrm || '; '; end;
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set seen_sha256 = repeat('00', 32) where id = s2; out := out || 'FINISHED SIGNER CHANGED; '; exception when others then out := out || 'finished change: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);

  -- 8. the chain finds a missing or altered event (the guards have to be switched off to do either, as only the owner could)
  alter table public.offer_events disable trigger guard_offer_event;
  update public.offer_events set detail = detail || '{"price": 1}' where offer_id = oid and kind = 'sign_released';
  r := public.offer_chain_verify(oid::text); out := out || 'altered event found=' || (not (r ->> 'ok')::boolean) || ' why=' || (r->'problems'->0->>'why') || '; ';
  delete from public.offer_events where offer_id = oid2 and seq = 2;
  r := public.offer_chain_verify(oid2::text); out := out || 'missing event found=' || (not (r ->> 'ok')::boolean) || ' why=' || (r->'problems'->0->>'why') || '; ';
  alter table public.offer_events enable trigger guard_offer_event;
  begin update public.offer_events set kind = 'x' where offer_id = oid; out := out || 'EVENT CHANGED WITH THE GUARD ON; '; exception when others then out := out || 'event guard: ' || sqlerrm || '; '; end;
  raise exception 'ROLLBACK %', out;
end $t$;
