-- Rollback test for migration 018 (the offer form). Run with onboarding/tests/offer-rollback.js, which puts the whole migration
-- inside the block, so one statement creates everything, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The output is the exception message: refusals read in lower case; a line in CAPITALS means something that should have been
-- refused was allowed, or a value was wrong. Roles: the agent and a vendor are simulated with request.jwt.claims and the
-- authenticated role; the edge function with service_role; a buyer's browser with anon.
-- Last run: 23 November 2026 (after the first review), on a local PostgreSQL 16 with a minimal Supabase-like setup (roles anon, authenticated, service_role;
-- auth.jwt(); pgcrypto in extensions; agents, properties, property_people; migration 010 applied first): every line as expected, no
-- CAPITALS. The run on the live project hwpwyjxhdvlqrjwzxzqz was refused at the confirmation step, so nothing ran there and it is
-- still to do before the migration is applied.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; tok text; tok2 text; oid uuid; n int; x text; d jsonb; good jsonb;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-offer-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111e1","role":"authenticated"}';
  nz date := (now() at time zone 'Pacific/Auckland')::date;
begin
  execute $mig$__MIGRATION__$mig$;
  insert into public.properties (address, stage) values ('RB 18 Offer Street, Dunedin', 'live') returning id into pid;
  insert into public.properties (address) values ('RB 19 Early Street, Dunedin') returning id into pid2;
  update public.properties set stage = 'live' where id = pid;
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Vera Vendor', 'rb-offer-vendor@example.com', 'owner');
  out := out || 'stages=' || (select stage from public.properties where id = pid) || '/' || (select stage from public.properties where id = pid2) || '; ';
  good := jsonb_build_object('email', 'Buyer@Example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '$650,000',
    'settlement', jsonb_build_object('kind', 'relative', 'days', 15), 'conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'days', 10, 'junk', 'x'), jsonb_build_object('key', 'technical', 'date', (nz + 20)::text, 'detail', 'Drainage')),
    'kiwisaver', true, 'chattels_add', '["Garden shed", ""]'::jsonb, 'chattels_exclude', '["Dining room chandelier"]'::jsonb, 'chattels_listed', '["FAKE LIST"]'::jsonb, 'gst_registered', false, 'gst_number', '123-456-789', 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Aroha Mere', 'last', 'Smith', 'email', '', 'phone', '', 'id', 'evil')), 'related', false, 'privacy', true,
    'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', '<b>Pat</b>', 'email', 'pat@law.nz', 'phone', '03 477 0000'), 'status', 'accepted', 'source', 'agent', 'evil', repeat('x', 50));

  -- 1. Tim makes the link: off by default, and only opens at a stage that takes offers
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  r := public.agent_offer_link(pid, 'get'); tok := r ->> 'token';
  out := out || 'link open=' || (r ->> 'open') || ' tokenlen=' || length(tok) || ' urlsafe=' || (tok ~ '^[A-Za-z0-9_-]{43}$') || '; ';
  begin perform public.agent_offer_link(pid2, 'open'); out := out || 'APPRAISAL STAGE OPENED; '; exception when others then out := out || 'early stage: ' || sqlerrm || '; '; end;
  r := public.agent_offer_link(pid, 'open'); out := out || 'opened=' || (r ->> 'open') || ' live=' || (r ->> 'live') || '; ';
  perform public.agent_offer_clause('electrical', 'Tim''s electrical wording');
  out := out || 'chattels set=' || public.agent_offer_chattels(pid, '["Fixed floor coverings", "  ", "Blinds", "Heat pump"]'::jsonb)::text || '; ';
  begin perform public.agent_offer_clause('finance', 'REINZ text'); out := out || 'REINZ WORDING STORED; '; exception when others then out := out || 'reinz key: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 2. what the public page learns from a token (as the edge function, service role)
  execute 'set local role service_role';
  r := public.offer_public_info(tok, '203.0.113.5');
  out := out || 'info keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(r) k) || ' address=' || (r ->> 'address') || ' chattels=' || (r -> 'chattels')::text || ' wording=' || (r -> 'wording')::text || '; ';
  out := out || 'unknown=' || public.offer_public_info('A' || repeat('b', 42), '203.0.113.5')::text || ' junk=' || public.offer_public_info('x''; drop table', '203.0.113.5')::text || '; ';

  -- 3. a good offer: only known fields kept, cleaned
  r := public.offer_public_submit(tok, good, '203.0.113.5'); oid := (r ->> 'id')::uuid;
  out := out || 'submit ok=' || (r ->> 'ok') || ' refkeys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(r) k) || '; ';
  select details into d from public.property_offers where id = oid;
  out := out || 'stored keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(d) k) || ' price=' || (d ->> 'price') || ' email=' || (d ->> 'email')
    || ' chattels=' || concat_ws(' / ', d -> 'chattels_add', d -> 'chattels_exclude', d -> 'chattels_listed') || ' gst=' || coalesce(d ->> 'gst_registered', 'null') || '/' || coalesce(d ->> 'gst_number', 'null')
    || ' purchaser=' || (d -> 'purchasers' -> 0)::text || ' conds=' || (d -> 'conditions')::text || ' lawyer=' || (d -> 'lawyer')::text || '; ';
  out := out || 'row: ' || (select concat_ws(' ', source, status, amount, kiwisaver, related_party, needs_date_help, lawyer_approval, buyer_ref, conditions, as_at = nz, submission = details, net_hash <> '203.0.113.5', length(net_hash), entered_by) from public.property_offers where id = oid) || '; ';
  out := out || 'raw ip stored anywhere=' || (exists (select 1 from public.offer_hits where net like '%203.0.113%') or exists (select 1 from public.property_offers where net_hash like '%203.0.113%')) || '; ';

  -- 4. refusals (each one a separate try: a refusal undoes its own work)
  foreach x in array array['comments', 'email', 'purchasers0', 'purchasers13', 'cond_unknown', 'cond_dup', 'cond_nodays', 'cond_past', 'privacy', 'kiwisaver', 'technical', 'sale', 'custom', 'price0', 'price_text', 'settle_far', 'notobject', 'phone_bad', 'lawyer_email', 'big', 'chattels31', 'chattel_long', 'gst_text'] loop
    d := case x
      when 'comments' then good || jsonb_build_object('comments', repeat('a', 3001))
      when 'email' then good || jsonb_build_object('email', 'not an email')
      when 'purchasers0' then good || jsonb_build_object('purchasers', '[]'::jsonb)
      when 'purchasers13' then good || jsonb_build_object('purchasers', (select jsonb_agg(jsonb_build_object('first', 'A', 'last', 'B')) from generate_series(1, 13)))
      when 'cond_unknown' then good || jsonb_build_object('conditions', '[{"key":"drop table","days":5}]'::jsonb)
      when 'cond_dup' then good || jsonb_build_object('conditions', '[{"key":"finance","days":5},{"key":"finance","days":6}]'::jsonb)
      when 'cond_nodays' then good || jsonb_build_object('conditions', '[{"key":"finance"}]'::jsonb)
      when 'cond_past' then good || jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('key', 'finance', 'date', (nz - 1)::text)))
      when 'privacy' then good || jsonb_build_object('privacy', false)
      when 'kiwisaver' then good - 'kiwisaver'
      when 'technical' then good || jsonb_build_object('conditions', '[{"key":"technical","days":5}]'::jsonb)
      when 'sale' then good || jsonb_build_object('conditions', '[{"key":"sale","days":20}]'::jsonb)
      when 'custom' then good || jsonb_build_object('conditions', '[{"key":"custom","days":20}]'::jsonb)
      when 'price0' then good || jsonb_build_object('price', '0')
      when 'price_text' then good || jsonb_build_object('price', 'lots')
      when 'settle_far' then good || jsonb_build_object('settlement', jsonb_build_object('kind', 'date', 'date', (nz + 2000)::text))
      when 'notobject' then '[1,2]'::jsonb
      when 'phone_bad' then good || jsonb_build_object('phone', 'call me maybe')
      when 'lawyer_email' then good || jsonb_build_object('lawyer', jsonb_build_object('email', 'nope'))
      when 'chattels31' then good || jsonb_build_object('chattels_add', (select jsonb_agg('item ' || i) from generate_series(1, 31) i))
      when 'chattel_long' then good || jsonb_build_object('chattels_exclude', jsonb_build_array(repeat('z', 201)))
      when 'gst_text' then good || jsonb_build_object('gst_registered', 'maybe')
      when 'big' then good || jsonb_build_object('comments', repeat('a', 2000), 'x1', repeat('b', 30000), 'x2', repeat('c', 30000)) end;
    begin perform public.offer_public_submit(tok, d, '198.51.100.' || length(x)); out := out || upper(x) || ' ACCEPTED; '; exception when others then out := out || x || ': ' || sqlerrm || '; '; end;
  end loop;
  -- the optional bits that are kept: sale of another property with its address, a custom condition, help with dates
  r := public.offer_public_submit(tok, good || jsonb_build_object('conditions', '[{"key":"sale","days":20},{"key":"custom","days":10,"request":"I need the chattels list confirmed","wording":"Subject to the purchaser approving the chattels list","ai":true},{"key":"lawyer","days":3}]'::jsonb,
    'sale_address', '1 Old Home Road', 'date_help', true, 'gst_registered', true, 'gst_number', '123-456-789', 'entity', 'Smith Family Trust', 'nominee', false), '192.0.2.77');
  select details into d from public.property_offers where id = (r ->> 'id')::uuid;
  out := out || 'extras: ' || (d ->> 'sale_address') || ' / ' || (d -> 'conditions' -> 1)::text || ' / help=' || (d ->> 'date_help') || ' lawyer=' || (d ->> 'lawyer_approval') || ' gst=' || (d ->> 'gst_registered') || '/' || (d ->> 'gst_number') || ' entity=' || (d ->> 'entity') || ' nominee=' || (d ->> 'nominee')
    || ' flag=' || (select needs_date_help from public.property_offers where id = (r ->> 'id')::uuid) || ' label=' || (select buyer_ref from public.property_offers where id = (r ->> 'id')::uuid) || '; ';
  r := public.offer_public_submit(tok, good || jsonb_build_object('conditions', '[{"key":"lim","days":10}]'::jsonb, 'sale_address', 'ignored when not selling'), '192.0.2.78');
  out := out || 'sale address dropped=' || ((select details ->> 'sale_address' from public.property_offers where id = (r ->> 'id')::uuid) is null) || '; ';

  -- 5. rate limits: 3 per network in 10 minutes, then a different network still gets through; 6 per link in 10 minutes
  n := 0; for i in 1..4 loop r := public.offer_public_submit(tok, good, '203.0.113.9'); if (r ->> 'ok')::boolean then n := n + 1; else x := r ->> 'reason'; end if; end loop;
  out := out || 'one network: ' || n || ' of 4 (then ' || x || '); ';
  -- a busy day: ten buyers on ten networks, one property, within ten minutes: every one gets through
  n := 0; for i in 1..10 loop r := public.offer_public_submit(tok, good, '198.18.0.' || i); if (r ->> 'ok')::boolean then n := n + 1; end if; end loop;
  out := out || 'ten networks: ' || n || ' of 10 (property now at ' || public.offer_hit_count('submit', null, pid, interval '10 minutes') || '); ';
  -- the property's own limit (60 in ten minutes), then the site's (1000 a day): each refusal says which
  execute 'reset role';
  insert into public.offer_hits (kind, net, property_id, at) select 'submit', 'filler', pid, now() from generate_series(1, 60 - public.offer_hit_count('submit', null, pid, interval '10 minutes'));
  execute 'set local role service_role';
  out := out || 'property cap: ' || (public.offer_public_submit(tok, good, '198.18.1.1') ->> 'reason');
  execute 'reset role'; delete from public.offer_hits where net = 'filler';
  insert into public.offer_hits (kind, net, property_id, at) select 'submit', 'filler', null, now() from generate_series(1, 1000);
  execute 'set local role service_role';
  out := out || ' site cap: ' || (public.offer_public_submit(tok, good, '198.18.1.2') ->> 'reason');
  execute 'reset role'; delete from public.offer_hits where net = 'filler'; execute 'set local role service_role';
  out := out || ' after: ' || coalesce(public.offer_public_submit(tok, good, '198.18.1.3') ->> 'reason', 'ok') || '; ';
  -- the hidden field filled: kept, flagged, the buyer told the truth (received)
  r := public.offer_public_submit(tok, good, '198.18.2.1', true);
  out := out || 'spam: ok=' || (r ->> 'ok') || ' flagged=' || (select suspected_spam from public.property_offers where id = (r ->> 'id')::uuid) || '; ';
  -- moving it out of "Possible spam": only through Tim's function, which makes it a new unread offer and records it
  oid := (r ->> 'id')::uuid; execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  perform public.agent_offer_read(oid);
  begin update public.property_offers set suspected_spam = false where id = oid; out := out || 'SPAM FLAG CLEARED DIRECTLY; '; exception when others then out := out || 'direct unspam: ' || sqlerrm || '; '; end;
  perform public.agent_offer_not_spam(oid);
  out := out || 'not spam: ' || (select concat_ws(' ', suspected_spam, read_at is null) from public.property_offers where id = oid) || ' event=' || (select count(*) from public.offer_events where offer_id = oid and kind = 'not_spam') || '; ';
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_offer_not_spam(oid); out := out || 'VENDOR UNSPAMMED; '; exception when others then out := out || 'vendor unspam: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role service_role';

  -- 6. switched off, then a new token: the old one stops at once
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  perform public.agent_offer_link(pid, 'close');
  execute 'reset role'; execute 'set local role service_role';
  out := out || 'closed: info=' || public.offer_public_info(tok, '192.0.2.1')::text || ' submit=' || (public.offer_public_submit(tok, good, '192.0.2.1') ->> 'reason') || ' ai=' || (public.offer_public_ai_claim(tok, '192.0.2.1') ->> 'reason') || '; ';
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  perform public.agent_offer_link(pid, 'open'); tok2 := public.agent_offer_link(pid, 'regenerate') ->> 'token';
  execute 'reset role'; execute 'set local role service_role';
  out := out || 'regenerated: new differs=' || (tok2 <> tok) || ' old info=' || public.offer_public_info(tok, '192.0.2.2')::text || ' new ok=' || (public.offer_public_info(tok2, '192.0.2.2') ->> 'ok') || '; ';
  -- the property sold: offers stop without touching the link
  execute 'reset role'; update public.properties set stage = 'sold' where id = pid; execute 'set local role service_role';
  out := out || 'sold: ' || public.offer_public_info(tok2, '192.0.2.3')::text || '; ';
  execute 'reset role'; update public.properties set stage = 'live' where id = pid; execute 'set local role service_role';

  -- 7. AI help: 5 an hour per network, and the daily cap
  n := 0; for i in 1..6 loop r := public.offer_public_ai_claim(tok2, '192.0.2.50'); if (r ->> 'ok')::boolean then n := n + 1; else x := r ->> 'reason'; end if; end loop;
  out := out || 'ai one network: ' || n || ' of 6 (then ' || x || ')';
  execute 'reset role'; update public.offer_settings set ai_daily_cap = 0; execute 'set local role service_role';
  out := out || ' cap=' || (public.offer_public_ai_claim(tok2, '192.0.2.51') ->> 'reason') || '; ';
  execute 'reset role'; update public.offer_settings set ai_daily_cap = 40; execute 'set local role service_role';
  -- 8. a network trying many tokens is stopped, even with a good one
  for i in 1..30 loop perform public.offer_public_info('Z' || lpad(i::text, 42, 'q'), '192.0.2.99'); end loop;
  for i in 1..5 loop perform public.offer_public_info('Y' || lpad(i::text, 42, 'q'), '192.0.2.99'); end loop;
  out := out || 'guessing: bad recorded=' || public.offer_hit_count('bad', public.offer_net('192.0.2.99'), null, interval '1 hour') || ' good link from the same network ok=' || (public.offer_public_info(tok2, '192.0.2.99') ->> 'ok') || '; ';

  -- 9. the record can't be changed directly; Tim's functions keep a trail
  begin update public.property_offers set submission = '{}'::jsonb where id = oid; out := out || 'SUBMISSION CHANGED; '; exception when others then out := out || 'submission: ' || sqlerrm || '; '; end;
  begin delete from public.property_offers where id = oid; out := out || 'DELETED; '; exception when others then out := out || 'delete: ' || sqlerrm || '; '; end;
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin update public.property_offers set amount = 1, details = '{}'::jsonb where id = oid; out := out || 'DIRECT EDIT; '; exception when others then out := out || 'direct edit: ' || sqlerrm || '; '; end;
  begin insert into public.property_offers (property_id, source, submission) values (pid, 'buyer', '{}'); out := out || 'DIRECT FORM INSERT; '; exception when others then out := out || 'direct insert: ' || sqlerrm || '; '; end;
  insert into public.property_offers (property_id, buyer_ref, amount) values (pid, 'manual row', 5) returning id into oid; out := out || 'manual rows still fine; ';
  update public.property_offers set amount = 6, notes = 'ok' where id = oid; out := out || 'manual row edited; ';
  begin update public.property_offers set submission = '{"x":1}' where id = oid; out := out || 'SUBMISSION ATTACHED TO MANUAL; '; exception when others then out := out || 'attach: ' || sqlerrm || '; '; end;
  begin update public.property_offers set details = '{"x":1}' where id = oid; out := out || 'DETAILS ATTACHED TO MANUAL; '; exception when others then out := out || 'attach details: ' || sqlerrm || '; '; end;
  select id into oid from public.property_offers where source = 'buyer' and property_id = pid order by received_at limit 1;
  update public.property_offers set notes = 'Called them', expires_at = now() + interval '1 day' where id = oid; out := out || 'form offer notes and expiry editable; ';
  foreach x in array array['notified_at', 'notify_error', 'read_by', 'status_by', 'lawyer_approval', 'suspected_spam'] loop
    begin execute format('update public.property_offers set %I = %s where id = %L', x, case when x like '%_at' then 'now()' when x in ('lawyer_approval', 'suspected_spam') then 'not coalesce(' || x || ', false)' else quote_literal('x') end, oid);
      out := out || upper(x) || ' CHANGED DIRECTLY; '; exception when others then out := out || x || ' locked; '; end;
  end loop;
  begin perform public.agent_offer_correct(oid, good, 'x'); out := out || 'NO NOTE OK; '; exception when others then out := out || 'note: ' || sqlerrm || '; '; end;
  perform public.agent_offer_correct(oid, good || jsonb_build_object('price', 660000, 'settlement', jsonb_build_object('kind', 'relative', 'days', 20)), 'Buyer rang: price up and 20 days');
  out := out || 'corrected: ' || (select concat_ws(' ', amount, details -> 'settlement' ->> 'days', submission ->> 'price', submission -> 'settlement' ->> 'days') from public.property_offers where id = oid)
    || ' event=' || (select concat_ws(' ', kind, detail ->> 'note', detail -> 'before' ->> 'price', detail -> 'after' ->> 'price') from public.offer_events where offer_id = oid and kind = 'corrected') || '; ';
  perform public.agent_offer_read(oid); perform public.agent_offer_read(oid);
  out := out || 'read events=' || (select count(*) from public.offer_events where offer_id = oid and kind = 'read') || ' read_at set=' || (select read_at is not null from public.property_offers where id = oid) || '; ';
  begin perform public.agent_offer_gap(oid, 'ok'); out := out || 'SHORT REASON; '; exception when others then out := out || 'gap reason: ' || sqlerrm || '; '; end;
  perform public.agent_offer_gap(oid, 'Vendor happy with a short gap');
  out := out || 'gap: ' || (select concat_ws(' ', gap_override_reason, gap_override_by is not null, gap_override_at is not null) from public.property_offers where id = oid) || '; ';
  begin perform public.agent_offer_status(oid, 'accepted', now()); out := out || 'ACCEPTED STATUS; '; exception when others then out := out || 'status: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_status(oid, 'withdrawn', now() + interval '1 day'); out := out || 'FUTURE TIME; '; exception when others then out := out || 'time: ' || sqlerrm || '; '; end;
  perform public.agent_offer_status(oid, 'withdrawn', now() - interval '1 second', 'Buyer bought elsewhere');
  out := out || 'withdrawn: ' || (select concat_ws(' ', status, status_at is not null) from public.property_offers where id = oid) || '; ';
  begin perform public.agent_offer_settings(0); out := out || 'KS 0 OK; '; exception when others then out := out || 'ks: ' || sqlerrm || '; '; end;
  perform public.agent_offer_settings(20); out := out || 'ks days=' || (select ks_warn_working_days from public.offer_settings) || '; ';
  oid := public.agent_offer_add(pid, good - 'email' || jsonb_build_object('email', ''));
  out := out || 'agent add: ' || (select concat_ws(' ', source, entered_by is not null, read_at is not null, details ->> 'email') from public.property_offers where id = oid) || '; ';
  out := out || 'agent sees offers=' || (select count(*) from public.property_offers where property_id = pid) || ' salt readable=' || has_column_privilege('authenticated', 'public.offer_settings', 'net_salt', 'select') || '; ';
  begin perform net_salt from public.offer_settings; out := out || 'SALT READ; '; exception when others then out := out || 'salt: ' || sqlerrm || '; '; end;
  begin perform public.offer_public_submit(tok2, good, '1.1.1.1'); out := out || 'AGENT USED PUBLIC FN; '; exception when others then out := out || 'agent public fn: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 10. a vendor of this very property sees nothing about offers and can do nothing
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees: property=' || (select count(*) from public.properties where id = pid) || ' offers=' || (select count(*) from public.property_offers) || ' links=' || (select count(*) from public.offer_links)
    || ' events=' || (select count(*) from public.offer_events) || ' settings=' || (select count(*) from public.offer_settings) || ' clauses=' || (select count(*) from public.offer_clauses) || '; ';
  begin perform count(*) from public.offer_hits; out := out || 'VENDOR HITS; '; exception when others then out := out || 'vendor hits: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_chattels(pid, '["x"]'); out := out || 'VENDOR CHATTELS; '; exception when others then out := out || 'vendor chattels: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_link(pid, 'get'); out := out || 'VENDOR LINK; '; exception when others then out := out || 'vendor link: ' || sqlerrm || '; '; end;
  begin perform public.agent_offer_read(oid); out := out || 'VENDOR READ; '; exception when others then out := out || 'vendor read: ' || sqlerrm || '; '; end;
  begin perform public.offer_public_info(tok2, '1.1.1.1'); out := out || 'VENDOR PUBLIC FN; '; exception when others then out := out || 'vendor public fn: ' || sqlerrm || '; '; end;
  begin update public.property_offers set notes = 'x'; get diagnostics n = row_count; out := out || 'vendor update rows=' || n || '; '; exception when others then out := out || 'vendor update: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 11. a buyer's browser (anon) gets nothing at all
  execute 'set local role anon';
  begin perform count(*) from public.property_offers; out := out || 'ANON READ OFFERS; '; exception when others then out := out || 'anon offers: ' || sqlerrm || '; '; end;
  begin perform count(*) from public.offer_links; out := out || 'ANON READ LINKS; '; exception when others then out := out || 'anon links: ' || sqlerrm || '; '; end;
  begin perform public.offer_public_submit(tok2, good, '1.1.1.1'); out := out || 'ANON SUBMIT; '; exception when others then out := out || 'anon submit: ' || sqlerrm || '; '; end;
  begin perform public.offer_public_info(tok2, '1.1.1.1'); out := out || 'ANON INFO; '; exception when others then out := out || 'anon info: ' || sqlerrm || '; '; end;
  execute 'reset role';
  out := out || 'grants: anon clean=' || has_function_privilege('anon', 'public.offer_clean(jsonb, boolean)', 'execute') || ' auth clean=' || has_function_privilege('authenticated', 'public.offer_clean(jsonb, boolean)', 'execute')
    || ' auth submit=' || has_function_privilege('authenticated', 'public.offer_public_submit(text, jsonb, text, boolean)', 'execute') || ' service submit=' || has_function_privilege('service_role', 'public.offer_public_submit(text, jsonb, text, boolean)', 'execute')
    || ' anon agent fn=' || has_function_privilege('anon', 'public.agent_offer_add(uuid, jsonb)', 'execute') || ' rls=' || (select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class where relname in ('offer_links', 'offer_settings', 'offer_clauses', 'offer_events', 'offer_hits') and relnamespace = 'public'::regnamespace)
    || ' event fixed=' || (select count(*) from pg_trigger where tgname = 'guard_offer_event') || '; ';
  begin update public.offer_events set actor = 'x' where offer_id = oid; out := out || 'EVENT CHANGED; '; exception when others then out := out || 'event: ' || sqlerrm || '; '; end;
  begin truncate public.offer_events; out := out || 'EVENTS TRUNCATED; '; exception when others then out := out || 'truncate events: ' || sqlerrm || '; '; end;
  begin truncate public.property_offers cascade; out := out || 'OFFERS TRUNCATED; '; exception when others then out := out || 'truncate offers: ' || sqlerrm || '; '; end;
  raise exception 'ROLLBACK %', out;
end $t$;
