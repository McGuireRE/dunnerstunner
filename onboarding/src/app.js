(function () {
  'use strict';
  /* ───────── config ───────── */
  const SB_URL = 'https://hwpwyjxhdvlqrjwzxzqz.supabase.co';
  const SB_KEY = 'sb_publishable_luFnpeEPhaXWotpQiwVcVw_Yhkii6-1';
  const APP_URL = location.origin + location.pathname;
  const AGREEMENT_VERSION = 'v3.15-26102026';
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  /* ───────── helpers ───────── */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = s => parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
  const r2 = n => Math.round(n * 100) / 100;
  const money = (n, dp) => '$' + Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: dp ?? (n % 1 ? 2 : 0), maximumFractionDigits: 2 });
  const fmtDate = d => new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' });
  const fmtDT = d => new Date(d).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' });
  const main = () => $('#main');
  const trs = (s, v) => I18N.tr(s, v);   // wording built in pieces (for example a spoken label) goes through the same approved translations
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3200); }
  // signature pads: a "not saved yet" marker after drawing, and a strong confirmation once saved
  function padUnsaved(cv, on) { const w = cv && cv.closest('.sig-wrap'); if (!w) return; let u = w.querySelector('.unsaved'); if (on && !u) { u = document.createElement('span'); u.className = 'unsaved'; u.textContent = 'Not saved yet'; w.appendChild(u); } if (!on && u) u.remove(); }
  function sigSaved(cv, title, sub) {
    const w = cv && cv.closest('.sig-wrap'); if (!w) return Promise.resolve();
    padUnsaved(cv, false);
    const o = document.createElement('div'); o.className = 'sig-ok'; o.setAttribute('role', 'status');
    o.innerHTML = `<span class="tick" aria-hidden="true">✓</span><span>${esc(title || 'Signature saved')}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    w.appendChild(o);
    return new Promise(r => setTimeout(r, 2500));
  }
  const saveNote = label => `<p class="sig-save-note">When you're happy with it, press <strong>${esc(label)}</strong>. Your signature isn't saved until you do.</p>`;
  function header(name, count, pct) {
    if (IS_AGENT) setAgentNav(); $('#stepName').textContent = name || ''; JDIRTY = false; $('#stepName').dataset.count = count || ''; $('#stepCount').textContent = count || ''; $('#barFill').style.width = (pct || 0) + '%'; }
  function actions(show, backLabel, nextLabel) {
    $('#actions').hidden = !show;
    if (!show) return;
    $('#back').hidden = !backLabel; $('#back').textContent = backLabel || '';
    $('#next').hidden = !nextLabel; $('#next').textContent = nextLabel || '';
    $('#next').disabled = false;
  }
  let onBack = null, onNext = null;
  $('#back').addEventListener('click', () => onBack && onBack());
  $('#next').addEventListener('click', async () => { if (!onNext) return; const b = $('#next'); b.disabled = true; try { await onNext(); } finally { b.disabled = false; } });
  function top() { window.scrollTo({ top: 0 }); const h = $('h1', main()); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  async function must(p) { const { data, error } = await p; if (error) { console.error(error); toast(error.message || 'Something went wrong'); throw error; } return data; }
  async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
  const callName = p => (p.pref_name || '').trim() || (p.legal_name || '').trim().split(/\s+/)[0] || '';
  const joinNames = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const aboveType = cfg => cfg.aboveType || 'pct';
  function commission(cfg, p) { const flat = num(cfg.flat), thr = num(cfg.thr), t = aboveType(cfg); if (t === 'none' || p <= thr) return flat; return t === 'amount' ? flat + num(cfg.aboveAmt) : flat + (p - thr) * num(cfg.pct) / 100; }
  function commText(cfg) {
    const t = aboveType(cfg);
    if (t === 'none') return `${money(num(cfg.flat))} flat fee, whatever the sale price, plus GST`;
    if (t === 'amount') return `${money(num(cfg.flat))} for a sale price up to ${money(num(cfg.thr))}, plus a further ${money(num(cfg.aboveAmt))} if the sale price is above that, plus GST`;
    return `${money(num(cfg.flat))} for a sale price up to ${money(num(cfg.thr))}, plus ${cfg.pct}% of the portion above, plus GST`;
  }
  const limAmt = (cfg = CFG) => cfg.limOn === false ? 0 : (cfg.lim === undefined || cfg.lim === '' ? 425 : num(cfg.lim));
  const adminAmt = (cfg = CFG) => cfg.adminOn === false ? 0 : (cfg.admin === undefined || cfg.admin === '' ? 575 : num(cfg.admin));
  function pkgOf(cfg) { const [name, amt] = String(cfg.pkg || 'Later|0').split('|'); return { name, amt: name === 'Custom' ? num(cfg.custom) : +amt, label: name === 'Campaign' ? ((cfg.campaign && cfg.campaign.snapshot && cfg.campaign.snapshot.title) || 'Marketing campaign') : name === 'Custom' ? 'Custom campaign' : name + ' package' }; }

  /* ───────── campaign (shared catalogue from ../catalogue.js) ───────── */
  const HAS_CAT = typeof CATALOGUE !== 'undefined';
  const LIM_IN_PACKAGE = 425;
  function bandFor(price) { const p = num(price); return !p ? 'tm_mid' : p <= 400000 ? 'tm_lo' : p <= 1000000 ? 'tm_mid' : 'tm_hi'; }
  function pkgItems(key, band) { const out = {}; Object.entries(PACKAGES[key].items).forEach(([k, q]) => { if (k === 'lim') return; out[k === 'TM' ? band : k] = q; }); return out; }
  function sameItems(a, b) { const ka = Object.keys(a).filter(k => k !== 'lim').sort(), kb = Object.keys(b).filter(k => k !== 'lim').sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); }
  function rcTierOf(items) { return Object.keys(items).find(k => ITEMS[k] && ITEMS[k].group === 'rc'); }
  function itemPrice(i, items, camp) { if (i.id === 'rc_dx') return DX_PRICE[rcTierOf(items)] || 0; if (i.poa) return num((camp.quoted || {})[i.id]); return i.price; }
  function computeCampaign(camp) {
    if (!HAS_CAT || !camp) return { lines: [], included: [], itemsTotal: 0, total: 0, title: 'Custom campaign', pkgMatch: false };
    const items = camp.items || {};
    const order = Object.keys(ITEMS);
    const lines = Object.entries(items).filter(([id]) => ITEMS[id] && id !== 'lim').sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0])).map(([id, q]) => {
      const i = ITEMS[id], unit = itemPrice(i, items, camp);
      const name = i.group === 'trademe' ? 'Trade Me Platinum listing' : i.name;
      const detail = i.group === 'trademe' ? i.desc : (i.desc || '');
      return { id, name: name + (i.qty ? ` × ${q}` : ''), detail, sup: i.sup || '', amount: Math.round(unit * q * 100) / 100, poa: !!i.poa && !num((camp.quoted || {})[id]) };
    });
    (camp.extras || []).filter(x => x.name).forEach(x => lines.push({ id: 'x', name: x.name, detail: '', sup: x.sup || '', amount: num(x.price), poa: false }));
    const itemsTotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const pkgMatch = !!(camp.pkg && PACKAGES[camp.pkg] && !(camp.extras || []).some(x => x.name) && sameItems(items, pkgItems(camp.pkg, camp.band || 'tm_mid')));
    let saving = 0;
    if (camp.pkg && PACKAGES[camp.pkg]) {
      const base = pkgItems(camp.pkg, camp.band || 'tm_mid');
      const full = Object.entries(base).reduce((s, [id, q]) => s + (ITEMS[id] ? itemPrice(ITEMS[id], base, camp) * q : 0), 0);
      saving = Math.max(0, Math.round((full - (PACKAGES[camp.pkg].price - LIM_IN_PACKAGE)) * 100) / 100);
    }
    const total = num(camp.override) || Math.max(0, Math.round((itemsTotal - saving) * 100) / 100);
    const included = CATALOGUE[0].items.map(i => i.name);
    const title = pkgMatch ? PACKAGES[camp.pkg].name + ' package' : (camp.pkg && PACKAGES[camp.pkg] ? PACKAGES[camp.pkg].name + ' package, tailored' : 'Custom campaign');
    return { lines, included, itemsTotal, saving, total, title, pkgMatch, overridden: !!num(camp.override) };
  }

  /* ───────── campaign schedule ───────── */
  const PHASE_TEMPLATE = [
    ['Pre-listing period', 0, ['Discuss goals and customise the marketing timeline', 'Discuss property history, defects and required disclosures', 'Provide Real Estate Authority guides and disclosure documents', 'Agree the marketing budget, a fair fee and when marketing starts']],
    ['Pre-marketing period', 1, ['Refine the campaign messaging', 'Order the LIM report and arrange a building inspection if needed', 'Book staging if needed', 'Photography and media', 'You receive and approve all advertising proofs', 'Sale and purchase documents prepared and sent to your lawyer', 'Listing copy written', 'Open homes scheduled and your campaign calendar confirmed', 'Brochures and print advertising booked', 'Sign printed and installed']],
    ['Marketing period', 9, ['Your property goes live online, and print advertising is published', 'First open home, followed by a report on the first weekend\'s activity', 'Private viewings, inspections and follow-up visits arranged with your consent', 'Further open homes', 'Interested buyers helped to prepare offer paperwork']],
    ['Offer phase', 29, ['Interested buyers sign their offers', 'Offers stay sealed until presented to you', 'Every attendee contacted to encourage offers', 'Deadline closes or auction takes place', 'All offers presented; you decide to accept, decline or counter']],
    ['Agreement phase', 43, ['Marketing continues while the buyer meets their conditions', 'Once conditions are met, the property is marked SOLD and the lawyers confirm', 'If the buyer cannot confirm, marketing resumes']],
  ];
  const isoDay = d => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const plusDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const nextWeekend = d => { let x = new Date(d); while (x.getDay() !== 6) x = plusDays(x, 1); return x; };
  function defaultSchedule(startISO) {
    const s = startISO ? new Date(startISO + 'T12:00:00') : new Date();
    const phases = PHASE_TEMPLATE.map(([title, off, items]) => ({ title, start: isoDay(plusDays(s, off)), items: items.slice() }));
    const live = plusDays(s, 9), oh = nextWeekend(live);
    const events = [
      { date: isoDay(plusDays(s, 4)), time: '', title: 'Photography and media' },
      { date: isoDay(live), time: '', title: 'Listing goes live online' },
      { date: isoDay(oh), time: '11:00am', title: 'First open home' },
      { date: isoDay(plusDays(oh, 7)), time: '11:00am', title: 'Second open home' },
      { date: isoDay(plusDays(s, 29)), time: '4:00pm', title: 'Deadline closes' },
    ];
    return { phases, events };
  }
  const fmtShort = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  function scheduleHTML(sch) {
    if (!sch || !(sch.phases || []).length) return '';
    const ev = (sch.events || []).filter(e => e.title).slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    return `${ev.length ? `<div class="card tight"><h3>Key dates</h3><table class="sum">${ev.map(e => `<tr><td style="white-space:nowrap">${esc(fmtShort(e.date))}${e.time ? ', ' + esc(e.time) : ''}</td><td style="white-space:normal;text-align:left">${esc(e.title)}</td></tr>`).join('')}</table></div>` : ''}
      ${sch.phases.map((p, i) => `<div class="card tight"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap"><h3 style="margin:0">${i + 1}. ${esc(p.title)}</h3><span class="small">Commencing ${esc(fmtShort(p.start))}</span></div>
        <ul style="margin:8px 0 0;padding-left:20px">${(p.items || []).filter(Boolean).map(t => `<li class="small" style="color:var(--ink);margin:3px 0">${esc(t)}</li>`).join('')}</ul></div>`).join('')}`;
  }
  function campaignHTML(cc) {
    if (!cc.lines.length) return '';
    return `<table class="sum">${cc.lines.map(l => `<tr><td style="white-space:normal">${esc(l.name)}${l.detail ? `<br><span class="small">${esc(l.detail)}</span>` : ''}</td><td class="money">${l.poa ? 'On request' : money(l.amount, 2)}</td></tr>`).join('')}
      ${cc.saving > 0 && !cc.overridden ? `<tr><td>Package saving</td><td class="money">−${money(cc.saving, 2)}</td></tr>` : ''}
      ${cc.overridden ? `<tr><td class="small">Items at full price</td><td class="money small">${money(cc.itemsTotal, 2)}</td></tr>` : ''}
      <tr class="total"><td>${cc.overridden ? 'Agreed campaign total' : cc.pkgMatch ? esc(cc.title) + ' price' : 'Campaign total'}, incl GST</td><td class="money">${money(cc.total, 2)}</td></tr></table>
      <p class="small" style="margin:10px 0 0">Always included at no charge: ${esc(cc.included.join(', '))}.${cc.pkgMatch ? ` Package price shown without the $${LIM_IN_PACKAGE} LIM, which is listed separately.` : ''}</p>`;
  }

  /* ───────── Tim's campaign builder + schedule editor (inside setup) ───────── */
  function setBand(camp, band) {
    camp.band = band;
    const cur = Object.keys(camp.items || {}).find(k => ITEMS[k] && ITEMS[k].group === 'trademe');
    if (cur && cur !== band) { delete camp.items[cur]; camp.items[band] = 1; }
  }
  function campaignEditor(box, camp, onChange) {
    if (!HAS_CAT) { box.innerHTML = '<p class="small">The price catalogue could not be loaded. Refresh the page.</p>'; return; }
    const items = camp.items || (camp.items = {});
    const cc = computeCampaign(camp);
    const row = (i) => {
      if (i.id === 'lim') return '';
      const on = !!items[i.id], q = items[i.id] || 0;
      const dxOff = i.id === 'rc_dx' && !DX_PRICE[rcTierOf(items)];
      const price = i.poa ? 'Quoted' : i.id === 'rc_dx' ? (items.rc_plat ? 'In Platinum' : dxOff ? 'Pick Bronze, Silver or Gold' : money(DX_PRICE[rcTierOf(items)])) : money(i.price) + (i.qty ? ' each' : '');
      return `<div class="cb-row ${on ? 'on' : ''} ${dxOff ? 'off' : ''}">
        ${i.qty ? `<input type="number" min="0" max="${i.max}" value="${q}" data-qty="${i.id}" aria-label="${esc(i.name)} quantity" class="cb-qty">`
          : `<input type="checkbox" data-item="${i.id}" ${on ? 'checked' : ''} ${dxOff ? 'disabled' : ''} aria-label="${esc(i.name)}">`}
        <div class="cb-name">${esc(i.group === 'trademe' ? 'Trade Me Platinum, ' + i.desc.replace('Expected sale price ', '') : i.name)}${i.desc && i.group !== 'trademe' ? `<span class="small"> · ${esc(i.desc)}</span>` : ''}</div>
        <div class="cb-price">${i.poa && on ? `<input type="text" inputmode="decimal" placeholder="$" value="${esc((camp.quoted || {})[i.id] || '')}" data-quote="${i.id}" class="cb-quote">` : price}</div></div>`;
    };
    box.innerHTML = `
      <div class="toolbar" style="margin-top:0">${Object.entries(PACKAGES).map(([k, p]) => `<button type="button" class="btn ${camp.pkg === k && cc.pkgMatch ? 'primary' : 'ghost'}" data-pkg="${k}">${esc(p.name)} ${money(p.price)}</button>`).join('')}<button type="button" class="btn ghost" data-pkg="">Clear</button></div>
      <p class="small">Start from a package, then tick or untick anything. Package prices include the $${LIM_IN_PACKAGE} LIM, which is charged on its own line under "Costs on signing".</p>
      <details class="acc"><summary>Items in this campaign (${cc.lines.length})</summary><div class="in">
        ${CATALOGUE.slice(1).map(s => `<div class="cb-sec">${esc(s.sec)}${s.note ? ` <span class="small">${esc(s.note)}</span>` : ''}</div>${s.items.map(row).join('')}`).join('')}
        <div class="cb-sec">Other items <span class="small">Any supplier or service, at an agreed price</span></div>
        ${(camp.extras || []).map((x, n) => `<div class="cb-row on"><button type="button" class="btn link" data-rmx="${n}" aria-label="Remove">✕</button><input type="text" placeholder="Item" value="${esc(x.name)}" data-xname="${n}"><input type="text" inputmode="decimal" placeholder="$" value="${esc(x.price)}" data-xprice="${n}" class="cb-quote"></div>`).join('')}
        <button type="button" class="btn link" id="cbAddX">Add an item</button>
      </div></details>
      <div class="card tight" style="margin-top:12px">${campaignHTML(cc) || '<p class="small" style="margin:0">Nothing selected yet.</p>'}</div>
      <label class="f" for="cbOverride">Agreed campaign total <span class="opt">(optional, overrides the total above)</span></label>
      <input type="text" id="cbOverride" inputmode="decimal" value="${esc(camp.override || '')}" placeholder="Leave blank to use the total above">`;
    const redraw = () => { campaignEditor(box, camp, onChange); onChange && onChange(); };
    $$('[data-pkg]', box).forEach(b => b.addEventListener('click', () => { const k = b.dataset.pkg; camp.pkg = k || null; camp.items = k ? pkgItems(k, camp.band || 'tm_mid') : {}; camp.override = ''; redraw(); }));
    $$('[data-item]', box).forEach(cb => cb.addEventListener('change', () => {
      const i = ITEMS[cb.dataset.item];
      if (cb.checked) { if (i.group) Object.keys(items).forEach(k => { if (ITEMS[k] && ITEMS[k].group === i.group) delete items[k]; }); items[i.id] = 1; if (i.group === 'trademe') camp.band = i.id; }
      else delete items[i.id];
      if (!DX_PRICE[rcTierOf(items)]) delete items.rc_dx;
      const open = box.querySelector('details').open; redraw(); box.querySelector('details').open = open;
    }));
    $$('[data-qty]', box).forEach(inp => inp.addEventListener('change', () => { const q = Math.max(0, Math.min(+inp.max, parseInt(inp.value) || 0)); if (q) items[inp.dataset.qty] = q; else delete items[inp.dataset.qty]; const open = box.querySelector('details').open; redraw(); box.querySelector('details').open = open; }));
    $$('[data-quote]', box).forEach(inp => inp.addEventListener('change', () => { (camp.quoted ||= {})[inp.dataset.quote] = inp.value.trim(); const open = box.querySelector('details').open; redraw(); box.querySelector('details').open = open; }));
    $$('[data-xname]', box).forEach(inp => inp.addEventListener('change', () => { camp.extras[+inp.dataset.xname].name = inp.value.trim(); const open = box.querySelector('details').open; redraw(); box.querySelector('details').open = open; }));
    $$('[data-xprice]', box).forEach(inp => inp.addEventListener('change', () => { camp.extras[+inp.dataset.xprice].price = inp.value.trim(); const open = box.querySelector('details').open; redraw(); box.querySelector('details').open = open; }));
    $$('[data-rmx]', box).forEach(b => b.addEventListener('click', () => { camp.extras.splice(+b.dataset.rmx, 1); redraw(); box.querySelector('details').open = true; }));
    $('#cbAddX', box).addEventListener('click', () => { (camp.extras ||= []).push({ name: '', price: '' }); redraw(); box.querySelector('details').open = true; });
    $('#cbOverride', box).addEventListener('change', e => { camp.override = e.target.value.trim(); redraw(); });
  }

  function scheduleEditor(box, sch, getStart) {
    const ev = sch.events || (sch.events = []);
    box.innerHTML = `
      <div class="toolbar" style="margin-top:0"><button type="button" class="btn ghost" id="seReset">Fill from template</button></div>
      <p class="small">Dates are worked out from the commencement date (or today). Change anything to suit.</p>
      <div class="cb-sec">Key dates</div>
      ${ev.map((e, n) => `<div class="se-ev"><input type="date" value="${esc(e.date || '')}" data-evd="${n}" aria-label="Date"><input type="text" value="${esc(e.time || '')}" data-evt="${n}" placeholder="Time" aria-label="Time"><input type="text" value="${esc(e.title || '')}" data-evn="${n}" placeholder="What happens" aria-label="Event"><button type="button" class="btn link" data-rme="${n}" aria-label="Remove">✕</button></div>`).join('')}
      <button type="button" class="btn link" id="seAddEv">Add a date</button>
      <div class="cb-sec">Phases</div>
      ${(sch.phases || []).map((p, n) => `<div class="card tight"><div class="row2 stack"><div><label class="f" style="margin-top:0">Phase</label><input type="text" value="${esc(p.title)}" data-pt="${n}"></div><div><label class="f" style="margin-top:0">Commencing</label><input type="date" value="${esc(p.start || '')}" data-pd="${n}"></div></div>
        <label class="f">What happens <span class="opt">(one per line)</span></label><textarea data-pi="${n}" rows="${Math.max(3, (p.items || []).length)}">${esc((p.items || []).join('\n'))}</textarea></div>`).join('')}`;
    const redraw = () => scheduleEditor(box, sch, getStart);
    $('#seReset', box).addEventListener('click', () => { const d = defaultSchedule(getStart()); sch.phases = d.phases; sch.events = d.events; redraw(); });
    $('#seAddEv', box).addEventListener('click', () => { ev.push({ date: '', time: '', title: '' }); redraw(); });
    $$('[data-rme]', box).forEach(b => b.addEventListener('click', () => { ev.splice(+b.dataset.rme, 1); redraw(); }));
    $$('[data-evd]', box).forEach(i => i.addEventListener('change', () => { ev[+i.dataset.evd].date = i.value; }));
    $$('[data-evt]', box).forEach(i => i.addEventListener('input', () => { ev[+i.dataset.evt].time = i.value; }));
    $$('[data-evn]', box).forEach(i => i.addEventListener('input', () => { ev[+i.dataset.evn].title = i.value; }));
    $$('[data-pt]', box).forEach(i => i.addEventListener('input', () => { sch.phases[+i.dataset.pt].title = i.value; }));
    $$('[data-pd]', box).forEach(i => i.addEventListener('change', () => { sch.phases[+i.dataset.pd].start = i.value; }));
    $$('[data-pi]', box).forEach(i => i.addEventListener('input', () => { sch.phases[+i.dataset.pi].items = i.value.split('\n').map(s => s.trim()).filter(Boolean); }));
  }

  function campaignFromPending(p) {
    const items = {}; Object.entries(p.sel || {}).forEach(([k, q]) => { if (k !== 'lim' && ITEMS[k]) items[k] = q; });
    const band = p.band || Object.keys(items).find(k => ITEMS[k].group === 'trademe') || 'tm_mid';
    const pkg = Object.keys(PACKAGES).find(k => sameItems(items, pkgItems(k, band))) || null;
    return { pkg, band, items, extras: [], quoted: {}, override: '' };
  }

  async function openPdf(agreementId, part) {
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">Preparing your agreement…</p>');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(`${SB_URL}/functions/v1/agreement-pdf?id=${agreementId}${part ? '&part=' + part : ''}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (session ? session.access_token : '') } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not create the PDF');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message); }
  }
  const pdfBtn = (label = 'Read the full agreement (PDF)') => `<button class="btn ghost" type="button" data-pdf="1">${label}</button>`;
  function wirePdf(id) { $$('[data-pdf]').forEach(b => b.addEventListener('click', () => openPdf(id))); }

  /* ───────── content ───────── */
  const GUIDE = [
    ['What you\'re appointing us to do', 'Clause 1 and 2.1', ['McGuire Real Estate becomes your sole and exclusive agent: the only agency working on your sale.', 'We market the property, negotiate for you, prepare the paperwork and do what it takes to bring the sale home.']],
    ['How long it runs, and how it ends', 'Clause 2', ['It starts on the commencement date and keeps going until it\'s cancelled. It doesn\'t expire on its own.', 'For the first 90 days (or your earlier review date) we\'re both committed. After that either of us can end it with 7 days\' written notice.', 'By law you can cancel by 5pm on the working day after you receive your copy, no questions asked.', 'It ends automatically if your property isn\'t actively marketed for more than 20 working days, unless you asked for that.', 'If we market it off-market, you get a written update at least monthly or you\'re free to cancel.', 'We can end it if you ask us to do something unlawful, misrepresent the property, hide a material change, or mislead us about who you are.']],
    ['What you pay', 'Clauses 5 and 6', ['Commission is set out on the front page and only becomes payable when a sale goes unconditional.', 'Marketing and any costs on the front page (such as the LIM and administration fee) are separate from commission, paid through List Now.', 'Unspent marketing is usually refunded if the listing is withdrawn before it\'s spent. Any administration fee applies whether or not it sells.']],
    ['Your deposit', 'Clause 8', ['The buyer\'s deposit is held by an independent stakeholder (NZRET or Public Trust), not by us, for at least 10 working days.', 'Our commission and any directly invoiced costs are paid from the deposit or at settlement once it can be released.']],
    ['What you\'re confirming', 'Clauses 9 and 10', ['What you tell us about the property is honest and to the best of your knowledge. It\'s not a guarantee.', 'You\'re not warranting legal, consent, structural or title matters unless you\'ve confirmed them in writing.']],
    ['What we must tell buyers', 'Clause 11', ['We have to disclose known defects to buyers, and tell them about significant risks of hidden defects so they can get expert advice.', 'We can\'t follow an instruction to hide a known defect.']],
    ['Identity, privacy, photos and safety', 'Clauses 12 to 16', ['We must verify your identity before acting for you, as the law requires.', 'The agreement\'s terms stay between us, except where the law requires disclosure.', 'We can use the marketing material we create. You keep the right to use what you\'ve paid for.', 'We\'ll work together to flag hazards, and every visiting professional signs our access form.']],
    ['Buyers we meet, and if we ever want to buy', 'Clauses 19 to 21', ['We owe buyers privacy too. If a buyer we meet through your listing later hires us for something unrelated, you have no claim to that fee.', 'We (or anyone related to us) can only buy your property with your written consent and an independent valuation we pay for. If we don\'t follow this, you can cancel and we lose our commission.', 'Talk to us first if something goes wrong. You can always go to the Real Estate Authority on 0800 367 7322.']],
  ];
  /* REA guides: switched on only when Tim adds the official files to onboarding/assets/guides, listed in
     guides.json with the version of each ({"agency": {"file", "version", "title"}, "sale_purchase": {...}}).
     Until then nothing about them is shown or asked for, and the agreement keeps its links to the REA website. */
  let GUIDES = {};
  // every guide request gives up after a few seconds, so a slow or stuck connection can never hold up the page
  async function fetchT(url, opts, ms) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 5000);
    try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(t); }
  }
  // The REA's own translations of a guide, listed beside the English. We never translate these ourselves, and the receipt
  // is for the English guide. Start-up only reads the list; whether each file is really there is checked when a guide is
  // opened (reaFill), so opening the site never waits on twelve more requests.
  function reaTranslations(g, base) {
    const src = g && g.translations && typeof g.translations === 'object' ? g.translations : {}, out = [];
    ['mi', 'sm', 'to', 'hi', 'ko', 'zh'].forEach(code => {
      const t = src[code]; if (!t || typeof t.file !== 'string' || !/^[A-Za-z0-9._-]+\.pdf$/.test(t.file) || typeof t.language !== 'string' || !t.language.trim()) return;
      out.push({ code, language: t.language.trim().slice(0, 40), url: new URL(t.file, base).href });
    });
    return out;
  }
  const REA_CHECKED = {};
  function reaCheck(g) {   // which of a guide's translation files really exist: asked once, when the guide is first opened
    if (!REA_CHECKED[g.file]) REA_CHECKED[g.file] = Promise.all((g.translations || []).map(async t => { try { const h = await fetchT(t.url, { method: 'HEAD' }); return h.ok && /pdf/i.test(h.headers.get('content-type') || '') ? t : null; } catch (_) { return null; } })).then(l => l.filter(Boolean));
    return REA_CHECKED[g.file];
  }
  function reaFill() {
    $$('.rea-tr[data-rea-guide]:not([data-filled])').forEach(async box => {
      box.setAttribute('data-filled', '1');
      const g = GUIDES[box.dataset.reaGuide]; if (!g) return;
      const ts = (await reaCheck(g)).slice().sort((x, y) => (x.code === I18N.lang ? -1 : 0) - (y.code === I18N.lang ? -1 : 0));
      if (!box.isConnected || !ts.length) { box.remove(); return; }
      box.innerHTML = `<p class="small" style="margin:10px 0 4px">The Real Estate Authority also has this guide in other languages. They are the Authority's own translations, not ours. What you tick below is for the English guide.</p><p class="rea-tr-links" data-no-tr style="margin:0">${ts.map(t => `<a class="btn ghost" href="${esc(t.url)}" target="_blank" rel="noopener" data-rea-lang="${t.code}">${esc(t.language)} (PDF)</a>`).join(' ')}</p>`;
    });
  }
  async function loadGuides() {
    const found = {};
    try {
      const base = new URL('assets/guides/', location.href);
      const r = await fetchT(new URL('guides.json', base), { cache: 'no-store' });
      if (!r.ok) { GUIDES = {}; return; }
      const j = await r.json();
      for (const k of ['agency', 'sale_purchase']) {
        const g = j && j[k];
        if (!g || typeof g.file !== 'string' || !/^[A-Za-z0-9._-]+\.pdf$/.test(g.file) || typeof g.version !== 'string' || !g.version.trim()) continue;
        if (typeof g.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(g.sha256)) continue;   // the fingerprint comes from the list; the server checks the real file against it
        const url = new URL(g.file, base).href;
        const h = await fetchT(url, { method: 'HEAD' });   // only check it's there: no download on every visit
        if (!h.ok || !/pdf/i.test(h.headers.get('content-type') || '')) continue;
        found[k] = { file: g.file, version: g.version.trim(), url, sha256: g.sha256, title: typeof g.title === 'string' && g.title.trim() ? g.title.trim() : (k === 'agency' ? 'Real Estate Authority guide to agency agreements' : 'Real Estate Authority guide to sale and purchase agreements'), translations: reaTranslations(g, base) };
      }
    } catch (_) { }
    GUIDES = found;
  }
  // The Complaints procedure, as appended to the agreement PDF (fn/pdf.ts COMPLAINTS; a test keeps them the same)
  const COMPLAINTS = {
    id: 'CDR-2026-11',
    title: 'Complaints and Dispute Resolution Procedures',
    intro: [
      'Pursuant to Rule 12 of the Real Estate Agents Act (Professional Conduct and Client Care Rules) 2012, all licensed Real Estate Agents are required to have a written in-house complaints and dispute resolution procedure. That procedure is set out below.',
      'You do not have to use our complaints and resolution procedure. You may make a complaint directly to the Real Estate Authority at any time. You can make a complaint to the Real Estate Authority even if you choose to also use our procedures.',
      'Our complaints and dispute resolution procedures are designed to provide a simple and personalised process for resolving any complaint you might have about the service you have received from our agency.',
    ],
    steps: [
      ['Step 1: Contact the Manager', ['Timothy McGuire', 'Phone: 027 562 7207', 'Email: tim@mcguire.co.nz', 'Tell the manager who you are complaining about and what your concerns are. Let the manager know what you would like done about your complaint.']],
      ['Step 2', ['The manager may ask you to put your complaint in writing so that he or she can investigate it. The manager will need a brief period to talk to the team members involved. We promise to come back to you within 10 working days with a response to your complaint. That response may be in writing. As part of the response, we might ask you to meet with members of our team to discuss the complaint and try and agree a resolution.']],
      ['Step 3', ['If we are unable to come to an agreed resolution after a meeting, or if you don\'t wish to meet with us, then we will provide you with a written proposal to resolve your complaint.']],
      ['Step 4', ['If you do not accept our proposal, please advise us in writing within five working days. You can of course suggest another way of resolving your complaint.']],
      ['Step 5', ['If we accept your preferred resolution, we will attempt to implement that resolution as soon as possible. If we decline your preferred resolution, we may invite you to mediate the dispute.']],
      ['Step 6', ['If we agree to mediate the complaint but do not settle the complaint at mediation, or we do not agree to mediate the dispute, then that will be the end of our process.']],
    ],
    close: 'Remember, you can still make a complaint to the Real Estate Authority in the first instance, and even if you use these procedures, you can still make a complaint to the Real Estate Authority at any time. The Real Estate Authority, C/O P.O. Box 25-371, Wellington 6146, New Zealand, 0800 367 7322 or 04 471 8930.',
  };
  const APPENDIX_SET = 'P2-2026-11', VENDOR_GUIDE_ID = 'VG-2026-11';
  const complaintsHTML = () => `<details class="inline-doc" data-signed><summary>Read our complaints procedure</summary><h4>${esc(COMPLAINTS.title)}</h4>${COMPLAINTS.intro.map(t => `<p>${esc(t)}</p>`).join('')}${COMPLAINTS.steps.map(([h, ls]) => `<p><strong>${esc(h)}</strong><br>${ls.map(esc).join('<br>')}</p>`).join('')}<p>${esc(COMPLAINTS.close)}</p></details>`;
  // What goes into each client signature from phase 2: which documents are appended to the agreement, and the
  // REA guide receipt. An agreement someone signed before phase 2 stays on the old format for everyone.
  async function signExtras(agId, an) {
    let old = false;
    try { const { data } = await sb.from('signatures').select('snapshot,signer_role,signed_at').eq('agreement_id', agId); const cs = (data || []).filter(x => x.signer_role === 'client').sort((x, y) => x.signed_at < y.signed_at ? -1 : 1); old = cs.length > 0 && !(cs[0].snapshot || {}).appendices; } catch (_) { }
    const g = GUIDES.agency, out = {};
    const g2 = GUIDES.sale_purchase, rg = [];
    if (g && (an.acks || []).includes('1')) rg.push({ guide: 'agency', title: g.title, version: g.version, file: g.file, sha256: g.sha256, shown: 'Given on screen before signing (shown or opened from the signing page)', acknowledged_at: an._reaAgencyAt || new Date().toISOString() });
    if (g2 && (an.acks || []).includes('2')) rg.push({ guide: 'sale_purchase', title: g2.title, version: g2.version, file: g2.file, sha256: g2.sha256, shown: 'Given on screen before signing (shown or opened from the signing page)', acknowledged_at: an._reaSaleAt || new Date().toISOString() });
    if (rg.length) out.rea_guides = rg;
    if (!old) out.appendices = { set: APPENDIX_SET, vendor_guide: VENDOR_GUIDE_ID, complaints: COMPLAINTS.id, rea_agency_guide: g ? { version: g.version, file: g.file, title: g.title, sha256: g.sha256 } : null };
    return out;
  }
  const REA_AA = 'https://www.rea.govt.nz/assets/Uploads/Resources/Guides/Agency-agreement-guide.pdf';
  const REA_SP = 'https://www.rea.govt.nz/assets/Uploads/Resources/Guides/Sale-and-purchase-agreement-guide.pdf';
  function acksList(cfg) {
    return [
      ['I was told I may need technical or other advice, and given time to get it', ''],
      GUIDES.agency ? ['I received the Real Estate Authority guide to agency agreements', 'Here it is. Read it before you tick.', guideViewer(GUIDES.agency)] : ['I received the Real Estate Authority guide to agency agreements', `<a href="${REA_AA}" target="_blank" rel="noopener">Open the agency agreement guide</a>`],
      GUIDES.sale_purchase ? ['I received the Real Estate Authority guide to sale and purchase agreements', 'Here it is. It explains the agreement a buyer will sign. Read it before you tick.', guideViewer(GUIDES.sale_purchase)] : ['I received the Real Estate Authority guide to sale and purchase agreements', `<a href="${REA_SP}" target="_blank" rel="noopener">Open the sale and purchase guide</a>`],
      ['I know about McGuire\'s complaints process, and that I can go straight to the Real Estate Authority', 'Talk to Tim first if you can. The REA is on 0800 367 7322, whether or not you\'ve used our process.', complaintsHTML()],
      ['It was explained when I could end up paying two commissions', 'Mainly if another agent\'s sole agency is still running.'],
      ['I was told when this agreement ends', 'See "How long it runs, and how it ends".'],
      ['Sale methods were explained, including how the method can affect what licensees earn', ''],
      ['I understand what McGuire must disclose to buyers', 'Clauses 11.1 and 11.2.'],
      cfg.appr === 'pending'
        ? ['I understand this agreement only takes effect once I\'ve received a written appraisal', 'Tim will send it to you. You can cancel within 2 working days of receiving it.']
        : ['I received a written appraisal', ''],
      ['I was recommended to get tax and legal advice where it applies', 'For example if you\'ve owned it under five years, it\'s held in a trust or company, it isn\'t your main home, or it\'s being subdivided.'],
      ['I was advised about the LIM report, and to get advice on its contents', limAmt(cfg) ? 'Tim orders it for you once you\'ve signed.' : ''],
    ];
  }
  const CHATTELS = ['Fixed floor coverings', 'Blinds', 'Curtains', 'Light fittings', 'Stove', 'Rangehood', 'Dishwasher', 'Heat pump', 'Extractor fans', 'Smoke alarms', 'Garage door remote', 'Clothesline', 'Fridge', 'Washing machine'];
  const CHATTELS_DEFAULT = CHATTELS.slice(0, 12);
  const HAZ = ['Steep driveway or steps', 'Uneven paths', 'Pool or spa', 'Dog or other pets', 'Low doorways or beams', 'Steep section or retaining', 'Loose or slippery decking', 'Ongoing building work'];

  /* ───────── form helpers (answers) ───────── */
  let ANS = {};
  const v = (k, d = '') => ANS[k] ?? d;
  const f = {
    text: (k, label, opt = {}) => `<div><label class="f" for="a_${k}" ${opt.top ? 'style="margin-top:0"' : ''}>${label}${opt.optional ? ' <span class="opt">(optional)</span>' : ''}</label><input type="${opt.type || 'text'}" id="a_${k}" data-a="${k}" value="${esc(v(k, opt.d ?? ''))}" ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ''} ${opt.im ? `inputmode="${opt.im}"` : ''}></div>`,
    area: (k, label, opt = {}) => `<label class="f" for="a_${k}">${label}${opt.optional ? ' <span class="opt">(optional)</span>' : ''}</label><textarea id="a_${k}" data-a="${k}" ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ''}>${esc(v(k, opt.d ?? ''))}</textarea>`,
    select: (k, label, opts, d) => `<div><label class="f" for="a_${k}">${label}</label><select id="a_${k}" data-a="${k}">${opts.map(o => `<option value="${esc(o)}" ${v(k, d) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`,
    radio: (k, val, title, desc, d) => `<label class="choice"><input type="radio" name="r_${k}" data-a="${k}" value="${esc(val)}" ${v(k, d) === val ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${title}</span>${desc ? `<span class="cd">${desc}</span>` : ''}</span></label>`,
    check: (k, title, desc, d = false) => `<label class="choice cb"><input type="checkbox" data-a="${k}" ${v(k, d) ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${title}</span>${desc ? `<span class="cd">${desc}</span>` : ''}</span></label>`,
    chips: (k, list, d) => `<div class="chip-row">${list.map(n => `<label class="chip"><input type="checkbox" data-multi="${k}" value="${esc(n)}" ${(v(k, d) || []).includes(n) ? 'checked' : ''}>${esc(n)}</label>`).join('')}</div>`,
  };
  function collect(root = main()) {
    const out = {};
    $$('[data-a]', root).forEach(el => {
      const k = el.dataset.a;
      if (el.type === 'radio') { if (el.checked) out[k] = el.value; else if (!(k in out)) out[k] = ANS[k] ?? ''; }
      else if (el.type === 'checkbox') out[k] = el.checked;
      else out[k] = el.value;
    });
    const multi = {};
    $$('[data-multi]', root).forEach(el => { (multi[el.dataset.multi] ||= []); if (el.checked) multi[el.dataset.multi].push(el.value); });
    Object.assign(out, multi);
    Object.assign(ANS, out);
    return out;
  }
  function wireReveals(root = main()) {
    $$('[data-reveal]', root).forEach(box => {
      const [k, val] = box.dataset.reveal.split('=');
      const upd = () => { const c = $(`[data-a="${k}"]:checked`, root); box.hidden = !(c && c.value === val); };
      $$(`[data-a="${k}"]`, root).forEach(r => r.addEventListener('change', upd)); upd();
    });
  }

  /* ───────── previous agencies and their cancellation notices ───────── */
  const PRIOR_KINDS = ['Sole agency', 'General agency', 'Not sure'];
  function priorCard(x, i) {
    return `<div class="card tight pa"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Previous agency ${i + 1}</h3><button class="btn link" type="button" data-rmpa="${i}">Remove</button></div>
      <div class="row2 stack"><div><label class="f">Agency name</label><input type="text" data-pa="agency" value="${esc(x.agency || '')}" placeholder="For example: Smith Realty Ltd"></div><div><label class="f">Salesperson <span class="opt">(optional)</span></label><input type="text" data-pa="agent" value="${esc(x.agent || '')}"></div></div>
      <div class="row2 stack"><div><label class="f">Type of agency</label><select data-pa="kind">${PRIOR_KINDS.map(k => `<option value="${esc(k)}" ${(x.kind || 'Sole agency') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div><div><label class="f">Date it was signed <span class="opt">(optional)</span></label><input type="text" data-pa="dated" value="${esc(x.dated || '')}" placeholder="For example: 3 August 2026"></div></div>
      <label class="f">Agency email <span class="opt">(optional, lets Tim send your notice directly)</span></label><input type="email" data-pa="email" value="${esc(x.email || '')}"></div>`;
  }
  const readPrior = box => $$('.pa', box).map(c => ({ agency: $('[data-pa=agency]', c).value.trim(), agent: $('[data-pa=agent]', c).value.trim(), kind: $('[data-pa=kind]', c).value, dated: $('[data-pa=dated]', c).value.trim(), email: $('[data-pa=email]', c).value.trim() }));
  function wirePrior(box, addBtn, start) {
    let list = (start || []).slice(); if (!list.length) list.push({});
    const draw = () => { box.innerHTML = list.map(priorCard).join(''); $$('[data-rmpa]', box).forEach(b => b.addEventListener('click', () => { list = readPrior(box); list.splice(+b.dataset.rmpa, 1); if (!list.length) list.push({}); draw(); })); };
    draw();
    addBtn.addEventListener('click', () => { list = readPrior(box); list.push({}); draw(); });
  }
  const priorCheck = list => { const named = (list || []).filter(x => x.agency); if (!named.length) return 'Add the name of the previous agency.'; if ((list || []).some(x => !x.agency && (x.agent || x.email || x.dated))) return 'Add a name for each previous agency, or remove the empty one.'; if (named.some(x => x.email && !EMAIL_RE.test(x.email))) return 'Check the agency email address.'; return ''; };
  const priorList = an => an.prior === 'yes' ? (an.priorAgencies || []).filter(x => x.agency) : [];
  const priorText = an => { const l = priorList(an); return l.length ? l.map(x => `${x.agency}${x.agent ? ' (' + x.agent + ')' : ''}, ${(x.kind || 'agency').toLowerCase()}${x.dated ? ' dated ' + x.dated : ''}`).join('; ') : (an.priorDetail || ''); };
  function noticeParas(address, sellers, x) {
    return [
      `To: ${x.agency}${x.agent ? ', attention ' + x.agent : ''}`,
      `Property: ${address}`,
      `We, ${sellers}, give notice that we cancel the ${x.kind && x.kind !== 'Not sure' ? x.kind.toLowerCase() + ' agreement' : 'agency agreement'}${x.dated ? ' dated ' + x.dated : ''} under which you were appointed to sell the property above. This cancellation takes effect on the earliest date that agreement allows.`,
      'Please:',
      '1. confirm in writing the date your agency ends;',
      '2. stop marketing the property from that date, and remove all advertising, signs and online listings for it;',
      '3. send us, within 5 working days, a list of anyone you introduced to the property during your agency.',
      'We have appointed McGuire Real Estate Limited. Please reply to us, with a copy to Tim McGuire at tim@mcguire.co.nz.',
    ];
  }
  const noticeHTML = (address, sellers, x) => `<div class="card tight notice"><h3 style="margin:0 0 6px">Notice cancelling your agency with ${esc(x.agency)}</h3>${noticeParas(address, sellers, x).map(p => `<p class="small" style="margin:0 0 6px">${esc(p)}</p>`).join('')}</div>`;
  const noticeSnapshot = (address, sellers, an) => priorList(an).map((x, i) => ({ idx: (an.priorAgencies || []).indexOf(x), agency: x.agency, agent: x.agent || '', kind: x.kind || '', dated: x.dated || '', text: noticeParas(address, sellers, x) }));

  /* ───────── auth ───────── */
  let SESSION = null, IS_AGENT = false;

  /* ───────── language (phase 4) ─────────
     The choice is remembered in this browser, and on the person's own record once they are signed in. Tim's screens
     stay English. Only text a speaker has approved is ever shown; everything else stays English. */
  const LANG_KEY = 'mcLang';
  const readLocalLang = () => { try { const c = localStorage.getItem(LANG_KEY); return I18N.byCode(c) ? c : null; } catch (_) { return null; } };
  const saveLocalLang = c => { try { localStorage.setItem(LANG_KEY, c); } catch (_) { } };
  let LAYERS = {}, LANG_SEQ = 0, LANG_TOUCHED = false;
  const CONTENT = { plan: null, variation: [] };   // the plan and variations on the screen: their approved translations load with the language
  // Translations never hold a page up: every request gives up after a few seconds and the page stays in English.
  const within = (p, ms, dflt) => Promise.race([p, new Promise(r => setTimeout(() => r(dflt), ms))]);
  const getTr = async (scope, ref) => { try { const { data, error } = await within(sb.rpc('get_translations', { p_lang: I18N.lang, p_scope: scope, p_ref: ref || null }), 8000, { data: null, error: true }); return error || !data || typeof data !== 'object' ? {} : data; } catch (_) { return {}; } };
  async function loadLangDicts(code) {
    if (code === 'en') return;
    const mine = ++LANG_SEQ;
    const [a, b] = await Promise.all([getTr('screens'), getTr('guide')]);
    const content = {};
    if (CONTENT.plan) content['plan:' + CONTENT.plan] = await getTr('plan', CONTENT.plan);
    for (const id of CONTENT.variation) content['variation:' + id] = await getTr('variation', id);
    if (mine !== LANG_SEQ || I18N.lang !== code) return;   // the choice changed while this was loading
    LAYERS = Object.assign({ screens: a, guide: b }, content);
    I18N.setLayers(LAYERS);
  }
  // a plan or variation has come on screen: bring its approved translation in
  async function loadContentTr(scope, ref) {
    if (scope === 'plan') CONTENT.plan = ref; else if (!CONTENT.variation.includes(ref)) CONTENT.variation.push(ref);
    if (I18N.lang === 'en') return;
    const m = await getTr(scope, ref); if (I18N.lang === 'en') return;
    LAYERS = Object.assign({}, LAYERS, { [scope + ':' + ref]: m });
    I18N.setLayers(LAYERS);
  }
  async function chooseLang(code, opt) {
    opt = opt || {};
    if (IS_AGENT) code = 'en';
    LAYERS = {}; I18N.setLang(code); saveLocalLang(code);
    if (!opt.fromRecord) LANG_TOUCHED = true;
    if (SESSION && !IS_AGENT && !opt.fromRecord) { try { await within(sb.rpc('set_my_language', { p_lang: code }), 5000); } catch (_) { } }
    await loadLangDicts(code);
    const jo = $('#journey'); if (jo && !jo.hidden) openJourney();   // an open journey panel is drawn again in the new language
  }
  // after sign-in: this person's saved choice (unless they just chose again on this device)
  async function syncLangRecord() {
    if (!SESSION || IS_AGENT) return;
    let rec = null;
    try { const { data } = await sb.from('user_language').select('lang').eq('user_id', SESSION.user.id).limit(1); rec = data && data[0] && data[0].lang; } catch (_) { }
    if (LANG_TOUCHED || !rec) { const cur = I18N.lang; if (cur !== 'en' || rec) { try { await sb.rpc('set_my_language', { p_lang: cur }); } catch (_) { } } return; }
    if (rec !== I18N.lang) await chooseLang(rec, { fromRecord: true });
  }
  function agentEnglish() { if (I18N.lang !== 'en') { LAYERS = {}; I18N.setLang('en'); } const w = $('#langWrap'); if (w) w.hidden = true; }
  async function boot() {
    const { data } = await sb.auth.getSession();
    SESSION = data.session;
    $('#signOut').hidden = !SESSION;
    closeJourney(); JCTX.pid = null; JREADY = false;
    IS_AGENT = false; setAgentNav();
    if (!SESSION) { JREADY = true; setAgentNav(); return viewLogin(); }
    let qlr = null; try { qlr = localStorage.getItem('qlReturn'); localStorage.removeItem('qlReturn'); } catch (_) { }
    if (qlr) { try { const u = new URL(qlr); if (u.origin === location.origin && u.pathname !== location.pathname) return location.replace(qlr); } catch (_) { } }
    IS_AGENT = !!(await must(sb.rpc('is_agent'))); JREADY = true; setAgentNav();
    if (IS_AGENT) agentEnglish(); else await within(syncLangRecord(), 3000);   // never wait on the language: English first, the translation arrives when it does
    await Promise.race([loadGuides(), new Promise(r => setTimeout(r, 4000))]);   // never wait more than a few seconds
    let pend = null; try { pend = JSON.parse(localStorage.getItem('pendingCampaign') || 'null'); } catch (_) { }
    if (IS_AGENT && pend) { try { localStorage.removeItem('pendingCampaign'); } catch (_) { } return viewTable(null, pend); }
    setAgentNav();
    if (IS_AGENT) return viewAgentHome();
    return viewVendorHome();
  }
  sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_IN' && !SESSION) { SESSION = s; boot(); } if (ev === 'SIGNED_OUT') { SESSION = null; boot(); } });
  $('#signOut').addEventListener('click', async () => { IS_AGENT = false; setAgentNav(); await sb.auth.signOut(); location.hash = ''; });

  function viewLogin() {
    header('', '', 0); actions(false);
    main().innerHTML = `
      <div class="login-card">
        <h1>Your agency agreement</h1>
        <p class="lede">Enter the email address Tim has for you. We'll email you a link to sign in. No password needed.</p>
        ${(() => { try { return localStorage.getItem('pendingCampaign') ? '<div class="card note tight"><p class="small" style="margin:0">Campaign ready. Sign in as Tim to start a listing with it.</p></div>' : ''; } catch (_) { return ''; } })()}
        <label class="f" for="loginEmail">Email</label>
        <input type="email" id="loginEmail" autocomplete="email" inputmode="email">
        <button class="btn primary" type="button" id="loginBtn" style="width:100%;margin-top:14px">Email me a sign-in link</button>
        <div class="err" id="loginErr"></div>
        <div class="card okc tight" id="loginSent" hidden><p class="small" style="margin:0">Check your email for a link from McGuire Real Estate. Open it on this device. It can take a minute to arrive, and may land in junk mail.</p></div>
        <p class="small" style="margin-top:24px">Questions? Call or text Tim on <strong>027 562 7207</strong>.</p>
      </div>`;
    $('#loginBtn').addEventListener('click', async () => {
      const email = $('#loginEmail').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('#loginErr').textContent = 'Please check your email address.'; return; }
      $('#loginErr').textContent = ''; $('#loginBtn').disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: APP_URL } });
      $('#loginBtn').disabled = false;
      if (error) { $('#loginErr').textContent = error.message; return; }
      $('#loginSent').hidden = false;
    });
  }

  /* ═════════════════ VENDOR ═════════════════ */
  let A = null, P = [], ME = null, CFG = {}, STEP = 0;
  const STEPS = ['Welcome', 'About you', 'Your property', 'Visiting professionals', 'Your sale', 'Marketing and costs', 'Your agreement', 'Before you sign', 'Identity check', 'Sign', 'All done'];
  const LAST = STEPS.length - 1;

  async function viewVendorHome() {
    JCTX.pid = null; JVIEW = {};
    header('', '', 0); actions(false);
    const ids = (await must(sb.rpc('claim_my_agreements'))) || [];
    let pls = []; try { pls = (await must(sb.from('prelistings').select('id,address,status,agreement_id').order('created_at', { ascending: false }))).filter(p => p.status !== 'closed' && !(p.status === 'accepted' && ids.includes(p.agreement_id))); } catch (_) { }
    if (pls.length && !ids.length && pls.length === 1) return viewPrelisting(pls[0].id);
    if (pls.length && ids.length + pls.length > 1) {
      const rows = ids.length ? await must(sb.from('agreements').select('id,ref,address,status').in('id', ids)) : [];
      main().innerHTML = `<h1>Your properties</h1>${pls.map(r => `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div style="font-weight:600">${esc(r.address)}</div><span class="small">Your appraisal and plan</span></div><button class="btn ghost" data-openpl="${r.id}">Open</button></div>`).join('')}${rows.map(r => `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div style="font-weight:600">${esc(r.address || r.ref)}</div><span class="small">Agency agreement</span></div><button class="btn ghost" data-open="${r.id}">Open</button></div>`).join('')}`;
      $$('[data-openpl]').forEach(b => b.addEventListener('click', () => viewPrelisting(b.dataset.openpl)));
      $$('[data-open]').forEach(b => b.addEventListener('click', () => loadVendor(b.dataset.open)));
      return;
    }
    if (!ids || !ids.length) {
      main().innerHTML = `<div class="login-card"><h1>Nothing to sign yet</h1><p class="lede">There's no agreement waiting for ${esc(SESSION.user.email)}. If Tim has sent you a link, check he has the right email address for you.</p><p class="small">Call or text Tim on <strong>027 562 7207</strong>.</p></div>`;
      return;
    }
    if (ids.length > 1) {
      const rows = await must(sb.from('agreements').select('id,ref,address,status').in('id', ids));
      main().innerHTML = `<h1>Your agreements</h1>${rows.map(r => `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div style="font-weight:600">${esc(r.address || r.ref)}</div><span class="pill ${r.status}">${esc(r.status)}</span></div><button class="btn ghost" data-open="${r.id}">Open</button></div>`).join('')}`;
      $$('[data-open]').forEach(b => b.addEventListener('click', () => loadVendor(b.dataset.open)));
      return;
    }
    return loadVendor(ids[0]);
  }
  async function loadVendor(id) {
    A = await must(sb.from('agreements').select('*').eq('id', id).single()); JCTX.pid = A.property_id || null; JVIEW = { ag: id };
    P = await must(sb.from('agreement_people').select('*').eq('agreement_id', id).order('position'));
    ME = P.find(p => p.user_id === SESSION.user.id) || null;
    CFG = A.config || {}; ANS = Object.assign({}, A.answers || {});
    if (A.status === 'signed' || A.status === 'countersigned' || (ME && ME.signed_at)) { await loadCancelReq(); await loadVars(); await loadForms(); STEP = LAST; const vt = varToSign(); if (vt) return viewVendorVariation(vt); }
    else if (A.status === 'parked') return vendorParked();
    else STEP = Math.min(+(ANS._step || 0), LAST - 1);
    showStep(STEP);
  }
  async function saveAns(patch) { patch._step = Math.max(STEP, +(ANS._step || 0)); await must(sb.rpc('vendor_save', { a: A.id, patch })); }

  function showStep(i) {
    STEP = i;
    header(STEPS[i], i === 0 || i === LAST ? '' : `Step ${i} of ${LAST - 1}`, i / LAST * 100);
    const r = SCREENS[i]();
    main().innerHTML = `<section class="screen active"${i === 9 ? ' data-signed data-signing' : ''}>${r}</section>`;
    wireReveals();
    (BIND[i] || (() => { }))();
    const labels = { 0: 'Get started', 8: 'Continue to signing', 9: 'Save my signature and sign' };
    actions(i !== LAST, i === 0 ? '' : 'Back', labels[i] || 'Continue');
    onBack = () => showStep(Math.max(0, i - 1));
    onNext = async () => {
      const ok = await (NEXT[i] || (async () => { await saveAns(collect()); return true; }))();
      if (ok) showStep(Math.min(LAST, i + 1));
    };
    top();
  }
  const err = msg => { const e = $('.err', main()); if (e) { e.textContent = msg || ''; if (msg) e.scrollIntoView({ block: 'center' }); } return !msg; };

  const SCREENS = [];
  const BIND = [];
  const NEXT = [];

  /* 0 welcome */
  SCREENS[0] = () => {
    const names = P.map(callName).filter(Boolean);
    return `
    <h1>${names.length ? `Hello ${esc(joinNames(names))}, let's get your sale underway.` : 'Welcome. Let\'s get your sale underway.'}</h1>
    <p class="lede">This takes about 15 minutes. I've already filled in what we discussed, so mostly you'll be checking it's right. Your answers save as you go.</p>
    <div class="card tight"><div class="prefill">Prepared by Tim McGuire ${CFG.appr === 'pending' ? 'after our conversation' : 'after your appraisal'}</div>
      <div class="facts"><div class="fact"><div class="k">Property</div><div class="v">${esc(A.address)}</div></div><div class="fact"><div class="k">Agreement</div><div class="v">Sole and Exclusive Agency, ${esc(AGREEMENT_VERSION.split('-')[0])}</div></div></div></div>
    <h2>What we'll do together</h2>
    <ol class="steps-list">
      <li><span class="n">1</span><span>Confirm who you are and who owns the property</span><span class="t">2 min</span></li>
      <li><span class="n">2</span><span>Describe your property</span><span class="t">4 min</span></li>
      <li><span class="n">3</span><span>Set your rules for visiting professionals</span><span class="t">1 min</span></li>
      <li><span class="n">4</span><span>Check the sale terms and marketing</span><span class="t">2 min</span></li>
      <li><span class="n">5</span><span>Read the agreement in plain English</span><span class="t">4 min</span></li>
      <li><span class="n">6</span><span>Sign</span><span class="t">2 min</span></li>
    </ol>
    <div class="card note"><h3>Have these handy</h3><p class="small" style="margin:0">Your GST number if you're GST registered, and your driver's licence or passport for the identity check. You can stop at any point and come back to where you left off.</p></div>
    <p class="small">Questions at any stage? Call or text Tim on <strong>027 562 7207</strong>.</p>`;
  };
  NEXT[0] = async () => { await saveAns({}); return true; };

  /* 1 about you */
  SCREENS[1] = () => `
    <h1>About you</h1>
    <p class="lede">Everyone on the title signs, each from their own phone, using their own email.</p>
    ${ANS._from_prelisting ? '<div class="card note tight"><p class="small" style="margin:0"><strong>Please check each full name matches the title exactly.</strong> We\'ve filled these in from your earlier answers, and you can change anything here.</p></div>' : ''}
    <div id="people">${P.map((p, i) => personCard(p, i)).join('')}</div>
    <button class="btn link" type="button" id="addPerson">Add another person</button>
    <h2>Who is selling?</h2>
    <p class="small">How you're signing this agreement. <span class="clause">Page 1, section A</span></p>
    <div class="choices">
      ${f.radio('capacity', 'Owners', 'We own it personally', 'The names on the title are ours', 'Owners')}
      ${f.radio('capacity', 'Trustee', 'As trustees of a trust', '', 'Owners')}
      ${f.radio('capacity', 'Director', 'As directors of a company', '', 'Owners')}
      ${f.radio('capacity', 'Authorised signatory, agent or attorney', 'On someone else\'s behalf', 'For example as attorney, executor or authorised signatory', 'Owners')}
    </div>
    <div class="reveal" id="entityWrap">${f.text('entity', 'Name of the trust, company or person you act for')}</div>
    <h2>Ownership</h2>
    <p class="small"><span class="clause">Clause 9.1.1, Verification of Ownership</span></p>
    ${CFG.owners ? `<div class="card tight"><div class="prefill">From the record of title</div><div class="facts"><div class="fact"><div class="k">Registered owners</div><div class="v">${esc(CFG.owners)}</div></div>${CFG.title ? `<div class="fact"><div class="k">Title</div><div class="v">${esc(CFG.title)}</div></div>` : ''}</div></div>` : ''}
    <div class="choices">${f.check('titleOk', CFG.owners ? 'That\'s correct' : 'We are the registered owners, or are authorised to sell', 'No one else has an interest in the property, such as a mortgagee sale, estate or relationship property claim')}</div>
    <h2>GST</h2>
    <p class="small">Are you registered for GST for this sale, or will you be by settlement? <span class="clause">Page 1, section A</span></p>
    <div class="choices two">${f.radio('gst', 'no', 'No', '', 'no')}${f.radio('gst', 'yes', 'Yes', '', 'no')}</div>
    <div class="reveal" data-reveal="gst=yes">${f.text('gstNo', 'GST number', { im: 'numeric', ph: '123-456-789' })}</div>
    <div class="err"></div>`;
  function personCard(p, i) {
    const mine = ME && p.id === ME.id;
    return `<div class="card" data-pid="${p.id || ''}" data-i="${i}">
      ${mine ? '<div class="prefill">This is you</div>' : ''}
      <div class="row2 stack">
        <div><label class="f" style="margin-top:0">Full legal name</label><input type="text" data-pk="legal_name" value="${esc(p.legal_name)}" autocomplete="${mine ? 'name' : 'off'}"></div>
        <div><label class="f" style="margin-top:0">Goes by <span class="opt">(optional)</span></label><input type="text" data-pk="pref_name" value="${esc(p.pref_name)}"></div>
      </div>
      <div class="row2 stack">
        <div><label class="f">Email</label><input type="email" data-pk="email" value="${esc(p.email)}" ${mine || p.user_id ? 'readonly' : ''}></div>
        <div><label class="f">Mobile</label><input type="tel" data-pk="phone" value="${esc(p.phone)}"></div>
      </div></div>`;
  }
  BIND[1] = () => {
    const upd = () => { $('#entityWrap').hidden = (($('[data-a="capacity"]:checked') || {}).value || 'Owners') === 'Owners'; };
    $$('[data-a="capacity"]').forEach(r => r.addEventListener('change', upd)); upd();
    $('#addPerson').addEventListener('click', () => { P.push({ legal_name: '', pref_name: '', email: '', phone: '' }); $('#people').insertAdjacentHTML('beforeend', personCard(P[P.length - 1], P.length - 1)); });
  };
  NEXT[1] = async () => {
    const cards = $$('#people .card');
    const rows = cards.map(c => ({ id: c.dataset.pid || null, ...Object.fromEntries($$('[data-pk]', c).map(i => [i.dataset.pk, i.value.trim()])) }));
    const a = collect();
    if (rows.some(r => !r.legal_name)) return err('Add a full legal name for each person.');
    if (rows.some(r => !r.id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))) return err('Add an email for each new person, so they can sign on their own phone.');
    if (!a.titleOk) return err('Please confirm the ownership details, or call Tim if something has changed.');
    if (a.capacity !== 'Owners' && !String(a.entity || '').trim()) return err('Add the name of the trust, company or person you act for.');
    if (a.gst === 'yes' && !String(a.gstNo || '').trim()) return err('Add your GST number, or choose No.');
    for (const r of rows) await must(sb.rpc('vendor_upsert_person', { a: A.id, pid: r.id, p_legal: r.legal_name, p_pref: r.pref_name, p_email: r.email, p_phone: r.phone }));
    P = await must(sb.from('agreement_people').select('*').eq('agreement_id', A.id).order('position'));
    await saveAns(a);
    return true;
  };

  /* 2 property */
  SCREENS[2] = () => `
    <h1>Your property</h1>
    <p class="lede">This becomes the Property Description attached to your agreement. Correct anything that's wrong and add what only you know.</p>
    <p class="clause">Clause 9.2.1, Property Description</p>
    <div class="card">
      ${ANS.pType ? '<div class="prefill">Started by Tim</div>' : ''}
      <div class="row2 stack">${f.select('pType', 'Type', ['House', 'Townhouse', 'Unit or apartment', 'Lifestyle', 'Section'], 'House')}${f.text('pYear', 'Year built <span class="opt">(approx.)</span>', { im: 'numeric' })}</div>
      <div class="row2">${f.text('pBed', 'Bedrooms', { type: 'number' })}${f.text('pBath', 'Bathrooms', { type: 'number' })}</div>
      <div class="row2">${f.text('pFloor', 'Floor area (m²)', { type: 'number' })}${f.text('pLand', 'Land area (m²)', { type: 'number' })}</div>
      <div class="row2 stack">${f.text('pBuild', 'Construction')}${f.text('pPark', 'Parking')}</div>
      ${f.text('pHeat', 'Heating and insulation')}
    </div>
    ${f.area('pLove', 'In your own words, what will buyers love?', { optional: true, ph: 'Morning sun in the kitchen, the quiet street, the walk to the park...' })}
    <h2>What stays with the house</h2><p class="small">Chattels included in the sale. Tap to change.</p>
    ${f.chips('chattels', CHATTELS, CHATTELS_DEFAULT)}
    ${f.text('chatOther', 'Anything else staying or going? <span class="opt">(optional)</span>', { ph: 'For example: garden shed stays, dining light goes with us' })}
    <h2>Work done on the property</h2><p class="small">Renovations, additions or repairs, especially anything that needed a building consent.</p>
    <div class="choices two">${f.radio('work', 'no', 'None I know of', '', '')}${f.radio('work', 'yes', 'Yes', '', '')}</div>
    <div class="reveal" data-reveal="work=yes">${f.area('workDetail', 'What was done, roughly when, and was it consented?')}</div>
    <h2>A few honest questions</h2><p class="small">Answer to the best of your knowledge. You're not giving a guarantee. <span class="clause">Clauses 9.2 to 9.5</span></p>
    ${[['wt', 'Has the property had any leaks or weathertightness issues?'], ['meth', 'Any methamphetamine use, manufacture or contamination?'], ['def', 'Any defects, council notices or requirements from anyone?']].map(([k, q]) => `
      <div class="card tight"><h3>${q}</h3><div class="choices two">${f.radio(k, 'no', 'Not that I know of', '', '')}${f.radio(k, 'yes', 'Yes', '', '')}</div>
      <div class="reveal" data-reveal="${k}=yes">${f.area(k + 'Detail', 'Tell us what you know')}</div></div>`).join('')}
    <h2>Hazards for visitors</h2><p class="small">So we can keep everyone safe at viewings and visits. <span class="clause">Clause 16.2</span></p>
    ${f.chips('hazards', HAZ, [])}
    ${f.text('hazOther', 'Anything else visitors should know? <span class="opt">(optional)</span>', { ph: 'For example: step down into the lounge' })}
    <div class="err"></div>`;
  NEXT[2] = async () => {
    const a = collect();
    for (const k of ['work', 'wt', 'meth', 'def']) if (!a[k]) return err('Please answer each Yes or No question.');
    for (const k of ['work', 'wt', 'meth', 'def']) if (a[k] === 'yes' && !String(a[k + 'Detail'] || '').trim()) return err('Tell us a little about anything you answered Yes to.');
    await saveAns(a); return true;
  };

  /* 3 visits */
  SCREENS[3] = () => `
    <h1>Who can visit your property</h1>
    <p class="lede">Buyers often send in inspectors, valuers and tradespeople. Your agreement asks me to check every one of them before they come in. Here's what that means, and the choices that are yours.</p>
    <p class="clause">Clause 16.4 and the Third-Party Investigation Policy</p>
    <h2>Every professional must</h2>
    <div class="choices">
      ${['Be accompanied by a McGuire representative for the whole visit|Company policy: no buyer, professional or contractor visits without us', 'Give their name and contact details and sign our access form|Before entering, every time', 'Hold current registration or licensing for their trade|', 'Hold current public liability insurance|Evidence available on request', 'Declare why they\'re visiting|An independent assessment, a quote, or a sales assessment', 'Stay independent of any repair work from their own report|When attending as an independent inspector', 'Follow safety directions, bring their own equipment, and keep what they learn confidential|'].map(s => { const [t, d] = s.split('|'); return `<div class="choice locked"><span class="mark"></span><span><span class="ct">${t}</span>${d ? `<span class="cd">${d}</span>` : ''}</span></div>`; }).join('')}
    </div>
    <h2>Your choices</h2>
    <div class="choices">
      ${f.check('vQuotes', 'Allow visits to give a buyer a quote', 'For example a builder pricing an extension', true)}
      ${f.check('vSales', 'Allow sales assessments', 'Someone assessing the home to sell the buyer a product, such as solar or insulation', false)}
      ${f.check('vNotify', 'Tell me before each visit', 'A text with who is coming, when and why', true)}
    </div>
    ${f.select('vNotice', 'Minimum notice for a visit', ['Same day is fine', '24 hours', '48 hours'], 'Same day is fine')}
    ${f.text('vNotes', 'Pets, keys, alarm or access notes <span class="opt">(optional)</span>', { ph: 'For example: cat inside, please keep doors closed' })}`;

  /* 4 sale */
  SCREENS[4] = () => {
    const pending = CFG.appr === 'pending', start = new Date(A.sent_at || Date.now()); start.setDate(start.getDate() + 2);
    const review = new Date(start); review.setDate(review.getDate() + 90);
    return `
    <h1>Your sale terms</h1>
    <p class="lede">This is what we agreed. Check it matches your understanding.</p>
    ${pending ? '<div class="card warnc"><h3>Conditional on your written appraisal</h3><p class="small" style="margin:0">You\'re listing before I\'ve given you a written appraisal. This agreement only takes effect once you\'ve received it, and nothing is marketed or spent before then. If the appraisal changes your mind, you can cancel within 2 working days of receiving it, at no cost.</p></div>' : ''}
    <h2>Commission</h2><p class="clause">Page 1, section D and clause 5</p>
    <div class="card"><div class="prefill">As agreed with Tim, and entered by him</div>
      <table class="sum">${aboveType(CFG) === 'none' ? `<tr><td>Flat fee, whatever the sale price</td><td class="money">${money(num(CFG.flat))}</td></tr>` : `<tr><td>Fee for a sale price up to ${money(num(CFG.thr))}</td><td class="money">${money(num(CFG.flat))}</td></tr>
      <tr><td>Plus, ${aboveType(CFG) === 'amount' ? 'if the sale price is above ' + money(num(CFG.thr)) : 'on the part of the price above ' + money(num(CFG.thr))}</td><td class="money">${aboveType(CFG) === 'amount' ? money(num(CFG.aboveAmt)) : esc(CFG.pct) + '%'}</td></tr>`}<tr><td>GST</td><td>Added on top</td></tr></table>
      <p class="small" style="margin:14px 0 6px">Try a sale price to see the commission:</p>
      <div class="row2"><div><label class="f" for="cPrice" style="margin-top:0">Sale price</label><input type="text" id="cPrice" inputmode="numeric" value="${pending ? '' : num(CFG.ask).toLocaleString('en-NZ')}"></div>
      <div><div class="small" style="margin-bottom:6px;font-weight:500;color:var(--ink)">Commission</div><div class="big money" id="cOut"></div><div class="small" id="cOutGst"></div></div></div>
      <p class="small" style="margin-top:12px">${pending ? 'Your agreement will record a worked example once you have your written appraisal.' : `Your agreement records an example at your <strong>asking price of ${money(num(CFG.ask))}</strong>.`} Commission is only payable once a sale is unconditional.</p></div>
    <h2>How long it runs</h2><p class="clause">Page 1, section C and clause 2</p>
    <div class="card tight"><div class="facts"><div class="fact"><div class="k">Starts</div><div class="v">${pending ? 'When you receive your written appraisal' : esc(CFG.start ? fmtDate(CFG.start) : fmtDate(start))}</div></div>
      <div class="fact"><div class="k">Review date</div><div class="v">${pending ? '90 days after it starts' : esc(fmtDate(CFG.start ? new Date(new Date(CFG.start).getTime() + 90 * 864e5) : review))}</div></div></div>
      <p class="small" style="margin:12px 0 0">After the review date either of us can end it with 7 days' written notice. It doesn't expire on its own.</p></div>
    ${CFG.method ? `<h2>Method of sale</h2><p class="clause">Clause 4</p><div class="card tight"><div class="facts"><div class="fact"><div class="k">Method</div><div class="v">${esc(CFG.method)}</div></div></div></div>` : ''}
    <h2>Other agents</h2><p class="small">Have you signed with any other real estate agent for this property? <span class="clause">Clause 3</span></p>
    <div class="choices">${f.radio('prior', 'none', 'No, no other agent', '', 'none')}${f.radio('prior', 'yes', 'Yes, I have or had another agency', '', 'none')}</div>
    <div class="reveal" data-reveal="prior=yes"><div class="card note tight"><p class="small" style="margin:0">When you sign this agreement, you'll also sign a notice cancelling each previous agency. Tim checks it and sends it for you. If a sole agency is still running, talk to Tim first: you could end up owing two commissions.</p></div><div id="priorList"></div><button class="btn link" type="button" id="addPrior">Add another agency</button></div>
    <h2>People who have already expressed interest in buying the property <span class="opt small" style="font-family:var(--body)">(optional)</span></h2>
    <p class="small">Anyone who has already approached you about buying. I can take over and fold them into the campaign, or you can deal with them yourself for the next 10 working days. <span class="clause">Clause 2.3</span></p>
    <div id="buyers"></div>
    <button class="btn link" type="button" id="addBuyer">Add someone</button>
    <div class="err"></div>`;
  };
  function buyerCard(b, i) {
    return `<div class="card tight buyer"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Interested buyer ${i + 1}</h3><button class="btn link" type="button" data-rmb="${i}">Remove</button></div>
      <label class="f">Name</label><input type="text" data-b="name" value="${esc(b.name || '')}">
      <div class="row2 stack"><div><label class="f">Phone <span class="opt">(optional)</span></label><input type="tel" data-b="phone" value="${esc(b.phone || '')}"></div><div><label class="f">Email <span class="opt">(optional)</span></label><input type="email" data-b="email" value="${esc(b.email || '')}"></div></div>
      <div class="choices" style="margin-top:10px"><label class="choice cb"><input type="checkbox" data-b="exclude" ${b.exclude ? 'checked' : ''}><span class="mark"></span><span><span class="ct">Exclude from the agency for the next 10 working days</span><span class="cd">Leave unticked and Tim will take over negotiations with them as part of your campaign</span></span></label></div></div>`;
  }
  function readBuyers() { return $$('#buyers .buyer').map(c => ({ name: $('[data-b=name]', c).value.trim(), phone: $('[data-b=phone]', c).value.trim(), email: $('[data-b=email]', c).value.trim(), exclude: $('[data-b=exclude]', c).checked })); }
  BIND[4] = () => {
    wirePrior($('#priorList'), $('#addPrior'), ANS.priorAgencies);
    let buyers = (ANS.interested || []).slice();
    const draw = () => { $('#buyers').innerHTML = buyers.map(buyerCard).join(''); $$('[data-rmb]').forEach(b => b.addEventListener('click', () => { buyers = readBuyers(); buyers.splice(+b.dataset.rmb, 1); draw(); })); };
    draw();
    $('#addBuyer').addEventListener('click', () => { buyers = readBuyers(); buyers.push({ name: '', phone: '', email: '', exclude: false }); draw(); });
    const upd = () => { const p = num($('#cPrice').value); if (!p) { $('#cOut').textContent = '–'; $('#cOutGst').textContent = 'Enter a price'; return; } const c = commission(CFG, p); $('#cOut').textContent = money(r2(c)); $('#cOutGst').textContent = 'plus GST, ' + money(r2(c * 1.15)) + ' in total'; };
    $('#cPrice').addEventListener('input', upd); upd();
  };
  NEXT[4] = async () => { const a = collect(); a.interested = readBuyers().filter(b => b.name || b.phone || b.email); if (a.interested.some(b => !b.name)) return err('Add a name for each interested buyer, or remove the empty one.'); ANS.interested = a.interested; if (a.prior === 'yes') { a.priorAgencies = readPrior($('#priorList')).filter(x => x.agency || x.agent || x.email || x.dated); const pe = priorCheck(a.priorAgencies); if (pe) return err(pe); a.priorAgencies = a.priorAgencies.filter(x => x.agency); ANS.priorAgencies = a.priorAgencies; } await saveAns(a); return true; };

  /* 5 marketing */
  SCREENS[5] = () => {
    const pk = pkgOf(CFG), timLater = pk.name === 'Later';
    return `
    <h1>Marketing and costs</h1>
    <p class="lede">Separate from commission, and paid through List Now.</p>
    <p class="clause">Page 1, section E and clause 6</p>
    ${timLater ? `<div class="card note"><h3>Marketing to be agreed later</h3><p class="small" style="margin:0">Sign now and we'll agree your marketing budget together afterwards. Nothing is booked or spent until you approve it in writing.</p></div>` : `
      <div class="card"><div class="prefill">Recommended by Tim</div>${CFG.campaign ? `<h3>${esc(pk.label)}</h3>${campaignHTML(CFG.campaign.snapshot || computeCampaign(CFG.campaign))}` : `<div class="facts" style="margin-bottom:8px"><div class="fact"><div class="k">Package</div><div class="v">${esc(pk.label)}</div></div><div class="fact"><div class="k">Budget, incl GST</div><div class="v money">${money(pk.amt, 2)}</div></div></div>`}
      <p class="small" style="margin:10px 0 0"><a href="https://packages.dunnerstunner.co.nz" target="_blank" rel="noopener">Compare packages and prices</a></p></div>
      <div class="choices">${f.radio('mkt', 'go', 'Go with this', '', 'go')}${f.radio('mkt', 'later', 'Sign now, agree marketing later', 'Nothing is booked or spent until you approve a budget in writing', 'go')}</div>`}
    <div class="card" id="mktTable"></div>
    ${CFG.schedule && (CFG.schedule.phases || []).length ? `<h2>Your campaign timeline</h2><p class="small">A guide to what happens when. Dates may move a little with bookings and weather.</p>${scheduleHTML(CFG.schedule)}` : ''}
    <div class="card note tight"><h3>Paying through List Now</h3><p class="small" style="margin:0">Invoices are issued through List Now, our payment partner. You choose how to settle with them: up front, in instalments, or deducted at settlement. Their terms and eligibility apply.</p></div>
    <div class="card tight"><h3>Rebates and commissions</h3><p class="small" style="margin:0">McGuire Real Estate doesn't receive any rebates, discounts or commissions from these suppliers. <span class="clause">Clause 7.1.1</span></p></div>
    <div class="err"></div>`;
  };
  function mktLater() { return pkgOf(CFG).name === 'Later' || ANS.mkt === 'later'; }
  BIND[5] = () => {
    const draw = () => {
      collect();
      const later = mktLater(), pk = pkgOf(CFG), amt = later ? 0 : pk.amt;
      const L = limAmt(), AD = adminAmt();
      $('#mktTable').innerHTML = `<table class="sum">${L ? `<tr><td>LIM report <span class="small">(ordered by Tim)</span></td><td class="money">${money(L, 2)}</td></tr>` : ''}
        ${AD ? `<tr><td>Administration fee <span class="small">(identity checks and onboarding)</span></td><td class="money">${money(AD, 2)}</td></tr>` : ''}
        <tr><td>${later ? 'Marketing' : esc(pk.label)}</td><td class="money">${later ? 'To be agreed' : money(amt, 2)}</td></tr>
        <tr class="total"><td>${later ? 'Due now, including GST' : 'Total, including GST'}</td><td class="money">${money(L + AD + amt, 2)}</td></tr></table>
        <p class="small" style="margin:12px 0 0">${later ? 'Your marketing will be added once you approve it.' : 'If the property sells or is withdrawn before advertising is booked and paid for, unspent marketing is refunded.'} ${AD ? 'The administration fee applies whether or not the property sells.' : ''}</p>`;
    };
    $$('[data-a="mkt"]').forEach(r => r.addEventListener('change', draw)); draw();
  };
  NEXT[5] = async () => { const a = collect(); await saveAns(a); return true; };

  /* 6 guide */
  SCREENS[6] = () => {
    const ticked = v('guide', []);
    return `
    <h1>Your agreement, in plain English</h1>
    <p class="lede">Read each section and tick it once it makes sense. If something doesn't, text Tim before you tick it.</p>
    <p class="small">The full legal wording is in the agreement itself, and if anything here differs, the agreement applies. <strong id="readCount">${ticked.length} of ${GUIDE.length}</strong> ticked.</p>
    <div class="toolbar">${pdfBtn()}<button class="btn ghost" type="button" data-tickall="guide">Tick all: I've read and understood these</button></div>
    ${GUIDE.map((g, i) => `<div class="card gcard ${ticked.includes(String(i)) ? 'done' : ''}"><h3>${esc(g[0])}</h3><div class="clause">${esc(g[1])}</div><ul>${g[2].map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <label class="choice cb"><input type="checkbox" data-multi="guide" value="${i}" ${ticked.includes(String(i)) ? 'checked' : ''}><span class="mark"></span><span class="ct">I understand this</span></label></div>`).join('')}
    <div class="err"></div>`;
  };
  BIND[6] = () => { wirePdf(A.id); $$('[data-multi="guide"]').forEach(c => c.addEventListener('change', () => { c.closest('.gcard').classList.toggle('done', c.checked); $('#readCount').textContent = `${$$('[data-multi="guide"]:checked').length} of ${GUIDE.length}`; })); wireTickAll(); };
  function wireTickAll() { $$('[data-tickall]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tickall; $$(`[data-multi="${k}"],[data-tmulti="${k}"]`).forEach(c => { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); })); }
  NEXT[6] = async () => { const a = collect(); const left = GUIDE.length - a.guide.length; if (left) return err(`Tick each section once it makes sense. ${left} to go.`); await saveAns(a); return true; };

  /* 7 acknowledgements + legal */
  SCREENS[7] = () => {
    const L = A.legal || {}, sent = L.status === 'sent';
    const acks = acksList(CFG), done = v('acks', []);
    const opts = sent
      ? [['have', 'Yes, I\'ve received my lawyer\'s advice', ''], ['waive', 'I\'m happy to go ahead without waiting for it', 'Your choice. You can still talk to your lawyer later']]
      : [['have', 'Yes, I\'ve already had legal advice', ''], ['send', 'Send it to my lawyer first', 'Your lawyer gets a link, and everything pauses until you\'ve heard back'], ['waive', 'I\'m happy to go ahead without legal advice', 'Your choice. You can still talk to a lawyer before the cooling-off period ends']];
    return `
    <h1>Before you sign</h1>
    <p class="lede">The law asks me to do certain things before you sign. Please only tick each one if I've actually done it.</p>
    <p class="clause">Clause 22.1</p>
    <div class="card"><h3>Legal advice</h3><p class="small">I recommend you get legal advice before signing, and you're welcome to take your time. <span class="clause">Clause 22.1.1</span></p>
      <div class="choices">${opts.map(([val, t, d]) => `<label class="choice"><input type="radio" name="legal" value="${val}" ${L.choice === val ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${t}</span>${d ? `<span class="cd">${d}</span>` : ''}</span></label>`).join('')}</div>
      <div id="lawWrap" hidden>
        <label class="f" for="lawN">Lawyer's name</label><input type="text" id="lawN">
        <label class="f" for="lawF">Firm</label><input type="text" id="lawF">
        <label class="f" for="lawE">Email</label><input type="email" id="lawE">
        <p class="small">They'll get a read-only link to your agreement and your answers so far. Everything pauses until you've heard back.</p>
        <button class="btn primary" type="button" id="sendLaw" style="width:100%">Send to my lawyer and pause</button>
      </div></div>
    <div class="card"><div class="toolbar" style="margin:0 0 8px"><button class="btn ghost" type="button" data-tickall="acks">Tick all: these all happened</button></div>
      ${acks.map((a, i) => `<div class="ack"><input type="checkbox" id="ak${i}" data-multi="acks" value="${i}" ${done.includes(String(i)) ? 'checked' : ''}><label for="ak${i}"><span class="what">${esc(a[0])}</span>${a[1] ? `<div class="how">${a[1]}</div>` : ''}</label>${a[2] ? `<div class="ack-more">${a[2]}</div>` : ''}</div>`).join('')}
      <p class="small" style="margin:12px 0 0">If anything above didn't happen, untick it. Text Tim and we'll fix it first.</p></div>
    <div class="err"></div>`;
  };
  BIND[7] = () => {
    const ak = $('#ak1'); if (ak && GUIDES.agency) ak.addEventListener('change', () => { if (ak.checked) ANS._reaAgencyAt = new Date().toISOString(); });
    const ak2 = $('#ak2'); if (ak2 && GUIDES.sale_purchase) ak2.addEventListener('change', () => { if (ak2.checked) ANS._reaSaleAt = new Date().toISOString(); });
    wireTickAll();
    const upd = () => { const c = $('input[name="legal"]:checked'); $('#lawWrap').hidden = !(c && c.value === 'send'); };
    $$('input[name="legal"]').forEach(r => r.addEventListener('change', upd)); upd();
    $('#sendLaw').addEventListener('click', async () => {
      const n = $('#lawN').value.trim(), fm = $('#lawF').value.trim(), e = $('#lawE').value.trim();
      if (!n || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('Add your lawyer\'s name and email.');
      collect(); await saveAns({ acks: ANS.acks || [] });
      await must(sb.rpc('vendor_send_to_lawyer', { a: A.id, l_name: n, l_firm: fm, l_email: e }));
      const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'lawyer', agreement_id: A.id } });
      if (fe) console.warn('lawyer email', fe);
      A = await must(sb.from('agreements').select('*').eq('id', A.id).single());
      vendorParked();
    });
  };
  NEXT[7] = async () => {
    const a = collect(); const c = $('input[name="legal"]:checked');
    if (!c) return err('Let us know about legal advice first.');
    if (c.value === 'send') return err('Use the button above to send it to your lawyer, or choose another option.');
    if (a.acks.length < acksList(CFG).length) return err('Tick each item, or text Tim about anything that didn\'t happen.');
    if (GUIDES.agency) a._reaAgencyAt = ANS._reaAgencyAt || new Date().toISOString();
    if (GUIDES.sale_purchase) a._reaSaleAt = ANS._reaSaleAt || new Date().toISOString();
    await saveAns(a);
    if ((A.legal || {}).choice !== c.value) { await must(sb.rpc('vendor_set_legal', { a: A.id, choice: c.value })); A.legal = Object.assign({}, A.legal, { choice: c.value }); }
    return true;
  };
  function vendorParked() {
    const L = A.legal || {};
    header('Paused for legal advice', '', 7 / LAST * 100);
    main().innerHTML = `<section class="screen active">
      <h1>Paused while your lawyer takes a look.</h1>
      <p class="lede">${esc(L.lawyer || 'Your lawyer')}${L.firm ? ' at ' + esc(L.firm) : ''} will get a read-only link to your agreement, with everything you've filled in so far.</p>
      <div class="card"><h3>What happens now</h3><ul style="margin:6px 0 0;padding-left:20px"><li>Nothing is signed and nothing has started.</li><li>Your lawyer has been emailed a read-only link, and Tim has a copy.</li><li>Once you've heard back, come back here and carry on. You'll pick up right where you left off.</li></ul></div>
      <div class="card note"><p class="small" style="margin:0">Your lawyer can read the agreement but can't change your answers. If they suggest changes, let Tim know and he'll update it for you.</p></div></section>`;
    actions(true, '', 'I\'ve heard back from my lawyer');
    onNext = async () => { showStep(7); };
    top();
  }

  /* 8 identity */
  SCREENS[8] = () => {
    const manual = (CFG.aml || 'Manual') === 'Manual';
    return `
    <h1>Verify your identity</h1>
    <p class="lede">Anti-money laundering law requires me to verify everyone selling before I can act for you. ${manual ? 'I\'ll do this with you myself, in person or on a video call.' : `It's done securely by ${esc(CFG.aml)}, and your documents go to them, not to us.`}</p>
    <p class="clause">Clause 12 and the AML/CFT Act 2009</p>
    ${P.filter(p => p.legal_name).map(p => `<div class="card tight"><div style="font-weight:600">${esc(p.legal_name)}</div><span class="status ${p.id_verified_at ? 'done' : 'pending'}">${p.id_verified_at ? 'Verified' : manual ? 'To check with Tim' : `${esc(CFG.aml)} will send a link`}</span></div>`).join('')}
    <p class="small">${manual ? 'Have your driver\'s licence or passport ready, plus something showing your address, such as a recent bank statement or rates notice. Tim will be in touch to arrange a time.' : 'Each person verifies on their own phone using their driver\'s licence or passport. It takes about two minutes.'}</p>
    <div class="card note tight"><p class="small" style="margin:0">You can sign now. Tim can't start acting for you until everyone's identity is verified.</p></div>`;
  };
  NEXT[8] = async () => { await saveAns({}); return true; };

  /* 9 sign */
  let padDrawn = false;
  function frontPage() {
    const pk = pkgOf(CFG), later = mktLater(), pending = CFG.appr === 'pending';
    const ent = ANS.capacity && ANS.capacity !== 'Owners' && ANS.entity ? `, as ${ANS.capacity.toLowerCase()} for ${ANS.entity}` : '';
    return {
      client: P.filter(p => p.legal_name).map(p => p.legal_name).join(' and ') + ent,
      gst: ANS.gst === 'yes' ? 'Yes, ' + (ANS.gstNo || '') : 'No',
      property: A.address,
      starts: pending ? 'On receipt of written appraisal' : (CFG.start ? fmtDate(CFG.start) : 'On signing'),
      review: pending ? '90 days after commencement' : '90 days after commencement',
      commission: commText(CFG),
      example: pending ? 'To be added with the written appraisal' : `At ${money(num(CFG.ask))}: ${money(r2(commission(CFG, num(CFG.ask))))} plus GST`,
      costs: [limAmt() ? 'LIM ' + money(limAmt()) : '', adminAmt() ? 'administration fee ' + money(adminAmt()) : '', 'marketing ' + (later ? 'to be agreed' : money(pk.amt))].filter(Boolean).join(', ') + ' (including GST)',
      condition: pending ? 'Takes effect on receipt of a written appraisal. The client may cancel within 2 working days of receiving it, at no cost.' : '',
      legal: (A.legal || {}).choice === 'have' ? 'Received' : 'Chose to go ahead without it',
    };
  }
  SCREENS[9] = () => {
    const fp = frontPage();
    const rows = [['A', 'Client', `${esc(fp.client)}<br><span class="small">GST registered: ${esc(fp.gst)}</span>`], ['B', 'Property', esc(fp.property)], ['C', 'Starts', esc(fp.starts)], ['C', 'Review date', esc(fp.review)],
      ['D', 'Commission', `${esc(fp.commission)}<br><span class="small">${esc(fp.example)}</span>`], ['E', 'Costs', `${esc(fp.costs)}<br><span class="small">Invoiced through List Now</span>`]];
    if (fp.condition) rows.push(['', 'Condition', esc(fp.condition)]);
    if (priorList(ANS).length) rows.push(['', 'Previous agency', esc(priorText(ANS)) + '<br><span class="small">Cancelled by the notice you sign below</span>']);
    rows.push(['', 'Property Description', `${esc(ANS.pBed || '?')} bed, ${esc(ANS.pBath || '?')} bath ${esc((ANS.pType || '').toLowerCase())}`], ['', 'Visiting professionals', `McGuire present at every visit, ${esc((ANS.vNotice || 'Same day is fine').toLowerCase())} notice`], ['', 'Legal advice', esc(fp.legal)]);
    return `
    <h1>Review and sign</h1>
    <p class="lede">Here's your front page, built from your answers.</p>
    <div class="card"><table class="sum">${rows.map(r => `<tr><td>${r[0] ? `<span class="clause">${r[0]}</span> ` : ''}${r[1]}</td><td style="white-space:normal">${r[2]}</td></tr>`).join('')}</table></div>
    ${priorList(ANS).length ? `<h2>Cancelling your previous agency</h2><p class="small">Signed with the same signature, then checked and sent by Tim.</p>${priorList(ANS).map(x => noticeHTML(A.address, fp.client, x)).join('')}` : ''}
    <h2>Signatures</h2>
    ${P.filter(p => p.legal_name).map(p => {
      const mine = ME && p.id === ME.id;
      if (mine && !p.signed_at) return `<div class="card tight">${priorList(ANS).length ? `<label class="choice cb" style="margin:0 0 10px"><input type="checkbox" id="noticeOk"><span class="mark"></span><span><span class="ct">Also sign the notice${priorList(ANS).length > 1 ? 's' : ''} cancelling my agency with ${esc(joinNames(priorList(ANS).map(x => x.agency)))}</span></span></label>` : ''}<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px"><h3 style="margin:0">${esc(p.legal_name)}</h3><button class="btn link" type="button" id="clearSig">Clear</button></div>
        <div class="sig-wrap"><canvas id="sig0" aria-label="Signature pad"></canvas><div class="sig-line"></div><span class="hint">Sign here with your finger or mouse</span></div>${saveNote('Save my signature and sign')}</div>`;
      return `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">${esc(p.legal_name)}</h3>${p.signed_at ? `<span class="signed-badge">✓ Signed ${esc(fmtDT(p.signed_at))}</span>` : '<span class="status pending">Signs on their own phone</span>'}</div>`;
    }).join('')}
    <p class="small">By signing you agree to the Sole and Exclusive Agency Agreement ${esc(AGREEMENT_VERSION.split('-')[0])}, including the Terms and Conditions, the Property Description and the Verification of Ownership. Tim countersigns once everyone has signed.</p>
    <div class="toolbar">${pdfBtn('Read the full agreement before signing (PDF)')}</div>
    <div class="err"></div>`;
  };
  function initPad(id) {
    const cv = $('#' + id); if (!cv) return;
    padDrawn = false;
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * dpr); cv.height = 150 * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a1a1a';
    let drawing = false, last = null;
    const pos = e => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    cv.addEventListener('pointerdown', e => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; padDrawn = true; const h = cv.parentElement.querySelector('.hint'); if (h) h.hidden = true; });
    const end = () => { drawing = false; if (padDrawn) padUnsaved(cv, true); }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    return () => { ctx.clearRect(0, 0, cv.width, cv.height); padDrawn = false; padUnsaved(cv, false); const h = cv.parentElement.querySelector('.hint'); if (h) h.hidden = false; };
  }
  BIND[9] = () => { wirePdf(A.id); const clear = initPad('sig0'); const c = $('#clearSig'); if (c && clear) c.addEventListener('click', clear); if (!$('#sig0')) actions(true, 'Back', 'See status'); };
  NEXT[9] = async () => {
    if (!$('#sig0')) return true;
    if (!padDrawn) return err('Please sign in the box.');
    if ($('#noticeOk') && !$('#noticeOk').checked) return err('Tick the box to sign the cancellation notice as well. If you don\'t want to cancel your previous agency, call Tim before signing.');
    const blob = await new Promise(res => $('#sig0').toBlob(res, 'image/png'));
    const path = `agreements/${A.id}/signatures/${ME.id}-${Date.now()}.png`;
    await must(sb.storage.from('private').upload(path, blob, { contentType: 'image/png' }));
    const snapshot = { agreement_version: AGREEMENT_VERSION, agreement_ref: A.ref, front_page: frontPage(), config: CFG, answers: ANS, people: P.map(p => ({ legal_name: p.legal_name, email: p.email })), signer: { name: ME.legal_name, email: SESSION.user.email }, notices: noticeSnapshot(A.address, frontPage().client, ANS), signed_at_client: new Date().toISOString() };
    Object.assign(snapshot, await signExtras(A.id, ANS));
    const res = await must(sb.rpc('vendor_sign', { a: A.id, p_image_path: path, p_snapshot: snapshot, p_user_agent: navigator.userAgent }));
    await sigSaved($('#sig0'), 'Signature saved', 'You\'ve signed the agreement');
    if (res && res.remaining === 0) { const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'signed', agreement_id: A.id } }); if (fe) console.warn('copy email', fe); }
    A = await must(sb.from('agreements').select('*').eq('id', A.id).single());
    P = await must(sb.from('agreement_people').select('*').eq('agreement_id', A.id).order('position'));
    ME = P.find(p => p.user_id === SESSION.user.id);
    await loadVars(); await loadForms();
    return true;
  };

function lawyerForm(id, title, blurb) {
    return `<div class="card" id="${id}"><h3>${title}</h3><p class="small">${blurb}</p>
      <label class="f" for="${id}N">Lawyer's name</label><input type="text" id="${id}N">
      <label class="f" for="${id}F">Firm <span class="opt">(optional)</span></label><input type="text" id="${id}F">
      <label class="f" for="${id}E">Email</label><input type="email" id="${id}E">
      <div class="toolbar"><button class="btn primary" type="button" id="${id}Go">Send to lawyer</button></div>
      <div class="err" id="${id}Err"></div><div class="card okc tight" id="${id}Ok" hidden><p class="small" style="margin:0"></p></div></div>`;
  }
  function wireLawyerForm(id, send) {
    $('#' + id + 'Go').addEventListener('click', async () => {
      const n = $('#' + id + 'N').value.trim(), fm = $('#' + id + 'F').value.trim(), e = $('#' + id + 'E').value.trim();
      const er = $('#' + id + 'Err'); er.textContent = '';
      if (!n || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { er.textContent = 'Add the lawyer\'s name and email.'; return; }
      const btn = $('#' + id + 'Go'); btn.disabled = true;
      try {
        await send(n, fm, e);
        const { data, error } = await sb.functions.invoke('notify', { body: { type: 'lawyer', agreement_id: A ? A.id : send.agId } });
        const ok = $('#' + id + 'Ok'); ok.hidden = false;
        ok.querySelector('p').textContent = (error || (data && data.ok === false)) ? `Saved, but the email didn't go yet. Tim has been told and will make sure ${n} gets it.` : `Sent. ${n} has been emailed a read-only link to the signed agreement, and Tim has a copy.`;
        ['N', 'F', 'E'].forEach(s => $('#' + id + s).value = '');
      } catch (_) { /* toast shown */ } finally { btn.disabled = false; }
    });
  }

  /* 10 done */
  SCREENS[10] = () => {
    const waiting = P.filter(p => p.legal_name && !p.signed_at);
    const unsol = CFG.approach === 'unsolicited';
    return `
    <h1>${waiting.length ? 'Thank you, you\'ve signed.' : 'Thank you, you\'re all signed.'}</h1>
    <p class="lede">${waiting.length ? `Waiting on ${esc(joinNames(waiting.map(p => callName(p) || p.legal_name)))} to sign on their own phone.` : 'I\'m looking forward to selling your home.'}</p>
    ${A.cooling_off_until ? `
    <div class="card okc"><h3>Your copy</h3><p class="small" style="margin:0">Everyone who signed is being emailed a copy. You can also come back here any time to see it.</p></div>
` : ''}
    <h2>What happens next</h2>
    <ol class="steps-list">
      ${[CFG.appr === 'pending' ? ['Tim prepares your written appraisal. Your agreement takes effect when you receive it', 'This week'] : null,
        ['List Now sends your invoice, and you choose how to settle it', 'Soon'],
        ['Tim countersigns and orders your LIM', 'Once everyone has signed'],
        mktLater() ? ['Tim sends a marketing proposal for you to approve', 'This week'] : null,
        ['We book your photographer and agree a shoot date', CFG.appr === 'pending' ? 'After your appraisal' : 'This week'],
        ['You review the listing before it goes live', 'Before launch']].filter(Boolean).map((s, i) => `<li><span class="n">${i + 1}</span><span>${s[0]}</span><span class="t">${s[1]}</span></li>`).join('')}
    </ol>
    <div class="toolbar">${pdfBtn(A.status === 'signed' || A.status === 'countersigned' ? 'Download your signed agreement (PDF)' : 'Read the full agreement (PDF)')}</div>
    ${['signed', 'countersigned', 'ended'].includes(A.status) ? '<h2>Send a copy to your lawyer</h2>' + lawyerForm('fwd', 'Forward the signed agreement', 'Your lawyer gets an email with a read-only link to the signed agreement. Tim gets a copy. You can do this as often as you like.') : ''}
    ${paperworkHTML()}
    ${varDoneHTML()}
    ${A.cooling_off_until && ['signed', 'countersigned'].includes(A.status) ? `<p class="small" style="margin-top:28px;color:var(--muted)">${CR && CR.status !== 'processed' ? `A request to cancel this agreement is with Tim (sent ${esc(fmtDT(CR.requested_at))}). He'll call you to talk it through.` : `Your cooling-off period ${new Date() <= new Date(A.cooling_off_until) ? 'ends' : 'ended'} ${unsol ? 'at the end of ' : '5pm, '}${esc(fmtDate(A.cooling_off_until))}. If you need to change or cancel this agreement, <a href="#" id="cancelLink">start here</a>.`}</p>` : ''}`;
  };
  let CR = null;
  async function loadCancelReq() { try { const rows = await must(sb.from('cancellation_requests').select('*').eq('agreement_id', A.id).order('requested_at', { ascending: false }).limit(1)); CR = rows[0] || null; } catch (_) { CR = null; } }
  function viewCancelRequest() {
    const inCO = A.cooling_off_until && new Date() <= new Date(A.cooling_off_until);
    header('Changing or cancelling', '', 100); actions(false);
    main().innerHTML = `<section class="screen active">
      <h1>Before you ask to cancel</h1>
      <p class="lede">Selling a home is a big decision, and so is stopping. Just as I made sure you were properly informed when you signed, I'll do the same now. This sends me a request; nothing is cancelled until we've spoken.</p>
      <div class="card"><h3>What happens</h3><ol class="steps-list">
        <li><span class="n">1</span><span>You tell me what's changed (optional) and send the request</span></li>
        <li><span class="n">2</span><span>I call you, usually the same day. If it's a misunderstanding we can often put it right; if you still want to stop, I'll process it</span></li>
        <li><span class="n">3</span><span>You get written confirmation once it's done</span></li></ol></div>
      <div class="card ${inCO ? 'note' : ''} tight"><p class="small" style="margin:0">${inCO ? `You're within your cooling-off period, which ends ${esc(fmtDT(A.cooling_off_until))}. Sending this request now records that you asked in time, whatever we decide after talking.` : 'Your cooling-off period has ended, so the agreement\'s own terms apply: after the review date either of us can end it with 7 days\' written notice, and before then by agreement. We\'ll talk through where things stand.'} <span class="clause">Clause 2 and the Real Estate Agents Act 2008</span></p></div>
      <label class="f" for="crWhy">What's prompted this? <span class="opt">(optional)</span></label>
      <textarea id="crWhy" placeholder="For example: our plans have changed, I'm not sure about the fee, I'd like to wait until the new year"></textarea>
      <label class="f" for="crPhone">Best number to call you on</label><input type="tel" id="crPhone" value="${esc(ME ? ME.phone || '' : '')}">
      <div class="choices" style="margin-top:14px">
        <label class="choice cb"><input type="checkbox" id="crC1"><span class="mark"></span><span><span class="ct">I understand this is a request, and nothing changes until Tim and I have spoken</span></span></label>
        <label class="choice cb"><input type="checkbox" id="crC2"><span class="mark"></span><span><span class="ct">I've had time to think about this and I'm not making the decision under pressure</span><span class="cd">If anything about your situation is making this hard, say so and I'll help where I can</span></span></label>
      </div>
      <div class="err"></div></section>`;
    actions(true, 'Back', 'Continue');
    onBack = () => showStep(LAST);
    onNext = async () => {
      if (!$('#crC1').checked || !$('#crC2').checked) return err('Please tick both boxes to continue.');
      const why = $('#crWhy').value.trim(), phone = $('#crPhone').value.trim();
      if (num(phone) < 1e6) return err('Add a phone number I can reach you on.');
      viewCancelConfirm(why, phone);
    };
    top();
  }
  function viewCancelConfirm(why, phone) {
    header('Changing or cancelling', '', 100);
    main().innerHTML = `<section class="screen active">
      <h1>Send your request to cancel</h1>
      <p class="lede">Check this is right. When you send it, Tim is told straight away and will call you on ${esc(phone)}.</p>
      <div class="card"><table class="sum"><tr><td>Agreement</td><td style="white-space:normal">${esc(A.address)} (${esc(A.ref)})</td></tr><tr><td>Requested by</td><td style="white-space:normal">${esc(ME ? ME.legal_name : '')}</td></tr><tr><td>Reasons</td><td style="white-space:normal">${why ? esc(why) : '<span class="small">Not given</span>'}</td></tr><tr><td>Call me on</td><td>${esc(phone)}</td></tr></table></div>
      <div class="choices"><label class="choice cb"><input type="checkbox" id="crFinal"><span class="mark"></span><span><span class="ct">Send my request to cancel the agency agreement</span><span class="cd">Signed in as ${esc(SESSION.user.email)}, the same way I signed</span></span></label></div>
      <div class="err"></div></section>`;
    actions(true, 'Back', 'Send request');
    onBack = () => viewCancelRequest();
    onNext = async () => {
      if (!$('#crFinal').checked) return err('Tick the box to send your request.');
      await must(sb.rpc('vendor_request_cancellation', { a: A.id, p_reasons: why, p_phone: phone, p_acks: { confirm: true, request_only: true, not_under_pressure: true, signed_in_as: SESSION.user.email }, p_user_agent: navigator.userAgent }));
      const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'cancel_request', agreement_id: A.id } }); if (fe) console.warn('cancel email', fe);
      await loadCancelReq();
      header('Request sent', '', 100); actions(true, '', 'Back to your agreement'); onNext = async () => showStep(LAST);
      main().innerHTML = `<section class="screen active"><h1>Thanks, your request is with Tim.</h1><p class="lede">He'll call you on ${esc(phone)}, usually the same day, to talk it through. Nothing changes until then, and you'll get written confirmation of whatever is decided.</p><p class="small">If you'd rather not wait, call or text Tim on <strong>027 562 7207</strong>.</p></section>`;
      top();
    };
    top();
  }
  BIND[10] = () => { wirePdf(A.id); if ($('#fwd')) wireLawyerForm('fwd', async (n, fm, e) => { await must(sb.rpc('vendor_forward_to_lawyer', { a: A.id, l_name: n, l_firm: fm, l_email: e })); }); const cl = $('#cancelLink'); if (cl) cl.addEventListener('click', e => { e.preventDefault(); viewCancelRequest(); }); wireVarDone(); wirePaperwork(); };

  /* ═════════════════ AGENT ═════════════════ */
  /* ═════════ PROPERTY FILE: one record of the property and its owners, read and written by every page ═════════ */
  const STAGES = [['appraisal', 'Appraisal'], ['questionnaire', 'Questionnaire'], ['plan', 'Updated plan'], ['accepted', 'Plan accepted'], ['agreement', 'Agreement'], ['signed', 'Signed'], ['live', 'On the market'], ['under_offer', 'Under offer'], ['sold', 'Sold'], ['settled', 'Settled'], ['withdrawn', 'Withdrawn']];
  const stageName = s => (STAGES.find(x => x[0] === s) || [s, s])[1];
  const STAGE_GROUPS = [['all', 'All', () => true], ['before', 'Before signing', p => ['appraisal', 'questionnaire', 'plan', 'accepted', 'agreement'].includes(p.stage)], ['signed', 'Signed', p => ['signed', 'live', 'under_offer', 'sold'].includes(p.stage)], ['done', 'Finished', p => ['settled', 'withdrawn'].includes(p.stage)]];
  const stagePill = s => `<span class="pill ${['signed', 'live', 'under_offer', 'sold', 'settled'].includes(s) ? 'signed' : s === 'withdrawn' ? 'ended' : 'sent'}">${esc(stageName(s))}</span>`;
  const DESC_FIELDS = [['pType', 'Type'], ['pBed', 'Bedrooms'], ['pBath', 'Bathrooms'], ['pFloor', 'Floor area (m²)'], ['pLand', 'Land area (m²)'], ['pYear', 'Year built'], ['pBuild', 'Construction'], ['pPark', 'Parking'], ['pHeat', 'Heating and insulation']];
  let PF = null;

  // documents read by the AI are kept on the property, so later steps can use them again
  async function saveReadDocs(pid, read) {
    if (!pid || !read || !(read.files || []).length) return;
    const kindOf = name => ((read.documents || []).find(d => d.file === name) || {}).kind || null;
    const rr = { flags: read.flags || [], documents: read.documents || [], at: new Date().toISOString() };
    try { await must(sb.from('property_documents').insert(read.files.map(f => ({ property_id: pid, name: f.name, path: f.path, kind: kindOf(f.name), source: 'dropped', read_result: rr, created_by: SESSION.user.email })))); } catch (e) { toast("The documents couldn't be filed on the property. Try dropping them in again."); console.warn('file docs', e); }
  }
  const propFlags = docs => { const seen = new Set(), out = []; docs.forEach(d => ((d.read_result || {}).flags || []).forEach(f => { if (!seen.has(f.text)) { seen.add(f.text); out.push(f); } })); return out; };

  async function propApplyImport(fields, people) {
    $$('[data-impf]:checked').forEach(cb => { const f = fields[+cb.dataset.impf]; impSet(f.key, impNorm(f.key, f.value)); });
    $$('[data-impp]:checked').forEach(cb => {
      const p = people[+cb.dataset.impp], m = impMatch(p);
      if (m >= 0) { const x = PF.people[m]; ['legal_name', 'pref_name', 'phone'].forEach(k => { if (p[k]) x[k] = p[k]; }); if (p.email && !x.user_id) x.email = p.email.toLowerCase(); x._dirty = true; if (!x.source) x.source = 'title'; if (p.legal_name && /title/i.test(p.source || '')) x._name_from = 'title'; }
      else PF.people.push({ legal_name: p.legal_name || '', pref_name: p.pref_name || '', email: (p.email || '').toLowerCase(), phone: p.phone || '', source: /title/i.test(p.source || '') ? 'title' : 'agent', _dirty: true });
    });
    const read = IMP; IMP = null;
    await propSave();
    await saveReadDocs(PF.p.id, read);
    toast('Added to the property file. Check each one.');
    viewProperty(PF.p.id);
  }
  async function propSave() {
    const p = PF.p;
    await must(sb.from('properties').update({ address: p.address, title_ref: p.title_ref || null, owners_on_title: p.owners_on_title || null, ownership: p.ownership, description: p.description, disclosures: p.disclosures }).eq('id', p.id));
    let pos = 1;
    for (const x of PF.people) {
      if (!(x.legal_name || '').trim() && !(x.email || '').trim()) { pos++; continue; }
      const row = { legal_name: (x.legal_name || '').trim(), pref_name: (x.pref_name || '').trim(), email: (x.email || '').trim().toLowerCase(), phone: (x.phone || '').trim(), position: pos++ };
      if (x.id) {
        if (x._dirty) { if (row.legal_name !== (x._orig_name || '')) row.name_from = x._name_from || (x.source === 'title' ? 'title' : 'agent'); await must(sb.from('property_people').update(Object.assign(row, { role: 'owner' })).eq('id', x.id)); }
        else if (x.position !== row.position) await must(sb.from('property_people').update({ position: row.position }).eq('id', x.id));
      }
      else await must(sb.from('property_people').insert(Object.assign(row, { property_id: p.id, source: x.source || 'agent', name_from: x.source === 'title' ? 'title' : 'agent', role: 'owner' })));
    }
    // a removed owner is set aside, not deleted, so the history stays and they lose access
    for (const id of PF.removed || []) await must(sb.from('property_people').update({ role: 'former' }).eq('id', id));
  }

  /* AFTER SIGNING: Tim moves a countersigned property on the market, under offer, sold, settled or withdrawn. The database checks
     every move (agent_set_stage); this tile only offers the moves that are allowed from where it is now. */
  const STAGE_NEXT = { signed: [['live', 'Put it on the market']], live: [['under_offer', 'Under offer'], ['sold', 'Sold']], under_offer: [['sold', 'Sold']], sold: [['settled', 'Settled']] };
  const STAGE_BACK = { under_offer: [['live', 'Back to on the market']], sold: [['under_offer', 'Back to under offer'], ['live', 'Back to on the market']] };
  const STAGE_SAYS = {
    live: 'The vendors will see On the market on their journey map.',
    under_offer: 'The vendors will see Under offer on their journey map. Nothing about the offer itself is shown to them.',
    sold: 'The vendors will see Sold on their journey map.',
    settled: 'This ends the agency. The identity records are kept for 5 years from today, and the vendors see settlement as done.',
    withdrawn: 'This ends the agency. The identity records are kept for 5 years from today. You can start the property again from an appraisal later.',
  };
  function stageTileHTML(p, live, events) {
    const finished = ['settled', 'withdrawn'].includes(p.stage), active = ['signed', 'live', 'under_offer', 'sold'].includes(p.stage);
    if (!active && !events.length) return '';
    const counter = live && live.status === 'countersigned';
    const btn = (k, l, cls) => `<button class="btn ${cls}" type="button" data-stg="${k}">${esc(l)}</button>`;
    const moves = !active ? '' : !counter ? `<p class="small">Countersign the agreement before you move it on.${live ? ` <button class="btn link" type="button" data-agopen="${live.id}">Open the agreement</button>` : ''}</p>`
      : `<div class="toolbar">${(STAGE_NEXT[p.stage] || []).map(([k, l], i) => btn(k, l, i ? 'ghost' : 'primary')).join('')}</div>
         <div class="toolbar">${(STAGE_BACK[p.stage] || []).map(([k, l]) => btn(k, l, 'ghost')).join('')}${btn('withdrawn', 'Withdraw it', 'ghost')}</div>`;
    return `<div class="card ptile stgtile no-print" id="stgTile"><h3>On the market and after</h3>
      <p class="small" style="margin:0 0 8px">${active ? `Now: <strong>${esc(stageName(p.stage))}</strong>. Each move asks you to confirm, and is logged.` : finished ? `This property is ${esc(stageName(p.stage).toLowerCase())}.` : ''}</p>
      ${moves}<div id="stgBox"></div>
      ${events.length ? `<details class="stg-log"${active ? '' : ' open'}><summary class="small">Stage history (${events.length})</summary>${events.map(e => { const d = e.detail || {}; return `<div class="fact"><div class="k">${esc(fmtDT(e.at))} · ${esc(e.actor)}</div><div class="v" style="font-weight:400">${e.kind === 'stage_back' ? 'Went back: ' : ''}${esc(stageName(d.from))} to ${esc(stageName(d.to))}${d.reason ? `<br><span class="small">Reason: ${esc(d.reason)}</span>` : ''}</div></div>`; }).join('')}</details>` : ''}
    </div>`;
  }
  function wireStageTile(pid, p) {
    $$('[data-stg]').forEach(b => b.addEventListener('click', () => {
      const to = b.dataset.stg, back = (STAGE_BACK[p.stage] || []).some(x => x[0] === to), ends = ['settled', 'withdrawn'].includes(to), box = $('#stgBox');
      box.innerHTML = `<div class="card ${ends ? 'warnc' : 'note'} tight" id="stgConfirm"><h4 style="margin:0 0 6px">Move to ${esc(stageName(to))}?</h4>
        <p class="small" style="margin:0 0 6px">${back ? 'This takes it back a step. ' : ''}${esc(STAGE_SAYS[to] || '')}</p>
        ${back || to === 'withdrawn' ? `<label class="f" for="stgReason" style="margin-top:0">${back ? 'Why are you going back?' : 'Note'} <span class="opt">${back ? '(needed, and kept in the record)' : '(optional, kept in the record)'}</span></label><textarea id="stgReason" rows="2"></textarea>` : ''}
        <div class="toolbar"><button class="btn primary" type="button" id="stgYes">Yes, move it</button><button class="btn ghost" type="button" id="stgNo">Not now</button></div><div class="err" id="stgErr" role="alert"></div></div>`;
      $('#stgNo').addEventListener('click', () => { box.innerHTML = ''; });
      $('#stgYes').addEventListener('click', async () => {
        const why = ($('#stgReason') || {}).value || '';
        if (back && why.trim().length < 3) return $('#stgErr').textContent = 'Say why you are going back.';
        $('#stgYes').disabled = true;
        try { await must(sb.rpc('agent_set_stage', { pid, p_stage: to, p_reason: why.trim() || null, p_confirmed: true })); toast('Moved to ' + stageName(to)); viewProperty(pid); }
        catch (_) { $('#stgYes').disabled = false; }
      });
      box.scrollIntoView({ block: 'nearest' });
    }));
  }

  async function viewProperty(id) {
    header('Property file', '', 0); actions(false);
    main().innerHTML = '<div class="loading">Loading...</div>';
    const p = await must(sb.from('properties').select('*').eq('id', id).single());
    const [people, docs, pls, ags] = await Promise.all([
      must(sb.from('property_people').select('*').eq('property_id', id).order('position')),
      must(sb.from('property_documents').select('*').eq('property_id', id).order('created_at', { ascending: false })),
      must(sb.from('prelistings').select('*').eq('property_id', id).order('created_at', { ascending: false })),
      must(sb.from('agreements').select('id,ref,status,created_at,signed_at,countersigned_at,agreement_people(id,legal_name,pref_name,signed_at,id_verified_at)').eq('property_id', id).order('created_at', { ascending: false })),
    ]);
    p.ownership ||= {}; p.description ||= {}; p.disclosures ||= {};
    const live = ags.find(a => !['ended', 'cancelled'].includes(a.status)) || null;
    let pforms = []; if (live) { try { const { data, error } = await sb.from('property_forms').select('*').eq('agreement_id', live.id); if (!error) pforms = data || []; } catch (_) { } }
    let pevents = []; try { const { data, error } = await sb.from('property_events').select('at,actor,kind,detail').eq('property_id', id).order('at', { ascending: false }); if (!error) pevents = data || []; } catch (_) { }
    const pl = pls.find(x => x.status !== 'closed' && (!p.cycle_at || x.created_at >= p.cycle_at)) || null;   // only this round's pre-listing
    const byRole = r => people.filter(x => (x.role || 'owner') === r).map(x => Object.assign({ _orig_name: x.legal_name }, x));
    PF = { p, people: byRole('owner'), contacts: byRole('contact'), formers: byRole('former'), docs, pls, ags, liveAgreement: live, removed: [] };
    const locked = !!live;
    const flags = propFlags(docs);
    const at = STAGES.findIndex(s => s[0] === p.stage);
    const strip = STAGES.filter(s => s[0] !== 'withdrawn').map(([k, l], i) => `<span class="stg ${k === p.stage ? 'on' : i < at ? 'past' : ''}">${i < at && p.stage !== 'withdrawn' ? '✓ ' : ''}${esc(l)}</span>`).join('');
    const meet = pl && (pl.answers || {}).meet && pl.answers.meet.length ? pl.answers.meet.join(', ') : '';
    const person = (x, i) => locked
      ? `<div class="fact"><div class="k">Owner ${i + 1}${x.source ? ` <span class="src-badge">From the ${esc(x.source === 'agent' ? 'file' : x.source)}</span>` : ''}</div><div class="v">${esc(x.legal_name || '(name to come)')}${x.pref_name ? ` <span class="small">(${esc(x.pref_name)})</span>` : ''}<br><span class="small">${esc([x.email, x.phone].filter(Boolean).join(' · ') || 'No contact details yet')}</span></div></div>`
      : `<div class="card tight pfp" data-i="${i}"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Owner ${i + 1}${x.source ? ` <span class="src-badge">From the ${esc(x.source === 'agent' ? 'file' : x.source)}</span>` : ''}</h3><button class="btn link" type="button" data-pfrm="${i}">Remove</button></div>
        <div class="row2 stack"><div><label class="f">Full legal name</label><input type="text" data-pf="legal_name" value="${esc(x.legal_name)}"></div><div><label class="f">Goes by</label><input type="text" data-pf="pref_name" value="${esc(x.pref_name)}"></div></div>
        <div class="row2 stack"><div><label class="f">Email</label><input type="email" data-pf="email" value="${esc(x.email)}" ${x.user_id ? 'readonly' : ''}></div><div><label class="f">Mobile</label><input type="tel" data-pf="phone" value="${esc(x.phone)}"></div></div></div>`;
    const dval = k => esc(p.description[k] || '');
    main().innerHTML = `<div class="view-pad">
      <div class="toolbar no-print"><button class="btn ghost" type="button" id="pfBack">Dashboard</button></div>
      <span class="agent-flag">Only you see this</span>
      <h1>${esc(p.address || 'Address to come')}</h1>
      <p>${stagePill(p.stage)} <span class="small">since ${esc(fmtDT(p.stage_at))}</span></p>
      <div class="stg-strip" aria-label="Where it's up to">${strip}</div>
      ${p.stage === 'withdrawn' || p.stage === 'settled' ? `<div class="card note tight"><p class="small" style="margin:0">${p.stage === 'withdrawn' ? 'Withdrawn.' : 'Settled.'} Start again from an appraisal:</p><div class="toolbar" style="margin-top:6px"><button class="btn ghost" type="button" data-pfreopen="same">Same owners</button><button class="btn ghost" type="button" data-pfreopen="new">New owners</button></div><p class="small" style="margin:6px 0 0">New owners: the current owners are set aside and can no longer see this property.</p></div>` : ''}
      <div class="ptiles">
        <div class="card ptile"><h3>Next step</h3>
          ${live ? `<p class="small">Agreement ${esc(live.ref)}: <span class="pill ${live.status}">${esc(live.status)}</span></p><div class="toolbar"><button class="btn primary" type="button" data-agopen="${live.id}">Open the agreement</button></div>`
            : pl && pl.status !== 'accepted' ? `<p class="small">Pre-listing: ${esc(plStatusText(pl))}</p><div class="toolbar"><button class="btn primary" type="button" data-plopen="${pl.id}">Open the pre-listing</button></div>`
            : ['withdrawn', 'settled'].includes(p.stage) ? `<p class="small">Choose same or new owners above to start again.</p>`
            : `<p class="small">Nothing under way.</p><div class="toolbar"><button class="btn ghost" type="button" id="pfBegin">Let's begin: appraisal page</button><button class="btn primary" type="button" id="pfAgree">Let's agree: agreement</button></div>`}
          ${meet ? `<p class="small" style="margin:8px 0 0"><strong>Best times to meet:</strong> ${esc(meet)}</p>` : ''}
        </div>
        <div class="card ptile"><h3>History</h3>
          ${pls.map(x => `<div class="fact"><div class="k">Pre-listing</div><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:8px"><span>${esc(plStatusText(x))}, ${esc(fmtDate(x.created_at))}</span><button class="btn link" type="button" data-plopen="${x.id}">Open</button></div></div>`).join('')}
          ${ags.map(a => { const ppl = a.agreement_people || [], ver = ppl.filter(x => x.id_verified_at).length; return `<div class="fact"><div class="k">Agreement ${esc(a.ref)}</div><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><span class="pill ${a.status}">${esc(a.status)}</span> <span class="small">ID checks ${ver} of ${ppl.length}</span></span><button class="btn link" type="button" data-agopen="${a.id}">Open</button></div></div>`; }).join('')}
          ${!pls.length && !ags.length ? '<p class="small" style="margin:0">No appraisal page or agreement yet.</p>' : ''}
        </div>
        ${formsTileHTML(pforms, live)}
        ${stageTileHTML(p, live, pevents)}
        ${jTileHTML(p, live, pforms, pl)}
      </div>
      <h2>Owners</h2>
      ${locked ? `<div class="card tight">${PF.people.map(person).join('') || '<p class="small" style="margin:0">No owners yet.</p>'}<p class="small" style="margin:10px 0 0">The agreement is under way, so change owners there. Changes flow back here.</p></div>`
        : `<div id="pfPeople">${PF.people.map(person).join('')}</div><button class="btn link" type="button" id="pfAddP">Add an owner</button>`}
      ${PF.contacts.length ? `<div class="card tight"><h3 style="margin:0 0 4px">Also in touch <span class="opt">(not owners, so not signers)</span></h3>${PF.contacts.map((x, i) => `<div class="fact"><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${esc(x.legal_name || x.email)}<br><span class="small">${esc([x.email, x.phone].filter(Boolean).join(' · '))}</span></span>${locked ? '' : `<button class="btn link" type="button" data-pfown="${i}">Make an owner</button>`}</div></div>`).join('')}</div>` : ''}
      ${PF.formers.length ? `<details class="card tight"><summary class="small">Earlier owners and people set aside (${PF.formers.length})</summary>${PF.formers.map(x => `<div class="fact"><div class="v" style="font-weight:400">${esc(x.legal_name || x.email)} <span class="small">${esc(x.email || '')}</span></div></div>`).join('')}</details>` : ''}
      <h2>The property</h2>
      <div class="card">
        ${locked ? `<table class="sum">
          <tr><td>Title</td><td style="white-space:normal">${esc(p.title_ref || 'Not recorded')}${p.owners_on_title ? '<br><span class="small">' + esc(p.owners_on_title) + '</span>' : ''}</td></tr>
          ${DESC_FIELDS.filter(([k]) => p.description[k]).map(([k, l]) => `<tr><td>${l}</td><td style="white-space:normal">${esc(p.description[k])}</td></tr>`).join('')}
          ${['work', 'wt', 'meth', 'def'].filter(k => p.disclosures[k] === 'yes').map(k => `<tr><td>${esc(IMP_LABELS[k])}</td><td style="white-space:normal">${esc(p.disclosures[k + 'Detail'] || 'Yes')}</td></tr>`).join('')}
        </table>`
        : `<label class="f" for="pfAddr" style="margin-top:0">Address</label><input type="text" id="pfAddr" value="${esc(p.address)}">
          <div class="row2 stack"><div><label class="f" for="pfTitle">Title reference</label><input type="text" id="pfTitle" value="${esc(p.title_ref || '')}"></div><div><label class="f" for="pfOwners">Registered owners <span class="opt">(from the title)</span></label><input type="text" id="pfOwners" value="${esc(p.owners_on_title || '')}"></div></div>
          <div class="row2">${DESC_FIELDS.slice(0, 6).map(([k, l]) => `<div><label class="f" for="pfd_${k}">${l}</label><input type="text" id="pfd_${k}" data-pfd="${k}" value="${dval(k)}"></div>`).join('')}</div>
          <div class="row2 stack">${DESC_FIELDS.slice(6).map(([k, l]) => `<div><label class="f" for="pfd_${k}">${l}</label><input type="text" id="pfd_${k}" data-pfd="${k}" value="${dval(k)}"></div>`).join('')}</div>`}
      </div>
      ${locked ? '' : '<div class="toolbar"><button class="btn primary" type="button" id="pfSave">Save the property file</button></div><div class="err" id="pfErr"></div>'}
      ${flags.length ? `<div class="card warnc"><h3>From the documents: talk these through</h3><ul class="small" style="margin:6px 0 0;padding-left:20px">${flags.map(f => `<li>${esc(f.text)} <span class="src-badge">From ${esc(f.source)}</span></li>`).join('')}</ul></div>` : ''}
      <h2>Documents</h2>
      ${docs.length ? `<div class="card tight">${docs.map((d, i) => `<div class="fact"><div class="k">${esc(d.kind || 'Document')} · ${esc(fmtDate(d.created_at))}</div><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:10px;align-items:center"><span style="overflow-wrap:anywhere">${esc(d.name)}</span><button class="btn link no-print" type="button" data-pfdoc="${i}">Open</button></div></div>`).join('')}</div>` : ''}
      ${importCardHTML(PROP_TARGET)}
    </div>`;
    if (IMPT === PROP_TARGET) wireImport();
    $('#pfBack').addEventListener('click', viewAgentDashboard);
    const jt = $('#jToggle'); if (jt) jt.addEventListener('click', () => { const l = $('#jListA'); const on = !l.classList.contains('open'); l.classList.toggle('open', on); const tl = $('#jTile'); if (tl) tl.classList.toggle('jopen', on); jt.setAttribute('aria-expanded', on); jt.textContent = on ? 'Show the current stop only' : 'Show every stop'; });
    $$('[data-agopen]').forEach(b => b.addEventListener('click', () => viewAgentDetail(b.dataset.agopen)));
    wireStageTile(id, p);
    $$('[data-plopen]').forEach(b => b.addEventListener('click', () => viewPrelistingAgent(b.dataset.plopen)));
    $$('[data-fopen]').forEach(b => b.addEventListener('click', () => viewFormAgent(b.dataset.fopen)));
    const bg = $('#pfBegin'); if (bg) bg.addEventListener('click', () => viewPrelistingAgent(null, id));
    const ag = $('#pfAgree'); if (ag) ag.addEventListener('click', () => viewTable(null, null, 0, PF));
    $$('[data-pfreopen]').forEach(b => b.addEventListener('click', async () => { await must(sb.rpc('agent_reopen_property', { pid: id, new_owners: b.dataset.pfreopen === 'new' })); toast(b.dataset.pfreopen === 'new' ? 'Started again for new owners' : 'Started again'); viewProperty(id); }));
    $$('[data-pfown]').forEach(b => b.addEventListener('click', async () => { const x = PF.contacts[+b.dataset.pfown]; await must(sb.from('property_people').update({ role: 'owner', position: PF.people.length + 1 }).eq('id', x.id)); viewProperty(id); }));
    $$('[data-pfdoc]').forEach(b => b.addEventListener('click', async () => { const d = docs[+b.dataset.pfdoc]; const w = window.open('', '_blank'); const { data } = await sb.storage.from('private').createSignedUrl(d.path, 600); if (data && w) w.location.href = data.signedUrl; else if (w) w.close(); }));
    if (!locked) {
      const readPeople = () => $$('.pfp').forEach(c => { const x = PF.people[+c.dataset.i]; $$('[data-pf]', c).forEach(inp => { if (x[inp.dataset.pf] !== inp.value) { x[inp.dataset.pf] = inp.value; x._dirty = true; } }); });
      const readProp = () => { p.address = $('#pfAddr').value.trim(); p.title_ref = $('#pfTitle').value.trim(); p.owners_on_title = $('#pfOwners').value.trim(); $$('[data-pfd]').forEach(i => { const v = i.value.trim(); if (v) p.description[i.dataset.pfd] = v; else delete p.description[i.dataset.pfd]; }); };
      const redraw = () => { $('#pfPeople').innerHTML = PF.people.map(person).join(''); wirePeople(); };
      const wirePeople = () => $$('[data-pfrm]').forEach(b => b.addEventListener('click', () => { readPeople(); const [x] = PF.people.splice(+b.dataset.pfrm, 1); if (x.id) PF.removed.push(x.id); redraw(); }));
      wirePeople();
      $('#pfAddP').addEventListener('click', () => { readPeople(); PF.people.push({ legal_name: '', pref_name: '', email: '', phone: '', source: 'agent' }); redraw(); });
      $('#pfSave').addEventListener('click', async () => {
        readPeople(); readProp();
        if (!p.address) return $('#pfErr').textContent = 'Add the address.';
        if (PF.people.some(x => x.email && !EMAIL_RE.test(x.email.trim()))) return $('#pfErr').textContent = 'Check the email addresses.';
        await propSave(); toast('Saved'); viewProperty(id);
      });
    }
    top();
  }

  /* ═════════ TRANSLATIONS (Tim only): translate, read English beside the translation, correct, approve ═════════ */
  const TR_JOBS = new Map(), TR_FAIL = new Map();
  const TR_SETS = [['screens', 'Screens', 'The wording of every vendor page.'], ['guide', 'Vendor Guide and acknowledgements', 'Also the reading aids beside signed documents. Needs a check by a professional translator.']];
  const TR_LANGS = () => I18N.LANGS.filter(l => l.code !== 'en');
  const trCatalogue = scope => { const seen = new Set(), out = []; ((window.I18N_STRINGS || {})[scope] || []).forEach(([, list]) => list.forEach(s => { if (!seen.has(s)) { seen.add(s); out.push(s); } })); return out; };
  const trFmt = d => d ? new Date(d).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' }) : '';
  const trChecker = { get() { try { return localStorage.getItem('tr_checker') || ''; } catch (_) { return ''; } }, set(v) { try { localStorage.setItem('tr_checker', v); } catch (_) { } } };

  // The same checks the translator's answers get (fn/prefill_shared.ts checkTranslation, and translation_problem in the
  // database), applied to a correction before it is saved: placeholders, tags, every number and amount, names, no dashes.
  const TR_NAMES = ['McGuire Real Estate', 'Timothy McGuire', 'Tim McGuire', 'McGuire', 'Tim', 'List Now', 'NZRET', 'Public Trust', 'LIM', 'GST', 'REA', 'AML/CFT', 'Real Estate Authority', 'Real Estate Agents Act'];
  function trCheck(source, text) {
    const t = String(text == null ? '' : text).trim(), PH = /\{[A-Za-z][A-Za-z0-9_]*\}/g, TG = /<br\/>|<\/?\d+>/g, NM = /\$?\d+(?:[,.:/]\d+)*%?/g;
    if (!t) return 'empty';
    if (/[\u2014\u2013]/.test(t)) return 'dash';
    const bag = (s, re) => (s.match(re) || []).slice().sort().join('\u0001');
    if (bag(source, PH) !== bag(t, PH)) return 'placeholders changed';
    if (bag(source, TG) !== bag(t, TG)) return 'tags changed';
    const st = []; for (const x of t.match(TG) || []) { if (x === '<br/>') continue; if (x[1] !== '/') st.push(x.slice(1, -1)); else if (st.pop() !== x.slice(2, -1)) return 'tags changed'; }
    if (st.length) return 'tags changed';
    const strip = s => s.replace(PH, ' ').replace(TG, ' ');
    if (bag(strip(source), NM) !== bag(strip(t), NM)) return 'number changed';
    for (const k of TR_NAMES) { const re = new RegExp('(^|[^A-Za-z])' + k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '($|[^A-Za-z])'); if (re.test(source) && !re.test(t)) return 'name changed: ' + k; }
    return '';
  }
  const trWhy = c => /^placeholders/.test(c) ? 'A word in curly brackets, such as {name}, has to stay exactly as it is.' : /^tags/.test(c) ? 'The marks like <1> and </1> and line breaks have to stay, around the same words.' : /^number/.test(c) ? 'Every number, amount and percentage has to stay exactly as in the English, and none can be added.' : /^name/.test(c) ? 'Names like Tim, GST, LIM and REA have to stay as they are (' + c.replace('name changed: ', '') + ').' : c === 'dash' ? 'Please do not use a long dash.' : 'The translation cannot be empty.';
  // batch sizes per language (the same limits fn/prefill_shared.ts enforces): Hindi, Korean and Chinese run longer
  const TR_LIMITS = { mi: { items: 40, chars: 12000 }, sm: { items: 40, chars: 12000 }, to: { items: 40, chars: 12000 }, hi: { items: 15, chars: 3500 }, ko: { items: 20, chars: 4500 }, zh: { items: 30, chars: 6000 } };
  let TR_RUN = 0;   // translation runs going on now: nothing is approved while one is
  const TR_SEEN = {};   // per set: the strings (id and text) Tim has had on screen, which is all he can approve
  const trBusy = () => TR_RUN > 0 || TR_JOBS.size > 0;
  async function trRows(scope, lang, ref) { const q = sb.from('translations').select('id,source,text,status,model,approved_by,approved_at,edited_by').eq('scope', scope).eq('lang', lang); return (await must((ref ? q.eq('ref', ref) : q.is('ref', null)).order('created_at'))) || []; }
  // what is stored for this set, compared with the English the screens use today
  function trState(scope, rows, own) {
    const cat = own || trCatalogue(scope), bySrc = new Map(rows.map(r => [r.source, r]));
    const have = cat.filter(s => bySrc.has(s)), missing = cat.filter(s => !bySrc.has(s));
    const approved = have.filter(s => bySrc.get(s).status === 'approved'), waiting = have.filter(s => bySrc.get(s).status !== 'approved');
    const last = rows.filter(r => r.approved_at).sort((a, b) => a.approved_at < b.approved_at ? 1 : -1)[0];
    return { cat, bySrc, have, missing, approved, waiting, last };
  }

  async function viewTranslations() {
    header('Translations', '', 0); actions(false); setAgentNav('tr');
    main().innerHTML = '<div class="loading">Loading...</div>';
    const cards = [];
    for (const l of TR_LANGS()) for (const [scope, name, note] of TR_SETS) {
      const st = trState(scope, await trRows(scope, l.code).catch(() => []));
      cards.push({ l, scope, name, note, st });
    }
    main().innerHTML = `<div class="view-pad">
      <span class="agent-flag">Only you see this</span>
      <h1>Translations</h1>
      <p class="small">Vendors can read their pages in six languages besides English. The app translates each page once, and a speaker of that language checks it here. Until you approve a language, vendors see English for it. The English agreement is always the one that applies, and nothing signed is ever translated.</p>
      <div class="ptiles">${cards.map((c, i) => {
        const n = c.st.cat.length, pct = n ? Math.round(100 * c.st.approved.length / n) : 0;
        return `<div class="card tight" data-tr-card="${c.l.code}-${c.scope}">
          <strong>${esc(c.l.name)}</strong> <span class="small">${esc(c.name)}</span>
          <p class="small" style="margin:6px 0">${c.st.have.length} of ${n} translated. ${c.st.approved.length} approved (${pct}%). ${c.st.waiting.length ? `<strong>${c.st.waiting.length} awaiting check.</strong>` : ''}</p>
          <p class="small" style="margin:0 0 8px">${c.st.last ? `Last approved by ${esc(c.st.last.approved_by)}, ${esc(trFmt(c.st.last.approved_at))}.` : 'Not approved yet, so vendors see English.'}</p>
          <button class="btn ${c.st.waiting.length || c.st.missing.length ? 'primary' : 'ghost'}" type="button" data-tr-open="${i}">Open</button></div>`;
      }).join('')}</div>
      <p class="small">Plans and variations are translated when you publish them, and you check them on that page. Notices stay English.</p>
    </div>`;
    $$('[data-tr-open]').forEach(b => b.addEventListener('click', () => { const c = cards[+b.dataset.trOpen]; viewTranslationSet(c.scope, c.l.code, { fresh: true }); }));
    top();
  }

  async function viewTranslationSet(scope, lang, opts) {
    opts = opts || {};
    const l = I18N.byCode(lang), set = TR_SETS.find(s => s[0] === scope);
    header('Translations', '', 0); actions(false); setAgentNav('tr');
    main().innerHTML = '<div class="loading">Loading...</div>';
    const rows = await trRows(scope, lang), st = trState(scope, rows);
    const skey = scope + '|' + lang; if (opts.fresh || !TR_SEEN[skey]) TR_SEEN[skey] = new Map();
    const seen = TR_SEEN[skey], srcOf = new Map(rows.map(r => [r.id, r.source]));
    seen.forEach((txt, id) => { const r = rows.find(x => x.id === id); if (!r || r.status === 'approved' || r.text !== txt) seen.delete(id); });   // what changed since is not "read"
    const PAGE = 25, filter = opts.filter || (st.waiting.length ? 'waiting' : 'all'), page = opts.page || 0;
    const list = (filter === 'waiting' ? st.cat.filter(s => st.bySrc.has(s) && st.bySrc.get(s).status !== 'approved') : filter === 'missing' ? st.missing : st.cat);
    const shown = list.slice(page * PAGE, page * PAGE + PAGE);
    shown.forEach(s => { const r = st.bySrc.get(s); if (r && r.status !== 'approved') seen.set(r.id, r.text); });
    const readIds = st.waiting.map(s => st.bySrc.get(s)).filter(r => seen.has(r.id)), unread = st.waiting.length - readIds.length;
    main().innerHTML = `<div class="view-pad">
      <span class="agent-flag">Only you see this</span>
      <p><a href="#" id="trBack">Translations</a></p>
      <h1>${esc(l.name)}: ${esc(set[1])}</h1>
      <p class="small">${esc(set[2])}</p>
      <div class="card tight" id="trSummary">
        <p style="margin:0 0 8px"><strong>${st.have.length} of ${st.cat.length}</strong> translated, <strong>${st.approved.length}</strong> approved, <strong>${st.waiting.length}</strong> awaiting check. ${st.last ? `Last approved by ${esc(st.last.approved_by)}, ${esc(trFmt(st.last.approved_at))}.` : ''}</p>
        <div class="toolbar" style="margin:0">
          <button class="btn primary" type="button" id="trGo" ${st.missing.length ? '' : 'disabled'}>Translate ${st.missing.length} ${st.missing.length === 1 ? 'string' : 'strings'}</button>
          ${st.approved.length ? '<button class="btn ghost" type="button" id="trWithdraw">Show English to vendors again</button>' : ''}
        </div>
        <p class="small" id="trMsg" role="status" style="margin:8px 0 0"></p>
      </div>
      ${st.waiting.length ? `<div class="card tight">
        <label class="fld"><span>Name of the person who checked this ${scope === 'guide' ? '(a professional translator)' : '(a speaker)'}</span>
        <input type="text" id="trWho" autocomplete="off" value="${esc(trChecker.get())}" placeholder="Their full name"></label>
        <div class="toolbar" style="margin:8px 0 0"><button class="btn primary" type="button" id="trApprove" ${readIds.length && !trBusy() ? '' : 'disabled'}>Approve ${readIds.length} you have read</button></div>
        <p class="small" style="margin:8px 0 0">${unread ? `${unread} more ${unread === 1 ? 'string is' : 'strings are'} still to read. Use Later to read ${unread === 1 ? 'it' : 'them'}; only strings you have had on screen can be approved.` : 'You have read all of them.'}${trBusy() ? ' Approving waits until the translation has finished.' : ''}</p>
        <p class="small" id="trAppErr" role="alert" style="margin:8px 0 0"></p></div>` : ''}
      <div class="chip-row" role="tablist">${[['waiting', 'Awaiting check', st.waiting.length], ['missing', 'Not translated', st.missing.length], ['all', 'All', st.cat.length]].map(([k, t, n]) => `<button class="chip" type="button" role="tab" aria-selected="${filter === k}" data-trf="${k}" style="${filter === k ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}">${t} (${n})</button>`).join('')}</div>
      <div id="trList">${shown.length ? shown.map((s, i) => { const r = st.bySrc.get(s); return `<div class="card tight tr-row" data-tr-row="${r ? r.id : ''}">
        <p class="small" style="margin:0 0 4px">English</p><p lang="en" style="margin:0 0 10px;white-space:pre-wrap">${esc(s)}</p>
        ${r ? `<p class="small" style="margin:0 0 4px">${esc(l.name)} ${r.status === 'approved' ? '(approved)' : '(awaiting check)'}</p>
        <textarea class="tr-edit" rows="3" lang="${esc(l.html)}" data-tr-id="${r.id}" aria-label="${esc(l.name)} translation">${esc(r.text)}</textarea>
        <div class="toolbar" style="margin:6px 0 0"><button class="btn ghost" type="button" data-tr-save="${r.id}">Save correction</button></div><p class="small" data-tr-err="${r.id}" role="alert" style="margin:4px 0 0"></p>` : '<p class="small" style="margin:0">Not translated yet.</p>'}
      </div>`; }).join('') : '<div class="card note tight"><p class="small" style="margin:0">Nothing here.</p></div>'}</div>
      ${list.length > PAGE ? `<div class="toolbar"><button class="btn ghost" type="button" id="trPrev" ${page ? '' : 'disabled'}>Earlier</button><span class="small">${page * PAGE + 1} to ${Math.min(list.length, page * PAGE + PAGE)} of ${list.length}</span><button class="btn ghost" type="button" id="trNext" ${(page + 1) * PAGE < list.length ? '' : 'disabled'}>Later</button></div>` : ''}
    </div>`;
    const again = o => viewTranslationSet(scope, lang, Object.assign({ filter, page }, o));
    if (opts.msg) $('#trMsg').textContent = opts.msg;
    $('#trBack').addEventListener('click', e => { e.preventDefault(); viewTranslations(); });
    $$('[data-trf]').forEach(b => b.addEventListener('click', () => again({ filter: b.dataset.trf, page: 0 })));
    if ($('#trPrev')) $('#trPrev').addEventListener('click', () => again({ page: page - 1 }));
    if ($('#trNext')) $('#trNext').addEventListener('click', () => again({ page: page + 1 }));
    $$('[data-tr-save]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.trSave, ta = $(`[data-tr-id="${id}"]`), who = trChecker.get(), why = trCheck(srcOf.get(id), ta.value);
      if (why) { $(`[data-tr-err="${id}"]`).textContent = 'Not saved. ' + trWhy(why); return; }
      b.disabled = true;
      try { await must(sb.rpc('agent_edit_translation', { p_id: id, p_text: ta.value, p_by: who || null })); toast('Saved. It needs approving again.'); again({}); } catch (_) { b.disabled = false; }
    }));
    if ($('#trApprove')) $('#trApprove').addEventListener('click', async () => {
      const who = $('#trWho').value.trim(); trChecker.set(who);
      if (!who) { $('#trAppErr').textContent = 'Type the name of the person who checked it.'; return; }
      if (trBusy()) { $('#trAppErr').textContent = 'A translation is still running. Approve once it has finished.'; return; }
      $('#trApprove').disabled = true;
      const items = readIds.map(r => ({ id: r.id, text: r.text }));
      try { const n = await must(sb.rpc('agent_approve_translations', { p_scope: scope, p_ref: null, p_lang: lang, p_name: who, p_items: items })); toast(`${n} approved. Vendors can now read this in ${l.name}.`); again({}); } catch (_) { $('#trApprove').disabled = false; }
    });
    if ($('#trWithdraw')) $('#trWithdraw').addEventListener('click', async () => {
      if (!confirm(`Show English instead of ${l.name} to vendors? The translations are kept, and need approving again.`)) return;
      try { await must(sb.rpc('agent_withdraw_translations', { p_scope: scope, p_ref: null, p_lang: lang })); toast('Vendors see English again.'); again({}); } catch (_) { }
    });
    $('#trGo').addEventListener('click', async () => {
      const go = $('#trGo'), msg = $('#trMsg'); go.disabled = true; if ($('#trApprove')) $('#trApprove').disabled = true;
      const r = await trTranslate(scope, null, lang, st.missing, t => { msg.textContent = t; });
      msg.textContent = r.message;
      if (r.saved) again({ filter: 'waiting', page: 0, msg: r.message }); else { go.disabled = false; if ($('#trApprove') && readIds.length) $('#trApprove').disabled = false; }
    });
    top();
  }

  // Sends the strings to the app's translator in batches (the doc-prefill function, translate mode), then stores what comes
  // back as "awaiting check". Returns { saved, rejected, cut, failed, message }. Used for the screens, the guide, plans and
  // variations. Batches are smaller for Hindi, Korean and Chinese; a reply that ran out of room is split and sent again.
  async function trTranslate(scope, ref, lang, sources, progress) {
    TR_RUN++;
    try { return await trTranslateRun(scope, ref, lang, sources, progress); } finally { TR_RUN--; }
  }
  async function trTranslateRun(scope, ref, lang, sources, progress) {
    const lim = TR_LIMITS[lang] || TR_LIMITS.mi, queue = []; let cur = [], chars = 0;
    sources.forEach(s => { if (cur.length >= lim.items || (cur.length && chars + s.length > lim.chars)) { queue.push(cur); cur = []; chars = 0; } cur.push(s); chars += s.length; });
    if (cur.length) queue.push(cur);
    let saved = 0, rejected = 0, cut = 0, done = 0; const total = queue.length;
    while (queue.length) {
      const batch = queue.shift();
      progress && progress(`Translating, part ${Math.min(++done, Math.max(total, done))} of ${Math.max(total, done + queue.length)}...`);
      const { data, error } = await sb.functions.invoke('doc-prefill', { body: { mode: 'translate', kind: scope, lang, sources: batch } });
      if (error || !data || data.ok === false) {
        return { saved, rejected, cut, failed: true, message: saved ? `Stopped part way: ${saved} translated and stored. Try again for the rest.` : 'The translator could not be reached, or is not switched on yet. Nothing was changed.' };
      }
      const rej = data.rejected || [];
      rejected += rej.filter(x => x.reason !== 'cut off').length;
      if ((data.translations || []).length) {
        const { error: se } = await sb.rpc('agent_save_translations', { p_scope: scope, p_ref: ref || null, p_lang: lang, p_rows: data.translations, p_model: data.model || null });
        if (se) return { saved, rejected, cut, failed: true, message: 'The translations could not be stored: ' + (se.message || 'try again') };
        saved += data.translations.length;
      }
      const left = rej.filter(x => x.reason === 'cut off').map(x => x.source);
      if (left.length > 1) { const h = Math.ceil(left.length / 2); queue.unshift(left.slice(0, h), left.slice(h)); }   // too long for one reply: try in smaller parts
      else if (left.length === 1) cut++;
    }
    return { saved, rejected, cut, failed: false, message: `${saved} translated and stored, awaiting your check.${rejected ? ` ${rejected} could not be used (a number, name or placeholder changed), so they stay in English.` : ''}${cut ? ` ${cut} ${cut === 1 ? 'was' : 'were'} too long for the translator to finish, so ${cut === 1 ? 'it stays' : 'they stay'} in English.` : ''}${rejected || cut ? ' Press Translate again to retry.' : ''}` };
  }

  /* Tim's plans and variations: translated by Haiku when he publishes them, and he reads the result before any vendor does. */
  const trLines = s => String(s || '').replace(/\r/g, '').split('\n').map(x => x.trim()).join('<br/>').replace(/ +/g, ' ').trim();   // the same text the vendor's page shows as one unit
  const trPlanSources = plan => { const out = []; const add = s => { const t = trLines(s); if (t && !out.includes(t)) out.push(t); }; plan = plan || {}; add(plan.intro); (plan.pairs || []).forEach(x => { add(x.said); add(x.changed); }); return out; };
  const trVarSources = v => { const out = []; const add = s => { const t = trLines(s); if (t && !out.includes(t)) out.push(t); }; ((v && v.summary) || []).forEach(r => { add(r.to); add(r.from); }); add(v && v.reason); return out; };
  const TRVARS = {};
  // translate every language that is missing some of these strings; runs on its own, and redraws the panel when it ends
  function trAuto(scope, ref, sources, again) {
    const key = scope + ':' + ref;
    if (TR_JOBS.has(key) || !sources.length) return TR_JOBS.get(key);
    TR_FAIL.delete(key);
    const job = (async () => {
      for (const l of TR_LANGS()) {
        const have = new Set((await trRows(scope, l.code, ref)).map(r => r.source));
        const missing = sources.filter(s => !have.has(s));
        if (missing.length) { const r = await trTranslate(scope, ref, l.code, missing); if (r.failed && !r.saved) { TR_FAIL.set(key, r.message); break; } }
      }
    })().catch(e => console.warn('translate', e)).then(() => { TR_JOBS.delete(key); if (again) again(); });
    TR_JOBS.set(key, job); return job;
  }
  async function trPanelDraw(box, scope, ref, sources) {
    if (!box) return;
    const key = scope + ':' + ref; box.setAttribute('data-trc', key);
    if (!sources.length) { box.innerHTML = '<p class="small">Nothing to translate yet.</p>'; return; }
    const busy = TR_JOBS.has(key), failed = TR_FAIL.get(key);
    const per = [];
    for (const l of TR_LANGS()) per.push({ l, st: trState(scope, await trRows(scope, l.code, ref).catch(() => []), sources) });
    if (!box.isConnected) return;
    box.innerHTML = `<div class="card tight">
      <p class="small" style="margin:0 0 8px">${busy ? 'Translating for the vendors now. This takes a minute.' : 'Vendors see English until a speaker has checked a language and you approve it here. Read each one against the English first.'}</p>
      ${failed && !busy ? `<p class="small" role="status">${esc(failed)}</p>` : ''}
      ${per.map(({ l, st }) => `<details class="tr-lang" data-trl="${l.code}"><summary><strong>${esc(l.name)}</strong> <span class="small">${st.have.length} of ${st.cat.length} translated, ${st.approved.length} approved${st.waiting.length ? `, <strong>${st.waiting.length} awaiting check</strong>` : ''}</span></summary>
        ${st.cat.map(s => { const r = st.bySrc.get(s); return `<div class="tr-row" style="margin:10px 0"><p class="small" style="margin:0">English</p><p lang="en" style="margin:0 0 6px;white-space:pre-wrap">${esc(s.replace(/<br\/>/g, '\n'))}</p>${r ? `<textarea class="tr-edit" rows="3" lang="${esc(l.html)}" data-tr-id="${r.id}" aria-label="${esc(l.name)} translation">${esc(r.text.replace(/<br\/>/g, '\n'))}</textarea><div class="toolbar" style="margin:4px 0 0"><button class="btn ghost" type="button" data-trc-save="${r.id}">Save correction</button></div><p class="small" data-trc-err="${r.id}" role="alert" style="margin:4px 0 0"></p>` : '<p class="small" style="margin:0">Not translated yet.</p>'}</div>`; }).join('')}
        <div class="toolbar" style="margin:8px 0 0">${st.missing.length ? `<button class="btn ghost" type="button" data-trc-go="${l.code}" ${busy ? 'disabled' : ''}>Translate ${st.missing.length} ${st.missing.length === 1 ? 'string' : 'strings'}</button>` : ''}
        ${st.waiting.length ? `<input type="text" data-trc-who="${l.code}" autocomplete="off" aria-label="Name of the person who checked it" placeholder="Name of the person who checked it" value="${esc(trChecker.get())}" style="max-width:260px"><button class="btn primary" type="button" data-trc-ok="${l.code}" ${busy || trBusy() ? 'disabled' : ''}>Approve ${st.waiting.length}</button>` : ''}
        ${st.approved.length ? `<button class="btn ghost" type="button" data-trc-off="${l.code}">Show English instead</button>` : ''}</div>
        <p class="small" data-trc-msg="${l.code}" role="alert" style="margin:6px 0 0"></p></details>`).join('')}
    </div>`;
    const open = (box._open || []); open.forEach(c => { const d = $(`[data-trl="${c}"]`, box); if (d) d.open = true; });
    $$('details.tr-lang', box).forEach(d => d.addEventListener('toggle', () => { box._open = $$('details.tr-lang', box).filter(x => x.open).map(x => x.dataset.trl); }));
    const redraw = () => trPanelDraw(box, scope, ref, sources);
    const srcById = new Map(); per.forEach(({ st }) => st.bySrc.forEach((r, s) => srcById.set(r.id, s)));
    $$('[data-trc-save]', box).forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.trcSave, val = $(`[data-tr-id="${id}"]`, box).value.replace(/\n/g, '<br/>'), why = trCheck(srcById.get(id), val);
      if (why) { $(`[data-trc-err="${id}"]`, box).textContent = 'Not saved. ' + trWhy(why); return; }
      b.disabled = true; try { await must(sb.rpc('agent_edit_translation', { p_id: id, p_text: val, p_by: trChecker.get() || null })); toast('Saved. It needs approving again.'); redraw(); } catch (_) { b.disabled = false; }
    }));
    $$('[data-trc-go]', box).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; const code = b.dataset.trcGo, have = new Set((await trRows(scope, code, ref)).map(r => r.source));
      const r = await trTranslate(scope, ref, code, sources.filter(s => !have.has(s))); toast(r.message); redraw();
    }));
    $$('[data-trc-ok]', box).forEach(b => b.addEventListener('click', async () => {
      const code = b.dataset.trcOk, who = $(`[data-trc-who="${code}"]`, box).value.trim(); trChecker.set(who);
      if (!who) { $(`[data-trc-msg="${code}"]`, box).textContent = 'Type the name of the person who checked it.'; return; }
      if (trBusy()) { $(`[data-trc-msg="${code}"]`, box).textContent = 'A translation is still running. Approve once it has finished.'; return; }
      const st = per.find(x => x.l.code === code).st, items = st.waiting.map(s => ({ id: st.bySrc.get(s).id, text: st.bySrc.get(s).text }));   // exactly the strings drawn on this panel
      b.disabled = true; try { const n = await must(sb.rpc('agent_approve_translations', { p_scope: scope, p_ref: ref, p_lang: code, p_name: who, p_items: items })); toast(`${n} approved. Vendors can read this in ${I18N.byCode(code).name}.`); redraw(); } catch (_) { b.disabled = false; }
    }));
    $$('[data-trc-off]', box).forEach(b => b.addEventListener('click', async () => { try { await must(sb.rpc('agent_withdraw_translations', { p_scope: scope, p_ref: ref, p_lang: b.dataset.trcOff })); toast('Vendors see English again.'); redraw(); } catch (_) { } }));
  }

  /* ═════════ AGENT HOME (Let's begin / Let's agree) and DASHBOARD ═════════ */
  function setAgentNav(cur) {
    const nav = $('#agentNav'); if (!nav) return;
    nav.hidden = !IS_AGENT; document.body.classList.toggle('is-agent', !!IS_AGENT);
    const lw = $('#langWrap'); if (lw) lw.hidden = !!IS_AGENT;
    const jb = $('#journeyBtn'); if (jb) jb.hidden = !!IS_AGENT || !JREADY;   // the Journey button is for vendors, and for anyone not signed in
    $('#navHome').toggleAttribute('aria-current', cur === 'home'); if (cur === 'home') $('#navHome').setAttribute('aria-current', 'page');
    if ($('#navTr')) { $('#navTr').removeAttribute('aria-current'); if (cur === 'tr') $('#navTr').setAttribute('aria-current', 'page'); }
    $('#navDash').toggleAttribute('aria-current', cur === 'dash'); if (cur === 'dash') $('#navDash').setAttribute('aria-current', 'page');
  }
  // leaving the appointment flow from the top bar keeps what's been typed
  async function navGo(fn) {
    if (T && !T.locked && $('.ttabs') && T.ag && ($('#tAddr') ? $('#tAddr').value.trim() : T.ag.address)) { try { tCollect(); await tSave(); } catch (_) { } }
    fn();
  }
  $('#navHome').addEventListener('click', () => navGo(viewAgentHome));
  $('#navDash').addEventListener('click', () => navGo(viewAgentDashboard));
  $('#navTr').addEventListener('click', () => navGo(viewTranslations));
  $$('.brand img').forEach(i => i.addEventListener('click', () => { if (IS_AGENT) navGo(viewAgentHome); }));

  function viewAgentHome() {
    header('', '', 0); actions(false); setAgentNav('home');
    const h = +new Date().toLocaleString('en-NZ', { hour: 'numeric', hour12: false, timeZone: 'Pacific/Auckland' });
    main().innerHTML = `<div class="view-pad">
      <h1>${h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'}, Tim</h1>
      <div class="home-tiles">
        <button class="home-tile" type="button" id="homeBegin"><span class="kick">After an appraisal</span><span class="ttl">Let's begin</span><span class="txt">Set up their appraisal page. They answer a few questions, you send back an updated plan, and they're ready to sign.</span><span class="go">Start an appraisal page →</span></button>
        <button class="home-tile primary" type="button" id="homeAgree"><span class="kick">At the listing appointment</span><span class="ttl">Let's agree</span><span class="txt">Go through the agency agreement together, then sign here or send it to their phones.</span><span class="go">Start the agreement →</span></button>
      </div>
      <p class="small" id="homeNeeds">Your agreements and pre-listings are on the <a href="#" id="homeDash">Dashboard</a>.</p>
    </div>`;
    $('#homeBegin').addEventListener('click', () => viewPrelistingAgent(null));
    $('#homeAgree').addEventListener('click', () => viewTable(null));
    $('#homeDash').addEventListener('click', e => { e.preventDefault(); viewAgentDashboard(); });
    dashData().then(d => { const n = d.needs.length; if (n && $('#homeNeeds')) $('#homeNeeds').innerHTML = `<strong>${n} ${n === 1 ? 'thing needs' : 'things need'} you.</strong> See them on the <a href="#" id="homeDash2">Dashboard</a>.`; const l = $('#homeDash2'); if (l) l.addEventListener('click', e => { e.preventDefault(); viewAgentDashboard(); }); }).catch(() => null);
    top();
  }

  async function dashData() {
    const safe = async q => { try { return await must(q); } catch (_) { return []; } };
    const [props, rows, pls, crs, pans, vars] = await Promise.all([
      safe(sb.from('properties').select('id,address,stage,stage_at,updated_at,property_people(legal_name,pref_name,position,role),agreements(id,ref,status,created_at),prelistings(id,status)').order('updated_at', { ascending: false })),
      safe(sb.from('agreements').select('id,ref,address,status,updated_at,property_id,config,signed_at,agreement_people(legal_name,pref_name,signed_at,id_verified_at)').order('updated_at', { ascending: false })),
      safe(sb.from('prelistings').select('id,address,contact_name,contact_email,status,proceeded_at,updated_at').order('updated_at', { ascending: false })),
      safe(sb.from('cancellation_requests').select('id,agreement_id,requested_by,status').neq('status', 'processed')),
      safe(sb.from('prior_agency_notices').select('id,agreement_id,agency,status').eq('status', 'to_send')),
      safe(sb.from('agreement_variations').select('id,agreement_id,number,status,changes').neq('status', 'withdrawn')),
    ]);
    const forms = await safe(sb.from('property_forms').select('id,agreement_id,kind,status,document_id,countersigned_at'));
    const seen = await safe(sb.from('agreement_events').select('agreement_id,detail').eq('kind', 'review_checked'));
    const addr = id => (rows.find(r => r.id === id) || {}).address || 'Agreement';
    const needs = [];
    crs.forEach(r => needs.push({ what: 'Call them about cancelling', where: addr(r.agreement_id), sub: 'Request from ' + r.requested_by, go: () => viewAgentDetail(r.agreement_id), hot: true }));
    pls.forEach(p => { if (p.status === 'submitted') needs.push({ what: 'Write their updated plan', where: p.address, sub: 'Questionnaire answers are in', go: () => viewPrelistingAgent(p.id) }); if (p.status === 'question') needs.push({ what: 'Answer their question', where: p.address, sub: 'About the updated plan', go: () => viewPrelistingAgent(p.id), hot: true }); if (p.status === 'accepted') { const a = rows.find(r => r.id === p.agreement_id); if (!a || a.status === 'draft') needs.push({ what: 'Add your fee and send the agreement', where: p.address, sub: 'They\'ve accepted the plan', go: () => viewPrelistingAgent(p.id) }); } });
    rows.forEach(r => { if (r.status === 'signed') needs.push({ what: 'Countersign', where: r.address, sub: 'Everyone has signed', go: () => viewAgentDetail(r.id) }); });
    // notices to previous agencies not yet sent (only while the agreement is still in force)
    pans.forEach(n => { const g = rows.find(r => r.id === n.agreement_id); if (g && !['signed', 'countersigned'].includes(g.status)) return; needs.push({ what: 'Send the notice to ' + n.agency, where: addr(n.agreement_id), sub: 'Previous agency, not sent yet', go: () => viewAgentDetail(n.agreement_id, false, 'noticePanel') }); });
    forms.forEach(fm => { if (fm.kind === 'healthy_homes' && fm.status === 'draft') needs.push({ what: 'Do the Healthy Homes measurements', where: addr(fm.agreement_id), sub: 'They asked for the checklist', go: () => viewFormAgent(fm.id) }); if (fm.kind === 'vendor_declaration' && fm.status === 'signed' && !fm.countersigned_at) needs.push({ what: 'Countersign the Vendor Declaration', where: addr(fm.agreement_id), sub: 'Every vendor has signed', go: () => viewFormAgent(fm.id) }); else if (fm.status === 'signed' && !fm.document_id) needs.push({ what: `File the signed ${FORM_LABEL[fm.kind]}`, where: addr(fm.agreement_id), sub: 'The PDF isn\'t on the property yet', go: () => viewFormAgent(fm.id) }); });
    vars.filter(v => v.status === 'draft').forEach(v => needs.push({ what: `Finish variation ${v.number}`, where: addr(v.agreement_id), sub: 'Draft, not issued', go: () => viewAgentDetail(v.agreement_id, false, 'varPanel') }));
    // the review date (the end of the fixed period) 7 days ahead, or the end of a variation's extended period; gone once
    // Tim ticks it off, the date moves (a variation is signed), or the agreement ends or the property is sold
    const nzToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }), dayN = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5);
    rows.forEach(r => {
      if (!['signed', 'countersigned'].includes(r.status)) return;
      const c = r.config || {}; if (c.appr === 'pending' && !c.start) return;   // it hasn't started, so there is no review date yet
      const pr = props.find(p => p.id === r.property_id); if (pr && pr.stage === 'sold') return;
      const mine = vars.filter(v => v.agreement_id === r.id), t = currentTerms(r, mine); if (!t.reviewUntil) return;
      const left = dayN(t.reviewUntil) - dayN(nzToday); if (left > 7) return;
      if (seen.some(e => e.agreement_id === r.id && (e.detail || {}).date === t.reviewUntil)) return;
      const ext = mine.some(v => v.status === 'signed' && (v.changes || {}).reviewUntil), when = left > 1 ? `in ${left} days` : left === 1 ? 'tomorrow' : left === 0 ? 'today' : '';
      needs.push({ what: left < 0 ? (ext ? 'The extended period has ended' : 'The review date has passed') : (ext ? 'The extended period ends ' : 'Review date ') + when, where: r.address, sub: `${ext ? 'Extended to' : 'Fixed period ends'} ${dayText(t.reviewUntil)}`, review: true, hot: left <= 0,
        go: () => viewAgentDetail(r.id, false, 'varPanel'),
        done: async () => { await must(sb.from('agreement_events').insert({ agreement_id: r.id, actor: SESSION.user.email, kind: 'review_checked', detail: { date: t.reviewUntil } })); } });
    });
    return { props, rows, pls: pls.filter(p => p.status !== 'closed'), needs };
  }

  let DASH_FILTER = 'all';
  async function viewAgentDashboard() {
    header('Dashboard', '', 0); actions(false); setAgentNav('dash');
    main().innerHTML = '<div class="loading">Loading...</div>';
    const { props, needs } = await dashData();
    const grp = k => STAGE_GROUPS.find(g => g[0] === k) || STAGE_GROUPS[0];
    const count = k => props.filter(grp(k)[2]).length;
    const shown = props.filter(grp(DASH_FILTER)[2]);
    const latestAg = p => (p.agreements || []).slice().sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
    const owners = p => (p.property_people || []).filter(x => (x.role || 'owner') === 'owner').slice().sort((a, b) => a.position - b.position).map(x => callName(x) || x.legal_name).filter(Boolean).join(', ');
    main().innerHTML = `<div class="view-pad">
      <span class="agent-flag">Only you see this</span>
      <h1>Dashboard</h1>
      <div class="stats">
        <button class="stat ${needs.length ? 'hot' : ''}" type="button" data-jump="needs"><div class="n">${needs.length}</div><div class="l">Need you</div></button>
        <button class="stat" type="button" data-filter="before"><div class="n">${count('before')}</div><div class="l">Before signing</div></button>
        <button class="stat" type="button" data-filter="signed"><div class="n">${count('signed')}</div><div class="l">Signed</div></button>
        <button class="stat" type="button" data-filter="done"><div class="n">${count('done')}</div><div class="l">Finished</div></button>
      </div>
      <h2 id="d-needs">Needs you</h2>
      ${needs.length ? `<div class="card tight"><ul class="needs">${needs.map((n, i) => `<li><div class="what"><strong>${esc(n.what)}</strong><span class="small">${esc(n.where)} · ${esc(n.sub)}</span></div><span class="needbtns"><button class="btn ${n.hot ? 'primary' : 'ghost'}" type="button" data-need="${i}">Open</button>${n.done ? `<button class="btn ghost" type="button" data-needdone="${i}">Done</button>` : ''}</span></li>`).join('')}</ul></div>` : '<div class="card okc tight"><p class="small" style="margin:0">Nothing waiting on you.</p></div>'}
      <h2 id="d-props">Properties</h2>
      <div class="chip-row" role="tablist">${STAGE_GROUPS.map(([k, l]) => `<button class="chip" type="button" role="tab" aria-selected="${DASH_FILTER === k}" data-filter="${k}" style="${DASH_FILTER === k ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}">${l} <span class="small">${count(k)}</span></button>`).join('')}</div>
      ${shown.length ? `<div class="card tight" style="overflow-x:auto;margin-top:10px"><table class="tbl"><thead><tr><th>Property</th><th>Owners</th><th>Where it's up to</th><th class="hide-sm">Updated</th></tr></thead><tbody>
      ${shown.map(r => { const la = latestAg(r); return `<tr class="click" data-prop="${r.id}" ${la ? `data-ag="${la.id}"` : ''} ${(r.prelistings || [])[0] ? `data-plrow="${r.prelistings[0].id}"` : ''}><td><strong>${esc(r.address || '(no address yet)')}</strong>${la ? `<br><span class="small">${esc(la.ref)}</span>` : ''}</td><td>${esc(owners(r) || '–')}</td><td>${stagePill(r.stage)}</td><td class="small hide-sm">${esc(fmtDT(r.updated_at))}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="card note tight" style="margin-top:10px"><p class="small" style="margin:0">${props.length ? 'None here.' : 'No properties yet. Start with Let\'s begin or Let\'s agree.'}</p></div>`}
      <div class="toolbar"><button class="btn ghost" type="button" id="newPl">Let's begin: new appraisal page</button><button class="btn primary" type="button" id="newAg">Let's agree: new agreement</button></div>
    </div>`;
    $$('[data-need]').forEach(b => b.addEventListener('click', () => needs[+b.dataset.need].go()));
    $$('[data-needdone]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { await needs[+b.dataset.needdone].done(); toast('Ticked off'); viewAgentDashboard(); } catch (_) { b.disabled = false; } }));
    $$('[data-filter]').forEach(b => b.addEventListener('click', () => { DASH_FILTER = b.dataset.filter; viewAgentDashboard(); }));
    $$('[data-jump]').forEach(b => b.addEventListener('click', () => { const t = $('#d-' + b.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $('#newAg').addEventListener('click', () => viewTable(null));
    $('#newPl').addEventListener('click', () => viewPrelistingAgent(null));
    $$('tr[data-prop]').forEach(tr => tr.addEventListener('click', () => viewProperty(tr.dataset.prop)));
    top();
  }
  const viewAgentList = viewAgentDashboard;

  /* ═════════ APPOINTMENT: 1 property and people → 2 discussion → 3 signing ═════════ */
  const TPAGES = ['Property and people', 'Discussion', 'Signing'];
  let T = null;
  const tc = (k, d = '') => T.c[k] ?? d, ta = (k, d = '') => T.an[k] ?? d;
  const tg = (src, k, d) => src === 'c' ? tc(k, d) : ta(k, d);
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const TF = {
    text: (src, k, label, o = {}) => `<div><label class="f" for="t_${k}" ${o.top ? 'style="margin-top:0"' : ''}>${label}${o.opt ? ' <span class="opt">(optional)</span>' : ''}</label><input type="${o.type || 'text'}" id="t_${k}" data-${src}="${k}" value="${esc(tg(src, k, o.d ?? ''))}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.im ? `inputmode="${o.im}"` : ''}></div>`,
    area: (src, k, label, o = {}) => `<label class="f" for="t_${k}">${label}${o.opt ? ' <span class="opt">(optional)</span>' : ''}</label><textarea id="t_${k}" data-${src}="${k}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>${esc(tg(src, k, ''))}</textarea>`,
    select: (src, k, label, opts, d) => `<div><label class="f" for="t_${k}">${label}</label><select id="t_${k}" data-${src}="${k}">${opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${tg(src, k, d) === val ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></div>`,
    radio: (src, k, val, title, desc, d) => `<label class="choice"><input type="radio" name="t_${src}_${k}" data-${src}="${k}" value="${esc(val)}" ${tg(src, k, d) === val ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${title}</span>${desc ? `<span class="cd">${desc}</span>` : ''}</span></label>`,
    check: (src, k, title, desc, d = false) => `<label class="choice cb"><input type="checkbox" data-${src}="${k}" ${tg(src, k, d) ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${title}</span>${desc ? `<span class="cd">${desc}</span>` : ''}</span></label>`,
    chips: (k, list, d) => `<div class="chip-row">${list.map(n => `<label class="chip"><input type="checkbox" data-tmulti="${k}" value="${esc(n)}" ${(ta(k, d) || []).includes(n) ? 'checked' : ''}>${esc(n)}</label>`).join('')}</div>`,
  };

  async function viewTable(id, preset, page, fromProp) {
    let ag = { address: '', status: 'draft', config: { appr: 'done', ask: '', flat: '', thr: '250000', pct: '', aml: 'Manual', approach: 'invited' }, answers: {}, legal: {} };
    let people = [];
    if (id) {
      ag = await must(sb.from('agreements').select('*').eq('id', id).single());

      people = await must(sb.from('agreement_people').select('*').eq('agreement_id', id).order('position'));
    }
    if (!people.length) people = [{ legal_name: '', pref_name: '', email: '', phone: '' }];
    if (preset) { if (preset.address) ag.address = preset.address; if (preset.vendor) people[0].legal_name = preset.vendor; }
    if (!id && fromProp) {
      const fp = fromProp.p;
      ag.address = fp.address || ''; ag.property_id = fp.id;
      Object.assign(ag.config, { title: fp.title_ref || '', owners: fp.owners_on_title || '' });
      ag.answers = Object.assign({}, fp.description || {}, fp.disclosures || {}, fp.ownership || {});
      const fl = propFlags(fromProp.docs || []); if (fl.length) ag.config.import = { files: (fromProp.docs || []).map(d => ({ name: d.name, path: d.path })), sources: {}, flags: fl };
      const pp = (fromProp.people || []).filter(x => x.legal_name || x.email);
      if (pp.length) people = pp.map(x => ({ legal_name: x.legal_name, pref_name: x.pref_name, email: x.email, phone: x.phone }));
    }
    const c = Object.assign({}, ag.config || {}), an = Object.assign({}, ag.answers || {});
    let CAMP = c.campaign ? JSON.parse(JSON.stringify(c.campaign)) : null;
    if (CAMP) delete CAMP.snapshot;
    if (!CAMP && HAS_CAT) {
      if (preset) CAMP = campaignFromPending(preset);
      else { const [n] = String(c.pkg || 'Premium|6000').split('|'); const key = n.toLowerCase(); const band = bandFor(c.ask); CAMP = { pkg: PACKAGES[key] ? key : 'premium', band, items: pkgItems(PACKAGES[key] ? key : 'premium', band), extras: [], quoted: {}, override: '' }; }
    }
    CAMP ||= { items: {}, extras: [] };
    if (!c.mktMode) c.mktMode = String(c.pkg || '').startsWith('Later') ? 'later' : 'build';
    const SCH = c.schedule ? JSON.parse(JSON.stringify(c.schedule)) : defaultSchedule(c.start || null);
    IMP = null;
    T = { id, ag, c, an, people, CAMP, SCH, del: [], pads: {}, locked: !!id && !['draft', 'sent', 'parked'].includes(ag.status) || people.some(p => p.signed_at) };
    tShow(page || 0);
  }

  function tErr(msg) { const e = $('.err', main()); if (e) { e.textContent = msg || ''; if (msg) e.scrollIntoView({ block: 'center' }); } return false; }

  function tCollect() {
    const root = main();
    $$('[data-c],[data-an]', root).forEach(el => {
      const src = el.hasAttribute('data-c') ? 'c' : 'an', k = el.getAttribute('data-' + src), tgt = src === 'c' ? T.c : T.an;
      if (el.type === 'radio') { if (el.checked) tgt[k] = el.value; }
      else if (el.type === 'checkbox') tgt[k] = el.checked;
      else tgt[k] = el.value.trim();
    });
    const multi = {}; let any = false;
    $$('[data-tmulti]', root).forEach(el => { any = true; (multi[el.dataset.tmulti] ||= []); if (el.checked) multi[el.dataset.tmulti].push(el.value); });
    if (any) Object.assign(T.an, multi);
    if ($('#tAddr')) T.ag.address = $('#tAddr').value.trim();
    if ($('#tBuyers')) T.an.interested = $$('#tBuyers .buyer').map(cd => ({ name: $('[data-b=name]', cd).value.trim(), phone: $('[data-b=phone]', cd).value.trim(), email: $('[data-b=email]', cd).value.trim(), exclude: $('[data-b=exclude]', cd).checked })).filter(b => b.name || b.phone || b.email);
    const lg = $('input[name="tLegal"]:checked'); if (lg) T.legalPick = lg.value;
    if ($('#tPrior')) T.an.priorAgencies = readPrior($('#tPrior')).filter(x => x.agency || x.agent || x.email || x.dated);
  }

  function tConfig() {
    const c = T.c, later = c.mktMode === 'later';
    return Object.assign({}, c, { campaign: later ? null : Object.assign({}, T.CAMP, { snapshot: computeCampaign(T.CAMP) }), schedule: T.SCH, pkg: later ? 'Later|0' : 'Campaign|' + computeCampaign(T.CAMP).total, custom: '', sign: 'On screen' });
  }

  async function tSave() {
    if (!T.ag.address) return tErr('Add the property address first.');
    const row = { address: T.ag.address, config: tConfig(), answers: T.an };
    if (!T.id && T.ag.property_id) row.property_id = T.ag.property_id;
    try {
      if (T.id) await must(sb.from('agreements').update(row).eq('id', T.id));
      else {
        const r = await must(sb.from('agreements').insert(row).select('*').single());
        T.id = r.id; T.ag = Object.assign(T.ag, r);
        await must(sb.from('agreement_events').insert({ agreement_id: T.id, actor: SESSION.user.email, kind: 'created', detail: { via: 'appointment' } }));
      }
      for (const d of T.del) await must(sb.from('agreement_people').delete().eq('id', d));
      T.del = [];
      let pos = 1;
      for (const p of T.people) {
        if (p.signed_at) { pos++; continue; }
        if (!p.legal_name && !p.email) continue;
        const pr = { agreement_id: T.id, position: pos++, legal_name: p.legal_name || '', pref_name: p.pref_name || '', email: (p.email || '').trim().toLowerCase(), phone: p.phone || '' };
        if (p.id) await must(sb.from('agreement_people').update(pr).eq('id', p.id)); else await must(sb.from('agreement_people').insert(pr));
      }
      const fresh = await must(sb.from('agreement_people').select('*').eq('agreement_id', T.id).order('position'));
      T.people = fresh.length ? fresh : [{ legal_name: '', pref_name: '', email: '', phone: '' }];
      T.ag = Object.assign(T.ag, await must(sb.from('agreements').select('id,ref,status,legal,sent_at,property_id').eq('id', T.id).single()));
      return true;
    } catch (e) { return false; }
  }

  function tValidate(p) {
    const c = T.c, an = T.an, named = T.people.filter(x => (x.legal_name || '').trim());
    if (p === 0) {
      if (!T.ag.address) return 'Add the property address.';
      if (!named.length) return 'Add the full legal name of at least one seller.';
      if ((an.capacity || 'Owners') !== 'Owners' && !(an.entity || '').trim()) return 'Add the name of the trust, company or person they act for.';
      if (an.gst === 'yes' && !(an.gstNo || '').trim()) return 'Add their GST number, or choose No.';
      if (c.appr !== 'pending' && !num(c.ask)) return 'Add the asking price or appraised value, or choose "Not yet" for the appraisal.';
    }
    if (p === 1) {
      const at = aboveType(c);
      if (!num(c.flat) || (at !== 'none' && !num(c.thr)) || (at === 'pct' && !num(c.pct)) || (at === 'amount' && !num(c.aboveAmt))) return 'Fill in the commission you agreed.';
      if ((T.an.interested || []).some(b => !b.name)) return 'Add a name for each interested buyer, or remove the empty one.';
      if (an.prior === 'yes') { const pe = priorCheck(an.priorAgencies); if (pe) return pe; }
    }
    return '';
  }
  function tReadyToSign() {
    const an = T.an;
    for (const p of [0, 1]) { const e = tValidate(p); if (e) return e + ` (page ${p + 1})`; }
    if (!an.titleOk) return 'Confirm ownership on page 1.';
    for (const k of ['work', 'wt', 'meth', 'def']) if (!an[k]) return 'Answer the property questions on page 1 (work done, leaks, methamphetamine, defects).';
    for (const k of ['work', 'wt', 'meth', 'def']) if (an[k] === 'yes' && !String(an[k + 'Detail'] || '').trim()) return 'Add details for anything answered Yes on page 1.';
    if ((an.guide || []).length < GUIDE.length) return 'Tick each section of the plain-English guide once you\'ve been through it together.';
    if ((an.acks || []).length < acksList(T.c).length) return 'Tick each item under "Before signing", or stop and fix anything that didn\'t happen.';
    if (!['have', 'waive'].includes(T.legalPick || (T.ag.legal || {}).choice)) return 'Record the legal advice choice.';
    return '';
  }

  function tShow(p) {
    T.page = p; T.pads = {};
    header(TPAGES[p], `Page ${p + 1} of 3`, (p + 1) / 3 * 100);
    const tabs = `<div class="ttabs">${TPAGES.map((t, i) => `<button type="button" class="ttab ${i === p ? 'on' : ''}" data-tp="${i}"><span class="n">${i + 1}</span>${t}</button>`).join('')}</div>`;
    const flag = T.locked ? `Review only: ${T.ag.status === 'signed' || T.ag.status === 'countersigned' ? 'signed, so the terms can\'t change here' : T.people.some(x => x.signed_at) ? 'someone has signed, so the terms can\'t change here' : 'this agreement has ended'}. Your own notes and the owner's contact details can still be updated on the agreement page.` : ['Fill in before the appointment, then check it together', 'Talk these through together', 'Go through this together, then sign'][p];
    main().innerHTML = `<div class="view-pad"><span class="agent-flag">${flag}</span>${tabs}${[tPage1, tPage2, tPage3][p]()}<div class="err"></div></div>`;
    [tBind1, tBind2, tBind3][p]();
    tReveals(); impBadges();
    if (T.locked) {
      $$('input, select, textarea, button', main()).forEach(el => { if (el.closest('.ttabs') || el.hasAttribute('data-pdf') || el.hasAttribute('data-tp')) return; if (el.tagName === 'BUTTON') el.hidden = true; else el.disabled = true; });
      $$('.ttab', main()).forEach(b => b.disabled = false);
      $$('[data-tp]').forEach(b => b.addEventListener('click', () => tShow(+b.dataset.tp)));
      actions(true, p ? 'Back' : 'Close', p < 2 ? 'Next page' : 'Close');
      onBack = () => p ? tShow(p - 1) : viewAgentDetail(T.id);
      onNext = () => p < 2 ? tShow(p + 1) : viewAgentDetail(T.id);
      top(); return;
    }
    $$('[data-tp]').forEach(b => b.addEventListener('click', async () => { tCollect(); if (!(await tSave())) return; tShow(+b.dataset.tp); }));
    if (p < 2) {
      actions(true, p === 0 ? 'Save and close' : 'Back', 'Save and continue');
      onBack = async () => { tCollect(); if (!(await tSave())) return; if (p === 0) { toast('Saved'); viewAgentDetail(T.id); } else tShow(p - 1); };
      onNext = async () => { tCollect(); const e = tValidate(p); if (e) return tErr(e); if (!(await tSave())) return; tShow(p + 1); };
    } else {
      actions(true, 'Back', 'Save and close');
      onBack = async () => { tCollect(); if (!(await tSave())) return; tShow(1); };
      onNext = async () => { tCollect(); if (!(await tSave())) return; toast('Saved'); viewAgentDetail(T.id); };
    }
    top();
  }
  function tReveals() {
    $$('[data-treveal]').forEach(box => {
      const [src, k, val] = box.dataset.treveal.split(':');
      const upd = () => { const ch = $(`[data-${src}="${k}"]:checked`); const sel = $(`select[data-${src}="${k}"]`); const cur = ch ? ch.value : sel ? sel.value : tg(src, k, ''); box.hidden = !(val.split('|').includes(cur)); };
      $$(`[data-${src}="${k}"]`).forEach(r => r.addEventListener('change', upd)); upd();
    });
  }

  /* ───────── appointment page 1: read their documents and suggest what to fill in ───────── */
  const IMP_LABELS = { address: 'Address', owners: 'Registered owners', title: 'Title reference', capacity: 'Selling as', entity: 'Trust, company or person they act for', pType: 'Type', pYear: 'Year built', pBed: 'Bedrooms', pBath: 'Bathrooms', pFloor: 'Floor area (m²)', pLand: 'Land area (m²)', pBuild: 'Construction', pPark: 'Parking', pHeat: 'Heating and insulation', work: 'Work done or consents', workDetail: 'Work done: details', wt: 'Weathertightness issues', wtDetail: 'Weathertightness: details', meth: 'Methamphetamine', methDetail: 'Methamphetamine: details', def: 'Defects or notices', defDetail: 'Defects or notices: details' };
  const IMP_YESNO = ['work', 'wt', 'meth', 'def'];
  // where suggestions land: the appointment flow (T) or a property file (PF). IMPT is set by whichever page shows the drop-in card.
  const IMP_DESC = ['pType', 'pYear', 'pBed', 'pBath', 'pFloor', 'pLand', 'pBuild', 'pPark', 'pHeat'];
  const APPT_TARGET = {
    kind: 'agreement', locked: () => T.locked, done: () => ((T.c.import || {}).files || []),
    get: k => k === 'address' ? T.ag.address : ['owners', 'title'].includes(k) ? T.c[k] : T.an[k],
    set: (k, v) => { if (k === 'address') T.ag.address = v; else if (['owners', 'title'].includes(k)) T.c[k] = v; else T.an[k] = v; },
    people: () => T.people, collect: () => tCollect(),
    current: () => ({ address: T.ag.address, owners: T.c.owners, title: T.c.title, people: T.people.map(p => ({ legal_name: p.legal_name, email: p.email, phone: p.phone })) }),
    agreementId: () => T.id || null,
  };
  const PROP_TARGET = {
    kind: 'property', locked: () => !!PF.liveAgreement, done: () => PF.docs.map(d => ({ name: d.name })),
    get: k => k === 'address' ? PF.p.address : k === 'owners' ? PF.p.owners_on_title : k === 'title' ? PF.p.title_ref : ['capacity', 'entity'].includes(k) ? PF.p.ownership[k] : IMP_DESC.includes(k) ? PF.p.description[k] : PF.p.disclosures[k],
    set: (k, v) => { if (k === 'address') PF.p.address = v; else if (k === 'owners') PF.p.owners_on_title = v; else if (k === 'title') PF.p.title_ref = v; else if (['capacity', 'entity'].includes(k)) PF.p.ownership[k] = v; else if (IMP_DESC.includes(k)) PF.p.description[k] = v; else PF.p.disclosures[k] = v; },
    people: () => PF.people, collect: () => { },
    current: () => ({ address: PF.p.address, owners: PF.p.owners_on_title, title: PF.p.title_ref, people: PF.people.map(p => ({ legal_name: p.legal_name, email: p.email, phone: p.phone })) }),
    agreementId: () => null,
  };
  let IMPT = APPT_TARGET;
  const impGet = k => IMPT.get(k), impSet = (k, v) => IMPT.set(k, v);
  const impShow = (k, v) => IMP_YESNO.includes(k) ? (String(v).toLowerCase() === 'yes' ? 'Yes' : 'No') : String(v ?? '');
  const impNorm = (k, v) => IMP_YESNO.includes(k) ? (String(v).toLowerCase() === 'yes' ? 'yes' : 'no') : String(v ?? '').trim();
  let IMP = null; // the latest suggestions waiting for review

  function importCardHTML(target) {
    if (IMPT !== (target || APPT_TARGET)) IMP = null;
    IMPT = target || APPT_TARGET;
    if (IMPT.locked()) return '';
    const done = IMPT.done();
    return `<div class="card note no-print" id="impCard"><h3>Drop in their documents</h3>
      <p class="small">Title, LIM, property summary, a contact export from your CRM, an old appraisal, or a photo of a document. I'll read them and suggest what to fill in, with where each came from. Nothing is used until you tick it.</p>
      <label class="dropzone" id="impDrop"><input type="file" id="impFiles" multiple accept=".pdf,.docx,.xlsx,.xls,.ods,.csv,.tsv,.txt,.vcf,.jpg,.jpeg,.png,.webp,.gif"><strong>Choose files, or drag them here</strong><span class="small">PDF, Word (.docx), Excel, CSV or photos</span></label>
      <div id="impPicked"></div><div id="impOut"></div>
      ${done.length ? `<p class="small" style="margin:10px 0 0">Already read: ${esc(done.map(f => f.name).join(', '))}</p>` : ''}</div>`;
  }
  function wireImport() {
    const inp = $('#impFiles'); if (!inp) return;
    let picked = [];
    const showPicked = () => {
      $('#impPicked').innerHTML = picked.length ? `<ul class="small" style="margin:10px 0 0;padding-left:20px">${picked.map(f => `<li>${esc(f.name)} <span style="color:var(--muted)">(${Math.max(1, Math.round(f.size / 1024))} KB)</span></li>`).join('')}</ul><div class="toolbar"><button class="btn primary" type="button" id="impGo">Read ${picked.length === 1 ? 'it' : 'them'}</button><button class="btn link" type="button" id="impClear">Clear</button></div>` : '';
      const go = $('#impGo'); if (go) go.addEventListener('click', () => impRead(picked));
      const cl = $('#impClear'); if (cl) cl.addEventListener('click', () => { picked = []; inp.value = ''; showPicked(); });
    };
    const add = list => { for (const f of list) if (!picked.some(p => p.name === f.name && p.size === f.size)) picked.push(f); picked = picked.slice(0, 12); showPicked(); };
    inp.addEventListener('change', () => add(inp.files));
    const dz = $('#impDrop');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => add(e.dataTransfer.files));
    if (IMP) impReview();
  }
  async function impRead(picked) {
    const out = $('#impOut'), go = $('#impGo');
    if (picked.reduce((n, f) => n + f.size, 0) > 40 * 1024 * 1024) { out.innerHTML = '<p class="err">That\'s more than 40 MB all together. Leave out the largest file, or read them in two goes.</p>'; return; }
    if (go) go.disabled = true;
    out.innerHTML = `<p class="small" style="margin:10px 0 0"><strong>Reading ${picked.length} document${picked.length > 1 ? 's' : ''}…</strong> A long LIM can take up to a minute.</p>`;
    IMPT.collect();
    const batch = crypto.randomUUID(), files = [];
    try {
      for (const [i, f] of picked.entries()) {
        const path = `imports/${batch}/${i + 1}-${f.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80)}`;
        await must(sb.storage.from('private').upload(path, f, { contentType: f.type || 'application/octet-stream' }));
        files.push({ path, name: f.name });
      }
      const { data, error } = await sb.functions.invoke('doc-prefill', { body: { files, current: IMPT.current(), agreement_id: IMPT.agreementId() } });
      let res = data;
      if (error) { try { res = await error.context.json(); } catch (_) { res = { error: error.message }; } }
      if (!res || !res.ok) {
        out.innerHTML = res && res.error === 'not_set_up'
          ? '<div class="card warnc tight"><p class="small" style="margin:0"><strong>Document reading isn\'t switched on yet.</strong> It needs the one-off setup with an Anthropic account. Your files are saved, so read them again once it\'s done.</p></div>'
          : `<p class="err">${esc((res && res.error) || 'Something went wrong reading the documents.')}${res && res.skipped && res.skipped.length ? ' ' + esc(res.skipped.join('; ')) : ''}</p>`;
        if (go) go.disabled = false; return;
      }
      IMP = Object.assign({ files, skipped: res.skipped || [] }, res.result);
      impReview();
    } catch (e) { out.innerHTML = `<p class="err">${esc(e.message || 'Upload failed')}</p>`; if (go) go.disabled = false; }
  }
  function impMatch(p) {
    const em = (p.email || '').toLowerCase(), nm = (p.legal_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const list = IMPT.people(), exact = list.findIndex(x => (em && (x.email || '').toLowerCase() === em) || (nm && (x.legal_name || '').toLowerCase().replace(/\s+/g, ' ').trim() === nm));
    if (exact >= 0 || !nm) return exact;
    // same first and last name ("William Jones" on the appraisal, "William Robert Jones" on the title): one person, shown for Tim to confirm
    const ends = n => { const w = n.toLowerCase().replace(/[^a-z\u00c0-\u024f' -]/g, '').split(/\s+/).filter(Boolean); return w.length >= 2 ? w[0] + ' ' + w.at(-1) : ''; };
    const key = ends(nm), hits = key ? list.map((x, i) => ends(x.legal_name || '') === key ? i : -1).filter(i => i >= 0) : [];
    return hits.length === 1 ? hits[0] : -1;
  }
  function impReview() {
    const out = $('#impOut'); if (!out || !IMP) return;
    const fields = (IMP.fields || []).filter(f => IMP_LABELS[f.key]);
    const people = (IMP.people || []).filter(p => p.legal_name || p.email || p.phone);
    const frow = (f, i) => {
      const cur = String(impGet(f.key) ?? '').trim(), nv = impNorm(f.key, f.value), same = cur.toLowerCase() === nv.toLowerCase();
      return `<label class="imp-row"><input type="checkbox" data-impf="${i}" ${!cur || same ? 'checked' : ''}><span><span class="k">${esc(IMP_LABELS[f.key])}</span><span class="v">${esc(impShow(f.key, f.value))}</span><span class="src-badge">From ${esc(f.source)}</span>${cur && !same ? `<span class="now">Now: ${esc(impShow(f.key, cur))}. Tick to replace it.</span>` : ''}</span></label>`;
    };
    const prow = (p, i) => {
      const m = impMatch(p), ex = m >= 0 ? IMPT.people()[m] : null;
      return `<label class="imp-row"><input type="checkbox" data-impp="${i}" ${ex && ex.signed_at ? 'disabled' : 'checked'}><span><span class="k">${ex ? `Person ${m + 1}` : 'New person'}</span><span class="v">${esc([p.legal_name, p.pref_name ? `goes by ${p.pref_name}` : '', p.email, p.phone].filter(Boolean).join(' · '))}</span><span class="src-badge">From ${esc(p.source || 'the documents')}</span>${ex ? `<span class="now">${ex.signed_at ? 'Already signed, so it won\'t change.' : 'Fills in anything blank, and updates what\'s ticked.'}</span>` : ''}</span></label>`;
    };
    out.innerHTML = `<div class="imp-review"><h3 style="margin-top:14px">What I found</h3>
      ${(IMP.documents || []).length ? `<p class="small" style="margin:0 0 8px">${IMP.documents.map(d => `${esc(d.file)}: ${esc(d.kind)}`).join('<br>')}</p>` : ''}
      ${IMP.skipped && IMP.skipped.length ? `<p class="small err" style="margin:0 0 8px">Couldn't read: ${esc(IMP.skipped.join('; '))}</p>` : ''}
      ${people.length ? `<div class="imp-sec">People</div>${people.map(prow).join('')}` : ''}
      ${fields.length ? `<div class="imp-sec">Property and title</div>${fields.map(frow).join('')}` : ''}
      ${!people.length && !fields.length ? '<p class="small">Nothing I could use for the form.</p>' : ''}
      ${(IMP.flags || []).length ? `<div class="imp-sec">To talk through before signing</div><ul class="small" style="margin:4px 0 0;padding-left:20px">${IMP.flags.map(f => `<li>${esc(f.text)} <span class="src-badge">From ${esc(f.source)}</span></li>`).join('')}</ul><p class="small" style="margin:6px 0 0">These also show on ${IMPT.kind === 'property' ? 'the property file, and on the agreement\'s Discussion page' : 'the Discussion page'}.</p>` : ''}
      <div class="toolbar"><button class="btn primary" type="button" id="impApply">Fill in the ticked ones</button><button class="btn link" type="button" id="impDrop2">Discard</button></div></div>`;
    $('#impDrop2').addEventListener('click', () => { IMP = null; out.innerHTML = ''; });
    $('#impApply').addEventListener('click', async () => {
      if (IMPT.kind === 'property') return propApplyImport(fields, people);
      tCollect();
      const imp = Object.assign({ files: [], sources: {}, flags: [] }, T.c.import || {});
      $$('[data-impf]:checked').forEach(cb => { const f = fields[+cb.dataset.impf]; impSet(f.key, impNorm(f.key, f.value)); imp.sources[f.key] = f.source; });
      $$('[data-impp]:checked').forEach(cb => {
        const p = people[+cb.dataset.impp], m = impMatch(p);
        if (m >= 0) { const x = T.people[m]; if (x.signed_at) return; ['legal_name', 'pref_name', 'phone'].forEach(k => { if (p[k]) x[k] = p[k]; }); if (p.email && !x.user_id) x.email = p.email.toLowerCase(); }
        else { const blank = T.people.findIndex(x => !x.id && !(x.legal_name || '').trim() && !(x.email || '').trim()); const np = { legal_name: p.legal_name || '', pref_name: p.pref_name || '', email: (p.email || '').toLowerCase(), phone: p.phone || '' }; if (blank >= 0) T.people[blank] = np; else T.people.push(np); }
      });
      imp.files = imp.files.concat(IMP.files);
      const seen = new Set(imp.flags.map(f => f.text)); (IMP.flags || []).forEach(f => { if (!seen.has(f.text)) imp.flags.push(f); });
      imp.at = new Date().toISOString();
      T.c.import = imp; const read = IMP; IMP = null;
      if (T.ag.address && await tSave()) { await saveReadDocs(T.ag.property_id, read); toast('Filled in and saved. Check each one.'); } else toast('Filled in. Check each one, then save.');
      tShow(0);
    });
  }
  function impBadges() {
    const src = ((T && T.c.import) || {}).sources || {};
    Object.entries(src).forEach(([k, s]) => {
      const el = k === 'address' ? $('#tAddr') : $(`[data-c="${k}"]:not([type=radio]),[data-an="${k}"]:not([type=radio])`);
      const lab = el && el.id ? $(`label[for="${el.id}"]`) : null;
      if (lab && !lab.querySelector('.src-badge')) lab.insertAdjacentHTML('beforeend', ` <span class="src-badge">From ${esc(s)}</span>`);
    });
  }
  function impFlagsHTML() {
    const fl = ((T.c.import || {}).flags || []);
    return fl.length ? `<div class="card warnc"><h3>From their documents: talk these through</h3><ul class="small" style="margin:6px 0 0;padding-left:20px">${fl.map(f => `<li>${esc(f.text)} <span class="src-badge">From ${esc(f.source)}</span></li>`).join('')}</ul></div>` : '';
  }

  /* page 1 */
  function tPage1() {
    return `<h1>Property and people</h1>
      <p class="lede">Fill in what you know before the appointment. At the table, check it together and complete the rest.</p>
      ${importCardHTML()}
      <h2>Property</h2>
      <label class="f" for="tAddr" style="margin-top:0">Address</label><input type="text" id="tAddr" value="${esc(T.ag.address)}" placeholder="Street, suburb, Dunedin">
      <div class="row2 stack">${TF.text('c', 'owners', 'Registered owners <span class="opt">(from the title)</span>')}${TF.text('c', 'title', 'Title reference')}</div>
      <h2>Who's selling</h2>
      <p class="small">Everyone on the title signs. An email for each person is needed for their signed copy.</p>
      <div id="tPeople"></div>
      <button class="btn link" type="button" id="tAddP">Add a person</button>
      <div class="choices" style="margin-top:12px">
        ${TF.radio('an', 'capacity', 'Owners', 'They own it personally', '', 'Owners')}${TF.radio('an', 'capacity', 'Trustee', 'As trustees of a trust', '', 'Owners')}${TF.radio('an', 'capacity', 'Director', 'As directors of a company', '', 'Owners')}${TF.radio('an', 'capacity', 'Authorised signatory, agent or attorney', 'On someone else\'s behalf', 'For example as attorney, executor or authorised signatory', 'Owners')}
      </div>
      <div data-treveal="an:capacity:Trustee|Director|Authorised signatory, agent or attorney">${TF.text('an', 'entity', 'Name of the trust, company or person they act for')}</div>
      <div class="row2"><div><div class="f">GST registered for this sale?</div><div class="choices two">${TF.radio('an', 'gst', 'no', 'No', '', 'no')}${TF.radio('an', 'gst', 'yes', 'Yes', '', 'no')}</div></div><div data-treveal="an:gst:yes">${TF.text('an', 'gstNo', 'GST number', { im: 'numeric' })}</div></div>
      <div class="choices" style="margin-top:12px">${TF.check('an', 'titleOk', 'Ownership confirmed', 'They\'re the registered owners or authorised to sell, and no one else has an interest (such as a mortgagee sale, estate or relationship property claim). Clause 9.1.1')}</div>
      <h2>How this listing came about</h2>
      <div class="choices">${TF.radio('c', 'approach', 'invited', 'The vendor contacted me', 'Cooling-off ends 5pm on the first working day after they get their copy', 'invited')}${TF.radio('c', 'approach', 'unsolicited', 'I approached them first', 'Unsolicited: 5 working days, and it needn\'t be in writing', 'invited')}</div>
      <h2>Appraisal</h2>
      <div class="choices">${TF.radio('c', 'appr', 'done', 'Written appraisal given', '', 'done')}${TF.radio('c', 'appr', 'pending', 'Not yet', 'The agreement becomes conditional on them receiving your written appraisal', 'done')}</div>
      <div data-treveal="c:appr:done"><div class="row2 stack">${TF.text('c', 'ask', 'Price for the commission example', { im: 'numeric' })}${TF.select('c', 'askBasis', 'Based on', [['asking', 'Client\'s asking price'], ['median', 'Median appraised value']], 'asking')}</div>
        ${TF.text('c', 'apprUrl', 'Appraisal web address <span class="opt">(clause 23.1, optional)</span>', { type: 'url', ph: 'Leave blank if given in writing' })}</div>
      <h2>Dates and method</h2>
      <div class="row2 stack">${TF.text('c', 'start', 'Commencement date <span class="opt">(blank = on signing)</span>', { type: 'date' })}${TF.select('c', 'method', 'Method of sale', ['', 'Auction', 'Tender', 'Deadline sale', 'Price by negotiation', 'Fixed price', 'Expressions of interest', 'Timed sale', 'Ballot'], '')}</div>
      ${TF.text('c', 'methodDate', 'Auction, tender, deadline or ballot date and time', { opt: true, ph: 'For example: Thu 26 Nov 2026, 4pm' })}
      <h2>The property</h2>
      <div class="card">
        <div class="row2 stack">${TF.select('an', 'pType', 'Type', ['House', 'Townhouse', 'Unit or apartment', 'Lifestyle', 'Section'], 'House')}${TF.text('an', 'pYear', 'Year built <span class="opt">(approx.)</span>', { im: 'numeric' })}</div>
        <div class="row2">${TF.text('an', 'pBed', 'Bedrooms', { type: 'number' })}${TF.text('an', 'pBath', 'Bathrooms', { type: 'number' })}</div>
        <div class="row2">${TF.text('an', 'pFloor', 'Floor area (m²)', { type: 'number' })}${TF.text('an', 'pLand', 'Land area (m²)', { type: 'number' })}</div>
        <div class="row2 stack">${TF.text('an', 'pBuild', 'Construction')}${TF.text('an', 'pPark', 'Parking')}</div>
        ${TF.text('an', 'pHeat', 'Heating and insulation')}
        ${TF.area('an', 'pLove', 'What will buyers love?', { opt: true })}
      </div>
      <h2>What stays with the house</h2>
      ${TF.chips('chattels', CHATTELS, CHATTELS_DEFAULT)}
      ${TF.text('an', 'chatOther', 'Anything else staying or going?', { opt: true })}
      <h2>Work done and disclosures</h2><p class="small">The vendor answers to the best of their knowledge. <span class="clause">Clauses 9.2 to 9.5</span></p>
      ${[['work', 'Any renovations, additions or repairs, especially anything needing a building consent?', 'What was done, roughly when, and was it consented?'], ['wt', 'Any leaks or weathertightness issues?', 'Tell us what you know'], ['meth', 'Any methamphetamine use, manufacture or contamination?', 'Tell us what you know'], ['def', 'Any defects, council notices or requirements from anyone?', 'Tell us what you know']].map(([k, q, dl]) => `
        <div class="card tight"><div class="ct" style="font-weight:600;margin-bottom:8px">${q}</div><div class="choices two">${TF.radio('an', k, 'no', k === 'work' ? 'None known' : 'Not that they know of', '', '')}${TF.radio('an', k, 'yes', 'Yes', '', '')}</div>
        <div data-treveal="an:${k}:yes">${TF.area('an', k + 'Detail', dl)}</div></div>`).join('')}
      <h2>Hazards for visitors</h2><p class="small"><span class="clause">Clause 16.2</span></p>
      ${TF.chips('hazards', HAZ, [])}
      ${TF.text('an', 'hazOther', 'Anything else visitors should know?', { opt: true })}
      <h2>Identity checks</h2>
      ${TF.select('c', 'aml', 'How the sellers are verified', [['Manual', 'Manual: I check ID myself'], 'Halo', 'APLYiD', 'First AML', 'Cloudcheck', 'Dwellhub'], 'Manual')}`;
  }
  function tBind1() {
    const draw = () => {
      $('#tPeople').innerHTML = T.people.map((p, i) => `<div class="card tight" data-i="${i}">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Person ${i + 1}</h3>${p.signed_at ? '<span class="signed-badge">Signed</span>' : `<button class="btn link" type="button" data-rm="${i}">Remove</button>`}</div>
        <div class="row2 stack"><div><label class="f">Full legal name</label><input data-pk="legal_name" value="${esc(p.legal_name)}" ${p.signed_at ? 'readonly' : ''}></div><div><label class="f">Goes by <span class="opt">(optional)</span></label><input data-pk="pref_name" value="${esc(p.pref_name)}"></div></div>
        <div class="row2 stack"><div><label class="f">Email</label><input type="email" data-pk="email" value="${esc(p.email)}" ${p.user_id || p.signed_at ? 'readonly' : ''}></div><div><label class="f">Mobile</label><input type="tel" data-pk="phone" value="${esc(p.phone)}"></div></div></div>`).join('');
      $$('#tPeople [data-pk]').forEach(inp => inp.addEventListener('input', () => { T.people[+inp.closest('[data-i]').dataset.i][inp.dataset.pk] = inp.value; }));
      $$('#tPeople [data-rm]').forEach(b => b.addEventListener('click', () => { const p = T.people[+b.dataset.rm]; if (p.id) T.del.push(p.id); T.people.splice(+b.dataset.rm, 1); if (!T.people.length) T.people.push({ legal_name: '', pref_name: '', email: '', phone: '' }); draw(); }));
    };
    draw();
    $('#tAddP').addEventListener('click', () => { T.people.push({ legal_name: '', pref_name: '', email: '', phone: '' }); draw(); });
    const ask = $('#t_ask'); if (ask) ask.addEventListener('change', () => { if (HAS_CAT) setBand(T.CAMP, bandFor(ask.value)); });
    wireImport();
  }

  /* page 2 */
  function tPage2() {
    const pend = T.c.appr === 'pending';
    return `<h1>Discussion</h1>${impFlagsHTML()}
      <p class="lede">The fee, the extras and the marketing. Agree these together, then fill them in.</p>
      <h2>Commission</h2><p class="small"><span class="clause">Page 1, section D and clause 5</span></p>
      <div class="row2">${TF.text('c', 'flat', 'Flat fee', { im: 'numeric' })}${TF.text('c', 'thr', 'For a sale price up to', { im: 'numeric', d: '250000' })}</div>
      ${TF.select('c', 'aboveType', 'Above that price', [['pct', 'Plus a percentage of the portion above'], ['amount', 'Plus a fixed dollar amount'], ['none', 'Nothing more: flat fee at any price']], 'pct')}
      <div data-treveal="c:aboveType:pct">${TF.text('c', 'pct', 'Percentage', { im: 'decimal' })}</div>
      <div data-treveal="c:aboveType:amount">${TF.text('c', 'aboveAmt', 'Fixed amount, excl GST', { im: 'numeric' })}</div>
      <div class="card tight" style="margin-top:14px"><div class="row2"><div><label class="f" for="tCalc" style="margin-top:0">Try a sale price</label><input type="text" id="tCalc" inputmode="numeric" value="${pend ? '' : num(T.c.ask).toLocaleString('en-NZ')}"></div>
        <div><div class="small" style="margin-bottom:6px;font-weight:500;color:var(--ink)">Commission</div><div class="big money" id="tCalcOut">–</div><div class="small" id="tCalcGst"></div></div></div>
        <p class="small" style="margin:10px 0 0">Only payable once a sale is unconditional.</p></div>
      <h2>Costs on signing</h2><p class="small">Untick or change either one if you've agreed something different. <span class="clause">Page 1, section E</span></p>
      <div class="row2"><div style="padding-top:6px">${TF.check('c', 'limOn', 'LIM report', '', true)}</div>${TF.text('c', 'lim', 'Amount, incl GST', { im: 'decimal', d: '425' })}</div>
      <div class="row2"><div style="padding-top:6px">${TF.check('c', 'adminOn', 'Administration fee', '', true)}</div>${TF.text('c', 'admin', 'Amount, incl GST <span class="opt">($500 plus GST is $575)</span>', { im: 'decimal', d: '575' })}</div>
      <h2>Visiting professionals</h2><p class="small">A McGuire representative is present at every visit, and every professional signs the access form. These are the vendor's choices. <span class="clause">Clause 16.4</span></p>
      <div class="choices">${TF.check('an', 'vQuotes', 'Allow visits to give a buyer a quote', 'For example a builder pricing an extension', true)}${TF.check('an', 'vSales', 'Allow sales assessments', 'Someone assessing the home to sell the buyer a product, such as solar or insulation', false)}${TF.check('an', 'vNotify', 'Tell the vendor before each visit', 'A text with who is coming, when and why', true)}</div>
      ${TF.select('an', 'vNotice', 'Minimum notice for a visit', ['Same day is fine', '24 hours', '48 hours'], 'Same day is fine')}
      ${TF.text('an', 'vNotes', 'Pets, keys, alarm or access notes', { opt: true })}
      <h2>Other agents</h2><p class="small"><span class="clause">Clause 3</span></p>
      <div class="choices">${TF.radio('an', 'prior', 'none', 'No other agent', '', 'none')}${TF.radio('an', 'prior', 'yes', 'They have or had another agency', 'Check it has ended before signing, or they could owe two commissions', 'none')}</div>
      <div data-treveal="an:prior:yes"><p class="small">Each previous agency gets a cancellation notice, signed with the agreement. You check and send it afterwards.</p><div id="tPrior"></div><button class="btn link" type="button" id="tAddPA">Add another agency</button></div>
      <h2>People who have already expressed interest in buying <span class="opt small" style="font-family:var(--body)">(optional)</span></h2>
      <p class="small">Fold them into the campaign, or exclude them for 10 working days. <span class="clause">Clause 2.3</span></p>
      <div id="tBuyers"></div><button class="btn link" type="button" id="tAddB">Add someone</button>
      <h2>Marketing</h2><p class="small">Paid through List Now; the vendor chooses how to settle. <span class="clause">Page 1, section E and clause 6</span></p>
      <div class="choices two">${TF.radio('c', 'mktMode', 'build', 'Agree the campaign now', '', 'build')}${TF.radio('c', 'mktMode', 'later', 'Agree marketing later', 'Nothing is booked or spent until they approve it in writing', 'build')}</div>
      <div data-treveal="c:mktMode:build"><div id="campBox"></div><h2>Campaign schedule</h2><div id="schedBox"></div></div>`;
  }
  function tBind2() {
    const calc = () => { const cfg = Object.assign({}, T.c); $$('[data-c]').forEach(el => { if (el.type === 'radio') { if (el.checked) cfg[el.dataset.c] = el.value; } else if (el.type !== 'checkbox') cfg[el.dataset.c] = el.value; }); const p = num($('#tCalc').value); if (!p || !num(cfg.flat)) { $('#tCalcOut').textContent = '–'; $('#tCalcGst').textContent = p ? 'Enter the fee' : 'Enter a price'; return; } const cm = commission(cfg, p); $('#tCalcOut').textContent = money(r2(cm)); $('#tCalcGst').textContent = 'plus GST, ' + money(r2(cm * 1.15)) + ' in total'; };
    ['#tCalc', '#t_flat', '#t_thr', '#t_pct', '#t_aboveAmt', '#t_aboveType'].forEach(s => { const el = $(s); if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); } }); calc();
    wirePrior($('#tPrior'), $('#tAddPA'), T.an.priorAgencies);
    let buyers = (T.an.interested || []).slice();
    const readB = () => $$('#tBuyers .buyer').map(cd => ({ name: $('[data-b=name]', cd).value.trim(), phone: $('[data-b=phone]', cd).value.trim(), email: $('[data-b=email]', cd).value.trim(), exclude: $('[data-b=exclude]', cd).checked }));
    const drawB = () => { $('#tBuyers').innerHTML = buyers.map(buyerCard).join(''); $$('#tBuyers [data-rmb]').forEach(b => b.addEventListener('click', () => { buyers = readB(); buyers.splice(+b.dataset.rmb, 1); drawB(); })); };
    drawB();
    $('#tAddB').addEventListener('click', () => { buyers = readB(); buyers.push({ name: '', phone: '', email: '', exclude: false }); drawB(); });
    campaignEditor($('#campBox'), T.CAMP, null);
    scheduleEditor($('#schedBox'), T.SCH, () => T.c.start || null);
  }

  /* page 3 */
  function tFront() {
    const c = tConfig(), an = T.an, pk = pkgOf(c), later = c.mktMode === 'later', pend = c.appr === 'pending';
    const ent = an.capacity && an.capacity !== 'Owners' && an.entity ? `, as ${an.capacity.toLowerCase()} for ${an.entity}` : '';
    const legal = T.legalPick || (T.ag.legal || {}).choice;
    return {
      client: T.people.filter(p => p.legal_name).map(p => p.legal_name).join(' and ') + ent,
      gst: an.gst === 'yes' ? 'Yes, ' + (an.gstNo || '') : 'No',
      property: T.ag.address,
      starts: pend ? 'On receipt of written appraisal' : (c.start ? fmtDate(c.start) : 'On signing'),
      review: '90 days after commencement',
      commission: commText(c),
      example: pend ? 'To be added with the written appraisal' : `At ${money(num(c.ask))}: ${money(r2(commission(c, num(c.ask))))} plus GST`,
      costs: [limAmt(c) ? 'LIM ' + money(limAmt(c)) : '', adminAmt(c) ? 'administration fee ' + money(adminAmt(c)) : '', 'marketing ' + (later ? 'to be agreed' : money(pk.amt))].filter(Boolean).join(', ') + ' (including GST)',
      condition: pend ? 'Takes effect on receipt of a written appraisal. The client may cancel within 2 working days of receiving it, at no cost.' : '',
      legal: legal === 'have' ? 'Received' : legal === 'waive' ? 'Chose to go ahead without it' : 'Not recorded yet',
    };
  }
  function tPage3() {
    const fp = tFront(), L = T.ag.legal || {}, parked = T.ag.status === 'parked';
    const guide = ta('guide', []), acks = ta('acks', []), acksL = acksList(T.c);
    const rows = [['A', 'Client', `${esc(fp.client || '(names to come)')}<br><span class="small">GST registered: ${esc(fp.gst)}</span>`], ['B', 'Property', esc(fp.property)], ['C', 'Starts', esc(fp.starts)], ['C', 'Review date', esc(fp.review)],
      ['D', 'Commission', `${esc(fp.commission)}<br><span class="small">${esc(fp.example)}</span>`], ['E', 'Costs', `${esc(fp.costs)}<br><span class="small">Invoiced through List Now</span>`]];
    if (fp.condition) rows.push(['', 'Condition', esc(fp.condition)]);
    const named = T.people.filter(p => (p.legal_name || '').trim());
    const manual = (T.c.aml || 'Manual') === 'Manual';
    return `<h1>Signing</h1>
      <p class="lede">Go through the agreement together, record what's been explained, then sign here or send it to their phones.</p>
      ${parked ? `<div class="card warnc"><h3>Paused for legal advice</h3><p class="small" style="margin:0">Sent to ${esc(L.lawyer || 'their lawyer')}${L.firm ? ', ' + esc(L.firm) : ''}. Once they've heard back, record it below and carry on.</p></div>` : ''}
      <h2>Front page</h2>
      <div class="card"><table class="sum">${rows.map(r => `<tr><td>${r[0] ? `<span class="clause">${r[0]}</span> ` : ''}${r[1]}</td><td style="white-space:normal">${r[2]}</td></tr>`).join('')}</table></div>
      <div class="toolbar">${pdfBtn('Open the full agreement (PDF)')}</div>
      <h2>The agreement in plain English</h2><p class="small">Tick each section once you've been through it together. <strong id="tGuideCount">${guide.length} of ${GUIDE.length}</strong></p>
      <div class="toolbar" style="margin-top:0"><button class="btn ghost" type="button" data-tickall="guide">Tick all: we've been through these</button></div>
      ${GUIDE.map((g, i) => `<details class="acc tguide"><summary><label class="choice cb" style="margin:0;border:0;padding:0;background:none" onclick="event.stopPropagation()"><input type="checkbox" data-tmulti="guide" value="${i}" ${guide.includes(String(i)) ? 'checked' : ''}><span class="mark"></span><span class="ct">${esc(g[0])}</span></label> <span class="clause">${esc(g[1])}</span></summary><div class="in"><ul>${g[2].map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>`).join('')}
      <h2>Before signing</h2><p class="small">Only tick what has actually happened. <span class="clause">Clause 22.1</span></p>
      <div class="card"><div class="toolbar" style="margin:0 0 8px"><button class="btn ghost" type="button" data-tickall="acks">Tick all: these all happened</button></div>${acksL.map((a, i) => `<div class="ack"><input type="checkbox" id="tak${i}" data-tmulti="acks" value="${i}" ${acks.includes(String(i)) ? 'checked' : ''}><label for="tak${i}"><span class="what">${esc(a[0])}</span>${a[1] ? `<div class="how">${a[1]}</div>` : ''}</label>${a[2] ? `<div class="ack-more">${a[2]}</div>` : ''}</div>`).join('')}</div>
      <h2>Legal advice</h2><p class="small"><span class="clause">Clause 22.1.1</span></p>
      <div class="choices">${[['have', 'They\'ve had legal advice', ''], ['waive', 'They\'re happy to go ahead without it', 'They can still talk to a lawyer before cooling-off ends'], ['send', 'Send it to their lawyer first', 'Their lawyer gets a read-only link, and signing pauses']].map(([v, t, d]) => `<label class="choice"><input type="radio" name="tLegal" value="${v}" ${(T.legalPick || L.choice) === v ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${t}</span>${d ? `<span class="cd">${d}</span>` : ''}</span></label>`).join('')}</div>
      <div id="tLawWrap" hidden><div class="row2 stack"><div><label class="f">Lawyer's name</label><input type="text" id="tLawN"></div><div><label class="f">Firm <span class="opt">(optional)</span></label><input type="text" id="tLawF"></div></div>
        <label class="f">Lawyer's email</label><input type="email" id="tLawE"><div class="toolbar"><button class="btn primary" type="button" id="tLawGo">Send to lawyer and pause</button></div></div>
      <h2>Identity</h2>
      <div class="card tight"><p class="small" style="margin:0">${manual ? 'You verify each seller yourself. Use the AML file for each person on the agreement page.' : `${esc(T.c.aml)} sends each seller a link to verify on their phone.`} They can sign now; you can't act until everyone is verified.</p></div>
      ${priorList(T.an).length ? `<h2>Cancelling the previous agency</h2><p class="small">Each seller also signs ${priorList(T.an).length > 1 ? 'these notices' : 'this notice'} with the same signature. You check and send ${priorList(T.an).length > 1 ? 'them' : 'it'} from the agreement page.</p>${priorList(T.an).map(x => noticeHTML(T.ag.address, fp.client || '(names to come)', x)).join('')}` : ''}
      <h2>Signatures</h2>
      ${named.length ? named.map(p => p.signed_at ? `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">${esc(p.legal_name)}</h3><span class="signed-badge">✓ Signed ${esc(fmtDT(p.signed_at))}</span></div>`
        : `<div class="card tight" data-signer="${p.id || ''}"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px"><h3 style="margin:0">${esc(p.legal_name)}</h3><button class="btn link" type="button" data-clear="${p.id}">Clear</button></div>
          ${priorList(T.an).length ? `<label class="choice cb" style="margin:0 0 10px"><input type="checkbox" data-tnotice="${p.id}"><span class="mark"></span><span><span class="ct">Also sign the notice${priorList(T.an).length > 1 ? 's' : ''} cancelling the agency with ${esc(joinNames(priorList(T.an).map(x => x.agency)))}</span></span></label>` : ''}
          <div class="sig-wrap"><canvas id="pad_${p.id}" aria-label="Signature pad for ${esc(p.legal_name)}"></canvas><div class="sig-line"></div><span class="hint">${esc(callName(p) || p.legal_name)} signs here</span></div>
          ${saveNote(`Save ${callName(p) || p.legal_name}'s signature`)}
          <div class="toolbar"><button class="btn primary" type="button" data-signnow="${p.id}">Save ${esc(callName(p) || p.legal_name)}'s signature</button></div></div>`).join('') : '<p class="small">Add the sellers on page 1 first.</p>'}
      <p class="small">By signing they agree to the Sole and Exclusive Agency Agreement ${esc(AGREEMENT_VERSION.split('-')[0])}, including the Terms and Conditions, the Property Description and the Verification of Ownership. Each signer is emailed their copy once everyone has signed, which starts the cooling-off period.</p>
      ${named.some(p => !p.signed_at) ? `<div class="card note"><h3>Or let them sign on their own phones</h3><p class="small">They'll get a link, check what you've filled in together, and sign in their own time. Anyone who's already signed here stays signed.</p><div class="toolbar"><button class="btn ghost" type="button" id="tSendPhones">Send to sign on their phones</button></div></div>` : ''}
      <div id="tDone"></div>`;
  }
  function makePad(cv) {
    if (!cv) return null;
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * dpr); cv.height = 150 * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a1a1a';
    let drawing = false, last = null, drawn = false;
    const pos = e => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    cv.addEventListener('pointerdown', e => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; const h = cv.parentElement.querySelector('.hint'); if (h) h.hidden = true; });
    const end = () => { drawing = false; if (drawn) padUnsaved(cv, true); }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    return { drawn: () => drawn, clear: () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; padUnsaved(cv, false); const h = cv.parentElement.querySelector('.hint'); if (h) h.hidden = false; } };
  }
  async function tRecordLegal() {
    const pick = T.legalPick;
    if (['have', 'waive'].includes(pick) && (T.ag.legal || {}).choice !== pick) { await must(sb.rpc('agent_set_legal', { a: T.id, choice: pick })); T.ag.legal = Object.assign({}, T.ag.legal, { choice: pick }); }
  }
  function tBind3() {
    if (T.id) wirePdf(T.id); else $$('[data-pdf]').forEach(b => b.addEventListener('click', async () => { tCollect(); if (await tSave()) openPdf(T.id); }));
    const tak = $('#tak1'); if (tak && GUIDES.agency) tak.addEventListener('change', () => { if (tak.checked) T.an._reaAgencyAt = new Date().toISOString(); });
    const tak2 = $('#tak2'); if (tak2 && GUIDES.sale_purchase) tak2.addEventListener('change', () => { if (tak2.checked) T.an._reaSaleAt = new Date().toISOString(); });
    $$('[data-tmulti="guide"]').forEach(cb => cb.addEventListener('change', () => { $('#tGuideCount').textContent = `${$$('[data-tmulti="guide"]:checked').length} of ${GUIDE.length}`; })); wireTickAll();
    const lu = () => { const ch = $('input[name="tLegal"]:checked'); $('#tLawWrap').hidden = !(ch && ch.value === 'send'); };
    $$('input[name="tLegal"]').forEach(r => r.addEventListener('change', lu)); lu();
    $('#tLawGo').addEventListener('click', async () => {
      const n = $('#tLawN').value.trim(), fm = $('#tLawF').value.trim(), e = $('#tLawE').value.trim();
      if (!n || !EMAIL_RE.test(e)) return tErr('Add the lawyer\'s name and email.');
      tCollect(); if (!(await tSave())) return;
      await must(sb.rpc('agent_send_to_lawyer', { a: T.id, l_name: n, l_firm: fm, l_email: e }));
      const { data, error } = await sb.functions.invoke('notify', { body: { type: 'lawyer', agreement_id: T.id } });
      toast(error || (data && data.ok === false) ? 'Saved, but the lawyer email didn\'t send. Try again from the agreement page.' : 'Sent to ' + n);
      viewAgentDetail(T.id);
    });
    $$('[data-signer]').forEach(card => { const pid = card.dataset.signer; T.pads[pid] = makePad($('#pad_' + pid)); });
    $$('[data-clear]').forEach(b => b.addEventListener('click', () => { const pd = T.pads[b.dataset.clear]; if (pd) pd.clear(); }));
    $$('[data-signnow]').forEach(b => b.addEventListener('click', async () => {
      const pid = b.dataset.signnow, pad = T.pads[pid];
      tCollect();
      const e = tReadyToSign(); if (e) return tErr(e);
      const person = T.people.find(x => x.id === pid);
      if (!person || !EMAIL_RE.test(person.email || '')) return tErr(`Add an email for ${person ? person.legal_name : 'this person'} on page 1, so they get their signed copy.`);
      if (!pad || !pad.drawn()) return tErr('Please sign in the box first.');
      const tn = $(`[data-tnotice="${pid}"]`); if (tn && !tn.checked) return tErr('Tick the box to sign the cancellation notice as well, or stop and sort out the previous agency first.');
      b.disabled = true;
      try {
        const blob = await new Promise(res => $('#pad_' + pid).toBlob(res, 'image/png'));
        if (!(await tSave())) return;
        await tRecordLegal();
        const path = `agreements/${T.id}/signatures/${pid}-${Date.now()}.png`;
        await must(sb.storage.from('private').upload(path, blob, { contentType: 'image/png' }));
        const cfg = tConfig();
        const snapshot = { agreement_version: AGREEMENT_VERSION, agreement_ref: T.ag.ref, front_page: tFront(), config: cfg, answers: T.an, people: T.people.map(p => ({ legal_name: p.legal_name, email: p.email })), signer: { name: person.legal_name, email: person.email }, notices: noticeSnapshot(T.ag.address, tFront().client, T.an), signed_at_client: new Date().toISOString() };
        Object.assign(snapshot, await signExtras(T.id, T.an));
        const res = await must(sb.rpc('agent_sign_in_person', { a: T.id, pid, p_image_path: path, p_snapshot: snapshot, p_user_agent: navigator.userAgent }));
        await sigSaved($('#pad_' + pid), `${person.legal_name} has signed`, 'Signature saved');
        T.people = await must(sb.from('agreement_people').select('*').eq('agreement_id', T.id).order('position'));
        T.ag = Object.assign(T.ag, await must(sb.from('agreements').select('id,ref,status,legal,sent_at,cooling_off_until').eq('id', T.id).single()));
        if (res && res.remaining === 0) {
          const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'signed', agreement_id: T.id } });
          toast(fe ? 'All signed. The copy email didn\'t send; resend it from the agreement page.' : 'All signed. Copies are on their way.');
          return viewAgentDetail(T.id);
        }
        toast(person.legal_name + ' has signed'); tShow(2);
      } catch (x) { b.disabled = false; }
    }));
    const sp = $('#tSendPhones');
    if (sp) sp.addEventListener('click', async () => {
      tCollect();
      const unsigned = T.people.filter(p => (p.legal_name || '').trim() && !p.signed_at);
      for (const p of [0, 1]) { const e = tValidate(p); if (e) return tErr(e + ` (page ${p + 1})`); }
      if (unsigned.some(p => !EMAIL_RE.test(p.email || ''))) return tErr('Add an email on page 1 for everyone still to sign, so they can sign in.');
      const guideDone = (T.an.guide || []).length >= GUIDE.length, acksDone = (T.an.acks || []).length >= acksList(T.c).length, legal = ['have', 'waive'].includes(T.legalPick || (T.ag.legal || {}).choice);
      T.an._step = !guideDone ? 6 : (!acksDone || !legal) ? 7 : 9;
      if (!(await tSave())) return;
      if (legal) await tRecordLegal();
      await must(sb.from('agreements').update({ status: 'sent', sent_at: T.ag.sent_at || new Date().toISOString() }).eq('id', T.id).in('status', ['draft', 'sent']));
      await must(sb.from('agreement_events').insert({ agreement_id: T.id, actor: SESSION.user.email, kind: 'sent_to_vendor', detail: { from: 'appointment' } }));
      toast('Ready for them to sign on their phones');
      viewAgentDetail(T.id, true);
    });
  }

  /* detail */
  async function viewAgentDetail(id, justSent, focus) {
    header('Agreement', '', 0);
    const ag = await must(sb.from('agreements').select('*').eq('id', id).single());
    const people = await must(sb.from('agreement_people').select('*').eq('agreement_id', id).order('position'));
    const events = await must(sb.from('agreement_events').select('*').eq('agreement_id', id).order('at', { ascending: false }));
    const sigs = await must(sb.from('signatures').select('*').eq('agreement_id', id).order('signed_at'));
    const lawyers = await must(sb.from('lawyer_links').select('*').eq('agreement_id', id).order('sent_at', { ascending: false }));
    const amls = await must(sb.from('aml_files').select('id,person_id,locked_at').eq('agreement_id', id));
    const emails = await must(sb.from('email_log').select('*').eq('agreement_id', id).order('at', { ascending: false }));
    const creqs = await must(sb.from('cancellation_requests').select('*').eq('agreement_id', id).order('requested_at', { ascending: false }));
    const avars = await must(sb.from('agreement_variations').select('*').eq('agreement_id', id).order('number'));
    const avsigs = await must(sb.from('variation_signatures').select('*').eq('agreement_id', id));
    const pans = await must(sb.from('prior_agency_notices').select('*').eq('agreement_id', id).order('idx'));
    const softly = async q => { try { const { data, error } = await q; return error ? [] : data || []; } catch (_) { return []; } };
    const aforms = await softly(sb.from('property_forms').select('*').eq('agreement_id', id)), arc = await softly(sb.from('guide_receipts').select('*').eq('agreement_id', id));
    const sigUrls = {};
    for (const s of sigs) if (s.image_path) { const { data } = await sb.storage.from('private').createSignedUrl(s.image_path, 600); if (data) sigUrls[s.id] = data.signedUrl; }
    const names = people.map(p => callName(p)).filter(Boolean);
    const msg = `Hi ${joinNames(names) || 'there'},\n\nYour agency agreement for ${ag.address} is ready. Open this link and sign in with your email address. You'll get a sign-in link by email, no password needed:\n\n${APP_URL}\n\nIt takes about 15 minutes. Any questions, just call or text me on 027 562 7207.\n\nTim`;
    const cfg = ag.config || {}, an = ag.answers || {};
    main().innerHTML = `<div class="view-pad">
      <div class="toolbar no-print"><button class="btn ghost" type="button" id="toList">Dashboard</button>${ag.property_id ? '<button class="btn ghost" type="button" id="toProp">Property file</button>' : ''}</div>
      <span class="agent-flag no-print">Only you see this</span>
      <h1>${esc(ag.address || 'Untitled')}</h1>
      <p><span class="pill ${ag.status}">${esc(ag.status)}</span> <span class="small">${esc(ag.ref)} · ${esc(ag.agreement_version)}</span></p>
      ${justSent || ag.status === 'sent' ? `<div class="card note no-print"><h3>Send this to the vendor</h3><p class="small">Text or email them this message. They sign in with the email you entered.</p><div class="copybox" id="msgBox">${esc(msg)}</div><div class="toolbar"><button class="btn ghost" type="button" id="copyMsg">Copy message</button></div></div>` : ''}
      <div class="toolbar no-print">
        <button class="btn ${['draft', 'sent', 'parked'].includes(ag.status) ? 'primary' : 'ghost'}" type="button" id="editAg">${['draft', 'sent', 'parked'].includes(ag.status) ? 'Open appointment flow' : 'Review the three pages'}</button>
        ${ag.status === 'signed' ? '<button class="btn primary" type="button" id="counterBtn">Countersign</button>' : ''}
        <button class="btn primary" type="button" data-pdf="1">Full agreement (PDF)</button>
        ${cfg.campaign || cfg.schedule ? '<button class="btn ghost" type="button" id="campPdf">Campaign PDF</button>' : ''}
        ${cfg.prelisting_id ? '<button class="btn ghost" type="button" id="plAns">Pre-listing answers</button>' : ''}
        <button class="btn ghost" type="button" id="printBtn">Print this page</button>
        ${['signed', 'countersigned', 'sent', 'parked'].includes(ag.status) ? '<button class="btn ghost" type="button" id="endBtn">End agency</button>' : ''}
      </div>
      <div id="counterBox"></div><div id="endBox"></div>
      ${creqs.filter(r => r.status !== 'processed').map(r => `<div class="card warnc no-print" data-cr="${r.id}"><h3>Request to cancel from ${esc(r.requested_by)}</h3>
        <p class="small">Sent ${esc(fmtDT(r.requested_at))}, ${r.within_cooling_off ? '<strong>within the cooling-off period</strong>' : 'after the cooling-off period'}. Call them on <strong>${esc(r.phone || 'their usual number')}</strong>.${r.reasons ? `<br>Their reasons: “${esc(r.reasons)}”` : '<br>No reasons given.'}</p>
        <p class="small">Talk it through first. If it was a misunderstanding and they're happy to continue, record that. If they still want to cancel, process it and they'll get written confirmation.</p>
        <label class="f">Notes from the conversation</label><textarea data-crnotes="${r.id}" placeholder="Who you spoke to, when, what was agreed"></textarea>
        <div class="toolbar"><button class="btn primary" type="button" data-crdo="cancelled" data-crid="${r.id}">Cancel the agreement</button><button class="btn ghost" type="button" data-crdo="continuing" data-crid="${r.id}">They're continuing</button></div><div class="err"></div></div>`).join('')}
      ${creqs.filter(r => r.status === 'processed').map(r => `<div class="card tight"><div class="small"><strong>Cancellation request</strong> from ${esc(r.requested_by)}, ${esc(fmtDT(r.requested_at))}${r.within_cooling_off ? ' (within cooling-off)' : ''}: ${r.outcome === 'cancelled' ? 'agreement cancelled' : 'continuing'} ${esc(fmtDT(r.processed_at))}.${r.reasons ? ' Reasons: ' + esc(r.reasons) + '.' : ''}${r.agent_notes ? ' Notes: ' + esc(r.agent_notes) : ''}</div></div>`).join('')}
      ${['signed', 'countersigned', 'ended'].includes(ag.status) ? `<div class="no-print">${lawyerForm('afwd', 'Forward the signed agreement to a lawyer', 'Yours or anyone\'s. They get a read-only link for 90 days, and you get a copy of the email.')}</div>` : ''}
      ${ag.cooling_off_until ? `<div class="card tight"><div class="facts"><div class="fact"><div class="k">All signed</div><div class="v">${esc(fmtDT(ag.signed_at))}</div></div><div class="fact"><div class="k">Cooling-off ends</div><div class="v">${esc(fmtDT(ag.cooling_off_until))}</div></div></div></div>` : ''}

      ${!['draft', 'sent', 'parked'].includes(ag.status) ? `<div class="card no-print"><h3>Your adjustments</h3><p class="small">The signed terms are fixed, but you can keep these current.</p>
        ${people.map(p => `<div class="row2 stack" data-pc="${p.id}"><div><label class="f" style="margin-top:0">${esc(p.legal_name || p.email)}: mobile</label><input type="tel" data-pcphone value="${esc(p.phone || '')}"></div><div><label class="f" style="margin-top:0">Goes by</label><input type="text" data-pcpref value="${esc(p.pref_name || '')}"></div></div>`).join('')}
        <label class="f">Private notes <span class="opt">(only you see these)</span></label><textarea id="agNotes">${esc(cfg.agent_notes || '')}</textarea>
        <div class="toolbar"><button class="btn primary" type="button" id="saveAdj">Save adjustments</button></div></div>` : ''}
      ${((cfg.import || {}).files || []).length ? `<h2>Documents you dropped in</h2><div class="card tight">${cfg.import.files.map((f, i) => `<div class="fact"><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${esc(f.name)}</span><button class="btn link no-print" type="button" data-impdoc="${i}">Open</button></div></div>`).join('')}${(cfg.import.flags || []).length ? `<p class="small" style="margin:10px 0 0"><strong>Raised from them:</strong> ${esc(cfg.import.flags.map(f => f.text).join(' '))}</p>` : ''}</div>` : ''}
      ${noticePanel(ag, people, pans)}
      ${varPanel(ag, people, avars, avsigs)}
      ${aforms.length || arc.length ? `<h2>After signing</h2><div class="card tight">${aforms.map(fm => `<div class="fact"><div class="k">${esc(FORM_LABEL[fm.kind])}</div><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${fm.status === 'signed' && fm.kind === 'vendor_declaration' && !fm.countersigned_at ? 'Vendors signed, to countersign' : fm.status === 'signed' ? 'Signed ' + esc(fmtDT(fm.countersigned_at || fm.signed_at)) : fm.status === 'ready' ? 'Ready to sign' : 'In progress'}</span><button class="btn link no-print" type="button" data-fopen="${fm.id}">Open</button></div></div>`).join('')}${arc.map(r => { const p = people.find(x => x.id === r.person_id); return `<div class="fact"><div class="k">Sale and purchase guide received</div><div class="v" style="font-weight:400">${esc(p ? p.legal_name : '')}, ${esc(fmtDT(r.received_at))} <span class="small">(version ${esc(r.version)})</span></div></div>`; }).join('')}</div>` : ''}
      <h2>People</h2>
      ${people.map(p => { const af = amls.find(x => x.person_id === p.id); return `<div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="min-width:0"><div style="font-weight:600">${esc(p.legal_name || '(name to come)')}${p.pref_name ? ` <span class="small">(${esc(p.pref_name)})</span>` : ''}</div><div class="small">${esc(p.email)} ${p.phone ? '· ' + esc(p.phone) : ''}</div>
        <span class="status ${p.signed_at ? 'done' : 'pending'}">${p.signed_at ? 'Signed ' + esc(fmtDT(p.signed_at)) : 'Not signed'}</span> <span class="status ${p.id_verified_at ? 'done' : 'pending'}">${p.id_verified_at ? 'ID verified' : af ? 'AML in progress' : 'AML not started'}</span></div>
        <button class="btn ghost no-print" type="button" data-aml="${p.id}">AML file</button></div>`; }).join('') || '<p class="small">No people yet.</p>'}

      <h2>Front page</h2>
      <div class="card"><table class="sum">
        <tr><td>Commission</td><td style="white-space:normal">${esc(commText(cfg))}</td></tr>
        <tr><td>Appraisal</td><td style="white-space:normal">${cfg.appr === 'pending' ? 'Not yet given: conditional' : 'Given, asking ' + money(num(cfg.ask))}</td></tr>
        <tr><td>Costs on signing</td><td style="white-space:normal">${[limAmt(cfg) ? 'LIM ' + money(limAmt(cfg)) : 'No LIM', adminAmt(cfg) ? 'admin fee ' + money(adminAmt(cfg)) : 'no admin fee'].join(', ')}</td></tr>
        <tr><td>Marketing</td><td style="white-space:normal">${an.mkt === 'later' || pkgOf(cfg).name === 'Later' ? 'To be agreed' : esc(pkgOf(cfg).label) + ' ' + money(pkgOf(cfg).amt)}${an.pay ? ' · Paying: ' + esc(an.pay) : ''}</td></tr>
        <tr><td>Legal advice</td><td style="white-space:normal">${esc((ag.legal || {}).choice === 'have' ? 'Received' : (ag.legal || {}).choice === 'waive' ? 'Went ahead without' : (ag.legal || {}).status === 'sent' ? 'With lawyer' : 'Not answered yet')}</td></tr>
        <tr><td>Listing came about</td><td>${cfg.approach === 'unsolicited' ? 'You approached them (unsolicited)' : 'They contacted you'}</td></tr>
      </table></div>

      ${cfg.campaign ? `<h2>Marketing campaign</h2><div class="card">${campaignHTML(cfg.campaign.snapshot || computeCampaign(cfg.campaign))}</div>` : ''}
      ${cfg.schedule && (cfg.schedule.phases || []).length ? `<h2>Campaign schedule</h2>${scheduleHTML(cfg.schedule)}` : ''}
      <h2>Property Description</h2>
      <div class="card"><table class="sum">
        <tr><td>Property</td><td style="white-space:normal">${esc(an.pBed || '?')} bed, ${esc(an.pBath || '?')} bath ${esc((an.pType || '').toLowerCase())}, ${esc(an.pFloor || '?')}m² on ${esc(an.pLand || '?')}m², built ${esc(an.pYear || '?')}</td></tr>
        <tr><td>Construction</td><td style="white-space:normal">${esc(an.pBuild || '')} · ${esc(an.pPark || '')} · ${esc(an.pHeat || '')}</td></tr>
        <tr><td>Buyers will love</td><td style="white-space:normal">${esc(an.pLove || '')}</td></tr>
        <tr><td>Chattels</td><td style="white-space:normal">${esc((an.chattels || []).join(', '))}${an.chatOther ? '. ' + esc(an.chatOther) : ''}</td></tr>
        <tr><td>Work done</td><td style="white-space:normal">${an.work === 'yes' ? esc(an.workDetail) : an.work === 'no' ? 'None known' : ''}</td></tr>
        <tr><td>Weathertightness</td><td style="white-space:normal">${an.wt === 'yes' ? esc(an.wtDetail) : an.wt === 'no' ? 'Not known' : ''}</td></tr>
        <tr><td>Methamphetamine</td><td style="white-space:normal">${an.meth === 'yes' ? esc(an.methDetail) : an.meth === 'no' ? 'Not known' : ''}</td></tr>
        <tr><td>Defects or notices</td><td style="white-space:normal">${an.def === 'yes' ? esc(an.defDetail) : an.def === 'no' ? 'Not known' : ''}</td></tr>
        <tr><td>Hazards</td><td style="white-space:normal">${esc((an.hazards || []).join(', '))}${an.hazOther ? '. ' + esc(an.hazOther) : ''}</td></tr>
        <tr><td>Visiting professionals</td><td style="white-space:normal">McGuire present at every visit; quotes ${an.vQuotes === false ? 'not allowed' : 'allowed'}; sales assessments ${an.vSales ? 'allowed' : 'not allowed'}; ${esc((an.vNotice || 'Same day is fine').toLowerCase())} notice${an.vNotes ? '; ' + esc(an.vNotes) : ''}</td></tr>
        <tr><td>Other agents</td><td style="white-space:normal">${an.prior === 'yes' ? 'YES: ' + esc(priorText(an)) : 'None'}</td></tr>
        <tr><td>Interested buyers</td><td style="white-space:normal">${(an.interested || []).length ? an.interested.map(b => `${esc(b.name)}${b.phone ? ', ' + esc(b.phone) : ''}${b.email ? ', ' + esc(b.email) : ''} <strong>${b.exclude ? '(excluded 10 working days)' : '(Tim to negotiate)'}</strong>`).join('<br>') : (an.excluded ? esc(an.excluded) : 'None')}</td></tr>
        <tr><td>Capacity and GST</td><td style="white-space:normal">${esc(an.capacity || '')}${an.entity ? ' for ' + esc(an.entity) : ''} · GST: ${esc(an.gst === 'yes' ? an.gstNo : 'No')}</td></tr>
      </table></div>

      ${sigs.length ? `<h2>Signatures</h2>${sigs.map(s => `<div class="card tight"><div style="font-weight:600">${esc(s.signer_name)} <span class="small">(${s.signer_role === 'agent' ? 'licensee' : 'client'})</span></div><div class="small">${esc(fmtDT(s.signed_at))} · fingerprint ${esc(s.snapshot_sha256.slice(0, 16))}…</div>${sigUrls[s.id] ? `<img class="sigimg" src="${sigUrls[s.id]}" alt="Signature of ${esc(s.signer_name)}">` : ''}</div>`).join('')}` : ''}

      ${lawyers.length ? `<h2>Lawyer links</h2>${lawyers.map(l => `<div class="card tight"><div style="font-weight:600">${esc(l.lawyer_name)}${l.firm ? ', ' + esc(l.firm) : ''}</div><div class="small">${esc(l.email)} · sent ${esc(fmtDT(l.sent_at))} · ${l.first_opened_at ? 'opened ' + esc(fmtDT(l.first_opened_at)) + ` (${l.open_count}×)` : 'not opened yet'}</div>
        <div class="small">${l.emailed_at ? 'Emailed ' + esc(fmtDT(l.emailed_at)) : `<strong style="color:var(--accent)">Not emailed${l.email_error ? ': ' + esc(l.email_error) : ''}</strong>`}</div>
        ${l.emailed_at ? '' : `<button class="btn ghost no-print" type="button" data-sendlaw="1" style="margin-top:8px">Send lawyer email now</button>`}</div>`).join('')}` : ''}
      ${['signed', 'countersigned'].includes(ag.status) ? `<h2>Signed copy</h2><div class="card tight"><div class="small">${ag.copy_sent_at ? 'Emailed to everyone ' + esc(fmtDT(ag.copy_sent_at)) : `<strong style="color:var(--accent)">Not emailed yet${ag.copy_error ? ': ' + esc(ag.copy_error) : ''}</strong>`}</div>${ag.copy_sent_at ? '' : '<button class="btn ghost no-print" type="button" id="sendCopy" style="margin-top:8px">Email signed copy now</button>'}</div>` : ''}
      ${emails.length ? `<h2>Emails</h2><div class="card tight">${emails.map(m => `<div class="fact"><div class="k">${esc(fmtDT(m.at))} · ${m.ok ? 'sent' : 'FAILED'}</div><div class="v" style="font-weight:400">${esc(m.subject)} <span class="small">to ${esc(m.recipients)}${m.error ? ' · ' + esc(m.error) : ''}</span></div></div>`).join('')}</div>` : ''}

      <h2>Record of events</h2>
      <div class="card tight">${events.map(e => `<div class="fact"><div class="k">${esc(fmtDT(e.at))} · ${esc(e.actor)}</div><div class="v" style="font-weight:400">${esc(e.kind.replace(/_/g, ' '))}${e.detail && Object.keys(e.detail).length ? ' <span class="small">' + esc(Object.values(e.detail).filter(x => typeof x !== 'object').join(', ')) + '</span>' : ''}</div></div>`).join('')}</div>
    </div>`;
    actions(false);
    $('#toList').addEventListener('click', viewAgentList);
    const tpb = $('#toProp'); if (tpb) tpb.addEventListener('click', () => viewProperty(ag.property_id));
    const cm = $('#copyMsg'); if (cm) cm.addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); toast('Copied'); } catch { toast('Select the text and copy it'); } });
    const ed = $('#editAg'); if (ed) ed.addEventListener('click', () => viewTable(id));
    const sa = $('#saveAdj'); if (sa) sa.addEventListener('click', async () => {
      for (const row of $$('[data-pc]')) await must(sb.from('agreement_people').update({ phone: $('[data-pcphone]', row).value.trim(), pref_name: $('[data-pcpref]', row).value.trim() }).eq('id', row.dataset.pc));
      await must(sb.from('agreements').update({ config: Object.assign({}, cfg, { agent_notes: $('#agNotes').value }) }).eq('id', id));
      await must(sb.from('agreement_events').insert({ agreement_id: id, actor: SESSION.user.email, kind: 'adjustments_saved', detail: { fields: 'contact details, private notes' } }));
      toast('Saved'); viewAgentDetail(id);
    });
    wireVarPanel(id); wireNoticePanel(id);
    $$('[data-fopen]').forEach(b => b.addEventListener('click', () => viewFormAgent(b.dataset.fopen)));
    $$('[data-impdoc]').forEach(b => b.addEventListener('click', async () => { const f = cfg.import.files[+b.dataset.impdoc]; const w = window.open('', '_blank'); const { data } = await sb.storage.from('private').createSignedUrl(f.path, 600); if (data && w) w.location.href = data.signedUrl; else if (w) w.close(); }));
    $('#printBtn').addEventListener('click', () => window.print());
    const pla = $('#plAns'); if (pla) pla.addEventListener('click', () => viewPrelistingAgent(cfg.prelisting_id));
    wirePdf(id); const cpb = $('#campPdf'); if (cpb) cpb.addEventListener('click', () => openPdf(id, 'campaign'));
    if ($('#afwd')) { const sender = async (n, fm, e) => { await must(sb.from('lawyer_links').insert({ agreement_id: id, lawyer_name: n, firm: fm, email: e, sent_by: 'Tim McGuire', expires_at: new Date(Date.now() + 90 * 864e5).toISOString() })); await must(sb.from('agreement_events').insert({ agreement_id: id, actor: SESSION.user.email, kind: 'forwarded_to_lawyer', detail: { lawyer: n, email: e } })); }; sender.agId = id; wireLawyerForm('afwd', sender); }
    const callNotify = async (type) => { const { data, error } = await sb.functions.invoke('notify', { body: { type, agreement_id: id } }); if (error || (data && data.ok === false)) toast('Email failed. See the Emails list below.'); else toast('Email sent'); viewAgentDetail(id); };
    $$('[data-sendlaw]').forEach(b => b.addEventListener('click', () => { b.disabled = true; callNotify('lawyer'); }));
    const sc = $('#sendCopy'); if (sc) sc.addEventListener('click', () => { sc.disabled = true; callNotify('signed'); });
    $$('[data-aml]').forEach(b => b.addEventListener('click', () => viewAml(id, b.dataset.aml)));
    const cb = $('#counterBtn');
    if (cb) cb.addEventListener('click', () => {
      $('#counterBox').innerHTML = `<div class="card"><h3>Countersign as licensee</h3><p class="small">Timothy McGuire REA#20117983 on behalf of McGuire Real Estate Limited.</p><div class="sig-wrap"><canvas id="sigA"></canvas><div class="sig-line"></div><span class="hint">Sign here</span></div>${saveNote('Save my signature and countersign')}<div class="toolbar"><button class="btn primary" type="button" id="doCounter">Save my signature and countersign</button></div><div class="err"></div></div>`;
      initPad('sigA');
      $('#doCounter').addEventListener('click', async () => {
        if (!padDrawn) { $('#counterBox .err').textContent = 'Please sign first.'; return; }
        const blob = await new Promise(res => $('#sigA').toBlob(res, 'image/png'));
        const path = `agreements/${id}/signatures/agent-${Date.now()}.png`;
        await must(sb.storage.from('private').upload(path, blob, { contentType: 'image/png' }));
        const snapshot = { agreement_version: ag.agreement_version, agreement_ref: ag.ref, config: cfg, answers: an, client_signatures: sigs.map(s => s.snapshot_sha256), countersigned_by: 'Timothy McGuire REA#20117983' };
        await must(sb.from('signatures').insert({ agreement_id: id, signer_role: 'agent', signer_name: 'Timothy McGuire', image_path: path, snapshot, snapshot_sha256: await sha256(JSON.stringify(snapshot)), user_agent: navigator.userAgent }));
        await must(sb.from('agreements').update({ status: 'countersigned', countersigned_at: new Date().toISOString() }).eq('id', id));
        await must(sb.from('agreement_events').insert({ agreement_id: id, actor: SESSION.user.email, kind: 'countersigned', detail: {} }));
        await sigSaved($('#sigA'), 'Countersigned', 'Your signature is saved');
        toast('Countersigned'); viewAgentDetail(id);
      });
    });
    $$('[data-crdo]').forEach(b => b.addEventListener('click', async () => {
      const rid = b.dataset.crid, notes = ($(`[data-crnotes="${rid}"]`) || {}).value || '';
      if (!notes.trim()) { $(`[data-cr="${rid}"] .err`).textContent = 'Add a note about the conversation first.'; return; }
      b.disabled = true;
      await must(sb.rpc('agent_process_cancellation', { rid, p_outcome: b.dataset.crdo, p_notes: notes.trim() }));
      const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'cancel_processed', agreement_id: id, request_id: rid } }); if (fe) console.warn('cancel email', fe);
      toast(b.dataset.crdo === 'cancelled' ? 'Agreement cancelled' : 'Recorded'); viewAgentDetail(id);
    }));
    const eb = $('#endBtn');
    if (eb) eb.addEventListener('click', () => {
      $('#endBox').innerHTML = `<div class="card warnc"><h3>End this agency</h3><p class="small">Use this when the property has settled, been withdrawn, or the agreement was cancelled. AML records will then be kept for 5 years from today.</p><select id="endReason"><option>Sold and settled</option><option>Withdrawn</option><option>Cancelled by vendor</option><option>Cancelled during cooling-off</option><option>Cancelled by agent</option></select><div class="toolbar"><button class="btn primary" type="button" id="doEnd">End agency</button></div></div>`;
      $('#doEnd').addEventListener('click', async () => { await must(sb.rpc('agent_end_agency', { a: id, reason: $('#endReason').value })); toast('Agency ended'); viewAgentDetail(id); });
    });
    top();
    if (focus) { const t = $('#' + focus); if (t) t.scrollIntoView({ block: 'start' }); }   // a reminder lands on the part it is about
  }

  /* ═════════ AFTER SIGNING: Vendor Declaration, Healthy Homes, Before you sell ═════════ */
  // Tim's Word forms, carried over word for word (NZ English, no em dashes). fn/pdf.ts holds the same text, keyed
  // by form_version, and prints the PDF from the stored answers with it (a test keeps the two the same). Change
  // both, with a new form_version, if the wording changes. In VD_SECTIONS, why: details needed when the answer
  // is Yes. text: a description rather than Yes / No / Unknown. from: filled from the property file.
  const FORM_TEXT = {
    VD_LEAD: 'This form provides information for prospective purchasers, based on the Vendor\'s own knowledge of the property.',
    VD_INTRO: [
    'These details are correct as at the date of the Vendor\'s signature(s) below. Any known changes and/or subsequent information becoming known will be advised in writing. These changes may be made and noted by the Licensee, who has also signed below.',
    'Where any work requiring Code Compliance has had Certificate(s) correctly issued and signed off, and they are available to the Agent or prospective purchaser to view, they will be attached to this document (or are known to appear in the LIM). If those certificates are not available, we strongly recommend your further investigation.',
    'Please note that the Vendor may not disclose all property defects. It is incumbent on the purchaser to make enquiries or seek professional assistance to satisfy themselves as to the condition of the property.',
    'The information collected in this form is held by McGuire Real Estate Limited for the purpose of this sale and is disclosed to prospective purchasers and their professional advisers as part of the marketing and sale of the property.',
  ],
    VD_SECTIONS: [
    ['Property Condition and Known Issues', [
      { k: 'pegs', q: 'Can the Vendor identify the location of ALL boundary pegs?' },
      { k: 'unpaid', why: 1, q: 'Is there any item on or about the property that is not fully paid for and/or will not be cleared on settlement? (e.g. renovations, outbuildings, insulation; include anything that may be added to rates)' },
      { k: 'history', why: 1, q: 'Is there anything in the property\'s history or recent past that would be of interest or concern to a purchaser? (e.g. death on the property, nearby developments)' },
      { k: 'meth', why: 1, from: 'meth', q: 'Is the Vendor aware of any known or suspected methamphetamine contamination, or has the property been tested?' },
      { k: 'chattels', why: 1, q: 'Are there any chattels not working? (Check with tenants if rented and unsure)' },
      { k: 'repairs', why: 1, q: 'Are there any repairs and/or maintenance the Vendor intends to complete after listing and before settlement?' },
      { k: 'faults', text: 1, from: 'def', q: 'Describe any known or suspected faults or issues on or about the property, including any indication of subsidence or water damage.' },
      { k: 'era', from: 'year', q: 'Was any part of the building or additions constructed in the 1995 to 2004 period? (noted for potential weathertightness issues)' },
      { k: 'wt', why: 1, from: 'wt', q: 'Is the Vendor aware of any weathertightness issues (water leaks, past or present, damage)?' },
      { k: 'dux', why: 1, q: 'Is the Vendor aware of any Dux Qest plumbing, Weatherside cladding, or Monolithic cladding?' },
      { k: 'asbestos', why: 1, q: 'Is the Vendor aware, or does the Vendor suspect, the presence of asbestos-containing materials anywhere on the property?' },
      { k: 'pipes', why: 1, q: 'Has there been any evidence or experience of blocked or troublesome underground pipes?' },
      { k: 'reno', text: 1, from: 'work', q: 'Describe any renovation work done, regardless of whether it required Permits, Consents, or Code Compliance Certificates (e.g. shower alterations).' },
      { k: 'consents', q: 'To your knowledge, have Permits / Consents / Certificates required for any part of the property been issued and signed off by the Local Authority where required by law?' },
      { k: 'lim', why: 1, q: 'Has a LIM been obtained for this property? If so, when, and is it available for review?' },
      { k: 'claims', why: 1, q: 'Has the property been the subject of any insurance claim (e.g. weathertightness, fire, flood, subsidence, or other)?' },
      { k: 'reports', why: 1, q: 'Has any previous prospective purchaser\'s investigation (including any report from an inspector, valuer, or other professional) identified an issue with the property? If so, has a copy of that report been provided to the Agent?' },
      { k: 'hazard', why: 1, from: 'haz', q: 'Is the Vendor aware of any safety hazard at the property that a visitor or attending professional should be made aware of (e.g. uneven surfaces, animals on site, pool or spa, loose fittings, steep or restricted access)?' },
    ]],
    ['Services and Features', [
      { k: 'water', q: 'Is the property on town water supply?' },
      { k: 'sewer', q: 'Is the property on town sewerage?' },
      { k: 'storm', q: 'Is the property on town stormwater?' },
      { k: 'power', q: 'Is the property on the national electrical network?' },
      { k: 'internet', text: 1, q: 'Describe the connection to internet at the property:' },
      { k: 'insulation', text: 1, from: 'heat', q: 'Where is insulation present in the primary dwelling?' },
      { k: 'glazing', text: 1, q: 'Describe the glazing present:' },
    ]],
    ['Registrations and Fire Appliances', [
      { k: 'hai', why: 1, q: 'Is the property registered with the Territorial Authority as a home and income (e.g. a registered B&B)? If \'Yes\', does a Code Compliance Certificate exist?' },
      { k: 'burner', why: 1, q: 'Is there a wood burner or similar fire appliance? If \'Yes\', does it have a Code Compliance Certificate, and is that certificate available?' },
    ]],
  ],
    VD_STATEMENT: [
    'We hereby declare that any information about any issue concerning any aspect of the property and its neighbourhood arising at any time that is known to us, and that may be of concern or interest to a purchaser, has been noted above, or if discovered subsequently, will be immediately advised in writing to the Agent (Tim McGuire, McGuire Real Estate Limited).',
    'We declare that:',
    'i. We have not given consents for proposed work to any neighbour; and',
    'ii. We do not know of any council requisitions affecting this property; and',
    'iii. We have not withheld any known material information about the property; and',
    'iv. There is no debt owing on any part of the property that will not be cleared on settlement date; and',
    'v. We are not aware of any defects above or below ground that would affect its weathertightness, durability, or habitability; and',
    'vi. We will promptly notify the Agent in writing of any change to the information provided in this declaration, including any report or notice received from a prospective purchaser or their professional adviser during the marketing of the property; and',
    'vii. We have provided the Agent with all information known to us relevant to the property\'s current Health and Safety Notice.',
  ],
    HH_INTRO: 'Vendor site assessment: mark each item, add notes for any non-compliant areas. All private rentals must meet the healthy homes standards (from 1 July 2025). Penalties up to $7,200 per breach.',
    HH_CHECK: [
    ['Heating', [['heat1', 'Fixed heater in main living room (heat pump, wood burner, or electric) capable of 18°C'], ['heat2', 'Heater capacity confirmed via Tenancy Services Heating Assessment Tool (see page 2)'], ['heat3', 'Heater in good working order and maintained']]],
    ['Insulation', [['ins1', 'Ceiling insulation meets regional R-value (R2.9 North Island / R3.3 South Island & Central North Island)'], ['ins2', 'Existing ceiling insulation ≥120mm thick and in reasonable condition (if pre-2008 Code)'], ['ins3', 'Underfloor insulation ≥R1.3 nationwide'], ['ins4', 'Installed per NZS 4246:2016; code compliance certificate/CoA on file if applicable']]],
    ['Ventilation', [['ven1', 'Openable windows in living room, dining room, kitchen, and bedrooms'], ['ven2', 'Kitchen extractor/rangehood ≥150mm diameter or 50 L/s (if installed post 1 Jul 2019)'], ['ven3', 'Bathroom extractor fan ≥120mm diameter or 25 L/s (if installed post 1 Jul 2019)'], ['ven4', 'Continuous mechanical ventilation (if used, approved post 1 Nov 2019) exhausts to outdoors']]],
    ['Moisture & Drainage', [['moi1', 'Gutters, downpipes, and drains in good condition and free of blockages'], ['moi2', 'Ground moisture barrier installed in enclosed subfloor (or exemption confirmed)'], ['moi3', 'No visible signs of moisture ingress (leaks, damp spots)']]],
    ['Draught Stopping', [['dra1', 'Unused fireplaces/chimneys sealed'], ['dra2', 'Gaps or holes larger than a $2 coin sealed (walls, ceilings, windows, floors, doors)'], ['dra3', 'Draught-stopping measures (weather stripping, door sweeps) in place and effective']]],
    ['Documentation', [['doc1', 'Healthy Homes Compliance Statement completed (see page 3)'], ['doc2', 'Supporting records/certificates/invoices on file'], ['doc3', 'Professional assessment completed, if applicable ($300 to $500)']]],
  ],
    HH_WS_INTRO: 'Record these measurements on site. Required heating capacity must then be calculated using the official Tenancy Services Heating Assessment Tool (tenancy.govt.nz/heating-tool) or the Schedule 2 formula in the Residential Tenancies (Healthy Homes Standards) Regulations 2019. Do not estimate: compliance is measured against the tool/formula result, not a guess.',
    HH_WS: [['dims', 'Main living room: length (m) × width (m) × stud height (m)'], ['area', 'Main living room floor area (m²)'], ['glaz', 'Total window/glazing area in main living room (m²)'], ['gtype', 'Glazing type: single or double glazed'], ['ceil', 'Ceiling insulation R-value (or thickness if R-value unknown)'], ['under', 'Underfloor insulation R-value (write N/A if slab-on-ground)'], ['wall', 'Wall insulation R-value, if known'], ['ta', 'Territorial authority / region the property is in (sets climate zone)'], ['heater', 'Existing fixed heater(s): type and rated capacity (kW)'], ['exempt', 'Modern dwelling / relevant apartment exemption applies? (reg 3)', 'yn']],
    HH_ST_INTRO: 'Use this page to record findings for the landlord\'s official Healthy Homes Compliance Statement (tenancy.govt.nz/healthy-homes/compliance-statement). This is a data-capture summary for the vendor/landlord; it is not a substitute for the legal statement, which the landlord must complete, sign, and attach to the tenancy agreement.',
    HH_ST: [
    ['Heating', [['h1', 'Required heating capacity (kW), from page 2'], ['h2', 'Installed qualifying heater(s): type & capacity (kW)'], ['h3', 'Tolerance / top-up allowance applies? (Y/N + details)'], ['h4', 'Modern dwelling / relevant apartment exemption? (Y/N)']]],
    ['Insulation: Ceiling', [['c1', 'R-value when installed (or thickness if unknown)'], ['c2', 'Date installed / date last inspected'], ['c3', 'Type of insulation (segments, loose-fill, blanket, etc.)'], ['c4', 'Condition reasonable: no mould, damage, gaps? (Y/N)'], ['c5', 'Any exempt areas & reason (not reasonably practicable)']]],
    ['Insulation: Underfloor', [['u1', 'R-value when installed'], ['u2', 'Date installed / date last inspected'], ['u3', 'Type of insulation'], ['u4', 'Condition reasonable? (Y/N)'], ['u5', 'Partial exemption for pre-existing compliant insulation? (Y/N)']]],
    ['Insulation: Wall', [['w1', 'Wall insulation present? Type/condition if known (not compulsory)']]],
    ['Ventilation', [['v1', 'Openable windows in all habitable rooms? (Y/N, list exceptions)'], ['v2', 'Kitchen extractor fan: diameter/capacity & install date'], ['v3', 'Bathroom extractor fan: diameter/capacity & install date'], ['v4', 'Continuous mechanical ventilation? (Y/N + exhaust capacity L/s)']]],
    ['Moisture & Drainage', [['m1', 'Gutters/downpipes drain efficiently to appropriate outfall? (Y/N)'], ['m2', 'Enclosed subfloor present? (Y/N)'], ['m3', 'Ground moisture barrier installed if enclosed subfloor? (Y/N + reason if not)']]],
    ['Draught Stopping', [['d1', 'Open fireplaces present? (Y/N + blocked off or written tenant agreement)'], ['d2', 'Free from unreasonable gaps/draughts? (Y/N + explanation if not)']]],
  ],
  };
  const { VD_LEAD, VD_INTRO, VD_SECTIONS, VD_STATEMENT, HH_INTRO, HH_CHECK, HH_WS_INTRO, HH_WS, HH_ST_INTRO, HH_ST } = FORM_TEXT;
  const YNU = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']];
  const ynuText = a => (YNU.find(x => x[0] === a) || ['', ''])[1];
  const VD_QS = VD_SECTIONS.flatMap(s => s[1]);

  const YNNA = ['Y', 'N', 'N/A'];
  const FORM_LABEL = { vendor_declaration: 'Vendor Declaration', healthy_homes: 'Healthy Homes checklist and statement' };

  // what the property file already knows, offered for confirmation and used to fill matching questions
  function vdFromFile(prop, an) {
    const d = Object.assign({}, an || {}, (prop || {}).description || {}, (prop || {}).disclosures || {});
    const yn = (k, det) => d[k] === 'yes' ? { a: 'yes', d: d[det] || '' } : d[k] === 'no' ? { a: 'no', d: '' } : null;
    const yr = parseInt(d.pYear, 10);
    const haz = (d.hazards || []).join(', ') + (d.hazOther ? ((d.hazards || []).length ? '. ' : '') + d.hazOther : '');
    return {
      fill: {
        meth: yn('meth', 'methDetail'), wt: yn('wt', 'wtDetail'),
        faults: d.def === 'yes' ? { d: d.defDetail || '' } : d.def === 'no' ? { d: 'None known' } : null,
        reno: d.work === 'yes' ? { d: d.workDetail || '' } : d.work === 'no' ? { d: 'None known' } : null,
        era: yr >= 1995 && yr <= 2004 ? { a: 'yes', d: `Built about ${yr}` } : null,
        hazard: haz ? { a: 'yes', d: haz } : null,
        insulation: d.pHeat ? { d: d.pHeat } : null,
      },
      facts: [['Type', d.pType], ['Year built', d.pYear], ['Bedrooms / bathrooms', d.pBed || d.pBath ? `${d.pBed || '?'} / ${d.pBath || '?'}` : ''], ['Floor / land area', d.pFloor || d.pLand ? `${d.pFloor || '?'} m² / ${d.pLand || '?'} m²` : ''], ['Construction', d.pBuild], ['Parking', d.pPark], ['Heating and insulation', d.pHeat],
        ['Chattels included', (d.chattels || []).join(', ') + (d.chatOther ? '. ' + d.chatOther : '')],
        ['Work done and consents', d.work === 'yes' ? d.workDetail : d.work === 'no' ? 'None known' : ''], ['Weathertightness', d.wt === 'yes' ? d.wtDetail : d.wt === 'no' ? 'No issues known' : ''],
        ['Methamphetamine', d.meth === 'yes' ? d.methDetail : d.meth === 'no' ? 'None known' : ''], ['Defects, notices or requisitions', d.def === 'yes' ? d.defDetail : d.def === 'no' ? 'None known' : ''], ['Hazards for visitors', haz]].filter(x => x[1]),
    };
  }
  function vdDoc(data, address, names, when) {
    const ans = data.answers || {};
    return {
      title: 'Vendor Declaration',
      head: [['Client / Vendor(s):', names], ['Property Address:', address], ['Date:', fmtDate(when)]],
      pages: [{
        title: 'Vendor Declaration', sub: address, intro: [VD_LEAD].concat(VD_INTRO),
        sections: [{ title: 'From the property file', rows: (data.facts || []).map(([k, v]) => [k, v, '']).concat([['The Vendor confirmed these details', data.fileOk ? 'Still correct' : 'Something has changed', data.fileOk ? '' : data.fileChanges || '']]) }]
          .concat(VD_SECTIONS.map(([t, qs]) => ({ title: t, rows: qs.map(x => { const v = ans[x.k] || {}; return [x.q, x.text ? '' : ynuText(v.a), v.d || '']; }) })))
          .concat([{ title: 'Additional Notes', rows: [['Additional Notes:', '', data.notes || 'None']] }]),
        after: ['Vendor Statement'].concat(VD_STATEMENT),
      }],
      sign_title: 'Signed by',
    };
  }
  function hhDoc(ad, address, names) {
    ad = ad || {}; const c = ad.c || {}, ws = ad.ws || {}, res = ad.res || {}, st = ad.st || {};
    return {
      title: 'Healthy Homes Compliance Checklist and Statement',
      head: [['Property address:', address], ['Landlord name(s):', names]],
      pages: [
        { title: 'Healthy Homes Compliance Checklist', sub: 'Page 1', intro: [HH_INTRO], sections: HH_CHECK.map(([t, items]) => ({ title: t, rows: items.map(([k, q]) => [q, (c[k] || {}).a ? 'Compliant: ' + c[k].a : '', (c[k] || {}).n || '']) })).concat([{ title: 'Assessment', rows: [['Assessed by:', ad.assessedBy || '', ''], ['Date:', ad.assessedOn ? fmtDate(ad.assessedOn + 'T12:00:00') : '', ''], ['Property address:', address, '']] }]) },
        { title: 'Heating Assessment Worksheet', sub: 'Page 2', intro: [HH_WS_INTRO], sections: [{ title: 'On-site measurement / input', rows: HH_WS.map(([k, q]) => [q, ws[k] || '', '']) }, { title: 'Result (from official tool/formula)', rows: [['Heating capacity (kW)', res.req ? 'Required: ' + res.req : '', res.inst ? 'Installed: ' + res.inst : ''], ['Tolerance / top-up allowance applies?', res.tol || '', ''], ['Compliant', res.comp || '', '']] }], after: ['Tool link: tenancy.govt.nz/heating-tool'] },
        { title: 'Compliance Statement: Data Capture', sub: 'Page 3', intro: [HH_ST_INTRO], sections: HH_ST.map(([t, items]) => ({ title: t, rows: items.map(([k, q]) => [q, st[k] || '', '']) })) },
      ],
      sign_title: 'Landlord name(s)',
    };
  }
  // the same document on screen, as tiles
  function docHTML(doc) {
    return `${(doc.head || []).length ? `<div class="card tight"><div class="facts">${doc.head.map(([k, v]) => `<div class="fact"><div class="k">${esc(k.replace(/:$/, ''))}</div><div class="v">${esc(v || '')}</div></div>`).join('')}</div></div>` : ''}
      ${doc.pages.map(pg => `<h2>${esc(pg.title)}${pg.sub && /^Page/.test(pg.sub) ? ` <span class="opt small">${esc(pg.sub)}</span>` : ''}</h2>${(pg.intro || []).map(t => `<p class="small">${esc(t)}</p>`).join('')}
        ${(pg.sections || []).map(s => `<div class="card tight"><h3>${esc(s.title)}</h3>${s.rows.map(r => `<div class="fact"><div class="k">${esc(r[0])}</div><div class="v" style="font-weight:400">${esc([r[1], r[2]].filter(Boolean).join('. ') || 'Not answered')}</div></div>`).join('')}</div>`).join('')}
        ${(pg.after || []).map((t, i) => i === 0 && t === 'Vendor Statement' ? `<h2>${esc(t)}</h2>` : `<p class="small">${esc(t)}</p>`).join('')}`).join('')}`;
  }
  const signersOf = people => people.filter(p => p.legal_name && p.signed_at);

  /* vendor: the paperwork tiles on the "all done" page */
  let FORMS = [], FSIGS = [], RECEIPTS = [];
  async function loadForms() {
    FORMS = []; FSIGS = []; RECEIPTS = [];
    if (!A || !['signed', 'countersigned'].includes(A.status)) return;
    try { const { data, error } = await sb.from('property_forms').select('*').eq('agreement_id', A.id); if (!error) FORMS = data || []; } catch (_) { }
    try { const { data, error } = await sb.from('form_signatures').select('*').eq('agreement_id', A.id); if (!error) FSIGS = data || []; } catch (_) { }
    try { const { data, error } = await sb.from('guide_receipts').select('*').eq('agreement_id', A.id); if (!error) RECEIPTS = data || []; } catch (_) { }
    // the sale and purchase guide received before signing the agreement, recorded in what they signed
    try { const { data, error } = await sb.from('signatures').select('person_id,signed_at,snapshot').eq('agreement_id', A.id).eq('signer_role', 'client');
      if (!error) (data || []).forEach(s => ((s.snapshot || {}).rea_guides || []).filter(x => x.guide === 'sale_purchase').forEach(x => RECEIPTS.push({ person_id: s.person_id, guide: 'sale_purchase', version: x.version, received_at: x.acknowledged_at || s.signed_at, before_signing: true }))); } catch (_) { }
  }
  const formOf = k => FORMS.find(x => x.kind === k) || null;
  const iSigned = fm => !!(ME && FSIGS.some(s => s.form_id === fm.id && s.person_id === ME.id));
  function paperworkHTML() {
    if (!A || !['signed', 'countersigned'].includes(A.status) || !ME) return '';
    const vd = formOf('vendor_declaration'), hh = formOf('healthy_homes'), sp = GUIDES.sale_purchase;
    const myRc = sp && RECEIPTS.find(r => r.person_id === ME.id && r.guide === 'sale_purchase' && r.version === sp.version);
    const others = fm => signersOf(P).filter(p => !FSIGS.some(s => s.form_id === fm.id && s.person_id === p.id)).map(p => callName(p) || p.legal_name);
    const tile = (title, body, btn) => `<div class="card ptile"><h3>${title}</h3>${body}${btn ? `<div class="toolbar">${btn}</div>` : ''}</div>`;
    const vdTile = !vd ? tile('Vendor Declaration', '<p class="small">What buyers should know about the property, from what you know. We\'ve filled in what your agreement already says, so it\'s mostly checking. About 10 minutes.</p>', '<button class="btn primary" type="button" data-form="vendor_declaration">Start</button>')
      : vd.status === 'signed' ? tile('Vendor Declaration', `<span class="status done">Signed by ${signersOf(P).length > 1 ? 'all of you' : 'you'} ${esc(fmtDate(vd.signed_at))}</span><p class="small" style="margin:8px 0 0">${vd.countersigned_at ? 'Tim has signed it too, as licensee, and filed it with your property.' : 'Tim signs it next, as licensee, and files it with your property.'}</p>`)
      : iSigned(vd) ? tile('Vendor Declaration', `<span class="status pending">You've signed. Waiting on ${esc(joinNames(others(vd)))}</span>`)
      : FSIGS.some(s => s.form_id === vd.id) ? tile('Vendor Declaration', `<span class="status pending">Ready for your signature</span>`, `<button class="btn primary" type="button" data-form="vendor_declaration">Check and sign</button>`)
      : tile('Vendor Declaration', `<span class="status pending">Started</span>`, '<button class="btn primary" type="button" data-form="vendor_declaration">Carry on</button>');
    const hhTile = !hh ? '' : hh.status === 'signed' ? tile('Healthy Homes', `<span class="status done">Signed ${esc(fmtDate(hh.signed_at))}</span>`)
      : hh.status === 'draft' ? tile('Healthy Homes', '<p class="small" style="margin:0">Tim will take the measurements on site and fill in the checklist. Once he has, you\'ll sign it here as landlord.</p>')
      : iSigned(hh) ? tile('Healthy Homes', `<span class="status pending">You've signed. Waiting on ${esc(joinNames(others(hh)))}</span>`)
      : tile('Healthy Homes', '<span class="status pending">Tim has filled in the checklist. Please check it and sign as landlord.</span>', '<button class="btn primary" type="button" data-form="healthy_homes">Check and sign</button>');
    const spTile = !sp ? '' : myRc ? tile('Before you sell', `<span class="status done">Guide received ${esc(fmtDate(myRc.received_at))}${myRc.before_signing ? ', before you signed' : ''}</span><p class="small" style="margin:8px 0 0">${esc(sp.title)}, version ${esc(sp.version)}. <a href="${esc(sp.url)}" target="_blank" rel="noopener">Read it again</a></p>`)
      : tile('Before you sell', `<p class="small">Before anyone makes an offer, please read the Real Estate Authority's guide to sale and purchase agreements. It explains the agreement a buyer will sign.</p>`, '<button class="btn primary" type="button" id="spOpen">Read the guide</button>');
    return `<h2>Paperwork still to do</h2><div class="ptiles">${spTile}${vdTile}${hhTile}</div>`;
  }
  function wirePaperwork() {
    $$('[data-form]').forEach(b => b.addEventListener('click', () => viewVendorForm(b.dataset.form)));
    const sp = $('#spOpen'); if (sp) sp.addEventListener('click', viewBeforeYouSell);
  }

  /* vendor: "Before you sell", the REA sale and purchase guide with its own dated receipt */
  // the Authority's own translations, offered beside the English guide; the one you tick for is the English
  function reaLinksHTML(g) {
    if (!(g.translations || []).length) return '';
    const key = Object.keys(GUIDES).find(k => GUIDES[k] === g); if (!key) return '';
    setTimeout(reaFill, 0);   // once the page is on screen, check which files exist and list them
    return `<div class="rea-tr" data-rea-guide="${key}"></div>`;
  }
  function guideViewer(g) {
    // phones don't show a PDF inside a page, so the main action is opening it; wider screens also show it here
    return `<div class="guide-inline"><a class="btn primary guide-open" href="${esc(g.url)}" target="_blank" rel="noopener">Read the guide</a>${matchMedia('(min-width: 701px)').matches ? `<iframe src="${esc(g.url)}" title="${esc(g.title)}" loading="lazy"></iframe>` : ''}<p class="small" style="margin:6px 0 0">${esc(g.title)}, version ${esc(g.version)}. It opens in a new tab; come back here when you've read it.</p>${reaLinksHTML(g)}</div>`;
  }
  function viewBeforeYouSell() {
    const g = GUIDES.sale_purchase; if (!g) return showStep(LAST);
    header('Before you sell', '', 100);
    main().innerHTML = `<section class="screen active">
      <h1>Before you sell</h1>
      <p class="lede">When a buyer makes an offer, you'll both sign a sale and purchase agreement. The Real Estate Authority's guide explains what's in it. Please read it now, so nothing is new to you when an offer comes in.</p>
      ${guideViewer(g)}
      <div class="card tight"><label class="choice cb" style="margin:0"><input type="checkbox" id="spOk"><span class="mark"></span><span><span class="ct">I've received the Real Estate Authority guide to sale and purchase agreements</span><span class="cd">This is recorded with today's date</span></span></label></div>
      <div class="err"></div></section>`;
    actions(true, 'Not now', 'Confirm I\'ve received it');
    onBack = () => showStep(LAST);
    onNext = async () => {
      if (!$('#spOk').checked) return err('Tick the box once you\'ve received the guide.');
      await must(sb.rpc('vendor_guide_receipt', { a: A.id, p_guide: 'sale_purchase', p_version: g.version, p_file: g.file, p_sha256: g.sha256 || null, p_user_agent: navigator.userAgent }));
      await loadForms(); toast('Thanks. Your receipt is recorded.'); showStep(LAST);
    };
    top();
  }

  /* vendor: the Vendor Declaration (four short steps), or check and sign a form someone has started */
  let VF = null;
  async function viewVendorForm(kind) {
    let fm = formOf(kind);
    if (!fm) { const id = await must(sb.rpc('vendor_form_start', { a: A.id, p_kind: kind })); await loadForms(); fm = FORMS.find(x => x.id === id); }
    if (!fm) return showStep(LAST);
    let prop = null; if (A.property_id) { try { const { data } = await sb.from('properties').select('*').eq('id', A.property_id).single(); prop = data; } catch (_) { } }
    const W = JSON.parse(JSON.stringify(fm.data || {})); W.answers ||= {}; W.pre ||= {};
    const ff = vdFromFile(prop, A.answers);
    if (!W.facts) { W.facts = ff.facts; Object.entries(ff.fill).forEach(([k, v]) => { if (v && !W.answers[k]) { W.answers[k] = v; W.pre[k] = true; } }); }
    const locked = FSIGS.some(s => s.form_id === fm.id) || fm.kind === 'healthy_homes';
    VF = { fm, W, locked };
    vfStep(locked ? 3 : Math.min(+(W._step || 0), 3));
  }
  const VF_STEPS = ['Your property file', 'Condition and known issues', 'Services, registrations and tenancy', 'Statement and signing'];
  const ynuRow = (x, v, pre) => `<div class="card tight vdq" data-q="${x.k}"><h3 style="font-size:16px">${esc(x.q)}</h3>${pre ? '<span class="src-badge">From your property file. Please check</span>' : ''}
    ${x.text ? '' : `<div class="choices three">${YNU.map(([val, l]) => `<label class="choice"><input type="radio" name="vq_${x.k}" value="${val}" ${v.a === val ? 'checked' : ''}><span class="mark"></span><span class="ct">${l}</span></label>`).join('')}</div>`}
    <label class="f" for="vqd_${x.k}">${x.text ? 'Your answer' : 'Details'} ${x.text ? '' : '<span class="opt">(' + (x.why ? 'needed if Yes' : 'optional') + ')</span>'}</label><textarea id="vqd_${x.k}" data-qd="${x.k}">${esc(v.d || '')}</textarea></div>`;
  function vfRead() {
    const W = VF.W;
    $$('.vdq').forEach(c => { const k = c.dataset.q, r = $(`input[name="vq_${k}"]:checked`, c), d = $('[data-qd]', c).value.trim(); W.answers[k] = Object.assign({}, W.answers[k], r ? { a: r.value } : {}, { d }); });
    const fo = $('input[name="vfFile"]:checked'); if (fo) W.fileOk = fo.value === 'ok';
    if ($('#vfChanges')) W.fileChanges = $('#vfChanges').value.trim();
    if ($('#vfNotes')) W.notes = $('#vfNotes').value.trim();
    const tn = $('input[name="vfTen"]:checked'); if (tn) W.tenanted = tn.value;
    const hh = $('input[name="vfHH"]:checked'); if (hh) W.hh = hh.value;
  }
  function vfCheck(i) {
    const W = VF.W;
    if (i === 0) { if (W.fileOk === undefined) return 'Let us know if these details are still correct.'; if (!W.fileOk && !W.fileChanges) return 'Tell us what has changed.'; }
    const qs = i === 1 ? VD_SECTIONS[0][1] : i === 2 ? VD_SECTIONS[1][1].concat(VD_SECTIONS[2][1]) : [];
    for (const x of qs) { const v = W.answers[x.k] || {}; if (x.text ? !v.d : !v.a) return 'Please answer each question. Choose Unknown if you\'re not sure.'; if (x.why && v.a === 'yes' && !v.d) return 'Add a few details for anything you answered Yes to.'; }
    if (i === 2) { if (!W.tenanted) return 'Let us know whether the property is tenanted.'; if (W.tenanted !== 'no' && !W.hh) return 'Let us know about the Healthy Homes checklist.'; }
    return '';
  }
  function vfStep(i) {
    const { fm, W, locked } = VF, isHH = fm.kind === 'healthy_homes';
    const names = signersOf(P).map(p => p.legal_name).join(' and ');
    header(FORM_LABEL[fm.kind], locked ? '' : `Step ${i + 1} of 4`, locked ? 100 : (i + 1) / 4 * 100);
    let h = '';
    if (i === 0) h = `<h1>Vendor Declaration</h1><p class="lede">${esc(VD_LEAD)} Your agreement already tells us a lot, so you'll mostly be checking. Your answers save as you go.</p>
      ${VD_INTRO.map(t => `<p class="small">${esc(t)}</p>`).join('')}
      <h2>What your property file says</h2>
      <div class="card tight">${(W.facts || []).length ? W.facts.map(([k, v]) => `<div class="fact"><div class="k">${esc(k)}</div><div class="v" style="font-weight:400">${esc(v)}</div></div>`).join('') : '<p class="small" style="margin:0">Nothing recorded yet.</p>'}</div>
      <div class="choices"><label class="choice"><input type="radio" name="vfFile" value="ok" ${W.fileOk === true ? 'checked' : ''}><span class="mark"></span><span class="ct">These are still correct</span></label><label class="choice"><input type="radio" name="vfFile" value="changed" ${W.fileOk === false ? 'checked' : ''}><span class="mark"></span><span class="ct">Something has changed</span></label></div>
      <div id="vfChWrap" ${W.fileOk === false ? '' : 'hidden'}><label class="f" for="vfChanges">What has changed?</label><textarea id="vfChanges">${esc(W.fileChanges || '')}</textarea></div>`;
    if (i === 1) h = `<h1>${esc(VD_SECTIONS[0][0])}</h1><p class="lede">Answer from your own knowledge. If you're not sure, choose Unknown.</p>${VD_SECTIONS[0][1].map(x => ynuRow(x, W.answers[x.k] || {}, W.pre[x.k])).join('')}`;
    if (i === 2) h = `<h1>${esc(VD_SECTIONS[1][0])}</h1>${VD_SECTIONS[1][1].map(x => ynuRow(x, W.answers[x.k] || {}, W.pre[x.k])).join('')}
      <h2>${esc(VD_SECTIONS[2][0])}</h2>${VD_SECTIONS[2][1].map(x => ynuRow(x, W.answers[x.k] || {}, W.pre[x.k])).join('')}
      <label class="f" for="vfNotes">Additional Notes: <span class="opt">(optional)</span></label><textarea id="vfNotes">${esc(W.notes || '')}</textarea>
      <h2>Tenants</h2><p class="small">Is the property tenanted, or will it be before settlement?</p>
      <div class="choices">${[['now', 'Yes, it\'s tenanted now'], ['will', 'It will be tenanted'], ['no', 'No']].map(([v, l]) => `<label class="choice"><input type="radio" name="vfTen" value="${v}" ${W.tenanted === v ? 'checked' : ''}><span class="mark"></span><span class="ct">${l}</span></label>`).join('')}</div>
      <div id="vfHHWrap" ${W.tenanted && W.tenanted !== 'no' ? '' : 'hidden'}><div class="card note tight"><h3>Healthy Homes checklist and statement</h3><p class="small" style="margin:0">As it's rented, I can complete a Healthy Homes checklist with you. I take the measurements on site and fill it in on my phone, and you sign it as landlord. It helps you with your compliance statement, and buyers often ask for it.</p></div>
        <div class="choices">${[['yes', 'Yes please'], ['no', 'Not needed for now']].map(([v, l]) => `<label class="choice"><input type="radio" name="vfHH" value="${v}" ${W.hh === v ? 'checked' : ''}><span class="mark"></span><span class="ct">${l}</span></label>`).join('')}</div></div>`;
    if (i === 3) {
      const doc = isHH ? hhDoc(fm.agent_data, A.address, names) : vdDoc(W, A.address, names, new Date());
      const mine = iSigned(fm);
      h = `<h1>${isHH ? 'Check and sign your Healthy Homes checklist' : locked ? 'Check and sign the Vendor Declaration' : 'Vendor Statement and signing'}</h1>
        <p class="lede">${locked && !isHH ? 'These answers are already signed by someone else on the agreement, so they can\'t change here. If anything is wrong, call Tim before signing.' : isHH ? 'Tim filled this in on site. Check it, and call him on 027 562 7207 if anything is wrong before you sign.' : 'Here\'s your declaration. Check it, then sign below. Everyone on the agreement signs it, each on their own phone.'}</p>
        ${locked || isHH ? docHTML(doc) : `${docHTML({ pages: [{ title: 'Vendor Statement', after: VD_STATEMENT }] })}<details class="card tight"><summary class="small">See all your answers</summary>${docHTML(doc)}</details>`}
        ${mine ? '<div class="card okc tight"><p class="small" style="margin:0">You\'ve signed this.</p></div>' : `<h2>Sign</h2><div class="card tight">
          <label class="choice cb"><input type="checkbox" id="vfOk"><span class="mark"></span><span><span class="ct">${isHH ? 'I\'ve checked this checklist and statement' : 'I declare the Vendor Statement is true, and my answers are correct to the best of my knowledge'}</span></span></label>
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:8px 0"><h3 style="margin:0">${esc(ME.legal_name)}</h3><button class="btn link" type="button" id="vfClr">Clear</button></div>
          <div class="sig-wrap"><canvas id="vfSig" aria-label="Signature pad"></canvas><div class="sig-line"></div><span class="hint">Sign here with your finger or mouse</span></div>${saveNote('Save my signature and sign')}</div>`}`;
    }
    main().innerHTML = `<section class="screen active" data-signed${i === 3 && !iSigned(fm) ? ' data-signing' : ''}>${h}<div class="err"></div></section>`;
    const fu = () => { const c = $('input[name="vfFile"]:checked'); if ($('#vfChWrap')) $('#vfChWrap').hidden = !(c && c.value === 'changed'); };
    $$('input[name="vfFile"]').forEach(r => r.addEventListener('change', fu));
    const tu = () => { const c = $('input[name="vfTen"]:checked'); if ($('#vfHHWrap')) $('#vfHHWrap').hidden = !(c && c.value !== 'no'); };
    $$('input[name="vfTen"]').forEach(r => r.addEventListener('change', tu));
    let pad = null; if ($('#vfSig')) { pad = makePad($('#vfSig')); $('#vfClr').addEventListener('click', () => pad.clear()); }
    const signing = i === 3 && !iSigned(fm);
    actions(true, i === 0 || locked ? 'Not now' : 'Back', signing ? 'Save my signature and sign' : i === 3 ? 'Done' : 'Continue');
    onBack = () => { if (i === 0 || locked) return showStep(LAST); vfRead(); vfStep(i - 1); };
    onNext = async () => {
      if (i < 3) {
        vfRead(); const e = vfCheck(i); if (e) return err(e);
        W._step = i + 1; if (i === 2) W.complete = true;
        await must(sb.rpc('vendor_form_save', { f: fm.id, patch: W }));
        if (i === 2 && W.tenanted !== 'no' && W.hh === 'yes' && !formOf('healthy_homes')) { await must(sb.rpc('vendor_form_start', { a: A.id, p_kind: 'healthy_homes' })); await loadForms(); }
        return vfStep(i + 1);
      }
      if (!signing) return showStep(LAST);
      if (!locked) { const bad = [0, 1, 2].map(vfCheck).find(Boolean); if (bad) return err(bad); }
      if (!$('#vfOk').checked) return err(isHH ? 'Tick the box once you\'ve checked it.' : 'Tick the box to make the declaration, or call Tim if something isn\'t right.');
      if (!pad || !pad.drawn()) return err('Please sign in the box.');
      if (!locked) await must(sb.rpc('vendor_form_save', { f: fm.id, patch: W }));
      const path = await uploadSig($('#vfSig'), A.id, 'form-' + fm.id + '-' + ME.id);
      const doc = isHH ? hhDoc(fm.agent_data, A.address, names) : vdDoc(W, A.address, names, new Date());
      const res = await must(sb.rpc('vendor_form_sign', { f: fm.id, p_image_path: path, p_snapshot: { document: doc.title, doc, property: A.address, agreement_ref: A.ref, signer: { name: ME.legal_name, email: SESSION.user.email }, signed_at_client: new Date().toISOString() }, p_user_agent: navigator.userAgent }));
      await sigSaved($('#vfSig'), 'Signature saved', `You've signed the ${FORM_LABEL[fm.kind]}`);
      if (res && res.remaining === 0 && isHH) { const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'form_signed', agreement_id: A.id, form_id: fm.id } }); if (fe) console.warn('form pdf', fe); }
      await loadForms();
      toast(res && res.remaining === 0 ? (isHH ? 'Signed. Tim has a copy.' : 'Signed. Tim signs it next, as licensee.') : 'Signed. Waiting on the others.');
      showStep(LAST);
    };
    top();
  }

  /* agent: the documents tile on the property page, Tim's Healthy Homes checklist, and signing in person */
  function formsTileHTML(forms, ag) {
    if (!ag || !['signed', 'countersigned'].includes(ag.status)) return '';
    const st = fm => fm.status === 'signed' && fm.kind === 'vendor_declaration' && !fm.countersigned_at ? '<span class="status pending">Vendors signed. Your countersignature next</span>' : fm.status === 'signed' ? `<span class="status done">Signed ${esc(fmtDate(fm.countersigned_at || fm.signed_at))}</span>${fm.document_id ? '' : ` <span class="status pending">PDF not filed yet</span>`}` : fm.status === 'ready' ? '<span class="status pending">Ready to sign</span>' : fm.kind === 'healthy_homes' ? '<span class="status pending">Measurements to do</span>' : (fm.data || {}).complete ? '<span class="status pending">Answered, to sign</span>' : '<span class="status pending">Vendor filling in</span>';
    return `<div class="card ptile"><h3>Documents after signing</h3>
      ${forms.length ? forms.map(fm => `<div class="fact"><div class="k">${esc(FORM_LABEL[fm.kind])}</div><div class="v" style="font-weight:400;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${st(fm)}</span><button class="btn link" type="button" data-fopen="${fm.id}">Open</button></div></div>`).join('')
        : '<p class="small" style="margin:0">The vendor fills in the Vendor Declaration from their agreement page. If they say it\'s tenanted and want one, a Healthy Homes checklist appears here for you.</p>'}
    </div>`;
  }
  async function viewFormAgent(fid) {
    header('Document', '', 0); actions(false);
    const fm = await must(sb.from('property_forms').select('*').eq('id', fid).single());
    const ag = await must(sb.from('agreements').select('*').eq('id', fm.agreement_id).single());
    const people = await must(sb.from('agreement_people').select('*').eq('agreement_id', fm.agreement_id).order('position'));
    const fs = await must(sb.from('form_signatures').select('*').eq('form_id', fid));
    const signers = signersOf(people), names = signers.map(p => p.legal_name).join(' and ');
    const isHH = fm.kind === 'healthy_homes', editable = isHH && !fs.length;
    const ad = JSON.parse(JSON.stringify(fm.agent_data || {})); ad.c ||= {}; ad.ws ||= {}; ad.res ||= {}; ad.st ||= {};
    if (isHH && !ad.assessedBy) ad.assessedBy = 'Tim McGuire, McGuire Real Estate';
    const pick = (name, val, opts) => `<div class="chip-row">${opts.map(o => `<label class="chip"><input type="radio" name="${name}" value="${esc(o)}" ${val === o ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
    const doc = isHH ? hhDoc(ad, ag.address, names) : vdDoc(fm.data || {}, ag.address, names, fs[0] ? fs[0].signed_at : new Date());
    const canSign = fm.status !== 'signed' && (isHH ? fm.status === 'ready' : (fm.data || {}).complete);
    const needsCounter = !isHH && fm.status === 'signed' && !fm.countersigned_at;
    const toSign = signers.filter(p => !fs.some(s => s.person_id === p.id));
    main().innerHTML = `<div class="view-pad">
      <div class="toolbar no-print"><button class="btn ghost" type="button" id="fBack">Property file</button></div>
      <span class="agent-flag">Only you see this</span>
      <h1>${esc(FORM_LABEL[fm.kind])}</h1>
      <p class="small">${esc(ag.address)} · ${esc(ag.ref)} · ${esc(fm.form_version)}</p>
      ${needsCounter ? `<div class="card"><h3>Countersign as licensee</h3><p class="small">Every vendor has signed. The declaration says it is noted "by the Licensee, who has also signed below": sign here as Timothy McGuire REA#20117983 on behalf of McGuire Real Estate Limited. It's then filed on the property and emailed to you.</p><div class="sig-wrap"><canvas id="fSigA" aria-label="Your signature pad"></canvas><div class="sig-line"></div><span class="hint">Sign here</span></div>${saveNote('Save my signature and countersign')}<div class="toolbar"><button class="btn primary" type="button" id="fCounter">Save my signature and countersign</button></div><div class="err" id="fCErr"></div></div>` : ''}
      ${fm.status === 'signed' && !needsCounter ? `<div class="card okc tight"><p class="small" style="margin:0">Signed by everyone ${esc(fmtDT(fm.countersigned_at || fm.signed_at))}. ${fm.document_id ? 'The PDF is filed in the property\'s documents.' : 'The PDF hasn\'t been filed yet.'}${fm.pdf_error ? ' ' + esc(fm.pdf_error) : ''}</p>${fm.document_id ? '' : '<div class="toolbar"><button class="btn primary" type="button" id="fFile">Make the PDF and file it</button></div>'}</div>` : ''}
      ${editable ? `<h2>Healthy Homes Compliance Checklist <span class="opt small">Page 1</span></h2><p class="small">${esc(HH_INTRO)}</p>
        ${HH_CHECK.map(([t, items]) => `<div class="card tight"><h3>${esc(t)}</h3>${items.map(([k, q]) => `<div class="hhq" data-hk="${k}"><p class="small" style="margin:8px 0 4px;color:var(--ink)">${esc(q)}</p>${pick('hc_' + k, (ad.c[k] || {}).a, YNNA)}<input type="text" data-hn placeholder="Notes" value="${esc((ad.c[k] || {}).n || '')}" aria-label="Notes"></div>`).join('')}</div>`).join('')}
        <div class="row2 stack"><div><label class="f" for="hAss">Assessed by</label><input type="text" id="hAss" value="${esc(ad.assessedBy || '')}"></div><div><label class="f" for="hDate">Date</label><input type="date" id="hDate" value="${esc(ad.assessedOn || isoDay(new Date()))}"></div></div>
        <h2>Heating Assessment Worksheet <span class="opt small">Page 2</span></h2><p class="small">${esc(HH_WS_INTRO)}</p>
        <div class="card tight">${HH_WS.map(([k, q, t]) => t === 'yn' ? `<p class="small" style="margin:8px 0 4px;color:var(--ink)">${esc(q)}</p>${pick('hw_' + k, ad.ws[k], YNNA)}` : `<label class="f">${esc(q)}</label><input type="text" data-hw="${k}" value="${esc(ad.ws[k] || '')}">`).join('')}</div>
        <div class="card tight"><h3>Result (from official tool/formula)</h3><div class="row2"><div><label class="f" for="hReq">Heating capacity (kW): required</label><input type="text" id="hReq" inputmode="decimal" value="${esc(ad.res.req || '')}"></div><div><label class="f" for="hInst">Installed</label><input type="text" id="hInst" inputmode="decimal" value="${esc(ad.res.inst || '')}"></div></div>
          <p class="small" style="margin:8px 0 4px;color:var(--ink)">Tolerance / top-up allowance applies?</p>${pick('hr_tol', ad.res.tol, YNNA)}<p class="small" style="margin:8px 0 4px;color:var(--ink)">Compliant</p>${pick('hr_comp', ad.res.comp, YNNA)}
          <p class="small" style="margin:10px 0 0">Tool link: <a href="https://www.tenancy.govt.nz/heating-tool/" target="_blank" rel="noopener">tenancy.govt.nz/heating-tool</a></p></div>
        <h2>Compliance Statement: Data Capture <span class="opt small">Page 3</span></h2><p class="small">${esc(HH_ST_INTRO)}</p>
        ${HH_ST.map(([t, items]) => `<div class="card tight"><h3>${esc(t)}</h3>${items.map(([k, q]) => `<label class="f">${esc(q)}</label><input type="text" data-hs="${k}" value="${esc(ad.st[k] || '')}">`).join('')}</div>`).join('')}
        <div class="toolbar"><button class="btn ghost" type="button" id="hSave">Save</button><button class="btn primary" type="button" id="hReady">${fm.status === 'ready' ? 'Save, still ready to sign' : 'Ready for the landlord to sign'}</button></div><div class="err" id="hErr"></div>`
        : docHTML(doc)}
      ${canSign && toSign.length ? `<h2>Sign in person</h2><p class="small">${isHH ? 'The landlord' : 'Each vendor'} can sign here on your phone, witnessed by you, or on their own phone from their agreement page.</p>
        ${toSign.map(p => `<div class="card tight" data-fsigner="${p.id}"><label class="choice cb" style="margin:0 0 8px"><input type="checkbox" data-fok="${p.id}"><span class="mark"></span><span><span class="ct">${esc(p.legal_name)} has checked it${isHH ? '' : ' and makes the Vendor Statement'}</span></span></label>
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px"><h3 style="margin:0">${esc(p.legal_name)}</h3><button class="btn link" type="button" data-fclr="${p.id}">Clear</button></div>
          <div class="sig-wrap"><canvas id="fpad_${p.id}" aria-label="Signature pad for ${esc(p.legal_name)}"></canvas><div class="sig-line"></div><span class="hint">${esc(callName(p) || p.legal_name)} signs here</span></div>${saveNote(`Save ${callName(p) || p.legal_name}'s signature`)}
          <div class="toolbar"><button class="btn primary" type="button" data-fsign="${p.id}">Save ${esc(callName(p) || p.legal_name)}'s signature</button></div></div>`).join('')}<div class="err" id="fErr"></div>` : ''}
      ${fs.length ? `<h2>Signatures</h2>${fs.map(s => `<div class="card tight"><div style="font-weight:600">${esc(s.signer_name)}${s.signer_role === 'agent' ? ' <span class="small">(licensee)</span>' : ''}</div><div class="small">${esc(fmtDT(s.signed_at))} · fingerprint ${esc(String(s.snapshot_sha256).slice(0, 16))}…${s.snapshot && s.snapshot.witnessed_by ? ' · witnessed by you' : ''}</div></div>`).join('')}` : ''}
    </div>`;
    $('#fBack').addEventListener('click', () => ag.property_id ? viewProperty(ag.property_id) : viewAgentDetail(ag.id));
    const fc = $('#fCounter');
    if (fc) { const pad = makePad($('#fSigA')); fc.addEventListener('click', async () => {
      if (!pad.drawn()) { $('#fCErr').textContent = 'Please sign first.'; return; }
      fc.disabled = true;
      try {
        const path = await uploadSig($('#fSigA'), ag.id, 'form-' + fid + '-agent');
        await must(sb.rpc('agent_form_countersign', { f: fid, p_image_path: path, p_snapshot: { document: doc.title, doc, property: ag.address, agreement_ref: ag.ref, signer: { name: 'Timothy McGuire', role: 'licensee' }, signed_at_client: new Date().toISOString() }, p_user_agent: navigator.userAgent }));
        await sigSaved($('#fSigA'), 'Countersigned', 'Your signature is saved');
        const { data, error } = await sb.functions.invoke('notify', { body: { type: 'form_signed', agreement_id: ag.id, form_id: fid } });
        toast(error || (data && data.ok === false) ? 'Countersigned. The PDF didn\'t file; try again below.' : 'Countersigned. Filed, and emailed to you.');
        viewFormAgent(fid);
      } catch (_) { fc.disabled = false; }
    }); }
    const ff = $('#fFile'); if (ff) ff.addEventListener('click', async () => { ff.disabled = true; const { data, error } = await sb.functions.invoke('notify', { body: { type: 'form_signed', agreement_id: ag.id, form_id: fm.id } }); toast(error || (data && data.ok === false) ? 'That didn\'t work. Try again shortly.' : 'Filed, and emailed to you'); viewFormAgent(fid); });
    if (editable) {
      const read = () => {
        $$('.hhq').forEach(q => { const k = q.dataset.hk, r = $(`input[name="hc_${k}"]:checked`, q); ad.c[k] = { a: r ? r.value : '', n: $('[data-hn]', q).value.trim() }; });
        $$('[data-hw]').forEach(i => { ad.ws[i.dataset.hw] = i.value.trim(); }); const ex = $('input[name="hw_exempt"]:checked'); ad.ws.exempt = ex ? ex.value : '';
        $$('[data-hs]').forEach(i => { ad.st[i.dataset.hs] = i.value.trim(); });
        ad.res = { req: $('#hReq').value.trim(), inst: $('#hInst').value.trim(), tol: ($('input[name="hr_tol"]:checked') || {}).value || '', comp: ($('input[name="hr_comp"]:checked') || {}).value || '' };
        ad.assessedBy = $('#hAss').value.trim(); ad.assessedOn = $('#hDate').value;
      };
      $('#hSave').addEventListener('click', async () => { read(); await must(sb.from('property_forms').update({ agent_data: ad }).eq('id', fid)); toast('Saved'); });
      $('#hReady').addEventListener('click', async () => {
        read();
        const missing = HH_CHECK.flatMap(x => x[1]).filter(([k]) => !(ad.c[k] || {}).a).length;
        if (missing) { $('#hErr').textContent = `Mark each item on the checklist (Y, N or N/A). ${missing} to go.`; return; }
        if (!ad.assessedBy || !ad.assessedOn) { $('#hErr').textContent = 'Add who assessed it and the date.'; return; }
        await must(sb.from('property_forms').update({ agent_data: ad, status: 'ready', ready_at: fm.ready_at || new Date().toISOString() }).eq('id', fid));
        await must(sb.from('agreement_events').insert({ agreement_id: ag.id, actor: SESSION.user.email, kind: 'form_ready', detail: { form: fm.kind } }));
        toast('Ready for the landlord to sign'); viewFormAgent(fid);
      });
    }
    const pads = {};
    $$('[data-fsigner]').forEach(c => { pads[c.dataset.fsigner] = makePad($('#fpad_' + c.dataset.fsigner)); });
    $$('[data-fclr]').forEach(b => b.addEventListener('click', () => pads[b.dataset.fclr].clear()));
    $$('[data-fsign]').forEach(b => b.addEventListener('click', async () => {
      const pid = b.dataset.fsign, p = signers.find(x => x.id === pid), er = $('#fErr');
      if (!$(`[data-fok="${pid}"]`).checked) { er.textContent = `Tick the box once ${callName(p) || p.legal_name} has checked it.`; return; }
      if (!pads[pid].drawn()) { er.textContent = 'Please sign in the box first.'; return; }
      b.disabled = true;
      try {
        const path = await uploadSig($('#fpad_' + pid), ag.id, 'form-' + fid + '-' + pid);
        const d = isHH ? hhDoc(fm.agent_data, ag.address, names) : vdDoc(fm.data || {}, ag.address, names, new Date());
        const res = await must(sb.rpc('agent_form_sign_in_person', { f: fid, pid, p_image_path: path, p_snapshot: { document: d.title, doc: d, property: ag.address, agreement_ref: ag.ref, signer: { name: p.legal_name, email: p.email }, signed_at_client: new Date().toISOString() }, p_user_agent: navigator.userAgent }));
        await sigSaved($('#fpad_' + pid), `${p.legal_name} has signed`, 'Signature saved');
        if (res && res.remaining === 0 && isHH) { const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'form_signed', agreement_id: ag.id, form_id: fid } }); toast(fe ? 'All signed. The PDF didn\'t file; try again below.' : 'All signed. Filed, and emailed to you.'); }
        else if (res && res.remaining === 0) toast('All the vendors have signed. Countersign it below.');
        viewFormAgent(fid);
      } catch (_) { b.disabled = false; }
    }));
    top();
  }

  /* ═════════════════ VARIATIONS AND EXTENSIONS ═════════════════ */
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
  const dayText = iso => iso ? fmtDate(iso + 'T12:00:00') : 'Not set';
  // the terms in force: the signed agreement, then each fully signed variation in order
  function currentTerms(ag, vars) {
    const c = ag.config || {};
    const t = { aboveType: aboveType(c), flat: c.flat, thr: c.thr, pct: c.pct, aboveAmt: c.aboveAmt, ask: c.ask, method: c.method || '', methodDate: c.methodDate || '', reviewUntil: (c.start || ag.signed_at) ? addDays(c.start || isoDay(ag.signed_at), 90) : '', marketing: [], other: [] };
    (vars || []).filter(v => v.status === 'signed').sort((a, b) => a.number - b.number).forEach(v => {
      const ch = v.changes || {};
      if (ch.reviewUntil) t.reviewUntil = ch.reviewUntil;
      if (ch.commission) Object.assign(t, ch.commission);
      if (ch.ask) t.ask = ch.ask;
      if (ch.method !== undefined) { t.method = ch.method; t.methodDate = ch.methodDate || ''; }
      if (ch.marketing) t.marketing.push(ch.marketing);
      if (ch.other) t.other.push(ch.other);
    });
    return t;
  }
  const methodText = t => (t.method || 'Not set') + (t.methodDate ? ', ' + t.methodDate : '');
  function varSummary(cur, ch) {
    const rows = [];
    if (ch.reviewUntil) rows.push({ label: 'Review date', from: dayText(cur.reviewUntil), to: dayText(ch.reviewUntil) + ', the new end of the fixed period. The agreement otherwise continues on its terms, as in clause 2' });
    if (ch.commission) rows.push({ label: 'Commission', from: commText(cur), to: commText(Object.assign({}, cur, ch.commission)) });
    if (ch.ask) rows.push({ label: 'Price for the commission example', from: num(cur.ask) ? money(num(cur.ask)) : 'Not set', to: `${money(num(ch.ask))} (commission at this price: ${money(r2(commission(Object.assign({}, cur, ch.commission || {}), num(ch.ask))))} plus GST)` });
    if (ch.method !== undefined) rows.push({ label: 'Method of sale', from: methodText(cur), to: methodText(ch) });
    if (ch.marketing) rows.push({ label: 'Additional marketing', from: '', to: `${ch.marketing.desc}: ${money(num(ch.marketing.amount))} including GST, invoiced through List Now` });
    if (ch.other) rows.push({ label: 'Other change', from: '', to: ch.other });
    return rows;
  }
  const nlEsc = s => esc(s).replace(/\r?\n/g, '<br>');   // a line break in what Tim wrote is a line break on the page, and in the translation key
  const varTable = rows => `<table class="sum" data-signed>${rows.map(r => `<tr><td>${esc(r.label)}</td><td style="white-space:normal"><span data-tr-block>${nlEsc(r.to)}</span>${r.from ? `<br><span class="small" data-tr-block>Was: <span data-tr-block>${nlEsc(r.from)}</span></span>` : ''}</td></tr>`).join('')}</table>`;
  const VSTATUS = { draft: 'Draft, not issued', sent: 'Waiting for signatures', signed: 'Signed by everyone, in effect', withdrawn: 'Withdrawn' };
  async function openVarPdf(vid) {
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">Preparing the variation…</p>');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(`${SB_URL}/functions/v1/agreement-pdf?part=variation&vid=${vid}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (session ? session.access_token : '') } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not create the PDF');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message); }
  }
  async function uploadSig(cv, agId, tag) {
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const path = `agreements/${agId}/signatures/var-${tag}-${Date.now()}.png`;
    await must(sb.storage.from('private').upload(path, blob, { contentType: 'image/png' }));
    return path;
  }
  const varSnapshot = (ag, vr, signer) => ({ document: `Variation ${vr.number} to Agency Agreement ${ag.ref}`, agreement_ref: ag.ref, agreement_version: ag.agreement_version, property: ag.address, variation_number: vr.number, changes: vr.changes, summary: vr.summary, reason: vr.reason || '', signer, signed_at_client: new Date().toISOString() });

  /* agent: the variations panel on the agreement page */
  function varPanel(ag, people, vars, vsigs) {
    const live = ['signed', 'countersigned'].includes(ag.status);
    vars.forEach(v => { TRVARS[v.id] = v; });
    if (!live && !vars.length) return '';
    const signers = people.filter(p => p.legal_name && p.signed_at);
    const cur = currentTerms(ag, vars), anySigned = vars.some(v => v.status === 'signed');
    return `<h2 id="varPanel">Variations and extensions</h2>
      <p class="small">Change or extend a signed agreement. The vendors sign each variation the way they signed the agreement, and the original stays as it was.</p>
      ${live && !vars.some(v => ['draft', 'sent'].includes(v.status)) ? '<div class="toolbar no-print"><button class="btn primary" type="button" id="newVar">Vary or extend this agreement</button></div>' : ''}
      ${vars.slice().reverse().map(v => {
        const mine = vsigs.filter(s => s.variation_id === v.id);
        return `<div class="card ${v.status === 'sent' ? 'note' : ''}" data-var="${v.id}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h3 style="margin:0">Variation ${v.number}</h3><span class="status ${v.status === 'signed' ? 'done' : 'pending'}">${esc(VSTATUS[v.status])}${v.signed_at ? ' ' + esc(fmtDT(v.signed_at)) : ''}</span></div>
          ${(v.summary || []).length ? varTable(v.summary) : '<p class="small">No changes chosen yet.</p>'}
          ${['sent', 'signed'].includes(v.status) ? `<details style="margin-top:8px"><summary class="small">Other languages for the vendors</summary><div data-trvar="${v.id}"></div></details>` : ''}
          ${v.status === 'sent' ? `<div class="small" style="margin-top:8px">${signers.map(p => `${esc(p.legal_name)}: ${mine.some(s => s.person_id === p.id) ? '✓ signed' : 'not signed yet'}`).join('<br>')}<br>Issued ${esc(fmtDT(v.sent_at))} ${v.signing_mode === 'remote' ? '(sent to sign on their phones)' : '(to sign together)'}</div>` : ''}
          ${v.status === 'signed' ? `<div class="small" style="margin-top:8px">${v.copy_sent_at ? 'Signed copy emailed ' + esc(fmtDT(v.copy_sent_at)) : `<strong style="color:var(--accent)">Signed copy not emailed yet${v.copy_error ? ': ' + esc(v.copy_error) : ''}</strong>`}</div>` : ''}
          <div class="toolbar no-print">
            ${v.status === 'draft' ? `<button class="btn primary" type="button" data-vedit="${v.id}">Continue</button>` : ''}
            ${v.status === 'sent' ? `<button class="btn primary" type="button" data-vtogether="${v.id}">Sign together now</button><button class="btn ghost" type="button" data-vsend="${v.id}">Email it to them to sign</button>` : ''}
            ${v.status !== 'draft' ? `<button class="btn ghost" type="button" data-vpdf="${v.id}">Variation (PDF)</button>` : ''}
            ${v.status === 'signed' && !v.copy_sent_at ? `<button class="btn ghost" type="button" data-vcopy="${v.id}">Email signed copy now</button>` : ''}
            ${['draft', 'sent'].includes(v.status) ? `<button class="btn link" type="button" data-vwd="${v.id}">${v.status === 'draft' ? 'Discard draft' : 'Withdraw'}</button>` : ''}
          </div></div>`;
      }).join('')}
      ${anySigned ? `<div class="card tight"><h3>Terms now in force, as varied</h3><table class="sum">
        <tr><td>Review date</td><td style="white-space:normal">${esc(dayText(cur.reviewUntil))}</td></tr>
        <tr><td>Commission</td><td style="white-space:normal">${esc(commText(cur))}</td></tr>
        <tr><td>Price for example</td><td>${num(cur.ask) ? money(num(cur.ask)) : 'Not set'}</td></tr>
        <tr><td>Method of sale</td><td style="white-space:normal">${esc(methodText(cur))}</td></tr>
        ${cur.marketing.map(m => `<tr><td>Added marketing</td><td style="white-space:normal">${esc(m.desc)}: ${money(num(m.amount))}</td></tr>`).join('')}
        ${cur.other.map(o => `<tr><td>Other change</td><td style="white-space:normal">${esc(o)}</td></tr>`).join('')}
      </table></div>` : ''}`;
  }
  function wireVarPanel(agId) {
    $$('[data-trvar]').forEach(box => { const v = TRVARS[box.dataset.trvar]; if (v) trPanelDraw(box, 'variation', v.id, trVarSources(v)); });
    const nv = $('#newVar'); if (nv) nv.addEventListener('click', async () => { nv.disabled = true; try { const vid = await must(sb.rpc('agent_new_variation', { a: agId })); viewVariation(agId, vid); } catch (_) { nv.disabled = false; } });
    $$('[data-vedit]').forEach(b => b.addEventListener('click', () => viewVariation(agId, b.dataset.vedit)));
    $$('[data-vtogether]').forEach(b => b.addEventListener('click', () => viewVarTogether(agId, b.dataset.vtogether)));
    $$('[data-vpdf]').forEach(b => b.addEventListener('click', () => openVarPdf(b.dataset.vpdf)));
    $$('[data-vsend]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; const { data, error } = await sb.functions.invoke('notify', { body: { type: 'variation_sent', agreement_id: agId, variation_id: b.dataset.vsend } }); toast(error || (data && data.ok === false) ? 'Email failed. See the Emails list below.' : 'Emailed to them to sign'); viewAgentDetail(agId); }));
    $$('[data-vcopy]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; const { data, error } = await sb.functions.invoke('notify', { body: { type: 'variation_signed', agreement_id: agId, variation_id: b.dataset.vcopy } }); toast(error || (data && data.ok === false) ? 'Email failed. See the Emails list below.' : 'Signed copy emailed'); viewAgentDetail(agId); }));
    $$('[data-vwd]').forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to confirm'; return; }
      await must(sb.rpc('agent_withdraw_variation', { v: b.dataset.vwd })); toast('Done'); viewAgentDetail(agId);
    }));
  }

  /* agent: build the variation */
  async function viewVariation(agId, vid) {
    header('Vary or extend', '', 50); actions(false);
    const ag = await must(sb.from('agreements').select('*').eq('id', agId).single());
    const vars = await must(sb.from('agreement_variations').select('*').eq('agreement_id', agId).order('number'));
    const vr = vars.find(v => v.id === vid);
    if (!vr || vr.status !== 'draft') return viewAgentDetail(agId);
    const cur = currentTerms(ag, vars), ch = vr.changes || {}, com = Object.assign({}, cur, ch.commission || {});
    const on = k => k === 'method' ? ch.method !== undefined : !!ch[k];
    const sec = (k, title, desc, body) => `<div class="card"><label class="choice cb" style="margin:0"><input type="checkbox" data-vk="${k}" ${on(k) ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${title}</span><span class="cd">${desc}</span></span></label><div data-vbody="${k}" ${on(k) ? '' : 'hidden'} style="margin-top:10px">${body}</div></div>`;
    const methods = ['', 'Auction', 'Tender', 'Deadline sale', 'Price by negotiation', 'Fixed price', 'Expressions of interest', 'Timed sale', 'Ballot'];
    main().innerHTML = `<div class="view-pad"><span class="agent-flag">Only you see this until you issue it</span>
      <h1>Variation ${vr.number}: ${esc(ag.address)}</h1>
      <p class="lede">Tick what's changing. Everything you don't tick stays as signed.</p>
      ${sec('reviewUntil', 'Extend the agreement', `Move the review date (end of the fixed period). Now: ${esc(dayText(cur.reviewUntil))}`, `
        <div class="toolbar" style="margin:0 0 6px">${[30, 60, 90].map(n => `<button class="btn ghost" type="button" data-vext="${n}">Add ${n} days</button>`).join('')}</div>
        <label class="f" for="vReview">New review date</label><input type="date" id="vReview" value="${esc(ch.reviewUntil || '')}">`)}
      ${sec('commission', 'Change the commission', `Now: ${esc(commText(cur))}`, `
        <div class="choices">${[['pct', 'Flat fee, plus a percentage above a threshold'], ['amount', 'Flat fee, plus a set amount above a threshold'], ['none', 'Flat fee only']].map(([val, t]) => `<label class="choice"><input type="radio" name="vAbove" value="${val}" ${aboveType(com) === val ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${t}</span></span></label>`).join('')}</div>
        <div class="row2 stack"><div><label class="f" for="vFlat">Flat fee (plus GST)</label><input type="text" id="vFlat" inputmode="numeric" value="${esc(com.flat || '')}"></div><div data-vab="pct amount"><label class="f" for="vThr">Threshold</label><input type="text" id="vThr" inputmode="numeric" value="${esc(com.thr || '')}"></div></div>
        <div class="row2 stack"><div data-vab="pct"><label class="f" for="vPct">Percentage above the threshold</label><input type="text" id="vPct" inputmode="decimal" value="${esc(com.pct || '')}"></div><div data-vab="amount"><label class="f" for="vAboveAmt">Set amount above the threshold</label><input type="text" id="vAboveAmt" inputmode="numeric" value="${esc(com.aboveAmt || '')}"></div></div>`)}
      ${sec('ask', 'Change the price', `The asking price or appraised value used for the commission example. Now: ${num(cur.ask) ? money(num(cur.ask)) : 'not set'}`, `
        <label class="f" for="vAsk">New price</label><input type="text" id="vAsk" inputmode="numeric" value="${esc(ch.ask || '')}">`)}
      ${sec('method', 'Change the method of sale', `Now: ${esc(methodText(cur))}`, `
        <label class="f" for="vMethod">Method</label><select id="vMethod">${methods.map(m => `<option ${(ch.method ?? cur.method) === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
        <label class="f" for="vMethodDate">Date and time <span class="opt">(optional)</span></label><input type="text" id="vMethodDate" value="${esc(ch.methodDate ?? cur.methodDate ?? '')}" placeholder="For example: Thu 26 Nov 2026, 4pm">`)}
      ${sec('marketing', 'Add marketing', 'Extra marketing on top of the agreed campaign, invoiced through List Now', `
        <label class="f" for="vMktDesc">What it is</label><input type="text" id="vMktDesc" value="${esc((ch.marketing || {}).desc || '')}" placeholder="For example: a further two weeks of social media advertising">
        <label class="f" for="vMktAmt">Cost, including GST</label><input type="text" id="vMktAmt" inputmode="numeric" value="${esc((ch.marketing || {}).amount || '')}">`)}
      ${sec('other', 'Something else', 'Any other change, in plain words', `<textarea id="vOther" placeholder="Exactly what changes">${esc(ch.other || '')}</textarea>`)}
      <label class="f" for="vReason">Reason <span class="opt">(optional, shown on the variation)</span></label><input type="text" id="vReason" value="${esc(vr.reason || '')}" placeholder="For example: more time to reach the right buyer">
      <div class="err"></div></div>`;
    $$('[data-vk]').forEach(cb => cb.addEventListener('change', () => { $(`[data-vbody="${cb.dataset.vk}"]`).hidden = !cb.checked; }));
    const abUpd = () => { const t = ($('input[name="vAbove"]:checked') || {}).value || 'pct'; $$('[data-vab]').forEach(el => el.hidden = !el.dataset.vab.split(' ').includes(t)); };
    $$('input[name="vAbove"]').forEach(r => r.addEventListener('change', abUpd)); abUpd();
    $$('[data-vext]').forEach(b => b.addEventListener('click', () => { if (cur.reviewUntil) $('#vReview').value = addDays(cur.reviewUntil, +b.dataset.vext); }));
    const read = () => {
      const c2 = {}, picked = k => $(`[data-vk="${k}"]`).checked;
      if (picked('reviewUntil')) { const d = $('#vReview').value; if (!d) return 'Choose the new review date.'; if (cur.reviewUntil && d <= cur.reviewUntil) return 'The new review date needs to be after the current one.'; c2.reviewUntil = d; }
      if (picked('commission')) {
        const t = ($('input[name="vAbove"]:checked') || {}).value || 'pct', cm = { aboveType: t, flat: $('#vFlat').value.trim(), thr: t === 'none' ? '' : $('#vThr').value.trim(), pct: t === 'pct' ? $('#vPct').value.trim() : '', aboveAmt: t === 'amount' ? $('#vAboveAmt').value.trim() : '' };
        if (!num(cm.flat) || (t !== 'none' && !num(cm.thr)) || (t === 'pct' && !num(cm.pct)) || (t === 'amount' && !num(cm.aboveAmt))) return 'Fill in the new commission.';
        if (commText(cm) === commText(cur)) return 'The new commission is the same as now. Untick it, or change it.';
        c2.commission = cm;
      }
      if (picked('ask')) { if (!num($('#vAsk').value)) return 'Add the new price.'; c2.ask = $('#vAsk').value.trim(); }
      if (picked('method')) { c2.method = $('#vMethod').value; c2.methodDate = $('#vMethodDate').value.trim(); if (!c2.method) return 'Choose the method of sale.'; }
      if (picked('marketing')) { const d = $('#vMktDesc').value.trim(), a = $('#vMktAmt').value.trim(); if (!d || !num(a)) return 'Describe the extra marketing and its cost.'; c2.marketing = { desc: d, amount: a }; }
      if (picked('other')) { const o = $('#vOther').value.trim(); if (!o) return 'Describe the other change.'; c2.other = o; }
      return c2;
    };
    const save = async () => { const c2 = read(); if (typeof c2 === 'string') { tErr(c2); return null; } const summary = varSummary(cur, c2); await must(sb.from('agreement_variations').update({ changes: c2, summary, reason: $('#vReason').value.trim() || null }).eq('id', vid)); return summary; };
    actions(true, 'Save and close', 'Next: sign and issue');
    onBack = async () => { if (await save()) { toast('Saved'); viewAgentDetail(agId); } };
    onNext = async () => { const s = await save(); if (!s) return; if (!s.length) return tErr('Tick at least one change.'); viewVarIssue(agId, vid); };
    top();
  }

  /* agent: check, sign, issue */
  async function viewVarIssue(agId, vid) {
    header('Sign and issue', '', 80);
    const ag = await must(sb.from('agreements').select('*').eq('id', agId).single());
    const people = await must(sb.from('agreement_people').select('*').eq('agreement_id', agId).order('position'));
    const vr = await must(sb.from('agreement_variations').select('*').eq('id', vid).single());
    if (vr.status !== 'draft') return viewAgentDetail(agId);
    const signers = people.filter(p => p.legal_name && p.signed_at);
    main().innerHTML = `<div class="view-pad"><span class="agent-flag">Check it, then sign as licensee</span>
      <h1>Variation ${vr.number}</h1>
      <p class="lede">To the agency agreement for ${esc(ag.address)} (${esc(ag.ref)}), between McGuire Real Estate and ${esc(joinNames(signers.map(p => p.legal_name)))}.</p>
      <div class="card" data-signed>${varTable(vr.summary)}${vr.reason ? `<p class="small" style="margin:10px 0 0">Reason: <span data-tr-block>${nlEsc(vr.reason)}</span></p>` : ''}</div>
      <p class="small">All other terms stay exactly as signed. It takes effect once everyone has signed.</p>
      <div class="toolbar"><button class="btn ghost" type="button" id="vPrev">Preview the PDF</button><button class="btn link" type="button" id="vBack">Change something</button></div>
      <h2>How will they sign?</h2>
      <div class="choices">
        <label class="choice"><input type="radio" name="vMode" value="in_person" checked><span class="mark"></span><span><span class="ct">Together now, on this device</span><span class="cd">Each person signs here after you've talked it through</span></span></label>
        <label class="choice"><input type="radio" name="vMode" value="remote"><span class="mark"></span><span><span class="ct">On their own phones</span><span class="cd">They're emailed, then sign in with their email, the same way they signed the agreement</span></span></label>
      </div>
      <h2>Your signature</h2>
      <div class="card tight"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px"><h3 style="margin:0">Timothy McGuire, for McGuire Real Estate</h3><button class="btn link" type="button" id="vClr">Clear</button></div>
        <div class="sig-wrap"><canvas id="vSigA" aria-label="Your signature"></canvas><div class="sig-line"></div><span class="hint">Sign here</span></div>${saveNote('Save my signature and issue')}</div>
      <div class="err"></div></div>`;
    $('#vSigA').scrollIntoView({ block: 'center' });
    const pad = makePad($('#vSigA'));
    $('#vClr').addEventListener('click', () => pad.clear());
    $('#vPrev').addEventListener('click', () => openVarPdf(vid));
    $('#vBack').addEventListener('click', () => viewVariation(agId, vid));
    actions(true, 'Back', 'Save my signature and issue');
    onBack = () => viewVariation(agId, vid);
    onNext = async () => {
      if (!pad.drawn()) return tErr('Please sign first.');
      const mode = $('input[name="vMode"]:checked').value;
      const path = await uploadSig($('#vSigA'), agId, vid + '-agent');
      await must(sb.rpc('agent_issue_variation', { v: vid, p_mode: mode, p_image_path: path, p_snapshot: varSnapshot(ag, vr, { name: 'Timothy McGuire', role: 'licensee', email: SESSION.user.email }), p_user_agent: navigator.userAgent }));
      await sigSaved($('#vSigA'), 'Signature saved', 'Variation issued');
      try { trAuto('variation', vid, trVarSources(await must(sb.from('agreement_variations').select('summary,reason').eq('id', vid).single()))); } catch (_) { }
      if (mode === 'remote') {
        const { data, error } = await sb.functions.invoke('notify', { body: { type: 'variation_sent', agreement_id: agId, variation_id: vid } });
        toast(error || (data && data.ok === false) ? 'Issued, but the email failed. Use "Email it to them to sign".' : 'Issued and emailed to them to sign');
        return viewAgentDetail(agId);
      }
      viewVarTogether(agId, vid);
    };
    top();
  }

  /* agent: vendors sign on Tim's device */
  async function viewVarTogether(agId, vid) {
    header('Sign together', '', 90);
    const ag = await must(sb.from('agreements').select('*').eq('id', agId).single());
    const people = await must(sb.from('agreement_people').select('*').eq('agreement_id', agId).order('position'));
    const vr = await must(sb.from('agreement_variations').select('*').eq('id', vid).single());
    const vsigs = await must(sb.from('variation_signatures').select('*').eq('variation_id', vid));
    if (vr.status !== 'sent') return viewAgentDetail(agId);
    const todo = people.filter(p => p.legal_name && p.signed_at && !vsigs.some(s => s.person_id === p.id));
    main().innerHTML = `<div class="view-pad"><span class="agent-flag">Hand the device over to each person in turn</span>
      <h1>Changes to your agency agreement</h1>
      <p class="lede">Variation ${vr.number} to the agreement for ${esc(ag.address)}. Everything not listed here stays the same.</p>
      <div class="card" data-signed>${varTable(vr.summary)}${vr.reason ? `<p class="small" style="margin:10px 0 0">Reason: <span data-tr-block>${nlEsc(vr.reason)}</span></p>` : ''}</div>
      <div class="toolbar"><button class="btn ghost" type="button" id="vPdf2">Read the variation (PDF)</button></div>
      ${todo.map(p => `<div class="card tight" data-vp="${p.id}"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px"><h3 style="margin:0">${esc(p.legal_name)}</h3><button class="btn link" type="button" data-vclr="${p.id}">Clear</button></div>
        <label class="choice cb"><input type="checkbox" data-vok="${p.id}"><span class="mark"></span><span><span class="ct">I've read these changes and agree to them</span><span class="cd">I was told I can get legal advice before signing, and given time to do so</span></span></label>
        <div class="sig-wrap"><canvas data-vcv="${p.id}" aria-label="Signature of ${esc(p.legal_name)}"></canvas><div class="sig-line"></div><span class="hint">Sign here</span></div>${saveNote('Save signatures')}</div>`).join('') || '<p class="small">Everyone has signed.</p>'}
      <div class="err"></div></div>`;
    const pads = {};
    $$('[data-vcv]').forEach(cv => { pads[cv.dataset.vcv] = makePad(cv); });
    $$('[data-vclr]').forEach(b => b.addEventListener('click', () => pads[b.dataset.vclr].clear()));
    $('#vPdf2').addEventListener('click', () => openVarPdf(vid));
    actions(true, 'Close', todo.length ? 'Save signatures' : 'Close');
    onBack = () => viewAgentDetail(agId);
    onNext = async () => {
      if (!todo.length) return viewAgentDetail(agId);
      const ready = todo.filter(p => pads[p.id].drawn());
      if (!ready.length) return tErr('Each person ticks the box and signs.');
      for (const p of ready) if (!$(`[data-vok="${p.id}"]`).checked) return tErr(`${p.legal_name} needs to tick the box before signing.`);
      let res = null; const shown = [];
      for (const p of ready) {
        const path = await uploadSig($(`[data-vcv="${p.id}"]`), agId, vid + '-' + p.id);
        res = await must(sb.rpc('agent_sign_variation_in_person', { v: vid, pid: p.id, p_image_path: path, p_snapshot: varSnapshot(ag, vr, { name: p.legal_name, email: p.email, role: 'client' }), p_user_agent: navigator.userAgent }));
        shown.push(sigSaved($(`[data-vcv="${p.id}"]`), `${p.legal_name} has signed`, 'Signature saved'));
      }
      await Promise.all(shown);
      if (res && res.remaining === 0) {
        const { data, error } = await sb.functions.invoke('notify', { body: { type: 'variation_signed', agreement_id: agId, variation_id: vid } });
        toast(error || (data && data.ok === false) ? 'Signed. The copy email failed, so send it from the agreement page.' : 'Signed by everyone. Copies emailed.');
      } else toast('Saved. Others still to sign.');
      viewAgentDetail(agId);
    };
    top();
  }

  /* vendor: sign a variation on their own phone */
  let VARS = [], VSIGS = [], PANS = [];
  async function loadVars() {
    try { PANS = await must(sb.from('prior_agency_notices').select('*').eq('agreement_id', A.id).order('idx')); } catch (_) { PANS = []; }
    try { VARS = await must(sb.from('agreement_variations').select('*').eq('agreement_id', A.id).order('number')); VSIGS = await must(sb.from('variation_signatures').select('*').eq('agreement_id', A.id)); } catch (_) { VARS = []; VSIGS = []; }
    for (const v of VARS) if (['sent', 'signed'].includes(v.status)) loadContentTr('variation', v.id);
  }
  const varToSign = () => ME && VARS.find(v => v.status === 'sent' && !VSIGS.some(s => s.variation_id === v.id && s.person_id === ME.id));
  function varDoneHTML() {
    const notes = PANS.length ? `<h2>Your previous agency</h2><div class="card tight">${PANS.map(n => `<div class="fact"><div class="k">Notice to ${esc(n.agency)}</div><div class="v" style="font-weight:400">${n.status === 'sent' ? 'Sent ' + esc(fmtDate(n.sent_at)) + (n.sent_to ? ' to ' + esc(n.sent_to) : '') : 'Signed. Tim is checking it and will send it'}</div></div>`).join('')}<div class="toolbar">${PANS.map(n => `<button class="btn ghost" type="button" data-npdfv="${n.id}">Notice to ${esc(n.agency)} (PDF)</button>`).join('')}</div></div>` : '';
    return notes + varDoneInner();
  }
  function varDoneInner() {
    const shown = VARS.filter(v => ['sent', 'signed'].includes(v.status));
    if (!shown.length) return '';
    return `<h2>Changes to your agreement</h2>${shown.map(v => `<div class="card tight"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h3 style="margin:0">Variation ${v.number}</h3><span class="status ${v.status === 'signed' ? 'done' : 'pending'}">${v.status === 'signed' ? 'In effect from ' + esc(fmtDate(v.signed_at)) : varToSign() && varToSign().id === v.id ? 'Waiting for your signature' : 'Waiting for others to sign'}</span></div>${varTable(v.summary || [])}
      <div class="toolbar">${varToSign() && varToSign().id === v.id ? `<button class="btn primary" type="button" data-vsign="${v.id}">Read and sign</button>` : ''}<button class="btn ghost" type="button" data-vpdf="${v.id}">Variation (PDF)</button></div></div>`).join('')}`;
  }
  function wireVarDone() {
    $$('[data-npdfv]').forEach(b => b.addEventListener('click', () => openPartPdf(`part=notice&nid=${b.dataset.npdfv}`)));
    $$('[data-vsign]').forEach(b => b.addEventListener('click', () => viewVendorVariation(VARS.find(v => v.id === b.dataset.vsign))));
    $$('[data-vpdf]').forEach(b => b.addEventListener('click', () => openVarPdf(b.dataset.vpdf)));
  }
  function viewVendorVariation(vr) {
    header('Changes to your agreement', '', 100);
    main().innerHTML = `<section class="screen active" data-signed data-signing>
      <h1>Changes to your agency agreement</h1>
      <p class="lede">As we discussed, here's what changes in your agreement for ${esc(A.address)}. Everything else stays exactly as you signed it.</p>
      <div class="card" data-signed><h3>Variation ${vr.number}</h3>${varTable(vr.summary || [])}${vr.reason ? `<p class="small" style="margin:10px 0 0">Reason: <span data-tr-block>${nlEsc(vr.reason)}</span></p>` : ''}</div>
      <div class="toolbar"><button class="btn ghost" type="button" data-vpdf="${vr.id}">Read the variation (PDF)</button></div>
      <div class="card note tight"><p class="small" style="margin:0">You're welcome to get legal advice before signing, and to take your time. If anything here isn't what we agreed, don't sign. Call or text Tim on 027 562 7207 and he'll fix it.</p></div>
      <h2>Sign</h2>
      <div class="card tight">
        <label class="choice cb"><input type="checkbox" id="vOk"><span class="mark"></span><span><span class="ct">I've read these changes and agree to them</span><span class="cd">I know I can get legal advice before signing</span></span></label>
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:8px 0"><h3 style="margin:0">${esc(ME.legal_name)}</h3><button class="btn link" type="button" id="vClr">Clear</button></div>
        <div class="sig-wrap"><canvas id="vSigV" aria-label="Signature pad"></canvas><div class="sig-line"></div><span class="hint">Sign here with your finger or mouse</span></div>${saveNote('Save my signature and sign')}</div>
      <div class="err"></div></section>`;
    $$('[data-vpdf]').forEach(b => b.addEventListener('click', () => openVarPdf(b.dataset.vpdf)));
    const pad = makePad($('#vSigV'));
    $('#vClr').addEventListener('click', () => pad.clear());
    actions(true, 'Not now', 'Save my signature and sign');
    onBack = () => showStep(LAST);
    onNext = async () => {
      if (!$('#vOk').checked) return err('Tick the box if you agree to the changes.');
      if (!pad.drawn()) return err('Please sign in the box.');
      const path = await uploadSig($('#vSigV'), A.id, vr.id + '-' + ME.id);
      const res = await must(sb.rpc('vendor_sign_variation', { v: vr.id, p_image_path: path, p_snapshot: varSnapshot(A, vr, { name: ME.legal_name, email: SESSION.user.email, role: 'client' }), p_user_agent: navigator.userAgent }));
      await sigSaved($('#vSigV'), 'Signature saved', 'You\'ve signed the changes');
      if (res && res.remaining === 0) { const { error: fe } = await sb.functions.invoke('notify', { body: { type: 'variation_signed', agreement_id: A.id, variation_id: vr.id } }); if (fe) console.warn('variation copy', fe); }
      await loadVars();
      toast(res && res.remaining === 0 ? 'Signed. Your copy is on its way by email.' : 'Signed. Waiting on the others.');
      showStep(LAST);
    };
    top();
  }

  /* agent: notices to previous agencies */
  function noticePanel(ag, people, pans) {
    if (!pans.length) return '';
    const cc = people.filter(p => p.email && p.signed_at).map(p => p.email);
    return `<h2 id="noticePanel">Notices to previous agencies</h2>
      <p class="small">Signed by the sellers with the agreement. Download each one for your file. Check it, then send it.</p>
      ${pans.map(n => `<div class="card ${n.status === 'sent' ? '' : 'note'}" data-pan="${n.id}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h3 style="margin:0">${esc(n.agency)}${n.agent_name ? ` <span class="small">(${esc(n.agent_name)})</span>` : ''}</h3><span class="status ${n.status === 'sent' ? 'done' : 'pending'}">${n.status === 'sent' ? `Sent ${esc(fmtDT(n.sent_at))}` : 'To check and send'}</span></div>
        <div class="small">${esc(n.kind || 'Agency')}${n.dated ? ', dated ' + esc(n.dated) : ''}${n.status === 'sent' ? `<br>${esc(n.sent_method || '')}${n.sent_to ? ' to ' + esc(n.sent_to) : ''}` : ''}${n.send_error && n.status !== 'sent' ? `<br><strong style="color:var(--accent)">Last send failed: ${esc(n.send_error)}</strong>` : ''}</div>
        <div class="toolbar no-print"><button class="btn ghost" type="button" data-npdf="${n.id}">Signed notice (PDF)</button></div>
        ${n.status === 'sent' ? '' : `<div class="no-print">
          <label class="f">Agency email</label><input type="email" data-nemail value="${esc(n.email || '')}" placeholder="Add it to send the notice from here">
          <label class="choice cb" style="margin-top:10px"><input type="checkbox" data-nrev><span class="mark"></span><span><span class="ct">I've read the signed notice and it's correct</span><span class="cd">It goes to the agency with the PDF attached, copied to ${esc(joinNames(cc) || 'the sellers')}, and a copy to you</span></span></label>
          <div class="toolbar"><button class="btn primary" type="button" data-nsend="${n.id}">Send to the agency</button></div>
          <details class="acc" style="margin-top:6px"><summary>Sent it another way?</summary><div class="in"><select data-nhow><option>Handed to the agency</option><option>Posted</option><option>Emailed from my own inbox</option><option>Sellers sent it themselves</option></select><div class="toolbar"><button class="btn ghost" type="button" data-nmark="${n.id}">Record as sent</button></div></div></details>
          <div class="err"></div></div>`}</div>`).join('')}`;
  }
  function wireNoticePanel(agId) {
    $$('[data-npdf]').forEach(b => b.addEventListener('click', () => openPartPdf(`part=notice&nid=${b.dataset.npdf}`)));
    const card = b => b.closest('[data-pan]'), cerr = (b, m) => { $('.err', card(b)).textContent = m; };
    $$('[data-nsend]').forEach(b => b.addEventListener('click', async () => {
      const c = card(b), email = $('[data-nemail]', c).value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return cerr(b, 'Add the agency\'s email address first, or record it as sent another way.');
      if (!$('[data-nrev]', c).checked) return cerr(b, 'Open the signed notice and tick the box once you\'ve checked it.');
      b.disabled = true;
      await must(sb.from('prior_agency_notices').update({ email, reviewed_at: new Date().toISOString() }).eq('id', b.dataset.nsend));
      const { data, error } = await sb.functions.invoke('notify', { body: { type: 'prior_notice', agreement_id: agId, notice_id: b.dataset.nsend } });
      toast(error || (data && data.ok === false) ? 'The email didn\'t send. See the notice for why.' : 'Notice sent to ' + email);
      viewAgentDetail(agId);
    }));
    $$('[data-nmark]').forEach(b => b.addEventListener('click', async () => {
      const c = card(b), how = $('[data-nhow]', c).value, email = $('[data-nemail]', c).value.trim().toLowerCase();
      await must(sb.from('prior_agency_notices').update({ status: 'sent', sent_at: new Date().toISOString(), sent_method: how, sent_by: SESSION.user.email, email: email || null, reviewed_at: new Date().toISOString() }).eq('id', b.dataset.nmark));
      await must(sb.from('agreement_events').insert({ agreement_id: agId, actor: SESSION.user.email, kind: 'prior_notice_sent', detail: { method: how } }));
      toast('Recorded'); viewAgentDetail(agId);
    }));
  }
  async function openPartPdf(qs) {
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">Preparing the PDF…</p>');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(`${SB_URL}/functions/v1/agreement-pdf?${qs}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (session ? session.access_token : '') } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not create the PDF');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message); }
  }

  /* ═════════════════ PRE-LISTING: appraisal → questionnaire → updated plan → signing ═════════════════ */
  const PL_PLAN_ITEMS = [['method', 'Sale method'], ['price', 'Indicative price'], ['start', 'Start date'], ['marketing', 'Marketing']];
  const PL_MEET = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Weekends'];
  const PL_STEPS = ['Who you\'ve spoken with', 'The real choice', 'Your ideas', 'Your plan from me', 'Let\'s clear the way', 'Owners and meeting'];
  const plNotify = (type, id, extra) => sb.functions.invoke('notify', { body: Object.assign({ type, prelisting_id: id }, extra || {}) }).then(r => r, () => ({ error: true }));
  const plFacts = ap => `<div class="facts">${PL_PLAN_ITEMS.map(([k, l]) => `<div class="fact"><div class="k">${l}</div><div class="v">${esc(ap[k] || 'To discuss')}</div></div>`).join('')}</div>`;
  const plFirst = pl => { const o = ((pl.answers || {}).owners || [])[0]; return (o && (o.pref || (o.name || '').split(/\s+/)[0])) || (pl.contact_name || '').split(/\s+/)[0] || ''; };
  let PL = null, PLA = {};

  async function viewPrelisting(id) {
    PL = await must(sb.from('prelistings').select('*').eq('id', id).single()); JCTX.pid = PL.property_id || null; JVIEW = { pl: id };
    PLA = Object.assign({}, PL.answers || {});
    loadContentTr('plan', PL.id);
    PL.knownOwners = [];
    if (PL.property_id && PL.status === 'appraisal') { try { PL.knownOwners = await must(sb.from('property_people').select('legal_name,pref_name,email,phone').eq('property_id', PL.property_id).eq('role', 'owner').order('position')); } catch (_) { } }
    if (PL.status === 'appraisal') return PLA._step ? plStep(+PLA._step) : plAppraisal();
    if (PL.status === 'submitted') return plThanks();
    if (PL.status === 'plan') return plPlan();
    if (PL.status === 'question') return plQuestionSent();
    if (PL.status === 'accepted') return plOnward();
  }

  function plAppraisal() {
    const ap = PL.appraisal || {};
    header('Your appraisal', '', 0);
    main().innerHTML = `<section class="screen active">
      <h1>Your appraisal</h1>
      <p class="lede">${PL.contact_name ? `Hi ${esc(PL.contact_name.split(/\s+/)[0])}, here's` : 'Here\'s'} my plan for selling ${esc(PL.address)}.</p>
      <div class="card">${plFacts(ap)}${ap.note ? `<p style="margin:14px 0 0">${esc(ap.note).replace(/\n/g, '<br>')}</p>` : ''}</div>
      ${ap.link ? `<div class="toolbar"><a class="btn ghost" href="${esc(ap.link)}" target="_blank" rel="noopener" style="text-decoration:none">Read the full appraisal</a></div>` : ''}
      <p class="small">Questions at any stage? Call or text Tim on <strong>027 562 7207</strong>.</p></section>`;
    actions(true, '', 'I\'d like to proceed');
    onNext = async () => plStep(1);
    top();
  }

  const plArea = (k, label, helper) => `<label class="f" for="pl_${k}">${label}</label>${helper ? `<p class="small" style="margin:0 0 6px">${helper}</p>` : ''}<textarea id="pl_${k}" data-pl="${k}" rows="4">${esc(PLA[k] || '')}</textarea>`;
  function plOwnerCard(o, i) {
    return `<div class="card tight plo"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Owner ${i + 1}</h3>${i ? `<button class="btn link" type="button" data-rmo="${i}">Remove</button>` : ''}</div>
      <label class="f">Full name (as on the title)</label><input type="text" data-o="name" value="${esc(o.name || '')}" autocomplete="name">
      <label class="f">What do you like to be called?</label><input type="text" data-o="pref" value="${esc(o.pref || '')}">
      <div class="row2 stack"><div><label class="f">Email</label><input type="email" data-o="email" value="${esc(o.email || '')}" autocomplete="email" inputmode="email"></div><div><label class="f">Mobile</label><input type="tel" data-o="mobile" value="${esc(o.mobile || '')}" autocomplete="tel"></div></div></div>`;
  }
  const plReadOwners = () => $$('.plo').map(c => ({ name: $('[data-o=name]', c).value.trim(), pref: $('[data-o=pref]', c).value.trim(), email: $('[data-o=email]', c).value.trim(), mobile: $('[data-o=mobile]', c).value.trim() }));
  function plCollect() {
    $$('[data-pl]').forEach(el => { PLA[el.dataset.pl] = el.value.trim(); });
    if ($('[data-rate]')) { PLA.conf = Object.assign({}, PLA.conf); PL_PLAN_ITEMS.forEach(([k]) => { const c = $(`input[name="rate_${k}"]:checked`); if (c) PLA.conf[k] = +c.value; }); }
    if ($('#plOwners')) PLA.owners = plReadOwners().filter(o => o.name || o.pref || o.email || o.mobile);
    if ($('[data-meet]')) PLA.meet = $$('[data-meet]:checked').map(c => c.value);
  }
  function plStep(n) {
    const ap = PL.appraisal || {};
    header('Let\'s make this the right fit', `Step ${n} of 6`, n / 6 * 100);
    const body = {
      1: () => `${plArea('spoke', 'Have you spoken with anyone else about selling?')}${plArea('spokeFeel', 'Was there anything you liked, anything that put you off, or anything that left you wondering?')}`,
      2: () => `${plArea('choose', 'If every agent charged exactly the same, who would you choose?')}${plArea('chooseWhy', 'What\'s behind that choice?')}`,
      3: () => plArea('ideas', 'Are there any other ideas you\'d like built into our plan?'),
      4: () => `<p class="small" style="margin-top:0">1 = not confident, 5 = very confident</p>${PL_PLAN_ITEMS.map(([k, l]) => `<div class="card tight" data-rate="${k}"><div class="facts" style="grid-template-columns:1fr"><div class="fact" style="border:0;padding-top:0"><div class="k">${l}</div><div class="v">${esc(ap[k] || 'To discuss')}</div></div></div>
          <div class="rate" role="radiogroup" aria-label="${l}">${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="rate_${k}" value="${v}" ${(PLA.conf || {})[k] === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>`).join('')}
        ${plArea('likeMost', 'What do you like most about the plan so far?')}`,
      5: () => plArea('easyYes', 'What would need to be true for working together to be an easy yes?', 'Nothing is too small. If it\'s on your mind, it\'s worth sorting before we start.'),
      6: () => `<p>Please list everyone named on the title, so we can all sit down together.</p><div id="plOwners"></div><button class="btn link" type="button" id="plAddO">+ Add another owner</button>
        <h2>Meeting preference</h2><div class="chip-row">${PL_MEET.map(m => `<label class="chip"><input type="checkbox" data-meet value="${esc(m)}" ${(PLA.meet || []).includes(m) ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div>`,
    }[n]();
    main().innerHTML = `<section class="screen active">
      ${n === 1 ? `<h1>Let's make this the right fit</h1><p class="lede">Before we meet, a few quick questions so I can adjust the plan around what matters most to you. Your answers are just between us.</p><h2>${PL_STEPS[0]}</h2>` : `<h1>${PL_STEPS[n - 1]}</h1>`}
      ${body}<div class="err"></div></section>`;
    if (n === 6) {
      let owners = (PLA.owners || []).slice();
      if (!owners.length) owners = (PL.knownOwners || []).filter(o => o.legal_name || o.email).map(o => ({ name: o.legal_name || '', pref: o.pref_name || '', email: o.email || '', mobile: o.phone || '' }));
      if (!owners.length) owners.push({ name: '', pref: '', email: PL.contact_email || '', mobile: '' });
      const draw = () => { $('#plOwners').innerHTML = owners.map(plOwnerCard).join(''); $$('[data-rmo]').forEach(b => b.addEventListener('click', () => { owners = plReadOwners(); owners.splice(+b.dataset.rmo, 1); draw(); })); };
      draw();
      $('#plAddO').addEventListener('click', () => { owners = plReadOwners(); owners.push({}); draw(); const l = $$('.plo').pop(); if (l) $('[data-o=name]', l).focus(); });
    }
    actions(true, 'Back', n === 6 ? 'Send to Tim' : 'Next');
    onBack = async () => { plCollect(); await plSave(n); n === 1 ? plAppraisal() : plStep(n - 1); };
    onNext = async () => {
      plCollect();
      if (n < 6) { await plSave(n + 1); return plStep(n + 1); }
      const os = PLA.owners || [];
      if (!os.length) return err('Add at least one owner.');
      if (os.some(o => !o.name)) return err('Add the full name of each owner, as it appears on the title.');
      if (os.some(o => !EMAIL_RE.test(o.email))) return err('Add an email address for each owner. Everyone signs from their own.');
      PLA._step = 6;
      await must(sb.rpc('pl_submit', { p: PL.id, patch: PLA }));
      plNotify('pl_submitted', PL.id);
      PL.status = 'submitted';
      plThanks();
    };
    top();
  }
  async function plSave(step) { PLA._step = step; try { await sb.rpc('pl_save', { p: PL.id, patch: PLA }); } catch (_) { } }

  function plThanks() {
    header('Thank you', '', 100); actions(false);
    main().innerHTML = `<section class="screen active">
      <h1>Thank you, that's everything I need</h1>
      <p class="lede">I'll read your answers carefully and adjust the plan around what matters most to you. Nothing to sign yet.</p>
      <h2>What happens next</h2>
      <ol class="steps-list">
        <li><span class="n">1</span><span>I read your answers and rework the plan</span><span class="t">Within a day or two</span></li>
        <li><span class="n">2</span><span>You get your updated plan, showing what you said and what I've changed</span><span class="t">By email</span></li>
        <li><span class="n">3</span><span>We meet to talk it through and agree the details</span><span class="t">At a time that suits</span></li>
        <li><span class="n">4</span><span>You sign your agency agreement here, when you're ready</span><span class="t">After we meet</span></li>
      </ol>
      <p class="small" style="margin-top:20px">Questions in the meantime? Call or text Tim on <strong>027 562 7207</strong>.</p></section>`;
    top();
  }

  function plPairs() {
    const pairs = ((PL.plan || {}).pairs || []).filter(x => x.said || x.changed);
    return pairs.length ? `<div class="card">${pairs.map((x, i) => `<div class="pair" ${i ? 'style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px"' : ''}><div class="k small" style="font-weight:600;color:var(--muted)">You said</div><p style="margin:2px 0 8px">${esc(x.said).replace(/\n/g, '<br>')}</p><div class="k small" style="font-weight:600;color:var(--ok)">I've changed</div><p style="margin:2px 0 0">${esc(x.changed).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>` : '';
  }
  function plPlan() {
    const name = plFirst(PL);
    header('Your updated plan', '', 100);
    main().innerHTML = `<section class="screen active">
      <h1>Your updated plan</h1>
      <p class="lede">${name ? `Thanks, ${esc(name)}. ` : ''}${(PL.plan || {}).intro ? `<span data-tr-block>${esc(PL.plan.intro).replace(/\n/g, '<br>')}</span>` : 'Here\'s how I\'ve adjusted the plan around what you told me.'}</p>
      ${plPairs()}
      <h2>The plan</h2><div class="card">${plFacts(PL.appraisal || {})}</div>
      <div class="card tight">
        <label class="choice cb" style="margin:0"><input type="checkbox" id="plOk"><span class="mark"></span><span><span class="ct">This plan addresses my concerns</span></span></label>
        <div class="toolbar" style="margin-bottom:0"><button class="btn link" type="button" id="plAsk">I still have a question</button></div>
        <div id="plAskBox" hidden><label class="f" for="plQ">Your question</label><textarea id="plQ" rows="3"></textarea><div class="toolbar"><button class="btn primary" type="button" id="plQGo">Send to Tim</button></div></div>
      </div>
      <div class="err"></div></section>`;
    actions(true, '', 'Continue to signing');
    const nx = $('#next'), sync = () => { nx.disabled = !$('#plOk').checked; };
    $('#plOk').addEventListener('change', sync); sync();
    $('#plAsk').addEventListener('click', () => { $('#plAskBox').hidden = !$('#plAskBox').hidden; if (!$('#plAskBox').hidden) $('#plQ').focus(); });
    $('#plQGo').addEventListener('click', async () => {
      const q = $('#plQ').value.trim(); if (!q) return err('Type your question first.');
      $('#plQGo').disabled = true;
      try { await must(sb.rpc('pl_question', { p: PL.id, q })); plNotify('pl_question', PL.id); PL.status = 'question'; PL.question = q; nx.disabled = false; plQuestionSent(); } catch (_) { $('#plQGo').disabled = false; }
    });
    onNext = async () => {
      if (!$('#plOk').checked) { sync(); return err('Tick "This plan addresses my concerns" to continue, or send Tim your question.'); }
      const aid = await must(sb.rpc('pl_accept', { p: PL.id }));
      plNotify('pl_accepted', PL.id);
      PL.status = 'accepted'; PL.agreement_id = aid;
      nx.disabled = false;
      plOnward();
    };
    top();
  }
  function plQuestionSent() {
    header('Your question', '', 100); actions(false);
    main().innerHTML = `<section class="screen active">
      <h1>Your question is with Tim</h1>
      <div class="card tight"><p style="margin:0">“${esc(PL.question || '')}”</p></div>
      <p class="lede">He'll get back to you, and update your plan if it needs it. You'll get an email when it's ready to look at again.</p>
      <p class="small">Or call or text Tim on <strong>027 562 7207</strong>.</p></section>`;
    top();
  }
  async function plOnward() {
    let ready = false; try { ready = !!(await must(sb.rpc('pl_signing_ready', { p: PL.id }))); } catch (_) { }
    if (ready && PL.agreement_id) { await must(sb.rpc('claim_my_agreements')); return loadVendor(PL.agreement_id); }
    const name = plFirst(PL);
    header('Next: signing', '', 100); actions(false);
    main().innerHTML = `<section class="screen active">
      <h1>Thank you${name ? ', ' + esc(name) : ''}</h1>
      <p class="lede">Your agency agreement is being prepared, with everyone's names and details already filled in from your answers.</p>
      <div class="card"><h3>What happens now</h3><ol class="steps-list">
        <li><span class="n">1</span><span>We meet to agree the details, including my fee</span></li>
        <li><span class="n">2</span><span>I add those to your agreement</span></li>
        <li><span class="n">3</span><span>Everyone on the title signs here, each from their own email</span></li>
      </ol></div>
      <p class="small">Come back to this page any time. When it's ready to sign, it'll open here. Call or text Tim on <strong>027 562 7207</strong>.</p></section>`;
    top();
  }

  /* ───────── agent side ───────── */
  const PL_STATUS = { appraisal: 'Appraisal sent', submitted: 'Answers in: review', plan: 'Plan sent', question: 'Has a question', accepted: 'Ready: add the fee', closed: 'Closed' };
  const plStatusText = pl => pl.status === 'appraisal' && pl.proceeded_at ? 'Answering now' : PL_STATUS[pl.status];
  function plAnswersHTML(pl) {
    const a = pl.answers || {}, ap = pl.appraisal || {};
    const q = (label, k) => `<tr><td style="white-space:normal">${label}</td><td style="white-space:normal">${a[k] ? esc(a[k]).replace(/\n/g, '<br>') : '<span class="small">No answer</span>'}</td></tr>`;
    return `<table class="sum">
      ${q('Have you spoken with anyone else about selling?', 'spoke')}
      ${q('Anything you liked, anything that put you off, or anything that left you wondering?', 'spokeFeel')}
      ${q('If every agent charged exactly the same, who would you choose?', 'choose')}
      ${q('What\'s behind that choice?', 'chooseWhy')}
      ${q('Any other ideas you\'d like built into our plan?', 'ideas')}
      ${PL_PLAN_ITEMS.map(([k, l]) => `<tr><td>Confidence: ${l}</td><td><strong>${(a.conf || {})[k] ? a.conf[k] + ' of 5' : 'Not rated'}</strong> <span class="small">(${esc(ap[k] || 'not set')})</span></td></tr>`).join('')}
      ${q('What do you like most about the plan so far?', 'likeMost')}
      ${q('What would need to be true for working together to be an easy yes?', 'easyYes')}
      <tr><td>Owners</td><td style="white-space:normal">${(a.owners || []).map(o => `${esc(o.name)}${o.pref ? ` (“${esc(o.pref)}”)` : ''}<br><span class="small">${esc(o.email)}${o.mobile ? ' · ' + esc(o.mobile) : ''}</span>`).join('<br>') || 'None yet'}</td></tr>
      <tr><td>Meeting preference</td><td>${esc((a.meet || []).join(', ') || 'None given')}</td></tr>
    </table>`;
  }
  async function viewPrelistingAgent(id, propId) {
    header('Pre-listing', '', 0); actions(false);
    let pl = id ? await must(sb.from('prelistings').select('*').eq('id', id).single()) : { address: '', contact_name: '', contact_email: '', status: 'appraisal', appraisal: {}, answers: {}, plan: {}, property_id: propId || null };
    if (!id && propId) {
      const pr = await must(sb.from('properties').select('address').eq('id', propId).single());
      const o1 = (await must(sb.from('property_people').select('*').eq('property_id', propId).neq('role', 'former').order('position')))[0];
      pl.address = pr.address || ''; if (o1) { pl.contact_name = o1.legal_name || ''; pl.contact_email = o1.email || ''; }
    }
    const ap = pl.appraisal || {}, plan = pl.plan || {};
    const editable = ['appraisal', 'submitted', 'plan', 'question'].includes(pl.status);
    const msg = `Hi ${(pl.contact_name || '').split(/\s+/)[0] || 'there'},\n\nThanks for having me through ${pl.address}. Your appraisal is ready here. Sign in with this email address and you'll get a sign-in link, no password needed:\n\n${APP_URL}\n\nTim`;
    const methods = ['', 'Auction', 'Tender', 'Deadline sale', 'Price by negotiation', 'Fixed price', 'Expressions of interest', 'Timed sale', 'Ballot'];
    let pairs = (plan.pairs || []).slice(); if (!pairs.length) pairs.push({ said: '', changed: '' });
    main().innerHTML = `<div class="view-pad">
      <div class="toolbar no-print"><button class="btn ghost" type="button" id="plBack">Dashboard</button>${pl.property_id ? '<button class="btn ghost" type="button" id="plProp">Property file</button>' : ''}</div>
      <span class="agent-flag">Only you see this</span>
      <h1>${esc(pl.address || 'New appraisal page')}</h1>
      ${id ? `<p><span class="pill">${esc(plStatusText(pl))}</span> <span class="small">${pl.submitted_at ? 'Answers in ' + esc(fmtDT(pl.submitted_at)) : pl.invited_at ? 'Invited ' + esc(fmtDT(pl.invited_at)) : ''}</span></p>` : '<p class="lede">The vendor sees this after your appraisal, with an "I\'d like to proceed" button that opens the questionnaire.</p>'}
      ${pl.status === 'question' ? `<div class="card warnc"><h3>Their question</h3><p style="margin:0">“${esc(pl.question)}”</p><p class="small" style="margin:8px 0 0">Asked ${esc(fmtDT(pl.question_at))}. Reply by phone or email, update the plan below if needed, then publish it again.</p></div>` : ''}
      ${pl.status === 'accepted' ? `<div class="card okc"><h3>They're happy with the plan</h3><p class="small">Accepted ${esc(fmtDT(pl.accepted_at))}. Their agency agreement is ready as a draft, with every owner's name, preferred name, email and mobile filled in. After you meet, add your fee and send it to sign.</p><div class="toolbar"><button class="btn primary" type="button" id="plOpenAg">Open the agreement</button></div></div>` : ''}
      ${['submitted', 'plan', 'question', 'accepted'].includes(pl.status) ? `<h2>Their answers</h2><div class="card">${plAnswersHTML(pl)}</div>` : ''}
      ${['submitted', 'plan', 'question'].includes(pl.status) ? `<h2>Your updated plan for them</h2>
        <p class="small">Write each one as a pair: what they said, and what you've changed. They'll tick that it addresses their concerns before they can go on to sign.</p>
        <label class="f" for="plIntro">Opening line <span class="opt">(optional)</span></label><textarea id="plIntro" rows="2" placeholder="Here's how I've adjusted the plan around what you told me.">${esc(plan.intro || '')}</textarea>
        <div id="plPairs"></div><button class="btn link" type="button" id="plAddPair">+ Add another</button>
        <div class="toolbar"><button class="btn primary" type="button" id="plPublish">${pl.status === 'submitted' ? 'Publish the plan to them' : 'Publish the updated plan again'}</button></div>` : ''}
      ${['plan', 'question', 'accepted'].includes(pl.status) ? '<h2>Your plan in other languages</h2><div id="trPlan"></div>' : ''}
      <h2>Appraisal page</h2>
      <div class="card">
        <label class="f" for="plAddr" style="margin-top:0">Property address</label><input type="text" id="plAddr" value="${esc(pl.address)}" ${editable ? '' : 'disabled'}>
        <div class="row2 stack"><div><label class="f" for="plCName">Vendor's name</label><input type="text" id="plCName" value="${esc(pl.contact_name || '')}" ${editable ? '' : 'disabled'}></div><div><label class="f" for="plCEmail">Vendor's email</label><input type="email" id="plCEmail" value="${esc(pl.contact_email || '')}" ${pl.status === 'appraisal' ? '' : 'disabled'}></div></div>
        <div class="row2 stack"><div><label class="f" for="plMethod">Sale method</label><select id="plMethod" ${editable ? '' : 'disabled'}>${methods.map(m => `<option ${ap.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div><div><label class="f" for="plPrice">Indicative price</label><input type="text" id="plPrice" value="${esc(ap.price || '')}" placeholder="For example: $850,000 to $900,000" ${editable ? '' : 'disabled'}></div></div>
        <div class="row2 stack"><div><label class="f" for="plStart">Start date</label><input type="text" id="plStart" value="${esc(ap.start || '')}" placeholder="For example: early February" ${editable ? '' : 'disabled'}></div><div><label class="f" for="plMkt">Marketing</label><input type="text" id="plMkt" value="${esc(ap.marketing || '')}" placeholder="For example: Premium package, $5,800" ${editable ? '' : 'disabled'}></div></div>
        <label class="f" for="plNote">A note to them <span class="opt">(optional)</span></label><textarea id="plNote" rows="3" ${editable ? '' : 'disabled'}>${esc(ap.note || '')}</textarea>
        <label class="f" for="plLink">Link to your full appraisal <span class="opt">(optional)</span></label><input type="url" id="plLink" value="${esc(ap.link || '')}" placeholder="https://" ${editable ? '' : 'disabled'}>
        ${editable ? `<div class="toolbar"><button class="btn ${id ? 'ghost' : 'primary'}" type="button" id="plSaveAp">${id ? 'Save changes' : 'Create the appraisal page'}</button></div>` : ''}
        <div class="err" id="plApErr"></div>
      </div>
      ${id && pl.status === 'appraisal' ? `<div class="card note no-print"><h3>Send it to them</h3><div class="copybox" id="plMsg">${esc(msg)}</div><div class="toolbar"><button class="btn primary" type="button" id="plEmail">Email it to them</button><button class="btn ghost" type="button" id="plCopy">Copy message</button></div></div>` : ''}
      ${id && pl.status !== 'accepted' ? `<div class="toolbar no-print"><button class="btn link" type="button" id="plClose">${pl.status === 'closed' ? 'Closed' : 'Close this pre-listing'}</button></div>` : ''}
      <div class="err" id="plErr"></div>
    </div>`;
    $('#plBack').addEventListener('click', viewAgentList);
    const ppb = $('#plProp'); if (ppb) ppb.addEventListener('click', () => viewProperty(pl.property_id));
    const readAp = () => ({ address: $('#plAddr').value.trim(), contact_name: $('#plCName').value.trim(), contact_email: $('#plCEmail').value.trim().toLowerCase(), appraisal: { method: $('#plMethod').value, price: $('#plPrice').value.trim(), start: $('#plStart').value.trim(), marketing: $('#plMkt').value.trim(), note: $('#plNote').value.trim(), link: $('#plLink').value.trim() } });
    const sa = $('#plSaveAp'); if (sa) sa.addEventListener('click', async () => {
      const row = readAp(), e = $('#plApErr');
      if (!row.address) return e.textContent = 'Add the property address.';
      if (!EMAIL_RE.test(row.contact_email)) return e.textContent = 'Add the vendor\'s email. They sign in with it.';
      if (row.appraisal.link && !/^https:\/\//.test(row.appraisal.link)) return e.textContent = 'The appraisal link needs to start with https://';
      if (pl.status !== 'appraisal') delete row.contact_email;
      if (id) { await must(sb.from('prelistings').update(row).eq('id', id)); toast('Saved'); viewPrelistingAgent(id); }
      else { if (pl.property_id) row.property_id = pl.property_id; const r = await must(sb.from('prelistings').insert(row).select('id').single()); toast('Appraisal page ready'); viewPrelistingAgent(r.id); }
    });
    const drawPairs = () => { const box = $('#plPairs'); if (!box) return; box.innerHTML = pairs.map((x, i) => `<div class="card tight plp"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">${i + 1}</h3>${pairs.length > 1 ? `<button class="btn link" type="button" data-rmp="${i}">Remove</button>` : ''}</div><label class="f">You said</label><textarea rows="2" data-p="said">${esc(x.said || '')}</textarea><label class="f">I've changed</label><textarea rows="2" data-p="changed">${esc(x.changed || '')}</textarea></div>`).join(''); $$('[data-rmp]').forEach(b => b.addEventListener('click', () => { pairs = readPairs(); pairs.splice(+b.dataset.rmp, 1); drawPairs(); })); };
    const readPairs = () => $$('.plp').map(c => ({ said: $('[data-p=said]', c).value.trim(), changed: $('[data-p=changed]', c).value.trim() }));
    drawPairs();
    const ap2 = $('#plAddPair'); if (ap2) ap2.addEventListener('click', () => { pairs = readPairs(); pairs.push({ said: '', changed: '' }); drawPairs(); });
    if ($('#trPlan')) trPanelDraw($('#trPlan'), 'plan', id, trPlanSources(pl.plan));
    const pub = $('#plPublish'); if (pub) pub.addEventListener('click', async () => {
      const ps = readPairs().filter(x => x.said || x.changed);
      if (!ps.length) return $('#plErr').textContent = 'Add at least one "You said / I\'ve changed" pair.';
      if (ps.some(x => !x.said || !x.changed)) return $('#plErr').textContent = 'Fill in both sides of each pair, or remove the empty one.';
      pub.disabled = true;
      const row = readAp(); delete row.contact_email; if (row.appraisal.link && !/^https:\/\//.test(row.appraisal.link)) delete row.appraisal.link;
      await must(sb.from('prelistings').update(Object.assign(row, { status: 'plan', plan: { intro: $('#plIntro').value.trim(), pairs: ps }, plan_published_at: new Date().toISOString(), question: null })).eq('id', id));
      const { data, error } = await plNotify('pl_plan', id);
      toast(error || (data && data.ok === false) ? 'Published. The email didn\'t send, so let them know it\'s ready.' : 'Published and emailed to them');
      const planNow = { intro: $('#plIntro').value.trim(), pairs: ps };
      trAuto('plan', id, trPlanSources(planNow), () => { if ($('#trPlan')) trPanelDraw($('#trPlan'), 'plan', id, trPlanSources(planNow)); });
      viewPrelistingAgent(id);
    });
    const em = $('#plEmail'); if (em) em.addEventListener('click', async () => { em.disabled = true; const { data, error } = await plNotify('pl_invite', id); if (error || (data && data.ok === false)) toast('The email didn\'t send. Copy the message instead.'); else { toast('Emailed'); viewPrelistingAgent(id); } em.disabled = false; });
    const cp = $('#plCopy'); if (cp) cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); toast('Copied'); } catch { toast('Select the text and copy it'); } });
    const oa = $('#plOpenAg'); if (oa) oa.addEventListener('click', () => viewTable(pl.agreement_id));
    const cl = $('#plClose'); if (cl && pl.status !== 'closed') cl.addEventListener('click', async () => { if (cl.dataset.sure !== '1') { cl.dataset.sure = '1'; cl.textContent = 'Tap again to close it'; return; } await must(sb.from('prelistings').update({ status: 'closed' }).eq('id', id)); toast('Closed'); viewAgentList(); });
    top();
  }
  function plListHTML(pls) {
    return `<h2>Pre-listings</h2>
      <div class="toolbar"><button class="btn ghost" type="button" id="newPl">Let's begin: new appraisal page</button></div>
      ${pls.length ? `<div class="card tight" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Property</th><th>Vendor</th><th>Status</th><th class="hide-sm">Updated</th></tr></thead><tbody>
      ${pls.map(r => `<tr class="click" data-pl="${r.id}"><td><strong>${esc(r.address)}</strong></td><td>${esc(r.contact_name || r.contact_email)}</td><td><span class="pill ${['submitted', 'question', 'accepted'].includes(r.status) ? 'sent' : ''}">${esc(plStatusText(r))}</span></td><td class="small hide-sm">${esc(fmtDT(r.updated_at))}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
  }

  /* AML file */
  const ID_TYPES = ['NZ passport', 'NZ driver licence', 'Overseas passport', 'NZ firearms licence', 'Kiwi Access Card'];
  const ADDR_DOCS = ['Bank statement', 'Rates notice', 'Power or gas bill', 'IRD letter', 'Government agency letter'];
  async function viewAml(agId, personId) {
    header('AML file', '', 0);
    const ag = await must(sb.from('agreements').select('id,ref,address,config,answers').eq('id', agId).single());
    const person = await must(sb.from('agreement_people').select('*').eq('id', personId).single());
    let file = (await must(sb.from('aml_files').select('*').eq('person_id', personId))).at(0);
    if (!file) {
      const ent = (ag.answers || {}).capacity && ag.answers.capacity !== 'Owners';
      const seed = { method: (ag.config.aml || 'Manual') === 'Manual' ? 'f2f' : 'electronic', country: 'New Zealand', f2fDate: new Date().toISOString().slice(0, 10), up: {}, cdd: ent ? 'Enhanced' : 'Standard' };
      if (ent) seed.bo = [`Selling as ${String(ag.answers.capacity).toLowerCase()} for ${ag.answers.entity || '(name to come)'}.`, ag.config.owners ? `Registered owners on the title${ag.config.title ? ' (' + ag.config.title + ')' : ''}: ${ag.config.owners}.` : ''].filter(Boolean).join(' ');
      file = await must(sb.from('aml_files').insert({ agreement_id: agId, person_id: personId, data: seed }).select('*').single());
      await must(sb.from('aml_events').insert({ aml_file_id: file.id, actor: SESSION.user.email, message: 'File opened' }));
    }
    const r = Object.assign({ up: {} }, file.data);
    if (!file.locked_at && (ag.answers || {}).capacity && ag.answers.capacity !== 'Owners') r.cdd = 'Enhanced';   // Tim's rule: anyone not selling as plain owners
    const log = async m => { await must(sb.from('aml_events').insert({ aml_file_id: file.id, actor: SESSION.user.email, message: m })); };
    const persist = async () => { await must(sb.from('aml_files').update({ data: r }).eq('id', file.id)); };
    const L = !!file.locked_at, provider = (ag.config.aml || 'Manual') !== 'Manual' ? ag.config.aml : '';
    const entity = (ag.answers || {}).capacity && ag.answers.capacity !== 'Owners';
    const urls = {};
    for (const [k, u] of Object.entries(r.up || {})) if (u && u.path) { const { data } = await sb.storage.from('private').createSignedUrl(u.path, 600); if (data) urls[k] = data.signedUrl; }
    const events = await must(sb.from('aml_events').select('*').eq('aml_file_id', file.id).order('at', { ascending: false }));
    const T = (k, label, type = 'text', ph = '') => `<div><label class="f" for="m_${k}">${label}</label><input type="${type}" id="m_${k}" data-m="${k}" value="${esc(r[k] || '')}" placeholder="${esc(ph)}"></div>`;
    const S = (k, label, opts) => `<div><label class="f" for="m_${k}">${label}</label><select id="m_${k}" data-m="${k}"><option value="">Choose...</option>${opts.map(o => `<option ${r[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    const R = (k, val, t, d) => `<label class="choice"><input type="radio" name="m_${k}" data-m="${k}" value="${esc(val)}" ${r[k] === val ? 'checked' : ''}><span class="mark"></span><span><span class="ct">${t}</span>${d ? `<span class="cd">${d}</span>` : ''}</span></label>`;
    const U = (k, label) => `<div class="card tight upl"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-weight:500">${label}</span>${L ? '' : `<label class="btn ghost" style="padding:8px 14px;font-size:15px">${r.up[k] ? 'Replace' : 'Take photo or upload'}<input type="file" accept="image/*,application/pdf" data-up="${k}" hidden></label>`}</div>
      ${r.up[k] ? (r.up[k].img && urls[k] ? `<img src="${urls[k]}" alt="${esc(label)}">` : `<p class="small" style="margin:8px 0 0">${urls[k] ? `<a href="${urls[k]}" target="_blank" rel="noopener">${esc(r.up[k].name)}</a>` : esc(r.up[k].name)}</p>`) : '<p class="small" style="margin:6px 0 0">Nothing attached yet</p>'}</div>`;
    const needSecond = r.idType === 'NZ driver licence' || r.idType === 'Kiwi Access Card';
    let idBlock;
    if (r.method === 'electronic') idBlock = person.id_verified_at ? `<div class="card okc tight"><p class="small" style="margin:0">Verified ${esc(fmtDT(person.id_verified_at))}.</p></div>` : `${U('provReport', 'Report from ' + esc(provider || 'the provider'))}<p class="small">Download the result from ${esc(provider || 'the provider')} and attach it here.</p>`;
    else idBlock = `
      <div class="row2 stack">${S('idType', 'Photo ID', ID_TYPES)}${T('country', 'Issuing country')}</div>
      <div class="row2 stack">${T('idNo', 'Document number')}${T('expiry', 'Expiry date', 'date')}</div>
      ${needSecond ? `<div class="card note tight" style="margin-top:14px"><p class="small" style="margin:0 0 6px">A ${esc(r.idType.toLowerCase())} needs a second form of ID.</p>${S('secType', 'Second ID', ['NZ birth certificate', 'NZ citizenship certificate', 'SuperGold card', 'Bank statement in their name', 'IRD letter'])}</div>` : ''}
      ${U('idPhoto', 'Photo of the ID')}
      ${r.method === 'f2f' ? `<div class="choices" style="margin-top:10px"><label class="choice cb"><input type="checkbox" data-m="f2f" ${r.f2f ? 'checked' : ''}><span class="mark"></span><span><span class="ct">I met ${esc(callName(person) || 'this person')} in person and they match the photo</span><span class="cd">Original document sighted, not a copy</span></span></label></div><div class="row2">${T('f2fDate', 'Date met', 'date')}<div></div></div>`
        : `<div class="row2 stack">${T('certName', 'Certified by')}${T('certRole', 'Their role', 'text', 'For example: lawyer, JP')}</div><div class="row2">${T('certDate', 'Date certified', 'date')}<div></div></div><label class="f" for="m_certReason">Why you couldn't meet in person</label><textarea id="m_certReason" data-m="certReason">${esc(r.certReason || '')}</textarea>`}`;
    main().innerHTML = `<div class="view-pad">
      <span class="agent-flag">Only you see this</span>
      <h1>AML file</h1>
      <div class="card tight"><div class="facts"><div class="fact"><div class="k">Client</div><div class="v">${esc(person.legal_name)}</div></div><div class="fact"><div class="k">Property</div><div class="v">${esc(ag.address)}</div></div><div class="fact"><div class="k">Agreement</div><div class="v">${esc(ag.ref)}</div></div><div class="fact"><div class="k">Status</div><div class="v">${L ? 'Complete' : 'In progress'}</div></div></div></div>
      ${L ? `<div class="card okc tight"><h3>Complete and locked</h3><p class="small" style="margin:0">Signed off by ${esc(file.locked_by)}, ${esc(fmtDT(file.locked_at))}. Changes from here are added as dated notes.${file.retain_until ? ' Keep until ' + esc(fmtDate(file.retain_until)) + '.' : ''}</p></div>` : ''}
      <fieldset ${L ? 'disabled' : ''}>
      <h2>1. Level of checks</h2>
      ${entity ? '<div class="card warnc tight"><p class="small" style="margin:0">This client isn\'t selling as a plain owner (they\'re a trustee, director, attorney, executor or other representative), so enhanced checks apply. That\'s your rule for everyone selling this way.</p></div>' : ''}
      <div class="choices">${entity ? R('cdd', 'Enhanced', 'Enhanced', 'Required: they\'re selling other than as plain owners') : R('cdd', 'Standard', 'Standard', 'Most private sellers') + R('cdd', 'Enhanced', 'Enhanced', 'Trusts, companies, attorneys, executors, overseas sellers, politically exposed people, or anything unusual') + R('cdd', 'Simplified', 'Simplified', 'Only for listed entities like government departments')}</div>
      <h2>2. Identity</h2>
      <div class="choices">${R('method', 'f2f', 'In person, original ID', 'You meet them and sight the document')}${R('method', 'cert', 'Certified copy', 'Only when meeting in person genuinely isn\'t possible')}${R('method', 'electronic', 'Electronic, through ' + esc(provider || 'a provider'), '')}</div>
      ${idBlock}
      <h2>3. Date of birth and address</h2>
      <div class="row2 stack">${T('dob', 'Date of birth', 'date')}${S('addrDoc', 'Address proof', ADDR_DOCS)}</div>
      <div class="row2">${T('addrDate', 'Date on the document', 'date')}<div></div></div>
      ${U('addrPhoto', 'Copy of the address proof')}
      <h2>4. Screening</h2>
      <p class="small">Record your politically exposed person and sanctions checks.</p>
      <div class="row2 stack">${S('pep', 'Politically exposed person check', ['No match', 'Match: enhanced checks applied'])}${S('sanc', 'Sanctions check', ['No match', 'Match: do not proceed'])}</div>
      <div class="row2 stack">${T('screenedAt', 'Date checked', 'date')}${T('screenSource', 'Checked using', 'text', 'For example: NZ Police designated list')}</div>
      ${r.cdd === 'Enhanced' ? `<h2>5. Enhanced checks</h2><label class="f" for="m_bo">Who owns or controls the seller</label><textarea id="m_bo" data-m="bo" placeholder="Trustees, beneficiaries, directors, shareholders over 25%, anyone acting on their behalf">${esc(r.bo || '')}</textarea>
        <label class="f" for="m_sof">Source of funds or wealth</label><textarea id="m_sof" data-m="sof">${esc(r.sof || '')}</textarea>${U('trustDeed', 'Trust deed or company extract')}` : ''}
      <h2>${r.cdd === 'Enhanced' ? '6' : '5'}. Risk rating</h2>
      <div class="choices two">${['Low', 'Medium', 'High'].map(x => R('risk', x, x, '')).join('')}</div>
      <label class="f" for="m_riskWhy">Why <span class="opt">(optional for low risk)</span></label><input type="text" id="m_riskWhy" data-m="riskWhy" value="${esc(r.riskWhy || '')}">
      </fieldset>
      ${L ? `<h2>Add a note</h2><textarea id="amlNote" placeholder="For example: ID renewed, new trustee added"></textarea><button type="button" class="btn ghost" id="addNote" style="margin-top:8px">Add dated note</button>` : ''}
      <h2>Record of changes</h2>
      <div class="card tight">${events.map(e => `<div class="fact"><div class="k">${esc(fmtDT(e.at))} · ${esc(e.actor)}</div><div class="v" style="font-weight:400">${esc(e.message)}</div></div>`).join('')}</div>
      <p class="small">Kept for 5 years after the agency ends. Attachments are stored privately and only you can open them.</p>
      <div class="err"></div></div>`;
    $$('[data-m]').forEach(el => {
      const k = el.dataset.m, ev = (el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'change';
      el.addEventListener(ev, async () => {
        if (el.type === 'radio') { if (!el.checked) return; r[k] = el.value; await log(k === 'risk' ? 'Risk rated ' + el.value : k === 'method' ? 'Verification method: ' + el.closest('label').querySelector('.ct').textContent : 'Level of checks: ' + el.value); }
        else if (el.type === 'checkbox') { r[k] = el.checked; if (el.checked && k === 'f2f') await log('Original ID sighted in person, likeness confirmed'); }
        else r[k] = el.value;
        await persist();
        if (el.type === 'radio' || el.tagName === 'SELECT') viewAml(agId, personId);
      });
    });
    $$('[data-up]').forEach(inp => inp.addEventListener('change', async () => {
      const fl = inp.files && inp.files[0]; if (!fl) return;
      const ext = (fl.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `aml/${file.id}/${inp.dataset.up}-${Date.now()}.${ext}`;
      await must(sb.storage.from('private').upload(path, fl, { contentType: fl.type || 'application/octet-stream' }));
      r.up[inp.dataset.up] = { path, name: fl.name, img: (fl.type || '').startsWith('image/') };
      await persist(); await log('Attached: ' + inp.closest('.upl').querySelector('span').textContent);
      viewAml(agId, personId);
    }));
    const an = $('#addNote'); if (an) an.addEventListener('click', async () => { const t = $('#amlNote').value.trim(); if (t) { await log('Note: ' + t); viewAml(agId, personId); } });
    const missing = () => {
      const m = [];
      if (!r.cdd) m.push('level of checks');
      if (r.method === 'electronic') { if (!r.up.provReport && !person.id_verified_at) m.push('the provider report'); }
      else {
        if (!r.idType) m.push('photo ID type'); if (!r.expiry) m.push('ID expiry'); if (!r.up.idPhoto) m.push('photo of the ID');
        if (r.method === 'f2f' && !r.f2f) m.push('confirmation you met them in person');
        if (r.method === 'cert' && (!r.certName || !r.certDate || !String(r.certReason || '').trim())) m.push('certification details and reason');
        if (needSecond && !r.secType) m.push('second ID');
      }
      if (!r.dob) m.push('date of birth'); if (!r.addrDoc) m.push('address proof');
      if (!r.pep || !r.sanc || !r.screenedAt) m.push('screening results and date');
      if (r.cdd === 'Enhanced' && (!String(r.bo || '').trim() || !String(r.sof || '').trim())) m.push('ownership and source of funds');
      if (!r.risk) m.push('risk rating'); if (r.risk && r.risk !== 'Low' && !String(r.riskWhy || '').trim()) m.push('reason for the risk rating');
      return m;
    };
    actions(true, 'Back to agreement', L ? '' : 'Complete and lock file');
    onBack = () => viewAgentDetail(agId);
    onNext = async () => {
      $$('[data-m]').forEach(el => { if (el.type !== 'radio' && el.type !== 'checkbox') r[el.dataset.m] = el.value; });
      await persist();
      const m = missing();
      if (m.length) { const e = $('.err', main()); e.textContent = 'Still needed: ' + m.join(', ') + '.'; e.scrollIntoView({ block: 'center' }); return; }
      await must(sb.from('aml_files').update({ locked_at: new Date().toISOString(), locked_by: 'Tim McGuire, compliance officer' }).eq('id', file.id));
      toast('AML file locked'); viewAml(agId, personId);
    };
    top();
  }

  async function viewLawyer(token) {
    header('Read-only review', '', 0); actions(false); $('#signOut').hidden = true;
    let d;
    try {
      const r = await fetch(`${SB_URL}/functions/v1/lawyer-view?token=${encodeURIComponent(token)}`, { headers: { apikey: SB_KEY } });
      d = await r.json();
      if (!r.ok) throw new Error(d.error || 'This link isn\'t valid.');
    } catch (e) { main().innerHTML = `<div class="login-card"><h1>Link not available</h1><p class="lede">${esc(e.message)}</p><p class="small">Tim McGuire · 027 562 7207 · tim@mcguire.co.nz</p></div>`; return; }
    const ag = d.agreement, c = ag.config || {}, an = ag.answers || {}, pk = pkgOf(c), later = pk.name === 'Later' || an.mkt === 'later';
    const isSigned = ['signed', 'countersigned', 'ended'].includes(ag.status);
    const sellers = esc((d.people || []).map(p => p.legal_name).filter(Boolean).join(' and '));
    const someSigned = (d.people || []).some(p => p.signed_at);
    header(isSigned ? 'Signed agreement' : 'Draft for review', '', 0);
    const row = (k, v) => `<tr><td>${k}</td><td style="white-space:normal">${v}</td></tr>`;
    main().innerHTML = `<div class="view-pad">
      <span class="agent-flag">Read-only · for ${esc(d.lawyer.name)}</span>
      ${isSigned
        ? `<div class="lawyer-banner signed">✓ SIGNED AGREEMENT<small>This is the executed copy, signed by ${sellers}${ag.signed_at ? ' (all signed ' + esc(fmtDT(ag.signed_at)) + ')' : ''}${ag.countersigned_at ? ' and countersigned by Timothy McGuire ' + esc(fmtDT(ag.countersigned_at)) : ''}. It can't be changed here.</small></div>`
        : `<div class="lawyer-banner draft">DRAFT FOR REVIEW: NOT SIGNED<small>${someSigned ? 'Not everyone has signed yet, so this agreement is not in effect.' : 'Nobody has signed this. Your client is waiting for your advice before signing.'} If you'd like changes, reply to the email or call Tim, and he'll update it.</small></div>`}
      <h1>${esc(ag.address)}</h1>
      <p class="lede">${isSigned ? 'Signed' : 'Draft'} Sole and Exclusive Agency Agreement between McGuire Real Estate and ${sellers}.</p>
      <p class="small">${esc(ag.ref)} · ${esc(ag.agreement_version)}</p>
      <div class="toolbar no-print"><a class="btn primary" href="${SB_URL}/functions/v1/agreement-pdf?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="text-decoration:none">${isSigned ? 'Signed agreement with all terms and signatures (PDF)' : 'Draft agreement with all terms (PDF)'}</a></div>
      <h2>Appointment of agency (front page)</h2>
      <div class="card"><table class="sum">
        ${row('A. Client(s)', esc((d.people || []).map(p => p.legal_name).filter(Boolean).join(' and ')) + (an.capacity && an.capacity !== 'Owners' ? `, as ${esc(an.capacity.toLowerCase())} for ${esc(an.entity || '')}` : '') + `<br><span class="small">GST registered: ${an.gst === 'yes' ? 'Yes' : 'No'}</span>`)}
        ${row('B. Property', esc(ag.address) + (c.owners ? `<br><span class="small">Registered owners: ${esc(c.owners)}${c.title ? ' · ' + esc(c.title) : ''}</span>` : ''))}
        ${row('C. Commencement', c.appr === 'pending' ? 'On receipt of written appraisal' : esc(c.start ? fmtDate(c.start) : 'On signing') + '. Review date 90 days after commencement')}
        ${row('D. Commission', esc(commText(c)) + (c.appr === 'pending' ? '' : `<br><span class="small">At ${money(num(c.ask))}: ${money(r2(commission(c, num(c.ask))))} plus GST</span>`))}
        ${row('E. Costs on signing', [limAmt(c) ? 'LIM ' + money(limAmt(c)) : '', adminAmt(c) ? 'administration fee ' + money(adminAmt(c)) : '', 'marketing ' + (later ? 'to be agreed' : esc(pk.label) + ' ' + money(pk.amt))].filter(Boolean).join(', ') + ' (including GST)')}
        ${c.method ? row('Method of sale', esc(c.method)) : ''}
        ${c.appr === 'pending' ? row('Condition', 'Takes effect on receipt of a written appraisal. The client may cancel within 2 working days of receiving it, at no cost.') : ''}
        ${row('Cancellation', c.approach === 'unsolicited' ? 'Unsolicited approach: the client may cancel within 5 working days of receiving a copy.' : 'The client may cancel by 5pm on the first working day after receiving a copy (s130 REAA 2008).')}
      </table></div>
      ${c.campaign ? `<h2>Marketing campaign (Schedule 6)</h2><div class="card">${campaignHTML(c.campaign.snapshot || { lines: [], included: [] })}</div>` : ''}
      ${c.schedule && (c.schedule.phases || []).length ? `<h2>Campaign schedule (Schedule 7)</h2>${scheduleHTML(c.schedule)}` : ''}
      <h2>Property Description and client answers</h2>
      <div class="card"><table class="sum">
        ${row('Property', `${esc(an.pBed || '?')} bed, ${esc(an.pBath || '?')} bath ${esc((an.pType || '').toLowerCase())}, ${esc(an.pFloor || '?')}m² on ${esc(an.pLand || '?')}m², built ${esc(an.pYear || '?')}`)}
        ${row('Construction', [an.pBuild, an.pPark, an.pHeat].filter(Boolean).map(esc).join(' · '))}
        ${row('Chattels', esc((an.chattels || []).join(', ')) + (an.chatOther ? '. ' + esc(an.chatOther) : ''))}
        ${row('Work done', an.work === 'yes' ? esc(an.workDetail) : an.work === 'no' ? 'None known' : 'Not answered yet')}
        ${row('Weathertightness', an.wt === 'yes' ? esc(an.wtDetail) : an.wt === 'no' ? 'No issues known' : 'Not answered yet')}
        ${row('Methamphetamine', an.meth === 'yes' ? esc(an.methDetail) : an.meth === 'no' ? 'None known' : 'Not answered yet')}
        ${row('Defects or notices', an.def === 'yes' ? esc(an.defDetail) : an.def === 'no' ? 'None known' : 'Not answered yet')}
        ${row('Hazards', esc((an.hazards || []).join(', ')) + (an.hazOther ? '. ' + esc(an.hazOther) : ''))}
        ${row('Visiting professionals', `McGuire representative present at every visit; quotes ${an.vQuotes === false ? 'not allowed' : 'allowed'}; sales assessments ${an.vSales ? 'allowed' : 'not allowed'}; ${esc((an.vNotice || 'Same day is fine').toLowerCase())} notice`)}
        ${row('Other agencies', an.prior === 'yes' ? 'Yes: ' + esc(priorText(an)) : an.prior ? 'None' : 'Not answered yet')}
        ${row('Interested buyers', (an.interested || []).length ? an.interested.map(b => esc(b.name) + (b.exclude ? ' (excluded for 10 working days)' : ' (to be negotiated by the agent)')).join('<br>') : 'None listed')}
      </table></div>
      ${(d.people || []).some(p => p.signed_at) ? `<h2>Signatures</h2><div class="card"><table class="sum">${d.people.filter(p => p.signed_at).map(p => row(esc(p.legal_name), 'Signed ' + esc(fmtDT(p.signed_at)))).join('')}${ag.countersigned_at ? row('Timothy McGuire REA#20117983', 'Countersigned ' + esc(fmtDT(ag.countersigned_at))) : ''}</table></div>` : ''}
      <h2>Standard terms</h2>
      <div class="card"><p style="margin:0">The front page is read together with McGuire Real Estate's standard Terms and Conditions (${esc(ag.agreement_version)}). The PDF above contains the complete agreement: the filled front page, every term, the schedules and the signature record.</p>
        <p class="small" style="margin:10px 0 0">Real Estate Authority guides: <a href="${REA_AA}" target="_blank" rel="noopener">agency agreements</a> · <a href="${REA_SP}" target="_blank" rel="noopener">sale and purchase agreements</a></p></div>
    </div>`;
    top();
  }

  /* ═════════ JOURNEY MAP (phase 3): the nine-stop selling pathway. Vendors open it from the top bar (a panel over whatever they were doing, so nothing typed is lost); Tim sees it as a tile on each property ═════════ */
  let JREADY = false, JOPENER = null, JVIEW = {}, JDIRTY = false;   // JVIEW: the vendor's current screen; JDIRTY: something typed on it since it was drawn
  const JCTX = { pid: null };   // the property the vendor is looking at right now, if a screen has said so
  const JSTOPS = [
    { t: 'Thinking of selling', say: 'This is where it starts: Tim gives you an appraisal of your property, and you tell him what matters to you about selling. Nothing is signed at this stage.' },
    { t: 'Your updated plan', say: 'Tim reads your answers and sends you an updated plan, showing what you said and what he has changed. You can tick that it works for you, or ask him a question.' },
    { t: 'Meeting Tim', say: 'You and Tim sit down, in person or by video, to talk the plan through and agree the details, including his fee.' },
    { t: 'Your agreement', say: 'You read your agency agreement in plain English, ask your lawyer first if you would like to, and then everyone on the title signs, each from their own phone.' },
    { t: 'Identity check', say: 'The law asks Tim to confirm who each seller is before he acts for you. Each person shows a driver\'s licence or passport, and something with their address.' },
    { t: 'Getting ready', say: 'After you sign, there is some paperwork so buyers have what they need: the Vendor Declaration, a Healthy Homes statement if your property is tenanted, and the Real Estate Authority\'s guide to sale and purchase agreements, under Before you sell. Tim also gets your marketing ready with you.' },
    { t: 'On the market', say: 'Your property is shown to buyers through the marketing set out in your agreement. There is no page for this stop yet. If you would like to know anything, call or text Tim on 027 562 7207.' },
    { t: 'An offer', say: 'When a buyer makes an offer, Tim brings it to you and talks it through. The decision is always yours. There is no page for this stop yet.' },
    { t: 'Sold and settling', say: 'Once there is a signed sale and purchase agreement with its conditions met, the lawyers arrange settlement, when payment is made and the keys change hands. There is no page for this stop yet.' },
  ];
  // small line drawings, centred on 0,0 and about 26 wide: bulb, plan, speech bubbles, agreement with a signature, ID card, paint roller, for-sale sign, envelope, house
  const JICONS = [
    '<path d="M0 -12a8 8 0 0 1 4.6 14.5V7h-9.2V2.5A8 8 0 0 1 0 -12Z"/><path d="M-3.4 11h6.8"/>',
    '<rect x="-9" y="-12" width="18" height="24" rx="2.5"/><path d="M-4.5 -5h9M-4.5 0h9M-4.5 5h5"/>',
    '<path d="M-13 -9a2.5 2.5 0 0 1 2.5 -2.5h10a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1 -2.5 2.5h-6l-4 3.5v-3.5a2.5 2.5 0 0 1 -2.5 -2.5Z"/><path d="M5 1.5h8v7h-1.5v3l-4-3H5Z"/>',
    '<rect x="-10" y="-12" width="20" height="24" rx="2.5"/><path d="M-5 -6h10M-5 -1.5h6"/><path d="M-6 6c2-6 3-6 4-2s2 3 4 0 2-2 4 0"/>',
    '<rect x="-13" y="-9" width="26" height="18" rx="3"/><circle cx="-6" cy="-1.5" r="3"/><path d="M-10.5 6c.8-2.4 2.6-3.5 4.5-3.5s3.7 1.1 4.5 3.5M2 -3h7M2 2h5"/>',
    '<rect x="-12" y="-12" width="19" height="8" rx="2"/><path d="M7 -8h4v7h-12v4"/><rect x="-4.5" y="3" width="5" height="9" rx="1.5"/>',
    '<path d="M-9 13V-12"/><path d="M-9 -11h20v12h-20"/><path d="M-4 -5h10M-4 -0.5h6"/>',
    '<rect x="-13" y="-9" width="26" height="18" rx="2.5"/><path d="M-12 -7.5L0 2l12 -9.5"/>',
    '<path d="M-13 1L0 -11l13 12"/><path d="M-9.5 -2V12h19V-2"/><path d="M-3 12V5h6v7"/>',
  ];
  const J_AT = { appraisal: 1, questionnaire: 1, plan: 2, accepted: 3, agreement: 4, live: 7, under_offer: 8, sold: 9 };
  // where the marker sits (1 to 9; 10 once settled; 0 when there is nothing to show), from the property's stage and whether everyone's identity is checked
  function jState(f) {
    const s = f && f.stage;
    const cur = s === 'signed' ? (f.idAll ? 6 : 5) : s === 'settled' ? 10 : s === 'questionnaire' && f.plSent ? 2 : (J_AT[s] || 0);   // the questionnaire counts as sent once it is with Tim
    return { cur, withdrawn: s === 'withdrawn' };
  }
  // done = passed, or (identity check only) already finished even though the marker is earlier
  const jStateOf = (st, f, k) => !st.cur ? 'plain' : (k < st.cur || st.cur === 10 || (k === 5 && f && f.idAll)) ? 'done' : k === st.cur ? 'here' : 'ahead';
  const J_STATE_TEXT = { done: 'Done', here: 'You are here', ahead: 'Still ahead', plain: '' };
  let JSEQ = 0;
  function jMapSVG(st, f, o) {
    const GAP = 104, TOP = 96, X = i => i % 2 ? 268 : 92, Y = i => TOP + i * GAP, id = ++JSEQ, links = o.links || {};
    const here = o.agent ? 'Here now' : 'You are here';
    let road = `M${X(0)} 40L${X(0)} ${Y(0)}`;
    for (let i = 0; i < 8; i++) road += `C${X(i)} ${Y(i) + 52} ${X(i + 1)} ${Y(i + 1) - 52} ${X(i + 1)} ${Y(i + 1)}`;
    road += `L${X(8)} ${Y(8) + 56}`;
    let dots = `<path class="road-d ${st.cur >= 1 ? 'done' : 'ahead'}" d="M${X(0)} 40L${X(0)} ${Y(0)}"/>`;
    for (let i = 0; i < 8; i++) dots += `<path class="road-d ${st.cur >= i + 2 ? 'done' : 'ahead'}" d="M${X(i)} ${Y(i)}C${X(i)} ${Y(i) + 52} ${X(i + 1)} ${Y(i + 1) - 52} ${X(i + 1)} ${Y(i + 1)}"/>`;
    dots += `<path class="road-d ${st.cur === 10 ? 'done' : 'ahead'}" d="M${X(8)} ${Y(8)}L${X(8)} ${Y(8) + 56}"/>`;
    const trees = Array.from({ length: 8 }, (_, i) => `<g transform="translate(${i % 2 ? 330 : 30} ${Y(i) + 52})"><path class="tree-t" d="M0 6V17"/><circle class="tree-c" cx="0" cy="-3" r="11"/></g>`).join('');
    let stops = '';
    for (let i = 0; i < 9; i++) {
      const k = i + 1, x = X(i), y = Y(i), left = i % 2 === 0, s = jStateOf(st, f, k), tx = left ? x + 42 : x - 42, anc = left ? 'start' : 'end';
      const link = !!links[k], act = !o.agent;
      const label = `${trs('{n} of 9: {stop}.', { n: k, stop: trs(JSTOPS[i].t) })}${J_STATE_TEXT[s] ? ' ' + trs(s === 'here' ? here : J_STATE_TEXT[s]) + '.' : ''}${act ? ' ' + trs(link ? 'Opens this page.' : 'Shows what happens at this stop.') : ''}`;
      const pillX = left ? tx : tx - 108;
      stops += `<g class="jstop ${s}${act ? (link ? ' link' : ' read') : ''}" data-j="${k}" ${act ? `tabindex="0" role="${link ? 'link' : 'button'}" aria-label="${esc(label)}"` : ''}>
        <rect class="jhit" x="${left ? x - 36 : 6}" y="${y - 36}" width="298" height="72" rx="14"/>
        ${s === 'here' ? `<circle class="pulse" cx="${x}" cy="${y}" r="30"/>` : ''}
        <circle class="node" cx="${x}" cy="${y}" r="${s === 'here' ? 30 : 26}"/>
        <g class="jic" transform="translate(${x} ${y}) scale(.95)">${JICONS[i]}</g>
        ${s === 'done' ? `<g transform="translate(${x + 20} ${y - 20})"><circle class="tick-b" r="10.5"/><path class="tick-m" d="M-4.5 .5l3 3 6-6.5"/></g>` : ''}
        <text class="jt" x="${tx}" y="${s === 'plain' ? y + 6 : y - 5}" text-anchor="${anc}">${k}. ${esc(JSTOPS[i].t)}</text>
        ${s === 'here' ? `<rect class="pill-b" x="${pillX}" y="${y + 3}" width="108" height="25" rx="12.5"/><text class="pill-t" x="${pillX + 54}" y="${y + 20.5}" text-anchor="middle">${here}</text>` : s === 'plain' ? '' : `<text class="js" x="${tx}" y="${y + 19}" text-anchor="${anc}">${J_STATE_TEXT[s]}</text>`}
      </g>`;
    }
    const sum = o.agent ? (st.cur === 10 ? 'All nine stops are done.' : st.cur ? `At stop ${st.cur} of 9, ${JSTOPS[st.cur - 1].t}.` : 'No stop to show.') : '';
    return `<svg class="jmap" viewBox="0 0 360 1040" xmlns="http://www.w3.org/2000/svg" role="${o.agent ? 'img' : 'group'}" aria-labelledby="jmt${id}" preserveAspectRatio="xMidYMin meet" style="overflow:hidden">
      <title id="jmt${id}">The selling pathway in nine stops, from thinking of selling to sold and settling.${sum ? ' ' + esc(sum) : ''}</title>
      <path class="hill" d="M0 1040V1002Q70 978 150 1002T300 998 360 988V1040Z"/>
      <g aria-hidden="true"><circle class="sun" cx="318" cy="38" r="15"/><path class="cloud" d="M196 52a7 7 0 0 1 2-13.6 10 10 0 0 1 19 2 6.5 6.5 0 0 1 1 11.6Z"/><path class="cloud" d="M120 30a5 5 0 0 1 1.5-9.6 7 7 0 0 1 13.5 1.4 4.6 4.6 0 0 1 .7 8.2Z"/>${trees}</g>
      <path class="road-e" d="${road}"/><path class="road-f" d="${road}"/>${dots}
      <g class="flag ${st.cur === 10 ? 'done' : ''}" aria-hidden="true"><path class="flag-p" d="M${X(8)} 1008V966"/><path class="flag-c" d="M${X(8)} 968h26l-6 8 6 8h-26z"/></g>
      ${stops}
    </svg>`;
  }
  function jDetail(k, f) {
    if (!f) return '';
    if (k === 4 && f.agStatus) return f.agStatus === 'parked' ? 'Paused while the lawyer takes a look.' : ['signed', 'countersigned'].includes(f.agStatus) ? (f.agStatus === 'countersigned' ? 'Signed by everyone, and by Tim.' : 'Signed by everyone.') : f.signedTotal ? `${f.signedN} of ${f.signedTotal} have signed.` : '';
    if (k === 5 && f.idTotal) return f.idAll ? 'Everyone has been checked.' : `${f.idDone} of ${f.idTotal} checked so far.`;
    if (k === 6 && f.paper) return `Paperwork: ${f.paper.done} of ${f.paper.total} done.`;
    // stops 7 to 9 say only what the stage is, in plain words: nothing about an offer, its size or what may happen next
    if (k === 7 && f.stage === 'live') return 'Your property is on the market.';
    if (k === 8 && f.stage === 'under_offer') return 'Your property is under offer.';
    if (k === 9 && f.stage === 'sold') return 'Your property has sold. Settlement is next.';
    if (k === 9 && f.stage === 'settled') return 'Settlement is done.';
    return '';
  }
  function jCardsHTML(st, f, o) {
    const links = o.links || {}, here = o.agent ? 'Here now' : 'You are here';
    return `<ol class="jlist"${o.id ? ` id="${o.id}"` : ''} aria-label="The nine stops">${JSTOPS.map((s, i) => {
      const k = i + 1, c = jStateOf(st, f, k), tag = c === 'here' ? here : J_STATE_TEXT[c], det = jDetail(k, f);
      return `<li class="jcard ${c}" id="jc${o.uid}-${k}" data-jc="${k}" tabindex="-1" ${c === 'here' ? 'aria-current="step"' : ''}>
        <div class="jc-h"><span class="jc-n" aria-hidden="true">${c === 'done' ? '✓' : k}</span><h3>${esc(s.t)}</h3>${tag ? `<span class="jc-st">${esc(tag)}</span>` : ''}</div>
        ${o.agent ? '' : `<p>${esc(s.say).replace(' There is no page for this stop yet.', '<span class="nopage"> There is no page for this stop yet.</span>')}</p>`}${det ? `<p class="jdetail">${esc(det)}</p>` : ''}
        ${links[k] ? `<div class="toolbar"><button class="btn ghost jgo" type="button" data-jgo="${k}">${esc(links[k].label)}</button></div>` : ''}
      </li>`;
    }).join('')}</ol>`;
  }

  /* vendor: what this vendor can see of the property, through the same rules as everything else (a person set aside sees nothing) */
  const jOne = async p => { try { const { data, error } = await p; return error ? null : data; } catch (_) { return null; } };
  async function jLoadVendor(pid) {
    const pr = await jOne(sb.from('properties').select('id,address,stage,cycle_at').eq('id', pid).single());
    if (!pr) return null;
    const f = { pid, address: pr.address || '', stage: pr.stage, agId: null, agStatus: null, plId: null, idDone: 0, idTotal: 0, idAll: false, signedN: 0, signedTotal: 0, meSigned: false, paper: null, plSent: false, step: 0 };
    const ags = (await jOne(sb.from('agreements').select('id,status,created_at,answers').eq('property_id', pid).order('created_at', { ascending: false }))) || [];
    const ag = ags.find(a => !['ended', 'cancelled'].includes(a.status)) || null;
    const pls = (await jOne(sb.from('prelistings').select('id,status,created_at').eq('property_id', pid).order('created_at', { ascending: false }))) || [];
    const pl = pls.find(x => x.status !== 'closed' && (!pr.cycle_at || x.created_at >= pr.cycle_at)) || null;
    if (pl) { f.plId = pl.id; f.plSent = pl.status === 'submitted'; }
    if (ag) {
      f.agId = ag.id; f.agStatus = ag.status; f.step = +((ag.answers || {})._step || 0);
      const ppl = ((await jOne(sb.from('agreement_people').select('id,legal_name,user_id,signed_at,id_verified_at').eq('agreement_id', ag.id))) || []).filter(x => x.legal_name);
      f.idTotal = ppl.length; f.idDone = ppl.filter(x => x.id_verified_at).length; f.idAll = f.idTotal > 0 && f.idDone === f.idTotal;
      f.signedTotal = ppl.length; f.signedN = ppl.filter(x => x.signed_at).length;
      const me = ppl.find(x => SESSION && x.user_id === SESSION.user.id) || null;
      f.meSigned = !!(me && me.signed_at);
      if (['signed', 'countersigned'].includes(ag.status)) {
        const forms = (await jOne(sb.from('property_forms').select('kind,status').eq('agreement_id', ag.id))) || [];
        const g = GUIDES.sale_purchase;
        let total = 1, done = forms.some(x => x.kind === 'vendor_declaration' && x.status === 'signed') ? 1 : 0;
        if (forms.some(x => x.kind === 'healthy_homes')) { total++; if (forms.some(x => x.kind === 'healthy_homes' && x.status === 'signed')) done++; }
        if (g && me) {
          total++;
          const rc = (await jOne(sb.from('guide_receipts').select('person_id,guide,version').eq('agreement_id', ag.id))) || [];
          const sg = (await jOne(sb.from('signatures').select('person_id,snapshot').eq('agreement_id', ag.id).eq('signer_role', 'client'))) || [];
          if (rc.some(r => r.person_id === me.id && r.guide === 'sale_purchase' && r.version === g.version) || sg.some(s => s.person_id === me.id && ((s.snapshot || {}).rea_guides || []).some(x => x.guide === 'sale_purchase' && x.version === g.version))) done++;
        }
        f.paper = { done, total };
      }
    }
    return f;
  }
  // a stop links only to a page this vendor can really open right now
  function jVendorLinks(f) {
    const L = {};
    if (!f) return L;
    const onAg = () => JVIEW.ag === f.agId;
    if (f.plId) [1, 2, 3].forEach(k => { L[k] = { label: 'Open your appraisal and plan', same: () => JVIEW.pl === f.plId, go: () => viewPrelisting(f.plId) }; });
    if (f.agId && f.agStatus !== 'draft') L[4] = { label: 'Open your agreement', same: onAg, go: () => loadVendor(f.agId) };
    // the identity step only for someone who has already reached it: a link never moves a vendor's saved step forward, or past a page they haven't done
    const unsigned = () => A && A.id === f.agId && A.status === 'sent' && !(ME && ME.signed_at);
    if (f.agId && f.agStatus === 'sent' && !f.meSigned && f.step >= 8) L[5] = { label: 'Open the identity check', same: () => onAg() && unsigned() && STEP === 8,
      go: async () => { if (onAg() && unsigned()) return showStep(8); await loadVendor(f.agId); if (unsigned() && STEP >= 8) showStep(8); } };
    if (f.agId && ['signed', 'countersigned'].includes(f.agStatus)) L[6] = { label: 'Open your paperwork', same: onAg, go: () => loadVendor(f.agId) };
    return L;
  }

  let JLINKS = {};
  function jInert(on) { ['header.top', '#main', '#actions', '#toast'].forEach(s => { const el = $(s); if (el) el.inert = !!on; }); }
  function closeJourney() {
    const ov = $('#journey'); if (!ov || ov.hidden) return;
    ov.hidden = true; ov.innerHTML = ''; document.body.classList.remove('journey-open'); jInert(false);
    const o = JOPENER; JOPENER = null; if (o && o.focus && document.contains(o)) o.focus({ preventScroll: true });
  }
  async function openJourney() {
    if (IS_AGENT) return;
    const ov = $('#journey');
    if (ov.hidden) JOPENER = document.activeElement;
    ov.hidden = false; document.body.classList.add('journey-open'); jInert(true);
    ov.innerHTML = '<div class="jov-in"><div class="loading">Loading...</div></div>';
    let pid = JCTX.pid, choose = null;
    if (SESSION && !pid) {
      const rows = (await jOne(sb.from('properties').select('id,address,stage').order('created_at', { ascending: false }))) || [];
      if (rows.length === 1) pid = rows[0].id; else if (rows.length > 1) choose = rows;
    }
    const f = SESSION && pid ? await jLoadVendor(pid) : null;
    if (ov.hidden) return;
    jRender(f, choose);
  }
  function jRender(f, choose) {
    const ov = $('#journey'), signedIn = !!SESSION, st = jState(f), links = jVendorLinks(f);
    JLINKS = links;
    const logo = ($('.logo-light') || {}).src || '';
    const lede = f && st.cur === 10 ? 'You have been through every stop. Thank you for choosing McGuire Real Estate.'
      : f && st.cur ? 'This is the road from thinking about selling to settlement. The marker shows the stop you are at with Tim right now. Tap a stop to read what happens there, or to open its page.'
      : f && st.withdrawn ? 'This property is not on the selling road at the moment. Here is the whole road, in case it helps. If you would like to talk it through, call or text Tim on 027 562 7207.'
      : 'This is the road from thinking about selling to settlement, one stop at a time. Tap a stop to read what happens there.';
    ov.innerHTML = `<div class="jov-in">
      <div class="jbar"><button class="btn ghost" type="button" id="jClose">Close</button>${I18N.selectHTML()}<button class="btn ghost" type="button" id="jPrint">Print this page</button></div>
      <div class="print-only jhead"><img src="${esc(logo)}" alt="McGuire Real Estate"><span data-no-tr>Tim McGuire<br>027 562 7207</span></div>
      <h1 id="jTitle" tabindex="-1">Your selling journey</h1>
      ${f && f.address ? `<p class="jaddr">${esc(f.address)}</p>` : ''}
      <p class="lede">${esc(lede)}</p>
      ${choose ? `<div class="card tight no-print" id="jChoose"><h3>Which property?</h3><p class="small" style="margin:0 0 8px">You have more than one. Choose the one you would like to see.</p><div class="toolbar" style="margin:0">${choose.map(r => `<button class="btn ghost" type="button" data-jpick="${esc(r.id)}">${esc(r.address || 'Address to come')}</button>`).join('')}</div></div>` : ''}
      ${signedIn && !f && !choose ? '<div class="card note tight no-print"><p class="small" style="margin:0">Once Tim has your property set up, the marker will show where you are. Until then, here is the whole road.</p></div>' : ''}
      <div class="jwrap"><div class="jmapcol">${jMapSVG(st, f, { links })}</div><div>${jCardsHTML(st, f, { links, uid: 'v' })}<p class="small jnote">Questions at any stage? Call or text Tim on <strong>027 562 7207</strong>.</p></div></div>
    </div>`;
    ov.scrollTop = 0; I18N.syncSelects();
    const h = $('#jTitle'); if (h) h.focus({ preventScroll: true });
  }
  async function jGo(k) {
    const l = JLINKS[k]; if (!l) return;
    if (l.same && l.same()) return closeJourney();   // already on that page: leave it exactly as it is
    if (JDIRTY && !confirm(trs('You have typed something on this page that is not saved yet. If you go to another page it will be lost. Go anyway?'))) return;
    closeJourney();
    try { await l.go(); } catch (e) { console.error(e); }
  }
  function jReveal(k) {
    const c = $('#jcv-' + k); if (!c) return;
    c.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); c.focus({ preventScroll: true });
  }
  const jActivate = k => JLINKS[k] ? jGo(k) : jReveal(k);
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#main')) JDIRTY = true; });
  $('#journeyBtn').addEventListener('click', openJourney);
  $('#journey').addEventListener('click', async e => {
    if (e.target.closest('#jClose')) return closeJourney();
    if (e.target.closest('#jPrint')) return window.print();
    const pk = e.target.closest('[data-jpick]');
    if (pk) { JCTX.pid = null; const f = await jLoadVendor(pk.dataset.jpick); return jRender(f, null); }
    const go = e.target.closest('[data-jgo]'); if (go) return jGo(+go.dataset.jgo);
    const st = e.target.closest('.jstop[data-j]'); if (st) jActivate(+st.dataset.j);
  });
  $('#journey').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.jstop[data-j]')) { e.preventDefault(); jActivate(+e.target.dataset.j); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeJourney(); });

  /* Tim: the "Where are they" tile on a property page */
  function jTileHTML(p, live, pforms, pl) {
    const ppl = ((live && live.agreement_people) || []).filter(x => x.legal_name);
    const f = { stage: p.stage, idTotal: ppl.length, idDone: ppl.filter(x => x.id_verified_at).length, signedTotal: ppl.length, signedN: ppl.filter(x => x.signed_at).length, agStatus: live ? live.status : null, paper: null, plSent: !!(pl && pl.status === 'submitted') };
    f.idAll = f.idTotal > 0 && f.idDone === f.idTotal;
    if (live && ['signed', 'countersigned'].includes(live.status)) {
      const hh = pforms.find(x => x.kind === 'healthy_homes');
      f.paper = { done: (pforms.some(x => x.kind === 'vendor_declaration' && x.status === 'signed') ? 1 : 0) + (hh && hh.status === 'signed' ? 1 : 0), total: 1 + (hh ? 1 : 0) };
    }
    const st = jState(f);
    const where = st.cur === 10 ? 'All nine stops are done' : st.cur ? `Stop ${st.cur} of 9: ${JSTOPS[st.cur - 1].t}` : st.withdrawn ? 'Withdrawn, so not on the road' : 'No stage to show yet';
    return `<div class="card ptile jtile no-print" id="jTile"><h3>Where are they</h3>
      <p class="small" style="margin:0 0 8px">${esc(where)}. This is the same map the vendors see.</p>
      <div class="jtile-grid"><div class="jtile-map">${jMapSVG(st, f, { agent: true })}</div><div><button class="btn ghost jtoggle" type="button" id="jToggle" aria-expanded="false" aria-controls="jListA">Show every stop</button>${jCardsHTML(st, f, { agent: true, uid: 'a', id: 'jListA' })}</div></div></div>`;
  }

  try { const cp = new URLSearchParams(location.search).get('campaign'); if (cp) { localStorage.setItem('pendingCampaign', decodeURIComponent(escape(atob(cp)))); history.replaceState(null, '', location.pathname); } } catch (_) { }
  const lawyerToken = new URLSearchParams(location.search).get('lawyer');
  if (lawyerToken) { const w = $('#langWrap'); if (w) w.hidden = true; viewLawyer(lawyerToken); return; }
  I18N.init(); I18N.setHooks({ pick: c => chooseLang(c) });
  { const l0 = readLocalLang(); if (l0 && l0 !== 'en') chooseLang(l0, { fromRecord: true }); }

  boot().catch(e => { console.error(e); main().innerHTML = `<div class="login-card"><h1>Something went wrong</h1><p class="lede">Please refresh the page. If it keeps happening, call Tim on 027 562 7207.</p></div>`; });
})();
