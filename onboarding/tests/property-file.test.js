// Phase 1: the property file. One property from Let's begin to the agreement, entering things once.
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
const tick=async sel=>p.$$eval(sel,els=>els.forEach(e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}));
const next=async(w=400)=>{await p.click('#next'); await p.waitForTimeout(w);};
const db=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
const fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); };
const out={};
await go(); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify({agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[],properties:[],property_people:[],property_documents:[]}));
 localStorage.setItem('prefillResult',JSON.stringify({documents:[{file:'Title-OT12A-345.pdf',kind:'Record of title'}],people:[{legal_name:'William Robert Jones',source:'Title OT12A/345'},{legal_name:'Mary Anne Jones',source:'Title OT12A/345'}],fields:[{key:'owners',value:'William Robert Jones, Mary Anne Jones',source:'Title OT12A/345'},{key:'title',value:'OT12A/345',source:'Title OT12A/345'},{key:'pLand',value:'612',source:'Title OT12A/345'}],flags:[{text:'Mortgage to ANZ registered on the title.',source:'Title OT12A/345'}]}));});

// 1. Let's begin: one address and one vendor, typed once
await as('agent-1','hello@timmcguire.co.nz');
await p.click('#homeBegin'); await p.waitForTimeout(300);
await p.fill('#plAddr','22 Queens Drive, Belleknowes'); await p.fill('#plCName','William Jones'); await p.fill('#plCEmail','bill@example.com');
await p.selectOption('#plMethod','Auction'); await p.fill('#plPrice','$850,000 to $900,000');
await p.click('#plSaveAp'); await p.waitForTimeout(400);
let d=await db(); expect(d.properties.length===1,'one property made at Let\'s begin'); expect(d.prelistings[0].property_id===d.properties[0].id,'pre-listing linked to it');
expect(d.property_people.length===1&&d.property_people[0].email==='bill@example.com','vendor is owner 1');

// 2. The property file, and the title dropped in there
await p.click('#plProp'); await p.waitForTimeout(500);
out.propH1=await p.textContent('h1'); out.stageNow=await p.textContent('.stg.on');
expect(out.propH1.includes('22 Queens Drive'),'property page shows the address');
await p.setInputFiles('#impFiles',[path.join(__dirname,'files','Title-OT12A-345.pdf')]); await p.click('#impGo'); await p.waitForTimeout(600);
out.reviewRows=await p.$$eval('.imp-row',e=>e.length);
await p.click('#impApply'); await p.waitForTimeout(700);
d=await db(); const pid=d.properties[0].id;
out.owners=d.property_people.filter(x=>x.property_id===pid).map(x=>x.legal_name+'/'+x.email);
expect(d.property_people.length===3||d.property_people.length===2,'owners from the title added');
expect(d.properties[0].title_ref==='OT12A/345'&&d.properties[0].description.pLand==='612','title and land on the file');
expect((d.property_documents||[]).length===1,'the title is kept on the property');
out.flags=await p.$eval('.warnc',e=>e.textContent.includes('Mortgage')).catch(()=>false);
expect(out.flags,'the title\'s mortgage flag shows on the property');
// the appraisal's "William Jones" is recognised as "William Robert Jones" from the title: no duplicate to tidy
out.cards=(await p.$$('.pfp')).length; expect(out.cards===2,'the title\'s William Robert Jones is matched to the appraisal\'s William Jones');
const c2=await p.$$('.pfp'); for (const c of c2){ const n=await (await c.$('[data-pf=legal_name]')).inputValue(); if(n==='William Robert Jones'){ await (await c.$('[data-pf=pref_name]')).fill('Bill'); } }
await p.click('#pfSave'); await p.waitForTimeout(600);
d=await db(); out.ownersAfter=d.property_people.filter(x=>x.property_id===pid).sort((a,b)=>a.position-b.position).map(x=>x.legal_name+'/'+x.pref_name+'/'+x.email);
expect(out.ownersAfter.length===2,'two owners after tidying');
await p.screenshot({path:path.join(__dirname,'out','pf1_property.png'),fullPage:true});
out.sidePF=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth); expect(!out.sidePF,'property page fits a phone');

