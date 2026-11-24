// Tests of the offer-sign edge function's phase 4 request handling (fn/offer_sign_handler.ts, migration 021), with fakes for the
// database functions, storage, the sign-in check and email (nothing is ever sent), and the real negotiation core (src/nego-core.js)
// and pdf-lib on a small PDF. Covers: a change from a link (checked before the database is asked: ids, page, shape; passed on as
// data; a refusal written for people shown plainly); the link email to the vendors worded for them (an offer to look at, talk to your
// lawyer, nothing about the buyers' contact details); a later round locked from every round's layers (the purchasers' initials at the
// struck price lifted, the change and its initials drawn, stored at its own number, the core's check of what was lifted and what is
// outstanding sent with the record, Tim emailed that nothing has gone back yet); an acceptance flagged as the agreement formed; "agree"
// refused without Tim's sign-in, with a time that isn't one, or with something outstanding, and otherwise the agreed copy made with
// the date at the top, its fingerprint from the stored file, and locked; the entry file using the app-only CORS and the core.
const path = require('path'), crypto = require('crypto'), fs = require('fs');
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const S = require(path.join(__dirname, '..', 'src', 'sign-core.js'));
const MAILC = require(path.join(__dirname, '..', 'src', 'mail-core.js'));
const N = require(path.join(__dirname, '..', 'src', 'nego-core.js'));
const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const quiet = console.log; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'offer_sign_handler.ts'));
  const { netOf } = await import(path.join(__dirname, '..', '..', 'fn', 'offer_public_handler.ts'));
  const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
  const TOK = 'Zq3_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV7wX', SES = 'Se55ion_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV', SID = '5b0f7d1e-2c3a-4d5e-8f90-123456789abc', PID = '7c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f', OID = '9d2e3f4a-5b6c-4d7e-8f90-1a2b3c4d5e6f';
  const MK = '11111111-2222-4333-8444-555555555555', RID = '21111111-2222-4333-8444-555555555555';
  const doc = await PDFLib.PDFDocument.create(), F = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const p1 = doc.addPage([595.32, 842.04]); p1.drawText('DATE:', { x: 28, y: 730, size: 11, font: F }); p1.drawText('Purchase price: $655,000', { x: 40, y: 400, size: 9, font: F }); doc.addPage([595.32, 842.04]);
  const draft = await doc.save(), draftSha = sha(draft), DRAFT = 'properties/' + PID + '/docs/offer-draft-x.pdf';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // Round 1: the purchaser's price initials beside the price, a foot initial and a signature
  const r1places = [{ id: 'filled:price:s1', signer: 1, kind: 'initial', why: 'filled', ref: 'price', page: 1, x: 200, y: 398, w: 26, h: 13, for: { x: 40, y: 398, w: 190, h: 12 } }, { id: 'foot:p1:s1', signer: 1, kind: 'initial', why: 'foot', ref: 'p1', page: 1, x: 500, y: 5, w: 26, h: 13 }, { id: 'block:sig1:s1', signer: 1, kind: 'signature', why: 'block', ref: 'sig1', page: 2, x: 40, y: 500, w: 150, h: 22 }];
  const L1 = { round_id: 'r1', number: 1, doc_round: 1, side: 'purchaser', signing_id: 'g1', sha256: 'a'.repeat(64), places: r1places, taps: r1places.map(p => ({ place_id: p.id, signer: 1 })), signers: [{ position: 1, name: 'Ana Testbuyer', sig_png: png, init_png: png }], marks: [] };
  const strike = { id: MK, kind: 'strike', page: 1, geometry: { x0: 100, x1: 160, y: 403 }, by: 'Vera Vendor', at: '2026-11-24T02:00:00Z' };
  const insert = { id: MK.replace('5555', '6666'), kind: 'insert', page: 1, geometry: { x: 100, y: 386, text: '$690,000', size: 9 }, by: 'Vera Vendor', at: '2026-11-24T02:01:00Z' };
  const v2places = [{ id: 'foot:p1:s1', signer: 1, kind: 'initial', why: 'foot', ref: 'p1', page: 1, x: 470, y: 5, w: 26, h: 13 }, { id: 'block:vsig1:s1', signer: 1, kind: 'signature', why: 'block', ref: 'vsig1', page: 2, x: 330, y: 500, w: 150, h: 22 },
    { id: `chg:${strike.id}:s1`, signer: 1, kind: 'initial', why: 'change', ref: strike.id, page: 1, x: 165, y: 410, w: 26, h: 13 }, { id: `chg:${insert.id}:s1`, signer: 1, kind: 'initial', why: 'change', ref: insert.id, page: 1, x: 165, y: 384, w: 26, h: 13 }];
  let marks2 = [strike, insert], calls = [], mails = [], files = {}, agent = 'agent@example.test', changeErr = null, outstandingLayers = false, reopen = null, noDatePlace = false;
  files[DRAFT] = draft;
  const vSigner = { id: 'v1', position: 1, name: 'Vera Vendor', sig_png: png, init_png: png, verified_at: '2026-11-24T01:30:00Z', consent_at: '2026-11-24T01:31:00Z', receipts: [{ guide: 'chattels', at: '2026-11-24T01:32:00Z' }], places: 4, ua: 'Phone', net: 'f'.repeat(64), seen_sha256: 'd'.repeat(64) };
  const material = () => ({ signing_id: SID, offer_id: OID, property_id: PID, address: '1 Example Road, Testville', offer_ref: 'Ana Testbuyer', method: 'link', number: 2, round: 2, side: 'vendor', document: 1, earlier: [L1], link_changes: true,
    draft: { id: 'd', number: 1, path: DRAFT, sha256: draftSha }, places_sha256: 'b'.repeat(64), made_at: '2026-11-24T03:00:00Z', places: v2places, taps: v2places.map(p => ({ place_id: p.id, signer: 1, at: '2026-11-24T02:30:00Z' })), signers: [vSigner], marks: marks2, replaced: [] });
  const L2 = () => ({ round_id: RID, number: 2, doc_round: 2, side: 'vendor', signing_id: SID, sha256: 'c'.repeat(64), places: v2places, taps: v2places.map(p => ({ place_id: p.id, signer: 1 })), signers: [{ position: 1, name: 'Vera Vendor', sig_png: png, init_png: png }], marks: [strike, insert] });
  const L3 = () => { const pl = [r1places[2], { id: `chg:${strike.id}:s1`, signer: 1, kind: 'initial', why: 'change', ref: strike.id, page: 1, x: 195, y: 410, w: 26, h: 13 }, { id: `chg:${insert.id}:s1`, signer: 1, kind: 'initial', why: 'change', ref: insert.id, page: 1, x: 195, y: 384, w: 26, h: 13 }];
    return { round_id: 'r3', number: 3, doc_round: 3, side: 'purchaser', signing_id: 'g3', sha256: 'e'.repeat(64), places: pl, taps: (outstandingLayers ? pl.slice(0, 1) : pl).map(p => ({ place_id: p.id, signer: 1 })), signers: L1.signers, marks: [] }; };
  const db = async (fn, args) => {
    calls.push([fn, args]);
    if (fn === 'offer_sign_change') return changeErr ? { data: null, error: { message: changeErr } } : { data: Object.assign({ id: args.p_id, reopened: 0, reopened_signers: [], by: 'Vera Vendor', round: 2, side: 'vendor', address: '1 Example Road', offer_id: OID }, reopen || {}), error: null };
    if (fn === 'offer_mail_draft_sys') return { data: 'draft-1', error: null };
    if (fn === 'offer_sign_issue') return { data: { address: '1 Example Road', side: 'vendor', round: 2, links: [{ signer_id: 's1', position: 1, name: 'Vera Vendor', email: 'vera@example.com', token: TOK }] }, error: null };
    if (fn === 'offer_sign_open') return { data: { ok: true, first: 'Vera', address: '1 Example Road', finished: false, stopped: null, held: false, email_hint: 'v***@example.com', side: 'vendor', round: 2, email: 'vera@example.com' }, error: null };
    if (fn === 'offer_sign_finish') return { data: { ok: true, complete: true, signing_id: SID }, error: null };
    if (fn === 'offer_round_material') return { data: material(), error: null };
    if (fn === 'offer_file_confirm') return { data: null, error: null };
    if (fn === 'offer_round_lock') return { data: { id: RID, number: 2, round: 2, sha256: args.p_sha256, existing: false }, error: null };
    if (fn === 'offer_agreement_material') return { data: { offer_id: OID, property_id: PID, address: '1 Example Road, Testville', offer_ref: 'Ana Testbuyer', document: 1, round: 3, number: 3, round_id: 'r3', date_text: args.p_date_text, accepted_at: args.p_accepted_at, made_at: '2026-11-24T05:00:00Z',
      draft: { path: DRAFT, sha256: draftSha }, round_sha256: 'e'.repeat(64), date_place: noDatePlace ? null : { id: 'date', kind: 'date', page: 1, x: 70, y: 730, w: 200, h: 10 }, layers: [L1, L2(), L3()], rounds: [{ number: 1, document: 1, round: 1, side: 'purchaser', changes: 0, sha256: 'a'.repeat(64), locked_at: '2026-11-24T01:00:00Z' }] }, error: null };
    if (fn === 'offer_agreement_lock') return { data: { id: 'ag1', sha256: args.p_sha256, existing: false }, error: null };
    return { data: null, error: { message: 'unknown' } };
  };
  const h = H.makeHandler({ cors: { 'Access-Control-Allow-Origin': 'https://packages.dunnerstunner.co.nz' }, appUrl: 'https://packages.dunnerstunner.co.nz/onboarding/', timEmail: 'tim@example.test',
    whoIsAgent: async (a) => (a === 'Bearer good' ? agent : null), rpc: db, signedUrl: async (p) => 'https://signed.example/' + encodeURIComponent(p),
    download: async (p) => files[p] || null, upload: async (p, b) => { if (files[p]) return { ok: false, exists: true }; files[p] = b; return { ok: true }; },
    sendMail: async (kind, m) => { mails.push(Object.assign({ kind }, m)); }, renderRound: (d, m) => S.renderRound(PDFLib, d, m), renderWorking: (d, m) => N.renderWorking(PDFLib, d, m), nego: N, mail: MAILC, net: netOf });
  const post = (body, headers) => h(new Request('https://x.supabase.co/functions/v1/offer-sign', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'user-agent': 'Phone browser', 'x-forwarded-for': '203.0.113.7' }, headers || {}), body: JSON.stringify(body) }));
  const J = async r => ({ status: r.status, j: await r.json() });
  const text = async bytes => (await D.readPages(pdfjs, new Uint8Array(bytes))).map(p => p.items.map(i => i.s).join(' '));

  // ── a change from a link ──
  let r = await J(await post({ action: 'change', token: TOK, session: SES, id: 'not-a-uuid', kind: 'strike', page: 1, geometry: {}, places: [] }));
  expect(r.status === 400 && !calls.some(c => c[0] === 'offer_sign_change'), 'a change with a bad id is refused before the database is asked');
  r = await J(await post({ action: 'change', token: TOK, session: SES, id: MK, kind: 'strike', page: '1', geometry: { x0: 1, x1: 50, y: 5 }, places: [] }));
  expect(r.status === 400 && !calls.some(c => c[0] === 'offer_sign_change'), 'and with a page that is not a number');
  r = await J(await post({ action: 'change', token: TOK, session: SES, id: MK, kind: 'insert', page: 1, geometry: { x: 100, y: 386, text: '$690,000', size: 9 }, target: null, places: [{ id: `chg:${MK}:s1` }] }));
  const ch = calls.find(c => c[0] === 'offer_sign_change');
  expect(r.status === 200 && r.j.ok && r.j.id === MK && ch && ch[1].p_token === TOK && ch[1].p_session === SES && typeof ch[1].p_net === 'string' && ch[1].p_net.length > 8 && ch[1].p_geometry.text === '$690,000' && ch[1].p_places.length === 1, 'a change is passed on to the database as data, with the token, session and network (for its limit)');
  expect(!mails.length, 'nobody reopened: nobody emailed');
  // a change that reopens someone who had finished: no email to anyone now (Tim included; he hears once, when the round is submitted);
  // a draft for them, which Tim reads and sends himself
  reopen = { reopened: 1, reopened_signers: [{ id: 'sig-val', position: 2, name: 'Val Vendor', email: 'val@example.com' }] }; calls = [];
  r = await J(await post({ action: 'change', token: TOK, session: SES, id: MK, kind: 'strike', page: 1, geometry: { x0: 100, x1: 160, y: 403 }, places: [] }));
  const dsys = calls.find(c => c[0] === 'offer_mail_draft_sys');
  expect(r.j.ok && r.j.reopened === 1 && !mails.length, 'a change that reopens a signer: no email to anyone, not even Tim');
  expect(dsys && dsys[1].p_offer === OID && dsys[1].p_signer === 'sig-val' && dsys[1].p_to.join() === 'val@example.com' && /A change to initial/.test(dsys[1].p_subject) && /link I sent you earlier/.test(dsys[1].p_body) && /^Hello Val,/.test(dsys[1].p_body), 'a draft for Val, in Tim\'s voice, for him to send');
  reopen = null; mails = [];
  changeErr = "Those words hold a purchaser's own phone or email, so they can't go on the agreement. Only the lawyers' details go on it";
  r = await J(await post({ action: 'change', token: TOK, session: SES, id: MK, kind: 'insert', page: 1, geometry: { x: 1, y: 1, text: 'x', size: 9 }, places: [] }));
  expect(r.status === 400 && r.j.error === changeErr, 'the privacy refusal is shown plainly');
  changeErr = 'null value in column "geometry" violates not-null constraint';
  r = await J(await post({ action: 'change', token: TOK, session: SES, id: MK, kind: 'insert', page: 1, geometry: { x: 1, y: 1, text: 'x', size: 9 }, places: [] }));
  expect(r.status === 400 && /Something went wrong/.test(r.j.error) && !/null value/.test(r.j.error), 'anything internal stays hidden'); changeErr = null;
  r = await J(await post({ action: 'open', token: TOK }));
  expect(r.j.side === 'vendor' && r.j.round === 2 && !JSON.stringify(r.j).includes('vera@example.com'), 'opening a vendor\'s link says it is the vendors\' round, never the email');

  // ── Ask Tim for a change and Decline, worded by side ──
  { const H3 = H.makeHandler({ cors: {}, appUrl: 'x', timEmail: 'tim@example.test', whoIsAgent: async () => null,
      rpc: async (fn) => fn === 'offer_sign_ask' ? { data: { ok: true, name: 'Vera Vendor', address: '1 Example Road', side: 'vendor', round: 2 }, error: null } : { data: null, error: { message: 'unknown' } },
      signedUrl: async () => null, download: async () => null, upload: async () => ({ ok: true }), sendMail: async (kind, m) => { mails.push(Object.assign({ kind }, m)); }, renderRound: () => null, renderWorking: () => null, nego: N, net: netOf });
    mails = [];
    const ask = b_ => H3(new Request('https://x/f', { method: 'POST', body: JSON.stringify(Object.assign({ action: 'ask', token: TOK, session: SES }, b_)) }));
    await ask({ text: 'We decline the offer as it stands.', decline: true }); await ask({ text: 'Could settlement be later?' });
    expect(mails[0] && mails[0].kind === 'offer_sign_decline' && mails[0].subject === 'The vendors have declined the offer for 1 Example Road' && /a vendor/.test(mails[0].html), 'a vendor\'s decline has its own subject and wording');
    expect(mails[1] && mails[1].kind === 'offer_sign_ask' && mails[1].subject === 'A vendor asks for a change: 1 Example Road' && !/buyer/.test(mails[1].subject), 'a vendor\'s ask is worded for a vendor, not a buyer');
    mails = []; }

  // ── the vendors' link email: a draft worded for them (Tim sends it with send_mail; the old "send" is gone) ──
  r = await J(await post({ action: 'send_mail', draft_id: '6c6c6c6c-0000-4000-8000-000000000001' }));
  expect(r.status === 403, 'Send needs Tim');
  { const w = MAILC.signLinkDraft({ first: 'Vera', address: '1 Example Road', side: 'vendor', round: 2 });
    expect(/An offer on 1 Example Road/.test(w.subject) && /talk to your lawyer/.test(w.body) && /counteroffer/.test(w.body) && /\[the signing link\]/.test(w.body) && /comes straight to me/.test(w.body), 'the vendors\' link email is worded for them, and says it comes straight to Tim'); }

  // ── the last vendor finishes: Round 2 made from the layers and locked ──
  mails = [];
  r = await J(await post({ action: 'finish', token: TOK, session: SES }));
  const lk = calls.find(c => c[0] === 'offer_round_lock');
  expect(r.j.ok && r.j.complete && r.j.locked && r.j.round === 2, 'when the last vendor finishes, Round 2 is locked');
  expect(lk && new RegExp(`^properties/${PID}/docs/offer-round-${OID}-2-[0-9a-f]{12}\\.pdf$`).test(lk[1].p_path), 'stored at its own number for the offer');
  const ck = lk[1].p_execution.check; out.check = { lifted: ck.lifted.length, outstanding: ck.outstanding.length };
  expect(ck.lifted.some(x => x.why === 'filled' && x.who === 'Ana Testbuyer') && !ck.lifted.some(x => x.why === 'foot' || x.kind === 'signature'), 'the core lifted the purchaser\'s price initials (and nothing else) where the vendors changed it');
  expect(ck.outstanding.length === 2 && ck.outstanding.every(x => x.side === 'purchaser' && x.what === 'change'), 'outstanding: the purchaser\'s initials beside each change');
  const stored = files[lk[1].p_path]; expect(stored && sha(stored) === lk[1].p_sha256, 'its fingerprint is from the file as stored');
  // drawn again from its layers (as the database will hand them back) and its stored record: byte for byte the same round
  const ex = JSON.parse(JSON.stringify(lk[1].p_execution)), L2back = { doc_round: 2, number: 2, side: 'vendor', signing_id: SID, places: v2places, taps: v2places.map(p => ({ place_id: p.id, signer: 1 })), signers: [{ position: 1, name: 'Vera Vendor', sig_png: png, init_png: png }], marks: marks2 };
  const redrawn = await N.redrawRound(PDFLib, draft, JSON.parse(JSON.stringify([L1, L2back])), ex);
  expect(ex.draw_version === N.DRAW_VERSION && sha(redrawn.bytes) === lk[1].p_sha256, 'Round 2 drawn again from its layers and record reproduces its fingerprint exactly');
  const rt = await text(stored);
  expect(rt[0].includes('$690,000') && rt.length === 3 && /Execution record: Round 2/.test(rt[2]) && /lifted/i.test(rt[2]) && !/vera@example|SHOULD-NOT/.test(rt.join(' ')), 'the round shows the typed price, with its record at the end and no contact details');
  const ini = rt[0]; out.r2text = ini.slice(0, 80);
  expect(/Changes from link: allowed/.test(rt[2]) && lk[1].p_execution.link_changes === true, 'the round\'s record says whether changes from the link were allowed');
  const tm = mails.find(m => m.kind === 'offer_round_locked'); out.notice = tm ? { to: tm.to, subject: tm.subject, html: tm.html.slice(0, 900) } : null;
  expect(tm && tm.to === 'tim@example.test' && tm.subject === 'Round 2 submitted by the vendors: 1 Example Road, Testville' && /Nothing has gone back to the purchasers/.test(tm.html) && /What changed in this round/.test(tm.html) && tm.html.includes(`https://portal.dunnerstunner.co.nz/properties/${PID}/offers/${OID}/signing/${SID}`), 'Tim is told once: who, what changed, which round, and the round\'s portal address');
  expect(mails.length === 1, 'the submitted round: exactly one email, to Tim, and nobody else: ' + mails.map(m => m.kind + '>' + m.to).join(', '));
  // an acceptance (no changes, nothing outstanding) is flagged as the agreement formed
  marks2 = []; const accM = material; calls = [];
  const h2 = H.makeHandler({ cors: {}, appUrl: 'x', timEmail: 'tim@example.test', whoIsAgent: async (a) => (a === 'Bearer good' ? agent : null),
    rpc: async (fn, args) => fn === 'offer_round_material' ? { data: Object.assign(accM(), { places: [v2places[0], v2places[1]], taps: [v2places[0], v2places[1]].map(p => ({ place_id: p.id, signer: 1 })), marks: [] }), error: null } : db(fn, args),
    signedUrl: async () => null, download: async (p) => files[p] || null, upload: async (p, b) => { files[p] = b; return { ok: true }; }, sendMail: async (kind, m) => { mails.push(Object.assign({ kind }, m)); },
    renderRound: () => null, renderWorking: (d, m) => N.renderWorking(PDFLib, d, m), nego: N, net: netOf });
  mails = []; r = await J(await h2(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify({ action: 'lock', signing_id: SID }) })));
  expect(r.j.ok && r.j.round.formed === true && /nothing outstanding/.test((mails.find(m => m.kind === 'offer_round_locked') || {}).html || ''), 'the vendors accepting Round 1 as it stood: Tim is told the agreement can be confirmed');

  // ── agree ──
  r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: '2026-11-24T05:00:00Z', date_text: '24 November 2026' }));
  expect(r.status === 403, 'agree needs Tim');
  agent = null; r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: '2026-11-24T05:00:00Z', date_text: '24 November 2026' }, { Authorization: 'Bearer vendor' })); agent = 'agent@example.test';
  expect(r.status === 403, 'and not a vendor');
  r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: 'yesterday', date_text: '24 November 2026' }, { Authorization: 'Bearer good' }));
  expect(r.status === 400 && !calls.some(c => c[0] === 'offer_agreement_material'), 'a time that isn\'t one is refused before the database is asked');
  outstandingLayers = true;
  r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: '2026-11-24T05:00:00+13:00', date_text: '24 November 2026' }, { Authorization: 'Bearer good' }));
  expect(r.status === 400 && /outstanding/.test(r.j.error) && !calls.some(c => c[0] === 'offer_agreement_lock'), 'the core finds something outstanding: nothing is locked');
  outstandingLayers = false; noDatePlace = true; calls = [];
  r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: '2026-11-24T05:00:00+13:00', date_text: '24 November 2026' }, { Authorization: 'Bearer good' }));
  expect(r.status === 400 && /no date place/.test(r.j.error) && !calls.some(c => c[0] === 'offer_agreement_lock'), 'no date place on the blank: no agreed copy, and no date put anywhere else');
  noDatePlace = false;
  r = await J(await post({ action: 'agree', offer_id: OID, accepted_at: '2026-11-24T05:00:00+13:00', date_text: '24 November 2026' }, { Authorization: 'Bearer good' }));
  const al = calls.find(c => c[0] === 'offer_agreement_lock');
  expect(r.j.ok && al && new RegExp(`^properties/${PID}/docs/offer-agreement-${OID}-[0-9a-f]{12}\\.pdf$`).test(al[1].p_path) && al[1].p_round === 'r3' && al[1].p_date_text === '24 November 2026', 'agreed: stored at its own place and locked against the newest round');
  const ab = files[al[1].p_path]; expect(ab && sha(ab) === al[1].p_sha256, 'its fingerprint from the stored file');
  expect(al[1].p_record.base.sha256 === 'e'.repeat(64) && al[1].p_record.draw_version === N.DRAW_VERSION, 'the record names the round it was drawn from and the drawing version');
  expect(/Everything else is Round 3 as locked \(SHA-256 e{64}\)/.test((await text(ab)).slice(2).join(' ')) && /only things added after the last signature/.test((await text(ab)).slice(2).join(' ')), 'and says so on its record page');
  const apages = await D.readPages(pdfjs, new Uint8Array(ab)), dateItem = apages[0].items.find(i => i.s === '24 November 2026');
  expect(dateItem && Math.abs(dateItem.y - 730) < 2 && Math.abs(dateItem.x - 70) < 2, 'the date Tim typed is at the top, in the date place');
  expect(/The agreement as agreed/.test(apages.slice(2).map(p => p.items.map(i => i.s).join(' ')).join(' ')), 'with the agreement record at the end');

  // ── the entry file ──
  const entry = fs.readFileSync(path.join(__dirname, '..', '..', 'fn', 'offer_sign.ts'), 'utf8');
  expect(/cors: corsFor/.test(entry) && /nego-core\.js/.test(entry) && /renderWorking/.test(entry) && /JWT verification still OFF/.test(entry), 'the entry uses the app-and-portal CORS and the negotiation core');
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });
