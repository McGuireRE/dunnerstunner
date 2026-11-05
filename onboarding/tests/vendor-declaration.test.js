// Phase 2: the Vendor Declaration. A vendor step after signing: the property file's answers shown for confirmation,
// only the new questions asked, signed with the same pad and confirmation, the PDF filed on the property, Tim emailed.
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
const next=async(w=400)=>{await p.click('#next'); await p.waitForTimeout(w);};
const errText=()=>p.textContent('.err');
const pick=sel=>p.$eval(sel,e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});
const db=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
const fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); };
const sideways=()=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
const out={};
await go(); await p.evaluate(()=>{localStorage.clear();
 const prop={id:'PR1',address:'22 Queens Drive, Belleknowes',title_ref:'OT12A/345',owners_on_title:'Jane Mary Smith, Robert Smith',ownership:{capacity:'Owners'},description:{pType:'House',pYear:'1998',pBed:'3',pBath:'1',pHeat:'Heat pump, ceiling insulation',chattels:['Blinds','Stove']},disclosures:{work:'yes',workDetail:'New bathroom 2019, consented',wt:'no',meth:'no',def:'no',hazards:['Steep driveway or steps']},stage:'signed',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'};
 const db={properties:[prop],property_people:[],property_documents:[],agreements:[{id:'A1',ref:'MRE-2026-1001',address:prop.address,property_id:'PR1',status:'signed',config:{appr:'done',ask:'875000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual',approach:'invited'},answers:{capacity:'Owners'},legal:{choice:'have'},signed_at:'2026-11-02T02:00:00Z',cooling_off_until:'2026-11-03T04:00:00Z',agreement_version:'v3.15-26102026',created_at:'2026-11-01T00:00:00Z'}],
  agreement_people:[{id:'P1',agreement_id:'A1',position:1,legal_name:'Jane Mary Smith',pref_name:'Jane',email:'jane@example.com',phone:'',user_id:'v-jane',signed_at:'2026-11-02T01:00:00Z'},{id:'P2',agreement_id:'A1',position:2,legal_name:'Robert Smith',pref_name:'Rob',email:'rob@example.com',phone:'',user_id:'v-rob',signed_at:'2026-11-02T02:00:00Z'}],
  agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};
 localStorage.setItem('mockdb',JSON.stringify(db));});

// 1. Jane, on her phone: the paperwork tile on her agreement page
await as('v-jane','jane@example.com');
out.doneH1=await p.textContent('main h1');
out.tiles=await p.$$eval('.ptile h3',e=>e.map(x=>x.textContent));
expect(out.tiles.includes('Vendor Declaration'),'the Vendor Declaration is offered after signing');
expect(!out.tiles.includes('Before you sell'),'no "Before you sell" while the REA guide file is missing');
await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(500);
let d=await db(); expect((d.property_forms||[]).length===1&&d.property_forms[0].kind==='vendor_declaration'&&d.property_forms[0].form_version==='VD-2026-11','form started with its version');

// step 1: what the property file already says, for confirmation
out.step1=await p.textContent('main h1');
const facts=await p.$$eval('.fact',e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
expect(facts.some(x=>x.includes('Heat pump, ceiling insulation'))&&facts.some(x=>x.includes('New bathroom 2019')),'the property file description and disclosures are shown');
await next(); out.e1=await errText(); expect(/still correct/.test(out.e1),'asks to confirm the file');
await pick('input[name="vfFile"][value="ok"]'); await next();

// step 2: condition questions; the file's answers are filled in and marked
out.step2=await p.textContent('main h1'); expect(out.step2==='Property Condition and Known Issues','step 2 is the condition questions');
out.badges=await p.$$eval('.vdq',e=>e.filter(c=>c.querySelector('.src-badge')).map(c=>c.dataset.q));
expect(['meth','wt','faults','reno','era','hazard'].every(k=>out.badges.includes(k)),'answers from the file are prefilled and marked: '+out.badges.join(','));
out.methPre=await p.$eval('input[name="vq_meth"][value="no"]',e=>e.checked); expect(out.methPre,'meth answer from the file');
out.renoPre=await p.$eval('[data-qd="reno"]',e=>e.value); expect(out.renoPre.includes('New bathroom 2019'),'renovations from the file');
out.eraPre=await p.$eval('input[name="vq_era"][value="yes"]',e=>e.checked); expect(out.eraPre,'built 1998: the 1995 to 2004 question is answered Yes');
await next(); out.e2=await errText(); expect(/answer each question/.test(out.e2),'every question must be answered');
await p.$$eval('.vdq',cs=>cs.forEach(c=>{ const r=c.querySelector('input[value="no"]'); if(r&&!c.querySelector('input:checked')) r.checked=true; }));
await pick('input[name="vq_history"][value="yes"]'); await next(); out.e2b=await errText(); expect(/details/.test(out.e2b),'Yes needs details');
await p.fill('[data-qd="history"]','A new subdivision is planned two streets away');
await p.fill('[data-qd="faults"]','None known');
await p.screenshot({path:path.join(__dirname,'out','vd1_questions.png'),fullPage:true});
expect(!(await sideways()),'questions fit a phone');
await next();

// step 3: services, registrations and the tenancy question (Healthy Homes offered only if tenanted)
out.step3=await p.textContent('main h1'); expect(out.step3==='Services and Features','step 3');
await p.$$eval('.vdq',cs=>cs.forEach(c=>{ const r=c.querySelector('input[value="yes"]'); if(r) r.checked=true; }));
await pick('input[name="vq_hai"][value="no"]'); await pick('input[name="vq_burner"][value="no"]');
await p.fill('[data-qd="internet"]','Fibre'); await p.fill('[data-qd="glazing"]','Double glazed throughout');
out.hhHidden=await p.$eval('#vfHHWrap',e=>e.hidden); expect(out.hhHidden,'Healthy Homes not offered until they say it is tenanted');
await pick('input[name="vfTen"][value="now"]'); out.hhShown=!(await p.$eval('#vfHHWrap',e=>e.hidden)); expect(out.hhShown,'Healthy Homes offered when tenanted');
await next(); out.e3=await errText(); expect(/Healthy Homes/.test(out.e3),'asks about the Healthy Homes checklist');
await pick('input[name="vfHH"][value="yes"]'); await next(600);
d=await db(); expect(d.property_forms.some(f=>f.kind==='healthy_homes'&&f.status==='draft'),'the Healthy Homes checklist is started for Tim');

// step 4: statement and sign
out.step4=await p.textContent('main h1');
out.statement=await p.evaluate(()=>document.querySelector('main').textContent.includes('vii. We have provided the Agent with all information known to us relevant to the property\'s current Health and Safety Notice.'));
expect(out.statement,'the Vendor Statement in Tim\'s words');
out.btn=await p.textContent('#next'); expect(out.btn==='Save my signature and sign','the button says it saves the signature');
out.padBg=await p.$eval('#vfSig',e=>getComputedStyle(e.closest('.sig-wrap')).backgroundColor);
await next(); out.e4=await errText(); expect(/Tick the box/.test(out.e4),'must make the declaration');
await pick('#vfOk'); await next(); out.e5=await errText(); expect(/sign in the box/.test(out.e5),'must sign');
await draw('#vfSig'); await p.click('#next'); await p.waitForTimeout(300);
out.overlay=await p.$('.sig-ok')!==null; expect(out.overlay,'the saved-signature confirmation shows');
await p.waitForTimeout(3200);
d=await db(); const vd=d.property_forms.find(f=>f.kind==='vendor_declaration');
expect(d.form_signatures.length===1&&vd.status==='draft','one of two signed');
const snap=d.form_signatures[0].snapshot;
expect(snap.doc&&snap.doc.title==='Vendor Declaration'&&snap.form_data&&snap.form_data.answers.history.d.includes('subdivision'),'what was signed holds the wording and the answers');
expect(JSON.stringify(snap.doc).includes('Is the Vendor aware of any Dux Qest plumbing, Weatherside cladding, or Monolithic cladding?'),'the signed wording is Tim\'s');
out.tileAfter=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Vendor Declaration')));
expect(/Waiting on Rob/.test(out.tileAfter||''),'Jane sees she is waiting on Rob');
let inv=await p.evaluate(()=>JSON.parse(localStorage.getItem('inv')||'[]')); expect(!inv.includes('notify:form_signed'),'nothing filed until everyone has signed');

// 2. Rob: the answers are locked once Jane has signed; he checks and signs
await as('v-rob','rob@example.com');
await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(500);
out.robH1=await p.textContent('main h1'); expect(/Check and sign/.test(out.robH1),'Rob goes straight to check and sign');
out.robInputs=await p.$$eval('.vdq',e=>e.length); expect(out.robInputs===0,'Rob cannot change the signed answers');
out.robSees=await p.evaluate(()=>document.querySelector('main').textContent.includes('A new subdivision is planned'));
expect(out.robSees,'Rob sees Jane\'s answers');
await pick('#vfOk'); await draw('#vfSig'); await p.click('#next'); await p.waitForTimeout(3600);
d=await db(); const vd2=d.property_forms.find(f=>f.kind==='vendor_declaration');
expect(vd2.status==='signed'&&d.form_signatures.length===2,'signed by both vendors');
expect(!vd2.document_id&&!vd2.countersigned_at,'not filed until Tim has countersigned as licensee');
out.robTile=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Vendor Declaration')));
expect(/Tim signs it next, as licensee/.test(out.robTile||''),'the vendors are told Tim signs it next');
expect(!(await sideways()),'fits a phone');
// signed is final
const g=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const f=JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x=>x.kind==='vendor_declaration'); const r=await c.from('property_forms').update({data:{}}).eq('id',f.id); const s=await c.from('form_signatures').update({signer_name:'x'}).eq('form_id',f.id); return [r.error&&r.error.message, s.error&&s.error.message]; });
expect(/can no longer be changed/.test(g[0]||'')&&/cannot be changed/.test(g[1]||''),'signed declaration and signatures cannot change: '+JSON.stringify(g));