// 3. The vendor's questionnaire already knows both owners
await as('v-bill','bill@example.com'); await next();
for (let i=0;i<5;i++) await next(300);
out.step6=await p.textContent('main h1');
out.prefilled=await p.$$eval('.plo [data-o=name]',e=>e.map(x=>x.value));
expect(out.prefilled.includes('William Robert Jones')&&out.prefilled.includes('Mary Anne Jones'),'questionnaire shows the owners from the title');
await p.fill('.plo:nth-of-type(2) [data-o=email]','mary@example.com'); await p.fill('.plo:nth-of-type(2) [data-o=mobile]','022 555 6666');
await next(600); out.thanks=await p.textContent('h1');
d=await db(); out.ownersAfterQ=d.property_people.filter(x=>x.property_id===pid).map(x=>x.legal_name+'/'+x.email+'/'+x.phone);
expect(d.property_people.filter(x=>x.property_id===pid).length===2,'no duplicate owners after the questionnaire');
expect(d.property_people.some(x=>x.email==='mary@example.com'&&x.phone==='022 555 6666'),'Mary\'s details reach the file');

// 4. Plan, acceptance, and the agreement made from the file
await as('agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500);
out.dashStage=await p.textContent('tr[data-prop] .pill');
await p.click('tr[data-plrow]'); await p.waitForTimeout(500); await p.click('[data-plopen]'); await p.waitForTimeout(500);
await p.fill('.plp [data-p=said]','Price'); await p.fill('.plp [data-p=changed]','Added recent sales'); await p.click('#plPublish'); await p.waitForTimeout(500);
await as('v-bill','bill@example.com'); await tick('#plOk'); await next(600);
d=await db(); const ag=d.agreements[0];
expect(ag&&ag.property_id===pid,'agreement linked to the property');
expect(ag.config.title==='OT12A/345'&&ag.answers.pLand==='612','agreement starts from the file (title, land)');
out.agPeople=d.agreement_people.filter(x=>x.agreement_id===ag.id).map(x=>x.legal_name+'/'+x.pref_name+'/'+x.email);
expect(out.agPeople.length===2,'both owners on the agreement');

// 5. Page 1 shows it; a change there flows back to the file
await as('agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500);
await p.click('tr[data-prop]'); await p.waitForTimeout(500);
out.ownersLocked=!(await p.$('.pfp')); expect(out.ownersLocked,'owners locked on the file once the agreement is under way');
await p.click('[data-agopen]'); await p.waitForTimeout(500); await p.click('#editAg'); await p.waitForTimeout(500);
out.p1Addr=await p.inputValue('#tAddr'); out.p1Title=await p.inputValue('#t_title'); out.p1People=await p.$$eval('#tPeople [data-pk=legal_name]',e=>e.map(x=>x.value));
expect(out.p1Title==='OT12A/345','page 1 has the title');
await p.fill('#tPeople [data-i="1"] [data-pk=phone]','027 111 2222');
await p.click('#back'); await p.waitForTimeout(600);
d=await db(); expect(d.property_people.some(x=>x.legal_name==='Mary Anne Jones'&&x.phone==='027 111 2222'),'a change on page 1 reaches the file');

// 6. Let's agree straight from a property file, with no pre-listing
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('mockdb')); const pid='P2'; d.properties.push({id:pid,address:'5 Elm Row, Roslyn',title_ref:'OT5/55',owners_on_title:'Ana Ruru',ownership:{},description:{pBed:'3'},disclosures:{},stage:'appraisal',stage_at:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()}); d.property_people.push({id:'PP9',property_id:pid,position:1,legal_name:'Ana Ruru',pref_name:'Ana',email:'ana@example.com',phone:'021 3',source:'agent'}); localStorage.setItem('mockdb',JSON.stringify(d));});
await go(); await p.click('#navDash'); await p.waitForTimeout(500);
await p.click('tr[data-prop="P2"]'); await p.waitForTimeout(500); await p.click('#pfAgree'); await p.waitForTimeout(500);
out.p2Addr=await p.inputValue('#tAddr'); out.p2Bed=await p.inputValue('#t_pBed'); out.p2People=await p.$$eval('#tPeople [data-pk=legal_name]',e=>e.map(x=>x.value));
expect(out.p2Addr==='5 Elm Row, Roslyn'&&out.p2Bed==='3'&&out.p2People[0]==='Ana Ruru','Let\'s agree from the file starts filled in');
await p.click('#back'); await p.waitForTimeout(600);
d=await db(); const a2=d.agreements.find(a=>a.address==='5 Elm Row, Roslyn');
expect(a2&&a2.property_id==='P2','that agreement belongs to the same property');
expect(d.properties.filter(x=>x.address==='5 Elm Row, Roslyn').length===1,'no second property made');
out.dashCount=d.properties.length;

