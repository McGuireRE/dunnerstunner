// The journey as a pitch page (Tim, 9 November 2026): a public, shareable page at #journey with a page for each of the nine stops
// at #journey/<slug>. Checks: no sign-in and no private data when signed out; every stop links to its page and every page links on;
// the call to action is on every page; no fees, prices, other agencies or Quiet List wording; no dashes; it fits a phone (390 px)
// in light and dark mode; a signed-in vendor still sees "You are here" and the "Go to this step" guards; the print view works.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(path.join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const URL='https://packages.dunnerstunner.co.nz/onboarding/';
const W={}; new Function('window',fs.readFileSync(path.join(__dirname,'..','src','strings.js'),'utf8'))(W);
const P=W.JOURNEY_PITCH, SLUGS=P.stops.map(s=>s.slug);
const TITLES=['Thinking of selling','Your updated plan','Meeting Tim','Your agreement','Identity check','Getting ready','On the market','An offer','Sold and settling'];
(async()=>{
const b=await chromium.launch(); const errs=[], fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); }; const out={};
const PDF='%PDF-1.4\n% test fixture, not a real guide\n';
const GJ={agency:{file:'rea-agency-agreement-guide-2022-en.pdf',version:'August 2022',title:'Real Estate Authority guide to agency agreements',sha256:'a'.repeat(64),translations:{mi:{file:'rea-agency-agreement-guide-2022-mi.pdf',language:'te reo Māori'},ko:{file:'rea-agency-agreement-guide-2022-ko.pdf',language:'Korean'}}},
  sale_purchase:{file:'rea-sale-purchase-guide-2022-en.pdf',version:'August 2022',title:'Real Estate Authority guide to sale and purchase agreements',sha256:'b'.repeat(64),translations:{mi:{file:'rea-sale-purchase-guide-2022-mi.pdf',language:'te reo Māori'},zh:{file:'rea-sale-purchase-guide-2022-zh.pdf',language:'Simplified Chinese'}}}};
