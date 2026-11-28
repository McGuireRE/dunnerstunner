// 038: the email Tim gets for a message sent through "Send a message" (fn/contact_mail.ts), run as it is, with invented data only.
// Covers: it goes to the address notify passes (Tim's) and never to the sender's; the sender's words, name and phone are escaped; a
// reply-to only when the sender's email looks like one; the link opens the message on Needs you in the portal.
const path = require('path');
(async () => {
  const errs = [], out = {}, expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const M = await import(path.join(__dirname, '..', '..', 'fn', 'contact_mail.ts'));
  const row = { id: '5b0f7d1e-2c3a-4d5e-8f90-123456789abc', name: 'Robin <b>Tester</b>\nBcc: x@evil.example', from_email: 'robin@example.com', phone: '021 <i>0</i>', preferred: 'text', message: 'Hi <script>alert(1)</script> & thanks', page: '/portal/appraisals/x' };
  const m = M.contactMail(row, 'tim@example.test', 'https://packages.dunnerstunner.co.nz/onboarding/'); out.m = m;
  expect(m.to === 'tim@example.test', 'it goes to Tim only: ' + m.to);
  expect(!/<script>|<b>Tester|<i>0/.test(m.html) && /&lt;script&gt;/.test(m.html) && /&amp; thanks/.test(m.html), 'the sender\'s words are escaped');
  expect(!/[\r\n]/.test(m.subject) && /^Message from Robin/.test(m.subject), 'the subject is one line: ' + JSON.stringify(m.subject));
  expect(m.replyTo === 'robin@example.com' && M.contactMail(Object.assign({}, row, { from_email: 'nope' }), 't@x.nz', 'https://a.example/').replyTo === undefined, 'reply-to only for a real-looking email');
  expect(/href="https:\/\/packages\.dunnerstunner\.co\.nz\/portal\/messages\/5b0f7d1e-2c3a-4d5e-8f90-123456789abc"/.test(m.html), 'the link opens the message on Needs you');
  expect(/would like a text back/.test(m.html), 'how they would like a reply');
  // who it goes to: Tim's settings email when set and real, else notify's TIM_EMAIL; never the sender's
  expect(M.timTo({ tim_email: 'tim.settings@example.test' }, 'fallback@example.test') === 'tim.settings@example.test', 'settings email used when set');
  expect(M.timTo({ tim_email: '' }, 'fallback@example.test') === 'fallback@example.test' && M.timTo({}, 'fallback@example.test') === 'fallback@example.test' && M.timTo(null, 'fallback@example.test') === 'fallback@example.test', 'falls back to TIM_EMAIL when none set');
  expect(M.timTo({ tim_email: 'a@b.nz, x@evil.example' }, 'fallback@example.test') === 'fallback@example.test' && M.timTo({ tim_email: 'nope' }, 'fallback@example.test') === 'fallback@example.test', 'a bad or doubled address falls back');
  expect(M.timTo(Object.assign({}, row, { tim_email: null }), 'fallback@example.test') === 'fallback@example.test', 'never the sender\'s address');
  const src = require('fs').readFileSync(path.join(__dirname, '..', '..', 'fn', 'notify.ts'), 'utf8');
  expect(/contactMail\(row, timTo\(row, TIM_EMAIL\), APP_URL\)/.test(src), 'notify sends to timTo(row, TIM_EMAIL)');
  console.log(JSON.stringify({ out, errs }, null, 1));
})();
