// Runs every onboarding test. Each test prints a JSON result ending with "errs": a test passes when it
// finishes and reports no page errors. Run from anywhere: node onboarding/tests/run-all.js
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const only = process.argv.slice(2);
const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.includes(o)))).sort();
let failed = 0;
for (const t of tests) {
  const t0 = Date.now();
  try {
    const out = execFileSync('node', [path.join(__dirname, t)], { cwd: path.join(__dirname, 'out'), encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] });
    const ok = /"errs": \[\]/.test(out);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (!ok || process.env.VERBOSE) console.log(out.split('\n').slice(-40).join('\n'));
  } catch (e) {
    failed++;
    console.log(`FAIL  ${t}  (crashed)\n${String(e.stdout || '').slice(-2000)}${String(e.stderr || e.message).slice(-2000)}`);
  }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nAll ${tests.length} passed`);
process.exit(failed ? 1 : 0);
