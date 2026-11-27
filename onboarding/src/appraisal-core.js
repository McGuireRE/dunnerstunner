// Appraisal views (migration 032): draws one appraisal record (sections in JSON, plus the fields Tim edits) as plain HTML.
// No database, no page state: the portal page in app.js loads the record, draws it with APPR.render and saves the fields.
// This is the seed of the full Appraisal page, so nothing here knows about any one property.
//
// Section types: heading, para (cls 'lede' for the opening), list (ordered), table (head, rows), note (small print),
// ranges (the options table from fields.ranges), method (the recommended method's sentence), wave (the buyer-wave graph),
// methods (the ways-to-sell table, with the recommended one marked). Phase A (033): byline, opinion, campaign, methodcards, plans,
// panel. Phase B (036): header, intro, heard, home, buyers, reviews (each with a stage, and nothing drawn when empty).
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
  function section(sec, f, ev) {
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
      // LW3 phase B (036): each draws its own heading, and nothing at all when it has nothing to show (Tim, 28 November 2026)
      case 'header': return hero(sec, ev);
      case 'intro': return intro(sec, ev);
      case 'heard': return heard(sec, f);
      case 'home': return home(sec, ev);
      case 'buyers': return buyers(sec, f);
      case 'reviews': return reviews(sec, ev);
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
    // LW3 phase B (036): only what Tim has ticked or uploaded is written; with none of it, the sections are exactly as phase A wrote them
    const b = phaseB(s), at = sections.findIndex(x => x.type === 'heading' && x.text === 'My opinion of price');
    if (b.header) sections.unshift(b.header);
    sections.splice(at + (b.header ? 1 : 0), 0, ...b.before);
    if (b.reviews) sections.push(b.reviews);
    return { title: (c.address ? c.address + ': ' : '') + 'Market Appraisal', sections, fields };
  }

  /* ───────── LW3 phase B (036): the header, a video introduction, What I heard from you, their home as a mockup listing, the
     ideal buyers and Google reviews. Each section carries the stage of the presentation it belongs to (LW4), draws its own heading,
     and draws nothing at all when it has nothing to show (Tim, 28 November 2026). ───────── */
  const STAGES = { header: 1, intro: 1, heard: 1, home: 2, buyers: 2, reviews: 3 };
  const MOCKUP_LABEL = 'A mockup of how your listing could look, to show you how I would present your home. It is not live, and nothing has been advertised.';
  const LIBRARY_CREDIT = 'DunedinNZ';
  const VIDEO_URL = /\.(mp4|webm|mov)(?:[?#]|$)/i;
  const httpsUrl = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '').trim()) && String(u).length <= 1000;
  const num0 = (v, lo, hi, d) => { const n = +v; return isFinite(n) && v !== '' && v != null ? Math.max(lo, Math.min(hi, n)) : d; };
  // the header clip (Tim, 28 November 2026, 9:22am): a segment of 4 to 12 seconds (8 unless Tim sets it), played slowly (0.5 to 1.0,
  // 0.6 unless Tim sets it). A file the browser can't shorten is accepted only up to 12 seconds and 50 MB.
  const CLIP = { min: 4, max: 12, len: 8, speedMin: 0.5, speedMax: 1, speed: 0.6, maxBytes: 50 * 1024 * 1024, width: 1280 };
  const clipSpeed = v => Math.round(num0(v, CLIP.speedMin, CLIP.speedMax, CLIP.speed) * 100) / 100;
  // a segment length Tim typed: the number, or '' when it is outside 4 to 12 seconds
  const clipLen = v => { const n = +v; return v !== '' && v != null && isFinite(n) && n >= CLIP.min && n <= CLIP.max ? n : ''; };
  const paras = t => String(t || '').split(/\n\s*\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // the facts a mockup listing may show, in the order a listing shows them. Never the owners (Relab), rates, valuations, the title or
  // legal description, and never the bedroom count on its own: the room wording comes only from Tim's call on each room (FVC.wording).
  const HOME_FACTS = [['pType', 'Type'], ['living_dining', 'Living and dining'], ['pBath', 'Bathrooms'], ['ensuites', 'Ensuites'], ['toilets', 'Toilets'],
    ['pFloor', 'Floor area'], ['pLand', 'Land area'], ['levels', 'Levels'], ['pYear', 'Year built'], ['pBuild', 'Construction'], ['pHeat', 'Heating'],
    ['garaging', 'Garaging'], ['parking_spaces', 'Parking spaces'], ['pPark', 'Parking'], ['extra_spaces', 'Extra spaces'], ['outdoor', 'Outdoors'], ['outlook', 'Outlook'], ['title_type', 'Title']];
  const HOME_FACT_KEYS = HOME_FACTS.map(x => x[0]);
  // the facts on offer for the mockup, from the property profile (028): only the keys above, only a chosen value, never one from Relab.
  // wording: FVC.wording(rooms), Tim's call on each room, shown first as "Rooms". Returns [{ key, label, value }].
  function homeFacts(facts, wording) {
    const out = [];
    if (String(wording || '').trim()) out.push({ key: 'rooms', label: 'Rooms', value: String(wording).trim() });
    HOME_FACTS.forEach(([k, label]) => { const x = (facts || []).find(y => y && y.key === k && y.value_id && y.source !== 'relab');
      if (!x) return; let v = x.display || (Array.isArray(x.value) ? x.value.join(', ') : x.value);
      v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); if (!v || /^(unknown|n\/?a|none|-)$/i.test(v)) return;
      if ((k === 'pFloor' || k === 'pLand') && /^\d+(\.\d+)?$/.test(v)) v = Number(v).toLocaleString('en-NZ') + ' m²';
      out.push({ key: k, label, value: v }); });
    // parking once: the count when there is one, otherwise the description
    return out.some(x => x.key === 'parking_spaces') ? out.filter(x => x.key !== 'pPark') : out;
  }
  const tickedLines = h => ((h && h.lines) || []).filter(l => l && l.ticked && String(l.text || '').trim()).map(l => String(l.text).replace(/\s+/g, ' ').trim());
  // the phase B sections from the set-up: { header, before: [the sections that go before the opinion of price], reviews }
  function phaseB(s) {
    const o = { header: null, before: [], reviews: null }, ho = s.headerOpt || {};
    const frame = { focus: { x: num0((ho.focus || {}).x, 0, 100, 50), y: num0((ho.focus || {}).y, 0, 100, 50) }, zoom: num0(ho.zoom, 1, 3, 1), bright: num0(ho.bright, 0.5, 1.5, 1) };
    if (s.header === 'own' ? !!ho.asset : httpsUrl(ho.url)) {
      o.header = s.header === 'own'
        ? Object.assign({ type: 'header', stage: STAGES.header, src: 'asset', asset: String(ho.asset), kind: ho.kind === 'video' ? 'video' : 'image', credit: String(ho.credit || '').replace(/\s+/g, ' ').trim().slice(0, 120) }, frame)
        : Object.assign({ type: 'header', stage: STAGES.header, src: 'library', url: String(ho.url).trim(), kind: VIDEO_URL.test(ho.url) ? 'video' : 'image', credit: LIBRARY_CREDIT }, frame);
      // a video header is a short slow loop (Tim, 28 November 2026, 9:22am): its playback speed, 0.5 to 1.0, 0.6 unless Tim sets it
      if (o.header.kind === 'video') o.header.speed = clipSpeed(ho.speed);
    }
    if (s.intro && s.intro.asset) o.before.push({ type: 'intro', stage: STAGES.intro, asset: String(s.intro.asset) });
    const lines = tickedLines(s.heard);
    if (lines.length) o.before.push({ type: 'heard', stage: STAGES.heard, items: lines });
    const hm = s.home || {}, ad = hm.ad && hm.ad.ticked && (String(hm.ad.title || '').trim() || String(hm.ad.body || '').trim()) ? { title: String(hm.ad.title || '').replace(/\s+/g, ' ').trim(), paras: paras(hm.ad.body) } : null;
    const photos = (hm.photos || []).filter(Boolean).map(String);
    if (hm.on && (photos.length || ad)) o.before.push({ type: 'home', stage: STAGES.home, label: MOCKUP_LABEL, photos,
      details: (hm.details || []).filter(d => Array.isArray(d) && String(d[0] || '').trim() && String(d[1] || '').trim()).map(d => [String(d[0]), String(d[1])]), ad });
    const by = s.buyers || {};
    if (by.ticked && (String(by.text || '').trim() || (by.tags || []).length)) o.before.push({ type: 'buyers', stage: STAGES.buyers, text: String(by.text || '').trim(), tags: (by.tags || []).map(t => String(t).trim()).filter(Boolean) });
    if (s.reviews && s.reviews.on) o.reviews = { type: 'reviews', stage: STAGES.reviews, max: 6 };
    return o;
  }
  // checks the sections screen before saving; returns a problem in plain words, or ''. Every line is checked, ticked or not: the
  // database's wording guard reads the whole set-up, so a line saying "as is" or naming a fee can't even be kept as a draft.
  function checkSections(s) {
    const ho = s.headerOpt || {};
    if (s.header !== 'own' && String(ho.url || '').trim() && !httpsUrl(ho.url)) return 'The header link must start with https:// and be the link to the photo or video itself.';
    const hm = s.home || {}, by = s.buyers || {}, ad = hm.ad || {};
    const named = [].concat(((s.heard && s.heard.lines) || []).map((l, i) => ['Line ' + (i + 1) + ' of What I heard', l && l.text]),
      [['The advertisement', ad.title], ['The advertisement', ad.body], ['The ideal buyers', by.text]], (by.tags || []).map(t => ['The ideal buyers', t]),
      [['The credit line', ho.credit]], (hm.details || []).map(d => ['A key detail', (d || []).join(' ')]));
    for (const [where, t] of named) { const w = wordingProblem(t) || contactProblem(t); if (w) return where + ': ' + w.charAt(0).toLowerCase() + w.slice(1) + ' Change it or take it out, then save.'; }
    return '';
  }
  // a link, phone number or email in a line a vendor reads: never allowed (the same test as the drafting function's, fn/prefill_shared.ts)
  const CONTACT_RE = [/\b(?:https?:\/\/|www\.)\S+/i, /\]\([^)]*\)/, /(?:\+\s?64|\b0)[\s().-]*\d(?:[\s().-]*\d){5,10}\b/, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]/];
  const contactProblem = t => CONTACT_RE.some(re => re.test(String(t || ''))) ? 'Take out the link, phone number or email: they don\'t belong in this wording.' : '';
  const styleOf = sec => 'object-position:' + num0((sec.focus || {}).x, 0, 100, 50) + '% ' + num0((sec.focus || {}).y, 0, 100, 50) + '%;transform-origin:' + num0((sec.focus || {}).x, 0, 100, 50) + '% ' + num0((sec.focus || {}).y, 0, 100, 50) + '%;transform:scale(' + num0(sec.zoom, 1, 3, 1) + ');filter:brightness(' + num0(sec.bright, 0.5, 1.5, 1) + ')';
  // the header: a photo, or a video that plays muted and looped, with its still frame for paper and for reduced motion. A library
  // photo is credited "DunedinNZ"; Tim's own carries his credit line if he wrote one. Nothing to show: no header at all.
  function hero(sec, ev) {
    let url = '', still = '', mime = '';
    if (sec.src === 'library') { if (!httpsUrl(sec.url)) return ''; url = sec.url; }
    else { const a = ((ev && ev.assets) || {})[sec.asset]; if (!a || !a.url) return ''; url = a.url; still = a.still || ''; mime = a.mime || ''; }
    const st = styleOf(sec), credit = String(sec.credit || '').trim();
    const media = sec.kind === 'video'
      ? '<video class="apv-hero-m" autoplay muted loop playsinline preload="metadata" data-speed="' + esc(clipSpeed(sec.speed)) + '"' + (still ? ' poster="' + esc(still) + '"' : '') + ' style="' + st + '" aria-hidden="true"><source src="' + esc(url) + '"' + (mime ? ' type="' + esc(mime) + '"' : '') + '></video>'
        + (still ? '<img class="apv-hero-still" src="' + esc(still) + '" alt="" style="' + st + '">' : '')
      : '<img class="apv-hero-m" src="' + esc(url) + '" alt="" style="' + st + '">';
    return '<figure class="apv-hero' + (sec.kind === 'video' ? ' vid' : '') + (sec.kind === 'video' && !still ? ' nostill' : '') + '" data-stage="' + esc(sec.stage) + '">' + media
      + (credit ? '<figcaption class="apv-credit">' + esc((sec.src === 'library' ? 'Photo: ' : '') + credit) + '</figcaption>' : '') + '</figure>';
  }
  // Tim's video introduction: played by the vendor (not on its own), with its still frame in print
  function intro(sec, ev) {
    const a = ((ev && ev.assets) || {})[sec.asset]; if (!a || !a.url) return '';
    return '<section class="apv-intro' + (a.still ? '' : ' nostill') + '" data-stage="' + esc(sec.stage) + '"><h2>A short video from me</h2><div class="apv-intro-box"><video controls playsinline preload="metadata"' + (a.still ? ' poster="' + esc(a.still) + '"' : '') + '><source src="' + esc(a.url) + '"' + (a.mime ? ' type="' + esc(a.mime) + '"' : '') + '></video>'
      + (a.still ? '<img class="apv-intro-still" src="' + esc(a.still) + '" alt="A still from my video introduction">' : '') + '</div></section>';
  }
  function heard(sec, f) {
    const items = (sec.items || []).filter(x => String(x || '').trim()); if (!items.length) return '';
    // plain text only: escaped, never a link or markup (the review of 5b248b9)
    return '<section class="apv-heard" data-stage="' + esc(sec.stage) + '"><h2>What I heard from you</h2><ul class="apv-list">' + items.map(x => '<li>' + quote(x) + '</li>').join('') + '</ul></section>';
  }
  // their home as a listing could show it, clearly a mockup: Tim's photos in his order, the key details he ticked, his advertisement.
  // With no photo to show and no advertisement ticked, nothing is drawn.
  function home(sec, ev) {
    const ph = (sec.photos || []).map(id => ((ev && ev.homePhotos) || {})[id]).filter(p => p && p.url), ad = sec.ad && (sec.ad.title || (sec.ad.paras || []).length) ? sec.ad : null;
    if (!ph.length && !ad) return '';
    const figs = (sec.details || []).filter(d => d && String(d[0] || '').trim() && String(d[1] || '').trim());
    const car = ph.length ? '<div class="apv-car" data-n="' + ph.length + '"><div class="apv-car-strip" tabindex="0" aria-label="Photos of your home">' + ph.map((p, k) => '<img src="' + esc(p.url) + '" alt="' + esc('Photo ' + (k + 1) + ' of ' + ph.length + (p.room ? ', ' + p.room : '')) + '"' + (k ? ' loading="lazy"' : '') + ' decoding="async">').join('') + '</div>'
      + (ph.length > 1 ? '<div class="apv-car-ctl no-print"><button type="button" class="apv-car-btn" data-car="-1" aria-label="Previous photo">‹</button><span class="apv-car-at" aria-live="polite">1 of ' + ph.length + '</span><button type="button" class="apv-car-btn" data-car="1" aria-label="Next photo">›</button></div>' : '') + '</div>' : '';
    return '<section class="apv-home" data-stage="' + esc(sec.stage) + '"><h2>Your home as a listing</h2><p class="apv-mock"><span class="apv-tag mock">Mockup, not live</span> ' + esc(sec.label || MOCKUP_LABEL) + '</p>'
      + '<div class="apv-home-card">' + car + (figs.length ? '<dl class="apv-figs">' + figs.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>' : '')
      + (ad ? '<div class="apv-adraft">' + (ad.title ? '<h3>' + esc(ad.title) + '</h3>' : '') + (ad.paras || []).map(p => '<p>' + quote(p) + '</p>').join('') + '</div>' : '') + '</div></section>';
  }
  function buyers(sec, f) {
    const tags = (sec.tags || []).filter(t => String(t || '').trim());
    if (!String(sec.text || '').trim() && !tags.length) return '';
    return '<section class="apv-buyers" data-stage="' + esc(sec.stage) + '"><h2>The buyers I have in mind</h2>' + paras(sec.text).map(p => '<p>' + quote(p) + '</p>').join('')
      + (tags.length ? '<p class="apv-tags">' + tags.map(t => '<span class="apv-tag">' + esc(t) + '</span>').join(' ') + '</p>' : '') + '</section>';
  }
  // which of Tim's reviews a vendor reads: ticked, still on Google, and words a vendor may read; newest first
  const reviewsShown = (list, max) => (list || []).filter(r => r && r.ticked && !r.removed_at && !wordingProblem(r.body) && r.rating >= 1 && r.rating <= 5)
    .sort((a, b) => (a.reviewed_on < b.reviewed_on ? 1 : a.reviewed_on > b.reviewed_on ? -1 : 0)).slice(0, max || 6);
  function reviews(sec, ev) {
    const rs = reviewsShown(ev && ev.reviews, sec.max); if (!rs.length) return '';
    return '<section class="apv-reviews" data-stage="' + esc(sec.stage) + '"><h2>What my clients say</h2><div class="apv-revs">' + rs.map(r => '<figure class="apv-rev"><p class="apv-stars" aria-label="' + esc(r.rating + ' out of 5 stars') + '">' + '★'.repeat(r.rating) + '<span class="off">' + '★'.repeat(5 - r.rating) + '</span></p>'
      + (String(r.body || '').trim() ? '<blockquote><p>' + quote(r.body) + '</p></blockquote>' : '') + '<figcaption>' + esc(r.reviewer) + (monthYear(r.reviewed_on) ? ', ' + esc(monthYear(r.reviewed_on)) : '')
      + (httpsUrl(r.url) ? ' <a class="no-print" href="' + esc(r.url) + '" target="_blank" rel="noopener">Read it on Google</a>' : '') + '</figcaption></figure>').join('') + '</div>'
      + '<p class="apv-note">From my Google reviews. Reviewers are named by first name or initial only.</p></section>';
  }
  // anything in what was written that a vendor would read and must never see
  function sectionsProblem(sections) { const out = []; const walk = v => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(sections); return wordingProblem(out.join(' ')); }
  // ev (LW3 phase C, 034): the evidence drawn live from the database, for an appraisal written from its set-up:
  // { comps: the shown comparables in order (vendor fields only), photos: { compId: [{ url, alt }] }, months: market_months rows,
  //   market: show the Dunedin market report }. It goes in before the opinion of price. With no ev, or nothing in it, the page is
  //   exactly as phase A (and 032) drew it.
  function render(rec, ev) {
    const f = (rec && rec.fields) || {};
    // phase B: the header (a photo or video across the top) goes above the title; every other section in its place
    const secs = (rec && rec.sections) || [], top = secs.filter(s => s && s.type === 'header').map(s => section(s, f, ev)).join('');
    const parts = secs.map(s => s && s.type === 'header' ? '' : section(s, f, ev));
    const extra = rec && rec.setup && rec.setup.v && ev ? evidence(ev, f) : '';
    if (extra) { let at = secs.findIndex(s => s && s.type === 'heading' && /^my opinion of price$/i.test(String(s.text || '').trim()));
      if (at < 0) at = secs.findIndex(s => s && s.type === 'opinion'); if (at < 0) at = parts.length; parts.splice(at, 0, extra); }
    return '<article class="apv-doc">' + top + '<h1>' + esc((rec && rec.title) || 'Market appraisal') + '</h1>' + parts.join('') + '</article>';
  }

  /* ───────── LW3 phase C (034): comparables, the price dots and the Dunedin market report ───────── */
  // the fields of a comparable a vendor may see. Tim's private note, the source link and anything not listed here never reach the page.
  const VENDOR_COMP = ['id', 'position', 'status', 'address', 'suburb', 'price', 'sold_on', 'listed_on', 'method', 'days_to_sell', 'bedrooms', 'bathrooms', 'floor_m2', 'land_m2', 'cv', 'agency', 'sold_by_tim', 'ad_text', 'compare_text', 'compare_ticked', 'ring', 'distance_m'];
  const vendorComp = c => { const o = {}; VENDOR_COMP.forEach(k => { if (c && c[k] !== undefined) o[k] = c[k]; }); return o; };
  const STATUS_WORDS = { sold: 'Sold', listed: 'On the market', context: 'For context only, not comparable' };
  const RINGS = [['suburb', 'Same suburb'], ['750m', 'Within 750 m'], ['1500m', 'Within 1.5 km'], ['further', 'Further afield']];
  const ringWords = k => (RINGS.find(r => r[0] === k) || [])[1] || '';
  const km = m => m >= 1000 ? (Math.round(m / 100) / 10).toString() + ' km' : Math.round(m) + ' m';
  const num1 = v => (Math.round(+v * 10) / 10).toLocaleString('en-NZ');
  // a quote from a listing: plain text, drawn escaped, with its line breaks. Never markup, never an instruction.
  const quote = t => esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  // what a vendor reads of the advertisement wording: only if it passes the wording rules (another agency's "as is" is never shown)
  const adShown = c => !!String((c && c.ad_text) || '').trim() && !wordingProblem(c.ad_text);
  const cmpShown = c => !!(c && c.compare_ticked && String(c.compare_text || '').trim());
  function compCard(c, i, photos) {
    const st = STATUS_WORDS[c.status] ? c.status : 'sold';
    const price = c.price > 0 ? (st === 'listed' ? 'Asking ' : st === 'sold' ? 'Sold for ' : '') + dollars(c.price) : (st === 'listed' ? (c.method || 'Price on request') : '');
    const when = st === 'listed' ? (c.listed_on ? 'Listed ' + longDate(c.listed_on) : '') : (c.sold_on ? 'Sold ' + longDate(c.sold_on) : '');
    const figs = [['Price', price], ['Date', when], ['Method', st === 'listed' && !(c.price > 0) ? '' : c.method], ['Days to sell', c.days_to_sell != null && st !== 'listed' ? c.days_to_sell + ' days' : ''],
      ['Bedrooms', c.bedrooms != null ? String(c.bedrooms) : ''], ['Bathrooms', c.bathrooms != null ? num1(c.bathrooms) : ''], ['Floor area', c.floor_m2 ? num1(c.floor_m2) + ' m²' : ''],
      ['Land', c.land_m2 ? num1(c.land_m2) + ' m²' : ''], ['Capital value', c.cv ? dollars(c.cv) : ''], ['Agency', c.agency],
      ['How near', [ringWords(c.ring), c.distance_m != null ? km(c.distance_m) + ' away' : ''].filter(Boolean).join(', ')]].filter(x => String(x[1] || '').trim());
    const ph = (photos || []).filter(p => p && p.url);
    const car = ph.length ? '<div class="apv-car" data-n="' + ph.length + '"><div class="apv-car-strip" tabindex="0" aria-label="Photos of ' + esc(c.address) + '">' + ph.map((p, k) => '<img src="' + esc(p.url) + '" alt="' + esc('Photo ' + (k + 1) + ' of ' + ph.length + ', ' + c.address) + '"' + (k ? ' loading="lazy"' : '') + ' decoding="async">').join('') + '</div>'
      + (ph.length > 1 ? '<div class="apv-car-ctl no-print"><button type="button" class="apv-car-btn" data-car="-1" aria-label="Previous photo">‹</button><span class="apv-car-at" aria-live="polite">1 of ' + ph.length + '</span><button type="button" class="apv-car-btn" data-car="1" aria-label="Next photo">›</button></div>' : '') + '</div>' : '';
    return '<article class="apv-comp' + (st === 'context' ? ' ctx' : '') + '" data-comp="' + esc(c.id) + '"><header class="apv-comp-h"><span class="apv-comp-n" aria-hidden="true">' + (i + 1) + '</span><div><h3>' + esc(c.address) + '</h3>'
      + '<p class="apv-comp-tags"><span class="apv-tag st-' + st + '">' + esc(STATUS_WORDS[st]) + '</span>' + (c.sold_by_tim ? '<span class="apv-tag tim">Sold by Tim</span>' : '') + '</p></div></header>' + car
      + (figs.length ? '<dl class="apv-figs">' + figs.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>' : '')
      + (adShown(c) ? '<div class="apv-ad"><h4>How it was advertised</h4><blockquote><p>' + quote(c.ad_text) + '</p></blockquote></div>' : '')
      + (cmpShown(c) ? '<div class="apv-cmp"><h4>How it compares with your home</h4><p>' + quote(c.compare_text) + '</p></div>' : '') + '</article>';
  }
  function evidence(ev, f) {
    const comps = (ev.comps || []).filter(c => c && c.shown !== false).map(vendorComp);
    const dots = window.MKT && comps.length ? window.MKT.dots(comps.map((c, i) => ({ n: i + 1, price: c.price, status: c.status, label: c.address, when: c.status === 'listed' ? (c.listed_on ? 'listed ' + longDate(c.listed_on) : '') : (c.sold_on ? longDate(c.sold_on) : '') })), (f && f.ranges) || []) : '';
    const sold = comps.filter(c => c.status !== 'listed'), listed = comps.filter(c => c.status === 'listed');
    const nPrice = comps.filter(c => !(c.price > 0)).length;
    const num = c => comps.indexOf(c);
    const market = ev.market && window.MKT ? window.MKT.report(ev.months || [], (f && f.ranges) || [], { area: ev.area }) : '';
    let h = '';
    if (comps.length) {
      // the price dots only when at least one comparable has a price to plot (Tim, 28 November 2026: nothing to show, no section)
      if (dots) h += '<h2>Price evidence at a glance</h2>' + dots + (nPrice ?'<p class="apv-note">' + (nPrice === 1 ? 'One comparable has' : nPrice + ' comparables have') + ' no price to show, so ' + (nPrice === 1 ? 'it isn\'t' : 'they aren\'t') + ' on the chart.</p>' : '');
      if (sold.length) h += '<h2>Recent sales nearby</h2><div class="apv-comps">' + sold.map(c => compCard(c, num(c), (ev.photos || {})[c.id])).join('') + '</div>';
      if (listed.length) h += '<h2>On the market now</h2><div class="apv-comps">' + listed.map(c => compCard(c, num(c), (ev.photos || {})[c.id])).join('') + '</div>';
    }
    // the heading follows the area charted: "The Dunedin market" by default, or the area Tim chose (setup.marketArea)
    if (market) h += '<h2>' + esc('The ' + (window.MKT.pickArea(ev.months || [], ev.area) || 'Dunedin') + ' market') + '</h2>' + market;
    return h ? '<section class="apv-evidence">' + h + '</section>' : '';
  }

  // the comparables rule (Tim, 25 November 2026): at least five nearby sales, ideally from the last three months, going back as far as
  // it takes to find three true comparables. Sold and "for context only" sales both count as nearby sales; only sold ones not for context
  // are true comparables. Sales in a never-mix group are never counted for a home outside it (or the other way round).
  // comps: every comparable (hidden ones are left out here); o: { today: 'YYYY-MM-DD', suburb, groups: [{ name, suburbs }] }
  // Returns { ok, items: [{ kind: ok|warn|err|info, text }] }, in plain words for Tim.
  function compsRule(comps, o) {
    o = o || {}; const today = o.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const low = s => String(s || '').trim().toLowerCase();
    // never-mix groups keep their sales apart; case-by-case groups (035) are counted, and only a mismatch the AI suggests is flagged
    const inG = (g, s) => (g.suburbs || []).some(x => low(x) === low(s)) && low(s);
    const groupOf = s => (o.groups || []).find(g => (g.mode || 'never_mix') !== 'case_by_case' && inG(g, s));
    const cbcOf = s => (o.groups || []).find(g => g.mode === 'case_by_case' && inG(g, s));
    const back = new Date(today + 'T12:00:00'); back.setMonth(back.getMonth() - 3); const cut = back.toISOString().slice(0, 10);
    const items = [], add = (kind, text) => items.push({ kind, text });
    const shown = (comps || []).filter(c => c && c.shown !== false), sg = groupOf(o.suburb);
    const mixed = c => { const g = groupOf(c.suburb); return (g || sg) && g !== sg; };
    shown.filter(c => mixed(c) && c.status !== 'context').forEach(c => { const g = groupOf(c.suburb) || sg;
      add('warn', c.address + ' is ' + (groupOf(c.suburb) ? 'in ' + c.suburb + ', on' : 'outside') + ' your never-mix list (' + g.name + '), so it isn\'t counted. Hide it, or mark it for context only.'); });
    const ok = shown.filter(c => !mixed(c));
    caseByCase(ok.filter(c => c.status !== 'listed' && cbcOf(c.suburb)), o.buyers, add, cbcOf);
    const near = ok.filter(c => c.status !== 'listed' && c.sold_on && c.ring !== 'further');
    const recentNear = near.filter(c => c.sold_on >= cut);
    const truth = ok.filter(c => c.status === 'sold' && c.sold_on).sort((a, b) => (a.sold_on < b.sold_on ? 1 : -1));
    const recentTrue = truth.filter(c => c.sold_on >= cut);
    if (near.length >= 5) add('ok', near.length + ' nearby sales: at least five are needed.');
    else add('err', (near.length ? 'Only ' + near.length + ' nearby sale' + (near.length === 1 ? '' : 's') : 'No nearby sales yet') + ': at least five are needed. Add ' + (5 - near.length) + ' more, from the same suburb first, then within 750 m, then 1.5 km.');
    if (near.length) { if (recentNear.length >= 5) add('ok', recentNear.length + ' of them sold in the last three months.');
      else add('info', recentNear.length + ' of them sold in the last three months, so older sales make up the rest. That is fine: go back as far as it takes.'); }
    if (recentTrue.length >= 3) add('ok', recentTrue.length + ' true comparables from the last three months: at least three are needed.');
    else if (truth.length >= 3) add('ok', '3 true comparables, going back to ' + monthYear(truth[2].sold_on) + '.');
    else add('err', (truth.length ? 'Only ' + truth.length + ' true comparable' + (truth.length === 1 ? '' : 's') : 'No true comparables yet') + ': three are needed. Go further back in time until you find ' + (3 - truth.length === 1 ? 'one more' : (3 - truth.length) + ' more') + '.');
    if (!shown.some(c => c.status === 'listed')) add('info', 'Nothing on the market is shown. Add any homes that compete with this one: buyers will compare them.');
    shown.filter(c => c.status !== 'listed' && !c.sold_on).forEach(c => add('warn', 'Add the sale date for ' + c.address + '.'));
    shown.filter(c => !c.ring).forEach(c => add('warn', 'Set how near ' + c.address + ' is: same suburb, within 750 m, within 1.5 km, or further.'));
    shown.filter(c => !cmpShown(c)).forEach(c => add('warn', 'How ' + c.address + ' compares ' + (String(c.compare_text || '').trim() ? 'isn\'t ticked yet' : 'isn\'t written yet') + ', so the vendor won\'t see a comparison.'));
    shown.filter(c => String(c.ad_text || '').trim() && !adShown(c)).forEach(c => add('warn', 'The advertisement wording for ' + c.address + ' isn\'t shown to the vendor: ' + wordingProblem(c.ad_text).replace(/\.$/, '') + '.'));
    return { ok: !items.some(x => x.kind === 'err'), items };
  }
  // case-by-case suburbs (Tim, 27 November 2026): the AI's verdict on each sale there and on the subject (b: the latest check,
  // { subject: { verdict, reason }, comps: { id: { verdict, reason } } }). Only a mismatch is flagged, as a suggestion; "unclear" or no
  // check flags nothing, with a plain note. The verdicts and reasons are Tim's alone: this list is only ever on his screen.
  function caseByCase(list, b, add, cbcOf) {
    if (!list.length) return;
    const names = Array.from(new Set(list.map(c => cbcOf(c.suburb).name))).join(', ');
    const has = c => !!(b && b.comps && b.comps[c.id]), unchecked = list.filter(c => !has(c)), sv = b && b.subject ? b.subject.verdict : '';
    if (unchecked.length) add('info', (unchecked.length === 1 ? unchecked[0].address + ' is' : unchecked.length + ' sales are') + ' in a suburb you check case by case (' + names + '). Use "Check who they appeal to" and the AI will look at ' + (unchecked.length === 1 ? 'it' : 'each one') + '.');
    const done = list.filter(has); if (!done.length) return;
    if (!['owner', 'investor'].includes(sv)) { add('info', 'The AI couldn\'t tell who this home would appeal to, so no case-by-case sale is flagged. Check ' + (done.length === 1 ? 'it' : 'them') + ' yourself.'); return; }
    done.forEach(c => { const v = b.comps[c.id], why = String(v.reason || '').trim().replace(/[.\s]+$/, '');
      if (!['owner', 'investor'].includes(v.verdict)) add('info', c.address + ': no clear read on who it appealed to, so it isn\'t flagged. Check it yourself.');
      else if (v.verdict !== sv) add('warn', c.address + (v.verdict === 'investor' ? ' looks like an investor or student sale' : ' looks like a family or owner-occupier sale') + (why ? ' (' + why + ')' : '') + ', and this home looks like ' + (sv === 'owner' ? 'an owner-occupier home' : 'it would appeal to investors') + '. A suggestion only: keep it, hide it, or mark it for context only.'); });
  }
  // a report Tim uploaded (035): the packs for the existing import, from only the items he ticked. res: the reading ({ report, comps,
  // market }); comps, months: the ticked ids; now: an ISO time for when no report date is printed. The source is the report's own.
  const PACK_KEYS = ['ref', 'status', 'address', 'suburb', 'price', 'sold_on', 'listed_on', 'method', 'days_to_sell', 'bedrooms', 'bathrooms', 'floor_m2', 'land_m2', 'cv', 'agency', 'distance_m'];
  function reportPacks(res, comps, months, now) {
    const rep = (res && res.report) || {}, source = ['relab', 'reinz'].includes(rep.source) ? rep.source : 'other';
    const at = /^\d{4}-\d{2}-\d{2}$/.test(rep.date || '') ? rep.date + 'T12:00:00+13:00' : now;
    const cp = ((res && res.comps) || []).filter(c => (comps || []).includes(c.id)).map(c => { const x = {}; PACK_KEYS.forEach(k => { if (c[k] != null && c[k] !== '') x[k] = c[k]; }); x.source = source; return x; });
    const mp = ((res && res.market) || []).filter(m => (months || []).includes(m.id)).map(m => { const x = {}; ['area', 'month', 'median', 'lower_quartile', 'upper_quartile', 'sales', 'days_to_sell'].forEach(k => { if (m[k] != null && m[k] !== '') x[k] = m[k]; }); return x; });
    return { comps: cp.length ? { format: 'mre.comps/1', source, gathered_at: at, comps: cp } : null, market: mp.length ? { format: 'mre.market/1', gathered_at: at, months: mp } : null };
  }
  // what the reader found, in one line, for Tim's review list
  function reportLine(c) {
    return [c.suburb, c.status === 'listed' ? (c.price ? 'asking ' + dollars(c.price) : 'on the market') : (c.price ? dollars(c.price) : ''), c.status === 'listed' ? (c.listed_on ? 'listed ' + longDate(c.listed_on) : '') : (c.sold_on ? 'sold ' + longDate(c.sold_on) : ''),
      c.method, c.bedrooms != null ? c.bedrooms + ' bed' : '', c.bathrooms != null ? num1(c.bathrooms) + ' bath' : '', c.floor_m2 ? num1(c.floor_m2) + ' m² floor' : '', c.land_m2 ? num1(c.land_m2) + ' m² land' : '',
      c.cv ? 'CV ' + dollars(c.cv) : '', c.agency, c.distance_m != null ? km(c.distance_m) + ' away' : '', c.ref ? 'ref ' + c.ref : ''].filter(x => String(x || '').trim()).join(', ');
  }
  const monthYear = d => { const x = /^(\d{4})-(\d{2})/.exec(String(d || '')); return x ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+x[2] - 1] + ' ' + x[1] : ''; };

  // a photo dropped from Tim's download folder: which comparable it belongs to. By its file name in the pack's photo list, else by a
  // name that starts with the comparable's reference (RB-R1_1.jpg for reference RB-R1). Returns the comparable's id, or ''.
  function matchPhoto(fileName, comps) {
    const base = String(fileName || '').split(/[\\/]/).pop().trim().toLowerCase(); if (!base) return '';
    const byHint = (comps || []).find(c => (c.photo_hints || []).some(h => h && String(h.file || '').toLowerCase() === base)); if (byHint) return byHint.id;
    const byRef = (comps || []).filter(c => c.source_ref).sort((a, b) => String(b.source_ref).length - String(a.source_ref).length)
      .find(c => { const r = String(c.source_ref).toLowerCase(); return base.startsWith(r) && /^[_\-. ]/.test(base.slice(r.length)); });
    return byRef ? byRef.id : '';
  }

  // near-duplicate addresses: the same rules as appraisal_addr_parts() and appraisal_addr_same() in migration 034, case for case
  const CANON = { street: 'st', str: 'st', saint: 'st', road: 'rd', avenue: 'ave', av: 'ave', crescent: 'cres', cr: 'cres', place: 'pl', terrace: 'tce', ter: 'tce', drive: 'dr', lane: 'ln', highway: 'hwy', court: 'ct', crt: 'ct', grove: 'gr', parade: 'pde', square: 'sq', close: 'cl', esplanade: 'esp', boulevard: 'blvd', mount: 'mt', heights: 'hts', track: 'trk' };
  const TYPES = ['st', 'rd', 'ave', 'cres', 'pl', 'tce', 'dr', 'ln', 'hwy', 'ct', 'gr', 'pde', 'sq', 'cl', 'esp', 'blvd', 'way', 'rise', 'hts', 'trk', 'mews', 'row', 'view', 'walk', 'quay', 'loop', 'glade', 'glen'];
  const DIRS = ['north', 'south', 'east', 'west', 'upper', 'lower', 'extension', 'ext', 'n', 's', 'e', 'w'];
  function addrParts(p) {
    const segs = []; let pc = '';
    String(p == null ? '' : p).toLowerCase().replace(/[āēīōū]/g, ch => ({ ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u' }[ch])).split(',').forEach(seg => {
      const t = seg.replace(/[^a-z0-9/-]+/g, ' ').trim(); if (!t) return;
      let toks = t.split(' ');
      for (;;) { const n = toks.length; if (!n) break; const z = toks[n - 1];
        if (/^[0-9]{4}$/.test(z) && (n > 1 || segs.length > 0)) { pc = z; toks = toks.slice(0, n - 1); }
        else if (['nz', 'otago', 'aotearoa'].includes(z)) toks = toks.slice(0, n - 1);
        else if (n > 1 && z === 'zealand' && toks[n - 2] === 'new') toks = toks.slice(0, n - 2);
        else if (n > 1 && z === 'city' && toks[n - 2] === 'dunedin') toks = toks.slice(0, n - 2);
        else if (z === 'dunedin' && !(n > 1 && ['north', 'south', 'east', 'west', 'central'].includes(toks[n - 2]))) toks = toks.slice(0, n - 1);
        else break; }
      if (!toks.length) return;
      segs.push(toks.map(x => CANON[x] || x).join(' '));
    });
    if (!segs.length) return { num: '', street: '', suburb: '', known: false, toks: '', pc };
    let rest = segs, first = rest[0].split(' '), num = '';
    const UNIT = /^[0-9]+[a-z]?$/;
    if (['flat', 'unit', 'apartment', 'apt'].includes(first[0]) && UNIT.test(first[1] || '')) {
      if (UNIT.test(first[2] || '')) first = [first[1] + '/' + first[2]].concat(first.slice(3));
      else if (first.length === 2 && rest.length >= 2 && UNIT.test(rest[1].split(' ')[0])) { const nx = rest[1].split(' '); first = [first[1] + '/' + nx[0]].concat(nx.slice(1)); rest = rest.slice(1); }
    }
    if (first[0] === 'lot' && UNIT.test(first[1] || '')) { num = 'lot' + first[1]; first = first.slice(2); }
    else if (/^[0-9]+[a-z]?([/-][0-9]+[a-z]?)?$/.test(first[0])) {
      num = first[0]; first = first.slice(1);
      if (/^[0-9]+$/.test(num) && /^[a-z]$/.test(first[0] || '') && first.length >= 3) { num += first[0]; first = first.slice(1); }
    }
    if (num && !first.length && rest.length >= 2) { first = rest[1].split(' '); rest = rest.slice(1); }
    const street = first.join(' '), known = rest.length >= 2 && street !== '', suburb = known ? rest[1] : '';
    return { num, street, suburb, known, toks: (street + ' ' + suburb).trim(), pc };
  }
  // 'same', 'maybe' (offer it, never a block) or '': appraisal_addr_match() in migration 034, case for case
  function addrMatch(a, b) {
    const x = addrParts(a), y = addrParts(b);
    if (!x.num || x.num !== y.num || !x.street || !y.street) return '';
    if (x.pc && y.pc && x.pc !== y.pc) return '';
    if (x.known && y.known) return x.street === y.street && x.suburb === y.suburb ? 'same' : '';
    if (x.known || y.known) { const [k, s] = x.known ? [x, y] : [y, x]; return s.toks === k.toks ? 'same' : s.toks === k.street ? 'maybe' : ''; }
    if (x.toks === y.toks) return 'same';
    const [st, lt] = x.toks.length <= y.toks.length ? [x.toks, y.toks] : [y.toks, x.toks];
    if (lt.slice(0, st.length + 1) !== st + ' ') return '';
    const w = st.split(' '), next = lt.slice(st.length + 1).split(' ')[0];
    return TYPES.includes(w[w.length - 1]) && !DIRS.includes(next) ? 'maybe' : '';
  }
  const addrSame = (a, b) => addrMatch(a, b) === 'same';

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
    vendorComp, VENDOR_COMP, STATUS_WORDS, RINGS, ringWords, compsRule, reportPacks, reportLine, matchPhoto, addrParts, addrSame, addrMatch, adShown, cmpShown, evidence,
    METHODS, CAMPAIGNS, MAX_WEEKS, campaignOf, waveFor, stepsFor, methodSentence, isHill, suburbOf, plansFor, checkSetup, writeStandard, sectionsProblem,
    DEFAULT_NOTE, DALMORE_LINE, HEAD_AND_SHOULDERS, VALUATION_LABEL,
    phaseB, checkSections, homeFacts, CLIP, clipSpeed, clipLen, HOME_FACTS, HOME_FACT_KEYS, MOCKUP_LABEL, LIBRARY_CREDIT, STAGES, reviewsShown, httpsUrl, VIDEO_URL };
})();
