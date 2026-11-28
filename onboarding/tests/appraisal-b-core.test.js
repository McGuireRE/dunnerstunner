// LW3 phase B (migration 036): the appraisal core's new sections, run in Node with no browser and invented data only.
// Covers: (1) every row from before phase B is written and drawn exactly as the core at d012895 did (a hand-loaded 032 record, a
// phase A set-up, a phase C row with comparables and the market report), using the frozen copy in tests/files; (2) an appraisal with
// nothing uploaded or ticked draws no phase B section at all (no heading, no placeholder), and each one appears once it has content
// (Tim, 28 November 2026: "if certain details are not uploaded, then that section or feature should not be displayed"); (3) within a
// section a missing detail is left out; (4) unticked lines, unticked advertisements and unticked reviews never reach the page; the
// mockup is labelled; every new section carries its stage; (5) the header: "Leave it to Claude" with no photo draws nothing, a library
// photo is credited DunedinNZ, Tim's own photo or video follows his framing, zoom, brightness and credit, a video plays muted and looped
// with its still frame; (6) the key details never offer the Relab owners, rates or valuations, nor a value from Relab; (7) the wording
// guard over what Tim ticked; (8) the price dots and the market report draw nothing when they have nothing (the C fix).
const fs = require('fs'), path = require('path'), vm = require('vm');
const errs = [], out = {};
const expect = (c, m) => { if (!c) errs.push(m); };
const SRC = path.join(__dirname, '..', 'src');
function load(core) {
  const win = {}; const ctx = vm.createContext({ window: win, console, Date, Math, JSON, Intl, Number, String, Array, Object, RegExp, isFinite, Set });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'market-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(core, 'utf8'), ctx);
  return win.APPR;
}
const NEW = load(path.join(SRC, 'appraisal-core.js')), OLD = load(path.join(__dirname, 'files', 'appraisal-core-d012895.js'));
const cat = { PACKAGES: { digital: { name: 'Digital', price: 1500, tagline: 'Online first.', items: { TM: 1 } }, premium: { name: 'Premium', price: 3000, tagline: 'More reach.', items: { TM: 1 } } }, ITEMS: {}, CATALOGUE: [{ items: [{ name: 'Professional photos' }] }] };
const ranges = [{ key: 'A', option: 'Your home', low: 510000, high: 560000 }];
const SETUP_A = { v: 1, suburb: 'Rbvale', note: 'Thanks for having me.\n\nCall me any time.', preparedFor: 'Robin', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'claude', tabs: { reinz: true } };
const ctx = { address: 'RB 3 Core Road, Rbvale', preparedOn: '2026-11-28', cat };

// ── 1. nothing earlier changes ──
const wNew = NEW.writeStandard(SETUP_A, ranges, ctx), wOld = OLD.writeStandard(SETUP_A, ranges, ctx);
// the one addition: the opinion of price carries Tim's price wording (setup.priceWording, the agreed default when not set)
const noWords = w => JSON.stringify(Object.assign({}, w, { sections: w.sections.map(x => x.type === 'opinion' ? { type: 'opinion' } : x) }));
const opN = wNew.sections.find(x => x.type === 'opinion');
expect(noWords(wNew) === JSON.stringify(wOld) && opN.wording === NEW.PRICE_WORDING, 'a phase A set-up is written exactly as before, plus the price wording');
expect(/^How buyers set the price\. /.test(NEW.PRICE_WORDING) && /It is a guide, not a ceiling, and nothing pleases me more than proving it wrong\.$/.test(NEW.PRICE_WORDING) && !/cherr|How I think about price/i.test(NEW.PRICE_WORDING), 'the default price wording is the one Tim approved on 28 November 2026 (8:00pm), with no cherry wording');
const own = Object.assign({}, SETUP_A, { header: 'own' });
expect(noWords(NEW.writeStandard(own, ranges, ctx)) === JSON.stringify(OLD.writeStandard(own, ranges, ctx)), '"Use my own" with nothing uploaded is written exactly as before, plus the price wording');
out.pw = { edited: NEW.writeStandard(Object.assign({}, SETUP_A, { priceWording: 'My own words.' }), ranges, ctx).sections.find(x => x.type === 'opinion').wording, cleared: 'wording' in NEW.writeStandard(Object.assign({}, SETUP_A, { priceWording: '' }), ranges, ctx).sections.find(x => x.type === 'opinion'),
  guarded: NEW.checkSetup(Object.assign({}, SETUP_A, { priceWording: 'Sold as is, no fees.' }), ranges) };
