// The offer link's QR code (src/qr.js) is drawn by the app itself, never by an outside service. This test draws codes for links of
// several lengths (versions 1 to 10), photographs them in a browser and reads them back with OpenCV's QR reader, so a code that
// looks right but doesn't scan fails here.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const QR = require(path.join(__dirname, '..', 'src', 'qr.js'));
(async () => {
  const errs = [], out = { decoded: [] };
  const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  const tok = 'Zq3_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV7wX';
  const texts = ['hi', 'https://packages.dunnerstunner.co.nz/onboarding/?offer=' + tok, 'https://packages.dunnerstunner.co.nz/onboarding/?offer=' + tok + '&x=' + 'a'.repeat(60), 'x'.repeat(150), 'y'.repeat(200)];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 600, height: 600 } });
  for (const [i, t] of texts.entries()) {
    const q = QR.encode(t); out.decoded.push({ len: t.length, version: q.version });
    await p.setContent(`<body style="margin:0;background:#fff">${QR.svg(t, { size: 520 })}</body>`);
    const f = path.join(dir, `qr_${i}.png`); await p.screenshot({ path: f, clip: { x: 0, y: 0, width: 520, height: 520 } });
    let got = ''; try { got = execFileSync('python3', ['-I', '-c', 'import cv2,sys; d=cv2.QRCodeDetector(); v,_,_=d.detectAndDecode(cv2.imread(sys.argv[1])); print(v, end="")', f], { encoding: 'utf8' }); } catch (e) { got = 'ERR ' + e.message; }
    if (got !== t) errs.push(`QR ${i} (version ${q.version}) read back as ${JSON.stringify(got.slice(0, 80))}`);
  }
  let threw = false; try { QR.encode('z'.repeat(300)); } catch (_) { threw = true; } if (!threw) errs.push('too long should be refused');
  if (!/^<svg[^>]+role="img"/.test(QR.svg('a', { label: 'QR code for the offer link' })) || !QR.svg('a').includes('fill="#fff"')) errs.push('svg has a label and a white background');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));
