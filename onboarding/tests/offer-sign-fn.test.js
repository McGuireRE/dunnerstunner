// Tests of the offer-sign edge function's request handling (fn/offer_sign_handler.ts), with fakes for the database functions, storage,
// the sign-in check and email (nothing is ever sent), and the real Round 1 renderer (src/sign-core.js with pdf-lib) on a small PDF.
// Covers: preflight and methods, body size, bad JSON, unknown actions, tokens that aren't tokens (nothing asked); open answering only
// the first name, address and state (never an email, a vendor or another buyer); the code emailed to the purchaser's own address as
// its own message and never returned; verify; state giving a short-lived link instead of the stored path; database refusals written
// for people shown plainly, anything internal hidden; "Ask Tim for a change" emailing Tim with the text made safe; finish locking
// Round 1 when the last purchaser finishes (the draft checked against its fingerprint, the round's fingerprint taken from the file as
// stored, the execution record with no contact details, Tim emailed) and not otherwise; a draft that doesn't match its fingerprint
// never locked; Tim's send and lock refused without his sign-in or for a vendor, and the links' tokens never returned to any page.
const path = require('path'), crypto = require('crypto');
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const S = require(path.join(__dirname, '..', 'src', 'sign-core.js'));
const MAILC = require(path.join(__dirname, '..', 'src', 'mail-core.js'));
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'offer_sign_handler.ts'));
  const { netOf } = await import(path.join(__dirname, '..', '..', 'fn', 'offer_public_handler.ts'));
  const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
  const TOK = 'Zq3_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV7wX', SES = 'Se55ion_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV', SID = '5b0f7d1e-2c3a-4d5e-8f90-123456789abc', PID = '7c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f', OID = '9d2e3f4a-5b6c-4d7e-8f90-1a2b3c4d5e6f';
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595.32, 842.04]).drawText('Synthetic approved draft', { x: 40, y: 800, size: 12 }); doc.addPage([595.32, 842.04]);
  const draft = await doc.save(); let draftSha = sha(draft);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let mailTake = null, takeErr = null, doneFail = false, consented = true, calls = [], mails = [], files = {}, failMail = null, agent = 'agent@example.test', finishComplete = false, tapError = null;
  const material = () => ({ signing_id: SID, offer_id: OID, property_id: PID, address: '1 Example Road, Testville', offer_ref: 'Ana Testbuyer', method: 'link', draft: { id: 'd', number: 2, path: 'properties/' + PID + '/docs/offer-draft-x.pdf', sha256: draftSha },
    places_sha256: 'b'.repeat(64), made_at: '2026-11-24T01:00:00Z', places: [{ id: 'foot:p1:s1', signer: 1, kind: 'initial', why: 'foot', page: 1, x: 500, y: 5, w: 26, h: 13 }, { id: 'block:sig1:s1', signer: 1, kind: 'signature', why: 'block', page: 2, x: 40, y: 500, w: 150, h: 22 }],
    taps: [{ place_id: 'foot:p1:s1', signer: 1 }, { place_id: 'block:sig1:s1', signer: 1 }], signers: [{ position: 1, name: 'Ana Testbuyer', sig_png: png, init_png: png, verified_at: '2026-11-24T00:30:00Z', consent_at: '2026-11-24T00:31:00Z', receipts: [], places: 2, ua: 'Phone', net: 'f'.repeat(64), seen_sha256: 'd'.repeat(64), email: 'SHOULD-NOT-PRINT@example.com' }], marks: [], replaced: [] });
  const db = async (fn, args) => {
    calls.push([fn, args]);
    if (fn === 'offer_sign_open') return args.p_token === TOK ? { data: { ok: true, first: 'Ana', address: '1 Example Road', finished: false, stopped: null, held: false, email_hint: 'a***@example.com', email: 'ana@example.com', vendor: 'Vera', others: ['Bo'] }, error: null } : { data: { ok: false }, error: null };
    if (fn === 'offer_sign_code') return { data: { ok: true, code: '123456', email: 'ana@example.com', name: 'Ana Testbuyer', address: '1 Example Road' }, error: null };
    if (fn === 'offer_sign_verify') return args.p_code === '123456' ? { data: { ok: true, session: SES }, error: null } : { data: { ok: false, reason: 'wrong' }, error: null };
    if (fn === 'offer_sign_state') return { data: { signer: { position: 1, name: 'Ana Testbuyer' }, signing: { status: 'signing', draft_path: consented ? 'properties/' + PID + '/docs/offer-draft-x.pdf' : null, places: [] }, taps: [] }, error: null };
    if (fn === 'offer_sign_tap') return tapError ? { data: null, error: { message: tapError } } : { data: { done: 3, of: 9 }, error: null };
    if (fn === 'offer_sign_mark') return args.p_kind === 'own_name' && args.p_geometry.text !== 'Ana Testbuyer' ? { data: null, error: { message: 'Only your own name, exactly as it is on the agreement, can be added' } }
      : { data: { id: 'mk1', held: args.p_kind !== 'own_signature', name: 'Ana Testbuyer', round: args.p_kind === 'own_signature' ? 2 : 1, side: 'purchaser', kind: args.p_kind, page: args.p_page, address: '1 Example Road' }, error: null };
    if (fn === 'offer_sign_ask') return { data: { ok: true, name: 'Ana Testbuyer', address: '1 Example Road', offer_id: OID }, error: null };
    if (fn === 'offer_sign_undo') return args.p_scope === 'turn' || args.p_scope === 'last' ? { data: { scope: args.p_scope, taps: 1, changes: 0, ink_cleared: args.p_clear === true, done: 3, of: 8, secret: 'NOT-PASSED' }, error: null } : { data: null, error: { message: 'Choose undo your last step, or start your turn again' } };
    if (fn === 'offer_sign_request') return args.p_reason_key ? { data: { id: 'rq1', name: 'Vera Vendor', side: 'vendor', round: 2, kind: args.p_kind, reason: args.p_reason_key === 'other' ? args.p_reason : 'Our financial situation has changed', offer_id: OID, property_id: PID, address: '1 Example Road' }, error: null } : { data: null, error: { message: 'Choose a reason' } };
    if (fn === 'offer_sign_finish') return { data: { ok: true, complete: finishComplete, signing_id: SID }, error: null };
    if (fn === 'offer_mail_take') return takeErr ? { data: null, error: { message: takeErr } } : { data: Object.assign({ log_id: 77, id: args.p_draft, kind: 'sign_link', to: ['ana@example.com'], cc: [], subject: 'Your offer to sign: 1 Example Road', body: 'Kia ora Ana,\n\n[the signing link]\n\nTim', attach: null, token: TOK }, mailTake || {}), error: null };
    if (fn === 'offer_mail_done') return doneFail && args.p_ok ? { data: null, error: { message: 'connection lost' } } : { data: null, error: null };
    if (fn === 'offer_round_material') return { data: material(), error: null };
    if (fn === 'offer_file_confirm') return { data: null, error: null };
    if (fn === 'offer_round_lock') return { data: { id: 'r1', number: 1, sha256: args.p_sha256, existing: false }, error: null };
    if (fn === 'offer_sign_issue') return { data: { address: '1 Example Road', links: [{ signer_id: 's1', position: 1, name: 'Ana Testbuyer', email: 'ana@example.com', token: TOK }, { signer_id: 's2', position: 2, name: 'Bo Testbuyer', email: 'bo@example.com', token: TOK.replace('Z', 'Y') }] }, error: null };
    return { data: null, error: { message: 'unknown' } };
  };
  files['properties/' + PID + '/docs/offer-draft-x.pdf'] = draft;
  const h = H.makeHandler({ cors: { 'Access-Control-Allow-Origin': '*' }, appUrl: 'https://packages.dunnerstunner.co.nz/onboarding/', timEmail: 'tim@example.test', mail: MAILC,
    whoIsAgent: async (a) => (a === 'Bearer good' ? agent : null), rpc: db, signedUrl: async (p) => 'https://signed.example/' + encodeURIComponent(p) + '?t=600',
    download: async (p) => files[p] || null, upload: async (p, b) => { if (files[p]) return { ok: false, exists: true }; files[p] = b; return { ok: true }; },
    sendMail: async (kind, m) => { if (failMail && failMail(m)) throw new Error('SMTP down'); mails.push(Object.assign({ kind }, m)); },
    renderRound: (d, m) => S.renderRound(PDFLib, d, m), net: netOf });
  const post = (body, headers) => h(new Request('https://x.supabase.co/functions/v1/offer-sign', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'x-forwarded-for': '6.6.6.6, 203.0.113.7', 'user-agent': 'Phone browser' }, headers || {}), body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const J = async r => ({ status: r.status, j: await r.json() });

  let r = await h(new Request('https://x/f', { method: 'OPTIONS' })); expect(r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === '*', 'preflight');
  r = await h(new Request('https://x/f', { method: 'GET' })); expect(r.status === 405, 'GET refused');
  r = await post('not json'); expect(r.status === 400, 'bad JSON');
  r = await post('x'.repeat(H.MAX_BODY + 1)); expect(r.status === 413, 'too big');
  r = await post({ action: 'drop', token: TOK }); expect(r.status === 400, 'unknown action');
  calls = [];
  for (const t of ['', 'short', TOK + '!', "x' or 1=1 --" + 'a'.repeat(40), 123]) { const x = await J(await post({ action: 'open', token: t })); expect(x.status === 200 && x.j.ok === false && Object.keys(x.j).length === 1, 'not a token: just ok false ' + t); }
  expect(!calls.length, 'nothing asked of the database for a non-token');

  // open: the first name, the address and the state only
  let x = await J(await post({ action: 'open', token: TOK }));
  expect(x.j.ok && x.j.first === 'Ana' && x.j.email_hint === 'a***@example.com' && !('email' in x.j) && !('vendor' in x.j) && !('others' in x.j) && !JSON.stringify(x.j).includes('ana@example.com'), 'open: only what the page may know');
  expect(calls.at(-1)[1].p_net === '203.0.113.7' && calls.at(-1)[1].p_ua === 'Phone browser', 'the real network (the last forwarded address) and the device are passed on');
  x = await J(await post({ action: 'open', token: TOK.replace('Z', 'Q') })); expect(x.j.ok === false && Object.keys(x.j).length === 1, 'an unknown link: nothing at all');
  // the code: emailed to their own address, never returned
  mails = []; x = await J(await post({ action: 'send_code', token: TOK }));
  expect(x.j.ok && !JSON.stringify(x.j).includes('123456') && mails.length === 1 && mails[0].to === 'ana@example.com' && /123456/.test(mails[0].html) && mails[0].kind === 'offer_sign_code', 'the code goes to their own email only, as its own message');
  { const txt = mails[0].html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(mails[0].subject === 'Your signing code' && txt === 'Your signing code is 123456 From Tim McGuire, McGuire Real Estate.', 'the code email holds only the code and who it is from (automatic: the signer is waiting): ' + txt); }
  failMail = () => true; x = await J(await post({ action: 'send_code', token: TOK })); expect(x.j.ok === false && x.j.reason === 'mail', 'email down: said so'); failMail = null;
  x = await J(await post({ action: 'verify', token: TOK, code: '12 34 56' })); expect(x.j.ok && x.j.session === SES, 'the right code (spaces ignored) gives a session');
  x = await J(await post({ action: 'verify', token: TOK, code: '000000' })); expect(x.j.ok === false && x.j.reason === 'wrong' && !x.j.session, 'a wrong code: no session');
  // state: a short-lived link to the draft, never the stored path
  x = await J(await post({ action: 'state', token: TOK, session: SES }));
  expect(x.j.ok && /^https:\/\/signed\.example\//.test(x.j.signing.draft_url) && !('draft_path' in x.j.signing), 'state: a 10 minute link to the draft, not its path');
  consented = false; x = await J(await post({ action: 'state', token: TOK, session: SES })); expect(x.j.ok && x.j.signing.draft_url === null, 'before they agree to sign electronically: no link to the document'); consented = true;
  // refusals
  tapError = "That place isn't yours to sign"; x = await J(await post({ action: 'tap', token: TOK, session: SES, place: 'foot:p1:s2' })); expect(x.status === 400 && x.j.error === "That place isn't yours to sign", 'a refusal written for people is shown');
  tapError = 'permission denied for function offer_sign_tap'; x = await J(await post({ action: 'tap', token: TOK, session: SES, place: 'foot:p1:s1' })); expect(x.status === 400 && /Something went wrong/.test(x.j.error) && !/permission/.test(x.j.error), 'anything internal stays hidden');
  tapError = null; x = await J(await post({ action: 'tap', token: TOK, session: SES, place: 'foot:p1:s1' })); expect(x.j.ok && x.j.done === 3 && x.j.of === 9, 'a tap: the count back');
  // ask Tim for a change
  mails = []; x = await J(await post({ action: 'ask', token: TOK, session: SES, text: 'Can settlement move a week? <script>alert(1)</script>' }));
  expect(x.j.ok && x.j.emailed && mails.length === 1 && mails[0].to === 'tim@example.test' && /&lt;script&gt;/.test(mails[0].html) && !/<script>/.test(mails[0].html), 'Tim is emailed the request, made safe');
  // 029: added text or her own initials, name or signature from her link. Round 1: held for Tim, who alone is emailed (the words made
  // safe); from Round 2 on her own mark tells nobody. A bad shape is refused before the database; its refusal is passed on plainly.
  mails = []; calls = []; x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'insert', page: 1, geometry: { x: 100, y: 200, text: 'Add the <b>curtains</b>', size: 9 } }));
  { const mc = calls.find(c => c[0] === 'offer_sign_mark');
    expect(x.j.ok && x.j.held && x.j.emailed && mc && mc[1].p_session === SES && mc[1].p_kind === 'insert' && mails.length === 1 && mails[0].to === 'tim@example.test' && /&lt;b&gt;curtains/.test(mails[0].html) && /held until you check it/.test(mails[0].html), 'a mark from a link in Round 1: held, Tim alone emailed, the words made safe'); }
  mails = []; x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'own_signature', page: 3, geometry: { x: 100, y: 200, w: 90, h: 24 } }));
  expect(x.j.ok && x.j.held === false && x.j.emailed === null && !mails.length, 'a signer\'s own mark in a later round: not held, nobody emailed');
  x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'own_name', page: 1, geometry: { x: 1, y: 1, w: 90, h: 13, text: 'Someone Else', size: 9 } }));
  expect(x.j.ok === false && /your own name/.test(x.j.error), 'the database\'s refusal is shown plainly');
  mails = []; calls = []; x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'reinstate', page: 1, geometry: { x: 10, y: 10 }, target: SID }));
  { const mc = calls.find(c => c[0] === 'offer_sign_mark'); expect(x.j.ok && x.j.held && mc && mc[1].p_kind === 'reinstate' && mc[1].p_target === SID && mails.length === 1 && /reinstated a line or box/.test(mails[0].html), 'a reinstatement from a link: its target passed on, held, Tim emailed'); }
  calls = []; x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'smudge', page: 1, geometry: { x: 1 } }));
  expect(x.j.ok === false && !calls.some(c => c[0] === 'offer_sign_mark'), 'an unknown kind never reaches the database');
  calls = []; x = await J(await post({ action: 'mark', token: TOK, session: SES, kind: 'reinstate', page: 1, geometry: { x: 1 }, target: 'not-a-uuid' }));
  expect(x.j.ok === false && !calls.some(c => c[0] === 'offer_sign_mark'), 'a bad target never reaches the database');
  // ask Tim to stop or withdraw: recorded, then one urgent email to Tim alone, at once; the reason made safe; nobody else emailed
  mails = []; calls = []; x = await J(await post({ action: 'request', token: TOK, session: SES, kind: 'withdraw', reason_key: 'other', reason: 'We bought elsewhere <b>today</b>' }));
  const rqc = calls.find(c => c[0] === 'offer_sign_request');
  expect(x.j.ok && x.j.emailed && rqc && rqc[1].p_kind === 'withdraw' && rqc[1].p_reason_key === 'other' && rqc[1].p_session === SES, 'the request is recorded with its kind and reason');
  expect(mails.length === 1 && mails[0].to === 'tim@example.test' && mails[0].kind === 'offer_sign_request' && /^URGENT: a vendor asks to withdraw: 1 Example Road$/.test(mails[0].subject), 'one urgent email to Tim: ' + (mails[0] && mails[0].subject));
  expect(mails[0] && /&lt;b&gt;today/.test(mails[0].html) && /properties\/[^/]+\/offers\/[^"<]+/.test(mails[0].html) && /Freeze now or Withdraw now/.test(mails[0].html) && !/\u2014/.test(mails[0].html), 'the email links his offer page, made safe');
  mails = []; x = await J(await post({ action: 'request', token: TOK, session: SES, kind: 'freeze', reason_key: '' }));
  expect(x.j.ok === false && /Choose a reason/.test(x.j.error || '') && mails.length === 0, 'no reason: refused, nothing emailed');
  // Offers fixes 3: going back to the last sealed round, from their own link: recorded, one urgent email to Tim, worded for going back
  mails = []; calls = []; x = await J(await post({ action: 'request', token: TOK, session: SES, kind: 'revert', reason_key: 'material_change' }));
  expect(x.j.ok && (calls.find(c => c[0] === 'offer_sign_request') || [])[1].p_kind === 'revert', 'a request to go back is passed on as revert');
  expect(mails.length === 1 && mails[0].to === 'tim@example.test' && /^URGENT: a vendor asks to go back to Round 1: 1 Example Road$/.test(mails[0].subject), 'one urgent email to Tim, worded for going back: ' + (mails[0] && mails[0].subject));
  expect(mails[0] && /asks to go back to Round 1 as it was signed on Round 2/.test(mails[0].html) && /Nothing has been set aside yet/.test(mails[0].html) && !/Freeze now or Withdraw now/.test(mails[0].html) && !/\u2014/.test(mails[0].html), 'the email says what they ask and what has not happened yet');
  mails = []; calls = []; x = await J(await post({ action: 'request', token: TOK, session: SES, kind: 'rewind', reason_key: 'other', reason: 'x' }));
  expect((calls.find(c => c[0] === 'offer_sign_request') || [])[1].p_kind === '', 'an unknown kind is passed on empty (the database refuses it)');
  // undo: their last step or their whole turn, by their own link and session; nothing emailed; only the counts come back
  mails = []; calls = []; x = await J(await post({ action: 'undo', token: TOK, session: SES, scope: 'last' }));
  const uc = calls.find(c => c[0] === 'offer_sign_undo');
  expect(x.j.ok && uc && uc[1].p_token === TOK && uc[1].p_session === SES && uc[1].p_scope === 'last' && uc[1].p_clear === false && x.j.done === 3 && x.j.of === 8 && !('secret' in x.j) && mails.length === 0, 'undo the last step: passed on with their session, the counts back, nobody emailed');
  calls = []; x = await J(await post({ action: 'undo', token: TOK, session: SES, scope: 'turn', clear: true }));
  expect(x.j.ok && x.j.ink_cleared === true && (calls.find(c => c[0] === 'offer_sign_undo') || [])[1].p_clear === true, 'start the turn again, clearing the drawing');
  calls = []; x = await J(await post({ action: 'undo', token: TOK, session: SES, scope: 'everything' }));
  expect(x.status === 400 && x.j.ok === false && !calls.some(c => c[0] === 'offer_sign_undo'), 'an unknown undo is refused before the database');
  x = await J(await post({ action: 'undo', token: 'short', session: SES, scope: 'last' })); expect(x.j.ok === false, 'undo needs their link');
  // finish: not the last purchaser, nothing locked
  calls = []; x = await J(await post({ action: 'finish', token: TOK, session: SES })); expect(x.j.ok && x.j.complete === false && !calls.some(c => c[0] === 'offer_round_lock'), 'not the last: nothing locked');
  // the last purchaser: Round 1 made, stored, fingerprinted from the stored file and locked
  finishComplete = true; calls = []; mails = []; x = await J(await post({ action: 'finish', token: TOK, session: SES }));
  const lock = calls.find(c => c[0] === 'offer_round_lock'), conf = calls.find(c => c[0] === 'offer_file_confirm');
  const stored = Object.keys(files).find(k => /offer-round-/.test(k));
  out.round = stored;
  expect(x.j.ok && x.j.complete && x.j.locked && x.j.round === 1, 'the last purchaser finishing locks Round 1');
  expect(stored && stored === 'properties/' + PID + '/docs/offer-round-' + OID + '-1-' + sha(files[stored]).slice(0, 12) + '.pdf', 'stored at its own place, named by its fingerprint');
  expect(conf && conf[1].p_sha256 === sha(files[stored]) && lock[1].p_sha256 === sha(files[stored]) && lock[1].p_size === files[stored].length, 'the fingerprint is taken from the stored file');
  expect(lock && !JSON.stringify(lock[1].p_execution).includes('@') && lock[1].p_execution.signers[0].name === 'Ana Testbuyer' && lock[1].p_execution.signers[0].method === 'link', 'the execution record names the signer and how, with no email address');
  const rd = await PDFLib.PDFDocument.load(files[stored]); expect(rd.getPageCount() === 3, 'the round is the draft plus the execution record page');
  expect(mails.some(m => m.to === 'tim@example.test' && /Round 1/.test(m.subject)), 'Tim is told Round 1 is locked');
  // a draft that doesn't match its fingerprint is never locked
  draftSha = 'e'.repeat(64); const before = Object.keys(files).length; calls = [];
  x = await J(await post({ action: 'finish', token: TOK, session: SES })); expect(x.j.complete && x.j.locked === false && !calls.some(c => c[0] === 'offer_round_lock') && Object.keys(files).length === before, 'a draft that doesn\'t match its fingerprint: nothing stored or locked');
  draftSha = sha(draft);

  // finding 6: a different file already where Round 1 goes: never locked over it
  Object.keys(files).filter(k => /offer-round-/.test(k)).forEach(k => delete files[k]);
  calls = [];
  const h2 = H.makeHandler({ cors: {}, appUrl: 'x', timEmail: 't', whoIsAgent: async () => agent, rpc: db, signedUrl: async () => null, download: async (p_) => /offer-round-/.test(p_) ? new Uint8Array([1, 2, 3]) : files[p_] || null,
    upload: async () => ({ ok: false, exists: true }), sendMail: async () => { }, renderRound: (d_, m) => S.renderRound(PDFLib, d_, m), net: netOf });
  x = await J(await h2(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify({ action: 'lock', signing_id: SID }) })));
  expect(x.status === 400 && /different file is already stored/.test(x.j.error) && !calls.some(c => c[0] === 'offer_round_lock' || c[0] === 'offer_file_confirm'), 'a different file already at the round\'s place: not confirmed, not locked');
  // Tim's actions
  // Tim's actions: an email goes only when Tim presses Send on its draft (send_mail), exactly as the draft stands
  const DID = '6c6c6c6c-0000-4000-8000-000000000001';
  calls = []; x = await J(await post({ action: 'send_mail', draft_id: DID })); expect(x.status === 403 && !calls.length, 'send without Tim\'s sign-in: refused before anything runs');
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer vendor' })); expect(x.status === 403 && !calls.length, 'a signed-in vendor: refused');
  x = await J(await post({ action: 'send', signing_id: SID }, { Authorization: 'Bearer good' })); expect(x.status === 400 && !calls.some(c => c[0] === 'offer_sign_issue'), 'the old "send every link now" is gone');
  x = await J(await post({ action: 'lock', signing_id: 'nope' }, { Authorization: 'Bearer good' })); expect(x.status === 400, 'a bad signing id');
  mails = []; calls = [];
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' }));
  const tk_ = calls.find(c => c[0] === 'offer_mail_take'), dn_ = calls.find(c => c[0] === 'offer_mail_done');
  expect(tk_ && tk_[1].p_actor === agent && tk_[1].p_draft === DID, 'the draft is taken as Tim');
  expect(mails.length === 1 && mails[0].to.join() === 'ana@example.com' && mails[0].html.includes('?sign=' + TOK) && mails[0].kind === 'offer_mail_sign_link' && mails[0].subject === 'Your offer to sign: 1 Example Road', 'that one signer is emailed their own link, with the draft\'s subject');
  expect(dn_ && dn_[1].p_ok === true && dn_[1].p_log === 77 && x.j.ok && !JSON.stringify(x.j).includes(TOK), 'the send is recorded against the pending log row take wrote (the log holds what went); no token reaches his page');
  // the mail server took it, but recording that failed: never "nothing has gone"
  mails = []; calls = []; doneFail = true;
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' })); doneFail = false;
  expect(x.status === 200 && x.j.ok === false && x.j.maybe_sent === true && x.j.error === 'This may have gone. Check before sending again.' && mails.length === 1, 'sent but not recorded: no crash, and the page says it may have gone');
  // a second Send while the first is still going (another tab, Send all reviewed): the database refuses the take, nothing is sent
  mails = []; calls = []; takeErr = 'This email is already being sent, or may have gone. Check before sending again';
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' })); takeErr = null;
  expect(x.status === 400 && /already being sent/.test(x.j.error) && !mails.length && !calls.some(c => c[0] === 'offer_mail_done'), 'a second send is refused before anything goes');
  mails = []; calls = []; failMail = m => true;
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' })); failMail = null;
  expect(!x.j.ok && /Nothing has gone/.test(x.j.error) && calls.some(c => c[0] === 'offer_mail_done' && c[1].p_ok === false && c[1].p_log === 77), 'a failed send at the mail server: Tim is told nothing has gone, and the log row is marked failed');
  // the agreed copy: attached only if the stored file matches its fingerprint
  mails = []; calls = []; mailTake = { kind: 'agreed_purchasers', to: ['ana@example.com', 'bo@example.com'], cc: ['pat@law.example'], subject: 'Congratulations! 1 Example Road', body: 'Dear Ana and Bo,\n\n**Roadmap**', attach: { path: 'properties/' + PID + '/docs/offer-draft-x.pdf', sha256: draftSha, name: 'Agreement 1 Example Road.pdf' }, token: null };
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' }));
  expect(x.j.ok && mails.length === 1 && mails[0].cc.join() === 'pat@law.example' && mails[0].attachments && mails[0].attachments[0].filename === 'Agreement 1 Example Road.pdf' && mails[0].html.includes('<strong>Roadmap</strong>'), 'the agreed copy goes to the purchasers, cc their lawyer, with the file attached');
  { const dn2 = calls.find(c => c[0] === 'offer_mail_done'); expect(dn2 && dn2[1].p_ok === true, 'the agreed copy\'s send is recorded (its fingerprint is in the pending log row take wrote)'); }
  mails = []; calls = []; mailTake.attach.sha256 = 'f'.repeat(64);
  x = await J(await post({ action: 'send_mail', draft_id: DID }, { Authorization: 'Bearer good' }));
  expect(!x.j.ok && !mails.length && calls.some(c => c[0] === 'offer_mail_done' && c[1].p_ok === false), 'an agreed copy that doesn\'t match its fingerprint: nothing sent');
  mailTake = null;
  Object.keys(files).filter(k => /offer-round-/.test(k)).forEach(k => delete files[k]);
  x = await J(await post({ action: 'lock', signing_id: SID }, { Authorization: 'Bearer good' })); expect(x.j.ok && x.j.round.number === 1, 'Tim can lock Round 1 from his screen');

  // ── CORS: the onboarding app and Tim's portal only (portal P1 lives at portal.dunnerstunner.co.nz and calls send, lock and agree) ──
  { const { corsFor, APP_ORIGINS } = await import(path.join(__dirname, '..', '..', 'fn', 'cors_app.ts'));
    const hc = H.makeHandler({ cors: corsFor, appUrl: 'https://packages.dunnerstunner.co.nz/onboarding/', timEmail: 't', whoIsAgent: async () => null, rpc: db, signedUrl: async () => null, download: async () => null, upload: async () => ({ ok: true }), sendMail: async () => { }, renderRound: async () => ({ bytes: new Uint8Array() }), renderWorking: async () => ({ bytes: new Uint8Array() }), net: () => 'n' });
    const at = async (origin, method) => { const r = await hc(new Request('https://x/f', { method: method || 'POST', headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, body: method === 'OPTIONS' ? undefined : JSON.stringify({ action: 'open', token: TOK }) })); return r.headers.get('Access-Control-Allow-Origin'); };
    expect(APP_ORIGINS.join() === 'https://packages.dunnerstunner.co.nz,https://portal.dunnerstunner.co.nz', 'two sites only: the onboarding app and the portal');
    expect(await at('https://portal.dunnerstunner.co.nz') === 'https://portal.dunnerstunner.co.nz' && await at('https://portal.dunnerstunner.co.nz', 'OPTIONS') === 'https://portal.dunnerstunner.co.nz', 'the portal gets its own site back, preflight too');
    expect(await at('https://packages.dunnerstunner.co.nz') === 'https://packages.dunnerstunner.co.nz', 'the onboarding app gets its own site back');
    expect(await at('https://evil.example') === 'https://packages.dunnerstunner.co.nz' && await at(null) === 'https://packages.dunnerstunner.co.nz', 'any other site gets the onboarding site, so its browser refuses');
    const PH = await import(path.join(__dirname, '..', '..', 'fn', 'offer_public_handler.ts'));
    const hp = PH.makeHandler({ cors: corsFor, rpc: async () => ({ data: null, error: { message: 'x' } }), draft: async () => ({ status: 200, body: {} }), notifyTim: async () => { } });
    const rp = await hp(new Request('https://x/f', { method: 'OPTIONS', headers: { Origin: 'https://portal.dunnerstunner.co.nz' } }));
    expect(rp.headers.get('Access-Control-Allow-Origin') === 'https://portal.dunnerstunner.co.nz' && rp.headers.get('Vary') === 'Origin', 'offer-public answers the portal the same way');
    const ent = require('fs').readFileSync(path.join(__dirname, '..', '..', 'fn', 'offer_public.ts'), 'utf8'); expect(/cors: corsFor/.test(ent), 'offer-public uses it'); }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });
