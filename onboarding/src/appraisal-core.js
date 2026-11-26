// Appraisal views (migration 032): draws one appraisal record (sections in JSON, plus the fields Tim edits) as plain HTML.
// No database, no page state: the portal page in app.js loads the record, draws it with APPR.render and saves the fields.
// This is the seed of the full Appraisal page, so nothing here knows about any one property.
//
// Section types: heading, para (cls 'lede' for the opening), list (ordered), table (head, rows), note (small print),
// ranges (the options table from fields.ranges), method (the recommended method's sentence), wave (the buyer-wave graph),
// methods (the ways-to-sell table, with the recommended one marked).
// Text may hold **bold**, [words](https://link), a bare https:// link, and the tokens {{range:<key>}}, {{bedrooms}} and {{method}}.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dollars = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-NZ');
  const fmtRange = r => r ? dollars(r.low) + ' to ' + dollars(r.high) : '';
  const rangeOf = (f, k) => ((f && f.ranges) || []).find(r => r && String(r.key) === String(k));
  // the wording rules for anything a vendor sees: condition is "current condition", never "as is"; no fee or commission
  const BANNED = [/\bas[\s-]+is\b/i, /\bfees?\b/i, /\bcommissions?\b/i];
  const wordingProblem = t => { const s = String(t || ''); if (BANNED[0].test(s)) return 'Please write "current condition" rather than "as is".'; if (BANNED[1].test(s) || BANNED[2].test(s)) return 'Fees and commission are never shown on an appraisal.'; return ''; };

  // one line of text: escaped first, then tokens, bold and links
  function inline(text, f) {
    let s = esc(text);
    s = s.replace(/\{\{range:([A-Za-z0-9_-]{1,20})\}\}/g, (m, k) => { const r = rangeOf(f, k); return r ? '<span class="apv-fig" data-range="' + esc(k) + '">' + esc(fmtRange(r)) + '</span>' : ''; });
    s = s.replace(/\{\{bedrooms\}\}/g, () => '<span data-f="bedrooms">' + esc((f && f.bedrooms) || '') + '</span>');
    s = s.replace(/\{\{method\}\}/g, () => '<span data-f="method">' + esc(((f && f.method) || {}).name || '') + '</span>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, (m, a, u) => a + '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>');
    return s;
  }
  // a table that never scrolls sideways: on a phone each row becomes a card, each cell labelled by its column
  function table(head, rows, opts) {
    const o = opts || {};
    return '<table class="apv-tbl' + (o.cls ? ' ' + o.cls : '') + '">' + (head && head.length ? '<thead><tr>' + head.map(h => '<th scope="col">' + inline(h, o.f) + '</th>').join('') + '</tr></thead>' : '')
      + '<tbody>' + rows.map((r, i) => '<tr' + (o.rowAttr ? o.rowAttr(r, i) : '') + '>' + r.map((c, j) => '<td data-h="' + esc(head && head[j] ? String(head[j]).replace(/\*\*/g, '') : '') + '">' + (j === 0 && o.firstExtra ? o.firstExtra(r, i) : '') + inline(c, o.f) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  function wave(sec) {
    const bars = (sec.bars || []).filter(b => b && isFinite(+b.pct));
    const peak = Math.max(1, ...bars.map(b => +b.pct)); const mk = +sec.marker || 0;
    const early = bars.slice(0, mk).reduce((s, b) => s + (+b.pct), 0);
    const sub = String(sec.subtitle || '').replace(/\{\{early\}\}/g, String(early));
    const cols = bars.map((b, i) => '<div class="apv-wcol' + (i < mk ? ' on' : '') + (mk && i === mk ? ' after-mark' : '') + '"><div class="apv-wbar-wrap"><span class="apv-wpct">' + esc(b.pct) + '%</span><div class="apv-wbar" style="height:' + Math.round(+b.pct / peak * 100) + '%" title="' + esc((b.label || '') + ': about ' + b.pct + '% of interested buyers') + '"></div></div><span class="apv-wlab">' + esc(b.label) + '</span></div>').join('')
      + (sec.tail ? '<div class="apv-wcol tail"><div class="apv-wbar-wrap"><span class="apv-wtrickle">' + esc(sec.trickle || '') + '</span><div class="apv-wdots"></div></div><span class="apv-wlab">' + esc(sec.tail) + '</span></div>' : '');
    return '<figure class="apv-wave" role="img" aria-label="' + esc(sec.title || '') + '"><figcaption><strong>' + esc(sec.title || '') + '</strong><span>' + esc(sub) + '</span></figcaption>'
      + (mk ? '<p class="apv-wmark">' + esc(sec.markerLabel || '') + '</p>' : '')
      + '<div class="apv-wgrid" style="--mk:' + mk + ';--n:' + (bars.length + (sec.tail ? 1 : 0)) + '">' + cols + '</div>'
      + (sec.caption ? '<p class="apv-wcap">' + inline(sec.caption) + '</p>' : '') + '</figure>';
  }
  const methodMatch = (name, rowName) => !!name && String(rowName || '').toLowerCase().indexOf(String(name).toLowerCase()) === 0;
  function section(sec, f) {
    if (!sec || typeof sec !== 'object') return '';
    switch (sec.type) {
      case 'heading': return '<h2>' + inline(sec.text, f) + '</h2>';
      case 'para': return '<p' + (sec.cls === 'lede' ? ' class="apv-lede"' : '') + '>' + inline(sec.text, f) + '</p>';
      case 'note': return '<p class="apv-note">' + inline(sec.text, f) + '</p>';
      case 'byline': return '<p class="apv-by">' + inline(sec.text, f) + '</p>';
      case 'list': { const t = sec.ordered ? 'ol' : 'ul'; return '<' + t + ' class="apv-list">' + (sec.items || []).map(x => '<li>' + inline(x, f) + '</li>').join('') + '</' + t + '>'; }
      case 'table': return table(sec.head || [], sec.rows || [], { f });
      case 'ranges': return table(sec.head || ['Option', 'What it involves', 'Range'], ((f && f.ranges) || []).map(r => [r.option || '', r.involves || '', fmtRange(r)]),
        { f, cls: 'apv-ranges', rowAttr: (r, i) => ' data-range-row="' + esc(((f.ranges || [])[i] || {}).key || '') + '"' });
      case 'method': return '<p class="apv-method" data-f="method-text">' + inline(((f && f.method) || {}).text || '', f) + '</p>';
      case 'methods': { const nm = ((f && f.method) || {}).name;
        return table(sec.head || [], sec.rows || [], { f, cls: 'apv-methods', rowAttr: r => methodMatch(nm, r[0]) ? ' class="apv-rec"' : '', firstExtra: r => methodMatch(nm, r[0]) ? '<span class="apv-tag">Recommended</span> ' : '' }); }
      case 'wave': return wave(sec);
      default: return '';
    }
  }
  function render(rec) {
    const f = (rec && rec.fields) || {};
    return '<article class="apv-doc"><h1>' + esc((rec && rec.title) || 'Market appraisal') + '</h1>' + ((rec && rec.sections) || []).map(s => section(s, f)).join('') + '</article>';
  }
  // the method names for the editor: the first cell of each row of the ways-to-sell table, up to its first comma
  function methodNames(rec) {
    const s = ((rec && rec.sections) || []).find(x => x && x.type === 'methods');
    return s ? (s.rows || []).map(r => String(r[0] || '').split(',')[0].trim()).filter(Boolean) : [];
  }
  // checks the fields Tim typed; returns a problem in plain words, or ''
  function checkFields(f) {
    for (const r of (f.ranges || [])) {
      if (!(r.low > 0 && r.high > 0)) return 'Each range needs a low and a high figure.';
      if (r.low >= r.high) return 'The low figure must be below the high figure (' + (r.option || r.key) + ').';
    }
    if (!String(f.bedrooms || '').trim()) return 'Bedrooms can\'t be empty.';
    return wordingProblem(f.bedrooms) || wordingProblem((f.method || {}).name) || wordingProblem((f.method || {}).text);
  }
  window.APPR = { render, fmtRange, dollars, inline, methodNames, checkFields, wordingProblem };
})();
