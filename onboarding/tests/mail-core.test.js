// Unit tests of the email wording (src/mail-core.js; EMAIL-VOICE.md), with made-up people and a made-up property. Covers: the agreed
// copy's two emails for a sample agreement with two conditions and a KiwiSaver deposit (recipients, each Roadmap line filled from the
// agreement's data, the first working day and the public holidays in the period, the deposit holder by the KiwiSaver rule, chattels
// "as is, where is" and excluded, the vendors' action items from the further terms, settlement day); marked blanks where the data is
// silent, never a guess; privacy (no party's own details in the other party's email; both lawyers in both); no em dashes; the signing
// link and "please initial again" drafts; Tim's round notice; the HTML (escaped, bold, links).
const path = require('path');
const M = require(path.join(__dirname, '..', 'src', 'mail-core.js'));
const errs = [], out = {};
const ok = (c, m) => { if (!c) errs.push(m); };
const has = (t, s, m) => ok(t.includes(s), m + ': missing "' + s + '"');
const holidays = [{ day: '2026-12-25', label: 'Christmas Day' }, { day: '2026-12-28', label: 'Boxing Day (observed)' }, { day: '2027-01-01', label: "New Year's Day" },
  { day: '2027-01-04', label: "Day after New Year's Day (observed)" }, { day: '2027-02-08', label: 'Waitangi Day (observed)' }];
