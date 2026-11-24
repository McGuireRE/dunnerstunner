// Race test for migration 021, on a LOCAL PostgreSQL stand-in only (never the live project): requests arriving at the same moment on
// separate connections. Makes a scratch database from a template that already has 020 applied (pg-standin with property_people.phone
// and agreement_people.email and phone,
// 010, 016 part A, 018, 019, 020), applies 021 to it, then:
//   1. Tim taps "Present to the vendors" twice at once: exactly one Round 2 signing, both taps answered;
//   2. one vendor adds a change at the moment the other vendor finishes: never "everyone has signed" with a change someone hasn't
//      initialled (the signing is locked first by both);
//   3. the agreed copy locked twice at once: exactly one agreement;
//   4. Tim closes a document at the moment the edge function locks a round on it: either the round is locked and then the document
//      closed with it kept, or the document is closed and the round refused; never a round locked into a closed document after it closed.
// The scratch database is dropped afterwards. Run: RACE_TEMPLATE=t4 PGHOST=/tmp/p2pg PGPORT=5499 PGUSER=postgres node onboarding/tests/offer-negotiation-race.js
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const T = process.env.RACE_TEMPLATE || 't4', DB = 'p4race_' + process.pid;
const psql = (sql, db) => new Promise((res) => { const p = spawn('psql', ['-d', db || DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', sql]); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => res({ c, o: o.trim(), e: e.trim() })); });
const errs = [], out = {}; const ok = (c, m) => { if (!c) errs.push(m); };
const CLAIMS = `select set_config('request.jwt.claims', json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text, false);`;
const AGENT = `set role authenticated; select set_config('request.jwt.claims', json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text, false);`;
(async () => {
  execFileSync('createdb', ['-T', T, DB]);
  try {
    const mig = await psql(fs.readFileSync(path.join(__dirname, '..', 'migrations', '024_offer_negotiation.sql'), 'utf8'));
    if (mig.c) throw new Error('021 did not apply: ' + mig.e);
    // helpers for the scratch database only (it is dropped afterwards)
    const helpers = await psql(`
      create function public.rc_places(n int, first_ boolean, marks uuid[], v boolean) returns jsonb language plpgsql as $b$
        declare out_ jsonb := '[]'; s int; k int; mk uuid;
        begin for s in 1..n loop
          if first_ then for k in 1..3 loop out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'foot:p' || k || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'foot', 'ref', 'p' || k, 'page', k, 'x', 440 + s * 28 + case when v then 60 else 0 end, 'y', 5, 'w', 26, 'h', 13)); end loop; end if;
          out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:' || case when v then 'vsig' else 'sig' end || s || ':s' || s, 'signer', s, 'kind', 'signature', 'why', 'block', 'ref', case when v then 'vsig' else 'sig' end || s, 'page', 3, 'x', case when v then 330 else 40 end, 'y', 530 - s * 70, 'w', 150, 'h', 22));
          foreach mk in array coalesce(marks, '{}') loop out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1, 'x', 300 + s * 28, 'y', 400, 'w', 26, 'h', 13)); end loop;
        end loop; return out_; end $b$;
      create function public.rc_cp(n int, mk uuid) returns jsonb language sql as $b$ select jsonb_agg(jsonb_build_object('id', 'chg:' || mk || ':s' || s, 'signer', s, 'kind', 'initial', 'why', 'change', 'ref', mk::text, 'page', 1, 'x', 160 + s * 28, 'y', 341, 'w', 26, 'h', 13)) from generate_series(1, n) s $b$;
      create function public.rc_prep(g uuid, skip int default 0) returns void language plpgsql as $b$
        declare s public.offer_signers; gg public.offer_signings; png text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30);
        begin select * into gg from public.offer_signings where id = g; if gg.status = 'ready' and gg.method = 'in_person' then perform public.agent_signing_start(g); end if;
          for s in select * from public.offer_signers where signing_id = g and void_at is null order by position loop
            perform public.offer_sign_do_consent(s.id, 'ua', null);
            if gg.round_no = 1 then perform public.offer_sign_do_receipt(s.id, 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null); end if;
            if gg.side = 'vendor' then perform public.offer_sign_do_receipt(s.id, 'chattels', null, null, null, null); end if;
            perform public.offer_sign_do_marks(s.id, png, png); end loop; end $b$;
      create function public.rc_taps(g uuid, pos int) returns void language plpgsql as $b$ declare s uuid := (select id from public.offer_signers where signing_id = g and position = pos); p text;
        begin for p in select public.offer_sign_required(g, pos) loop perform public.offer_sign_do_tap(s, p); end loop; end $b$;
      create function public.rc_finish_all(g uuid) returns void language plpgsql as $b$ declare s public.offer_signers;
        begin for s in select * from public.offer_signers where signing_id = g and void_at is null and finished_at is null order by position loop perform public.rc_taps(g, s.position); perform public.offer_sign_do_finish(s.id, 'ua', null, 'passport', 'Tim'); end loop; end $b$;
      create function public.rc_stage(g uuid) returns jsonb language plpgsql as $b$
        declare mt jsonb := public.offer_round_material(g); sha text := encode(extensions.digest(g::text, 'sha256'), 'hex'); path text;
        begin path := 'properties/' || (mt->>'property_id') || '/docs/offer-round-' || (mt->>'offer_id') || '-' || (mt->>'number') || '-' || left(sha, 12) || '.pdf';
          insert into storage.objects (bucket_id, name, metadata) values ('property-files', path, '{"size": 5000, "mimetype": "application/pdf"}'); perform public.offer_file_confirm(path, sha, 5000, 'test');
          return jsonb_build_object('path', path, 'sha', sha); end $b$;
      create function public.rc_lock(g uuid) returns jsonb language plpgsql as $b$ declare st jsonb := public.rc_stage(g);
        begin return public.offer_round_lock(g, st->>'path', st->>'sha', 5000, '{"check":{"lifted":[],"outstanding":[]}}', 'test'); end $b$;
      create table public.rc (k text primary key, v text);`);
    if (helpers.c) throw new Error('helpers failed: ' + helpers.e);
    // four offers, each with Round 1 locked
    const setup = await psql(`do $s$ declare pid uuid; o uuid; bl uuid; m uuid; d uuid; g uuid; k int; doc uuid;
        agent text := json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text;
        good jsonb := '{"email":"b@example.com","phone":"021 555 0100","seen_docs":"yes","sign":"in_person","price":"650000","settlement":{"kind":"relative","days":15},"conditions":[],"kiwisaver":false,"related":false,"privacy":true,
          "purchasers":[{"first":"Ana","last":"Racer","email":"ana@example.com"},{"first":"Bo","last":"Racer","email":"bo@example.com"}],"lawyer":{"firm":"Law","person":"Pat"}}';
      begin
        insert into public.properties (address, stage) values ('RC Race Street', 'live') returning id into pid;
        insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Vera Racer', 'vera@example.com', 'owner'), (pid, 2, 'Val Racer', 'val@example.com', 'owner');
        insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'b.pdf', 'rc') returning id into doc;
        insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, doc, repeat('ab', 32), 10, 'b.pdf', 3, '[[595,842],[595,842],[595,842]]', 'Eleventh Edition 2022 (4)', true, 't') returning id into bl;
        insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10}]', true, 't') returning id into m;
        perform set_config('request.jwt.claims', agent, true);
        for k in 1..4 loop
          o := public.agent_offer_add(pid, good);
          insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
            values (o, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = o), '[]', '[]', 'p' || k, repeat('d' || k, 32), 100, 't') returning id into d;
          insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d, repeat('d' || k, 32), 't');
          g := (public.agent_signing_release(d, 'in_person', '[[595,842],[595,842],[595,842]]', public.rc_places(2, true, null, false), '{}') ->> 'id')::uuid;
          perform public.rc_prep(g); perform public.rc_finish_all(g); perform public.rc_lock(g);
          insert into public.rc values ('o' || k, o::text);
        end loop;
      end $s$;`);
    if (setup.c) throw new Error('set-up failed: ' + setup.e);
    const v = async k => (await psql(`select v from public.rc where k = '${k}'`)).o;
    const one = async sql => { const r = await psql(sql); if (r.c) throw new Error(r.e); return r.o.split('\n').pop(); };
    const o1 = await v('o1'), o2 = await v('o2'), o3 = await v('o3'), o4 = await v('o4');

    // 1. two presents at once
    const pres = await Promise.all([1, 2].map(() => psql(`${AGENT} select public.agent_round_present('${o1}', 'in_person', public.rc_places(2, true, null, true), true)::text`)));
    const ids = pres.map(r => JSON.parse(r.o.split('\n').pop() || '{}').id);
    out.present = { errors: pres.filter(r => r.c).map(r => r.e), ids, signings: +(await one(`select count(*) from public.offer_signings where offer_id = '${o1}' and round_no = 2`)) };
    ok(!out.present.errors.length && ids[0] === ids[1] && out.present.signings === 1, 'two presents at once: one Round 2 signing, both answered with it');

    // 2. a change and the last finish at once (offer 2): Vera has finished; Val has done every place and finishes as Vera adds a change
    const g2 = await one(`${AGENT} select public.agent_round_present('${o2}', 'in_person', public.rc_places(2, true, null, true), true)->>'id'`);
    await one(`${CLAIMS} select public.rc_prep('${g2}'); select public.rc_taps('${g2}', 1); select public.offer_sign_do_finish((select id from public.offer_signers where signing_id = '${g2}' and position = 1), 'ua', null, 'passport', 'Tim')::text; select public.rc_taps('${g2}', 2)`);
    const mk = '22222222-bbbb-4bbb-8bbb-000000000001';
    const race2 = await Promise.all([psql(`select public.offer_sign_do_change((select id from public.offer_signers where signing_id = '${g2}' and position = 1), '${mk}', 'strike', 1, '{"x0":100,"x1":180,"y":345}', null, public.rc_cp(2, '${mk}'))::text`),
      psql(`select public.offer_sign_do_finish((select id from public.offer_signers where signing_id = '${g2}' and position = 2), 'ua', null, 'passport', 'Tim')::text`)]);
    const st2 = await one(`select status || ',' || (select count(*) from public.offer_sign_marks where signing_id = '${g2}') || ',' || (select count(*) from public.offer_signers s where s.signing_id = '${g2}' and s.finished_at is not null and exists (select 1 from public.offer_sign_required('${g2}', s.position) x where x not in (select place_id from public.offer_sign_taps t where t.signer_id = s.id))) from public.offer_signings where id = '${g2}'`);
    const [status2, marks2, finishedMissing] = st2.split(',');
    out.changeFinish = { change: race2[0].c ? race2[0].e.split('\n')[0] : 'saved', finish: race2[1].c ? race2[1].e.split('\n')[0] : 'finished', status: status2, marks: +marks2, finishedWithMissing: +finishedMissing };
    ok(+finishedMissing === 0 && (status2 !== 'complete' || +marks2 === 0) && (race2[0].c || race2[1].c || status2 === 'signing'), 'a change and the last finish at once: never complete with a change someone hasn\'t initialled');

    // 3. the agreed copy locked twice at once (offer 3: vendors accept in Round 2)
    const g3 = await one(`${AGENT} select public.agent_round_present('${o3}', 'in_person', public.rc_places(2, true, null, true), true)->>'id'`);
    await one(`${CLAIMS} select public.rc_prep('${g3}'); select public.rc_finish_all('${g3}'); select public.rc_lock('${g3}')::text`);
    const day = await one(`select to_char(public.offer_nz_today(), 'FMDD FMMonth YYYY')`), rid = await one(`select id from public.offer_rounds where offer_id = '${o3}' and doc_round = 2`);
    const apath = await one(`select 'properties/' || property_id || '/docs/offer-agreement-' || id || '-' || repeat('a', 12) || '.pdf' from public.property_offers where id = '${o3}'`);
    await one(`insert into storage.objects (bucket_id, name, metadata) values ('property-files', '${apath}', '{"size": 6000, "mimetype": "application/pdf"}'); select public.offer_file_confirm('${apath}', repeat('ac', 32), 6000, 't')`);
    const acc = await one(`select now()::text`);
    const lk = await Promise.all([1, 2].map(() => psql(`select public.offer_agreement_lock('${o3}', '${rid}', '${apath}', repeat('ac', 32), 6000, '${acc}', '${day}', jsonb_build_object('draw_version', 'nego-draw-1', 'base', jsonb_build_object('sha256', (select sha256 from public.offer_rounds where id = '${rid}'))), 'agent')::text`)));
    out.agree = { errors: lk.filter(r => r.c).map(r => r.e.split('\n')[0]), existing: lk.map(r => (JSON.parse(r.o.split('\n').pop() || '{}').existing)), rows: +(await one(`select count(*) from public.offer_agreements where offer_id = '${o3}'`)), events: +(await one(`select count(*) from public.offer_events where offer_id = '${o3}' and kind = 'agreement_formed'`)) };
    ok(!out.agree.errors.length && out.agree.rows === 1 && out.agree.events === 1 && out.agree.existing.filter(Boolean).length === 1, 'the agreed copy locked twice at once: one agreement, one event');

    // 4. closing the document as a round locks on it (offer 4)
    const g4 = await one(`${AGENT} select public.agent_round_present('${o4}', 'in_person', public.rc_places(2, true, null, true), true)->>'id'`);
    await one(`${CLAIMS} select public.rc_prep('${g4}'); select public.rc_finish_all('${g4}')`);
    const stg = JSON.parse(await one(`select public.rc_stage('${g4}')::text`));
    const race4 = await Promise.all([psql(`select public.offer_round_lock('${g4}', '${stg.path}', '${stg.sha}', 5000, '{"check":{"lifted":[],"outstanding":[]}}', 'test')::text`), psql(`${AGENT} select public.agent_document_close('${o4}', 'A clean copy, at the same moment')::text`)]);
    const st4 = (await one(`select d.status || ',' || (select count(*) from public.offer_rounds r where r.document_id = d.id and r.doc_round = 2) || ',' || coalesce((select (r.locked_at <= d.closed_at)::text from public.offer_rounds r where r.document_id = d.id and r.doc_round = 2), 'none') || ',' || (select status from public.offer_signings where id = '${g4}') from public.offer_documents d where d.offer_id = '${o4}'`)).split(',');
    out.closeLock = { lock: race4[0].c ? race4[0].e.split('\n')[0] : 'locked', close: race4[1].c ? race4[1].e.split('\n')[0] : 'closed', doc: st4[0], round2: +st4[1], before: st4[2], signing: st4[3] };
    ok(!race4[1].c && st4[0] === 'closed' && ((st4[1] === '1' && st4[2] === 'true' && st4[3] === 'locked') || (st4[1] === '0' && race4[0].c && st4[3] === 'cancelled')), 'closing as a round locks: the round is locked before the close, or refused after it');
    ok((await one(`select bool_and((public.offer_chain_verify(id::text)->>'ok')::boolean) from public.property_offers`)) === 't', 'every timeline still checks out');
  } catch (e) { errs.push('crashed: ' + e.message); }
  finally { try { execFileSync('dropdb', [DB]); } catch (_) { errs.push('scratch database not dropped: ' + DB); } }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})();