expect(out.pw.edited === 'My own words.' && out.pw.cleared === false && !!out.pw.guarded, 'the price wording: editable per appraisal, cleared means none, and guarded like the other vendor text: ' + JSON.stringify(out.pw));
const HAND = { title: 'RB 1 Hand Road: Market Appraisal', address: 'RB 1 Hand Road, Rbvale', setup: {}, fields: { ranges: [{ key: 'A', option: 'Current condition', involves: 'As it stands', low: 400000, high: 450000 }], bedrooms: '3', method: { name: 'Deadline sale', text: 'A deadline sale.' } },
  sections: [{ type: 'heading', text: 'What I heard' }, { type: 'para', cls: 'lede', text: 'You told me **lots**. {{range:A}} with {{bedrooms}} bedrooms by {{method}}.' }, { type: 'list', items: ['One', 'Two'] }, { type: 'table', head: ['A', 'B'], rows: [['1', '2']] },
    { type: 'ranges' }, { type: 'method' }, { type: 'wave', title: 'Wave', bars: [{ label: 'Week 1', pct: 35 }, { label: 'Week 2', pct: 25 }], marker: 1, markerLabel: 'Offers due' }, { type: 'methods', head: ['Method'], rows: [['Deadline sale, by a date']] }, { type: 'note', text: 'Small print.' }] };
// the look changed on 28 November 2026 (the approved sample), so "exactly as before" is now "nothing lost": every text, photo and link
// the d012895 core drew is still drawn (tests/apv-nothing-lost.js lists the labels the new look words differently)
const { lost } = require('./apv-nothing-lost.js');
out.lostHand = lost(OLD.render(HAND), NEW.render(HAND));
expect(!out.lostHand.length, 'the hand-loaded kind of record: nothing lost in the new look: ' + JSON.stringify(out.lostHand));
// with its address and date, so the new heading is covered: the address as the title, "Appraisal · date" over it
const recA = { title: wNew.title, address: ctx.address, prepared_on: ctx.preparedOn, setup: SETUP_A, fields: wNew.fields, sections: wNew.sections };
out.lostA = lost(OLD.render(recA, { comps: [], photos: {}, months: [], market: false }), NEW.render(recA, { comps: [], photos: {}, months: [], market: false }));
expect(!out.lostA.length, 'a phase A row: nothing lost in the new look: ' + JSON.stringify(out.lostA));
const comps = [{ id: 'c1', status: 'sold', address: 'RB 5 Core Road', suburb: 'Rbvale', price: 520000, sold_on: '2026-10-01', ring: 'suburb', compare_text: 'Similar.', compare_ticked: true, private_note: 'TIM-ONLY-NOTE' },
  { id: 'c2', status: 'listed', address: 'RB 7 Core Road', suburb: 'Rbvale', price: 590000, listed_on: '2026-11-01', ring: '750m' }];
