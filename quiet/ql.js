/* Quiet Listings, McGuire Real Estate */
(function () {
  'use strict';
  const SB_URL = 'https://hwpwyjxhdvlqrjwzxzqz.supabase.co';
  const SB_KEY = 'sb_publishable_luFnpeEPhaXWotpQiwVcVw_Yhkii6-1';
  const sb = supabase.createClient(SB_URL, SB_KEY);
  const SITE = location.origin + location.pathname;
  const PACKAGES_URL = 'https://packages.dunnerstunner.co.nz/';
  const VENDOR_URL = 'https://packages.dunnerstunner.co.nz/onboarding/';
  const DWELLHUB = c => `https://www.dwellhub.nz/?utm_source=quietlistings&utm_medium=referral&utm_campaign=${c}`;
  const dwellCard = (c, lead) => `<div class="card dwell"><div class="eyebrow" style="color:#2B4E8C">Free for homeowners</div><h3 style="margin:4px 0 6px">${lead || 'Keep your home\'s records in one place'}</h3>
    <p class="small" style="margin:0 0 12px">Dwellhub is a free, private home file for your property: reports, plans, consents, photos and a guide to what it might be worth, ready for when you sell. Dwellhub is run by Dwellhub Limited, separately from McGuire Real Estate.</p>
    <a class="btn ghost sm" href="${DWELLHUB(c)}" target="_blank" rel="noopener">Start your free home file at dwellhub.nz ↗</a></div>`;

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
    if (!S.session) right = `<a class="btn ghost sm" href="#/signin">Member sign in</a>`;
    else if (S.agent) right = `<a class="btn dark sm" href="#/admin">Admin</a><button class="btn ghost sm" id="signOutBtn">Sign out</button>`;
    else if (st === 'approved') right = `<a class="${on('#/saved')}" href="#/saved">Saved</a><a class="btn ghost sm" href="#/account">My account</a>`;
    else right = `<a class="btn ghost sm" href="#/account">My account</a>`;
    $('#nav').innerHTML = `
      <a class="${h === '#/' || on('#/listing') ? 'on' : ''}" href="#/">${S.agent || st === 'approved' ? 'Listings' : 'Quiet Listings'}</a>
      <a class="${on('#/how')}" href="#/how">How it works</a>
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
    if (!S.agent) { try { S.me = await call(sb.rpc('ql_me')); if (S.me && S.me.application && S.me.application.quick) { let k = ''; try { k = localStorage.getItem('qlIntSent'); } catch (x) { } const v = S.me.application.quick.via + S.me.user_id; if (k !== v) { notify({ type: 'interest' }); try { localStorage.setItem('qlIntSent', v); } catch (x) { } } } } catch (e) { toast('Could not load your membership: ' + e.message); } }
  }

  /* ───────── router ───────── */
  async function route() {
    $('#nav').classList.remove('open');
    const parts = (location.hash || '#/').slice(2).split('/');
    const [p0, p1, p2] = parts;
    nav();
    window.scrollTo(0, 0);
    try {
      if (p0 === 'owner') return viewOwner(p1);
      if (p0 === 'r') return viewRegister(p1);
      if (p0 === 'sell') return viewSell(p1 === 'both');
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
      if (p0 === 'listing') return viewListing(p1);
      if (st === 'draft' || st === 'info') {
        if (p0 === 'apply') return viewApply(+p1 || 0);
        await loadListings();
        if (S.listings.length && p0 !== 'apply') return p0 === 'saved' ? viewListings(true) : viewListings(false);
        return viewApply(+p1 || 0);
      }
      if (st === 'pending') return viewStatus();
      if (st === 'declined' || st === 'suspended') return viewStatus();
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
      <div class="opts">
        <a class="opt-tile" href="#/sell"><span class="n">1</span><strong>I'm selling</strong><span>Sell privately, to buyers we've personally qualified. No signboard, no open homes.</span><em>Talk to us about selling →</em></a>
        <a class="opt-tile" href="#/apply"><span class="n">2</span><strong>I'm buying</strong><span>Apply for access to homes that never reach the open market.</span><em>Apply for membership →</em></a>
        <a class="opt-tile" href="#/sell/both"><span class="n">3</span><strong>Both</strong><span>Selling one home and buying the next? We'll plan both moves together.</span><em>Start with your sale →</em></a>
      </div>
      <p class="small" style="color:#CFC8BE;margin:18px 0 0">Already a member? <a href="#/signin" style="color:#fff">Sign in</a></p>
      ${count > 0 ? `<div class="stat"><strong>${count}</strong>${count === 1 ? 'property is' : 'properties are'} currently offered to members</div>` : ''}
      <div class="serious">For serious and discerning buyers only</div>
    </div></section>
    <section class="band"><div class="wrap">
      <div class="eyebrow">Why owners sell quietly</div>
      <h2>Privacy, control, and buyers who are ready.</h2>
      <div class="grid4">
        <div class="tile"><div class="num">01</div><h3>Discretion</h3><p>Their home, address and price are never published. Neighbours, colleagues and the curious never know.</p></div>
        <div class="tile"><div class="num">02</div><h3>No disruption</h3><p>No open homes and no weekends spent tidying for strangers. Every viewing is private and accompanied.</p></div>
        <div class="tile"><div class="num">03</div><h3>Qualified buyers</h3><p>Owners meet only people we've spoken to personally, and who are genuinely in a position to buy.</p></div>
        <div class="tile"><div class="num">04</div><h3>A clean test of the market</h3><p>Owners can learn what a property is worth to serious buyers without a public price history.</p></div>
      </div>
    </div></section>
    ${howSection()}
    <section class="band"><div class="wrap">
      <div class="eyebrow">Selling and buying?</div>
      <h2>List your own home quietly, and get first look.</h2>
      <div class="grid3">
        <div class="tile"><h3>48 hours' early access</h3><p>Owner-members, whose own home is a Quiet Listing with us, see every new listing two days before anyone else.</p></div>
        <div class="tile"><h3>Chain matching</h3><p>Your home might suit someone whose home suits you. Because we hold both sides, we can introduce you.</p></div>
        <div class="tile"><h3>A stronger position</h3><p>When your sale is in our hands, we can tell the other owner exactly where it stands. That counts for more than "we need to sell first".</p></div>
      </div>
      <p style="margin-top:24px"><a class="btn dark" href="#/sell/both">I'm selling and buying</a></p>
      <div style="max-width:620px;margin-top:30px">${dwellCard('landing', 'Thinking about selling one day?')}</div>
    </div></section>
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
      <div class="narrow" style="padding:0;max-width:820px">
          <div class="eyebrow">How membership works</div>
          <h2>Serious buyers, personally verified.</h2>
          <p>Owners who sell quietly are trusting us to introduce people who are ready. That's why every member is reviewed personally before they see a single home.</p>
          <ol style="padding-left:20px">
            <li style="margin-bottom:10px"><strong>You apply.</strong> Tell us who you are, your experience in the market, your finance, your top ten buying criteria and why you are buying.</li>
            <li style="margin-bottom:10px"><strong>We get to know you.</strong> Every application is reviewed personally, and Tim will call you to talk through your plans and your position.</li>
            <li style="margin-bottom:10px"><strong>You see Quiet Listings.</strong> Once approved, you can browse every Quiet Listing, save the ones you like and ask for private viewings. When something comes up that suits what you've told us, we'll let you know.</li>
            <li><strong>You keep us posted.</strong> Pre-approvals expire and plans change. Let us know when yours do, so we can keep helping you well.</li>
          </ol>
      </div>
    </div></section>
    <section class="band"><div class="wrap">
      <div class="eyebrow">What membership asks of you</div>
      <h2>Four commitments.</h2>
      <div class="grid4">
        <div class="tile"><h3>Honesty about your position</h3><p>A straight answer about your finance and what you need to do before you can buy.</p></div>
        <div class="tile"><h3>Genuine intent</h3><p>Viewings only for properties you are genuinely prepared to buy, and turning up as arranged.</p></div>
        <div class="tile"><h3>Confidentiality</h3><p>Nothing you see is shared, screenshotted or discussed outside your household and advisers.</p></div>
        <div class="tile"><h3>Respect for owners</h3><p>No direct approaches, drive-bys that disturb the owners, or contact with neighbours. Everything goes through us.</p></div>
      </div>
    </div></section>`;
  }

  function viewHow() {
    app.innerHTML = `<section class="hero" style="padding:60px 0 50px"><div class="wrap"><div class="eyebrow">Quiet Listings</div><h1>How it works</h1><p class="lede">Discreet listing for qualified buyers</p>${S.session ? '' : '<div class="cta"><a class="btn primary" href="#/apply">Apply for membership</a></div>'}</div></section>
    ${howSection()}
    <section class="band alt"><div class="narrow prose">
      <h2>Common questions</h2>
      <h3>Does membership cost anything?</h3><p>No. There is no charge to buyers.</p>
      <h3>How long does approval take?</h3><p>Usually within two working days. Tim will call you first to talk through your plans.</p>
      <h3>Why do you need my home address and finance details?</h3><p>Owners are trusting us to introduce only genuine buyers. Knowing who you are and confirming your position is how we keep that trust. Your details are kept private and are never given to owners. When you ask to view a property, we tell the owner your name and that you have been qualified.</p>
      <h3>What if my application is declined?</h3><p>Access is deliberately limited, so not every application is approved. We'll still gladly help you with properties on the open market, and you're welcome to update your application if your circumstances change.</p>
      <h3>Why is there no price?</h3><p>Every Quiet Listing is offered by expressions of interest. The homes are off-market, so owners keep their price expectations private. If you're interested, tell us what you'd be prepared to pay and we'll take it to the owner.</p>
      <h3>Can I share a listing with my partner or lawyer?</h3><p>Yes, with the people directly involved in your purchase: your partner, co-buyers, lawyer, lender or building inspector. Nobody else. Anyone else buying with you should apply too.</p>
    </div></section>`;
  }

  function viewPrivacy() {
    app.innerHTML = `<div class="narrow prose" style="padding:40px 20px 70px"><div class="eyebrow">Quiet Listings</div><h1 style="font-size:44px">Privacy</h1>
      <p>McGuire Real Estate Ltd collects the information in your application to assess your membership, verify your ability to buy, match you with suitable properties and contact you about them. We handle it in line with the Privacy Act 2020.</p>
      <h2>What we collect</h2><p>Your name, contact details and home address; your buying experience; what you tell us about your finance; your buying criteria and reasons for buying; and a record of the listings you view and enquire about.</p>
      <h2>Who sees it</h2><p>Only McGuire Real Estate. We never give owners your finance details. When you ask to view a property, we tell the owner your name and that you have been qualified. We may confirm your pre-approval with the lender named in your application, with your consent, which you give when you apply.</p>
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
    ['stringent', 'I understand Quiet Listings are offered privately at the owners\' request, and that membership is for serious buyers only.'],
    ['confidential', 'I will keep every listing confidential. I will not share, screenshot, forward or post any details, except with my partner, co-buyers, lawyer, lender or inspector.'],
    ['contact', 'I will not approach owners, visit a property uninvited, or contact neighbours. All contact goes through McGuire Real Estate.'],
    ['genuine', 'I will only ask to view properties I am genuinely prepared to buy, and I will turn up as arranged.'],
    ['current', 'I will tell you promptly if my finance or circumstances change.'],
    ['withdraw', 'I understand membership may be declined, paused or withdrawn at any time, without a reason being given.'],
    ['true', 'The information in my application is true. I agree McGuire Real Estate may contact me to talk through my plans and finance, and I have read the <a href="#/privacy" target="_blank">privacy statement</a>.'],
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
    { t: 'Your position', r: () => `
      <p class="muted">A rough picture is all we need here. Tim will talk it through with you personally. Nothing you tell us is shown to owners.</p>
      ${fld('budget', 'The most you can spend', { im: 'numeric', ph: '$', hint: 'Your realistic maximum purchase price, including your deposit.' })}
      ${radios('finance_type', 'How are you funding your purchase?', OPT.finance_type)}
      <div id="preBox">${'' }
        <div class="row3"><div>${fld('lender', 'Lender', { opt: true })}</div><div>${fld('preapproved', 'Pre-approved amount', { im: 'numeric', ph: '$', opt: true })}</div><div>${fld('preapproval_expiry', 'Pre-approval expires', { type: 'date', opt: true })}</div></div>
      </div>
      ${fld('deposit', 'Deposit or cash available', { im: 'numeric', ph: '$', opt: true })}
      ${radios('need_to_sell', 'Do you need to sell a property before you can buy?', OPT.need_to_sell)}
      <div id="finWarn"></div>`,
      after: () => {
        const sync = () => { const ft = ($('[data-f=finance_type]:checked', app) || {}).value || ''; $('#preBox').classList.toggle('hidden', ft.startsWith('Cash') || ft.startsWith('Not yet'));
          const ns = ($('[data-f=need_to_sell]:checked', app) || {}).value || '';
          const tip = ns.startsWith('Yes') ? '<div class="okbox small"><strong>Need to sell first?</strong> List your home quietly with us and become an owner-member: you get 48 hours\' early access to new Quiet Listings, and we can match you with buyers whose homes might suit you. <a href="#/sell" target="_blank">Tell us about your home</a>.</div>' : '';
          $('#finWarn').innerHTML = tip; };
        $$('[data-f=need_to_sell]', app).forEach(r => r.addEventListener('change', sync));
        $$('[data-f=finance_type]', app).forEach(r => r.addEventListener('change', sync)); sync();
      },
      v: () => !num(getV('budget')) ? 'Please tell us the most you can spend.' : !getV('finance_type') ? 'Please tell us how you are funding your purchase.' : !getV('need_to_sell') ? 'Please tell us whether you need to sell first.' : '' },
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
  async function viewStatus() {
    try { await loadListings(); } catch (e) { }
    const m = S.me;
    const msg = {
      pending: ['Application received', `Thank you, ${esc(first(m.full_name))}. Every application is reviewed personally, usually within two working days. Tim will call you to talk through your plans and your position.`],
      declined: ['Application not approved', 'Thank you for applying. After careful review, we\'re not able to offer Quiet Listings membership at this time. Access is deliberately limited. If your circumstances change, you\'re welcome to send us an update from your account.'],
      suspended: ['Membership paused', 'Your Quiet Listings access is currently paused. If you have questions, please get in touch.'],
    }[m.status];
    const hasDocs = (m.application?.docs || []).length;
    app.innerHTML = `<div class="narrow" style="padding:50px 20px 80px">
      <div class="eyebrow">Quiet Listings membership</div>
      <h1 style="font-size:44px">${msg[0]}</h1><p style="font-size:18px">${msg[1]}</p>
      ${m.decision_message && m.status !== 'pending' ? `<div class="card" style="background:var(--bg)">${esc(m.decision_message)}</div>` : ''}
      ${m.status === 'pending' ? `<div class="card"><h3>What happens next</h3>
        <ol style="padding-left:20px;margin:0"><li>We review your application.</li><li>Tim calls you to talk through your plans and your position.</li><li>Once approved, you'll get an email and can sign in to see every Quiet Listing.</li></ol></div>` : ''}
      ${(S.listings || []).length ? `<p><a class="btn ghost" href="#/listing/${S.listings[0].id}">See the listing${S.listings.length > 1 ? 's' : ''} you registered for</a></p>` : ''}
      <a class="btn dark" href="#/account">My account</a>
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
        ${m.status === 'approved' ? `<p class="small muted" style="margin:10px 0 0">You can see every Quiet Listing. If your finance or plans change, send us an update below.</p>` : ''}
        ${canEdit ? `<p style="margin:12px 0 0"><a class="btn dark sm" href="#/apply">Continue my application</a></p>` : ''}</div>
      ${!['draft', 'pending'].includes(m.status) ? `<div class="card"><h3>Update my circumstances</h3>
        <p class="small muted">House sold, budget changed, new plans? Let Tim know here.</p>
        <label class="f">What's changed?</label><textarea id="upNote" placeholder="e.g. Our house has sold unconditionally, settlement 12 December."></textarea>
        <button class="btn dark" id="upSend" style="margin-top:12px">Send update</button>
        <div id="upMsg"></div></div>` : ''}
      ${enq.length ? `<div class="card"><h3>My enquiries</h3><table class="kv">${enq.map(e => `<tr><td>${fmtDate(e.created_at)}</td><td><a href="#/listing/${e.listing_id}">${{ viewing: 'Private viewing', question: 'Question', offer: 'Intention to offer' }[e.kind]}</a> <span class="pill">${{ new: 'Sent', contacted: 'We\'ve been in touch', booked: 'Booked', closed: 'Closed' }[e.status]}</span></td></tr>`).join('')}</table></div>` : ''}
      <div class="card"><h3>My details</h3><table class="kv"><tr><td>Email</td><td>${esc(m.email)}</td></tr><tr><td>Phone</td><td>${esc(m.phone || '')}</td></tr><tr><td>Home address</td><td>${esc(m.home_address || '')}</td></tr></table>
        <p class="small muted" style="margin:10px 0 0">To change your details or close your membership, email <a href="mailto:tim@mcguire.co.nz">tim@mcguire.co.nz</a>.</p></div>
      <button class="btn ghost" id="so3">Sign out</button></div>`;
    $('#so3').onclick = signOut;
    const us = $('#upSend');
    if (us) us.onclick = async () => {
      const note = $('#upNote').value.trim(); if (!note) { $('#upMsg').innerHTML = '<div class="err">Please tell us what has changed.</div>'; return; }
      busy(us, true, 'Sending…');
      try {
        const fin = {};
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
        <span class="badge">${l.early && !l.interest_only ? 'Early access' : 'Quiet Listing'}</span>${l.status === 'under_offer' ? '<span class="badge uo">Under offer</span>' : ''}
        ${!S.agent ? `<button class="heart ${l.saved ? 'on' : ''}" data-save="${l.id}" aria-label="${l.saved ? 'Remove from saved' : 'Save'}">${I.heart}</button>` : ''}
        ${ph.length > 1 ? `<button class="arrow l" data-pv aria-label="Previous photo">‹</button><button class="arrow r" data-nx aria-label="Next photo">›</button><span class="count">1 / ${ph.length}</span>` : ''}
      </div>
      <a class="lbody" href="#/listing/${l.id}">
        <div class="price">Expressions of interest</div>
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
        ${!S.agent && !savedOnly && S.me.status !== 'approved' ? `<div class="hiddenbar"><div><strong>You're registered for ${S.listings.length === 1 ? 'this listing' : 'these listings'}.</strong> ${S.hidden > 0 ? `${S.hidden} more Quiet Listing${S.hidden === 1 ? ' is' : 's are'} open to full members.` : 'Full members see every Quiet Listing.'} Full membership also lets you book viewings, and owner-members who list their own home with us get 48 hours' early access.</div><a class="btn light sm" href="#/apply">Apply for full membership</a></div>` : ''}
        <div class="cards" id="cards"></div>
      </div>`;
    const draw = () => {
      const q = F.q.toLowerCase();
      let list = S.listings.filter(l => (!savedOnly || l.saved) && (!q || [l.suburb, l.city, l.street, l.headline, l.description, (l.features || []).join(' ')].join(' ').toLowerCase().includes(q))
        && (!F.type || l.property_type === F.type) && (!F.beds || (l.beds || 0) >= +F.beds) && (!F.baths || (l.baths || 0) >= +F.baths));
      const by = { new: (a, b) => (b.published_at || '') > (a.published_at || '') ? 1 : -1, old: (a, b) => (a.published_at || '') > (b.published_at || '') ? 1 : -1, beds: (a, b) => (b.beds || 0) - (a.beds || 0), land: (a, b) => num(b.land_m2) - num(a.land_m2) }[F.sort];
      list = list.slice().sort(by);
      $('#rTitle').textContent = savedOnly ? `Saved (${list.length})` : `${list.length} Quiet Listing${list.length === 1 ? '' : 's'}${S.agent ? ' live' : S.me.status === 'approved' ? '' : ' you\'re registered for'}`;
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
    if (!l) { app.innerHTML = `<div class="narrow empty"><h2>This listing isn't available</h2><p>It may have been withdrawn or sold.</p><a class="btn dark" href="#/">Back to listings</a></div>`; return; }
    const ph = (l.photos || []).filter(p => S.urls[p]);
    let enq = [];
    if (!S.agent) { sb.rpc('ql_log_view', { lid: id }).then(() => null, () => null); try { enq = await call(sb.from('ql_enquiries').select('*').eq('listing_id', id).order('created_at', { ascending: false })); } catch (e) { } }
    const req = [l.req_cash ? 'Cash buyers only' : '', l.req_no_sale ? 'No sale-to-sell condition' : ''].filter(Boolean);
    const details = [['Property type', l.property_type], ['Bedrooms', l.beds], ['Bathrooms', l.baths ? +l.baths : ''], ['Living areas', l.living], ['Parking', l.parking], ['Land area', l.land_m2 ? (num(l.land_m2) >= 10000 ? (num(l.land_m2) / 10000).toFixed(2) + ' ha' : Math.round(num(l.land_m2)) + ' m²') : ''], ['Floor area', l.floor_m2 ? Math.round(num(l.floor_m2)) + ' m²' : ''], ['Year built', l.year_built], ['Rateable value', l.rv ? money(l.rv) : ''], ['Listing number', l.ref], ['Listed', fmtDate(l.published_at)]].filter(r => r[1]);
    app.innerHTML = `<div class="wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;gap:10px;flex-wrap:wrap"><a class="btn link" href="#/" style="padding-left:0">← All listings</a>
        <div style="display:flex;gap:8px">${S.agent ? `<a class="btn ghost sm" href="#/admin/listing/${l.id}">Edit listing</a>` : `<button class="btn ghost sm" id="dSave">${l.saved ? '♥ Saved' : '♡ Save'}</button>`}</div></div>
      ${ph.length ? `<div class="gallery n${Math.min(ph.length, 5) < 4 ? Math.min(ph.length, 5) : ''}">${ph.slice(0, 5).map((p, i) => `<div class="g" data-lb="${i}"><img src="${S.urls[p]}" alt="Photo ${i + 1}"><div class="wm">${wmText()}</div></div>`).join('')}${ph.length > 1 ? `<button class="btn ghost sm all" data-lb="0">View all ${ph.length} photos</button>` : ''}</div>` : ''}
      <div class="detail">
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><span class="pill" style="background:var(--ink);color:#F1E6D2">Quiet Listing</span>${l.status === 'under_offer' ? '<span class="pill under_offer">Under offer</span>' : ''}${req.map(r => `<span class="pill">${esc(r)}</span>`).join('')}</div>
          <div class="price">Expressions of interest</div>
          <p class="small muted" style="margin:2px 0 0">This home is offered privately, by expressions of interest. To make one, use the form or call Tim.</p>
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
            ${S.agent ? '<p class="small muted">Members see an enquiry form here.</p>' : l.interest_only ? `
            <div class="note small" style="margin-top:0">You're registered for this listing through its share link. <strong>Viewings are for full members.</strong></div>
            <a class="btn dark block" href="#/apply">Apply for full membership</a>
            <form id="enqForm" style="margin-top:14px"><input type="radio" name="kind" value="question" checked hidden>
              <label class="f" for="eMsg" style="margin-top:0">Or ask Tim a question</label><textarea id="eMsg" style="min-height:80px"></textarea><input type="hidden" id="eTimes" value="">
              <button class="btn ghost block" type="submit" style="margin-top:10px">Send question</button><div id="eRes"></div></form>` : `
            ${enq.length ? `<div class="okbox small">You sent a ${{ viewing: 'viewing request', question: 'question', offer: 'expression of interest' }[enq[0].kind]} on ${fmtDT(enq[0].created_at)}. ${enq[0].status === 'booked' ? 'Your viewing is booked.' : 'We\'ll be in touch.'}</div>` : ''}
            <form id="enqForm">
              <div class="legend" style="margin-top:4px">I'd like to</div>
              <div class="choices" style="grid-template-columns:1fr">
                <label class="choice"><input type="radio" name="kind" value="viewing" checked><span>Arrange a private viewing</span></label>
                <label class="choice"><input type="radio" name="kind" value="question"><span>Ask a question</span></label>
                <label class="choice"><input type="radio" name="kind" value="offer"><span>Make an expression of interest</span></label>
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
  const LSTATUS = { draft: 'Draft', live: 'Live', under_offer: 'Under offer', sold: 'Sold', withdrawn: 'Withdrawn', to_market: 'Gone to open market' };
  function adminTabs(on, counts = {}) {
    return `<div class="tabs">${[['', 'Sellers and listings', counts.ready], ['applications', 'Buyer applications', counts.apps], ['members', 'Members'], ['enquiries', 'Enquiries', counts.enq]].map(([k, t, c]) => `<a href="#/admin${k ? '/' + k : ''}" class="${on === k ? 'on' : ''}">${t}${c ? ` <span class="pill new">${c}</span>` : ''}</a>`).join('')}<a href="#/" style="margin-left:auto">Member view ↗</a></div>`;
  }
  async function viewAdmin(p1, p2) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    if (p1 === 'member') return adminMember(p2);
    if (p1 === 'listing') return adminListing(p2);
    if (p1 === 'lead') return adminLead(p2);
    if (p1 === 'listings') p1 = '';
    const [members, listings, enq] = await Promise.all([
      call(sb.from('ql_members').select('*').order('submitted_at', { ascending: false, nullsFirst: false })),
      call(sb.from('ql_listings').select('*').order('created_at', { ascending: false })),
      call(sb.from('ql_enquiries').select('*').order('created_at', { ascending: false })),
    ]);
    const toReview = members.filter(m => m.status === 'pending' || (m.update_requested_at && (!m.reviewed_at || m.update_requested_at > m.reviewed_at)));
    const extra = await sellerData(listings);
    let leads = []; try { leads = await call(sb.from('ql_seller_leads').select('*').order('created_at', { ascending: false })); } catch (e) { }
    const newLeads = leads.filter(d => d.status === 'new').length;
    const counts = { apps: toReview.length, enq: enq.filter(e => e.status === 'new').length, ready: extra.ready.length + newLeads };
    const mName = id => (members.find(m => m.user_id === id) || {}).full_name || '';
    const lName = id => { const l = listings.find(x => x.id === id); return l ? `${l.ref} ${l.street || l.suburb || ''}` : ''; };
    let body = '';
    if (p1 === 'applications') {
      const rows = members.filter(m => ['pending', 'info'].includes(m.status) || toReview.includes(m));
      body = `<h2 style="font-size:30px">Applications and updates</h2>${rows.length ? memberTable(rows) : '<p class="muted">Nothing waiting for review.</p>'}
        <details style="margin-top:24px"><summary class="small muted" style="cursor:pointer">Incomplete applications (${members.filter(m => m.status === 'draft').length})</summary><div style="margin-top:10px">${memberTable(members.filter(m => m.status === 'draft'))}</div></details>`;
    } else if (p1 === 'members') {
      const rows = members.filter(m => !['draft'].includes(m.status));
      body = `<h2 style="font-size:30px">Members</h2>${memberTable(rows)}`;
    } else if (!p1) {
      let ags = [];
      try { ags = await call(sb.from('agreements').select('id,ref,address,status,config').in('status', ['signed', 'countersigned', 'sent', 'parked']).order('created_at', { ascending: false })); } catch (e) { }
      body = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="font-size:30px;margin:0">Listings</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${ags.length ? `<select id="fromAg" style="width:auto"><option value="">Start from an agency agreement…</option>${ags.map(a => `<option value="${a.id}">${esc(a.ref)} ${esc(a.address)}</option>`).join('')}</select>` : ''}<a class="btn dark" href="#/admin/listing/new">New listing</a></div></div>
        ${leadsBoard(leads)}${chainBoard(members, listings)}${sellerBoard(listings, extra)}`;
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
  /* ───────── seller qualification (price, motivation, time) ───────── */
  const MX = [['m_price', 'Price', 'Realistic about what the property is worth?'], ['m_motivation', 'Motivation', 'A situation that means they must sell, not just want to?'], ['m_time', 'Time', 'A limited timeframe in which it must be sold?']];
  const mScore = l => MX.filter(([k]) => l[k] === 'yes').length;
  const todayNZ = () => new Date(Date.now() + 13 * 36e5).toISOString().slice(0, 10);
  function tri(l, size = 120, labels = true) {
    const P = { m_price: [60, 14], m_motivation: [14, 96], m_time: [106, 96] };
    const col = v => v === 'yes' ? 'var(--gold)' : v === 'partly' ? '#E6D7BD' : '#fff';
    const edge = (a, b) => `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="${l[a] === 'yes' && l[b] === 'yes' ? 'var(--gold)' : 'var(--line2)'}" stroke-width="${l[a] === 'yes' && l[b] === 'yes' ? 4 : 2}"/>`;
    const sc = mScore(l);
    return `<svg viewBox="${labels ? '-30 -8 180 132' : '0 0 120 110'}" width="${size}" height="${size * (labels ? 132 / 180 : 110 / 120)}" role="img" aria-label="${sc} of 3">
      ${edge('m_price', 'm_motivation')}${edge('m_motivation', 'm_time')}${edge('m_time', 'm_price')}
      ${Object.entries(P).map(([k, [x, y]]) => `<circle cx="${x}" cy="${y}" r="10" fill="${col(l[k])}" stroke="${l[k] ? 'var(--gold)' : 'var(--line2)'}" stroke-width="2"/>`).join('')}
      <text x="60" y="72" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="26" fill="${sc >= 2 ? 'var(--ok)' : 'var(--ink)'}">${sc}/3</text>
      ${labels ? `<text x="60" y="-1" text-anchor="middle" font-size="11" fill="var(--muted)" dy="0">PRICE</text><text x="14" y="120" text-anchor="middle" font-size="11" fill="var(--muted)">MOTIVATION</text><text x="106" y="120" text-anchor="middle" font-size="11" fill="var(--muted)">TIME</text>` : ''}
    </svg>`;
  }
  async function sellerData(listings) {
    const stats = {}, ck = {}, nd = {};
    await Promise.all(listings.filter(l => l.status !== 'draft').map(async l => { try { stats[l.id] = await call(sb.rpc('ql_stats', { lid: l.id })); } catch (e) { } }));
    try { (await call(sb.from('ql_owner_checkins').select('*').order('at', { ascending: false }))).forEach(c => { if (!ck[c.listing_id]) ck[c.listing_id] = c; }); } catch (e) { }
    try { (await call(sb.from('ql_nudges').select('*').order('at', { ascending: false }))).forEach(n => { if (!nd[n.listing_id]) nd[n.listing_id] = n; }); } catch (e) { }
    const active = l => ['live', 'under_offer'].includes(l.status);
    const ready = listings.filter(l => active(l) && (l.market_interest_at || (ck[l.id] && ck[l.id].score >= 2 && ck[l.id].at > (l.updated_at || ''))));
    const leeway = listings.filter(l => active(l) && l.leeway_review && l.leeway_review <= todayNZ());
    return { stats, ck, nd, ready, leeway };
  }
  function sellerBoard(listings, x) {
    const active = listings.filter(l => ['live', 'under_offer'].includes(l.status));
    const conv = listings.filter(l => l.status === 'to_market').length;
    const tile = (n, t, warn) => `<div class="tile" style="padding:16px"><div style="font-family:var(--serif);font-size:34px;line-height:1;color:${warn && n ? 'var(--accent-dark)' : 'var(--ink)'}">${n}</div><div class="small muted">${t}</div></div>`;
    const weeks = l => l.published_at ? Math.max(0, Math.floor((Date.now() - new Date(l.published_at)) / 6048e5)) + ' wk' : '';
    const upd = l => !l.vendor_email ? '<span class="muted">No owner email</span>' : l.nudges === 'paused' ? '<span class="muted">Paused</span>' : (x.nd[l.id] ? `Last ${fmtDate(x.nd[l.id].at)}${x.nd[l.id].ok ? '' : ' <span class="pill declined">failed</span>'}` : 'Automatic') + (l.discretion ? '<br><span class="small">Discretion: reports only</span>' : '');
    const flags = l => [x.ready.includes(l) ? '<span class="pill new">Ready to talk</span>' : '', x.leeway.includes(l) ? '<span class="pill pending">Leeway review due</span>' : '', l.status === 'to_market' ? '' : MX.some(([k]) => !l[k]) ? '<span class="pill pending">Qualify the seller</span>' : mScore(l) < 2 ? '<span class="pill">On leeway</span>' : '<span class="pill approved">' + mScore(l) + ' of 3</span>'].filter(Boolean).join(' ');
    const sorted = listings.slice().sort((a, b) => (x.ready.includes(b) - x.ready.includes(a)) || (x.leeway.includes(b) - x.leeway.includes(a)) || ((b.created_at || '') > (a.created_at || '') ? 1 : -1));
    return `<div class="grid4" style="margin:16px 0 18px">${tile(active.length, 'live Quiet Listings')}${tile(x.ready.length, 'owners ready to talk about the open market', true)}${tile(x.leeway.length, 'leeway reviews due', true)}${tile(conv, 'converted to the open market')}</div>
      <div class="tblwrap"><table class="tbl"><tr><th>Listing</th><th>Price · Motivation · Time</th><th>Quiet for</th><th>Buyer activity</th><th>Owner updates</th><th>Owner's last check-in</th></tr>
      ${sorted.map(l => { const st = x.stats[l.id]; const c = x.ck[l.id];
        return `<tr class="click" data-go="#/admin/listing/${l.id}"><td><strong>${esc(l.ref)}</strong> ${esc(addrOf(l) || 'Untitled')}<br><span class="pill ${l.status}" style="margin-top:4px">${LSTATUS[l.status]}</span> ${flags(l)}</td>
          <td>${tri(l, 64, false)}</td><td class="small">${weeks(l)}</td>
          <td class="small">${st ? `${st.qualified} match · ${st.viewed} viewed<br>${st.saved} saved · ${st.viewings + st.offers} requests${l.share_enabled ? `<br>Share link: ${st.share_visits} visits · ${st.registrations} registered` : ''}` : '<span class="muted">Not live</span>'}</td>
          <td class="small">${upd(l)}</td><td class="small">${c ? `${c.score}/3 · ${fmtDate(c.at)}${c.answers && c.answers.market === 'yes' ? '<br><strong>Wants to talk</strong>' : ''}` : '<span class="muted">None yet</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No listings yet.</td></tr>'}</table></div>
      <p class="small muted" style="margin-top:12px">Two out of three is workable. Quiet Listings with fewer than two are on leeway: owner updates report buyer activity and gently encourage the open market, unless the owner needs discretion.</p>`;
  }
  const emailsOf = l => String(l.vendor_email || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  const qualifiesC = (m, l) => m.status === 'approved' && num(m.qualified_to) >= num(l.qualify_price) && (!l.req_cash || m.cash_verified) && (!l.req_no_sale || m.sale_free || m.cash_verified);
  function chainBoard(members, listings) {
    const act = listings.filter(l => ['draft', 'live', 'under_offer'].includes(l.status));
    const ownerOf = l => members.find(m => emailsOf(l).includes(String(m.email).toLowerCase()));
    const owned = act.map(l => ({ l, m: ownerOf(l) })).filter(x => x.m);
    const two = [], one = [];
    owned.forEach(a => act.filter(l => l.id !== a.l.id && ['live', 'under_offer'].includes(l.status) && qualifiesC(a.m, l)).forEach(l => {
      const b = owned.find(x => x.l.id === l.id);
      const sc = matchScore(a.m, l);
      if (b && qualifiesC(b.m, a.l)) { if (!two.some(t => (t[0].l.id === b.l.id && t[1].l.id === a.l.id))) two.push([a, b]); }
      else if (sc >= 2) one.push({ a, l, sc });
    }));
    if (!two.length && !one.length) return '';
    const nm = x => `<a href="#/admin/member/${x.m.user_id}">${esc(x.m.full_name || x.m.email)}</a> (<a href="#/admin/listing/${x.l.id}">${esc(x.l.ref)} ${esc(x.l.suburb || '')}</a>)`;
    return `<div class="card" style="margin-top:6px"><h3>Chain matches</h3>
      ${two.map(([a, b]) => `<p style="margin:0 0 10px"><span class="pill approved">Two-way</span> ${nm(a)} could buy ${esc(b.l.ref)}, and ${nm(b)} could buy ${esc(a.l.ref)}.</p>`).join('')}
      ${one.slice(0, 12).map(x => `<p class="small" style="margin:0 0 8px"><span class="pill">One-way</span> ${nm(x.a)} qualifies for <a href="#/admin/listing/${x.l.id}">${esc(x.l.ref)} ${esc(addrOf(x.l))}</a>, criteria match ${x.sc}/3. Their own home is with you.</p>`).join('')}
    </div>`;
  }
  function matchScore(m, l) {
    const a = m.application || {}; let s = 0;
    const subs = String(a.suburbs || '').toLowerCase();
    if (l.suburb && subs.includes(String(l.suburb).toLowerCase())) s++;
    if (!a.min_beds || (l.beds || 0) >= +a.min_beds) s++;
    const tmap = { Lifestyle: 'Lifestyle block', Unit: 'Apartment' };
    if (!(a.types || []).length || (a.types || []).includes(tmap[l.property_type] || l.property_type)) s++;
    return s;
  }

  async function fillOwner(l, force) {
    try {
      const ppl = await call(sb.from('agreement_people').select('*').eq('agreement_id', l.agreement_id).order('position'));
      const named = (ppl || []).filter(p => p.legal_name);
      if (!named.length) { if (force) toast('No owners found on that agreement.'); return; }
      const nm = named.map(p => p.pref_name || p.legal_name.split(' ')[0]);
      if (force || !l.vendor_name) l.vendor_name = nm.length < 2 ? nm[0] : nm.slice(0, -1).join(', ') + ' and ' + nm[nm.length - 1];
      if (force || !l.vendor_email) l.vendor_email = named.map(p => p.email).filter(Boolean).join(', ');
      if (force || !l.vendor_phone) l.vendor_phone = (named.find(p => p.phone) || {}).phone || '';
    } catch (e) { if (force) toast(e.message); }
  }

  /* ───────── owner's private page (no sign-in, private link) ───────── */
  async function viewOwner(tok) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    let o = null; try { o = await call(sb.rpc('ql_owner_view', { tok })); } catch (e) { }
    if (!o) { app.innerHTML = `<div class="narrow empty"><h2>This link isn't active</h2><p>If you think it should be, please contact Tim on 027 562 7207.</p></div>`; return; }
    const s = o.stats || {}; const wk = Math.max(1, Math.round((s.days || 0) / 7));
    const tile = (n, t) => `<div class="tile" style="text-align:center;padding:18px 10px"><div style="font-family:var(--serif);font-size:40px;line-height:1">${n}</div><div class="small muted" style="margin-top:6px">${t}</div></div>`;
    const q = (k, label, opts) => `<fieldset style="margin:0 0 18px"><div class="legend" style="margin:0 0 8px">${label}</div><div class="choices">${opts.map(([v, t]) => `<label class="choice"><input type="radio" name="o_${k}" value="${v}"><span>${t}</span></label>`).join('')}</div></fieldset>`;
    app.innerHTML = `<div class="narrow" style="padding:40px 20px 80px">
      <div class="eyebrow">Your Quiet Listing</div>
      <h1 style="font-size:clamp(32px,5vw,46px)">${esc([o.street, o.suburb].filter(Boolean).join(', ') || o.ref)}</h1>
      <p class="muted">${o.status === 'draft' ? 'Not yet live to members.' : `A Quiet Listing for ${wk} week${wk === 1 ? '' : 's'}. Only buyers we've personally verified can see it.`}</p>
      <div class="grid4" style="margin:18px 0 26px">${tile(s.members || 0, 'verified buyers can see it')}${tile(s.viewed || 0, 'have looked at it')}${tile(s.saved || 0, 'shortlisted it')}${tile((s.viewings || 0) + (s.offers || 0), 'viewing requests')}</div>
      ${o.share_slug ? `<div class="card"><h3>Your share link</h3><p class="small muted" style="margin-top:0">Share your home on Facebook, in community groups or with friends. People see a photo and a short summary, and must register with us to see more, so the tyre kickers are filtered out for you.</p>
        <div class="copybox" style="word-break:break-all">${esc(SITE + 'q/' + o.share_slug + '/')}</div>
        <p style="margin:10px 0 0"><button type="button" class="btn dark sm" id="shCopy">Copy link</button> <a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE + 'q/' + o.share_slug + '/')}">Share on Facebook</a></p>
        <p class="small" style="margin:12px 0 0"><strong>${s.share_visits || 0}</strong> visits from your link · <strong>${s.registrations || 0}</strong> registered buyers</p></div>` : ''}
      <form class="card" id="ckForm"><h2 style="font-size:30px">A quick check-in</h2><p class="muted" style="margin-top:-4px">Your answers go straight to Tim and help him advise you well. Nobody else sees them.</p>
        ${q('price', 'Has your view on price changed since we spoke?', [['same', 'No, it\'s the same'], ['flexible', 'I\'m open to offers below it'], ['higher', 'I\'d now want more']])}
        ${q('motivation', 'Do you need to sell, or would you like to sell?', [['need', 'I need to sell'], ['like', 'I\'d like to, if the price is right'], ['testing', 'I\'m just testing the waters']])}
        ${q('time', 'Is there a date you need to be sold by?', [['yes', 'Yes'], ['rough', 'Roughly'], ['no', 'No']])}
        <div id="dateBox" class="hidden"><label class="f" for="oDate" style="margin-top:-6px">Roughly when?</label><input type="text" id="oDate" placeholder="e.g. before Christmas, by March"></div>
        ${q('market', o.discretion ? 'Would you like to talk about other ways of finding a buyer?' : 'Would you like to talk about taking your home to the open market?', [['yes', 'Yes, let\'s talk'], ['notyet', 'Not yet']])}
        <label class="f" for="oCom">Anything else Tim should know? <span class="opt">(optional)</span></label><textarea id="oCom" style="min-height:80px"></textarea>
        <button class="btn primary" type="submit" style="margin-top:16px">Send to Tim</button><div id="ckRes"></div>
      </form>
      ${o.discretion ? '' : `<div class="card" style="background:var(--ink);color:#E8E1D6;border-color:var(--ink)"><h3 style="color:#fff">Thinking about the open market?</h3><p style="margin:0">Quiet Listings members are a small, carefully chosen group. The open market reaches every buyer, and creates the competition that sets the best price. It can still be discreet: no signboard, private viewings and the street address withheld.</p></div>`}
      ${dwellCard('owner')}
      <p class="small muted">This page is private to you. Please don't share its address. Your share link above is the one to share.</p></div>`;
    const shc = $('#shCopy'); if (shc) shc.onclick = async () => { try { await navigator.clipboard.writeText(SITE + 'q/' + o.share_slug + '/'); toast('Link copied'); } catch (x) { } };
    $$('input[name=o_time]').forEach(r => r.onchange = () => $('#dateBox').classList.toggle('hidden', r.value === 'no' && r.checked));
    $('#ckForm').onsubmit = async e => {
      e.preventDefault();
      const v = k => ($(`input[name=o_${k}]:checked`) || {}).value;
      if (!v('price') || !v('motivation') || !v('time') || !v('market')) { $('#ckRes').innerHTML = '<div class="err">Please answer all four questions.</div>'; return; }
      const b = $('#ckForm button'); busy(b, true, 'Sending…');
      try {
        await call(sb.rpc('ql_owner_checkin', { tok, answers: { price: v('price'), motivation: v('motivation'), time: v('time'), date: $('#oDate').value.trim() || null, market: v('market'), comment: $('#oCom').value.trim() || null } }));
        sb.functions.invoke('ql-nudge', { body: { mode: 'checkin', token: tok } }).catch(() => null);
        $('#ckForm').innerHTML = `<h2 style="font-size:30px">Thank you</h2><p style="margin:0">Tim has your answers${v('market') === 'yes' ? ' and will be in touch to talk through your options' : ''}.</p>`;
      } catch (x) { busy(b, false); $('#ckRes').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    };
  }

  /* ───────── seller enquiries ───────── */
  const LEAD_ST = { new: 'New', contacted: 'Contacted', appraisal: 'Appraisal booked', listed: 'Listed', not_proceeding: 'Not proceeding' };
  const LM = { need: 'Needs to sell', like: 'Would like to, if the price is right', testing: 'Just testing the waters' };
  const LT = { yes: 'Has a date to be sold by', rough: 'Roughly', no: 'No deadline' };
  const LP = { essential: 'Essential: must stay private', preferred: 'Preferred for now', open: 'Not important' };
  function leadsBoard(leads) {
    const open = leads.filter(d => !['listed', 'not_proceeding'].includes(d.status));
    if (!open.length) return '';
    return `<h3 style="margin:20px 0 10px">Seller enquiries (${open.length})</h3><div class="tblwrap" style="margin-bottom:22px"><table class="tbl"><tr><th>Received</th><th>Owner</th><th>Property</th><th>Motivation · Time</th><th>Privacy</th><th>Status</th></tr>
      ${open.map(d => `<tr class="click" data-go="#/admin/lead/${d.id}"><td class="small">${fmtDT(d.created_at)}</td><td><strong>${esc(d.name)}</strong>${d.also_buying ? '<br><span class="pill">Also buying</span>' : ''}</td><td>${esc(d.address)}</td><td class="small">${esc(LM[d.motivation] || '')}<br>${esc(LT[d.time] || '')}${d.time_when ? ': ' + esc(d.time_when) : ''}</td><td class="small">${esc(LP[d.privacy] || '')}</td><td><span class="pill ${d.status === 'new' ? 'new' : ''}">${LEAD_ST[d.status]}</span></td></tr>`).join('')}</table></div>`;
  }
  function leadToListing(d) {
    const parts = String(d.address || '').split(',').map(x => x.trim());
    const map = { 'Lifestyle block': 'Lifestyle' };
    return { lead_id: d.id, vendor_name: d.name, vendor_email: d.email, vendor_phone: d.phone, street: parts[0] || '', suburb: parts[1] || '', city: parts[2] || 'Dunedin',
      property_type: map[d.property_type] || d.property_type || null, beds: parseInt(d.beds) || null,
      m_motivation: { need: 'yes', like: 'partly', testing: 'no' }[d.motivation] || null, m_time: { yes: 'yes', rough: 'partly', no: 'no' }[d.time] || null,
      discretion: d.privacy === 'essential', seller_price_low: d.price_low || null, seller_price_high: d.price_high || null };
  }
  async function adminLead(id) {
    const d = await call(sb.from('ql_seller_leads').select('*').eq('id', id).single());
    const rows = [['Email', `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>`], ['Phone', `<a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>`], ['Property', esc(d.address)], ['Type', esc([d.property_type, d.beds ? d.beds + ' bedrooms' : ''].filter(Boolean).join(', '))],
      ['Their price band (never shown)', d.price_low ? `${money(d.price_low)} to ${money(d.price_high)}` : esc(d.expected_price)], ['Appraised', esc(d.appraised)], ['What\'s prompting the move', esc(d.reason)], ['Need or want', esc(LM[d.motivation])], ['Timeframe', esc([LT[d.time], d.time_when].filter(Boolean).join(': '))],
      ['Privacy', esc(LP[d.privacy])], ['Also buying', d.also_buying ? 'Yes' : 'No'], ['Comments', esc(d.comments)], ['Received', fmtDT(d.created_at)]].filter(r => r[1]);
    const pre = { m_price: null, m_motivation: { need: 'yes', like: 'partly', testing: 'no' }[d.motivation], m_time: { yes: 'yes', rough: 'partly', no: 'no' }[d.time] };
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs('')}
      <a class="btn link" href="#/admin" style="padding-left:0">← Sellers and listings</a>
      <h1 style="font-size:38px;margin-top:8px">${esc(d.name)}</h1>
      <div class="split"><div class="card"><h3>Seller enquiry</h3><table class="kv">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></div>
      <aside class="side"><div class="card"><h3>On their own answers</h3><div style="text-align:center">${tri(pre, 150)}</div>
        <p class="small muted">Motivation and time come from what they told us. Price realism is yours to judge at the appraisal.</p>
        <label class="f" for="ldSt">Status</label><select id="ldSt">${Object.entries(LEAD_ST).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${d.listing_id ? `<a class="btn ghost block" style="margin-top:14px" href="#/admin/listing/${d.listing_id}">Open their Quiet Listing</a>` : `<button class="btn primary block" style="margin-top:14px" id="ldList">Create a Quiet Listing from this</button>`}
      </div></aside></div></div>`;
    $('#ldSt').onchange = async e => { try { await call(sb.from('ql_seller_leads').update({ status: e.target.value }).eq('id', id)); toast('Updated'); } catch (x) { toast(x.message); } };
    const b = $('#ldList'); if (b) b.onclick = () => { sessionStorage.setItem('qlFromLead', JSON.stringify(d)); go('#/admin/listing/new'); };
  }

  /* ───────── quick registration from a share link ───────── */
  async function viewRegister(slug) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    let p = null; try { p = await call(sb.rpc('ql_share_page', { p_slug: slug })); } catch (e) { }
    if (!p) { app.innerHTML = `<div class="narrow empty"><h2>This Quiet Listing is no longer available</h2><p>Others may be. Quiet Listings are homes offered privately to registered buyers.</p><a class="btn dark" href="#/">See Quiet Listings</a></div>`; return; }
    if (S.session && !S.agent) {
      try { const lid = await call(sb.rpc('ql_register_interest', { p_slug: slug })); notify({ type: 'interest' }); S.me = await call(sb.rpc('ql_me')); S.listings = null; return go('#/listing/' + lid); }
      catch (x) { app.innerHTML = `<div class="narrow empty"><h2>${esc(x.message)}</h2><a class="btn dark" href="#/">Back</a></div>`; return; }
    }
    const facts = [p.beds ? `${p.beds} bedrooms` : '', p.baths ? `${+p.baths} bathrooms` : '', p.parking ? `${p.parking} parking` : ''].filter(Boolean);
    app.innerHTML = `<div class="narrow" style="padding:30px 20px 80px">
      ${p.image ? `<div class="ph" style="border-radius:12px;aspect-ratio:1.91/1"><img src="${esc(p.image)}" alt=""><span class="badge">Quiet Listing</span></div>` : ''}
      <h1 style="font-size:clamp(28px,4.5vw,40px);margin-top:18px">${esc(p.headline || (p.type || 'Property') + ' in ' + p.suburb)}</h1>
      <p class="muted" style="margin:0">${esc([p.street, p.suburb, p.city].filter(Boolean).join(', '))} · Expressions of interest${facts.length ? ' · ' + esc(facts.join(' · ')) : ''}</p>
      ${p.summary ? `<p style="font-size:19px;margin:14px 0 0">${esc(p.summary)}</p>` : ''}
      ${S.agent ? '<div class="note">You\'re signed in as the agent. Buyers see a registration form here.</div>' : `
      <form class="card" id="qrForm" style="margin-top:24px" novalidate>
        <h2 style="font-size:28px">Register to see the full listing</h2>
        <p class="muted" style="margin-top:-4px">Full details and photos are for registered buyers. It takes a minute. For serious house hunters only.</p>
        <div class="row2"><div><label class="f" for="qName">Your name</label><input type="text" id="qName" autocomplete="name"></div><div><label class="f" for="qPhone">Mobile</label><input type="tel" id="qPhone" autocomplete="tel"></div></div>
        <label class="f" for="qEmail">Email</label><input type="email" id="qEmail" autocomplete="email">
        <label class="f" for="qBudget">Your budget, roughly</label><select id="qBudget"><option value="">Choose…</option>${['Under $500,000', '$500,000 to $750,000', '$750,000 to $1 million', '$1 million to $1.5 million', 'Over $1.5 million'].map(b => `<option>${b}</option>`).join('')}</select>
        <fieldset><div class="legend">Do you have a property to sell?</div><div class="choices">${[['No', 'No'], ['Yes, I need to sell first', 'Yes, I need to sell first'], ['Yes, but I don\'t need to sell first', 'Yes, but I don\'t need to sell first']].map(([v, t]) => `<label class="choice"><input type="radio" name="q_sell" value="${esc(v)}"><span>${t}</span></label>`).join('')}</div></fieldset>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="qOk"><span>I'm genuinely looking to buy. I'll keep this listing confidential, and I agree to the <a href="#/privacy" target="_blank">privacy statement</a>.</span></label>
        <div id="qErr"></div>
        <button class="btn primary block" type="submit" style="margin-top:14px">Email me a secure link</button>
        <p class="small muted" style="margin:10px 0 0">Already registered? Just enter your email above and we'll sign you in.</p>
      </form>`}
      <p class="small muted" style="margin-top:20px">Offered privately by McGuire Real Estate Ltd, Licensed REAA 2008.</p></div>`;
    const f = $('#qrForm'); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault();
      const d = { slug, name: $('#qName').value.trim(), phone: $('#qPhone').value.trim(), email: $('#qEmail').value.trim().toLowerCase(), budget: $('#qBudget').value || null, need_to_sell: ($('input[name=q_sell]:checked') || {}).value || null };
      const err = !d.name || !d.phone || !/^\S+@\S+\.\S+$/.test(d.email) ? 'Please give your name, mobile and email.' : !d.budget || !d.need_to_sell ? 'Please tell us your budget and whether you have a property to sell.' : !$('#qOk').checked ? 'Please tick the box to continue.' : '';
      if (err) { $('#qErr').innerHTML = `<div class="err">${esc(err)}</div>`; return; }
      const b = $('button[type=submit]', f); busy(b, true, 'Sending…');
      try {
        await call(sb.rpc('ql_quick_start', { p: d }));
        try { localStorage.setItem('qlReturn', SITE); } catch (x) { }
        const { error } = await sb.auth.signInWithOtp({ email: d.email, options: { emailRedirectTo: SITE } });
        if (error) throw error;
        f.innerHTML = `<h2 style="font-size:28px">Check your email</h2><p>We've sent a secure link to <strong>${esc(d.email)}</strong>. Tap it on this device to see the full listing. It may take a minute, and can land in your spam folder.</p>
          ${d.need_to_sell.startsWith('Yes') ? `<div class="okbox small"><strong>You have a home to sell too.</strong> List it quietly with us and become an owner-member: 48 hours' early access to new Quiet Listings, and we'll look for buyers whose homes suit you. <a href="#/sell/both">Tell us about your home</a>.</div>${dwellCard('register', 'Get your own home ready')}` : ''}`;
      } catch (x) { busy(b, false); $('#qErr').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    };
  }

  /* ───────── public: selling enquiry ───────── */
  function viewSell(both) {
    const q = (k, label, opts, hint) => `<fieldset><div class="legend">${label}</div>${hint ? `<div class="hint">${hint}</div>` : ''}<div class="choices">${opts.map(([v, t]) => `<label class="choice"><input type="radio" name="s_${k}" value="${esc(v)}"><span>${t}</span></label>`).join('')}</div></fieldset>`;
    app.innerHTML = `<div class="narrow wz">
      <div class="eyebrow">${both ? 'Selling and buying' : 'Selling quietly'}</div>
      <h1>${both ? 'Let\'s start with your sale' : 'Sell privately, to qualified buyers'}</h1>
      <p class="muted" style="font-size:18px">${both ? 'Tell us about the home you\'re selling. Once that\'s done, you can apply for buyer membership, and we\'ll plan both moves so the timing works.' : 'Tell us a little about your property and your plans. Tim will call you to talk it through and arrange a written appraisal. No obligation, and everything stays confidential.'}</p>
      <form id="sellForm" novalidate>
        <div class="row2"><div><label class="f" for="sName">Your name</label><input type="text" id="sName" autocomplete="name"></div><div><label class="f" for="sPhone">Phone</label><input type="tel" id="sPhone" autocomplete="tel"></div></div>
        <label class="f" for="sEmail">Email</label><input type="email" id="sEmail" autocomplete="email">
        <label class="f" for="sAddr">Property address</label><div class="hint">Street, suburb, town.</div><input type="text" id="sAddr" placeholder="e.g. 12 Example Street, Maori Hill, Dunedin">
        <div class="row2"><div><label class="f" for="sType">Property type</label><select id="sType"><option value="">Choose…</option>${['House', 'Townhouse', 'Apartment', 'Character home', 'Lifestyle block', 'Section'].map(t => `<option>${t}</option>`).join('')}</select></div><div><label class="f" for="sBeds">Bedrooms</label><input type="number" id="sBeds" inputmode="numeric"></div></div>
        <div class="legend">What price range would you be comfortable selling for?</div>
        <div class="hint">This is just for Tim. It's never shown, advertised or searchable: every Quiet Listing is offered by expressions of interest, so your plans and expectations stay private.</div>
        <div class="row2"><div><label class="f" for="sLow" style="margin-top:0">From</label><input type="text" id="sLow" inputmode="numeric" placeholder="$"></div><div><label class="f" for="sHigh" style="margin-top:0">To</label><input type="text" id="sHigh" inputmode="numeric" placeholder="$"></div></div>
        ${q('appraised', 'Has it been appraised in the last six months?', [['Yes, by McGuire Real Estate', 'Yes, by McGuire Real Estate'], ['Yes, by another agent', 'Yes, by another agent'], ['No', 'No']])}
        ${q('reason', 'What\'s prompting the move?', ['Moving up', 'Downsizing', 'Relocating', 'Change in family circumstances', 'Financial reasons', 'Estate or trust sale', 'Testing the market', 'Other'].map(x => [x, x]))}
        ${q('motivation', 'Do you need to sell, or would you like to sell?', [['need', 'I need to sell'], ['like', 'I\'d like to, if the price is right'], ['testing', 'I\'m just testing the waters']])}
        ${q('time', 'Is there a date you need to be sold by?', [['yes', 'Yes'], ['rough', 'Roughly'], ['no', 'No']])}
        <div id="sWhenBox" class="hidden"><label class="f" for="sWhen">When?</label><input type="text" id="sWhen" placeholder="e.g. before Christmas, by March"></div>
        ${q('privacy', 'How important is privacy?', [['essential', 'Essential: it must stay private'], ['preferred', 'Preferred, for now'], ['open', 'Not important']])}
        ${both ? '' : `<label class="check" style="margin-top:14px"><input type="checkbox" id="sBuy"><span>I'm also buying</span></label>`}
        <label class="f" for="sCom">Anything else? <span class="opt">(optional)</span></label><textarea id="sCom" style="min-height:90px"></textarea>
        <label class="check"><input type="checkbox" id="sOk"><span>I agree to McGuire Real Estate contacting me about selling, and to the <a href="#/privacy" target="_blank">privacy statement</a>.</span></label>
        <div id="sErr"></div>
        <div class="wz-actions"><a class="btn ghost" href="#/">Back</a><button class="btn primary" type="submit">Send to Tim</button></div>
      </form></div>`;
    $$('input[name=s_time]').forEach(r => r.onchange = () => $('#sWhenBox').classList.toggle('hidden', !(r.checked && r.value !== 'no')));
    $('#sellForm').onsubmit = async e => {
      e.preventDefault();
      const v = k => ($(`input[name=s_${k}]:checked`) || {}).value || null;
      const p = { name: $('#sName').value.trim(), phone: $('#sPhone').value.trim(), email: $('#sEmail').value.trim(), address: $('#sAddr').value.trim(), property_type: $('#sType').value || null, beds: $('#sBeds').value || null,
        price_low: num($('#sLow').value) || null, price_high: num($('#sHigh').value) || null, appraised: v('appraised'), reason: v('reason'), motivation: v('motivation'), time: v('time'), time_when: $('#sWhen').value.trim() || null, privacy: v('privacy'),
        also_buying: both || !!($('#sBuy') && $('#sBuy').checked), comments: $('#sCom').value.trim() || null };
      const err = !p.name || !p.phone || !/^\S+@\S+\.\S+$/.test(p.email) ? 'Please give your name, phone and email.' : p.address.length < 6 ? 'Please give the property address.' : !p.price_low || !p.price_high || p.price_high < p.price_low ? 'Please give the price range you\'d be comfortable with (from and to).' : !p.motivation || !p.time || !p.privacy ? 'Please answer the questions about your plans and privacy.' : !$('#sOk').checked ? 'Please tick the box so we can contact you.' : '';
      if (err) { $('#sErr').innerHTML = `<div class="err">${esc(err)}</div>`; return; }
      const b = $('#sellForm button[type=submit]'); busy(b, true, 'Sending…');
      try {
        const lid = await call(sb.rpc('ql_seller_enquiry', { p }));
        sb.functions.invoke('ql-nudge', { body: { mode: 'seller', lead_id: lid } }).catch(() => null);
        window.scrollTo(0, 0);
        app.innerHTML = `<div class="narrow" style="padding:60px 20px 90px"><div class="eyebrow">Thank you</div><h1 style="font-size:44px">Tim will be in touch shortly</h1>
          <p style="font-size:18px">We've received your enquiry about ${esc(p.address)}. Tim will call you to talk through your plans and arrange a time to see the property.</p>
          ${dwellCard('sell', 'While you wait: start your home\'s file')}
          ${p.also_buying ? `<div class="card" style="margin-top:22px"><h3>Next: your buyer membership</h3><p class="small okbox">Once your home is listed with us, you're an owner-member: 48 hours' early access to new Quiet Listings, and we'll look for buyers whose homes might suit you.</p><p>To see Quiet Listings as a buyer, apply for membership. Use the same email address, ${esc(p.email)}, and tell us your property is about to be listed when you get to the finance step.</p><a class="btn dark" href="#/apply">Apply for buyer membership</a></div>` : '<a class="btn ghost" href="#/">Back to Quiet Listings</a>'}</div>`;
      } catch (x) { busy(b, false); $('#sErr').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    };
  }

  function memberTable(rows) {
    if (!rows.length) return '<p class="muted">None.</p>';
    return `<div class="tblwrap"><table class="tbl"><tr><th>Name</th><th>Status</th><th>Their budget</th><th>Matching budget</th><th>Funding</th><th>Applied</th></tr>
      ${rows.map(m => { const a = m.application || {}; const upd = m.update_requested_at && (!m.reviewed_at || m.update_requested_at > m.reviewed_at);
        return `<tr class="click" data-go="#/admin/member/${m.user_id}"><td><strong>${esc(m.full_name || m.email)}</strong><br><span class="small muted">${esc(m.email)}</span></td><td><span class="pill ${m.status}">${STATUS_LABEL[m.status]}</span>${upd ? '<br><span class="pill new" style="margin-top:4px">Update sent</span>' : ''}</td><td>${a.budget ? money(a.budget) : ''}</td><td>${m.qualified_to ? money(m.qualified_to) : '<span class="muted">Not set</span>'}</td><td class="small">${esc(a.finance_type || '')}${(a.docs || []).length ? `<br>${a.docs.length} document${a.docs.length > 1 ? 's' : ''}` : ''}</td><td class="small">${fmtDate(m.submitted_at || m.created_at)}</td></tr>`; }).join('')}</table></div>`;
  }

  async function adminMember(id) {
    const m = await call(sb.from('ql_members').select('*').eq('user_id', id).single());
    const rv = await call(sb.from('ql_reviews').select('*').eq('user_id', id).maybeSingle());
    const enq = await call(sb.from('ql_enquiries').select('*').eq('user_id', id).order('created_at', { ascending: false }));
    const allL = await call(sb.from('ql_listings').select('*'));
    const listings = allL.filter(l => ['live', 'under_offer'].includes(l.status));
    const ownL = allL.find(l => ['draft', 'live', 'under_offer'].includes(l.status) && emailsOf(l).includes(String(m.email).toLowerCase()));
    let ints = []; try { ints = await call(sb.from('ql_interests').select('*').eq('user_id', id)); } catch (e) { }
    const a = m.application || {};
    let files = [];
    try { const { data } = await sb.storage.from('private').list(`ql/${id}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }); files = data || []; } catch (e) { }
    const urls = {};
    if (files.length) { const { data } = await sb.storage.from('private').createSignedUrls(files.map(f => `ql/${id}/${f.name}`), 3600); (data || []).forEach(d => urls[d.path] = d.signedUrl); }
    const qualifies = l => num(m.qualified_to) >= num(l.qualify_price) && (!l.req_cash || m.cash_verified) && (!l.req_no_sale || m.sale_free || m.cash_verified);
    const sec = (t, rows) => `<div class="card"><h3>${t}</h3><table class="kv">${rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '' && !(Array.isArray(r[1]) && !r[1].length)).map(([k, v]) => `<tr><td>${k}</td><td>${Array.isArray(v) ? esc(v.join(', ')) : esc(v)}</td></tr>`).join('')}</table></div>`;
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs('members')}
      <a class="btn link" href="#/admin/applications" style="padding-left:0">← Buyer applications</a>
      <h1 style="font-size:40px;margin-top:8px">${esc(m.full_name || m.email)} <span class="pill ${m.status}" style="vertical-align:middle;font-family:var(--sans)">${STATUS_LABEL[m.status]}</span>${ownL ? ` <span class="pill to_market" style="vertical-align:middle;font-family:var(--sans)">Owner-member</span>` : ''}</h1>
      ${ownL ? `<p class="small" style="margin-top:-6px">Their own home: <a href="#/admin/listing/${ownL.id}">${esc(ownL.ref)} ${esc(addrOf(ownL))}</a></p>` : ''}
      ${ints.length ? `<div class="note small">Registered through share link${ints.length > 1 ? 's' : ''} for ${ints.map(i => { const x = allL.find(z => z.id === i.listing_id); return x ? `<a href="#/admin/listing/${x.id}">${esc(x.ref)} ${esc(x.suburb || '')}</a>` : ''; }).join(', ')}${a.quick ? `. Said: budget ${esc(a.quick.budget || '?')}, ${esc((a.quick.need_to_sell || '').toLowerCase())}.` : '.'}</div>` : ''}
      <div class="split"><div>
        ${sec('Contact', [['Email', m.email], ['Phone', m.phone], ['Home address', m.home_address], ['Applied', fmtDT(m.submitted_at)]])}
        ${sec('Experience', [['Bought before', a.bought], ['Sold before', a.sold], ['Owns property', a.owns], ['Buying', a.buying_as], ['Looking for', a.looking_for], ['Offers in last 12 months', a.offers]])}
        ${sec('Finance (their figures)', [['Maximum budget', a.budget ? money(a.budget) : ''], ['Funding', a.finance_type], ['Lender', a.lender], ['Pre-approved amount', a.preapproved ? money(a.preapproved) : ''], ['Pre-approval expires', a.preapproval_expiry], ['Deposit or cash', a.deposit ? money(a.deposit) : ''], ['Needs to sell first', a.need_to_sell]])}
        <div class="card"><h3>Documents</h3>${files.length ? `<ul class="uploads">${files.map(f => `<li><a href="${urls[`ql/${id}/${f.name}`] || '#'}" target="_blank" rel="noopener">${esc(f.name.replace(/^\d+-/, ''))}</a> <span class="small muted">${fmtDate(f.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No documents uploaded.</p>'}</div>
        <div class="card"><h3>Top 10 criteria</h3><ol style="margin:0;padding-left:22px">${(a.criteria || []).filter(Boolean).map(c => `<li>${esc(c)}</li>`).join('')}</ol>
          <table class="kv" style="margin-top:12px"><tr><td>Areas</td><td>${esc(a.suburbs || '')}</td></tr><tr><td>Types</td><td>${esc((a.types || []).join(', '))}</td></tr><tr><td>Bedrooms / bathrooms</td><td>${esc(a.min_beds || '-')} / ${esc(a.min_baths || '-')}</td></tr><tr><td>Land</td><td>${esc(a.min_land || '')}</td></tr></table></div>
        ${sec('Why they\'re buying', [['Reason', a.reason], ['In their words', a.story], ['Timeframe', a.timeframe], ['Decision makers', a.decision_makers]])}
        ${(a.updates || []).length ? `<div class="card"><h3>Updates from the member</h3>${a.updates.slice().reverse().map(u => `<p style="margin:0 0 10px"><span class="small muted">${fmtDT(u.at)}</span><br>${esc(u.note)}${Object.entries(u.finance || {}).filter(([k]) => k !== 'docs').map(([k, v]) => `<br><span class="small">${esc(k)}: ${esc(v)}</span>`).join('')}</p>`).join('')}</div>` : ''}
        <div class="card"><h3>Stock that suits them</h3>${(() => { const rows = listings.filter(qualifies).map(l => ({ l, sc: matchScore(m, l) })).sort((x, y) => y.sc - x.sc);
          return rows.length ? `<table class="kv">${rows.map(({ l, sc }) => `<tr><td><a href="#/admin/listing/${l.id}">${esc(l.ref)} ${esc(addrOf(l))}</a><br><span class="small muted">${l.beds || '-'} bed · ${esc(l.property_type || '')}</span></td><td style="width:auto;text-align:right">Match ${sc}/3<br><button class="btn link" data-sendl="${l.id}">Email it to them</button></td></tr>`).join('')}</table>` : `<p class="muted" style="margin:0">${m.status === 'approved' ? 'No live listings within their verified position.' : 'Approve them and set a verified budget to see matching stock.'}</p>`; })()}</div>
        ${enq.length ? `<div class="card"><h3>Enquiries</h3><table class="kv">${enq.map(e => `<tr><td>${fmtDT(e.created_at)}</td><td><a href="#/admin/listing/${e.listing_id}">${esc((listings.find(l => l.id === e.listing_id) || {}).ref || 'Listing')}</a> ${e.kind} <span class="pill">${e.status}</span></td></tr>`).join('')}</table></div>` : ''}
      </div>
      <aside class="side"><div class="card">
        <h3>Your decision</h3>
        <label class="f" for="rStatus" style="margin-top:6px">Status</label>
        <select id="rStatus">${['pending', 'info', 'approved', 'declined', 'suspended', 'draft'].map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${{ pending: 'To review', info: 'Ask for more information', approved: 'Approve', declined: 'Decline', suspended: 'Pause access', draft: 'Return to incomplete' }[s]}</option>`).join('')}</select>
        <label class="f" for="rBudget">Budget for matching <span class="opt">(after you've spoken to them)</span></label><div class="hint">Never shown to them. Used for your matching and new-listing alerts.</div>
        <input type="text" id="rBudget" inputmode="numeric" value="${m.qualified_to ? money(m.qualified_to) : ''}" placeholder="$">
        <label class="check"><input type="checkbox" id="rCash" ${m.cash_verified ? 'checked' : ''}><span>Cash buyer</span></label>
        <label class="check"><input type="checkbox" id="rSale" ${m.sale_free ? 'checked' : ''}><span>No sale to sell first</span></label>
        <label class="f" for="rMsg">Message to the member <span class="opt">(included in the email)</span></label><textarea id="rMsg" style="min-height:80px">${esc(m.decision_message || '')}</textarea>
        <label class="f" for="rNotes">Private notes <span class="opt">(only you see these)</span></label><textarea id="rNotes" style="min-height:80px">${esc((rv && rv.notes) || '')}</textarea>
        <div style="display:grid;gap:8px;margin-top:14px"><button class="btn primary" id="rSaveEmail">Save and email the member</button><button class="btn ghost" id="rSave">Save without emailing</button></div>
        <div id="rRes"></div>
        <p class="small muted" style="margin:14px 0 0">With these settings they match <strong id="rCount">${listings.filter(qualifies).length}</strong> of ${listings.length} live listing${listings.length === 1 ? '' : 's'}.</p>
      </div></aside></div></div>`;
    const recount = () => { const t = { qualified_to: num($('#rBudget').value), cash_verified: $('#rCash').checked, sale_free: $('#rSale').checked }; $('#rCount').textContent = $('#rStatus').value === 'approved' ? listings.filter(l => num(t.qualified_to) >= num(l.qualify_price) && (!l.req_cash || t.cash_verified) && (!l.req_no_sale || t.sale_free || t.cash_verified)).length : 0; };
    ['#rBudget', '#rCash', '#rSale', '#rStatus'].forEach(s => $(s).addEventListener('input', recount)); recount();
    const doSave = async (email, btn) => {
      const st = $('#rStatus').value;
      busy(btn, true, 'Saving…');
      try {
        await call(sb.from('ql_members').update({ status: st, qualified_to: num($('#rBudget').value) || null, cash_verified: $('#rCash').checked, sale_free: $('#rSale').checked, decision_message: $('#rMsg').value.trim() || null, reviewed_at: new Date().toISOString(), reviewed_by: S.session.user.email, updated_at: new Date().toISOString() }).eq('user_id', id));
        await call(sb.from('ql_reviews').upsert({ user_id: id, notes: $('#rNotes').value, updated_at: new Date().toISOString() }));
        if (email) { const { data, error } = await sb.functions.invoke('ql-notify', { body: { type: 'decision', user_id: id, site: SITE } }); if (error || (data && data.error)) throw new Error('Saved, but the email failed: ' + ((data && data.error) || error.message)); }
        $('#rRes').innerHTML = `<div class="okbox">Saved${email ? ' and emailed' : ''}.</div>`;
      } catch (x) { $('#rRes').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
      busy(btn, false);
    };
    $$('[data-sendl]', app).forEach(b => b.onclick = async () => { busy(b, true, 'Sending…'); const { data, error } = await sb.functions.invoke('ql-notify', { body: { type: 'alert', listing_id: b.dataset.sendl, only: [id], site: SITE } }); b.disabled = false; b.textContent = error || data.error ? 'Failed: ' + ((data && data.error) || error.message) : data.sent ? 'Emailed' : 'Already emailed'; });
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
    if (!l.id) { const ld = JSON.parse(sessionStorage.getItem('qlFromLead') || 'null'); sessionStorage.removeItem('qlFromLead'); if (ld) Object.assign(l, leadToListing(ld)); }
    if (!l.id && l.agreement_id) await fillOwner(l);
    await signPhotos(l.photos || []);
    let nudges = [], checkins = [], st = null;
    if (l.id) {
      try { nudges = await call(sb.from('ql_nudges').select('*').eq('listing_id', l.id).order('at', { ascending: false })); } catch (e) { }
      try { checkins = await call(sb.from('ql_owner_checkins').select('*').eq('listing_id', l.id).order('at', { ascending: false })); } catch (e) { }
      try { st = await call(sb.rpc('ql_stats', { lid: l.id })); } catch (e) { }
    }
    const ownerLink = l.vendor_token ? `${SITE}#/owner/${l.vendor_token}` : '';
    const CK = { price: { same: 'view unchanged', flexible: 'open to offers below it', higher: 'now wants more', yes: 'would accept around the guide', consider: 'would consider it', no: 'wants more' }, motivation: { need: 'needs to sell', like: 'would like to sell', testing: 'testing the waters' }, time: { yes: 'has a deadline', rough: 'roughly', no: 'no deadline' } };
    const timeline = [...nudges.map(n => ({ at: n.at, h: `<strong>Owner update ${n.stage}</strong> ${n.ok ? 'sent' : '<span class="pill declined">failed</span>'}${n.manual ? ' (sent by you)' : ''}<br><span class="small muted">${esc(n.subject || '')}${n.error ? ' · ' + esc(n.error) : ''}</span>` })),
      ...checkins.map(c => ({ at: c.at, h: `<strong>Owner check-in: ${c.score}/3</strong><br><span class="small muted">Price: ${esc((CK.price[c.answers.price]) || '-')} · Motivation: ${esc(CK.motivation[c.answers.motivation] || '-')} · Time: ${esc(CK.time[c.answers.time] || '-')}${c.answers.date ? ' (' + esc(c.answers.date) + ')' : ''}${c.answers.market === 'yes' ? ' · <strong>wants to talk about the open market</strong>' : ''}${c.answers.comment ? '<br>“' + esc(c.answers.comment) + '”' : ''}</span>` }))].sort((a, b) => a.at < b.at ? 1 : -1);
    let qm = [], alerted = [];
    if (l.id) { try { qm = await call(sb.rpc('ql_qualified_members', { lid: l.id })); alerted = (await call(sb.from('ql_alerts').select('user_id').eq('listing_id', l.id))).map(x => x.user_id); } catch (e) { } }
    const inp = (k, label, o = {}) => `<label class="f" for="l_${k}">${label}${o.opt ? ' <span class="opt">(optional)</span>' : ''}</label>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}${o.area ? `<textarea id="l_${k}" data-l="${k}" rows="${o.rows || 6}">${esc(Array.isArray(l[k]) ? l[k].join('\n') : l[k] ?? '')}</textarea>` : `<input type="${o.type || 'text'}" id="l_${k}" data-l="${k}" value="${esc(l[k] ?? '')}" ${o.im ? `inputmode="${o.im}"` : ''} placeholder="${esc(o.ph || '')}">`}`;
    const pending = qm.filter(m => !alerted.includes(m.user_id));
    app.innerHTML = `<div class="wrap" style="padding-bottom:70px"><div class="eyebrow" style="margin-top:28px">Quiet Listings admin</div>${adminTabs('')}
      <a class="btn link" href="#/admin" style="padding-left:0">← Sellers and listings</a>
      <h1 style="font-size:38px;margin-top:8px">${l.id ? esc(l.ref + ' ' + (addrOf(l) || '')) : 'New listing'}</h1>
      ${l.market_interest_at && l.status !== 'to_market' ? `<div class="okbox" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span><strong>${esc(l.vendor_name || 'The owner')} would like to talk about the open market</strong> (said so on ${fmtDate(l.market_interest_at)}).</span><button class="btn ghost sm" id="mDone">Mark as discussed</button></div>` : ''}
      <div class="split"><div>
        <div class="card"><h3>Seller qualification</h3>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center" class="mxwrap"><div id="mxTri">${tri(l, 170)}</div>
          <div>${MX.map(([k, t, q]) => `<div style="margin:0 0 12px"><div class="legend" style="margin:0 0 6px">${t} <span class="opt">${q}</span></div><div class="chips">${[['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']].map(([v, lab]) => `<label class="chip"><input type="radio" name="mx_${k}" data-lr="${k}" value="${v}" ${l[k] === v ? 'checked' : ''}>${lab}</label>`).join('')}</div></div>`).join('')}</div></div>
          <div id="mxMsg"></div>
          <div class="row2"><div>${inp('leeway_review', 'Leeway review date', { type: 'date', hint: 'You\'ll get a reminder email on this day.' })}</div><div>${inp('m_notes', 'Notes', { opt: true, ph: 'What would change their position?' })}</div></div>
          <label class="check" style="border-bottom:0"><input type="checkbox" data-l="discretion" ${l.discretion ? 'checked' : ''}><span><strong>Owner requires discretion.</strong> <span class="muted">This home stays private. Owner updates will report buyer activity but won't encourage the open market.</span></span></label>
        </div>
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
        <div class="card"><h3>Photos</h3><p class="small muted">The first photo is the cover. Photos are private: only approved members can see them, watermarked with their name.</p>
          <div class="thumbs" id="thumbs"></div>
          <label class="btn ghost sm" style="cursor:pointer;margin-top:12px">Add photos<input type="file" id="phIn" accept="image/*" multiple hidden></label><span id="phMsg" class="small muted" style="margin-left:10px"></span></div>
      </div>
      <aside class="side"><div class="card">
        <h3>Price and matching</h3>
        <p class="small" style="margin:0 0 4px">Advertised as <strong>Expressions of interest</strong>. No price is ever shown or searchable.</p>
        <div class="legend">Seller's price band <span class="opt">(from onboarding, never shown)</span></div>
        <div class="row2"><div>${inp('seller_price_low', 'From', { im: 'numeric', ph: '$' })}</div><div>${inp('seller_price_high', 'To', { im: 'numeric', ph: '$' })}</div></div>
        ${inp('qualify_price', 'Matching price', { im: 'numeric', ph: '$', hint: 'Never shown. Used to match buyers and for new-listing alerts. All approved members can see the listing.' })}
        <label class="check"><input type="checkbox" data-l="req_cash" ${l.req_cash ? 'checked' : ''}><span>Owner requires a cash buyer <span class="muted">(shown on the listing)</span></span></label>
        <label class="check"><input type="checkbox" data-l="req_no_sale" ${l.req_no_sale ? 'checked' : ''}><span>Owner won't accept a sale-to-sell condition <span class="muted">(shown on the listing)</span></span></label>
        <label class="f" for="l_status">Status</label><select id="l_status" data-l="status">${Object.entries(LSTATUS).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}${k === 'live' ? ' (members can see it)' : ''}</option>`).join('')}</select>
        <button class="btn primary block" id="lSave" style="margin-top:16px">Save listing</button>
        ${l.id ? `<a class="btn ghost block" href="#/listing/${l.id}" style="margin-top:8px">Preview as a member</a>` : ''}
        <div id="lRes"></div>
      </div>
      <div class="card"><h3>Owner and updates</h3>
        ${inp('vendor_name', 'Owner name(s)', { ph: 'e.g. Jane and Sam' })}
        ${inp('vendor_email', 'Owner email', { hint: 'Separate two emails with a comma.' })}
        ${inp('vendor_phone', 'Owner phone', { opt: true, type: 'tel' })}
        ${l.agreement_id ? '<button type="button" class="btn link" id="fillOwn">Fill from the agency agreement</button>' : ''}
        <label class="f" for="l_nudges">Automatic owner updates</label>
        <select id="l_nudges" data-l="nudges"><option value="auto" ${l.nudges !== 'paused' ? 'selected' : ''}>On</option><option value="paused" ${l.nudges === 'paused' ? 'selected' : ''}>Paused</option></select>
        <div class="hint" style="margin-top:6px">Sent at 1, 3 and 6 weeks, then every 4 weeks while live: buyer activity, a one-minute check-in on price, motivation and time, and a gentle case for the open market. You're copied in on each one.</div>
        ${l.id ? `<div style="display:grid;gap:8px;margin-top:10px"><button type="button" class="btn ghost sm" id="nPrev">Preview the next update</button><button type="button" class="btn ghost sm" id="nSend">Send the next update now</button><button type="button" class="btn ghost sm" id="nCopy">Copy the owner's private link</button></div><div id="nRes"></div>` : ''}
      </div>
      <div class="card" id="shareCard"><h3>Share link</h3>
        ${l.discretion ? '<p class="small muted" style="margin:0">Not available while the owner requires discretion.</p>' : `
        <p class="small muted" style="margin-top:0">A public teaser page the owner can post on Facebook and send to friends: one photo and a short summary. Anyone who wants more must register.</p>
        <label class="check"><input type="checkbox" data-l="agreement_held" id="shAg" ${l.agreement_held ? 'checked' : ''}><span>I hold a signed agency agreement for this property</span></label>
        <label class="check"><input type="checkbox" data-l="share_enabled" id="shOn" ${l.share_enabled ? 'checked' : ''}><span><strong>Turn on the share link</strong></span></label>
        <label class="f" for="l_share_summary">Summary for social media</label>
        <textarea id="l_share_summary" data-l="share_summary" maxlength="150" style="min-height:80px" placeholder="e.g. Five bedrooms, sun all day and a private garden, five minutes from town.">${esc(l.share_summary || '')}</textarea>
        <div class="hint" style="text-align:right" id="shCount"></div>
        <div class="legend">Header photo</div>
        <div class="thumbs" id="shPhotos">${(l.photos || []).length ? l.photos.map(ph => `<button type="button" class="shpick" data-shp="${esc(ph)}" style="padding:0;border:3px solid ${l.share_photo === ph ? 'var(--accent)' : 'transparent'};border-radius:8px;background:none;cursor:pointer"><img src="${S.urls[ph] || ''}" alt="" style="width:92px;height:62px;object-fit:cover;border-radius:5px;display:block"></button>`).join('') : '<p class="small muted" style="margin:0">Add photos to the listing first.</p>'}</div>
        <label class="check"><input type="checkbox" data-l="share_show_street" ${l.share_show_street ? 'checked' : ''}><span>Show the street address <span class="muted">(otherwise suburb only)</span></span></label>
        <label class="f" for="l_share_slug">Link name</label><input type="text" id="l_share_slug" data-l="share_slug" value="${esc(l.share_slug || '')}" placeholder="worked out when you save">
        ${l.share_enabled && l.share_slug ? `<div class="copybox small" style="margin-top:10px;word-break:break-all">${esc(SITE + 'q/' + l.share_slug + '/')}</div><p style="margin:8px 0 0"><button type="button" class="btn ghost sm" id="shCopyA">Copy link</button></p><p class="small muted" style="margin:6px 0 0">New or changed share pages go live within about 15 minutes of saving.</p>` : ''}
        ${st && (st.share_visits || st.registrations) ? `<p class="small" style="margin:10px 0 0"><strong>${st.share_visits}</strong> visits · <strong>${st.registrations}</strong> registered through the link</p>` : ''}`}
      </div>
      ${l.id ? `<div class="card"><h3>Matching buyers (${qm.length})</h3>
        ${qm.length ? `<ul style="padding-left:18px;margin:0 0 12px">${qm.map(m => ({ m, sc: matchScore(m, l) })).sort((a, b) => b.sc - a.sc).map(({ m, sc }) => `<li><a href="#/admin/member/${m.user_id}">${esc(m.full_name || m.email)}</a> <span class="small muted">${money(m.qualified_to)} · criteria match ${sc}/3${alerted.includes(m.user_id) ? ' · emailed' : ''}</span></li>`).join('')}</ul>` : '<p class="small muted">No approved members match on budget yet. All approved members can still see it.</p>'}
        ${['live', 'under_offer'].includes(l.status) && pending.length ? `<button class="btn dark block" id="lAlert">Email ${pending.length} matching buyer${pending.length > 1 ? 's' : ''} about it</button>` : ''}
        ${!['live', 'under_offer'].includes(l.status) ? '<p class="small muted" style="margin:0">Set the listing live to see matching buyers and email them.</p>' : ''}
        <div id="aRes"></div></div>` : ''}
      ${l.id ? `<div class="card"><h3>Owner activity</h3>${st ? `<p class="small" style="margin-top:0">${st.members} members can see it · ${st.qualified} match · ${st.viewed} viewed · ${st.saved} saved · ${st.viewings + st.offers} requests · ${st.days} days live</p>` : ''}${timeline.length ? timeline.map(t => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small muted">${fmtDT(t.at)}</span><br>${t.h}</div>`).join('') : '<p class="small muted" style="margin:0">No owner updates or check-ins yet.</p>'}</div>` : ''}
      </aside></div></div>`;
    const drawThumbs = () => {
      $('#thumbs').innerHTML = (l.photos || []).map((p, i) => `<div class="thumb">${i === 0 ? '<span class="cov">Cover</span>' : ''}<img src="${S.urls[p] || ''}" alt=""><div class="ctl"><button data-ml="${i}" aria-label="Move left">←</button><button data-rm="${i}" aria-label="Remove">Remove</button><button data-mr="${i}" aria-label="Move right">→</button></div></div>`).join('') || '<p class="small muted" style="margin:0">No photos yet.</p>';
      $$('[data-ml]').forEach(b => b.onclick = () => { const i = +b.dataset.ml; if (i) { [l.photos[i - 1], l.photos[i]] = [l.photos[i], l.photos[i - 1]]; drawThumbs(); } });
      $$('[data-mr]').forEach(b => b.onclick = () => { const i = +b.dataset.mr; if (i < l.photos.length - 1) { [l.photos[i + 1], l.photos[i]] = [l.photos[i], l.photos[i + 1]]; drawThumbs(); } });
      $$('[data-rm]').forEach(b => b.onclick = () => { l.photos.splice(+b.dataset.rm, 1); drawThumbs(); });
    };
    drawThumbs();
    const mxSync = () => {
      const cur = {}; MX.forEach(([k]) => { const r = $(`[data-lr=${k}]:checked`, app); cur[k] = r ? r.value : null; });
      $('#mxTri').innerHTML = tri(cur, 170); const sc = mScore(cur), set = MX.filter(([k]) => cur[k]).length;
      const lw = $('#l_leeway_review');
      if (sc < 2 && set === 3 && !lw.value) { const d = new Date(Date.now() + 60 * 864e5); lw.value = d.toISOString().slice(0, 10); }
      $('#mxMsg').innerHTML = set < 3 ? '<p class="small muted">Answer all three. Two out of three is workable.</p>'
        : sc >= 2 ? `<div class="okbox"><strong>${sc} of 3: workable.</strong> This owner has what it takes to sell. When they're ready, the open market is the natural next step.</div>`
        : `<div class="note"><strong>Only ${sc} of 3.</strong> Without two, they're unlikely to sell. As a Quiet Listing this is on leeway while you see whether the missing factors appear. Set a review date.</div>`;
    };
    $$('[data-lr]', app).forEach(r => r.addEventListener('change', mxSync)); mxSync();
    const md = $('#mDone'); if (md) md.onclick = async () => { try { await call(sb.from('ql_listings').update({ market_interest_at: null }).eq('id', l.id)); adminListing(l.id); } catch (x) { toast(x.message); } };
    const fo = $('#fillOwn'); if (fo) fo.onclick = async () => { await fillOwner(l, true); ['vendor_name', 'vendor_email', 'vendor_phone'].forEach(k => { if (l[k]) $('#l_' + k).value = l[k]; }); };
    const nres = m => { $('#nRes').innerHTML = m; };
    const np = $('#nPrev'); if (np) np.onclick = async () => {
      busy(np, true, 'Loading…'); const { data, error } = await sb.functions.invoke('ql-nudge', { body: { mode: 'preview', listing_id: l.id } }); busy(np, false);
      if (error || data.error) return nres(`<div class="err">${esc((data && data.error) || error.message)}</div>`);
      const box = document.createElement('div'); box.className = 'lightbox'; box.style.background = 'rgba(10,11,13,.7)';
      box.innerHTML = `<div style="background:#fff;border-radius:10px;width:min(720px,94vw);max-height:88vh;overflow:auto;padding:18px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><div><div class="small muted">Update ${data.stage} · to ${esc(data.to || 'no email set')}</div><strong>${esc(data.subject)}</strong></div><button class="btn ghost sm" id="pvX">Close</button></div><iframe style="width:100%;height:60vh;border:1px solid var(--line);border-radius:8px;margin-top:12px" sandbox></iframe></div>`;
      document.body.appendChild(box); $('iframe', box).srcdoc = data.html; $('#pvX').onclick = () => box.remove(); box.onclick = e => { if (e.target === box) box.remove(); };
    };
    const ns = $('#nSend'); if (ns) ns.onclick = async () => {
      if (!l.vendor_email) return nres('<div class="err">Add the owner\'s email and save first.</div>');
      busy(ns, true, 'Sending…'); const { data, error } = await sb.functions.invoke('ql-nudge', { body: { mode: 'send', listing_id: l.id } }); busy(ns, false);
      nres(error || data.error || !data.ok ? `<div class="err">${esc((data && data.error) || (error && error.message) || 'Failed')}</div>` : `<div class="okbox">Sent: ${esc(data.subject)}</div>`);
    };
    const orig = { share_photo: l.share_photo };
    if (l.agreement_id && !l.agreement_held && $('#shAg')) { sb.from('agreements').select('status').eq('id', l.agreement_id).maybeSingle().then(({ data }) => { if (data && ['signed', 'countersigned'].includes(data.status)) { $('#shAg').checked = true; } }); }
    const shSum = $('#l_share_summary'); if (shSum) { const cnt = () => { $('#shCount').textContent = `${shSum.value.length} / 150`; }; shSum.addEventListener('input', cnt); cnt(); }
    $$('[data-shp]', app).forEach(b => b.onclick = () => { l.share_photo = b.dataset.shp; $$('[data-shp]', app).forEach(x => x.style.borderColor = x === b ? 'var(--accent)' : 'transparent'); });
    const sca = $('#shCopyA'); if (sca) sca.onclick = async () => { try { await navigator.clipboard.writeText(SITE + 'q/' + l.share_slug + '/'); toast('Share link copied'); } catch (x) { } };
    const nc = $('#nCopy'); if (nc) nc.onclick = async () => { try { await navigator.clipboard.writeText(ownerLink); toast('Link copied. Only send it to the owner.'); } catch (x) { nres(`<div class="copybox small" style="word-break:break-all">${esc(ownerLink)}</div>`); } };
    const gather = () => {
      const o = {};
      $$('[data-lr]:checked', app).forEach(el => { o[el.dataset.lr] = el.value; });
      $$('[data-l]', app).forEach(el => { const k = el.dataset.l; if (el.type === 'checkbox') o[k] = el.checked; else o[k] = el.value.trim(); });
      ['beds', 'living', 'parking'].forEach(k => o[k] = o[k] === '' ? null : parseInt(o[k]));
      ['baths', 'land_m2', 'floor_m2', 'rv', 'qualify_price', 'seller_price_low', 'seller_price_high'].forEach(k => o[k] = o[k] === '' ? null : num(o[k]));
      o.features = (o.features || '').split('\n').map(s => s.trim()).filter(Boolean);
      Object.keys(o).forEach(k => { if (o[k] === '') o[k] = null; });
      o.city = o.city || 'Dunedin'; o.photos = l.photos || []; if (l.agreement_id) o.agreement_id = l.agreement_id;
      if ($('#shareCard')) { o.share_photo = l.share_photo || null; if (o.share_slug) o.share_slug = o.share_slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
      if (o.discretion) o.share_enabled = false;
      return o;
    };
    const persist = async () => {
      const o = gather();
      if (o.status !== 'draft' && !o.qualify_price) throw new Error('Set a matching price before making the listing live.');
      if (o.status !== 'draft' && (!o.seller_price_low || !o.seller_price_high)) throw new Error('Enter the seller\'s price band before making the listing live.');
      o.price_display = null; o.share_show_price = false;
      if (o.share_enabled) {
        if (!o.agreement_held) throw new Error('The share link can only go on once you hold a signed agency agreement.');
        if (!['live', 'under_offer'].includes(o.status)) throw new Error('Set the listing live before turning on the share link.');
        if (!o.share_summary) throw new Error('Write a short summary for the share link.');
        if (!o.share_photo) throw new Error('Choose a header photo for the share link.');
        if (!o.share_slug) o.share_slug = [o.suburb, o.beds ? o.beds + '-bed' : '', (l.ref || '').toLowerCase()].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('quiet-' + Date.now());
        if (o.share_photo !== orig.share_photo || !l.share_image_url) o.share_image_url = await publicShareImage(l.id || 'new', o.share_photo);
      }
      if (l.id) l = Object.assign(l, await call(sb.from('ql_listings').update(o).eq('id', l.id).select().single()));
      else { const lid = l.lead_id; l = Object.assign(l, await call(sb.from('ql_listings').insert(o).select().single())); if (lid) { await sb.from('ql_seller_leads').update({ listing_id: l.id, status: 'listed' }).eq('id', lid); l.lead_id = null; } history.replaceState(null, '', '#/admin/listing/' + l.id); }
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
      $('#aRes').innerHTML = error || data.error ? `<div class="err">${esc((data && data.error) || error.message)}</div>` : `<div class="okbox">Emailed ${data.sent} member${data.sent === 1 ? '' : 's'}.${data.waiting ? ` ${data.waiting} more qualify but aren't owner-members, so they get it after the 48-hour early-access window. Press again then.` : ''}${(data.errors || []).length ? ' Some failed: ' + esc(data.errors.join('; ')) : ''}</div>`;
      if (!error && data.sent && !data.waiting) al.remove();
    };
  }
  async function publicShareImage(lid, path) {
    await signPhotos([path]);
    const blob = await (await fetch(S.urls[path])).blob();
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read the header photo')); i.src = URL.createObjectURL(blob); });
    const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc;
    c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    const dest = `share/${lid}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('ql-public').upload(dest, out, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error('Could not publish the header photo: ' + error.message);
    return sb.storage.from('ql-public').getPublicUrl(dest).data.publicUrl;
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
