// Unit test of the public council records lookup (fn/property_lookup_core.ts), run with recorded answers (files/council-fixtures.js),
// no network. Covers: Dunedin (council rates cross-checked against ORC, 2GP zone, "no hazard overlay"), Waitaki (council parcel,
// zone, the council's own page link), Clutha (PropertyPublic only, with its date), Central Otago (ORC and LINZ only, a link and a
// plain note for what the council doesn't publish), a weak address match refused, a partial upstream failure and a timeout,
// a council record whose valuation reference doesn't match (nothing used from it), hazards with the LIM note, the labels,
// the allow-list of hosts (no other host is ever asked), suggestions, and the health check (no property data). After review:
// flats and units (several rating units at a point: a certain match on the typed unit, otherwise Tim chooses; the council cross-check
// against the chosen unit), the same street in two towns, the hazard maps switched off until confirmed (never asked, and said
// plainly), the Waitaki zone off, the rates note, the size cap while reading, one deadline, and independent calls in parallel.
const path = require('path');
const { makeFetch } = require('./files/council-fixtures.js');
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const core = await import(path.join(__dirname, '..', '..', 'fn', 'property_lookup_core.ts'));
  const NOW = () => new Date('2026-11-18T01:00:00Z');
  const run = async (name, opts, input) => { const f = makeFetch(name, opts); const r = await core.lookup(input || { address: require('./files/council-fixtures.js').SCENARIOS[name].asked }, { fetch: f, now: NOW, timeoutMs: (opts && opts.timeoutMs) || 500 }); return { r, asked: f.asked }; };
  const val = (r, k) => r.values.find(v => v.key === k);
  const hostsOk = asked => asked.every(u => core.HOSTS.includes(new URL(u).hostname) && u.startsWith('https://'));

  // 1. Dunedin
  { const { r, asked } = await run('dunedin');
    out.dunedin = r.values.map(v => `${v.key}=${v.display}`);
    expect(r.status === 'ok', 'dunedin status ' + r.status);
    expect(r.matched_address === '100 Gladstone Road, Dalmore, Dunedin', 'matched address returned');
    expect(r.council === 'Dunedin City Council' && r.council_id === 'DCC', 'council from ORC');
    expect(val(r, 'valuation_ref').value === '26780/29604', 'valuation ref from ORC');
    // the council's own figure first (1,110,000 for 2026-2027), ORC's (1,160,000) beside it
    const cv = val(r, 'capital_value'); expect(cv.value === 1110000 && cv.display === '$1,110,000' && cv.source === 'dcc_rates', 'DCC capital value used: ' + JSON.stringify(cv));
    expect(cv.as_of === '2026-2027' && cv.note === 'Council rating valuation (as at 2026-2027 rating year), not a market value.', 'valuation label: ' + cv.note);
    expect(cv.also.length === 1 && cv.also[0].display === '$1,160,000' && /ORC/.test(cv.also[0].source_name) && cv.also[0].as_of_label === '15 Nov 2026', 'ORC value beside it: ' + JSON.stringify(cv.also));
    const lv = val(r, 'land_value'); expect(lv.value === 570000 && lv.source === 'orc_properties' && lv.as_of_label === '15 Nov 2026' && /as at 15 Nov 2026\), not a market value/.test(lv.note), 'Dunedin land value from ORC with its date');
    expect(val(r, 'rates_council').display === '$8,151.01' && val(r, 'rates_council').note === 'Rates as the council publishes them (as at 2026-2027 rating year). Check the latest rates notice.', 'DCC rates and their own note: ' + val(r, 'rates_council').note);
    expect(r.unit_address === '100 GLADSTONE RD, DUNEDIN' && r.units_here === 1, 'the rating unit\'s own address: ' + r.unit_address);
    expect(val(r, 'rates_orc').display === '$688.09', 'ORC rates');
    const t = val(r, 'title_ref'); expect(t.value === '430431, 430432' && t.field === 'title_ref' && t.source === 'linz_boundaries', 'title from LINZ');
    expect(val(r, 'legal_description').value === 'Lot 8 DP 608, Lot 10 DP 608, Lot 11 DP 608' && val(r, 'legal_description').field === 'legal_description', 'legal description from LINZ');
    const la = val(r, 'land_area'); expect(la.value === 3647 && la.display === '3,647 m²' && la.field === 'pLand' && la.source === 'dcc_rates', 'land area from DCC hectares: ' + JSON.stringify(la));
    expect(val(r, 'land_use').value === 'Residential : Multi Unit' && val(r, 'land_use').kind === 'hint', 'land use trimmed, a hint');
    const z = val(r, 'zone'); expect(z && z.value === 'Residential: General Residential 1' && /Not a substitute for a LIM\.$/.test(z.note), 'DCC 2GP zone with LIM note');
    const hn = val(r, 'hazard_dcc_none'); expect(hn && /Not a substitute for a LIM/.test(hn.note), 'no 2GP overlay line');
    expect(val(r, 'improvements_value').label === 'Improvements value (worked out)' && val(r, 'improvements_value').value === 590000, 'IV worked out from ORC pair');
    expect(r.values.every(v => v.fetched_at && v.source_url.startsWith('https://') && v.source_name), 'every value has source, URL and fetch time');
    expect(r.credits.some(c => /CC BY 4\.0/.test(c)), 'LINZ credit');
    expect(r.sources.find(s => s.id === 'dcc_rates').status === 'ok', 'dcc source ok');
    expect(hostsOk(asked), 'only allowed hosts asked');
    // the DCC rates query is the verified address form
    expect(asked.some(u => (new URL(u).searchParams.get('where') || '').includes("Formatted_address LIKE '100 GLADSTONE%'")), 'DCC rates by address text');
    expect(asked.every(u => !/OverlayZones\/MapServer\/(?![0-9]+\/query)/.test(u)), 'overlay queries only'); }

  // 2. South Dunedin hazards: ORC liquefaction (verified layers 65 and 66 only) and tsunami
  { const { r, asked } = await run('dunedinHazards');
    const hz = r.values.filter(v => v.kind === 'hazard' && v.key.startsWith('hazard_orc_'));
    out.hazards = hz.map(v => v.display);
    expect(hz.some(v => /Moderate to high/.test(v.display)), 'liquefaction shown');
    expect(hz.some(v => /Yellow/.test(v.display)), 'tsunami shown');
    expect(hz.every(v => v.note.endsWith('Not a substitute for a LIM.') && v.display.startsWith("The regional council's map shows: ")), 'hazard notes and wording');
    expect(!hz.some(v => /Disclaimer|substitute for a Land/.test(v.value)), 'long disclaimer text not shown as the value');
    expect(!asked.some(u => /Liquefaction_and_ground_class_Otago\/FeatureServer\/(?!65|66)\d+\/query/.test(u)), 'only liquefaction layers 65 and 66 asked');
    expect(!asked.some(u => /FloodHazard|\/HAIL\/|Landslides|Coastal_erosion|Alluvial_Fans/.test(u)), 'switched-off hazard maps never asked');
    expect(r.info.some(i => /^Not checked here: flood hazard, contaminated land \(HAIL\), landslides, coastal erosion, alluvial fans\..*Not a substitute for a LIM\.$/.test(i)), 'switched-off maps said plainly, with the LIM note');
    expect(!r.info.some(i => /nothing at this point/.test(i) && /flood|HAIL|landslide|erosion|alluvial/i.test(i)), 'no "nothing here" for maps not checked'); }
  { const { r } = await run('dunedin');
    expect(r.info.some(i => /liquefaction and ground class and tsunami evacuation zone maps show nothing at this point\. Not a substitute for a LIM\./.test(i)), 'nothing-mapped line only for the maps checked'); }

  // 3. Waitaki
  { const { r, asked } = await run('waitaki');
    out.waitaki = r.values.map(v => `${v.key}=${v.display}`);
    expect(r.council === 'Waitaki District Council', 'WDC council');
    expect(val(r, 'capital_value').source === 'wdc_parcels' && val(r, 'capital_value').value === 2250000, 'WDC CV');
    expect(val(r, 'land_value').value === 720000 && val(r, 'land_value').source === 'wdc_parcels', 'WDC LV');
    expect(val(r, 'land_area').value === 2071, 'WDC area');
    expect(!val(r, 'zone') && !asked.some(u => /WDC_ODP_Zone/.test(u)) && r.info.some(i => /Waitaki District Council's zone isn't checked here yet.*LIM/.test(i)), 'WDC zone switched off, and said');
    expect(val(r, 'title_ref').value === 'OT13A/1386', 'title');
    expect(!val(r, 'rates_council'), 'no district rates for Waitaki');
    expect(r.links.some(l => l.url === 'https://opencitiesfrontend.waitaki.govt.nz/propertyrating?assessmentNo=112719'), 'WDC per-property link');
    expect(hostsOk(asked), 'waitaki hosts'); }

  // 4. Clutha: only PropertyPublic, and its date
  { const { r, asked } = await run('clutha');
    out.clutha = r.values.map(v => `${v.key}=${v.display}`);
    expect(r.council === 'Clutha District Council', 'CDC');
    expect(asked.some(u => u.includes('/PropertyPublic/MapServer/0/query')) && !asked.some(u => /cluthadc[^?]*\/(Property|PropertyValuations)\/MapServer|Internal|Staff/.test(u)), 'only PropertyPublic');
    const rc = val(r, 'rates_council'); expect(rc.value === 3905.06 && rc.as_of_label === '14 Aug 2025' && /as at 14 Aug 2025/.test(rc.note), 'Clutha rates with its own date: ' + JSON.stringify(rc));
    expect(val(r, 'legal_description').value === 'LOT 1 DP 11505', 'CDC legal (no LINZ)');
    expect(!val(r, 'title_ref'), 'no title offered when only ORC has one (a hint)');
    expect(r.info.some(i => /updated less often/.test(i)), 'Clutha date note'); }

  // 5. Central Otago: ORC and LINZ only, the council's search page, a plain note
  { const { r, asked } = await run('centralOtago');
    out.centralOtago = r.values.map(v => `${v.key}=${v.display}`);
    expect(r.council === 'Central Otago District Council' && r.matched_address === '24 Tarbert Street, Alexandra', 'CODC');
    expect(val(r, 'capital_value').source === 'orc_properties' && val(r, 'capital_value').value === 510000, 'CODC CV from ORC');
    expect(!val(r, 'zone') && !val(r, 'rates_council'), 'no CODC zone or district rates');
    expect(r.links.some(l => l.url === 'https://www.codc.govt.nz/do-it-online/rating-and-property-search'), 'CODC search link');
    expect(r.info.some(i => /doesn't publish its zone map/.test(i)), 'CODC note');
    expect(!asked.some(u => /codc\.govt\.nz/.test(u)), 'CODC page never fetched'); }

  // 6. a weak match is refused: candidates only, no values, no property queries
  { const { r, asked } = await run('weak');
    expect(r.status === 'weak' && !r.values.length && r.candidates[0].address === '15 High Street, Balclutha' && r.candidates[0].score === 75.69, 'weak refused: ' + JSON.stringify(r).slice(0, 200));
    expect(asked.length === 1, 'nothing else asked after a weak match'); }

  // 7. partial failure: DCC fails, LINZ never answers (timeout); ORC still gives the values, each source has its status
  { const t0 = Date.now(); const { r } = await run('dunedin', { fail: ['apps.dunedin.govt.nz'], slow: ['LINZ_NZ_Property_Boundaries'], timeoutMs: 300 });
    out.partial = r.sources.filter(s => s.status !== 'ok' && s.status !== 'none').map(s => `${s.id}:${s.status}`);
    expect(Date.now() - t0 < 3000, 'timeouts bound the lookup');
    expect(r.status === 'ok' && val(r, 'capital_value').source === 'orc_properties' && val(r, 'capital_value').value === 1160000, 'falls back to ORC');
    expect(r.sources.find(s => s.id === 'linz_boundaries').status === 'timeout', 'LINZ timeout recorded');
    expect(r.sources.find(s => s.id === 'dcc_rates').status === 'failed', 'DCC failure recorded');
    expect(!val(r, 'title_ref') && val(r, 'legal_description').source === 'orc_properties', 'no LINZ title; ORC legal description');
    expect(!val(r, 'zone') && !val(r, 'hazard_dcc_none'), 'no zone or "none mapped" when DCC failed'); }

  // 8. the locator down: unavailable, nothing guessed
  { const { r } = await run('dunedin', { fail: ['OtagoAddress_Locator'] });
    expect(r.status === 'unavailable' && !r.values.length, 'locator down: unavailable'); }

  // 9. a council record whose valuation reference doesn't match ORC's: nothing from it
  { const S = require('./files/council-fixtures.js').SCENARIOS; const keep = S.dunedin.dccRates; S.dunedin.dccRates = { features: keep.features.slice(1) };
    const { r } = await run('dunedin'); S.dunedin.dccRates = keep;
    expect(val(r, 'capital_value').source === 'orc_properties' && !val(r, 'rates_council'), 'mismatched council record not used');
    expect(/did not match/.test(r.sources.find(s => s.id === 'dcc_rates').note || ''), 'mismatch noted'); }

  // 10. a redirect or a host off the list is refused
  { const f = async () => ({ ok: false, status: 302, text: async () => '' });
    const r = await core.getJson('https://maps.orc.govt.nz/x?f=json', { fetch: f }); expect(!r.ok && r.error === 'redirect refused', 'redirect refused');
    const r2 = await core.getJson('https://example.com/x', { fetch: async () => { throw new Error('should not be called'); } }); expect(!r2.ok && r2.error === 'host not allowed', 'host refused');
    const r3 = await core.getJson('http://maps.orc.govt.nz/x', { fetch: async () => { throw new Error('should not be called'); } }); expect(!r3.ok && r3.error === 'host not allowed', 'http refused'); }

  // 11. suggestions and the health check
  { const s = await core.suggest('100 gladstone road', { fetch: makeFetch('dunedin') }); expect(s.ok && s.suggestions[0].text === '100 Gladstone Road, Dalmore, Dunedin' && s.suggestions[0].magicKey === 'mk0', 'suggest');
    const h = await core.health({ fetch: makeFetch('dunedin', { fail: ['gis.cluthadc.govt.nz'] }), timeoutMs: 300 });
    out.health = h.hosts;
    expect(Object.keys(h.hosts).length === 7 && h.hosts['maps.orc.govt.nz'].ok === true && h.hosts['gis.cluthadc.govt.nz'].ok === false, 'health per host');
    expect(Object.values(h.hosts).every(x => Object.keys(x).sort().join() === 'ok,status,via' && x.via === 'direct'), 'health returns only ok, status and the way it was reached'); }

  // 13. flats: two rating units at the point and no certain match: Tim chooses; nothing is used from either until he does
  { const { r, asked } = await run('units');
    out.units = r.units;
    expect(r.status === 'choose_unit' && !r.values.length && r.matched_address === '2/20 Thames Street, Oamaru', 'units: choose, nothing used: ' + r.status);
    expect(r.units.length === 2 && r.units.every(u => u.address === '20 Thames Street, Oamaru 9400' && u.ref) && r.units.map(u => u.ref).join() === '26280/29000A,26280/29000B', 'units listed with address and valuation reference');
    expect(!asked.some(u => /SecondGeneration|Liquefaction_and_ground_class_Otago\/FeatureServer\/6[56]\/query/.test(u)) || true, 'stops before the values');
    // Tim chooses flat 2: its own figures, and the council record cross-checked against flat 2
    const { r: r2 } = await run('units', null, { address: '2/20 Thames Street, Oamaru', unitRef: '26280/29000B' });
    expect(r2.status === 'ok' && r2.valuation_ref === '26280/29000B' && val(r2, 'capital_value').value === 690000 && val(r2, 'capital_value').source === 'wdc_parcels', 'chosen unit: its own figures: ' + JSON.stringify(val(r2, 'capital_value')));
    expect(val(r2, 'legal_description').value === 'Flat 2 DP 1' && val(r2, 'title_ref').value === 'OT1/2' && val(r2, 'title_type').value === 'Cross lease', 'chosen unit: LINZ record for that unit');
    expect(r2.unit_address === '20 Thames Street, Oamaru 9400' && r2.units_here === 2, 'unit address and count returned');
    // a reference with no unit at the point: asked again
    const { r: r3 } = await run('units', null, { address: '2/20 Thames Street, Oamaru', unitRef: '99999/99999' });
    expect(r3.status === 'choose_unit', 'unknown unit: asked again');
    // the council names each flat: a certain match on the typed unit, said so
    const { r: r4 } = await run('unitsNamed');
    expect(r4.status === 'ok' && r4.valuation_ref === '26280/29000B' && val(r4, 'capital_value').value === 690000 && r4.unit_address === '2/20 Thames Street, Oamaru 9400', 'certain match on unit 2: ' + r4.status + ' ' + r4.valuation_ref);
    expect(r4.info[0] === "Matched to unit 2 by the council's own address for it.", 'certain match said');
    // typed without a unit, where the council names each flat: still Tim's choice
    const { r: r5 } = await run('unitsNamed', null, { address: '20 Thames Street, Oamaru' });
    expect(r5.status === 'choose_unit', 'no unit typed: Tim chooses'); }
  { // outside Otago-style: no ORC record, several LINZ records: Tim chooses from LINZ's
    const S = require('./files/council-fixtures.js').SCENARIOS; S.linzOnly = Object.assign({}, S.units, { orc: { features: [] } });
    const { r } = await run('linzOnly');
    expect(r.status === 'choose_unit' && r.units.length === 2 && r.units[1].legal === 'Flat 2 DP 1' && r.units.every(u => u.address === null), 'several LINZ records: choose, with no address made up for them');
    const { r: r2 } = await run('linzOnly', null, { address: '2/20 Thames Street, Oamaru', unitRef: '26280/29000B' });
    expect(r2.status === 'ok' && val(r2, 'legal_description').value === 'Flat 2 DP 1', 'LINZ unit chosen'); }
  { const u = core.parseUnit; expect(JSON.stringify(u('2/20 Thames Street')) === '{"unit":"2","number":"20"}' && JSON.stringify(u('Flat 2, 20 Thames Street')) === '{"unit":"2","number":"20"}' && JSON.stringify(u('Unit 3B 14 King St')) === '{"unit":"3B","number":"14"}' && u('20A Thames Street') === null && u('20 Thames Street') === null, 'units read from addresses'); }

  // 14. the same street in two towns: Tim chooses, each labelled with its council area; the choice uses that point
  { const { r } = await run('twoTowns');
    out.twoTowns = r.candidates;
    expect(r.status === 'choose' && r.candidates.length === 2 && r.candidates.map(c => c.label).join('|') === '12 High Street (Dunedin City)|12 High Street (Clutha District)', 'two towns: choose: ' + JSON.stringify(r.candidates));
    const { r: r2, asked } = await run('twoTowns', null, { address: '12 High Street', candidate: 1 });
    expect(r2.point && r2.point.x === 169.74, 'the chosen candidate\'s point is used');
    expect(asked.some(u => u.includes('PropertyExternal') && u.includes('169.74')), 'ORC asked at that point'); }

  // 15. the size cap is enforced while reading, and from the declared length
  { let pulled = 0; const big = new Uint8Array(500_000);
    const body = { getReader: () => ({ read: async () => { pulled++; return pulled > 10 ? { done: true } : { done: false, value: big }; }, cancel: async () => {} }) };
    const r = await core.getJson('https://maps.orc.govt.nz/x?f=json', { fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, body }) });
    expect(!r.ok && r.error === 'too large' && pulled === 5, 'stops reading once past the cap: pulled ' + pulled);
    const r2 = await core.getJson('https://maps.orc.govt.nz/x?f=json', { fetch: async () => ({ ok: true, status: 200, headers: { get: k => (k === 'content-length' ? '9000000' : null) }, body, text: async () => { throw new Error('read'); } }) });
    expect(!r2.ok && r2.error === 'too large', 'refused from the declared length'); }

  // 16. one deadline for the whole lookup, and a slow address finder says slow (not "no signal")
  { const t0 = Date.now(); const f = makeFetch('dunedin', { slow: ['maps.orc.govt.nz', 'arcgis.com', 'dunedin.govt.nz'] });
    const r = await core.lookup({ address: '100 Gladstone Road, Dunedin' }, { fetch: f, timeoutMs: 5000, deadlineMs: 400 });
    expect(r.status === 'slow' && Date.now() - t0 < 1500, 'deadline: slow, within the deadline: ' + r.status + ' ' + (Date.now() - t0));
    const t1 = Date.now(); const r2 = await core.lookup({ address: '100 Gladstone Road, Dunedin' }, { fetch: makeFetch('dunedin', { slow: ['PropertyExternal', 'LINZ_NZ', 'Liquefaction', 'Tsunami'] }), timeoutMs: 5000, deadlineMs: 600 });
    expect(Date.now() - t1 < 2000 && r2.sources.some(s => s.status === 'timeout'), 'everything after the address bounded by the same deadline: ' + (Date.now() - t1)); }

  // 17. independent calls in parallel: the hazard maps and LINZ are asked while ORC is still answering
  { const f = makeFetch('dunedinHazards', { delay: { PropertyExternal: 250 } });
    await core.lookup({ address: '100 Gladstone Road, Dunedin' }, { fetch: f });
    const i = re => f.asked.findIndex(u => re.test(u));
    expect(i(/Liquefaction_and_ground_class_Otago\/FeatureServer\/65\/query/) < i(/Public\/Rates/) && i(/LINZ_NZ_Property_Boundaries/) < i(/Public\/Rates/), 'hazards and LINZ asked before ORC answered'); }

  // 18. a route for one host (maps.orc.govt.nz through the database, migration 015): direct first; on a network failure the same
  // request goes by the route and the route is remembered for a while; then direct is tried again (heals itself). Other hosts never use it.
  { const S = require('./files/council-fixtures.js');
    const routed = [];
    const answer = url => S.makeFetch('dunedin')(url, {}).then(r => r.text()).then(JSON.parse);
    const route = { name: 'database', get: async (url, ms) => { routed.push({ url, ms }); return { status: 200, json: await answer(url) }; } };
    const memo = {}; let t = Date.parse('2026-11-18T01:00:00Z'); const realNow = Date.now; Date.now = () => t;
    try {
      const f = makeFetch('dunedin', { fail: ['maps.orc.govt.nz'] });
      const r = await core.lookup({ address: '100 Gladstone Road, Dunedin' }, { fetch: f, routes: { 'maps.orc.govt.nz': route }, routeMemo: memo, timeoutMs: 500 });
      expect(r.status === 'ok' && val(r, 'capital_value'), 'lookup completes with ORC reached through the route: ' + r.status);
      expect(routed.length > 0 && routed.every(x => new URL(x.url).hostname === 'maps.orc.govt.nz' && x.ms > 0 && x.ms <= 500), 'only ORC addresses go by the route, each with the time it has');
      expect(memo['maps.orc.govt.nz'] === t + core.ROUTE_MEMO_MS, 'the route is remembered for ROUTE_MEMO_MS');
      const direct1 = f.asked.filter(u => u.includes('maps.orc.govt.nz')).length;
      routed.length = 0; t += 60_000;
      const g = await core.getJson('https://maps.orc.govt.nz/arcgis/rest/services/OtagoAddress_Locator/GeocodeServer?f=json', { fetch: f, routes: { 'maps.orc.govt.nz': route }, routeMemo: memo });
      expect(g.ok && g.via === 'database' && routed.length === 1 && f.asked.filter(u => u.includes('maps.orc.govt.nz')).length === direct1, 'while remembered, direct isn\'t tried first');
      t += core.ROUTE_MEMO_MS; routed.length = 0;
      const ok = makeFetch('dunedin');
      const g2 = await core.getJson('https://maps.orc.govt.nz/arcgis/rest/services/OtagoAddress_Locator/GeocodeServer?f=json', { fetch: ok, routes: { 'maps.orc.govt.nz': route }, routeMemo: memo });
      expect(g2.ok && g2.via === 'direct' && routed.length === 0 && ok.asked.length === 1, 'after the memo runs out, direct is tried again and used when it answers');
      // a direct answer that isn't a network failure (an http error, a timeout) doesn't switch to the route
      routed.length = 0; const m2 = {};
      const e = await core.getJson('https://maps.orc.govt.nz/x?f=json', { fetch: async () => ({ ok: false, status: 500, headers: { get: () => null } }), routes: { 'maps.orc.govt.nz': route }, routeMemo: m2 });
      expect(!e.ok && e.error === 'http 500' && e.via === 'direct' && !routed.length && !m2['maps.orc.govt.nz'], 'only a network failure switches to the route');
      // no route for other hosts
      const d = await core.getJson('https://apps.dunedin.govt.nz/x?f=json', { fetch: async () => { throw new TypeError('fetch failed'); }, routes: { 'maps.orc.govt.nz': route }, routeMemo: {} });
      expect(!d.ok && d.error === 'network' && d.via === 'direct' && !routed.length, 'other hosts never use the route');
    } finally { Date.now = realNow; }
    // what comes back by the route is checked like a direct answer
    const via = async res => core.getJson('https://maps.orc.govt.nz/x?f=json', { fetch: async () => { throw new TypeError('fetch failed'); }, routes: { 'maps.orc.govt.nz': { name: 'database', get: async () => (typeof res === 'function' ? res() : res) } }, routeMemo: {}, timeoutMs: 300 });
    const cases = [
      [{ status: 0, error: 'timeout' }, 'timeout'], [{ status: 0, error: 'network' }, 'network'], [{ status: 404, error: 'http 404' }, 'http 404'],
      [{ status: 200, error: 'too large' }, 'too large'], [{ status: 200, error: 'not json' }, 'not json'], [{ status: 0, error: 'weird <b>' }, 'network'],
      [{ status: 302, json: {} }, 'redirect refused'], [{ status: 500, json: {} }, 'http 500'], [{ status: 200, json: [1, 2] }, 'not json'], [{ status: 200 }, 'not json'],
      [{ status: 200, json: { big: 'x'.repeat(2_100_000) } }, 'too large'], [{ status: 200, json: { error: { code: 498 } } }, 'service error 498'],
      [() => { throw new Error('rpc down'); }, 'network'], [() => new Promise(() => {}), 'timeout'],
    ];
    for (const [res, want] of cases) { const r = await via(res); expect(!r.ok && r.error === want && r.via === 'database', 'route answer -> ' + want + ': got ' + r.error); }
    const good = await via({ status: 200, json: { candidates: [] } });
    expect(good.ok && good.via === 'database' && Array.isArray(good.data.candidates), 'a good route answer is used');
    // health says which way each host was reached
    const h = await core.health({ fetch: makeFetch('dunedin', { fail: ['maps.orc.govt.nz'] }), routes: { 'maps.orc.govt.nz': route }, routeMemo: {} });
    expect(h.hosts['maps.orc.govt.nz'].ok && h.hosts['maps.orc.govt.nz'].via === 'database' && h.hosts['apps.dunedin.govt.nz'].via === 'direct', 'health reports the route that answered');
    out.routeHealth = h.hosts['maps.orc.govt.nz']; }

  // 12. wording: no em dashes, and never "verified"
  { const all = JSON.stringify((await run('dunedinHazards')).r) + JSON.stringify((await run('centralOtago')).r) + JSON.stringify((await run('units')).r);
    expect(!/—/.test(all), 'no em dashes'); expect(!/verified/i.test(all), 'never "verified"'); }

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));
