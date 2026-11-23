/* The offer form (offers phase 1): working days, the list of conditions, and the date checks. No page or database code here, so
   the tests can load it on its own (offers-core.test.js) and the same rules serve the buyer's form, Tim's Offers tile and, in
   phase 4, the vendors' counteroffer screen.

   Working days follow the definition in the agreement for sale and purchase (clause 1.1, "working day"), written here as rules in
   our own words, not the agreement's text:
     - Saturdays and Sundays are not working days.
     - Nor are Waitangi Day, Good Friday, Easter Monday, Anzac Day, the Sovereign's Birthday (first Monday in June) and Labour Day
       (fourth Monday in October).
     - When Waitangi Day or Anzac Day falls on a weekend, the Monday after is not a working day either.
     - Nothing from 24 December to 5 January (both included) is a working day. For the LIM date only, that period runs to
       15 January.
     - The anniversary day of the province the property is in is not a working day.
     - Nor is the Matariki public holiday (dates set by law, held below as data).
     - Nor is any other day the Government declares a public holiday (EXTRA_HOLIDAYS).
   Christmas Day, Boxing Day and the New Year holidays always fall inside the 24 December to 5 January period, so they need no
   rule of their own. A date chosen for a condition or settlement that is not a working day becomes the last working day before
   it (clause 1.3). All dates are plain calendar dates, 'YYYY-MM-DD'. */