const base = () => ({
  address: '12 Example Street, Dunedin',
  agreement: { agreement_date: '2026-12-18', date_text: '18 December 2026' },
  terms: { price: 655000, kiwisaver: true, settlement: { kind: 'date', date: '2027-02-12' }, conditions: [{ key: 'finance', days: 10 }, { key: 'lim', days: 10 }],
    as_drafted: { price: '$655,000', deposit: '$65,500', settlement: '12 February 2027', d_finance: '14 January 2027', d_lim: '14 January 2027' },
    further_terms: [{ number: 23, title: 'Fence', text: 'The vendor shall repair the broken boundary fence before settlement.' }, { number: 24, title: 'Garage door', text: 'The garage door is sold as is, where is.' }],
    changes: [] },
  details: { email: 'ana.own@buyer.example', phone: '021 999 8888', kiwisaver: true, chattels_exclude: ['Heat pump'],
    purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@buyer.example', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: 'bo.p@buyer.example', phone: '022 555 4444' }],
    lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' } },
  vendors: [{ legal_name: 'Vera Vendorperson', pref_name: 'Vee', email: 'vera@vendor.example', phone: '021 000 1111' }],
  vendorLawyer: { person: 'Sam Counsel', firm: 'Counsel and Co', email: 'sam@counsel.example', phone: '03 455 0000' },
  holidays, labels: { finance: 'Finance', lim: 'LIM' },
});
(async () => {
  const r = M.agreedDrafts(base()), P = r.purchasers, V = r.vendors;
  out.purchasers = P; out.vendors = V; out.blanks = r.blanks;
  // recipients: each side and its own lawyer
  ok(P.to.join() === 'ana.p@buyer.example,bo.p@buyer.example' && P.cc.join() === 'pat@synthlaw.example', 'purchasers: to both purchasers, cc their lawyer');
  ok(V.to.join() === 'vera@vendor.example' && V.cc.join() === 'sam@counsel.example', 'vendors: to the vendor, cc their lawyer');
  ok(P.subject === 'Congratulations! 12 Example Street, Dunedin' && V.subject === P.subject, 'the subject, in Tim\'s words');
  // the Roadmap, from the agreement's data
  for (const t of [P.body, V.body]) {
    has(t, 'Date of agreement: Friday 18 December 2026. The first working day is Monday 21 December 2026.', 'date of agreement and first working day');
    has(t, 'Note: Friday 25 December 2026 is a public holiday (Christmas Day)', 'a public holiday in the period');
    has(t, 'Note: Monday 8 February 2027 is a public holiday (Waitangi Day (observed))', 'the last holiday before settlement');
    has(t, 'Price: $655,000', 'price');
    has(t, "Deposit ($65,500): payable to the vendors' lawyer's trust account [Tim to fill: when the deposit is paid]. Because", 'the KiwiSaver deposit rule (when it is paid: not in this agreement\'s data, so a blank)');
    has(t, "KiwiSaver is part of it, the whole deposit goes there and can't be released before settlement.", 'KiwiSaver: not released before settlement');
    has(t, 'Chattels to note: As is, where is: further term 24 (Garage door). Expressly excluded: Heat pump.', 'chattels as is and excluded');
    has(t, 'Possession and Settlement day: **Friday 12 February 2027**', 'settlement day');
    has(t, 'Pre-settlement inspection:', 'the pre-settlement inspection'); has(t, 'Meeting with your lawyer:', 'the meeting with their lawyer');
    has(t, 'evidence of ID and evidence of your current address', 'ID and address for the lawyer');
    ok(!/[—–]/.test(t), 'no em or en dashes');
    has(t, 'Faithfully,\nTim', "Tim's close");
  }
  has(P.body, 'Dear Ana and Bo,', 'purchasers greeted by first name');
  has(P.body, 'Congratulations on your agreement to purchase 12 Example Street, Dunedin. It sure is a desirable property! The agreement is attached.', "Tim's opening");
  has(P.body, '1. Finance: within 10 working days of the date of agreement, due **Thursday 14 January 2027**. Forward the agreement to your mortgage broker or bank immediately', 'finance step with period, due date and what to do');
  has(P.body, '2. LIM: within 10 working days of the date of agreement, due **Thursday 14 January 2027**. Order the LIM from the council now and ask for it to be processed urgently.', 'LIM step');
  has(P.body, 'They all fall due on the same day, so please get started on each of them straight away.', 'all due together: urged to start now');
  ok(!/Builder|Electrical|Toxicology/.test(P.body), 'only this agreement\'s conditions');
  has(P.body, "This email is cc'd to your lawyer:\nPat Solicitor, Synthetic Law\nEmail: pat@synthlaw.example\nPhone: 03 477 1234", "the purchasers' lawyer");
  has(P.body, "The vendors' lawyer is:\nSam Counsel, Counsel and Co\nEmail: sam@counsel.example\nPhone: 03 455 0000", "the other side's lawyer too");
  has(P.body, 'Ana Testbuyer: ana.p@buyer.example, 022 777 6666', 'their own contact details, as supplied');
  has(V.body, 'Hello Vee,', 'vendors greeted by preferred name');
  has(V.body, "This email is cc'd to your lawyer, Sam Counsel of Counsel and Co.", "the vendors' lawyer named");
  has(V.body, "That way Sam and I can be responsive", "the lawyer's first name");
  has(V.body, 'Until the purchaser confirms the agreement, you have tasked me with marketing the property.', 'while conditional, marketing carries on');
  has(V.body, 'only tentative "pencil" bookings', 'pencil bookings');
  has(V.body, "The purchasers' lawyer is:\nPat Solicitor, Synthetic Law\nEmail: pat@synthlaw.example\nPhone: 03 477 1234", "the purchasers' lawyer (the other side's, Tim's standing preference)");
  has(V.body, "Your lawyer:\nSam Counsel, Counsel and Co\nEmail: sam@counsel.example\nPhone: 03 455 0000", "the vendors' own lawyer, in full");
  has(V.body, 'The contact details I have for you are:\nVera Vendorperson: vera@vendor.example, 021 000 1111', "the vendors' own details, as signed");
  has(V.body, "Conditions: purchaser's action steps", "the conditions from the vendors' side");
  has(V.body, '1. Further term 23 (Fence): The vendor shall repair the broken boundary fence before settlement. Please book any work now.', "the vendors' action items from the further terms");
  // privacy: each party sees only their own details and both lawyers'
  for (const x of ['vera@vendor.example', '021 000 1111', 'Vendorperson']) ok(!P.body.includes(x), "the purchasers' email holds nothing of the vendor's own: " + x);
  for (const x of ['ana.p@buyer.example', 'bo.p@buyer.example', '022 777 6666', '022 555 4444', 'ana.own@buyer.example', '021 999 8888']) ok(!V.body.includes(x), "the vendors' email holds nothing of the purchasers' own: " + x);
  // blanks: only where the data is silent, clearly marked
  ok(JSON.stringify(r.blanks) === JSON.stringify(['[Tim to add: the property page link, or delete this line]', '[Tim to fill: when the deposit is paid]', '[Tim to check: no vendor action items were found in the further terms]'].filter(b => (P.body + V.body).includes(b))), 'the marked blanks: ' + JSON.stringify(r.blanks));
  ok(r.blanks.includes('[Tim to fill: when the deposit is paid]') && r.blanks.includes('[Tim to add: the property page link, or delete this line]') && !r.blanks.some(b => /vendor action/.test(b)), 'when the deposit is paid and the property page link are left for Tim; the vendor action item was found');
  // Agreed emails filled in (Tim, 26 November 2026): every detail on record is filled; what isn't is a blank listed once as "Still needed"
  { // the live case: the purchaser's own email and phone are on the offer, not in the purchaser's row
    const b = base(); b.details.purchasers = [{ first: 'Ana', last: 'Testbuyer', email: null, phone: null }];
    const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Ana Testbuyer: ana.own@buyer.example, 021 999 8888', "the purchaser's email and phone from the offer itself");
    ok(x.purchasers.to.join() === 'ana.own@buyer.example', 'to the address on the offer');
    ok(!/\[Tim to fill: (email|phone)\]/.test(x.purchasers.body), 'no bare email or phone blanks');
    has(x.vendors.body, "The purchaser's lawyer is:\nPat Solicitor", 'one purchaser: "purchaser\'s"'); }
  { // a second purchaser with nothing on record: a named blank for each, and Tim's list; a signer's email by the same name is used
    const b = base(); b.details.purchasers[1] = { first: 'Bo', last: 'Testbuyer' }; b.purchaserSigners = [{ name: 'bo testbuyer', email: 'bo.signer@buyer.example' }];
    let x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Bo Testbuyer: bo.signer@buyer.example, [Tim to fill: Bo Testbuyer\'s phone]', "the signer's email; the phone a named blank");
    ok(x.stillNeeded.includes("Bo Testbuyer's phone") && !x.stillNeeded.some(t => /Bo Testbuyer's email/.test(t)), 'Still needed: just the phone: ' + JSON.stringify(x.stillNeeded));
    ok(!x.purchasers.to.includes('bo.signer@buyer.example'), "a signer's address isn't added to the To line (only the offer's addresses may receive it)");
    b.purchaserSigners = []; x = M.agreedDrafts(b);
    has(x.purchasers.body, "Bo Testbuyer: [Tim to fill: Bo Testbuyer's email], [Tim to fill: Bo Testbuyer's phone]", 'nothing on record: both named blanks'); }
  { // the purchasers' lawyer from the agreed contract's contact page (purchaserLawyer), not the offer's: the email and cc match the agreement
    const b = base(); b.purchaserLawyer = { person: 'Pat Solicitor', firm: 'Synthetic Law Limited', email: 'pat.contract@synthlaw.example', phone: '03 477 9999', service: 'pat.contract@synthlaw.example' };
    const x = M.agreedDrafts(b);
    ok(x.purchasers.cc.join() === 'pat.contract@synthlaw.example', 'cc: the lawyer email on the agreement: ' + x.purchasers.cc);
    has(x.purchasers.body, "Pat Solicitor, Synthetic Law Limited\nEmail: pat.contract@synthlaw.example\nPhone: 03 477 9999", "the purchasers' email: as on the agreement");
    has(x.vendors.body, "The purchasers' lawyer is:\nPat Solicitor, Synthetic Law Limited\nEmail: pat.contract@synthlaw.example\nPhone: 03 477 9999", "the vendors' email: the same");
    ok(!/Notices are served to/.test(x.purchasers.body + x.vendors.body), 'the same address for notices: shown once');
    b.purchaserLawyer.service = 'PAT.CONTRACT@synthlaw.example'; ok(M.agreedDrafts(b).purchasers.cc.join() === 'pat.contract@synthlaw.example', 'the same address in other capitals: cc\'d once'); }
  { // Tim, 26 November 2026: a lawyer's email and the email for service of notices differ: both, labelled, in both emails
    const b = base(); b.vendorLawyer = { person: 'Sam Counsel', firm: 'Counsel and Co', email: 'sam@counsel.example', phone: '03 455 0000', service: 'notices@counsel.example' };
    b.purchaserLawyer = { person: 'Pat Solicitor', firm: 'Synthetic Law', email: 'pat@synthlaw.example', phone: '03 477 1234', service: 'conveyancing@synthlaw.example' };
    const x = M.agreedDrafts(b);
    for (const t of [x.purchasers.body, x.vendors.body]) {
      has(t, 'Sam Counsel, Counsel and Co\nEmail: sam@counsel.example\nPhone: 03 455 0000\nNotices are served to: notices@counsel.example', "the vendors' lawyer: email and notices address both");
      has(t, 'Pat Solicitor, Synthetic Law\nEmail: pat@synthlaw.example\nPhone: 03 477 1234\nNotices are served to: conveyancing@synthlaw.example', "the purchasers' lawyer: email and notices address both"); }
    // Tim, 26 November 2026: cc both the lawyer's email and the notices address when they differ
    ok(x.vendors.cc.join() === 'sam@counsel.example,notices@counsel.example' && x.purchasers.cc.join() === 'pat@synthlaw.example,conveyancing@synthlaw.example', "cc: each lawyer's email and their notices address: " + x.vendors.cc + ' / ' + x.purchasers.cc);
    // only the notices address on record: it is the address for both, shown once
    b.vendorLawyer = { person: 'Sam Counsel', firm: 'Counsel and Co', phone: '03 455 0000', service: 'notices@counsel.example' }; const y = M.agreedDrafts(b);
    has(y.purchasers.body, 'Sam Counsel, Counsel and Co\nEmail: notices@counsel.example\nPhone: 03 455 0000\n\n', 'only the notices address: used once, as the email');
    ok(y.vendors.cc.join() === 'notices@counsel.example', 'cc: the notices address when it is the only one'); }
  { // part of the vendors' lawyer missing: a named blank, listed at the top of Tim's review; the cc still filled
    const b = base(); b.vendorLawyer = { person: 'Sam Counsel', firm: 'Counsel and Co', email: 'sam@counsel.example' };
    const x = M.agreedDrafts(b);
    has(x.purchasers.body, "Email: sam@counsel.example\nPhone: [Tim to fill: the vendors' lawyer's phone]", 'the missing phone: a clear blank');
    ok(x.stillNeeded.includes("the vendors' lawyer's phone"), 'Still needed: the vendors\' lawyer\'s phone: ' + JSON.stringify(x.stillNeeded));
    ok(x.vendors.cc.join() === 'sam@counsel.example', 'cc filled from the same record');
    ok(JSON.stringify(M.stillNeeded('a [Tim to fill: x] b [Tim to check: y] [Tim to add: z] [Tim to fill: x]')) === '["x","z"]', 'stillNeeded: fill and add, once each, not the checks');
    // nobody on record for the vendors' lawyer's first name
    b.vendorLawyer = {}; has(M.agreedDrafts(b).vendors.body, "That way [Tim to fill: the vendors' lawyer's first name] and I", "the first name blank says whose"); }
  { // privacy (offer_mail_side_hit, 024 and 025): the other side's own email or phone is left out, never put in; Tim's own always allowed
    const b = base(); b.details.purchasers = [{ first: 'Tim', last: 'Testagent', email: null, phone: null }]; b.details.email = 'same@home.example'; b.details.phone = '+64 27 562 7207';
    b.vendors = [{ legal_name: 'Timothy Testagent', pref_name: 'Tim', email: 'same@home.example', phone: '0275627207' }];
    b.hide = { purchasers: { emails: ['same@home.example'], phones: ['0275627207'] }, vendors: { emails: ['same@home.example'], phones: ['+64275627207'] } };
    const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Tim Testagent: +64 27 562 7207\n', "the purchaser's own email is also a vendor's: left out; the phone is Tim's own, so kept");
    ok(!x.purchasers.body.includes('same@home.example') && !x.vendors.body.includes('same@home.example'), 'the shared address appears in neither email');
    ok(x.notes.some(n => /^Left out of the email to the purchasers: Tim Testagent's email\. It is the same as a vendor's own/.test(n)) && x.notes.some(n => /^Left out of the email to the vendors: Timothy Testagent's email\./.test(n)), 'Tim is told what was left out: ' + JSON.stringify(x.notes.filter(n => /Left out/.test(n))));
    ok(!x.stillNeeded.some(t => /Testagent's email/.test(t)), 'left out for privacy is not "still needed"');
    // another phone (not Tim's) shared by both sides: left out too
    b.details.phone = '021 123 4567'; b.vendors[0].phone = '021 123 4567'; b.hide.purchasers.phones = ['021 123 4567']; b.hide.vendors.phones = ['021 123 4567'];
    const y = M.agreedDrafts(b); ok(!y.purchasers.body.includes('021 123 4567') && !y.vendors.body.includes('021 123 4567'), 'a real party phone shared across sides: left out of both');
    // a lawyer's address equal to the other side's own: left out of that email only
    const c = base(); c.hide = { purchasers: { emails: ['sam@counsel.example'] }, vendors: {} }; const z = M.agreedDrafts(c);
    ok(!z.purchasers.body.includes('sam@counsel.example') && z.vendors.body.includes('sam@counsel.example') && z.vendors.cc.join() === 'sam@counsel.example', 'the vendors\' lawyer\'s address held by a vendor: not in the purchasers\' email, still the vendors\' cc'); }
  { // a vendor who signed in person has no signer email: the property file's email is shown to them, but isn't put on the To line
    const b = base(); b.vendors = [{ legal_name: 'Vera Vendorperson', pref_name: 'Vee', email: 'vera@vendor.example', to: '', phone: '021 000 1111' }, { legal_name: 'Val Vendorperson', email: 'val@vendor.example', to: 'val@vendor.example', phone: '' }];
    const x = M.agreedDrafts(b);
    ok(x.vendors.to.join() === 'val@vendor.example', "To: only the vendors' own signer addresses: " + x.vendors.to);
    has(x.vendors.body, "Vera Vendorperson: vera@vendor.example, 021 000 1111\nVal Vendorperson: val@vendor.example, [Tim to fill: Val Vendorperson's phone]", 'both vendors\' details shown, as signed'); }
  { // review of 8bf2243: an email never says it is cc'd when its cc is empty (the lawyer's address left out for privacy, or none)
    const b = base(); b.purchaserLawyer = { person: 'Pat Solicitor', firm: 'Synthetic Law', email: 'vera@vendor.example', phone: '03 477 1234' };
    b.hide = { purchasers: { emails: ['vera@vendor.example'] }, vendors: {} };
    let x = M.agreedDrafts(b);
    ok(x.purchasers.cc.length === 0 && !x.purchasers.body.includes("This email is cc'd") && x.purchasers.body.includes("Your lawyer:\nPat Solicitor, Synthetic Law\nPhone: 03 477 1234\n[Tim to add: the purchasers' lawyer to the cc"), "purchasers: their lawyer's only address is a vendor's own: no cc, no cc claim, Tim asked to add one: " + x.purchasers.body.split('They are')[0].slice(-200));
    ok(x.stillNeeded.some(t => /^the purchasers' lawyer to the cc/.test(t)), 'Still needed: the cc');
    const c = base(); c.vendorLawyer = { person: 'Sam Counsel', firm: 'Counsel and Co' }; x = M.agreedDrafts(c);
    has(x.vendors.body, "Congratulations on your agreement for the sale of 12 Example Street, Dunedin. Your lawyer is Sam Counsel of Counsel and Co. [Tim to add: the vendors' lawyer to the cc", 'vendors: no lawyer email: no cc claim');
    ok(x.vendors.cc.length === 0 && x.stillNeeded.some(t => /^the vendors' lawyer to the cc/.test(t)), 'vendors: Still needed the cc');
    c.vendorLawyer = {}; x = M.agreedDrafts(c); ok(!x.stillNeeded.some(t => /to the cc/.test(t)) && x.stillNeeded.includes("the vendors' lawyer (name, firm, email, phone)"), 'a lawyer missing altogether: one item, the cc in it'); }
  { // review of 8bf2243: a purchaser whose email is known only from signing isn't on the To line: Tim is told they won't get it
    const b = base(); b.details.purchasers[1] = { first: 'Bo', last: 'Testbuyer' }; b.purchaserSigners = [{ name: 'Bo Testbuyer', email: 'bo.signer@buyer.example' }];
    let x = M.agreedDrafts(b);
    ok(x.notes.some(n => n === "Bo Testbuyer won't receive the email to the purchasers: their email (bo.signer@buyer.example) isn't on the offer. Add it there, or send it to them yourself."), 'the note: ' + JSON.stringify(x.notes.filter(n => /receive/.test(n))));
    ok(!x.notes.some(n => /Ana Testbuyer won't/.test(n)), 'nobody else noted');
    b.purchaserSigners = []; x = M.agreedDrafts(b); ok(x.notes.some(n => /^Bo Testbuyer won't receive the email to the purchasers: no email for them is on record\./.test(n)), 'no email at all: noted too');
    const c = base(); c.vendors[0].to = ''; x = M.agreedDrafts(c); ok(x.notes.some(n => /^Vera Vendorperson won't receive the email to the vendors: their email \(vera@vendor\.example\) isn't on the signing\./.test(n)), 'a vendor signed in person with no signing email: noted'); }
  { // the lawyers' details come with where they came from, for Tim (sources)
    const b = base(); b.sources = ["The vendors' lawyer isn't on the agreement's contact page: taken from the lawyer the agency agreement was sent to. Check they are acting on this sale."];
    ok(M.agreedDrafts(b).notes.includes(b.sources[0]), 'the source note is passed to Tim'); }
  // never a guess: a missing due date, lawyer or settlement becomes a blank
  { const b = base(); delete b.terms.as_drafted.d_lim; b.vendorLawyer = {}; b.terms.as_drafted.settlement = '15 working days after confirmation'; b.terms.settlement = { kind: 'relative', days: 15 };
    const x = M.agreedDrafts(b);
    // Offers fixes 2: worked out from the agreement date with working days and Otago's holidays (the LIM rule runs the break to 15 January)
    has(x.purchasers.body, '2. LIM: within 10 working days of the date of agreement, due **Tuesday 26 January 2027**.', 'a due date not on the agreement: worked out from the agreement date');
    ok(x.notes.some(n => /^LIM due Tuesday 26 January 2027 \(worked out from the agreement date, Friday 18 December 2026: within 10 working days of the date of the agreement, with Otago holidays; check\)$/.test(n)), 'the worked-out LIM date is shown to Tim once, with how: ' + JSON.stringify(x.notes));
    ok(!x.purchasers.body.includes('worked out') && !x.vendors.body.includes('worked out'), 'the "worked out" notes are for Tim\'s editor, not in the emails');
    has(x.purchasers.body, "The vendors' lawyer is:\n[Tim to fill: the vendors' lawyer (name, firm, email, phone)]", 'no vendors\' lawyer on file');
    ok(x.stillNeeded.includes("the vendors' lawyer (name, firm, email, phone)"), 'no vendors\' lawyer: listed for Tim as still needed');
    ok(!x.stillNeeded.some(t => /^the vendors' lawyer's /.test(t)), "a lawyer missing altogether is one item, not their name, firm and first name again: " + JSON.stringify(x.stillNeeded));
    has(x.purchasers.body, 'Possession and Settlement day: **Wednesday 17 February 2027**', 'settlement: 15 working days after the last condition (Waitangi Day observed skipped)');
    ok(x.notes.some(n => /^Settlement day Wednesday 17 February 2027 \(worked out from the agreement date, Friday 18 December 2026: 15 working days after the last condition, with Otago holidays; check\)$/.test(n)), 'the worked-out settlement day is shown to Tim once');
    ok(!x.blanks.some(b => /settlement day|due date/.test(b)), 'no blank for dates the portal can work out');
    ok(!x.purchasers.body.includes('They all fall due on the same day'), 'no "same day" claim without both dates');
    ok(x.vendors.cc.length === 0, 'no lawyer address: no cc, Tim adds it'); }
  { const b = base(); b.terms.changes = [{ round: 2, side: 'vendor', kind: 'insert', page: 1, text: '$690,000' }]; const x = M.agreedDrafts(b);
    ok(x.purchasers.body.startsWith('[Tim to check: the negotiation made 1 change to the document; make sure this roadmap follows them]'), 'a negotiated agreement: Tim checks the roadmap follows the changes'); }
  { const b = base(); b.terms.conditions = []; b.terms.kiwisaver = false; b.details.kiwisaver = false; b.details.chattels_exclude = []; b.terms.further_terms = []; const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Conditions: none. The agreement is unconditional.', 'unconditional');
    has(x.purchasers.body, 'Deposit ($65,500): payable to Public Trust O/A NZ Real Estate Trust [Tim to fill: when the deposit is paid].', 'no KiwiSaver: Tim\'s trust account, in his words');
    has(x.purchasers.body, 'Chattels to note: none noted in the agreement.', 'no chattels to note');
    ok(!x.vendors.body.includes('Until the purchaser confirms'), 'unconditional: no "until the purchaser confirms"'); }
  // the deposit's timing, when the agreement's own deposit wording says it (Tim's words from his past emails)
  { const b = base(); b.terms.kiwisaver = false; b.details.kiwisaver = false; b.terms.deposit_printed = '$65,500 payable upon the agreement becoming unconditional'; const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Deposit ($65,500): payable to Public Trust O/A NZ Real Estate Trust once the agreement becomes unconditional.', 'unconditional: Tim\'s exact wording');
    ok(!x.blanks.includes('[Tim to fill: when the deposit is paid]'), 'no blank when the agreement says when');
    b.terms.deposit_printed = 'payable on signing'; b.terms.as_drafted.deposit = '$65,500'; has(M.agreedDrafts(b).purchasers.body, 'Deposit ($65,500): payable to Public Trust O/A NZ Real Estate Trust on signing.', 'on signing'); }
  // Offers fixes 2: the agreed price after the negotiation, from the rounds' shapes (shared with Tim's own email)
  { const box = { page: 1, x: 300, y: 600, w: 80, h: 10 }, strike = { id: 'k1', kind: 'strike', page: 1, geometry: { x0: 300, x1: 360, y: 603, text: '$655,000' } }, ins = (t, y, id) => ({ id: id || 'i1', kind: 'insert', page: 1, geometry: { x: 300, y: y || 588, text: t, size: 9 } });
    const L = (...marks) => [{ doc_round: 1, side: 'purchaser', marks: [] }, { doc_round: 2, side: 'vendor', marks }];
    const pr = (layers, terms) => M.agreedPrice({ terms: terms || base().terms, layers, priceBoxes: [box] });
    let r = pr(L(strike, ins('$690,000'))); ok(r.text === '$690,000' && r.changed && r.round === 2 && !r.unsure, 'a struck price and the typed figure beside it: the typed figure, Round 2: ' + JSON.stringify(r));
    r = pr(L()); ok(r.text === '$655,000' && !r.changed, 'no changes: the drafted price');
    r = pr(L({ id: 'n1', kind: 'insert', page: 2, geometry: { x: 60, y: 200, text: 'Settlement 20/12/2026', size: 9 } })); ok(r.text === '$655,000' && !r.changed, 'a change elsewhere that is not about the price: the drafted price');
    r = pr(L(ins('$690,000'))); ok(r.text === M.PRICE_BLANK && r.unsure, 'a figure typed by the price but the price not struck: a marked blank');
    r = pr(L(strike, ins('$690,000'), ins('$700,000', 575, 'i2'))); ok(r.unsure, 'two standing figures by the price: a marked blank');
    r = pr(L(strike, ins('$690,000'), { id: 'n2', kind: 'insert', page: 2, geometry: { x: 60, y: 200, text: 'Price $1 250 000', size: 9 } })); ok(r.unsure, 'other typed words about the price: a marked blank');
    r = pr(L(strike, ins('$690,000'), { id: 'h1', kind: 'note', page: 1, geometry: { strokes: [[[305, 602], [340, 606]]] } })); ok(r.unsure, 'handwriting over the price: a marked blank');
    r = pr(L(strike, ins('agreed'))); ok(r.unsure, 'typed words with no figure: a marked blank');
    r = pr(L(strike, { id: 'r1', kind: 'reinstate', page: 1, target: 'k1', geometry: { x: 300, y: 614 } })); ok(r.text === '$655,000' && !r.changed, 'a reinstated price stands');
    // a counter and a counter back: Round 2 types $690,000, Round 3 strikes it and types $672,500
    const r3 = [{ doc_round: 1, side: 'purchaser', marks: [] }, { doc_round: 2, side: 'vendor', marks: [strike, ins('$690,000')] }, { doc_round: 3, side: 'purchaser', marks: [{ id: 'k2', kind: 'strike', page: 1, geometry: { x0: 300, x1: 345, y: 591 } }, ins('$672,500', 576, 'i3')] }];
    r = pr(r3); ok(r.text === '$672,500' && r.round === 3, 'the last figure standing after a counter back: ' + JSON.stringify(r));
    // the live data shape (25 November 2026): only the list of changes, no shapes, a strike with no words: never the first offer's price
    r = M.agreedPrice({ terms: Object.assign(base().terms, { price: 1000000, as_drafted: { price: '$1,000,000' }, changes: [{ round: 2, kind: 'strike', page: 1, text: null }, { round: 2, kind: 'insert', page: 1, text: '$1,050,000' }] }) });
    ok(r.unsure && r.text === '[Tim to fill: the agreed price after negotiation]', 'changes without shapes: a marked blank, never the first offer\'s price');
    // the emails use it: price, the deposit as its percentage of the agreed price, Tim's note
    const b = base(); b.terms.kiwisaver = false; b.details.kiwisaver = false; b.terms.as_drafted.deposit = ''; b.terms.deposit_printed = '10% of the purchase price payable upon the agreement becoming unconditional'; b.layers = L(strike, ins('$690,000')); b.priceBoxes = [box];
    const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'Price: $690,000', 'the emails: the agreed price after the negotiation'); ok(!x.purchasers.body.includes('$655,000') && !x.vendors.body.includes('$655,000'), 'never the first offer\'s price');
    has(x.purchasers.body, 'Deposit ($69,000): payable to Public Trust O/A NZ Real Estate Trust once the agreement becomes unconditional.', 'the deposit: 10% of the agreed price');
    ok(x.notes.includes('Deposit $69,000 (worked out from 10% of the agreed price $690,000; check)') && x.notes.includes('Price $690,000 (the figure typed in Round 2 in place of the struck price; check)'), 'Tim\'s notes: ' + JSON.stringify(x.notes));
    b.layers = L(strike, ins('$690,000'), ins('$700,000', 575, 'i2')); const y = M.agreedDrafts(b);
    has(y.purchasers.body, 'Price: [Tim to fill: the agreed price after negotiation]', 'unclear: a marked blank'); has(y.purchasers.body, 'Deposit ([Tim to fill: the deposit amount])', 'no price, no deposit amount: a blank');
    // Tim's own email when the agreement is confirmed (item 6)
    const n = M.agreedNotice({ address: '12 Example Street, Dunedin', agreement: { agreement_date: '2026-12-18', date_text: '18 December 2026', sha256: 'ab'.repeat(32) }, purchasers: ['Ana Testbuyer', 'Bo Testbuyer'], vendors: ['Vera Vendorperson'],
      terms: Object.assign(base().terms, { as_drafted: { price: '$655,000' }, settlement: { kind: 'relative', days: 15 } }), layers: L(strike, ins('$690,000')), priceBoxes: [box], labels: { finance: 'Finance', lim: 'LIM' }, depositHolder: { holder: 'nzret', by_default: false }, portalUrl: 'https://portal.dunnerstunner.co.nz/properties/P/offers/O', attached: true });
    out.agreedNotice = n;
    ok(n.subject === 'Agreement confirmed: 12 Example Street, Dunedin', 'Tim\'s email: the subject');
    for (const t of ['Date of agreement: Friday 18 December 2026.', 'Purchasers: Ana Testbuyer and Bo Testbuyer.', 'Vendors: Vera Vendorperson.', 'Price: $690,000. Changed in the negotiation: typed in Round 2 in place of the struck price.',
      '1. Finance: due Thursday 14 January 2027 (worked out from the agreement date)', '2. LIM: due Tuesday 26 January 2027 (worked out from the agreement date)', 'Settlement day: Wednesday 17 February 2027 (worked out from the agreement date).',
      'Deposit holder: Public Trust O/A NZ Real Estate Trust (your choice).', 'Fingerprint (SHA-256): ' + 'ab'.repeat(32), 'The offer in the portal: https://portal.dunnerstunner.co.nz/properties/P/offers/O', 'The dated agreed copy is attached.']) has(n.body, t, 'Tim\'s email');
    ok(!/^Price:.*655,000/m.test(n.body) && !/[—–]/.test(n.body), 'Tim\'s email: never the first offer\'s price; no dashes');
    ok(/Changes made in the negotiation \(2\):\n1\. Round 2, page 1: line through "\$655,000"\n2\. Round 2, page 1: typed "\$690,000"/.test(n.body), 'Tim\'s email lists every change: ' + n.body);
    const n2 = M.agreedNotice({ address: 'x', agreement: { agreement_date: '2026-12-18' }, terms: base().terms, layers: L(strike, ins('$690,000'), ins('$700,000', 575, 'i2')), priceBoxes: [box], tooBig: true });
    ok(/Price: not worked out here/.test(n2.body) && /too big to attach/.test(n2.body) && /recommended one; you haven't chosen yet/.test(n2.body), 'unclear price, too big to attach, no holder chosen: said plainly'); }
  // 025: the agent's phone in the database (offer_settings.agent_phone's default) is the one in Tim's sign-off
  { const mig = require('fs').readFileSync(path.join(__dirname, '..', 'migrations', '025_offer_mail_agent_own.sql'), 'utf8'), m = /agent_phone text not null default '([^']+)'/.exec(mig);
    ok(m && m[1] === M.TIM_PHONE, 'the agent phone in 025 is mail-core\'s TIM_PHONE: ' + (m && m[1]) + ' / ' + M.TIM_PHONE);
    const sh = require('fs').readFileSync(path.join(__dirname, '..', '..', 'fn', 'shared.ts'), 'utf8'), e = /agent_email text not null default '([^']+)'/.exec(mig), te = /export const TIM_EMAIL = "([^"]+)"/.exec(sh);
    ok(e && te && e[1] === te[1], 'the agent email in 025 is the one Tim\'s emails come from (fn/shared.ts TIM_EMAIL)'); }
  // review of Offers fixes 2: strict reading of the price change, other changes blank what they could affect
  { const terms = { price: 1000000, as_drafted: { price: '$1,000,000', settlement: '20 February 2027', deposit: '$50,000', d_finance: '10 December 2026' }, conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'date', date: '2027-02-20' } };
    const box = [{ page: 2, x: 300, y: 500, w: 60, h: 10 }], L = (...m) => [{ doc_round: 1, side: 'purchaser', marks: [] }, { doc_round: 2, side: 'vendor', marks: m }];
    const pr = layers => M.agreedPrice({ terms, layers, priceBoxes: box });
    for (const gap of [12, 13, 14, 16]) { const r = pr(L({ id: 's', kind: 'strike', page: 2, geometry: { x0: 310, x1: 350, y: 500 + gap + 2.6, text: 'chattels' } }, { id: 'i', kind: 'insert', page: 2, geometry: { x: 380, y: 500 + gap, text: '$5,000', size: 9 } }));
      ok(r.unsure, `a line through the words on the line above the price (${gap} pt) is not a line through the price: ` + r.text); }
    { const r = pr(L({ id: 's', kind: 'strike', page: 2, geometry: { x0: 300, x1: 360, y: 503.5, text: 'Purchase' } }, { id: 'i', kind: 'insert', page: 2, geometry: { x: 365, y: 500, text: '$1,050,000', size: 9 } })); ok(r.unsure, 'struck words without the drafted figure: not the price'); }
    const strike = { id: 's', kind: 'strike', page: 2, geometry: { x0: 300, x1: 360, y: 503.5, text: '$1,000,000' } }, ins = t => ({ id: 'i', kind: 'insert', page: 2, geometry: { x: 365, y: 500, text: t, size: 9 } });
    for (const t of ['$1,050,000 plus GST', '$1,050,000 incl GST', '$1,050,000 + chattels $20,000', '$1,050,000 if settlement 1 March', '1.05m', '$1.05 million']) ok(pr(L(strike, ins(t))).unsure, 'typed words that are more than a figure: a marked blank: ' + t);
    for (const t of ['$1,050,000', '1,050,000', '$1 050 000', '1050000', '$1,050,000.00']) { const r = pr(L(strike, ins(t))); ok(!r.unsure && r.figure === 1050000, 'only a figure: read: ' + t + ' -> ' + r.text); }
    for (const t of ['$105,000', '$2,500,000']) ok(pr(L(strike, ins(t))).unsure, 'a figure under half or over double the drafted price: a marked blank: ' + t);
    { const r = pr(L({ id: 's', kind: 'strike', page: 2, geometry: { x0: 302, x1: 350, y: 503.5 } }, ins('$1,050,000'))); ok(!r.unsure && r.text === '$1,050,000', 'a line from before the words were recorded, across the drafted figure: read'); }
    { const r = pr(L({ id: 's', kind: 'strike', page: 2, geometry: { x0: 345, x1: 360, y: 503.5 } }, ins('$1,050,000'))); ok(r.unsure, 'an old line only at the end of the place: not the price'); }
    // other changes (the reviewer's dates.js): the settlement day and the deposit changed by typed words; they all become blanks, and each change is listed for Tim
    const other = [{ id: 'a', kind: 'strike', page: 2, geometry: { x0: 300, x1: 380, y: 404, text: '20 February 2027' } }, { id: 'b', kind: 'insert', page: 2, geometry: { x: 390, y: 403, text: '6 March 2027', size: 9 } },
      { id: 'c', kind: 'strike', page: 2, geometry: { x0: 300, x1: 340, y: 454, text: '$50,000' } }, { id: 'd', kind: 'insert', page: 2, geometry: { x: 350, y: 453, text: '$100,000', size: 9 } }];
    const x = M.agreedDrafts({ address: '1 Test St', agreement: { agreement_date: '2026-11-25' }, terms, details: { email: 'p@x.nz' }, vendors: [], layers: L(...other), priceBoxes: box, province: 'otago', holidays: [], labels: { finance: 'Finance' } });
    ok(x.purchasers.body.includes('Price: $1,000,000') && x.purchasers.body.includes('Deposit ([Tim to fill: the deposit amount])') && x.purchasers.body.includes('due **[Tim to fill: the Finance due date]**') && x.purchasers.body.includes('**[Tim to fill: settlement day]**'), 'other changes: the deposit, settlement day and condition dates become marked blanks');
    ok(!/20 February 2027|10 December 2026|\$50,000/.test(x.purchasers.body), 'none of the as-drafted values those changes may have replaced');
    ok(['Change: Round 2, page 2: line through "20 February 2027"', 'Change: Round 2, page 2: typed "6 March 2027"', 'Change: Round 2, page 2: line through "$50,000"', 'Change: Round 2, page 2: typed "$100,000"'].every(n => x.notes.includes(n)) && /left as blanks/.test(x.notes[0]), 'Tim\'s notes list every change: ' + JSON.stringify(x.notes));
    // the price change alone, resolved: the dates stay, each with a check note
    const y = M.agreedDrafts({ address: '1 Test St', agreement: { agreement_date: '2026-11-25' }, terms, details: { email: 'p@x.nz' }, vendors: [], layers: L(strike, ins('$1,050,000')), priceBoxes: box, province: 'otago', holidays: [], labels: { finance: 'Finance' } });
    ok(y.purchasers.body.includes('Price: $1,050,000') && y.purchasers.body.includes('due **Thursday 10 December 2026**') && y.purchasers.body.includes('**Saturday 20 February 2027**') && y.purchasers.body.includes('Deposit ($50,000)'), 'only the price changed: the other terms as on the agreement');
    ok(y.notes.includes('Finance due Thursday 10 December 2026 (as written on the agreement; check)') && y.notes.includes('Settlement day Saturday 20 February 2027 (as written on the agreement; check)'), 'every date has a check note: ' + JSON.stringify(y.notes));
    // a change with no words recorded (the live data shape) is listed as such
    ok(M.agreedDrafts({ address: 'x', agreement: {}, terms: Object.assign({}, terms, { changes: [{ round: 2, kind: 'strike', page: 1, text: null }] }), details: {}, vendors: [] }).notes.includes('Change: Round 2, page 1: line through (the words struck were not recorded)'), 'a strike with no words recorded says so'); }
  // Tim's phone from the database at run time (offer_settings.agent_phone): every draft's sign-off follows it
  { const was = M.TIM_PHONE; M.setAgent({ phone: '021 444 5555' }); ok(/021 444 5555/.test(M.signLinkDraft({ first: 'A', address: 'x', side: 'purchaser' }).body) && M.TIM_PHONE === '021 444 5555', 'setAgent: the sign-off uses the phone from the database');
    M.setAgent({ phone: 'not a phone' }); ok(M.TIM_PHONE === '021 444 5555', 'a value that isn\'t a phone is ignored'); M.setAgent({ phone: was }); }
  // the first working day
  ok(M.longDate(M.firstWorkingDay('2026-12-24', holidays)) === 'Tuesday 29 December 2026', 'over Christmas: weekends and public holidays skipped');
  { const b = base(); b.agreement.agreement_date = '2026-12-24'; has(M.agreedDrafts(b).purchasers.body, '[Tim to check: the first working day falls between 24 December and 5 January', 'in the Christmas break Tim checks the dates'); }
  // who holds the deposit (Tim, 24 November 2026): recommended by KiwiSaver, Tim's choice followed, the KiwiSaver line always kept
  ok(M.depositRecommended(true) === 'vendor_lawyer' && M.depositRecommended(false) === 'nzret', 'recommended holder: the vendors\' lawyer with KiwiSaver, else the NZ Real Estate Trust');
  ok(/Tim's trust account/.test(M.DEPOSIT_HOLDERS.nzret.label) && /Vendors' lawyer's trust account/.test(M.DEPOSIT_HOLDERS.vendor_lawyer.label) && /Other/.test(M.DEPOSIT_HOLDERS.other.label), 'the three choices');
  { const b = base(); b.depositHolder = { holder: 'nzret' }; const t = M.agreedDrafts(b).purchasers.body;   // KiwiSaver, but Tim chose his trust account
    has(t, "Deposit ($65,500): payable to Public Trust O/A NZ Real Estate Trust [Tim to fill: when the deposit is paid]. Because your KiwiSaver is part of it, the deposit can't be released before settlement.", 'KiwiSaver with Tim\'s trust account: the release line kept'); }
  { const b = base(); b.depositHolder = { holder: 'other', other: 'Smith Law trust account' }; const x = M.agreedDrafts(b);
    has(x.vendors.body, "payable to Smith Law trust account [Tim to fill: when the deposit is paid]. Because the purchasers' KiwiSaver is part of it, the deposit can't be released before settlement.", 'Other: the typed holder, and the release line'); }
  { const b = base(); b.depositHolder = { holder: 'other', other: '' }; has(M.agreedDrafts(b).purchasers.body, 'payable to [Tim to fill: who holds the deposit]', 'Other left empty: a marked blank'); }
  { const b = base(); b.terms.kiwisaver = false; b.details.kiwisaver = false; b.depositHolder = { holder: 'vendor_lawyer' }; const t = M.agreedDrafts(b).purchasers.body;
    has(t, "Deposit ($65,500): payable to the vendors' lawyer's trust account [Tim to fill: when the deposit is paid].", 'no KiwiSaver, Tim chose the vendors\' lawyer'); ok(!/KiwiSaver/.test(t.split('Deposit (')[1].split('\n')[0]), 'no KiwiSaver words without KiwiSaver'); }
  // a withdrawal Tim recorded: to the side that directed it, and to the other side's lawyer; no reason, no other side's contacts
  { const w = M.withdrawDrafts({ side: 'vendor', counter: true, address: '12 Example Street, Dunedin', when: '2026-11-24T02:00:00Z', partyFirst: ['Vee', 'Val'], partyTo: ['Vee@Example.com'], ownLawyer: { email: 'vl@law.example' }, otherLawyer: { person: 'Pat Lawyer', firm: 'Law Ltd', email: 'pat@law.example' } });
    out.withdraw = w;
    ok(/^Hello Vee and Val,/.test(w.party.body) && w.party.to[0] === 'vee@example.com' && w.party.cc[0] === 'vl@law.example' && /withdrawal of your counteroffer for 12 Example Street, Dunedin, with immediate effect from Tuesday, 24 November 2026 at 3:00/.test(w.party.body), 'the email to the vendors who directed it');
    ok(/^Dear Pat,/.test(w.lawyer.body) && w.lawyer.to[0] === 'pat@law.example' && !w.lawyer.cc.length && /the vendors have withdrawn their counteroffer/.test(w.lawyer.body) && !/vee@|Vee/.test(w.lawyer.body), 'the email to the purchasers\' lawyer');
    const p = M.withdrawDrafts({ side: 'purchaser', address: 'x', when: null, partyFirst: ['Ana'], partyTo: ['ana@example.com'], otherLawyer: {} });
    ok(/^Dear Ana,/.test(p.party.body) && /your offer for x/.test(p.party.body) && /\[Tim to fill: when it was withdrawn\]/.test(p.party.body) && /\[Tim to fill: the lawyer's first name\]/.test(p.lawyer.body), 'purchasers: their offer; blanks where nothing is known');
    ok(!/—/.test(JSON.stringify(w) + JSON.stringify(p)), 'no em dashes');
    // the vendors made no counteroffer: they have declined the offer, in both emails; Tim's sign-off
    const n = M.withdrawDrafts({ side: 'vendor', counter: false, address: 'x', when: null, partyFirst: ['Vee'], partyTo: ['vee@example.com'], otherLawyer: { person: 'Pat Lawyer', email: 'pat@law.example' } });
    ok(/recorded that you have declined the offer for x/.test(n.party.body) && /the vendors have declined the offer for x/.test(n.lawyer.body) && !/counteroffer/.test(n.party.body + n.lawyer.body), 'no counteroffer made: declined, not withdrawn');
    ok(/Faithfully,\nTim$/.test(w.lawyer.body), 'the lawyer email signs off as Tim does'); }
  // signing emails and Tim's notice
  const sl = M.signLinkDraft({ first: 'Vee', address: '12 Example Street, Dunedin', side: 'vendor', round: 2 });
  ok(sl.subject === 'An offer on 12 Example Street, Dunedin' && sl.body.includes(M.LINK) && /^Hello Vee,/.test(sl.body) && /^Dear Ana,/.test(M.signLinkDraft({ first: 'Ana', address: 'x', side: 'purchaser', round: 1 }).body) && /027 562 7207/.test(sl.body) && /14 days/.test(sl.body) && /comes straight to me/.test(sl.body) && !/[—–]/.test(sl.body), 'the link draft: who, what, by when, Tim\'s phone, straight to Tim');
  out.signLink = sl;
  const ro = M.reopenedDraft({ first: 'Val', address: '12 Example Street, Dunedin', by: 'Vee', side: 'vendor' }); out.reopened = ro;
  ok(/^Hello Val,/.test(ro.body) && /^Dear Bo,/.test(M.reopenedDraft({ first: 'Bo', address: 'x', by: 'Ana', side: 'purchaser' }).body) && !/Kia ora/.test(ro.body + sl.body), 'Tim\'s openings: Hello to vendors, Dear to purchasers, by preferred name');
  ok(/A change to initial/.test(ro.subject) && /Vee has made a change/.test(ro.body) && /initial the change and finish again/.test(ro.body), 'the "please initial again" draft');
  const nt = M.roundNotice({ side: 'vendor', round: 2, address: '12 Example Street, Dunedin', signers: ['Vera Vendorperson'], changes: [{ kind: 'insert', page: 1, text: '$690,000', by: 'Vera Vendorperson' }, { kind: 'strike', page: 1, by: 'Vera Vendorperson' }], portalUrl: 'https://portal.dunnerstunner.co.nz/properties/P/offers/O/signing/S' });
  out.notice = nt;
  ok(nt.subject === 'Round 2 submitted by the vendors: 12 Example Street, Dunedin' && /What changed in this round \(2\)/.test(nt.body) && /"\$690,000"/.test(nt.body) && /not told until you present it/.test(nt.body) && nt.body.includes('https://portal.dunnerstunner.co.nz/properties/P/offers/O/signing/S'), "Tim's notice: who, what changed, which round, its address");
  // the HTML
  const h = M.toHtml('Hello <b>x</b> & co\n\n**Roadmap**\n\nOpen: [the signing link]\n\nSee https://portal.dunnerstunner.co.nz/x.', 'https://packages.dunnerstunner.co.nz/onboarding/?sign=abc');
  ok(h.includes('Hello &lt;b&gt;x&lt;/b&gt; &amp; co') && h.includes('<strong>Roadmap</strong>') && h.includes('href="https://packages.dunnerstunner.co.nz/onboarding/?sign=abc"') && h.includes('<a href="https://portal.dunnerstunner.co.nz/x">') && !h.includes('[the signing link]'), 'escaped, bold, the link and web addresses as links');
  // Offers fixes 3: the urgent request email's wording (shared by the edge function and the mock); freeze and withdraw read as before
  { const f = M.requestNotice({ kind: 'freeze', side: 'purchaser', round: 1, address: '1 Example Road' }), w = M.requestNotice({ kind: 'withdraw', side: 'vendor', round: 2, address: '1 Example Road' });
    ok(f.subject === 'URGENT: a purchaser asks to stop signing: 1 Example Road' && f.ask === 'stop signing for now' && /Freeze now or Withdraw now/.test(f.after), 'freeze wording as before: ' + f.subject);
    ok(w.subject === 'URGENT: a vendor asks to withdraw: 1 Example Road' && w.ask === 'withdraw', 'withdraw wording as before: ' + w.subject);
    const r3 = M.requestNotice({ kind: 'revert', side: 'purchaser', round: 3, address: '1 Example Road' }), r1 = M.requestNotice({ kind: 'revert', side: 'purchaser', round: 1, address: '' });
    ok(r3.subject === 'URGENT: a purchaser asks to go back to Round 2: 1 Example Road' && r3.ask === 'go back to Round 2 as it was signed' && /Nothing has been set aside yet/.test(r3.after) && /go back to Round 2, or let them carry on/.test(r3.after), 'going back: ' + JSON.stringify(r3));
    ok(r1.subject === 'URGENT: a purchaser asks to start the round again: an offer' && r1.ask === 'start this round again from the beginning', 'Round 1 has nothing sealed to go back to: ' + r1.subject);
    ok(![f, w, r3, r1].some(x => /\u2014/.test(JSON.stringify(x))), 'no em dashes'); }
  { const v = M.finishAgainDraft({ first: 'Ula', address: '1 Example Road', side: 'vendor' }), q = M.finishAgainDraft({ first: '', address: '', side: 'purchaser' });
    ok(v.subject === 'Please finish signing again: 1 Example Road' && /^Hello Ula,/.test(v.body) && /open the link I sent you earlier and finish signing again/.test(v.body) && /\nTim$/.test(v.body), 'finish again (vendor): ' + v.body);
    ok(/^Dear there,/.test(q.body) && /the property/.test(q.subject) && !/\u2014/.test(v.body + q.body), 'finish again (purchaser, nothing known): ' + q.subject); }
  // LW3 phase E (037): the appraisal email, in Tim's voice, and Tim's own note of what a vendor did
  { const a = M.appraisalDraft({ first: ['Robin', 'Sam'], address: '9 Example Road, Rbvale' }), u = M.appraisalDraft({ first: 'Robin', address: '9 Example Road, Rbvale', update: true }), z = M.appraisalDraft({});
    out.appraisalDraft = a;
    ok(a.subject === 'Your appraisal: 9 Example Road, Rbvale' && /^Hello Robin and Sam,/.test(a.body) && a.body.includes(M.APPRAISAL_LINK) && /sign in with this email address/.test(a.body)
      && /I'd like to proceed/.test(a.body) && /027 562 7207/.test(a.body) && /\n\nTim$/.test(a.body), 'the appraisal email: ' + a.body);
    ok(u.subject === 'Your updated appraisal: 9 Example Road, Rbvale' && /updated my appraisal/.test(u.body) && u.body.includes(M.APPRAISAL_LINK), 'the updated version: ' + u.subject);
    ok(/^Hello there,/.test(z.body) && /your property/.test(z.subject), 'nothing known: no blanks, no guesses: ' + z.subject);
    ok(![a, u, z].some(x => /\u2014|\bfees?\b|commission|\bas is\b|\$\d/i.test(x.subject + x.body)), 'no em dash, no fee, no figure in the appraisal email');
    ok(!M.BLANK_RE.test(a.body + u.body) && (M.BLANK_RE.lastIndex = 0, true), 'no marked blanks to fill');
    const h = M.toHtml(a.body, 'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=abc', { token: M.APPRAISAL_LINK, label: 'Open my appraisal' });
    ok(h.includes('href="https://packages.dunnerstunner.co.nz/onboarding/?appraisal=abc"') && h.includes('>Open my appraisal</a>') && !h.includes('[the appraisal link]'), 'the appraisal link becomes their button');
    ok(M.toHtml('Open: [the signing link]', 'https://x.example.com/s').includes('>Open it</a>'), 'the signing link reads as before');
    const n1 = M.appraisalEventNotice({ kind: 'proceeded', who: 'Robin', address: '9 Example Road', version: 2, portalUrl: 'https://portal.dunnerstunner.co.nz/appraisals/x' }),
      n2 = M.appraisalEventNotice({ kind: 'plan_built', who: 'Robin', address: '9 Example Road', total: 2450.5 }), n3 = M.appraisalEventNotice({ kind: 'opened', who: '', address: '' });
    ok(n1.subject === 'Robin would like to proceed: 9 Example Road' && /\(version 2\)/.test(n1.body) && /appraisals\/x/.test(n1.body), 'proceeded notice: ' + n1.body);
    ok(n2.subject === 'Robin built their own marketing plan: 9 Example Road' && /\$2,450\.5/.test(n2.body), 'plan notice: ' + n2.body);
    ok(n3.subject === 'A vendor opened their appraisal: an appraisal', 'opened notice, nothing known: ' + n3.subject); }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });
