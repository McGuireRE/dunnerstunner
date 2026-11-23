/* A small QR code maker for the offer link (offers phase 1), so the link never goes to an outside QR service. Byte mode, error
   correction level M, versions 1 to 10 (up to 213 bytes: an offer link is about 100). Returns the modules as rows of booleans,
   or an SVG. Tested by decoding what it draws (offer-qr.test.js). */
(function (root) {
  'use strict';
  // level M: [ec codewords per block, [blocks, data codewords per block], ...]
  const M = [null, [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]], [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCap = v => M[v].slice(1).reduce((s, [n, k]) => s + n * k, 0);
  // GF(256) arithmetic, polynomial 0x11D
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); g.forEach((c, j) => { ng[j] ^= c; ng[j + 1] ^= mul(c, EXP[i]); }); g = ng; } return g; }
  function rsEc(data, n) { const g = rsGen(n), r = data.concat(new Array(n).fill(0)); for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); } return r.slice(data.length); }
  // BCH codes for the format (10 check bits, 0x537) and version (12 check bits, 0x1F25) information
  function bch(value, poly, n) { let rem = value; for (let i = 0; i < n; i++) rem = (rem << 1) ^ ((rem >>> (n - 1)) * poly); return (value << n) | rem; }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let v = 1; while (v <= 10 && dataCap(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error('Too long for a QR code here');
    const cap = dataCap(v), bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xEC);
    // split into blocks, add error correction, interleave
    const ecn = M[v][0], blocks = []; let at = 0;
    M[v].slice(1).forEach(([n, k]) => { for (let i = 0; i < n; i++) { const d = data.slice(at, at + k); at += k; blocks.push({ d, e: rsEc(d, ecn) }); } });
    const cw = []; const maxK = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxK; i++) blocks.forEach(b => { if (i < b.d.length) cw.push(b.d[i]); });
    for (let i = 0; i < ecn; i++) blocks.forEach(b => cw.push(b.e[i]));
    // the grid
    const size = 17 + 4 * v, mod = [], fixed = [];
    for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fixed.push(new Array(size).fill(false)); }
    const set = (r, c, on) => { if (r >= 0 && c >= 0 && r < size && c < size) { mod[r][c] = !!on; fixed[r][c] = true; } };
    const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)); set(r0 + r, c0 + c, on); } };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[v], last = al.length - 1; al.forEach((r, i) => al.forEach((c, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }));
    set(size - 8, 8, true);   // the dark module
    // reserve format (and version) areas
    for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, false); if (!fixed[i][8]) set(i, 8, false); }
    for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); set(size - 1 - i, 8, false); }
    if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(size - 11 + j, i, false); set(i, size - 11 + j, false); }
    // the data, in the zigzag
    const allBits = []; cw.forEach(b => { for (let i = 7; i >= 0; i--) allBits.push((b >>> i) & 1); });
    let bi = 0, up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let k = 0; k < size; k++) { const r = up ? size - 1 - k : k; for (let c = col; c >= col - 1; c--) if (!fixed[r][c]) { mod[r][c] = bi < allBits.length ? !!allBits[bi] : false; bi++; } }
      up = !up;
    }
    const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0, (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
    function withMask(m) {
      const g = mod.map(row => row.slice());
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fixed[r][c] && MASKS[m](r, c)) g[r][c] = !g[r][c];
      const fmt = bch((0 << 3) | m, 0x537, 10) ^ 0x5412;   // level M is 00
      const fb = i => ((fmt >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) g[i][8] = fb(i);
      g[7][8] = fb(6); g[8][8] = fb(7); g[8][7] = fb(8);
      for (let i = 9; i < 15; i++) g[8][14 - i] = fb(i);
      for (let i = 0; i < 8; i++) g[8][size - 1 - i] = fb(i);
      for (let i = 8; i < 15; i++) g[size - 15 + i][8] = fb(i);
      g[size - 8][8] = true;
      if (v >= 7) { const vi = bch(v, 0x1F25, 12); for (let i = 0; i < 18; i++) { const on = ((vi >>> i) & 1) === 1, a = Math.floor(i / 3), b = size - 11 + (i % 3); g[b][a] = on; g[a][b] = on; } }
      return g;
    }
    function penalty(g) {
      let p = 0;
      const lines = []; for (let i = 0; i < size; i++) { lines.push(g[i]); lines.push(g.map(row => row[i])); }
      lines.forEach(l => { let run = 1; for (let i = 1; i <= size; i++) { if (i < size && l[i] === l[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
        const s = l.map(x => x ? '1' : '0').join(''); let i = -1; while ((i = s.indexOf('10111010000', i + 1)) >= 0) p += 40; i = -1; while ((i = s.indexOf('00001011101', i + 1)) >= 0) p += 40; });
      for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) { const x = g[r][c]; if (x === g[r][c + 1] && x === g[r + 1][c] && x === g[r + 1][c + 1]) p += 3; }
      const dark = g.reduce((s, row) => s + row.filter(Boolean).length, 0); p += 10 * Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5);
      return p;
    }
    let best = null, bestP = Infinity;
    for (let m = 0; m < 8; m++) { const g = withMask(m), pp = penalty(g); if (pp < bestP) { bestP = pp; best = g; } }
    return { version: v, size, modules: best };
  }
  // an SVG with a quiet zone, dark modules on white (white in dark mode too, so phones can read it)
  function svg(text, opts) {
    const o = opts || {}, q = encode(text), quiet = 4, n = q.size + quiet * 2; let d = '';
    q.modules.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" ${o.size ? `width="${o.size}" height="${o.size}"` : ''} shape-rendering="crispEdges" role="img" aria-label="${o.label || 'QR code'}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  const QR = { encode, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR; else root.QR = QR;
})(typeof window !== 'undefined' ? window : globalThis);
