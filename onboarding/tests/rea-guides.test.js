// Phase 2: the REA guides. Read from onboarding/assets/guides (guides.json with each file's version). While the
// files are missing nothing is shown or asked for. With them: the agency agreement guide is shown before signing and
// its receipt goes into what's signed; "Before you sell" shows the sale and purchase guide with its own dated receipt.
// The guide files here are made-up test files, not the REA's guides.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(path.join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const PDF='%PDF-1.4\n% test fixture, not a real guide\n';
(async()=>{
const b=await chromium.launch(); const errs=[], fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); }; const out={};
async function setup(guides){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
  if(guides) await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/assets/guides/**',r=>{ const u=r.request().url(); if(u.endsWith('guides.json')) return r.fulfill({contentType:'application/json',body:JSON.stringify(guides)}); if(u.endsWith('.pdf')) return r.fulfill({contentType:'application/pdf',body:PDF}); return r.fulfill({status:404,body:''}); });
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  return {ctx,p};
}
const ag=(id,extra)=>Object.assign({id,ref:'MRE-2026-10'+id.slice(1),address:id+' Test Street, Dunedin',status:'sent',config:{appr:'done',ask:'875000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual',approach:'invited'},answers:{_step:7,capacity:'Owners',titleOk:true,gst:'no',pType:'House',work:'no',wt:'no',meth:'no',def:'no',guide:['0','1','2','3','4','5','6','7'],prior:'none'},legal:{choice:'have'},agreement_version:'v3.15-26102026',created_at:'2026-11-01T00:00:00Z'},extra||{});
const person=(id,a,n,email,user,signed)=>({id,agreement_id:a,position:1,legal_name:n,pref_name:'',email,phone:'',user_id:user,signed_at:signed||null});
const seed=(p,db)=>p.evaluate(db=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify(Object.assign({agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]},db)));},db);
const login=async(p,id,email)=>{await p.evaluate(([id,email])=>localStorage.setItem('mocksession',JSON.stringify({user:{id,email}})),[id,email]); await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(600);};
const draw=async(p,sel)=>{const el=await p.$(sel); await el.scrollIntoViewIfNeeded(); const bx=await el.boundingBox(); await p.mouse.move(bx.x+20,bx.y+40); await p.mouse.down(); await p.mouse.move(bx.x+120,bx.y+90,{steps:6}); await p.mouse.move(bx.x+220,bx.y+50,{steps:6}); await p.mouse.up();};
const tickAll=p=>p.$$eval('[data-multi="acks"]',els=>els.forEach(e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}));
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
async function signThrough(p){ await tickAll(p); await p.click('#next'); await p.waitForTimeout(400); await p.click('#next'); await p.waitForTimeout(400); await draw(p,'#sig0'); await p.click('#next'); await p.waitForTimeout(3400); }

// A. Guide files missing: no inline guide, no receipt asked for, no "Before you sell"
{ const {ctx,p}=await setup(null);
  await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await seed(p,{agreements:[ag('A1')],agreement_people:[person('P1','A1','Jane Smith','jane@example.com','v-jane')]});
  await login(p,'v-jane','jane@example.com');
  out.aH1=await p.textContent('main h1'); expect(out.aH1==='Before you sign','vendor at the acknowledgements');
  out.aIframe=await p.$('.guide-inline iframe'); expect(!out.aIframe,'no inline guide while the files are missing');
  out.aLink=await p.$eval('[for="ak1"]',e=>e.innerHTML.includes('rea.govt.nz')); expect(out.aLink,'the agreement keeps its link to the REA website');
  out.aComplaints=await p.$('.ack-more .inline-doc'); expect(!!out.aComplaints,'the complaints procedure can be read on the page');
  await signThrough(p);
  const d=await db(p), s=d.signatures[0].snapshot;
  expect(!!s.appendices&&s.appendices.rea_agency_guide===null&&s.appendices.complaints==='CDR-2026-11'&&s.appendices.vendor_guide==='VG-2026-11','the signature records what is appended (no REA guide)');
  expect(!('rea_guides' in s),'no guide receipt recorded while the files are missing');
  out.aTiles=await p.$$eval('.ptile h3',e=>e.map(x=>x.textContent)); expect(!out.aTiles.includes('Before you sell'),'no "Before you sell" while the files are missing');
  await ctx.close(); }

// B. Guide files present: shown before signing, receipt in what's signed; "Before you sell" with its own dated receipt
const SHA=require('crypto').createHash('sha256').update(PDF).digest('hex');
const G={agency:{file:'test-agency-guide.pdf',version:'TEST-1',sha256:SHA},sale_purchase:{file:'test-sale-guide.pdf',version:'TEST-2',sha256:SHA}};
{ const {ctx,p}=await setup(G);
  await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await seed(p,{agreements:[ag('A2')],agreement_people:[person('P2','A2','Rob Brown','rob@example.com','v-rob')]});
  await login(p,'v-rob','rob@example.com');
  out.bIframe=await p.$eval('.ack-more .guide-inline iframe',e=>e.getAttribute('src')).catch(()=>null);
  expect(/assets\/guides\/test-agency-guide\.pdf$/.test(out.bIframe||''),'the agency agreement guide is shown on the page before signing');
  out.bVersion=await p.$eval('.ack-more .guide-inline',e=>e.textContent.includes('version TEST-1')); expect(out.bVersion,'its version is shown');
  out.bPhone=await p.evaluate(()=>{ const g=document.querySelector('.ack-more .guide-inline'); const b=g.querySelector('a.guide-open'); return !!b&&b.offsetHeight>0&&/test-agency-guide\.pdf$/.test(b.href)&&getComputedStyle(g.querySelector('iframe')).display==='none'; });
  expect(out.bPhone,'on a phone the guide opens from a Read the guide button (phones can\'t show a PDF inside the page)');
  out.bSide=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth); expect(!out.bSide,'the guide fits a phone');
  await p.screenshot({path:path.join(__dirname,'out','rea1_before_sign.png'),fullPage:true});
  await signThrough(p);
  let d=await db(p); const s=d.signatures[0].snapshot;
  expect(s.rea_guides&&s.rea_guides[0].guide==='agency'&&s.rea_guides[0].version==='TEST-1'&&s.rea_guides[0].acknowledged_at,'the receipt, with the version, is in what was signed');
  expect(s.appendices&&s.appendices.rea_agency_guide&&s.appendices.rea_agency_guide.version==='TEST-1','the agreement records which guide version to append');
  const pdfSha=require('crypto').createHash('sha256').update(PDF).digest('hex');
  expect(s.rea_guides[0].sha256===pdfSha&&s.appendices.rea_agency_guide.sha256===pdfSha,'the guide file\'s SHA-256 is recorded with the receipt');
  const sp0=(s.rea_guides||[]).find(x=>x.guide==='sale_purchase');
  expect(sp0&&sp0.version==='TEST-2'&&sp0.sha256===pdfSha&&sp0.acknowledged_at,'the sale and purchase guide is shown before signing too, and its receipt is in what was signed');
  out.bTiles=await p.$$eval('.ptile h3',e=>e.map(x=>x.textContent)); expect(out.bTiles.includes('Before you sell'),'"Before you sell" appears after signing');
  out.spTile0=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Before you sell')));
  expect(/Guide received .*before you signed/.test(out.spTile0||''),'received before signing, so nothing more to do');
  // an agreement signed before the guide was shown before signing: "Before you sell" asks for it
  await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('mockdb')); d.signatures.forEach(x=>{ x.snapshot.rea_guides=(x.snapshot.rea_guides||[]).filter(g=>g.guide!=='sale_purchase'); }); localStorage.setItem('mockdb',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(900);
  await p.click('#spOpen'); await p.waitForTimeout(400);
  out.spH1=await p.textContent('main h1'); expect(out.spH1==='Before you sell','the Before you sell step');
  out.spIframe=await p.$eval('.guide-inline iframe',e=>e.getAttribute('src')); expect(/test-sale-guide\.pdf$/.test(out.spIframe),'the sale and purchase guide is shown inline');
  await p.click('#next'); await p.waitForTimeout(200); out.spErr=await p.textContent('.err'); expect(/Tick the box/.test(out.spErr),'the receipt must be ticked');
  await p.$eval('#spOk',e=>{e.checked=true;}); await p.click('#next'); await p.waitForTimeout(600);
  d=await db(p); expect((d.guide_receipts||[]).length===1&&d.guide_receipts[0].version==='TEST-2'&&d.guide_receipts[0].received_at&&d.guide_receipts[0].sha256===require('crypto').createHash('sha256').update(PDF).digest('hex'),'its own dated receipt, with the version and the file\'s SHA-256');
  const dd=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.rpc('vendor_guide_receipt',{a:'A2',p_guide:'sale_purchase',p_version:'X',p_file:'../../fn/shared.ts',p_sha256:null,p_user_agent:'t'}); return r.error&&r.error.message; });
  expect(/Not a guide file/.test(dd||''),'a ../ guide name is refused');
  out.spTile=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Before you sell')));
  expect(/Guide received/.test(out.spTile||''),'the tile shows it was received');
  // Tim sees the receipt on the agreement
  await login(p,'agent-1','hello@timmcguire.co.nz');
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-ag="A2"]'); await p.waitForTimeout(500); await p.click('[data-agopen="A2"]'); await p.waitForTimeout(600);
  out.agentRc=await p.evaluate(()=>document.querySelector('main').textContent.replace(/\s+/g,' ').includes('Sale and purchase guide received'));
  expect(out.agentRc,'Tim sees the dated receipt on the agreement');
  await ctx.close(); }

// C. A guide list without a version is ignored: never a made-up version
{ const {ctx,p}=await setup({agency:{file:'test-agency-guide.pdf'},sale_purchase:{file:'x.pdf',version:''}});
  await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await seed(p,{agreements:[ag('A3')],agreement_people:[person('P3','A3','Kim Lee','kim@example.com','v-kim')]});
  await login(p,'v-kim','kim@example.com');
  expect(!(await p.$('.guide-inline')),'a guide with no version stays switched off');
  await ctx.close(); }

// D. An agreement someone signed before phase 2 stays on the old format for the next signer too
{ const {ctx,p}=await setup(G);
  await p.goto('https://packages.dunnerstunner.co.nz/onboarding/');
  await seed(p,{agreements:[ag('A4')],agreement_people:[Object.assign(person('P4','A4','Ann Old','ann@example.com','v-ann','2026-10-30T01:00:00Z'),{position:1}),Object.assign(person('P5','A4','Ben Old','ben@example.com','v-ben'),{position:2})],signatures:[{id:'S1',agreement_id:'A4',person_id:'P4',signer_role:'client',signer_name:'Ann Old',snapshot:{agreement_version:'v3.15-26102026'},snapshot_sha256:'aa',signed_at:'2026-10-30T01:00:00Z'}]});
  await login(p,'v-ben','ben@example.com');
  await signThrough(p);
  const d=await db(p), s=d.signatures.find(x=>x.person_id==='P5').snapshot;
  expect(!s.appendices,'second signer of an agreement signed before phase 2: no appendices (the PDF stays the same)');
  await ctx.close(); }
console.log(JSON.stringify(Object.assign(out,{errs:errs.concat(fail)}),null,1)); await b.close();})();