const months = Array.from({ length: 12 }, (_, i) => ({ area: 'Dunedin', month: `2026-${String(i + 1).padStart(2, '0')}-01`, median: 500000 + i * 1000, lower_quartile: 400000, upper_quartile: 600000, sales: 100, days_to_sell: 30, bands: [], source: 'reinz', gathered_at: '2026-11-05T09:00:00+13:00' }));
const evC = { comps, photos: { c1: [{ url: 'https://img.example.test/c1.jpg' }] }, months, market: true };
const recC = Object.assign({}, recA, { setup: Object.assign({}, SETUP_A, { market: true }) });
out.lostC = lost(OLD.render(recC, evC), NEW.render(recC, evC));
expect(!out.lostC.length, 'a phase C row with priced comparables and the market report: nothing lost in the new look: ' + JSON.stringify(out.lostC));
// and the lost() check itself notices a missing sentence, photo or link
expect(lost('<p>Keep me.</p><img src="a.jpg">', '<p>Other.</p>').length === 2, 'the nothing-lost check catches a missing sentence and photo');
// and the four the review found it let through: a dropped table heading, a dropped short value, a dropped repeat of a paragraph, changed alt text
const T1 = '<table><thead><tr><th>Option</th><th>Range</th></tr></thead><tbody><tr><td>A</td><td>3</td></tr></tbody></table>';
out.selfCheck = { header: lost(T1, T1.replace('<th>Option</th>', '<th></th>')), short: lost(T1, T1.replace('<td>3</td>', '<td></td>')),
  dup: lost('<p>Again.</p><p>Again.</p>', '<p>Again.</p>'), alt: lost('<img src="a.jpg" alt="Photo 1 of 2, Kitchen">', '<img src="a.jpg" alt="Photo">'),
  scoped: lost('<p>Price</p>', '<p>$1</p>'), inComp: lost('<article class="apv-comp" data-comp="c1"><dt>Price</dt><dd>Sold for $1</dd></article>', '<article class="apv-comp" data-comp="c1"><p>$1</p></article>') };
expect(out.selfCheck.header.length === 1 && out.selfCheck.short.length === 1 && out.selfCheck.dup.length === 1 && out.selfCheck.alt.length === 1 && out.selfCheck.scoped.length === 1 && !out.selfCheck.inComp.length,
  'the nothing-lost check catches a dropped heading, a dropped short value, a dropped repeat and changed alt text; a reworded label is excused only inside a comparable: ' + JSON.stringify(out.selfCheck));
// and the two more the review asked for: a section heading made smaller, and on-screen text moved to paper only
out.selfCheck2 = { demoted: lost('<h2>Sales and current listings</h2><p>x</p>', '<h3>Sales and current listings</h3><p>x</p>'), designed: lost('<h2>Marketing plans</h2>', '<h3 class="apv-h3">Marketing plans</h3>'),
  printOnly: lost('<p>Call me any time.</p>', '<div class="apv-print-only"><p>Call me any time.</p></div>'), byline: lost('<p class="apv-by">Prepared for Robin</p>', '<p class="apv-by apv-print-only">Prepared for Robin</p>'),
  paperBefore: lost('<div class="apv-print-only"><p>On paper.</p></div>', '<div class="apv-print-only"><p>On paper.</p></div>'), stillH2: lost('<h2>Reviews</h2>', '<section><h2>Reviews</h2></section>') };
expect(out.selfCheck2.demoted.length === 1 && /^heading demoted/.test(out.selfCheck2.demoted[0]) && !out.selfCheck2.designed.length && out.selfCheck2.printOnly.length === 1 && /^moved to print only/.test(out.selfCheck2.printOnly[0]) && !out.selfCheck2.byline.length && !out.selfCheck2.paperBefore.length && !out.selfCheck2.stillH2.length,
  'the nothing-lost check catches a section heading made smaller and on-screen text moved to print only, and lets through only the listed, designed ones: ' + JSON.stringify(out.selfCheck2));
// a chart's range label is excused only when the opinion's pyramid names the same figures
{ const CH = '<figure class="mk-fig" data-chart="dots"><p>My range: $1,000 to $2,000</p><p>Sold</p></figure>', CH2 = '<figure class="mk-fig" data-chart="dots"><p>Sold</p></figure>';
  const PY = f => '<div class="apv-opinion"><figure class="apv-pyr"><svg viewBox="0 0 400 320" role="img" aria-label="x" class="apv-pyr-svg"><title>Appraisal range ' + f + '. Above it, the top price is set by competition between buyers.</title></svg></figure></div>';
  out.pyrCheck = { none: lost(CH, CH2), same: lost(CH, CH2 + PY('$1,000 to $2,000')), other: lost(CH, CH2 + PY('$1,000 to $3,000')) };
  expect(out.pyrCheck.none.length === 1 && !out.pyrCheck.same.length && out.pyrCheck.other.length === 1, 'a range label leaving a chart is excused only by a pyramid with the same figures: ' + JSON.stringify(out.pyrCheck)); }
