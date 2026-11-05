// Phase 2: the Healthy Homes checklist and statement. Offered when the vendor says it's tenanted; Tim fills in the
// measurements on site on his phone; the landlords sign (here one in person, one on their own phone); the PDF is filed.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(path.join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const go=async()=>{await p.goto('https://packages.dunnerstunner.co.nz/onboarding/');await p.waitForTimeout(500);};
const as=async(id,email)=>{await p.evaluate(([id,email])=>localStorage.setItem('mocksession',JSON.stringify({user:{id,email}})),[id,email]); await go();};
const draw=async sel=>{const el=await p.$(sel); await el.scrollIntoViewIfNeeded(); const bx=await el.boundingBox(); await p.mouse.move(bx.x+20,bx.y+40); await p.mouse.down(); await p.mouse.move(bx.x+120,bx.y+90,{steps:6}); await p.mouse.move(bx.x+220,bx.y+50,{steps:6}); await p.mouse.up();};
const pick=sel=>p.$eval(sel,e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});
const db=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
const fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); };
const sideways=()=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
const out={};
await go(); await p.evaluate(()=>{localStorage.clear();
 const prop={id:'PR1',address:'7 Hill Street, Mornington',ownership:{},description:{pType:'House'},disclosures:{},stage:'signed',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'};
 const db={properties:[prop],property_people:[],property_documents:[],agreements:[{id:'A1',ref:'MRE-2026-1002',address:prop.address,property_id:'PR1',status:'countersigned',config:{appr:'done',ask:'640000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual'},answers:{capacity:'Owners'},legal:{choice:'have'},signed_at:'2026-11-02T02:00:00Z',cooling_off_until:'2026-11-03T04:00:00Z',agreement_version:'v3.15-26102026',created_at:'2026-11-01T00:00:00Z'}],
  agreement_people:[{id:'P1',agreement_id:'A1',position:1,legal_name:'Aroha Ngata',pref_name:'Aroha',email:'aroha@example.com',phone:'',user_id:'v-aroha',signed_at:'2026-11-02T01:00:00Z'},{id:'P2',agreement_id:'A1',position:2,legal_name:'Mere Ngata',pref_name:'Mere',email:'mere@example.com',phone:'',user_id:'v-mere',signed_at:'2026-11-02T02:00:00Z'}],
  property_forms:[{id:'F1',property_id:'PR1',agreement_id:'A1',kind:'vendor_declaration',form_version:'VD-2026-11',status:'draft',data:{tenanted:'now',hh:'yes'},agent_data:{},created_at:'2026-11-03T00:00:00Z'},{id:'F2',property_id:'PR1',agreement_id:'A1',kind:'healthy_homes',form_version:'HH-2026-11',status:'draft',data:{},agent_data:{},created_at:'2026-11-03T00:00:00Z'}],form_signatures:[],
  agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};
 localStorage.setItem('mockdb',JSON.stringify(db));});

// 1. The landlord can't sign before Tim has done the checklist
await as('v-mere','mere@example.com');
out.vTile=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Healthy Homes')));
expect(/Tim will take the measurements/.test(out.vTile||''),'the vendor is told Tim does the measurements');
const early=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.rpc('vendor_form_sign',{f:'F2',p_image_path:'agreements/A1/signatures/x.png',p_snapshot:{},p_user_agent:'t'}); return r.error&&r.error.message; });
expect(/hasn't finished/.test(early||''),'signing waits for Tim');
const save=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.rpc('vendor_form_save',{f:'F2',patch:{x:1}}); return r.error&&r.error.message; });
expect(/Tim fills in/.test(save||''),'vendors cannot fill in Tim\'s checklist');

