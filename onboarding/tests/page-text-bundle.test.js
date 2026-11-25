// Offers hotfix 1 (live, 26 November 2026): the offer-sign function refused every round with a line through text, because pdf.js tried
// to load its worker file from disk, which the edge bundle doesn't have. This builds a Deno bundle of the function's own reader
// (fn/page_text.ts, with pdf.js and its worker imported statically as fn/offer_sign.ts does) and runs it with no file access at all
// (--deny-read, --deny-ffi, --deny-sys), as the edge runtime leaves it: the draft's words must be read. The same reader handed no worker
// must fail there, so the test really simulates the bundle. Checks the entry file imports both statically and hands the worker in.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const errs = [], out = {}, ok = (c, m) => { if (!c) errs.push(m); };
const root = path.join(__dirname, '..', '..');
(async () => {
  const entry = fs.readFileSync(path.join(root, 'fn', 'offer_sign.ts'), 'utf8');
  ok(/import \* as PDFJS from "npm:pdfjs-dist@6\.2\.108\/legacy\/build\/pdf\.mjs"/.test(entry) && /import \* as PDFJS_WORKER from "npm:pdfjs-dist@6\.2\.108\/legacy\/build\/pdf\.worker\.mjs"/.test(entry), 'the entry imports pdf.js and its worker statically');
  ok(/pageTextWith\(async \(\) => PDFJS, \(globalThis as any\)\.DRAFT, PDFJS_WORKER\)/.test(entry) && !/import\("npm:pdfjs/.test(entry), 'and hands the worker to the reader (no dynamic import left)');
  const deno = ['/home/claude/.npm-global/bin/deno', 'deno'].find(d => { try { execFileSync(d, ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } });
  if (!deno) { errs.push('deno is not installed here, so the bundle check could not run'); return done(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptb-')), run = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr-'));
  const src = (withWorker) => `import DRm from ${JSON.stringify(path.join(root, 'onboarding', 'src', 'draft-core.js'))};
import { pageTextWith } from ${JSON.stringify(path.join(root, 'fn', 'page_text.ts'))};
import * as PDFLib from "npm:pdf-lib@1.17.1";
import * as PDFJS from "npm:pdfjs-dist@6.2.108/legacy/build/pdf.mjs";
import * as PDFJS_WORKER from "npm:pdfjs-dist@6.2.108/legacy/build/pdf.worker.mjs";
const DR = (DRm && DRm.readPages) ? DRm : globalThis.DRAFT;
const pt = pageTextWith(async () => PDFJS, DR, ${withWorker ? 'PDFJS_WORKER' : 'undefined'});
const doc = await PDFLib.PDFDocument.create(), F = await doc.embedFont(PDFLib.StandardFonts.Helvetica), pg = doc.addPage([595, 842]);
pg.drawText("Purchase price: $990,000", { x: 40, y: 400, size: 10, font: F }); doc.addPage([595, 842]).setRotation(PDFLib.degrees(90));
try { const p = await pt(await doc.save()); console.log("RESULT " + JSON.stringify({ ok: true, items: p[0].items, rot: p.map(x => x.rot) })); } catch (e) { console.log("RESULT " + JSON.stringify({ ok: false, error: String(e) })); }
`;
  const one = (name, withWorker) => { fs.writeFileSync(path.join(dir, name + '.ts'), src(withWorker));
    execFileSync(deno, ['bundle', '-q', '-o', path.join(run, name + '.js'), path.join(dir, name + '.ts')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 });
    const o = execFileSync(deno, ['run', '-q', '--allow-env', '--deny-read', '--deny-ffi', '--deny-sys', '--deny-net', path.join(run, name + '.js')], { cwd: run, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    const line = o.split('\n').find(l => l.startsWith('RESULT ')); return line ? JSON.parse(line.slice(7)) : { ok: false, error: 'no result: ' + o.slice(-300) }; };
  try {
    const fixed = one('fixed', true); out.fixed = fixed;
    ok(fixed.ok && fixed.items[0].s === 'Purchase price: $990,000' && fixed.rot.join() === '0,90', 'in a bundle with no file access, the reader with its worker reads the words and the turns: ' + JSON.stringify(fixed));
    const before = one('before', false); out.before = before;
    ok(!before.ok && /fake worker|pdf\.worker/i.test(before.error), 'and without the worker it fails there, as it did live (so the check is real): ' + JSON.stringify(before));
  } catch (e) { errs.push('the bundle check crashed: ' + String(e.stderr || e.message).slice(-600)); }
  done();
})();
function done() { console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); }
