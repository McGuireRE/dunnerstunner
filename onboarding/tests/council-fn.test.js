// Tests of the property-lookup edge function's request handling (fn/property_lookup_handler.ts), with fakes for sign-in and the
// database and the recorded council answers. Covers: agent only (403 with no token, a forged or a vendor's token), the keyless health
// check (only up or down per host, no property data, no database touched, cached for a minute), a property that isn't there (404),
// a bad property id, a lookup saved, the 30-day reuse, "Look again" (fresh), the once-a-minute limit per address, reuse never across
// another property or another choice of unit, and a slow or unavailable answer not held against a retry.
const path = require('path');
const { makeFetch } = require('./files/council-fixtures.js');
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'property_lookup_handler.ts'));
  const TOKEN = 'Bearer good-agent-token', VENDOR = 'Bearer vendor-token';
  const PROP = '11111111-2222-3333-4444-555555555555';
  let clock = Date.parse('2026-11-18T01:00:00Z');
  const make = (scenario, opts) => {
    const rows = [], dbCalls = [];
    const f = makeFetch(scenario, opts);
    const h = H.makeHandler({
      cors: { 'Access-Control-Allow-Origin': '*' }, fetch: f, now: () => clock,
      agent: async a => { dbCalls.push('agent'); return a === TOKEN ? 'agent@example.com' : null; },   // a forged or vendor token is not an agent
      propertyExists: async id => { dbCalls.push('property'); return id === PROP; },
      recent: async (n, since) => { dbCalls.push('recent'); return rows.filter(r => r.asked_norm === n && r.created_at >= since).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); },
      save: async row => { dbCalls.push('save'); const r = Object.assign({ id: 'L' + (rows.length + 1), created_at: new Date(clock).toISOString(), asked_norm: H.norm(row.asked) }, row); rows.push(r); return { id: r.id, created_at: r.created_at }; },
    });
    return { h, rows, dbCalls, f };
  };
  const post = (h, body, auth) => h(new Request('https://x.supabase.co/functions/v1/property-lookup', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}), body: JSON.stringify(body) }));
  const lookupBody = extra => Object.assign({ mode: 'lookup', address: '100 Gladstone Road, Dunedin' }, extra || {});

  // agent only
  { const { h, rows, f } = make('dunedin');
    for (const [auth, label] of [[null, 'no token'], ['Bearer forged.jwt.here', 'forged token'], [VENDOR, 'vendor token']]) {
      const r = await post(h, lookupBody(), auth); const j = await r.json();
      expect(r.status === 403 && j.error === 'Not allowed', label + ': 403');
      const r2 = await post(h, { mode: 'suggest', text: '100 gladstone' }, auth); expect(r2.status === 403, label + ': suggest 403 too');
    }
    expect(!rows.length && !f.asked.length, 'refused requests reach neither the councils nor the database');
    const r = await h(new Request('https://x/f', { method: 'PUT' })); expect(r.status === 405, 'other methods refused'); }

  // health: keyless, only up or down, no database, cached for a minute
  { H.resetHealthCache(); const { h, dbCalls, f } = make('dunedin', { fail: ['gis.cluthadc.govt.nz'] });
    const r = await h(new Request('https://x/f?health=1')); const j = await r.json();
    out.health = j;
    expect(r.status === 200 && j.hosts['maps.orc.govt.nz'].ok === true && j.hosts['gis.cluthadc.govt.nz'].ok === false, 'health per host');
    expect(Object.values(j.hosts).every(x => Object.keys(x).sort().join() === 'ok,status') && !/Gladstone|valuation|address/i.test(JSON.stringify(j)), 'health holds no property data');
    expect(!dbCalls.length, 'health touches no database and needs no sign-in');
    const n = f.asked.length; await h(new Request('https://x/f?health=1')); await h(new Request('https://x/f?health=1'));
    expect(f.asked.length === n, 'health cached: repeated calls don\'t reach the councils');
    clock += 61_000; await h(new Request('https://x/f?health=1'));
    expect(f.asked.length === n * 2, 'health asked again after a minute'); }

  // a property that isn't there, and a bad id
  { const { h, rows } = make('dunedin');
    let r = await post(h, lookupBody({ property_id: '99999999-2222-3333-4444-555555555555' }), TOKEN); expect(r.status === 404 && (await r.json()).error === 'Property not found', 'property not found: 404');
    r = await post(h, lookupBody({ property_id: 'not-a-uuid' }), TOKEN); expect(r.status === 400, 'bad property id: 400');
    r = await post(h, lookupBody({ address: 'x' }), TOKEN); expect(r.status === 400, 'no address: 400');
    r = await post(h, { mode: 'other' }, TOKEN); expect(r.status === 400, 'unknown request: 400');
    expect(!rows.length, 'nothing saved for a refused request'); }

  // a lookup is saved; reused within 30 days; "Look again" fetches afresh, but not twice in a minute
  { const { h, rows, f } = make('dunedin');
    let r = await post(h, lookupBody({ property_id: PROP }), TOKEN); let j = await r.json();
    expect(r.status === 200 && j.saved && j.lookup_id === 'L1' && j.result.status === 'ok' && rows[0].created_by === 'agent@example.com' && rows[0].property_id === PROP, 'lookup saved with who asked');
    const n1 = f.asked.length;
    clock += 3 * 864e5; r = await post(h, lookupBody({ property_id: PROP }), TOKEN); j = await r.json();
    expect(j.reused && j.lookup_id === 'L1' && f.asked.length === n1, 'reused within 30 days, councils not asked');
    r = await post(h, lookupBody({ property_id: PROP, fresh: true }), TOKEN); j = await r.json();
    expect(!j.reused && j.lookup_id === 'L2' && f.asked.length > n1, 'Look again: fetched afresh');
    const n2 = f.asked.length;
    clock += 20_000; r = await post(h, lookupBody({ property_id: PROP, fresh: true }), TOKEN); j = await r.json();
    expect(j.reused && j.limited && j.lookup_id === 'L2' && f.asked.length === n2, 'a second Look again within a minute gets the stored answer');
    clock += 61_000; r = await post(h, lookupBody({ property_id: PROP, fresh: true }), TOKEN); j = await r.json();
    expect(!j.reused && j.lookup_id === 'L3', 'after a minute, Look again fetches afresh');
    clock += 31 * 864e5; r = await post(h, lookupBody({ property_id: PROP }), TOKEN); j = await r.json();
    expect(!j.reused, 'after 30 days, fetched afresh');
    // never reused for another property, or for another choice of unit
    const other = '22222222-2222-3333-4444-555555555555';
    const h2 = H.makeHandler({ cors: {}, fetch: f, now: () => clock, agent: async () => 'agent@example.com', propertyExists: async () => true, recent: async (n, s) => rows.filter(x => x.asked_norm === n && x.created_at >= s).reverse(), save: async row => { const x = Object.assign({ id: 'M' + rows.length, created_at: new Date(clock).toISOString(), asked_norm: H.norm(row.asked) }, row); rows.push(x); return x; } });
    clock += 2 * 3600e3;
    r = await post(h2, lookupBody({ property_id: other }), TOKEN); j = await r.json(); expect(!j.reused, 'not reused for another property');
    clock += 2 * 3600e3;
    r = await post(h2, lookupBody({ unit_ref: '26780/29604' }), TOKEN); j = await r.json(); expect(!j.reused && j.result.unit_ref === '26780/29604', 'not reused for another choice of unit'); }

  // a slow answer is not held against a retry within the minute
  { const H2 = H.makeHandler({ cors: {}, fetch: makeFetch('dunedin', { fail: ['OtagoAddress_Locator'] }), now: () => clock, agent: async () => 'a@example.com', propertyExists: async () => true, recent: async () => [{ id: 'S1', created_at: new Date(clock - 5000).toISOString(), status: 'unavailable', property_id: null, result: { status: 'unavailable', unit_ref: null, candidate: null } }], save: async () => ({ id: 'S2', created_at: new Date(clock).toISOString() }) });
    const r = await post(H2, lookupBody(), TOKEN); const j = await r.json();
    expect(!j.reused && j.lookup_id === 'S2', 'an unavailable answer a few seconds ago doesn\'t block a retry'); }

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));