// nothing there, nothing shown (Tim, 28 November 2026): no plan, no method, or a heading with nothing under it draws nothing, and gets no chip
const EMPTY_SECS = [{ type: 'heading', text: 'Lonely heading' }, { type: 'heading', text: 'My opinion of price' }, { type: 'opinion' }, { type: 'heading', text: 'How I would sell it' }, { type: 'method' },
  { type: 'heading', text: 'Every way to sell, explained' }, { type: 'para', text: 'Whichever way you choose.' }, { type: 'methodcards', rec: 'deadline', items: [] }, { type: 'heading', text: 'Marketing plans' }, { type: 'plans', items: [], included: 'Every plan includes: photos.' }, { type: 'heading', text: 'Last and empty' }];
const he = NEW.render({ title: 'RB 9 Empty Road: Market Appraisal', address: 'RB 9 Empty Road', prepared_on: '2026-11-28', setup: SETUP_A, fields: wNew.fields, sections: EMPTY_SECS }, {});
out.empty = { chips: (he.match(/class="apv-chip"/g) || []).map(() => 1).length, h2: (he.match(/<h2[^>]*>[^<]*/g) || []).map(x => x.replace(/<h2[^>]*>/, '')) };
expect(!/Lonely heading|Last and empty|Every way to sell|Whichever way|settled\.govt\.nz|Marketing plans|apv-plans|Every plan includes|Swipe|Use the arrows/.test(he) && out.empty.chips === 2,
  'no plans, no methods, or a heading alone: no heading, no line, no strip, and no chip: ' + JSON.stringify(out.empty));