(function (root) {
  'use strict';

  /* ───── dates as plain calendar days ───── */
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const toN = iso => { if (!ISO_RE.test(String(iso || ''))) throw new Error('Not a date: ' + iso); const [y, m, d] = iso.split('-').map(Number); const t = Date.UTC(y, m - 1, d); const back = new Date(t); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) throw new Error('Not a date: ' + iso); return Math.round(t / 864e5); };
  const toIso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const ymd = (y, m, d) => toIso(Math.round(Date.UTC(y, m - 1, d) / 864e5));
  const dow = iso => new Date(toN(iso) * 864e5).getUTCDay();   // 0 Sunday ... 6 Saturday
  const addDays = (iso, n) => toIso(toN(iso) + n);
  const daysBetween = (a, b) => toN(b) - toN(a);
  const isDate = s => { try { toN(s); return true; } catch (_) { return false; } };
  // today in New Zealand
  const nzToday = (now) => (now ? new Date(now) : new Date()).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

  // the nth (1-based) given weekday in a month; n = -1 for the last
  function nthWeekday(y, m, wd, n) {
    if (n > 0) { const first = dow(ymd(y, m, 1)); return ymd(y, m, 1 + ((wd - first + 7) % 7) + 7 * (n - 1)); }
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(), last = dow(ymd(y, m, lastDay)); return ymd(y, m, lastDay - ((last - wd + 7) % 7));
  }
  // the Monday nearest a date (a Tuesday to Thursday goes back, a Friday to Sunday goes forward)
  function mondayNearest(y, m, d) { const iso = ymd(y, m, d), w = dow(iso); const back = (w + 6) % 7; return back <= 3 ? addDays(iso, -back) : addDays(iso, 7 - back); }
  // Easter Sunday (the Gregorian computus)
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1; return ymd(y, month, day);
  }

  // Matariki public holiday, as set out in the Te Kāhui o Matariki Public Holiday Act 2022. Later years must be added here when needed.
  const MATARIKI = { 2022: '2022-06-24', 2023: '2023-07-14', 2024: '2024-06-28', 2025: '2025-06-20', 2026: '2026-07-10', 2027: '2027-06-25', 2028: '2028-07-14', 2029: '2029-07-06', 2030: '2030-06-21', 2031: '2031-07-11', 2032: '2032-07-02', 2033: '2033-06-24', 2034: '2034-07-07', 2035: '2035-06-29' };
  // any other day the Government declared a public holiday
  const EXTRA_HOLIDAYS = { '2022-09-26': 'Queen Elizabeth II Memorial Day' };
  const FIRST_YEAR = 2022, LAST_YEAR = 2035;

  // Provincial anniversary days, as observed. Otago (Dunedin and the rest of Otago) is the usual one for Tim's listings.
  const PROVINCES = {
    otago: { name: 'Otago', day: y => { const d = mondayNearest(y, 3, 23); const em = addDays(easterSunday(y), 1); return d === em ? addDays(d, 1) : d; } },
    southland: { name: 'Southland', day: y => addDays(easterSunday(y), 2) },   // Easter Tuesday
    canterbury: { name: 'Canterbury (Christchurch Show Day)', day: y => addDays(nthWeekday(y, 11, 2, 1), 10) },   // the second Friday after the first Tuesday in November
    south_canterbury: { name: 'South Canterbury', day: y => nthWeekday(y, 9, 1, 4) },
    wellington: { name: 'Wellington', day: y => mondayNearest(y, 1, 22) },
    auckland: { name: 'Auckland (and the upper North Island)', day: y => mondayNearest(y, 1, 29) },
    nelson: { name: 'Nelson', day: y => mondayNearest(y, 2, 1) },
    taranaki: { name: 'Taranaki', day: y => nthWeekday(y, 3, 1, 2) },
    hawkes_bay: { name: "Hawke's Bay", day: y => addDays(nthWeekday(y, 10, 1, 4), -3) },
    marlborough: { name: 'Marlborough', day: y => addDays(nthWeekday(y, 10, 1, 4), 7) },
    westland: { name: 'Westland', day: y => mondayNearest(y, 12, 1) },
    chatham: { name: 'Chatham Islands', day: y => mondayNearest(y, 11, 30) },
  };
  const DEFAULT_PROVINCE = 'otago';
  // a best guess from the address; Tim can change it on the property's Offers tile
  function provinceFor(address) {
    const a = String(address || '').toLowerCase();
    const has = words => words.some(w => new RegExp('\\b' + w + '\\b').test(a));
    if (has(['invercargill', 'gore', 'southland', 'winton', 'riverton', 'bluff', 'te anau', 'mataura', 'otautau', 'lumsden'])) return 'southland';
    if (has(['timaru', 'waimate', 'geraldine', 'temuka', 'fairlie', 'twizel', 'south canterbury'])) return 'south_canterbury';
    if (has(['christchurch', 'rangiora', 'ashburton', 'kaiapoi', 'rolleston', 'lincoln', 'canterbury'])) return 'canterbury';
    if (has(['wellington', 'lower hutt', 'upper hutt', 'petone', 'porirua', 'masterton'])) return 'wellington';
    if (has(['auckland'])) return 'auckland';
    if (has(['nelson', 'richmond', 'motueka'])) return 'nelson';
    if (has(['blenheim', 'picton', 'marlborough'])) return 'marlborough';
    return DEFAULT_PROVINCE;
  }

  // every day that is not a working day in a year (weekends aside), with its name
  const YCACHE = new Map();
  function holidays(y, province) {
    const key = y + ':' + (province || ''); if (YCACHE.has(key)) return YCACHE.get(key);
    const h = {};
    const add = (iso, label) => { if (!h[iso]) h[iso] = label; };
    const waitangi = ymd(y, 2, 6), anzac = ymd(y, 4, 25), es = easterSunday(y);
    add(waitangi, 'Waitangi Day'); if (dow(waitangi) === 6) add(addDays(waitangi, 2), 'Waitangi Day (Monday after)'); if (dow(waitangi) === 0) add(addDays(waitangi, 1), 'Waitangi Day (Monday after)');
    add(addDays(es, -2), 'Good Friday'); add(addDays(es, 1), 'Easter Monday');
    add(anzac, 'Anzac Day'); if (dow(anzac) === 6) add(addDays(anzac, 2), 'Anzac Day (Monday after)'); if (dow(anzac) === 0) add(addDays(anzac, 1), 'Anzac Day (Monday after)');
    add(nthWeekday(y, 6, 1, 1), "Sovereign's Birthday");
    add(nthWeekday(y, 10, 1, 4), 'Labour Day');
    if (MATARIKI[y]) add(MATARIKI[y], 'Matariki');
    Object.keys(EXTRA_HOLIDAYS).forEach(d => { if (d.startsWith(y + '-')) add(d, EXTRA_HOLIDAYS[d]); });
    const p = PROVINCES[province]; if (p) add(p.day(y), p.name + ' Anniversary Day');
    YCACHE.set(key, h); return h;
  }
  // why a day isn't a working day ('' when it is one)
  function notWorkingBecause(iso, opts) {
    const o = opts || {}, w = dow(iso);
    if (w === 6) return 'Saturday'; if (w === 0) return 'Sunday';
    const [y, m, d] = iso.split('-').map(Number);
    if ((m === 12 && d >= 24) || (m === 1 && d <= 5)) return 'Christmas and New Year period';
    if (o.lim && m === 1 && d <= 15) return 'Christmas and New Year period (to 15 January for the LIM date)';
    return holidays(y, o.province === undefined ? DEFAULT_PROVINCE : o.province)[iso] || '';
  }
  const isWorkingDay = (iso, opts) => !notWorkingBecause(iso, opts);
  // is this year covered by the Matariki data? (a later year needs its date added above)
  const yearKnown = y => y >= FIRST_YEAR && y <= LAST_YEAR;
  // the nth working day after a date (n = 0 gives the date itself)
  function addWorkingDays(iso, n, opts) { let d = toN(iso); n = Math.max(0, Math.floor(+n || 0)); while (n > 0) { d++; if (isWorkingDay(toIso(d), opts)) n--; } return toIso(d); }
  // how many working days fall after one date, up to and including another (0 when the second isn't later)
  function countWorkingDays(fromIso, toIsoDate, opts) { let n = 0; for (let d = toN(fromIso) + 1, e = toN(toIsoDate); d <= e; d++) if (isWorkingDay(toIso(d), opts)) n++; return n; }
  // a chosen date that isn't a working day becomes the last working day before it (clause 1.3)
  function onOrBefore(iso, opts) { let d = toN(iso); while (!isWorkingDay(toIso(d), opts)) d--; return toIso(d); }

  /* ───── the conditions ───── */
  // The same list serves the buyer's form now and the vendors' counteroffers in phase 4. 'source':
  //   reinz: a condition built into the REINZ/ADLS agreement. Never quote its text: a plain summary and the clause number only.
  //   printed: printed in Tim's blank (his appendix). Summary and clause number only.
  //   tim: Tim's own clause. The wording comes from the offer_clauses table, which Tim edits; until he adds it, the page says so.
  //   custom: the buyer's own condition, a draft Tim reads and approves.
  // 'needs': extra details the condition takes. 'lim': its date counts working days with the LIM rule (to 15 January).
  const CONDITIONS = [
    { key: 'builders', group: 'typical', source: 'reinz', clause: '9.4', advice: 'You can talk to a builder or building inspector before you go further.', label: "Builder's report", summary: 'You can have a builder or building inspector check the property, and you can end the agreement if the report is not satisfactory to you by the date you choose.' },
    { key: 'finance', group: 'typical', source: 'reinz', clause: '9.1', label: 'Finance', summary: 'Your offer depends on you arranging the lending you need by the date you choose.' },
    { key: 'lim', group: 'typical', source: 'reinz', clause: '9.3', lim: true, label: 'LIM (council report)', summary: "You get the council's Land Information Memorandum and can end the agreement if it shows something you are not satisfied with. Over summer its working days run to 15 January." },
    { key: 'lawyer', group: 'typical', source: 'printed', clause: '22.0', label: "Lawyer's approval of title, form and content", summary: 'Your lawyer gets to approve the agreement and the title before it goes ahead.', note: 'You can talk to a lawyer at any time before you go further. Tim recommends you get legal advice before you sign anything.' },
    { key: 'electrical', group: 'typical', source: 'tim', advice: 'You can talk to an electrician before you go further.', label: 'Electrical report', summary: 'A registered electrician checks the wiring and electrical work, and you can end the agreement if the report is not satisfactory to you.' },
    { key: 'technical', group: 'typical', source: 'tim', advice: 'You can talk to an engineer or other technical professional before you go further.', needs: 'detail', detailLabel: 'What kind of report?', detailHint: 'For example: drainage, geotechnical, meth test, roof, heat pump', label: 'Specified technical report', summary: 'A report of a kind you name, such as drainage or a geotechnical report, by the date you choose.' },
    { key: 'toxicology', group: 'other', source: 'reinz', clause: '9.5', label: 'Toxicology report', summary: 'A test of the property for contamination, such as methamphetamine residue, and you can end the agreement if the result is not satisfactory to you.' },
    { key: 'oia', group: 'other', source: 'reinz', clause: '9.6', label: 'Overseas Investment Act consent', summary: 'Only for buyers who need consent under the Overseas Investment Act. The agreement depends on that consent being granted.' },
    { key: 'land_act', group: 'other', source: 'reinz', clause: '9.7', label: 'Land Act consent', summary: 'Only for the rare sales that need consent under the Land Act 1948. The agreement depends on that consent.' },
    { key: 'sale', group: 'other', source: 'tim', needs: 'address', detailLabel: 'Address of the property you need to sell', label: 'Sale of another property', summary: 'Your offer depends on you selling a property you own first, by the date you choose.' },
    { key: 'sdd', group: 'other', source: 'tim', commercial: true, label: 'Specified Due Diligence', summary: 'Intended for properties with plant or complex tenancies, such as commercial, lifestyle and farm properties. It is not usually needed for a family home.' },
  ];
  const CUSTOM = { key: 'custom', group: 'custom', source: 'custom', label: 'Your own condition', summary: 'Something else your offer depends on, in your own words. Tim reads it and approves the wording before it goes on any agreement.' };
  // one-line prompts beside the lawyer's note (Tim, 23 November 2026): unpressured, the buyer can always take advice first
  const ADVICE = {
    conditions: 'You can talk to a builder or a technical professional (an engineer, an electrician and so on) before you go further.',
    gst: 'You can always talk to your financial adviser or accountant before you go further.',
  };
  const CHATTEL_NOTE = 'Anything included as a chattel is expected to be in full working order at settlement (elements, bulbs and so on).';
  const condInfo = k => CONDITIONS.find(c => c.key === k) || (k === 'custom' ? CUSTOM : null);
  const NO_WORDING = 'Tim will confirm the exact wording with you.';
  // what the overlay shows as wording: Tim's own text when he has added it; for REINZ and printed clauses only the clause number
  function wordingFor(c, timWords) {
    if (!c) return { kind: 'none', text: '' };
    if (c.source === 'reinz') return { kind: 'ref', text: `This condition is clause ${c.clause} of the standard agreement for sale and purchase. Tim will show you the full wording.` };
    if (c.source === 'printed') return { kind: 'ref', text: `This is clause ${c.clause} in the agreement Tim uses. Tim will show you the full wording.` };
    if (c.source === 'tim') { const w = timWords && typeof timWords[c.key] === 'string' ? timWords[c.key].trim() : ''; return w ? { kind: 'tim', text: w } : { kind: 'pending', text: NO_WORDING }; }
    return { kind: 'custom', text: '' };
  }

  /* ───── the deposit ───── */
  const DEPOSIT = {
    no: 'Your deposit, 10% of the price, is paid to Public Trust for NZ Real Estate Trust when the agreement becomes unconditional.',
    yes: "Because some of your deposit comes from KiwiSaver, the whole deposit goes to the sellers' lawyer's trust account instead (clause 21.3), and is held there until settlement.",
  };
  const depositText = ks => ks === true ? DEPOSIT.yes : ks === false ? DEPOSIT.no : '';

  /* ───── the date checks ───── */
  const GAP_DAYS = 7;          // the last condition date must be at least a week before settlement
  const KS_DAYS_DEFAULT = 15;  // KiwiSaver: warn when settlement is fewer working days than this after the agreement goes unconditional
  const SETTLE_DAYS_DEFAULT = 15;   // the blank's own settlement: fifteen working days from confirmation
  // when a condition falls: { date, days, adjusted } from either a number of working days or a chosen date, counted from asAt
  function conditionDate(c, asAt, province) {
    const info = condInfo(c.key) || {}, o = { province, lim: !!info.lim };
    if (c.date && isDate(c.date)) { const date = onOrBefore(c.date, o); return { date, days: countWorkingDays(asAt, date, o), adjusted: date !== c.date, chosen: c.date }; }
    const n = Math.floor(+c.days); if (c.days !== '' && c.days != null && n >= 1) { const date = addWorkingDays(asAt, n, o); return { date, days: n, adjusted: false }; }
    return null;
  }
  // every check on an offer's dates. offer: { conditions:[{key, days|date}], settlement:{kind:'relative', days}|{kind:'date', date}, kiwisaver }
  // opts: { asAt (the day the dates count from; today), province, ksDays }. Warnings inform; only problems ask for a change.
  function checkDates(offer, opts) {
    const o = opts || {}, asAt = o.asAt || nzToday(), province = o.province || DEFAULT_PROVINCE, ksDays = +o.ksDays || KS_DAYS_DEFAULT;
    const out = { asAt, province, conditions: [], problems: [], warnings: [], lastCondition: null, confirmation: asAt, settlement: null, gapDays: null, gapOk: true, ksWarnSettle: false, ksWarnDeposit: false, unknownYear: false };
    (offer.conditions || []).forEach(c => {
      const r = conditionDate(c, asAt, province); const info = condInfo(c.key) || { label: c.key };
      out.conditions.push(Object.assign({ key: c.key, label: info.label }, r || {}));
      if (!r) out.problems.push({ key: c.key, kind: 'cond_missing', text: `Add the working days or a date for ${info.label}.` });
      else if (r.date <= asAt) out.problems.push({ key: c.key, kind: 'cond_past', text: `The date for ${info.label} needs to be after today.` });
    });
    const dated = out.conditions.filter(c => c.date);
    if (dated.length) { out.lastCondition = dated.map(c => c.date).sort().pop(); out.confirmation = out.lastCondition; }
    const s = offer.settlement || {};
    if (s.kind === 'date' && isDate(s.date)) out.settlement = onOrBefore(s.date, { province });
    else if (s.kind === 'relative' && Math.floor(+s.days) >= 1) out.settlement = addWorkingDays(out.confirmation, Math.floor(+s.days), { province });
    if (s.kind === 'date' && s.date && isDate(s.date) && out.settlement !== s.date) out.settlementAdjusted = true;
    if (!out.settlement) out.problems.push({ key: 'settlement', kind: 'settle_missing', text: 'Choose your settlement date.' });
    else if (out.settlement <= asAt) out.problems.push({ key: 'settlement', kind: 'settle_past', text: 'Settlement needs to be after today.' });
    if (out.settlement && out.lastCondition) {
      out.gapDays = daysBetween(out.lastCondition, out.settlement); out.gapOk = out.gapDays >= GAP_DAYS;
      if (!out.gapOk) out.problems.push({ key: 'gap', kind: 'gap', text: `Your last condition date (${longDate(out.lastCondition)}) needs to be at least a week before settlement (${longDate(out.settlement)}).` });
    }
    if (offer.kiwisaver === true) {
      out.ksWarnDeposit = true;
      out.warnings.push({ kind: 'ks_deposit', text: out.lastCondition || (offer.conditions || []).length
        ? 'Your deposit is due on the day the agreement becomes unconditional. KiwiSaver withdrawals can take a while, so the funds may not arrive in time, and a late deposit attracts interest (clause 21.1). Check timing with your KiwiSaver provider and your lawyer.'
        : 'With no conditions, your deposit is due as soon as the agreement is signed by everyone. KiwiSaver withdrawals can take a while, so the funds may not arrive in time, and a late deposit attracts interest (clause 21.1). Check timing with your KiwiSaver provider and your lawyer.' });
      if (out.settlement) { out.ksSettleDays = countWorkingDays(out.confirmation, out.settlement, { province }); if (out.ksSettleDays < ksDays) { out.ksWarnSettle = true; out.warnings.push({ kind: 'ks_settle', text: `Settlement is ${out.ksSettleDays} working ${out.ksSettleDays === 1 ? 'day' : 'days'} after the agreement would go unconditional. KiwiSaver first-home withdrawals usually need at least ${ksDays} working days, so you may want a later settlement.` }); } }
    }
    const years = [asAt, out.settlement].concat(out.conditions.map(c => c.date)).filter(Boolean).map(d => +d.slice(0, 4));
    out.unknownYear = years.some(y => !yearKnown(y));
    return out;
  }
  const longDate = iso => new Date(toN(iso) * 864e5).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  /* ───── the offer itself ───── */
  // The same limits as the database function offer_clean (migration 018). The server checks again; this is for the buyer's sake.
  const LIMITS = { chattel: 200, chattels: 30, gst: 40, email: 254, phone: 40, name: 120, entity: 200, address: 300, detail: 300, comments: 3000, wording: 2000, request: 600, lawyer: 200, purchasers: 12, price: 1e9, days: 250, reason: 500 };
  const EMAIL_RE = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
  const PHONE_RE = /^[0-9+()\-.\s]{6,40}$/;
  // what must be fixed before sending: [{ field, text }]
  function validate(f, opts) {
    const o = opts || {}, e = [], s = v => String(v ?? '').trim();
    const need = (cond, field, text) => { if (!cond) e.push({ field, text }); };
    need(EMAIL_RE.test(s(f.email)) && s(f.email).length <= LIMITS.email, 'email', 'Add an email address we can reach you on.');
    need(PHONE_RE.test(s(f.phone)), 'phone', 'Add the best phone number for you.');
    need(f.seen_docs === 'yes' || f.seen_docs === 'no', 'seen_docs', 'Let us know whether you have seen the property documents.');
    need(f.sign === 'digital' || f.sign === 'in_person', 'sign', 'Choose how you would like to sign.');
    const price = +String(f.price ?? '').replace(/[^0-9.]/g, ''); need(price >= 1 && price <= LIMITS.price, 'price', 'Add your offer price.');
    need(f.kiwisaver === true || f.kiwisaver === false, 'kiwisaver', 'Let us know whether any KiwiSaver funds go into the deposit.');
    need(f.related === true || f.related === false, 'related', 'Let us know whether any purchaser is connected with Tim or McGuire Real Estate.');
    const ps = Array.isArray(f.purchasers) ? f.purchasers : [];
    need(ps.length >= 1, 'purchasers', 'Add at least one purchaser.');
    need(ps.length <= LIMITS.purchasers, 'purchasers', `Up to ${LIMITS.purchasers} purchasers can be added here. Tim can add more.`);
    ps.forEach((p, i) => {
      need(s(p.first) && s(p.last), 'p' + i, `Add the legal first names and last name for purchaser ${i + 1}.`);
      need(!s(p.email) || EMAIL_RE.test(s(p.email)), 'p' + i, `Check the email for purchaser ${i + 1}.`);
      need(!s(p.phone) || PHONE_RE.test(s(p.phone)), 'p' + i, `Check the phone number for purchaser ${i + 1}.`);
    });
    (f.conditions || []).forEach(c => {
      const info = condInfo(c.key); need(!!info, 'conditions', 'Unknown condition.');
      if (info && info.needs === 'detail') need(s(c.detail), 'c_' + c.key, 'Say what kind of technical report you need.');
      if (info && info.needs === 'address') need(s(f.sale_address), 'sale_address', 'Add the address of the property you need to sell.');
      if (c.key === 'custom') need(s(c.wording) || s(c.request), 'c_custom', 'Describe your own condition, or untick it.');
    });
    ['chattels_add', 'chattels_exclude'].forEach(k => { const a = Array.isArray(f[k]) ? f[k] : []; need(a.length <= LIMITS.chattels, k, `Up to ${LIMITS.chattels} chattels can be listed here. Tim can add more.`); need(a.every(x => String(x ?? '').length <= LIMITS.chattel), k, `Please shorten each chattel to ${LIMITS.chattel} characters.`); });
    need(f.gst_registered == null || typeof f.gst_registered === 'boolean', 'gst', 'Please check the GST answer.');
    need(String(f.gst_number ?? '').length <= LIMITS.gst, 'gst', 'Please check the GST number.');
    const le = s((f.lawyer || {}).email); need(!le || EMAIL_RE.test(le), 'lawyer', "Check your lawyer's email.");
    need(f.privacy === true, 'privacy', 'Please read and tick the privacy note.');
    if (!o.skipDates) { const d = checkDates(f, o); d.problems.forEach(p => { if (p.kind !== 'gap' || !f.date_help) e.push({ field: p.key === 'settlement' ? 'settlement' : p.key === 'gap' ? 'gap' : 'c_' + p.key, text: p.text }); }); }
    return e;
  }
  // a short line of the conditions, for lists
  function conditionsLine(f) { const cs = (f && f.conditions) || []; if (!cs.length) return 'No conditions (unconditional)'; return cs.map(c => (condInfo(c.key) || { label: c.key }).label).join(', '); }

  const OFFERS = { ISO_RE, toN, toIso, addDays, daysBetween, isDate, nzToday, dow, easterSunday, mondayNearest, nthWeekday, MATARIKI, EXTRA_HOLIDAYS, FIRST_YEAR, LAST_YEAR, PROVINCES, DEFAULT_PROVINCE, provinceFor,
    holidays, notWorkingBecause, isWorkingDay, yearKnown, addWorkingDays, countWorkingDays, onOrBefore, CONDITIONS, CUSTOM, condInfo, wordingFor, NO_WORDING, DEPOSIT, depositText,
    ADVICE, CHATTEL_NOTE, GAP_DAYS, KS_DAYS_DEFAULT, SETTLE_DAYS_DEFAULT, conditionDate, checkDates, longDate, LIMITS, EMAIL_RE, PHONE_RE, validate, conditionsLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = OFFERS; else root.OFFERS = OFFERS;
})(typeof window !== 'undefined' ? window : globalThis);
