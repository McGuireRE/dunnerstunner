// Race test for migration 026, on a LOCAL PostgreSQL stand-in only (never the live project): a write straight to the undo or redraw
// tables arriving while Round 1 is being locked. Makes a scratch database from a template that already has 025 applied (pg-standin, 010,
// 016 part A, 018, 019, 021 to 025), applies 026, sets up a Round 1 that everyone has signed (complete), then:
//   1. the edge function's lock (offer_round_lock: the offer FOR UPDATE, then the signing) holds its locks and pauses; 0.4 s in, the
//      service role writes an undo row for one of that round's taps, and another connection a cleared drawing. Both wait for the lock
//      (guard_offer_sign_open_work: the offer FOR KEY SHARE, then the signing FOR SHARE), and are then refused as sealed. Neither
//      deadlocks, and the sealed round keeps every tap.
//   2. at the same moment Tim starts the round again (agent_signing_revert_round): it waits for the lock, and is then refused (sealed).
//   3. a place tapped again (a redo row) by a signer at the same moment as that signer's undo, finish or change, with the real
//      functions, at least 40 pairs of each (Round 2, twelve vendors in person): no deadlock (offer, then signing, then signer everywhere).
// Any other error, a deadlock above all, fails the test. The scratch database is dropped afterwards.
// Run: RACE_TEMPLATE=t25 PGHOST=/tmp/pg26 PGPORT=5499 PGUSER=postgres node onboarding/tests/offer-undo-race.js
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const T = process.env.RACE_TEMPLATE || 't25', DB = 'p26race_' + process.pid;
const psql = (sql) => new Promise((res) => { const p = spawn('psql', ['-d', DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-']); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => res({ c, o: o.trim(), e: e.trim() })); p.stdin.end(sql); });
const errs = [], out = {}; const ok = (c, m) => { if (!c) errs.push(m); };
const AGENT = `select set_config('request.jwt.claims', json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text, false);`;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  execFileSync('createdb', ['-T', T, DB]);
  try {
    const mig = await psql(fs.readFileSync(path.join(__dirname, '..', 'migrations', '026_offer_undo_revert_hold.sql'), 'utf8'));
    if (mig.c) throw new Error('026 did not apply: ' + mig.e);
    const setup = await psql(`${AGENT}
      create table public.rc (k text primary key, v text);
      do $s$ declare pid uuid; o uuid; bl uuid; m uuid; d uuid; g uuid; s public.offer_signers; p text; x uuid; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30); pl jsonb := '[]';
      begin
        insert into public.properties (address, stage) values ('Race 26 Street', 'live') returning id into pid;
        o := public.agent_offer_add(pid, jsonb_build_object('email', 'b@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000', 'settlement', jsonb_build_object('kind', 'relative', 'days', 15),
          'conditions', '[]'::jsonb, 'kiwisaver', false, 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Race', 'email', 'ana@example.com', 'phone', '021 111 2222')), 'related', false, 'privacy', true,
          'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat', 'email', 'pat@law.example', 'phone', '03 477 0000')));
        insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'race-blank') returning id into x;
        insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x, repeat('ef', 32), 10, 'Blank.pdf', 1, '[[595,842]]', 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
        insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[]', true, 'test') returning id into m;
        insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
          values (o, pid, 1, bl, repeat('ef', 32), m, (select details from public.property_offers where id = o), '[]', '[]', 'race-draft.pdf', repeat('d1', 32), 100, 'test', '{"term_last": 22}') returning id into d;
        insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d, repeat('d1', 32), 'test');
        pl := jsonb_build_array(jsonb_build_object('id', 'foot:p1:s1', 'signer', 1, 'kind', 'initial', 'why', 'foot', 'ref', 'p1', 'page', 1, 'x', 470, 'y', 5, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'block:sig1:s1', 'signer', 1, 'kind', 'signature', 'why', 'block', 'ref', 'sig1', 'page', 1, 'x', 40, 'y', 460, 'w', 150, 'h', 22));
        g := (public.agent_signing_release(d, 'in_person', '[[595,842]]', pl, '{}')->>'id')::uuid;
        perform public.agent_signing_start(g);
        select * into s from public.offer_signers where signing_id = g;
        perform public.offer_sign_do_consent(s.id, 'ua', null); perform public.offer_sign_do_receipt(s.id, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); perform public.offer_sign_do_marks(s.id, png, png);
        for p in select public.offer_sign_required(g, 1) loop perform public.offer_sign_do_tap(s.id, p); end loop;
        perform public.offer_sign_do_finish(s.id, 'ua', null, 'passport', 'Tim');
        insert into public.rc values ('g', g), ('s', s.id), ('pid', pid), ('o', o);
      end $s$;
      create function public.rx_lock(g uuid) returns jsonb language plpgsql as $b$
        declare mt jsonb := public.offer_round_material(g); sha text := encode(extensions.digest(g::text || clock_timestamp()::text, 'sha256'), 'hex'); path text;
        begin path := 'properties/' || (mt->>'property_id') || '/docs/offer-round-' || (mt->>'offer_id') || '-1-' || left(sha, 12) || '.pdf';
          insert into storage.objects (bucket_id, name, metadata) values ('property-files', path, '{"size": 5000, "mimetype": "application/pdf"}');
          perform public.offer_file_confirm(path, sha, 5000, 'test');
          return public.offer_round_lock(g, path, sha, 5000, jsonb_build_object('signers', '[]'::jsonb), 'test'); end $b$;
      select status from public.offer_signings where id = (select v::uuid from public.rc where k = 'g');`);
    if (setup.c) throw new Error('set-up failed: ' + setup.e);
    out.setup = setup.o.split('\n').pop(); ok(out.setup === 'complete', 'set-up leaves Round 1 complete: ' + out.setup);
    const v = async k => (await psql(`select v from public.rc where k = '${k}'`)).o;
    const g = await v('g'), s = await v('s');
    const taps0 = (await psql(`select count(*) from public.offer_sign_taps_live where signing_id = '${g}'`)).o;
    // 1. the lock holds its locks and pauses; the direct writes arrive 0.4 s in
    const t0 = Date.now(), at = () => Date.now() - t0;
    const lock = psql(`begin; select public.rx_lock('${g}')->>'number'; select pg_sleep(1.5); commit;`).then(r => Object.assign(r, { ms: at() }));
    await wait(400);
    const undo = psql(`set role service_role; insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) select '${g}', '${s}', min(id), 'round', 'race' from public.offer_sign_taps where signing_id = '${g}';`).then(r => Object.assign(r, { ms: at() }));
    const redraw = psql(`set role service_role; insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values ('${g}', '${s}', null, null, 'race');`).then(r => Object.assign(r, { ms: at() }));
    const rev = psql(`${AGENT} select public.agent_signing_revert_round('${g}', 'Start again');`).then(r => Object.assign(r, { ms: at() }));
    const [L, U, R, V] = await Promise.all([lock, undo, redraw, rev]);
    out.revert = { c: V.c, e: V.e.split('\n')[0], ms: V.ms };
    ok(V.c !== 0 && /sealed or stopped/.test(V.e) && V.ms >= 1400, "Tim's start-again waited for the lock and was then refused: " + JSON.stringify(out.revert));
    out.lock = { c: L.c, o: L.o, ms: L.ms }; out.undo = { c: U.c, e: U.e.split('\n')[0], ms: U.ms }; out.redraw = { c: R.c, e: R.e.split('\n')[0], ms: R.ms };
    ok(L.c === 0 && /^1$/m.test(L.o), 'the round is locked: ' + JSON.stringify(out.lock));
    ok(U.c !== 0 && /sealed or stopped/.test(U.e) && U.ms >= 1400, 'the undo waited for the lock and was then refused as sealed: ' + JSON.stringify(out.undo));
    ok(R.c !== 0 && /sealed or stopped/.test(R.e) && R.ms >= 1400, 'the cleared drawing waited and was then refused as sealed: ' + JSON.stringify(out.redraw));
    ok(![U, R, L, V].some(x => /deadlock/i.test(x.e || '')), 'no deadlock');
    const taps1 = (await psql(`select count(*) from public.offer_sign_taps_live where signing_id = '${g}'`)).o, rows = (await psql(`select count(*) from public.offer_sign_undos where signing_id = '${g}'`)).o + '/' + (await psql(`select count(*) from public.offer_sign_redraws where signing_id = '${g}'`)).o;
    out.after = { taps0, taps1, rows }; ok(taps0 === taps1 && rows === '0/0', 'the sealed round keeps every tap, and nothing was written: ' + JSON.stringify(out.after));
    // 3. the same signer's steps at the same moment, with the real functions, many times: a place tapped again (a redo row, whose guard
    //    reads the signing) against that signer's undo, finish or change. One lock order everywhere (the offer, then the signing, then
    //    the signer): no deadlock. Round 2 to twelve vendors in person, so each pairing has its own signers (the hourly caps stay clear).
    const r2 = await psql(`${AGENT}
      do $s$ declare pid uuid := (select v::uuid from public.rc where k = 'pid'); o uuid := (select v::uuid from public.rc where k = 'o'); g2 uuid; pl jsonb := '[]'; k int; s public.offer_signers; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
      begin
        insert into public.property_people (property_id, position, legal_name, email, phone, role) select pid, q, 'Vendor ' || q, 'v' || q || '@example.com', '', 'owner' from generate_series(1, 12) q;
        for k in 1..12 loop pl := pl || jsonb_build_array(jsonb_build_object('id', 'foot:p1:s' || k, 'signer', k, 'kind', 'initial', 'why', 'foot', 'ref', 'p1', 'page', 1, 'x', 20 + k * 40, 'y', 5, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'block:vsig' || k || ':s' || k, 'signer', k, 'kind', 'signature', 'why', 'block', 'ref', 'vsig' || k, 'page', 1, 'x', 330, 'y', 40 + k * 30, 'w', 150, 'h', 22)); end loop;
        g2 := (public.agent_round_present(o, 'in_person', pl, true)->>'id')::uuid;
        perform public.agent_signing_start(g2);
        for s in select * from public.offer_signers where signing_id = g2 order by position loop
          perform public.offer_sign_do_consent(s.id, 'ua', null); perform public.offer_sign_do_receipt(s.id, 'chattels', null, null, null, null); perform public.offer_sign_do_marks(s.id, png, png); end loop;
        insert into public.rc values ('g2', g2);
      end $s$;
      create function public.rx_cp(g uuid, mk uuid, geo jsonb) returns jsonb language sql as $b$
        select jsonb_agg(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1,
          'x', (public.offer_change_rect('insert', geo)->>'x')::numeric + (public.offer_change_rect('insert', geo)->>'w')::numeric + 4, 'y', (public.offer_change_rect('insert', geo)->>'y')::numeric, 'w', 26, 'h', 13))
        from generate_series(1, (select count(*)::int from public.offer_signers where signing_id = g and void_at is null)) s $b$;
      select 'ok';`);
    if (r2.c) throw new Error('Round 2 set-up failed: ' + r2.e);
    const g2 = await v('g2'), vid = async n => (await psql(`select id from public.offer_signers where signing_id = '${g2}' and position = ${n}`)).o;
    const one = async sql => { const r = await psql(sql); if (r.c) throw new Error(r.e); return r.o; };
    const tap = (id, pl) => `select public.offer_sign_do_tap('${id}', '${pl}');`, undoQ = (id, sc) => `select public.offer_sign_do_undo('${id}', '${sc || 'last'}', false, 'race');`;
    const pairs = { undo: 0, finish: 0, change: 0 }, dl = { undo: 0, finish: 0, change: 0 }, other = [];
    const note = (kind, rs, okRe) => { rs.forEach(r => { if (/deadlock/i.test(r.e)) dl[kind]++; else if (r.c && !okRe.test(r.e)) other.push(kind + ': ' + r.e.split('\n')[0]); }); pairs[kind]++; };
    // a place tapped again against the same signer's undo (vendors 1 to 4, 12 each)
    for (let n = 1; n <= 4; n++) { const id = await vid(n), pl = 'foot:p1:s' + n;
      for (let k = 0; k < 12; k++) { await one(tap(id, pl)); await one(undoQ(id));
        note('undo', await Promise.all([psql(tap(id, pl)), psql(undoQ(id))]), /nothing of yours to undo/); } }
    // a place tapped again against the same signer's finish (vendors 5 to 8, 10 each); a finished vendor is opened again by Tim
    for (let n = 5; n <= 8; n++) { const id = await vid(n), a = 'foot:p1:s' + n, b = 'block:vsig' + n + ':s' + n;
      for (let k = 0; k < 10; k++) {
        if ((await one(`select finished_at is not null from public.offer_signers where id = '${id}'`)) === 't') await one(`${AGENT} select public.agent_signing_revert_round('${g2}', 'race: open again');`);
        if ((await one(`select count(*) from public.offer_sign_taps_live where signer_id = '${id}'`)) !== '0') await one(undoQ(id, 'turn'));
        await one(tap(id, b));
        note('finish', await Promise.all([psql(tap(id, a)), psql(`select public.offer_sign_do_finish('${id}', 'ua', null, null, 'Tim');`)]), /still 1 place to do|finished signing/); } }
    // a place tapped again against the same signer's change (vendors 9 to 12, 10 each)
    for (let n = 9; n <= 12; n++) { const id = await vid(n), pl = 'foot:p1:s' + n;
      for (let k = 0; k < 10; k++) {
        if ((await one(`select count(*) from public.offer_sign_taps_live l where l.signer_id = '${id}'`)) !== '0' || (await one(`select count(*) from public.offer_sign_marks_live where signer_id = '${id}'`)) !== '0') await one(undoQ(id, 'turn'));
        await one(tap(id, pl)); await one(undoQ(id));
        const mk = require('crypto').randomUUID(), geo = JSON.stringify({ x: 100, y: 300 + (n - 9) * 40, text: 'Race ' + n + '.' + k, size: 9 });
        note('change', await Promise.all([psql(tap(id, pl)), psql(`select public.offer_sign_do_change('${id}', '${mk}', 'insert', 1, '${geo}', null, public.rx_cp('${g2}', '${mk}', '${geo}'));`)]), /^$/); } }
    out.pairs = pairs; out.deadlocks = dl; out.other = other.slice(0, 5);
    ok(pairs.undo >= 40 && pairs.finish >= 40 && pairs.change >= 40, 'at least 40 pairs of each: ' + JSON.stringify(pairs));
    ok(dl.undo === 0 && dl.finish === 0 && dl.change === 0, 'no deadlock: ' + JSON.stringify(dl));
    ok(other.length === 0, 'no other errors: ' + JSON.stringify(other.slice(0, 3)));
  } catch (e) { errs.push('crashed: ' + (e.stack || e.message)); }
  finally { try { execFileSync('dropdb', [DB]); } catch (_) { } }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})();
