// Recorded answers for the public council records lookup (fn/property_lookup_core.ts), built from the live responses in the
// council research of 18 November 2026. Values marked "constructed" fill a gap the research did not record (a field it did not
// print, or a layer it did not query at that point); everything else is as the services returned it.
// makeFetch(scenario, opts) returns a fetch function that answers by URL, and records each URL it was asked for.
const ORC_UPDATE = 1794654000000; // 15 November 2026, NZ time (ORC's UpdateDate)
const feat = (...rows) => ({ features: rows.map(a => ({ attributes: a })) });
const NONE = { features: [] };

const SCENARIOS = {
  // Dunedin: 100 Gladstone Road (a commercial address used in the research)
  dunedin: {
    asked: '100 Gladstone Road, Dunedin',
    locator: { spatialReference: { wkid: 4326, latestWkid: 4326 }, candidates: [{ address: '100 Gladstone Road, Dalmore, Dunedin', location: { x: 170.516076, y: -45.8508 }, score: 100 }] },
    orc: feat({ VNZ: '26780/29604', PropertyID: 3022103, ValuationReference: '26780/29604', HouseNumber: 100, StreetName: 'Gladstone Rd', RatingAuthority: 'Dunedin City', LandValue: 570000, CapitalValue: 1160000, AnnualLevy: 688.09, CertificateOfTitle: '0/0/430432', LegalDescription: 'LOTS 8 10 11 DP 608', Rateable: 1, Hectares: 0.36594144, UpdateDate: ORC_UPDATE }),
    linz: feat({ valuation_reference: '26780-29604', legal_description: 'Lot 8 DP 608, Lot 10 DP 608, Lot 11 DP 608', title_no: '430431, 430432', title_type: 'Freehold', territorial_authority: 'Dunedin City', area: 3663.07 }),
    // DCC pads its strings with spaces (trimmed by the lookup); two rows: the same street name in Mosgiel too
    dccRates: feat(
      { Assessment_Number: '4029241   ', Formatted_address: '100 GLADSTONE RD, DUNEDIN    ', Diff_Category: 'Residential ', Land_Use: 'Residential  ', Land_Use_Descript: 'Residential : Multi Unit   ', Rateable_Value: 1110000, Rateable_Year: '2026-2027 ', Area_Ha: 0.3647, Total_rates: 8151.01, VGNumber: '26780-29604' },
      { Assessment_Number: '4011111', Formatted_address: '100 GLADSTONE RD NORTH, MOSGIEL', Rateable_Value: 640000, Rateable_Year: '2026-2027', Area_Ha: 0.08, Total_rates: 3900, VGNumber: '27000-11111' } /* constructed: the Mosgiel row's values */),
    dccZone: { 0: feat({ Zone: 'Residential', Sub_Zone: 'General Residential 1', Name: 'General Residential 1', Plan_Ref: 'Section 15, Residential' }) },
    dccHaz: {},
    hazards: {},
  },
  // South Dunedin hazards (research: liquefaction "Moderate to high", tsunami zone "Yellow"; the field names were not recorded,
  // so the attribute names here are constructed: the lookup reads any short text field, whatever it is called)
  dunedinHazards: null,
  // Waitaki: 20 Thames Street, Oamaru
  waitaki: {
    asked: '20 Thames Street, Oamaru',
    locator: { spatialReference: { wkid: 4326 }, candidates: [{ address: '20 Thames Street, Oamaru', location: { x: 170.9714, y: -45.0972 } /* constructed point */, score: 100 }] },
    orc: feat({ VNZ: '26280/29000', ValuationReference: '26280/29000', RatingAuthority: 'Waitaki', LandValue: 720000, CapitalValue: 2250000, AnnualLevy: 1201.5 /* constructed */, CertificateOfTitle: 'OT/13A/1386', LegalDescription: 'LOT 1 DP 21229', Hectares: 0.2071, UpdateDate: ORC_UPDATE }),
    linz: feat({ valuation_reference: '26280/29000', legal_description: 'Lot 1 DP 21229', title_no: 'OT13A/1386', title_type: 'Freehold', territorial_authority: 'Waitaki District', area: 2071 } /* constructed from the WDC and ORC records */),
    wdc: feat({ ASSESSMENT: 112719, TITLE: 'Lot: 1 DP: 21229', LAND_AREA: 0.2071, WARD: 'Oamaru', REGIONAL_CNCL: 'Otago', ADDRESS: '20 Thames Street, Oamaru 9400', VALUATION_NO: '26280/29000', LV: 720000, CV: 2250000, DATA_RELIABILITY: 'LINZ and Authority data joined nightly using LINZ SUI. Consult Authority for full information.', CERT_TITLE: 'OT13A/1386', Property_Details: 'https://opencitiesfrontend.waitaki.govt.nz/propertyrating?assessmentNo=112719' }),
    wdcZone: feat({ ZONE: 'BUS H', ZONE_DESC: 'BUSINESS H (HERITAGE) ZONE', ZONE_STATUS: 'ACTIVE' }),
    hazards: {},
  },
  // Clutha: 15 High Street, Balclutha (ORC's valuation reference for it is constructed to match the council's assessment number)
  clutha: {
    asked: '15 High Street, Balclutha',
    locator: { spatialReference: { wkid: 4326 }, candidates: [{ address: '15 High Street, Balclutha', location: { x: 169.7385, y: -46.2386 } /* constructed point */, score: 100 }] },
    orc: feat({ ValuationReference: '28702/47700', RatingAuthority: 'Clutha', LandValue: 115000, CapitalValue: 265000, AnnualLevy: 410.2 /* constructed */, CertificateOfTitle: 'OT/3B/126', LegalDescription: 'LOT 1 DP 11505', Hectares: 0.0726, UpdateDate: ORC_UPDATE }),
    linz: NONE,
    cdc: feat({ PROPERTY_ID: 303039, Assessment_Number: '2870247700', Address: '15 HIGH STREET', Suburb: 'BALCLUTHA', Legal_Description: 'LOT 1 DP 11505', Capital_Value: 265000, Land_Value: 115000, Hectares: 0.0726, Rates_Struck: 3905.06, Updated: 1755129600000 }),
    hazards: {},
  },
  // Central Otago: 26 Tarbert Street falls in the rating unit "24 Tarbert St" (research)
  centralOtago: {
    asked: '24 Tarbert Street, Alexandra',
    locator: { spatialReference: { wkid: 4326 }, candidates: [{ address: '24 Tarbert Street, Alexandra', location: { x: 169.3797, y: -45.2487 } /* constructed point */, score: 100 }] },
    orc: feat({ ValuationReference: '28522/05600', RatingAuthority: 'Central Otago', LandValue: 215000, CapitalValue: 510000, AnnualLevy: 520.75 /* constructed */, CertificateOfTitle: '0/0/313214', LegalDescription: 'Lot 1 DP 378132', Hectares: 0.0809 /* constructed */, UpdateDate: ORC_UPDATE }),
    linz: feat({ valuation_reference: '28522-05600', legal_description: 'Lot 1 DP 378132', title_no: '313214', title_type: 'Freehold', territorial_authority: 'Central Otago District', area: 809 } /* constructed from the ORC record */),
    hazards: {},
  },
  // a weak match: "15 Clyde Street, Balclutha" quietly fell back to "15 High Street, Balclutha" at 75.69 (research)
  weak: {
    asked: '15 Clyde Street, Balclutha',
    locator: { spatialReference: { wkid: 4326 }, candidates: [{ address: '15 High Street, Balclutha', location: { x: 169.7385, y: -46.2386 }, score: 75.69 }] },
  },
};
// South Dunedin: the Dunedin record with ORC liquefaction and tsunami answers at the point
SCENARIOS.dunedinHazards = Object.assign({}, SCENARIOS.dunedin, {
  hazards: {
    Liquefaction_and_ground_class_Otago: { layers: [{ id: 65, name: 'Liquefaction vulnerability' }, { id: 66, name: 'Ground class' }], answers: { 65: feat({ OBJECTID: 7, Category: 'Moderate to high', Source: 'GNS Science report 2019/31', Disclaimer: 'This database is not a substitute for a Land Information Memorandum (LIM). A LIM may be obtained from the relevant local authority, which may hold further information.' }) } },
    TsunamiEvacuationZones: { layers: [{ id: 0, name: 'Tsunami evacuation zones' }], answers: { 0: feat({ OBJECTID: 3, Zone: 'Yellow' }) } },
  },
});

