// Unit tests for onboarding/src/draft-core.js (offers phase 2), on synthetic blanks made at test time (tests/synthetic-blank.js;
// the real REINZ form is never copied into the repository). Covers: reading the edition and refusing an unchecked one; finding every
// place by its printed label (and not being fooled by a "22.0" in the general terms); Yes and No split apart; text already on the
// blank read as "printed"; the chattels on Schedule 2; the drafting rules (purchaser names or entity, and/or nominee, GST only when
// the buyer said, price, settlement against the blank's own wording, each front-page condition's Yes/No and date in both formats,
// clause 22.0 struck through or its days filled, the KiwiSaver deposit clauses, Tim's clauses or a placeholder, the buyer's own
// condition only once ticked, chattels on the schedule, the lawyers' details only, never a purchaser's own phone or email, letters
// the font can't show, edits and extra terms, more purchasers than name places); the drafted PDF (every value placed, read back
// from the PDF's own text; no purchaser contact details anywhere in it; every original content stream kept byte for byte; further
// terms that don't fit continue on an added page); and AI proposals turned into places on the page.
const path = require('path');
const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const errs = [], out = {};
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) errs.push(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) errs.push(msg); };
(async () => {
  const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const quiet = console.log; const warn = console.warn; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };
  const blank = await SB.make(), pages = await D.readPages(pdfjs, blank), map = D.buildMap(pages);
  const P = id => map.places.find(p => p.id === id);
  // the edition
  eq(map.edition, 'Eleventh Edition 2022 (4)', 'edition read'); ok(map.edition_checked && D.editionOk(map.edition), 'the edition is in the checked list');
  const old = D.buildMap(await D.readPages(pdfjs, await SB.make({ edition: 'Tenth Edition 2019 (2)' })));
  ok(old.edition === 'Tenth Edition 2019 (2)' && !old.edition_checked && !D.editionOk(old.edition), 'another edition is read but not checked');
  ok(!D.editionOk('') && !D.editionOk(null) && !D.editionOk('eleventh edition 2022 (4)'), 'nothing else passes');
  // every place found
  eq(map.missing, [], 'nothing missing on the synthetic blank'); out.places = map.places.length;
  eq(map.agreement_pages, [1, 2, 3, 4, 5, 6, 7, 8, 9], 'agreement pages carry the edition (not the inserted page)');
  ok(P('purchaser').page === 1 && P('purchaser').y < 649.7 && P('purchaser').x + P('purchaser').w < P('nominee').x, 'purchaser area below its label, left of and/or nominee');
  ok(P('nominee').kind === 'strike' && Math.abs(P('nominee').y - 649.7) < 0.2, 'and/or nominee on the purchaser line');
  const fin = P('c_finance'); ok(fin.kind === 'yesno' && fin.yes.x < fin.no.x && fin.yes.x + fin.yes.w <= fin.no.x + 0.5 && fin.no.x + fin.no.w <= fin.x + fin.w + 0.5, 'Yes and No are apart, inside Yes/No');
  eq(D.FRONT_CONDITIONS.map(([k]) => !!P('c_' + k) && !!P('d_' + k)), [true, true, true, true, true, true], 'six conditions with Yes/No and date');
  ok(P('d_oia').x > 340, 'the OIA date goes after "(clause 9.8):"');
  ok(!P('price').printed && P('price').x > 97.8 && P('price').x + P('price').w < 326.1, 'price after "$", before Plus GST, empty');
  ok(/Ten percent filler/.test(P('deposit').printed) && /unconditional/.test(P('deposit').printed), 'deposit text already on the blank (two lines) read as printed');
  ok(/fifteen working days/.test(P('settlement').printed), 'settlement already on the blank read as printed');
  eq(P('clause22').page, 8, 'clause 22.0 found on the appendix, not the "22.0" in the general terms'); eq(P('clause22').lines.length, 4, 'clause 22.0 block: heading and three lines');
  eq(P('clause22_days').printed, 'one', 'clause 22.0 working days already says one'); eq(P('clause21_2').lines.length, 2, 'clause 21.2 block'); eq(P('clause21_3').lines.length, 2, 'clause 21.3 block');
  ok(P('further_terms').page === 3 && P('further_terms').h > 500, 'further terms area');
  ok(P('gst_purchaser').page === 4, "Schedule 1 2(a), the purchaser's GST");
  eq(map.chattels.map(c => c.name + ':' + c.qty), ['Stove:', 'Rangehood:1', 'Heat pump:2', 'Dishwasher:1', 'Garden shed:', 'Light fittings:null', 'Window coverings:null', 'Fixed floor coverings:null'], 'chattels read from Schedule 2');
  ok(/Example Vendor Law/.test(P('vl_firm').printed) && !P('pl_firm').printed, "vendor's lawyers already on the blank; purchaser's empty");
  ok(P('p_contact').kind === 'never' && P('v_contact').kind === 'never', 'parties\' own contact details are marked never-fill');
  eq(map.places.filter(p => p.key === 'name_purchaser').length, 3, 'three purchaser name places'); eq(map.places.filter(p => p.key === 'sig_purchaser').length, 3, 'three purchaser signature places');
  ok(map.places.some(p => p.kind === 'witness' && p.page === 9), 'the witness block on the acknowledgement page');
  const no22 = D.buildMap(await D.readPages(pdfjs, await SB.make({ clause22: false })));
  ok(no22.missing.includes('clause22') && no22.missing.includes('clause22_days'), 'a blank without clause 22.0 says so');

  // the drafting rules
  const terms = [
    { key: 'deposit_nzret', kind: 'printed', clause: '21.2', title: 'Deposit to NZRET (21.2)', rule: { when: { kiwisaver: false }, strike_when_unused: false }, position: 10 },
    { key: 'deposit_kiwisaver', kind: 'printed', clause: '21.3', title: 'KiwiSaver deposit (21.3)', rule: { when: { kiwisaver: true }, strike_when_unused: false }, position: 11 },
    { key: 'lawyer_approval', kind: 'printed', clause: '22.0', title: "Lawyer's approval", rule: { when: { condition: 'lawyer' }, strike_when_unused: true }, position: 12 },
    { key: 'electrical', kind: 'further_term', title: 'Electrical report', wording_from: 'electrical', rule: { when: { condition: 'electrical' } }, position: 20 },
    { key: 'technical', kind: 'further_term', title: 'Specified technical report', wording_from: 'technical', rule: { when: { condition: 'technical' } }, position: 21 },
    { key: 'custom', kind: 'further_term', title: "The buyer's own condition", wording_from: 'custom', rule: { when: { condition: 'custom' } }, position: 24 },
    { key: 'chattels', kind: 'further_term', title: 'Chattels', rule: { when: { chattels: true }, where: 'schedule' }, position: 30 },
    { key: 'std_off', kind: 'further_term', title: 'Switched off', wording: 'Never placed', rule: { when: { always: true } }, position: 40, active: false },
  ];
  const base = { email: 'ana.own@buyer.example', phone: '021 999 8888', price: 655000, settlement: { kind: 'relative', days: 15 }, kiwisaver: false, nominee: true,
    conditions: [{ key: 'finance', days: 10 }, { key: 'lim', date: '2026-12-18' }, { key: 'builders', days: 10 }],
    purchasers: [{ first: 'Ana Maria', last: 'Testbuyer', email: 'ana.p@buyer.example', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: '', phone: '' }],
    lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' }, chattels_add: [], chattels_exclude: [], gst_registered: null };
  const plan = (d, edits, extra) => D.planDraft(Object.assign({ details: Object.assign({}, base, d), map, terms, clauses: {}, edits: edits || {}, today: '2026-11-24', province: 'otago' }, extra || {}));
  const I = (p, id) => p.items.find(i => i.id === id), N = (p, id) => p.needs.find(n => n.id === id);
  let p = plan({});
  eq(I(p, 'purchaser').text, 'Ana Maria Testbuyer and Bo Testbuyer', 'purchasers by full legal names'); eq(I(p, 'purchaser_back').text, 'Ana Maria Testbuyer and Bo Testbuyer', 'and on the back page');
  eq([I(p, 'name_purchaser_1').text, I(p, 'name_purchaser_2').text], ['Ana Maria Testbuyer', 'Bo Testbuyer'], 'names under the signatures');
  ok(!I(p, 'nominee'), 'and/or nominee kept when chosen'); ok(!!I(plan({ nominee: false }), 'nominee'), 'and/or nominee struck when not');
  eq(I(p, 'price').text, '$655,000', 'price'); ok(!I(p, 'date'), 'the date at the top is left blank'); ok(N(p, 'date') && !N(p, 'date').blocking, 'and Tim is told');
  ok(!I(p, 'settlement') && !I(p, 'settlement_struck') && N(p, 'settlement_same'), 'settlement matching the blank (fifteen working days) is left alone');
  const p20 = plan({ settlement: { kind: 'relative', days: 20 } }); ok(I(p20, 'settlement_struck') && /^twenty \(20\) working days/.test(I(p20, 'settlement').text), 'a different settlement strikes the blank\'s and writes the offer\'s');
  eq(I(plan({ settlement: { kind: 'date', date: '2027-02-13' } }), 'settlement').text, '12 February 2027', 'a settlement date on a Saturday becomes the working day before, in full with the month');
  // conditions: Yes or No by striking the other, the date in full
  const fy = I(p, 'c_finance'); ok(fy.kind === 'strike' && fy.value === 'Yes' && Math.abs(fy.x - P('c_finance').no.x) < 0.01, 'finance yes: No struck');
  const ty = I(p, 'c_toxicology'); ok(ty.value === 'No' && Math.abs(ty.x - P('c_toxicology').yes.x) < 0.01, 'toxicology no: Yes struck');
  eq([I(p, 'd_finance').text, I(p, 'd_lim').text, I(p, 'd_builders').text], ['8 December 2026', '18 December 2026', '8 December 2026'], 'condition dates in full with the month name');
  ok(!I(p, 'd_toxicology'), 'no date for a condition not chosen');
  eq(I(plan({}, { date_format: 'date_days' }), 'd_finance').text, '8 December 2026 (10 working days)', 'and as a working-days count when Tim chooses');
  ok(N(p, 'days_from'), 'Tim is told working days are counted from today');
  // clause 22.0
  const c22 = I(p, 'clause22'); ok(c22 && c22.kind === 'lines' && c22.lines.length === 4, "lawyer's approval not chosen: clause 22.0 struck through, line by line");
  const pl = plan({ conditions: base.conditions.concat({ key: 'lawyer', days: 5 }) }); ok(!I(pl, 'clause22') && I(pl, 'clause22_days').text === '5' && I(pl, 'clause22_days_struck'), 'chosen: not struck, its days filled (the blank\'s "one" struck)');
  ok(I(plan({ conditions: [{ key: 'lawyer', days: 1 }] }), 'clause22_days') === undefined && N(plan({ conditions: [{ key: 'lawyer', days: 1 }] }), 'clause22_same'), 'one working day matches the blank: left alone');
  const pn = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'lawyer', days: 3 }] }), map: no22, terms, clauses: {}, today: '2026-11-24' }); ok(N(pn, 'missing_clause22').blocking, 'no clause 22.0 on the blank: blocking');
  // deposit clauses
  ok(N(p, 'keep_deposit_nzret') && !I(p, 'strike_clause21_3'), 'KiwiSaver no: 21.2 kept, 21.3 left as printed');
  const ks = plan({ kiwisaver: true }); ok(N(ks, 'keep_deposit_kiwisaver') && !I(ks, 'strike_clause21_2'), 'KiwiSaver yes: 21.3 kept, nothing struck by default');
  const ks2 = D.planDraft({ details: Object.assign({}, base, { kiwisaver: true }), map, terms: terms.map(t => t.key === 'deposit_nzret' ? Object.assign({}, t, { rule: { when: { kiwisaver: false }, strike_when_unused: true } }) : t), today: '2026-11-24' });
  ok(I(ks2, 'strike_clause21_2') && I(ks2, 'strike_clause21_2').lines.length === 2, 'with strike_when_unused, 21.2 is struck through when KiwiSaver funds the deposit');
  // Tim's clauses: wording or a placeholder; the buyer's own only once ticked
  const pe = plan({ conditions: [{ key: 'electrical', days: 10 }, { key: 'custom', days: 10, wording: 'Buyer typed wording.', ai: true }] });
  const ft = I(pe, 'further_terms'); ok(ft && /^1\. Electrical report: \[Tim to add his electrical report clause\]/.test(ft.text), 'electrical without wording: highlighted placeholder');
  ok(N(pe, 'ph_ft_electrical').blocking && N(pe, 'ph_ft_custom').blocking, 'placeholders listed as Needs you, blocking');
  ok(/2\. Purchaser's condition: \[Tim to tick the buyer's own condition wording\]/.test(ft.text) && !/Buyer typed wording/.test(ft.text), "the buyer's own wording is not used until ticked");
  const pe2 = D.planDraft({ details: pe.terms && Object.assign({}, base, { conditions: [{ key: 'electrical', days: 10 }, { key: 'custom', days: 10, wording: 'Buyer typed wording.' }] }), map, terms, clauses: { electrical: "Tim's electrical words." }, edits: { custom_ok: true }, today: '2026-11-24' });
  ok(/1\. Electrical report: Tim's electrical words\. Condition date: 8 December 2026\./.test(I(pe2, 'further_terms').text) && /2\. Purchaser's condition: Buyer typed wording\./.test(I(pe2, 'further_terms').text) && !pe2.needs.some(n => n.blocking), "Tim's wording and the ticked condition: no placeholders");
  ok(!/Never placed/.test(I(pe2, 'further_terms').text), 'a switched-off clause is never placed');
  const ptech = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'technical', days: 10, detail: 'Drainage' }] }), map, terms, clauses: { technical: 'A {detail} report by {date}.' }, today: '2026-11-24' });
  ok(/Specified technical report \(Drainage\): A Drainage report by 8 December 2026\./.test(I(ptech, 'further_terms').text), 'a clause can name the detail and the date');
  const pex = plan({}, { extra_terms: ['Tim typed this extra term.'], items: { price: '$656,000' } });
  ok(/1\. Your further term: Tim typed this extra term\./.test(I(pex, 'further_terms').text) && I(pex, 'price').text === '$656,000' && I(pex, 'price').edited, 'an extra term and an edited value');
  // GST: only when the buyer said so
  ok(!I(p, 'gst_purchaser') && N(p, 'gst_unknown') && N(p, 'gst_vendor'), 'GST not said: nothing placed; the vendor\'s GST is Tim\'s');
  eq(I(plan({ gst_registered: true, gst_number: '123-456-789' }), 'gst_purchaser').value, 'Yes', "said yes: Schedule 1 2(a) No struck"); eq(I(plan({ gst_registered: false }), 'gst_purchaser').value, 'No', 'said no');
  // chattels on the schedule
  const pc = plan({ chattels_add: ['Outdoor table'], chattels_exclude: ['Heat pumps', 'Spa pool'] });
  eq(I(pc, 'chattels_add').text, 'Also included: Outdoor table', 'added chattels written on Schedule 2');
  ok(I(pc, 'chattel_x_1') && I(pc, 'chattel_x_1').kind === 'strike' && /Heat pump/.test(I(pc, 'chattel_x_1').label), 'an excluded chattel on the schedule is struck through');
  ok(N(pc, 'chattel_x_2') && /Spa pool/.test(N(pc, 'chattel_x_2').text), 'one not on the schedule is listed for Tim');
  // the lawyers' details only
  eq(['pl_firm', 'pl_person', 'pl_email', 'pl_phone', 'pl_service'].map(k => (I(p, k) || {}).text), ['Synthetic Law', 'Pat Solicitor', 'pat@synthlaw.example', '03 477 1234', 'pat@synthlaw.example'], "purchaser's lawyers placed");
  ok(!['vl_firm', 'vl_person', 'vl_email'].some(k => I(p, k)), "the vendor's lawyers already on the blank are left alone");
  const allText = pl => pl.items.map(i => i.text || '').join('\n');
  ok(!/ana\.own@|ana\.p@|999 8888|777 6666/.test(allText(p)), 'no purchaser email or phone in anything placed');
  const pbad = plan({ lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'ana.p@buyer.example', phone: '022 777 6666' } });
  ok(!I(pbad, 'pl_email') && !I(pbad, 'pl_phone') && !I(pbad, 'pl_service') && N(pbad, 'privacy_pl_email').blocking, "a purchaser's own email typed as the lawyer's is left off, and blocks");
  const pv = D.planDraft({ details: base, map: D.buildMap(await D.readPages(pdfjs, await SB.make({ vendorLawyer: false }))), terms, today: '2026-11-24', vendorLawyer: { firm: 'Held Law', person: 'Hal Held', email: 'hal@held.example', source: "the agency agreement's lawyer link" } });
  ok(I(pv, 'vl_firm').text === 'Held Law' && N(pv, 'vendor_lawyer_from'), "the vendor's lawyer from the file when the blank has none, with where it came from");
  // entity, many purchasers, letters the font can't show
  const pent = plan({ entity: 'Testbuyer Family Trust' }); ok(I(pent, 'purchaser').text === 'Testbuyer Family Trust' && !I(pent, 'name_purchaser_1') && N(pent, 'entity_signers'), 'an entity: its name, and signers left for Tim');
  const many = plan({ purchasers: [1, 2, 3, 4].map(i => ({ first: 'Person' + i, last: 'Testbuyer' })) }); ok(N(many, 'names_more').blocking, 'more purchasers than name places: blocking');
  const mac = plan({ purchasers: [{ first: 'Mārama', last: 'Testbuyer' }] }); ok(!I(mac, 'purchaser') && N(mac, 'font_purchaser').blocking, 'a macron the font can\'t show: not placed, blocking');
  ok(D.ruleApplies({ when: { kiwisaver: true } }, { kiwisaver: true }) && !D.ruleApplies({ when: { kiwisaver: true } }, { kiwisaver: false }) && !D.ruleApplies({}, {}) && !D.ruleApplies({ when: { moon: 1 } }, {}), 'rules');

  // the drafted PDF
  const full = D.planDraft({ details: Object.assign({}, base, { nominee: false, conditions: base.conditions.concat({ key: 'electrical', days: 10 }), chattels_add: ['Outdoor table'], chattels_exclude: ['Heat pump'] }), map, terms, clauses: {}, today: '2026-11-24' });
  const r = await D.renderDraft(PDFLib, blank, full);
  ok(r.bytes.length > blank.length && !r.continued, 'drafted PDF made');
  const dpages = await D.readPages(pdfjs, r.bytes), text = n => dpages[n - 1].items.map(i => i.s).join(' '), whole = dpages.map(pg => pg.items.map(i => i.s).join(' ')).join('\n');
  eq(dpages.length, pages.length, 'same number of pages');
  ['Ana Maria Testbuyer and Bo Testbuyer', '$655,000', '8 December 2026', '18 December 2026'].forEach(v => ok(text(1).includes(v), 'front page has ' + v));
  ok(/1\. Electrical report: \[Tim to add his electrical report clause\]/.test(text(3)), 'further terms on their page, with the placeholder');
  ok(text(5).includes('Also included: Outdoor table'), 'chattels added on Schedule 2');
  ['Synthetic Law', 'Pat Solicitor', 'pat@synthlaw.example', '03 477 1234'].forEach(v => ok(text(7).includes(v), 'back page has the lawyer\'s ' + v));
  ok(text(6).includes('Ana Maria Testbuyer') && text(6).includes('Bo Testbuyer'), 'names under the signatures');
  ok(!/ana\.own@|ana\.p@|999 8888|777 6666/.test(whole), 'the drafted PDF holds no purchaser email or phone anywhere');
  ok(r.boxes.length >= full.items.length - 1 && r.boxes.every(b => b.page >= 1 && b.page <= dpages.length), 'every placed item has a box for the review screen');
  // the original pages are untouched: every original content stream is still there, byte for byte, in order
  const raw = async bytes => { const d = await PDFLib.PDFDocument.load(bytes); return d.getPages().map(pg => { const c = pg.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c];
    return refs.map(ref => { const s = d.context.lookup(ref); return Buffer.from(s.getContents ? s.getContents() : s.contents).toString('base64'); }); }); };
  const before = await raw(blank), after = await raw(r.bytes);
  ok(before.every((streams, i) => { const a = after[i]; let j = 0; for (const s of streams) { j = a.indexOf(s, j); if (j < 0) return false; j++; } return true; }), 'every original content stream kept byte for byte');
  ok(after.some((a, i) => a.length > before[i].length), 'text added in new content streams');
  // a long further terms list continues on an added page
  const long = D.planDraft({ details: base, map, terms, today: '2026-11-24', edits: { extra_terms: Array.from({ length: 70 }, (_, i) => `Extra term ${i + 1} with enough words to take a full line of the page.`) } });
  const rl = await D.renderDraft(PDFLib, blank, long), lp = await D.readPages(pdfjs, rl.bytes);
  ok(rl.continued === 4 && lp.length === pages.length + 1 && lp[3].items.some(i => /Further Terms of Sale \(continued\)/.test(i.s)) && lp[3].items.some(i => /Extra term 70/.test(i.s)), 'further terms that don\'t fit continue on an added page after page 3');
  ok(rl.boxes.find(b => b.id === 'pl_firm').page === 8, 'boxes on later pages move along by the added page');
  // AI proposals onto the page, and the pack's text for the reader
  const pt = D.packText(pages); ok(pt.length === pages.length && pt[0].lines[0].i === 0, 'the pack as numbered lines per page');
  const bt = D.packBatches(pt, 3, 100000); eq(bt.map(b => b.length), [3, 3, 3, 1], 'batches of at most 3 pages');
  const wl = pt[8].lines.find(l => /Witnessed/.test(l.t));
  const pr = D.placeFromProposal(pages, { page: 9, line: wl.i, kind: 'sign', reason: 'Witness signs here' }, 0);
  ok(pr && pr.source === 'ai' && pr.kind === 'signature' && pr.page === 9 && pr.x > 0 && pr.x + pr.w <= pages[8].w && Math.abs(pr.y - (600 - 5)) < 1 && pr.reason === 'Witness signs here', 'a proposal sits beside the line it names, on the page');
  ok(D.placeFromProposal(pages, { page: 99, line: 0, kind: 'initial' }, 1) === null, 'a proposal for a page that isn\'t there is dropped');
  console.log = quiet; console.warn = warn;
  out.checked = 'done';
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['crashed'] }, null, 1)); });