// 7. A contact who isn't an owner (the son arranges it; his parents own it) never becomes a signer
const api=()=>p.evaluate(()=>{ window.__c=window.__c||window.supabase.createClient(); return true; });
await as('agent-1','hello@timmcguire.co.nz');
await p.click('#navHome'); await p.waitForTimeout(300); await p.click('#homeBegin'); await p.waitForTimeout(300);
await p.fill('#plAddr','9 Test Street, Mornington'); await p.fill('#plCName','Sam Jones'); await p.fill('#plCEmail','sam@example.com');
await p.click('#plSaveAp'); await p.waitForTimeout(400);
d=await db(); const pl3=d.prelistings.find(x=>x.address==='9 Test Street, Mornington'); const p3=pl3.property_id;
await as('v-sam','sam@example.com'); await api();
out.submit3=await p.evaluate(id=>window.__c.rpc('pl_submit',{p:id,patch:{owners:[{name:'Robert James Jones',email:'rob@example.com'},{name:'Helen Jones',email:'helen@example.com'}]}}).then(r=>r.error&&r.error.message),pl3.id);
d=await db(); const pp3=()=>d.property_people.filter(x=>x.property_id===p3);
expect(pp3().find(x=>x.email==='sam@example.com').role==='contact','the son becomes a contact, not an owner');
await p.evaluate(id=>{const d=JSON.parse(localStorage.getItem('mockdb')); d.prelistings.find(x=>x.id===id).status='plan'; localStorage.setItem('mockdb',JSON.stringify(d));},pl3.id); await as('v-sam','sam@example.com'); await api();
const a3=await p.evaluate(id=>window.__c.rpc('pl_accept',{p:id}).then(r=>r.data),pl3.id);
d=await db(); out.signers3=d.agreement_people.filter(x=>x.agreement_id===a3).map(x=>x.legal_name);
expect(out.signers3.length===2&&!out.signers3.includes('Sam Jones'),'only the two owners are signers');

// 8. A checked legal name is never replaced by an informal one
await api(); await p.evaluate(pid=>window.__c.from('prelistings').insert({address:'9 Test Street, Mornington',contact_name:'Bob Jones',contact_email:'rob@example.com',property_id:pid}),p3);
d=await db(); out.robName=pp3().find(x=>x.email==='rob@example.com').legal_name;
expect(out.robName==='Robert James Jones','the legal name stays Robert James Jones');

