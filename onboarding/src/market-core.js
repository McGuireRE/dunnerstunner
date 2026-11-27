// Market and price charts (LW3 phase C, migration 034): one shared file for every chart the appraisal report draws, and for the
// Quarterly market update to reuse. Pure: no database, no page state. Each function takes plain rows and returns HTML (inline SVG
// that scales to its box, so nothing scrolls sideways at 390 px). Colours come from the page's own colour variables, so light and
// dark both work. Every mark has a hover title, and each chart has its figures as a table under "See the figures".
//
//   MKT.dots(points, ranges)        price evidence at a glance: each comparable a numbered dot, Tim's range(s) shaded
//   MKT.report(months, ranges, o)   the Dunedin market report: median with its spread, days to sell, sales per month, price bands
//   MKT.pickArea(months, prefer)    the area to chart (Tim's choice, else Dunedin, else the area with most months)
//   MKT.lastYear(months, area)      that area's months, oldest first, the latest twelve
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dollars = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-NZ');
  // "$540K", "$1.25M": short figures for axes and labels
  const short = n => { n = +n || 0; if (n >= 1e6) return '$' + (Math.round(n / 1e4) / 100).toString().replace(/\.?0+$/, '') + 'M'; if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return '$' + Math.round(n); };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ym = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || '')); return m ? { y: +m[1], m: +m[2] } : null; };
  const monthName = d => { const x = ym(d); return x ? MONTHS[x.m - 1] + ' ' + x.y : ''; };
  const monthShort = d => { const x = ym(d); return x ? MONTHS[x.m - 1].slice(0, 3) : ''; };
  const longDate = d => { if (!d) return ''; const x = new Date(String(d).length === 10 ? d + 'T12:00:00' : d); return isNaN(x) ? '' : x.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' }); };
  // tidy axis steps: 1, 2, 2.5 or 5 times a power of ten, about n ticks across the span
  function ticks(lo, hi, n) {
    const span = Math.max(1, hi - lo), raw = span / Math.max(1, n || 4), p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw) || 10 * p;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }
  // a bar with rounded top corners (4 px), standing on the baseline
  const bar = (x, y, w, h, cls, title) => { h = Math.max(0, h); const r = Math.min(4, w / 2, h);
    return '<path class="' + cls + '" d="M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z"><title>' + esc(title) + '</title></path>'; };
  const table = (head, rows) => '<details class="mk-table"><summary>See the figures</summary><table class="apv-tbl"><thead><tr>' + head.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map(r => '<tr>' + r.map((c, j) => '<td data-h="' + esc(head[j]) + '">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></details>';
  const W = 340;   // the drawing's own width; it scales to its box

  /* ───────── price evidence at a glance ───────── */
  // points: [{ n, price, status: sold|listed|context, label, when }]; ranges: [{ option, low, high }]
  const STATUS = { sold: 'Sold', listed: 'On the market', context: 'For context only, not comparable' };   // the same words as the cards
  function dots(points, ranges) {
    const pts = (points || []).filter(p => p && +p.price > 0), rs = (ranges || []).filter(r => r && +r.low > 0 && +r.high > +r.low);
    if (!pts.length) return '';
    const vals = pts.map(p => +p.price).concat(...rs.map(r => [+r.low, +r.high]));
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max((hi - lo) * 0.08, hi * 0.02); lo = Math.max(0, lo - pad); hi += pad;
    const L = 14, R = W - 14, x = v => L + (v - lo) / (hi - lo) * (R - L), rad = 10;
    // stack dots that would overlap: each goes on the lowest level where it clears the dots already there
    const levels = [], placed = pts.slice().sort((a, b) => a.price - b.price).map(p => { const cx = x(p.price); let k = 0;
      while ((levels[k] || []).some(o => Math.abs(o - cx) < rad * 2 + 2)) k++; (levels[k] = levels[k] || []).push(cx); return { p, cx, k }; });
    const nl = Math.max(1, levels.length), top = rs.length ? 30 : 12, base = top + nl * (rad * 2 + 4), H = base + 30;
    const bands = rs.map((r, i) => '<g class="mk-range" data-range="' + esc(r.key || i) + '"><rect x="' + x(r.low).toFixed(1) + '" y="' + (top - 4) + '" width="' + Math.max(2, x(r.high) - x(r.low)).toFixed(1) + '" height="' + (base - top + 8) + '" rx="4"><title>' + esc((r.option || 'My range') + ': ' + dollars(r.low) + ' to ' + dollars(r.high)) + '</title></rect>'
      + '<text class="mk-range-lab" x="' + ((x(r.low) + x(r.high)) / 2).toFixed(1) + '" y="' + (top - 10) + '" text-anchor="middle">' + esc(rs.length > 1 ? (r.option || 'Range ' + (i + 1)) : 'My range') + '</text></g>').join('');
    const tk = ticks(lo, hi, 4).filter(v => v >= lo && v <= hi);
    const axis = '<line class="mk-axis" x1="' + L + '" x2="' + R + '" y1="' + (base + 4) + '" y2="' + (base + 4) + '"/>' + tk.map(v => '<text class="mk-tick" x="' + x(v).toFixed(1) + '" y="' + (base + 20) + '" text-anchor="middle">' + esc(short(v)) + '</text>').join('');
    const marks = placed.map(({ p, cx, k }) => { const cy = base - rad - 2 - k * (rad * 2 + 4), st = STATUS[p.status] ? p.status : 'sold';
      return '<g class="mk-dot ' + st + '" data-n="' + esc(p.n) + '" data-price="' + esc(p.price) + '"><circle cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="' + rad + '"/><text x="' + cx.toFixed(1) + '" y="' + (cy + 3.5) + '" text-anchor="middle">' + esc(p.n) + '</text>'
        + '<title>' + esc(p.n + '. ' + (p.label || '') + ': ' + dollars(p.price) + ', ' + STATUS[st].toLowerCase() + (p.when ? ' (' + p.when + ')' : '')) + '</title></g>'; }).join('');
    const used = ['sold', 'listed', 'context'].filter(s => pts.some(p => (STATUS[p.status] ? p.status : 'sold') === s));
    const legend = '<p class="mk-legend">' + used.map(s => '<span><i class="mk-key ' + s + '"></i>' + esc(STATUS[s]) + '</span>').join('') + (rs.length ? '<span><i class="mk-key range"></i>' + (rs.length > 1 ? 'My ranges, shaded' : 'My range, shaded') + '</span>' : '') + '</p>';
    return '<figure class="mk-fig mk-dots" role="img" aria-label="Each comparable\'s price as a numbered dot' + (rs.length ? ', with my range shaded' : '') + '">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet">' + bands + axis + marks + '</svg>' + legend
      + table(['No.', 'Comparable', 'Price', 'Status'], pts.map(p => [String(p.n), p.label || '', dollars(p.price), STATUS[STATUS[p.status] ? p.status : 'sold']])) + '</figure>';
  }

  /* ───────── the market report ───────── */
  function pickArea(months, prefer) {
    const areas = {}; (months || []).forEach(m => { if (m && m.area) areas[m.area] = (areas[m.area] || 0) + 1; });
    const names = Object.keys(areas), low = s => String(s || '').trim().toLowerCase();
    return names.find(a => prefer && low(a) === low(prefer)) || names.find(a => low(a) === 'dunedin') || names.find(a => low(a) === 'dunedin city')
      || names.sort((a, b) => areas[b] - areas[a] || (a < b ? -1 : 1))[0] || '';
  }
  // the latest twelve calendar months of an area (or fewer, from its first month), oldest first. A month with no figures stays in
  // its place as { month, missing: true }, so the charts draw it as a gap rather than squeezing the months either side together.
  const mIndex = d => { const x = ym(d); return x ? x.y * 12 + x.m - 1 : null; };
  const mOf = i => Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0') + '-01';
  function lastYear(months, area) {
    const rows = (months || []).filter(m => m && m.area === area && ym(m.month)); if (!rows.length) return [];
    const by = {}; rows.forEach(m => { by[mIndex(m.month)] = m; });
    const idx = Object.keys(by).map(Number), hi = Math.max(...idx), lo = Math.max(Math.min(...idx), hi - 11), out = [];
    for (let i = lo; i <= hi; i++) out.push(by[i] || { area, month: mOf(i), missing: true });
    return out;
  }
  // consecutive runs of points (a gap ends a run), for lines and bands that break where a month is missing
  const runs = pts => pts.reduce((a, p) => { const r = a[a.length - 1]; if (r && p.i === r[r.length - 1].i + 1) r.push(p); else a.push([p]); return a; }, []);
  // the x positions for n months, and which months get a label (every one, or every second or third so they never collide)
  const xs = n => { const L = 56, R = W - 16, step = n > 1 ? (R - L) / (n - 1) : 0; return i => n > 1 ? L + i * step : (L + R) / 2; };
  const every = n => n > 8 ? 3 : n > 5 ? 2 : 1;
  function yAxis(lo, hi, y, fmt) { return ticks(lo, hi, 3).filter(v => v >= lo && v <= hi).map(v => '<line class="mk-grid" x1="44" x2="' + (W - 8) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="mk-tick" x="40" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(fmt(v)) + '</text>').join(''); }
  function xLabels(ms, X, yb) { const k = every(ms.length); return ms.map((m, i) => (i % k === (ms.length - 1) % k) ? '<text class="mk-tick" x="' + X(i).toFixed(1) + '" y="' + yb + '" text-anchor="middle">' + esc(monthShort(m.month)) + '</text>' : '').join(''); }
  function medianChart(ms) {
    const pts = ms.map((m, i) => ({ i, m })).filter(o => +o.m.median > 0); if (pts.length < 2) return '';
    const H = 190, T = 14, B = H - 30, X = xs(ms.length);
    const vals = pts.flatMap(o => [+o.m.median, +o.m.lower_quartile || +o.m.median, +o.m.upper_quartile || +o.m.median]);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || hi * 0.05; lo = Math.max(0, lo - pad); hi += pad;
    const y = v => B - (v - lo) / (hi - lo) * (B - T);
    const spread = pts.filter(o => +o.m.lower_quartile > 0 && +o.m.upper_quartile > 0);
    const band = runs(spread).filter(r => r.length >= 2).map(r => '<path class="mk-spread" d="M' + r.map(o => X(o.i).toFixed(1) + ',' + y(+o.m.upper_quartile).toFixed(1)).join('L') + 'L' + r.slice().reverse().map(o => X(o.i).toFixed(1) + ',' + y(+o.m.lower_quartile).toFixed(1)).join('L') + 'Z"><title>The middle half of sales each month (the lower to the upper end)</title></path>').join('');
    const line = runs(pts).filter(r => r.length >= 2).map(r => '<path class="mk-line" d="M' + r.map(o => X(o.i).toFixed(1) + ',' + y(+o.m.median).toFixed(1)).join('L') + '"/>').join('');
    const marks = pts.map(o => '<circle class="mk-pt" cx="' + X(o.i).toFixed(1) + '" cy="' + y(+o.m.median).toFixed(1) + '" r="4"><title>' + esc(monthName(o.m.month) + ': median ' + dollars(o.m.median) + (spread.includes(o) ? ', middle half ' + dollars(o.m.lower_quartile) + ' to ' + dollars(o.m.upper_quartile) : '')) + '</title></circle>').join('');
    const last = pts[pts.length - 1];
    const lab = '<text class="mk-val" x="' + Math.min(W - 12, X(last.i)).toFixed(1) + '" y="' + (y(+last.m.median) - 10).toFixed(1) + '" text-anchor="end">' + esc(short(last.m.median)) + '</text>';
    return '<figure class="mk-fig" data-chart="median"><figcaption><strong>Median sale price</strong><span>The line is the median each month; the shading is the middle half of sales (the spread).</span></figcaption>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Median sale price by month, with the spread shaded">' + yAxis(lo, hi, y, short) + band + line + marks + lab + xLabels(ms, X, H - 10) + '</svg>'
      + table(['Month', 'Median', 'Lower end', 'Upper end'], ms.map(m => m.missing ? [monthName(m.month), 'No figures', '', ''] : [monthName(m.month), m.median ? dollars(m.median) : '', m.lower_quartile ? dollars(m.lower_quartile) : '', m.upper_quartile ? dollars(m.upper_quartile) : ''])) + '</figure>';
  }
  function barChart(ms, key, o) {
    const pts = ms.map((m, i) => ({ i, m, v: m[key] })).filter(p => !p.m.missing && p.v != null && isFinite(+p.v)); if (pts.length < 2) return '';
    const H = 170, T = 16, B = H - 30, X = xs(ms.length), hi = Math.max(1, ...pts.map(p => +p.v)) * 1.12, y = v => B - v / hi * (B - T);
    const bw = Math.max(6, Math.min(22, (W - 60) / ms.length - 4));
    const bars = pts.map((p, j) => bar(+(X(p.i) - bw / 2).toFixed(1), +y(+p.v).toFixed(1), bw, +(B - y(+p.v)).toFixed(1), 'mk-bar' + (j === pts.length - 1 ? ' last' : ''), monthName(p.m.month) + ': ' + o.fmt(p.v))).join('');
    const last = pts[pts.length - 1];
    const lab = '<text class="mk-val" x="' + X(last.i).toFixed(1) + '" y="' + (y(+last.v) - 5).toFixed(1) + '" text-anchor="middle">' + esc(o.fmt(last.v)) + '</text>';
    return '<figure class="mk-fig" data-chart="' + esc(key) + '"><figcaption><strong>' + esc(o.title) + '</strong><span>' + esc(o.sub) + '</span></figcaption>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(o.title) + ' by month">' + yAxis(0, hi, y, v => String(Math.round(v))) + '<line class="mk-axis" x1="44" x2="' + (W - 8) + '" y1="' + B + '" y2="' + B + '"/>' + bars + lab + xLabels(ms, X, H - 10) + '</svg>'
      + table(['Month', o.title], ms.map(m => [monthName(m.month), m.missing ? 'No figures' : m[key] != null ? o.fmt(m[key]) : ''])) + '</figure>';
  }
  // price bands: how many homes sold in each band, latest month with bands; the bands the vendor's range touches are marked
  function bandsChart(m, ranges) {
    const bs = ((m && m.bands) || []).filter(b => b && isFinite(+b.count)); if (!bs.length) return '';
    const rs = (ranges || []).filter(r => r && +r.low > 0 && +r.high > +r.low), peak = Math.max(1, ...bs.map(b => +b.count));
    const lo = b => +b.from > 0, hi = b => b.to != null && +b.to > 0;
    const label = b => lo(b) && hi(b) ? short(b.from) + ' to ' + short(b.to) : hi(b) ? 'Under ' + short(b.to) : lo(b) ? short(b.from) + ' and over' : 'All prices';
    const touches = b => rs.some(r => (!hi(b) || +r.low < +b.to) && (!lo(b) || +r.high > +b.from));
    return '<figure class="mk-fig" data-chart="bands"><figcaption><strong>Where sales landed</strong><span>Homes sold in each price band, ' + esc(monthName(m.month)) + '.' + (rs.length ? ' Your range is marked.' : '') + '</span></figcaption>'
      + '<div class="mk-bands">' + bs.map(b => { const on = touches(b); return '<div class="mk-band' + (on ? ' on' : '') + '" title="' + esc(label(b) + ': ' + b.count + ' sold') + '"><span class="mk-band-lab">' + esc(label(b)) + '</span><span class="mk-band-bar"><i style="width:' + Math.max(2, Math.round(+b.count / peak * 100)) + '%"></i></span><span class="mk-band-n">' + esc(b.count) + (on ? ' <em>Your range</em>' : '') + '</span></div>'; }).join('') + '</div>'
      + table(['Price band', 'Homes sold', 'Your range'], bs.map(b => [label(b), String(b.count), touches(b) ? 'Yes' : ''])) + '</figure>';
  }
  // months: rows of market_months; ranges: the appraisal's fields.ranges; o: { area, title }
  const SOURCES = { reinz: 'REINZ', other: 'other published figures' };
  function report(months, ranges, o) {
    o = o || {}; const area = pickArea(months, o.area), ms = lastYear(months, area); if (!ms.length) return '';
    const latest = ms[ms.length - 1], withBands = ms.slice().reverse().find(m => (m.bands || []).length);
    const got = ms.map(m => m.gathered_at).filter(Boolean).sort().pop();
    // the source line follows the figures' own source (market_months.source)
    const srcs = Array.from(new Set(ms.filter(m => !m.missing).map(m => SOURCES[m.source] || SOURCES.other)));
    const lede = latest.median ? 'In ' + monthName(latest.month) + ' the median sale price in ' + area + ' was ' + dollars(latest.median)
      + (latest.sales != null ? ', from ' + latest.sales + ' sales' : '') + (latest.days_to_sell != null ? ', and homes took ' + latest.days_to_sell + ' days to sell at the median' : '') + '.' : '';
    const charts = medianChart(ms)
      + barChart(ms, 'days_to_sell', { title: 'Days to sell', sub: 'The median number of days from listing to sale.', fmt: v => Math.round(v) + ' days' })
      + barChart(ms, 'sales', { title: 'Homes sold each month', sub: 'How many homes sold in ' + area + '.', fmt: v => Math.round(v) + ' sold' })
      + (withBands ? bandsChart(withBands, ranges) : '');
    if (!lede && !charts) return '';   // no figure to show: no report at all, not an empty one (Tim, 28 November 2026)
    return '<div class="mk-report" data-area="' + esc(area) + '">' + (lede ? '<p class="mk-lede">' + esc(lede) + '</p>' : '')
      + '<div class="mk-grid">' + charts + '</div>'
      + '<p class="apv-note mk-src">Source: ' + esc(srcs.join(' and ')) + ', figures to ' + esc(monthName(latest.month)) + (got ? ', gathered ' + esc(longDate(got)) : '') + '.</p></div>';
  }
  window.MKT = { dots, report, pickArea, lastYear, ticks, short, monthName, longDate, STATUS, SOURCES };
})();
