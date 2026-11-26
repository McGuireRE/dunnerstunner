/* The First visit's own rules (LW1, migration 031), with no page or database code, so the tests can load it on its own. The same rules
   are in the database (fv_rooms_profile): the page shows what the profile will say, and the database decides. */
(function (root) {
  'use strict';
  const live = rooms => (rooms || []).filter(r => !r.archived);
  // the bedroom count: Tim's calls only. null until he has called at least one room a bedroom, or has made a call on every room tapped as
  // a bedroom (so "no bedrooms" is only ever his own call).
  function bedrooms(rooms) {
    const L = live(rooms), n = L.filter(r => r.tim_class === 'bedroom').length;
    if (n > 0) return n;
    if (L.some(r => r.base === 'bedroom' && !r.tim_class)) return null;
    return L.some(r => r.base === 'bedroom' || r.tim_class) ? 0 : null;
  }
  const ONE = { study: 'study', office: 'office', studio: 'studio', sleepout: 'sleepout', flexible: 'flexible room' };
  const MANY = { study: 'studies', office: 'offices', studio: 'studios', sleepout: 'sleepouts', flexible: 'flexible rooms' };
  // "3 bedrooms plus study and sleepout": the listing's and the agreement's wording, from Tim's calls only
  function wording(rooms) {
    const n = bedrooms(rooms); if (n == null) return null;
    const L = live(rooms), seen = {};
    L.slice().sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(r => { if (ONE[r.tim_class]) seen[r.tim_class] = (seen[r.tim_class] || 0) + 1; });
    const parts = Object.keys(seen).map(c => seen[c] > 1 ? seen[c] + ' ' + MANY[c] : ONE[c]);
    const extra = !parts.length ? '' : parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    return n + ' bedroom' + (n === 1 ? '' : 's') + (extra ? ' plus ' + extra : '');
  }
  // the next label for a room tapped: "Bedroom", then "Bedroom 2" (the first one becomes "Bedroom 1" only if Tim renames it)
  function nextLabel(rooms, base, label) {
    const same = live(rooms).filter(r => r.base === base).length;
    return same ? label + ' ' + (same + 1) : label;
  }
  // chattels with counts, as the profile keeps them: "Heat pumps (2)"; a count of 1 is left off
  const chattelText = (name, n) => +n > 1 ? `${name} (${+n})` : name;
  function chattelRead(s) { const m = /^(.*) \((\d{1,3})\)$/.exec(String(s || '')); return m ? [m[1], +m[2]] : [String(s || ''), 1]; }
  // what still has to go to the database: every item whose revision differs from the one last sent
  const dirty = x => !!x && (x.rev || 0) !== (x.srev || 0);
  function pending(v) {
    if (!v) return 0;
    let n = 0;
    if (!v.server) n++;
    if (dirty(v.meta)) n++;
    (v.people || []).forEach(p => { if (dirty(p)) n++; });
    (v.rooms || []).forEach(r => { if (dirty(r)) n++; });
    Object.values(v.facts || {}).forEach(f => { if (dirty(f)) n++; });
    Object.values(v.answers || {}).forEach(a => { if (dirty(a)) n++; });
    return n;
  }
  // one chattels list (Tim, 27 November 2026): the first visit's three lists as the agency agreement says them, the same as the database
  // (fv_chattels_agreement, migration 031): the agreement's own chips, in its order, and everything else in "Anything else staying or going?"
  const CHATTEL_MAP = { 'Fixed floor coverings': 'Fixed floor coverings', 'Blinds': 'Blinds', 'Curtains': 'Curtains', 'Light fittings': 'Light fittings', 'Stove': 'Stove',
    'Rangehood': 'Rangehood', 'Dishwasher': 'Dishwasher', 'Heat pumps': 'Heat pump', 'Extractor fan': 'Extractor fans', 'Smoke detectors': 'Smoke alarms',
    'Garage door remote': 'Garage door remote', 'Clothesline': 'Clothesline', 'Refrigerator': 'Fridge' };
  const AGREEMENT_CHATTELS = ['Fixed floor coverings', 'Blinds', 'Curtains', 'Light fittings', 'Stove', 'Rangehood', 'Dishwasher', 'Heat pump', 'Extractor fans', 'Smoke alarms', 'Garage door remote', 'Clothesline', 'Fridge', 'Washing machine'];
  function chattelsAgreement(std, feat, rem) {
    const arr = x => Array.isArray(x) ? x : [], gone = arr(rem).map(x => chattelRead(x)[0]), stay = [], chips = [], extra = [];
    arr(std).concat(arr(feat)).forEach(x => { const [nm, n] = chattelRead(x); if (gone.includes(nm) || stay.includes(nm)) return; stay.push(nm);
      if (CHATTEL_MAP[nm]) { chips.push(CHATTEL_MAP[nm]); if (n > 1) extra.push(x); } else extra.push(x); });
    const other = [extra.length ? 'Also staying: ' + extra.join(', ') + '.' : '', gone.length ? 'Going with the vendors: ' + gone.join(', ') + '.' : ''].filter(Boolean).join(' ');
    return { chattels: AGREEMENT_CHATTELS.filter(c => chips.includes(c)), chatOther: other || null };
  }
  root.FVC = { bedrooms, wording, nextLabel, chattelText, chattelRead, dirty, pending, chattelsAgreement, CHATTEL_MAP, AGREEMENT_CHATTELS };
})(typeof window !== 'undefined' ? window : globalThis);