// 2. Tim on his phone: the dashboard says what to do; he fills in the three pages
await as('agent-1','hello@timmcguire.co.nz');
await p.click('#navDash'); await p.waitForTimeout(500);
out.needs=await p.$$eval('.needs li strong',e=>e.map(x=>x.textContent));
expect(out.needs.includes('Do the Healthy Homes measurements'),'Needs you: the Healthy Homes measurements');
const i=out.needs.indexOf('Do the Healthy Homes measurements'); await p.click(`[data-need="${i}"]`); await p.waitForTimeout(500);
out.h1=await p.textContent('main h1'); expect(out.h1==='Healthy Homes checklist and statement','Tim\'s checklist opens');
out.hasWording=await p.evaluate(()=>document.querySelector('main').textContent.includes('Ceiling insulation meets regional R-value (R2.9 North Island / R3.3 South Island & Central North Island)'));
expect(out.hasWording,'Tim\'s checklist wording');
await p.click('#hReady'); await p.waitForTimeout(300); out.e1=await p.textContent('#hErr'); expect(/Mark each item/.test(out.e1),'every item must be marked');
await p.$$eval('.hhq',qs=>qs.forEach(q=>{ const r=q.querySelector('input[value="Y"]'); r.checked=true; }));
await pick('input[name="hc_ins3"][value="N"]'); await p.fill('.hhq[data-hk="ins3"] [data-hn]','No underfloor insulation, quote arranged');
await p.fill('[data-hw="area"]','24.5'); await p.fill('[data-hw="ta"]','Dunedin City Council'); await pick('input[name="hw_exempt"][value="N"]');
await p.fill('#hReq','3.6'); await p.fill('#hInst','5.0'); await pick('input[name="hr_comp"][value="Y"]');
await p.fill('[data-hs="h1"]','3.6');
expect(!(await sideways()),'Tim\'s checklist fits his phone');
await p.screenshot({path:path.join(__dirname,'out','hh1_agent.png'),fullPage:true});
await p.click('#hReady'); await p.waitForTimeout(600);
let d=await db(); let hh=d.property_forms.find(f=>f.id==='F2');
expect(hh.status==='ready'&&hh.agent_data.c.ins3.a==='N'&&hh.agent_data.ws.area==='24.5'&&hh.agent_data.res.req==='3.6','the measurements are saved and it is ready to sign');

// 3. Aroha signs in person on Tim's phone, witnessed
out.pads=await p.$$eval('[data-fsigner]',e=>e.map(x=>x.dataset.fsigner)); expect(out.pads.length===2,'a pad for each landlord');
await p.click('[data-fsign="P1"]'); await p.waitForTimeout(200); out.e2=await p.textContent('#fErr'); expect(/Tick the box/.test(out.e2),'they confirm they checked it');
await pick('[data-fok="P1"]'); await draw('#fpad_P1'); await p.click('[data-fsign="P1"]'); await p.waitForTimeout(3600);
d=await db(); expect(d.form_signatures.length===1&&d.form_signatures[0].snapshot.witnessed_by==='Timothy McGuire'&&d.form_signatures[0].snapshot.agent_data.res.req==='3.6','Aroha\'s signature covers Tim\'s measurements, witnessed');
const locked=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.from('property_forms').update({agent_data:{}}).eq('id','F2'); return r.error&&r.error.message; });
expect(/can no longer be changed/.test(locked||''),'once signed, the measurements cannot change');

expect(/form-F2-P1-/.test(d.form_signatures[0].image_path),'the signature image is filed under the signer');
// 4. Mere signs on her own phone (not with someone else's signature image, and not once the agreement has ended)
await as('v-mere','mere@example.com');
const other=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.rpc('vendor_form_sign',{f:'F2',p_image_path:'agreements/A1/signatures/var-form-F2-P1-1.png',p_snapshot:{},p_user_agent:'t'}); return r.error&&r.error.message; });
expect(/Bad signature path/.test(other||''),'a vendor cannot sign with another signer\'s image');
const ended=await p.evaluate(async()=>{ const d=JSON.parse(localStorage.getItem('mockdb')); d.agreements[0].status='ended'; localStorage.setItem('mockdb',JSON.stringify(d)); location.reload(); });
await p.waitForTimeout(700);
const endedErr=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const r=await c.rpc('vendor_form_sign',{f:'F2',p_image_path:'agreements/A1/signatures/var-form-F2-P2-1.png',p_snapshot:{},p_user_agent:'t'}); return r.error&&r.error.message; });
expect(/no longer in force/.test(endedErr||''),'no signing once the agreement has ended');
await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('mockdb')); d.agreements[0].status='countersigned'; localStorage.setItem('mockdb',JSON.stringify(d)); });
await go();
await p.click('[data-form="healthy_homes"]'); await p.waitForTimeout(500);
out.mH1=await p.textContent('main h1'); expect(/Healthy Homes/.test(out.mH1),'Mere checks and signs');
out.mSees=await p.evaluate(()=>document.querySelector('main').textContent.includes('No underfloor insulation, quote arranged')); expect(out.mSees,'Mere sees Tim\'s notes');
await pick('#vfOk'); await draw('#vfSig'); await p.click('#next'); await p.waitForTimeout(3600);
d=await db(); hh=d.property_forms.find(f=>f.id==='F2');
expect(hh.status==='signed'&&hh.document_id&&d.property_documents.some(x=>x.kind==='Healthy Homes checklist and statement'&&x.source==='generated'),'signed by both landlords and filed on the property');
const inv=await p.evaluate(()=>JSON.parse(localStorage.getItem('inv')||'[]')); expect(inv.filter(x=>x==='notify:form_signed').length===1,'Tim is emailed once, when everyone has signed');
expect(!(await sideways()),'fits a phone');
console.log(JSON.stringify(Object.assign(out,{errs:errs.concat(fail)}),null,1)); await b.close();})();
