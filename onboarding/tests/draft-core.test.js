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
  ok(/Ten percent filler/.test(P('deposit').printed) && /second filler line/.test(P('deposit').printed), 'deposit text already on the blank (two lines) read as printed');
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
  const ft = I(pe, 'further_terms'); ok(ft && /^23\.0 Electrical report: \[Tim to add his electrical report clause\]/.test(ft.text), 'electrical without wording: highlighted placeholder');
  ok(N(pe, 'ph_ft_electrical').blocking && N(pe, 'ph_ft_custom').blocking, 'placeholders listed as Needs you, blocking');
  ok(/24\.0 Purchaser's condition: \[Tim to tick the buyer's own condition wording\]/.test(ft.text) && !/Buyer typed wording/.test(ft.text), "the buyer's own wording is not used until ticked");
  const pe2 = D.planDraft({ details: pe.terms && Object.assign({}, base, { conditions: [{ key: 'electrical', days: 10 }, { key: 'custom', days: 10, wording: 'Buyer typed wording.' }] }), map, terms, clauses: { electrical: "Tim's electrical words." }, edits: { custom_ok: true }, today: '2026-11-24' });
  ok(/23\.0 Electrical report: Tim's electrical words\. Condition date: 8 December 2026\./.test(I(pe2, 'further_terms').text) && /24\.0 Purchaser's condition: Buyer typed wording\./.test(I(pe2, 'further_terms').text) && !pe2.needs.some(n => n.blocking), "Tim's wording and the ticked condition: no placeholders");
  ok(!/Never placed/.test(I(pe2, 'further_terms').text), 'a switched-off clause is never placed');
  const ptech = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'technical', days: 10, detail: 'Drainage' }] }), map, terms, clauses: { technical: 'A {detail} report by {date}.' }, today: '2026-11-24' });
  ok(/Specified technical report \(Drainage\): A Drainage report by 8 December 2026\./.test(I(ptech, 'further_terms').text), 'a clause can name the detail and the date');
  const pex = plan({}, { extra_terms: ['Tim typed this extra term.'], items: { price: '$656,000' } });
  ok(/23\.0 Your further term: Tim typed this extra term\./.test(I(pex, 'further_terms').text) && I(pex, 'price').text === '$656,000' && I(pex, 'price').edited, 'an extra term and an edited value');
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
  ok(/23\.0 Electrical report: \[Tim to add his electrical report clause\]/.test(text(3)), 'further terms on their page, with the placeholder');
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
  const rl = await D.renderDraft(PDFLib, blank, long, { bandImage: SB.bandImager(blank) }), lp = await D.readPages(pdfjs, rl.bytes);
  ok(rl.continued === 4 && lp.length === pages.length + 1 && lp[3].items.some(i => i.s === '(continued)') && lp[3].items.some(i => /Extra term 70/.test(i.s)), 'further terms that don\'t fit continue on an added page after page 3');
  ok(rl.boxes.find(b => b.id === 'pl_firm').page === 8, 'boxes on later pages move along by the added page');
  // ── review findings ──
  // 1. phones by national digits, emails without case, also inside a sentence, wherever the text comes from
  eq(['+64 21 555 0199', '0064 21 555 0199', '21 555 0199', '(021) 555-0199', '021-555-0199', '+64 3 477 1234', '03 477 1234'].map(D.nsn), ['215550199', '215550199', '215550199', '215550199', '215550199', '34771234', '34771234'], 'NZ numbers reduced to national digits');
  const own1 = D.ownContacts([{ who: 'a purchaser', email: 'Ana.P@Buyer.Example', phone: '+64 21 555 0199' }]);
  ['Call 021 555 0199 after five', '+64 21 555 0199', '0064 21 555 0199', '21 555 0199', '(021) 555-0199', 'write to ANA.P@buyer.example today'].forEach(t => ok(D.holdsOwn(t, own1) === 'a purchaser', 'found in: ' + t));
  ok(!D.holdsOwn('$655,000, 8 December 2026 (10 working days)', own1) && !D.holdsOwn('03 477 1234', own1), 'prices, dates and other numbers are not mistaken for it');
  const pp = { purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@buyer.example', phone: '+64 21 555 0199' }], email: 'own@buyer.example', phone: '022 333 4444' };
  const priv = D.planDraft({ details: Object.assign({}, base, pp, { conditions: [{ key: 'custom', days: 10, wording: 'Ring (021) 555-0199 to arrange it.' }], chattels_add: ['Ask OWN@buyer.example'],
    lawyer: { firm: 'Synthetic Law', person: 'Pat', email: 'pat@synthlaw.example', phone: '0064 21 555 0199' } }), map, terms, today: '2026-11-24', edits: { custom_ok: true, items: { price: 'Phone 022-333-4444' }, extra_terms: ['Text +64 21 555 0199 first.'] } });
  ok(!I(priv, 'pl_phone') && N(priv, 'privacy_pl_phone').blocking, 'a lawyer phone that is the purchaser\'s own (other format) is left off and blocks');
  ok(!I(priv, 'price') && N(priv, 'privacy_price').blocking, 'Tim\'s edit holding the buyer\'s phone is left off');
  ok(!I(priv, 'further_terms') && N(priv, 'privacy_further_terms').blocking, 'further terms holding a phone (custom wording, extra term) are left off');
  ok(!I(priv, 'chattels_add') && N(priv, 'privacy_chattels_add').blocking, 'chattels holding the buyer\'s email are left off');
  ok(I(priv, 'pl_email') && I(priv, 'pl_firm'), 'the lawyer\'s own details still go on');
  // 2. the vendors' own details too, and the vendor's lawyer from the file only for this round, signed
  const parties = [{ who: 'a vendor', email: 'testy@vendor.example', phone: '021 000 1111' }];
  const pvv = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'custom', days: 5, wording: 'Vendor to call +64 21 000 1111.' }] }), map, terms, today: '2026-11-24', edits: { custom_ok: true }, parties });
  ok(!I(pvv, 'further_terms') && /a vendor's own/.test(N(pvv, 'privacy_further_terms').text) && N(pvv, 'privacy_further_terms').blocking, "a vendor's own phone is never placed");
  const vmap = D.buildMap(await D.readPages(pdfjs, await SB.make({ vendorLawyer: false })));
  const pvl = D.planDraft({ details: base, map: vmap, terms, today: '2026-11-24', parties, vendorLawyer: { firm: 'Self', person: 'Testy', email: 'Testy@Vendor.example', source: 'file' } });
  ok(!I(pvl, 'vl_email') && !I(pvl, 'vl_service') && N(pvl, 'privacy_vl_email').blocking, "a vendor's lawyer email that is the vendor's own is left off and blocks");
  const ags = [{ id: 'old', status: 'countersigned', created_at: '2025-01-01T00:00:00Z' }, { id: 'draft', status: 'draft', created_at: '2026-11-01T00:00:00Z' }, { id: 'now', status: 'countersigned', created_at: '2026-10-01T00:00:00Z' }];
  const lks = [{ agreement_id: 'old', firm: 'Old Law', lawyer_name: 'Olly', email: 'olly@old.example', sent_at: '2025-01-02' }, { agreement_id: 'draft', firm: 'Draft Law', email: 'd@draft.example', sent_at: '2026-11-02' }, { agreement_id: 'now', firm: 'Now Law', lawyer_name: 'Nina', email: 'nina@now.example', sent_at: '2026-10-02' }];
  eq((D.pickVendorLawyer({ cycle_at: '2026-06-01T00:00:00Z' }, ags, lks, parties) || {}).firm, 'Now Law', 'vendor lawyer: only a signed agreement of this round of owners');
  eq(D.pickVendorLawyer({ cycle_at: '2026-06-01T00:00:00Z' }, ags.filter(a => a.id !== 'now'), lks, parties), null, 'none when only an earlier round or an unsigned agreement has one');
  eq(D.pickVendorLawyer({}, ags, lks.concat({ agreement_id: 'now', firm: 'Mine', email: 'testy@vendor.example', sent_at: '2026-12-01' }), parties).firm, 'Now Law', "a link to the vendor's own email is never taken");
  // 3. anything but the further terms that doesn't fit blocks approval
  const p30 = plan({ chattels_add: Array.from({ length: 30 }, (_, i) => 'Synthetic chattel number ' + (i + 1)) });
  const r30 = await D.renderDraft(PDFLib, blank, p30);
  ok(r30.overflow.length === 1 && r30.overflow[0].id === 'chattels_add' && p30.needs.find(n => n.id === 'overflow_chattels_add').blocking, '30 chattels: the overflow is a blocking Needs you item');
  // 4. printed further terms: ours start below them, numbered on, with a check Tim must tick
  const pmap = D.buildMap(await D.readPages(pdfjs, await SB.make({ printedTerms: true }))), pf = pmap.places.find(x => x.id === 'further_terms');
  ok(pf.printed_count === 3 && pf.printed_last === 2 && Math.abs(pf.printed_bottom - 706) < 0.5, 'printed terms on the Further Terms page read: three lines, numbered to 2');
  const ppt = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'electrical', days: 10 }] }), map: pmap, terms, clauses: { electrical: 'Words.' }, today: '2026-11-24', edits: { extra_terms: ['Extra.'] } });
  const pit = I(ppt, 'further_terms'); ok(pit.y < 706 - 10 && /^23\. Electrical report/.test(pit.text) && /\n24\. Your further term: Extra\./.test(pit.text), 'our terms start below the lowest printed line, numbered from 23 in the page\'s own style ("1." printed: "23.")');
  const fpn = N(ppt, 'further_printed'); ok(fpn && fpn.blocking && fpn.ackable && /3 printed lines, numbered to 2/.test(fpn.text) && /numbered from 23\./.test(fpn.text), 'and Tim must tick that he has checked the page');
  ok(!N(p, 'further_printed'), 'no such check on a page with no printed terms');
  // 10. settlement: every printed line struck, within the text, the new text below the last
  const m2 = D.buildMap(await D.readPages(pdfjs, await SB.make({ twoLineSettlement: true }))), sp2 = m2.places.find(x => x.id === 'settlement');
  const p2 = D.planDraft({ details: Object.assign({}, base, { settlement: { kind: 'relative', days: 20 } }), map: m2, terms, today: '2026-11-24' });
  const st2 = I(p2, 'settlement_struck'), nt2 = I(p2, 'settlement');
  ok(st2.kind === 'lines' && st2.lines.length === 2 && st2.lines.every(l => l.x1 - l.x0 < 200 && l.x0 >= 315), 'both printed settlement lines struck, each within its own text');
  ok(nt2.y < Math.min(...st2.lines.map(l => l.y)) - 5, 'the new settlement is written below the last struck line');
  // 11. a date moved to a working day is noted
  const pmv = plan({ settlement: { kind: 'date', date: '2027-02-13' }, conditions: [{ key: 'finance', date: '2026-12-26' }] });
  ok(N(pmv, 'settlement_moved') && !N(pmv, 'settlement_moved').blocking && /13 February 2027/.test(N(pmv, 'settlement_moved').text), 'settlement moved to a working day: To check');
  ok(N(pmv, 'moved_finance') && /26 December 2026/.test(N(pmv, 'moved_finance').text), 'a condition date moved: To check');
  // 12. the email for notices follows Tim's edit of the lawyer's email
  eq(I(plan({}, { items: { pl_email: 'new@synthlaw.example' } }), 'pl_service').text, 'new@synthlaw.example', 'notices email follows the edit');
  // 13. clause 22.0's new count: in the margin with a caret, never above the line
  const c22p = P('clause22_days'), c22n = I(pl, 'clause22_days');
  ok(c22n.x >= c22p.line_x1 + 5 && Math.abs(c22n.y - c22p.y) < 0.01 && I(pl, 'clause22_caret') && N(pl, 'clause22_margin'), 'clause 22.0: the new count in the margin on the same line, with a caret under the struck word');
  // 14. "Continued on the next page" at the foot of the Further Terms page
  const lt = await D.readPages(pdfjs, rl.bytes); ok(lt[2].items.some(i => i.s === 'Continued on the next page.'), 'the Further Terms page says it continues');
  // the sale of another property names the buyer's address: noted for Tim
  const psale = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'sale', days: 20 }], sale_address: '9 Filler Street, Testville' }), map, terms: terms.concat({ key: 'sale', kind: 'further_term', title: 'Sale of another property', wording_from: 'sale', rule: { when: { condition: 'sale' } }, position: 22 }), clauses: { sale: 'Sale of {address}.' }, today: '2026-11-24' });
  ok(N(psale, 'sale_address_seen') && !N(psale, 'sale_address_seen').blocking && /9 Filler Street/.test(N(psale, 'sale_address_seen').text) && /9 Filler Street/.test(I(psale, 'further_terms').text), "the buyer's address stays in the term, with a To check note that the vendors will see it");
  ok(!Object.values(D.EDITIONS).some(e => /Pine Hill/.test(JSON.stringify(e))), 'no real address in the editions list');

  // ── further terms numbering and the continuation page (Tim, 24 November 2026) ──
  eq([map.numbering.general_last, map.numbering.appendix_last, map.numbering.ft_page, map.numbering.appendix_page], [20, 22, 3, 8], 'read from the blank: general terms to 20.0 (not fooled by "22.0" inside a sentence), the appendix to 22.0');
  const ext = n => ({ extra_terms: Array.from({ length: n }, (_, i) => `Extra term ${i + 1}.`) });
  const nums = pp => (I(pp, 'further_terms') || { terms: [] }).terms.map(x => x.number);
  eq(nums(plan({}, ext(3))), [23, 24, 25], 'no terms printed on the Further Terms page: numbered on from the appendix\'s 22.0');
  const m21 = D.buildMap(await D.readPages(pdfjs, await SB.make({ clause22: false })));
  eq(nums(D.planDraft({ details: base, map: m21, terms, today: '2026-11-24', edits: ext(2) })), [22, 23], 'an appendix printed to 21.x only: on from 21');
  const m30 = D.buildMap(await D.readPages(pdfjs, await SB.make({ generalTerms: 30 })));
  eq(nums(D.planDraft({ details: base, map: m30, terms, today: '2026-11-24', edits: ext(1) })), [31], 'the last general terms clause is read, never a fixed value');
  // 21.x and 22.0 printed on the Further Terms page itself, as the REINZ portal places them: ours start below the lowest, from 23
  const apx = await SB.make({ ftAppendix: true, pageNoOffset: 19 }), mapx = D.buildMap(await D.readPages(pdfjs, apx)), fpx = mapx.places.find(x => x.id === 'further_terms');
  ok(fpx.printed_last === 22 && fpx.printed_bottom < 560 && mapx.numbering.appendix_page === 3 && mapx.places.find(x => x.id === 'clause22').page === 3, 'the appendix on the Further Terms page: 21.x and 22.0 read as printed there');
  const ppx = D.planDraft({ details: base, map: mapx, terms, today: '2026-11-24', edits: ext(2) }), ipx = I(ppx, 'further_terms');
  ok(eq(nums(ppx), [23, 24]) === undefined && ipx.y < fpx.printed_bottom - 10 && /^23\.0 Your further term: Extra term 1\./.test(ipx.text) && /numbered from 23\.0/.test(N(ppx, 'further_printed').text), 'new terms below 22.0, numbered 23 and 24');
  // a removed term's number is never used again
  const prm = plan({}, Object.assign(ext(2), { retired_numbers: [24] }));
  eq(nums(prm), [23, 25], 'a removed term (24) is skipped: the next is 25'); eq([prm.term_base, prm.term_last, prm.retired_numbers], [22, 25, [24]], 'and the plan says where the sequence is up to');
  // Tim, 24 November 2026: added further terms are written 23.0, 24.0 and so on, like the printed 22.0
  eq(D.termNo(23), '23.0', 'a term number as the agreement writes it');
  const prmT = (I(prm, 'further_terms') || {}).text || ''; ok(/^23\.0 Your further term: Extra term 1\./m.test(prmT) && /^25\.0 Your further term: Extra term 2\./m.test(prmT) && !/^24\.0 /m.test(prmT), 'the list numbered 23.0 and 25.0: the retired 24.0 is not used');
  ok(N(prm, 'term_start') && /^Further terms start at 23\.0 /.test(N(prm, 'term_start').text), 'the starting-number note in the same style');
  eq(plan({}, { retired_numbers: [26] }).term_last, 26, 'a retired number counts even with nothing after it');
  // the continuation page from the appendix page's own bands, with the page number struck and the right one beside it
  const C = mapx.numbering.cont; ok(C && C.page === 3 && C.page_no && C.page_no.value === 22 && C.header[0] > 740 && C.footer[1] < 40 && C.head.text === 'Appendix', 'bands found: header to the headings, footer with the printed page number 22');
  const over = n => D.planDraft({ details: base, map: mapx, terms, today: '2026-11-24', numbering: mapx.numbering, edits: { extra_terms: Array.from({ length: n }, (_, i) => `Extra term ${i + 1} with enough words to take a full line of the page, more or less.`) } });
  const bandImage = SB.bandImager(apx);
  const po1 = over(70), ro1 = await D.renderDraft(PDFLib, apx, po1, { bandImage }), lp1 = await D.readPages(pdfjs, ro1.bytes), pgOf = (pp, n) => pp[n - 1].items.map(i => i.s);
  eq([ro1.added_pages.length, ro1.added_pages[0].page, ro1.added_pages[0].source_page, ro1.added_pages[0].number], [1, 4, 3, { printed: '22', written: '23' }], 'one added page, straight after the appendix page, numbered 23');
  // the bands are pictures: the added page's text is only what was typed on it
  const pdfTxt = (bytes, f, l) => { const fn = path.join(__dirname, 'out', 'cont-txt.pdf'); require('fs').writeFileSync(fn, bytes); return require('child_process').execFileSync('pdftotext', ['-layout'].concat(f ? ['-f', String(f), '-l', String(l)] : []).concat([fn, '-']), { encoding: 'utf8' }); };
  const typed = t => t.replace(/\s+/g, ' ').replace(/\d+\.0 Your further term: Extra term \d+ with enough words to take a full line of the page, more or less\./g, '').replace(/\s+/g, ' ').trim();
  const strip4 = typed(pdfTxt(ro1.bytes, 4, 4));
  eq(strip4.split(' ').sort(), ['(continued)', '23'], 'pdftotext of the added page: only "(continued)", the new page number and the typed terms');
  const js4 = pgOf(lp1, 4).filter(x => !/Extra term|with enough words|more or less/.test(x)); eq(js4.sort(), ['(continued)', '23'], 'pdf.js reads the same');
  eq((pdfTxt(ro1.bytes).match(/21\.2 Synthetic/g) || []).length, 1, '"21.2" appears exactly once in the whole file');
  const xo = await (async () => { const dd = await PDFLib.PDFDocument.load(ro1.bytes); return [3].map(i => { const res = dd.getPages()[i].node.Resources(), X = res && res.lookup(PDFLib.PDFName.of('XObject'));
    return X ? X.entries().map(([k, ref]) => String(dd.context.lookup(ref).dict.get(PDFLib.PDFName.of('Subtype')))) : []; }); })();
  ok(xo.every(a => a.length === 2 && a.every(t => t === '/Image')), 'each added page\'s pictures are all /Subtype /Image: ' + JSON.stringify(xo));
  ok(!/embedPage\(/.test(require('fs').readFileSync(path.join(__dirname, '..', 'src', 'draft-core.js'), 'utf8')), 'the page itself is never embedded');
  // and none of the printed clauses show either: no ink where their first letters sit (left of where the typed terms start), between the bands
  const { execFileSync } = require('child_process'), fsx = require('fs'), tmp = path.join(__dirname, 'out', 'cont-check');
  fsx.writeFileSync(tmp + '.pdf', ro1.bytes); let inkLeft = null;
  try { execFileSync('pdftoppm', ['-f', '4', '-l', '4', '-r', '72', '-gray', tmp + '.pdf', tmp]); const f = fsx.readdirSync(path.join(__dirname, 'out')).find(x => x.startsWith('cont-check') && x.endsWith('.pgm'));
    const buf = fsx.readFileSync(path.join(__dirname, 'out', f)); let off = 0, fields = []; while (fields.length < 4) { let e = off; while (buf[e] !== 10 && buf[e] !== 32) e++; const tok = buf.slice(off, e).toString(); if (tok) fields.push(tok); off = e + 1; }
    const W = +fields[1], H = +fields[2], px = buf.slice(off); inkLeft = 0;
    for (let y = Math.round(842 - 730); y < Math.round(842 - 555); y++) for (let x = 27; x < 34; x++) if (px[y * W + x] < 160) inkLeft++;
    fsx.unlinkSync(path.join(__dirname, 'out', f)); } catch (e) { inkLeft = 'no renderer: ' + e.message; }
  ok(inkLeft === 0, 'none of the printed clauses show on the added page: ' + inkLeft);
  ok(pgOf(lp1, 5).includes(String(4 + 19)), 'the rest of the pack keeps its own numbers');
  const hd = lp1[3].items.find(i => i.s === '(continued)'), n23 = lp1[3].items.find(i => i.s === '23' && i.y < 40);
  ok(hd && Math.abs(hd.y - C.head.y) < 1 && hd.x > C.head.x1, '"(continued)" typed after the Appendix heading, on its line');
  ok(n23 && Math.abs(n23.y - C.page_no.y) < 1 && n23.x > C.page_no.x + C.page_no.w, 'the new page number beside where the printed one is');
  // the printed page number (in the picture) is struck through: a dark line across it on the rendered page
  require('fs').writeFileSync(path.join(__dirname, 'out', 'cont-strike.pdf'), ro1.bytes);
  require('child_process').execFileSync('pdftoppm', ['-f', '4', '-l', '4', '-r', '72', '-gray', '-x', String(Math.round(C.page_no.x)), '-y', String(Math.round(842.04 - C.page_no.y - C.page_no.h * 0.32 - 1)), '-W', String(Math.max(2, Math.round(C.page_no.w))), '-H', '2', '-singlefile', path.join(__dirname, 'out', 'cont-strike.pdf'), path.join(__dirname, 'out', 'cont-strike')]);
  const sbuf = require('fs').readFileSync(path.join(__dirname, 'out', 'cont-strike.pgm')), sw = Math.max(2, Math.round(C.page_no.w)), spx = sbuf.slice(sbuf.length - sw * 2);
  ok(Array.from(spx).filter(v => v < 128).length >= sw, 'the printed page number is struck through');
  ok(ro1.boxes.some(b => /page number 22 struck, 23 written beside it/.test(b.label) && b.page === 4), 'the strike and new number are a box Tim sees');
  ok(po1.needs.find(n => n.id === 'continuation_page_clash') && po1.needs.find(n => n.id === 'continuation_page_clash').blocking && /page 4 of the blank already prints 23/.test(po1.needs.find(n => n.id === 'continuation_page_clash').text), 'a later page that already prints 23: Tim checks the numbering');
  const apn = await SB.make({ ftAppendix: true, pageNoOffset: 19, laterNumbers: false }), mpn = D.buildMap(await D.readPages(pdfjs, apn));
  const ppn = D.planDraft({ details: base, map: mpn, terms, today: '2026-11-24', numbering: mpn.numbering, edits: { extra_terms: Array.from({ length: 70 }, (_, i) => `Extra term ${i + 1} with enough words to take a full line of the page, more or less.`) } });
  const rpn = await D.renderDraft(PDFLib, apn, ppn, { bandImage: SB.bandImager(apn) }); ok(!rpn.added_pages[0].plain && !ppn.needs.some(n => n.id === 'continuation_page_clash'), 'later pages numbered as separate documents: no clash');
  const aof = await SB.make({ ftAppendix: true, pageNoOffset: 19, laterNumbers: false, pageNoFormat: n => `${n} of 22` }), mof = D.buildMap(await D.readPages(pdfjs, aof));
  const pof = D.planDraft({ details: base, map: mof, terms, today: '2026-11-24', numbering: mof.numbering, edits: { extra_terms: Array.from({ length: 130 }, (_, i) => `Extra term ${i + 1} with enough words to take a full line of the page, more or less.`) } });
  const rof = await D.renderDraft(PDFLib, aof, pof, { bandImage: SB.bandImager(aof) });
  eq(rof.added_pages.map(x => x.number && x.number.written), ['23 of 24', '24 of 24'], '"22 of 22" becomes "23 of 24" and "24 of 24" with two pages added');
  eq(N(po1, 'term_start') && N(po1, 'term_start').text, 'Further terms start at 23.0 (general terms to 20, appendix to 22, printed on the further terms page to 22).', 'every draft says where the further terms start');
  ok(N(plan({}), 'term_start') && !N(plan({}), 'term_start').blocking && /start at 23\.0 \(general terms to 20, appendix to 22\)/.test(N(plan({}), 'term_start').text), 'and on a plain draft, not blocking');
  ok(po1.needs.find(n => n.id === 'continuation_check').blocking && po1.needs.find(n => n.id === 'continuation_check').ackable && /numbered 23/.test(po1.needs.find(n => n.id === 'continuation_check').text), 'Tim is asked to check the continuation page');
  const po2 = over(130), ro2 = await D.renderDraft(PDFLib, apx, po2, { bandImage }), lp2 = await D.readPages(pdfjs, ro2.bytes);
  eq(ro2.added_pages.map(x => [x.page, x.number.written]), [[4, '23'], [5, '24']], 'two added pages: 23, then 24');
  eq((pdfTxt(ro2.bytes).match(/21\.2 Synthetic/g) || []).length, 1, '"21.2" still exactly once with two pages added');
  const w5 = typed(pdfTxt(ro2.bytes, 5, 5)).split(' ').sort(); eq(w5, ['(continued)', '24'], 'the second added page: only "(continued)", 24 and the terms');
  ok(lp2.length === lp.length + 1 && pgOf(lp2, 5).includes('(continued)') && pgOf(lp2, 5).some(s => /Extra term 130/.test(s)), 'the second added page continues the list');
  const rawA = async bytes => { const dd = await PDFLib.PDFDocument.load(bytes); return dd.getPages().map(pg => { const c = pg.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c]; return refs.map(ref => Buffer.from(dd.context.lookup(ref).getContents()).toString('base64')); }); };
  const ba = await rawA(apx), aa = await rawA(ro2.bytes), keepIdx = [0, 1, 2].concat(Array.from({ length: ba.length - 3 }, (_, i) => i + 5));
  ok(ba.every((st, i) => { const a = aa[keepIdx[i]]; let j = 0; for (const s2 of st) { j = a.indexOf(s2, j); if (j < 0) return false; j++; } return true; }), 'every original content stream kept byte for byte, the added pages aside');
  // the plain fallback when the bands can't be found
  const pfb = D.planDraft({ details: base, map: Object.assign({}, mapx, { numbering: Object.assign({}, mapx.numbering, { cont: null }) }), terms, today: '2026-11-24', edits: over(70).terms ? { extra_terms: Array.from({ length: 70 }, (_, i) => `Extra term ${i + 1} with enough words to take a full line of the page, more or less.`) } : {} });
  const rfb = await D.renderDraft(PDFLib, apx, pfb, { bandImage }), lfb = await D.readPages(pdfjs, rfb.bytes);
  ok(rfb.added_pages[0].plain && pgOf(lfb, 4).includes('Further Terms of Sale (continued)') && pfb.needs.find(n => n.id === 'continuation_plain').blocking, 'no bands: a plain page, and Tim is asked to check it');
  const rnb = await D.renderDraft(PDFLib, apx, over(70)); ok(rnb.added_pages[0].plain, 'no band pictures given: the plain page');
  const pbf = over(70), rbf = await D.renderDraft(PDFLib, apx, pbf, { bandImage: async () => { throw new Error('no canvas'); } }); ok(rbf.added_pages[0].plain && pbf.needs.find(n => n.id === 'continuation_plain').blocking && /couldn't be copied/.test(pbf.needs.find(n => n.id === 'continuation_plain').text), 'the pictures failing: the plain page, with its blocking check');
  // reference markers can't come from outside text (a buyer's wording, a detail, the AI's clause)
  const FTr = pp => (I(pp, 'further_terms') || {}).text || '';
  const fakeRef = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'custom', days: 5, wording: 'Pay [[FT:finance]] and [[TERM:x]] now {timing}.' }, { key: 'technical', days: 5, detail: '[[FT:lim]]' }] }), map, terms, clauses: { technical: 'A {detail} report {timing}.' }, today: '2026-11-24', edits: { custom_ok: true, extra_terms: [{ id: 'ft_ai_x', title: 'T', text: 'AI said [[FT:sdd]].' }] } });
  ok(!fakeRef.needs.some(n => /^ref_missing_/.test(n.id)) && /Pay FT:finance and TERM:x now/.test(FTr(fakeRef)) && /AI said FT:sdd\./.test(FTr(fakeRef)) && !/\[\[|\?/.test(FTr(fakeRef)), 'markers typed by a buyer or the AI are plain text, never references');

  // the numbering style follows the page's own printed terms: "1." printed, ours "23." and named "further term 23"; "21.0" printed, or none, "23.0"
  eq([pmap.places.find(x => x.id === 'further_terms').printed_style, (fpx || {}).printed_style, map.places.find(x => x.id === 'further_terms').printed_style], ['dot', 'dot0', undefined], 'the printed style read from the page');
  const pst = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'electrical', days: 10 }, { key: 'custom', after: 'electrical', days: 2, wording: 'X {timing}.' }] }), map: pmap, terms, clauses: { electrical: 'Words.' }, today: '2026-11-24', edits: { custom_ok: true } });
  ok(/^23\. Electrical report: Words\./m.test(I(pst, 'further_terms').text) && /^24\. Purchaser's condition: X within 2 working days of the date the electrical report condition in further term 23 is satisfied or waived\./m.test(I(pst, 'further_terms').text) && I(pst, 'further_terms').number_style === 'dot', '"1." style: listed 23. and named further term 23');
  ok(N(pst, 'term_start') && /^Further terms start at 23 \(/.test(N(pst, 'term_start').text), 'and the starting note in that style');
  const pst0 = plan({}, { extra_terms: ['A.'] }); ok(/^23\.0 Your further term: A\./m.test(I(pst0, 'further_terms').text) && I(pst0, 'further_terms').number_style === 'dot0' && D.termNo(3, 'dot') === '3.' && D.refNo(23, 'dot0') === '23.0', 'nothing printed: 23.0');
  // ── the review screen (Tim, 24 November 2026): clauses from the library, their timing, order, AI-written terms, marks, moves ──
  const lib = terms.concat({ key: 'std_pool', kind: 'further_term', title: 'Pool fence', wording: 'The Vendor shall provide a pool fence compliance certificate {timing}.', rule: {}, position: 50 },
    { key: 'std_keys', kind: 'further_term', title: 'Keys', wording: 'The Vendor shall hand over all keys at settlement.', rule: {}, position: 51 });
  const rp = (conds, edits) => D.planDraft({ details: Object.assign({}, base, { conditions: conds }), map, terms: lib, clauses: { electrical: elecW }, edits, today: '2026-11-24' });
  const elecW = 'The Purchaser(s) being satisfied in all respects {timing} (by 4pm on the final day).';
  const FTx = pp => (I(pp, 'further_terms') || {}).text || '';
  const TS = pp => (I(pp, 'further_terms') || { terms: [] }).terms;
  // a clause with {timing} and no condition of its own: a gap for Tim, blocking, until he sets its timing
  let rv = rp([{ key: 'finance', days: 10 }], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }, { id: 'add_std_keys_1', key: 'std_keys' }] });
  ok(/23\.0 Pool fence: The Vendor shall provide a pool fence compliance certificate \[Tim to set the timing\]\./.test(FTx(rv)) && N(rv, 'timing_missing_add_std_pool_1').blocking, 'an added clause with {timing} and no timing: highlighted, blocking');
  ok(/24\.0 Keys: The Vendor shall hand over all keys at settlement\.$/m.test(FTx(rv)), 'an added clause with no timing words: as written');
  const tPool = TS(rv).find(t => t.id === 'add_std_pool_1'); ok(tPool.removable && tPool.added && tPool.library === 'std_pool' && tPool.template === 'The Vendor shall provide a pool fence compliance certificate {timing}.', 'its wording kept with {timing} for the review screen, and removable');
  rv = rp([{ key: 'finance', days: 10 }], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }], term_timing: { add_std_pool_1: { after: 'finance', days: 3 } } });
  ok(/23\.0 Pool fence: The Vendor shall provide a pool fence compliance certificate within 3 working days of the date the finance condition in clause 9\.1 is satisfied or waived\./.test(FTx(rv)) && !N(rv, 'timing_missing_add_std_pool_1'), 'its timing set on the review screen: after finance');
  eq(TS(rv)[0].timing_text, 'within 3 working days of the date the finance condition in clause 9.1 is satisfied or waived', 'the timing shown as its chip');
  rv = rp([{ key: 'finance', days: 10 }], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }], term_timing: { add_std_pool_1: { date: '2026-12-11' } } });
  ok(/certificate on or before Friday 11 December 2026\./.test(FTx(rv)), 'or a date');
  ok(/certificate within 7 working days of the date of this agreement\./.test(FTx(rp([], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }], term_timing: { add_std_pool_1: { days: 7 } } }))), 'or working days');
  ok(!/certificate within 3 working days/.test(FTx(rp([], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }], term_timing: { add_std_pool_1: { after: 'finance', days: 3 } } }))) , 'after a condition not on the offer: not used');
  // a condition's own clause takes its timing from the offer: a draft-only timing for it (from an older draft) is not used, and no note
  rv = rp([{ key: 'electrical', days: 10 }], { term_timing: { ft_electrical: { days: 5 } } });
  ok(/in all respects within 10 working days of the date of this agreement/.test(FTx(rv)) && !N(rv, 'term_timing_ft_electrical'), 'a condition-tied clause follows the offer, never a draft-only timing');
  ok(!N(rp([{ key: 'electrical', days: 10 }], { term_timing: { ft_electrical: { days: 10 } } }), 'term_timing_ft_electrical'), 'the same timing: no note');
  // Tim's edit of a term keeps {timing}, filled in from its timing
  rv = rp([{ key: 'electrical', days: 10 }], { items: { ft_electrical: 'Tim reworded this, to be satisfied {timing}.' } });
  ok(/23\.0 Electrical report: Tim reworded this, to be satisfied within 10 working days of the date of this agreement\.$/m.test(FTx(rv)) && TS(rv)[0].template === 'Tim reworded this, to be satisfied {timing}.', 'an edited term with {timing}: filled, and kept as written for the next edit');
  // the order Tim chose; numbers follow the order on the page
  rv = rp([{ key: 'electrical', days: 10 }], { extra_terms: ['Tim extra.'], added_terms: [{ id: 'add_std_keys_1', key: 'std_keys' }], term_order: ['add_std_keys_1', 'ft_extra_1', 'ft_electrical'] });
  eq(TS(rv).map(t => t.number + ' ' + t.id), ['23 add_std_keys_1', '24 ft_extra_1', '25 ft_electrical'], 'terms in the order Tim chose');
  // a clause written with AI help, for this offer only (an object in extra_terms)
  rv = rp([{ key: 'builders', days: 10 }], { extra_terms: [{ id: 'ft_ai_k1', title: 'Spa pool', text: 'The Vendor shall have the spa pool serviced {timing}.', ai: true }], term_timing: { ft_ai_k1: { after: 'builders', days: 2 } } });
  ok(/23\.0 Spa pool: The Vendor shall have the spa pool serviced within 2 working days of the date the building report condition in clause 9\.4 is satisfied or waived\./.test(FTx(rv)) && TS(rv)[0].ai && TS(rv)[0].removable, 'an AI-written term for this offer, with its timing');
  // marks Tim drew: in PDF points on the blank's pages
  const marks = [{ id: 'm1', page: 1, x: 300, y: 600, w: 80, h: 18, type: 'initials', who: 'purchasers' }, { id: 'm2', page: 6, x: 330, y: 300, w: 150, h: 24, type: 'signature', who: 'vendors' },
    { id: 'm3', page: 8, x: 28, y: 640, w: 260, h: 10, type: 'strike' }, { id: 'm4', page: 8, x: 28, y: 560, w: 260, h: 60, type: 'strike' }, { id: 'm5', page: 5, x: 34, y: 640, w: 300, h: 24, type: 'text', text: 'Tim typed this note.' },
    { id: 'm6', page: 2, x: 30, y: 500, w: 200, h: 14, type: 'highlight' }, { id: 'm7', page: 5, x: 34, y: 500, w: 100, h: 20, type: 'text', text: '' }, { id: 'bad id!', page: 1, x: 1, y: 1, w: 9, h: 9, type: 'strike' }];
  const pm = plan({}, { marks });
  eq(['mark_m1', 'mark_m2', 'mark_m3', 'mark_m4', 'mark_m6'].map(id => (I(pm, id) || {}).mark), ['initials', 'signature', 'strike', 'cross', 'highlight'], 'each mark becomes an item: a strike over more than one line is a crossed box');
  ok(I(pm, 'mark_m1').who === 'purchasers' && I(pm, 'mark_m2').who === 'vendors' && /Initials for the purchasers/.test(I(pm, 'mark_m1').label), 'initials and signatures say whose they are');
  ok(I(pm, 'mark_m5').kind === 'area' && I(pm, 'mark_m5').text === 'Tim typed this note.' && N(pm, 'mark_empty_m7').blocking && !pm.items.some(i => /bad/.test(i.id)), 'a text box holds his text; an empty one blocks; a bad mark is dropped');
  ok(N(pm, 'sign_marks') && /2 places for initials or a signature/.test(N(pm, 'sign_marks').text), 'signing places are noted');
  ok(!plan({}, { marks: [{ id: 'p1', page: 5, x: 34, y: 640, w: 300, h: 24, type: 'text', text: 'Call 022 777 6666' }] }).items.some(i => i.id === 'mark_p1'), "a mark holding a purchaser's own phone is left off");
  const rm = await D.renderDraft(PDFLib, blank, pm), rmp = await D.readPages(pdfjs, rm.bytes);
  ok(rmp[4].items.some(i => i.s === 'Tim typed this note.') && rm.boxes.filter(b => b.kind === 'mark').length === 5, 'the PDF: his text typed in its box; each mark a box for the review screen');
  const unz = b => { const B = Buffer.from(b); try { return require('zlib').inflateSync(B).toString('latin1'); } catch (_) { return B.toString('latin1'); } };
  const rawM = await (async bytes => { const dd = await PDFLib.PDFDocument.load(bytes); return dd.getPages().map(pg => { const c = pg.node.Contents(); return (c instanceof PDFLib.PDFArray ? c.asArray() : [c]).map(r => unz(dd.context.lookup(r).getContents())).join('\n'); }); })(rm.bytes);
  ok(rawM[0] === (await (async () => { const r0 = await D.renderDraft(PDFLib, blank, plan({})); const dd = await PDFLib.PDFDocument.load(r0.bytes); const c = dd.getPages()[0].node.Contents(); return (c instanceof PDFLib.PDFArray ? c.asArray() : [c]).map(r => unz(dd.context.lookup(r).getContents())).join('\n'); })()), 'an initials place draws nothing on the page');
  const lineOps = t => (t.match(/ l\n/g) || []).length, base8 = await (async () => { const r0 = await D.renderDraft(PDFLib, blank, plan({})); const dd = await PDFLib.PDFDocument.load(r0.bytes); const c = dd.getPages()[7].node.Contents(); return (c instanceof PDFLib.PDFArray ? c.asArray() : [c]).map(r => unz(dd.context.lookup(r).getContents())).join('\n'); })();
  ok(lineOps(rawM[7]) >= lineOps(base8) + 3, 'the appendix page: a crossed box (a border and two lines) and a strike line added: ' + lineOps(rawM[7]) + ' vs ' + lineOps(base8));
  ok(N(rp([], { added_terms: [{ id: 'add_std_pool_1', key: 'std_pool' }], term_timing: { add_std_pool_1: { after: 'finance', days: 3 } } }), 'term_timing_bad_add_std_pool_1'), 'and Tim is told');
  // moving or resizing a place on the draft
  const pmv2 = plan({}, { moves: { price: { from: { page: 1, x: P('price').x, y: P('price').y - 2, w: 40, h: 11 }, to: { page: 1, x: P('price').x + 20, y: P('price').y + 3, w: 60, h: 11 } }, clause22: { from: { page: 8, x: 28, y: 570, w: 200, h: 40 }, to: { page: 8, x: 38, y: 575, w: 200, h: 40 } }, gone: { from: { page: 1, x: 1, y: 1, w: 9, h: 9 }, to: { page: 2, x: 1, y: 1, w: 9, h: 9 } } } });
  ok(Math.abs(I(pmv2, 'price').x - (P('price').x + 20)) < 0.01 && Math.abs(I(pmv2, 'price').y - (P('price').y + 5)) < 0.01 && I(pmv2, 'price').moved && N(pmv2, 'moved_price'), 'the price moved by what Tim dragged, noted');
  ok(I(pmv2, 'clause22').lines.every((l, k) => Math.abs(l.x0 - (P('clause22').lines[k].x0 + 10)) < 0.01 && Math.abs(l.y - (P('clause22').lines[k].y + 5)) < 0.01), 'a struck block moves line by line');
  ok(N(pmv2, 'move_gone_gone') && P('price').x === map.places.find(x => x.id === 'price').x, 'a move that no longer fits is left out; the map itself is unchanged');

  // ── condition timing (Tim, 24 November 2026): {timing}, {date}, "after" on the front page and clause 22.0 ──
  const tterms = terms.concat({ key: 'sale', kind: 'further_term', title: 'Sale of another property', wording_from: 'sale', rule: { when: { condition: 'sale' } }, position: 22 });
  const tplan = (conds, clauses, extra) => D.planDraft(Object.assign({ details: Object.assign({}, base, { conditions: conds, sale_address: '9 Filler Street, Testville' }), map, terms: tterms, clauses: clauses || {}, today: '2026-11-24', province: 'otago' }, extra || {}));
  const FT = pp => (I(pp, 'further_terms') || {}).text || '';
  // {timing} in each mode, in plain legal wording with full dates and the month name
  const elec = { electrical: 'The Purchaser(s) being satisfied with an electrical report in all respects {timing} (by 4pm on the final day) AND notifying the Vendor.' };
  ok(/Electrical report: The Purchaser\(s\) being satisfied with an electrical report in all respects within 10 working days of the date of this agreement \(by 4pm on the final day\) AND notifying the Vendor\.$/m.test(FT(tplan([{ key: 'electrical', days: 10 }], elec))), '{timing}, working days: within 10 working days of the date of this agreement');
  const tdate = tplan([{ key: 'electrical', date: '2026-12-05' }], elec);
  ok(/in all respects on or before Friday 4 December 2026 \(by 4pm/.test(FT(tdate)) && N(tdate, 'moved_electrical'), '{timing}, a date: on or before, with the weekday (a Saturday becomes the Friday before, noted)');
  ok(/in all respects on or before Friday 11 December 2026 \(by 4pm/.test(FT(tplan([{ key: 'electrical', date: '2026-12-11' }], elec))), '{timing}: "on or before Friday 11 December 2026"');
  const tafter = tplan([{ key: 'finance', days: 10 }, { key: 'electrical', after: 'finance', days: 5 }], elec);
  ok(/in all respects within 5 working days of the date the finance condition in clause 9\.1 is satisfied or waived \(by 4pm/.test(FT(tafter)), '{timing}, after a printed condition: named by its REINZ clause number');
  ok(!/Condition date:/.test(FT(tafter)) && !/Condition date:/.test(FT(tplan([{ key: 'electrical', days: 10 }], elec))), 'wording that names its time gets nothing added after it');
  // a further term named by its number in the further terms
  const tft = tplan([{ key: 'electrical', days: 10 }, { key: 'sale', days: 20 }, { key: 'technical', after: 'electrical', days: 3, detail: 'Drainage' }], Object.assign({ technical: 'A {detail} report {timing}.', sale: 'Sale of {address} {timing}.' }, elec));
  ok(/23\.0 Electrical report:/.test(FT(tft)) && /24\.0 Specified technical report \(Drainage\): A Drainage report within 3 working days of the date the electrical report condition in further term 23\.0 is satisfied or waived\./.test(FT(tft)), 'after a further term: "the electrical report condition in further term 23\.0"');
  ok(/25\.0 Sale of another property \(9 Filler Street, Testville\): Sale of 9 Filler Street, Testville within 20 working days of the date of this agreement\./.test(FT(tft)), 'the sale clause with {address} and {timing}');
  // {date} keeps working: a date as before; for "after", the timing phrase and a check for Tim
  const tdd = tplan([{ key: 'technical', days: 10, detail: 'Roof' }], { technical: 'The date for the satisfying of this condition is {date}.' });
  ok(/Specified technical report \(Roof\): The date for the satisfying of this condition is 8 December 2026\.$/m.test(FT(tdd)), '{date} as before, and the date is no longer repeated after it');
  const tda = tplan([{ key: 'finance', days: 10 }, { key: 'technical', after: 'finance', days: 2, detail: 'Roof' }], { technical: 'The date for the satisfying of this condition is {date}.' });
  ok(/is within 2 working days of the date the finance condition in clause 9\.1 is satisfied or waived\.$/m.test(FT(tda)), '{date} for "after": the timing phrase, never a guessed date');
  ok(N(tda, 'date_after_technical') && !N(tda, 'date_after_technical').blocking && /Check the sentence still reads right/.test(N(tda, 'date_after_technical').text), 'and Tim is asked to check the sentence');
  // wording with no time in it: the date as before, or for "after" the timing
  ok(/23\.0 Electrical report: Tim's words\. Condition date: 8 December 2026\./.test(FT(tplan([{ key: 'electrical', days: 10 }], { electrical: "Tim's words." }))), 'no token, working days: "Condition date" as before');
  ok(/23\.0 Electrical report: Tim's words\. This condition is to be satisfied or waived within 5 working days of the date the finance condition in clause 9\.1 is satisfied or waived\./.test(FT(tplan([{ key: 'finance', days: 10 }, { key: 'electrical', after: 'finance', days: 5 }], { electrical: "Tim's words." }))), 'no token, after: the timing added');
  // the buyer's own condition: {timing} (as the helper writes it) filled in once Tim ticks it
  const tcu = tplan([{ key: 'lim', date: '2026-12-18' }, { key: 'custom', after: 'lim', days: 4, wording: 'Subject to the purchaser approving the pool fence {timing}.' }], {}, { edits: { custom_ok: true } });
  ok(/Purchaser's condition: Subject to the purchaser approving the pool fence within 4 working days of the date the LIM condition in clause 9\.3 is satisfied or waived\.$/m.test(FT(tcu)), "the buyer's own wording with {timing}");
  ok(/Purchaser's condition: \[Tim to tick/.test(FT(tplan([{ key: 'custom', days: 4, wording: 'X {timing}.' }]))), 'and not before Tim ticks it');
  // printed front-page lines: the short phrase when it fits, with a check
  const tfront = tplan([{ key: 'builders', days: 10 }, { key: 'finance', after: 'builders', days: 5 }, { key: 'lim', after: 'electrical', days: 3 }, { key: 'electrical', days: 10 }], elec);
  eq(I(tfront, 'd_finance').text, '5 working days after clause 9.4 is satisfied or waived', 'front line: the short phrase, naming the REINZ clause');
  eq(I(tfront, 'd_lim').text, '3 working days after further term 23.0 is satisfied or waived', 'front line after a further term: its number');
  eq(I(tfront, 'd_builders').text, '8 December 2026', 'a condition by working days still shows its date');
  ok(N(tfront, 'front_after_finance') && N(tfront, 'after_check') && !N(tfront, 'front_after_finance').blocking, 'Tim checks the line');
  ok(!tfront.items.some(i => /\[\[|\]\]/.test(i.text || '')) && !tfront.needs.some(n => /\[\[/.test(n.text)), 'no reference is left unnumbered');
  // too long for its line: "see further term N" and a further term setting out that condition's date (the REINZ text never edited)
  const narrow = Object.assign({}, map, { places: map.places.map(pl => pl.id === 'd_finance' ? Object.assign({}, pl, { w: 120 }) : pl) });
  const tnar = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'builders', days: 10 }, { key: 'finance', after: 'builders', days: 5 }, { key: 'electrical', days: 10 }] }), map: narrow, terms: tterms, clauses: elec, today: '2026-11-24' });
  eq(I(tnar, 'd_finance').text, 'see further term 24.0', 'too long for the line: "see further term 24.0"');
  ok(/\n24\.0 Finance date \(clause 9\.1\): The finance date is the date that is 5 working days after the date the building report condition in clause 9\.4 is satisfied or waived\./.test(FT(tnar)), 'and further term 24.0 sets out the finance date');
  ok(N(tnar, 'front_after_finance') && /see further term 24\.0/.test(N(tnar, 'front_after_finance').text), 'Tim checks both');
  ok(!tnar.items.some(i => i.place === 'c_finance' && i.kind !== 'strike'), 'only Yes/No struck on the printed line, nothing rewritten');
  // clause 22.0 waiting for another condition: the printed count struck, "see further term N" beside it, the time in a further term
  const t22 = tplan([{ key: 'finance', days: 10 }, { key: 'lawyer', after: 'finance', days: 3 }]);
  ok(I(t22, 'clause22_days_struck') && I(t22, 'clause22_days').text === 'see further term 23.0' && I(t22, 'clause22_days').size === 6, 'clause 22.0: struck, "see further term 23.0" small beside it');
  ok(/23\.0 Lawyer's approval \(clause 22\.0\): The time for the purchaser's lawyer's approval under clause 22\.0 is within 3 working days of the date the finance condition in clause 9\.1 is satisfied or waived\./.test(FT(t22)) && N(t22, 'clause22_after'), 'and a further term sets out its time, for Tim to check');
  ok(!I(t22, 'clause22'), 'clause 22.0 itself is not struck through');
  const tl22 = I(t22, 'further_terms').terms.find(x => x.id === 'ft_time_lawyer');
  ok(tl22 && JSON.stringify(tl22.timing) === JSON.stringify({ key: 'lawyer', days: 3, after: 'finance' }) && tl22.template === "The time for the purchaser's lawyer's approval under clause 22.0 is {timing}." && /^within 3 working days of the date the finance condition/.test(tl22.timing_text) && !/NaN/.test(tl22.timing_text + tl22.date_text), "clause 22.0's term is tied to the lawyer's approval condition, with {timing} (so its chip corrects the offer)");
  const tfin = I(tnar, 'further_terms').terms.find(x => x.id === 'ft_time_finance'); ok(tfin && tfin.timing.key === 'finance' && tfin.template === 'The finance date is {timing_date}.' && tfin.timing_date_text === 'the date that is 5 working days after the date the building report condition in clause 9.4 is satisfied or waived' && !/NaN/.test(tfin.timing_text), 'a front-page date term is tied to its condition too');
  // a condition after the buyer's own: referred to by its further term number
  ok(/24\.0 Purchaser's condition: X within 2 working days of the date the electrical report condition in further term 23\.0 is satisfied or waived\./.test(FT(tplan([{ key: 'electrical', days: 5 }, { key: 'custom', after: 'electrical', days: 2, wording: 'X {timing}.' }], elec, { edits: { custom_ok: true } }))), 'the buyer\'s own after a further term');
  // a reference to a further term that isn't there: "?" and blocking
  const tmiss = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'sdd', days: 10 }, { key: 'finance', after: 'sdd', days: 2 }] }), map, terms, clauses: {}, today: '2026-11-24' });
  ok(I(tmiss, 'd_finance').text === '2 working days after further term ? is satisfied or waived' && N(tmiss, 'ref_missing_sdd').blocking, 'a missing further term blocks approval');
  // old offers: exactly the same front page as before
  eq([I(p, 'd_finance').text, I(p, 'd_lim').text, I(p, 'd_builders').text], ['8 December 2026', '18 December 2026', '8 December 2026'], 'an old {days}/{date} offer drafts as before');
  ok(!N(p, 'after_check') && !p.needs.some(n => /^front_after_|^date_after_/.test(n.id)), 'and raises none of the new checks');
  // the date form of the timing for the date terms: working days and a date too, and the exact wording on the agreement
  const narrowT = (c2) => D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'builders', days: 10 }, { key: 'finance', after: 'builders', days: 5 }] }), map: narrow, terms: tterms, clauses: {}, today: '2026-11-24', edits: { term_timing: {}, items: c2 || {} } });
  const tn1 = narrowT(); ok(/^23\.0 Finance date \(clause 9\.1\): The finance date is the date that is 5 working days after the date the building report condition in clause 9\.4 is satisfied or waived\.$/m.test(FT(tn1)), 'the finance date term, exactly');
  const ftT = (I(tn1, 'further_terms').terms || []).find(x => x.id === 'ft_time_finance');
  ok(ftT && ftT.timing_date_text === 'the date that is 5 working days after the date the building report condition in clause 9.4 is satisfied or waived', 'its date phrase for the chip');
  const tdOnly = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'builders', days: 10 }, { key: 'finance', after: 'builders', days: 5 }] }), map: narrow, terms: tterms, clauses: {}, today: '2026-11-24', edits: { items: { ft_time_finance: 'The finance date is {timing_date}, Tim says.' } } });
  ok(/The finance date is the date that is 5 working days after the date the building report condition in clause 9\.4 is satisfied or waived, Tim says\./.test(FT(tdOnly)), 'Tim\'s edit keeps {timing_date}');
  // an edit that drops the timing of a condition-tied term: blocking, tickable, on every later draft too (the edit carries over)
  const tdrop = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'finance', days: 10 }, { key: 'electrical', after: 'finance', days: 5 }] }), map, terms: tterms, clauses: { electrical: 'Satisfied with the report {timing}.' }, today: '2026-11-24', edits: { items: { ft_electrical: 'Satisfied with the report within 9 working days.' } } });
  const nd1 = N(tdrop, 'timing_dropped_ft_electrical');
  ok(nd1 && nd1.blocking && nd1.ackable && nd1.text === "Further term 23.0 no longer follows the offer's timing for Electrical report (the offer says within 5 working days after Finance is satisfied or waived). Check it, or restore the timing.", 'a term no longer following the offer: ' + (nd1 && nd1.text));
  ok(!N(rp([{ key: 'electrical', days: 10 }], { items: { ft_electrical: 'Tim reworded this, to be satisfied {timing}.' } }), 'timing_dropped_ft_electrical'), 'an edit that keeps {timing}: no check');
  ok(!N(D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'electrical', days: 10 }] }), map, terms: tterms, clauses: { electrical: "Tim's words." }, today: '2026-11-24', edits: { items: { ft_electrical: 'Changed words.' } } }), 'timing_dropped_ft_electrical'), 'wording that never had a token (its date is added after it): no check');
  // typed over a front-page date or the clause 22.0 count: blocking, tickable, naming both
  const ptyped = plan({ conditions: [{ key: 'finance', days: 10 }, { key: 'lawyer', days: 5 }] }, { items: { d_finance: '20 December 2026', clause22_days: '9' } });
  const ntf = N(ptyped, 'typed_d_finance'), nt22 = N(ptyped, 'typed_clause22_days');
  ok(ntf && ntf.blocking && ntf.ackable && /you typed "20 December 2026", but the offer works out "8 December 2026"/.test(ntf.text), 'a typed-over finance date names both values');
  ok(nt22 && nt22.blocking && nt22.ackable && /you typed "9", but the offer works out "5"/.test(nt22.text), 'a typed-over clause 22.0 count too');
  ok(!N(plan({}, { items: { d_finance: '8 December 2026' } }), 'typed_d_finance'), 'typing the same value: no check');
  // Tim's own wording for the buyer's condition (custom_wording) dropping the buyer's {timing}: blocking, tickable, no "Condition date" added
  const cdrop = ed => D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'custom', days: 5, wording: 'Subject to the pool fence {timing}.' }] }), map, terms: tterms, clauses: {}, today: '2026-11-24', edits: ed });
  const cd1 = cdrop({ custom_ok: true, custom_wording: 'Subject to the pool fence by Friday.' }), ncd = N(cd1, 'timing_dropped_ft_custom');
  ok(ncd && ncd.blocking && ncd.ackable && ncd.text === "Further term 23.0 no longer follows the offer's timing for Your own condition (the offer says within 5 working days of the date of the agreement). Check it, or restore the timing.", "Tim's wording for the buyer's condition without its timing: " + (ncd && ncd.text));
  ok(/^23\.0 Purchaser's condition: Subject to the pool fence by Friday\.$/m.test(FT(cd1)) && !/Condition date/.test(FT(cd1)), 'and nothing contradicting his words is added after them');
  ok(N(cdrop({ custom_ok: true, custom_wording: 'Subject to the pool fence by Friday.', date_format: 'date' }), 'timing_dropped_ft_custom'), 'again on a later draft, while his wording carries over');
  ok(!N(cdrop({ custom_ok: true, custom_wording: 'Subject to the pool fence {timing}, Tim says.' }), 'timing_dropped_ft_custom') && !N(cdrop({ custom_ok: true }), 'timing_dropped_ft_custom'), 'his wording keeping {timing}, or the buyer\'s own wording: no check');
  const cnt = D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'custom', days: 5, wording: 'Subject to the pool fence.' }] }), map, terms: tterms, clauses: {}, today: '2026-11-24', edits: { custom_ok: true, custom_wording: 'Subject to the pool fence, Tim says.' } });
  ok(!N(cnt, 'timing_dropped_ft_custom') && /Tim says\. Condition date: 1 December 2026\./.test(FT(cnt)), 'buyer wording with no token to begin with: no check, and the condition date still added');
  // a typed-over line compared after "see further term N" is resolved: the same text raises nothing, a different one is named
  const tyNar = it => D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'builders', days: 10 }, { key: 'finance', after: 'builders', days: 5 }] }), map: narrow, terms: tterms, clauses: {}, today: '2026-11-24', edits: { items: it } });
  ok(!N(tyNar({ d_finance: 'see further term 23.0' }), 'typed_d_finance'), 'typing the resolved "see further term 23.0": nothing raised');
  const tyBad = N(tyNar({ d_finance: 'see further term 30.0' }), 'typed_d_finance'); ok(tyBad && tyBad.blocking && /you typed "see further term 30\.0", but the offer works out "see further term 23\.0"/.test(tyBad.text) && !/\[\[/.test(tyBad.text), 'a different one names both, resolved');
  const ty22 = it => D.planDraft({ details: Object.assign({}, base, { conditions: [{ key: 'finance', days: 10 }, { key: 'lawyer', after: 'finance', days: 3 }] }), map, terms, clauses: {}, today: '2026-11-24', edits: { items: it } });
  ok(!N(ty22({ clause22_days: 'see further term 23.0' }), 'typed_clause22_days') && N(ty22({ clause22_days: '4' }), 'typed_clause22_days'), 'clause 22.0 likewise');
  // the drafted PDF carries it all
  const rt = await D.renderDraft(PDFLib, blank, tnar), tp = await D.readPages(pdfjs, rt.bytes), tx = n => tp[n - 1].items.map(i => i.s).join(' ');
  ok(tx(1).includes('see further term 24.0') && /Finance date \(clause 9\.1\)/.test(tx(3)), 'the PDF: "see further term 24.0" on the front page, the term on the Further Terms page');

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
