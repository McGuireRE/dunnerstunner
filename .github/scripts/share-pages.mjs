// Builds a static teaser page (with Facebook/Open Graph preview tags) for every shared Quiet Listing.
// Runs in GitHub Actions. Uses only public data via the public (publishable) key.
import fs from 'node:fs'; import path from 'node:path';
const SB = 'https://hwpwyjxhdvlqrjwzxzqz.supabase.co', KEY = 'sb_publishable_luFnpeEPhaXWotpQiwVcVw_Yhkii6-1';
const SITE = process.env.QL_SITE || 'https://packages.dunnerstunner.co.nz/quiet/';
const OUT = process.env.QL_OUT || 'quiet/q';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const res = await fetch(`${SB}/rest/v1/rpc/ql_share_pages`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
if (!res.ok) { console.error('fetch failed', res.status, await res.text()); process.exit(1); }
const pages = await res.json();
fs.mkdirSync(OUT, { recursive: true });
const area = p => [p.street, p.suburb, p.city].filter(Boolean).join(', ');
const facts = p => [p.beds ? `${p.beds} bedroom${p.beds > 1 ? 's' : ''}` : '', p.baths ? `${+p.baths} bathroom${+p.baths > 1 ? 's' : ''}` : '', p.parking ? `${p.parking} parking` : '', p.land ? (p.land >= 10000 ? (p.land / 10000).toFixed(2) + ' ha' : Math.round(p.land) + ' m² land') : ''].filter(Boolean);
const shell = (p, inner, meta) => `<!DOCTYPE html><html lang="en-NZ"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${meta}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Barlow:wght@400;600&display=swap" rel="stylesheet">
<style>body{margin:0;font-family:Barlow,system-ui,sans-serif;background:#16181D;color:#E8E1D6;line-height:1.55}a{color:inherit}.w{max-width:760px;margin:0 auto;padding:22px 18px 40px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top img{height:30px}.top span{font-family:'Cormorant Garamond',serif;font-size:21px;color:#fff;border-left:1px solid #444;padding-left:10px}
.hero{border-radius:12px;overflow:hidden;position:relative;aspect-ratio:1.91/1;background:#2a2d35}.hero img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;left:12px;top:12px;background:rgba(22,24,29,.85);color:#F1E6D2;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:5px 10px;border-radius:4px}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;color:#fff;font-size:34px;line-height:1.15;margin:18px 0 6px}.loc{color:#CFC8BE;font-size:17px}.sum{font-size:19px;color:#fff;margin:14px 0}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 20px}.facts span{border:1px solid #3a3d45;border-radius:999px;padding:5px 12px;font-size:15px}
.cta{display:block;text-align:center;background:#EB4A33;color:#fff;text-decoration:none;font-weight:600;font-size:18px;padding:15px;border-radius:8px}
.note{font-size:14.5px;color:#A9A297;margin-top:12px;text-align:center}.foot{font-size:13px;color:#8F887E;margin-top:30px;border-top:1px solid #2c2f37;padding-top:14px}
.serious{display:inline-block;border:1px solid rgba(176,141,87,.5);color:#E6D3B3;padding:6px 12px;border-radius:999px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin-top:14px}</style></head>
<body><div class="w"><div class="top"><span style="border:0;padding:0;font-size:24px">Quiet Listings</span></div>${inner}
<div class="foot">Offered privately by McGuire Real Estate Ltd, Licensed REAA 2008. Tim McGuire, 027 562 7207.</div></div></body></html>`;
const live = new Set();
for (const p of pages) {
  if (!p.slug) continue; live.add(p.slug);
  const url = `${SITE}q/${p.slug}/`, title = `${p.headline || (p.type || 'Property') + ' in ' + p.suburb} | Quiet Listing`;
  const desc = p.summary || `A private Quiet Listing in ${p.suburb}. Registered buyers only.`;
  const meta = `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Quiet Listings by McGuire Real Estate"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${p.image ? `<meta property="og:image" content="${esc(p.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${esc(url)}">`;
  const inner = `<div class="hero">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.headline || p.suburb)}">` : ''}<span class="badge">Quiet Listing${p.status === 'under_offer' ? ' · Under offer' : ''}</span></div>
<h1>${esc(p.headline || (p.type || 'Property') + ' in ' + p.suburb)}</h1><div class="loc">${esc(area(p))} · Expressions of interest</div>
${p.summary ? `<p class="sum">${esc(p.summary)}</p>` : ''}<div class="facts">${facts(p).map(f => `<span>${esc(f)}</span>`).join('')}</div>
<a class="cta" href="${SITE}#/r/${esc(p.slug)}">Register to see the full listing</a>
<p class="note">This home is offered privately. Full details, photos and viewings are for registered buyers only.</p><div style="text-align:center"><span class="serious">For serious house hunters only</span></div>
<script>fetch('${SB}/rest/v1/rpc/ql_share_hit',{method:'POST',headers:{apikey:'${KEY}',Authorization:'Bearer ${KEY}','Content-Type':'application/json'},body:JSON.stringify({p_slug:'${p.slug}'})}).catch(function(){})</script>`;
  fs.mkdirSync(path.join(OUT, p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.slug, 'index.html'), shell(p, inner, meta));
}
// listings no longer shared: replace with a short "no longer available" page
for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
  if (!d.isDirectory() || live.has(d.name) || d.name === 'example') continue;
  const meta = `<title>Quiet Listings | McGuire Real Estate</title><meta name="robots" content="noindex"><meta property="og:title" content="Quiet Listings by McGuire Real Estate"><meta property="og:description" content="Private property for serious buyers.">`;
  fs.writeFileSync(path.join(OUT, d.name, 'index.html'), shell({}, `<h1>This Quiet Listing is no longer available</h1><p class="sum">But others may be. Quiet Listings are homes offered privately, only to registered buyers.</p><a class="cta" href="${SITE}">See Quiet Listings</a>`, meta));
}
console.log(`built ${live.size} share page(s)`);
