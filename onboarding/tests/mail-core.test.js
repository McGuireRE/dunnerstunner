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
  has(P.body, "This email is cc'd to your lawyer: Pat Solicitor, Synthetic Law, pat@synthlaw.example, 03 477 1234.", "the purchasers' lawyer");
  has(P.body, "The vendors' lawyer is: Sam Counsel, Counsel and Co, sam@counsel.example, 03 455 0000.", "the other side's lawyer too");
  has(P.body, 'Ana Testbuyer: ana.p@buyer.example, 022 777 6666', 'their own contact details, as supplied');
  has(V.body, 'Hello Vee,', 'vendors greeted by preferred name');
  has(V.body, "This email is cc'd to your lawyer, Sam Counsel of Counsel and Co.", "the vendors' lawyer named");
  has(V.body, "That way Sam and I can be responsive", "the lawyer's first name");
  has(V.body, 'Until the purchaser confirms the agreement, you have tasked me with marketing the property.', 'while conditional, marketing carries on');
  has(V.body, 'only tentative "pencil" bookings', 'pencil bookings');
  has(V.body, "The purchaser's lawyer is: Pat Solicitor, Synthetic Law, pat@synthlaw.example, 03 477 1234.", "the purchasers' lawyer");
  has(V.body, "Conditions: purchaser's action steps", "the conditions from the vendors' side");
  has(V.body, '1. Further term 23 (Fence): The vendor shall repair the broken boundary fence before settlement. Please book any work now.', "the vendors' action items from the further terms");
  // privacy: each party sees only their own details and both lawyers'
  for (const x of ['vera@vendor.example', '021 000 1111', 'Vendorperson']) ok(!P.body.includes(x), "the purchasers' email holds nothing of the vendor's own: " + x);
  for (const x of ['ana.p@buyer.example', 'bo.p@buyer.example', '022 777 6666', '022 555 4444', 'ana.own@buyer.example', '021 999 8888']) ok(!V.body.includes(x), "the vendors' email holds nothing of the purchasers' own: " + x);
  // blanks: only where the data is silent, clearly marked
  ok(JSON.stringify(r.blanks) === JSON.stringify(['[Tim to add: the property page link, or delete this line]', '[Tim to fill: when the deposit is paid]', '[Tim to check: no vendor action items were found in the further terms]'].filter(b => (P.body + V.body).includes(b))), 'the marked blanks: ' + JSON.stringify(r.blanks));
  ok(r.blanks.includes('[Tim to fill: when the deposit is paid]') && r.blanks.includes('[Tim to add: the property page link, or delete this line]') && !r.blanks.some(b => /vendor action/.test(b)), 'when the deposit is paid and the property page link are left for Tim; the vendor action item was found');
  // never a guess: a missing due date, lawyer or settlement becomes a blank
  { const b = base(); delete b.terms.as_drafted.d_lim; b.vendorLawyer = {}; b.terms.as_drafted.settlement = '15 working days after confirmation'; b.terms.settlement = { kind: 'relative', days: 15 };
    const x = M.agreedDrafts(b);
    has(x.purchasers.body, 'due **[Tim to fill: the LIM due date]**', 'a due date not on the agreement');
    has(x.purchasers.body, "The vendors' lawyer is: [Tim to fill: the lawyer (name, firm, email, phone)].", 'no vendors\' lawyer on file');
    has(x.purchasers.body, '**[Tim to fill: settlement day] (the agreement says: 15 working days after confirmation)**', 'a settlement worked out from confirmation');
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
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });
