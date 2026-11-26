-- Rollback test for migration 029 (signing: chattels initials, four more marks, and Tim's own changes to the places). Run with
-- onboarding/tests/signing-marks-rollback.js, which puts the whole migration inside the block, so one statement changes everything, runs
-- the checks and then raises, which undoes it all. Nothing is kept. The output is the exception message: refusals and values read in lower
-- case; a line in CAPITALS means something that should have been refused was allowed, or a value was wrong. Needs 026 (and everything it
-- builds on) applied first. The agent is simulated with request.jwt.claims; the offer-sign edge function with service_role. The blank, map,
-- draft and approval are set up directly, as 024's and 026's own tests do.
-- Local run: 26 November 2026, on a local PostgreSQL 16 stand-in (tests/pg-standin.sql, then 010, 016 part A, 018, 019, 021 to 026):
-- every line as expected, no CAPITALS. Not yet run on the live project (a go-live step, with Tim's approval).
do $t$
declare out text := ''; r jsonb; pid uuid; o1 uuid; o2 uuid; o3 uuid; bl uuid; m uuid; m0 uuid; d1 uuid; d2 uuid; d3 uuid; g1 uuid; g2 uuid; g3 uuid; gl uuid; s1 uuid; s2 uuid; v1 uuid; v2 uuid; x text; mk uuid; mk2 uuid;
  tok text; ses text; code text; rd jsonb; pl jsonb; n int;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-marks-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111f9","role":"authenticated"}';
  sizes jsonb := '[[595.32,842.04],[595.32,842.04],[595.32,842.04]]';
  png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30); png2 text := 'data:image/png;base64,' || repeat('R0lGODlh', 40);
  good jsonb;
begin
  execute $mig$__MIGRATION__$mig$;
  -- helpers for this test only (gone with the rollback): the places a side signs with (foot, signature block and, unless told not to,
  -- one initial each inside the chattels box on page 2)
  execute $f$create function pg_temp.rb_places(n int, first_ boolean, v boolean, cht boolean) returns jsonb language plpgsql security definer as $b$
    declare out_ jsonb := '[]'; s int; k int;
    begin for s in 1..n loop
      if first_ then for k in 1..3 loop out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'foot:p' || k || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'foot', 'ref', 'p' || k, 'page', k, 'x', 440 + s * 28 + case when v then 60 else 0 end, 'y', 5, 'w', 26, 'h', 13)); end loop; end if;
      if cht then out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'filled:chattels_box:s' || s, 'signer', s, 'kind', 'initial', 'why', 'filled', 'ref', 'chattels_box', 'page', 2, 'x', 50 + s * 30 + case when v then 250 else 0 end, 'y', 600, 'w', 26, 'h', 13)); end if;
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:' || case when v then 'vsig' else 'sig' end || s || ':s' || s, 'signer', s, 'kind', 'signature', 'why', 'block', 'ref', case when v then 'vsig' else 'sig' end || s, 'page', 3, 'x', case when v then 330 else 40 end, 'y', 530 - s * 70, 'w', 150, 'h', 22));
    end loop; return out_; end $b$$f$;
  execute $f$create function pg_temp.rb_draft(o uuid, pid uuid, bl uuid, m uuid, tag text) returns uuid language plpgsql as $b$
    declare d uuid;
    begin insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
      values (o, pid, 1, bl, repeat('cd', 32), m, (select details from public.property_offers where id = o), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || o || '-1.pdf', encode(extensions.digest(o::text || tag, 'sha256'), 'hex'), 100, 'test', '{"term_last": 22}') returning id into d;
      insert into public.offer_draft_approvals (draft_id, sha256, approved_by) select id, sha256, 'test' from public.offer_drafts where id = d; return d; end $b$$f$;
  execute $f$create function pg_temp.rb_prep(g uuid) returns void language plpgsql as $b$
    declare s public.offer_signers; gg public.offer_signings; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
    begin select * into gg from public.offer_signings where id = g;
      if gg.status = 'ready' and gg.method = 'in_person' then perform public.agent_signing_start(g); end if;
      for s in select * from public.offer_signers where signing_id = g and void_at is null order by position loop
        perform public.offer_sign_do_consent(s.id, 'ua', null);
        if gg.round_no = 1 then perform public.offer_sign_do_receipt(s.id, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); end if;
        if gg.side = 'vendor' then perform public.offer_sign_do_receipt(s.id, 'chattels', null, null, null, null); end if;
        if public.offer_sign_ink(s.id)->>'sig_png' is null then perform public.offer_sign_do_marks(s.id, png, png); end if;
      end loop; end $b$$f$;
  execute $f$create function pg_temp.rb_finish(g uuid) returns jsonb language plpgsql as $b$
    declare s public.offer_signers; p text; r jsonb;
    begin for s in select * from public.offer_signers where signing_id = g and void_at is null and finished_at is null order by position loop
        for p in select public.offer_sign_required(g, s.position) loop perform public.offer_sign_do_tap(s.id, p); end loop;
        r := public.offer_sign_do_finish(s.id, 'ua', null, 'passport', 'Tim McGuire');
      end loop; return r; end $b$$f$;
  execute $f$create function pg_temp.rb_lock(g uuid, chk jsonb) returns jsonb language plpgsql as $b$
    declare mt jsonb := public.offer_round_material(g); sha text := encode(extensions.digest(g::text || clock_timestamp()::text, 'sha256'), 'hex'); path text;
    begin path := 'properties/' || (mt->>'property_id') || '/docs/offer-round-' || (mt->>'offer_id') || '-' || (mt->>'number') || '-' || left(sha, 12) || '.pdf';
      insert into storage.objects (bucket_id, name, metadata) values ('property-files', path, '{"size": 5000, "mimetype": "application/pdf"}');
      perform public.offer_file_confirm(path, sha, 5000, 'test');
      return public.offer_round_lock(g, path, sha, 5000, jsonb_build_object('signers', '[]'::jsonb, 'check', chk), 'test'); end $b$$f$;

  -- set up: a property with two vendors; three offers from two purchasers; a map with a date place and a chattels area, and one without
  insert into public.properties (address, stage) values ('RB 29 Marks Street, Dunedin', 'live') returning id into pid;
  insert into public.agreements (property_id, status) values (pid, 'countersigned') returning id into x;
  insert into public.agreement_people (agreement_id, legal_name, email, phone) values (x::uuid, 'Una Vendor', 'rb-marks-vendor@example.com', '027 444 5555');
  delete from public.property_people where property_id = pid;
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 1, 'Una Vendor', 'rb-marks-vendor@example.com', '027 444 5555', 'owner'), (pid, 2, 'Ula Vendor', 'ula@example.com', '', 'owner');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)), 'kiwisaver', false,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Markbuyer', 'email', 'ana@example.com', 'phone', '021 111 2222'), jsonb_build_object('first', 'Bo', 'last', 'Markbuyer', 'email', 'bo@example.com', 'phone', '021 333 4444')),
    'related', false, 'privacy', true, 'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  o1 := public.agent_offer_add(pid, good); o2 := public.agent_offer_add(pid, good); o3 := public.agent_offer_add(pid, good);
  execute 'reset role';
  insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'rb-marks-blank') returning id into x;
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x::uuid, repeat('cd', 32), 10, 'Blank.pdf', 3, sizes, 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10},{"id":"chattels","key":"chattels","kind":"area","page":2,"x":40,"y":700,"w":500,"h":120}]', true, 'test') returning id into m;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 2, '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10}]', true, 'test') returning id into m0;
  d1 := pg_temp.rb_draft(o1, pid, bl, m, 'one'); d2 := pg_temp.rb_draft(o2, pid, bl, m, 'two'); d3 := pg_temp.rb_draft(o3, pid, bl, m0, 'three');
  out := out || 'chattels area: ' || (public.offer_chattels_rect(d1)->>'y') || ' to ' || ((public.offer_chattels_rect(d1)->>'y')::numeric + (public.offer_chattels_rect(d1)->>'h')::numeric) || ', none on the other map=' || (public.offer_chattels_rect(d3) is null) || '; ';

  -- 1. B: Round 1 is refused without each purchaser's initials inside the chattels box, and on a map with no chattels area; then released
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_release(d1, 'in_person', sizes, pg_temp.rb_places(2, true, false, false), '{}'); out := out || 'RELEASED WITHOUT CHATTELS INITIALS; '; exception when others then out := out || 'no chattels initials: ' || sqlerrm || '; '; end;
  pl := pg_temp.rb_places(2, true, false, true); pl := jsonb_set(pl, '{3,y}', '400');   -- signer 1's chattels initials moved out of the box
  begin perform public.agent_signing_release(d1, 'in_person', sizes, pl, '{}'); out := out || 'RELEASED WITH INITIALS OUTSIDE THE BOX; '; exception when others then out := out || 'outside the box: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release(d3, 'in_person', sizes, pg_temp.rb_places(2, true, false, true), '{}'); out := out || 'RELEASED ON A MAP WITH NO CHATTELS AREA; '; exception when others then out := out || 'no area: ' || sqlerrm || '; '; end;
  -- D: Tim's own changes to the places: an added place is recorded; one on the date place, an unknown id or a "removed" place still there is refused
  pl := pg_temp.rb_places(2, true, false, true) || jsonb_build_array(jsonb_build_object('id', 'ack:tim-a1:s1', 'signer', 1, 'kind', 'initial', 'why', 'ack', 'ref', 'tim-a1', 'page', 1, 'x', 300, 'y', 400, 'w', 26, 'h', 13, 'label', 'Initial: a place Tim added'));
  begin perform public.agent_signing_release_edited(d1, 'in_person', sizes, jsonb_set(jsonb_set(pl, '{10,y}', '731'), '{10,x}', '100'), '{}', '{"added":["ack:tim-a1:s1"]}'); out := out || 'AN ADDED PLACE SAT ON THE DATE; '; exception when others then out := out || 'added on the date: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release_edited(d1, 'in_person', sizes, pl, '{}', '{"added":["ack:tim-zz:s1"]}'); out := out || 'AN UNKNOWN ADDED PLACE PASSED; '; exception when others then out := out || 'unknown added: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release_edited(d1, 'in_person', sizes, pl, '{}', '{"removed":[{"id":"foot:p1:s1","label":"x"}]}'); out := out || 'A REMOVED PLACE WAS STILL THERE; '; exception when others then out := out || 'removed still there: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release_edited(d1, 'in_person', sizes, pl, '{}', '{"added":["block:sig1:s1"]}'); out := out || 'A PROPOSED PLACE PASSED AS ADDED; '; exception when others then out := out || 'added must be Tim''s: ' || sqlerrm || '; '; end;
  r := public.agent_signing_release_edited(d1, 'in_person', sizes, pl, '{}', '{"added":["ack:tim-a1:s1"],"moved":["filled:chattels_box:s2"],"removed":[{"id":"filled:price:s1","label":"Initial: price"}]}');
  g1 := (r->>'id')::uuid;
  out := out || 'released with edits: ' || (select (detail->>'added') || ' added, ' || (detail->>'moved') || ' moved, ' || (detail->>'removed') || ' removed, sha same=' || (detail->>'places_sha256' = (select places_sha256 from public.offer_signings where id = g1)) from public.offer_events where offer_id = o1 and kind = 'sign_places_edited') || '; ';
  out := out || 'events in order: ' || (select string_agg(kind, ',' order by seq) from public.offer_events where offer_id = o1 and kind like 'sign_%') || '; ';
  perform pg_temp.rb_prep(g1);
  select id into s1 from public.offer_signers where signing_id = g1 and position = 1; select id into s2 from public.offer_signers where signing_id = g1 and position = 2;

  -- 2. C, Round 1 in person: Ana adds her own initials (her ink, copied in by the database), Bo adds text; both hold the round for Tim
  r := public.agent_signing_mark(s1, 'own_initials', 1, '{"x":100,"y":300,"w":30,"h":14}', null); mk := (r->>'id')::uuid;
  -- undone at once (026's undo): the row stays, it no longer stands, and signing carries on; then added again
  r := public.agent_signing_undo(s1, 'last');
  out := out || 'own initials undone: changes=' || (r->>'changes') || ' status=' || (select status from public.offer_signings where id = g1) || ' live=' || (select count(*) from public.offer_sign_marks_live where signing_id = g1) || ' kept=' || (select count(*) from public.offer_sign_marks where signing_id = g1) || '; ';
  r := public.agent_signing_mark(s1, 'own_initials', 1, '{"x":100,"y":300,"w":30,"h":14}', null); mk := (r->>'id')::uuid;
  out := out || 'own initials: held=' || (r->>'held') || ' status=' || (select status from public.offer_signings where id = g1) || ' ink is hers=' || ((select ink_png from public.offer_sign_marks where id = mk) = png) || '; ';
  begin perform public.agent_signing_mark(s2, 'own_name', 1, '{"x":100,"y":500,"w":120,"h":12,"text":"Ana Markbuyer","size":9}', null); out := out || 'BO ADDED ANA''S NAME; '; exception when others then out := out || 'not his name: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(s2, 'own_signature', 1, '{"x":290,"y":395,"w":80,"h":20}', null); out := out || 'A SIGNATURE SAT ON ANA''S PLACE; '; exception when others then out := out || 'on another''s place: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(s2, 'own_signature', 1, '{"x":90,"y":726,"w":80,"h":20}', null); out := out || 'A SIGNATURE SAT ON THE DATE; '; exception when others then out := out || 'on the date: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(s2, 'own_initials', 1, '{"x":580,"y":300,"w":30,"h":14}', null); out := out || 'INITIALS OFF THE PAGE; '; exception when others then out := out || 'off the page: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(s2, 'insert', 1, '{"x":100,"y":200,"text":"call 021 111 2222","size":9}', null); out := out || 'A PURCHASER''S PHONE WENT ON; '; exception when others then out := out || 'privacy: ' || sqlerrm || '; '; end;
  perform public.agent_signing_mark(s2, 'own_name', 2, '{"x":100,"y":300,"w":120,"h":12,"text":"Bo Markbuyer","size":9}', null);
  r := public.agent_signing_mark(s2, 'insert', 1, '{"x":100,"y":200,"text":"Subject to a builder''s report","size":9}', null); mk2 := (r->>'id')::uuid;
  -- the service role (as the edge function runs) can't put someone else's ink in a mark, nor write one outside the page
  execute 'set local role service_role';
  begin insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry, ink_png) values (g1, s2, 'Bo', 'own_initials', 1, '{"x":100,"y":100,"w":30,"h":14}', png2); out := out || 'SOMEONE ELSE''S INK WENT IN; ';
  exception when others then out := out || 'ink checked: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry) values (g1, s2, 'Bo', 'own_initials', 1, '{"x":100,"y":100,"w":30,"h":14}'); out := out || 'A MARK WITH NO INK WENT IN; ';
  exception when others then out := out || 'no ink: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry, ink_png) values (g1, s2, 'Bo', 'note', 1, '{"strokes":[[[1,1],[5,5]]]}', png); out := out || 'A NOTE CARRIED INK; ';
  exception when others then out := out || 'ink only on own marks: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin update public.offer_sign_marks set ink_png = png2 where id = mk; out := out || 'A MARK''S INK WAS CHANGED; '; exception when others then out := out || 'marks stay: ' || sqlerrm || '; '; end;
  -- Tim re-approves: the typed words need everyone's initials; Ana's own initials need nobody's
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_review(g1, jsonb_build_array(
      jsonb_build_object('id', 'mark:' || mk || ':s1', 'signer', 1, 'kind', 'initial', 'why', 'mark', 'ref', mk::text, 'page', 1, 'x', 200, 'y', 300, 'w', 26, 'h', 13),
      jsonb_build_object('id', 'mark:' || mk || ':s2', 'signer', 2, 'kind', 'initial', 'why', 'mark', 'ref', mk::text, 'page', 1, 'x', 230, 'y', 300, 'w', 26, 'h', 13))); out := out || 'OTHERS ASKED TO INITIAL ANA''S OWN INITIALS; ';
  exception when others then out := out || 'own needs no initials: ' || sqlerrm || '; '; end;
  r := public.agent_signing_review(g1, jsonb_build_array(
      jsonb_build_object('id', 'mark:' || mk2 || ':s1', 'signer', 1, 'kind', 'initial', 'why', 'mark', 'ref', mk2::text, 'page', 1, 'x', 260, 'y', 200, 'w', 26, 'h', 13),
      jsonb_build_object('id', 'mark:' || mk2 || ':s2', 'signer', 2, 'kind', 'initial', 'why', 'mark', 'ref', mk2::text, 'page', 1, 'x', 290, 'y', 200, 'w', 26, 'h', 13)));
  out := out || 'reviewed: marks=' || (r->>'marks') || ' status=' || (select status from public.offer_signings where id = g1) || ' ana must do=' || (select count(*) from public.offer_sign_required(g1, 1) x) || '; ';
  -- Round 1 is sealed: the material and the layers carry Ana's ink with her mark (only on own marks)
  perform pg_temp.rb_finish(g1);
  rd := public.offer_round_material(g1);
  out := out || 'material: marks=' || jsonb_array_length(rd->'marks') || ' with ink=' || (select count(*) from jsonb_array_elements(rd->'marks') e where e ? 'ink') || '; ';
  r := pg_temp.rb_lock(g1, '{}');
  out := out || 'round 1 sealed, changes counted=' || (select changes from public.offer_rounds where signing_id = g1) || '; ';
  rd := public.offer_doc_layers((select document_id from public.offer_rounds where signing_id = g1), 1);
  out := out || 'layers: ink on own=' || ((select e->>'ink' from jsonb_array_elements(rd->0->'marks') e where e->>'kind' = 'own_initials') = png) || ' none on typed=' || (not ((select e from jsonb_array_elements(rd->0->'marks') e where e->>'kind' = 'insert') ? 'ink')) || '; ';

  -- 3. B and C, Round 2 to the vendors in person: refused without their chattels initials; then Una adds her signature (not a change)
  begin perform public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, true, true, false) || jsonb_build_array(
      jsonb_build_object('id', 'chg:' || mk2 || ':s1', 'signer', 1, 'kind', 'initial', 'why', 'change', 'ref', mk2::text, 'page', 1, 'x', 100, 'y', 215, 'w', 26, 'h', 13), jsonb_build_object('id', 'chg:' || mk2 || ':s2', 'signer', 2, 'kind', 'initial', 'why', 'change', 'ref', mk2::text, 'page', 1, 'x', 130, 'y', 215, 'w', 26, 'h', 13)), true);
    out := out || 'PRESENTED WITHOUT THE VENDORS'' CHATTELS INITIALS; '; exception when others then out := out || 'vendors need chattels: ' || sqlerrm || '; '; end;
  pl := pg_temp.rb_places(2, true, true, true) || jsonb_build_array(
      jsonb_build_object('id', 'chg:' || mk2 || ':s1', 'signer', 1, 'kind', 'initial', 'why', 'change', 'ref', mk2::text, 'page', 1, 'x', 100, 'y', 215, 'w', 26, 'h', 13), jsonb_build_object('id', 'chg:' || mk2 || ':s2', 'signer', 2, 'kind', 'initial', 'why', 'change', 'ref', mk2::text, 'page', 1, 'x', 130, 'y', 215, 'w', 26, 'h', 13));
  r := public.agent_round_present_edited(o1, 'in_person', pl, true, null, false, ('{"moved":["chg:' || mk2 || ':s2"]}')::jsonb); g2 := (r->>'id')::uuid;
  out := out || 'presented: edits recorded=' || (select count(*) from public.offer_events where offer_id = o1 and kind = 'sign_places_edited' and detail->>'signing_id' = g2::text) || '; ';
  perform pg_temp.rb_prep(g2);
  select id into v1 from public.offer_signers where signing_id = g2 and position = 1; select id into v2 from public.offer_signers where signing_id = g2 and position = 2;
  begin perform public.agent_signing_mark(v1, 'insert', 1, '{"x":100,"y":250,"text":"More words","size":9}', null); out := out || 'TYPED WORDS WENT IN AS A MARK IN ROUND 2; '; exception when others then out := out || 'round 2 text is a change: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_mark(v1, 'own_signature', 2, '{"x":75,"y":598,"w":40,"h":16}', null); out := out || 'UNA''S SIGNATURE COVERED ANA''S ROUND 1 CHATTELS INITIALS; '; exception when others then out := out || 'clear of earlier ink: ' || sqlerrm || '; '; end;
  r := public.agent_signing_mark(v1, 'own_signature', 1, '{"x":300,"y":600,"w":80,"h":20}', null);
  out := out || 'una''s signature: held=' || (r->>'held') || ' status=' || (select status from public.offer_signings where id = g2) || ' event=' || (select kind from public.offer_events where offer_id = o1 order by seq desc limit 1) || ' places for others=' || (select count(*) from public.offer_sign_reviews where signing_id = g2) || '; ';
  perform pg_temp.rb_finish(g2);
  r := pg_temp.rb_lock(g2, '{"lifted": [], "outstanding": []}');
  out := out || 'round 2 sealed, changes counted=' || (select changes from public.offer_rounds where signing_id = g2) || ' offer=' || (select status from public.property_offers where id = o1) || '; ';
  -- nothing changed in Round 2 (her own signature isn't a change), so the agreement can be confirmed rather than presenting again
  begin perform public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, false, false, false), true); out := out || 'PRESENTED AFTER A ROUND THAT CHANGED NOTHING; '; exception when others then out := out || 'nothing changed: ' || sqlerrm || '; '; end;
  out := out || 'agreed terms: changes listed (only the typed words)=' || (select jsonb_array_length(public.offer_agreed_terms((select document_id from public.offer_rounds where signing_id = g2))->'changes')) || '; ';

  -- 4. C by link, Round 1: Ana adds her own initials and typed words from her link; both hold the round for Tim
  perform set_config('request.jwt.claims', agent, true);
  gl := (public.agent_signing_release(d2, 'link', sizes, pg_temp.rb_places(2, true, false, true), '{}')->>'id')::uuid;
  execute 'set local role service_role';
  tok := (select l->>'token' from jsonb_array_elements((public.offer_sign_issue(gl, 'agent'))->'links') l where (l->>'position')::int = 1);
  code := public.offer_sign_code(tok, 'n1')->>'code'; ses := public.offer_sign_verify(tok, code, 'n1', 'ua')->>'session';
  perform public.offer_sign_consent(tok, ses, 'n1', 'ua'); perform public.offer_sign_receipt(tok, ses, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null);
  begin perform public.offer_sign_mark(tok, ses, 'n1', 'own_initials', 1, '{"x":100,"y":300,"w":30,"h":14}'); out := out || 'OWN INITIALS BEFORE DRAWING THEM; '; exception when others then out := out || 'draw first: ' || sqlerrm || '; '; end;
  perform public.offer_sign_marks(tok, ses, png2, png2);
  r := public.offer_sign_mark(tok, ses, 'n1', 'own_initials', 1, '{"x":100,"y":300,"w":30,"h":14}');
  out := out || 'link own initials: held=' || (r->>'held') || ' status=' || (select status from public.offer_signings where id = gl) || ' ink is hers=' || ((select ink_png from public.offer_sign_marks where id = (r->>'id')::uuid) = png2) || ' state marks=' || jsonb_array_length(public.offer_sign_state(tok, ses)->'signing'->'marks') || ' with ink=' || (select count(*) from jsonb_array_elements(public.offer_sign_state(tok, ses)->'signing'->'marks') e where e ? 'ink') || '; ';
  r := public.offer_sign_mark(tok, ses, 'n1', 'insert', 1, '{"x":100,"y":200,"text":"Please add the curtains","size":9}');
  out := out || 'link typed: held=' || (r->>'held') || ' event by link=' || (select detail->>'by_link' from public.offer_events where offer_id = o2 order by seq desc limit 1) || '; ';
  begin perform public.offer_sign_mark(tok, ses, 'n1', 'note', 1, '{"strokes":[[[1,1],[5,5]]]}'); out := out || 'A NOTE BY LINK; '; exception when others then out := out || 'four kinds only: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_mark(tok, ses, 'n1', 'own_name', 1, '{"x":100,"y":400,"w":120,"h":12,"text":"Bo Markbuyer","size":9}'); out := out || 'ANA ADDED BO''S NAME BY LINK; '; exception when others then out := out || 'her own name only: ' || sqlerrm || '; '; end;
  -- Tim's in-person mark function can't act on a link signer's turn
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_mark((select id from public.offer_signers where signing_id = gl and position = 1), 'own_initials', 1, '{"x":100,"y":100,"w":30,"h":14}', null); out := out || 'TIM MARKED FOR A LINK SIGNER; '; exception when others then out := out || 'in person only: ' || sqlerrm || '; '; end;

  -- 5. who may call what: a vendor signed in can't use Tim's functions or the link's; the link's function is the service role's alone
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  begin perform public.offer_sign_mark(tok, ses, 'n1', 'own_initials', 1, '{"x":100,"y":100,"w":30,"h":14}'); out := out || 'A SIGNED-IN USER RAN THE LINK MARK; '; exception when others then out := out || 'service only: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_release_edited(d3, 'in_person', sizes, '[]', '{}', '{}'); out := out || 'A VENDOR RELEASED; '; exception when others then out := out || 'agent only: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_do_mark(s1, 'own_initials', 1, '{"x":100,"y":100,"w":30,"h":14}', null, false); out := out || 'A SIGNED-IN USER RAN THE INNER MARK; '; exception when others then out := out || 'inner closed: ' || sqlerrm || '; '; end;
  execute 'reset role';
  raise exception 'ROLLBACK %', out;
end $t$;
