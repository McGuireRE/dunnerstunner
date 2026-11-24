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
      // the style the page's own printed terms use: "22.0" (the portal's appendix clauses) or "1." / "1)"; none printed: null
      const pstyle = pl.some(l => /^\s*\d{1,2}\.0\b/.test(l.text)) ? 'dot0' : pl.some(l => /^\s*\d{1,2}\s*[.)](\s|$)/.test(l.text)) ? 'dot' : null;
      add(box({ id: 'further_terms', key: 'further_terms', kind: 'area', page: page.n, x: h.x0 + 2, y: top, w: page.w - h.x0 - 30, h: top - foot - 10 + FONT_SIZE, label: LABELS.further_terms, source: 'anchor',
        printed: pl.map(l => l.text.trim()).join(' ').trim() || undefined, printed_count: pl.length || undefined, printed_bottom: pl.length ? r1(Math.min(...pl.map(l => l.y))) : undefined, printed_last: nums.length ? Math.max(...nums) : undefined, printed_style: pstyle || undefined, foot: r1(foot) })); }
    // the appendix: 21.2, 21.3 and 22.0
    const ftIdx = ft ? ft.page.n : 0;
    const ap = PL.find(x => x.page.n >= ftIdx && x.L.some(l => /^Appendix\b/.test(l.text)) && x.L.some(l => /^2[12]\.\d\b/.test(l.text)))
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
    // Numbering the further terms (Tim, 24 November 2026): on from the last general terms clause, read from the blank's own text (the
    // agreement's pages other than the further terms and appendix pages), and from the highest clause printed on the appendix
    const agp = editionPages(pages, edition), numbering = { general_last: 0, appendix_last: 0, printed_last: 0, ft_page: ft ? ft.page.n : null, appendix_page: ap ? ap.page.n : null, cont: null };
    const clauseNo = l => { const m = /^\s*(\d{1,2})\.(\d{1,2})\b/.exec(l.text); return m && +m[1] <= 60 ? +m[1] : 0; };
    PL.forEach(({ page, L }) => { if (!agp.includes(page.n) || (ft && page.n === ft.page.n) || (ap && page.n === ap.page.n)) return; L.forEach(l => { numbering.general_last = Math.max(numbering.general_last, clauseNo(l)); }); });
    if (ap) ap.L.forEach(l => { numbering.appendix_last = Math.max(numbering.appendix_last, clauseNo(l)); });
    const ftPlace = places.find(x => x.id === 'further_terms');
    if (ftPlace) { numbering.printed_last = ftPlace.printed_last || 0; Object.assign(ftPlace, { general_last: numbering.general_last, appendix_last: numbering.appendix_last }); }
    // the continuation page: the further terms page's own header band (down to its heading) and footer band (the copyright line and
    // the page number), so a page added after it carries them and none of its printed clauses
    if (ft && ftPlace) { const { page, L } = ft, h = findLine(L, /^FURTHER TERMS OF SALE/), apH = L.find(l => /^Appendix\b/.test(l.text) && l.y >= h.y - 2);
      const cont = findLine(L, /^Further Terms continued/), heads = [h, apH, cont && cont.y < h.y && h.y - cont.y < 30 ? cont : null].filter(Boolean);
      const headerBottom = r1(Math.min(...heads.map(l => l.y)) - 3), footTop = ftPlace.foot, hasCopy = L.some(l => /©/.test(l.text));
      const printedLines = L.filter(l => l.y < headerBottom && l.y > footTop + 2);
      const below = printedLines.every(l => l.y + l.h * 0.8 < headerBottom);
      const pn = page.items.filter(it => /^\s*(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?\s*$/i.test(it.s) && (it.y + it.h <= footTop + 1 || it.y > headerBottom)).sort((a, b) => a.y - b.y)[0];
      const anchor = apH || h;
      if (hasCopy && below) numbering.cont = { page: page.n, w: page.w, h: page.h, header: [headerBottom, r1(page.h)], footer: [0, r1(footTop + 1)],
        head: { x1: r1(anchor.x1), y: r1(anchor.y), h: r1(anchor.h), text: anchor.text.trim().slice(0, 40) },
        page_no: pn ? { text: pn.s.trim(), value: +(/(\d{1,3})/.exec(pn.s)[1]), x: r1(pn.x), y: r1(pn.y), w: r1(pn.w), h: r1(pn.h) } : null,
        // the bare page numbers printed on the agreement's later pages (a clash with an added page's number is checked when drafting)
        later_numbers: pages.filter(pg => pg.n > page.n && agp.includes(pg.n)).map(pg => { const it2 = pg.items.find(x => /^\s*(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?\s*$/i.test(x.s) && (x.y < 60 || x.y > pg.h - 60));
          return it2 ? { page: pg.n, value: +(/(\d{1,3})/.exec(it2.s)[1]) } : null; }).filter(Boolean) };
    }
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
    return { edition, edition_checked: editionOk(edition), pages: pages.length, sizes: pages.map(p => [p.w, p.h]), agreement_pages: editionPages(pages, edition), places, missing, chattels, numbering };
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
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // "Friday 5 December 2026"
  const dayDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fullDate(iso)}`; };
  // what each printed condition's date is called on the front page
  const DATE_NAMES = { finance: 'finance date', lim: 'LIM date', builders: 'building report date', toxicology: 'toxicology report date', oia: 'OIA date', land_act: 'Land Act date' };
  // Helvetica's widths (the typed font), per 1000 points, for the characters 32 to 126: how wide a line will be before it is drawn
  const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const textWidth = (t, size) => { let w = 0; for (const ch of String(t || '')) { const c = ch.charCodeAt(0); w += HELV[c - 32] || 556; } return w * (size || FONT_SIZE) / 1000; };
  const money = n => '$' +Number(n).toLocaleString('en-NZ', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const PLACEHOLDERS = { electrical: '[Tim to add his electrical report clause]', technical: '[Tim to add his specified technical report clause]', sale: '[Tim to add his sale of another property clause]', sdd: '[Tim to add his Specified Due Diligence clause]', custom: "[Tim to tick the buyer's own condition wording]" };
  const placeholderFor = (key, title) => PLACEHOLDERS[key] || `[Tim to add his ${String(title || key).toLowerCase()} clause]`;
  const isPlaceholder = s => /^\[Tim to /.test(String(s || ''));
  // the drafting's own reference markers ([[FT:x]], [[TERM:x]]) taken out of any text it didn't write itself (a buyer's, the AI's, a paste)
  // a further term's number as the agreement writes its clauses: 23.0, matching the printed 22.0
  // style 'dot0' (the default, and Tim's packs: 22.0 printed) or 'dot' (when the page already prints terms as "1.", "2."):
  // termNo is how the list writes it (23.0 / 3.), refNo how a sentence names it ("further term 23.0" / "further term 3")
  const termNo = (n, style) => style === 'dot' ? `${n}.` : `${n}.0`;
  const refNo = (n, style) => style === 'dot' ? `${n}` : `${n}.0`;
  const noRefs = s => String(s == null ? '' : s).replace(/\[\[|\]\]/g, '');
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
    const typedChecks = [];
    const put = (id, place, text, extra) => {
      if (!place) { need('missing_' + id, `There is no place for ${extra && extra.label || id} on this blank. Add it to the places on the blank, or write it in by hand.`, !(extra && extra.optional)); return; }
      let t = Object.prototype.hasOwnProperty.call(edits, id) ? edits[id] : text; if (t == null || t === '') return;
      // a typed-over date line or clause 22.0 count: compared with what the offer works out once references are resolved (below)
      if (Object.prototype.hasOwnProperty.call(edits, id) && /^d_|^clause22_days$/.test(id) && text != null) typedChecks.push({ id, label: (extra && extra.label) || place.label, typed: String(t), text: String(text) });
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
    const conds = d.conditions || [], cond = k => conds.find(c => c.key === k), mode = c => OF ? OF.condMode(c) : (c.date ? 'date' : 'days');
    const labelOf = k => (OF && OF.condInfo(k) || { label: k }).label;
    // How a condition is referred to in a sentence: a printed condition by its clause number, one of the further terms by its number
    // there. Further term numbers are only known once the terms are listed, so a marker stands in until then (resolved below).
    // the markers carry a key made for this draft only, so no text from outside (a buyer, the AI, a paste) can make one
    const RK = 'k' + Math.random().toString(36).slice(2, 10), REF = kind => new RegExp('\\[\\[' + kind + '\\.' + RK + ':(\\w+)\\]\\]', 'g'), hasRef = t => String(t).includes('.' + RK + ':');
    const FRONT = Object.fromEntries(FRONT_CONDITIONS), noun = k => OF ? OF.nounFor(k) : k + ' condition';
    const refOf = k => FRONT[k] ? `the ${noun(k)} in clause ${FRONT[k]}` : k === 'lawyer' ? `the ${noun(k)} in clause 22.0` : `the ${noun(k)} in further term [[FT.${RK}:${k}]]`;
    const shortRef = k => FRONT[k] ? `clause ${FRONT[k]}` : k === 'lawyer' ? 'clause 22.0' : `further term [[FT.${RK}:${k}]]`;
    const wdays = n => `${n} working ${+n === 1 ? 'day' : 'days'}`;
    const movedNeed = (c, r) => { if (r && r.adjusted) need('moved_' + c.key, `${labelOf(c.key)}: the buyer chose ${fullDate(r.chosen)}, which isn't a working day, so the agreement says ${fullDate(r.date)} (the working day before). Check it with them.`, false); };
    // {timing}: the phrase for each way of satisfying a condition, in full
    const timingPhrase = c => { const m = mode(c), n = Math.floor(+c.days);
      if (m === 'after') return `within ${wdays(n)} of the date ${refOf(c.after)} is satisfied or waived`;
      if (m === 'date') { const r = OF ? OF.conditionDate(c, today, province, conds) : null; movedNeed(c, r); return `on or before ${dayDate(r ? r.date : c.date)}`; }
      return `within ${wdays(n)} of the date of this agreement`; };
    // {timing_date}: the same timing as a defined date, for the further terms that set out a printed condition's date ("The finance date is
    // the date that is 5 working days after the date ..."; "... after the date of this agreement"; "... is Friday 5 December 2026")
    const timingDatePhrase = c => { const m = mode(c), n = Math.floor(+c.days);
      if (m === 'after') return `the date that is ${wdays(n)} after the date ${refOf(c.after)} is satisfied or waived`;
      if (m === 'date') { const r = OF ? OF.conditionDate(c, today, province, conds) : null; movedNeed(c, r); return dayDate(r ? r.date : c.date); }
      return `the date that is ${wdays(n)} after the date of this agreement`; };
    const TOKEN_RE = /\{(date|timing|timing_date)\}/, TOKENS_RE = /\{(date|timing|timing_date)\}/g;
    // {date} and the printed date lines: a full date (from working days counted from today, or the date chosen). For a condition that
    // waits for another there is no date to give, so {date} becomes the timing phrase and Tim checks the sentence still reads right.
    const dateText = c => { if (!OF) return c.date || `${c.days} working days`;
      if (mode(c) === 'after') { need('date_after_' + c.key, `${labelOf(c.key)} waits for ${labelOf(c.after)}, so where its wording has {date} it now reads "${timingPhrase(c)}". Check the sentence still reads right.`, false); return timingPhrase(c); }
      const r = OF.conditionDate(c, today, province, conds); if (!r) return ''; movedNeed(c, r);
      return fmt === 'date_days' ? `${fullDate(r.date)} (${r.days} working ${r.days === 1 ? 'day' : 'days'})` : fullDate(r.date); };
    // a clause's wording with its tokens filled in; tokens: whether {date} or {timing} was used (then nothing is added after it)
    const fill = (w, c, extra) => { const tokens = TOKEN_RE.test(w);
      let s = w; Object.entries(extra || {}).forEach(([k, v]) => { s = s.split('{' + k + '}').join(v); });
      if (c) { if (s.includes('{timing_date}')) s = s.split('{timing_date}').join(timingDatePhrase(c)); if (s.includes('{timing}')) s = s.split('{timing}').join(timingPhrase(c)); if (s.includes('{date}')) s = s.split('{date}').join(dateText(c)); }
      return { text: s, tokens }; };
    // what goes after a condition's wording that names no time: the date as before, or for a condition that waits for another, the timing
    const suffixFor = c => !c ? '' : mode(c) === 'after' ? ` This condition is to be satisfied or waived ${timingPhrase(c)}.` : ` Condition date: ${dateText(c)}.`;
    const timeTerms = [];   // further terms that set out a printed condition's date when its line can't (added after the library's terms)
    for (const [k, clause] of FRONT_CONDITIONS) {
      const c = cond(k), yn = P('c_' + k), label = `${labelOf(k)} (clause ${clause})`;
      if (!yn) { if (c) need('missing_c_' + k, `There is no Yes/No for ${label} on this blank. Add it to the places on the blank.`, true); continue; }
      strikeYesNo('c_' + k, yn, !!c, label);
      if (!c) continue;
      if (mode(c) !== 'after') { put('d_' + k, P('d_' + k), dateText(c), { label: label + ': date' }); continue; }
      // waits for another condition: the short phrase on the line if it fits there, otherwise "see further term N" and a further term
      // that sets out this condition's date. The REINZ text is never changed, only added to.
      const n = Math.floor(+c.days), short = `${wdays(n)} after ${shortRef(c.after)} is satisfied or waived`, dp = P('d_' + k), dn = DATE_NAMES[k] || labelOf(k).toLowerCase() + ' date';
      if (dp && textWidth(short.replace(REF('FT'), '99.0'), 7.5) <= dp.w) {
        put('d_' + k, dp, short, { label: label + ': date' });
        need('front_after_' + k, `${label}: the date line says "${short}" because it waits for ${labelOf(c.after)}. Check it reads clearly on the page.`, false);
      } else {
        const id = 'ft_time_' + k;
        timeTerms.push({ id, title: `${dn.charAt(0).toUpperCase() + dn.slice(1)} (clause ${clause})`, template: `The ${dn} is {timing_date}.`, c });
        put('d_' + k, dp, `see further term [[TERM.${RK}:${id}]]`, { label: label + ': date' });
        need('front_after_' + k, `${label}: it waits for ${labelOf(c.after)}, which doesn't fit on the date line, so the line says "see further term [[TERM.${RK}:${id}]]" and further term [[TERM.${RK}:${id}]] sets out the date. Check both.`, false);
      }
    }
    if (conds.some(c => mode(c) === 'days' && c.days && !c.date)) need('days_from', `Condition dates given as working days are counted from today (${fullDate(today)}). On the agreement they run from the day everyone signs, so check them on the day.`, false);
    if (conds.some(c => mode(c) === 'after')) need('after_check', 'Some conditions wait for another to be satisfied or waived. Each is worded "within so many working days of the date" the other is satisfied or waived. Check each one names the right condition.', false);
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
      else if (mode(law) === 'after') {
        // waits for another condition: clause 22.0 counts working days from the agreement, so the printed count is struck out (if there
        // is one), "see further term N" is written beside it, and a further term sets out the time. The printed text is never changed.
        const dp22 = P('clause22_days'), id = 'ft_time_lawyer';
        timeTerms.push({ id, title: "Lawyer's approval (clause 22.0)", template: "The time for the purchaser's lawyer's approval under clause 22.0 is {timing}.", c: law });
        if (dp22 && dp22.printed) { strike('clause22_days_struck', dp22, 'Clause 22.0: the working days already on the blank, struck out');
          put('clause22_days', Object.assign({}, dp22, { x: dp22.x + dp22.w / 2 - 2, y: dp22.y + dp22.h * 0.62, w: 80 }), `see further term [[TERM.${RK}:${id}]]`, { label: 'Clause 22.0: working days', item: { size: 6 } }); }
        else if (dp22) put('clause22_days', dp22, `see further term [[TERM.${RK}:${id}]]`, { label: 'Clause 22.0: working days' });
        need('clause22_after', `Lawyer's approval waits for ${labelOf(law.after)}. ${dp22 && dp22.printed ? 'The working days printed in clause 22.0 are struck out and' : 'Clause 22.0'} "see further term [[TERM.${RK}:${id}]]" is written there; further term [[TERM.${RK}:${id}]] sets out the time. Check both.`, false);
      }
      else { const r = OF ? OF.conditionDate(law, today, province, conds) : null, n = law.days ? +law.days : r ? r.days : null, dp22 = P('clause22_days');
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
    // a reference to a further term that isn't there has no number to take: "?", and Tim must deal with it
    const refMissing = k => { need('ref_missing_' + k, `A condition waits for ${labelOf(k)}, but ${labelOf(k)} isn't in the further terms, so its number is shown as "?". Add it, or change the timing.`, true); return '?'; };
    let resolveRefs = t => String(t).replace(REF('FT'), (m, k) => refMissing(k)).replace(REF('TERM'), '?');
    let ftn = 0; const term = (id, title, text, extra) => { ft.push(Object.assign({ id, title, text }, extra || {})); };
    // A term's timing: the condition it belongs to (always the offer's own: Tim changes that on the review screen as a correction to the
    // offer, so the date checks follow), or, for a term tied to no condition, the timing Tim set on the review screen (edits.term_timing:
    // working days, a date, or after one of the offer's conditions)
    const TT = E.term_timing && typeof E.term_timing === 'object' ? E.term_timing : {};
    const timedFor = (id, c, title) => { const ov = TT[id]; if (c || !ov || typeof ov !== 'object') return c || null;
      const t = { key: c ? c.key : 'term_' + id };
      if (ov.after) { if (!(cond(ov.after) && ov.after !== t.key && Math.floor(+ov.days) >= 1)) { need('term_timing_bad_' + id, `${title}: the timing you set waits for a condition that isn't on this offer, so it wasn't used. Set it again.`, !c); return c || null; }
        Object.assign(t, { after: ov.after, days: Math.floor(+ov.days) }); }
      else if (ov.date && OF && OF.isDate(ov.date)) t.date = ov.date; else if (Math.floor(+ov.days) >= 1) t.days = Math.floor(+ov.days); else return c || null;
      return t; };
    // a term's wording with its tokens filled: { text, template (the wording with {timing} and {date} kept), tokens, timing }.
    // {timing} with no timing to give: a highlighted gap, and Tim must set it.
    const NO_TIMING = '[Tim to set the timing]';
    const fillTerm = (id, title, w, tm, extra) => { let tpl = noRefs(w); Object.entries(extra || {}).forEach(([k, v]) => { tpl = tpl.split('{' + k + '}').join(noRefs(v)); });
      if (tm) { const f = fill(tpl, tm); return { text: f.text, template: tpl, tokens: f.tokens, timing: tm }; }
      const tokens = TOKEN_RE.test(tpl); if (tokens) need('timing_missing_' + id, `${title}: its wording has {timing} but no timing yet. Tap the timing in the term to set it.`, true);
      return { text: tpl.replace(TOKENS_RE, NO_TIMING), template: tpl, tokens, timing: null }; };
    for (const t of terms) {
      if (t.kind !== 'further_term' || t.key === 'chattels' || !ruleApplies(t.rule, d)) continue;
      if (t.wording_from === 'custom') {
        const c = cond('custom'); if (!c) continue;
        // the buyer's own wording may hold {timing} (the helper writes it so) or {date}: filled in like Tim's own clauses
        const w = String(E.custom_wording || c.wording || '').trim(), tm = timedFor('ft_custom', c, "Purchaser's condition"), f = E.custom_ok && w ? fillTerm('ft_custom', "Purchaser's condition", w, tm) : null;
        // Tim's wording for it (edits.custom_wording, carried to later drafts) with no {timing}, {timing_date} or {date} where the buyer's
        // wording had one: it no longer follows the offer's timing. A check for him, and no "Condition date" added after his words.
        const dropTiming = !!(f && E.custom_ok && String(E.custom_wording || '').trim() && !TOKEN_RE.test(String(E.custom_wording)) && TOKEN_RE.test(String(c.wording || '')));
        term('ft_custom', "Purchaser's condition", f ? f.text : PLACEHOLDERS.custom, { custom: true, cond: 'custom', request: c.request || '', wording: c.wording || '', ai: !!c.ai, suffix: dropTiming || (f && f.tokens) ? '' : suffixFor(tm), template: f ? f.template : null, timing: tm, dropTiming });
        continue;
      }
      let w = t.wording_from ? String((input.clauses || {})[t.wording_from] || '').trim() : String(t.wording || '').trim();
      const c = t.wording_from ? cond(t.wording_from) : null, id = 'ft_' + t.key, tm = timedFor(id, c, t.title); let f = null;
      if (!w) w = placeholderFor(t.wording_from || t.key, t.title);
      else if (tm || /\{(date|timing)\}/.test(w)) { f = fillTerm(id, t.title, w, tm, c ? { detail: c.detail || '', address: d.sale_address || '' } : {}); w = f.text; }
      term(id, t.title, w, Object.assign({ template: f ? f.template : w, timing: tm }, c ? { cond: c.key, suffix: f && f.tokens ? '' : suffixFor(tm), detail: c.detail || (t.wording_from === 'sale' ? d.sale_address : '') } : {}));
    }
    // the dates of printed conditions that wait for another, where their own line couldn't hold them
    // each tied to its condition with {timing}, so its timing chip on the review screen corrects the offer like any other condition's
    timeTerms.forEach(x => { const f = fillTerm(x.id, x.title, x.template, x.c); term(x.id, x.title, f.text, { cond: x.c.key, template: f.template, timing: x.c, timeTerm: true }); });
    if (cond('sale')) need('sale_address_seen', `Sale of another property: the buyer's own address (${d.sale_address || 'not given'}) is named in that further term, so the vendors will see it on the agreement. Check the buyer is happy with that.`, false);
    // clauses Tim added from his library on the review screen (edits.added_terms: [{ id, key }]); the rule doesn't apply to these
    (Array.isArray(E.added_terms) ? E.added_terms : []).forEach(a => { if (!a || !/^[A-Za-z0-9_]{1,80}$/.test(String(a.id || ''))) return;
      const t = (input.terms || []).find(x => x.key === a.key && x.kind === 'further_term' && x.active !== false && x.wording_from !== 'custom');
      if (!t) { need('added_gone_' + a.id, `A clause you added (${a.key}) isn't in your library any more. Remove it, or add it to the library again.`, true); return; }
      if (ft.some(x => x.id === 'ft_' + t.key)) { need('added_twice_' + a.id, `${t.title} is already on this draft, so it was added only once.`, false); return; }
      let w = t.wording_from ? String((input.clauses || {})[t.wording_from] || '').trim() : String(t.wording || '').trim();
      const c = t.wording_from ? cond(t.wording_from) : null, tm = timedFor(a.id, c, t.title);
      const f = w ? fillTerm(a.id, t.title, w, tm, c ? { detail: c.detail || '', address: d.sale_address || '' } : {}) : { text: placeholderFor(t.key, t.title), template: '', tokens: false, timing: tm };
      term(a.id, t.title, f.text, { added: true, removable: true, library: t.key, cond: c ? c.key : null, template: f.template, timing: tm, suffix: c && !f.tokens ? suffixFor(tm) : '' }); });
    // Tim's own terms: a line he typed (a string), or a clause he had written with AI help for this offer only ({ id, title, text })
    (E.extra_terms || []).forEach((x, i) => {
      if (x && typeof x === 'object') { const id = /^[A-Za-z0-9_]{1,80}$/.test(String(x.id || '')) ? x.id : 'ft_extra_' + (i + 1), title = String(x.title || 'Your further term').trim().slice(0, 200) || 'Your further term', w = String(x.text || '').trim(); if (!w) return;
        const f = fillTerm(id, title, w, timedFor(id, null, title)); term(id, title, f.text, { removable: true, extra: true, ai: !!x.ai, template: f.template, timing: f.timing }); return; }
      const w = String(x || '').trim(); if (!w) return; const id = 'ft_extra_' + (i + 1), f = fillTerm(id, 'Your further term', w, timedFor(id, null, 'Your further term'));
      term(id, 'Your further term', f.text, { removable: true, extra: true, template: f.template, timing: f.timing }); });
    // the order Tim chose on the review screen (edits.term_order); anything not in it keeps its place after those that are
    if (Array.isArray(E.term_order) && E.term_order.length) { const pos = new Map(E.term_order.map((id, i) => [String(id), i]));
      const keyed = ft.map((x, i) => [pos.has(x.id) ? pos.get(x.id) : 1000 + i, x]); keyed.sort((a, b) => a[0] - b[0]); ft.splice(0, ft.length, ...keyed.map(k => k[1])); }
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
    // Numbering (Tim, 24 November 2026): on from the last general terms clause and the highest clause printed on the appendix, read
    // from the blank itself (input.numbering, from buildMap; an older saved map carries the same on its further terms place). A
    // number once used is never used again: numbers Tim retired (a term he removed) are skipped, so a later term never takes one.
    const NB = Object.assign({}, map.numbering || {}, input.numbering || {}), retired = new Set((E.retired_numbers || []).map(Number).filter(n => n >= 1));
    const base = Math.max(+NB.general_last || +(ftp || {}).general_last || 0, +NB.appendix_last || +(ftp || {}).appendix_last || 0, +(ftp || {}).printed_last || 0);
    ftn = base;
    // the further terms are written in the style of any printed on the page; otherwise as the printed 22.0 (Tim, 24 November 2026)
    const NST = (ftp || {}).printed_style === 'dot' ? 'dot' : 'dot0', tNo = n => termNo(n, NST), rNo = n => refNo(n, NST);
    if (base) need('term_start', `Further terms start at ${tNo(base + 1).replace(/\.$/, '')} (general terms to ${NB.general_last || (ftp || {}).general_last || 'none found'}, appendix to ${NB.appendix_last || (ftp || {}).appendix_last || 'none found'}${(ftp || {}).printed_last ? `, printed on the further terms page to ${ftp.printed_last}` : ''}).`, false);
    if (ft.length && !base) need('numbering_unknown', "The last general terms clause number couldn't be read from the blank, so the further terms are numbered from 1. Check the numbering.", false);
    if (ft.length && ftp && ftp.printed_bottom != null) {
      // terms already printed on the page: ours start below the lowest printed line, numbered on from the highest printed number
      const top = ftp.printed_bottom - 14, cut = ftp.y - top; ftp = Object.assign({}, ftp, { y: top, h: ftp.h - cut });
      let first = ftn + 1; while (retired.has(first)) first++;
      need('further_printed', `The Further Terms page already has ${ftp.printed_count} printed line${ftp.printed_count === 1 ? '' : 's'}${ftp.printed_last ? `, numbered to ${ftp.printed_last}` : ''}. The offer's terms start below the lowest of them, numbered from ${rNo(first)}. This layout hasn't been checked on a real blank yet: look at the page before you approve.`, true, true);
    }
    if (ft.length) {
      ft.forEach(x => { ftn++; while (retired.has(ftn)) ftn++; x.number = ftn; });
      // the further term numbers are known now: fill in every reference to one ("further term 3"), in the terms and on the page
      const numOf = new Map(), byId = new Map(ft.map(x => [x.id, x.number])); ft.forEach(x => { if (x.cond && !numOf.has(x.cond)) numOf.set(x.cond, x.number); });
      resolveRefs = t => String(t).replace(REF('FT'), (m, k) => numOf.has(k) ? rNo(numOf.get(k)) : refMissing(k))
        .replace(REF('TERM'), (m, id) => byId.has(id) ? rNo(byId.get(id)) : '?');
      // Tim's edit of a term is its wording as he left it: {timing} and {date} in it are filled in like any other
      const text = ft.map(x => { const edited = Object.prototype.hasOwnProperty.call(edits, x.id) ? String(edits[x.id] || '') : null;
        const orig = x.template;
        if (x.dropTiming) need('timing_dropped_' + x.id, `Further term ${rNo(x.number)} no longer follows the offer's timing for ${labelOf(x.cond)} (the offer says ${OF ? OF.timingPlain(cond(x.cond)) : 'otherwise'}). Check it, or restore the timing.`, true, true);
        let body = edited != null ? noRefs(edited) : x.text; if (edited != null) { x.template = edited; if (TOKEN_RE.test(edited)) { const f = fillTerm(x.id, x.title, edited, x.timing); body = f.text; x.suffix = ''; }
          else if (x.cond && x.timing && cond(x.cond) && TOKEN_RE.test(String(orig || '')))
            need('timing_dropped_' + x.id, `Further term ${rNo(x.number)} no longer follows the offer's timing for ${labelOf(x.cond)} (the offer says ${OF ? OF.timingPlain(cond(x.cond)) : 'otherwise'}). Check it, or restore the timing.`, true, true); }
        body = resolveRefs(body); x.text = body;
        return `${tNo(x.number)} ${noRefs(x.title)}${x.detail ? ' (' + noRefs(x.detail) + ')' : ''}: ${body}${resolveRefs(x.suffix || '')}`; });
      const it = put('further_terms', ftp, text.join('\n'), { label: 'Further terms of sale', item: { term_texts: text, cont: NB.cont || null, number_base: base, number_style: NST, terms: ft.map(x => ({ id: x.id, number: x.number, title: x.title, text: x.text, placeholder: isPlaceholder(x.text), custom: !!x.custom, request: x.request, wording: x.wording, ai: x.ai,
        template: x.template != null ? resolveRefs(x.template) : null, timing: x.timing ? { key: x.timing.key, days: x.timing.days, date: x.timing.date, after: x.timing.after } : null, timing_text: x.timing ? resolveRefs(timingPhrase(x.timing)) : '',
        date_text: x.timing ? resolveRefs(dateText(x.timing)) : '', timing_date_text: x.timing ? resolveRefs(timingDatePhrase(x.timing)) : '', removable: !!x.removable, added: !!x.added, library: x.library || null, extra: !!x.extra })) } });
      ft.filter(x => isPlaceholder(x.text)).forEach(x => need('ph_' + x.id, `Further term ${rNo(x.number)}, ${x.title}: ${x.text}`, true));
    }
    // any reference still waiting for its number (on the front page, beside clause 22.0, and in Tim's list of things to check)
    items.forEach(it => { if (it.text && hasRef(it.text)) it.text = resolveRefs(it.text); });
    typedChecks.forEach(x => { const want = resolveRefs(x.text).trim(); if (x.typed.trim() !== want)
      need('typed_' + x.id, `${x.label}: you typed "${x.typed.slice(0, 80)}", but the offer works out "${want.slice(0, 80)}". Check it, or clear your edit so it follows the offer.`, true, true); });
    needs.forEach(n => { if (hasRef(n.text)) n.text = resolveRefs(n.text); });
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
    // Areas Tim marked on the drafted pages (edits.marks), in PDF points on the blank's own pages: initials or a signature (signing
    // places for the signing step; nothing is drawn), a strike-out (a line through one line of text, a crossed box over more), his
    // typed text, or a highlight. Marks are only ever added; the REINZ text is never changed.
    const MARK_WORDS = { initials: 'Initials', signature: 'Signature', strike: 'Strike-out', text: 'Text', highlight: 'Highlight' }, WHO = { purchasers: 'the purchasers', vendors: 'the vendors', both: 'everyone' };
    let signMarks = 0;
    (Array.isArray(E.marks) ? E.marks : []).forEach((m, i) => { if (!m || !MARK_WORDS[m.type] || !/^[A-Za-z0-9_-]{1,40}$/.test(String(m.id || ''))) return;
      const id = 'mark_' + m.id, b = { page: +m.page, x: +m.x, y: +m.y, w: +m.w, h: +m.h };
      const lbl = `${MARK_WORDS[m.type]}${m.type === 'initials' || m.type === 'signature' ? ' for ' + (WHO[m.who] || WHO.both) : ''} (page ${b.page}, marked by you)`;
      if (m.type === 'text') { put(id, Object.assign({ id, key: 'mark', kind: 'area', page: b.page }, { x: b.x + 2, y: b.y + b.h - FONT_SIZE - 1, w: Math.max(8, b.w - 4), h: Math.max(FONT_SIZE, b.h - 2) }), noRefs(String(m.text || '').trim().slice(0, 500)), { label: lbl, item: { mark: 'text' } });
        if (!String(m.text || '').trim()) need('mark_empty_' + m.id, `${lbl}: there is no text in it yet. Type it, or delete the box.`, true); return; }
      if (m.type === 'initials' || m.type === 'signature') signMarks++;
      items.push(Object.assign({ id, key: 'mark', place: null, kind: 'mark', mark: m.type === 'strike' && b.h > 16 ? 'cross' : m.type, who: m.type === 'initials' || m.type === 'signature' ? (WHO[m.who] ? m.who : 'both') : null, label: lbl }, b)); });
    if (signMarks) need('sign_marks', `You marked ${signMarks} place${signMarks === 1 ? '' : 's'} for initials or a signature. ${signMarks === 1 ? 'It becomes a signing place' : 'They become signing places'} when the agreement is signed; nothing is drawn on the page for ${signMarks === 1 ? 'it' : 'them'}.`, false);
    // Places on the draft Tim moved or resized (edits.moves: { item id: { from, to } }, the boxes he saw and where he left them). The
    // place on the blank's map is unchanged (its history keeps every version); only this draft's item moves.
    const MOVABLE = ['text', 'area', 'strike', 'lines', 'caret', 'mark'];
    Object.entries(E.moves && typeof E.moves === 'object' ? E.moves : {}).forEach(([id, mv]) => { const it = items.find(x => x.id === id); if (!mv || !mv.from || !mv.to) return;
      if (!it || !MOVABLE.includes(it.kind) || it.page !== +mv.to.page || +mv.from.page !== +mv.to.page) { need('move_gone_' + id, `A place you moved (${id}) isn't on this draft in the same place any more, so the move was left out. Move it again if you need to.`, false); return; }
      const f = mv.from, t = mv.to, dx = t.x - f.x, dw = t.w - f.w, dh = t.h - f.h, dy = it.kind === 'area' ? (t.y + t.h) - (f.y + f.h) : t.y - f.y;
      if (it.kind === 'lines') it.lines = it.lines.map(l => ({ x0: l.x0 + dx, x1: l.x1 + dx + dw, y: l.y + dy, h: l.h }));
      Object.assign(it, { x: it.x + dx, y: it.y + dy, w: Math.max(6, it.w + dw), h: Math.max(4, it.h + dh), moved: true });
      need('moved_' + id, `${it.label}: moved on this draft. The place on the blank is kept as it was.`, false); });
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
    // the highest further term number used or retired: later terms (a re-draft, a counteroffer) carry on from it
    const term_last = Math.max(base, ftn, ...[...retired]);
    return { items, needs, terms: ft, today, date_format: fmt, term_base: base, term_last, retired_numbers: [...retired].sort((a, b) => a - b) };
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
    const pages = doc.getPages(), boxes = [], overflow = []; let continued = null, pending = null, addedPages = [];
    for (const it of plan.items) {
      const pg = pages[it.page - 1]; if (!pg) continue;
      if (it.kind === 'caret') {   // a small ^ under a struck word, pointing to the margin
        pg.drawLine({ start: { x: it.x - 2.2, y: it.y - 2.8 }, end: { x: it.x, y: it.y - 0.6 }, thickness: 0.7, color: ink }); pg.drawLine({ start: { x: it.x, y: it.y - 0.6 }, end: { x: it.x + 2.2, y: it.y - 2.8 }, thickness: 0.7, color: ink });
        boxes.push({ id: it.id, page: it.page, x: it.x - 3, y: it.y - 3, w: 6, h: 3, kind: 'strike', label: it.label }); continue;
      }
      if (it.kind === 'mark') {   // an area Tim marked: initials and signatures are signing places (nothing drawn); the rest are drawn
        if (it.mark === 'strike') pg.drawLine({ start: { x: it.x, y: it.y + it.h / 2 }, end: { x: it.x + it.w, y: it.y + it.h / 2 }, thickness: 0.9, color: ink });
        else if (it.mark === 'cross') { pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, borderColor: ink, borderWidth: 0.8 });
          pg.drawLine({ start: { x: it.x, y: it.y }, end: { x: it.x + it.w, y: it.y + it.h }, thickness: 0.8, color: ink }); pg.drawLine({ start: { x: it.x, y: it.y + it.h }, end: { x: it.x + it.w, y: it.y }, thickness: 0.8, color: ink }); }
        else if (it.mark === 'highlight') pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, color: hl, opacity: 0.4 });
        boxes.push({ id: it.id, page: it.page, x: it.x, y: it.y, w: it.w, h: it.h, kind: 'mark', mark: it.mark, label: it.label }); continue;
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
    // Further terms that didn't fit: pages added straight after the Further Terms page (Tim, 24 November 2026). Each is made from
    // that page's own header and footer bands only (the page embedded, clipped to those bands, so none of its printed clauses
    // appear twice), with "(continued)" typed after its heading and its printed page number struck through, the right one beside
    // it. Without the bands, a plain page (and a check for Tim). Then every later page's boxes move along.
    if (pending) {
      const { it, rest, size, lh, noteY } = pending, pg = pages[it.page - 1], [w, h] = [pg.getWidth(), pg.getHeight()], C = it.cont && it.cont.page === it.page ? it.cont : null;
      let at = it.page, left = rest, added = 0; continued = it.page + 1;
      // say so at the foot of the Further Terms page itself
      const note = 'Continued on the next page.', ny = noteY;
      pg.drawText(note, { x: it.x, y: ny, size: 8, font: bold, color: ink }); boxes.push({ id: it.id + '_contnote', page: it.page, x: it.x, y: ny - 2, w: bold.widthOfTextAtSize(note, 8), h: 10, kind: 'text', label: it.label + ': continued on the next page' });
      // The header and footer bands are pictures of the blank's own page (o.bandImage gives PNG bytes for a band: Tim's screen renders
      // the page with pdf.js, the tests with pdftoppm). Never the page itself embedded: that would carry its whole text, clauses and
      // all, into every added page. Without pictures, a plain page and a check for Tim.
      let headImg = null, footImg = null;
      if (C && typeof o.bandImage === 'function') {
        try { const hb = await o.bandImage(it.page, { bottom: C.header[0], top: h, width: w, height: h - C.header[0] }), fb = await o.bandImage(it.page, { bottom: 0, top: C.footer[1], width: w, height: C.footer[1] });
          if (hb && fb && hb.length && fb.length) { headImg = await doc.embedPng(hb); footImg = await doc.embedPng(fb); } } catch (_) { headImg = footImg = null; }
      }
      const B = headImg && footImg ? C : null;
      const top0 = B ? B.header[0] - 22 : h - 100, bottom0 = B ? B.footer[1] + 14 : 40, n = Math.max(1, Math.floor((top0 - bottom0) / lh) + 1);
      const willAdd = Math.max(1, Math.ceil(rest.length / n));
      const added_pages = [];
      while (left.length) {
        const np = doc.insertPage(at, [w, h]); at++; added++;
        let number = null;
        if (B) { const C = B;
          np.drawImage(headImg, { x: 0, y: C.header[0], width: w, height: h - C.header[0] }); np.drawImage(footImg, { x: 0, y: 0, width: w, height: C.footer[1] });
          const hs = Math.max(8, Math.min(14, C.head.h || 12)), ct = '(continued)';
          np.drawText(ct, { x: C.head.x1 + 6, y: C.head.y, size: hs, font: bold, color: ink });
          boxes.push({ id: it.id + '_conthead' + added, page: -at, x: C.head.x1 + 6, y: C.head.y - 2, w: bold.widthOfTextAtSize(ct, hs), h: hs + 2, kind: 'text', label: it.label + ': (continued) after the heading' });
          // the page number: "22" becomes 23, then 24; "22 of 22" becomes "23 of 24" when two pages are added (the total grows too)
          if (C.page_no) { const pn = C.page_no, nv = pn.value + added, of = /(\d{1,3})\D+(\d{1,3})/.test(pn.text), nt = of ? pn.text.replace(/(\d{1,3})(\D+)(\d{1,3})/, (m, a, sep, t) => `${nv}${sep}${+t + willAdd}`) : pn.text.replace(String(pn.value), String(nv)), ps = Math.max(6, Math.min(10, pn.h || 8));
            np.drawLine({ start: { x: pn.x - 1, y: pn.y + pn.h * 0.32 }, end: { x: pn.x + pn.w + 1, y: pn.y + pn.h * 0.32 }, thickness: 0.9, color: ink });
            np.drawText(nt, { x: pn.x + pn.w + 4, y: pn.y, size: ps, font, color: ink });
            boxes.push({ id: it.id + '_contpage' + added, page: -at, x: pn.x - 1, y: pn.y - 2, w: pn.w + 6 + font.widthOfTextAtSize(nt, ps), h: ps + 3, kind: 'text', label: `${it.label}: page number ${pn.text} struck, ${nt} written beside it` });
            number = { printed: pn.text, written: nt }; }
        } else {
          np.drawText('Further Terms of Sale (continued)', { x: 40, y: h - 60, size: 13, font: bold, color: ink });
          np.drawText(`Continued from page ${it.page}.`, { x: 40, y: h - 76, size: 8, font, color: ink });
        }
        const x0 = B ? it.x : 40, ww = B ? it.w : w - 80;
        const T = l => typeof l === 'string' ? l : l.s;
        const ls = left.slice(0, n); left = left.slice(n);
        ls.forEach((l, i) => { const ln = T(l); if (!ln) return; const y = top0 - i * lh, ph = /\[Tim to [^\]]*\]/.exec(ln);
          if (ph) np.drawRectangle({ x: x0 + font.widthOfTextAtSize(ln.slice(0, ph.index), size) - 1, y: y - 2, width: font.widthOfTextAtSize(ph[0], size) + 2, height: size + 2, color: hl });
          np.drawText(ln, { x: x0, y, size, font, color: ink }); });
        boxes.push({ id: it.id + '_cont' + added, page: -at, x: x0, y: top0 - (ls.length - 1) * lh - 2, w: ww, h: (ls.length - 1) * lh + size + 4, kind: 'area', label: it.label + ' (continued)', placeholder: ls.some(l => /\[Tim to /.test(T(l))) });
        // where each further term sits on the added page: its lines, and the blank line after it (for the initials, phase 3)
        if (typeof ls[0] !== 'string') { const seen = new Map(); ls.forEach((l, i) => { const y = top0 - i * lh; if (!seen.has(l.term)) seen.set(l.term, { top: y + size, bottom: y - 2, gap: null }); const t = seen.get(l.term); if (l.gap) t.gap = { x: x0, y: y - 2, w: ww, h: lh }; else t.bottom = y - 2; });
          seen.forEach((t, num) => boxes.push({ id: it.id + '#t' + num, page: -at, x: x0, y: t.bottom, w: ww, h: t.top - t.bottom, kind: 'term', number: num, gap: t.gap, label: it.label + ': term ' + num })); }
        added_pages.push({ page: at, source_page: it.page, bands: B ? { header: B.header, footer: B.footer, as: 'image' } : null, plain: !B, number });
      }
      boxes.forEach(b => { if (b.page < 0) b.page = -b.page; else if (b.page > it.page) b.page += added; });
      addedPages = added_pages;
      // a later page of the agreement that already prints a number an added page now takes: Tim checks the numbering
      const top = B && B.page_no && added_pages.length ? B.page_no.value + added : null, clash = top ? (B.later_numbers || []).filter(x => x.value > B.page_no.value && x.value <= top) : [];
      if (plan.needs && clash.length) plan.needs.push({ id: 'continuation_page_clash', text: `The added page${added === 1 ? ' is' : 's are'} numbered up to ${top}, but ${clash.map(x => `page ${x.page} of the blank already prints ${x.value}`).join(', ')}. Check the page numbering before you approve.`, blocking: true, ackable: true });
      if (plan.needs) {
        if (B) plan.needs.push({ id: 'continuation_check', text: `The further terms run onto ${added} added page${added === 1 ? '' : 's'} straight after page ${it.page}, made from that page's own header and footer, headed "(continued)"${added_pages[0].number ? `, numbered ${added_pages.map(x => x.number.written).join(', ')}` : ''}. Check ${added === 1 ? 'it' : 'them'} before you approve.`, blocking: true, ackable: true });
        else plan.needs.push({ id: 'continuation_plain', text: `The further terms run onto ${added} added page${added === 1 ? '' : 's'}, but the Further Terms page's header and footer couldn't be ${C ? 'copied' : 'found'}, so ${added === 1 ? 'it is a plain page' : 'they are plain pages'}. Check ${added === 1 ? 'it' : 'them'} before you approve.`, blocking: true, ackable: true });
      }
    }
    if (o.title) doc.setTitle(o.title, { showInWindowTitleBar: false });
    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
    return { bytes, boxes, continued, overflow, added_pages: addedPages };
  }

  // what a draft placed, where, as filed with it (offer_drafts.placed): each item with its boxes on the page, the map place it filled
  // (so signing groups a struck line and the words beside it as one change), for the further terms where each term sits and the
  // blank line after it (where each party initials it), Tim's drawn boxes (mark, who) and moved places (moved), and each page added
  // for the further terms (kind 'page', with the page it was made from and the bands used; the draft's fingerprint covers it)
  function placedFrom(plan, r) {
    const rb = x => ({ page: x.page, x: Math.round(x.x * 10) / 10, y: Math.round(x.y * 10) / 10, w: Math.round(x.w * 10) / 10, h: Math.round(x.h * 10) / 10 });
    return plan.items.map(it => { const bx = r.boxes.filter(x => x.id === it.id || x.id.startsWith(it.id + '_cont'));
      const tb = it.id === 'further_terms' ? r.boxes.filter(x => x.kind === 'term').map(x => Object.assign(rb(x), { number: x.number, gap: x.gap ? rb(Object.assign({ page: x.page }, x.gap)) : null })) : undefined;
      return { id: it.id, place: it.place || null, key: it.key || null, label: it.label, kind: it.kind, text: it.text || null, value: it.value || null, placeholder: !!it.placeholder, edited: !!it.edited, terms: it.terms,
        number_style: it.number_style || undefined, mark: it.mark || undefined, who: it.who || undefined, moved: it.moved || undefined, boxes: bx.map(rb), term_boxes: tb }; })
      .concat((r.added_pages || []).map((ap, i) => ({ id: 'added_page_' + (i + 1), label: `Page added after page ${ap.source_page}${ap.number ? `, numbered ${ap.number.written}` : ' (plain)'}`, kind: 'page', page: ap.page, source_page: ap.source_page, bands: ap.bands, number: ap.number, plain: !!ap.plain, boxes: [] })));
  }

  const DRAFT = { placedFrom, termNo, refNo, EDITIONS, EDITION_RE, editionOk, readPages, lines, xAt, matchAll, readEdition, editionPages, buildMap, parseChattels, numberIn, daysWords, FRONT_CONDITIONS, LABELS,
    packText, packBatches, placeFromProposal, rectOf, nsn, phoneRuns, plainText, ownContacts, holdsOwn, pickVendorLawyer, PROPOSAL_KINDS, planDraft, ruleApplies, fullDate, PLACEHOLDERS, placeholderFor, isPlaceholder, winAnsi, renderDraft, wrap, INK, FONT_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = DRAFT; else root.DRAFT = DRAFT;
})(typeof window !== 'undefined' ? window : globalThis);
