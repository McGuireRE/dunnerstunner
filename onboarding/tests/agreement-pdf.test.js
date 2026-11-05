// Phase 2: the agreement PDF with its appended documents, the old format for agreements signed before,
// and the form PDFs. Builds real PDFs with the edge function code (fn/pdf.ts) using Deno and pdftotext.
// The phase 1 builder is read from git (commit a06eb62) to prove earlier agreements come out the same.
const { execFileSync } = require('child_process'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
let res;
try {
  fs.writeFileSync(path.join(out, 'pdf_phase1.ts'), execFileSync('git', ['-C', root, 'show', 'a06eb62:fn/pdf.ts'], { encoding: 'utf8' }));
  res = execFileSync('deno', ['run', '-A', path.join(__dirname, 'pdf-check.ts'), root, out, path.join(out, 'pdf_phase1.ts')], { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
  const j = JSON.parse(res.slice(res.indexOf('{')));
  console.log(JSON.stringify(j, null, 1));
} catch (e) {
  console.log(JSON.stringify({ errs: ['PDF check could not run: ' + String(e.stderr || e.message).slice(-1500)] }, null, 1));
}
