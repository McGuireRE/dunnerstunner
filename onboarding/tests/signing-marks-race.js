// Race test for migration 029, on a LOCAL PostgreSQL stand-in only (never the live project): a signer's own mark (offer_sign_do_mark)
// at the same moment as that signer's undo, their drawing again, their finish, and the round being locked. Makes a scratch database
// from a template that already has 026 applied (pg-standin, 010, 016 part A, 018, 019, 021 to 026), applies 029, then:
//   1. Round 1 in person: "Add my initials" against the same signer's "Undo my last step", 20 pairs; and against their drawing again
//      (offer_sign_do_marks), 20 pairs. One lock order everywhere (the offer, then the signing, then the signer): no deadlock; and never
//      both an own mark standing and a drawing made after it (the round would show two drawings for one person).
//   2. Round 2 to twelve vendors in person: "Add my signature" against the same vendor's finish, 40 pairs: no deadlock, and a vendor who
//      finished first can't add a mark after.
//   3. the round being locked (offer_round_lock holds its locks and pauses) while a vendor tries to add their own initials: the mark
//      waits for the lock, and is then refused; the sealed round has no mark added.
// Any other error, a deadlock above all, fails the test. The scratch database is dropped afterwards.
// Run: RACE_TEMPLATE=t26 PGHOST=/tmp/pg29 PGPORT=5529 PGUSER=postgres node onboarding/tests/signing-marks-race.js
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const T = process.env.RACE_TEMPLATE || 't26', DB = 'p29race_' + process.pid;
const psql = (sql) => new Promise((res) => { const p = spawn('psql', ['-d', DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-']); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => res({ c, o: o.trim(), e: e.trim() })); p.stdin.end(sql); });
const errs = [], out = {}; const ok = (c, m) => { if (!c) errs.push(m); };
const AGENT = `select set_config('request.jwt.claims', json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text, false);`;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  execFileSync('createdb', ['-T', T, DB]);
  try {
    const mig = await psql(fs.readFileSync(path.join(__dirname, '..', 'migrations', '029_signing_places_marks.sql'), 'utf8'));
    if (mig.c) throw new Error('029 did not apply: ' + mig.e);
    const setup = await psql(`${AGENT}
      create table public.rc (k text primary key, v text);
      do $s$ declare pid uuid; o uuid; bl uuid; m uuid; d uuid; g uuid; s public.offer_signers; x uuid; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30); pl jsonb := '[]'; k int;
      begin
        insert into public.properties (address, stage) values ('Race 29 Street', 'live') returning id into pid;
        o := public.agent_offer_add(pid, jsonb_build_object('email', 'b@example.com', 'phone', '021 555 0100', 'seen_docs', 'yes', 'sign', 'in_person', 'price', '650000', 'settlement', jsonb_build_object('kind', 'relative', 'days', 15),
          'conditions', '[]'::jsonb, 'kiwisaver', false, 'purchasers', jsonb_build_array(jsonb_build_object('first', 'Ana', 'last', 'Race', 'email', 'ana@example.com', 'phone', '021 111 2222'), jsonb_build_object('first', 'Bo', 'last', 'Race', 'email', 'bo@example.com', 'phone', '021 333 4444')), 'related', false, 'privacy', true,
          'lawyer', jsonb_build_object('firm', 'Law Ltd', 'person', 'Pat', 'email', 'pat@law.example', 'phone', '03 477 0000')));
        insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'Blank.pdf', 'race29-blank') returning id into x;
        insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, x, repeat('ef', 32), 10, 'Blank.pdf', 1, '[[595,842]]', 'Eleventh Edition 2022 (4)', true, 'test') returning id into bl;
        insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[{"id":"chattels","key":"chattels","kind":"area","page":1,"x":20,"y":780,"w":550,"h":60}]', true, 'test') returning id into m;
        insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by, edits)
          values (o, pid, 1, bl, repeat('ef', 32), m, (select details from public.property_offers where id = o), '[]', '[]', 'race29-draft.pdf', repeat('d2', 32), 100, 'test', '{"term_last": 22}') returning id into d;
        insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d, repeat('d2', 32), 'test');
        for k in 1..2 loop pl := pl || jsonb_build_array(jsonb_build_object('id', 'foot:p1:s' || k, 'signer', k, 'kind', 'initial', 'why', 'foot', 'ref', 'p1', 'page', 1, 'x', 440 + k * 30, 'y', 5, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'filled:chattels_box:s' || k, 'signer', k, 'kind', 'initial', 'why', 'filled', 'ref', 'chattels_box', 'page', 1, 'x', 30 + k * 30, 'y', 740, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'block:sig' || k || ':s' || k, 'signer', k, 'kind', 'signature', 'why', 'block', 'ref', 'sig' || k, 'page', 1, 'x', 40, 'y', 460 - k * 40, 'w', 150, 'h', 22)); end loop;
        g := (public.agent_signing_release(d, 'in_person', '[[595,842]]', pl, '{}')->>'id')::uuid;
        perform public.agent_signing_start(g);
        for s in select * from public.offer_signers where signing_id = g order by position loop
          perform public.offer_sign_do_consent(s.id, 'ua', null); perform public.offer_sign_do_receipt(s.id, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); perform public.offer_sign_do_marks(s.id, png, png); end loop;
        insert into public.rc values ('g', g), ('pid', pid), ('o', o), ('d', d);
      end $s$;
      create function public.rx_lock(g uuid) returns jsonb language plpgsql as $b$
        declare mt jsonb := public.offer_round_material(g); sha text := encode(extensions.digest(g::text || clock_timestamp()::text, 'sha256'), 'hex'); path text;
        begin path := 'properties/' || (mt->>'property_id') || '/docs/offer-round-' || (mt->>'offer_id') || '-' || (mt->>'number') || '-' || left(sha, 12) || '.pdf';
          insert into storage.objects (bucket_id, name, metadata) values ('property-files', path, '{"size": 5000, "mimetype": "application/pdf"}');
          perform public.offer_file_confirm(path, sha, 5000, 'test');
          return public.offer_round_lock(g, path, sha, 5000, jsonb_build_object('signers', '[]'::jsonb, 'check', '{"lifted": [], "outstanding": []}'::jsonb), 'test'); end $b$;
      select status from public.offer_signings where id = (select v::uuid from public.rc where k = 'g');`);
    if (setup.c) throw new Error('set-up failed: ' + setup.e);
    out.setup = setup.o.split('\n').pop(); ok(out.setup === 'signing', 'set-up leaves Round 1 open: ' + out.setup);
    const v = async k => (await psql(`select v from public.rc where k = '${k}'`)).o;
    const one = async sql => { const r = await psql(sql); if (r.c) throw new Error(r.e); return r.o; };
    const g = await v('g'), sid = async (gg, n) => one(`select id from public.offer_signers where signing_id = '${gg}' and position = ${n}`);
    const a1 = await sid(g, 1), b2 = await sid(g, 2);   // Ana's pairs with undo, Bo's with drawing again (each under the hourly cap)
    const pngA = "'data:image/png;base64,' || repeat('iVBORw0KGgo', 30)", pngB = "'data:image/png;base64,' || repeat('R0lGODlh', 40)";
    const mark = (id, k, x, y, w, h) => `select public.offer_sign_do_mark('${id}', '${k}', 1, '{"x":${x},"y":${y},"w":${w},"h":${h}}', null, null, false);`;
    const undoQ = (id, sc) => `select public.offer_sign_do_undo('${id}', '${sc || 'last'}', false, 'race');`;
    const pairs = { undo: 0, redraw: 0, finish: 0 }, dl = { undo: 0, redraw: 0, finish: 0 }, other = []; let twoInks = 0;
    const note = (kind, rs, okRe) => { rs.forEach(r => { if (/deadlock/i.test(r.e)) dl[kind]++; else if (r.c && !okRe.test(r.e)) other.push(kind + ': ' + r.e.split('\n')[0]); }); pairs[kind]++; };
    const reset = async id => { if ((await one(`select count(*) from public.offer_sign_marks_live where signer_id = '${id}'`)) !== '0' || (await one(`select count(*) from public.offer_sign_taps_live where signer_id = '${id}'`)) !== '0') await one(undoQ(id, 'turn')); };
    // 1a. own initials against the same signer's undo of their last step
    for (let k = 0; k < 20; k++) { await reset(a1);
      note('undo', await Promise.all([psql(mark(a1, 'own_initials', 200, 300 + (k % 5) * 20, 30, 14)), psql(undoQ(a1))]), /nothing of yours to undo/); }
    // 1b. own initials against the same signer drawing again (no taps stand); afterwards, an own mark standing must carry the ink used now
    for (let k = 0; k < 20; k++) { await reset(b2);
      const ink = k % 2 ? pngA : pngB;
      note('redraw', await Promise.all([psql(mark(b2, 'own_initials', 200, 300 + (k % 5) * 20, 30, 14)), psql(`select public.offer_sign_do_marks('${b2}', ${ink}, ${ink});`)]), /kept as you first used them|Tim is checking a change/);
      const bad = await one(`select count(*) from public.offer_sign_marks_live m where m.signer_id = '${b2}' and m.kind = 'own_initials' and m.ink_png is distinct from public.offer_sign_ink('${b2}')->>'init_png'`);
      if (bad !== '0') twoInks++; }
    out.pairs1 = { undo: pairs.undo, redraw: pairs.redraw };
    ok(twoInks === 0, 'never an own mark standing with a drawing made after it: ' + twoInks);
    // seal Round 1 (both purchasers sign every place and finish), then Round 2 to twelve vendors in person
    await reset(a1); await reset(b2);
    const r2 = await psql(`${AGENT}
      do $s$ declare g uuid := (select v::uuid from public.rc where k = 'g'); pid uuid := (select v::uuid from public.rc where k = 'pid'); o uuid := (select v::uuid from public.rc where k = 'o'); s public.offer_signers; p text; g2 uuid; pl jsonb := '[]'; k int; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
      begin
        if (select status from public.offer_signings where id = g) = 'held' then raise exception 'still held'; end if;
        for s in select * from public.offer_signers where signing_id = g order by position loop for p in select public.offer_sign_required(g, s.position) loop perform public.offer_sign_do_tap(s.id, p); end loop; perform public.offer_sign_do_finish(s.id, 'ua', null, 'passport', 'Tim'); end loop;
        perform public.rx_lock(g);
        delete from public.property_people where property_id = pid;
        insert into public.property_people (property_id, position, legal_name, email, phone, role) select pid, q, 'Vendor ' || q, 'v' || q || '@example.com', '', 'owner' from generate_series(1, 12) q;
        for k in 1..12 loop pl := pl || jsonb_build_array(jsonb_build_object('id', 'foot:p1:s' || k, 'signer', k, 'kind', 'initial', 'why', 'foot', 'ref', 'p1', 'page', 1, 'x', 20 + k * 30, 'y', 22, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'filled:chattels_box:s' || k, 'signer', k, 'kind', 'initial', 'why', 'filled', 'ref', 'chattels_box', 'page', 1, 'x', 100 + k * 30, 'y', 760, 'w', 26, 'h', 13),
          jsonb_build_object('id', 'block:vsig' || k || ':s' || k, 'signer', k, 'kind', 'signature', 'why', 'block', 'ref', 'vsig' || k, 'page', 1, 'x', 400, 'y', 40 + k * 30, 'w', 150, 'h', 22)); end loop;
        g2 := (public.agent_round_present(o, 'in_person', pl, true)->>'id')::uuid;
        perform public.agent_signing_start(g2);
        for s in select * from public.offer_signers where signing_id = g2 order by position loop
          perform public.offer_sign_do_consent(s.id, 'ua', null); perform public.offer_sign_do_receipt(s.id, 'chattels', null, null, null, null); perform public.offer_sign_do_marks(s.id, png, png); end loop;
        insert into public.rc values ('g2', g2);
      end $s$; select 'ok';`);
    if (r2.c) throw new Error('Round 2 set-up failed: ' + r2.e);
    const g2 = await v('g2');
    // 2. own signature against the same vendor's finish (vendors 1 to 10, 4 each); a finished vendor is opened again by Tim
    for (let n = 1; n <= 10; n++) { const id = await sid(g2, n);
      for (let k = 0; k < 4; k++) {
        if ((await one(`select finished_at is not null from public.offer_signers where id = '${id}'`)) === 't') await one(`${AGENT} select public.agent_signing_revert_round('${g2}', 'race: open again');`);
        await reset(id);
        for (const pl of (await one(`select string_agg(x, ' ') from public.offer_sign_required('${g2}', ${n}) x`)).split(' ')) await one(`select public.offer_sign_do_tap('${id}', '${pl}');`);
        const r = await Promise.all([psql(mark(id, 'own_signature', 200 + (k % 2) * 10, 200 + n * 25, 90, 22)), psql(`select public.offer_sign_do_finish('${id}', 'ua', null, 'passport', 'Tim');`)]);
        note('finish', r, /finished signing/); } }
    out.pairs = pairs; out.deadlocks = dl; out.other = other.slice(0, 5);
    ok(pairs.undo >= 20 && pairs.redraw >= 20 && pairs.finish >= 40, 'enough pairs of each: ' + JSON.stringify(pairs));
    ok(dl.undo === 0 && dl.redraw === 0 && dl.finish === 0, 'no deadlock: ' + JSON.stringify(dl));
    ok(other.length === 0, 'no other errors: ' + JSON.stringify(other.slice(0, 3)));
    // 3. every vendor finishes; the lock holds its locks and pauses while vendor 11 tries to add their own initials
    await one(`do $s$ declare g2 uuid := (select v::uuid from public.rc where k = 'g2'); s public.offer_signers; p text;
      begin for s in select * from public.offer_signers where signing_id = g2 and finished_at is null order by position loop
        for p in select public.offer_sign_required(g2, s.position) loop perform public.offer_sign_do_tap(s.id, p); end loop; perform public.offer_sign_do_finish(s.id, 'ua', null, 'passport', 'Tim'); end loop; end $s$; select 'ok';`);
    const marks0 = await one(`select count(*) from public.offer_sign_marks where signing_id = '${g2}'`), v11 = await sid(g2, 11);
    const t0 = Date.now(), at = () => Date.now() - t0;
    const lock = psql(`begin; select public.rx_lock('${g2}')->>'number'; select pg_sleep(1.5); commit;`).then(r => Object.assign(r, { ms: at() }));
    await wait(400);
    const late = await psql(mark(v11, 'own_initials', 300, 600, 30, 14)).then(r => Object.assign(r, { ms: at() })); const L = await lock;
    out.lock = { c: L.c, ms: L.ms }; out.late = { c: late.c, e: late.e.split('\n')[0], ms: late.ms };
    ok(L.c === 0, 'the round is locked: ' + JSON.stringify(out.lock));
    ok(late.c !== 0 && !/deadlock/i.test(late.e) && late.ms >= 1400, 'a mark arriving while the round is locked waits, and is then refused: ' + JSON.stringify(out.late));
    ok((await one(`select count(*) from public.offer_sign_marks where signing_id = '${g2}'`)) === marks0, 'the sealed round has no mark added');
  } catch (e) { errs.push('crashed: ' + (e.stack || e.message)); }
  finally { try { execFileSync('dropdb', [DB]); } catch (_) { } }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})();
