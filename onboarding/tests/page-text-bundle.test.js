// Offers hotfixes 1 and 2 (live, 26 November 2026). Hotfix 1: pdf.js looked for its worker file on disk, which the edge bundle doesn't
// have, so every round with a line through text was refused. Hotfix 2: hotfix 1's top-level pdf.js import crashed the whole function
// on Supabase at start-up ("DOMMatrix is not defined"), so even OPTIONS answered 500. This test bundles the real entry, fn/offer_sign.ts,
// with Deno and runs it as the edge runtime leaves it: no file, network or system access (--deny-read, --deny-ffi, --deny-sys, --deny-net)
// and no DOMMatrix, Path2D, ImageData or OffscreenCanvas. The module must load, answer OPTIONS with 200, and its reader (pageText) must
// give the words and each page's turn of the synthetic blank. The same run against 21b7dc7's code must fail to load (the crash seen
// live), so the test would have caught it. It also measures the reader's first load (cold start) and the memory it adds.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const errs = [], out = {}, ok = (c, m) => { if (!c) errs.push(m); };
const root = path.join(__dirname, '..', '..');
(async () => {
  const entry = fs.readFileSync(path.join(root, 'fn', 'offer_sign.ts'), 'utf8');
  ok(!/^import [^\n]*pdfjs-dist|^import [^\n]*unpdf/m.test(entry) && /await import\("npm:unpdf@1\.9\.1"\)/.test(entry), 'the entry loads the PDF reader lazily, never at module top level');
  const deno = ['/home/claude/.npm-global/bin/deno', 'deno'].find(d => { try { execFileSync(d, ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } });
  if (!deno) { errs.push('deno is not installed here, so the bundle check could not run'); return done(); }
  const blank = Buffer.from(await SB.make({ cca: true, rotateLim: true })).toString('base64');
  const harness = `for (const k of ["DOMMatrix", "Path2D", "ImageData", "OffscreenCanvas"]) { try { delete globalThis[k]; } catch (_) {} }
const gone = ["DOMMatrix", "Path2D", "ImageData", "OffscreenCanvas"].every(k => typeof globalThis[k] === "undefined");
let handler = null; Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: (a, b) => { handler = typeof a === "function" ? a : b; return { finished: Promise.resolve(), shutdown() {} }; } });
const r = { gone };
try {
  const ti = performance.now(), mi = Deno.memoryUsage().rss; const m = await import("./entry.js"); r.loaded = true; r.importMs = Math.round(performance.now() - ti); r.importMB = Math.round((Deno.memoryUsage().rss - mi) / 1048576);
  const res = await handler(new Request("https://x.supabase.co/functions/v1/offer-sign", { method: "OPTIONS", headers: { Origin: "https://portal.dunnerstunner.co.nz" } })); r.options = res.status;
  if (m.pageText) { const bin = atob("${blank}"), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const m0 = Deno.memoryUsage().rss, t0 = performance.now(); const pages = await m.pageText(bytes); const t1 = performance.now();
    await m.pageText(bytes); const t2 = performance.now();
    r.pages = pages.length; r.rot = pages.map(p => p.rot); r.all = pages.map(p => p.items); r.price = pages.some(p => p.items.some(i => /Purchase price/.test(i.s))); r.first = pages[0].items.slice(0, 2);
    r.coldMs = Math.round(t1 - t0); r.warmMs = Math.round(t2 - t1); r.memMB = Math.round((Deno.memoryUsage().rss - m0) / 1048576); }
} catch (e) { r.error = String(e && e.stack || e).slice(0, 400); }
console.log("RESULT " + JSON.stringify(r));
`;
  // bundle an entry tree (the current files, or an older commit's) and run it in the harness
  const runTree = (treeRoot, tag) => {
    const run = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr-' + tag + '-'));
    execFileSync(deno, ['bundle', '-q', '-o', path.join(run, 'entry.js'), path.join(treeRoot, 'fn', 'offer_sign.ts')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    fs.writeFileSync(path.join(run, 'harness.mjs'), harness);
    const o = execFileSync(deno, ['run', '-q', '--allow-env', '--deny-read', '--deny-ffi', '--deny-sys', '--deny-net', path.join(run, 'harness.mjs')], { cwd: run, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    const line = o.split('\n').find(l => l.startsWith('RESULT ')); return line ? JSON.parse(line.slice(7)) : { error: 'no result: ' + o.slice(-300) }; };
  try {
    const now = runTree(root, 'now'); out.now = now;
    ok(now.gone, 'DOMMatrix, Path2D, ImageData and OffscreenCanvas are gone before the module loads');
    ok(now.loaded && now.options === 200, 'the real entry loads with no DOM globals and no file access, and answers OPTIONS with 200: ' + JSON.stringify(now));
    ok(now.price && now.rot && now.rot.filter(x => x === 90).length === 1 && now.rot.length === now.pages, 'its reader gives the words and each page\'s turn of the synthetic blank: ' + JSON.stringify({ pages: now.pages, rot: now.rot, first: now.first }));
    // the function reads the same words in the same places as the signer's screen (pdf.js 6.2.108), so its check of a line agrees with the snap
    { const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs'), D = require(path.join(root, 'onboarding', 'src', 'draft-core.js')), w_ = console.warn; console.warn = () => { };
      const mine = (await D.readPages(pdfjs, new Uint8Array(Buffer.from(blank, 'base64')))).map(p => p.items); console.warn = w_;
      const diff = (now.all || []).filter((items, i) => JSON.stringify(items) !== JSON.stringify(mine[i])).length; out.samePages = { pages: mine.length, differing: diff };
      ok(now.all && now.all.length === mine.length && diff === 0, 'the function\'s reader gives exactly the words and places the screen reads: ' + JSON.stringify(out.samePages)); delete now.all; }
    // the code that crashed live (21b7dc7) fails here the same way, so this test would have caught it
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'pt21-'));
    execFileSync('sh', ['-c', `git -C ${JSON.stringify(root)} archive 21b7dc7 fn onboarding/src | tar -x -C ${JSON.stringify(old)}`]);
    const was = runTree(old, 'old'); out.was = { loaded: !!was.loaded, options: was.options, error: was.error };
    ok(!was.loaded && /DOMMatrix is not defined/.test(was.error || ''), '21b7dc7\'s entry fails to load here exactly as it did live: ' + JSON.stringify(out.was));
  } catch (e) { errs.push('the bundle check crashed: ' + String(e.stderr || e.message).slice(-800)); }
  done();
})();
function done() { console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); }