// 3. Tim countersigns as licensee from "Needs you"; then it's filed and emailed to him
await as('agent-1','hello@timmcguire.co.nz');
// a direct write can't mark it filed or countersigned
const dw=await p.evaluate(async()=>{ const c=window.supabase.createClient(); const f=JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x=>x.kind==='vendor_declaration'); const r=await c.from('property_forms').update({countersigned_at:new Date().toISOString()}).eq('id',f.id); const r2=await c.from('property_forms').update({document_id:'x'}).eq('id',f.id); return [r.error&&r.error.message,r2.error&&r2.error.message]; });
expect(dw.every(m=>/only signed or filed by signing/.test(m||'')),'direct writes cannot countersign or file: '+JSON.stringify(dw));
await p.click('#navDash'); await p.waitForTimeout(500);
out.needs=await p.$$eval('.needs li strong',e=>e.map(x=>x.textContent));
const ci=out.needs.indexOf('Countersign the Vendor Declaration'); expect(ci>=0,'Needs you: countersign the Vendor Declaration');
await p.click(`[data-need="${ci}"]`); await p.waitForTimeout(500);
out.counterBtn=await p.textContent('#fCounter'); expect(out.counterBtn==='Save my signature and countersign','the countersign button says it saves the signature');
await p.click('#fCounter'); await p.waitForTimeout(200); out.cErr=await p.textContent('#fCErr'); expect(/sign first/.test(out.cErr),'Tim must sign first');
await draw('#fSigA'); await p.click('#fCounter'); await p.waitForTimeout(3600);
d=await db(); const vd3=d.property_forms.find(f=>f.kind==='vendor_declaration'); const lic=d.form_signatures.find(x=>x.signer_role==='agent');
expect(vd3.countersigned_at&&lic&&lic.snapshot.vendor_signatures.length===2&&/form-.*-agent-/.test(lic.image_path),'Tim\'s countersignature is recorded with the vendors\' fingerprints');
inv=await p.evaluate(()=>JSON.parse(localStorage.getItem('inv')||'[]')); expect(inv.filter(x=>x==='notify:form_signed').length===1,'the PDF is made and Tim is emailed, once');
expect(vd3.document_id&&d.property_documents.some(x=>x.id===vd3.document_id&&x.source==='generated'&&x.kind==='Vendor Declaration'),'the PDF is filed on the property as a generated document');
await p.click('#fBack'); await p.waitForTimeout(600);
out.agentTile=await p.evaluate(()=>[...document.querySelectorAll('.ptile')].map(t=>t.textContent.replace(/\s+/g,' ')).find(t=>t.includes('Documents after signing')));
expect(/Vendor Declaration/.test(out.agentTile||'')&&/Signed/.test(out.agentTile||''),'Tim sees the signed declaration on the property');
out.docs=await p.$$eval('.fact .k',e=>e.map(x=>x.textContent).filter(t=>t.includes('Vendor Declaration')));
expect(out.docs.length>=1,'the PDF is in the property documents');
await p.screenshot({path:path.join(__dirname,'out','vd2_property.png'),fullPage:true});
const fo=await p.$$('[data-fopen]'); await fo[0].click(); await p.waitForTimeout(500);
out.agentView=await p.evaluate(()=>document.querySelector('main').textContent.includes('witnessed')||document.querySelector('main').textContent.includes('Signed by everyone'));
expect(out.agentView,'Tim opens the signed declaration');
out.noEm=await p.evaluate(()=>!document.body.innerText.includes('—')); expect(out.noEm,'no em dashes');
console.log(JSON.stringify(Object.assign(out,{errs:errs.concat(fail)}),null,1)); await b.close();})();
