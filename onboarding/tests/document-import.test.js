const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(require('path').join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(require('path').join(__dirname,'mock.js'),'utf8');
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const go=async()=>{await p.goto('https://packages.dunnerstunner.co.nz/onboarding/');await p.waitForTimeout(500);};
const out={};
await go(); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('mocksession',JSON.stringify({user:{id:'agent-1',email:'hello@timmcguire.co.nz'}}));localStorage.setItem('mockdb',JSON.stringify({agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]}));
 localStorage.setItem('prefillMode','off');
 localStorage.setItem('prefillResult',JSON.stringify({documents:[{file:'Title-OT12A-345.pdf',kind:'Record of title'},{file:'LIM.pdf',kind:'LIM report'},{file:'crm.csv',kind:'CRM contact export'}],
  people:[{legal_name:'William Robert Jones',pref_name:'Bill',email:'bill@x.nz',phone:'021 123 4567',source:'Title OT12A/345 and CRM export'},{legal_name:'Mary Anne Jones',source:'Title OT12A/345'}],
  fields:[{key:'address',value:'22 Queens Drive, Belleknowes, Dunedin',source:'Title OT12A/345'},{key:'owners',value:'William Robert Jones, Mary Anne Jones',source:'Title OT12A/345'},{key:'title',value:'OT12A/345',source:'Title OT12A/345'},{key:'pLand',value:'612',source:'Title OT12A/345'},{key:'pYear',value:'1925',source:'LIM, page 3'},{key:'work',value:'yes',source:'LIM, page 5'},{key:'workDetail',value:'2014 deck (CCC issued); 2019 heat pump',source:'LIM, page 5'},{key:'def',value:'no',source:'LIM'}],
  flags:[{text:'Mortgage to ANZ registered on the title.',source:'Title OT12A/345'},{text:'Mary Anne Jones is on the title but not in your CRM.',source:'Title and CRM export'},{text:'Land is in a flood hazard overlay.',source:'LIM, page 8'}]}));});
await go(); await p.click('#homeAgree'); await p.waitForTimeout(400);
out.card=await p.textContent('#impCard h3');
await p.fill('#tAddr','22 Queens Dr'); // existing value, to test a conflict
await p.setInputFiles('#impFiles',[require('path').join(__dirname,'files')+'/Title-OT12A-345.pdf',require('path').join(__dirname,'files')+'/LIM.pdf',require('path').join(__dirname,'files')+'/crm.csv']); await p.waitForTimeout(200);
out.picked=await p.$$eval('#impPicked li',e=>e.length); await p.click('#impGo'); await p.waitForTimeout(500);
out.notSetUp=await p.textContent('#impOut');
await p.evaluate(()=>localStorage.setItem('prefillMode','on')); await p.click('#impGo'); await p.waitForTimeout(600);
out.rows=await p.$$eval('.imp-row',e=>e.map(x=>(x.querySelector('input').checked?'[x] ':'[ ] ')+x.textContent.replace(/\s+/g,' ').trim().slice(0,90)));
await p.screenshot({path:require('path').join(__dirname,'out','i1_review.png'),fullPage:true});
await p.click('#impApply'); await p.waitForTimeout(700);
out.addr=await p.inputValue('#tAddr'); out.owners=await p.inputValue('#t_owners'); out.title=await p.inputValue('#t_title'); out.land=await p.inputValue('#t_pLand');
out.people=await p.$$eval('#tPeople [data-i]',e=>e.map(c=>[...c.querySelectorAll('[data-pk]')].map(i=>i.value).join(' | ')));
out.badges=await p.$$eval('label .src-badge',e=>e.map(x=>x.parentElement.textContent.replace(/\s+/g,' ').trim()));
await p.screenshot({path:require('path').join(__dirname,'out','i2_filled.png'),fullPage:true});
await p.click('[data-tp="1"]'); await p.waitForTimeout(500); out.flags=await p.$eval('.warnc',e=>e.textContent.replace(/\s+/g,' ').slice(0,200)).catch(()=>null);
const db=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb'))); out.saved=db.agreements.map(a=>[a.address,(a.config.import||{}).files?.length,Object.keys((a.config.import||{}).sources||{}).length,a.answers.work,a.answers.workDetail]);
console.log(JSON.stringify(Object.assign(out,{errs}),null,1)); await b.close();})();
