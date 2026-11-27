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
      // LW3 phase A (033): the sections the set-up page writes
      case 'opinion': return opinion(sec, f);
      case 'campaign': return '<div class="apv-camp' + ((sec.bars || []).length + (sec.tail ? 1 : 0) > 9 ? ' dense' : '') + '">' + wave(sec) + '</div>';
      case 'methodcards': return methodCards(sec);
      case 'plans': return plans(sec);
      case 'panel': return '<aside class="apv-panel"><h2>' + inline(sec.title, f) + '</h2>' + (sec.items || []).map(x => '<p>' + inline(x, f) + '</p>').join('') + '</aside>';
      default: return '';
    }
  }
  // the opinion of price: one row per part Tim appraised, always labelled as an appraisal, not a registered valuation
  const VALUATION_LABEL = 'This is an appraisal, not a registered valuation: my opinion of the range buyers are likely to pay, from recent sales and the market today.';
  function opinion(sec, f) {
    const rs = ((f && f.ranges) || []).filter(r => r && r.low > 0 && r.high > 0);
    const body = rs.length === 1 && !sec.table
      ? '<p class="apv-opin"><span class="apv-opin-part">' + inline(rs[0].option || '', f) + '</span><span class="apv-fig apv-opin-fig" data-range="' + esc(rs[0].key) + '">' + esc(fmtRange(rs[0])) + '</span></p>'
      : table(sec.head || ['Part', 'Where I would expect buyers to land'], rs.map(r => [r.option || '', fmtRange(r)]), { f, cls: 'apv-ranges', rowAttr: (r, i) => ' data-range-row="' + esc((rs[i] || {}).key || '') + '"' });
    return '<div class="apv-opinion">' + body + '<p class="apv-valn">' + esc(VALUATION_LABEL) + '</p></div>';
  }
  // every sale method explained, as points that open; the recommended one marked and open (in print, every one is open)
  function methodCards(sec) {
    return '<div class="apv-mcs">' + (sec.items || []).map(m => { const rec = m.key === sec.rec;
      return '<details class="apv-mc' + (rec ? ' apv-rec' : '') + '" data-method="' + esc(m.key) + '"' + (rec ? ' open' : '') + '><summary>' + (rec ? '<span class="apv-tag">Recommended</span> ' : '') + '<strong>' + esc(m.name) + '</strong></summary>'
        + '<dl><dt>How it works</dt><dd>' + inline(m.how) + '</dd><dt>What it suits</dt><dd>' + inline(m.suits) + '</dd><dt>Worth knowing</dt><dd>' + inline(m.know) + '</dd></dl></details>'; }).join('') + '</div>';
  }
  // the marketing plans as cards that swipe sideways inside their own strip (the page itself never scrolls sideways); Tim's pick first
  function plans(sec) {
    const cards = (sec.items || []).map(p => '<div class="apv-plan' + (p.rec ? ' apv-rec' : '') + '" data-plan="' + esc(p.key) + '">' + (p.rec ? '<span class="apv-tag">Recommended</span>' : '')
      + '<h3>' + esc(p.name) + '</h3>' + (p.price ? '<p class="apv-plan-price">' + esc(dollars(p.price)) + ' <span>incl. GST</span></p>' : '') + (p.tagline ? '<p>' + inline(p.tagline) + '</p>' : '')
      + ((p.items || []).length ? '<ul>' + p.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>').join('');
    return '<div class="apv-plans" role="list">' + cards + '</div>' + (sec.included ? '<p class="apv-note">' + inline(sec.included) + '</p>' : '');
  }

  /* ───────── LW3 phase A: writing the standard sections from Tim's set-up ───────── */
  // the sale methods, in the order they are explained on every appraisal
  const METHODS = [
    { key: 'deadline', name: 'Deadline sale', mark: 'Offers due', how: 'Buyers make their offers by a set date and time. You can still accept an offer before the deadline if it suits you.', suits: 'Most homes. It gathers the first wave of buyers to one decision point, which builds urgency.', know: 'Offers can carry conditions, such as finance or a building report. You choose the offer that suits you best, or none.' },
    { key: 'tender', name: 'Tender', mark: 'Tenders close', how: 'Buyers make sealed offers by a closing date. No buyer sees another buyer\'s offer.', suits: 'Unusual or high-end homes, and sellers who value privacy.', know: 'Because buyers can\'t see each other\'s offers, each tends to put their best offer forward. You choose one, or decline them all.' },
    { key: 'auction', name: 'Auction', mark: 'Auction day', how: 'Buyers bid in the open on auction day. Once bidding passes your reserve, the highest bid buys the home.', suits: 'Homes with strong demand, where buyers competing in the room lifts the price.', know: 'A sale at auction is unconditional, so buyers arrange their finance and reports beforehand. You set the reserve, and can accept an offer before the day.' },
    { key: 'eoi', name: 'Expressions of interest', mark: 'Expressions of interest close', how: 'Buyers register their interest, and what they would offer, by a closing date. We then work with the best of them on the terms.', suits: 'Properties with a narrow pool of buyers, or where buyers may see different uses for it.', know: 'It keeps the conversation open: we can go back to one or more buyers to firm up the price and terms.' },
    { key: 'negotiation', name: 'Negotiation, with or without an asking price', short: 'Negotiation', mark: '', how: 'The home is marketed, with or without an asking price, and buyers make offers whenever they are ready.', suits: 'Homes in a steady market, and sellers happy to take their time.', know: 'With no set date there is less urgency, so offers can be slower to come. An asking price can also set a ceiling on what buyers offer.' },
  ];
  const methodOf = k => METHODS.find(m => m.key === k) || METHODS[0];
  // campaign lengths: the buyer-visit curve for each (about 80% of buyers in the first wave)
  const CAMPAIGNS = {
    standard: { label: 'Standard home', unit: 'Week', bars: [35, 25, 15, 5], mark: 3,
      caption: 'About 80% of the buyers who will look at your home come in the first wave, in the first three to four weeks. After that it is a trickle, so the campaign is built around those first weeks.' },
    larger: { label: 'Larger or high-end home', unit: 'Week', bars: [20, 16, 13, 11, 8, 6, 4, 2], mark: 6,
      caption: 'Larger and high-end homes draw fewer buyers over a longer curve: about 80% of them come in the first six to eight weeks.' },
    land: { label: 'Section or bare land', unit: 'Month', bars: [25, 18, 13, 10, 8, 6], mark: 5,
      caption: 'Sections and bare land are a long game: at present it takes about six months to reach 80% of buyers. Banks lend against more than bare land, so a building platform, services, plans, consents and a builder lined up add certainty and value.' },
  };
  const MAX_WEEKS = 26;
  // any number of weeks: a falling curve over that many weeks that adds up to 80
  function weeksBars(n) {
    n = Math.max(1, Math.min(MAX_WEEKS, Math.round(+n) || 1));
    if (n === 1) return [80];
    const r = 0.75, w = Array.from({ length: n }, (_, i) => Math.pow(r, i)), tot = w.reduce((s, x) => s + x, 0);
    const b = w.map(x => Math.max(1, Math.round(x / tot * 80)));
    b[0] += 80 - b.reduce((s, x) => s + x, 0);   // the rounding lands on the first week
    return b;
  }
  function campaignOf(c) {
    const k = (c && c.kind) || 'standard';
    if (k === 'weeks') { const n = Math.max(1, Math.min(MAX_WEEKS, Math.round(+(c && c.weeks)) || 1)); return { kind: k, unit: 'Week', bars: weeksBars(n), mark: Math.max(1, Math.min(n, Math.round(n * 0.75))), n,
      caption: 'About 80% of the buyers who will look come in the first ' + (n === 1 ? 'week' : n + ' weeks') + ', most of them early. After that it is a trickle.' }; }
    const d = CAMPAIGNS[k] || CAMPAIGNS.standard; return Object.assign({ kind: CAMPAIGNS[k] ? k : 'standard', n: d.bars.length }, d);
  }
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  // when the sale closes, in words: after the third open home on a standard home, otherwise by week or month
  const closeWords = cp => cp.kind === 'standard' ? 'after the ' + ORD[cp.mark - 1] + ' open home' : 'in ' + cp.unit.toLowerCase() + ' ' + cp.mark;
  // the buyer-visit chart for a campaign and method: the marker and its label follow the method (negotiation has no closing day)
  function waveFor(c, methodKey) {
    const cp = campaignOf(c), m = methodOf(methodKey), mk = m.mark ? cp.mark : 0;
    return { type: 'campaign', title: 'Most buyers come early', subtitle: mk ? '{{early}}% of interested buyers visit by ' + cp.unit.toLowerCase() + ' ' + mk : 'About 80% of interested buyers visit in the first ' + (cp.bars.length === 1 ? cp.unit.toLowerCase() : cp.bars.length + ' ' + cp.unit.toLowerCase() + 's'),
      bars: cp.bars.map((p, i) => ({ label: cp.unit + ' ' + (i + 1), pct: p })), marker: mk, markerLabel: mk ? m.mark + ' ' + closeWords(cp) : '',
      trickle: 'then a trickle', tail: cp.unit + ' ' + (cp.bars.length + 1) + ' on', caption: cp.caption };
  }
  // the steps of the campaign, ending the way the method ends
  function stepsFor(c, methodKey) {
    const cp = campaignOf(c), m = methodOf(methodKey), when = closeWords(cp);
    const first = ['Your home goes to market with its photos, advertising and signs ready on day one', 'Open homes through the first ' + (cp.unit === 'Month' ? 'months' : 'weeks') + ', when most buyers come'];
    const end = {
      deadline: ['Offers due ' + when, 'You choose the offer that suits you best, or none'],
      tender: ['Tenders close ' + when, 'You choose the tender that suits you best, or none'],
      auction: ['Buyers arrange their finance and reports before the day', 'Auction day ' + when + ': once bidding passes your reserve, the highest bid buys'],
      eoi: ['Expressions of interest close ' + when, 'We firm up the price and terms with the buyer, or buyers, who suit you best'],
      negotiation: ['Offers any time: I bring every one to you', 'You accept, counter or decline each offer'],
    }[m.key];
    return { type: 'list', ordered: true, items: first.concat(end) };
  }
  function methodSentence(c, methodKey) {
    const cp = campaignOf(c), when = closeWords(cp);
    return {
      deadline: 'I\'d recommend a deadline sale, with offers due ' + when + ', once the first wave of buyers has been through.',
      tender: 'I\'d recommend a tender, closing ' + when + ', once the first wave of buyers has been through.',
      auction: 'I\'d recommend an auction ' + when + ', while the first wave of buyers is at its strongest.',
      eoi: 'I\'d recommend expressions of interest, closing ' + when + ', so we can work with the best of the buyers on the terms.',
      negotiation: 'I\'d recommend selling by negotiation, so buyers can make offers as soon as they are ready.',
    }[methodOf(methodKey).key];
  }
  // where Tim lives is mentioned only on Pine Hill, Liberton and Dalmore appraisals (Tim, 24 November 2026)
  const HILL = ['pine hill', 'liberton', 'dalmore'];
  const isHill = s => HILL.includes(String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim());
  const DALMORE_LINE = 'He lives in Dalmore and knows the buyers who look here, and his sales in Pine Hill, Liberton and Dalmore consistently run well above the local median.';
  const HEAD_AND_SHOULDERS = 'Interview as many agents as you like: Tim stands head and shoulders above the rest for his personal service, his strength as a negotiator, and his knack for winning almost anyone over.';
  // the suburb from an address: the part after the street, without the city or postcode ("7 Sample Street, Liberton, Dunedin 9010" is Liberton)
  function suburbOf(address) {
    const parts = String(address || '').split(',').map(s => s.replace(/\b\d{4}\b/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rest = parts.slice(1).filter(s => !/^(dunedin|new zealand|nz|otago)$/i.test(s));
    return rest[0] || '';
  }
  const DEFAULT_NOTE = 'Thank you for having me through your home, and for telling me what matters to you. This is my appraisal: where I think buyers will land, how I would sell it, and the marketing I would suggest.\n\nAny questions at all, call or text me on 027 562 7207.';
  // the marketing plans from the shared catalogue (catalogue.js: PACKAGES and ITEMS), Tim's pick first and marked
  function plansFor(pick, cat) {
    const P = (cat && cat.PACKAGES) || {}, I = (cat && cat.ITEMS) || {};
    const itemName = (k, q) => { const i = k === 'TM' ? { name: 'Trade Me Platinum listing' } : I[k]; return i ? i.name + (q > 1 ? ' × ' + q : '') : ''; };
    const list = Object.keys(P).map(k => ({ key: k, name: P[k].name, price: P[k].price, tagline: P[k].tagline, items: Object.entries(P[k].items || {}).map(([i, q]) => itemName(i, q)).filter(Boolean), rec: k === pick }));
    list.push({ key: 'custom', name: 'Build your own', price: 0, tagline: 'We choose each part of the campaign together, item by item, from the same price list, so you pay only for what suits your home.', items: [], rec: pick === 'custom' });
    const rec = list.filter(x => x.rec), rest = list.filter(x => !x.rec);
    return rec.concat(rest);
  }
  const longDate = d => { const x = d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d) : new Date(); return x.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' }); };
  // checks Tim's set-up; returns a problem in plain words, or ''
  function checkSetup(s, ranges) {
    const rs = ranges || [];
    if (!rs.length) return 'Add a range for at least one part.';
    for (const r of rs) {
      if (!String(r.option || '').trim()) return 'Give each part a name, such as "Your home".';
      if (!(r.low > 0 && r.high > 0)) return 'Each range needs a low and a high figure (' + r.option + ').';
      if (r.low >= r.high) return 'The low figure must be below the high figure (' + r.option + ').';
    }
    const c = s.campaign || {};
    if (!['standard', 'larger', 'land', 'weeks'].includes(c.kind)) return 'Choose how long the campaign should be.';
    if (c.kind === 'weeks' && !(Math.round(+c.weeks) >= 1 && Math.round(+c.weeks) <= MAX_WEEKS)) return 'Choose a number of weeks from 1 to ' + MAX_WEEKS + '. For longer, choose sections and bare land.';
    if (!METHODS.some(m => m.key === s.method)) return 'Choose the sale method you recommend.';
    if (s.basis && s.basis !== 'comparables') return 'Only comparables can be used for now.';
    if (!s.plan) return 'Choose the marketing plan you recommend.';
    for (const t of [s.note, s.methodText, s.suburbLink, s.preparedFor].concat(rs.map(r => r.option))) { const w = wordingProblem(t); if (w) return w; }
    return '';
  }
  // writes the standard sections, in the agreed order, from the set-up. ctx: { address, preparedOn, cat: { PACKAGES, ITEMS, CATALOGUE } }
  // Returns { title, sections, fields }. Nothing is priced here: every figure is one Tim typed.
  function writeStandard(s, ranges, ctx) {
    const c = ctx || {}, m = methodOf(s.method), who = String(s.preparedFor || '').trim();
    const fields = { ranges: (ranges || []).map((r, i) => ({ key: r.key || String.fromCharCode(65 + i), option: String(r.option || '').trim(), involves: '', low: Math.round(+r.low), high: Math.round(+r.high) })),
      method: { name: m.short || m.name, key: m.key, text: String(s.methodText || '').trim() || methodSentence(s.campaign, m.key) } };
    const note = String(s.note == null ? DEFAULT_NOTE : s.note).split(/\n\s*\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const panel = [HEAD_AND_SHOULDERS];
    if (isHill(s.suburb)) panel.push(DALMORE_LINE);
    else if (String(s.suburbLink || '').trim()) panel.push(String(s.suburbLink).trim());
    const inc = c.cat && c.cat.CATALOGUE && c.cat.CATALOGUE[0] ? 'Every plan includes: ' + c.cat.CATALOGUE[0].items.map(i => i.name).join(', ') + '.' : '';
    const sections = [
      { type: 'byline', text: (who ? 'Prepared for ' + who + ' by Tim McGuire' : 'Prepared by Tim McGuire') + ', McGuire Real Estate, ' + longDate(c.preparedOn) },
    ].concat(note.length ? [{ type: 'heading', text: 'A note from Tim' }] : [], note.map((t, i) => i === 0 ? { type: 'para', cls: 'lede', text: t } : { type: 'para', text: t }), [
      { type: 'heading', text: 'My opinion of price' },
      { type: 'opinion' },
      { type: 'heading', text: 'How I would sell it' },
      { type: 'method' },
      waveFor(s.campaign, m.key),
      stepsFor(s.campaign, m.key),
      { type: 'heading', text: 'Every way to sell, explained' },
      { type: 'para', text: 'Whichever way you choose, you should know how each one works. My recommendation is marked.' },
      { type: 'methodcards', rec: m.key, items: METHODS.map(x => ({ key: x.key, name: x.name, how: x.how, suits: x.suits, know: x.know })) },
      { type: 'heading', text: 'Marketing plans' },
      { type: 'plans', items: plansFor(s.plan, c.cat), included: inc },
      { type: 'panel', title: 'Tim is not like other agents', items: panel },
    ]);
    return { title: (c.address ? c.address + ': ' : '') + 'Market Appraisal', sections, fields };
  }
  // anything in what was written that a vendor would read and must never see
  function sectionsProblem(sections) { const out = []; const walk = v => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(sections); return wordingProblem(out.join(' ')); }
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
  window.APPR = { render, fmtRange, dollars, inline, methodNames, checkFields, wordingProblem,
    METHODS, CAMPAIGNS, MAX_WEEKS, campaignOf, waveFor, stepsFor, methodSentence, isHill, suburbOf, plansFor, checkSetup, writeStandard, sectionsProblem,
    DEFAULT_NOTE, DALMORE_LINE, HEAD_AND_SHOULDERS, VALUATION_LABEL };
})();
