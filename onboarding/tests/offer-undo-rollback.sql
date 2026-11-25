-- Rollback test for migration 026 (Offers fixes 3: undo in a signing turn, Tim starting a round again, going back to the last sealed round,
-- and "Confirm the agreement" held while frozen). Run with onboarding/tests/offer-undo-rollback.js, which puts the whole migration inside
-- the block, so one statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the
-- exception message: refusals and values read in lower case; a line in CAPITALS means something that should have been refused was
-- allowed, or a value was wrong. Needs 025 (and everything it builds on) applied first. The agent is simulated with request.jwt.claims;
-- the offer-sign edge function with service_role. The blank, map, draft and approval are set up directly, as 024's own test does.
do $t$
declare out text := ''; r jsonb; pid uuid; o1 uuid; bl uuid; m uuid; d1 uuid; g1 uuid; g2 uuid; g3 uuid; g4 uuid; s1 uuid; s2 uuid; v1 uuid; v2 uuid; x text; n int; n2 int; p1 text; p2 text;
  tok text; ses text; code text; rq jsonb; hd jsonb; acc timestamptz; apath text; asha text := repeat('b7', 32); rd jsonb; tl0 int; ml0 int;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-undo-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111f6","role":"authenticated"}';
  sizes jsonb := '[[595.32,842.04],[595.32,842.04],[595.32,842.04]]';
  png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30); png2 text := 'data:image/png;base64,' || repeat('R0lGODlh', 40);
  good jsonb; mk1 uuid := '22222222-bbbb-4bbb-8bbb-000000000001'; mk2 uuid := '22222222-bbbb-4bbb-8bbb-000000000002'; mk3 uuid := '22222222-bbbb-4bbb-8bbb-000000000003';
  today text := to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY');
