// Race test for migration 020, on a LOCAL PostgreSQL stand-in only (never the live project): requests arriving at the same moment on
// separate connections. Makes a scratch database from a template that already has 019 applied (pg-standin, 010, 016 part A, 018,
// 019), applies 020 to it, sets up two offers released for signing by link, then fires simultaneous requests:
//   1. twelve "email me a code" requests on one link at once: at most 5 codes an hour still holds (the signer's row is locked);
//   2. twelve wrong codes typed at once: the code still dies after 5 tries, and the right code then fails;
//   3. both purchasers finishing at the same moment: exactly one "everyone has signed", and both recorded as finished.
// The scratch database is dropped afterwards. Run: RACE_TEMPLATE=t3 PGHOST=/tmp/p2pg PGPORT=5499 PGUSER=postgres node onboarding/tests/offer-sign-race.js
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const T = process.env.RACE_TEMPLATE || 't3', DB = 'p3race_' + process.pid;
const psql = (sql, db) => new Promise((res) => { const p = spawn('psql', ['-d', db || DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', sql]); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => res({ c, o: o.trim(), e: e.trim() })); });
const errs = [], out = {}; const ok = (c, m) => { if (!c) errs.push(m); };
(async () => {
  execFileSync('createdb', ['-T', T, DB]);
  try {
    const mig = await psql(fs.readFileSync(path.join(__dirname, '..', 'migrations', '023_offer_signing.sql'), 'utf8'));
    if (mig.c) throw new Error('020 did not apply: ' + mig.e);
    const places = []; for (let n = 1; n <= 2; n++) { for (const pg of [1, 2, 3]) places.push({ id: `foot:p${pg}:s${n}`, signer: n, kind: 'initial', why: 'foot', ref: 'p' + pg, page: pg, x: 500 + n * 28, y: 5, w: 26, h: 13 }); places.push({ id: `block:sig${n}:s${n}`, signer: n, kind: 'signature', why: 'block', ref: 'sig' + n, page: 3, x: 40, y: 530 - n * 70, w: 150, h: 22 }); }
    const png = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(30);
    // set-up, as one script: two offers, each drafted, approved, released by link and sent
    const setup = await psql(`do $s$ declare pid uuid; o uuid; bl uuid; m uuid; d uuid; g uuid; r jsonb; k int; doc uuid;
        agent text := json_build_object('email', (select email from public.agents limit 1), 'role', 'authenticated')::text;
        good jsonb := '{"email":"b@example.com","phone":"021 555 0100","seen_docs":"yes","sign":"digital","price":"650000","settlement":{"kind":"relative","days":15},"conditions":[],"kiwisaver":false,"related":false,"privacy":true,
          "purchasers":[{"first":"Ana","last":"Racer","email":"ana@example.com"},{"first":"Bo","last":"Racer","email":"bo@example.com"}],"lawyer":{"firm":"Law","person":"Pat"}}';
      begin
        create table public.race_tokens (k int, pos int, token text);
        insert into public.properties (address, stage) values ('RB Race Street', 'live') returning id into pid;
        insert into public.property_documents (property_id, kind, name, path) values (pid, 'Other', 'b.pdf', 'rb') returning id into doc;
        insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by) values (pid, doc, repeat('ab', 32), 10, 'b.pdf', 3, '[[595,842],[595,842],[595,842]]', 'Eleventh Edition 2022 (4)', true, 't') returning id into bl;
        insert into public.offer_blank_maps (blank_id, version, places, approved, created_by) values (bl, 1, '[]', true, 't') returning id into m;
        for k in 1..2 loop
          execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
          o := public.agent_offer_add(pid, good); execute 'reset role';
          insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, placed, needs, path, sha256, size_bytes, created_by)
            values (o, pid, 1, bl, repeat('ab', 32), m, (select details from public.property_offers where id = o), '[]', '[]', 'p' || k, repeat('d' || k, 32), 100, 't') returning id into d;
          insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d, repeat('d' || k, 32), 't');
          execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
          g := (public.agent_signing_release(d, 'link', '[[595,842],[595,842],[595,842]]', '${JSON.stringify(places)}', '{}') ->> 'id')::uuid;
          execute 'reset role'; r := public.offer_sign_issue(g, 'agent');
          insert into public.race_tokens select k, (l->>'position')::int, l->>'token' from jsonb_array_elements(r->'links') l;
        end loop;
      end $s$;`);
    if (setup.c) throw new Error('set-up failed: ' + setup.e);
    const tok = async (k, pos) => (await psql(`select token from public.race_tokens where k = ${k} and pos = ${pos}`)).o;
    const t11 = await tok(1, 1), t12 = await tok(1, 2), t21 = await tok(2, 1), t22 = await tok(2, 2);
    const call = sql => psql(`set role service_role; ${sql}`);
    const one = async sql => { const r = await call(sql); if (r.c) throw new Error(r.e); return r.o.split('\n').pop(); };

    // 1. twelve code requests at once on one link (each from its own network, so only the per-signer limit is in play)
    const codes = await Promise.all(Array.from({ length: 12 }, (_, i) => call(`select public.offer_sign_code('${t21}', 'net-a-${i}')::text`)));
    const sent = codes.filter(r => /"ok": true/.test(r.o)).length, cs = +(await psql(`select codes_sent from public.offer_signers s join public.race_tokens r on s.token_hash = encode(extensions.digest(r.token, 'sha256'), 'hex') where r.k = 2 and r.pos = 1`)).o;
    out.codes = { sent, codes_sent: cs, errors: codes.filter(r => r.c).length };
    ok(sent === 5 && cs === 5 && !out.codes.errors, 'twelve code requests at once: exactly five codes, the rest refused');

    // 2. twelve wrong codes at once: the code dies after five tries
    const code = JSON.parse(await one(`select public.offer_sign_code('${t22}', 'net-b')::text`)).code;
    const wrong = code === '000000' ? '111111' : '000000';
    const tries = await Promise.all(Array.from({ length: 12 }, (_, i) => call(`select public.offer_sign_verify('${t22}', '${wrong}', 'net-c-${i}', 'ua')::text`)));
    const reasons = tries.map(r => (JSON.parse(r.o.split('\n').pop() || '{}').reason) || 'error');
    out.tries = reasons.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
    ok((out.tries.wrong || 0) === 4 && (out.tries.tries || 0) === 1 && (out.tries.no_code || 0) === 7, 'twelve wrong codes at once: four wrong, the fifth ends the code, the rest find no code');
    const late = JSON.parse(await one(`select public.offer_sign_verify('${t22}', '${code}', 'net-d', 'ua')::text`)); ok(late.ok === false && late.reason === 'no_code', 'the right code no longer works after five wrong tries');

    // 3. both purchasers of offer 1 do every place, then finish at the same moment
    const ready = async (t, pos) => { const c = JSON.parse(await one(`select public.offer_sign_code('${t}', 'net-e-${pos}')::text`)).code; const s = JSON.parse(await one(`select public.offer_sign_verify('${t}', '${c}', 'net-e-${pos}', 'ua')::text`)).session;
      await one(`select public.offer_sign_consent('${t}', '${s}', 'n', 'ua')`); await one(`select public.offer_sign_receipt('${t}', '${s}', 'sale_purchase', 'August 2022', 'rea-sale-purchase-guide-2022-en.pdf', null, null)`);
      await one(`select public.offer_sign_marks('${t}', '${s}', '${png}', '${png}')`); for (const p of places.filter(x => x.signer === pos)) await one(`select public.offer_sign_tap('${t}', '${s}', '${p.id}')::text`); return s; };
    const s1 = await ready(t11, 1), s2 = await ready(t12, 2);
    const fin = await Promise.all([call(`select public.offer_sign_finish('${t11}', '${s1}', 'n', 'ua')::text`), call(`select public.offer_sign_finish('${t12}', '${s2}', 'n', 'ua')::text`)]);
    const done = (await psql(`select (select count(*) from public.offer_events where kind = 'sign_complete') || ',' || (select count(*) from public.offer_signers s join public.race_tokens r on s.token_hash is not null and r.k = 1 where false) || ',' || (select status from public.offer_signings g where exists (select 1 from public.offer_signers s where s.signing_id = g.id and s.name = 'Ana Racer' and s.finished_at is not null) order by released_at limit 1) || ',' || (select count(*) from public.offer_signers where name like '% Racer' and finished_at is not null)`)).o.split(',');
    out.finish = { errors: fin.filter(r => r.c).map(r => r.e), complete_events: +done[0], status: done[2], finished: +done[3] };
    ok(!out.finish.errors.length && out.finish.complete_events === 1 && out.finish.status === 'complete' && out.finish.finished === 2, 'both finishing at once: both finished, exactly one "everyone has signed"');
  } catch (e) { errs.push('crashed: ' + e.message); }
  finally { try { execFileSync('dropdb', [DB]); } catch (_) { errs.push('scratch database not dropped: ' + DB); } }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})();
