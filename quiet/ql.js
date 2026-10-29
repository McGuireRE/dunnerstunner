/* Quiet Listings, McGuire Real Estate */
(function () {
  'use strict';
  const SB_URL = 'https://hwpwyjxhdvlqrjwzxzqz.supabase.co';
  const SB_KEY = 'sb_publishable_luFnpeEPhaXWotpQiwVcVw_Yhkii6-1';
  const sb = supabase.createClient(SB_URL, SB_KEY);
  const SITE = location.origin + location.pathname;
  const PACKAGES_URL = 'https://packages.dunnerstunner.co.nz/';
  const VENDOR_URL = 'https://packages.dunnerstunner.co.nz/onboarding/';

  const S = { session: null, agent: false, me: null, listings: null, urls: {}, hidden: 0, filters: { q: '', type: '', beds: '', baths: '', sort: 'new' } };
  const app = document.getElementById('app');

  /* ───────── helpers ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
  const money = n => '$' + Math.round(num(n)).toLocaleString('en-NZ');
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtDT = d => d ? new Date(d).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const ago = d => { if (!d) return ''; const days = Math.floor((Date.now() - new Date(d)) / 864e5); return days < 1 ? 'Listed today' : days === 1 ? 'Listed yesterday' : days < 30 ? `Listed ${days} days ago` : 'Listed ' + fmtDate(d); };
  const first = n => String(n || '').trim().split(/\s+/)[0];
  const paras = t => String(t || '').split(/\n{2,}|\r\n\r\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3800); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  async function call(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || 'Working…'; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } }
  const notify = body => sb.functions.invoke('ql-notify', { body: Object.assign({ site: SITE }, body) }).catch(() => null);

  const I = {
    bed: '<svg viewBox="0 0 24 24"><path d="M3 18v-6.5A1.5 1.5 0 0 1 4.5 10h15a1.5 1.5 0 0 1 1.5 1.5V18M3 15h18M3 18v2M21 18v2M6 10V7a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v3M12.5 10V7a1 1 0 0 1 1-1H17a1 1 0 0 1 1 1v3"/></svg>',
    bath: '<svg viewBox="0 0 24 24"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2zM6 12V6a2 2 0 0 1 3.7-1M7 19l-1 2M17 19l1 2"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M4 11h16"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/></svg>',
    land: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 9h3M4 15h3M17 4v3M17 17v3"/></svg>',
    floor: '<svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11zM9 20v-6h6v6"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-8.6C1.6 8.4 3.5 5 7 5c2 0 3.3 1.2 5 3 1.7-1.8 3-3 5-3 3.5 0 5.4 3.4 4 6.4C19 15.6 12 20 12 20z"/></svg>',
  };
  function factsHTML(l) {
    const f = [];
    if (l.beds) f.push(`<span title="Bedrooms">${I.bed}${l.beds}</span>`);
    if (l.baths) f.push(`<span title="Bathrooms">${I.bath}${+l.baths}</span>`);
    if (l.parking) f.push(`<span title="Parking">${I.car}${l.parking}</span>`);
    if (l.land_m2) f.push(`<span title="Land area">${I.land}${num(l.land_m2) >= 10000 ? (num(l.land_m2) / 10000).toFixed(2) + ' ha' : Math.round(num(l.land_m2)) + ' m²'}</span>`);
    if (l.floor_m2) f.push(`<span title="Floor area">${I.floor}${Math.round(num(l.floor_m2))} m²</span>`);
    return f.join('');
  }
  const addrOf = l => [l.street, l.suburb, l.city].filter(Boolean).join(', ');
  const wmText = () => S.agent ? 'McGuire · Confidential' : `Confidential · ${esc((S.me && S.me.full_name) || '')}`;

  /* ───────── header ───────── */
  function nav() {
    const h = location.hash || '#/';
    const on = p => h.startsWith(p) ? 'on' : '';
    const st = S.me && S.me.status;
    let right = '';
    if (!S.session) right = `<a class="btn ghost sm" href="#/signin">Sign in</a><a class="btn primary sm" href="#/apply">Apply for membership</a>`;
    else if (S.agent) right = `<a class="btn dark sm" href="#/admin">Admin</a><button class="btn ghost sm" id="signOutBtn">Sign out</button>`;
    else if (st === 'approved') right = `<a class="${on('#/saved')}" href="#/saved">Saved</a><a class="btn ghost sm" href="#/account">My account</a>`;
    else right = `<a class="btn ghost sm" href="#/account">My account</a>`;
    $('#nav').innerHTML = `
      <a class="${h === '#/' || on('#/listing') ? 'on' : ''}" href="#/">${S.agent || st === 'approved' ? 'Listings' : 'Quiet Listings'}</a>
      <a class="${on('#/how')}" href="#/how">How it works</a>
      <a class="ext" href="${PACKAGES_URL}">Marketing packages</a>
      <a class="ext" href="${VENDOR_URL}">Vendor portal</a>
      <span class="nav-right">${right}</span>`;
    const so = $('#signOutBtn'); if (so) so.onclick = signOut;
  }
  $('#menuBtn').onclick = () => { const n = $('#nav'); n.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', n.classList.contains('open')); };
  async function signOut() { await sb.auth.signOut(); S.session = null; S.me = null; S.agent = false; S.listings = null; go('#/'); }

  /* ───────── session ───────── */
  async function loadMe() {
    S.agent = false; S.me = null; S.listings = null;
    if (!S.session) return;
    try { S.agent = !!(await call(sb.rpc('is_agent'))); } catch (e) { S.agent = false; }
    if (!S.agent) { try { S.me = await call(sb.rpc('ql_me')); } catch (e) { toast('Could not load your membership: ' + e.message); } }
  }

  /* ───────── router ───────── */
  async function route() {
    $('#nav').classList.remove('open');
    const parts = (location.hash || '#/').slice(2).split('/');
    const [p0, p1, p2] = parts;
    nav();
    window.scrollTo(0, 0);
    try {
      if (p0 === 'how') return viewHow();
      if (p0 === 'privacy') return viewPrivacy();
      if (p0 === 'signin') return viewSignin(false);
      if (p0 === 'apply' && !S.session) return viewSignin(true);
      if (!S.session) return viewLanding();
      if (p0 === 'admin') { if (!S.agent) return go('#/'); return viewAdmin(p1, p2); }
      if (p0 === 'account') return viewAccount();
      if (S.agent) {
        if (p0 === 'listing') return viewListing(p1);
        return go('#/admin');
      }
      const st = S.me ? S.me.status : 'draft';
      if (st === 'draft' || st === 'info') return viewApply(+p1 || 0);
      if (st === 'pending') return viewStatus();
      if (st === 'declined' || st === 'suspended') return viewStatus();
      if (p0 === 'listing') return viewListing(p1);
      if (p0 === 'saved') return viewListings(true);
      return viewListings(false);
    } catch (e) {
      app.innerHTML = `<div class="narrow loading"><p>Something went wrong: ${esc(e.message)}</p><button class="btn ghost" onclick="location.reload()">Try again</button></div>`;
    }
  }

  /* ───────── landing (public) ───────── */
  async function viewLanding() {
    let count = 0;
    try { count = await call(sb.rpc('ql_public_count')); } catch (e) { }
    app.innerHTML = `
    <section class="hero"><div class="wrap">
      <div class="eyebrow">Private property · Dunedin</div>
      <h1>Homes that never reach the open market.</h1>
      <p class="lede">Some owners would rather sell discreetly: no signboard, no public advertising, no open homes. Quiet Listings introduces their properties only to buyers we have personally qualified.</p>
      <div class="cta"><a class="btn primary" href="#/apply">Apply for membership</a><a class="btn light" href="#/signin">Member sign in</a></div>
      ${count > 0 ? `<div class="stat"><strong>${count}</strong>${count === 1 ? 'property is' : 'properties are'} currently offered to members</div>` : ''}
      <div class="serious">For serious and discerning buyers only</div>
    </div></section>
    <section class="band"><div class="wrap">
      <div class="eyebrow">Why owners sell quietly</div>
      <h2>Privacy, control, and buyers who are ready.</h2>
      <div class="grid4">
        <div class="tile"><div class="num">01</div><h3>Discretion</h3><p>Their home, address and price are never published. Neighbours, colleagues and the curious never know.</p></div>
        <div class="tile"><div class="num">02</div><h3>No disruption</h3><p>No open homes and no weekends spent tidying for strangers. Every viewing is private and accompanied.</p></div>
        <div class="tile"><div class="num">03</div><h3>Qualified buyers</h3><p>Owners meet only people whose finance and intentions have been checked before they ever walk through the door.</p></div>
        <div class="tile"><div class="num">04</div><h3>A clean test of the market</h3><p>Owners can learn what a property is worth to serious buyers without a public price history.</p></div>
      </div>
    </div></section>
    ${howSection()}
    <section class="band dark"><div class="narrow" style="text-align:center">
      <div class="eyebrow">A word before you apply</div>
      <h2>This is not for browsing.</h2>
      <p style="font-size:18px;color:#CFC8BE">Owners trust us with something private. In return, we only open the door to people who are prepared, honest about their position and ready to act. If you are simply curious about what's out there, the open market will serve you better. If you're serious, we'd like to hear from you.</p>
      <p style="margin-top:26px"><a class="btn primary" href="#/apply">Start your application</a></p>
    </div></section>`;
  }

  function howSection() {
    return `
    <section class="band alt"><div class="wrap">
      <div class="logic">
        <div>
          <div class="eyebrow">How qualifying works</div>
          <h2>You see what you qualify for. Nothing more.</h2>
          <p>Qualifying is deliberately stringent. Each step is there to protect the owners and to make sure your time is spent on properties you can actually buy.</p>
          <ol style="padding-left:20px">
            <li style="margin-bottom:10px"><strong>You apply.</strong> Tell us who you are, your experience in the market, your finance, your top ten buying criteria and why you are buying.</li>
            <li style="margin-bottom:10px"><strong>We verify.</strong> Every application is reviewed personally. We'll sight written evidence of your finance, such as a bank pre-approval or proof of funds, and may call you. We then set your <em>verified budget</em>.</li>
            <li style="margin-bottom:10px"><strong>Listings are matched to you.</strong> Each Quiet Listing has a qualifying price agreed with the owner. If your verified budget is below it, that property stays hidden from you. Some owners also ask for cash buyers, or buyers who don't need to sell first. You'll only see those if your position meets that requirement.</li>
            <li><strong>You keep it current.</strong> Pre-approvals expire and circumstances change. Update your finance at any time and your access is reviewed. Membership can be paused or withdrawn if your position changes or the terms aren't kept.</li>
          </ol>
        </div>
        <div class="meter">
          <div class="small muted" style="margin-bottom:6px">Example: a member with a verified budget of <strong style="color:var(--ink)">$900,000</strong>, bank pre-approval, and a house still to sell</div>
          <div class="rowm"><div>Listing qualifying at $850,000</div><div class="yes">Visible</div></div>
          <div class="rowm"><div>Listing qualifying at $900,000</div><div class="yes">Visible</div></div>
          <div class="rowm"><div>Listing qualifying at $950,000</div><div class="no">Hidden</div></div>
          <div class="rowm"><div>Listing at $800,000, owner requires no sale to sell first</div><div class="no">Hidden</div></div>
          <div class="rowm"><div>Listing at $780,000, cash buyers only</div><div class="no">Hidden</div></div>
          <p class="small muted" style="margin:12px 0 0">Once their house sells unconditionally and they update us, the fourth listing becomes visible too.</p>
        </div>
      </div>
    </div></section>
    <section class="band"><div class="wrap">
      <div class="eyebrow">What membership asks of you</div>
      <h2>Four commitments.</h2>
      <div class="grid4">
        <div class="tile"><h3>Verified finance</h3><p>Written evidence of your ability to buy, kept up to date.</p></div>
        <div class="tile"><h3>Genuine intent</h3><p>Viewings only for properties you are genuinely prepared to buy, and turning up as arranged.</p></div>
        <div class="tile"><h3>Confidentiality</h3><p>Nothing you see is shared, screenshotted or discussed outside your household and advisers.</p></div>
        <div class="tile"><h3>Respect for owners</h3><p>No direct approaches, drive-bys that disturb the owners, or contact with neighbours. Everything goes through us.</p></div>
      </div>
    </div></section>`;
  }

  function viewHow() {
    app.innerHTML = `<section class="hero" style="padding:60px 0 50px"><div class="wrap"><div class="eyebrow">Quiet Listings</div><h1>How it works</h1><p class="lede">Private property for qualified buyers, offered at the owners' request.</p>${S.session ? '' : '<div class="cta"><a class="btn primary" href="#/apply">Apply for membership</a></div>'}</div></section>
    ${howSection()}
    <section class="band alt"><div class="narrow prose">
      <h2>Common questions</h2>
      <h3>Does membership cost anything?</h3><p>No. There is no charge to buyers.</p>
      <h3>How long does approval take?</h3><p>Usually within two working days of receiving a complete application and evidence of finance.</p>
      <h3>Why do you need my home address and finance details?</h3><p>Owners are trusting us to introduce only genuine buyers. Knowing who you are and confirming your position is how we keep that trust. Your details are kept private and are never given to owners. When you ask to view a property, we tell the owner your name and that you have been qualified.</p>
      <h3>What if my application is declined?</h3><p>Access is deliberately limited, so not every application is approved. We'll still gladly help you with properties on the open market, and you're welcome to update your application if your circumstances change.</p>
      <h3>Can I share a listing with my partner or lawyer?</h3><p>Yes, with the people directly involved in your purchase: your partner, co-buyers, lawyer, lender or building inspector. Nobody else. Anyone else buying with you should apply too.</p>
    </div></section>`;
  }

  function viewPrivacy() {
    app.innerHTML = `<div class="narrow prose" style="padding:40px 20px 70px"><div class="eyebrow">Quiet Listings</div><h1 style="font-size:44px">Privacy</h1>
      <p>McGuire Real Estate Ltd collects the information in your application to assess your membership, verify your ability to buy, match you with suitable properties and contact you about them. We handle it in line with the Privacy Act 2020.</p>
      <h2>What we collect</h2><p>Your name, contact details and home address; your buying experience; details of your finance, including any documents you upload; your buying criteria and reasons for buying; and a record of the listings you view and enquire about.</p>
      <h2>Who sees it</h2><p>Only McGuire Real Estate. We never give owners your finance details or documents. When you ask to view a property, we tell the owner your name and that you have been qualified. We may confirm your pre-approval with the lender named in your application, with your consent, which you give when you apply.</p>
      <h2>Where it's kept</h2><p>Securely with our database provider, Supabase, in Sydney, Australia, with access restricted to McGuire Real Estate.</p>
      <h2>How long we keep it</h2><p>While you are a member, and for up to two years after you last use Quiet Listings, unless the law requires us to keep it longer. You can ask us to close your membership and delete your information at any time.</p>
      <h2>Your rights</h2><p>You can ask to see or correct the information we hold about you. Email <a href="mailto:tim@mcguire.co.nz">tim@mcguire.co.nz</a> or call 027 562 7207.</p></div>`;
  }

  /* ───────── sign in / start application ───────── */
  function viewSignin(applying) {
    if (S.session) return go('#/');
    app.innerHTML = `<div class="narrow" style="max-width:520px;padding:60px 20px 80px">
      <div class="eyebrow">${applying ? 'Membership application' : 'Members'}</div>
      <h1 style="font-size:40px">${applying ? 'Start your application' : 'Sign in'}</h1>
      <p class="muted">${applying ? 'First, confirm your email address. We\'ll send you a secure link. Open it on this device to begin your application. You can save your progress and come back at any time.' : 'Enter the email address you applied with and we\'ll send you a secure sign-in link. No password needed.'}</p>
      <form id="siForm" class="card" style="margin-top:20px">
        <label class="f" for="siEmail" style="margin-top:0">Email address</label>
        <input type="email" id="siEmail" autocomplete="email" required placeholder="you@example.com">
        <button class="btn dark block" style="margin-top:16px" type="submit">Email me a secure link</button>
        <div id="siMsg"></div>
      </form>
      <p class="small muted">${applying ? 'Already applied? <a href="#/signin">Sign in</a>.' : 'Not a member yet? <a href="#/apply">Apply for membership</a>.'}</p>
    </div>`;
    $('#siForm').onsubmit = async e => {
      e.preventDefault();
      const email = $('#siEmail').value.trim().toLowerCase(), b = $('#siForm button');
      if (!/^\S+@\S+\.\S+$/.test(email)) { $('#siMsg').innerHTML = '<div class="err">Please check your email address.</div>'; return; }
      busy(b, true, 'Sending…');
      try { localStorage.setItem('qlReturn', SITE); } catch (x) { }
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: SITE } });
      busy(b, false);
      $('#siMsg').innerHTML = error ? `<div class="err">${esc(error.message)}</div>` : `<div class="okbox">Check your inbox for an email from McGuire Real Estate, and tap the sign-in link. It can take a minute, and may land in your spam folder.</div>`;
    };
  }

  /* ───────── application wizard ───────── */
  const OPT = {
    bought: ['Never', 'Once', 'Two or more times'],
    sold: ['Never', 'Once', 'Two or more times'],
    owns: ['Yes, my own home', 'Yes, investment property', 'Both', 'No'],
    buying_as: ['A home to live in', 'An investment', 'A holiday home', 'Development', 'For family'],
    looking_for: ['Just started', 'Less than 3 months', '3 to 12 months', 'More than a year'],
    offers: ['None', '1 or 2', '3 or more'],
    finance_type: ['Cash, no lending needed', 'Bank pre-approval in place', 'Pre-approval applied for', 'Not yet spoken to a lender'],
    need_to_sell: ['No, nothing to sell', 'Already sold, unconditional', 'Yes, my property is on the market', 'Yes, but it isn\'t listed yet'],
    types: ['House', 'Townhouse', 'Apartment', 'Character home', 'Lifestyle block', 'Section'],
    reason: ['First home', 'Moving up', 'Downsizing', 'Relocating to Dunedin', 'Investment', 'Lifestyle change', 'Family reasons', 'Other'],
    timeframe: ['Ready now', 'Within 3 months', '3 to 6 months', 'Longer than 6 months'],
  };
  const SUGGEST = ['All-day sun', 'North-facing living', 'Off-street parking', 'Internal-access garage', 'Single level', 'Low maintenance', 'Views', 'Quiet street', 'Flat section', 'School zone', 'Close to the city', 'Warm and dry', 'Heat pump or log burner', 'Modern kitchen', 'Second living area', 'Ensuite', 'Character features', 'Outdoor entertaining', 'Garden', 'Privacy', 'Walk to shops', 'Home office', 'Room for a workshop', 'Easy-care section'];
  const ACKS = [
    ['stringent', 'I understand Quiet Listings are offered privately at the owners\' request, and that qualifying is stringent.'],
    ['logic', 'I understand I will only see properties I qualify for, based on my verified budget and position, and that owners may set extra requirements such as cash or no sale to sell first.'],
    ['confidential', 'I will keep every listing confidential. I will not share, screenshot, forward or post any details, except with my partner, co-buyers, lawyer, lender or inspector.'],
    ['contact', 'I will not approach owners, visit a property uninvited, or contact neighbours. All contact goes through McGuire Real Estate.'],
    ['genuine', 'I will only ask to view properties I am genuinely prepared to buy, and I will turn up as arranged.'],
    ['current', 'I will tell you promptly if my finance or circumstances change.'],
    ['withdraw', 'I understand membership may be declined, paused or withdrawn at any time, without a reason being given.'],
    ['true', 'The information in my application is true. I agree McGuire Real Estate may confirm my finance with the lender I\'ve named, and I have read the <a href="#/privacy" target="_blank">privacy statement</a>.'],
  ];
  let D = null; // draft
  const TOP = ['full_name', 'phone', 'home_address'];
  const getV = k => TOP.includes(k) ? D[k] : (D.application || {})[k];
  const setV = (k, v) => { if (TOP.includes(k)) D[k] = v; else (D.application ||= {})[k] = v; };
  const fld = (k, label, o = {}) => `<label class="f" for="f_${k}">${label}${o.opt ? ' <span class="opt">(optional)</span>' : ''}</label>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}
    ${o.area ? `<textarea id="f_${k}" data-f="${k}" placeholder="${esc(o.ph || '')}">${esc(getV(k) || '')}</textarea>` : `<input type="${o.type || 'text'}" id="f_${k}" data-f="${k}" value="${esc(getV(k) || '')}" ${o.im ? `inputmode="${o.im}"` : ''} placeholder="${esc(o.ph || '')}" autocomplete="${o.ac || 'off'}">`}`;
  const radios = (k, label, opts, hint) => `<fieldset><div class="legend">${label}</div>${hint ? `<div class="hint">${hint}</div>` : ''}<div class="choices">${opts.map(o => `<label class="choice"><input type="radio" name="r_${k}" data-f="${k}" value="${esc(o)}" ${getV(k) === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
  const chips = (k, label, opts) => `<fieldset><div class="legend">${label}</div><div class="chips">${opts.map(o => `<label class="chip"><input type="checkbox" data-m="${k}" value="${esc(o)}" ${(getV(k) || []).includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div></fieldset>`;
  function collect() {
    $$('[data-f]', app).forEach(el => { if (el.type === 'radio') { if (el.checked) setV(el.dataset.f, el.value); } else setV(el.dataset.f, el.value.trim()); });
    const m = {}; $$('[data-m]', app).forEach(el => { (m[el.dataset.m] ||= []); if (el.checked) m[el.dataset.m].push(el.value); });
    Object.entries(m).forEach(([k, v]) => setV(k, v));
    if ($('[data-crit]', app)) setV('criteria', $$('[data-crit]', app).map(i => i.value.trim()));
    if ($('#ackLogic', app)) setV('ack_logic', $('#ackLogic', app).checked);
  }

  const STEPS = [
    { t: 'About you', r: () => `
      <p class="muted">Let's start with the basics. These details stay with McGuire Real Estate and are never given to owners.</p>
      ${fld('full_name', 'Full name', { ac: 'name' })}
      <div class="row2"><div>${fld('phone', 'Mobile number', { type: 'tel', ac: 'tel', im: 'tel' })}</div><div><label class="f">Email</label><input type="email" value="${esc(S.me.email)}" disabled></div></div>
      ${fld('home_address', 'Home address', { ac: 'street-address', hint: 'Where you live now.' })}`,
      v: () => !D.full_name || D.full_name.split(' ').length < 2 ? 'Please enter your full name.' : num(D.phone) < 1e6 ? 'Please enter a phone number we can reach you on.' : (D.home_address || '').length < 8 ? 'Please enter your home address.' : '' },
    { t: 'Your experience', r: () => `
      <p class="muted">Tell us about your history in the property market.</p>
      ${radios('bought', 'Have you bought property before?', OPT.bought)}
      ${radios('sold', 'Have you sold property before?', OPT.sold)}
      ${radios('owns', 'Do you own property now?', OPT.owns)}
      ${radios('buying_as', 'What are you buying?', OPT.buying_as)}
      ${radios('looking_for', 'How long have you been looking?', OPT.looking_for)}
      ${radios('offers', 'How many offers have you made in the last 12 months?', OPT.offers)}`,
      v: () => ['bought', 'sold', 'owns', 'buying_as', 'looking_for', 'offers'].some(k => !getV(k)) ? 'Please answer every question.' : '' },
    { t: 'Your finances', r: () => `
      <div class="card tight" style="background:var(--bg)"><strong>Why we ask, and how it's used</strong>
        <p class="small" style="margin:6px 0 0">Your finance decides what you can see. Once we have sighted written evidence, we set your <strong>verified budget</strong>. Each Quiet Listing has a qualifying price agreed with the owner, and you'll only see listings at or below your verified budget. Some owners also require cash, or a buyer who doesn't need to sell first. Your finance details are never shown to owners.</p></div>
      ${fld('budget', 'The most you can spend', { im: 'numeric', ph: '$', hint: 'Your realistic maximum purchase price, including your deposit.' })}
      ${radios('finance_type', 'How are you funding your purchase?', OPT.finance_type)}
      <div id="preBox">${'' }
        <div class="row3"><div>${fld('lender', 'Lender', { opt: true })}</div><div>${fld('preapproved', 'Pre-approved amount', { im: 'numeric', ph: '$', opt: true })}</div><div>${fld('preapproval_expiry', 'Pre-approval expires', { type: 'date', opt: true })}</div></div>
      </div>
      ${fld('deposit', 'Deposit or cash available', { im: 'numeric', ph: '$', opt: true })}
      ${radios('need_to_sell', 'Do you need to sell a property before you can buy?', OPT.need_to_sell)}
      <div id="finWarn"></div>
      <div class="legend">Evidence of finance <span class="opt">(you can add this later, but it's needed before approval)</span></div>
      <div class="hint">A pre-approval letter, or proof of funds such as a bank statement. PDF or photo.</div>
      <ul class="uploads" id="docList">${(getV('docs') || []).map(d => `<li>✓ ${esc(d.name)}</li>`).join('')}</ul>
      <label class="btn ghost sm" style="cursor:pointer">Upload a document<input type="file" id="docIn" accept=".pdf,image/*" multiple hidden></label>
      <label class="check" style="margin-top:20px;border-top:1px solid var(--line)"><input type="checkbox" id="ackLogic" ${getV('ack_logic') ? 'checked' : ''}><span>I understand that I will only see listings I qualify for, based on my <strong>verified</strong> finance, and that my access may change if my finance changes or expires.</span></label>`,
      after: () => {
        const sync = () => { const ft = ($('[data-f=finance_type]:checked', app) || {}).value || ''; $('#preBox').classList.toggle('hidden', ft.startsWith('Cash') || ft.startsWith('Not yet'));
          $('#finWarn').innerHTML = ft.startsWith('Not yet') ? '<div class="note">Applications without finance in place are rarely approved. We recommend speaking to a lender or mortgage adviser first. You can still apply, and we\'ll review it once your pre-approval is through.</div>' : ft.startsWith('Pre-approval applied') ? '<div class="note">We\'ll need to see your pre-approval before we can approve your membership.</div>' : ''; };
        $$('[data-f=finance_type]', app).forEach(r => r.addEventListener('change', sync)); sync();
        $('#docIn').onchange = async e => { await uploadDocs(e.target.files, $('#docList')); };
      },
      v: () => !num(getV('budget')) ? 'Please tell us the most you can spend.' : !getV('finance_type') ? 'Please tell us how you are funding your purchase.' : !getV('need_to_sell') ? 'Please tell us whether you need to sell first.' : !getV('ack_logic') ? 'Please confirm you understand how qualifying works.' : '' },
    { t: 'What you\'re looking for', r: () => {
      const crit = (getV('criteria') || []).concat(Array(10).fill('')).slice(0, 10);
      return `<p class="muted">This is how we match you with owners. Be specific: the more honest you are about what matters, the better the match.</p>
      ${fld('suburbs', 'Suburbs or areas', { ph: 'e.g. Maori Hill, Roslyn, St Clair' })}
      ${chips('types', 'Property types', OPT.types)}
      <div class="row3"><div>${fld('min_beds', 'Bedrooms, at least', { type: 'number', im: 'numeric' })}</div><div>${fld('min_baths', 'Bathrooms, at least', { type: 'number', im: 'numeric', opt: true })}</div><div>${fld('min_land', 'Land, at least', { ph: 'm² or ha', opt: true })}</div></div>
      <div class="legend" style="margin-top:26px">Your top 10 buying criteria, most important first</div>
      <div class="hint">All ten are needed. Tap a suggestion to add it, or write your own. Use the arrows to reorder.</div>
      <div id="critList">${crit.map((c, i) => `<div class="crit"><div class="n">${i + 1}</div><input type="text" data-crit="${i}" value="${esc(c)}" placeholder="${i === 0 ? 'Your most important' : ''}"><div class="mv"><button type="button" data-up="${i}" aria-label="Move up">↑</button><button type="button" data-dn="${i}" aria-label="Move down">↓</button></div></div>`).join('')}</div>
      <div class="chips" style="margin-top:12px">${SUGGEST.map(s => `<button type="button" class="chip" data-sug="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>`; },
      after: () => {
        const redraw = () => { collect(); renderStep(3); };
        $$('[data-sug]', app).forEach(b => b.onclick = () => { const e = $$('[data-crit]', app).find(i => !i.value.trim()); if (!e) return toast('All ten are filled. Clear one to add another.'); e.value = b.dataset.sug; b.disabled = true; });
        $$('[data-up]', app).forEach(b => b.onclick = () => { collect(); const c = getV('criteria'), i = +b.dataset.up; if (i) { [c[i - 1], c[i]] = [c[i], c[i - 1]]; renderStep(3); } });
        $$('[data-dn]', app).forEach(b => b.onclick = () => { collect(); const c = getV('criteria'), i = +b.dataset.dn; if (i < 9) { [c[i + 1], c[i]] = [c[i], c[i + 1]]; renderStep(3); } });
        void redraw;
      },
      v: () => !getV('suburbs') ? 'Please tell us which areas you are looking in.' : !(getV('types') || []).length ? 'Please choose at least one property type.' : (getV('criteria') || []).filter(Boolean).length < 10 ? `Please list all 10 buying criteria (you have ${(getV('criteria') || []).filter(Boolean).length}).` : '' },
    { t: 'Why you\'re buying', r: () => `
      ${radios('reason', 'What\'s behind your move?', OPT.reason)}
      ${fld('story', 'In your own words', { area: true, ph: 'Tell us a little about your situation and what you are hoping to find.', hint: 'Owners often ask us about the buyers we introduce. A few honest sentences help.' })}
      ${radios('timeframe', 'When do you want to buy?', OPT.timeframe)}
      ${fld('decision_makers', 'Who else is involved in the decision?', { opt: true, ph: 'e.g. my partner, Sam Smith', hint: 'Anyone who will need to see a property before you can commit.' })}`,
      v: () => !getV('reason') ? 'Please tell us why you are buying.' : (getV('story') || '').length < 40 ? 'Please write a few sentences about your situation.' : !getV('timeframe') ? 'Please tell us your timeframe.' : '' },
    { t: 'The terms of membership', r: () => `
      <p class="muted">Quiet Listings works because everyone keeps to the same standard. Please read each one carefully.</p>
      <div class="card" style="padding:4px 20px">${ACKS.map(([k, t]) => `<label class="check"><input type="checkbox" data-ack="${k}"><span>${t}</span></label>`).join('')}</div>
      <div class="serious" style="color:var(--ink);border-color:var(--gold);margin-top:6px">For serious and discerning buyers only</div>` ,
      v: () => $$('[data-ack]', app).some(c => !c.checked) ? 'Please tick every statement to submit your application.' : '' },
  ];

  async function uploadDocs(files, list) {
    const uid = S.session.user.id; const docs = getV('docs') || [];
    for (const f of files) {
      if (f.size > 15e6) { toast(f.name + ' is too large (15 MB maximum).'); continue; }
      const path = `ql/${uid}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      list.insertAdjacentHTML('beforeend', `<li class="muted" id="up_${docs.length}">Uploading ${esc(f.name)}…</li>`);
      const { error } = await sb.storage.from('private').upload(path, f, { contentType: f.type || 'application/octet-stream' });
      const li = $('#up_' + docs.length);
      if (error) { li.textContent = `Couldn't upload ${f.name}: ${error.message}`; continue; }
      docs.push({ path, name: f.name, at: new Date().toISOString() }); li.textContent = '✓ ' + f.name; li.classList.remove('muted');
    }
    setV('docs', docs);
    if (['draft', 'info'].includes(S.me.status)) await sb.rpc('ql_save', { patch: { application: { docs } } });
    return docs;
  }

  function viewApply(step) {
    if (!D || D.user_id !== S.me.user_id) D = JSON.parse(JSON.stringify(S.me));
    renderStep(Math.min(step, STEPS.length - 1));
  }
  function renderStep(i) {
    const s = STEPS[i];
    app.innerHTML = `<div class="narrow wz">
      ${S.me.status === 'info' && S.me.decision_message ? `<div class="note"><strong>We need a little more from you:</strong><br>${esc(S.me.decision_message)}</div>` : ''}
      <div class="steps">${STEPS.map((_, n) => `<span class="${n <= i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="eyebrow">Membership application · Step ${i + 1} of ${STEPS.length}</div>
      <h1>${s.t}</h1>
      <form id="wzForm" novalidate>${s.r()}<div id="wzErr"></div>
      <div class="wz-actions">${i ? `<button type="button" class="btn ghost" id="wzBack">Back</button>` : '<span></span>'}<button type="submit" class="btn ${i === STEPS.length - 1 ? 'primary' : 'dark'}" id="wzNext">${i === STEPS.length - 1 ? 'Submit my application' : 'Save and continue'}</button></div></form>
      <p class="small muted" style="margin-top:18px">Your answers are saved each time you continue. You can close this page and come back to it.</p></div>`;
    s.after && s.after();
    if ($('#wzBack')) $('#wzBack').onclick = async () => { collect(); await save(); location.hash = '#/apply/' + (i - 1); };
    $('#wzForm').onsubmit = async e => {
      e.preventDefault(); collect();
      const err = s.v(); if (err) { $('#wzErr').innerHTML = `<div class="err">${esc(err)}</div>`; return; }
      const b = $('#wzNext'); busy(b, true, 'Saving…');
      try {
        await save();
        if (i < STEPS.length - 1) { location.hash = '#/apply/' + (i + 1); return; }
        const acks = {}; ACKS.forEach(([k, t]) => acks[k] = t.replace(/<[^>]+>/g, ''));
        await call(sb.rpc('ql_submit', { p_acks: acks }));
        await notify({ type: 'submitted' });
        S.me = await call(sb.rpc('ql_me')); D = null;
        go('#/');
      } catch (x) { busy(b, false); $('#wzErr').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    };
  }
  async function save() { await call(sb.rpc('ql_save', { patch: { full_name: D.full_name || null, phone: D.phone || null, home_address: D.home_address || null, application: D.application || {} } })); Object.assign(S.me, { full_name: D.full_name, phone: D.phone, home_address: D.home_address, application: D.application }); }

  /* ───────── pending / declined ───────── */
  function viewStatus() {
    const m = S.me;
    const msg = {
      pending: ['Application received', `Thank you, ${esc(first(m.full_name))}. Every application is reviewed personally, usually within two working days. We may call you to talk through your plans, and we'll need to sight written evidence of your finance before you're approved.`],
      declined: ['Application not approved', 'Thank you for applying. After careful review, we\'re not able to offer Quiet Listings membership at this time. Access is deliberately limited. If your circumstances change, you\'re welcome to send us an update from your account.'],
      suspended: ['Membership paused', 'Your Quiet Listings access is currently paused. If you have questions, please get in touch.'],
    }[m.status];
    const hasDocs = (m.application?.docs || []).length;
    app.innerHTML = `<div class="narrow" style="padding:50px 20px 80px">
      <div class="eyebrow">Quiet Listings membership</div>
      <h1 style="font-size:44px">${msg[0]}</h1><p style="font-size:18px">${msg[1]}</p>
      ${m.decision_message && m.status !== 'pending' ? `<div class="card" style="background:var(--bg)">${esc(m.decision_message)}</div>` : ''}
      ${m.status === 'pending' ? `<div class="card"><h3>What happens next</h3>
        <ol style="padding-left:20px;margin:0"><li>We review your application${hasDocs ? ' and the documents you sent' : ''}.</li><li>${hasDocs ? 'We may contact your lender to confirm your pre-approval.' : '<strong>Send us evidence of your finance</strong> from your account. We can\'t approve your membership without it.'}</li><li>Once approved, you'll get an email and can sign in to see the Quiet Listings you qualify for.</li></ol></div>` : ''}
      <a class="btn dark" href="#/account">${m.status === 'pending' && !hasDocs ? 'Upload evidence of finance' : 'My account'}</a>
    </div>`;
  }

  /* ───────── account ───────── */
  async function viewAccount() {
    if (S.agent) {
      app.innerHTML = `<div class="narrow" style="padding:50px 20px"><h1 style="font-size:40px">Signed in as ${esc(S.session.user.email)}</h1><p>You're signed in with an agent account.</p><a class="btn dark" href="#/admin">Go to admin</a> <button class="btn ghost" id="so2">Sign out</button></div>`;
      $('#so2').onclick = signOut; return;
    }
    const m = S.me, a = m.application || {};
    let enq = [];
    try { enq = await call(sb.from('ql_enquiries').select('*').order('created_at', { ascending: false })); } catch (e) { }
    const canEdit = ['draft', 'info'].includes(m.status);
    app.innerHTML = `<div class="narrow" style="padding:40px 20px 80px">
      <div class="eyebrow">My account</div><h1 style="font-size:42px">${esc(m.full_name || m.email)}</h1>
      <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Membership</h3><span class="pill ${m.status}">${{ draft: 'Application not finished', info: 'More information needed', pending: 'Under review', approved: 'Approved member', declined: 'Not approved', suspended: 'Paused' }[m.status]}</span></div>
        ${m.status === 'approved' ? `<table class="kv" style="margin-top:10px"><tr><td>Verified budget</td><td><strong>${m.qualified_to ? money(m.qualified_to) : 'Not set'}</strong></td></tr><tr><td>Cash buyer verified</td><td>${m.cash_verified ? 'Yes' : 'No'}</td></tr><tr><td>Free of a sale to sell first</td><td>${m.sale_free || m.cash_verified ? 'Yes' : 'No'}</td></tr></table>
          <p class="small muted" style="margin:10px 0 0">These decide which Quiet Listings you can see. If your position has improved, send us an update below.</p>` : ''}
        ${canEdit ? `<p style="margin:12px 0 0"><a class="btn dark sm" href="#/apply">Continue my application</a></p>` : ''}</div>
      ${m.status !== 'draft' ? `<div class="card"><h3>${m.status === 'pending' ? 'Evidence of finance' : 'Update my finance or circumstances'}</h3>
        <p class="small muted">${m.status === 'pending' ? 'Upload your pre-approval letter or proof of funds.' : 'New pre-approval, house sold, budget changed? Tell us here and upload any documents. We\'ll review your access.'}</p>
        <ul class="uploads" id="docList2">${(a.docs || []).map(d => `<li>✓ ${esc(d.name)} <span class="muted small">${fmtDate(d.at)}</span></li>`).join('')}</ul>
        <label class="btn ghost sm" style="cursor:pointer">Upload a document<input type="file" id="docIn2" accept=".pdf,image/*" multiple hidden></label>
        ${m.status !== 'pending' ? `<div class="row2"><div><label class="f">New maximum budget <span class="opt">(optional)</span></label><input type="text" id="upBudget" inputmode="numeric" placeholder="$"></div><div><label class="f">Pre-approval expires <span class="opt">(optional)</span></label><input type="date" id="upExp"></div></div>
          <label class="f">What's changed?</label><textarea id="upNote" placeholder="e.g. Our house has sold unconditionally, settlement 12 December."></textarea>
          <button class="btn dark" id="upSend" style="margin-top:12px">Send update</button>` : ''}
        <div id="upMsg"></div></div>` : ''}
      ${enq.length ? `<div class="card"><h3>My enquiries</h3><table class="kv">${enq.map(e => `<tr><td>${fmtDate(e.created_at)}</td><td><a href="#/listing/${e.listing_id}">${{ viewing: 'Private viewing', question: 'Question', offer: 'Intention to offer' }[e.kind]}</a> <span class="pill">${{ new: 'Sent', contacted: 'We\'ve been in touch', booked: 'Booked', closed: 'Closed' }[e.status]}</span></td></tr>`).join('')}</table></div>` : ''}
      <div class="card"><h3>My details</h3><table class="kv"><tr><td>Email</td><td>${esc(m.email)}</td></tr><tr><td>Phone</td><td>${esc(m.phone || '')}</td></tr><tr><td>Home address</td><td>${esc(m.home_address || '')}</td></tr></table>
        <p class="small muted" style="margin:10px 0 0">To change your details or close your membership, email <a href="mailto:tim@mcguire.co.nz">tim@mcguire.co.nz</a>.</p></div>
      <button class="btn ghost" id="so3">Sign out</button></div>`;
    $('#so3').onclick = signOut;
    const di = $('#docIn2');
    if (di) di.onchange = async e => {
      D = JSON.parse(JSON.stringify(S.me));
      const docs = await uploadDocs(e.target.files, $('#docList2'));
      S.me.application = Object.assign({}, S.me.application, { docs });
      if (!['draft', 'info'].includes(m.status)) { await sb.rpc('ql_request_update', { note: 'New document uploaded: ' + Array.from(e.target.files).map(f => f.name).join(', '), finance: { docs: docs.slice(-e.target.files.length).map(d => d.path) } }); await notify({ type: 'update' }); }
      toast('Uploaded. Thank you.');
    };
    const us = $('#upSend');
    if (us) us.onclick = async () => {
      const note = $('#upNote').value.trim(); if (!note) { $('#upMsg').innerHTML = '<div class="err">Please tell us what has changed.</div>'; return; }
      busy(us, true, 'Sending…');
      try {
        const fin = {}; if ($('#upBudget').value) fin['New budget'] = money($('#upBudget').value); if ($('#upExp').value) fin['Pre-approval expires'] = $('#upExp').value;
        await call(sb.rpc('ql_request_update', { note, finance: fin })); await notify({ type: 'update' });
        $('#upMsg').innerHTML = '<div class="okbox">Thanks. We\'ll review your update and let you know.</div>'; $('#upNote').value = '';
      } catch (x) { $('#upMsg').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
      busy(us, false);
    };
  }

  /* ───────── listings ───────── */
  async function loadListings(force) {
    if (S.listings && !force) return S.listings;
    if (S.agent) S.listings = await call(sb.from('ql_listings').select('*').in('status', ['live', 'under_offer']).order('published_at', { ascending: false }));
    else { S.listings = await call(sb.rpc('ql_listings_for_me')); try { S.hidden = await call(sb.rpc('ql_hidden_count')); } catch (e) { S.hidden = 0; } }
    await signPhotos(S.listings.flatMap(l => l.photos || []));
    return S.listings;
  }
  async function signPhotos(paths) {
    const need = paths.filter(p => p && !S.urls[p]);
    if (!need.length) return;
    const { data } = await sb.storage.from('private').createSignedUrls(need, 3600 * 6);
    (data || []).forEach(d => { if (d.signedUrl) S.urls[d.path] = d.signedUrl; });
  }
  function cardHTML(l) {
    const ph = (l.photos || []).filter(p => S.urls[p]);
    return `<article class="lcard" data-id="${l.id}">
      <div class="ph" data-i="0">
        ${ph.length ? `<a href="#/listing/${l.id}"><img src="${S.urls[ph[0]]}" alt="${esc(l.headline || l.suburb)}" loading="lazy"></a>` : `<a href="#/listing/${l.id}" class="noimg">Photos coming soon</a>`}
        <div class="wm">${wmText()}</div>
        <span class="badge">Quiet Listing</span>${l.status === 'under_offer' ? '<span class="badge uo">Under offer</span>' : ''}
        ${!S.agent ? `<button class="heart ${l.saved ? 'on' : ''}" data-save="${l.id}" aria-label="${l.saved ? 'Remove from saved' : 'Save'}">${I.heart}</button>` : ''}
        ${ph.length > 1 ? `<button class="arrow l" data-pv aria-label="Previous photo">‹</button><button class="arrow r" data-nx aria-label="Next photo">›</button><span class="count">1 / ${ph.length}</span>` : ''}
      </div>
      <a class="lbody" href="#/listing/${l.id}">
        <div class="price">${esc(l.price_display || 'Price by negotiation')}</div>
        <div class="addr">${esc(addrOf(l))}</div>
        ${l.headline ? `<div class="headline">${esc(l.headline)}</div>` : ''}
        <div class="facts">${factsHTML(l)}</div>
        <div class="lfoot"><span>${ago(l.published_at)}</span><span>${esc(l.ref || '')}</span></div>
      </a></article>`;
  }
  function wireCards(root) {
    $$('.lcard', root).forEach(c => {
      const l = S.listings.find(x => x.id === c.dataset.id); if (!l) return;
      const ph = (l.photos || []).filter(p => S.urls[p]); const box = $('.ph', c);
      const show = d => { let i = (+box.dataset.i + d + ph.length) % ph.length; box.dataset.i = i; $('img', box).src = S.urls[ph[i]]; $('.count', box).textContent = `${i + 1} / ${ph.length}`; };
      const pv = $('[data-pv]', c), nx = $('[data-nx]', c);
      if (pv) pv.onclick = e => { e.preventDefault(); show(-1); };
      if (nx) nx.onclick = e => { e.preventDefault(); show(1); };
    });
    $$('[data-save]', root).forEach(b => b.onclick = async e => { e.preventDefault(); await toggleSave(b.dataset.save); b.classList.toggle('on', S.listings.find(x => x.id === b.dataset.save).saved); });
  }
  async function toggleSave(id) {
    const l = S.listings.find(x => x.id === id); if (!l) return;
    try {
      if (l.saved) await call(sb.from('ql_saved').delete().eq('user_id', S.session.user.id).eq('listing_id', id));
      else await call(sb.from('ql_saved').insert({ user_id: S.session.user.id, listing_id: id }));
      l.saved = !l.saved; toast(l.saved ? 'Saved to your shortlist' : 'Removed from your shortlist');
    } catch (e) { toast(e.message); }
  }

  async function viewListings(savedOnly) {
    app.innerHTML = '<div class="loading">Loading your Quiet Listings…</div>';
    await loadListings();
    const F = S.filters;
    const types = [...new Set(S.listings.map(l => l.property_type).filter(Boolean))].sort();
    app.innerHTML = `
      ${savedOnly ? '' : `<div class="searchbar"><div class="wrap sb-grid">
        <input type="text" id="fQ" placeholder="Search by suburb or keyword" value="${esc(F.q)}" aria-label="Search">
        <select id="fType" aria-label="Property type"><option value="">All property types</option>${types.map(t => `<option ${F.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select id="fBeds" aria-label="Bedrooms"><option value="">Any bedrooms</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${F.beds == n ? 'selected' : ''}>${n}+ bedrooms</option>`).join('')}</select>
        <select id="fBaths" aria-label="Bathrooms"><option value="">Any bathrooms</option>${[1, 2, 3].map(n => `<option value="${n}" ${F.baths == n ? 'selected' : ''}>${n}+ bathrooms</option>`).join('')}</select>
        <select id="fSort" aria-label="Sort"><option value="new">Newest first</option><option value="old" ${F.sort === 'old' ? 'selected' : ''}>Oldest first</option><option value="beds" ${F.sort === 'beds' ? 'selected' : ''}>Most bedrooms</option><option value="land" ${F.sort === 'land' ? 'selected' : ''}>Largest land</option></select>
      </div></div>`}
      <div class="wrap" style="padding-bottom:70px">
        <div class="results-head"><h1 id="rTitle"></h1>${S.agent ? '<a class="btn ghost sm" href="#/admin/listings">Manage listings</a>' : ''}</div>
        ${!S.agent && !savedOnly && S.hidden > 0 ? `<div class="hiddenbar"><div><strong>${S.hidden} more Quiet Listing${S.hidden === 1 ? ' is' : 's are'}</strong> outside your verified position.${S.me.qualified_to ? ` Your verified budget is ${money(S.me.qualified_to)}.` : ''}</div><a class="btn light sm" href="#/account">Update my finance</a></div>` : ''}
        <div class="cards" id="cards"></div>
      </div>`;
    const draw = () => {
      const q = F.q.toLowerCase();
      let list = S.listings.filter(l => (!savedOnly || l.saved) && (!q || [l.suburb, l.city, l.street, l.headline, l.description, (l.features || []).join(' ')].join(' ').toLowerCase().includes(q))
        && (!F.type || l.property_type === F.type) && (!F.beds || (l.beds || 0) >= +F.beds) && (!F.baths || (l.baths || 0) >= +F.baths));
      const by = { new: (a, b) => (b.published_at || '') > (a.published_at || '') ? 1 : -1, old: (a, b) => (a.published_at || '') > (b.published_at || '') ? 1 : -1, beds: (a, b) => (b.beds || 0) - (a.beds || 0), land: (a, b) => num(b.land_m2) - num(a.land_m2) }[F.sort];
      list = list.slice().sort(by);
      $('#rTitle').textContent = savedOnly ? `Saved (${list.length})` : `${list.length} Quiet Listing${list.length === 1 ? '' : 's'}${S.agent ? ' live' : ' you qualify for'}`;
      $('#cards').innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="empty" style="grid-column:1/-1"><h2>${savedOnly ? 'Nothing saved yet' : S.listings.length ? 'No matches' : 'No listings to show just yet'}</h2><p>${savedOnly ? 'Tap the heart on any listing to keep it here.' : S.listings.length ? 'Try widening your search.' : 'New Quiet Listings are added regularly. We\'ll email you when one matching your position becomes available.'}</p></div>`;
      wireCards($('#cards'));
    };
    if (!savedOnly) {
      $('#fQ').oninput = e => { F.q = e.target.value; draw(); };
      [['#fType', 'type'], ['#fBeds', 'beds'], ['#fBaths', 'baths'], ['#fSort', 'sort']].forEach(([s, k]) => $(s).onchange = e => { F[k] = e.target.value; draw(); });
    }
    draw();
  }

  async function viewListing(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    let l;
    if (S.agent) { l = await call(sb.from('ql_listings').select('*').eq('id', id).maybeSingle()); if (l) await signPhotos(l.photos || []); }
    else { await loadListings(); l = S.listings.find(x => x.id === id); }
    if (!l) { app.innerHTML = `<div class="narrow empty"><h2>This listing isn't available</h2><p>It may have been withdrawn, or it's outside your verified position.</p><a class="btn dark" href="#/">Back to listings</a></div>`; return; }
    const ph = (l.photos || []).filter(p => S.urls[p]);
    let enq = [];
    if (!S.agent) { try { enq = await call(sb.from('ql_enquiries').select('*').eq('listing_id', id).order('created_at', { ascending: false })); } catch (e) { } }
    const req = [l.req_cash ? 'Cash buyers only' : '', l.req_no_sale ? 'No sale-to-sell condition' : ''].filter(Boolean);
    const details = [['Property type', l.property_type], ['Bedrooms', l.beds], ['Bathrooms', l.baths ? +l.baths : ''], ['Living areas', l.living], ['Parking', l.parking], ['Land area', l.land_m2 ? (num(l.land_m2) >= 10000 ? (num(l.land_m2) / 10000).toFixed(2) + ' ha' : Math.round(num(l.land_m2)) + ' m²') : ''], ['Floor area', l.floor_m2 ? Math.round(num(l.floor_m2)) + ' m²' : ''], ['Year built', l.year_built], ['Rateable value', l.rv ? money(l.rv) : ''], ['Listing number', l.ref], ['Listed', fmtDate(l.published_at)]].filter(r => r[1]);
    app.innerHTML = `<div class="wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;gap:10px;flex-wrap:wrap"><a class="btn link" href="#/" style="padding-left:0">← All listings</a>
        <div style="display:flex;gap:8px">${S.agent ? `<a class="btn ghost sm" href="#/admin/listing/${l.id}">Edit listing</a>` : `<button class="btn ghost sm" id="dSave">${l.saved ? '♥ Saved' : '♡ Save'}</button>`}</div></div>
      ${ph.length ? `<div class="gallery n${Math.min(ph.length, 5) < 4 ? Math.min(ph.length, 5) : ''}">${ph.slice(0, 5).map((p, i) => `<div class="g" data-lb="${i}"><img src="${S.urls[p]}" alt="Photo ${i + 1}"><div class="wm">${wmText()}</div></div>`).join('')}${ph.length > 1 ? `<button class="btn ghost sm all" data-lb="0">View all ${ph.length} photos</button>` : ''}</div>` : ''}
      <div class="detail">
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><span class="pill" style="background:var(--ink);color:#F1E6D2">Quiet Listing</span>${l.status === 'under_offer' ? '<span class="pill under_offer">Under offer</span>' : ''}${req.map(r => `<span class="pill">${esc(r)}</span>`).join('')}</div>
          <div class="price">${esc(l.price_display || 'Price by negotiation')}</div>
          <h1>${esc(addrOf(l))}</h1>
          ${l.headline ? `<p class="muted" style="font-size:19px;margin:0">${esc(l.headline)}</p>` : ''}
          <div class="facts">${factsHTML(l)}</div>
          <div class="desc">${paras(l.description)}</div>
          ${(l.features || []).length ? `<h3 style="margin-top:28px">Features</h3><ul class="featlist">${l.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
          <h3 style="margin-top:28px">Property details</h3><table class="kv">${details.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
          ${l.viewing ? `<h3 style="margin-top:28px">Viewing</h3><p>${esc(l.viewing)}</p>` : ''}
          ${!l.show_street ? '<p class="small muted">The street address is provided once a private viewing is confirmed.</p>' : ''}
          <div class="conf">This property is offered privately at the owners' request. Please keep its details confidential, and don't visit or approach the owners directly. All viewings are accompanied by McGuire Real Estate.</div>
        </div>
        <aside class="side">
          <div class="card">
            <div class="agent"><div class="av">TM</div><div><strong>Tim McGuire</strong><br><span class="small muted">McGuire Real Estate</span><br><a class="small" href="tel:0275627207">027 562 7207</a></div></div>
            ${S.agent ? '<p class="small muted">Members see an enquiry form here.</p>' : `
            ${enq.length ? `<div class="okbox small">You sent a ${{ viewing: 'viewing request', question: 'question', offer: 'note of intention to offer' }[enq[0].kind]} on ${fmtDT(enq[0].created_at)}. ${enq[0].status === 'booked' ? 'Your viewing is booked.' : 'We\'ll be in touch.'}</div>` : ''}
            <form id="enqForm">
              <div class="legend" style="margin-top:4px">I'd like to</div>
              <div class="choices" style="grid-template-columns:1fr">
                <label class="choice"><input type="radio" name="kind" value="viewing" checked><span>Arrange a private viewing</span></label>
                <label class="choice"><input type="radio" name="kind" value="question"><span>Ask a question</span></label>
                <label class="choice"><input type="radio" name="kind" value="offer"><span>Talk about making an offer</span></label>
              </div>
              <label class="f" for="eTimes">Times that suit you <span class="opt">(optional)</span></label><input type="text" id="eTimes" placeholder="e.g. weekday evenings, Saturday morning">
              <label class="f" for="eMsg">Message <span class="opt">(optional)</span></label><textarea id="eMsg" style="min-height:90px"></textarea>
              <button class="btn primary block" type="submit" style="margin-top:14px">Send to Tim</button><div id="eRes"></div>
            </form>`}
          </div>
        </aside>
      </div></div>`;
    if (ph.length) $$('[data-lb]', app).forEach(g => g.onclick = () => lightbox(ph, +g.dataset.lb));
    const ds = $('#dSave'); if (ds) ds.onclick = async () => { await toggleSave(l.id); ds.textContent = l.saved ? '♥ Saved' : '♡ Save'; };
    const f = $('#enqForm');
    if (f) f.onsubmit = async e => {
      e.preventDefault(); const b = $('button[type=submit]', f); busy(b, true, 'Sending…');
      try {
        const kind = $('input[name=kind]:checked', f).value;
        const eid = await call(sb.rpc('ql_enquire', { lid: l.id, p_kind: kind, p_message: $('#eMsg').value.trim() || null, p_times: $('#eTimes').value.trim() || null }));
        await notify({ type: 'enquiry', enquiry_id: eid });
        $('#eRes').innerHTML = '<div class="okbox">Sent. Tim will be in touch shortly.</div>'; f.reset(); busy(b, false); b.textContent = 'Send another';
      } catch (x) { busy(b, false); $('#eRes').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    };
  }

  function lightbox(ph, i) {
    const el = document.createElement('div'); el.className = 'lightbox'; el.setAttribute('role', 'dialog');
    const draw = () => { el.innerHTML = `<img src="${S.urls[ph[i]]}" alt="Photo ${i + 1}"><div class="wm">${wmText()}</div><button class="x" aria-label="Close">×</button>${ph.length > 1 ? '<button class="pv" aria-label="Previous">‹</button><button class="nx" aria-label="Next">›</button>' : ''}<div class="cap">${i + 1} of ${ph.length}</div>`;
      $('.x', el).onclick = close; if (ph.length > 1) { $('.pv', el).onclick = () => { i = (i - 1 + ph.length) % ph.length; draw(); }; $('.nx', el).onclick = () => { i = (i + 1) % ph.length; draw(); }; } };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft' && ph.length > 1) { i = (i - 1 + ph.length) % ph.length; draw(); } if (e.key === 'ArrowRight' && ph.length > 1) { i = (i + 1) % ph.length; draw(); } };
    function close() { el.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; }
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    draw(); document.body.appendChild(el);
  }
  document.addEventListener('contextmenu', e => { if (e.target.closest('.ph, .gallery, .lightbox')) e.preventDefault(); });

  /* ───────── admin ───────── */
  const STATUS_LABEL = { draft: 'Incomplete', pending: 'To review', info: 'Info requested', approved: 'Approved', declined: 'Declined', suspended: 'Paused' };
  const LSTATUS = { draft: 'Draft', live: 'Live', under_offer: 'Under offer', sold: 'Sold', withdrawn: 'Withdrawn' };
  function adminTabs(on, counts = {}) {
    return `<div class="tabs">${[['', 'Applications', counts.apps], ['members', 'Members'], ['listings', 'Listings'], ['enquiries', 'Enquiries', counts.enq]].map(([k, t, c]) => `<a href="#/admin${k ? '/' + k : ''}" class="${on === k ? 'on' : ''}">${t}${c ? ` <span class="pill new">${c}</span>` : ''}</a>`).join('')}<a href="#/" style="margin-left:auto">Member view ↗</a></div>`;
  }
  async function viewAdmin(p1, p2) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    if (p1 === 'member') return adminMember(p2);
    if (p1 === 'listing') return adminListing(p2);
    const [members, listings, enq] = await Promise.all([
      call(sb.from('ql_members').select('*').order('submitted_at', { ascending: false, nullsFirst: false })),
      call(sb.from('ql_listings').select('*').order('created_at', { ascending: false })),
      call(sb.from('ql_enquiries').select('*').order('created_at', { ascending: false })),
    ]);
    const toReview = members.filter(m => m.status === 'pending' || (m.update_requested_at && (!m.reviewed_at || m.update_requested_at > m.reviewed_at)));
    const counts = { apps: toReview.length, enq: enq.filter(e => e.status === 'new').length };
    const mName = id => (members.find(m => m.user_id === id) || {}).full_name || '';
    const lName = id => { const l = listings.find(x => x.id === id); return l ? `${l.ref} ${l.street || l.suburb || ''}` : ''; };
    let body = '';
    if (!p1) {
      const rows = members.filter(m => ['pending', 'info'].includes(m.status) || toReview.includes(m));
      body = `<h2 style="font-size:30px">Applications and updates</h2>${rows.length ? memberTable(rows) : '<p class="muted">Nothing waiting for review.</p>'}
        <details style="margin-top:24px"><summary class="small muted" style="cursor:pointer">Incomplete applications (${members.filter(m => m.status === 'draft').length})</summary><div style="margin-top:10px">${memberTable(members.filter(m => m.status === 'draft'))}</div></details>`;
    } else if (p1 === 'members') {
      const rows = members.filter(m => !['draft'].includes(m.status));
      body = `<h2 style="font-size:30px">Members</h2>${memberTable(rows)}`;
    } else if (p1 === 'listings') {
      let ags = [];
      try { ags = await call(sb.from('agreements').select('id,ref,address,status,config').in('status', ['signed', 'countersigned', 'sent', 'parked']).order('created_at', { ascending: false })); } catch (e) { }
      body = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="font-size:30px;margin:0">Listings</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${ags.length ? `<select id="fromAg" style="width:auto"><option value="">Start from an agency agreement…</option>${ags.map(a => `<option value="${a.id}">${esc(a.ref)} ${esc(a.address)}</option>`).join('')}</select>` : ''}<a class="btn dark" href="#/admin/listing/new">New listing</a></div></div>
        <div class="tblwrap" style="margin-top:16px"><table class="tbl"><tr><th>Listing</th><th>Status</th><th>Price shown</th><th>Qualifying</th><th>Enquiries</th></tr>
        ${listings.map(l => `<tr class="click" data-go="#/admin/listing/${l.id}"><td><strong>${esc(l.ref)}</strong> ${esc(addrOf(l) || 'Untitled')}<br><span class="small muted">${esc(l.headline || '')}</span></td><td><span class="pill ${l.status}">${LSTATUS[l.status]}</span></td><td>${esc(l.price_display || '')}</td><td>${l.qualify_price ? money(l.qualify_price) : '<span class="muted">Not set</span>'}${l.req_cash ? '<br><span class="small">Cash only</span>' : ''}${l.req_no_sale ? '<br><span class="small">No sale to sell</span>' : ''}</td><td>${enq.filter(e => e.listing_id === l.id).length}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No listings yet.</td></tr>'}</table></div>`;
      setTimeout(() => { const s = $('#fromAg'); if (s) s.onchange = () => { if (s.value) { sessionStorage.setItem('qlFromAg', JSON.stringify(ags.find(a => a.id === s.value))); go('#/admin/listing/new'); } }; });
    } else if (p1 === 'enquiries') {
      body = `<h2 style="font-size:30px">Enquiries</h2><div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Member</th><th>Listing</th><th>Request</th><th>Status</th></tr>
        ${enq.map(e => `<tr><td class="small">${fmtDT(e.created_at)}</td><td><a href="#/admin/member/${e.user_id}">${esc(mName(e.user_id))}</a></td><td><a href="#/admin/listing/${e.listing_id}">${esc(lName(e.listing_id))}</a></td><td><strong>${{ viewing: 'Viewing', question: 'Question', offer: 'Offer' }[e.kind]}</strong>${e.times ? `<br><span class="small">Suits: ${esc(e.times)}</span>` : ''}${e.message ? `<br><span class="small">${esc(e.message)}</span>` : ''}</td>
        <td><select data-enq="${e.id}" style="width:auto;padding:6px 8px;font-size:15px">${['new', 'contacted', 'booked', 'closed'].map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${{ new: 'New', contacted: 'Contacted', booked: 'Viewing booked', closed: 'Closed' }[s]}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No enquiries yet.</td></tr>'}</table></div>`;
    }
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs(p1 || '', counts)}${body}</div>`;
    $$('[data-go]', app).forEach(r => r.onclick = () => go(r.dataset.go));
    $$('[data-enq]', app).forEach(s => s.onchange = async () => { try { await call(sb.from('ql_enquiries').update({ status: s.value }).eq('id', s.dataset.enq)); toast('Updated'); } catch (e) { toast(e.message); } });
  }
  function memberTable(rows) {
    if (!rows.length) return '<p class="muted">None.</p>';
    return `<div class="tblwrap"><table class="tbl"><tr><th>Name</th><th>Status</th><th>Their budget</th><th>Verified</th><th>Finance</th><th>Applied</th></tr>
      ${rows.map(m => { const a = m.application || {}; const upd = m.update_requested_at && (!m.reviewed_at || m.update_requested_at > m.reviewed_at);
        return `<tr class="click" data-go="#/admin/member/${m.user_id}"><td><strong>${esc(m.full_name || m.email)}</strong><br><span class="small muted">${esc(m.email)}</span></td><td><span class="pill ${m.status}">${STATUS_LABEL[m.status]}</span>${upd ? '<br><span class="pill new" style="margin-top:4px">Update sent</span>' : ''}</td><td>${a.budget ? money(a.budget) : ''}</td><td>${m.qualified_to ? money(m.qualified_to) : '<span class="muted">Not set</span>'}</td><td class="small">${esc(a.finance_type || '')}${(a.docs || []).length ? `<br>${a.docs.length} document${a.docs.length > 1 ? 's' : ''}` : ''}</td><td class="small">${fmtDate(m.submitted_at || m.created_at)}</td></tr>`; }).join('')}</table></div>`;
  }

  async function adminMember(id) {
    const m = await call(sb.from('ql_members').select('*').eq('user_id', id).single());
    const rv = await call(sb.from('ql_reviews').select('*').eq('user_id', id).maybeSingle());
    const enq = await call(sb.from('ql_enquiries').select('*').eq('user_id', id).order('created_at', { ascending: false }));
    const listings = await call(sb.from('ql_listings').select('*').in('status', ['live', 'under_offer']));
    const a = m.application || {};
    let files = [];
    try { const { data } = await sb.storage.from('private').list(`ql/${id}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }); files = data || []; } catch (e) { }
    const urls = {};
    if (files.length) { const { data } = await sb.storage.from('private').createSignedUrls(files.map(f => `ql/${id}/${f.name}`), 3600); (data || []).forEach(d => urls[d.path] = d.signedUrl); }
    const qualifies = l => num(m.qualified_to) >= num(l.qualify_price) && (!l.req_cash || m.cash_verified) && (!l.req_no_sale || m.sale_free || m.cash_verified);
    const sec = (t, rows) => `<div class="card"><h3>${t}</h3><table class="kv">${rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '' && !(Array.isArray(r[1]) && !r[1].length)).map(([k, v]) => `<tr><td>${k}</td><td>${Array.isArray(v) ? esc(v.join(', ')) : esc(v)}</td></tr>`).join('')}</table></div>`;
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs('members')}
      <a class="btn link" href="#/admin" style="padding-left:0">← Applications</a>
      <h1 style="font-size:40px;margin-top:8px">${esc(m.full_name || m.email)} <span class="pill ${m.status}" style="vertical-align:middle;font-family:var(--sans)">${STATUS_LABEL[m.status]}</span></h1>
      <div class="split"><div>
        ${sec('Contact', [['Email', m.email], ['Phone', m.phone], ['Home address', m.home_address], ['Applied', fmtDT(m.submitted_at)]])}
        ${sec('Experience', [['Bought before', a.bought], ['Sold before', a.sold], ['Owns property', a.owns], ['Buying', a.buying_as], ['Looking for', a.looking_for], ['Offers in last 12 months', a.offers]])}
        ${sec('Finance (their figures)', [['Maximum budget', a.budget ? money(a.budget) : ''], ['Funding', a.finance_type], ['Lender', a.lender], ['Pre-approved amount', a.preapproved ? money(a.preapproved) : ''], ['Pre-approval expires', a.preapproval_expiry], ['Deposit or cash', a.deposit ? money(a.deposit) : ''], ['Needs to sell first', a.need_to_sell]])}
        <div class="card"><h3>Documents</h3>${files.length ? `<ul class="uploads">${files.map(f => `<li><a href="${urls[`ql/${id}/${f.name}`] || '#'}" target="_blank" rel="noopener">${esc(f.name.replace(/^\d+-/, ''))}</a> <span class="small muted">${fmtDate(f.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No documents uploaded.</p>'}</div>
        <div class="card"><h3>Top 10 criteria</h3><ol style="margin:0;padding-left:22px">${(a.criteria || []).filter(Boolean).map(c => `<li>${esc(c)}</li>`).join('')}</ol>
          <table class="kv" style="margin-top:12px"><tr><td>Areas</td><td>${esc(a.suburbs || '')}</td></tr><tr><td>Types</td><td>${esc((a.types || []).join(', '))}</td></tr><tr><td>Bedrooms / bathrooms</td><td>${esc(a.min_beds || '-')} / ${esc(a.min_baths || '-')}</td></tr><tr><td>Land</td><td>${esc(a.min_land || '')}</td></tr></table></div>
        ${sec('Why they\'re buying', [['Reason', a.reason], ['In their words', a.story], ['Timeframe', a.timeframe], ['Decision makers', a.decision_makers]])}
        ${(a.updates || []).length ? `<div class="card"><h3>Updates from the member</h3>${a.updates.slice().reverse().map(u => `<p style="margin:0 0 10px"><span class="small muted">${fmtDT(u.at)}</span><br>${esc(u.note)}${Object.entries(u.finance || {}).filter(([k]) => k !== 'docs').map(([k, v]) => `<br><span class="small">${esc(k)}: ${esc(v)}</span>`).join('')}</p>`).join('')}</div>` : ''}
        ${enq.length ? `<div class="card"><h3>Enquiries</h3><table class="kv">${enq.map(e => `<tr><td>${fmtDT(e.created_at)}</td><td><a href="#/admin/listing/${e.listing_id}">${esc((listings.find(l => l.id === e.listing_id) || {}).ref || 'Listing')}</a> ${e.kind} <span class="pill">${e.status}</span></td></tr>`).join('')}</table></div>` : ''}
      </div>
      <aside class="side"><div class="card">
        <h3>Your decision</h3>
        <label class="f" for="rStatus" style="margin-top:6px">Status</label>
        <select id="rStatus">${['pending', 'info', 'approved', 'declined', 'suspended', 'draft'].map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${{ pending: 'To review', info: 'Ask for more information', approved: 'Approve', declined: 'Decline', suspended: 'Pause access', draft: 'Return to incomplete' }[s]}</option>`).join('')}</select>
        <label class="f" for="rBudget">Verified budget</label><div class="hint">They will see listings qualifying at or below this.</div>
        <input type="text" id="rBudget" inputmode="numeric" value="${m.qualified_to ? money(m.qualified_to) : ''}" placeholder="$">
        <label class="check"><input type="checkbox" id="rCash" ${m.cash_verified ? 'checked' : ''}><span>Cash buyer verified</span></label>
        <label class="check"><input type="checkbox" id="rSale" ${m.sale_free ? 'checked' : ''}><span>No sale to sell first (verified)</span></label>
        <label class="f" for="rMsg">Message to the member <span class="opt">(included in the email)</span></label><textarea id="rMsg" style="min-height:80px">${esc(m.decision_message || '')}</textarea>
        <label class="f" for="rNotes">Private notes <span class="opt">(only you see these)</span></label><textarea id="rNotes" style="min-height:80px">${esc((rv && rv.notes) || '')}</textarea>
        <div style="display:grid;gap:8px;margin-top:14px"><button class="btn primary" id="rSaveEmail">Save and email the member</button><button class="btn ghost" id="rSave">Save without emailing</button></div>
        <div id="rRes"></div>
        <p class="small muted" style="margin:14px 0 0">With these settings they would see <strong id="rCount">${listings.filter(qualifies).length}</strong> of ${listings.length} live listing${listings.length === 1 ? '' : 's'}.</p>
      </div></aside></div></div>`;
    const recount = () => { const t = { qualified_to: num($('#rBudget').value), cash_verified: $('#rCash').checked, sale_free: $('#rSale').checked }; $('#rCount').textContent = $('#rStatus').value === 'approved' ? listings.filter(l => num(t.qualified_to) >= num(l.qualify_price) && (!l.req_cash || t.cash_verified) && (!l.req_no_sale || t.sale_free || t.cash_verified)).length : 0; };
    ['#rBudget', '#rCash', '#rSale', '#rStatus'].forEach(s => $(s).addEventListener('input', recount)); recount();
    const doSave = async (email, btn) => {
      const st = $('#rStatus').value;
      if (st === 'approved' && !num($('#rBudget').value)) { $('#rRes').innerHTML = '<div class="err">Set a verified budget before approving.</div>'; return; }
      busy(btn, true, 'Saving…');
      try {
        await call(sb.from('ql_members').update({ status: st, qualified_to: num($('#rBudget').value) || null, cash_verified: $('#rCash').checked, sale_free: $('#rSale').checked, decision_message: $('#rMsg').value.trim() || null, reviewed_at: new Date().toISOString(), reviewed_by: S.session.user.email, updated_at: new Date().toISOString() }).eq('user_id', id));
        await call(sb.from('ql_reviews').upsert({ user_id: id, notes: $('#rNotes').value, updated_at: new Date().toISOString() }));
        if (email) { const { data, error } = await sb.functions.invoke('ql-notify', { body: { type: 'decision', user_id: id, site: SITE } }); if (error || (data && data.error)) throw new Error('Saved, but the email failed: ' + ((data && data.error) || error.message)); }
        $('#rRes').innerHTML = `<div class="okbox">Saved${email ? ' and emailed' : ''}.</div>`;
      } catch (x) { $('#rRes').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
      busy(btn, false);
    };
    $('#rSave').onclick = () => doSave(false, $('#rSave'));
    $('#rSaveEmail').onclick = () => doSave(true, $('#rSaveEmail'));
  }

  async function adminListing(id) {
    let l;
    if (id === 'new') {
      l = { status: 'draft', city: 'Dunedin', photos: [], features: [], show_street: false, req_cash: false, req_no_sale: false };
      const ag = JSON.parse(sessionStorage.getItem('qlFromAg') || 'null'); sessionStorage.removeItem('qlFromAg');
      if (ag) { const parts = String(ag.address || '').split(',').map(s => s.trim()); l.street = parts[0] || ''; l.suburb = parts[1] || ''; if (parts[2]) l.city = parts[2]; l.agreement_id = ag.id; const ask = num((ag.config || {}).ask); if (ask) l.qualify_price = ask; }
    } else l = await call(sb.from('ql_listings').select('*').eq('id', id).single());
    await signPhotos(l.photos || []);
    let qm = [], alerted = [];
    if (l.id) { try { qm = await call(sb.rpc('ql_qualified_members', { lid: l.id })); alerted = (await call(sb.from('ql_alerts').select('user_id').eq('listing_id', l.id))).map(x => x.user_id); } catch (e) { } }
    const inp = (k, label, o = {}) => `<label class="f" for="l_${k}">${label}${o.opt ? ' <span class="opt">(optional)</span>' : ''}</label>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}${o.area ? `<textarea id="l_${k}" data-l="${k}" rows="${o.rows || 6}">${esc(Array.isArray(l[k]) ? l[k].join('\n') : l[k] ?? '')}</textarea>` : `<input type="${o.type || 'text'}" id="l_${k}" data-l="${k}" value="${esc(l[k] ?? '')}" ${o.im ? `inputmode="${o.im}"` : ''} placeholder="${esc(o.ph || '')}">`}`;
    const pending = qm.filter(m => !alerted.includes(m.user_id));
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs('listings')}
      <a class="btn link" href="#/admin/listings" style="padding-left:0">← Listings</a>
      <h1 style="font-size:38px;margin-top:8px">${l.id ? esc(l.ref + ' ' + (addrOf(l) || '')) : 'New listing'}</h1>
      <div class="split"><div>
        <div class="card"><h3>Location</h3>
          ${inp('street', 'Street address')}
          <label class="check"><input type="checkbox" data-l="show_street" ${l.show_street ? 'checked' : ''}><span>Show the street address to members <span class="muted">(otherwise only the suburb shows until a viewing is booked)</span></span></label>
          <div class="row2"><div>${inp('suburb', 'Suburb')}</div><div>${inp('city', 'Town or city')}</div></div></div>
        <div class="card"><h3>Headline and description</h3>
          ${inp('headline', 'Headline', { ph: 'e.g. Sun-drenched family home with harbour views' })}
          ${inp('description', 'Description', { area: true, rows: 9, hint: 'Leave a blank line between paragraphs.' })}
          ${inp('features', 'Features', { area: true, rows: 6, hint: 'One per line.', opt: true })}
          ${inp('viewing', 'Viewing', { ph: 'e.g. Private viewings by appointment only', opt: true })}</div>
        <div class="card"><h3>Property details</h3>
          <label class="f" for="l_property_type">Property type</label><select id="l_property_type" data-l="property_type"><option value="">Choose…</option>${['House', 'Townhouse', 'Apartment', 'Unit', 'Lifestyle', 'Section', 'Character home'].map(t => `<option ${l.property_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <div class="row3"><div>${inp('beds', 'Bedrooms', { type: 'number', im: 'numeric' })}</div><div>${inp('baths', 'Bathrooms', { type: 'number', im: 'decimal' })}</div><div>${inp('living', 'Living areas', { type: 'number', im: 'numeric' })}</div></div>
          <div class="row3"><div>${inp('parking', 'Parking spaces', { type: 'number', im: 'numeric' })}</div><div>${inp('land_m2', 'Land (m²)', { im: 'numeric' })}</div><div>${inp('floor_m2', 'Floor (m²)', { im: 'numeric' })}</div></div>
          <div class="row2"><div>${inp('year_built', 'Year built', { opt: true, ph: 'e.g. 1920s' })}</div><div>${inp('rv', 'Rateable value', { opt: true, im: 'numeric' })}</div></div></div>
        <div class="card"><h3>Photos</h3><p class="small muted">The first photo is the cover. Photos are private: only members who qualify can see them, watermarked with their name.</p>
          <div class="thumbs" id="thumbs"></div>
          <label class="btn ghost sm" style="cursor:pointer;margin-top:12px">Add photos<input type="file" id="phIn" accept="image/*" multiple hidden></label><span id="phMsg" class="small muted" style="margin-left:10px"></span></div>
      </div>
      <aside class="side"><div class="card">
        <h3>Price and qualifying</h3>
        ${inp('price_display', 'Price shown to members', { ph: 'e.g. Offers over $895,000' })}
        ${inp('qualify_price', 'Qualifying price', { im: 'numeric', ph: '$', hint: 'Never shown. Members whose verified budget is below this won\'t see the listing.' })}
        <label class="check"><input type="checkbox" data-l="req_cash" ${l.req_cash ? 'checked' : ''}><span>Owner requires a cash buyer</span></label>
        <label class="check"><input type="checkbox" data-l="req_no_sale" ${l.req_no_sale ? 'checked' : ''}><span>Owner won't accept a sale-to-sell condition</span></label>
        <label class="f" for="l_status">Status</label><select id="l_status" data-l="status">${Object.entries(LSTATUS).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}${k === 'live' ? ' (members can see it)' : ''}</option>`).join('')}</select>
        <button class="btn primary block" id="lSave" style="margin-top:16px">Save listing</button>
        ${l.id ? `<a class="btn ghost block" href="#/listing/${l.id}" style="margin-top:8px">Preview as a member</a>` : ''}
        <div id="lRes"></div>
      </div>
      ${l.id ? `<div class="card"><h3>Qualified members (${qm.length})</h3>
        ${qm.length ? `<ul style="padding-left:18px;margin:0 0 12px">${qm.map(m => `<li><a href="#/admin/member/${m.user_id}">${esc(m.full_name || m.email)}</a> <span class="small muted">${money(m.qualified_to)}${alerted.includes(m.user_id) ? ' · emailed' : ''}</span></li>`).join('')}</ul>` : '<p class="small muted">No approved members qualify yet.</p>'}
        ${['live', 'under_offer'].includes(l.status) && pending.length ? `<button class="btn dark block" id="lAlert">Email ${pending.length} qualified member${pending.length > 1 ? 's' : ''} about it</button>` : ''}
        ${!['live', 'under_offer'].includes(l.status) ? '<p class="small muted" style="margin:0">Set the listing live to see who qualifies and email them.</p>' : ''}
        <div id="aRes"></div></div>` : ''}
      </aside></div></div>`;
    const drawThumbs = () => {
      $('#thumbs').innerHTML = (l.photos || []).map((p, i) => `<div class="thumb">${i === 0 ? '<span class="cov">Cover</span>' : ''}<img src="${S.urls[p] || ''}" alt=""><div class="ctl"><button data-ml="${i}" aria-label="Move left">←</button><button data-rm="${i}" aria-label="Remove">Remove</button><button data-mr="${i}" aria-label="Move right">→</button></div></div>`).join('') || '<p class="small muted" style="margin:0">No photos yet.</p>';
      $$('[data-ml]').forEach(b => b.onclick = () => { const i = +b.dataset.ml; if (i) { [l.photos[i - 1], l.photos[i]] = [l.photos[i], l.photos[i - 1]]; drawThumbs(); } });
      $$('[data-mr]').forEach(b => b.onclick = () => { const i = +b.dataset.mr; if (i < l.photos.length - 1) { [l.photos[i + 1], l.photos[i]] = [l.photos[i], l.photos[i + 1]]; drawThumbs(); } });
      $$('[data-rm]').forEach(b => b.onclick = () => { l.photos.splice(+b.dataset.rm, 1); drawThumbs(); });
    };
    drawThumbs();
    const gather = () => {
      const o = {};
      $$('[data-l]', app).forEach(el => { const k = el.dataset.l; if (el.type === 'checkbox') o[k] = el.checked; else o[k] = el.value.trim(); });
      ['beds', 'living', 'parking'].forEach(k => o[k] = o[k] === '' ? null : parseInt(o[k]));
      ['baths', 'land_m2', 'floor_m2', 'rv', 'qualify_price'].forEach(k => o[k] = o[k] === '' ? null : num(o[k]));
      o.features = (o.features || '').split('\n').map(s => s.trim()).filter(Boolean);
      Object.keys(o).forEach(k => { if (o[k] === '') o[k] = null; });
      o.city = o.city || 'Dunedin'; o.photos = l.photos || []; if (l.agreement_id) o.agreement_id = l.agreement_id;
      return o;
    };
    const persist = async () => {
      const o = gather();
      if (o.status !== 'draft' && !o.qualify_price) throw new Error('Set a qualifying price before making the listing live.');
      if (l.id) l = Object.assign(l, await call(sb.from('ql_listings').update(o).eq('id', l.id).select().single()));
      else { l = Object.assign(l, await call(sb.from('ql_listings').insert(o).select().single())); history.replaceState(null, '', '#/admin/listing/' + l.id); }
      S.listings = null;
    };
    $('#lSave').onclick = async () => { const b = $('#lSave'); busy(b, true, 'Saving…'); try { await persist(); toast('Listing saved'); adminListing(l.id); } catch (x) { busy(b, false); $('#lRes').innerHTML = `<div class="err">${esc(x.message)}</div>`; } };
    $('#phIn').onchange = async e => {
      const files = Array.from(e.target.files); if (!files.length) return;
      try { if (!l.id) { const o = gather(); o.status = 'draft'; l = Object.assign(l, await call(sb.from('ql_listings').insert(o).select().single())); history.replaceState(null, '', '#/admin/listing/' + l.id); } } catch (x) { toast(x.message); return; }
      let n = 0;
      for (const f of files) {
        $('#phMsg').textContent = `Uploading ${++n} of ${files.length}…`;
        try {
          const blob = await shrink(f);
          const path = `listings/${l.id}/${Date.now()}-${n}.jpg`;
          const { error } = await sb.storage.from('private').upload(path, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
          l.photos.push(path);
        } catch (x) { toast(`${f.name}: ${x.message}`); }
      }
      await signPhotos(l.photos);
      try { await call(sb.from('ql_listings').update({ photos: l.photos }).eq('id', l.id)); } catch (x) { toast(x.message); }
      $('#phMsg').textContent = 'Uploaded.'; drawThumbs(); e.target.value = '';
    };
    const al = $('#lAlert');
    if (al) al.onclick = async () => {
      busy(al, true, 'Sending…');
      const { data, error } = await sb.functions.invoke('ql-notify', { body: { type: 'alert', listing_id: l.id, site: SITE } });
      busy(al, false);
      $('#aRes').innerHTML = error || data.error ? `<div class="err">${esc((data && data.error) || error.message)}</div>` : `<div class="okbox">Emailed ${data.sent} member${data.sent === 1 ? '' : 's'}.${(data.errors || []).length ? ' Some failed: ' + esc(data.errors.join('; ')) : ''}</div>`;
      if (!error && data.sent) al.remove();
    };
  }
  function shrink(file, max = 2200) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? res(b) : rej(new Error('Could not process the photo')), 'image/jpeg', 0.86); };
      img.onerror = () => rej(new Error('Not an image the browser can read'));
      img.src = url;
    });
  }

  /* ───────── start ───────── */
  (async function init() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    if (S.session) { try { localStorage.removeItem('qlReturn'); } catch (e) { } await loadMe(); }
    sb.auth.onAuthStateChange((ev, session) => {
      const changed = (session && session.user.id) !== (S.session && S.session.user.id);
      S.session = session;
      if (changed) setTimeout(async () => { await loadMe(); route(); }, 0);
    });
    window.addEventListener('hashchange', route);
    if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
    route();
  })();
})();
