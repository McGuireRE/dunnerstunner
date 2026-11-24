-- Rollback test for migration 024 (presentation and counteroffers; built as 021). Run with onboarding/tests/offer-negotiation-rollback.js, which puts
-- the whole migration inside the block, so one statement creates everything, runs the checks and then raises, which undoes it all.
-- Nothing is kept. The output is the exception message: refusals read in lower case; a line in CAPITALS means something that should
-- have been refused was allowed, or a value was wrong. Roles: the agent and a vendor are simulated with request.jwt.claims and the
-- authenticated role; the offer-sign edge function with service_role. Needs 023 (and 019, 018, 016 part A, 010) applied first, or run with --with-023, and
-- property_people.phone (the live table has it; tests/pg-standin.sql adds it). The blank, map, drafts and approvals are set up
-- directly (019's own rollback covers how they are made); the signing steps of each round use 020's own functions.
do $t$
declare out text := ''; r jsonb; pid uuid; o1 uuid; o2 uuid; o3 uuid; o4 uuid; d4 uuid; m2 uuid; g4 uuid; ses2 text; tok2 text; bl uuid; m uuid; d1 uuid; d2 uuid; d2b uuid; d3 uuid; g1 uuid; g2 uuid; g3 uuid; gx uuid; s uuid; tok text; ses text; code text; x text; n int; ok_ boolean;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-nego-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111e4","role":"authenticated"}';
  sizes jsonb := '[[595.32,842.04],[595.32,842.04],[595.32,842.04]]';
  good jsonb; mk1 uuid := '11111111-aaaa-4aaa-8aaa-000000000001'; mk2 uuid := '11111111-aaaa-4aaa-8aaa-000000000002'; mk3 uuid := '11111111-aaaa-4aaa-8aaa-000000000003'; mk4 uuid := '11111111-aaaa-4aaa-8aaa-000000000004';
  doc1 uuid; rd jsonb; agr jsonb; apath text; asha text := repeat('a9', 32); acc timestamptz;
begin
  execute $mig$__MIGRATION__$mig$;
  -- helpers for this test only (gone with the rollback): the places a side does, every signer of a signing doing every place, and
  -- the edge function's lock (a stored file of its own, its fingerprint confirmed)
  execute $f$create function pg_temp.rb_places(n int, first_ boolean, marks uuid[], v boolean, sig boolean default true) returns jsonb language plpgsql security definer as $b$
    declare out_ jsonb := '[]'; s int; k int; mk uuid; rc jsonb;
    begin for s in 1..n loop
      if first_ then for k in 1..3 loop out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'foot:p' || k || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'foot', 'ref', 'p' || k, 'page', k, 'x', 440 + s * 28 + case when v then 60 else 0 end, 'y', 5, 'w', 26, 'h', 13)); end loop; end if;
      if sig then out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:' || case when v then 'vsig' else 'sig' end || s || ':s' || s, 'signer', s, 'kind', 'signature', 'why', 'block', 'ref', case when v then 'vsig' else 'sig' end || s, 'page', 3, 'x', case when v then 330 else 40 end, 'y', 530 - s * 70, 'w', 150, 'h', 22)); end if;
      foreach mk in array coalesce(marks, '{}') loop select public.offer_change_rect(m.kind, m.geometry) into rc from public.offer_sign_marks m where m.id = mk;
        out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1, 'x', (rc->>'x')::numeric + (rc->>'w')::numeric + 4 + (s - 1) * 28, 'y', (rc->>'y')::numeric - case when v then 0 else 16 end, 'w', 26, 'h', 13)); end loop;
    end loop; return out_; end $b$$f$;
  -- everyone's initials beside a change about to be made (kind and geometry as sent), on its page and just after it
  execute $f$create function pg_temp.rb_change_places(n int, mk uuid, k text, geo jsonb, far boolean default false) returns jsonb language sql security definer as $b$
    select jsonb_agg(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1,
      'x', (public.offer_change_rect(k, geo)->>'x')::numeric + (public.offer_change_rect(k, geo)->>'w')::numeric + 4 + (s - 1) * 28, 'y', (public.offer_change_rect(k, geo)->>'y')::numeric + case when far then 200 else 0 end, 'w', 26, 'h', 13)) from generate_series(1, n) s $b$$f$;
  execute $f$create function pg_temp.rb_prep(g uuid) returns void language plpgsql as $b$
    declare s public.offer_signers; gg public.offer_signings; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
    begin select * into gg from public.offer_signings where id = g;
      if gg.status = 'ready' and gg.method = 'in_person' then perform public.agent_signing_start(g); end if;
      for s in select * from public.offer_signers where signing_id = g and void_at is null order by position loop
        perform public.offer_sign_do_consent(s.id, 'ua', null);
        if gg.round_no = 1 then perform public.offer_sign_do_receipt(s.id, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); end if;
        if gg.side = 'vendor' then perform public.offer_sign_do_receipt(s.id, 'chattels', null, null, null, null); end if;
        if s.sig_png is null then perform public.offer_sign_do_marks(s.id, png, png); end if;
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

  -- set up as 020 leaves it: a property with two vendors, three offers each drafted and approved
  insert into public.properties (address, stage) values ('RB 21 Counter Street, Dunedin', 'live') returning id into pid;
  insert into public.property_people (property_id, position, legal_name, email, phone, role) values (pid, 1, 'Vera Vendor', 'rb-nego-vendor@example.com', '027 444 5555', 'owner'), (pid, 2, 'Val Vendor', 'val@example.com', '', 'owner');
  -- Val's own phone is only on the agency agreement
  insert into public.agreements (property_id, status) values (pid, 'countersigned') returning id into x;
  insert into public.agreement_people (agreement_id, legal_name, email, phone) values (x::uuid, 'Val Vendor', 'val@example.com', '022 987 6543');
  good := jsonb_build_object('email', 'buyer@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10)), 'kiwisaver', false,
    'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Testbuyer', 'email', 'ana@example.com', 'phone', '021 111 2222'), jsonb_build_object('first', 'Bo', 'last', 'Testbuyer', 'email', 'bo@example.com', 'phone', '021 333 4444')),
    'related', false, 'privacy', true, 'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat Lawyer', 'email', 'pat@law.example', 'phone', '03 477 0000'));
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  o1 := public.agent_offer_add(pid, good); o2 := public.agent_offer_add(pid, good); o3 := public.agent_offer_add(pid, good); o4 := public.agent_offer_add(pid, good);
  execute 'reset role';
  insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'rb-blank') returning id into x;
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x::uuid, repeat('ab', 32), 10, 'Blank.pdf', 3, sizes, 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10}]', true, 'test') returning id into m;
  -- offer 1's draft records main's further terms numbering (term_last, a retired number), as drafts made since 021 do
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
    select oo, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = oo), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || oo || '-1.pdf', encode(extensions.digest(oo::text, 'sha256'), 'hex'), 100, 'test',
      case when oo = o1 then '{"term_last": 24, "retired_numbers": [23]}'::jsonb else '{"term_last": 22}'::jsonb end from unnest(array[o1, o2, o3]) oo;
  select id into d1 from public.offer_drafts where offer_id = o1; select id into d2 from public.offer_drafts where offer_id = o2; select id into d3 from public.offer_drafts where offer_id = o3;
  insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 2, '[]', true, 'test') returning id into m2;   -- a map with no date place
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
    values (o4, pid, 1, bl, repeat('ab', 32), m2, (select details from public.property_offers where id = o4), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || o4 || '-1.pdf', repeat('d4', 32), 100, 'test', '{"term_last": 22}') returning id into d4;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) select id, sha256, 'test' from public.offer_drafts where offer_id in (o1, o2, o3, o4);
  -- a draft from before the further terms numbering (no term_last): signing is refused, with Tim's plain message
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true); x := public.agent_offer_add(pid, good)::text; execute 'reset role';
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
    values (x::uuid, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = x::uuid), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-old.pdf', repeat('0d', 32), 100, 'test') returning id into d4;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d4, repeat('0d', 32), 'test');
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_signing_release(d4, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}'); out := out || 'A DRAFT FROM BEFORE THE NUMBERING RELEASED; '; exception when others then out := out || 'old-style draft: ' || sqlerrm || '; '; end;
  select id into d4 from public.offer_drafts where offer_id = o4;

  -- 1. Round 1 (020, unchanged) locks and opens Document 1; nothing has gone to the vendors
  perform set_config('request.jwt.claims', agent, true);
  g1 := (public.agent_signing_release(d1, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}') ->> 'id')::uuid;
  perform pg_temp.rb_prep(g1); perform pg_temp.rb_finish(g1); r := pg_temp.rb_lock(g1, '{}');
  select id into doc1 from public.offer_documents where offer_id = o1;
  out := out || 'round 1: number=' || (r->>'number') || ' document=' || (r->>'document') || ' doc open=' || ((select status from public.offer_documents where id = doc1) = 'open') || ' vendor signings=' || (select count(*) from public.offer_signings where offer_id = o1 and side = 'vendor') || '; ';

  -- 2. a vendor sees nothing of any of it, and can't present or change anything
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees docs=' || (select count(*) from public.offer_documents) || ' rounds=' || (select count(*) from public.offer_rounds) || ' signings=' || (select count(*) from public.offer_signings) || ' agreements=' || (select count(*) from public.offer_agreements) || '; ';
  begin perform public.agent_round_present(o1, 'link', '[]', true); out := out || 'A VENDOR PRESENTED; '; exception when others then out := out || 'vendor presents: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change('x', 'y', 'n', mk1, 'strike', 1, '{"x0":1,"x1":50,"y":5}', null, '[]'); out := out || 'A SIGNED-IN USER RAN THE SERVICE FUNCTION; '; exception when others then out := out || 'service only: ' || sqlerrm || '; '; end;
  begin insert into public.offer_documents (offer_id, property_id, number, draft_id, draft_sha256) values (o1, pid, 9, d2, repeat('a', 64)); out := out || 'A DOCUMENT WRITTEN DIRECTLY; '; exception when others then out := out || 'direct write: ' || sqlerrm || '; '; end;

  -- 3. Tim presents: only once he has looked, with the right places, by link to each vendor; nothing is sent until Send
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_round_present(o2, 'link', pg_temp.rb_places(2, true, null, true), true); out := out || 'PRESENTED BEFORE ROUND 1; '; exception when others then out := out || 'before round 1: ' || sqlerrm || '; '; end;
  begin perform public.agent_round_present(o1, 'link', pg_temp.rb_places(2, true, null, true), false); out := out || 'PRESENTED UNCHECKED; '; exception when others then out := out || 'unchecked: ' || sqlerrm || '; '; end;
  begin perform public.agent_round_present(o1, 'link', pg_temp.rb_places(2, false, null, true), true); out := out || 'VENDORS SKIPPED THE PAGE FEET; '; exception when others then out := out || 'feet: ' || sqlerrm || '; '; end;
  -- link changes start off (Tim, 24 November 2026): the setting reads false until he changes it; this round he switches them on himself
  out := out || 'link changes default=' || (select link_changes_default from public.offer_settings limit 1) || '; ';
  r := public.agent_round_present(o1, 'link', pg_temp.rb_places(2, true, null, true), true, 'Presented at the open home table', true); g2 := (r->>'id')::uuid;
  out := out || 'presented: side=' || (r->>'side') || ' round=' || (r->>'round') || ' again existing=' || (public.agent_round_present(o1, 'link', '[]', true)->>'existing') || '; ';
  out := out || 'signers: ' || (select string_agg(name || case when person_id is not null then '+' else '' end, ', ' order by position) from public.offer_signers where signing_id = g2) || ' status=' || (select status from public.offer_signings where id = g2) || '; ';
  execute 'reset role';

  -- 3b. emails are drafts Tim sends (Tim, 24 November 2026): a draft for Val (the second vendor), its checks, the send and its log
  declare mv uuid; sv uuid; tk jsonb; n0 int;
  begin
    select id into sv from public.offer_signers where signing_id = g2 and position = 2;
    perform set_config('request.jwt.claims', agent, true);
    begin perform public.agent_mail_draft_add(o1, 'sign_link', sv, array['ana@example.com'], '{}', 'An offer', 'Hello [the signing link]', null); out := out || 'A VENDOR''S LINK TO A PURCHASER''S ADDRESS; '; exception when others then out := out || 'wrong recipient: ' || sqlerrm || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'sign_link', sv, array['val@example.com'], '{}', 'An offer', 'Hello, open it here', null); out := out || 'A LINK EMAIL WITHOUT ITS LINK; '; exception when others then out := out || 'no link: ' || sqlerrm || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'sign_link', sv, array['val@example.com'], '{}', 'An offer', 'Call Ana on 021 111 2222 [the signing link]', null); out := out || 'A PURCHASER''S PHONE TO THE VENDOR; '; exception when others then out := out || 'other side''s phone: ' || sqlerrm || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'sign_link', sv, array['val@example.com'], array['pat@law.example'], 'An offer', 'Hello [the signing link]', null); out := out || 'A SIGNING LINK COPIED TO SOMEONE; '; exception when others then out := out || 'cc: ' || sqlerrm || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'agreed_vendors', null, array['val@example.com'], '{}', 'Congratulations', 'Hello', '{"path":"x","sha256":"y","name":"Agreement.pdf"}'); out := out || 'AN AGREED-COPY EMAIL BEFORE THE AGREEMENT; '; exception when others then out := out || 'agreed too soon: ' || sqlerrm || '; '; end;
    mv := public.agent_mail_draft_add(o1, 'sign_link', sv, array['VAL@example.com'], '{}', 'An offer on the property', 'Kia ora Val, [the signing link] Tim', null);
    perform public.agent_mail_draft_edit(mv, array['val@example.com'], '{}', 'An offer on the property', 'Kia ora Val, here is your link: [the signing link]. Any questions, call me on 027 562 7207. Tim');
    perform public.agent_mail_draft_review(mv, true);
    out := out || 'draft status=' || (select status from public.offer_mail_drafts where id = mv) || ' reviewed=' || ((select reviewed_at from public.offer_mail_drafts where id = mv) is not null) || ' val link before send=' || ((select token_hash from public.offer_signers where id = sv) is not null) || '; ';
    begin update public.offer_mail_drafts set body = 'x' where id = mv; out := out || 'A DRAFT CHANGED DIRECTLY; '; exception when others then out := out || 'direct edit: ' || sqlerrm || '; '; end;
    execute 'set local role authenticated';
    begin insert into public.offer_mail_drafts (offer_id, property_id, kind, to_addr, subject, body, created_by) values (o1, pid, 'reopened', array['val@example.com'], 's', 'b', 'me'); out := out || 'A SIGNED-IN USER WROTE A DRAFT; '; exception when others then out := out || 'insert: ' || sqlerrm || '; '; end;
    perform set_config('request.jwt.claims', vendor, true);
    out := out || 'vendor sees drafts=' || (select count(*) from public.offer_mail_drafts) || ' log=' || (select count(*) from public.offer_mail_log) || '; ';
    begin perform public.offer_mail_take(mv, 'x'); out := out || 'A SIGNED-IN USER SENT AN EMAIL; '; exception when others then out := out || 'take as user: ' || sqlerrm || '; '; end;
    execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
    execute 'set local role service_role';
    tk := public.offer_mail_take(mv, 'Tim McGuire');
    out := out || 'take: token=' || (length(tk->>'token') >= 40) || ' kept as a fingerprint=' || ((select token_hash from public.offer_signers where id = sv) = public.offer_sha(tk->>'token')) || '; ';
    perform public.offer_mail_done(mv, 'Tim McGuire', replace(tk->>'body', '[the signing link]', 'https://example.test/?sign=[personal link]'), '[]', true, null);
    execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
    out := out || 'sent: status=' || (select status from public.offer_mail_drafts where id = mv) || ' log ok=' || (select ok from public.offer_mail_log where draft_id = mv) || ' log keeps no token=' || ((select position(tk->>'token' in body) from public.offer_mail_log where draft_id = mv) = 0) || '; ';
    begin perform public.agent_mail_draft_edit(mv, array['val@example.com'], '{}', 's', 'b [the signing link]'); out := out || 'A SENT EMAIL EDITED; '; exception when others then out := out || 'edit after send: ' || sqlerrm || '; '; end;
    begin update public.offer_mail_log set body = 'x' where draft_id = mv; out := out || 'THE LOG CHANGED; '; exception when others then out := out || 'log fixed: ' || sqlerrm || '; '; end;
    begin delete from public.offer_mail_drafts where id = mv; out := out || 'A DRAFT REMOVED; '; exception when others then out := out || 'remove: ' || sqlerrm || '; '; end;
    -- a newer draft for the same signer sets the older aside; Tim can set one aside himself
    mv := public.agent_mail_draft_add(o1, 'sign_link', sv, array['val@example.com'], '{}', 'Again', 'Your link again: [the signing link]', null);
    perform public.agent_mail_draft_add(o1, 'sign_link', sv, array['val@example.com'], '{}', 'Again', 'Your link once more: [the signing link]', null);
    out := out || 'older set aside=' || (select status from public.offer_mail_drafts where id = mv) || '; ';
    select id into mv from public.offer_mail_drafts where signer_id = sv and status = 'draft'; perform public.agent_mail_draft_void(mv, 'Not needed');
    out := out || 'open drafts left=' || (select count(*) from public.offer_mail_drafts where signer_id = sv and status = 'draft') || '; ';
  end;
  -- 4. Vera opens her link: the vendors' side, round 2; a code; the reminder about chattels comes before any place
  r := public.offer_sign_issue(g2, 'agent'); tok := r->'links'->0->>'token';
  out := out || 'issue side=' || (r->>'side') || ' round=' || (r->>'round') || ' links=' || jsonb_array_length(r->'links') || ' changes from link (switched on for this round)=' || (select link_changes from public.offer_signings where id = g2) || ' recorded=' || (select detail->>'link_changes' from public.offer_events where kind = 'round_presented' and detail->>'signing_id' = g2::text) || '; ';
  r := public.offer_sign_open(tok, 'n1', 'ua'); out := out || 'open: first=' || (r->>'first') || ' side=' || (r->>'side') || ' stopped=' || coalesce(r->>'stopped', 'none') || '; ';
  code := public.offer_sign_code(tok, 'n1')->>'code'; ses := public.offer_sign_verify(tok, code, 'n1', 'ua')->>'session';
  r := public.offer_sign_state(tok, ses);
  -- the newest draft's further terms numbering, for a new further term in a counteroffer (the 23.0 style when the draft has no further terms)
  out := out || 'terms for a new further term: last=' || coalesce(r->'signing'->'terms'->>'last', 'NONE') || ' retired=' || coalesce(r->'signing'->'terms'->>'retired', 'NONE') || ' style=' || coalesce(r->'signing'->'terms'->>'style', 'NONE') || '; ';
  out := out || 'state before consent: layers=' || jsonb_array_length(r->'signing'->'layers') || ' parties=' || (r->'signing'->'parties'->'purchasers')::text || ' lawyer=' || (r->'signing'->'parties'->'lawyer'->>'firm') || ' no purchaser contact=' || (position('ana@example.com' in r::text) = 0 and position('111 2222' in r::text) = 0 and position('buyer@example.com' in r::text) = 0) || '; ';
  perform public.offer_sign_consent(tok, ses, 'n1', 'ua');
  r := public.offer_sign_state(tok, ses); out := out || 'after consent: layers=' || jsonb_array_length(r->'signing'->'layers') || ' round1 taps=' || jsonb_array_length(r->'signing'->'layers'->0->'taps') || ' no emails in layers=' || (position('@' in (r->'signing'->'layers')::text) = 0) || '; ';
  perform public.offer_sign_marks(tok, ses, 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30), 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30));
  begin perform public.offer_sign_tap(tok, ses, 'block:vsig1:s1'); out := out || 'TAPPED BEFORE THE CHATTELS REMINDER; '; exception when others then out := out || 'chattels first: ' || sqlerrm || '; '; end;
  perform public.offer_sign_receipt(tok, ses, 'chattels', null, null, null, null);
  begin perform public.offer_sign_receipt(tok, ses, 'cca', null, null, null, '{1}'); out := out || 'A CCA ON THE VENDORS'' SIDE; '; exception when others then out := out || 'no cca for vendors: ' || sqlerrm || '; '; end;
  out := out || 'tap after reminder=' || (public.offer_sign_tap(tok, ses, 'block:vsig1:s1')->>'done') || '; ';

  -- 5. Vera counters: strikes the price and types a new one. Typed words never hold a party's own phone or email; each change carries
  -- every vendor's initials
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'insert', 1, '{"x":100,"y":380,"text":"Call Ana on 021 111 2222","size":9}', null, pg_temp.rb_change_places(2, mk1, 'insert', '{"x":100,"y":380,"text":"Call Ana on 021 111 2222","size":9}')); out := out || 'A PURCHASER''S PHONE TYPED ON; '; exception when others then out := out || 'purchaser phone: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'insert', 1, '{"x":100,"y":380,"text":"Vendor on +64 27 444 5555","size":9}', null, pg_temp.rb_change_places(2, mk1, 'insert', '{"x":100,"y":380,"text":"x","size":9}')); out := out || 'A VENDOR''S PHONE TYPED ON; '; exception when others then out := out || 'vendor phone: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'insert', 1, '{"x":100,"y":380,"text":"email RB-NEGO-VENDOR@example.com","size":9}', null, pg_temp.rb_change_places(2, mk1, 'insert', '{"x":100,"y":380,"text":"x","size":9}')); out := out || 'A VENDOR''S EMAIL TYPED ON; '; exception when others then out := out || 'vendor email: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'strike', 1, '{"x0":100,"x1":180,"y":345}', null, pg_temp.rb_change_places(1, mk1, 'strike', '{"x0":100,"x1":180,"y":345}')); out := out || 'A CHANGE WITHOUT EVERY VENDOR''S INITIALS; '; exception when others then out := out || 'initials: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'strike', 1, '{"x0":100,"x1":102,"y":345}', null, pg_temp.rb_change_places(2, mk1, 'strike', '{"x0":100,"x1":180,"y":345}')); out := out || 'A TINY STRIKE; '; exception when others then out := out || 'shape: ' || sqlerrm || '; '; end;
  r := public.offer_sign_change(tok, ses, 'n1', mk1, 'strike', 1, '{"x0":100,"x1":180,"y":345}', null, pg_temp.rb_change_places(2, mk1, 'strike', '{"x0":100,"x1":180,"y":345}'));
  begin perform public.offer_sign_change(tok, ses, 'n1', mk1, 'strike', 1, '{"x0":100,"x1":180,"y":345}', null, pg_temp.rb_change_places(2, mk1, 'strike', '{"x0":100,"x1":180,"y":345}')); out := out || 'THE SAME CHANGE TWICE; '; exception when others then out := out || 'twice: ' || sqlerrm || '; '; end;
  -- item 2 of the review: spaces of every kind, full-width digits, / and _ between digits, a spaced @, and a vendor's phone only on the agency agreement
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"Ana 021\u00a0111\u00a02222","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'A PHONE WITH NON-BREAKING SPACES; '; exception when others then out := out || 'nbsp: ' || left(sqlerrm, 30) || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, jsonb_build_object('x', 100, 'y', 330, 'text', 'Ana ' || chr(65296) || chr(65298) || chr(65297) || ' ' || chr(65297) || chr(65297) || chr(65297) || ' ' || chr(65298) || chr(65298) || chr(65298) || chr(65298), 'size', 9), null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'A FULL-WIDTH PHONE; '; exception when others then out := out || 'full-width: ' || left(sqlerrm, 30) || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"021/111/2222","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'A PHONE WITH SLASHES; '; exception when others then out := out || 'slashes: ' || left(sqlerrm, 30) || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"021_111_2222","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'A PHONE WITH UNDERSCORES; '; exception when others then out := out || 'underscores: ' || left(sqlerrm, 30) || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"ana @ example.com","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'A SPACED EMAIL; '; exception when others then out := out || 'spaced email: ' || left(sqlerrm, 30) || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"Val on 022 987 6543","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"x","size":9}')); out := out || 'AN AGREEMENT VENDOR''S PHONE; '; exception when others then out := out || 'agreement vendor: ' || left(sqlerrm, 40) || '; '; end;
  -- second review: dates and prices in any format are accepted (each tried, then undone); the parties' own phones in the same formats are not
  for x in select unnest(array['Settlement 20/12/2026', 'Settlement 20.12.2026', 'Settlement 2027-03-01', 'Price $1 250 000', 'Price $1250000', 'Price $ 695 000.00']) loop
    begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, jsonb_build_object('x', 100, 'y', 330, 'text', x, 'size', 9), null, pg_temp.rb_change_places(2, mk2, 'insert', jsonb_build_object('x', 100, 'y', 330, 'text', x, 'size', 9))); raise exception 'accepted';
    exception when others then out := out || case when sqlerrm = 'accepted' then '' else 'ORDINARY WORDS REFUSED (' || x || '): ' || sqlerrm || '; ' end; end;
  end loop;
  out := out || 'dates and prices accepted, never matched=' || (select bool_and(public.offer_private_hit(o1, t) is null) from unnest(array['Settlement 20/12/2026', 'Settlement 20.12.2026', 'Settlement 2027-03-01', 'Price $1 250 000', 'Price $1250000', 'Price $ 695 000.00']) t) || '; ';
  out := out || 'own phones still refused=' || (select string_agg(coalesce(public.offer_private_hit(o1, t), 'NOT FOUND'), ',') from unnest(array['Call 021/111/2222', 'Call 021.111.2222', 'Call 021-111-2222', 'Call (021) 111 2222', 'Ring 027 444 5555']) t) || '; ';
  -- items 9 and 10: initials beside the change; never on the date's place
  -- a new further term's number (024): free in this agreement only. The draft's term_last is 24 (23 retired, as drafting keeps it), so 25.0 is next.
  -- The accepted term is undone at once (a sub-block), so the counts below are unchanged.
  declare tA uuid := gen_random_uuid(); tB uuid := gen_random_uuid(); gA jsonb := '{"x":100,"y":300,"text":"25.0 Synthetic counteroffer term","size":9}'; gB jsonb := '{"x":100,"y":280,"text":"25.0 Another synthetic term","size":9}';
    gC jsonb := '{"x":100,"y":280,"text":"24.0 Synthetic term","size":9}'; gD jsonb := '{"x":100,"y":280,"text":"30.0 Synthetic term","size":9}'; gE jsonb := '{"x":100,"y":280,"text":"23.0 Synthetic term","size":9}';
  begin
    begin perform public.offer_sign_change(tok, ses, 'n1', tB, 'insert', 1, gC, null, pg_temp.rb_change_places(2, tB, 'insert', gC)); out := out || 'TERM 24.0 TAKEN AGAIN; '; exception when others then out := out || 'term at term_last: ' || sqlerrm || '; '; end;
    begin perform public.offer_sign_change(tok, ses, 'n1', tB, 'insert', 1, gD, null, pg_temp.rb_change_places(2, tB, 'insert', gD)); out := out || 'TERM 30.0 OUT OF ORDER ACCEPTED; '; exception when others then out := out || 'term out of order: ' || sqlerrm || '; '; end;
    begin
      perform public.offer_sign_change(tok, ses, 'n1', tA, 'insert', 1, gA, null, pg_temp.rb_change_places(2, tA, 'insert', gA)); out := out || 'term 25.0 taken; ';
      begin perform public.offer_sign_change(tok, ses, 'n1', tB, 'insert', 1, gB, null, pg_temp.rb_change_places(2, tB, 'insert', gB)); out := out || 'A TERM NUMBER USED TWICE; '; exception when others then out := out || 'same number again: ' || sqlerrm || '; '; end;
      begin perform public.offer_sign_change(tok, ses, 'n1', tB, 'insert', 1, gE, null, pg_temp.rb_change_places(2, tB, 'insert', gE)); out := out || 'A RETIRED NUMBER USED; '; exception when others then out := out || 'retired number: ' || sqlerrm || '; '; end;
      raise exception 'undo-term';
    exception when others then if sqlerrm <> 'undo-term' then out := out || 'TERM TEST FAILED ' || sqlerrm || '; '; end if; end;
  end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"$690,000","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"$690,000","size":9}', true)); out := out || 'INITIALS FAR FROM THE CHANGE; '; exception when others then out := out || 'beside: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":120,"y":731,"text":"25 December 2026","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":120,"y":731,"text":"25 December 2026","size":9}')); out := out || 'A CHANGE ON THE DATE; '; exception when others then out := out || 'date place: ' || sqlerrm || '; '; end;
  -- item 12: the per-network limit on changes from a link (60 an hour), and the per-signer limit (30 an hour)
  begin insert into public.offer_hits (kind, net) select 'sign_change', public.offer_net('busy-net') from generate_series(1, 60); perform public.offer_sign_change(tok, ses, 'busy-net', mk2, 'strike', 1, '{"x0":100,"x1":180,"y":200}', null, pg_temp.rb_change_places(2, mk2, 'strike', '{"x0":100,"x1":180,"y":200}')); raise exception 'NO NETWORK LIMIT'; exception when others then out := out || 'network limit: ' || left(sqlerrm, 40) || '; '; end;
  begin insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry) select g2, s.id, s.name, 'strike', 1, '{"x0":1,"x1":20,"y":5}' from public.offer_signers s, generate_series(1, 30) where s.signing_id = g2 and s.position = 1;
    perform public.offer_sign_change(tok, ses, 'n1', mk2, 'strike', 1, '{"x0":100,"x1":180,"y":200}', null, pg_temp.rb_change_places(2, mk2, 'strike', '{"x0":100,"x1":180,"y":200}')); raise exception 'NO SIGNER LIMIT'; exception when others then out := out || 'signer limit: ' || left(sqlerrm, 40) || '; '; end;
  -- item 3: Val finishes, then Vera's change reopens her (her email comes back, for the edge function to tell her)
  tok := (select l->>'token' from jsonb_array_elements((public.offer_sign_issue(g2, 'agent'))->'links') l where (l->>'position')::int = 1);
  code := public.offer_sign_code(tok, 'n1')->>'code'; ses := public.offer_sign_verify(tok, code, 'n1', 'ua')->>'session';
  perform pg_temp.rb_prep(g2);
  perform public.offer_sign_do_tap(s2, p2) from (select (select id from public.offer_signers where signing_id = g2 and position = 2) s2, q.q p2 from public.offer_sign_required(g2, 2) q(q)) z;
  perform public.offer_sign_do_finish((select id from public.offer_signers where signing_id = g2 and position = 2), 'ua', null, null, null);
  r := public.offer_sign_change(tok, ses, 'n1', mk2, 'insert', 1, '{"x":100,"y":330,"text":"$690,000","size":9}', null, pg_temp.rb_change_places(2, mk2, 'insert', '{"x":100,"y":330,"text":"$690,000","size":9}'));
  out := out || 'reopened=' || (r->>'reopened') || ' told=' || (r->'reopened_signers'->0->>'name') || ' at ' || (r->'reopened_signers'->0->>'email') || ' review kind=' || (select kind || '/' || coalesce(reviewed_by, 'none') || '/' || changed_by from public.offer_sign_reviews where marks = array[mk2]) || '; ';
  out := out || 'changes=' || (select count(*) from public.offer_sign_marks where signing_id = g2) || ' required of Vera=' || (select count(*) from public.offer_sign_required(g2, 1) x) || '; ';
  begin update public.offer_sign_marks set geometry = '{}' where id = mk1; out := out || 'A CHANGE ALTERED; '; exception when others then out := out || 'change fixed: ' || sqlerrm || '; '; end;
  begin perform public.offer_sign_finish(tok, ses, 'n1', 'ua'); out := out || 'FINISHED WITH CHANGES UNINITIALLED; '; exception when others then out := out || 'finish waits: ' || sqlerrm || '; '; end;
  -- Val signs in Tim's presence? No: by link too; here her steps run as the function would
  perform pg_temp.rb_prep(g2); r := pg_temp.rb_finish(g2);
  out := out || 'round 2 complete=' || (r->>'complete') || '; ';
  begin perform pg_temp.rb_lock(g2, '{}'); out := out || 'LOCKED WITHOUT THE CORE''S CHECK; '; exception when others then out := out || 'check needed: ' || sqlerrm || '; '; end;
  r := pg_temp.rb_lock(g2, '{"lifted":[{"ink":"x"}],"outstanding":[{"what":"change"},{"what":"change"}]}');
  out := out || 'round 2 locked: number=' || (r->>'number') || ' round=' || (r->>'round') || ' changes=' || (select changes from public.offer_rounds where id = (r->>'id')::uuid) || ' offer=' || (select status from public.property_offers where id = o1) || ' link now=' || coalesce((public.offer_sign_by_token(tok)).id::text, 'dead') || '; ';
  begin update public.offer_rounds set changes = 0 where offer_id = o1; out := out || 'A ROUND ALTERED; '; exception when others then out := out || 'round fixed: ' || sqlerrm || '; '; end;
  begin perform set_config('offers.fn', 'on', true); update public.offer_documents set draft_sha256 = repeat('f', 64) where id = doc1; out := out || 'A DOCUMENT''S BASE CHANGED; '; exception when others then out := out || 'document base: ' || sqlerrm || '; '; end;
  perform set_config('offers.fn', '', true);
  begin truncate public.offer_documents cascade; out := out || 'DOCUMENTS EMPTIED; '; exception when others then out := out || 'no truncate: ' || sqlerrm || '; '; end;
  begin truncate public.offer_agreements; out := out || 'AGREEMENTS EMPTIED; '; exception when others then out := out || 'no truncate agreements: ' || sqlerrm || '; '; end;

  -- 6. back to the purchasers: only with Tim's tap, and every purchaser initials both changes and signs again (no page feet again)
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, false, array[mk1], false), true); out := out || 'A CHANGE LEFT UNINITIALLED; '; exception when others then out := out || 'both changes: ' || sqlerrm || '; '; end;
  -- the setting: by default a side signs again only where its signature was lifted (here, nowhere), so no signature is needed
  execute 'reset role'; perform public.agent_offer_negotiation_setting(true); execute 'set local role authenticated';
  begin perform public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, false, array[mk1, mk2], false, false), true); out := out || 'NO SIGNATURE WITH SIGN EVERY ROUND ON; '; exception when others then out := out || 'sign every round: ' || sqlerrm || '; '; end;
  execute 'reset role'; perform public.agent_offer_negotiation_setting(false); execute 'set local role authenticated';
  r := public.agent_round_present(o1, 'in_person', pg_temp.rb_places(2, false, array[mk1, mk2], false, false), true); g3 := (r->>'id')::uuid;
  out := out || 'purchasers only initial: places=' || (select jsonb_array_length(places) from public.offer_signings where id = g3) || ' signatures=' || (select count(*) from public.offer_signings g, jsonb_array_elements(g.places) e where g.id = g3 and e->>'kind' = 'signature') || '; ';
  out := out || 'back to: ' || (r->>'side') || ' round ' || (r->>'round') || ' signers=' || (select string_agg(name, ', ' order by position) from public.offer_signers where signing_id = g3) || '; ';
  begin perform public.offer_agreement_check(o1, now(), '24 November 2026'); out := out || 'A SIGNED-IN USER RAN THE AGREEMENT CHECK; '; exception when others then out := out || 'service only: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin perform public.offer_agreement_check(o1, now(), to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY')); out := out || 'AGREED WHILE A ROUND IS OUT; '; exception when others then out := out || 'not yet: ' || sqlerrm || '; '; end;
  perform pg_temp.rb_prep(g3);
  begin perform public.agent_signing_mark((select id from public.offer_signers where signing_id = g3 and position = 1), 'strike', 1, '{"x0":10,"x1":90,"y":100}', null); out := out || 'A ROUND 1 MARK IN A COUNTER; '; exception when others then out := out || 'change tools: ' || sqlerrm || '; '; end;
  r := pg_temp.rb_finish(g3); r := pg_temp.rb_lock(g3, '{"lifted":[],"outstanding":[]}');
  out := out || 'round 3 locked: number=' || (r->>'number') || ' changes=' || (select changes from public.offer_rounds where id = (r->>'id')::uuid) || '; ';

  -- 7. the agreement: the date in full with the month name, acceptance after the last signature, then locked once
  acc := now();
  begin perform public.offer_agreement_check(o1, acc, '24/11/2026'); out := out || 'A SHORT DATE; '; exception when others then out := out || 'date words: ' || sqlerrm || '; '; end;
  begin perform public.offer_agreement_check(o1, acc, '31 February 2026'); out := out || 'NOT A REAL DAY; '; exception when others then out := out || 'real day: ' || sqlerrm || '; '; end;
  begin perform public.offer_agreement_check(o1, acc, to_char(now() + interval '10 days', 'FMDD FMMonth YYYY')); out := out || 'A FUTURE DATE; '; exception when others then out := out || 'future: ' || sqlerrm || '; '; end;
  begin perform public.offer_agreement_check(o1, now() - interval '2 hours', to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY')); out := out || 'ACCEPTED BEFORE THE LAST SIGNATURE; '; exception when others then out := out || 'accepted when: ' || sqlerrm || '; '; end;
  begin perform public.offer_agreement_check(o1, acc, to_char(public.offer_nz_today() - 1, 'FMDD FMMonth YYYY')); out := out || 'DATED BEFORE ACCEPTANCE; '; exception when others then out := out || 'before acceptance: ' || sqlerrm || '; '; end;
  execute 'set local role service_role';
  rd := public.offer_agreement_material(o1, acc, to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY'));
  out := out || 'material: round=' || (rd->>'round') || ' layers=' || jsonb_array_length(rd->'layers') || ' rounds=' || jsonb_array_length(rd->'rounds') || ' date place=' || (rd->'date_place'->>'id') || '; ';
  apath := 'properties/' || pid || '/docs/offer-agreement-' || o1 || '-' || left(asha, 12) || '.pdf';
  execute 'reset role'; insert into storage.objects (bucket_id, name, metadata) values ('property-files', apath, '{"size": 6000, "mimetype": "application/pdf"}'); execute 'set local role service_role';
  begin perform public.offer_agreement_lock(o1, (rd->>'round_id')::uuid, apath, asha, 6000, acc, rd->>'date_text', '{}', 'agent'); out := out || 'AGREEMENT UNCONFIRMED; '; exception when others then out := out || 'unconfirmed: ' || sqlerrm || '; '; end;
  perform public.offer_file_confirm(apath, asha, 6000, 'agent');
  begin perform public.offer_agreement_lock(o1, (rd->>'round_id')::uuid, apath, asha, 6000, acc, rd->>'date_text', jsonb_build_object('draw_version', 'nego-draw-1', 'base', jsonb_build_object('sha256', repeat('0', 64))), 'agent'); out := out || 'AGREED FROM ANOTHER ROUND; '; exception when others then out := out || 'base round: ' || sqlerrm || '; '; end;
  agr := public.offer_agreement_lock(o1, (rd->>'round_id')::uuid, apath, asha, 6000, acc, rd->>'date_text', jsonb_build_object('draw_version', 'nego-draw-1', 'base', jsonb_build_object('round', 3, 'sha256', rd->>'round_sha256')), 'agent');
  out := out || 'agreed: again existing=' || (public.offer_agreement_lock(o1, (rd->>'round_id')::uuid, apath, asha, 6000, acc, rd->>'date_text', '{}', 'agent')->>'existing') || ' doc=' || (select status from public.offer_documents where id = doc1) || ' offer=' || (select status from public.property_offers where id = o1) || ' date=' || (select date_text from public.offer_agreements where offer_id = o1) || '; ';
  execute 'reset role';
  out := out || 'terms: price=' || (select terms->>'price' from public.offer_agreements where offer_id = o1) || ' changes=' || (select jsonb_array_length(terms->'changes') from public.offer_agreements where offer_id = o1) || ' typed=' || (select terms->'changes'->1->>'text' from public.offer_agreements where offer_id = o1)
    || ' round sha kept=' || ((select round_sha256 from public.offer_agreements where offer_id = o1) = (rd->>'round_sha256')) || ' version=' || (select draw_version from public.offer_agreements where offer_id = o1) || '; ';
  begin update public.offer_agreements set date_text = '1 January 2026'; out := out || 'THE AGREEMENT ALTERED; '; exception when others then out := out || 'agreement fixed: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_correct(o1, good || '{"price":"1"}', 'Trying to change an agreed price'); out := out || 'AN AGREED OFFER CORRECTED; '; exception when others then out := out || 'correct after: ' || sqlerrm || '; '; end;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_round_present(o1, 'link', '[]', true); out := out || 'PRESENTED AFTER AGREEMENT; '; exception when others then out := out || 'after agreement: ' || sqlerrm || '; '; end;
  begin perform public.agent_negotiation_withdraw(o1, 'purchaser', now(), 'x'); out := out || 'WITHDRAWN AFTER AGREEMENT; '; exception when others then out := out || 'withdraw after: ' || sqlerrm || '; '; end;
  out := out || 'other offers untouched=' || ((select count(*) from public.property_offers where id in (o2, o3) and status = 'received') = 2) || ' stage=' || (select stage from public.properties where id = pid) || '; ';

  -- 8. a fresh copy (offer 2): Round 1, the vendors counter in Round 2, Round 3 goes back out; then Tim closes the messy document
  execute 'reset role'; perform set_config('request.jwt.claims', agent, true);
  g1 := (public.agent_signing_release(d2, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}') ->> 'id')::uuid; perform pg_temp.rb_prep(g1); perform pg_temp.rb_finish(g1); perform pg_temp.rb_lock(g1, '{}');
  g2 := (public.agent_round_present(o2, 'in_person', pg_temp.rb_places(2, true, null, true), true)->>'id')::uuid; perform pg_temp.rb_prep(g2);
  perform public.agent_round_change((select id from public.offer_signers where signing_id = g2 and position = 1), mk3, 'cross', 1, '{"x":100,"y":300,"w":120,"h":40}', null, pg_temp.rb_change_places(2, mk3, 'cross', '{"x":100,"y":300,"w":120,"h":40}'));
  perform pg_temp.rb_finish(g2); perform pg_temp.rb_lock(g2, '{"lifted":[],"outstanding":[]}');
  begin perform public.agent_round_present(o2, 'in_person', (pg_temp.rb_places(2, false, null, false)) || jsonb_build_array(jsonb_build_object('id', 'chg:' || mk3 || ':s1', 'signer', 1, 'kind', 'initial', 'why', 'change', 'ref', mk3::text, 'page', 1, 'x', 500, 'y', 700, 'w', 26, 'h', 13), jsonb_build_object('id', 'chg:' || mk3 || ':s2', 'signer', 2, 'kind', 'initial', 'why', 'change', 'ref', mk3::text, 'page', 1, 'x', 228, 'y', 284, 'w', 26, 'h', 13)), true); out := out || 'PRESENTED WITH INITIALS FAR FROM THE CHANGE; '; exception when others then out := out || 'present beside: ' || sqlerrm || '; '; end;
  g3 := (public.agent_round_present(o2, 'in_person', pg_temp.rb_places(2, false, array[mk3], false, false), true)->>'id')::uuid; perform pg_temp.rb_prep(g3);
  perform public.agent_round_change((select id from public.offer_signers where signing_id = g3 and position = 1), mk4, 'strike', 1, '{"x0":100,"x1":180,"y":250}', null, pg_temp.rb_change_places(2, mk4, 'strike', '{"x0":100,"x1":180,"y":250}'));
  perform pg_temp.rb_finish(g3); perform pg_temp.rb_lock(g3, '{"lifted":[],"outstanding":[]}');
  -- item 5: the vendors' later round is the same people as their Round 2, in the same order; if the owners have changed, a fresh copy
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 3, 'New Owner', 'new@example.com', 'owner') returning id into x;
  begin perform public.agent_round_present(o2, 'link', pg_temp.rb_places(2, false, array[mk4], true, false), true); out := out || 'PRESENTED TO CHANGED OWNERS; '; exception when others then out := out || 'owners changed: ' || sqlerrm || '; '; end;
  update public.property_people set role = 'former' where id = x::uuid;
  update public.property_people set position = 3 - position where property_id = pid and role = 'owner';   -- Val first now, Vera second
  gx := (public.agent_round_present(o2, 'link', pg_temp.rb_places(2, false, array[mk4], true, false), true)->>'id')::uuid;
  out := out || 'round 4 signers (owners reordered)=' || (select string_agg(position || ':' || name, ',' order by position) from public.offer_signers where signing_id = gx) || '; ';
  r := public.offer_sign_issue(gx, 'agent'); tok := r->'links'->0->>'token';
  begin perform public.agent_document_close(o2, ''); out := out || 'CLOSED WITHOUT A REASON; '; exception when others then out := out || 'reason: ' || sqlerrm || '; '; end;
  r := public.agent_document_close(o2, 'Too many changes to read. Starting a clean copy at the terms agreed so far');
  out := out || 'closed: status=' || (select status from public.offer_signings where id = gx) || ' rounds=' || (r->>'rounds') || ' stopped=' || (r->>'stopped') || ' link now=' || coalesce((public.offer_sign_by_token(tok)).id::text, 'dead') || ' open says=' || (public.offer_sign_open(tok, 'n', 'ua')->>'ok') || '; ';
  begin perform public.agent_signing_release(d2, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}'); out := out || 'THE CLOSED DOCUMENT''S DRAFT RELEASED; '; exception when others then out := out || 'old draft: ' || sqlerrm || '; '; end;
  begin perform public.agent_round_present(o2, 'link', '[]', true); out := out || 'PRESENTED A CLOSED DOCUMENT; '; exception when others then out := out || 'closed present: ' || sqlerrm || '; '; end;
  -- Tim corrects the offer to the terms as they stand and re-drafts (019); Round 1 of Document 2
  perform public.agent_offer_correct(o2, good || '{"price":"670000"}', 'Price as agreed in the negotiation so far');
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
    values (o2, pid, 2, bl, repeat('ab', 32), m, (select details from public.property_offers where id = o2), '[]', '[]', 'properties/' || pid || '/docs/offer-draft-' || o2 || '-2.pdf', repeat('d7', 32), 100, 'test', '{"term_last": 22}') returning id into d2b;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d2b, repeat('d7', 32), 'test');
  g1 := (public.agent_signing_release(d2b, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}') ->> 'id')::uuid; perform pg_temp.rb_prep(g1); perform pg_temp.rb_finish(g1); r := pg_temp.rb_lock(g1, '{}');
  out := out || 'fresh copy: number=' || (r->>'number') || ' document=' || (r->>'document') || ' docs=' || (select string_agg(number || ':' || status, ',' order by number) from public.offer_documents where offer_id = o2) || ' history rounds=' || (select count(*) from public.offer_rounds where offer_id = o2) || '; ';

  -- 9. withdrawal (offer 3): the vendors withdraw while their round is out by link; it stops and the link dies
  g1 := (public.agent_signing_release(d3, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}') ->> 'id')::uuid; perform pg_temp.rb_prep(g1); perform pg_temp.rb_finish(g1); perform pg_temp.rb_lock(g1, '{}');
  -- Tim's switch: the default follows his setting (now off); off, a change from the link is refused; on, allowed (above)
  perform public.agent_offer_link_changes_default(false);
  g2 := (public.agent_round_present(o3, 'link', pg_temp.rb_places(2, true, null, true), true)->>'id')::uuid; r := public.offer_sign_issue(g2, 'agent'); tok := r->'links'->0->>'token';
  code := public.offer_sign_code(tok, 'n3')->>'code'; ses := public.offer_sign_verify(tok, code, 'n3', 'ua')->>'session'; perform public.offer_sign_consent(tok, ses, 'n3', 'ua');
  out := out || 'default off: link_changes=' || (select link_changes from public.offer_signings where id = g2) || ' state says=' || (public.offer_sign_state(tok, ses)->'signing'->>'link_changes') || '; ';
  begin perform public.offer_sign_change(tok, ses, 'n3', mk4, 'strike', 1, '{"x0":100,"x1":180,"y":200}', null, pg_temp.rb_change_places(2, mk4, 'strike', '{"x0":100,"x1":180,"y":200}')); out := out || 'A LINK CHANGE WITH THE SWITCH OFF; '; exception when others then out := out || 'switch off: ' || sqlerrm || '; '; end;
  begin perform public.agent_negotiation_withdraw(o3, 'them', now(), null); out := out || 'WITHDRAWN BY NOBODY; '; exception when others then out := out || 'who: ' || sqlerrm || '; '; end;
  r := public.agent_negotiation_withdraw(o3, 'vendor', now() - interval '1 minute', 'Vera rang: they are taking it off the market');
  out := out || 'withdrawn: stopped=' || (r->>'stopped') || ' signing=' || (select status from public.offer_signings where id = g2) || ' link=' || coalesce((public.offer_sign_by_token(tok)).id::text, 'dead') || ' offer=' || (select status from public.property_offers where id = o3) || ' event side=' || (select detail->>'side' from public.offer_events where offer_id = o3 and kind = 'withdrawn')
    || ' doc=' || (select status from public.offer_documents where offer_id = o3) || ' says=' || (select public.offer_sign_current(g) from public.offer_signings g where g.id = g2) || '; ';
  perform public.agent_offer_status(o3, 'received', now(), 'They changed their minds');
  begin perform public.agent_round_present(o3, 'link', pg_temp.rb_places(2, true, null, true), true); out := out || 'PRESENTED ON THE OLD DOCUMENT AFTER A WITHDRAWAL; '; exception when others then out := out || 'back to received: ' || sqlerrm || '; '; end;
  -- phase 1's own withdrawal (agent_offer_status) stops a round in progress too
  perform public.agent_offer_status(o2, 'withdrawn', now(), 'Purchasers withdrew by phone');
  out := out || 'offer 2 open signings=' || (select count(*) from public.offer_signings where offer_id = o2 and status in ('ready', 'signing', 'held', 'complete')) || '; ';

  -- item 11: a map with no date place: no agreement until the places are put right
  g1 := (public.agent_signing_release(d4, 'in_person', sizes, pg_temp.rb_places(2, true, null, false), '{}') ->> 'id')::uuid; perform pg_temp.rb_prep(g1); perform pg_temp.rb_finish(g1); perform pg_temp.rb_lock(g1, '{}');
  -- an in-person change in a round whose link switch is off: allowed (the switch is only about links); tried, then undone
  begin g4 := (public.agent_round_present(o4, 'in_person', pg_temp.rb_places(2, true, null, true), true, null, false)->>'id')::uuid; perform pg_temp.rb_prep(g4);
    r := public.agent_round_change((select id from public.offer_signers where signing_id = g4 and position = 1), '11111111-aaaa-4aaa-8aaa-000000000005', 'strike', 1, '{"x0":100,"x1":180,"y":200}', null, pg_temp.rb_change_places(2, '11111111-aaaa-4aaa-8aaa-000000000005', 'strike', '{"x0":100,"x1":180,"y":200}'));
    raise exception 'saved=% with the link switch off=%', (r->>'id') = '11111111-aaaa-4aaa-8aaa-000000000005', (select link_changes from public.offer_signings where id = g4) = false;
  exception when others then out := out || 'in-person change: ' || sqlerrm || '; '; end;
  g4 := (public.agent_round_present(o4, 'in_person', pg_temp.rb_places(2, true, null, true), true, null, true)->>'id')::uuid;
  out := out || 'switched on for this round despite the default=' || (select link_changes from public.offer_signings where id = g4) || '; '; perform pg_temp.rb_prep(g4); perform pg_temp.rb_finish(g4); perform pg_temp.rb_lock(g4, '{"lifted":[],"outstanding":[]}');
  begin perform public.offer_agreement_check(o4, now(), to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY')); out := out || 'AGREED WITH NO DATE PLACE; '; exception when others then out := out || 'no date place: ' || sqlerrm || '; '; end;

  -- 9b. the agreed copy's emails (offer 1 is agreed): one per side, each to that side and its lawyer, the agreed copy attached
  declare agp text; ags text; att jsonb; ma uuid;
  begin
    perform set_config('request.jwt.claims', agent, true);
    select path, sha256 into agp, ags from public.offer_agreements where offer_id = o1; att := jsonb_build_object('path', agp, 'sha256', ags, 'name', 'Agreement.pdf');
    ma := public.agent_mail_draft_add(o1, 'agreed_purchasers', null, array['ana@example.com', 'bo@example.com'], array['pat@law.example'], 'Congratulations!', 'Dear Ana and Bo, the vendors'' lawyer is ...', att);
    out := out || 'agreed purchasers draft=' || (select status || ' to=' || array_length(to_addr, 1) || ' cc=' || cc_addr[1] from public.offer_mail_drafts where id = ma) || '; ';
    begin perform public.agent_mail_draft_add(o1, 'agreed_purchasers', null, array['ana@example.com'], array['rb-nego-vendor@example.com'], 's', 'b', att); out := out || 'A VENDOR COPIED ON THE PURCHASERS'' EMAIL; '; exception when others then out := out || 'vendor on purchasers'': ' || left(sqlerrm, 60) || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'agreed_purchasers', null, array['ana@example.com'], '{}', 's', 'Vera is on 027 444 5555', att); out := out || 'A VENDOR''S PHONE TO THE PURCHASERS; '; exception when others then out := out || 'vendor phone to purchasers: ' || left(sqlerrm, 60) || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'agreed_vendors', null, array['rb-nego-vendor@example.com'], '{}', 's', 'Ana is ana@example.com', att); out := out || 'A PURCHASER''S EMAIL TO THE VENDORS; '; exception when others then out := out || 'purchaser email to vendors: ' || left(sqlerrm, 60) || '; '; end;
    begin perform public.agent_mail_draft_add(o1, 'agreed_vendors', null, array['rb-nego-vendor@example.com'], '{}', 's', 'b', jsonb_build_object('path', 'other.pdf', 'sha256', ags, 'name', 'Agreement.pdf')); out := out || 'ANOTHER FILE ATTACHED; '; exception when others then out := out || 'attachment: ' || left(sqlerrm, 40) || '; '; end;
    ma := public.agent_mail_draft_add(o1, 'agreed_vendors', null, array['rb-nego-vendor@example.com', 'val@example.com'], '{}', 'Congratulations!', 'Hello Vera and Val, the purchasers'' lawyer is Pat Lawyer, Law Ltd, pat@law.example, 03 477 0000.', att);
    out := out || 'agreed vendors draft=' || (select status from public.offer_mail_drafts where id = ma) || ' (the purchasers'' lawyer may be named); ';
  end;
  -- 10. the timelines still check out, every round's event carrying the one before
  out := out || 'chains ok=' || ((public.offer_chain_verify(o1::text)->>'ok')::boolean and (public.offer_chain_verify(o2::text)->>'ok')::boolean and (public.offer_chain_verify(o3::text)->>'ok')::boolean) || ' agreement chain last=' || ((select chain_last from public.offer_agreements where offer_id = o1) = (select hash from public.offer_events where offer_id = o1 order by seq desc limit 1)) || '; ';
  raise exception 'ROLLBACK %', out;
end $t$;
