// Tests of the repo-link edge function's request handling (fn/repo_link_handler.ts), with fakes for the database question
// (repo_vendor_can_read, asked with the caller's token) and for signing. Covers: no token (401, nothing asked), a token the database
// doesn't accept (401), a vendor not allowed (403, nothing signed), allowed (a link), the lifetime fixed at 600 seconds whatever the
// request asks, bad paths (400, nothing asked), other methods (405), and a file that can't be signed (404).
const path = require('path');
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'repo_link_handler.ts'));
  const PID = '11111111-2222-3333-4444-555555555555', FILE = `properties/${PID}/photos/aaaaaaaa-0000-4000-8000-000000000001.jpg`, OTHER = `properties/${PID}/docs/aaaaaaaa-0000-4000-8000-000000000002-appraisal.pdf`;
  const asked = [], signed = [];
  const h = H.makeHandler({
    cors: { 'Access-Control-Allow-Origin': '*' },
    canRead: async (auth, p) => { asked.push([auth, p]); if (auth === 'Bearer forged') return null; return auth === 'Bearer vendor' && p === FILE; },
    sign: async (p, s) => { signed.push([p, s]); return p === FILE ? `https://x.supabase.co/storage/v1/object/sign/property-files/${p}?token=t&s=${s}` : null; },
  });
  const post = (body, auth) => h(new Request('https://x.supabase.co/functions/v1/repo-link', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}), body: JSON.stringify(body) }));

  let r = await post({ path: FILE }); expect(r.status === 401 && (await r.json()).error === 'Sign in first', 'no token: 401');
  expect(!asked.length && !signed.length, 'no token: nothing asked, nothing signed');
  r = await post({ path: FILE }, 'Bearer forged'); expect(r.status === 401, 'a token the database does not accept: 401');
  r = await post({ path: OTHER }, 'Bearer vendor'); expect(r.status === 403 && (await r.json()).error === 'Not allowed', 'not shared with them: 403');
  r = await post({ path: FILE }, 'Bearer someone-else'); expect(r.status === 403, 'another signed-in person: 403');
  expect(!signed.length, 'nothing signed for a refusal');
  r = await post({ path: FILE, expires_in: 86400, seconds: 999999 }, 'Bearer vendor'); const j = await r.json(); out.allowed = j;
  expect(r.status === 200 && /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/property-files\//.test(j.url) && j.expires_in === 600, 'allowed: a signed link');
  expect(signed.length === 1 && signed[0][1] === 600 && H.LINK_SECONDS === 600, 'the lifetime is fixed at 600 seconds whatever is asked');
  expect(asked.some(([a, p]) => a === 'Bearer vendor' && p === FILE), 'asked with the caller\'s own token');
  const n = asked.length;
  for (const bad of ['', '../x', `properties/${PID}/docs/../../agreements/x.pdf`, 'agreements/a/signatures/x.png', `properties/not-a-uuid/photos/x.jpg`, `properties/${PID}/generated/x.pdf`]) {
    r = await post({ path: bad }, 'Bearer vendor'); expect(r.status === 400, 'bad path refused: ' + bad);
  }
  r = await h(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer vendor' }, body: 'not json' })); expect(r.status === 400, 'not JSON: 400');
  expect(asked.length === n, 'bad paths never reach the database');
  r = await h(new Request('https://x/f', { method: 'GET', headers: { Authorization: 'Bearer vendor' } })); expect(r.status === 405, 'GET: 405');
  r = await h(new Request('https://x/f', { method: 'OPTIONS' })); expect(r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === '*', 'CORS preflight');
  // allowed but the file can't be signed (gone from storage)
  const h2 = H.makeHandler({ cors: {}, canRead: async () => true, sign: async () => null });
  r = await h2(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer vendor' }, body: JSON.stringify({ path: FILE }) })); expect(r.status === 404, 'no file: 404');

  // ── LW3 phase E (037): a file in an appraisal sent to the vendor, asked as appraisal_vendor_can_read with their own token ──
  const SNAP = 'aaaaaaaa-1111-4111-8111-000000000001', AID = 'bbbbbbbb-2222-4222-8222-000000000002', CID = 'cccccccc-3333-4333-8333-000000000003';
  const COMP = `appraisals/${AID}/comps/${CID}/rb-a.jpg`, CLIP = `appraisals/${AID}/intro/rb-hello.mp4`, HOME = FILE, NOTLISTED = `appraisals/${AID}/comps/${CID}/rb-hidden.jpg`;
  const SITEPIC = `appraisals/${AID}/site/profile-rb-me.jpg`;   // Tim's picture as it was at Send (037 on the look)
  const listed = new Set(['appraisal-media|' + COMP, 'appraisal-video|' + CLIP, 'property-files|' + HOME, 'appraisal-media|' + SITEPIC]);
  const aAsked = [], aSigned = [];
  const h3 = H.makeHandler({ cors: {}, canRead: async () => { throw new Error('the property file question must not be asked for an appraisal file'); }, sign: async () => null,
    canReadAppraisal: async (auth, s, b, p) => { aAsked.push([auth, s, b, p]); if (auth === 'Bearer forged') return null; return auth === 'Bearer vendor' && s === SNAP && listed.has(b + '|' + p); },
    signIn: async (b, p, sec) => { aSigned.push([b, p, sec]); return `https://x.supabase.co/storage/v1/object/sign/${b}/${p}?token=t&s=${sec}`; } });
  const apost = (body, auth) => h3(new Request('https://x/f', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}), body: JSON.stringify(body) }));
  r = await apost({ snapshot: SNAP, bucket: 'appraisal-media', path: COMP }); expect(r.status === 401 && !aAsked.length, 'appraisal file, no token: 401, nothing asked');
  for (const [b, p] of [['appraisal-media', COMP], ['appraisal-video', CLIP], ['property-files', HOME], ['appraisal-media', SITEPIC]]) {
    r = await apost({ snapshot: SNAP, bucket: b, path: p, expires_in: 99999 }, 'Bearer vendor'); const jj = await r.json();
    expect(r.status === 200 && jj.expires_in === 600 && jj.url.includes('/sign/' + b + '/'), 'a listed ' + b + ' file: a 600-second link in its own bucket');
  }
  expect(aSigned.length === 4 && aSigned.every(x => x[2] === 600), 'every appraisal link lasts 600 seconds');
  expect(aAsked.every(x => x[0] === 'Bearer vendor' || x[0] === 'Bearer someone-else'), 'asked with the caller\'s own token');
  r = await apost({ snapshot: SNAP, bucket: 'appraisal-media', path: NOTLISTED }, 'Bearer vendor'); expect(r.status === 403, 'a photo outside the copy: 403');
  r = await apost({ snapshot: SNAP, bucket: 'appraisal-media', path: COMP }, 'Bearer someone-else'); expect(r.status === 403, 'another signed-in person: 403');
  r = await apost({ snapshot: SNAP, bucket: 'appraisal-media', path: COMP }, 'Bearer forged'); expect(r.status === 401, 'a token the database does not accept: 401');
  expect(aSigned.length === 4, 'nothing signed for a refusal');
  const na = aAsked.length;
  for (const [s, b, p] of [['not-a-uuid', 'appraisal-media', COMP], [SNAP, 'private', COMP], [SNAP, 'appraisal-video', COMP], [SNAP, 'appraisal-media', CLIP.replace('.mp4', '/../x.jpg')],
      [SNAP, 'appraisal-media', `appraisals/${AID}/elsewhere/x.jpg`], [SNAP, 'appraisal-video', `appraisals/${AID}/site/profile-rb-me.jpg`], [SNAP, 'appraisal-media', `appraisals/${AID}/site/../x.jpg`], [SNAP, 'property-files', `properties/${AID}/generated/x.pdf`], [SNAP, '__proto__', COMP], [SNAP, 'appraisal-media', '']]) {
    r = await apost({ snapshot: s, bucket: b, path: p }, 'Bearer vendor'); expect(r.status === 400, 'bad appraisal request refused: ' + [s, b, p].join(' '));
  }
  expect(aAsked.length === na, 'bad appraisal requests never reach the database');
  // a deployment without the appraisal question refuses appraisal requests rather than falling back
  r = await h(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer vendor' }, body: JSON.stringify({ snapshot: SNAP, bucket: 'property-files', path: FILE }) }));
  expect(r.status === 400, 'no appraisal question wired: 400');
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));
