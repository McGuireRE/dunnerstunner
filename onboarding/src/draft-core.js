/* Drafting offers onto the REINZ blank (offers phase 2). No page or database code here, so the tests can load it on its own
   (draft-core.test.js) and the same rules run in the browser.

   What it does:
     readPages(pdfjs, bytes)   the text on each page of the blank, with positions (pdf.js, in the browser or in Node)
     readEdition(pages)        the edition string printed on it; editionOk(e) says whether that edition has been checked
     buildMap(pages)           the places to write, found by anchoring on the printed labels (never by copying the form's text)
     planDraft(input)          what goes where for one offer: the drafting rules
     renderDraft(PDFLib, ...)  the drafted PDF: the original pages untouched, with typed text and marks added on top

   The form's own text is never kept here: only short label patterns to find places by, and clause numbers. Positions are PDF
   points from the bottom left of the page, as pdf.js reports them and pdf-lib draws them. */
(function (root) {
  'use strict';
  const OF = root.OFFERS || (typeof require === 'function' ? require('./offers-core.js') : null);

  // The editions whose labels and layout have been checked against a real blank. Drafting is refused on any other. Keep the same
  // list in offer_edition_ok() (migration 019).
  const EDITIONS = { 'Eleventh Edition 2022 (4)': { checked: '2026-11-23', note: 'ADLS/TLANZ and REINZ, checked on a real pack' } };
  const EDITION_RE = /\b([A-Z][a-z]+(?:-[a-z]+)?) Edition (\d{4})(?: \((\d+)\))?/;
  const editionOk = e => Object.prototype.hasOwnProperty.call(EDITIONS, String(e || ''));
  const INK = [0.05, 0.16, 0.45];   // typed text: a dark blue, plainly added
  const FONT_SIZE = 9;

  /* ───── reading the blank ───── */
  async function readPages(pdfjs, bytes, opts) {
    const doc = await pdfjs.getDocument(Object.assign({ data: new Uint8Array(bytes).slice(0), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }, opts || {})).promise;
    const pages = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
        pages.push({ n: i, w: +vp.width.toFixed(2), h: +vp.height.toFixed(2), items: tc.items.filter(t => t.str && t.str.trim()).map(t => ({ s: t.str, x: +t.transform[4].toFixed(2), y: +t.transform[5].toFixed(2), w: +(t.width || 0).toFixed(2), h: +(t.height || Math.abs(t.transform[3]) || 9).toFixed(2) })) });
        if (pg.cleanup) pg.cleanup();
      }
    } finally { try { if (doc.destroy) await doc.destroy(); else if (doc.cleanup) await doc.cleanup(); } catch (_) { } }
    return pages;
  }
  // a character's rough width as a share of the font size (Helvetica-like), to find where a word sits inside a run of text
  const cw = c => /[il.,:;'’|!()\[\]\/ jtfr]/.test(c) ? 0.28 : /[mwMW]/.test(c) ? 0.83 : /[A-Z]/.test(c) ? 0.68 : /[0-9]/.test(c) ? 0.556 : 0.52;
  // the text of a page as lines (items on the same baseline, left to right), each with where every character falls
  function lines(page) {
    const its = page.items.slice().sort((a, b) => b.y - a.y || a.x - b.x), L = [];
    for (const it of its) {
      let ln = null;
      for (const l of L) if (Math.abs(l.y - it.y) <= Math.max(1.5, Math.min(l.h, it.h) * 0.3)) { ln = l; break; }
      if (!ln) { ln = { y: it.y, h: it.h, items: [] }; L.push(ln); }
      ln.items.push(it); ln.h = Math.max(ln.h, it.h);
    }
    L.forEach((l, i) => {
      l.items.sort((a, b) => a.x - b.x); let t = ''; const spans = [];
      l.items.forEach((it, j) => {
        if (j) { const pv = l.items[j - 1], gap = it.x - (pv.x + pv.w); if (gap > 0.8 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += gap > 14 ? '   ' : ' '; }
        spans.push({ it, start: t.length, end: t.length + it.s.length }); t += it.s;
      });
      Object.assign(l, { text: t, spans, x0: l.items[0].x, x1: Math.max(...l.items.map(x => x.x + x.w)), page: page.n });
    });
    L.sort((a, b) => b.y - a.y); L.forEach((l, i) => { l.i = i; });
    return L;
  }
  // where a character index of a line sits on the page
  function xAt(line, idx) {
    for (const sp of line.spans) {
      if (idx >= sp.start && idx <= sp.end) {
        const s = sp.it.s, tot = Array.from(s).reduce((a, c) => a + cw(c), 0) || 1, part = Array.from(s.slice(0, idx - sp.start)).reduce((a, c) => a + cw(c), 0);
        return sp.it.x + sp.it.w * (part / tot);
      }
      if (idx < sp.start) return sp.it.x;
    }
    return line.x1;
  }
  // every match of a pattern on a line: { start, end, x0, x1 }
  function matchAll(line, re) {
    const out = [], g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
    while ((m = g.exec(line.text))) { out.push({ start: m.index, end: m.index + m[0].length, x0: xAt(line, m.index), x1: xAt(line, m.index + m[0].length), m }); if (!m[0].length) g.lastIndex++; }
    return out;
  }
  const findLine = (L, re, from) => L.find(l => (from == null || l.y < from) && re.test(l.text));
  const findLines = (L, re) => L.filter(l => re.test(l.text));
  const allLines = pages => pages.map(p => ({ page: p, L: lines(p) }));

  function readEdition(pages) {
    const counts = {};
    for (const p of pages.slice(0, 30)) for (const it of p.items) { const m = EDITION_RE.exec(it.s); if (m) { const e = m[0].trim(); counts[e] = (counts[e] || 0) + 1; } }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }
  // the agreement's own pages (they carry the edition string)
  const editionPages = (pages, ed) => pages.filter(p => ed && p.items.some(i => i.s.includes(ed))).map(p => p.n);

  /* ───── number words, for reading what a blank already says ───── */
  const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
  function numberIn(s) {
    const t = String(s || '').toLowerCase(); let m = /\b(\d{1,3})\b/.exec(t); if (m) return +m[1];
    m = /\b(twenty|thirty|forty|fifty|sixty)[- ](one|two|three|four|five|six|seven|eight|nine)\b/.exec(t); if (m) return WORDS[m[1]] + WORDS[m[2]];
    m = new RegExp('\\b(' + Object.keys(WORDS).join('|') + ')\\b').exec(t); return m ? WORDS[m[1]] : null;
  }
  const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const daysWords = n => (n <= 20 ? NUM_WORDS[n] : String(n)) + ` (${n}) working ${n === 1 ? 'day' : 'days'}`;

  /* ───── the map: places found by their printed labels ───── */
  // the six front-page conditions: offer key, clause number
  const FRONT_CONDITIONS = [['finance', '9.1'], ['lim', '9.3'], ['builders', '9.4'], ['toxicology', '9.5'], ['oia', '9.6'], ['land_act', '9.7']];
  const LABELS = {   // what each place is called on Tim's screens
    date: 'Date of the agreement', purchaser: 'Purchaser', nominee: 'and/or nominee', gst_vendor: "GST: the vendor's registration", ppa_vendor: 'PPA: vendor', ppa_purchaser: 'PPA: purchaser',
    price: 'Purchase price', gst_plus: 'Plus GST', gst_incl: 'Inclusive of GST', deposit: 'Deposit', settlement: 'Settlement date', tenancies: 'Tenancies',
    further_terms: 'Further terms of sale', clause21_2: 'Clause 21.2 (deposit to NZ Real Estate Trust)', clause21_3: 'Clause 21.3 (KiwiSaver deposit)', clause22: "Clause 22.0 (lawyer's approval)", clause22_days: "Clause 22.0 working days",
    chattels: 'Schedule 2: chattels', gst_purchaser: "Schedule 1, 2(a): purchaser's GST registration",
    purchaser_back: 'Back page: purchaser', p_contact: "Back page: purchaser's contact details (never filled)", v_contact: "Back page: vendor's contact details (never filled)",
    pl_firm: "Purchaser's lawyers: firm", pl_person: "Purchaser's lawyers: individual acting", pl_email: "Purchaser's lawyers: email", pl_phone: "Purchaser's lawyers: contact details", pl_service: "Purchaser's lawyers: email for notices",
    vl_firm: "Vendor's lawyers: firm", vl_person: "Vendor's lawyers: individual acting", vl_email: "Vendor's lawyers: email", vl_phone: "Vendor's lawyers: contact details", vl_service: "Vendor's lawyers: email for notices",
  };
  FRONT_CONDITIONS.forEach(([k, c]) => { const n = (OF && OF.condInfo(k) || { label: k }).label; LABELS['c_' + k] = `${n} (clause ${c}): Yes/No`; LABELS['d_' + k] = `${n} (clause ${c}): date`; });
  const r1 = n => Math.round(n * 10) / 10;
  const box = (o) => Object.assign(o, { x: r1(o.x), y: r1(o.y), w: r1(Math.max(0, o.w)), h: r1(Math.max(0, o.h)) });
  // text already on the blank to the right of a label (the eForms portal sometimes fills a field), and on lines carried under it
  // returns { text, lines: [{ x0, x1, y, h }] } (each printed line's own extent, so it can be struck through exactly)
  function printedAfter(L, line, x, stopRe, right) {
    const sps = line.spans.filter(sp => sp.it.x >= x - 1 && (right == null || sp.it.x < right));
    const same = sps.map(sp => sp.it.s).join(' ').trim();
    const out = same ? [same] : [], ext = same ? [{ x0: r1(sps[0].it.x), x1: r1(Math.max(...sps.map(sp => sp.it.x + sp.it.w))), y: r1(sps[0].it.y), h: r1(Math.max(...sps.map(sp => sp.it.h))) }] : []; let prev = line;
    if (same) for (const l of L) {
      if (l.y >= prev.y) continue; if (prev.y - l.y > prev.h * 1.6) break; if (stopRe && stopRe.test(l.text)) break;
      if (Math.abs(l.x0 - x) <= 12 || Math.abs(l.x0 - ext[0].x0) <= 12) { out.push(l.text.trim()); ext.push({ x0: r1(l.x0), x1: r1(l.x1), y: r1(l.y), h: r1(l.h) }); prev = l; } else break;
    }
    return { text: out.join(' ').replace(/\s+/g, ' ').trim(), lines: ext };
  }
  // a Yes/No (or Yes/No/NA) on a line: the place, with where Yes and No each sit
  function yesNoOn(line, key, which) {
    const ms = matchAll(line, /\bYes\s*\/\s*No\b/); if (!ms.length) return null; const m = which === 'first' ? ms[0] : ms[ms.length - 1];
    const s = m.m[0], yEnd = m.start + 3, nStart = m.start + s.lastIndexOf('No');
    return box({ id: key, key, kind: 'yesno', page: line.page, x: m.x0, y: line.y, w: m.x1 - m.x0, h: line.h, label: LABELS[key] || key, source: 'anchor',
      yes: { x: r1(m.x0), w: r1(xAt(line, yEnd) - m.x0) }, no: { x: r1(xAt(line, nStart)), w: r1(xAt(line, nStart + 2) - xAt(line, nStart)) } });
  }
  function textAfter(L, line, m, key, page, stopX, opts) {
    const x = m.x1 + 4, right = stopX != null ? stopX - 6 : page.w - 28;
    const pr = printedAfter(L, line, x - 3, opts && opts.stop, stopX != null ? stopX - 1 : null);
    return box({ id: key, key, kind: (opts && opts.kind) || 'text', page: page.n, x, y: line.y, w: right - x, h: line.h, label: LABELS[key] || key, source: 'anchor', printed: pr.text || undefined, printed_lines: pr.text ? pr.lines : undefined });
  }
  // the lines of a paragraph block from a heading line down to (not including) the next line matching stop, or the footer
  function blockFrom(L, first, stopRe) {
    const out = [first];
    for (const l of L) { if (l.y >= first.y) continue; const prev = out[out.length - 1];
      if (stopRe.test(l.text) || /©/.test(l.text) || prev.y - l.y > Math.max(prev.h, l.h) * 2.6) break; out.push(l); }
    return out;
  }
  const blockPlace = (key, ls, page) => box({ id: key, key, kind: 'block', page: page.n, x: Math.min(...ls.map(l => l.x0)), y: ls[ls.length - 1].y, w: Math.max(...ls.map(l => l.x1)) - Math.min(...ls.map(l => l.x0)), h: ls[0].y + ls[0].h - ls[ls.length - 1].y,
    label: LABELS[key] || key, source: 'anchor', lines: ls.map(l => ({ x0: r1(l.x0), x1: r1(l.x1), y: r1(l.y), h: r1(l.h) })) });

  // Chattels as listed on Schedule 2: "Stove ( ) Rangehood (1 )" and plain names in columns. qty: a number, '' (empty brackets), or
  // null (no brackets). Each with where it sits, so a chattel the buyer leaves out can be struck through on the schedule.
  function parseChattels(ls) {
    const out = [];
    for (const l of ls) {
      const parts = []; const re = /([A-Za-z][A-Za-z0-9/&'’ .,-]*?)\s*\(\s*(\d*)\s*\)/g; let m, last = 0;
      while ((m = re.exec(l.text))) { if (m.index > last) parts.push({ s: l.text.slice(last, m.index), at: last }); parts.push({ s: m[1], at: m.index, qty: m[2] === '' ? '' : +m[2], end: m.index + m[0].length }); last = re.lastIndex; }
      if (last < l.text.length) parts.push({ s: l.text.slice(last), at: last });
      for (const p of parts) {
        if (p.qty !== undefined) { const nm = p.s.trim(); if (nm) out.push({ name: nm, qty: p.qty, page: l.page, x0: r1(xAt(l, p.at)), x1: r1(xAt(l, p.end)), y: r1(l.y), h: r1(l.h) }); continue; }
        // plain names, split where the columns are (three or more spaces)
        let off = p.at; for (const seg of p.s.split(/(\s{3,})/)) { const nm = seg.trim(); if (nm && !/^\s+$/.test(seg)) { const st = off + seg.indexOf(nm); out.push({ name: nm, qty: null, page: l.page, x0: r1(xAt(l, st)), x1: r1(xAt(l, st + nm.length)), y: r1(l.y), h: r1(l.h) }); } off += seg.length; }
      }
    }
    return out.filter(c => c.name.length >= 3 && c.name.length <= 80);
  }

  function buildMap(pages) {
    const edition = readEdition(pages), places = [], missing = [], found = new Set();
    const add = p => { if (p && !places.some(x => x.id === p.id)) { places.push(p); found.add(p.key); } };
    const PL = allLines(pages);
    const pageOf = re => PL.find(x => x.L.some(l => re.test(l.text)));
    // the front page
    const front = pageOf(/^PAYMENT OF PURCHASE PRICE/) || pageOf(/^PURCHASER:/);
    if (front) {
      const { page, L } = front;
      const dl = findLine(L, /^DATE:/); if (dl) { const m = matchAll(dl, /^DATE:/)[0]; add(textAfter(L, dl, m, 'date', page, null, { kind: 'date' })); }
      const pl = findLine(L, /^PURCHASER:/);
      if (pl) {
        const nom = matchAll(pl, /and\/or nominee/)[0];
        const below = L.find(l => l.y < pl.y - 3 && /registered under the GST Act|^PROPERTY|^The vendor/.test(l.text));
        const bottom = below ? below.y + below.h + 2 : pl.y - 50;
        const printed = L.filter(l => l.y < pl.y - 2 && l.y > bottom).map(l => l.text.trim()).join(' ').trim();
        add(box({ id: 'purchaser', key: 'purchaser', kind: 'area', page: page.n, x: pl.x0 + 3, y: pl.y - 12, w: (nom ? nom.x0 : page.w - 28) - pl.x0 - 9, h: pl.y - 12 - bottom + FONT_SIZE, label: LABELS.purchaser, source: 'anchor', printed: printed || undefined }));
        if (nom) add(box({ id: 'nominee', key: 'nominee', kind: 'strike', page: page.n, x: nom.x0, y: pl.y, w: nom.x1 - nom.x0, h: pl.h, label: LABELS.nominee, source: 'anchor' }));
      }
      const g = findLine(L, /registered under the GST Act/); if (g) add(yesNoOn(g, 'gst_vendor'));
      const ppv = findLine(L, /Purchase price allocation/); if (ppv) add(yesNoOn(ppv, 'ppa_vendor'));
      const ppp = findLine(L, /Purchaser\s*\/\s*Purchaser.{0,2}s\s*Nominee/); if (ppp) add(yesNoOn(ppp, 'ppa_purchaser'));
      const pr = findLine(L, /^Purchase price\s*:\s*\$/);
      if (pr) { const m = matchAll(pr, /^Purchase price\s*:\s*\$/)[0], plus = matchAll(pr, /Plus GST/)[0], incl = matchAll(pr, /Inclusive of GST/)[0];
        add(textAfter(L, pr, m, 'price', page, plus ? plus.x0 : null));
        if (plus) add(box({ id: 'gst_plus', key: 'gst_plus', kind: 'strike', page: page.n, x: plus.x0, y: pr.y, w: plus.x1 - plus.x0, h: pr.h, label: LABELS.gst_plus, source: 'anchor' }));
        if (incl) add(box({ id: 'gst_incl', key: 'gst_incl', kind: 'strike', page: page.n, x: incl.x0, y: pr.y, w: incl.x1 - incl.x0, h: pr.h, label: LABELS.gst_incl, source: 'anchor' })); }
      const dp = findLine(L, /^Deposit\b.*?:\s*\$/); if (dp) { const m = matchAll(dp, /^Deposit\b.*?:\s*\$/)[0]; add(textAfter(L, dp, m, 'deposit', page, null, { stop: /^Balance of purchase price/ })); }
      const st = findLine(L, /settlement date which is\s*:/); if (st) { const m = matchAll(st, /settlement date which is\s*:/)[0]; add(textAfter(L, st, m, 'settlement', page, null, { stop: /^OR\b/ })); }
      for (const [k, c] of FRONT_CONDITIONS) {
        const cl = L.find(l => l.text.includes(`(clause ${c})`) && /required/i.test(l.text));
        if (!cl) continue;
        add(yesNoOn(cl, 'c_' + k, 'first'));
        const ds = matchAll(cl, /\bdate\b[^:]*:/); const dm = ds[ds.length - 1];
        if (dm) add(textAfter(L, cl, dm, 'd_' + k, page));
      }
      const tn = findLine(L, /^TENANCIES\b/); if (tn) add(yesNoOn(tn, 'tenancies'));
    }
    // Further Terms of Sale
    const ft = pageOf(/^FURTHER TERMS OF SALE/);
    if (ft) { const { page, L } = ft, h = findLine(L, /^FURTHER TERMS OF SALE/), cont = findLine(L, /^Further Terms continued/);
      const top = (cont && cont.y < h.y && h.y - cont.y < 30 ? cont.y : h.y) - 16, foot = L.filter(l => /©/.test(l.text)).map(l => l.y + l.h).sort((a, b) => b - a)[0] || 40;
      const pl = L.filter(l => l.y < top + 4 && l.y > foot + 2 && !/^Further Terms continued/.test(l.text));
      const nums = pl.map(l => /^\s*(\d{1,2})\s*[.)]/.exec(l.text)).filter(Boolean).map(m => +m[1]);
      add(box({ id: 'further_terms', key: 'further_terms', kind: 'area', page: page.n, x: h.x0 + 2, y: top, w: page.w - h.x0 - 30, h: top - foot - 10 + FONT_SIZE, label: LABELS.further_terms, source: 'anchor',
        printed: pl.map(l => l.text.trim()).join(' ').trim() || undefined, printed_count: pl.length || undefined, printed_bottom: pl.length ? r1(Math.min(...pl.map(l => l.y))) : undefined, printed_last: nums.length ? Math.max(...nums) : undefined, foot: r1(foot) })); }
    // the appendix: 21.2, 21.3 and 22.0
    const ftIdx = ft ? ft.page.n : 0;
    const ap = PL.find(x => x.page.n > ftIdx && x.L.some(l => /^Appendix\b/.test(l.text)) && x.L.some(l => /^2[12]\.\d\b/.test(l.text)))
      || PL.find(x => x.page.n > ftIdx && x.L.some(l => /^21\.2\b/.test(l.text)) && x.L.some(l => /^22\.0\b/.test(l.text)))
      || PL.find(x => x.page.n > ftIdx && x.L.some(l => /^22\.0\b/.test(l.text)));
    if (ap) { const { page, L } = ap;
      const c212 = findLine(L, /^21\.2\b/), c213 = findLine(L, /^21\.3\b/), c22 = findLine(L, /^22\.0\b/);
      if (c212) add(blockPlace('clause21_2', blockFrom(L, c212, /^2[12]\.\d\b/), page));
      if (c213) add(blockPlace('clause21_3', blockFrom(L, c213, /^2[12]\.\d\b|^23\.\d/), page));
      if (c22) { const ls = blockFrom(L, c22, /^2[3-9]\.\d\b/); add(blockPlace('clause22', ls, page));
        // the working days space: the word before the last "working day(s)" in the block
        for (let i = ls.length - 1; i >= 0; i--) { const ms = matchAll(ls[i], /\bworking\b/); if (!ms.length) continue; const wm = ms[ms.length - 1];
          const before = ls[i].text.slice(0, wm.start), pm = /(\S+)\s*$/.exec(before), word = pm ? pm[1] : '';
          if (numberIn(word) != null) { const st = wm.start - (before.length - before.trimEnd().length) - word.length;
            add(box({ id: 'clause22_days', key: 'clause22_days', kind: 'text', page: page.n, x: xAt(ls[i], st), y: ls[i].y, w: xAt(ls[i], st + word.length) - xAt(ls[i], st), h: ls[i].h, label: LABELS.clause22_days, source: 'anchor', printed: word,
              line_x1: r1(ls[i].x1), margin: r1(page.w - 8 - (ls[i].x1 + 6)) }));
          } else add(box({ id: 'clause22_days', key: 'clause22_days', kind: 'text', page: page.n, x: wm.x0 - 30, y: ls[i].y, w: 26, h: ls[i].h, label: LABELS.clause22_days, source: 'anchor' }));
          break; } } }
    // Schedule 1, 2(a): the purchaser's GST registration
    const s1 = pageOf(/^SCHEDULE 1\b|\bSCHEDULE 1\b.*Edition/);
    if (s1) { const l = s1.L.find(x => /^2\(a\)/.test(x.text.trim()) && /purchaser is registered/i.test(x.text)); if (l) add(yesNoOn(l, 'gst_purchaser')); }
    // Schedule 2: chattels
    const s2 = pageOf(/^SCHEDULE 2\b/);
    let chattels = [];
    if (s2) { const { page, L } = s2, hd = findLine(L, /^SCHEDULE 2\b/), stop = L.find(l => l.y < hd.y && /^Both parties should check|^SCHEDULE 3\b/.test(l.text));
      const startL = L.filter(l => l.y < hd.y && /Strike out or add|List all chattels/.test(l.text)).pop() || hd;
      const list = L.filter(l => l.y < startL.y && (!stop || l.y > stop.y));
      chattels = parseChattels(list);
      const lowest = list.length ? list[list.length - 1].y : startL.y, bottom = stop ? stop.y + stop.h + 4 : lowest - 40;
      add(box({ id: 'chattels', key: 'chattels', kind: 'area', page: page.n, x: (list[0] || startL).x0, y: lowest - 13, w: page.w - (list[0] || startL).x0 - 30, h: Math.max(0, lowest - 13 - bottom + FONT_SIZE), label: LABELS.chattels, source: 'anchor' })); }
    // the back page: parties and lawyers
    const bp = pageOf(/^PURCHASER.?S LAWYERS:/);
    if (bp) { const { page, L } = bp;
      const lawyerBlock = (headRe, pre, endRe) => { const h = findLine(L, headRe); if (!h) return;
        const end = L.find(l => l.y < h.y && endRe.test(l.text)); const ls = L.filter(l => l.y < h.y && (!end || l.y > end.y));
        const pick = (re, k, opts) => { const l = ls.find(x => re.test(x.text)); if (!l) return; const m = matchAll(l, re)[0]; add(textAfter(L, l, m, pre + k, page, null, opts)); };
        pick(/^Firm:/, 'firm'); pick(/^Individual Acting:/, 'person'); pick(/^Email:/, 'email'); pick(/^Contact Details:/, 'phone', { kind: 'area' }); pick(/^Email address for service of notices.*?:/, 'service');
        const ph = places.find(p => p.id === pre + 'phone'), sv = places.find(p => p.id === pre + 'service');
        if (ph && sv && sv.y < ph.y) { ph.h = r1(ph.y - sv.y - 4); } };
      lawyerBlock(/^VENDOR.?S LAWYERS:/, 'vl_', /^PURCHASER:/);
      lawyerBlock(/^PURCHASER.?S LAWYERS:/, 'pl_', /^SALE BY|LICENSED REAL ESTATE AGENT/);
      const party = (re, key, never, nextRe) => { const h = findLine(L, re); if (!h) return; const cd = L.find(l => l.y < h.y && /^Contact Details:/.test(l.text));
        if (key) add(box({ id: key, key, kind: 'area', page: page.n, x: h.x0 + 3, y: h.y - 12, w: page.w - h.x0 - 34, h: cd ? h.y - 12 - (cd.y + cd.h) + FONT_SIZE : 24, label: LABELS[key], source: 'anchor',
          printed: L.filter(l => l.y < h.y - 2 && cd && l.y > cd.y + 2).map(l => l.text.trim()).join(' ').trim() || undefined }));
        if (cd) { const m = matchAll(cd, /^Contact Details:/)[0]; const nx = L.find(l => l.y < cd.y && nextRe.test(l.text));
          add(box({ id: never, key: never, kind: 'never', page: page.n, x: m.x1 + 4, y: cd.y, w: page.w - m.x1 - 32, h: nx ? cd.y - nx.y - 4 : cd.h, label: LABELS[never], source: 'anchor' })); } };
      party(/^PURCHASER:/, 'purchaser_back', 'p_contact', /^PURCHASER.?S LAWYERS:/);
      party(/^VENDOR:/, null, 'v_contact', /^VENDOR.?S LAWYERS:/); }
    // signatures, names and witnesses
    const sg = pageOf(/Signature of Purchaser\(s\):/);
    if (sg) { const { page, L } = sg, mid = page.w / 2, hd = findLine(L, /Signature of Purchaser\(s\):/);
      let ip = 0, iv = 0;
      L.filter(l => l.y < hd.y).forEach(l => {
        matchAll(l, /_{12,}/).forEach(m => { const left = m.x0 < mid, i = left ? ++ip : ++iv, k = (left ? 'sig_purchaser_' : 'sig_vendor_') + i;
          add(box({ id: k, key: left ? 'sig_purchaser' : 'sig_vendor', kind: 'signature', page: page.n, x: m.x0, y: l.y + 1, w: m.x1 - m.x0, h: 22, label: (left ? 'Purchaser signature ' : 'Vendor signature ') + i, source: 'anchor' })); });
      });
      let np = 0, nv = 0;
      L.filter(l => l.y < hd.y).forEach(l => {
        matchAll(l, /\bName:/).forEach(m => { const left = m.x0 < mid, i = left ? ++np : ++nv, k = (left ? 'name_purchaser_' : 'name_vendor_') + i;
          const right = left ? mid - 12 : page.w - 28, pr = l.spans.filter(sp => sp.it.x >= m.x1 - 1 && sp.it.x < right).map(sp => sp.it.s).join(' ').trim();
          add(box({ id: k, key: left ? 'name_purchaser' : 'name_vendor', kind: 'name', page: page.n, x: m.x1 + 4, y: l.y, w: right - m.x1 - 4, h: l.h, label: (left ? 'Purchaser name ' : 'Vendor name ') + i, source: 'anchor', printed: pr || undefined })); });
      }); }
    PL.forEach(({ page, L }) => L.filter(l => /^Witness(ed)?\b/.test(l.text.trim())).forEach((l, i) => add(box({ id: `witness_p${page.n}_${i + 1}`, key: 'witness', kind: 'witness', page: page.n, x: l.x0, y: l.y - 22, w: 200, h: 20, label: 'Witness (page ' + page.n + ')', source: 'anchor' }))));
    const want = ['date', 'purchaser', 'nominee', 'gst_vendor', 'price', 'deposit', 'settlement', ...FRONT_CONDITIONS.flatMap(([k]) => ['c_' + k, 'd_' + k]), 'tenancies', 'further_terms', 'clause21_2', 'clause21_3', 'clause22', 'clause22_days', 'chattels',
      'purchaser_back', 'pl_firm', 'pl_person', 'pl_email', 'pl_phone', 'pl_service', 'vl_firm', 'vl_person', 'vl_email', 'vl_phone', 'p_contact', 'sig_purchaser', 'name_purchaser', 'sig_vendor'];
    want.forEach(k => { if (!found.has(k)) missing.push(k); });
    return { edition, edition_checked: editionOk(edition), pages: pages.length, sizes: pages.map(p => [p.w, p.h]), agreement_pages: editionPages(pages, edition), places, missing, chattels };
  }

  // where a place sits on the page, as { bottom, top } in points: an area hangs down from its first line; a line of text sits on
  // its baseline; a block, signature or proposed place rises from its y
  function rectOf(p) {
    if (p.kind === 'area' || p.kind === 'never') return { bottom: p.y + FONT_SIZE - p.h, top: p.y + FONT_SIZE };
    if (['text', 'date', 'yesno', 'strike', 'name'].includes(p.kind)) return { bottom: p.y - 2, top: p.y + p.h };
    if (p.kind === 'block') return { bottom: p.y - 2, top: p.y + p.h };
    return { bottom: p.y, top: p.y + p.h };
  }

  /* ───── the pack's text for the AI, and its proposals back onto the page ───── */
  // each page as numbered lines, so a proposal can name the line it is about (the text is data, never instructions)
  function packText(pages, maxLine) {
    return pages.map(p => ({ page: p.n, lines: lines(p).map(l => ({ i: l.i, t: l.text.replace(/\s+/g, ' ').trim().slice(0, maxLine || 300) })).filter(l => l.t) }));
  }
  // batches of pages for the reader: at most so many pages and characters each
  function packBatches(pt, maxPages, maxChars) {
    const out = []; let cur = [], n = 0;
    for (const p of pt) { const c = p.lines.reduce((a, l) => a + l.t.length + 8, 0);
      if (cur.length && (cur.length >= (maxPages || 6) || n + c > (maxChars || 40000))) { out.push(cur); cur = []; n = 0; }
      cur.push(p); n += c; }
    if (cur.length) out.push(cur); return out;
  }
  const PROPOSAL_KINDS = { initial: { w: 46, h: 18, label: 'Initials' }, sign: { w: 150, h: 22, label: 'Signature' }, ack: { w: 120, h: 18, label: 'Acknowledge' } };
  // an AI proposal { page, line, kind, reason } as a place beside the line it names (an approximate position, for Tim to move)
  function placeFromProposal(pages, pr, i) {
    const page = pages.find(p => p.n === pr.page); if (!page) return null;
    const L = lines(page), l = L.find(x => x.i === pr.line) || L[0]; if (!l) return null;
    const k = PROPOSAL_KINDS[pr.kind] ? pr.kind : 'initial', d = PROPOSAL_KINDS[k];
    const x = Math.min(page.w - d.w - 14, Math.max(l.x1 + 8, page.w - d.w - 40));
    return box({ id: 'ai' + (i + 1), key: 'ai_' + k, kind: k === 'sign' ? 'signature' : k === 'ack' ? 'ack' : 'initial', page: page.n, x, y: l.y - 5, w: d.w, h: d.h, label: d.label + ' (page ' + page.n + ')', source: 'ai', reason: String(pr.reason || '').slice(0, 300), line: l.i });
  }

  /* ───── the drafting rules ───── */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fullDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
  const money = n => '$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const PLACEHOLDERS = { electrical: '[Tim to add his electrical report clause]', technical: '[Tim to add his specified technical report clause]', sale: '[Tim to add his sale of another property clause]', sdd: '[Tim to add his Specified Due Diligence clause]', custom: "[Tim to tick the buyer's own condition wording]" };
  const placeholderFor = (key, title) => PLACEHOLDERS[key] || `[Tim to add his ${String(title || key).toLowerCase()} clause]`;
  const isPlaceholder = s => /^\[Tim to /.test(String(s || ''));
  // does a library rule apply to this offer?
  function ruleApplies(rule, d) {
    const w = (rule && rule.when) || {}, keys = (d.conditions || []).map(c => c.key);
    if (!Object.keys(w).length) return false;
    for (const [k, v] of Object.entries(w)) {
      if (k === 'always') { if (v !== true) return false; }
      else if (k === 'kiwisaver') { if (d.kiwisaver !== v) return false; }
      else if (k === 'condition') { if (!keys.includes(v)) return false; }
      else if (k === 'no_condition') { if (keys.includes(v)) return false; }
      else if (k === 'lawyer_approval') { if (!!d.lawyer_approval !== !!v) return false; }
      else if (k === 'gst_registered') { if (d.gst_registered !== v) return false; }
      else if (k === 'entity') { if (!!String(d.entity || '').trim() !== !!v) return false; }
      else if (k === 'nominee') { if ((d.nominee !== false) !== !!v) return false; }
      else if (k === 'chattels') { if (!!((d.chattels_add || []).length || (d.chattels_exclude || []).length) !== !!v) return false; }
      else if (k === 'settlement') { if (((d.settlement || {}).kind || '') !== v) return false; }
      else return false;
    }
    return true;
  }
  const winAnsi = s => /^[\n\x20-\x7e -ÿ‘’“”•…€]*$/.test(String(s || ''));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sameChattel = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.replace(/s\b/g, '') === y.replace(/s\b/g, '')); };

  // A New Zealand phone number as its national significant digits: +64 21 555 0199, 0064 21 555 0199, (021) 555-0199 and 21 555 0199
  // are all 215550199.
  const nsn = v => { let x = String(v || '').replace(/\D/g, ''); if (x.startsWith('0064')) x = x.slice(4); else if (x.startsWith('64') && x.length >= 10) x = x.slice(2); else if (x.startsWith('0')) x = x.slice(1); return x; };
  // text made plain before it is compared: full-width digits and signs as ordinary ones, every kind of space (non-breaking, thin,
  // full-width and so on) as a plain space, zero-width characters gone, and no spaces around an @ ("b @ example.com")
  const plainText = t => String(t || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, ' ').replace(/\s*@\s*/g, '@');
  // every run of digits in some text that could be a phone number, as national digits (spaces, brackets, dots, dashes, / and _ between)
  const phoneRuns = t => (plainText(t).match(/[+(]?\d[\d\s().\/_\-]{4,}\d/g) || []).map(nsn).filter(x => x.length >= 6);
  // the parties' own contact details, ready to compare: [{ who, email, phone }] -> { emails: [[email, who]], phones: [[digits, who]] }
  function ownContacts(list) {
    const emails = [], phones = [];
    (list || []).forEach(p => { const e = String((p && p.email) || '').trim().toLowerCase(); if (e.length >= 5 && e.includes('@')) emails.push([e, p.who || 'a party']);
      const n = nsn(p && p.phone); if (n.length >= 7) phones.push([n, p.who || 'a party']); });
    return { emails, phones };
  }
  // whose own phone or email a piece of text holds ('' when none)
  function holdsOwn(text, own) {
    const t = plainText(text).toLowerCase(); if (!t) return '';
    const e = own.emails.find(([v]) => t.includes(v)); if (e) return e[1];
    const runs = phoneRuns(t), ph = own.phones.find(([v]) => runs.some(r => r.includes(v))); return ph ? ph[1] : '';
  }
  // The vendor's lawyer from the property file: only from an agreement of the current owners (made at or after cycle_at) that is
  // signed or countersigned, newest first; never a link whose email is a vendor's own.
  function pickVendorLawyer(property, agreements, links, parties) {
    const cyc = (property && property.cycle_at) || '', O = ownContacts(parties || []);
    const ags = (agreements || []).filter(a => ['signed', 'countersigned'].includes(a.status) && (a.created_at || '') >= cyc).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const a of ags) {
      const ls = (links || []).filter(l => l.agreement_id === a.id && !holdsOwn(l.email, O)).sort((x, y) => ((x.sent_at || '') < (y.sent_at || '') ? 1 : -1));
      if (ls[0]) return { firm: ls[0].firm || '', person: ls[0].lawyer_name || '', email: ls[0].email || '', source: 'the lawyer the agency agreement was sent to' };
    }
    return null;
  }

  // input: { details (the offer as it stands), map (places), terms (the library rows), clauses (Tim's wording: {electrical, ...}),
  //   edits ({items: {id: text}, custom_ok, custom_wording, date_format: 'date'|'date_days', extra_terms: [text]}),
  //   today ('YYYY-MM-DD', the day the draft counts working days from), province, vendorLawyer ({firm, person, email, phone, source}),
  //   parties ([{ who, email, phone }]: the vendors and anyone else whose own details must never go on) }
  // returns { items: [{ id, key, place, page, kind: text|area|strike|lines, text, x, y, w, h, label, placeholder }], needs: [{ id, text, blocking }], terms: [...] }
  function planDraft(input) {
    const d = input.details || {}, map = input.map || { places: [] }, E = input.edits || {}, edits = E.items || {}, items = [], needs = [];
    const P = id => (map.places || []).find(p => p.id === id), byKey = k => (map.places || []).filter(p => p.key === k);
    const today = input.today || (OF ? OF.nzToday() : new Date().toISOString().slice(0, 10)), province = input.province || 'otago', fmt = E.date_format === 'date_days' ? 'date_days' : 'date';
    // a blocking item stops approval; an "ackable" one can be cleared by Tim ticking that he has checked it
    const need = (id, text, blocking, ackable) => { if (!needs.some(n => n.id === id)) needs.push(Object.assign({ id, text, blocking: !!blocking }, ackable ? { ackable: true } : {})); };
    const has = k => Object.prototype.hasOwnProperty.call(edits, k);
    const put = (id, place, text, extra) => {
      if (!place) { need('missing_' + id, `There is no place for ${extra && extra.label || id} on this blank. Add it to the places on the blank, or write it in by hand.`, !(extra && extra.optional)); return; }
      let t = Object.prototype.hasOwnProperty.call(edits, id) ? edits[id] : text; if (t == null || t === '') return;
      t = String(t);
      if (!winAnsi(t)) { need('font_' + id, `${extra && extra.label || place.label}: "${t.slice(0, 80)}" has letters the typed font can't show (such as macrons). Write it in by hand, or change it.`, true); return; }
      const it = Object.assign({ id, key: place.key, place: place.id, page: place.page, kind: place.kind === 'area' ? 'area' : 'text', text: t, x: place.x, y: place.y, w: place.w, h: place.h, label: (extra && extra.label) || place.label, edited: Object.prototype.hasOwnProperty.call(edits, id) }, extra && extra.item);
      if (isPlaceholder(t)) { it.placeholder = true; need('ph_' + id, `${it.label}: ${t}`, true); }
      items.push(it); return it;
    };
    const strike = (id, place, label, extra) => { if (!place) return; items.push(Object.assign({ id, key: place.key, place: place.id, page: place.page, kind: 'strike', x: place.x, y: place.y, w: place.w, h: place.h, label }, extra || {})); };
    const strikeYesNo = (id, place, yes, label) => { if (!place || !place.yes) return; const part = yes ? place.no : place.yes;
      items.push({ id, key: place.key, place: place.id, page: place.page, kind: 'strike', x: part.x, y: place.y, w: part.w, h: place.h, label: `${label}: ${yes ? 'Yes' : 'No'}`, value: yes ? 'Yes' : 'No' }); };
    const already = (place, label) => { if (place && place.printed) need('printed_' + place.id, `${label}: the blank already says "${place.printed.slice(0, 120)}". Check it against the offer.`, false); };

    // the date at the top: left blank until fully agreed
    need('date', 'The date at the top is left blank. You add it in full, with the month name, once the agreement is fully agreed.', false);
    // the purchaser: full legal names, or the entity, and "and/or nominee" as chosen
    const names = (d.purchasers || []).map(p => [p.first, p.last].map(x => String(x || '').trim()).filter(Boolean).join(' ')).filter(Boolean);
    const entity = String(d.entity || '').trim();
    const who = entity || (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || '');
    const pp = P('purchaser'); if (pp && pp.printed) already(pp, 'Purchaser');
    put('purchaser', pp, who, { label: 'Purchaser' });
    if (d.nominee === false) strike('nominee', P('nominee'), 'and/or nominee: struck out (the buyer chose no nominee)');
    put('purchaser_back', P('purchaser_back'), who, { label: 'Back page: purchaser', optional: true });
    // names under the purchasers' signature lines (never anyone's contact details)
    const nameSlots = byKey('name_purchaser');
    const signers = entity ? [] : names;
    signers.forEach((n, i) => { if (nameSlots[i]) put('name_purchaser_' + (i + 1), nameSlots[i], n, { label: 'Purchaser name ' + (i + 1) }); });
    // signing (phase 3) adds a signature and name place for each purchaser beyond the printed lines, beneath the others
    if (signers.length > nameSlots.length) need('names_more', `There are ${signers.length} purchasers and ${nameSlots.length} name places under the signatures. Signing adds places for the others beneath, with their names. Check there is room on that page.`, false);
    if (entity) need('entity_signers', `The purchaser is ${entity}. Fill in who signs for it, and which of Director, Trustee and so on applies, under the signatures.`, false);
    // GST: the front page asks about the vendor's registration: always yours. Schedule 1, 2(a) is the purchaser's: only if they said.
    need('gst_vendor', "GST on the front page is the vendor's registration: fill it in yourself.", false);
    if (d.gst_registered === true || d.gst_registered === false) {
      const g = P('gst_purchaser');
      if (g) strikeYesNo('gst_purchaser', g, d.gst_registered, "Schedule 1, 2(a), the purchaser's GST registration");
      need('gst_schedule', `The buyer says they are ${d.gst_registered ? '' : 'not '}registered for GST for this purchase${d.gst_number ? ` (GST number ${d.gst_number})` : ''}. Schedule 1 is only completed if the vendor is registered.`, false);
    } else need('gst_unknown', 'The buyer did not say whether they are registered for GST for this purchase.', false);
    // price
    if (d.price != null) put('price', P('price'), money(+d.price), { label: 'Purchase price' });
    need('gst_inclusive', 'Plus GST or inclusive of GST: strike out one if it applies (if neither is struck out, the price includes GST, if any).', false);
    // deposit: the blank's own (printed) unless it has none
    const dp = P('deposit'); if (dp && dp.printed) need('deposit', `Deposit: the blank already says "${dp.printed.slice(0, 120)}". Left as it is.`, false);
    else if (dp) need('deposit_empty', 'Deposit: the blank has no deposit filled in. Add it.', true);
    // settlement
    const s = d.settlement || {}, sp = P('settlement');
    let settleText = '';
    if (s.kind === 'date' && s.date) { const on = OF ? OF.onOrBefore(s.date, { province }) : s.date; settleText = fullDate(on);
      if (on !== s.date) need('settlement_moved', `Settlement: the buyer chose ${fullDate(s.date)}, which isn't a working day, so the agreement says ${fullDate(on)} (the working day before). Check it with them.`, false); }
    else if (s.kind === 'relative' && +s.days >= 1) settleText = daysWords(+s.days) + ' from the date of confirmation of this agreement';
    if (sp && sp.printed) {
      const same = s.kind === 'relative' && numberIn(sp.printed) === +s.days && /working day/i.test(sp.printed) && /confirmation/i.test(sp.printed);
      if (same) need('settlement_same', `Settlement: the blank already says "${sp.printed.slice(0, 120)}", which matches the offer.`, false);
      else if (settleText) { const pls = sp.printed_lines && sp.printed_lines.length ? sp.printed_lines : [{ x0: sp.x, x1: sp.x + Math.min(sp.w, 240), y: sp.y, h: sp.h }], low = Math.min(...pls.map(l => l.y));
        items.push({ id: 'settlement_struck', key: 'settlement', place: sp.id, page: sp.page, kind: 'lines', lines: pls, x: Math.min(...pls.map(l => l.x0)), y: low, w: Math.max(...pls.map(l => l.x1)) - Math.min(...pls.map(l => l.x0)), h: sp.h, label: 'Settlement: the wording already on the blank, struck out' });
        put('settlement', Object.assign({}, sp, { y: low - 9.5 }), settleText, { label: 'Settlement date' });
        need('settlement_changed', `Settlement: the blank already said "${sp.printed.slice(0, 120)}". It is struck out and the offer's settlement written under it. Check it.`, false); }
    } else if (settleText) put('settlement', sp, settleText, { label: 'Settlement date' });
    // the six front-page conditions: Yes or No, and the date
    const cond = k => (d.conditions || []).find(c => c.key === k);
    const dateText = c => { if (!OF) return c.date || `${c.days} working days`; const r = OF.conditionDate(c, today, province); if (!r) return '';
      if (r.adjusted) need('moved_' + c.key, `${(OF.condInfo(c.key) || { label: c.key }).label}: the buyer chose ${fullDate(r.chosen)}, which isn't a working day, so the agreement says ${fullDate(r.date)} (the working day before). Check it with them.`, false);
      return fmt === 'date_days' ? `${fullDate(r.date)} (${r.days} working ${r.days === 1 ? 'day' : 'days'})` : fullDate(r.date); };
    for (const [k, clause] of FRONT_CONDITIONS) {
      const c = cond(k), yn = P('c_' + k), label = `${(OF && OF.condInfo(k) || { label: k }).label} (clause ${clause})`;
      if (!yn) { if (c) need('missing_c_' + k, `There is no Yes/No for ${label} on this blank. Add it to the places on the blank.`, true); continue; }
      strikeYesNo('c_' + k, yn, !!c, label);
      if (c) put('d_' + k, P('d_' + k), dateText(c), { label: label + ': date' });
    }
    if ((d.conditions || []).some(c => c.days && !c.date)) need('days_from', `Condition dates given as working days are counted from today (${fullDate(today)}). On the agreement they run from the day everyone signs, so check them on the day.`, false);
    // tenancies: not on the offer form
    need('tenancies', 'Tenancies: Yes or No is for you to fill in.', false);
    // the clause library
    const terms = (input.terms || []).filter(t => t.active !== false).sort((a, b) => (a.position || 0) - (b.position || 0)), ft = [];
    const T = k => terms.find(t => t.key === k);
    // deposit clauses 21.2 and 21.3 are printed; a rule keeps the one that applies and may strike the other
    [['deposit_nzret', 'clause21_2'], ['deposit_kiwisaver', 'clause21_3']].forEach(([k, pid]) => { const t = T(k); if (!t) return; const on = ruleApplies(t.rule, d);
      if (on) need('keep_' + k, `${t.title}: kept, as the buyer answered ${d.kiwisaver ? 'yes' : 'no'} to KiwiSaver.`, false);
      else if ((t.rule || {}).strike_when_unused && P(pid)) strike('strike_' + pid, P(pid), `${t.title}: struck through (does not apply)`, { kind: 'lines', lines: P(pid).lines }); });
    // lawyer's approval: printed clause 22.0 struck through when not chosen; its working days filled in when it is
    const law = cond('lawyer'), c22 = P('clause22'), t22 = T('lawyer_approval');
    if (law) {
      if (!c22) need('missing_clause22', "The buyer chose lawyer's approval, but this blank has no clause 22.0. Add it as a further term.", true);
      else { const r = OF ? OF.conditionDate(law, today, province) : null, n = law.days ? +law.days : r ? r.days : null, dp22 = P('clause22_days');
        if (n && dp22) { if (dp22.printed) { if (numberIn(dp22.printed) !== n) { strike('clause22_days_struck', dp22, "Clause 22.0: the working days already on the blank, struck out");
              // the new count goes in the margin at the end of that line, with a caret under the struck word, so it never touches the line above;
              // only with no margin does it go just above the struck word, small
              if ((dp22.margin || 0) >= 14) { put('clause22_days', Object.assign({}, dp22, { x: dp22.line_x1 + 6, w: Math.min(dp22.margin, 40) }), String(n), { label: "Clause 22.0: working days" });
                items.push({ id: 'clause22_caret', key: 'clause22_days', place: dp22.id, page: dp22.page, kind: 'caret', x: dp22.x + dp22.w / 2, y: dp22.y, w: 4, h: 2.5, label: 'Clause 22.0: where the new count goes' });
                need('clause22_margin', `Clause 22.0: the blank said "${dp22.printed}" working days. It is struck out and ${n} is written in the margin at the end of that line. Check it reads clearly.`, false); }
              else put('clause22_days', Object.assign({}, dp22, { x: dp22.x + dp22.w / 2 - 2, y: dp22.y + dp22.h * 0.62, w: 40 }), String(n), { label: "Clause 22.0: working days", item: { size: 6 } }); }
            else need('clause22_same', `Clause 22.0 already says ${dp22.printed} working day${n === 1 ? '' : 's'}, which matches the offer.`, false); }
          else put('clause22_days', dp22, String(n), { label: "Clause 22.0: working days" }); }
        if (law.date) need('clause22_date', `Lawyer's approval: the buyer gave a date (${fullDate(law.date)}); clause 22.0 counts working days, so ${n} working days from today is used. Check it.`, false); }
    } else if (c22 && (!t22 || (t22.rule || {}).strike_when_unused !== false)) strike('clause22', c22, "Clause 22.0 (lawyer's approval): struck through, not chosen", { kind: 'lines', lines: c22.lines });
    // further terms: Tim's clauses by rule, from the library, in its order
    let ftn = 0; const term = (id, title, text, extra) => { ft.push(Object.assign({ id, title, text }, extra || {})); };
    for (const t of terms) {
      if (t.kind !== 'further_term' || t.key === 'chattels' || !ruleApplies(t.rule, d)) continue;
      if (t.wording_from === 'custom') {
        const c = cond('custom'); if (!c) continue;
        const w = String(E.custom_wording || c.wording || '').trim();
        if (E.custom_ok && w) term('ft_custom', "Purchaser's condition", w, { custom: true, request: c.request || '', wording: c.wording || '', ai: !!c.ai, date: dateText(c) });
        else term('ft_custom', "Purchaser's condition", PLACEHOLDERS.custom, { custom: true, request: c.request || '', wording: c.wording || '', ai: !!c.ai, date: dateText(c) });
        continue;
      }
      let w = t.wording_from ? String((input.clauses || {})[t.wording_from] || '').trim() : String(t.wording || '').trim();
      const c = t.wording_from ? cond(t.wording_from) : null;
      if (!w) w = placeholderFor(t.wording_from || t.key, t.title);
      else if (c) w = w.replace(/\{detail\}/g, c.detail || '').replace(/\{address\}/g, d.sale_address || '').replace(/\{date\}/g, dateText(c));
      term('ft_' + t.key, t.title, w, c ? { date: dateText(c), detail: c.detail || (t.wording_from === 'sale' ? d.sale_address : '') } : {});
    }
    if (cond('sale')) need('sale_address_seen', `Sale of another property: the buyer's own address (${d.sale_address || 'not given'}) is named in that further term, so the vendors will see it on the agreement. Check the buyer is happy with that.`, false);
    (E.extra_terms || []).map(x => String(x || '').trim()).filter(Boolean).forEach((x, i) => term('ft_extra_' + (i + 1), 'Your further term', x));
    // chattels: on the schedule (strike out or add), or as a further term, as the library says
    const chT = T('chattels'), where = ((chT && chT.rule) || {}).where === 'further_terms' ? 'further_terms' : 'schedule';
    const add = (d.chattels_add || []).filter(Boolean), exc = (d.chattels_exclude || []).filter(Boolean);
    if (add.length || exc.length) {
      if (where === 'schedule' && P('chattels')) {
        if (add.length) put('chattels_add', P('chattels'), 'Also included: ' + add.join(', '), { label: 'Schedule 2: chattels added' });
        exc.forEach((x, i) => { const hit = (input.map.chattels || []).find(c => sameChattel(c.name, x));
          if (hit) items.push({ id: 'chattel_x_' + (i + 1), key: 'chattels', place: 'chattels', page: hit.page, kind: 'strike', x: hit.x0, y: hit.y, w: hit.x1 - hit.x0, h: hit.h, label: `Schedule 2: ${hit.name} struck out (excluded)` });
          else need('chattel_x_' + (i + 1), `The buyer wants "${x}" left out, but it isn't on Schedule 2. Add it to the further terms if it matters.`, false); });
      } else {
        const w = chT && String(chT.wording || '').trim();
        term('ft_chattels', 'Chattels', w ? w.replace(/\{add\}/g, add.join(', ')).replace(/\{exclude\}/g, exc.join(', ')) : placeholderFor('chattels', 'chattels'), { detail: [add.length ? 'Add: ' + add.join(', ') : '', exc.length ? 'Leave out: ' + exc.join(', ') : ''].filter(Boolean).join('. ') });
      }
    }
    // the further terms go on as a numbered list (a placeholder for anything Tim hasn't worded)
    let ftp = P('further_terms');
    if (ft.length && ftp && ftp.printed_bottom != null) {
      // terms already printed on the page: ours start below the lowest printed line, numbered on from the last printed number
      const top = ftp.printed_bottom - 14, cut = ftp.y - top; ftp = Object.assign({}, ftp, { y: top, h: ftp.h - cut }); ftn = ftp.printed_last || 0;
      need('further_printed', `The Further Terms page already has ${ftp.printed_count} printed line${ftp.printed_count === 1 ? '' : 's'}${ftp.printed_last ? `, numbered to ${ftp.printed_last}` : ''}. The offer's terms start below the lowest of them, numbered from ${ftn + 1}. This layout hasn't been checked on a real blank yet: look at the page before you approve.`, true, true);
    }
    if (ft.length) {
      const text = ft.map(x => { ftn++; const edited = Object.prototype.hasOwnProperty.call(edits, x.id) ? String(edits[x.id] || '') : null; const body = edited != null ? edited : x.text; x.number = ftn; x.text = body;
        return `${ftn}. ${x.title}${x.detail ? ' (' + x.detail + ')' : ''}: ${body}${x.date && !/\{date\}/.test(body) ? ' Condition date: ' + x.date + '.' : ''}`; });
      const it = put('further_terms', ftp, text.join('\n'), { label: 'Further terms of sale', item: { term_texts: text, terms: ft.map(x => ({ id: x.id, number: x.number, title: x.title, text: x.text, placeholder: isPlaceholder(x.text), custom: !!x.custom, request: x.request, wording: x.wording, ai: x.ai })) } });
      ft.filter(x => isPlaceholder(x.text)).forEach(x => need('ph_' + x.id, `Further term ${x.number}, ${x.title}: ${x.text}`, true));
    }
    // the lawyers' details, and only theirs: never a purchaser's or vendor's own phone or email
    const L = d.lawyer || {};
    put('pl_firm', P('pl_firm'), L.firm, { label: "Purchaser's lawyers: firm", optional: true });
    put('pl_person', P('pl_person'), L.person, { label: "Purchaser's lawyers: individual acting", optional: true });
    put('pl_email', P('pl_email'), L.email, { label: "Purchaser's lawyers: email", optional: true });
    put('pl_phone', P('pl_phone'), L.phone, { label: "Purchaser's lawyers: contact details", optional: true });
    put('pl_service', P('pl_service'), has('pl_email') ? edits.pl_email : L.email, { label: "Purchaser's lawyers: email for notices", optional: true });   // follows Tim's edit of the email
    if (!L.firm && !L.person) need('lawyer_none', "The buyer hasn't named a lawyer yet.", false);
    else if (!L.email || !L.phone) need('lawyer_lookup', "The purchaser's lawyer's email or phone is missing. Use Find the lawyer's details.", false);
    const V = input.vendorLawyer || null, vlEmpty = ['vl_firm', 'vl_person', 'vl_email'].every(k => !(P(k) || {}).printed);
    if (vlEmpty && V && (V.firm || V.person)) {
      put('vl_firm', P('vl_firm'), V.firm, { label: "Vendor's lawyers: firm", optional: true }); put('vl_person', P('vl_person'), V.person, { label: "Vendor's lawyers: individual acting", optional: true });
      put('vl_email', P('vl_email'), V.email, { label: "Vendor's lawyers: email", optional: true }); put('vl_phone', P('vl_phone'), V.phone, { label: "Vendor's lawyers: contact details", optional: true });
      put('vl_service', P('vl_service'), V.email, { label: "Vendor's lawyers: email for notices", optional: true });
      need('vendor_lawyer_from', `Vendor's lawyers: taken from ${V.source || 'the property file'}. Check they are acting on this sale.`, false);
    } else if (vlEmpty) need('vendor_lawyer_none', "The vendor's lawyers aren't on the blank or the property file. Add them.", false);
    // privacy: a purchaser's or vendor's own phone or email never goes on, wherever it came from (the offer, Tim's edits, a further
    // term, the buyer's own wording, chattels, a lawyer's field typed by mistake, or the vendor's lawyer on file). Phones are compared
    // by their national digits, emails without regard to case, also inside a sentence. Any hit is left off and blocks approval.
    const own = [];
    (d.purchasers || []).forEach(p => own.push({ who: 'a purchaser', email: p.email, phone: p.phone })); own.push({ who: 'the buyer', email: d.email, phone: d.phone });
    (input.parties || []).forEach(p => own.push({ who: p.who || 'a vendor', email: p.email, phone: p.phone }));
    const O = ownContacts(own);
    for (let i = items.length - 1; i >= 0; i--) { const hit = holdsOwn(items[i].text, O); if (!hit) continue;
      need('privacy_' + items[i].id, `${items[i].label}: left off, because it holds ${hit}'s own phone or email. Only the lawyers' details go on the agreement.`, true); items.splice(i, 1); }
    if (!needs.find(n => n.id === 'privacy_check')) need('privacy_check', "Only the lawyers' contact details are on the agreement, never the purchasers' or vendors' own.", false);
    return { items, needs, terms: ft, today, date_format: fmt };
  }

  /* ───── the drafted PDF ───── */
  // wrap text into lines no wider than w at the given size
  function wrap(font, text, size, w) {
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean); let cur = '';
      for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (font.widthOfTextAtSize(t, size) <= w || !cur) cur = t; else { out.push(cur); cur = wd; } }
      out.push(cur);
    }
    return out;
  }
  // The blank with the plan added on top. The original pages and their content are untouched: pdf-lib adds a new content stream to
  // each page it writes on. A further terms list too long for its page continues on a page added straight after it, headed
  // "Further Terms of Sale (continued)". Returns { bytes, boxes: what was placed, where (for the review screen), continued }.
  async function renderDraft(PDFLib, blankBytes, plan, opts) {
    const o = opts || {};
    const doc = await PDFLib.PDFDocument.load(blankBytes, { updateMetadata: false });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const ink = PDFLib.rgb(INK[0], INK[1], INK[2]), hl = PDFLib.rgb(1, 0.93, 0.45);
    const pages = doc.getPages(), boxes = [], overflow = []; let continued = null, pending = null;
    for (const it of plan.items) {
      const pg = pages[it.page - 1]; if (!pg) continue;
      if (it.kind === 'caret') {   // a small ^ under a struck word, pointing to the margin
        pg.drawLine({ start: { x: it.x - 2.2, y: it.y - 2.8 }, end: { x: it.x, y: it.y - 0.6 }, thickness: 0.7, color: ink }); pg.drawLine({ start: { x: it.x, y: it.y - 0.6 }, end: { x: it.x + 2.2, y: it.y - 2.8 }, thickness: 0.7, color: ink });
        boxes.push({ id: it.id, page: it.page, x: it.x - 3, y: it.y - 3, w: 6, h: 3, kind: 'strike', label: it.label }); continue;
      }
      if (it.kind === 'strike' || it.kind === 'lines') {
        const ls = it.kind === 'lines' ? it.lines : [{ x0: it.x, x1: it.x + it.w, y: it.y, h: it.h }];
        ls.forEach(l => pg.drawLine({ start: { x: l.x0 - 1, y: l.y + l.h * 0.32 }, end: { x: l.x1 + 1, y: l.y + l.h * 0.32 }, thickness: 0.9, color: ink }));
        boxes.push({ id: it.id, page: it.page, x: Math.min(...ls.map(l => l.x0)), y: Math.min(...ls.map(l => l.y)), w: Math.max(...ls.map(l => l.x1)) - Math.min(...ls.map(l => l.x0)), h: Math.max(...ls.map(l => l.y + l.h)) - Math.min(...ls.map(l => l.y)), kind: 'strike', label: it.label });
        continue;
      }
      let size = it.size || FONT_SIZE; const lh = size * 1.25;
      if (it.kind === 'text') {
        let t = it.text; while (size > 6.5 && font.widthOfTextAtSize(t, size) > it.w) size -= 0.25;
        const lines_ = font.widthOfTextAtSize(t, size) > it.w ? wrap(font, t, size, Math.max(it.w, 40)) : [t];
        lines_.forEach((ln, i) => { const y = it.y - i * size * 1.2; if (it.placeholder) pg.drawRectangle({ x: it.x - 1, y: y - 2, width: font.widthOfTextAtSize(ln, size) + 2, height: size + 2, color: hl });
          pg.drawText(ln, { x: it.x, y, size, font, color: ink }); });
        boxes.push({ id: it.id, page: it.page, x: it.x, y: it.y - (lines_.length - 1) * size * 1.2 - 2, w: Math.max(...lines_.map(l => font.widthOfTextAtSize(l, size))), h: lines_.length * size * 1.2 + 2, kind: 'text', label: it.label, placeholder: !!it.placeholder });
        continue;
      }
      // an area: wrapped lines from the top down; any that don't fit continue on an added page (further terms only). Further terms
      // are written one term at a time with a blank line after each, where the parties initial it (signing, phase 3); each line
      // remembers its term, so the term's place on the page is known.
      const ftl = it.key === 'further_terms' && Array.isArray(it.term_texts) && it.terms && it.terms.length === it.term_texts.length;
      const all = ftl ? it.term_texts.flatMap((tt, k) => wrap(font, tt, size, it.w).map(s => ({ s, term: it.terms[k].number })).concat([{ s: '', term: it.terms[k].number, gap: true }])) : wrap(font, it.text, size, it.w);
      let fit = Math.max(1, Math.floor((it.h - size) / lh) + 1);
      if (it.key === 'further_terms' && all.length > fit) fit = Math.max(1, fit - 1);   // the last line is kept for the "continued" note
      const here = all.slice(0, fit); let rest = all.slice(fit);
      if (ftl && rest.every(l => l.gap)) rest = [];   // only the blank line after the last term is left over: no page is added for it
      const txt = l => typeof l === 'string' ? l : l.s;
      // where each further term sits on a page: its lines, and the blank line after it (for the initials)
      const termBoxes = (ls, x, y0, pageNo, w) => { const seen = new Map(); ls.forEach((l, i) => { if (typeof l === 'string') return; const y = y0 - i * lh;
          if (!seen.has(l.term)) seen.set(l.term, { top: y + size, bottom: y - 2, gap: null });
          const t = seen.get(l.term); if (l.gap) t.gap = { x, y: y - 2, w, h: lh }; else t.bottom = y - 2; });
        seen.forEach((t, num) => boxes.push({ id: it.id + '#t' + num, page: pageNo, x, y: t.bottom, w, h: t.top - t.bottom, kind: 'term', number: num, gap: t.gap, label: it.label + ': term ' + num })); };
      const drawLines = (p, ls, x, y0, pageNo) => { ls.forEach((l, i) => { const ln = txt(l); if (!ln) return; const y = y0 - i * lh; const ph = /\[Tim to [^\]]*\]/.exec(ln);
          if (ph) { const pre = ln.slice(0, ph.index); pg_hl(p, x + font.widthOfTextAtSize(pre, size) - 1, y - 2, font.widthOfTextAtSize(ph[0], size) + 2, size + 2); }
          p.drawText(ln, { x, y, size, font, color: ink }); });
        let n = ls.length; while (n > 1 && !txt(ls[n - 1])) n--;   // the box covers the written lines (not the trailing blank one)
        boxes.push({ id: it.id, page: pageNo, x, y: y0 - (n - 1) * lh - 2, w: it.w, h: (n - 1) * lh + size + 4, kind: 'area', label: it.label, placeholder: ls.some(l => /\[Tim to /.test(txt(l))) });
        if (ftl) termBoxes(ls, x, y0, pageNo, it.w); };
      const pg_hl = (p, x, y, w, h) => p.drawRectangle({ x, y, width: w, height: h, color: hl });
      drawLines(pg, here, it.x, it.y, it.page);
      if (rest.length) {
        // anything but the further terms that doesn't fit is cut off: that blocks approval until Tim deals with it
        if (it.key !== 'further_terms') { overflow.push({ id: it.id, label: it.label, lines: rest.length });
          if (plan.needs) plan.needs.push({ id: 'overflow_' + it.id, text: `${it.label}: ${rest.length} line${rest.length === 1 ? '' : 's'} didn't fit in the space on the blank and ${rest.length === 1 ? 'is' : 'are'} not on the draft. Shorten it, or move it to the further terms.`, blocking: true });
          continue; }
        pending = { it, rest, size, lh, noteY: it.y - here.length * lh };
      }
    }
    // further terms that didn't fit: pages added straight after the Further Terms page, then every later page's boxes move along
    if (pending) {
      const { it, rest, size, lh, noteY } = pending, pg = pages[it.page - 1], [w, h] = [pg.getWidth(), pg.getHeight()], n = Math.max(1, Math.floor((h - 130) / lh));
      let at = it.page, left = rest, added = 0; continued = it.page + 1;
      // say so at the foot of the Further Terms page itself
      const note = 'Continued on the next page.', ny = noteY;
      pg.drawText(note, { x: it.x, y: ny, size: 8, font: bold, color: ink }); boxes.push({ id: it.id + '_contnote', page: it.page, x: it.x, y: ny - 2, w: bold.widthOfTextAtSize(note, 8), h: 10, kind: 'text', label: it.label + ': continued on the next page' });
      while (left.length) {
        const np = doc.insertPage(at, [w, h]); at++; added++;
        np.drawText('Further Terms of Sale (continued)', { x: 40, y: h - 60, size: 13, font: bold, color: ink });
        np.drawText(`Continued from page ${it.page}.`, { x: 40, y: h - 76, size: 8, font, color: ink });
        const ls = left.slice(0, n); left = left.slice(n);
        const T = l => typeof l === 'string' ? l : l.s;
        ls.forEach((l, i) => { const ln = T(l); if (!ln) return; const y = h - 100 - i * lh, ph = /\[Tim to [^\]]*\]/.exec(ln);
          if (ph) np.drawRectangle({ x: 40 + font.widthOfTextAtSize(ln.slice(0, ph.index), size) - 1, y: y - 2, width: font.widthOfTextAtSize(ph[0], size) + 2, height: size + 2, color: hl });
          np.drawText(ln, { x: 40, y, size, font, color: ink }); });
        boxes.push({ id: it.id + '_cont' + added, page: -at, x: 40, y: h - 100 - (ls.length - 1) * lh - 2, w: w - 80, h: (ls.length - 1) * lh + size + 4, kind: 'area', label: it.label + ' (continued)', placeholder: ls.some(l => /\[Tim to /.test(T(l))) });
        if (typeof ls[0] !== 'string') { const seen = new Map(); ls.forEach((l, i) => { const y = h - 100 - i * lh; if (!seen.has(l.term)) seen.set(l.term, { top: y + size, bottom: y - 2, gap: null }); const t = seen.get(l.term); if (l.gap) t.gap = { x: 40, y: y - 2, w: w - 80, h: lh }; else t.bottom = y - 2; });
          seen.forEach((t, num) => boxes.push({ id: it.id + '#t' + num, page: -at, x: 40, y: t.bottom, w: w - 80, h: t.top - t.bottom, kind: 'term', number: num, gap: t.gap, label: it.label + ': term ' + num })); }
      }
      boxes.forEach(b => { if (b.page < 0) b.page = -b.page; else if (b.page > it.page) b.page += added; });
    }
    if (o.title) doc.setTitle(o.title, { showInWindowTitleBar: false });
    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
    return { bytes, boxes, continued, overflow };
  }

  // what a draft placed, where, as filed with it (offer_drafts.placed): each item with its boxes on the page, the map place it filled
  // (so signing groups a struck line and the words beside it as one change), and for the further terms, where each term sits and
  // the blank line after it (where each party initials it)
  function placedFrom(plan, r) {
    const rb = x => ({ page: x.page, x: Math.round(x.x * 10) / 10, y: Math.round(x.y * 10) / 10, w: Math.round(x.w * 10) / 10, h: Math.round(x.h * 10) / 10 });
    return plan.items.map(it => { const bx = r.boxes.filter(x => x.id === it.id || x.id.startsWith(it.id + '_cont'));
      const tb = it.id === 'further_terms' ? r.boxes.filter(x => x.kind === 'term').map(x => Object.assign(rb(x), { number: x.number, gap: x.gap ? rb(Object.assign({ page: x.page }, x.gap)) : null })) : undefined;
      return { id: it.id, place: it.place || null, key: it.key || null, label: it.label, kind: it.kind, text: it.text || null, value: it.value || null, placeholder: !!it.placeholder, edited: !!it.edited, terms: it.terms, boxes: bx.map(rb), term_boxes: tb }; });
  }

  const DRAFT = { placedFrom, EDITIONS, EDITION_RE, editionOk, readPages, lines, xAt, matchAll, readEdition, editionPages, buildMap, parseChattels, numberIn, daysWords, FRONT_CONDITIONS, LABELS,
    packText, packBatches, placeFromProposal, rectOf, nsn, phoneRuns, plainText, ownContacts, holdsOwn, pickVendorLawyer, PROPOSAL_KINDS, planDraft, ruleApplies, fullDate, PLACEHOLDERS, placeholderFor, isPlaceholder, winAnsi, renderDraft, wrap, INK, FONT_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = DRAFT; else root.DRAFT = DRAFT;
})(typeof window !== 'undefined' ? window : globalThis);
