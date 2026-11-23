// Offers phase 2: drafting each offer onto the REINZ blank, against the mock database, with a synthetic blank made at test time
// (tests/synthetic-blank.js; the real form is never copied here). Covers: loading the blank from the Offers tile (kept unchanged,
// fingerprinted, never shareable); a blank of an unchecked edition refused in plain words, the earlier blank still used; the places
// found from the labels; the AI reading the pack and its proposals kept, moved and deleted, Tim adding his own place, the chattels
// ticked and approved (and then shown to buyers); the clause library; one-tap drafting of a phase 1 offer and every expected value
// read back from the PDF itself; no purchaser or vendor phone or email anywhere in it while the lawyer's details are; the original
// content streams kept byte for byte; placeholders as "Needs you" blocking approval; clause 22.0 struck through when not chosen and
// its days filled when chosen; the buyer's own condition only once ticked; re-drafting with Tim's changes and after a correction
// keeps every earlier draft unchanged; approval with the fingerprint; the download; the lawyer lookup with sources and Tim's tick,
// and its manual fallback; 390 px with no sideways scroll in light and dark; a signed-in vendor (and anyone not signed in) can see
// or do nothing with blanks, maps or drafts.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), crypto = require('crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const O = require(path.join(__dirname, '..', 'src', 'offers-core.js'));
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const PDFJS_DIR = '/opt/npm-tools/node_modules/pdfjs-dist/', PDFLIB_FILE = '/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js';
const AGENT = 'agent-draft@example.com';
const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
(async () => {
  const pdfjs = await import(PDFJS_DIR + 'legacy/build/pdf.mjs');
  const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
  const b = await chromium.launch(); const out = {}; const errs = [];
  const expect = (c, m) => { if (!c) errs.push(m); };
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500, acceptDownloads: true }); ctx.setDefaultTimeout(15000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    // the PDF tools the app loads when Tim needs them, served from the local copies (registered later, so they win)
    await ctx.route(`https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/**`, r => { const rel = new URL(r.request().url()).pathname.replace(/^\/npm\/pdfjs-dist@6\.2\.108\//, ''), f = path.join(PDFJS_DIR, rel);
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ contentType: /\.m?js$/.test(f) ? 'text/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) }); });
    await ctx.route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(PDFLIB_FILE) }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage(); p.on('pageerror', e => { errs.push('page: ' + e.message); }); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const BASE = 'https://packages.dunnerstunner.co.nz/onboarding/';
  const side = (p, w) => p.evaluate(w => Math.max(document.documentElement.scrollWidth, window.innerWidth) > w, w || 390);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `draft_${n}.png`), fullPage: true });
  const rpc = (p, fn, args) => p.evaluate(([fn, args]) => window.supabase.createClient().rpc(fn, args), [fn, args]);
  const blob = (p, key) => p.evaluate(async k => { const bl = (window.__repoBlobs || {})[k]; if (!bl) return null; const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }, key).then(x => x ? Buffer.from(x, 'base64') : null);
  const pdfText = async bytes => { const pg = await D.readPages(pdfjs, new Uint8Array(bytes)); return pg.map(x => x.items.map(i => i.s).join(' ')); };
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const seed = { agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '1 Example Road, Testville', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, countersigned_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', signed_at: now }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '1 Example Road, Testville', 'live')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' }] };
  const asAgent = async p => { await p.goto(BASE); await p.evaluate(([s, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT]); await p.goto(BASE); await p.waitForTimeout(600); };
  const openProp = async p => { await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P1"]'); await p.waitForSelector('#offTile'); };
  const offer = (o) => Object.assign({ email: 'buyer.own@example.com', phone: '021 999 8888', seen_docs: 'yes', sign: 'in_person', price: '655000', settlement: { kind: 'relative', days: 15 },
    conditions: [{ key: 'finance', days: 10 }, { key: 'builders', days: 10 }, { key: 'electrical', days: 10 }], kiwisaver: false, entity: '', nominee: true,
    purchasers: [{ first: 'Ana Maria', last: 'Testbuyer', email: 'ana.p@example.com', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: 'bo.p@example.com', phone: '022 555 4444' }],
    comments: '', lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: '', phone: '' }, related: false, date_help: false, privacy: true, chattels_add: ['Outdoor table'], chattels_exclude: ['Heat pump'], gst_registered: null, gst_number: null }, o || {});

  // ── 1. Tim loads the blank from the Offers tile ──
  process.stderr.write('step 1\n');
  const A = await mk(390, 'light'); let p = A.p;
  await asAgent(p); await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' });
  const off1 = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  await openProp(p);
  expect(/Load the REINZ agreement pack/.test(await p.textContent('#drBlank')) && await p.isVisible('#drLoadBtn'), 'Offers tile: Agreement blank: load the PDF');
  expect(!(await side(p)), 'tile at 390 px: no sideways scroll');
  const blank = Buffer.from(await SB.make()); const blankSha = sha(blank);
  await p.setInputFiles('#drFile', { name: 'Agreement pack 1 Example Road.pdf', mimeType: 'application/pdf', buffer: blank });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.waitForSelector('#drCanvas .dr-box');
  let d = await db(p);
  const bl1 = d.offer_blanks[0], doc1 = d.property_documents.find(x => x.id === bl1.document_id);
  out.blank = { sha: bl1.sha256 === blankSha, edition: bl1.edition, checked: bl1.edition_checked, pages: bl1.pages };
  expect(bl1.sha256 === blankSha && bl1.edition === 'Eleventh Edition 2022 (4)' && bl1.edition_checked && bl1.pages === 10, 'blank registered with its SHA-256, edition and pages');
  expect(doc1.kind === 'REINZ agreement blank' && doc1.folder === 'agency' && !doc1.shared_at, 'filed on the property as a REINZ agreement blank (agency papers)');
  const stored = await blob(p, doc1.path); expect(stored && sha(stored) === blankSha && stored.equals(blank), 'the original bytes are stored unchanged');
  expect((await rpc(p, 'agent_repo_share', { p_id: doc1.id, p_on: true })).error, 'a blank can never be shared with the vendors');
  expect(await p.isVisible('#drAllFound'), 'every standard place found on the synthetic blank');
  expect(d.offer_events.some(e => e.kind === 'blank_loaded' && e.detail.sha256 === blankSha), 'loading recorded with its fingerprint');
  expect(!(await side(p)), 'places screen at 390 px: no sideways scroll'); await shot(p, 'map');

  // ── 2. the AI reads the pack; Tim keeps, moves and deletes its proposals, adds his own, ticks the chattels and approves ──
  process.stderr.write('step 2\n');
  await p.click('#drAiGo'); await p.waitForSelector('#drProps', { timeout: 20000 });
  d = await db(p); out.aiCalls = (d.ai_calls || []).filter(x => x.purpose === 'agreement pack read').length;
  expect(out.aiCalls === 2 && (d.offer_blank_reads || []).length === 2, 'the pack read in batches of pages, each logged in ai_calls and kept');
  out.props = await p.$$eval('[data-prop]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  expect(out.props.length === 3 && out.props.every(t => /Page 9/.test(t)), 'three places proposed on the acknowledgement page');
  expect(/LIM page is inserted/.test(await p.textContent('#drNotes')), 'something unusual noted');
  expect(await p.$('[data-chat] + .mark') && (await p.textContent('#drChat')).includes('Spa pool'), 'a chattel suggested by the AI');
  out.chatTicks = await p.$$eval('[data-chat]', e => e.map(x => x.closest('label').querySelector('.ct').textContent + ':' + x.checked));
  expect(out.chatTicks.includes('Stove:false') && out.chatTicks.includes('Rangehood:true') && out.chatTicks.includes('Light fittings:true'), 'chattels from Schedule 2: empty brackets unticked');
  await p.click('[data-pkeep="0"]'); await p.waitForTimeout(150);
  await p.click('[data-pshow="1"]'); await p.waitForSelector('#drSel');
  const before1 = await p.evaluate(() => { const b = document.querySelector('.dr-box.dr-on'); return b && b.style.left; });
  await p.click('[data-mv="4,0"]'); await p.click('[data-mv="4,0"]'); await p.click('[data-mv="0,4"]'); await p.waitForTimeout(150);
  const after1 = await p.evaluate(() => { const b = document.querySelector('.dr-box.dr-on'); return b && b.style.left; });
  expect(before1 && after1 && before1 !== after1, 'a proposal moves on the page');
  await p.click('#drSelKeep'); await p.waitForTimeout(150);
  await p.click('[data-pdel="2"]'); await p.waitForTimeout(150);
  // his own place: initials on page 9
  await p.selectOption('#drPick', '9'); await p.waitForSelector('#drCanvas .dr-pg[data-page="9"]');
  await p.selectOption('#drAddKind', 'initial'); await p.click('#drAdd'); await p.waitForTimeout(200);
  const pg = await p.$('#drCanvas .dr-pg'); const bb = await pg.boundingBox(); await p.mouse.click(bb.x + bb.width * 0.8, bb.y + bb.height * 0.9); await p.waitForSelector('#drSel');
  await p.click('[data-mv="0,-4"]'); await p.waitForTimeout(100);
  // untick the AI's spa pool, tick the garden shed, add a chattel by hand
  expect(out.chatTicks && await p.evaluate(() => { const box = [...document.querySelectorAll('[data-chat]')].find(x => x.closest('label').textContent.includes('Spa pool')); return box && !box.checked; }), "the AI's chattel starts unticked");
  await p.evaluate(() => { const box = [...document.querySelectorAll('[data-chat]')].find(x => x.closest('label').textContent.includes('Garden shed')); box.click(); });
  await p.fill('#drChatAdd', 'Wall-mounted TV bracket'); await p.click('#drChatAddBtn'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('#drNotes input').click()); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  d = await db(p);
  const m1 = d.offer_blank_maps.find(m => m.approved);
  out.map = { version: m1 && m1.version, places: m1 && m1.places.length, decisions: m1 && m1.proposals.map(x => x.decision) };
  expect(m1 && JSON.stringify(m1.proposals.map(x => x.decision)) === JSON.stringify(['kept', 'moved', 'deleted']), 'proposals recorded as kept, moved and deleted');
  expect(m1.places.filter(x => x.source === 'ai').length === 2 && !m1.places.some(x => x.id === m1.proposals[2].id), 'only kept and moved proposals are places; the deleted one is not');
  const moved = m1.places.find(x => x.id === m1.proposals[1].id); expect(moved && Math.abs(moved.x - m1.proposals[1].place.x) < 0.01, 'the moved position is kept');
  expect(m1.places.some(x => x.source === 'tim' && x.kind === 'initial' && x.page === 9), 'Tim\'s own place saved');
  expect(m1.notes.length === 1 && m1.notes[0].seen === true, 'the note, ticked as read');
  const lk = d.offer_links.find(x => x.property_id === 'P1');
  out.formChattels = lk.chattels; expect(lk.chattels.includes('Rangehood') && lk.chattels.includes('Garden shed') && lk.chattels.includes('Wall-mounted TV bracket') && !lk.chattels.includes('Stove') && !lk.chattels.includes('Spa pool'), 'approving sets the chattels buyers see from Tim\'s ticks');
  const ev = d.offer_events.find(e => e.kind === 'map_approved'); expect(ev && ev.detail.ai_kept === 2 && ev.detail.ai_deleted === 1, 'approval recorded with what was kept and deleted');
  expect(/Places approved \(version 1\)/.test(await p.textContent('#drBlank')), 'the tile says the places are approved');

  // ── 3. a blank of an unchecked edition is refused in plain words; the approved blank is still used ──
  process.stderr.write('step 3\n');
  const old = Buffer.from(await SB.make({ edition: 'Tenth Edition 2019 (2)' }));
  await p.setInputFiles('#drFile', { name: 'Older pack.pdf', mimeType: 'application/pdf', buffer: old }); await p.waitForSelector('#drEditionNo', { timeout: 30000 });
  out.refusal = (await p.textContent('#drEditionNo')).trim();
  expect(/Tenth Edition 2019 \(2\) edition, which hasn't been checked yet, so offers can't be drafted on it/.test(out.refusal), 'an unchecked edition: a plain message');
  expect(/drafted on the earlier blank/.test(await p.textContent('#drBlank')) && !(await p.$('#drMapBtn')), 'the earlier approved blank is still used; no places screen for the new one');
  d = await db(p); expect(d.offer_blanks.length === 2, 'loading a new blank keeps the old one');
  const r3 = await rpc(p, 'agent_blank_map_save', { p_blank: d.offer_blanks[1].id, p_places: [], p_proposals: [], p_chattels: [], p_notes: [], p_missing: [], p_approve: true }); expect(r3.error && /hasn't been checked/.test(r3.error.message), 'the database refuses to map an unchecked edition too');

  // ── 4. the clause library ──
  process.stderr.write('step 4\n');
  await p.click('#drLibBtn'); await p.waitForSelector('#drLib');
  expect(/No wording yet/.test(await p.textContent('[data-term="electrical"]')) && /\[Tim to add his electrical report clause\]/.test(await p.textContent('[data-term="electrical"]')), 'library: no electrical wording yet, the placeholder shown');
  expect(!(await p.$('[data-tword="deposit_nzret"]')), 'a printed clause has no wording box (referred to by number)');
  await p.fill('#drNtTitle', 'Pets'); await p.fill('#drNtWord', 'Synthetic pets wording from Tim.'); await p.click('#drLibSave'); await p.waitForTimeout(400);
  d = await db(p); expect(d.offer_terms.some(t => t.key === 'std_pets' && t.wording === 'Synthetic pets wording from Tim.' && t.rule.when.always) && (d.offer_term_changes || []).length === 1, 'Tim adds his own standard term, recorded');
  expect(!(await side(p)), 'library at 390 px: no sideways scroll');
  await p.click('#drLibBack'); await p.waitForSelector('#offTile');

  // ── 5. one tap drafts the offer ──
  process.stderr.write('step 5\n');
  await p.click(`[data-offer="${off1}"]`); await p.waitForSelector('#drOffer');
  expect(await p.isDisabled('#drAgDate') && /Added once fully agreed/.test(await p.textContent('#drOffer')), 'the date field is there, disabled, added once fully agreed');
  await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 }); await p.waitForSelector('#drRvCanvas .dr-box');
  d = await db(p); const dr1 = d.offer_drafts[0];
  expect(dr1.blank_sha256 === blankSha && dr1.map_id === m1.id && dr1.number === 1, 'the draft records the blank\'s fingerprint and the map');
  const pdf1 = await blob(p, dr1.path); expect(pdf1 && sha(pdf1) === dr1.sha256 && dr1.size_bytes === pdf1.length, 'the drafted PDF stored with its own SHA-256');
  const t1 = await pdfText(pdf1), all1 = t1.join('\n');
  const today = O.nzToday(), cd = n => D.fullDate(O.addWorkingDays(today, n, { province: 'otago' }));
  out.expected = ['Ana Maria Testbuyer and Bo Testbuyer', '$655,000', cd(10)];
  ['Ana Maria Testbuyer and Bo Testbuyer', '$655,000', cd(10)].forEach(v => expect(t1[0].includes(v), 'front page has ' + v));
  expect(/1\. Electrical report: \[Tim to add his electrical report clause\]/.test(t1[2]) && /2\. Pets: Synthetic pets wording from Tim\./.test(t1[2]), 'further terms: the placeholder and Tim\'s standard term, numbered');
  expect(t1[4].includes('Also included: Outdoor table'), 'chattels added on Schedule 2');
  ['Synthetic Law', 'Pat Solicitor'].forEach(v => expect(t1[6].includes(v), 'the purchaser\'s lawyer: ' + v));
  expect(t1[5].includes('Ana Maria Testbuyer') && t1[5].includes('Bo Testbuyer'), 'names under the purchasers\' signatures');
  out.leak = (all1.match(/buyer\.own@|ana\.p@|bo\.p@|999 8888|777 6666|555 4444|vendor@example|000 1111/g) || []);
  expect(!out.leak.length, 'no purchaser or vendor phone or email anywhere in the drafted PDF');
  expect(dr1.placed.some(x => x.id === 'clause22' && x.kind === 'lines'), "clause 22.0 struck through (lawyer's approval not chosen)");
  const raws = async bytes => { const dd = await PDFLib.PDFDocument.load(bytes); return dd.getPages().map(pg => { const c = pg.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c]; return refs.map(r => Buffer.from(dd.context.lookup(r).getContents()).toString('base64')); }); };
  const rb = await raws(blank), r1 = await raws(pdf1);
  expect(rb.every((st, i) => { let j = 0; for (const s of st) { j = r1[i].indexOf(s, j); if (j < 0) return false; j++; } return true; }), 'every original content stream kept byte for byte');
  expect(r1[7].length > rb[7].length, 'the appendix page has a mark added (clause 22.0 struck through)');
  out.needs = await p.$$eval('.dr-need', e => e.map(x => x.textContent));
  expect(out.needs.some(t => /\[Tim to add his electrical report clause\]/.test(t)) && await p.isDisabled('#drApproveDraft'), 'the placeholder is listed as Needs you, and approval waits');
  expect(d.offer_events.some(e => e.kind === 'drafted' && e.detail.sha256 === dr1.sha256 && e.detail.blank_sha256 === blankSha), 'drafting recorded in offer_events');
  expect(d.offer_file_hashes.some(h => h.path === doc1.path && h.sha256 === blankSha) && d.offer_file_hashes.some(h => h.path === dr1.path && h.sha256 === dr1.sha256), 'the server confirmed both fingerprints from the stored files');
  out.rvBoxes = await p.$$eval('#drRvCanvas .dr-box', e => e.length); expect(out.rvBoxes >= 8, 'filled places highlighted on the page');
  expect(!(await side(p)), 'review at 390 px: no sideways scroll'); await shot(p, 'review');

  // ── 6. Tim fills the placeholder and re-drafts; the first draft is kept unchanged; then approves ──
  process.stderr.write('step 6\n');
  const keep1 = JSON.stringify(dr1);
  await p.fill('[data-edit="ft_electrical"]', 'Synthetic electrical wording typed by Tim on the draft.'); await p.fill('#drNote', 'Electrical wording added');
  await p.click('#drRedraft'); await p.waitForSelector('#drReview h1:has-text("Draft 2")', { timeout: 30000 });
  d = await db(p); const dr2 = d.offer_drafts.find(x => x.number === 2);
  expect(d.offer_drafts.length === 2 && JSON.stringify(d.offer_drafts.find(x => x.number === 1)) === keep1, 're-draft keeps the old draft, unchanged');
  const pdf2 = await blob(p, dr2.path); const t2 = await pdfText(pdf2);
  expect(/1\. Electrical report: Synthetic electrical wording typed by Tim on the draft\./.test(t2[2]) && dr2.edits.items.ft_electrical && dr2.note === 'Electrical wording added', 'Tim\'s wording on the new draft, with his note');
  expect(await p.$('#drNoNeeds') && !(await p.isDisabled('#drApproveDraft')), 'nothing needs Tim: approve is available');
  await p.click('#drApproveDraft'); await p.waitForSelector('#drApproved');
  d = await db(p); const ap = d.offer_draft_approvals[0];
  expect(ap && ap.draft_id === dr2.id && ap.sha256 === dr2.sha256 && ap.approved_by === AGENT, 'approval recorded with the fingerprint');
  expect(d.offer_events.some(e => e.kind === 'draft_approved' && e.detail.sha256 === dr2.sha256), 'approval in offer_events');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#drDownload')]); const dlp = await dl.path(); const dlb = fs.readFileSync(dlp);
  expect(sha(dlb) === dr2.sha256 && /^Draft-2-/.test(dl.suggestedFilename()), 'the download is the approved draft, byte for byte');

  // ── 7. a correction from phase 1, then re-draft after a change ──
  process.stderr.write('step 7\n');
  const fix = offer({ price: '670000', chattels_add: [], chattels_exclude: [] });
  await rpc(p, 'agent_offer_correct', { p_offer: off1, p_details: fix, p_note: 'Buyer rang with a higher price' });
  await p.click('#drRvBack'); await p.waitForSelector('#drDrafts'); await p.click('[data-draft]'); await p.waitForSelector('#drChanged');
  await p.click('#drRedraftChange'); await p.waitForSelector('#drReview h1:has-text("Draft 3")', { timeout: 30000 });
  d = await db(p); const dr3 = d.offer_drafts.find(x => x.number === 3); const t3 = await pdfText(await blob(p, dr3.path));
  expect(t3[0].includes('$670,000') && !t3[0].includes('$655,000') && d.offer_drafts.length === 3 && d.offer_draft_approvals.length === 1, 'the new draft has the corrected price; earlier drafts and the approval are kept');
  expect(/1\. Electrical report: \[Tim to add his electrical report clause\]/.test(t3[2]), 'item edits are not carried into a re-draft after a change (the placeholder is back for Tim)');
  const r72 = await rpc(p, 'agent_draft_approve', { p_draft: dr2.id, p_sha256: dr2.sha256 }); expect(r72.data && r72.data.existing && (await db(p)).offer_draft_approvals.length === 1, 'approving draft 2 again changes nothing: its approval stays on record');
  const r7 = await rpc(p, 'agent_draft_approve', { p_draft: d.offer_drafts.find(x => x.number === 1).id, p_sha256: dr1.sha256 }); expect(r7.error && /newer draft/.test(r7.error.message), 'an older draft cannot be approved');

  // ── 8. the lawyer lookup: values with their sources, used only once Tim ticks them; and the manual fallback ──
  process.stderr.write('step 8\n');
  await p.click('#drRvBack'); await p.waitForSelector('#drLawBtn'); await p.click('#drLawBtn'); await p.waitForSelector('#drLawFound');
  out.lawFound = await p.$$eval('#drLawFound .choice', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  expect(out.lawFound.length === 2 && out.lawFound.every(t => /source:/.test(t)) && await p.$('#drLawFound a[href="https://synthlaw.example/people/pat"]'), 'each value shown with its source link');
  d = await db(p); expect(!(d.property_offers.find(x => x.id === off1).details.lawyer.email), 'nothing used before Tim ticks');
  await p.click('#drLawUse'); expect(/Tick at least one/.test(await p.textContent('#drLawErr')), 'tick at least one');
  await p.evaluate(() => document.querySelectorAll('[data-lawv]').forEach(x => x.click())); await p.click('#drLawUse'); await p.waitForSelector('#drOffer');
  d = await db(p); const law = d.property_offers.find(x => x.id === off1).details.lawyer;
  const r8 = await rpc(p, 'agent_draft_approve', { p_draft: dr3.id, p_sha256: dr3.sha256 }); expect(r8.error && /offer has changed/.test(r8.error.message), 'once the offer changes, its draft is refused approval');
  expect(law.email === 'pat@synthlaw.example' && law.phone === '03 477 1234' && law.firm === 'Synthetic Law', 'the ticked values are the lawyer\'s details now');
  const le = d.offer_events.filter(e => e.kind === 'corrected').pop(); expect(le && le.detail.used.length === 2 && le.detail.used.every(u => /^https:/.test(u.source_url)), 'recorded with the sources');
  expect(d.property_offers.find(x => x.id === off1).details.phone === '021 999 8888', 'the buyer\'s own phone is untouched');
  await p.click('#drDraftBtn'); await p.waitForSelector('#drReview h1:has-text("Draft 4")', { timeout: 30000 });
  d = await db(p); const t4 = await pdfText(await blob(p, d.offer_drafts.find(x => x.number === 4).path)); const dr4 = d.offer_drafts.find(x => x.number === 4);
  // the places approved again after the draft: refused, and the screen says so with Approve off
  await rpc(p, 'agent_blank_map_save', { p_blank: m1.blank_id, p_places: m1.places, p_proposals: m1.proposals, p_chattels: m1.chattels, p_notes: m1.notes, p_missing: m1.missing, p_approve: true });
  const r8b = await rpc(p, 'agent_draft_approve', { p_draft: dr4.id, p_sha256: dr4.sha256 }); expect(r8b.error && /approved again/.test(r8b.error.message), 'a newer approved map: the draft is refused approval');
  await p.click('#drRvBack'); await p.waitForSelector('#drDrafts'); await p.click(`[data-draft="${dr4.id}"]`); await p.waitForSelector('#drStaleBlank');
  expect(await p.isDisabled('#drApproveDraft'), 'Approve is off on a draft made on superseded places');
  await p.click('#drRedraftChange'); await p.waitForSelector('#drReview h1:has-text("Draft 5")', { timeout: 30000 });
  expect(t4[6].includes('pat@synthlaw.example') && t4[6].includes('03 477 1234') && !/buyer\.own@|ana\.p@|999 8888|777 6666/.test(t4.join('\n')), 'the lawyer\'s email and phone on the back page, never the buyer\'s');
  await p.evaluate(() => localStorage.setItem('lawyerMode', 'no_search'));
  await p.click('#drRvBack'); await p.waitForSelector('#drLawBtn'); await p.click('#drLawBtn'); await p.waitForSelector('#drLawManual');
  expect(/Web search isn't switched on/.test(await p.textContent('#drLawManual')) && await p.$('#drLawManual a[href*="google.com/search?q=Pat%20Solicitor"]') && await p.$('#drLawManual a[href*="lawsociety.org.nz"]'), 'without web search: a plain message and the search link prefilled');

  // ── 9. lawyer's approval chosen, no nominee, and the buyer's own condition only once ticked (dark, 390 px) ──
  process.stderr.write('step 9\n');
  const off2 = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ nominee: false, kiwisaver: true, gst_registered: true, purchasers: [{ first: 'Cy', last: 'Testbuyer', email: '', phone: '' }],
    conditions: [{ key: 'finance', days: 10 }, { key: 'lawyer', days: 5 }, { key: 'custom', days: 10, request: 'Subject to the pool fence passing', wording: 'Synthetic custom condition wording from the buyer.', ai: true }], lawyer: { firm: 'Other Law', person: 'Lee Lawyer', email: 'lee@otherlaw.example', phone: '03 400 0000' } }) })).data;
  const B = await mk(390, 'dark'); const q = B.p; await q.goto(BASE);
  await q.evaluate(([dd, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(dd)); }, [await db(p), AGENT]);
  // storage lives in the page: carry the blank across
  await q.goto(BASE); await q.waitForTimeout(600);
  await q.evaluate(async ([pth, b64]) => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); (window.__repoBlobs ||= {})[pth] = new Blob([u], { type: 'application/pdf' }); }, [doc1.path, blank.toString('base64')]);
  await q.click('#navDash'); await q.waitForTimeout(400); await q.click('tr[data-prop="P1"]'); await q.waitForSelector('#offTile'); await q.click(`[data-offer="${off2}"]`); await q.waitForSelector('#drOffer');
  await q.click('#drDraftBtn'); await q.waitForSelector('#drReview', { timeout: 30000 }); await q.waitForSelector('#drRvCanvas .dr-box');
  d = await db(q); const e1 = d.offer_drafts.find(x => x.offer_id === off2);
  const te = await pdfText(await blob(q, e1.path));
  expect(!e1.placed.some(x => x.id === 'clause22') && e1.placed.some(x => x.id === 'clause22_days' && x.text === '5'), "lawyer's approval chosen: clause 22.0 not struck, its working days filled");
  expect(e1.placed.some(x => x.id === 'nominee' && x.kind === 'strike'), 'and/or nominee struck out');
  expect(e1.placed.some(x => x.id === 'gst_purchaser' && x.value === 'Yes'), 'the buyer said they are GST registered: Schedule 1 marked');
  expect(/Purchaser's condition: \[Tim to tick the buyer's own condition wording\]/.test(te[2]) && !/Synthetic custom condition wording/.test(te.join('\n')), "the buyer's own condition is a placeholder until Tim ticks it");
  expect(e1.needs.some(n => n.id === 'keep_deposit_kiwisaver'), 'KiwiSaver: clause 21.3 kept, noted for Tim');
  expect(!(await side(q)), 'review in dark mode at 390 px: no sideways scroll');
  out.darkBg = await q.evaluate(() => getComputedStyle(document.body).backgroundColor); expect(out.darkBg === 'rgb(24, 23, 22)', 'dark mode');
  await q.evaluate(() => document.querySelector('#drCustomTick').click()); await q.click('#drRedraft'); await q.waitForSelector('#drReview h1:has-text("Draft 2")', { timeout: 30000 });
  d = await db(q); const te2 = await pdfText(await blob(q, d.offer_drafts.find(x => x.offer_id === off2 && x.number === 2).path));
  expect(/Purchaser's condition: Synthetic custom condition wording from the buyer\./.test(te2[2]), "ticked: the buyer's wording goes on");
  expect(te2[6].includes('lee@otherlaw.example') && !/buyer\.own@|999 8888/.test(te2.join('\n')), 'lawyer details on; the buyer\'s own never');
  await shot(q, 'review_dark');
  // a vendor's own phone, typed in another format, never goes on: left off and blocking
  const off3 = (await rpc(q, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ conditions: [], chattels_add: ['Ring the vendor on +64 21 000 1111 about the spa'], chattels_exclude: [] }) })).data;
  await q.click('#drRvBack'); await q.waitForSelector('#drOffer'); await q.click('#ofBackP'); await q.waitForSelector('#offTile'); await q.click(`[data-offer="${off3}"]`); await q.waitForSelector('#drDraftBtn');
  await q.click('#drDraftBtn'); await q.waitForSelector('#drReview', { timeout: 30000 });
  d = await db(q); const e3 = d.offer_drafts.find(x => x.offer_id === off3), t3v = await pdfText(await blob(q, e3.path));
  expect(e3.needs.some(n => n.id === 'privacy_chattels_add' && n.blocking && /a vendor's own/.test(n.text)) && !/000 1111/.test(t3v.join('\n')) && await q.isDisabled('#drApproveDraft'), "a vendor's own phone in another format is left off the PDF and blocks approval");
  // the places screen in dark mode
  await q.click('#drRvBack'); await q.waitForSelector('#drOffer'); await q.click('#ofBackP'); await q.waitForSelector('#drMapUseBtn'); await q.click('#drMapUseBtn'); await q.waitForSelector('#drCanvas .dr-box', { timeout: 30000 });
  expect(!(await side(q)), 'places screen in dark mode at 390 px: no sideways scroll');
  out.padWhite = await q.evaluate(() => getComputedStyle(document.querySelector('.dr-pg')).backgroundColor); expect(out.padWhite === 'rgb(255, 255, 255)', 'pages stay white in dark mode');

  // ── 10. a signed-in vendor, and anyone not signed in, see and do nothing ──
  process.stderr.write('step 10\n');
  const V = await mk(390, 'light'); const v = V.p; await v.goto(BASE);
  await v.evaluate(dd => { localStorage.clear(); localStorage.setItem('mockdb', JSON.stringify(dd)); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'vendor@example.com' } })); }, await db(q)); await v.goto(BASE); await v.waitForTimeout(800);
  out.vendor = await v.evaluate(async () => { const c = window.supabase.createClient(); const g = async t => { const r = await c.from(t).select('*'); return r.error ? 'error' : r.data.length; };
    const out = {}; for (const t of ['offer_blanks', 'offer_blank_maps', 'offer_blank_reads', 'offer_terms', 'offer_drafts', 'offer_draft_approvals', 'offer_lawyer_lookups', 'property_documents']) out[t] = await g(t);
    out.map = (await c.rpc('agent_blank_map_save', { p_blank: 'x', p_places: [] })).error?.message; out.draft = (await c.rpc('agent_draft_approve', { p_draft: 'x', p_sha256: 'x' })).error?.message;
    const f = await c.functions.invoke('offer-draft', { body: { action: 'read_pack' } }); out.fn = f.error ? (await f.error.context.json()).error : 'allowed';
    out.list = (await c.rpc('vendor_repo_list', { p_property: 'P1' })).data.length; return out; });
  expect(Object.entries(out.vendor).filter(([k]) => k.startsWith('offer_') || k === 'property_documents').every(([, n]) => n === 0), 'the vendor reads no blanks, maps, reads, terms, drafts, approvals or lookups');
  expect(/Only Tim/.test(out.vendor.map) && /Only Tim/.test(out.vendor.draft) && /Only Tim/.test(out.vendor.fn) && out.vendor.list === 0, 'the vendor can call nothing, and no blank is in their list');
  expect(!/Agreement blank|Draft \d|Places on the blank/.test(await v.innerText('body')), 'nothing about drafts on the vendor\'s screen');
  const N = await mk(390, 'light'); const n = N.p; await n.goto(BASE);
  out.anon = await n.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.from('offer_drafts').select('*'); const f = await c.functions.invoke('offer-draft', { body: { action: 'read_pack' } }); return [r.error ? r.error.message : 'read', f.error ? (await f.error.context.json()).error : 'allowed']; });
  expect(/permission denied/.test(out.anon[0]) && /Sign in/.test(out.anon[1]), 'not signed in: nothing');

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e && e.stack || e)] }, null, 1)); process.exit(0); });
