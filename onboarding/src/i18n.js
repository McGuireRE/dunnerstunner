/* ───────── Translation engine (phase 4) ─────────
   Vendor screens are written in English in the app. The wording is listed in strings.js (the catalogue). Each piece of
   screen text is looked up, as its English, in the translations a speaker has approved. Nothing approved: the English
   stays. The English the app draws is never changed in memory or in what is saved or signed: only what the vendor sees.
   Placeholders in the catalogue, such as {name}, stand for names, amounts and dates that the screen fills in. */
(function () {
  'use strict';
  const LANGS = [
    { code: 'en', name: 'English', native: 'English', html: 'en-NZ' },
    { code: 'mi', name: 'te reo Māori', native: 'te reo Māori', html: 'mi' },
    { code: 'sm', name: 'Samoan', native: 'Gagana Sāmoa', html: 'sm' },
    { code: 'to', name: 'Tongan', native: 'Lea faka-Tonga', html: 'to' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', html: 'hi' },
    { code: 'ko', name: 'Korean', native: '한국어', html: 'ko' },
    { code: 'zh', name: 'Simplified Chinese', native: '简体中文', html: 'zh-Hans' },
  ];
  const byCode = c => LANGS.find(l => l.code === c);
  const PH_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
  const HAS_LETTER = /\p{L}/u;
  const stripTags = s => s.replace(/<\/?\d+>|<br\/>/g, '');
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-count'];
  const PHRASING = new Set(['a', 'abbr', 'b', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'mark', 'code', 'time', 's', 'tspan']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CANVAS', 'NOSCRIPT', 'IFRAME', 'INPUT']);
  const NOTE_EN = 'The English agreement is the one that applies.';

  const S = {
    lang: 'en', tempEnglish: false, layers: {}, dict: new Map(), pats: [], memo: new Map(), observer: null,
    recs: new Set(), unitState: new WeakMap(), textState: new WeakMap(), attrState: new WeakMap(), pending: new Set(), queued: false,
    catStatic: new Set(), catPats: [], hooks: { pick: null, english: null }, busy: false,
  };

  /* ── the catalogue (strings.js), used to tell wording from data when checking coverage ── */
  function loadCatalogue() {
    const cat = window.I18N_STRINGS || {};
    Object.values(cat).forEach(groups => groups.forEach(([, list]) => list.forEach(s => { if (PH_RE.test(s)) { PH_RE.lastIndex = 0; S.catPats.push(compile(s)); } else S.catStatic.add(s); PH_RE.lastIndex = 0; })));
    S.catPats.sort((a, b) => b.lit - a.lit);
  }
  function compile(en) {
    const names = []; let lit = 0, re = '', last = 0, m;
    PH_RE.lastIndex = 0;
    while ((m = PH_RE.exec(en))) { const part = en.slice(last, m.index); lit += part.length; re += escRe(part) + '(.+?)'; names.push(m[0].slice(1, -1)); last = m.index + m[0].length; }
    const tail = en.slice(last); lit += tail.length; re += escRe(tail);
    PH_RE.lastIndex = 0;
    return { en, names, lit, re: new RegExp('^' + re + '$', 's') };
  }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ── dictionary: English -> translation, from every approved layer ── */
  function rebuild() {
    S.dict = new Map(); S.pats = []; S.memo = new Map();
    Object.keys(S.layers).forEach(n => { const m = S.layers[n]; Object.keys(m).forEach(k => S.dict.set(k, m[k])); });
    S.dict.forEach((tr, en) => { if (PH_RE.test(en)) { const p = compile(en); p.tr = tr; S.pats.push(p); } PH_RE.lastIndex = 0; });
    S.pats.sort((a, b) => b.lit - a.lit);
  }
  function fill(tr, names, caps) { let out = tr; names.forEach((n, i) => { out = out.split('{' + n + '}').join(caps[i]); }); return out; }
  function lookup(key) {
    if (S.memo.has(key)) return S.memo.get(key);
    let hit = S.dict.get(key) || null;
    if (hit && PH_RE.test(key)) { PH_RE.lastIndex = 0; hit = null; }   // a pattern is never an exact hit
    PH_RE.lastIndex = 0;
    if (!hit) for (const p of S.pats) { const m = p.re.exec(key); if (m) { hit = fill(p.tr, p.names, m.slice(1)); break; } }
    S.memo.set(key, hit); return hit;
  }
  function known(key) {
    if (S.catStatic.has(key)) return true;
    return S.catPats.some(p => p.re.test(key));
  }

  /* ── reading the screen: units of text ── */
  const collapse = s => s.replace(/\s+/g, ' ');
  function isInline(el) {
    if (el.nodeType !== 1) return false;
    if (!PHRASING.has(el.localName) || el.hasAttribute('data-tr-block')) return false;
    const d = el.ownerDocument.defaultView.getComputedStyle(el).display;
    return !d || d === 'inline' || d === 'inline-block' || d === 'none' || d === 'contents';
  }
  function pureInline(el) { return Array.from(el.childNodes).every(n => n.nodeType === 3 || (n.nodeType === 1 && (n.localName === 'br' || (isInline(n) && pureInline(n))))); }
  function serialize(el, list) {
    let out = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) out += collapse(n.nodeValue);
      else if (n.nodeType === 1) {
        if (n.localName === 'br') { out += '<br/>'; return; }
        const i = list.push(n);
        out += '<' + i + '>' + serialize(n, list) + '</' + i + '>';
      }
    });
    return out;
  }
  const norm = s => s.replace(/ ?<br\/> ?/g, '<br/>').replace(/ +/g, ' ').trim();
  const isUnit = el => el.childNodes.length > 0 && pureInline(el);
  let INCLUDE_SIGNED = false;
  function skipEl(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.localName === 'option' && !el.hasAttribute('value')) return true;   // an option's text is its value when it has no value: never change it
    return el.hasAttribute('data-no-tr') || (el.hasAttribute('data-signed') && !INCLUDE_SIGNED) || el.classList.contains('tr-aid') || el.classList.contains('tr-note') || el.isContentEditable === true && el.hasAttribute('contenteditable');
  }
  function rootSkipped(root, force) {
    if (force) return false;
    const el = root.nodeType === 1 ? root : root.parentElement;
    if (!el) return true;
    if (el.closest(INCLUDE_SIGNED ? '[data-no-tr],.tr-aid,.tr-note,#trNote,.lang-sel' : '[data-no-tr],[data-signed],.tr-aid,.tr-note,#trNote,.lang-sel')) return true;
    // the buttons under a page the vendor signs on stay English, like the page
    if (el.closest('#actions') && document.querySelector('#main [data-signing]')) return true;
    return false;
  }
  // visit every unit under root. h.unit(el, key, list), h.text(node, key), h.attr(el, name, value)
  function walk(root, h, force) {
    if (rootSkipped(root, force)) return;
    (function rec(n) {
      if (n.nodeType === 3) { const key = norm(collapse(n.nodeValue)); if (key && HAS_LETTER.test(key)) h.text(n, key); return; }
      if (n.nodeType !== 1) return;
      if (n !== root && skipEl(n)) return;
      if (h.attr) ATTRS.forEach(a => { if (n.hasAttribute(a)) { const v = n.getAttribute(a); if (v && HAS_LETTER.test(v)) h.attr(n, a, norm(collapse(v))); } });
      if (isUnit(n)) { let u = n; for (;;) { const k = Array.from(u.childNodes).filter(c => !(c.nodeType === 3 && !c.nodeValue.trim())); if (k.length === 1 && k[0].nodeType === 1 && k[0].localName !== 'br' && isInline(k[0])) u = k[0]; else break; } n = u; const list = []; const key = norm(serialize(n, list)); if (key && HAS_LETTER.test(stripTags(key))) h.unit(n, key, list); return; }
      Array.from(n.childNodes).forEach(rec);
    })(root);
  }

  /* ── applying a translation ── */
  function parse(tr, list) {
    const toks = [], re = /<br\/>|<(\d+)>|<\/(\d+)>/g; let last = 0, m;
    const used = new Set(), stack = [];
    while ((m = re.exec(tr))) {
      if (m.index > last) toks.push({ t: 'text', v: tr.slice(last, m.index) });
      if (m[0] === '<br/>') toks.push({ t: 'br' });
      else if (m[1]) { const n = +m[1]; if (n < 1 || n > list.length || used.has(n)) return null; used.add(n); stack.push(n); toks.push({ t: 'open', n }); }
      else { const n = +m[2]; if (stack.pop() !== n) return null; toks.push({ t: 'close', n }); }
      last = m.index + m[0].length;
    }
    if (last < tr.length) toks.push({ t: 'text', v: tr.slice(last) });
    if (stack.length || used.size !== list.length) return null;
    return toks;
  }
  function doUnit(el, key, list) {
    const st = S.unitState.get(el);
    if (st && st.out === key) return;                 // our own output
    const tr = lookup(key);
    if (!tr) { if (st) S.unitState.delete(el); return; }
    const toks = parse(tr, list); if (!toks) return;
    const kids = Array.from(el.childNodes), inl = list.map(e => ({ el: e, kids: Array.from(e.childNodes) }));
    const frag = document.createDocumentFragment(), stack = [frag];
    list.forEach(e => e.replaceChildren());
    toks.forEach(t => {
      const top = stack[stack.length - 1];
      if (t.t === 'text') top.appendChild(document.createTextNode(t.v));
      else if (t.t === 'br') top.appendChild(document.createElement('br'));
      else if (t.t === 'open') { const e = list[t.n - 1]; top.appendChild(e); stack.push(e); }
      else stack.pop();
    });
    const hadLang = el.getAttribute('lang');
    el.replaceChildren(frag); el.setAttribute('lang', byCode(S.lang).html);
    const out = norm(serialize(el, []));
    const prev = st || { hadLang };
    S.unitState.set(el, { out, hadLang: prev.hadLang });
    const rec = { undo() { list.forEach(i => i.replaceChildren()); el.replaceChildren(...kids); inl.forEach(i => i.el.replaceChildren(...i.kids)); if (hadLang === null) el.removeAttribute('lang'); else el.setAttribute('lang', hadLang); S.unitState.delete(el); }, el };
    S.recs.add(rec);
  }
  function doText(node, key) {
    const st = S.textState.get(node);
    if (st && st.out === node.nodeValue) return;
    const tr = lookup(key); if (!tr || /<\/?\d+>|<br\/>/.test(tr)) { if (st) S.textState.delete(node); return; }
    const orig = node.nodeValue, lead = (orig.match(/^\s*/) || [''])[0], trail = (orig.match(/\s*$/) || [''])[0];
    const out = lead + tr + trail; node.nodeValue = out;
    S.textState.set(node, { out });
    S.recs.add({ el: node, undo() { node.nodeValue = orig; S.textState.delete(node); } });
  }
  function doAttr(el, name, key) {
    const cur = el.getAttribute(name); const st = (S.attrState.get(el) || {})[name];
    if (st && st.out === cur) return;
    const tr = lookup(key); if (!tr || /<\/?\d+>|<br\/>/.test(tr)) return;
    const all = S.attrState.get(el) || {}; all[name] = { out: tr }; S.attrState.set(el, all);
    el.setAttribute(name, tr);
    S.recs.add({ el, undo() { el.setAttribute(name, cur); const a = S.attrState.get(el); if (a) delete a[name]; } });
  }
  const handler = { unit: doUnit, text: doText, attr: doAttr };
  function translateTree(root, force) { if (!root || !(root.isConnected || force)) return; walk(root, handler, force); }
  function restoreAll() { S.recs.forEach(r => { try { if (r.el.isConnected !== false) r.undo(); } catch (_) { } }); S.recs.clear(); }
  function prune() { S.recs.forEach(r => { if (r.el.isConnected === false) S.recs.delete(r); }); }

  /* ── state: on when a language other than English is chosen, it has approved wording, and the vendor has not asked for English ── */
  const hasWords = () => S.dict.size > 0;
  const active = () => S.lang !== 'en' && !S.tempEnglish && hasWords();
  function blockOf(n) { let e = n.nodeType === 1 ? n : n.parentElement; while (e && e.parentElement && e !== document.body && isInline(e)) e = e.parentElement; return e; }
  function process(targets) {
    if (!active()) return;
    S.busy = true;
    try {
      const seen = new Set();
      targets.forEach(t => { if (!t.isConnected) return; const b = blockOf(t); if (!b || seen.has(b)) return; seen.add(b); translateTree(b); });
      ensureAids(document.body);
      prune();
    } finally { S.busy = false; if (S.observer) S.observer.takeRecords(); }
  }
  function onMutations(recs) {
    if (S.busy) return;
    recs.forEach(r => {
      if (r.type === 'childList') { r.addedNodes.forEach(n => S.pending.add(n)); if (r.target.nodeType === 1) S.pending.add(r.target); }
      else S.pending.add(r.target);
    });
    syncSelects();
    const t = Array.from(S.pending); S.pending.clear();
    process(t);
  }
  function watch(on) {
    if (on && !S.observer) { S.observer = new MutationObserver(onMutations); S.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); }
    if (!on && S.observer) { S.observer.disconnect(); S.observer = null; }
  }
  function apply() {
    S.busy = true;
    try {
      restoreAll(); removeAids();
      document.documentElement.setAttribute('lang', 'en-NZ');
      if (active()) { watch(true); translateTree(document.body); ensureAids(document.body); }
      else watch(false);
    } finally { S.busy = false; if (S.observer) S.observer.takeRecords(); }
    renderNote(); syncSelects();
  }

  /* ── reading aids: a signed page stays English; the translation sits beside it, to help read it ── */
  function ensureAids(root) {
    document.querySelectorAll('[data-signed]').forEach(el => {
      if (el.closest('.tr-aid') || (el.parentElement && el.parentElement.closest('[data-signed]'))) return;
      if (el.previousElementSibling && el.previousElementSibling.classList.contains('tr-aid') && el.previousElementSibling.dataset.for === '1') return;
      const l = byCode(S.lang);
      const d = document.createElement('details'); d.className = 'tr-aid'; d.dataset.for = '1'; d.setAttribute('data-no-tr', '');
      d.innerHTML = '<summary></summary><div class="tr-aid-in"></div>';
      const sum = d.querySelector('summary');
      sum.appendChild(textLine('Read this part in {language}, to help you understand it', l, true));
      el.parentNode.insertBefore(d, el);
      d.addEventListener('toggle', () => { if (d.open) fillAid(d, el); });
    });
  }
  function removeAids() { document.querySelectorAll('.tr-aid').forEach(a => a.remove()); }
  function fillAid(d, src) {
    const body = d.querySelector('.tr-aid-in'); body.innerHTML = '';
    const l = byCode(S.lang);
    body.appendChild(textLine('This part is in English because it is what you sign. The translation below is only to help you read it. ' + NOTE_EN, l, false));
    const clone = src.cloneNode(true);
    clone.querySelectorAll('script,style,canvas,input,textarea,select,button,iframe,.sig-wrap,.toolbar,[data-no-aid]').forEach(x => x.remove());
    [clone].concat(Array.from(clone.querySelectorAll('*'))).forEach(x => { ['id', 'for', 'name', 'tabindex', 'data-signed', 'data-signing', 'aria-labelledby'].forEach(a => x.removeAttribute(a)); });
    const holder = document.createElement('div'); holder.className = 'tr-aid-body'; holder.appendChild(clone);
    body.appendChild(holder);
    S.busy = true; try { translateTree(holder, true); } finally { S.busy = false; if (S.observer) S.observer.takeRecords(); }
  }
  // a line in the chosen language with the English beneath it
  function textLine(en, l, short) {
    const wrap = document.createElement('div'); wrap.className = 'tr-line';
    const t = tr(en, { language: l.native });
    const p1 = document.createElement('p'); p1.textContent = t; if (t !== fillVars(en, { language: l.native })) p1.setAttribute('lang', l.html);
    wrap.appendChild(p1);
    if (t !== fillVars(en, { language: l.native })) { const p2 = document.createElement('p'); p2.className = 'tr-en'; p2.setAttribute('lang', 'en'); p2.textContent = fillVars(en, { language: l.native }); wrap.appendChild(p2); }
    return wrap;
  }
  const fillVars = (s, v) => { let o = s; Object.keys(v || {}).forEach(k => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  // translate one fixed piece of wording, if there is an approved translation, otherwise the English
  function tr(en, vars) { const key = norm(collapse(en)); let hit = S.dict.get(key) || null; if (hit == null || !active()) return fillVars(en, vars); return fillVars(hit, vars); }

  /* ── the note at the top of every page, and the language choice ── */
  function renderNote() {
    const el = document.getElementById('trNote'); if (!el) return;
    const l = byCode(S.lang);
    el.innerHTML = '';
    if (S.lang === 'en') { el.hidden = true; return; }
    el.hidden = false; el.setAttribute('data-no-tr', '');
    if (S.tempEnglish) {
      el.appendChild(btn('Show this page in {language} again', l, () => { S.tempEnglish = false; apply(); }));
      return;
    }
    if (!hasWords()) {
      const p = document.createElement('p'); p.setAttribute('lang', 'en');
      p.textContent = 'The ' + l.name + ' translation is still being checked by a speaker, so you are seeing English for now.';
      el.appendChild(p); return;
    }
    el.appendChild(textLine(NOTE_EN, l, false));
    el.appendChild(btn('Read this page in English', l, () => { S.tempEnglish = true; apply(); }, true));
  }
  function btn(en, l, fn, withEnglish) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tr-btn';
    const t = tr(en, { language: l.native }), e = fillVars(en, { language: l.native });
    b.textContent = t === e || !withEnglish ? t : t + ' (' + e + ')';
    if (t !== e) b.setAttribute('lang', l.html);
    b.addEventListener('click', fn);
    return b;
  }
  function selectHTML(id) {
    return '<select class="lang-sel" ' + (id ? 'id="' + id + '" ' : '') + 'aria-label="Language" data-no-tr>' + LANGS.map(l => '<option value="' + l.code + '" lang="' + l.html + '">' + l.native + '</option>').join('') + '</select>';
  }
  function syncSelects() { document.querySelectorAll('.lang-sel').forEach(s => { if (s.value !== S.lang) s.value = S.lang; }); }
  document.addEventListener('change', e => {
    const s = e.target.closest && e.target.closest('.lang-sel'); if (!s) return;
    S.tempEnglish = false;
    if (S.hooks.pick) S.hooks.pick(s.value); else I18N.setLang(s.value);
  });

  const I18N = window.I18N = {
    LANGS, NOTE_EN, byCode, selectHTML, tr, known, lookup,
    get lang() { return S.lang; },
    get active() { return active(); },
    get tempEnglish() { return S.tempEnglish; },
    // the units of text a screen shows (for the strings check): [{ kind, key }]
    units(root, withSigned) { INCLUDE_SIGNED = !!withSigned; const out = []; walk(root || document.body, { unit: (e, k) => out.push({ kind: 'unit', key: k }), text: (n, k) => out.push({ kind: 'text', key: k }), attr: (e, a, v) => out.push({ kind: 'attr', key: v, attr: a }) }, false); INCLUDE_SIGNED = false; return out; },
    setHooks(h) { Object.assign(S.hooks, h); },
    setLang(code) { if (!byCode(code)) code = 'en'; S.lang = code; S.tempEnglish = false; S.layers = {}; rebuild(); apply(); },
    setLayer(name, map) { S.layers[name] = map || {}; rebuild(); apply(); },
    dropLayers() { S.layers = {}; rebuild(); apply(); },
    refresh() { apply(); },
    layerSize() { return S.dict.size; },
    syncSelects,
    setLayers(obj) { S.layers = Object.assign({}, obj); rebuild(); apply(); },
    init() { loadCatalogue(); document.querySelectorAll('.lang-sel').forEach(s => { if (!s.options.length) s.innerHTML = LANGS.map(l => '<option value="' + l.code + '" lang="' + l.html + '">' + l.native + '</option>').join(''); }); syncSelects(); renderNote(); },
  };
})();