function respond(body, status) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: (status || 200) >= 200 && (status || 200) < 300, status: status || 200, text: async () => text };
}

// opts.fail: list of URL fragments that fail (network), opts.slow: fragments that never answer (for the timeout),
// opts.http: { fragment: status }
function makeFetch(name, opts) {
  const s = SCENARIOS[name]; opts = opts || {}; const asked = [];
  const f = async (url) => {
    asked.push(url);
    for (const frag of opts.slow || []) if (url.includes(frag)) return new Promise(() => {});
    for (const frag of opts.fail || []) if (url.includes(frag)) throw new TypeError('fetch failed');
    for (const [frag, st] of Object.entries(opts.http || {})) if (url.includes(frag)) return respond({ error: { code: st } }, st);
    const u = new URL(url), p = u.pathname;
    if (p.endsWith('/GeocodeServer/suggest')) return respond({ suggestions: s && s.locator ? s.locator.candidates.map((c, i) => ({ text: c.address, magicKey: 'mk' + i })) : [] });
    if (p.endsWith('/findAddressCandidates')) return respond(s.locator);
    if (p.includes('/PropertyExternal/MapServer/0/query')) return respond(s.orc || NONE);
    if (p.includes('/LINZ_NZ_Property_Boundaries/FeatureServer/0/query')) return respond(s.linz || NONE);
    if (p.includes('/Otago_Boundaries/MapServer/3/query')) return respond(NONE);
    if (p.includes('/Public/Rates/FeatureServer/0/query')) { const w = u.searchParams.get('where') || ''; return respond(/^Formatted_address LIKE '100 GLADSTONE%'$/.test(w) ? s.dccRates : NONE); }
    let m = p.match(/SecondGenerationPlan_Zones\/MapServer\/(\d+)\/query/); if (m) return respond((s.dccZone || {})[m[1]] || NONE);
    m = p.match(/SecondGenerationPlan_OverlayZones\/MapServer\/(\d+)\/query/); if (m) return respond((s.dccHaz || {})[m[1]] || NONE);
    if (p.includes('/WDC_PARCELS_view/FeatureServer/0/query')) return respond(s.wdc || NONE);
    if (p.includes('/WDC_ODP_Zone_WFL1/FeatureServer/7/query')) return respond(s.wdcZone || NONE);
    if (p.includes('/PropertyPublic/MapServer/0/query')) return respond(s.cdc || NONE);
    if (p.includes('/Land_Parcels_and_Properties_Data/FeatureServer/0/query')) return respond(s.qldc || NONE);
    m = p.match(/\/rest\/services\/([^/]+)\/FeatureServer$/); if (m && u.hostname === 'services6.arcgis.com') { const h = (s.hazards || {})[m[1]]; return respond({ layers: h ? h.layers : [{ id: 0, name: m[1] }] }); }
    m = p.match(/\/rest\/services\/([^/]+)\/FeatureServer\/(\d+)\/query$/); if (m && u.hostname === 'services6.arcgis.com') { const h = (s.hazards || {})[m[1]]; return respond(h && h.answers[m[2]] || NONE); }
    if (u.searchParams.get('f') === 'json') return respond({ currentVersion: 11.1 });
    return respond({ error: { code: 404, message: 'not in fixtures' } }, 404);
  };
  f.asked = asked;
  return f;
}
module.exports = { SCENARIOS, makeFetch };