async function setup(o){
  o=o||{};
  const ctx=await b.newContext({viewport:{width:o.w||390,height:844},colorScheme:o.dark?'dark':'light'});
  const reqs=[]; ctx.on('request',r=>reqs.push(r.url()));
  await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await ctx.route('https://packages.dunnerstunner.co.nz/blank.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>blank</title>'}));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
  if(o.guides) await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/assets/guides/**',r=>{ const u=r.request().url(); if(u.endsWith('guides.json')) return r.fulfill({contentType:'application/json',body:JSON.stringify(GJ)}); if(/\.pdf$/.test(u)) return r.fulfill({contentType:'application/pdf',body:PDF}); return r.fulfill({status:404,body:''}); });
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  return {ctx,p,reqs};
}
const T0='2026-11-01T00:00:00Z';
const prop=(id,address,stage,extra)=>Object.assign({id,address,title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},stage,stage_at:T0,created_at:T0,updated_at:T0},extra||{});
const pperson=(id,pid,name,email,user)=>({id,property_id:pid,position:1,legal_name:name,pref_name:'',email,phone:'',user_id:user||null,role:'owner',source:'agent',name_from:'agent'});
const ag=(id,pid,status,extra)=>Object.assign({id,ref:'MRE-2026-'+id,address:'x',property_id:pid,status,config:{appr:'done',ask:'875000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual',approach:'invited'},answers:{_step:7,capacity:'Owners',titleOk:true,gst:'no',pType:'House',work:'no',wt:'no',meth:'no',def:'no',guide:['0','1','2','3','4','5','6','7'],prior:'none'},legal:{choice:'have'},agreement_version:'v3.15-26102026',created_at:T0},extra||{});
const aperson=(id,a,pos,name,email,user,signed,verified)=>({id,agreement_id:a,position:pos,legal_name:name,pref_name:'',email,phone:'',user_id:user,signed_at:signed||null,id_verified_at:verified||null});
const BASE={agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[],properties:[],property_people:[],property_documents:[]};
// seed from a blank page of the same site, so the app (which saves its own copy of the data as it runs) cannot write the old data back over it
const seed=async(p,db)=>{ await p.goto('https://packages.dunnerstunner.co.nz/blank.html'); await p.evaluate(db=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify(db));},Object.assign({},BASE,db)); };
// a fresh load of the page at a hash, optionally signed in; returns the data calls the page made
async function openAt(p,hash,who){
  await p.evaluate(([who])=>{ localStorage.removeItem('callLog'); localStorage.removeItem('mocksession'); if(who) localStorage.setItem('mocksession',JSON.stringify({user:{id:who[0],email:who[1]}})); },[who||null]);
  await p.goto('about:blank'); await p.goto(URL+hash); await p.waitForSelector('#pTitle, .login-card, #main h1',{timeout:8000}).catch(()=>{}); await p.waitForTimeout(500);
}
const calls=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('callLog')||'[]'));
const sideways=p=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
const body=p=>p.evaluate(()=>document.querySelector('#main').innerText);
const BAD=/\b(will probably|probably|(?<!most )likely to|expected to|you should expect|within \d+ (days|weeks|months)|in \d+ (days|weeks)|(I|we) guarantee|guaranteed)\b/i;
const OTHERS=/\b(Ray White|Harcourts|Barfoot|Bayleys|Century 21|Mike Pero|Quinovic|LJ Hooker|Sotheby|Professionals Real Estate|Remax|RE\/MAX|Tall Poppy|Lugtons|Trade Me)\b/i;

// ---------- A. strings: one source, in the catalogue, in Tim's voice ----------
{ const all=JSON.stringify(P);
  expect(P.stops.length===9&&new Set(SLUGS).size===9&&SLUGS.every(s=>/^[a-z-]+$/.test(s)),'A: nine stops with their own links');
  expect(P.stops.every(s=>s.faq.length>=4&&s.faq.length<=6),'A: every stop has 4 to 6 questions: '+P.stops.map(s=>s.faq.length));
  expect(P.stops.every(s=>s.opening&&s.short&&s.happens.length&&s.you.length&&s.tim.length&&s.docs.length),'A: every stop has an opening, what happens, what you do, what I do and the documents');
  expect(!/[—–]/.test(all),'A: no dashes in the wording');
  expect(!/\$/.test(all)&&!/\d\s?%/.test(all)&&!/\bGST\b/.test(all),'A: no prices, percentages or GST in the wording');
  expect(!OTHERS.test(all),'A: no other agencies named');
  expect(!/quiet list|quiet listing|off-market|off market/i.test(all),'A: no Quiet List or off-market wording');
  expect(!BAD.test(all),'A: no predictions, timeframes or guarantees');
  expect(!/your home\b/i.test(all),'A: "your property", not "your home"');
  expect(!/\b(award|testimonial|days on market|best in)\b/i.test(all),'A: no awards, testimonials or days-on-market claims');
  expect(!/commission/i.test(all),'A: no commission figures or talk of commission');
  const wording=[]; (function w(v,k){ if(k==='slug'||k==='k') return; if(typeof v==='string') wording.push(v); else if(Array.isArray(v)) v.forEach(x=>w(x)); else if(v&&typeof v==='object') Object.keys(v).forEach(x=>w(v[x],x)); })(P);
  const fee=wording.filter(t=>/\bfee\b/i.test(t)); const okFee=t=>/only talk about my fee once you have decided who the best agent is for you|administration fee covers identity checks|administration fee in your agreement covers identity checks|When do we talk about your fee|A word about my fee|conversation about my fee until you have decided who the best agent is for you/.test(t);
  expect(fee.length>=4&&fee.every(okFee),'A: every mention of a fee is Tim\'s rule or the administration fee, never a figure: '+fee.filter(t=>!okFee(t)).slice(0,2));
  expect(/agreed with all of the owners, in writing/.test(P.fee)&&/only talk about my fee once you have decided who the best agent is for you/.test(P.fee),'A: the fee wording is exactly Tim\'s rule');
  // the catalogue lists every piece of the wording once, with the checks the strings test makes
  const strs=[]; W.I18N_STRINGS.screens.forEach(([g,l])=>l.forEach(s=>strs.push(s)));
  expect(new Set(strs).size===strs.length,'A: no string is listed twice in the catalogue');
  const grp=W.I18N_STRINGS.screens.find(x=>x[0]==='pitch'); expect(grp&&grp[1].length>200,'A: the journey pages have their own group in the catalogue ('+(grp&&grp[1].length)+')');
  const walk=(v,k,acc)=>{ if(k==='slug'||k==='k') return; if(typeof v==='string') acc.push(v); else if(Array.isArray(v)) v.forEach(x=>walk(x,null,acc)); else if(v&&typeof v==='object') Object.keys(v).forEach(x=>walk(v[x],x,acc)); };
  const mine=[]; walk(P,null,mine); expect(mine.every(s=>strs.includes(s)),'A: every journey page string is in the catalogue: '+mine.filter(s=>!strs.includes(s)).slice(0,2));
  const phs=strs.flatMap(s=>s.match(/\{[^}]*\}/g)||[]); expect(phs.every(x=>/^\{[a-z][a-z0-9]*\}$/.test(x)),'A: placeholders are plain names');
  expect(!strs.some(s=>!s.trim()||s!==s.trim()||/\s{2,}/.test(s)),'A: no blank or padded strings');
  expect(!strs.some(s=>/including his fee/.test(s)),'A: the panel no longer mentions his fee');
  out.catalogue={pitch:grp&&grp[1].length,faq:P.stops.map(s=>s.faq.length)};
}

// ---------- B. signed out: public, nothing read, one road with no marker ----------
{ const {ctx,p,reqs}=await setup({guides:true});
  await p.goto(URL); await seed(p,{});
  await openAt(p,'#journey');
  let c=await calls(p); out.bCalls=c;
  expect(c.length===0,'B: signed out, the page makes no database, function or sign-in requests: '+JSON.stringify(c));
  expect(!reqs.some(u=>/supabase\.co/.test(u)),'B: no request to the database host: '+reqs.filter(u=>/supabase\.co/.test(u)).slice(0,2));
  expect(await p.textContent('#pTitle')==='Your selling journey','B: the page is Your selling journey');
  expect(await p.title()==='Your selling journey · McGuire Real Estate','B: a proper document title for sharing: '+await p.title());
  expect(!(await p.isVisible('#journeyBtn')),'B: the Journey button is not needed on the journey page');
  const i=await p.evaluate(()=>{ const q=s=>[...document.querySelectorAll('#main '+s)].map(e=>+e.dataset.j); return {plain:q('.jstop.plain'),here:q('.jstop.here'),done:q('.jstop.done'),ticks:document.querySelectorAll('#main .tick-b').length,svgW:Math.round(document.querySelector('#main svg.jmap').getBoundingClientRect().width),read:[...document.querySelectorAll('#main .jcard a.btn')].map(a=>a.getAttribute('href')),links:[...document.querySelectorAll('#main .jstop')].every(e=>e.getAttribute('role')==='link'&&e.getAttribute('tabindex')==='0'&&e.getAttribute('aria-label')),pill:document.querySelectorAll('#main .pill-t').length,h1:document.querySelectorAll('#main h1').length}; });
  expect(i.plain.length===9&&!i.here.length&&!i.done.length&&i.ticks===0&&i.pill===0,'B: signed out is the same map with no marker and no ticks');
  expect(i.read.length===9&&i.read.every((h,k)=>h==='#journey/'+SLUGS[k]),'B: each stop has a Read more link to its own page: '+i.read);
  expect(i.links&&i.h1===1,'B: every stop on the map is a labelled, keyboard reachable link, and there is one heading');
  expect(i.svgW>=330&&i.svgW<=362,'B: the map uses the phone width ('+i.svgW+')');
  expect(!(await sideways(p)),'B: no sideways scroll at 390 px');
  const t=await body(p);
  expect(/Book an appraisal with me/.test(t)&&t.includes('027 562 7207')&&t.includes('tim@mcguire.co.nz'),'B: the call to action and Tim\'s contact details are on the page');
  const cta=await p.evaluate(()=>[...document.querySelectorAll('#main .pitch-cta a')].map(a=>a.getAttribute('href')));
  expect(cta.includes('tel:0275627207')&&cta.includes('sms:0275627207')&&cta.includes('mailto:tim@mcguire.co.nz'),'B: call, text and email buttons use the numbers the app already shows: '+cta);
  expect(/only talk about my fee once you have decided who the best agent is for you/.test(t)&&/agreed with all of the owners, in writing/.test(t),'B: the fee rule is stated, with no figure');
  expect(!/[—–]/.test(t)&&!/\$/.test(t)&&!OTHERS.test(t)&&!BAD.test(t),'B: no dashes, prices, other agencies or predictions on screen');
  expect(/Sign in/.test(await p.textContent('[data-psign]')),'B: a quiet way to sign in for sellers already working with Tim');
  expect(!/Queens Drive|Jane|@example/.test(t),'B: nothing personal on the public page');
  // clicking each stop on the map opens its page
  for(let k=1;k<=9;k++){ await openAt(p,'#journey'); await p.click('#main .jstop[data-j="'+k+'"]'); await p.waitForTimeout(250);
    expect(await p.evaluate(()=>location.hash)==='#journey/'+SLUGS[k-1]&&await p.textContent('#pTitle')===TITLES[k-1],'B: stop '+k+' on the map opens its page ('+await p.evaluate(()=>location.hash)+')'); }
  // keyboard: Enter on a stop
  await openAt(p,'#journey'); await p.focus('#main .jstop[data-j="3"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  expect(await p.evaluate(()=>location.hash)==='#journey/meeting-tim','B: Enter on a stop opens its page');
  // the back button returns to the map, and the title follows
  await p.goBack(); await p.waitForTimeout(300);
  expect(await p.textContent('#pTitle')==='Your selling journey'&&await p.title()==='Your selling journey · McGuire Real Estate','B: the browser Back button returns to the map with its title');
  // an unknown page is the map with a gentle line
  await openAt(p,'#journey/nothing-here'); expect(/not found, so here is the whole road/.test(await body(p))&&await p.textContent('#pTitle')==='Your selling journey','B: an unknown link shows the whole road');
  // signing in is a way out of the page
  await openAt(p,'#journey'); await p.click('[data-psign]'); await p.waitForTimeout(400);
  expect(await p.textContent('main h1')==='Your agency agreement'&&await p.evaluate(()=>location.hash)===''&&await p.title()==='Your agency agreement · McGuire Real Estate'&&await p.isVisible('#journeyBtn'),'B: Sign in leaves the journey page for the sign-in page, and the title and button return');
  // from the sign-in page, the panel's Read more reaches the page
  await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap');
  const more=await p.$$eval('#journey .jcard a[data-jmore]',a=>a.map(x=>x.getAttribute('href')));
  expect(more.length===9&&more.every((h,k)=>h==='#journey/'+SLUGS[k]),'B: the panel has Read more on every stop: '+more);
  await p.click('#journey .jcard a[data-jmore="6"]'); await p.waitForTimeout(400);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden)&&await p.textContent('#pTitle')==='Getting ready'&&await p.evaluate(()=>location.hash)==='#journey/getting-ready','B: Read more closes the panel and opens the stop page');
  c=await calls(p); expect(!c.some(x=>/^(from|rpc|fn):/.test(x)),'B: still no data calls after all that: '+JSON.stringify(c));
  await ctx.close(); }

// ---------- C. the nine stop pages: complete, linked on, call to action, nothing forbidden, fits a phone in light and dark ----------
for(const dark of [false,true]){
  const {ctx,p}=await setup({guides:true,dark}); await p.goto(URL); await seed(p,{});
  const lab=dark?'dark':'light'; let shot=0;
  for(let k=1;k<=9;k++){
    await openAt(p,'#journey/'+SLUGS[k-1]);
    const d=await p.evaluate(()=>({h1:[...document.querySelectorAll('#main h1')].map(e=>e.textContent),h2:[...document.querySelectorAll('#main h2')].map(e=>e.textContent),qa:document.querySelectorAll('#main .p-qa').length,kick:(document.querySelector('.p-kick')||{}).textContent,
      lede:(document.querySelector('.p-open')||{}).textContent||'',links:[...document.querySelectorAll('#main .p-next a, #main .p-crumb a')].map(a=>a.getAttribute('href')+'|'+a.textContent),cta:!!document.querySelector('#main .pitch-cta a[href^="tel:"]'),
      bg:getComputedStyle(document.body).backgroundColor,focus:document.activeElement&&document.activeElement.id,dots:[...document.querySelectorAll('#main .p-dots a')].map(a=>a.getAttribute('href')),cur:(document.querySelector('.p-dots a[aria-current]')||{}).textContent}));
    const T=await body(p);
    expect(d.h1.length===1&&d.h1[0]===TITLES[k-1],`C${lab}: stop ${k} heading ${d.h1}`);
    expect(await p.title()===TITLES[k-1]+' · Your selling journey · McGuire Real Estate',`C${lab}: stop ${k} has its own document title: `+await p.title());
    expect(d.kick==='Stop '+k+' of 9',`C${lab}: stop ${k} says where it sits: ${d.kick}`);
    expect(d.focus==='pTitle',`C${lab}: stop ${k} moves focus to its heading`);
    expect(['What happens at this stop','What you do','What I do for you, and why it matters','Documents and checks','Common questions','What is next'].every(h=>d.h2.includes(h)),`C${lab}: stop ${k} has every section: ${d.h2}`);
    expect(d.qa>=4&&d.qa<=6,`C${lab}: stop ${k} has ${d.qa} questions`);
    expect(d.lede.length>150,`C${lab}: stop ${k} has an opening paragraph`);
    expect(d.cta&&/Book an appraisal with me/.test(T)&&T.includes('027 562 7207'),`C${lab}: stop ${k} ends with the call to action`);
    expect(d.links.some(l=>l.startsWith('#journey|')),`C${lab}: stop ${k} links back to the map`);
    if(k<9) expect(d.links.some(l=>l.startsWith('#journey/'+SLUGS[k]+'|Next stop: '+TITLES[k])),`C${lab}: stop ${k} links on to stop ${k+1}: ${d.links}`); else expect(d.links.some(l=>l.startsWith('#journey/'+SLUGS[0]+'|')),`C${lab}: the last stop links back to the first`);
    if(k>1) expect(d.links.some(l=>l.startsWith('#journey/'+SLUGS[k-2]+'|Previous stop')),`C${lab}: stop ${k} links to the one before`);
    expect(d.dots.length===9&&d.cur===String(k),`C${lab}: the nine-stop strip is there and marks stop ${k}`);
    expect(!/[—–]/.test(T),`C${lab}: stop ${k} has no dashes`);
    expect(!/\$/.test(T)&&!/\d\s?%/.test(T),`C${lab}: stop ${k} has no prices or percentages`);
    expect(!OTHERS.test(T)&&!/quiet list|quiet listing|off-market|off market/i.test(T),`C${lab}: stop ${k} names no other agency and says nothing of Quiet Listings`);
    expect(!BAD.test(T),`C${lab}: stop ${k} makes no predictions or guarantees`);
    expect(!/commission/i.test(T)&&!/\bfee\b[^.]*\d/.test(T),`C${lab}: stop ${k} states no commission or fee figure`);
    expect(!/\byour home\b/i.test(T),`C${lab}: stop ${k} says your property`);
    expect(!(await sideways(p)),`C${lab}: stop ${k} has no sideways scroll at 390 px`);
    expect(dark?/^rgb\((2|1)\d?, ?\d+, ?\d+\)$/.test(d.bg)&&parseInt(d.bg.match(/\d+/)[0])<60:parseInt(d.bg.match(/\d+/)[0])>200,`C${lab}: stop ${k} follows ${lab} mode (${d.bg})`);
    const tight=await p.evaluate(()=>[...document.querySelectorAll('#main .card, #main .jcard')].filter(e=>e.scrollWidth>e.clientWidth+1).length); expect(tight===0,`C${lab}: stop ${k}: nothing is wider than its card`);
    if(k===1||k===3||k===4) await p.screenshot({path:path.join(__dirname,'out','pitch_stop'+k+'_'+lab+'_390.png'),fullPage:true});
    // facts: the content has what Tim asked for
    if(k===1) expect(/best price/.test(T)&&/reasons for moving/.test(T)&&/timing/.test(T)&&/defects/.test(T)&&/in person/.test(T)&&/opinion of value/.test(T)&&/reasoning/.test(T)&&/go ahead to a short questionnaire/.test(T),'C: stop 1 covers the visit, the opinion of value, price, reasons, timing and defects, and going on to the questionnaire');
    if(k===1) expect(!/only takes effect when you receive/.test(T),'C: the listing-before-appraisal rule is not on stop 1');
    if(k===1) expect(!/two of (the )?three/i.test(T),'C: stop 1 does not state the internal two of three rule');
    if(k===2) expect(/short questionnaire/.test(T)&&/updated plan/.test(T)&&/before any agreement/.test(T)&&/no pressure/.test(T),'C: stop 2 covers the questionnaire, the plan and no pressure');
    if(k===3) expect(/in person or by video/.test(T)&&/talk the plan through/.test(T)&&/only talk about my fee once you have decided who the best agent is for you/.test(T)&&/agreed with all of the owners and confirmed in writing/.test(T)&&/only takes effect when you receive the appraisal/.test(T)&&/cancel within 2 working days of receiving it, at no cost/.test(T)&&!/opinion of value/.test(T),'C: stop 3 covers the sit-down, the fee rule and the 2 working days, and the appraisal visit has moved to stop 1');
    if(k===4){ expect(/sole agency agreement/.test(T)&&/legal advice/.test(T)&&/review link to your lawyer/.test(T)&&/cooling-off period applies to residential agency agreements/.test(T)&&/cancellation notice/.test(T)&&/complaints and dispute resolution/i.test(T)&&/List Now/.test(T)&&/up front, in instalments, or have it taken at settlement/.test(T)&&/administration fee covers identity checks and other statutory onboarding costs/.test(T),'C: stop 4 covers the agreement facts');
      const g=await p.$$eval('#main .p-rea a',a=>a.map(x=>x.href)); expect(g.some(h=>/rea\.govt\.nz.*Agency-agreement-guide/.test(h))&&g.some(h=>/rea\.govt\.nz.*Sale-and-purchase/.test(h)),'C: stop 4 links the REA guides: '+g);
      const tr=await p.$$eval('#main .p-rea [data-rea-lang]',a=>a.map(x=>x.getAttribute('href')));
      expect(tr.some(h=>/rea-agency-agreement-guide-2022-mi\.pdf$/.test(h))&&tr.some(h=>/rea-agency-agreement-guide-2022-ko\.pdf$/.test(h))&&tr.some(h=>/rea-sale-purchase-guide-2022-zh\.pdf$/.test(h)),'C: stop 4 links the REA\'s own translations from guides.json: '+tr);
      expect(/not ours|not mine/.test(T),'C: the translations are said to be the Authority\'s own'); }
    if(k===5) expect(/AML\/CFT/.test(T)&&/in person/.test(T)&&/approved provider/.test(T)&&/trust or a company/.test(T)&&/kept securely, as the law requires/.test(T),'C: stop 5 covers the identity check');
    if(k===6) expect(/Vendor Declaration/.test(T)&&/countersign/.test(T)&&/Healthy Homes/.test(T)&&/Before you sell/.test(T)&&/LIM report is part of every campaign/.test(T)&&/preparing and presenting/.test(T),'C: stop 6 covers getting ready');
    if(k===7){ expect(/Digital, Premium and Elite/.test(T)&&/build your own/.test(T)&&/trusted suppliers/.test(T)&&/feedback after open homes/.test(T)&&/most likely to love/.test(T),'C: stop 7 covers the marketing');
      const pk=await p.$$eval('#main a',a=>a.map(x=>x.href)); expect(pk.includes('https://packages.dunnerstunner.co.nz/'),'C: stop 7 links to the packages site'); }
    if(k===8) expect(/firm, unconditional deal/.test(T)&&/settlement and possession/.test(T)&&/best price and (the best )?terms/.test(T)&&/guide to sale and purchase agreements/.test(T)&&/lawyers/.test(T),'C: stop 8 covers the offer and the two kinds of timing');
    if(k===9) expect(/unconditional/.test(T)&&/both lawyers/.test(T)&&/settlement and the keys/.test(T),'C: stop 9 covers settling');
  }
  // follow Next from the first stop to the last
  await openAt(p,'#journey/'+SLUGS[0]); const seen=[];
  for(let k=1;k<9;k++){ seen.push(await p.textContent('#pTitle')); await p.click('.p-next a.btn.primary'); await p.waitForTimeout(200); } seen.push(await p.textContent('#pTitle'));
  expect(JSON.stringify(seen)===JSON.stringify(TITLES),`C${lab}: Next stop walks the whole road: ${seen}`);
  // the map from the last page
  await p.click('.p-next a[href="#journey"]'); await p.waitForTimeout(250); expect(await p.textContent('#pTitle')==='Your selling journey',`C${lab}: Back to the map works`);
  // the map page itself, light and dark, with the map contrast
  await openAt(p,'#journey'); expect(!(await sideways(p)),`C${lab}: the map page fits 390 px`);
  const cr=await p.evaluate(()=>{ const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)}; const rgb=s=>(String(s).match(/[\d.]+/g)||[]).slice(0,3).map(Number); const cr=(a,b)=>{const A=lum(rgb(a))+.05,B=lum(rgb(b))+.05;return Math.max(A,B)/Math.min(A,B)};
    const bg=getComputedStyle(document.body).backgroundColor; const cs=(s,pr,root)=>{const e=(root||document).querySelector(s);return e?getComputedStyle(e)[pr]:null;};
    return [['title on page',cr(cs('.jstop .jt','fill'),bg)],['label text',cr(cs('.p-kick','color'),bg)],['lede',cr(cs('.pitch .lede','color'),bg)],['card text',cr(cs('.jcard p','color'),cs('.jcard','backgroundColor'))],['note text',cr(cs('.pitch-cta p','color'),cs('.pitch-cta','backgroundColor'))],['primary button',cr(cs('.pitch-cta a.btn.primary','color'),cs('.pitch-cta a.btn.primary','backgroundColor'))]].map(([n,v])=>({n,v:Math.round(v*100)/100})); });
  expect(cr.every(x=>x.v>=4.5),`C${lab}: contrast on the journey page: `+JSON.stringify(cr.filter(x=>x.v<4.5)));
  await p.screenshot({path:path.join(__dirname,'out','pitch_map_'+lab+'_390.png'),fullPage:true});
  await ctx.close(); }

// ---------- D. print: a clean leaflet, with Tim's details in plain text ----------
{ const {ctx,p}=await setup({guides:true}); await p.goto(URL); await seed(p,{});
  for(const [hash,name,maxPages] of [['#journey','map',4],['#journey/your-agreement','stop4',8]]){
    await openAt(p,hash); await p.emulateMedia({media:'print'});
    const pr=await p.evaluate(()=>{ const vis=s=>{const e=document.querySelector(s);return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;}; return {header:vis('header.top'),actions:vis('#actions'),buttons:[...document.querySelectorAll('#main .toolbar, #main .p-top, #main .p-dots, #main .p-crumb')].filter(e=>e.getBoundingClientRect().height>0).length,phead:vis('#main .phead'),h1:vis('#pTitle'),text:document.querySelector('#main').innerText,sc:document.documentElement.scrollWidth,iw:window.innerWidth}; });
    expect(!pr.header&&!pr.actions&&pr.buttons===0,'D: '+name+': print hides the app chrome and the buttons');
    expect(pr.phead&&pr.h1,'D: '+name+': print shows the McGuire heading and the page');
    expect(pr.text.includes('027 562 7207')&&pr.text.includes('tim@mcguire.co.nz')&&/Book an appraisal with me/.test(pr.text),'D: '+name+': Tim\'s details and the call to action print as plain text');
    expect(!/Queens Drive|Jane|@example/.test(pr.text),'D: '+name+': nothing personal in print');
    await p.pdf({path:path.join(__dirname,'out','pitch_'+name+'.pdf'),format:'A4',printBackground:true});
    const pdf=fs.readFileSync(path.join(__dirname,'out','pitch_'+name+'.pdf')).toString('latin1'); const pages=(pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length; out['pdf_'+name]=pages;
    expect(pages>=1&&pages<=maxPages,'D: '+name+': prints on a sensible number of A4 pages ('+pages+')');
    await p.emulateMedia({media:'screen'}); }
  await ctx.close(); }

// ---------- E. a signed-in vendor: the same pages with "You are here", reading only what the journey panel reads ----------
const JANE=['v-jane','jane@example.com'];
const world=(stage,o)=>{ o=o||{}; const ver=o.verified?'2026-11-02T00:00:00Z':null, sg=o.signed?'2026-11-02T00:00:00Z':null;
  const w={properties:[prop('PR1','12 Test Street, Dunedin',stage)],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane')],agreements:[ag('A1','PR1',o.ag||'sent')],agreement_people:[aperson('P1','A1',1,'Jane Smith','jane@example.com','v-jane',sg,ver),aperson('P2','A1',2,'Rob Smith','rob@example.com','v-rob',sg,ver)]};
  if(o.step!=null) w.agreements[0].answers._step=o.step; return w; };
{ const {ctx,p}=await setup({guides:true}); await p.goto(URL);
  // what the panel reads (for comparison)
  await seed(p,world('agreement')); await openAt(p,'',JANE); await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(300);
  const panelCalls=await calls(p); const panelFrom=new Set(panelCalls.filter(x=>x.startsWith('from:')));
  await seed(p,world('agreement')); await openAt(p,'#journey',JANE);
  const c=await calls(p); out.eCalls=[...new Set(c)];
  expect(c.filter(x=>x.startsWith('from:')).every(x=>panelFrom.has(x)),'E: the journey page reads only the tables the panel reads: '+[...new Set(c)].filter(x=>x.startsWith('from:')&&!panelFrom.has(x)));
  expect(!c.some(x=>/^fn:/.test(x))&&!c.some(x=>/^from:(aml|agreement_events|email_log|lawyer_links|signatures|property_documents|property_people)/.test(x)&&!panelFrom.has(x)),'E: no functions called and no private records read beyond the panel');
  const i=await p.evaluate(()=>{ const q=s=>[...document.querySelectorAll('#main '+s)].map(e=>+e.dataset.j); return {here:q('.jstop.here'),done:q('.jstop.done'),ahead:q('.jstop.ahead'),pill:(document.querySelector('#main .pill-t')||{}).textContent,addr:(document.querySelector('#main .jaddr')||{}).textContent,aria:document.querySelector('#main .jcard[aria-current="step"]')?document.querySelector('#main .jcard[aria-current="step"] h3').textContent:null}; });
  expect(i.here.length===1&&i.here[0]===4&&JSON.stringify(i.done)==='[1,2,3]'&&i.ahead.length===5,'E: the marker is at stop 4 with 1 to 3 ticked: '+JSON.stringify(i));
  expect(i.pill==='You are here'&&i.aria==='Your agreement','E: it says You are here, and the card is the current step');
  expect(i.addr==='12 Test Street, Dunedin','E: the vendor sees their own address');
  expect(!(await sideways(p)),'E: fits 390 px with the marker');
  expect(!(await p.isVisible('#journeyBtn')),'E: the Journey button is hidden on the journey page itself');
  expect(await p.isVisible('[data-psign]')&&/Go to your page/.test(await p.textContent('[data-psign]')),'E: a way back to their own page');
  // the stop's page says where they are, and offers Go to this step only where there is a page
  await p.click('#main .jcard a[href="#journey/your-agreement"]'); await p.waitForTimeout(300);
  expect(/You are here/.test(await p.textContent('.p-state'))&&await p.isVisible('[data-pgo="4"]')&&/Go to this step/.test(await p.textContent('[data-pgo="4"]')),'E: stop 4 shows You are here and Go to this step');
  await p.goto('about:blank'); await p.goto(URL+'#journey/on-the-market'); await p.waitForTimeout(600);
  expect(!(await p.$('[data-pgo]')),'E: a stop with no page for the vendor (on the market) has no Go to this step');
  await p.goto('about:blank'); await p.goto(URL+'#journey/identity-check'); await p.waitForTimeout(600);
  expect(!(await p.$('[data-pgo]')),'E: the identity stop has no button for someone who has not reached it (the step-skipping guard)');
  await p.goto('about:blank'); await p.goto(URL+'#journey/getting-ready'); await p.waitForTimeout(600);
  expect(!(await p.$('[data-pgo]')),'E: getting ready has no button before signing');
  // Go to this step goes to the real page, and the journey address goes with it
  await p.goto('about:blank'); await p.goto(URL+'#journey/your-agreement'); await p.waitForTimeout(600); await p.click('[data-pgo="4"]'); await p.waitForTimeout(700);
  expect(await p.evaluate(()=>location.hash)===''&&!(await p.$('#pTitle'))&&await p.isVisible('#journeyBtn')&&await p.title()==='Your agency agreement · McGuire Real Estate','E: Go to this step opens the agreement and leaves the journey page: '+await p.textContent('main h1'));
  await p.goto(URL);
  // the guard lets the identity stop through once the vendor has reached it
  await seed(p,world('agreement',{step:8})); await openAt(p,'#journey/identity-check',JANE);
  await p.waitForSelector('[data-pgo="5"]',{timeout:4000}).catch(()=>{}); expect(await p.isVisible('[data-pgo="5"]'),'E: once the vendor has reached the identity step, the button is offered');
  await seed(p,world('signed',{ag:'signed',signed:true,verified:true})); await openAt(p,'#journey/getting-ready',JANE);
  expect(await p.isVisible('[data-pgo="6"]')&&/You are here/.test(await p.textContent('.p-state')),'E: after signing and identity checks, getting ready is the current step and has its button');
  await p.click('[data-pgo="6"]'); await p.waitForTimeout(700); expect(!(await p.$('#pTitle')),'E: and the button opens their paperwork');
  // withdrawn: no marker, whole road
  await seed(p,world('withdrawn',{ag:'sent'})); await openAt(p,'#journey',JANE);
  expect(await p.evaluate(()=>document.querySelectorAll('#main .jstop.plain').length)===9,'E: a withdrawn property shows the whole road with no marker');
  // two properties: choose, then the marker
  const w2=world('agreement'); w2.properties.push(prop('PR2','9 Other Road, Dunedin','plan')); w2.property_people.push(pperson('PP2','PR2','Jane Smith','jane@example.com','v-jane')); w2.prelistings=[{id:'L2',property_id:'PR2',address:'9 Other Road, Dunedin',contact_name:'Jane Smith',contact_email:'jane@example.com',status:'submitted',appraisal:{method:'Auction',price:'',start:'',marketing:'',note:''},answers:{},plan:{pairs:[]},created_at:T0,updated_at:T0,user_id:'v-jane'}];
  await seed(p,w2); await openAt(p,'#journey',JANE);
  expect(await p.isVisible('#pChoose')&&await p.evaluate(()=>document.querySelectorAll('#main .jstop.plain').length)===9,'E: with two properties, the vendor chooses first and no marker is guessed');
  await p.click('[data-ppick="PR2"]'); await p.waitForTimeout(500);
  expect(await p.evaluate(()=>document.querySelectorAll('#main .jstop.here').length)===1&&/9 Other Road/.test(await p.textContent('.jaddr')),'E: after choosing, the marker and address are that property\'s');
  await ctx.close(); }

// ---------- F. the vendor's panel: Read more on every stop, and the old behaviour intact ----------
{ const {ctx,p}=await setup({guides:true}); await p.goto(URL);
  await seed(p,world('agreement')); await openAt(p,'',JANE); await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(300);
  const i=await p.evaluate(()=>({here:[...document.querySelectorAll('#journey .jstop.here')].map(e=>+e.dataset.j),more:[...document.querySelectorAll('#journey a[data-jmore]')].length,go:[...document.querySelectorAll('#journey .jgo')].map(b=>b.dataset.jgo),text:document.querySelector('#journey').innerText}));
  expect(JSON.stringify(i.here)==='[4]'&&i.more===9&&i.go.includes('4'),'F: the panel still shows You are here and its own buttons, and now Read more on all nine: '+JSON.stringify({here:i.here,more:i.more,go:i.go}));
  expect(!/including his fee/.test(i.text),'F: the panel does not mention his fee');
  expect(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth||document.querySelector('#journey').scrollWidth>document.querySelector('#journey').clientWidth)),'F: the panel with Read more still fits 390 px');
  // print of the panel hides the new links
  await p.emulateMedia({media:'print'}); expect(await p.evaluate(()=>[...document.querySelectorAll('#journey a[data-jmore]')].every(a=>getComputedStyle(a.closest('.toolbar')).display==='none')),'F: Read more does not print in the panel leaflet'); await p.emulateMedia({media:'screen'});
  // Read more on a stop opens that stop's page with the vendor's marker
  await p.click('#journey a[data-jmore="3"]'); await p.waitForTimeout(600);
  expect(await p.textContent('#pTitle')==='Meeting Tim'&&/Done/.test(await p.textContent('.p-state')),'F: Read more opens the stop page, which knows this vendor has finished stop 3');
  // unsaved typing is protected: a confirm appears and Cancel stays
  await seed(p,{}); await openAt(p,''); await p.fill('#loginEmail','a@b.co'); await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap');
  let asked=0; p.once('dialog',d=>{asked++; d.dismiss();}); await p.click('#journey a[data-jmore="2"]'); await p.waitForTimeout(300);
  expect(asked===1&&!(await p.$('#pTitle')),'F: with something typed and unsaved, Read more asks first, and Cancel stays put');
  await ctx.close(); }

// ---------- G. Tim opens the link: the public view, no vendor data ----------
{ const {ctx,p}=await setup({guides:true}); await p.goto(URL);
  await seed(p,world('agreement')); await openAt(p,'#journey',['agent-1','hello@timmcguire.co.nz']);
  const c=await calls(p); expect(!c.some(x=>/^from:/.test(x)),'G: Tim opening the link reads no property data: '+JSON.stringify(c));
  expect(await p.textContent('#pTitle')==='Your selling journey'&&await p.evaluate(()=>document.querySelectorAll('#main .jstop.plain').length)===9,'G: Tim sees the same public map');
  expect(await p.isVisible('#agentNav'),'G: and keeps his own navigation');
  await ctx.close(); }

// ---------- H. no translation files on the server: the page still works ----------
{ const {ctx,p}=await setup({guides:false}); await p.goto(URL); await seed(p,{}); await openAt(p,'#journey/your-agreement');
  expect(await p.$$eval('#main .p-rea a',a=>a.length)===2&&(await p.$$('#main .p-rea [data-rea-lang]')).length===0&&await p.textContent('#pTitle')==='Your agreement','H: with no guides list, the two REA guide links still work and nothing breaks');
  await ctx.close(); }

await b.close();
console.log(JSON.stringify({out,fail,errs:errs.concat(fail.map(x=>'FAILED: '+x))},null,1));
})();