// the Sections screen's preview of the header: the header alone, no title over it and no Pause button
const vidSec = NEW.phaseB(Object.assign({}, SETUP_A, { header: 'own', headerOpt: { asset: 'h1', kind: 'video' } })).header, vidEv = { assets: { h1: { url: 'https://img.example.test/h.webm', still: 'https://img.example.test/h.jpg', mime: 'video/webm' } } };
const pv = NEW.heroPreview(vidSec, vidEv), full = NEW.render({ title: 't', address: 'RB 9 Empty Road', setup: SETUP_A, fields: {}, sections: [vidSec] }, vidEv);
expect(/class="apv-hero vid/.test(pv) && !/<h1|apv-kick|apv-vbtn|has-head/.test(pv) && /apv-vbtn/.test(full) && /<h1>RB 9 Empty Road<\/h1>/.test(full), 'the header preview has no title and no Pause button; the appraisal itself has both');
expect(!/TIM-ONLY-NOTE/.test(NEW.render(recC, evC)), 'a comparable\'s private note never reaches the page');

// ── 8. the C fix: nothing to plot, nothing drawn ──
const noPrice = { comps: [{ id: 'c3', status: 'sold', address: 'RB 9 Core Road', suburb: 'Rbvale', sold_on: '2026-10-01', ring: 'suburb' }], photos: {}, months: [], market: true };
const hNo = NEW.render(recC, noPrice);
expect(!/Price evidence at a glance/.test(hNo) && /Sales and current listings/.test(hNo), 'no priced comparable: no price dots heading, the sale itself still shown');
expect(!/The Dunedin market/.test(hNo), 'the market report switched on with no figures: no heading, no empty report');
const gapMonths = [{ area: 'Dunedin', month: '2026-10-01', bands: [], source: 'reinz' }];
expect(!/The Dunedin market/.test(NEW.render(recC, { comps: [], photos: {}, months: gapMonths, market: true })), 'a market month with no figures at all: no report');

// ── 2 to 5. the phase B sections ──
const draw = (s, ev) => { const w = NEW.writeStandard(s, ranges, ctx); return { w, h: NEW.render({ title: w.title, setup: s, fields: w.fields, sections: w.sections }, ev || {}) }; };
const EMPTY = Object.assign({}, SETUP_A, { headerOpt: { url: '', focus: { x: 50, y: 50 }, zoom: 1, bright: 1 }, heard: { lines: [{ id: 'l1', text: 'You want to move by March.', ticked: false }] },
  home: { on: true, photos: [], details: [['Rooms', '3 bedrooms']], ad: { title: 'To wake up to the sun', body: 'Draft.', ticked: false } }, buyers: { text: 'Families.', tags: ['Gardeners'], ticked: false }, intro: {}, reviews: { on: true } });
let r = draw(EMPTY, { reviews: [{ ticked: false, rating: 5, body: 'Great', reviewer: 'Sam', reviewed_on: '2026-10-01' }] });
['apv-hero', 'apv-intro', 'apv-heard', 'apv-home', 'apv-buyers', 'apv-reviews', 'What I heard from you', 'Your home, as buyers would see it', 'The buyers I have in mind', 'What my clients say', 'A short video from me', 'Mockup'].forEach(t => expect(!r.h.includes(t), 'nothing uploaded or ticked: no ' + t + ' on the page'));
expect(!r.w.sections.some(x => ['header', 'intro', 'heard', 'home', 'buyers'].includes(x.type)), 'nothing ticked or uploaded is written as a section');
expect(r.w.sections.some(x => x.type === 'reviews'), 'reviews switched on is written (drawn only when a ticked review exists)');
// each one appears once it has content
const FULL = JSON.parse(JSON.stringify(EMPTY));
FULL.headerOpt = { url: 'https://library.example.test/rb-hill.jpg', focus: { x: 30, y: 70 }, zoom: 1.4, bright: 1.2 };
FULL.heard.lines.push({ id: 'l2', text: 'You would like the sale to be quiet.', ticked: true });
FULL.home.photos = ['d2', 'd1', 'dGone']; FULL.home.ad.ticked = true; FULL.home.ad.body = 'Sun all day.\n\nSo, to discover the ease of it, call me, Tim, to see it today.';
FULL.home.details = [['Rooms', '3 bedrooms plus study'], ['Land area', ''], ['Heating', 'Heat pump']];
FULL.buyers.ticked = true; FULL.intro = { asset: 'v-intro' };
const ev = { homePhotos: { d1: { url: 'https://img.example.test/d1.jpg', room: 'Kitchen' }, d2: { url: 'https://img.example.test/d2.jpg', room: 'Living' } },
  assets: { 'v-intro': { url: 'https://img.example.test/intro.webm', still: 'https://img.example.test/intro.jpg', mime: 'video/webm' } },
  reviews: [{ ticked: true, rating: 5, body: 'Tim was <b>wonderful</b>.', reviewer: 'Sam', reviewed_on: '2026-10-01', url: 'https://g.example.test/r1' }, { ticked: true, rating: 4, body: 'No fees to worry about.', reviewer: 'J.', reviewed_on: '2026-11-01' },
    { ticked: false, rating: 1, body: 'UNTICKED REVIEW', reviewer: 'K', reviewed_on: '2026-11-02' }, { ticked: true, removed_at: '2026-11-10', rating: 5, body: 'GONE REVIEW', reviewer: 'L', reviewed_on: '2026-11-03' }] };
r = draw(FULL, ev); out.full = r.w.sections.map(x => x.type + (x.stage ? ':' + x.stage : '')).join(',');
expect(/class="apv-hero[ "]/.test(r.h) && /Photo: DunedinNZ/.test(r.h) && /object-position:30% 70%/.test(r.h) && /scale\(1\.4\)/.test(r.h) && /brightness\(1\.2\)/.test(r.h), 'a library photo: drawn with the framing, credited DunedinNZ');
expect(r.h.indexOf('apv-hero') < r.h.indexOf('<h1>'), 'the header sits above the title');
expect(/A short video from me/.test(r.h) && /<video controls/.test(r.h) && /intro\.jpg/.test(r.h) && !/<video controls[^>]*autoplay/.test(r.h), 'the video introduction: the vendor plays it, its still frame for print');
expect(/What I heard from you/.test(r.h) && /quiet/.test(r.h) && !/move by March/.test(r.h), 'What I heard: the ticked line only');
expect(/Your home, as buyers would see it/.test(r.h) && /<span class="apv-tag mock">Mockup<\/span>/.test(r.h) && r.h.includes(NEW.MOCK_LINE) && /Nothing here is advertised or live/.test(r.h), 'the mockup is labelled as the sample labels it: Mockup, a draft only, nothing advertised or live');
expect(r.h.indexOf('d2.jpg') < r.h.indexOf('d1.jpg') && !/dGone/.test(r.h), 'photos in Tim\'s order; one that can\'t be shown is left out');
expect(/3 bedrooms plus study/.test(r.h) && /Heat pump/.test(r.h) && !/<dt>Land area<\/dt>/.test(r.h), 'a blank key detail is left out, never shown empty');
expect(/To wake up to the sun/.test(r.h) && /call me, Tim/.test(r.h), 'the ticked advertisement is shown');
expect(/The buyers I have in mind/.test(r.h) && /Gardeners/.test(r.h), 'the ticked ideal buyers are shown');
expect(/What my clients say/.test(r.h) && /Sam, October 2026/.test(r.h) && /&lt;b&gt;wonderful/.test(r.h) && !/UNTICKED REVIEW|GONE REVIEW/.test(r.h) && !/No fees/.test(r.h), 'reviews: ticked, still on Google, escaped, and none a vendor may not read');
expect(/aria-label="5 out of 5 stars"/.test(r.h), 'stars are labelled for screen readers');
const order = ['apv-intro', 'apv-heard', 'apv-home', 'apv-buyers', 'My opinion of price', 'Tim is not like other agents', 'apv-reviews'].map(t => r.h.indexOf(t));
expect(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'the agreed order: video, heard, mockup, buyers, then price, the panel, reviews: ' + order.join(','));
const st = Object.fromEntries(r.w.sections.filter(x => ['header', 'intro', 'heard', 'home', 'buyers', 'reviews'].includes(x.type)).map(x => [x.type, x.stage]));
expect(JSON.stringify(st) === JSON.stringify({ header: 1, intro: 1, heard: 1, home: 2, buyers: 2, reviews: 3 }), 'every new section carries its stage: ' + JSON.stringify(st));
// the mockup with only photos, or only the advertisement, still shows; with neither it doesn't
const onlyPh = JSON.parse(JSON.stringify(FULL)); onlyPh.home.ad.ticked = false;
expect(/Your home, as buyers would see it/.test(draw(onlyPh, ev).h) && !/To wake up/.test(draw(onlyPh, ev).h), 'photos and no ticked advertisement: the mockup shows its photos only');
expect(!/Your home, as buyers would see it/.test(draw(onlyPh, {}).h), 'photos chosen but none can be shown, and no advertisement: no mockup');
const homeOff = JSON.parse(JSON.stringify(FULL)); homeOff.home.on = false;
expect(!/Your home, as buyers would see it/.test(draw(homeOff, ev).h), 'the mockup switched off: not shown');
// the intro's asset missing (removed): nothing
expect(!/A short video from me/.test(draw(FULL, Object.assign({}, ev, { assets: {} })).h), 'the video introduction missing from storage: not shown');
// Tim's own header: a video, muted and looped, with its still; and a photo with his credit
const OWNV = Object.assign(JSON.parse(JSON.stringify(EMPTY)), { header: 'own', headerOpt: { asset: 'h1', kind: 'video', credit: 'Filmed by Tim', focus: { x: 10, y: 90 }, zoom: 2, bright: 0.8, speed: 0.75 } });
let hv = draw(OWNV, { assets: { h1: { url: 'https://img.example.test/h.webm', still: 'https://img.example.test/h.jpg', mime: 'video/webm' } } }).h;
expect(/<video class="apv-hero-m" autoplay muted loop playsinline/.test(hv) && /data-speed="0.75"/.test(hv) && /apv-hero-still/.test(hv) && /Filmed by Tim/.test(hv) && !/DunedinNZ/.test(hv), 'Tim\'s own clip: muted, looped, slowed to his speed, its still frame, his credit');
expect(NEW.writeStandard(OWNV, ranges, ctx).sections[0].speed === 0.75, 'the speed is stored in the section');
[[undefined, 0.6], [0.2, 0.5], [3, 1], ['0.55', 0.55], ['', 0.6]].forEach(([v, w]) => expect(NEW.clipSpeed(v) === w, 'speed ' + v + ' reads as ' + w + ', not ' + NEW.clipSpeed(v)));
[[3.9, ''], [4, 4], [8, 8], [12, 12], [12.5, ''], ['', ''], ['x', '']].forEach(([v, w]) => expect(NEW.clipLen(v) === w, 'a segment of ' + v + ' seconds: ' + JSON.stringify(NEW.clipLen(v))));
expect(NEW.CLIP.len === 8 && NEW.CLIP.min === 4 && NEW.CLIP.max === 12 && NEW.CLIP.maxBytes === 52428800, 'the clip rules: 4 to 12 seconds, 8 by default, 50 MB');
expect(!('speed' in NEW.writeStandard(Object.assign(JSON.parse(JSON.stringify(EMPTY)), { headerOpt: { url: 'https://library.example.test/x.jpg', speed: 0.7 } }), ranges, ctx).sections[0]), 'a photo header has no speed');
expect(!/apv-hero/.test(draw(OWNV, {}).h), '"Use my own" with the file not to hand: no header');
const noStill = draw(OWNV, { assets: { h1: { url: 'https://img.example.test/h.webm', mime: 'video/webm' } } }).h;
expect(/apv-hero vid nostill/.test(noStill), 'a video without a still frame is marked, so print leaves it out');
const libVid = Object.assign(JSON.parse(JSON.stringify(EMPTY)), { headerOpt: { url: 'https://library.example.test/rb-hill.mp4' } });
expect(/<video class="apv-hero-m" autoplay muted loop[^>]*data-speed="0.6"/.test(draw(libVid).h), 'library footage plays muted and looped, slowly by default');
const badUrl = Object.assign(JSON.parse(JSON.stringify(EMPTY)), { headerOpt: { url: 'javascript:alert(1)' } });
expect(!/apv-hero/.test(draw(badUrl).h) && /https:\/\//.test(NEW.checkSections(badUrl)), 'a header link that isn\'t https is never drawn, and Tim is told');

// ── 6. key details on offer ──
const facts = [{ key: 'pType', value: 'House', value_id: 'v1', source: 'tim' }, { key: 'owners_relab', value: 'RB Owner', value_id: 'v2', source: 'relab' }, { key: 'pHeat', value: 'Wood burner', value_id: 'v3', source: 'relab' },
  { key: 'capital_value', value: '500000', value_id: 'v4', source: 'council' }, { key: 'pBed', value: '4', value_id: 'v5', source: 'tim' }, { key: 'pLand', value: '650', value_id: 'v6', source: 'council' }, { key: 'pFloor', value: 'unknown', value_id: 'v7', source: 'tim' },
  { key: 'outlook', value: ['Harbour', 'City'], value_id: 'v8', source: 'tim' }, { key: 'pBath', value: '', value_id: 'v9', source: 'tim' }];
const hf = NEW.homeFacts(facts, '3 bedrooms plus study'); out.homeFacts = hf;
expect(hf[0].key === 'rooms' && hf[0].value === '3 bedrooms plus study', 'the room wording first, from Tim\'s calls only');
expect(!hf.some(x => ['owners_relab', 'capital_value', 'pBed', 'pHeat'].includes(x.key)), 'never the Relab owners, the CV, a bare bedroom count, or a value from Relab');
expect(hf.some(x => x.key === 'pLand' && x.value === '650 m²') && hf.some(x => x.key === 'outlook' && x.value === 'Harbour, City') && !hf.some(x => ['pFloor', 'pBath'].includes(x.key)), 'figures formatted; unknown and blank left out');
expect(NEW.homeFacts(facts, null)[0].key !== 'rooms', 'no room calls yet: no rooms line');

// ── 7. the wording guard over what Tim ticked ──
const asIs = JSON.parse(JSON.stringify(FULL)); asIs.home.ad.body = 'Sold as is, where is.';
expect(/current condition/.test(NEW.checkSections(asIs)), 'a ticked advertisement saying "as is" is refused');
const feeLine = JSON.parse(JSON.stringify(EMPTY)); feeLine.heard.lines = [{ text: 'You asked about my fee.', ticked: false }];
expect(/^Line 1 of What I heard: fees and commission/.test(NEW.checkSections(feeLine)), 'an unticked line about the fee is refused too (the database keeps no such draft), naming the line: ' + NEW.checkSections(feeLine));
feeLine.heard.lines[0].text = 'You asked how I work.'; expect(NEW.checkSections(feeLine) === '', 'changed: fine');

// ── links, phone numbers and emails never reach a vendor (the review of 5b248b9) ──
['Call me on 021 555 1234.', 'Email rb@example.test any time.', 'See [my page](https://x.example.test).', 'Go to www.example.test now.'].forEach(t => {
  const a = JSON.parse(JSON.stringify(EMPTY)); a.heard.lines = [{ text: 'Fine.', ticked: true }, { text: t, ticked: false }];
  expect(/^Line 2 of What I heard: take out the link, phone number or email/.test(NEW.checkSections(a)), 'a line holding "' + t + '" can\'t be kept, ticked or not, naming the line: ' + NEW.checkSections(a));
  const b2 = JSON.parse(JSON.stringify(EMPTY)); b2.buyers.text = t; expect(/^The ideal buyers: take out the link/.test(NEW.checkSections(b2)), 'the ideal buyers holding "' + t + '" are refused');
  const c2 = JSON.parse(JSON.stringify(EMPTY)); c2.home.ad.body = t; expect(/^The advertisement: take out the link/.test(NEW.checkSections(c2)), 'the advertisement holding "' + t + '" is refused'); });
['650 m² of land, built 1978, 3 bedrooms.', '$520,000 to $575,000', 'Moving by 1 March 2027.'].forEach(t => { const a = JSON.parse(JSON.stringify(EMPTY)); a.heard.lines = [{ text: t, ticked: true }]; expect(NEW.checkSections(a) === '', 'ordinary figures are fine: ' + t); });
// even if one got through, heard and buyers draw as plain text: never a live link or markup
const sneak = JSON.parse(JSON.stringify(EMPTY)); sneak.heard.lines = [{ text: 'See [my page](https://x.example.test) and https://y.example.test **now** <b>x</b>', ticked: true }]; sneak.buyers = { text: '[my page](https://x.example.test)', tags: [], ticked: true };
const hs = draw(sneak, {}).h;
expect(!/<a /.test(hs.slice(hs.indexOf('apv-heard'), hs.indexOf('My opinion of price'))) && /\[my page\]\(https:\/\/x\.example\.test\)/.test(hs) && /&lt;b&gt;/.test(hs) && !/<strong>now/.test(hs), 'heard and buyers are escaped plain text: no anchor, no bold, no markup');
// parking once, preferring the count
const pk = NEW.homeFacts([{ key: 'pPark', value: 'Off-street', value_id: 'p1', source: 'tim' }, { key: 'parking_spaces', value: '2', value_id: 'p2', source: 'tim' }], null).map(x => x.key);
expect(pk.includes('parking_spaces') && !pk.includes('pPark'), 'parking shows once, the count preferred: ' + pk);
expect(NEW.homeFacts([{ key: 'pPark', value: 'Off-street', value_id: 'p1', source: 'tim' }], null).some(x => x.key === 'pPark'), 'with no count, the parking description shows');
expect(/alt="A still from my video introduction"/.test(r.h), 'the introduction\'s still is described in Tim\'s voice');
expect(!/web version|plays on the web/i.test(r.h), 'no "plays on the web version" note under the video (Tim, 28 Nov)');

console.log(JSON.stringify({ out, errs }, null, 1));