// 9. Signed records can't change, and removing someone sets them aside rather than deleting them
await p.evaluate(a=>{const d=JSON.parse(localStorage.getItem('mockdb')); d.agreement_people.find(x=>x.agreement_id===a&&x.email==='rob@example.com').signed_at=new Date().toISOString(); localStorage.setItem('mockdb',JSON.stringify(d));},a3); await as('agent-1','hello@timmcguire.co.nz'); await api();
out.guard=await p.evaluate(async a=>{ const r=await window.__c.from('agreement_people').update({legal_name:'Robert Jones'}).eq('agreement_id',a).eq('email','rob@example.com'); return r.error&&r.error.message; },a3);
expect(/can no longer be changed/.test(out.guard||''),'a signed person\'s name is guarded');
out.guardAg=await p.evaluate(async a=>{ const r=await window.__c.from('agreements').update({address:'Somewhere else'}).eq('id',a); return r.error&&r.error.message; },a3);
expect(/can no longer be changed/.test(out.guardAg||''),'a signed agreement\'s terms are guarded');
await p.evaluate(a=>window.__c.from('agreement_people').delete().eq('agreement_id',a).eq('email','helen@example.com'),a3);
d=await db(); const helen=pp3().find(x=>x.email==='helen@example.com');
expect(helen&&helen.role==='former','Helen is set aside on the file, not deleted');

// 10. A cancelled agreement withdraws the property; starting again for new owners hides the old ones
await p.evaluate(a=>{const d=JSON.parse(localStorage.getItem('mockdb')); d.agreement_people.forEach(x=>{ if(x.agreement_id===a) x.signed_at=null; }); localStorage.setItem('mockdb',JSON.stringify(d));},a3); await as('agent-1','hello@timmcguire.co.nz'); await api();
await p.evaluate(a=>window.__c.from('agreements').update({status:'cancelled'}).eq('id',a),a3);
d=await db(); out.stage3=d.properties.find(x=>x.id===p3).stage;
expect(out.stage3==='withdrawn','a cancelled agreement leaves the property withdrawn, not stuck at Signed');
await p.click('#navDash'); await p.waitForTimeout(500); await p.click(`tr[data-prop="${p3}"]`); await p.waitForTimeout(500);
out.contactShown=await p.$eval('main',e=>e.textContent.includes('Also in touch'));
expect(out.contactShown,'the contact shows separately on the file');
out.beginHidden=!(await p.$('#pfBegin'))&&!(await p.$('#pfAgree'));
expect(out.beginHidden,'a withdrawn property asks same or new owners before Let\'s begin or Let\'s agree');
await p.click('[data-pfreopen="new"]'); await p.waitForTimeout(600);
d=await db(); out.active3=pp3().filter(x=>x.role!=='former').length;
expect(out.active3===0&&d.properties.find(x=>x.id===p3).stage==='appraisal','new owners: the old owners and contact are set aside');
out.oldShown=await p.$eval('details',e=>e.textContent.includes('Earlier owners')).catch(()=>false);
expect(out.oldShown,'earlier owners kept for Tim, out of the way');
await p.click('#pfBegin'); await p.waitForTimeout(400);
out.newContact=await p.inputValue('#plCName');
expect(out.newContact==='','Let\'s begin for new owners doesn\'t fill in the old owner');
// 11. Two owners with the same first and last name but different emails stay two people
await p.fill('#plAddr','4 Twin Lane, Andersons Bay'); await p.fill('#plCName','John Smith'); await p.fill('#plCEmail','john.senior@example.com'); await p.click('#plSaveAp'); await p.waitForTimeout(400);
d=await db(); const pl4=d.prelistings.find(x=>x.address==='4 Twin Lane, Andersons Bay');
await as('v-john','john.senior@example.com'); await api();
await p.evaluate(id=>window.__c.rpc('pl_submit',{p:id,patch:{owners:[{name:'John Smith',email:'john.senior@example.com'},{name:'John Paul Smith',email:'jp@example.com'}]}}),pl4.id);
d=await db(); out.johns=d.property_people.filter(x=>x.property_id===pl4.property_id&&x.role==='owner').map(x=>x.legal_name+'<'+x.email+'>');
expect(out.johns.length===2,'John Smith and John Paul Smith stay two owners');
console.log(JSON.stringify(Object.assign(out,{fail,errs:fail.length?fail.concat(errs):errs}),null,1)); await b.close();})();
