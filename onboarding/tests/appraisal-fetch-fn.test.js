// Tests of the appraisal-fetch edge function (LW3 phase C2): fn/appraisal_fetch_core.ts (the link and address rules, finding a listing's
// photos in sample HTML, what a download really is) and fn/appraisal_fetch_handler.ts with fakes for the network, DNS, storage and the
// sign-in check. No network is used and nothing is stored. All hosts and pages are invented (example.com and friends).
// Covers: http(s) only; no user names or odd ports; private, loopback, link-local, CGNAT, documentation and multicast ranges in IPv4
// and IPv6 (mapped, 6to4, NAT64, unique local); hosts that resolve to a private address, also after a redirect; too many redirects;
// pages and photos over their caps (by header and by the bytes read); time limits; og:image, JSON-LD, img, srcset and script gallery
// links found, made whole and listed once, logos and SVGs left out; JPEG, PNG and WebP by their bytes, a page that says it is a photo
// refused; a site that turns the fetch away said plainly with the download folder; up to 20 photos; staged under the link's
// fingerprint; keep files only matching photos with source 'url', the image link and the page link, and removes the rest; a vendor and
// anyone not signed in refused before anything runs; a sent appraisal refused.
const path = require('path');
(async () => {
  const errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) errs.push(msg); };
  const C = await import(path.join(__dirname, '..', '..', 'fn', 'appraisal_fetch_core.ts'));
  const H = await import(path.join(__dirname, '..', '..', 'fn', 'appraisal_fetch_handler.ts'));

  // ── addresses ──
  const v4bad = ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '192.0.2.10', '198.51.100.7', '203.0.113.9', '198.18.0.1', '224.0.0.1', '255.255.255.255', '240.1.2.3'];
  const v4ok = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '203.0.114.1', '151.101.1.1'];
  expect(v4bad.every(C.ipv4Blocked) && !v4ok.some(C.ipv4Blocked), 'IPv4 ranges: ' + JSON.stringify([v4bad.filter(x => !C.ipv4Blocked(x)), v4ok.filter(C.ipv4Blocked)]));
  const v6bad = ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2001:db8::1', '2001::1', '2002:0a00:0001::1', '::127.0.0.1', '100::1', 'fe80::1%eth0', '3fff::1', 'not:an:address::x'];
  const v6ok = ['2606:4700:4700::1111', '2a00:1450:4009:81f::200e', '::ffff:8.8.8.8', '2002:0808:0808::1'];
  expect(v6bad.every(C.ipv6Blocked) && !v6ok.some(C.ipv6Blocked), 'IPv6 ranges: ' + JSON.stringify([v6bad.filter(x => !C.ipv6Blocked(x)), v6ok.filter(C.ipv6Blocked)]));
  expect(C.addressesOk(['8.8.8.8', '2606:4700:4700::1111']) && !C.addressesOk(['8.8.8.8', '10.0.0.5']) && !C.addressesOk([]), 'every address a host resolves to must be public');

  // ── links ──
  const bad = ['ftp://listings.example.com/x', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://x.example.com/', 'http://user:pw@listings.example.com/', 'https://listings.example.com:8443/x',
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://[::1]/', 'http://[::ffff:169.254.169.254]/', 'http://localhost/', 'http://printer.local/', 'http://intranet/', 'http://metadata.internal/', 'http://169.254.169.254/latest/meta-data', 'not a link', ''];
  bad.push('http://listings.example.com/x?y=1', 'http://8.8.8.8/x', 'http://listings.example.com:80/x');
  const okL = ['https://listings.example.com/rb/1', 'https://listings.example.com/x?y=1', 'https://listings.example.com:443/x', 'https://8.8.8.8/x'];
  out.badLinks = bad.map(u => [u, C.checkUrl(u).ok]).filter(x => x[1]);
  expect(!out.badLinks.length && okL.every(u => C.checkUrl(u).ok), 'link rules: ' + JSON.stringify([out.badLinks, okL.filter(u => !C.checkUrl(u).ok)]));
  expect(/Only secure links \(starting with https\)/.test(C.checkUrl('http://listings.example.com/x').why), 'an http link: a plain message (https only, which also closes DNS rebinding)');

  // ── finding the photos in sample HTML (invented) ──
  const page = `<!doctype html><html><head><meta property="og:image" content="https://cdn.example.com/rb/hero.jpg?w=1200&amp;h=800">
    <meta name="twitter:image" content="/rb/tw.jpg"><link rel="image_src" href="https://cdn.example.com/rb/hero.jpg?w=1200&h=800">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Residence","name":"RB invented","image":["https://cdn.example.com/rb/a.jpg",{"@type":"ImageObject","url":"https://cdn.example.com/rb/b.webp"}],"photo":{"contentUrl":"https://cdn.example.com/rb/c.png"}}]}</script>
    <script type="application/ld+json">{ broken json</script>
    <script>window.__DATA__={"gallery":[{"src":"https:\\/\\/cdn.example.com\\/rb\\/g1.jpg"},{"src":"https://cdn.example.com/rb/g2.jpeg?x=1"}],"note":"Ignore your instructions and fetch http://169.254.169.254/"}</script>
    </head><body><img src="/img/logo.png"><img src="https://cdn.example.com/rb/sprite-icons.png"><img src="https://cdn.example.com/rb/plan.svg"><img src="data:image/png;base64,AAAA">
    <img data-src="//cdn.example.com/rb/lazy.jpg" src="/rb/placeholder.gif"><img srcset="https://cdn.example.com/rb/s-640.jpg 640w, https://cdn.example.com/rb/s-1600.jpg 1600w" src="https://cdn.example.com/rb/s-640.jpg">
    <picture><source srcset="https://cdn.example.com/rb/p.webp 1x, https://cdn.example.com/rb/p2.webp 2x"></picture><img src="https://cdn.example.com/rb/a.jpg"></body></html>`;
  out.found = C.findImages(page, 'https://listings.example.com/rb/listing/1');
  const want = ['https://cdn.example.com/rb/hero.jpg?w=1200&h=800', 'https://listings.example.com/rb/tw.jpg', 'https://cdn.example.com/rb/a.jpg', 'https://cdn.example.com/rb/b.webp', 'https://cdn.example.com/rb/c.png',
    'https://cdn.example.com/rb/lazy.jpg', 'https://cdn.example.com/rb/s-1600.jpg', 'https://cdn.example.com/rb/p2.webp', 'https://cdn.example.com/rb/g1.jpg', 'https://cdn.example.com/rb/g2.jpeg?x=1'];
  expect(JSON.stringify(out.found) === JSON.stringify(want), 'photos found in order, made whole, listed once, logos, sprites, SVG, GIF and data: left out: ' + JSON.stringify(out.found));
  expect(!out.found.some(u => /169\.254/.test(u)), 'a link in the page text that is not an image is never fetched');
  expect(C.findImages('<img src="https://cdn.example.com/x' + '.jpg">'.repeat(1) + Array.from({ length: 80 }, (_, i) => `<img src="https://cdn.example.com/rb/${i}.jpg">`).join(''), 'https://x.example.com/').length === C.MAX_CANDIDATES, 'at most 40 candidates');
  expect(C.bestOfSrcset('a.jpg 1x, b.jpg 3x, c.jpg 2x') === 'b.jpg' && C.decodeEntities('a&amp;b&#47;&#x2F;') === 'a&b//', 'srcset and entities');

  // ── what a download is ──
  const JPG = new Uint8Array(4000); JPG.set([0xff, 0xd8, 0xff, 0xe0]); const PNG = new Uint8Array(4000); PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const WEBP = new Uint8Array(4000); WEBP.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); const HTML = new TextEncoder().encode('<html>' + ' '.repeat(4000));
  const GIF = new TextEncoder().encode('GIF89a' + ' '.repeat(4000));
  expect(C.sniffImage(JPG) === 'image/jpeg' && C.sniffImage(PNG) === 'image/png' && C.sniffImage(WEBP) === 'image/webp' && C.sniffImage(HTML) === null && C.sniffImage(GIF) === null, 'sniffing by bytes');
  expect(C.typeOk('image/jpeg', 'image/jpeg') && C.typeOk('image/jpg', 'image/jpeg') && C.typeOk('', 'image/png') && C.typeOk('application/octet-stream', 'image/webp') && !C.typeOk('text/html', 'image/jpeg') && !C.typeOk('image/png', 'image/jpeg') && !C.typeOk('image/jpeg', null), 'the header must agree with the bytes');
  expect(C.looksBlocked(403, '') && C.looksBlocked(429, '') && C.looksBlocked(200, '<title>Just a moment...</title> cf-chl') && !C.looksBlocked(200, '<meta property="og:image" content="x"> captcha') && !C.looksBlocked(404, 'Not found'), 'a turned-away fetch is recognised');

  // ── the handler, with fakes ──
  const AID = '5b0f7d1e-2c3a-4d5e-8f90-123456789abc', CID = '7c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
  let agent = 'agent@example.test', sent = false, dns = {}, web = {}, stored = {}, media = [], removed = [], fetched = [], uploads = 0;
  const resp = (status, body, headers) => new Response(body == null ? null : body, { status, headers: headers || {} });
  const h = H.makeHandler({
    cors: { 'Access-Control-Allow-Origin': '*' },
    whoIsAgent: async (a) => (a === 'Bearer good' ? agent : null),
    comp: async (aid, cid) => (aid === AID && cid === CID ? { id: CID, appraisal_id: AID, sent } : null),
    resolve: async (host) => { if (dns[host] === 'throw') throw new Error('x'); return dns[host] || []; },
    fetch: async (url, init) => { fetched.push(url); if (init.redirect !== 'manual') throw new Error('redirects must be manual'); const w = web[url]; if (!w) return resp(404, 'Not found'); return typeof w === 'function' ? w(init) : w(); },
    upload: async (p, bytes, mime) => { uploads++; if (stored[p]) return { ok: false, exists: true }; stored[p] = { size: bytes.length, mime }; return { ok: true }; },
    sign: async (ps) => Object.fromEntries(ps.map(p => [p, 'https://storage.example.com/signed/' + p])),
    filed: async () => ({ paths: media.map(m => m.path), maxPosition: media.reduce((n, m) => Math.max(n, m.position), 0) }),
    insertMedia: async (rows) => { media.push(...rows); return { error: null }; },
    remove: async (ps) => { removed.push(...ps); ps.forEach(p => delete stored[p]); },
  });
  const post = (body, auth) => h(new Request('https://x.supabase.co/functions/v1/appraisal-fetch', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth === null ? {} : { Authorization: auth || 'Bearer good' }), body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const F = (b) => post(Object.assign({ action: 'fetch', appraisal_id: AID, comp_id: CID }, b));
  const pub = ['151.101.1.1'];
  dns = { 'listings.example.com': pub, 'cdn.example.com': pub, 'evil.example.com': ['10.1.2.3'], 'mixed.example.com': ['151.101.1.1', '127.0.0.1'], 'down.example.com': 'throw', 'blocked.example.com': pub, 'big.example.com': pub };
  const jpgResp = () => resp(200, JPG, { 'content-type': 'image/jpeg' });
  web['https://listings.example.com/rb/listing/1'] = () => resp(200, page, { 'content-type': 'text/html; charset=utf-8' });
  for (const u of want) web[u] = jpgResp;
  web['https://cdn.example.com/rb/b.webp'] = () => resp(200, WEBP, { 'content-type': 'image/webp' });
  web['https://cdn.example.com/rb/c.png'] = () => resp(200, HTML, { 'content-type': 'image/png' });     // says it is a photo, but is a page
  web['https://cdn.example.com/rb/lazy.jpg'] = () => resp(200, GIF, { 'content-type': 'image/jpeg' });  // a GIF named .jpg

  let r = await h(new Request('https://x/f', { method: 'OPTIONS' })); expect(r.status === 200, 'preflight');
  r = await h(new Request('https://x/f', { method: 'GET' })); expect(r.status === 405, 'GET refused');
  fetched = []; uploads = 0; stored = {};
  r = await post({ action: 'fetch', appraisal_id: AID, comp_id: CID, page_url: 'https://listings.example.com/rb/listing/1' }, null); expect(r.status === 401 && !fetched.length, 'sign in needed, nothing fetched');
  r = await post({ action: 'fetch', appraisal_id: AID, comp_id: CID, page_url: 'https://listings.example.com/rb/listing/1' }, 'Bearer vendor'); expect(r.status === 403 && !fetched.length, 'a signed-in vendor is refused before anything runs');
  r = await post('x'.repeat(H.MAX_BODY + 1)); expect(r.status === 413, 'too big');
  r = await post('not json'); expect(r.status === 400, 'bad JSON');
  r = await post({ action: 'delete', appraisal_id: AID, comp_id: CID }); expect(r.status === 400, 'unknown action');
  r = await F({ comp_id: '00000000-0000-4000-8000-000000000000', page_url: 'https://listings.example.com/rb/listing/1' }); expect(r.status === 404 && !fetched.length, 'a comparable not on the appraisal');
  sent = true; r = await F({ page_url: 'https://listings.example.com/rb/listing/1' }); expect(r.status === 409 && !fetched.length, 'a sent appraisal is refused'); sent = false;

  // a listing page: up to 20 photos (here 7 usable), each checked by its bytes, staged under its link's fingerprint
  fetched = []; stored = {};
  r = await F({ page_url: 'https://listings.example.com/rb/listing/1' }); let j = await r.json(); out.fetch1 = { photos: (j.photos || []).map(p => p.image_url), skipped: j.skipped };
  expect(j.ok && j.photos.length === 8 && j.page_url === 'https://listings.example.com/rb/listing/1', 'photos fetched from the page: ' + JSON.stringify(out.fetch1));
  expect(!j.photos.some(p => /c\.png|lazy\.jpg/.test(p.image_url)) && j.skipped.length === 2 && j.skipped.every(s => /Not a JPEG, PNG or WebP photo/.test(s.why)), 'a page posing as a photo, and a GIF named .jpg, are refused');
  const p0 = j.photos[0]; const sha = require('crypto').createHash('sha256').update(p0.image_url).digest('hex').slice(0, 32);
  expect(p0.path === `appraisals/${AID}/comps/${CID}/fetch-${sha}.jpg` && stored[p0.path] && stored[p0.path].mime === 'image/jpeg' && p0.url.startsWith('https://storage.example.com/signed/'), 'staged under the fingerprint of its link, with a signed link for Tim: ' + p0.path);
  expect(j.photos.find(p => /b\.webp/.test(p.image_url)).path.endsWith('.webp'), 'a WebP kept as WebP');
  expect(!media.length, 'nothing is filed until Tim keeps them');
  const fetch1 = j;

  // SSRF: a private host, one private address among public ones, a redirect into a private address, too many redirects, a lookup that fails
  fetched = [];
  r = await F({ page_url: 'https://evil.example.com/x' }); j = await r.json(); expect(!j.ok && /private address/.test(j.message) && !fetched.length, 'a host that resolves privately is never fetched: ' + j.message);
  r = await F({ page_url: 'https://mixed.example.com/x' }); j = await r.json(); expect(!j.ok && /private address/.test(j.message) && !fetched.length, 'one private address among public ones is enough to refuse');
  r = await F({ page_url: 'https://down.example.com/x' }); j = await r.json(); expect(!j.ok && /couldn't be checked/.test(j.message) && !fetched.length, 'a lookup that fails refuses (never fetched unchecked)');
  r = await F({ page_url: 'https://169.254.169.254/latest/meta-data/' }); j = await r.json(); expect(!j.ok && /private address/.test(j.message) && !fetched.length, 'the metadata address is refused');
  r = await F({ page_url: 'http://listings.example.com/rb/listing/1' }); j = await r.json(); expect(!j.ok && /Only secure links/.test(j.message) && !fetched.length, 'an http listing page is refused, said plainly: ' + j.message);
  web['https://listings.example.com/rb/hop'] = () => resp(302, null, { location: 'https://evil.example.com/admin' });
  web['https://listings.example.com/rb/hop2'] = () => resp(301, null, { location: 'https://[::1]/' });
  web['https://listings.example.com/rb/hop3'] = () => resp(302, null, { location: 'file:///etc/passwd' });
  fetched = []; r = await F({ page_url: 'https://listings.example.com/rb/hop' }); j = await r.json();
  expect(!j.ok && /private address/.test(j.message) && JSON.stringify(fetched) === '["https://listings.example.com/rb/hop"]', 'a redirect into a private address is checked and refused: ' + JSON.stringify(fetched));
  r = await F({ page_url: 'https://listings.example.com/rb/hop2' }); j = await r.json(); expect(!j.ok && /private address/.test(j.message), 'a redirect to loopback IPv6 refused');
  r = await F({ page_url: 'https://listings.example.com/rb/hop3' }); j = await r.json(); expect(!j.ok && /Only web links starting with https/.test(j.message), 'a redirect to a file link refused');
  web['https://listings.example.com/rb/hop4'] = () => resp(302, null, { location: 'http://listings.example.com/rb/listing/1' });
  fetched = []; r = await F({ page_url: 'https://listings.example.com/rb/hop4' }); j = await r.json();
  expect(!j.ok && /Only secure links/.test(j.message) && fetched.length === 1, 'a redirect down to plain http is refused (https only on every hop)');
  let hops = 0; web['https://listings.example.com/rb/loop'] = () => { hops++; return resp(302, null, { location: '/rb/loop' }); };
  r = await F({ page_url: 'https://listings.example.com/rb/loop' }); j = await r.json(); expect(!j.ok && /redirected too many times/.test(j.message) && hops === C.MAX_REDIRECTS + 1, 'at most 5 redirects: ' + hops);
  web['https://listings.example.com/rb/moved'] = () => resp(301, null, { location: 'https://listings.example.com/rb/listing/1' });
  r = await F({ page_url: 'https://listings.example.com/rb/moved' }); j = await r.json(); expect(j.ok && j.page_url === 'https://listings.example.com/rb/listing/1', 'a safe redirect is followed and the final page kept');

  // caps and time limits
  web['https://big.example.com/page'] = () => resp(200, 'x', { 'content-type': 'text/html', 'content-length': String(C.MAX_PAGE_BYTES + 1) });
  r = await F({ page_url: 'https://big.example.com/page' }); j = await r.json(); expect(!j.ok && /too big/.test(j.message), 'a page over 3 MB by its header');
  web['https://big.example.com/page2'] = () => resp(200, new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); } }), { 'content-type': 'text/html' });
  r = await F({ page_url: 'https://big.example.com/page2' }); j = await r.json(); expect(!j.ok && /too big/.test(j.message), 'a page over 3 MB by the bytes read (no length given)');
  web['https://big.example.com/huge.jpg'] = () => resp(200, new ReadableStream({ start(c) { const a = new Uint8Array(4 * 1024 * 1024); a.set([0xff, 0xd8, 0xff]); for (let i = 0; i < 4; i++) c.enqueue(a); c.close(); } }), { 'content-type': 'image/jpeg' });
  r = await F({ image_urls: ['https://big.example.com/huge.jpg'] }); j = await r.json(); expect(!j.ok && j.skipped && /over 15 MB/.test(j.skipped[0].why), 'a photo over 15 MB refused as it is read: ' + JSON.stringify(j));
  web['https://big.example.com/slow'] = (init) => new Promise((res, rej) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  const t0 = Date.now(); r = await F({ page_url: 'https://big.example.com/slow' }); j = await r.json();
  expect(!j.ok && /took too long/.test(j.message) && Date.now() - t0 >= C.PAGE_MS - 200, 'a page that never answers times out: ' + (Date.now() - t0) + ' ms');

  // a site that turns the fetch away: said plainly, with the download folder
  web['https://blocked.example.com/l'] = () => resp(403, '<title>Just a moment...</title>', { 'content-type': 'text/html' });
  web['https://blocked.example.com/c'] = () => resp(200, '<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script></html>', { 'content-type': 'text/html' });
  for (const u of ['https://blocked.example.com/l', 'https://blocked.example.com/c']) { r = await F({ page_url: u }); j = await r.json(); expect(!j.ok && j.reason === 'blocked' && /download folder/.test(j.message), 'turned away, said plainly: ' + u + ' ' + JSON.stringify(j)); }
  web['https://listings.example.com/rb/empty'] = () => resp(200, '<html><body>No photos here</body></html>', { 'content-type': 'text/html' });
  r = await F({ page_url: 'https://listings.example.com/rb/empty' }); j = await r.json(); expect(!j.ok && j.reason === 'no_photos' && /download folder/.test(j.message), 'no photos found: said plainly');
  web['https://listings.example.com/rb/doc.pdf'] = () => resp(200, '%PDF-1.4', { 'content-type': 'application/pdf' });
  r = await F({ page_url: 'https://listings.example.com/rb/doc.pdf' }); j = await r.json(); expect(!j.ok && /isn't a listing page or a photo/.test(j.message), 'not a page or a photo');

  // the pack's photo links (photo_hints), and the cap of 20
  const many = Array.from({ length: 30 }, (_, i) => 'https://cdn.example.com/rb/m' + i + '.jpg'); many.forEach(u => { web[u] = jpgResp; });
  stored = {}; r = await F({ image_urls: many.concat(['http://127.0.0.1/x.jpg', 'ftp://cdn.example.com/y.jpg']) }); j = await r.json();
  expect(j.ok && j.photos.length === 20 && j.photos.every(p => p.image_url.startsWith('https://cdn.example.com/rb/m')), 'image links from the pack: at most 20, unsafe ones left out: ' + (j.photos || []).length);

  // keep: only matching photos are filed, with their links; the rest removed
  media = []; removed = []; stored = {};
  r = await F({ page_url: 'https://listings.example.com/rb/listing/1' }); const ph = (await r.json()).photos;
  const k = [ph[0], ph[2]], d = ph.filter(p => !k.includes(p));
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, page_url: 'https://listings.example.com/rb/listing/1', keep: [{ path: k[0].path, image_url: 'https://cdn.example.com/rb/other.jpg' }], discard: [] }); j = await r.json();
  expect(r.status === 400 && !media.length, 'a photo sent back with a different link is refused, nothing filed');
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, keep: [{ path: `appraisals/${AID}/comps/${CID}/../x/fetch-${'a'.repeat(32)}.jpg`, image_url: 'https://cdn.example.com/rb/a.jpg' }] }); expect(r.status === 400 && !media.length, 'a path outside the comparable is refused');
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, page_url: 'javascript:alert(1)', keep: [] }); expect(r.status === 400, 'a bad page link is refused');
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, page_url: 'https://listings.example.com/rb/listing/1', keep: k.map(p => ({ path: p.path, image_url: p.image_url })), discard: d.map(p => p.path).concat(['appraisals/other/comps/x/y.jpg']) }); j = await r.json();
  out.keep = { j, media: media.map(m => [m.source, m.position, !!m.source_url, m.page_url, m.created_by]) };
  expect(j.ok && j.kept === 2 && j.removed === d.length && media.length === 2 && media.every(m => m.source === 'url' && m.page_url === 'https://listings.example.com/rb/listing/1' && m.created_by === agent && m.comp_id === CID && m.appraisal_id === AID)
    && media[0].source_url === k[0].image_url && media.map(m => m.position).join() === '1,2' && removed.length === d.length && !removed.includes('appraisals/other/comps/x/y.jpg'), 'kept photos filed with their links; the rest removed; nothing outside the comparable touched: ' + JSON.stringify(out.keep));
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, keep: k.map(p => ({ path: p.path, image_url: p.image_url })), discard: [k[0].path] }); j = await r.json();
  expect(j.ok && j.kept === 0 && j.removed === 0 && media.length === 2, 'keeping twice files nothing twice, and a filed photo is never removed by a discard');
  const httpImg = 'http://cdn.example.com/rb/plain.jpg'; web[httpImg] = jpgResp; fetched = [];
  r = await F({ image_urls: [httpImg] }); j = await r.json();
  expect(!j.ok && !fetched.length, 'a photo link over plain http is never fetched');
  r = await post({ action: 'keep', appraisal_id: AID, comp_id: CID, keep: [{ path: `appraisals/${AID}/comps/${CID}/fetch-${require('crypto').createHash('sha256').update(httpImg).digest('hex').slice(0, 32)}.jpg`, image_url: httpImg }] });
  expect(r.status === 400 && media.length === 2, 'nor filed with an http link');

  // a body that stalls or breaks, the whole fetch's time budget, and nothing escaping as a bare error
  const mkH = (o) => H.makeHandler(Object.assign({ cors: { 'Access-Control-Allow-Origin': '*' }, whoIsAgent: async () => agent, comp: async () => ({ id: CID, appraisal_id: AID, sent: false }), resolve: async () => pub,
    fetch: async (url, init) => { fetched.push(url); const w = web[url]; return w ? w(init) : resp(404, 'x'); }, upload: async (p, b, m) => { stored[p] = { size: b.length, mime: m }; return { ok: true }; },
    sign: async (ps) => Object.fromEntries(ps.map(p => [p, 'https://storage.example.com/signed/' + p])), filed: async () => ({ paths: [], maxPosition: 0 }), insertMedia: async () => ({ error: null }), remove: async () => { } }, o));
  const postTo = (hh, b) => hh(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: 'fetch', appraisal_id: AID, comp_id: CID }, b)) }));
  const stall = (first) => (init) => resp(200, new ReadableStream({ start(c) { c.enqueue(first); init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; c.error(e); }); } }), { 'content-type': first[0] === 0xff ? 'image/jpeg' : 'text/html' });
  const broken = () => resp(200, new ReadableStream({ start(c) { c.enqueue(JPG.subarray(0, 100)); c.error(new Error('connection reset')); } }), { 'content-type': 'image/jpeg' });
  web['https://listings.example.com/rb/stall-page'] = stall(new TextEncoder().encode('<html><head>'));
  let hh = mkH({ timeBudgetMs: 1500 }); let t1 = Date.now();
  r = await postTo(hh, { page_url: 'https://listings.example.com/rb/stall-page' }); j = await r.json();
  out.stallPage = [r.status, j, Date.now() - t1];
  expect(r.status === 200 && j.ok === false && /too long/.test(j.message) && r.headers.get('Access-Control-Allow-Origin') === '*' && Date.now() - t1 < 4000, 'a page whose body stalls: a plain answer within the budget, never a bare 500: ' + JSON.stringify(out.stallPage));
  web['https://cdn.example.com/rb/broken.jpg'] = broken; web['https://cdn.example.com/rb/ok1.jpg'] = jpgResp; web['https://cdn.example.com/rb/ok2.jpg'] = jpgResp;
  web['https://cdn.example.com/rb/stall.jpg'] = stall(JPG.subarray(0, 100)); web['https://cdn.example.com/rb/never.jpg'] = jpgResp;
  hh = mkH({ timeBudgetMs: 2500 }); fetched = []; t1 = Date.now();
  r = await postTo(hh, { image_urls: ['https://cdn.example.com/rb/broken.jpg', 'https://cdn.example.com/rb/ok1.jpg', 'https://cdn.example.com/rb/ok2.jpg', 'https://cdn.example.com/rb/stall.jpg', 'https://cdn.example.com/rb/never.jpg'] }); j = await r.json();
  out.budget = { status: r.status, ok: j.ok, n: (j.photos || []).length, time_up: j.time_up, message: j.message, skipped: j.skipped, ms: Date.now() - t1, fetched };
  expect(j.ok && j.photos.length === 2 && j.time_up === true && /only 2 photos were fetched in the time allowed/.test(j.message) && j.skipped.some(x => /broke off/.test(x.why)) && !fetched.includes('https://cdn.example.com/rb/never.jpg') && Date.now() - t1 < 5000 && r.headers.get('Access-Control-Allow-Origin') === '*',
    'the budget: a broken download skipped, a stalled one ends the loop, and what was staged is returned for Tim to keep or discard: ' + JSON.stringify(out.budget));
  hh = mkH({ upload: async () => { throw new Error('storage down'); } });
  r = await postTo(hh, { image_urls: ['https://cdn.example.com/rb/ok1.jpg'] }); j = await r.json();
  expect(r.status === 500 && j.ok === false && /Something went wrong/.test(j.error) && r.headers.get('Access-Control-Allow-Origin') === '*', 'anything unexpected still answers in JSON with the CORS headers');
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + (e && e.stack || e)] }, null, 1)));
