// Tests of the notify function's appraisal emails (fn/appraisal_notify_handler.ts, LW3 phase E, migration 037), with fakes for the
// database and the mail server: nothing is sent anywhere, and every address is invented. Covers: ap_send is Tim's only; it sends
// exactly the reviewed email to exactly its people with [the appraisal link] as their button to the onboarding app (?appraisal=<the
// appraisal>), a copy to Tim; it is taken once (a second press is refused, nothing sent twice); a mail-server failure records
// "failed" with the reason and says nothing went; a send that can't be recorded says it may have gone. ap_event: only the vendor's
// own event (asked with their token), Tim emailed once with who and what, a second call tells nobody; bad requests refused.
const path = require('path');
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  require(path.join(__dirname, '..', 'src', 'mail-core.js'));
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'appraisal_notify_handler.ts'));
  const MID = 'aaaaaaaa-1111-4111-8111-000000000001', SID = 'bbbbbbbb-2222-4222-8222-000000000002', CHAIN = 'cccccccc-3333-4333-8333-000000000003';
  const sent = [], mails = { [MID]: { id: MID, snapshot_id: SID, to_addr: ['rb-owner@example.com', 'rb-pl@example.com'], subject: 'Your appraisal: RB 9 Send Street', body: 'Hello Robin,\n\nIt is ready.\n\n[the appraisal link]\n\nTim', status: 'queued' } };
  const events = { 7: { id: 7, snapshot_id: SID, chain_id: CHAIN, kind: 'proceeded', actor: 'rb-owner@example.com', detail: {}, notified_at: null }, 8: { id: 8, snapshot_id: SID, chain_id: CHAIN, kind: 'plan_built', actor: 'rb-owner@example.com', detail: { total: 2450.5 }, notified_at: null } };
  let failSend = false, failFinish = false;
  const deps = {
    json: (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { 'Content-Type': 'application/json' } }),
    appUrl: 'https://packages.dunnerstunner.co.nz/onboarding/', portalUrl: 'https://portal.dunnerstunner.co.nz/', timEmail: 'tim-test@example.com', MAIL: globalThis.MAIL,
    isAgent: async a => a === 'Bearer tim',
    eventMine: async (a, id) => a === 'Bearer owner' && !!events[id] && !events[id].notified_at && events[id].actor === 'rb-owner@example.com',
    takeMail: async id => { const m = mails[id]; if (!m || !['queued', 'failed'].includes(m.status)) return null; m.status = 'sending'; return Object.assign({}, m); },
    finishMail: async (id, ok, error) => { if (failFinish) return false; const m = mails[id]; if (!m || m.status !== 'sending') return false; m.status = ok ? 'sent' : 'failed'; m.error = error; return true; },
    snapshot: async id => id === SID ? { id: SID, appraisal_id: CHAIN, chain_id: CHAIN, version: 1, recipients: [{ email: 'rb-owner@example.com', name: 'Robin' }], content: { address: 'RB 9 Send Street' } } : null,
    takeEvent: async id => { const e = events[id]; if (!e || e.notified_at) return null; e.notified_at = 'now'; return Object.assign({}, e); },
    send: async (kind, msg) => { if (failSend) throw new Error('smtp down'); sent.push(Object.assign({ kind }, msg)); },
  };
  const h = H.makeAppraisalNotify(deps);
  const call = (body, auth) => h(new Request('https://x/notify', { method: 'POST', headers: auth ? { Authorization: auth } : {} }), body);

  let r = await call({ type: 'ap_send', mail_id: MID }, 'Bearer owner'); expect(r.status === 403 && !sent.length && mails[MID].status === 'queued', 'a vendor can\'t send: 403, nothing taken');
  r = await call({ type: 'ap_send', mail_id: 'nope' }, 'Bearer tim'); expect(r.status === 400, 'bad id: 400');
  failSend = true; r = await call({ type: 'ap_send', mail_id: MID }, 'Bearer tim'); let j = await r.json(); failSend = false;
  expect(j.ok === false && /Nothing went/.test(j.error) && mails[MID].status === 'failed' && /smtp down/.test(mails[MID].error) && !sent.length, 'a mail-server failure: recorded as failed, "Nothing went"');
  r = await call({ type: 'ap_send', mail_id: MID }, 'Bearer tim'); j = await r.json();
  expect(j.ok === true && mails[MID].status === 'sent' && sent.length === 1, 'sent after a failure, and recorded');
  const m = sent[0]; out.sent = { to: m.to, bcc: m.bcc, subject: m.subject };
  expect(JSON.stringify(m.to) === JSON.stringify(['rb-owner@example.com', 'rb-pl@example.com']) && m.bcc === 'tim-test@example.com' && m.subject === 'Your appraisal: RB 9 Send Street' && m.kind === 'appraisal_sent', 'exactly its people, its subject, a copy to Tim');
  expect(m.html.includes('href="https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' + CHAIN + '"') && m.html.includes('Open my appraisal') && !m.html.includes('[the appraisal link]') && m.html.includes('It is ready.'), 'the link to their appraisal, as a button, in Tim\'s words');
  r = await call({ type: 'ap_send', mail_id: MID }, 'Bearer tim'); j = await r.json(); expect(r.status === 409 && sent.length === 1, 'a second press: refused, nothing sent twice');
  // it went, but couldn't be recorded
  mails[MID].status = 'queued'; failFinish = true; r = await call({ type: 'ap_send', mail_id: MID }, 'Bearer tim'); j = await r.json(); failFinish = false;
  expect(j.ok === false && j.maybe_sent === true && /Check your sent mail/.test(j.error), 'unrecorded send: "may have gone"');

  // a vendor's own event, told to Tim once
  const before = sent.length;
  r = await call({ type: 'ap_event', event_id: 7 }, 'Bearer someone-else'); expect(r.status === 403 && sent.length === before && !events[7].notified_at, 'someone else\'s event: 403, Tim not told');
  r = await call({ type: 'ap_event', event_id: 'x' }, 'Bearer owner'); expect(r.status === 400, 'bad event id: 400');
  r = await call({ type: 'ap_event', event_id: 7 }, 'Bearer owner'); j = await r.json();
  const t = sent[sent.length - 1]; out.notice = { to: t.to, subject: t.subject };
  expect(j.ok && t.to === 'tim-test@example.com' && t.subject === 'Robin would like to proceed: RB 9 Send Street' && /portal\.dunnerstunner\.co\.nz\/appraisals\//.test(t.html) && !t.bcc, 'Tim alone is told, by name, with the portal link');
  r = await call({ type: 'ap_event', event_id: 7 }, 'Bearer owner'); expect(r.status === 403 && sent.length === before + 1, 'told once: a second call tells nobody');
  failSend = true; r = await call({ type: 'ap_event', event_id: 8 }, 'Bearer owner'); j = await r.json(); failSend = false;
  expect(j.ok === false && /Needs you/.test(j.note) && events[8].notified_at, 'a failed notice is not retried by the vendor; it waits on Tim\'s Needs you list');
  r = await call({ type: 'ap_other' }, 'Bearer tim'); expect(r.status === 400, 'unknown type: 400');
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));
