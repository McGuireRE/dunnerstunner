// The appraisal's look changed on 28 November 2026 (the approved sample of 24 November 2026), so a record no longer draws exactly
// as an older core drew it. What must hold instead: nothing is lost.
//   Every piece of text the older core drew is still drawn, as many times as before (counted, not just found somewhere).
//   A piece inside a comparable, a chart, a plan card or the opinion is matched only within that same comparable, chart, plan or
//   opinion on the new page, and only there may a label the new look words differently be excused (each listed below, with what
//   says it now). Section headings the new look renames are excused only as headings. The title is checked as the new heading.
//   Every photo, video and link is still there, and every photo keeps its alt text.
// lost(oldHtml, newHtml) returns what is missing, or [] when nothing is.
const SCOPED_RELABEL = {
  comp: { 'Price': 'the price in large type', 'Date': 'the "Sold ..." line', 'Method': 'the line under the price', 'Days to sell': '"sold in N days" on that line',
    'How near': 'the near tag', 'Capital value': 'the table\'s "Rating valuation" row', 'Agency': 'the line under the price', 'How it compares with your home': 'How it compares with yours' },
  chart: { 'My range': 'My range: $X to $Y', 'Median sale price': 'Median sale price, and the spread around it' },
  plan: { 'incl. GST': 'Including GST.', 'Recommended': 'Recommended for your home' },
  opinion: { 'Your home': 'the line over the range: "... expect your home to sell between"' },
};
// section headings the new look renames (null: dropped, as the sample's letter has no heading)
const HEADINGS = { 'Recent sales nearby': 'Sales and current listings', 'On the market now': 'Sales and current listings', 'Price evidence at a glance': 'The price evidence at a glance',
  'Your home as a listing': 'Your home, as buyers would see it', 'A note from Tim': null };
const VOID = new Set(['img', 'br', 'source', 'input', 'hr', 'wbr', 'meta', 'link']);
const attr = (a, k) => { const m = new RegExp('\\b' + k + '="([^"]*)"').exec(a); return m ? m[1] : null; };
// every piece of text, with the region it sits in (comp:<id>, chart:<name>, plan:<key>, opinion, or rest) and the heading it is in
function parse(html) {
  const out = [], alts = [], files = [], stack = []; let skip = 0;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>|([^<]+)/g; let m;
  const region = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].region) return stack[i].region; return 'rest'; };
  const inTag = t => stack.some(x => x.tag === t);
  while ((m = re.exec(html))) {
    if (m[5] != null) { if (skip) continue; const t = m[5].replace(/\s+/g, ' ').trim(); if (t) out.push({ t, region: region(), h1: inTag('h1'), h2: inTag('h2') }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase(), a = m[3] || '';
    if (m[1]) { const i = stack.map(x => x.tag).lastIndexOf(tag); if (i >= 0) { if (tag === 'title') skip--; stack.length = i; } continue; }
    const alt = attr(a, 'alt'); if (tag === 'img' && alt != null) alts.push(alt);
    ['src', 'href', 'poster'].forEach(k => { const v = attr(a, k); if (v != null && !/^#apv-s\d+$/.test(v)) files.push(k + '=' + v); });
    if (VOID.has(tag) || m[4]) continue;
    const cls = attr(a, 'class') || '';
    let rg = null;
    if (/(^| )apv-comp( |$)/.test(cls) && attr(a, 'data-comp') != null) rg = 'comp:' + attr(a, 'data-comp');
    else if (attr(a, 'data-chart') != null) rg = 'chart:' + attr(a, 'data-chart');
    else if (/(^| )mk-dots( |$)/.test(cls)) rg = 'chart:dots';
    else if (/(^| )apv-plan( |$)/.test(cls) && attr(a, 'data-plan') != null) rg = 'plan:' + attr(a, 'data-plan');
    else if (/(^| )apv-opinion( |$)/.test(cls)) rg = 'opinion';
    if (tag === 'title') skip++;
    stack.push({ tag, region: rg });
  }
  return { pieces: out, alts, files };
}
// a multiset of strings
const bag = list => { const b = new Map(); list.forEach(x => b.set(x, (b.get(x) || 0) + 1)); return b; };
const take = (b, x) => { const n = b.get(x) || 0; if (!n) return false; b.set(x, n - 1); return true; };
// inside a comparable, chart, plan or the opinion, a new piece may join several old ones ("Sold 1 October 2026, Deadline sale, ..."):
// its parts, split at commas and full stops, count too
const parts = t => [t].concat(t.split(/,\s+/).length > 1 ? t.split(/,\s+/) : [], t.split(/(?<=\.)\s+/).length > 1 ? t.split(/(?<=\.)\s+/) : []);
function lost(oldHtml, newHtml) {
  const O = parse(oldHtml), N = parse(newHtml), miss = [];
  const kindOf = r => r.split(':')[0];
  // the new page's pieces, region by region; scoped regions also hold the parts of joined pieces
  const byRegion = {};
  N.pieces.forEach(p => { const b = (byRegion[p.region] ||= new Map()); (p.region === 'rest' ? [p.t] : parts(p.t)).forEach(x => b.set(x, (b.get(x) || 0) + 1)); });
  const newH1 = N.pieces.filter(p => p.h1).map(p => p.t).join(' '), newH2 = new Set(N.pieces.filter(p => p.h2).map(p => p.t));
  const kick = (N.pieces.find(p => /^Appraisal( · |$)/.test(p.t)) || {}).t || '';
  O.pieces.forEach(p => {
    const b = byRegion[p.region] || new Map(), k = kindOf(p.region);
    if (p.h1) { const ok = newH1 === p.t || (/: Market Appraisal$/.test(p.t) && newH1 === p.t.replace(/: Market Appraisal$/, '') && !!kick); if (!ok) miss.push('title: ' + p.t + ' (now ' + newH1 + ')'); return; }
    if (take(b, p.t)) return;
    if (p.h2 && Object.prototype.hasOwnProperty.call(HEADINGS, p.t) && (HEADINGS[p.t] === null || newH2.has(HEADINGS[p.t]))) return;
    if (k !== 'rest') {
      if (SCOPED_RELABEL[k] && Object.prototype.hasOwnProperty.call(SCOPED_RELABEL[k], p.t)) return;
      const alt = [];
      if (k === 'comp') { const s = /^Sold for (.+)$/.exec(p.t), l = /^Listed (.+)$/.exec(p.t); if (s) alt.push(s[1]); if (l) alt.push('On the market since ' + l[1]); if (/^\d+ days$/.test(p.t)) alt.push('sold in ' + p.t); }
      if (k === 'chart' && /Your range/.test(p.t)) alt.push(p.t.replace(/Your range/g, 'My range'));
      if (alt.some(x => take(b, x))) return;
    }
    miss.push('text' + (p.region === 'rest' ? '' : ' in ' + p.region) + ': ' + p.t);
  });
  const na = bag(N.alts); O.alts.forEach(a => { if (!take(na, a)) miss.push('alt text: ' + a); });
  const nf = new Set(N.files); O.files.forEach(f => { if (!nf.has(f)) miss.push('file or link: ' + f); });
  return miss;
}
module.exports = { lost, SCOPED_RELABEL, HEADINGS, parse };