begin
  execute $mig$__MIGRATION__$mig$;
  -- helpers for this test only (gone with the rollback), as 024's test has them
  execute $f$create function pg_temp.rb_places(n int, first_ boolean, v boolean) returns jsonb language plpgsql security definer as $b$
    declare out_ jsonb := '[]'; s int; k int;
    begin for s in 1..n loop
      if first_ then for k in 1..3 loop out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'foot:p' || k || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'foot', 'ref', 'p' || k, 'page', k, 'x', 440 + s * 28 + case when v then 60 else 0 end, 'y', 5, 'w', 26, 'h', 13)); end loop; end if;
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:' || case when v then 'vsig' else 'sig' end || s || ':s' || s, 'signer', s, 'kind', 'signature', 'why', 'block', 'ref', case when v then 'vsig' else 'sig' end || s, 'page', 3, 'x', case when v then 330 else 40 end, 'y', 530 - s * 70, 'w', 150, 'h', 22));
    end loop; return out_; end $b$$f$;
  execute $f$create function pg_temp.rb_change_places(n int, mk uuid, k text, geo jsonb) returns jsonb language sql security definer as $b$
    select jsonb_agg(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1,
      'x', (public.offer_change_rect(k, geo)->>'x')::numeric + (public.offer_change_rect(k, geo)->>'w')::numeric + 4 + (s - 1) * 28, 'y', (public.offer_change_rect(k, geo)->>'y')::numeric, 'w', 26, 'h', 13)) from generate_series(1, n) s $b$$f$;
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

  -- set up: a property with two vendors, one offer from two purchasers, drafted and approved on a map with a date place
  insert into public.properties (address, stage) values ('RB 26 Undo Street, Dunedin', 'live') returning id into pid;
  insert into public.agreements (property_id, status) values (pid, 'countersigned') returning id into x;
  insert into public.agreement_people (agreement_id, legal_name, email, phone) values (x::uuid, 'Una Vendor', 'rb-undo-vendor@example.com', '027 444 5555');
  delete from public.property_people where property_id = pid;
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 1, 'Una Vendor', 'rb-undo-vendor@example.com', '027 444 5555', 'owner'), (pid, 2, 'Ula Vendor', 'ula@example.com', '', 'owner');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)), 'kiwisaver', false,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Undobuyer', 'email', 'ana@example.com', 'phone', '021 111 2222'), jsonb_build_object('first', 'Bo', 'last', 'Undobuyer', 'email', 'bo@example.com', 'phone', '021 333 4444')),
    'related', false, 'privacy', true, 'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  o1 := public.agent_offer_add(pid, good);
  execute 'reset role';
  insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'rb-undo-blank') returning id into x;
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x::uuid, repeat('cd', 32), 10, 'Blank.pdf', 3, sizes, 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10}]', true, 'test') returning id into m;
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
    values (o1, pid, 1, bl, repeat('cd', 32), m, (select details from public.property_offers where id = o1), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || o1 || '-1.pdf', encode(extensions.digest(o1::text || 'undo', 'sha256'), 'hex'), 100, 'test', '{"term_last": 22}') returning id into d1;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) select id, sha256, 'test' from public.offer_drafts where id = d1;

  -- 1. Round 1 in person: Ana taps two places, undoes her last step, and taps it again. The tap rows are never changed or removed.
  perform set_config('request.jwt.claims', agent, true);
  g1 := (public.agent_signing_release(d1, 'in_person', sizes, pg_temp.rb_places(2, true, false), '{}') ->> 'id')::uuid;
  perform pg_temp.rb_prep(g1);
  select id into s1 from public.offer_signers where signing_id = g1 and position = 1; select id into s2 from public.offer_signers where signing_id = g1 and position = 2;
  p1 := 'foot:p1:s1'; p2 := 'foot:p2:s1';
  perform public.agent_signing_tap(s1, p1); perform public.agent_signing_tap(s1, p2);
  r := public.agent_signing_undo(s1, 'last');
  out := out || 'undo last: ' || (r->>'taps') || ' tap, done ' || (r->>'done') || ' of ' || (r->>'of') || ', live=' || (select string_agg(place_id, ',') from public.offer_sign_taps_live where signer_id = s1) || ', rows kept=' || (select count(*) from public.offer_sign_taps where signer_id = s1) || '; ';
  if (select count(*) from public.offer_sign_taps_live where signer_id = s1) <> 1 or (select count(*) from public.offer_sign_taps where signer_id = s1) <> 2 then out := out || 'UNDO DID NOT LEAVE ONE TAP STANDING AND BOTH KEPT; '; end if;
  begin delete from public.offer_sign_taps where signer_id = s1; out := out || 'A TAP WAS REMOVED; '; exception when others then out := out || 'tap rows stay: ' || sqlerrm || '; '; end;
  begin update public.offer_sign_undos set by_name = 'x' where signing_id = g1; out := out || 'AN UNDO RECORD WAS CHANGED; '; exception when others then out := out || 'undo rows stay: ' || sqlerrm || '; '; end;
  begin delete from public.offer_sign_undos where signing_id = g1; out := out || 'AN UNDO RECORD WAS REMOVED; '; exception when others then out := out || 'undo rows stay: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_undo(s1, 'last', true); out := out || 'INK CLEARED ON A LAST-STEP UNDO; '; exception when others then out := out || 'clear only on a turn: ' || sqlerrm || '; '; end;
  perform public.agent_signing_tap(s1, p2);
  out := out || 'tapped again: live=' || (select count(*) from public.offer_sign_taps_live where signer_id = s1) || ' rows=' || (select count(*) from public.offer_sign_taps where signer_id = s1) || ' redo rows=' || (select count(*) from public.offer_sign_undos where signer_id = s1 and action = 'redo') || '; ';
  out := out || 'event: ' || (select detail->>'scope' || ' places=' || (detail->>'places') from public.offer_events where offer_id = o1 and kind = 'sign_undone' order by seq desc limit 1) || '; ';

  -- 2. Ana starts her turn again and clears her drawing: every tap undone, she draws again; her first drawing stays as it was
  r := public.agent_signing_undo(s1, 'turn', true);
  out := out || 'turn: taps=' || (r->>'taps') || ' cleared=' || (r->>'ink_cleared') || ' live=' || (select count(*) from public.offer_sign_taps_live where signer_id = s1) || '; ';
  begin perform public.agent_signing_tap(s1, p1); out := out || 'TAPPED WITH NO SIGNATURE; '; exception when others then out := out || 'cleared ink: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_do_marks(s1, 'data:image/png;base64,AAAA', png2); out := out || 'A BLANK DRAWING ACCEPTED; '; exception when others then out := out || 'drawing checked: ' || sqlerrm || '; '; end;
  perform public.agent_signing_marks(s1, png2, png2);
  out := out || 'drawn again: first kept=' || ((select sig_png from public.offer_signers where id = s1) = png) || ' new used=' || (public.offer_sign_ink(s1)->>'sig_png' = png2) || ' redraws=' || (select count(*) from public.offer_sign_redraws where signer_id = s1) || '; ';
  begin perform set_config('offers.fn', 'on', true); update public.offer_signers set sig_png = png2 where id = s1; out := out || 'THE FIRST DRAWING WAS CHANGED AFTER A TAP; '; exception when others then out := out || '023 guard stays: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  perform public.agent_signing_tap(s1, p1);
  begin perform public.agent_signing_marks(s1, png, png); out := out || 'REDRAWN WITH A TAP STANDING; '; exception when others then out := out || 'redraw needs every tap undone: ' || sqlerrm || '; '; end;

  -- 3. a Round 1 mark on Tim's screen holds the round; undoing it carries signing on
  perform public.agent_signing_mark(s2, 'cross', 1, '{"x":100,"y":200,"w":60,"h":20}', null);
  out := out || 'marked: status=' || (select status from public.offer_signings where id = g1) || '; ';
  begin perform public.agent_signing_tap(s2, 'foot:p1:s2'); out := out || 'TAPPED WHILE HELD; '; exception when others then out := out || 'held: ' || sqlerrm || '; '; end;
  r := public.agent_signing_undo(s2, 'last');
  out := out || 'mark undone: changes=' || (r->>'changes') || ' status=' || (select status from public.offer_signings where id = g1) || ' marks live=' || (select count(*) from public.offer_sign_marks_live where signing_id = g1) || ' kept=' || (select count(*) from public.offer_sign_marks where signing_id = g1) || '; ';
  begin perform public.agent_signing_undo(s2, 'last'); out := out || 'UNDID NOTHING; '; exception when others then out := out || 'nothing left: ' || sqlerrm || '; '; end;

  -- 4. Round 1 finishes and is sealed from what stands: the material holds the taps that stand, the mark undone is not on it
  perform pg_temp.rb_finish(g1);
  rd := public.offer_round_material(g1);
  out := out || 'material: taps=' || jsonb_array_length(rd->'taps') || ' marks=' || jsonb_array_length(rd->'marks') || ' ana ink new=' || ((select e->>'sig_png' from jsonb_array_elements(rd->'signers') e where (e->>'position')::int = 1) = png2) || '; ';
  if jsonb_array_length(rd->'taps') <> (select count(*) from public.offer_sign_required(g1, 1) x) + (select count(*) from public.offer_sign_required(g1, 2) x) then out := out || 'THE MATERIAL HOLDS AN UNDONE TAP; '; end if;
  r := pg_temp.rb_lock(g1, '{}');
  out := out || 'round 1 sealed: number=' || (r->>'number') || '; ';
  -- a sealed round can't change through the new tables, whoever writes to them (here the service role, as the edge function runs)
  declare before_ jsonb := public.offer_doc_layers((select document_id from public.offer_rounds where signing_id = g1), 1); after_ jsonb;
  begin
    execute 'set local role service_role';
    begin insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) select t.signing_id, t.signer_id, t.id, 'round', 'probe' from public.offer_sign_taps_live t where t.signing_id = g1 limit 1; out := out || 'AN UNDO WAS WRITTEN FOR A SEALED ROUND; ';
    exception when others then out := out || 'sealed undo refused: ' || sqlerrm || '; '; end;
    begin insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values (g1, s1, null, null, 'probe'); out := out || 'A DRAWING WAS CLEARED ON A SEALED ROUND; ';
    exception when others then out := out || 'sealed redraw refused: ' || sqlerrm || '; '; end;
    begin insert into public.offer_sign_undos (signing_id, signer_id, mark_id, scope, by_name) values (g1, s2, (select id from public.offer_sign_marks where signing_id = g1 limit 1), 'round', 'probe'); out := out || 'A SEALED MARK WAS UNDONE; ';
    exception when others then out := out || 'sealed mark refused: ' || sqlerrm || '; '; end;
    execute 'reset role';
    after_ := public.offer_doc_layers((select document_id from public.offer_rounds where signing_id = g1), 1);
    out := out || 'sealed layers unchanged=' || (before_ = after_) || ' taps=' || jsonb_array_length(after_->0->'taps') || ' ink kept=' || ((after_->0->'signers'->0->>'sig_png') is not null) || '; ';
    if before_ <> after_ then out := out || 'THE SEALED ROUND''S LAYERS CHANGED; '; end if;
  end;
  begin perform public.agent_signing_revert_round(g1, 'Start again'); out := out || 'A SEALED ROUND WAS STARTED AGAIN; '; exception when others then out := out || 'sealed stays: ' || sqlerrm || '; '; end;

  -- 5. Round 2 to the vendors, in person: Una makes a change (typed words) with both vendors' initials; Ula initials it; Una undoes it
  r := public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, true, true), true); g2 := (r->>'id')::uuid;
  perform pg_temp.rb_prep(g2);
  select id into v1 from public.offer_signers where signing_id = g2 and position = 1; select id into v2 from public.offer_signers where signing_id = g2 and position = 2;
  -- an open round's undo can't point at another round's step (Round 1's sealed tap), nor be written for someone not on it
  execute 'set local role service_role';
  begin insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) values (g2, v1, (select min(id) from public.offer_sign_taps where signing_id = g1), 'last', 'probe'); out := out || 'AN OPEN ROUND''S UNDO POINTED AT A SEALED TAP; ';
  exception when others then out := out || 'another round''s step: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values (g2, s1, null, null, 'probe'); out := out || 'A DRAWING WAS CLEARED FOR SOMEONE NOT ON THE ROUND; ';
  exception when others then out := out || 'not on the round: ' || sqlerrm || '; '; end;
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  perform public.agent_round_change(v1, mk1, 'insert', 1, '{"x":100,"y":400,"text":"$690,000","size":9}', null, pg_temp.rb_change_places(2, mk1, 'insert', '{"x":100,"y":400,"text":"$690,000","size":9}'));
  perform public.agent_signing_tap(v2, 'chg:' || mk1 || ':s2');
  n := (select count(*) from public.offer_sign_required(g2, 2) x);
  r := public.agent_signing_undo(v1, 'last');
  out := out || 'change undone: Ula places ' || n || ' to ' || (select count(*) from public.offer_sign_required(g2, 2) x) || ', changes live=' || (select count(*) from public.offer_sign_marks_live where signing_id = g2) || ', review live=' || (select count(*) from public.offer_sign_reviews_live where signing_id = g2) || '; ';
  -- a further term number freed by an undone change can be used again
  perform public.agent_round_change(v1, mk2, 'insert', 1, '{"x":100,"y":300,"text":"23.0 The vendors keep the shed","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":300,"text":"23.0 The vendors keep the shed","size":9}'));
  perform public.agent_signing_undo(v1, 'last');
  perform public.agent_round_change(v1, mk3, 'insert', 1, '{"x":100,"y":300,"text":"23.0 The vendors keep the garden shed","size":9}', null, pg_temp.rb_change_places(2, mk3, 'insert', '{"x":100,"y":300,"text":"23.0 The vendors keep the garden shed","size":9}'));
  out := out || 'term 23.0 again after undo: ok; ';
  begin perform public.agent_round_change(v1, mk1, 'insert', 1, '{"x":100,"y":200,"text":"again","size":9}', null, pg_temp.rb_change_places(2, mk1, 'insert', '{"x":100,"y":200,"text":"again","size":9}')); out := out || 'AN UNDONE CHANGE''S ID WAS USED AGAIN; '; exception when others then out := out || 'ids stay taken: ' || sqlerrm || '; '; end;
  -- a change someone else has reinstated stays: Una's line through text, Ula reinstates it, Una can't undo her line until Ula undoes hers
  declare ks uuid := gen_random_uuid(); kr uuid := gen_random_uuid(); sg jsonb := '{"x0":100,"x1":180,"y":500,"text":"the words"}'; rg jsonb := '{"x":100,"y":510}';
  begin
    perform public.agent_round_change(v1, ks, 'strike', 1, sg, null, pg_temp.rb_change_places(2, ks, 'strike', sg));
    perform public.agent_round_change(v2, kr, 'reinstate', 1, rg, ks, pg_temp.rb_change_places(2, kr, 'reinstate', rg));
    -- (one transaction: every step here has the same time, so whole turns are used where a signer has more than one step standing)
    begin perform public.agent_signing_undo(v1, 'turn'); out := out || 'A REINSTATED CHANGE WAS UNDONE BY ITS MAKER; '; exception when others then out := out || 'reinstated stays: ' || sqlerrm || '; '; end;
    perform public.agent_signing_undo(v2, 'turn'); r := public.agent_signing_undo(v1, 'turn');
    out := out || 'reinstatement undone, then Una''s turn (' || (r->>'changes') || ' changes): live changes=' || (select count(*) from public.offer_sign_marks_live where signing_id = g2) || ' kept=' || (select count(*) from public.offer_sign_marks where signing_id = g2) || '; ';
  end;

  -- 6. Tim starts Round 2 again from its start: everything that stands undone, everyone who finished opened again, the round still open
  perform pg_temp.rb_finish(g2);
  out := out || 'vendors finished: status=' || (select status from public.offer_signings where id = g2) || '; ';
  -- everyone has signed: only Tim's start-again rows are taken, not a signer's own
  execute 'set local role service_role';
  begin insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) select g2, v1, l.id, 'last', 'probe' from public.offer_sign_taps_live l where l.signer_id = v1 limit 1; out := out || 'A SIGNER''S UNDO WAS TAKEN ONCE EVERYONE SIGNED; ';
  exception when others then out := out || 'complete: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values (g2, v1, null, null, 'probe'); out := out || 'A DRAWING WAS CLEARED ONCE EVERYONE SIGNED; ';
  exception when others then out := out || 'complete drawing: ' || sqlerrm || '; '; end;
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_revert_round(g2, 'x'); out := out || 'A ROUND STARTED AGAIN WITH NO REASON; '; exception when others then out := out || 'reason: ' || sqlerrm || '; '; end;
  r := public.agent_signing_revert_round(g2, 'The vendors want to read it again');
  out := out || 'round started again: taps=' || (r->>'taps') || ' reopened=' || (r->>'reopened') || ' status=' || (select status from public.offer_signings where id = g2) || ' live taps=' || (select count(*) from public.offer_sign_taps_live where signing_id = g2) || ' drawings kept=' || (select count(*) from public.offer_signers where signing_id = g2 and sig_png is not null) || '; ';
  begin perform public.agent_signing_undo(v1, 'last'); out := out || 'UNDID AFTER TIM STARTED IT AGAIN; '; exception when others then out := out || 'nothing of hers: ' || sqlerrm || '; '; end;

  -- 7. frozen: nobody undoes; Tim unfreezes and goes back to Round 1 as sealed in one step. Round 2 stops, what it held is listed as discarded.
  perform public.agent_signing_tap(v1, 'foot:p1:s1');
  perform public.agent_offer_freeze(o1, 'The building report came back', null, null);
  begin perform public.agent_signing_undo(v1, 'last'); out := out || 'UNDONE WHILE FROZEN; '; exception when others then out := out || 'frozen: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_revert_sealed(o1, 'Going back'); out := out || 'WENT BACK WHILE FROZEN WITHOUT UNFREEZING; '; exception when others then out := out || 'unfreeze with it: ' || sqlerrm || '; '; end;
  tl0 := (select count(*) from public.offer_sign_taps); ml0 := (select count(*) from public.offer_sign_marks);
  r := public.agent_offer_revert_sealed(o1, 'The report changed things', null, true);
  out := out || 'went back: to round ' || (r->>'to_round') || ' stopped=' || (r->>'stopped') || ' discarded taps=' || (r->'discarded'->0->>'taps') || ' round 2=' || (select status from public.offer_signings where id = g2)
    || ' frozen=' || public.offer_hold_active(o1) || ' sealed rounds=' || (select count(*) from public.offer_rounds where offer_id = o1) || ' rows kept=' || ((select count(*) from public.offer_sign_taps) = tl0 and (select count(*) from public.offer_sign_marks) = ml0) || '; ';
  out := out || 'timeline: ' || (select string_agg(kind, ',' order by seq) from (select kind, seq from public.offer_events where offer_id = o1 order by seq desc limit 3) z) || '; ';
  begin perform public.agent_offer_revert_sealed(o1, 'Again'); out := out || 'WENT BACK WITH NOTHING OUT; '; exception when others then out := out || 'nothing out: ' || sqlerrm || '; '; end;

  -- 8. presented again by link: going back is offered on the link only after a freeze on that round was lifted; it goes to Tim, who releases it
  g3 := (public.agent_round_present(o1, 'link', pg_temp.rb_places(2, true, true), true) ->> 'id')::uuid;
  execute 'set local role service_role';
  tok := (select l->>'token' from jsonb_array_elements((public.offer_sign_issue(g3, 'agent'))->'links') l where (l->>'position')::int = 1);
  code := public.offer_sign_code(tok, 'n1')->>'code'; ses := public.offer_sign_verify(tok, code, 'n1', 'ua')->>'session';
  perform public.offer_sign_consent(tok, ses, 'n1', 'ua'); perform public.offer_sign_receipt(tok, ses, 'chattels', null, null, null, null); perform public.offer_sign_marks(tok, ses, png, png);
  out := out || 'link before a freeze: revert offered=' || coalesce(public.offer_sign_state(tok, ses)->'signing'->>'revert', 'no') || '; ';
  begin perform public.offer_sign_request(tok, ses, 'revert', 'material_change', null, 'n1'); out := out || 'GOING BACK ASKED WITH NO FREEZE; '; exception when others then out := out || 'not offered: ' || sqlerrm || '; '; end;
  perform public.offer_sign_tap(tok, ses, 'foot:p1:s1'); perform public.offer_sign_tap(tok, ses, 'foot:p2:s1');
  r := public.offer_sign_undo(tok, ses, 'last', false);
  out := out || 'link undo: taps=' || jsonb_array_length(public.offer_sign_state(tok, ses)->'taps') || ' last=' || (public.offer_sign_state(tok, ses)->'signer'->'last'->>'place_id') || '; ';
  -- a "please initial the change" draft for Ula, made when Una's change reopened her (024), is set aside when Una undoes that change;
  -- one for a change still standing stays
  declare ka uuid := gen_random_uuid(); kb uuid := gen_random_uuid(); ga jsonb := '{"x":100,"y":400,"text":"$700,000","size":9}'; gb jsonb := '{"x":100,"y":200,"text":"Settlement 1 March 2027","size":9}'; ula uuid; dA uuid; dB uuid; un uuid;
  begin
    select id into ula from public.offer_signers where signing_id = g3 and position = 2; select id into un from public.offer_signers where signing_id = g3 and position = 1;
    perform public.offer_sign_do_change(un, kb, 'insert', 1, gb, null, pg_temp.rb_change_places(2, kb, 'insert', gb));
    dB := public.offer_mail_draft_sys(o1, ula, array['ula@example.com'], 'A change to initial', 'Please open the link I sent you earlier and initial the change. Tim');
    perform public.offer_sign_do_change(un, ka, 'insert', 1, ga, null, pg_temp.rb_change_places(2, ka, 'insert', ga));
    r := public.offer_sign_undo(tok, ses, 'last', false);
    out := out || 'drafts after undoing the newer change: older draft=' || (select status from public.offer_mail_drafts where id = dB) || '; ';
    dA := dB; r := public.offer_sign_undo(tok, ses, 'last', false);
    out := out || 'after undoing the change it asked about: draft=' || (select status || ' (' || void_reason || ')' from public.offer_mail_drafts where id = dA) || ' kept=' || (select count(*) from public.offer_mail_drafts where id = dA) || '; ';
  end;
  -- at most 30 undos an hour per signer, and 30 places tapped again
  declare k int := 0; msg text := 'none';
  begin
    loop k := k + 1; exit when k > 40;
      begin perform public.offer_sign_tap(tok, ses, 'foot:p1:s1'); perform public.offer_sign_undo(tok, ses, 'last', false); exception when others then msg := sqlerrm; exit; end;
    end loop;
    out := out || 'cap after ' || k || ' rounds: ' || msg || '; ';
    if msg = 'none' then out := out || 'NO CAP ON UNDO; '; end if;
  end;
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  perform public.agent_offer_freeze(o1, 'A call from the purchasers', null, null); perform public.agent_offer_unfreeze(o1, 'All fine now');
  execute 'set local role service_role';
  out := out || 'after a freeze: revert offered=' || coalesce(public.offer_sign_state(tok, ses)->'signing'->>'revert', 'NO') || '; ';
  rq := public.offer_sign_request(tok, ses, 'revert', 'material_change', null, 'n1');
  out := out || 'asked: kind=' || (rq->>'kind') || ' reason=' || (rq->>'reason') || ' link says=' || (public.offer_sign_open(tok, 'n1', 'ua')->>'stopped') || '; ';
  begin perform public.offer_sign_undo(tok, ses, 'last', false); out := out || 'UNDONE WITH A REQUEST OPEN; '; exception when others then out := out || 'request open: ' || sqlerrm || '; '; end;
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  r := public.agent_offer_revert_sealed(o1, 'They asked to go back', (rq->>'id')::uuid);
  out := out || 'released: request=' || (select handled_as from public.offer_requests where id = (rq->>'id')::uuid) || ' round=' || (select status from public.offer_signings where id = g3) || ' link=' || coalesce(public.offer_sign_find(tok)::text, 'closed') || '; ';

  -- 9. "Confirm the agreement" while frozen is held, not locked, sealed or dated; discarded or completed once unfrozen
  g4 := (public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, true, true), true) ->> 'id')::uuid;
  perform pg_temp.rb_prep(g4); perform pg_temp.rb_finish(g4); r := pg_temp.rb_lock(g4, '{"lifted":[],"outstanding":[]}');
  out := out || 'round 2 sealed with no changes: changes=' || (select changes from public.offer_rounds where id = (r->>'id')::uuid) || '; ';
  acc := now();
  begin perform public.agent_offer_confirm_hold(o1, acc, today); out := out || 'HELD WITH NO FREEZE; '; exception when others then out := out || 'not frozen: ' || sqlerrm || '; '; end;
  perform public.agent_offer_freeze(o1, 'Checking the title', null, null);
  begin perform public.offer_agreement_check(o1, acc, today); out := out || 'AGREED WHILE FROZEN; '; exception when others then out := out || 'check still refuses: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_confirm_hold(o1, acc, to_char(now() + interval '10 days', 'FMDD FMMonth YYYY')); out := out || 'HELD A FUTURE DATE; '; exception when others then out := out || 'future: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_confirm_hold(o1, now() - interval '2 hours', today); out := out || 'HELD BEFORE THE LAST SIGNATURE; '; exception when others then out := out || 'accepted when: ' || sqlerrm || '; '; end;
  hd := public.agent_offer_confirm_hold(o1, acc, today);
  out := out || 'held: round=' || (hd->>'round') || ' agreements=' || (select count(*) from public.offer_agreements where offer_id = o1) || ' offer=' || (select status from public.property_offers where id = o1) || '; ';
  begin perform public.agent_offer_confirm_hold(o1, acc, today); out := out || 'HELD TWICE; '; exception when others then out := out || 'one at a time: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_confirm_held(o1); out := out || 'COMPLETED WHILE FROZEN; '; exception when others then out := out || 'frozen: ' || sqlerrm || '; '; end;
  begin perform set_config('offers.fn', 'on', true); update public.offer_confirm_holds set date_text = '1 January 2026' where offer_id = o1; out := out || 'A HELD CONFIRMATION WAS CHANGED; '; exception when others then out := out || 'held stays: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  perform public.agent_offer_confirm_hold_discard(o1, 'Wrong time');
  out := out || 'discarded: ' || (select resolved_as from public.offer_confirm_holds where id = (hd->>'id')::uuid) || '; ';
  hd := public.agent_offer_confirm_hold(o1, acc, today);
  perform public.agent_offer_unfreeze(o1, 'Title is fine');
  rd := public.agent_offer_confirm_held(o1);
  out := out || 'to complete: date=' || ((rd->>'date_text') = today) || ' round=' || (rd->>'round') || '; ';
  -- the agreement is then made exactly as before (the offer-sign function: material, the stored file, the lock)
  execute 'set local role service_role';
  rd := public.offer_agreement_material(o1, (rd->>'accepted_at')::timestamptz, rd->>'date_text');
  apath := 'properties/' || pid || '/docs/offer-agreement-' || o1 || '-' || left(asha, 12) || '.pdf';
  execute 'reset role'; insert into storage.objects (bucket_id, name, metadata) values ('property-files', apath, '{"size": 6000, "mimetype": "application/pdf"}'); execute 'set local role service_role';
  perform public.offer_file_confirm(apath, asha, 6000, 'agent');
  perform public.offer_agreement_lock(o1, (rd->>'round_id')::uuid, apath, asha, 6000, acc, rd->>'date_text', jsonb_build_object('draw_version', 'nego-draw-1', 'base', jsonb_build_object('round', 2, 'sha256', rd->>'round_sha256')), 'agent');
  execute 'reset role';
  out := out || 'agreed: hold=' || (select resolved_as from public.offer_confirm_holds where id = (hd->>'id')::uuid) || ' offer=' || (select status from public.property_offers where id = o1) || ' events=' || (select string_agg(kind, ',' order by seq) from public.offer_events where offer_id = o1 and kind in ('agreement_held', 'agreement_hold_discarded', 'agreement_formed')) || '; ';

  -- 10. who sees what: a vendor sees none of it; a signed-in user can't run the link's undo
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees undos=' || (select count(*) from public.offer_sign_undos) || ' redraws=' || (select count(*) from public.offer_sign_redraws) || ' holds=' || (select count(*) from public.offer_confirm_holds) || ' live taps=' || (select count(*) from public.offer_sign_taps_live) || '; ';
  begin perform public.offer_sign_undo(tok, ses, 'last', false); out := out || 'A SIGNED-IN USER RAN THE LINK UNDO; '; exception when others then out := out || 'service only: ' || sqlerrm || '; '; end;
  begin perform public.agent_signing_undo(v1, 'last'); out := out || 'A VENDOR RAN TIM''S UNDO; '; exception when others then out := out || 'agent only: ' || sqlerrm || '; '; end;
  begin insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) values (g1, s1, (select min(id) from public.offer_sign_taps), 'last', 'x'); out := out || 'A SIGNED-IN USER WROTE AN UNDO; '; exception when others then out := out || 'insert: ' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', agent, true);
  out := out || 'Tim sees undos=' || (select count(*) from public.offer_sign_undos where signing_id in (g1, g2, g3)) || ' live taps on round 1=' || (select count(*) from public.offer_sign_taps_live where signing_id = g1) || '; ';
  execute 'reset role';
  raise exception 'ROLLBACK %', out;
end $t$;
