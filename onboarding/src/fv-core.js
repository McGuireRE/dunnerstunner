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
  root.FVC = { bedrooms, wording, nextLabel, chattelText, chattelRead, dirty, pending };
})(typeof window !== 'undefined' ? window : globalThis);
