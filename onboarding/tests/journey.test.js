// Phase 3: the journey map. A nine-stop selling pathway drawn as one inline SVG, opened from a Journey button in the
// vendor's top bar (a panel over the current screen), and shown to Tim as a "Where are they" tile on each property.
// Checks: it fits a phone (390 px) in light and dark mode, the marker follows the property's stage and what the vendor
// has done, every stop links to a real page or explains itself, the button is on every vendor screen, a person set aside
// sees nothing, the print version has no personal data unless the vendor is signed in, and colours keep their contrast.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(path.join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const URL='https://packages.dunnerstunner.co.nz/onboarding/';
(async()=>{
const b=await chromium.launch(); const errs=[], fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); }; const out={};
async function setup(w){
  const ctx=await b.newContext({viewport:{width:w||390,height:844}});
  await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  return {ctx,p};
}
const T0='2026-11-01T00:00:00Z';
const prop=(id,address,stage,extra)=>Object.assign({id,address,title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},stage,stage_at:T0,created_at:T0,updated_at:T0},extra||{});
const pperson=(id,pid,name,email,user,role)=>({id,property_id:pid,position:1,legal_name:name,pref_name:'',email,phone:'',user_id:user||null,role:role||'owner',source:'agent',name_from:'agent'});
const ag=(id,pid,status,extra)=>Object.assign({id,ref:'MRE-2026-'+id,address:'x',property_id:pid,status,config:{appr:'done',ask:'875000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual',approach:'invited'},answers:{_step:7,capacity:'Owners',titleOk:true,gst:'no',pType:'House',work:'no',wt:'no',meth:'no',def:'no',guide:['0','1','2','3','4','5','6','7'],prior:'none'},legal:{choice:'have'},agreement_version:'v3.15-26102026',created_at:T0},extra||{});
const aperson=(id,a,pos,name,email,user,signed,verified)=>({id,agreement_id:a,position:pos,legal_name:name,pref_name:'',email,phone:'',user_id:user,signed_at:signed||null,id_verified_at:verified||null});
const pl=(id,pid,status,email,extra)=>Object.assign({id,property_id:pid,address:'x',contact_name:'Jane Smith',contact_email:email,status,appraisal:{method:'Auction',price:'$850,000',start:'',marketing:'',note:''},answers:{},plan:{pairs:[]},created_at:T0,updated_at:T0},extra||{});
const BASE={agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[],properties:[],property_people:[],property_documents:[]};
const seed=(p,db)=>p.evaluate(db=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify(db));},Object.assign({},BASE,db));
const login=async(p,id,email)=>{await p.evaluate(([id,email])=>localStorage.setItem('mocksession',JSON.stringify({user:{id,email}})),[id,email]); await p.goto(URL); await p.waitForTimeout(700);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
const edit=(p,fn)=>p.evaluate(s=>{const d=JSON.parse(localStorage.getItem('mockdb')); (new Function('d',s))(d); localStorage.setItem('mockdb',JSON.stringify(d));},fn);
const reload=async p=>{await p.reload(); await p.waitForTimeout(700);};
const openJ=async p=>{ await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(250); };
const closeJ=async p=>{ await p.click('#jClose'); await p.waitForTimeout(150); };
const info=p=>p.evaluate(()=>{ const q=s=>[...document.querySelectorAll('#journey '+s)].map(e=>+e.dataset.j); const ov=document.querySelector('#journey'); const t=document.querySelector('#journey svg.jmap');
  return {here:q('.jstop.here'),done:q('.jstop.done'),ahead:q('.jstop.ahead'),plain:q('.jstop.plain'),ticks:document.querySelectorAll('#journey .tick-b').length,
    pageSide:document.documentElement.scrollWidth>window.innerWidth, ovSide:ov.scrollWidth>ov.clientWidth, svgW:Math.round(t.getBoundingClientRect().width), text:ov.innerText}; });
const sideways=p=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
const BAD=/\b(will probably|probably|likely to|expected to|you should expect|within \d+ (days|weeks|months)|in \d+ (days|weeks)|guarantee)/i;

// contrast helpers (WCAG): text 4.5, drawn shapes 3
const CONTRAST=`window.__cr=(()=>{const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
 const rgb=s=>(String(s).match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
 const cr=(a,b)=>{const A=lum(rgb(a))+.05,B=lum(rgb(b))+.05;return Math.max(A,B)/Math.min(A,B)};
 const cs=(s,pr,root)=>{const e=(root||document).querySelector(s); if(!e) return null; return getComputedStyle(e)[pr];};
 const ov='#journey'; const bg=cs(ov,'backgroundColor');
 return [['pill text on pill',cr(cs('.jstop.here .pill-t','fill'),cs('.jstop.here .pill-b','fill')),4.5],
  ['here title on page',cr(cs('.jstop.here .jt','fill'),bg),4.5],['done label on page',cr(cs('.jstop.done .js','fill'),bg),4.5],
  ['ahead title on page',cr(cs('.jstop.ahead .jt','fill'),bg),4.5],['ahead label on page',cr(cs('.jstop.ahead .js','fill'),bg),4.5],
  ['tick on its badge',cr(cs('.tick-m','stroke'),cs('.tick-b','fill')),3],['ahead outline on page',cr(cs('.jstop.ahead .node','stroke'),bg),3],
  ['here outline on page',cr(cs('.jstop.here .node','stroke'),bg),3],
  ['here tag',cr(cs('.jcard.here .jc-st','color'),cs('.jcard.here .jc-st','backgroundColor')),4.5],['here number',cr(cs('.jcard.here .jc-n','color'),cs('.jcard.here .jc-n','backgroundColor')),4.5],
  ['done tag',cr(cs('.jcard.done .jc-st','color'),cs('.jcard.done .jc-st','backgroundColor')),4.5],['done number',cr(cs('.jcard.done .jc-n','color'),cs('.jcard.done .jc-n','backgroundColor')),4.5],
  ['ahead heading on card',cr(cs('.jcard.ahead h3','color'),cs('.jcard.ahead','backgroundColor')),4.5],['ahead text on card',cr(cs('.jcard.ahead p','color'),cs('.jcard.ahead','backgroundColor')),4.5],
  ['card text on card',cr(cs('.jcard.here p','color'),cs('.jcard.here','backgroundColor')),4.5]].map(([n,v,min])=>({n,v:v&&Math.round(v*100)/100,min}));})()`;
const contrast=async(p)=>{ const r=await p.evaluate(CONTRAST); return r; };
const lowContrast=r=>r.filter(x=>x.v===null||x.v<x.min).map(x=>x.n+' '+x.v+'<'+x.min);

// ---------- A. signed out: the button is on the sign-in page; the map is the same road for everyone, with nothing personal ----------
{ const {ctx,p}=await setup();
  await p.goto(URL); await p.waitForTimeout(600);
  expect(await p.isVisible('#journeyBtn'),'A: the Journey button is on the sign-in page');
  expect(!(await sideways(p)),'A: the sign-in page with the button fits at 390');
  await p.focus('#journeyBtn'); await p.keyboard.press('Enter'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(250);
  const i=await info(p); out.aSignedOut={stops:i.plain.length,here:i.here.length,svgW:i.svgW};
  expect(i.plain.length===9&&!i.here.length&&!i.done.length&&!i.ahead.length,'A: signed out shows the nine stops with no marker and no ticks');
  expect(!i.pageSide&&!i.ovSide,'A: the map fits 390 without sideways scroll');
  expect(i.svgW>=330&&i.svgW<=362,'A: the map uses the phone width (got '+i.svgW+')');
  expect(await p.evaluate(()=>document.activeElement&&document.activeElement.id==='jTitle'),'A: focus moves to the panel heading when it opens');
  expect(await p.evaluate(()=>document.querySelector('#main').inert&&document.querySelector('#journey').getAttribute('aria-modal')==='true'),'A: the screen behind is inert while the panel is open');
  expect(!BAD.test(i.text),'A: no predictions or timeframes in the wording');
  expect(!/—|–/.test(i.text),'A: no dashes used as em dashes in the wording');
  expect(await p.evaluate(()=>[...document.querySelectorAll('#journey .jstop')].every(e=>e.getAttribute('aria-label')&&e.getAttribute('tabindex')==='0')),'A: every stop is keyboard reachable and labelled');
  expect(await p.evaluate(()=>!!document.querySelector('#journey svg title')),'A: the drawing has a title');
  await p.screenshot({path:path.join(__dirname,'out','journey_a_signedout_390.png'),fullPage:false});
  // keyboard: a stop with no page explains itself
  await p.focus('.jstop[data-j="7"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  expect(await p.evaluate(()=>document.activeElement&&document.activeElement.id==='jcv-7'),'A: Enter on a stop with no page moves to its explanation');
  await p.focus('.jstop[data-j="8"]'); await p.keyboard.press('Space'); await p.waitForTimeout(300);
  expect(await p.evaluate(()=>document.activeElement&&document.activeElement.id==='jcv-8'),'A: Space works too');
  // print version, signed out: A4 leaflet, nothing personal
  await p.emulateMedia({media:'print'});
  const pr=await p.evaluate(()=>{ const vis=s=>{const e=document.querySelector(s); return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;}; const svg=document.querySelector('#journey svg.jmap').getBoundingClientRect();
    return {header:vis('header.top'),main:vis('main'),actions:vis('#actions'),close:vis('#jClose'),jhead:vis('#journey .jhead'),stops:vis('.jcard'),svgMm:Math.round(svg.width/96*25.4),text:document.querySelector('#journey').innerText,pos:getComputedStyle(document.querySelector('#journey')).position}; });
  out.aPrint=Object.assign({},pr,{text:undefined});
  expect(!pr.header&&!pr.main&&!pr.actions&&!pr.close,'A: print hides the app chrome and the buttons');
  expect(pr.jhead&&pr.stops&&pr.pos==='static','A: print shows the leaflet heading and the stops, flowing across pages');
  expect(pr.svgMm>=60&&pr.svgMm<=80,'A: the printed map is about 74 mm wide on A4 (got '+pr.svgMm+' mm)');
  expect(!/Street|Road|@|\d{3} \d{3}/.test(pr.text.replace(/027 562 7207/g,'')),'A: the signed-out print has no address, email or personal number');
  await p.pdf({path:path.join(__dirname,'out','journey_print_signedout.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
  const pdf=fs.readFileSync(path.join(__dirname,'out','journey_print_signedout.pdf')).toString('latin1'); const pages=(pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length; out.aPdfPages=pages;
  expect(pages===1,'A: the leaflet is one A4 page (got '+pages+')');
  await p.emulateMedia({media:'screen'});
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden&&document.activeElement.id==='journeyBtn'&&!document.querySelector('#main').inert),'A: Escape closes the panel and returns focus to the Journey button');
  await ctx.close(); }

// ---------- B. the marker follows the property's stage, and what the vendor has done ----------
const JANE=['v-jane','jane@example.com'];
const world=(stage,o)=>{ o=o||{}; const w=world0(stage,o); if(o.step!=null) w.agreements[0].answers._step=o.step; return w; };
const world0=(stage,o)=>{ const ver=o.verified?'2026-11-02T00:00:00Z':null, sg=o.signed?'2026-11-02T00:00:00Z':null;
  return {properties:[prop('PR1','12 Test Street, Dunedin',stage)],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane')],
    agreements:[ag('A1','PR1',o.ag||'sent')],agreement_people:[aperson('P1','A1',1,'Jane Smith','jane@example.com','v-jane',sg,ver),aperson('P2','A1',2,'Rob Smith','rob@example.com','v-rob',sg,o.half?null:ver)]}; };
{ const {ctx,p}=await setup();
  await p.goto(URL);
  const cases=[ // stage, opts, here, expected done
    ['appraisal',{},1,[]],['questionnaire',{},1,[]],['plan',{},2,[1]],['accepted',{},3,[1,2]],['agreement',{},4,[1,2,3]],
    ['agreement',{verified:true},4,[1,2,3,5]],   // identity done early: ticked, but the marker is still at the agreement
    ['signed',{ag:'signed',signed:true},5,[1,2,3,4]],['signed',{ag:'signed',signed:true,half:true,verified:true},5,[1,2,3,4]],['signed',{ag:'signed',signed:true,verified:true},6,[1,2,3,4,5]],
    ['live',{ag:'countersigned',signed:true,verified:true},7,[1,2,3,4,5,6]],['under_offer',{ag:'countersigned',signed:true,verified:true},8,[1,2,3,4,5,6,7]],
    ['sold',{ag:'countersigned',signed:true,verified:true},9,[1,2,3,4,5,6,7,8]],
    ['settled',{ag:'countersigned',signed:true,verified:true},0,[1,2,3,4,5,6,7,8,9]],['withdrawn',{ag:'sent'},0,[]]];
  const seen=[];
  for(const [stage,o,here,done] of cases){
    await seed(p,world(stage,o)); await login(p,...JANE);
    await openJ(p); const i=await info(p); const tag=stage+(o.verified?'+id':'')+(o.half?'+half':'');
    seen.push(tag+'=>'+(i.here[0]||'-')+'/'+i.done.join(''));
    expect(here? (i.here.length===1&&i.here[0]===here) : i.here.length===0, `B: ${tag}: marker at ${here||'none'} (got ${i.here})`);
    expect(JSON.stringify(i.done)===JSON.stringify(done),`B: ${tag}: ticked ${done} (got ${i.done})`);
    expect(i.ticks===done.length,`B: ${tag}: one drawn tick per done stop`);
    const total=i.here.length+i.done.length+i.ahead.length+i.plain.length; expect(total===9,`B: ${tag}: all nine stops are drawn`);
    if(stage==='withdrawn') expect(i.plain.length===9&&/not on the selling road/.test(i.text),'B: withdrawn shows the plain road and a gentle line, no marker');
    if(stage==='settled') expect(/every stop/.test(i.text),'B: settled says the journey is complete');
    if(here) expect(i.ahead.length===9-here-done.filter(d=>d>here).length,`B: ${tag}: stops ahead are drawn quietly`);
    expect(i.text.includes('12 Test Street'),`B: ${tag}: the vendor sees their own property's address`);
    expect(!i.pageSide&&!i.ovSide,`B: ${tag}: fits 390 without sideways scroll`);
    expect(!BAD.test(i.text),`B: ${tag}: no predictions or timeframes`);
    await closeJ(p);
  }
  out.stages=seen;
  // identity and paperwork facts appear on their stops
  await seed(p,world('signed',{ag:'signed',signed:true,half:true,verified:true})); await login(p,...JANE); await openJ(p);
  let t=await p.textContent('#jcv-5'); expect(/1 of 2 checked/.test(t),'B: the identity stop says how many are checked');
  expect(/Signed by everyone/.test(await p.textContent('#jcv-4')),'B: the agreement stop says it is signed');
  expect(/Paperwork: 0 of 1 done/.test(await p.textContent('#jcv-6')),'B: the getting ready stop counts the paperwork');
  await ctx.close(); }

// ---------- C. every stop links to a real page or explains itself ----------
{ const {ctx,p}=await setup();
  await p.goto(URL);
  // C1. an agreement waiting to be signed, saved at the identity step: stops 1 to 5 have pages, 6 to 9 explain
  const w=world('agreement',{step:8}); w.prelistings=[pl('L1','PR1','accepted','jane@example.com',{agreement_id:'A1'})];
  await seed(p,w); await login(p,...JANE); await openJ(p);
  const rows=await p.evaluate(()=>[...Array(9)].map((_,i)=>{ const k=i+1; const stop=document.querySelector(`#journey .jstop[data-j="${k}"]`), card=document.querySelector(`#jcv-${k}`); const go=card.querySelector('[data-jgo]'); const txt=card.querySelector('p').textContent;
    return {k,role:stop.getAttribute('role'),go:!!go,goText:go&&go.textContent,explain:txt.length>40,vis:card.getBoundingClientRect().height>0}; }));
  out.links=rows.map(r=>r.k+':'+(r.go?'page':'explains'));
  rows.forEach(r=>{ expect(r.go||r.explain,'C1: stop '+r.k+' links to a page or explains itself'); expect(r.vis,'C1: stop '+r.k+' is drawn as a card'); expect(r.go===(r.role==='link'),'C1: stop '+r.k+' is a link only when it has a page'); });
  expect([1,2,3,4,5].every(k=>rows[k-1].go)&&[6,7,8,9].every(k=>!rows[k-1].go),'C1: pages for stops 1 to 5 now; stops 6 to 9 explain (got '+out.links+')');
  for(const k of [7,8,9]){ expect(/There is no page for this stop yet/.test(await p.textContent('#jcv-'+k)),'C1: stop '+k+' says plainly there is no page yet'); }
  // a stop with no page: tapping it keeps the panel open and shows its explanation, no dead link
  await p.click('#journey .jstop[data-j="9"]'); await p.waitForTimeout(400);
  expect(await p.evaluate(()=>!document.querySelector('#journey').hidden&&document.activeElement.id==='jcv-9'&&document.activeElement.getBoundingClientRect().top>=0),'C1: tapping a stop with no page shows its explanation');
  // stop 5: the identity check page (the vendor is already on it, so the panel just closes)
  await p.click('#journey .jstop[data-j="5"]'); await p.waitForTimeout(700);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden),'C1: following a link closes the panel');
  out.c5=await p.textContent('main h1'); expect(out.c5==='Verify your identity','C1: the identity stop is the identity check ('+out.c5+')');
  expect(await p.isVisible('#journeyBtn'),'C1: the Journey button is still there on the identity screen');
  // stop 4: the agreement, where they already are
  await openJ(p); await p.click('#jcv-4 [data-jgo]'); await p.waitForTimeout(700);
  out.c4=await p.textContent('main h1'); expect(out.c4==='Verify your identity','C1: the agreement stop leaves a vendor already in the agreement where they are ('+out.c4+')');
  // stops 1 to 3: the pre-listing page
  await openJ(p); await p.click('#journey .jstop[data-j="2"]'); await p.waitForTimeout(700);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden),'C1: stop 2 opens its page');
  // C2. a plan waiting for the vendor: stop 2 opens the plan itself
  const w2={properties:[prop('PR1','12 Test Street, Dunedin','plan')],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane')],prelistings:[pl('L1','PR1','plan','jane@example.com',{plan:{intro:'Here is the plan',pairs:[]}})]};
  await seed(p,w2); await login(p,...JANE);
  expect(await p.textContent('main h1')==='Your updated plan','C2: vendor lands on the plan');
  await openJ(p); let i=await info(p); expect(i.here[0]===2,'C2: the marker is at the updated plan');
  const g=await p.evaluate(()=>[1,2,3,4,5,6,7,8,9].map(k=>!!document.querySelector(`#jcv-${k} [data-jgo]`)));
  expect(JSON.stringify(g)===JSON.stringify([true,true,true,false,false,false,false,false,false]),'C2: only stops 1 to 3 have pages before an agreement exists (got '+g+')');
  await p.click('#journey .jstop[data-j="2"]'); await p.waitForTimeout(500);
  expect(await p.textContent('main h1')==='Your updated plan','C2: stop 2 opens the plan');
  // C3. signed: the paperwork stop links to the paperwork tiles; the identity stop explains
  await seed(p,world('signed',{ag:'signed',signed:true,verified:true})); await login(p,...JANE); await openJ(p);
  const g3=await p.evaluate(()=>[1,2,3,4,5,6,7,8,9].map(k=>!!document.querySelector(`#jcv-${k} [data-jgo]`)));
  expect(JSON.stringify(g3)===JSON.stringify([false,false,false,true,false,true,false,false,false]),'C3: signed: agreement and paperwork have pages (got '+g3+')');
  await p.click('#jcv-6 [data-jgo]'); await p.waitForTimeout(700);
  expect(/you're all signed/.test(await p.textContent('main h1')) && !!(await p.$('.ptile')),'C3: the paperwork stop opens the signed page with the paperwork tiles');
  await ctx.close(); }

// ---------- D. the Journey button is on every vendor screen, and Tim does not get it ----------
{ const {ctx,p}=await setup();
  await p.goto(URL);
  const btnOk=async(label)=>{ const r=await p.evaluate(()=>{ const e=document.querySelector('#journeyBtn'); if(!e||e.hidden) return null; const b=e.getBoundingClientRect(); return {right:Math.round(b.right),w:window.innerWidth,h:Math.round(b.height),side:document.documentElement.scrollWidth>window.innerWidth,sign:(()=>{const s=document.querySelector('#signOut').getBoundingClientRect();return Math.round(s.right)})()}; });
    expect(!!r&&r.right<=r.w&&!r.side,'D: '+label+': the Journey button is in the top bar and fits (got '+JSON.stringify(r)+')'); expect(!r||r.h>=26,'D: '+label+': the button is a decent size to tap'); return r; };
  // agreement screens
  const w=world('agreement',{}); w.prelistings=[pl('L1','PR1','accepted','jane@example.com',{agreement_id:'A1'})]; w.agreements[0].answers._step=0;
  await seed(p,w); await login(p,...JANE);
  await btnOk('agreement welcome');
  await p.click('#next'); await p.waitForTimeout(300); await btnOk('agreement step 1');
  // the step count moves into the step name on phones, so nothing is lost
  out.stepName=await p.textContent('#stepName'); expect(/Step 1 of 9/.test(out.stepName)||/Step 1 of/.test(await p.evaluate(()=>getComputedStyle(document.querySelector('#stepName'),'::after').content)),'D: the step count is still shown on a phone');
  // signed: done page, Before you sell, and a form
  await seed(p,world('signed',{ag:'signed',signed:true,verified:true})); await login(p,...JANE); await btnOk('signed page');
  // pre-listing screens
  await seed(p,{properties:[prop('PR1','12 Test Street, Dunedin','appraisal')],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane')],prelistings:[pl('L1','PR1','appraisal','jane@example.com')]});
  await login(p,...JANE); await btnOk('appraisal page'); await p.click('#next'); await p.waitForTimeout(300); await btnOk('questionnaire');
  // a vendor with two properties: the home list
  await seed(p,{properties:[prop('PR1','12 Test Street, Dunedin','plan'),prop('PR2','7 Other Road, Dunedin','agreement')],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane'),pperson('PP2','PR2','Jane Smith','jane@example.com','v-jane')],
    prelistings:[pl('L1','PR1','plan','jane@example.com')],agreements:[ag('A2','PR2','sent')],agreement_people:[aperson('P9','A2',1,'Jane Smith','jane@example.com','v-jane')]});
  await login(p,...JANE); expect(await p.textContent('main h1')==='Your properties','D: two properties show the list'); await btnOk('home list');
  // with two properties the panel asks which one, and then shows that one
  await openJ(p); expect(await p.isVisible('#jChoose'),'D: with two properties the panel asks which one');
  let i=await info(p); expect(!i.here.length&&i.plain.length===9,'D: nothing is marked until a property is chosen');
  await p.click('[data-jpick="PR2"]'); await p.waitForTimeout(400); i=await info(p);
  expect(i.here[0]===4&&/7 Other Road/.test(i.text)&&!/12 Test Street/.test(i.text),'D: choosing a property shows that property only');
  await closeJ(p);
  // Tim has the nav, not this button
  await seed(p,{}); await login(p,'agent-1','hello@timmcguire.co.nz');
  expect(!(await p.isVisible('#journeyBtn')),'D: Tim does not get the vendor Journey button');
  await ctx.close(); }

// ---------- E. a person set aside sees nothing; a current owner sees only their own property ----------
{ const {ctx,p}=await setup();
  await p.goto(URL);
  await seed(p,{properties:[prop('PR9','99 Secret Street, Dunedin','live')],property_people:[pperson('PX','PR9','Old Owner','old@example.com','v-old','former'),pperson('PY','PR9','New Owner','new@example.com','v-new')]});
  await login(p,'v-old','old@example.com'); await openJ(p); let i=await info(p);
  expect(!/Secret Street/.test(i.text)&&!i.here.length&&!i.done.length&&i.plain.length===9,'E: a former owner sees no property, no marker and no ticks');
  const sel=await p.evaluate(async()=>{const c=window.supabase.createClient(); const a=await c.from('properties').select('*'); const b=await c.from('property_people').select('*'); return [(a.data||[]).length,(b.data||[]).length];});
  expect(sel[0]===0&&sel[1]===0,'E: the database refuses a former owner (the mock applies the live rules: property party, and role former hidden): '+sel);
  await closeJ(p);
  await login(p,'v-new','new@example.com'); await openJ(p); i=await info(p);
  expect(i.here[0]===7&&/Secret Street/.test(i.text),'E: the current owner sees their property at its stage');
  await closeJ(p);
  // someone with no connection at all
  await login(p,'v-nobody','nobody@example.com'); await openJ(p); i=await info(p);
  expect(!/Secret Street/.test(i.text)&&!i.here.length,'E: someone with no property sees the plain road');
  await ctx.close(); }

// ---------- F. dark mode and light mode: fits, reads, and keeps its contrast ----------
{ for(const scheme of ['light','dark']){
    const {ctx,p}=await setup(); await p.emulateMedia({colorScheme:scheme});
    await p.goto(URL); await seed(p,world('agreement',{verified:true})); await login(p,...JANE); await openJ(p);
    const i=await info(p); expect(!i.pageSide&&!i.ovSide,'F: '+scheme+': fits 390');
    expect(JSON.stringify(i.done)==='[1,2,3,5]'&&i.here[0]===4&&i.ahead.length===4,'F: '+scheme+': done, here and ahead all present');
    const bg=await p.evaluate(()=>getComputedStyle(document.querySelector('#journey')).backgroundColor); const dark=bg.match(/\d+/g).map(Number).reduce((a,c)=>a+c,0)<200;
    expect(dark===(scheme==='dark'),'F: '+scheme+': the panel follows the colour scheme (bg '+bg+')');
    const r=await contrast(p); out['contrast_'+scheme]=r.map(x=>x.n+'='+x.v).join('; '); const low=lowContrast(r); expect(!low.length,'F: '+scheme+': contrast is enough: '+low.join(', '));
    await p.screenshot({path:path.join(__dirname,'out','journey_f_'+scheme+'_390_top.png')});
    await p.evaluate(()=>{const o=document.querySelector('#journey'); o.scrollTop=520;}); await p.waitForTimeout(150);
    await p.screenshot({path:path.join(__dirname,'out','journey_f_'+scheme+'_390_mid.png')});
    // the whole drawing and the whole list
    const h=await p.evaluate(()=>document.querySelector('#journey').scrollHeight); await p.setViewportSize({width:390,height:Math.min(h,6000)}); await p.waitForTimeout(150);
    await p.screenshot({path:path.join(__dirname,'out','journey_f_'+scheme+'_390_full.png')});
    // a wider screen: map beside the list
    await p.setViewportSize({width:1024,height:900}); await p.waitForTimeout(150);
    const wide=await p.evaluate(()=>{const m=document.querySelector('#journey .jmapcol').getBoundingClientRect(), l=document.querySelector('#journey .jlist').getBoundingClientRect(); return {sameRow:Math.abs(m.top-l.top)<40, side:document.documentElement.scrollWidth>innerWidth};});
    expect(wide.sameRow&&!wide.side,'F: '+scheme+': on a wide screen the map sits beside the list');
    await p.screenshot({path:path.join(__dirname,'out','journey_f_'+scheme+'_1024.png')});
    await ctx.close(); } }

// ---------- G. print version for a signed-in vendor: their own property and marker, nothing else personal ----------
{ const {ctx,p}=await setup();
  await p.goto(URL); await seed(p,world('signed',{ag:'signed',signed:true,verified:true})); await login(p,...JANE); await openJ(p);
  await p.emulateMedia({media:'print',colorScheme:'dark'});
  const pr=await p.evaluate(()=>({text:document.querySelector('#journey').innerText,bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.querySelector('#journey .jt, #journey h1')).color,here:document.querySelectorAll('#journey .jstop.here').length}));
  expect(/12 Test Street/.test(pr.text)&&pr.here===1,'G: the signed-in print carries the property and the marker');
  expect(!/Jane|Smith|Rob|jane@|rob@/.test(pr.text),'G: but no names or email addresses');
  expect(pr.bg==='rgb(255, 255, 255)','G: print is always on white even in dark mode (got '+pr.bg+')');
  await p.pdf({path:path.join(__dirname,'out','journey_print_signedin.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
  const pdf=fs.readFileSync(path.join(__dirname,'out','journey_print_signedin.pdf')).toString('latin1'); const pages=(pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length; expect(pages===1,'G: the signed-in leaflet is one A4 page (got '+pages+')');
  await ctx.close(); }

// ---------- H. Tim: the "Where are they" tile on the property page ----------
{ for(const scheme of ['light','dark']){
    const {ctx,p}=await setup(); await p.emulateMedia({colorScheme:scheme});
    await p.goto(URL);
    const tileFor=async(stage,o)=>{ const w=world(stage,o); w.prelistings=[]; await seed(p,w); await login(p,'agent-1','hello@timmcguire.co.nz'); await p.evaluate(()=>{}); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop="PR1"]'); await p.waitForTimeout(700); };
    for(const [stage,o,here,done] of [['plan',{},2,[1]],['agreement',{verified:true},4,[1,2,3,5]],['signed',{ag:'signed',signed:true,half:true,verified:true},5,[1,2,3,4]],['live',{ag:'countersigned',signed:true,verified:true},7,[1,2,3,4,5,6]],['withdrawn',{ag:'ended'},0,[]]]){
      await tileFor(stage,o); await p.click('#jToggle'); await p.waitForTimeout(100);   // on a phone the map is folded until Tim opens it
      const t=await p.evaluate(()=>{ const tile=document.querySelector('#jTile'); if(!tile) return null; const q=s=>[...tile.querySelectorAll(s)].map(e=>+e.dataset.j); const r=tile.getBoundingClientRect();
        return {head:tile.querySelector('h3').textContent,here:q('.jstop.here'),done:q('.jstop.done'),interactive:tile.querySelectorAll('.jstop[tabindex],.jgo').length,role:tile.querySelector('svg').getAttribute('role'),text:tile.textContent,w:Math.round(r.width),vw:innerWidth,side:document.documentElement.scrollWidth>innerWidth,svgH:Math.round(tile.querySelector('svg').getBoundingClientRect().height)}; });
      expect(!!t,'H: '+scheme+' '+stage+': Tim\'s tile is on the property page'); if(!t) continue;
      expect(t.head==='Where are they','H: the tile is called "Where are they"');
      expect(here? (t.here.length===1&&t.here[0]===here) : t.here.length===0,`H: ${scheme} ${stage}: Tim's marker at ${here||'none'} (got ${t.here})`);
      expect(JSON.stringify(t.done)===JSON.stringify(done),`H: ${scheme} ${stage}: ticked ${done} (got ${t.done})`);
      expect(t.interactive===0&&t.role==='img','H: Tim\'s map is a picture with the list beside it, not a set of links');
      expect(!t.side&&t.w<=t.vw,'H: '+scheme+' '+stage+': the tile fits 390');
      expect(t.svgH>300,'H: the map is really drawn');
      if(stage==='signed') expect(/1 of 2 checked/.test(t.text)&&/Signed by everyone/.test(t.text),'H: Tim\'s tile shows the identity and signing counts');
      if(here) expect(new RegExp('Stop '+here+' of 9').test(t.text),'H: the tile says which stop');
    }
    if(scheme==='dark'){ await p.screenshot({path:path.join(__dirname,'out','journey_h_tim_dark_390.png'),fullPage:true}); } else { await p.screenshot({path:path.join(__dirname,'out','journey_h_tim_light_390.png'),fullPage:true}); }
    await ctx.close(); } }

// ---------- I. the stage moves on, so does the map (the panel reads the property fresh each time it opens) ----------
{ const {ctx,p}=await setup();
  await p.goto(URL); await seed(p,world('signed',{ag:'signed',signed:true})); await login(p,...JANE); await openJ(p);
  let i=await info(p); expect(i.here[0]===5,'I: signed, identity not finished: marker at the identity check');
  await closeJ(p);
  await edit(p,"d.agreement_people.forEach(x=>x.id_verified_at='2026-11-03T00:00:00Z');"); await reload(p);
  await openJ(p); i=await info(p); expect(i.here[0]===6,'I: identity finished: the marker moves to getting ready');
  await closeJ(p);
  await edit(p,"d.properties[0].stage='live';"); await reload(p);
  await openJ(p); i=await info(p); expect(i.here[0]===7&&i.done.length===6,'I: Tim puts it on the market: the marker moves to on the market');
  await ctx.close(); }


// ---------- J. a link never moves a vendor forward, never throws away what they typed, and the mock matches the live access rules ----------
const savedStep=async p=>(await db(p)).agreements[0].answers._step;
{ const {ctx,p}=await setup();
  await p.goto(URL);
  // J1. a vendor at step 2 cannot reach the identity check or Review and sign from the map
  await seed(p,world('agreement',{step:2})); await login(p,...JANE);
  out.j1h1=await p.textContent('main h1'); expect(out.j1h1==='Your property','J1: the vendor is at their saved step 2 ('+out.j1h1+')');
  await openJ(p);
  expect(!(await p.$('#jcv-5 [data-jgo]')),'J1: no identity link while the vendor has not reached it');
  expect(await p.getAttribute('.jstop[data-j="5"]','role')==='button','J1: the identity stop only explains itself');
  await p.click('.jstop[data-j="5"]'); await p.waitForTimeout(300);
  expect(await p.evaluate(()=>!document.querySelector('#journey').hidden&&document.activeElement.id==='jcv-5'),'J1: tapping it shows its explanation');
  await closeJ(p);
  expect(await p.textContent('main h1')==='Your property'&&(await savedStep(p))===2,'J1: still at step 2, saved step unchanged');
  await openJ(p); await p.click('#jcv-4 [data-jgo]'); await p.waitForTimeout(500);
  expect(await p.textContent('main h1')==='Your property'&&(await savedStep(p))===2,'J1: the agreement stop leaves them where they were; saved step still 2');
  expect(!(await p.$('#sig0')),'J1: Review and sign is not reachable');
  // J1b. a vendor saved at the sign step can go back to the identity check from the map, without moving their saved step
  await seed(p,world('agreement',{step:9})); await login(p,...JANE);
  expect(await p.textContent('main h1')==='Review and sign','J1b: saved at the sign step');
  await openJ(p); expect(!!(await p.$('#jcv-5 [data-jgo]')),'J1b: the identity link is there for someone who has reached it');
  await p.click('#jcv-5 [data-jgo]'); await p.waitForTimeout(600);
  expect(await p.textContent('main h1')==='Verify your identity'&&(await savedStep(p))===9,'J1b: opens the identity check, saved step still 9');
  // J1c. saved at 8 but looking at an earlier page: the link goes to step 8 and never past it
  await seed(p,world('agreement',{step:8})); await login(p,...JANE);
  for(let n=0;n<6;n++){ await p.click('#back'); await p.waitForTimeout(150); }
  const earlier=await p.textContent('main h1'); expect(earlier!=='Verify your identity','J1c: went back to an earlier page ('+earlier+')');
  await openJ(p); await p.click('#jcv-5 [data-jgo]'); await p.waitForTimeout(600);
  expect(await p.textContent('main h1')==='Verify your identity'&&(await savedStep(p))===8,'J1c: the identity stop goes to step 8 and the saved step stays 8');
  // J2. half-typed answers: tapping a stop for the page they are on keeps what they typed
  await seed(p,world('agreement',{step:2})); await login(p,...JANE);
  const field='#main input[type=text]:not([readonly])';
  await p.fill(field,'half typed answer'); const first=await p.$eval(field,e=>e.id||e.dataset.a||e.name||'');
  await openJ(p); await p.click('#jcv-4 [data-jgo]'); await p.waitForTimeout(500);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden),'J2: the panel closed');
  expect(await p.$eval(field,e=>e.value)==='half typed answer','J2: the half-typed answer is still there after tapping the stop for this page');
  // J2b. a stop for a different page asks first; Cancel keeps everything
  const w=world('agreement',{step:2}); w.prelistings=[pl('L1','PR1','accepted','jane@example.com',{agreement_id:'A1'})];
  await seed(p,w); await login(p,...JANE);
  await p.fill(field,'half typed answer');
  let msg=''; p.once('dialog',d=>{ msg=d.message(); d.dismiss(); });
  await openJ(p); await p.click('#journey .jstop[data-j="2"]'); await p.waitForTimeout(500);
  expect(/not saved yet/.test(msg),'J2b: it asks before leaving something unsaved ('+msg+')');
  expect(await p.evaluate(()=>!document.querySelector('#journey').hidden),'J2b: Cancel leaves the panel open');
  await closeJ(p); expect(await p.$eval(field,e=>e.value)==='half typed answer','J2b: and the typed answer is still there');
  p.once('dialog',d=>d.accept()); await openJ(p); await p.click('#journey .jstop[data-j="2"]'); await p.waitForTimeout(800);
  expect(await p.evaluate(()=>document.querySelector('#journey').hidden),'J2b: OK goes to the page');
  // J3. a property contact who is not on the agreement sees stop 5, with no names or details
  const w3=world('signed',{ag:'signed',signed:true,verified:true}); w3.property_people.push(pperson('PPX','PR1','Pat Contact','pat@example.com','v-pat','contact'));
  w3.prelistings=[pl('L1','PR1','accepted','jane@example.com',{agreement_id:'A1'})];
  await seed(p,w3); await login(p,'v-pat','pat@example.com'); await openJ(p);
  let i=await info(p);
  expect(i.here[0]===5&&JSON.stringify(i.done)==='[1,2,3,4]','J3: a contact sees stop 5 (the marker without the agreement facts), got '+i.here+' '+i.done);
  expect(!/Jane|Smith|Rob|jane@|rob@|Pat|checked|have signed|Signed by|Paperwork:/.test(i.text),'J3: no names, counts or details');
  expect(!(await p.$('#journey [data-jgo]')),'J3: and no links');
  const rows=await p.evaluate(async()=>{const c=window.supabase.createClient(); const o={}; for(const t of ['agreements','agreement_people','signatures','property_forms','guide_receipts','prelistings']){ const r=await c.from(t).select('*'); o[t]=(r.data||[]).length; } return o;});
  expect(Object.values(rows).every(n=>n===0),'J3: the mock gives a non-party nothing from agreements, people, signatures, forms, receipts or pre-listings: '+JSON.stringify(rows));
  const rows2=await p.evaluate(async()=>{const c=window.supabase.createClient(); const r=await c.from('properties').select('id'); const q=await c.from('property_people').select('id'); return [(r.data||[]).length,(q.data||[]).length];});
  expect(rows2[0]===1&&rows2[1]>0,'J3: but the property and its people are readable by a contact (as live)');
  await ctx.close(); }
{ const {ctx,p}=await setup();
  await p.goto(URL);
  // J4. the questionnaire counts as sent once it is with Tim
  const q=(status,extra)=>({properties:[prop('PR1','12 Test Street, Dunedin','questionnaire')],property_people:[pperson('PP1','PR1','Jane Smith','jane@example.com','v-jane')],prelistings:[pl('L1','PR1',status,'jane@example.com',extra)]});
  await seed(p,q('appraisal',{proceeded_at:T0})); await login(p,...JANE); await openJ(p); let i=await info(p);
  expect(i.here[0]===1&&!i.done.length,'J4: still answering the questionnaire: stop 1');
  await closeJ(p);
  await seed(p,q('submitted',{submitted_at:T0})); await login(p,...JANE); await openJ(p); i=await info(p);
  expect(i.here[0]===2&&JSON.stringify(i.done)==='[1]','J4: questionnaire sent: stop 2 with stop 1 ticked (got '+i.here+' '+i.done+')');
  await closeJ(p);
  // J5. the printed leaflet drops the "no page yet" sentence; stop 6 reads naturally
  await openJ(p); expect(/guide to sale and purchase agreements, under Before you sell/.test(await p.textContent('#jcv-6')),'J5: stop 6 names the guide properly');
  expect(/There is no page for this stop yet/.test(await p.textContent('#jcv-7')),'J5: on screen stop 7 still says there is no page yet');
  await p.emulateMedia({media:'print'});
  const pt=await p.evaluate(()=>document.querySelector('#journey').innerText); expect(!/no page for this stop yet/i.test(pt)&&/On the market/.test(pt),'J5: the print has no "no page yet" sentence');
  await p.emulateMedia({media:'screen'});
  await ctx.close(); }
{ const {ctx,p}=await setup();   // J6. Tim's tile on a phone: the map and the current stop; the list behind a toggle
  await p.goto(URL);
  const w=world('agreement',{}); w.prelistings=[]; await seed(p,w); await login(p,'agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop="PR1"]'); await p.waitForTimeout(700);
  const vis=()=>p.evaluate(()=>({cards:[...document.querySelectorAll('#jListA .jcard')].filter(c=>c.getBoundingClientRect().height>0).length,toggle:(()=>{const b=document.querySelector('#jToggle'); return b&&b.getBoundingClientRect().height>0?b.textContent+'|'+b.getAttribute('aria-expanded'):null})(),owners:Math.round([...document.querySelectorAll('h2')].find(h=>h.textContent==='Owners').getBoundingClientRect().top+scrollY)}));
  let v=await vis(); out.tileFold=v; expect(v.cards===1&&v.toggle==='Show every stop|false','J6: on a phone the tile shows the current stop only, with a "Show every stop" toggle');
  const mapH=()=>p.evaluate(()=>document.querySelector('#jTile .jtile-map').getBoundingClientRect().height);
  expect(await mapH()===0,'J6: on a phone the map is folded too, so Owners stays near the top');
  await p.click('#jToggle'); await p.waitForTimeout(100); v=await vis(); expect(v.cards===9&&/^Show the current stop only\|true$/.test(v.toggle),'J6: the toggle shows all nine stops');
  expect(await mapH()>0,'J6: and the map');
  await p.click('#jToggle'); v=await vis(); expect(v.cards===1,'J6: and folds them again');
  await p.setViewportSize({width:1024,height:900}); await p.waitForTimeout(150); v=await vis(); expect(v.cards===9&&!v.toggle&&await mapH()>0,'J6: on a wide screen the map and all nine stops show and there is no toggle');
  await ctx.close(); }

await b.close();
console.log(JSON.stringify(Object.assign(out,{errs:errs.concat(fail)}),null,1));
})().catch(e=>{console.log(JSON.stringify({crash:String(e&&e.stack||e),errs:['crash: '+String(e&&e.message||e)]},null,1)); process.exitCode=1;});
