const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(require('path').join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(require('path').join(__dirname,'mock.js'),'utf8');
(async()=>{
const b=await chromium.launch(); const out={}; const errs=[];
for (const [w,scheme] of [[390,'light'],[1024,'dark']]) {
const ctx=await b.newContext({viewport:{width:w,height:844},colorScheme:scheme});
await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
const p=await ctx.newPage(); p.on('pageerror',e=>{errs.push(e.message);console.log('PERR',e.message)}); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const go=async()=>{await p.goto('https://packages.dunnerstunner.co.nz/onboarding/');await p.waitForTimeout(600);};
await go(); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('mocksession',JSON.stringify({user:{id:'agent-1',email:'hello@timmcguire.co.nz'}}));
 const now=new Date().toISOString(); const pe=(id,aid,n,signed)=>({id,agreement_id:aid,position:1,legal_name:n,pref_name:'',email:n.split(' ')[0].toLowerCase()+'@x.nz',signed_at:signed?now:null});
 localStorage.setItem('mockdb',JSON.stringify({agreements:[{id:'A1',ref:'MRE-2026-1001',address:'14 Highgate, Maori Hill',status:'signed',config:{},answers:{},legal:{},updated_at:now},{id:'A2',ref:'MRE-2026-1002',address:'3 Elm Row, Roslyn',status:'sent',config:{},answers:{},legal:{},updated_at:now},{id:'A3',ref:'MRE-2026-1003',address:'9 Belt Rd, Andersons Bay',status:'countersigned',config:{},answers:{},legal:{},updated_at:now}],agreement_people:[pe('P1','A1','Jane Smith',1),pe('P2','A2','Sam Lee',0),pe('P3','A3','Ana Ruru',1)],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[{id:'L1',address:'22 Queens Drive',contact_name:'William Jones',contact_email:'bill@x.nz',status:'submitted',appraisal:{},answers:{},plan:{},updated_at:now}],prior_agency_notices:[{id:'N1',agreement_id:'A3',agency:'Smith Realty',status:'to_send',idx:0}],agreement_variations:[]}));});
await go();
const k=w+scheme;
out[k]={h1:await p.textContent('h1'), tiles:await p.$$eval('.home-tile .ttl',e=>e.map(x=>x.textContent)), hasTable:!!(await p.$('table')), needs:await p.textContent('#homeNeeds'), navVisible:await p.isVisible('#agentNav'), side:await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)};
await p.screenshot({path:require('path').join(__dirname,'out',`h_home_${k}.png`),fullPage:true});
await p.click('#navDash'); await p.waitForTimeout(500);
out[k].dash=await p.textContent('h1'); out[k].stats=await p.$$eval('.stat',e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim())); out[k].needsList=await p.$$eval('.needs strong',e=>e.map(x=>x.textContent)); out[k].current=await p.getAttribute('#navDash','aria-current');
await p.screenshot({path:require('path').join(__dirname,'out',`h_dash_${k}.png`),fullPage:true});
await p.click('[data-filter="signed"]'); await p.waitForTimeout(300); out[k].signedRows=await p.$$eval('tr[data-ag]',e=>e.map(x=>x.dataset.ag)); await p.click('[data-filter="all"]'); await p.waitForTimeout(300);
await p.click('tr[data-ag="A1"]'); await p.waitForTimeout(500); await p.click('[data-agopen="A1"]'); await p.waitForTimeout(400); out[k].detailBtn=await p.textContent('#toList');
await p.click('#navHome'); await p.waitForTimeout(300); out[k].backHome=await p.textContent('h1');
// appointment flow, nav from inside keeps typed address
await p.click('#homeAgree'); await p.waitForTimeout(300); await p.fill('#tAddr','77 Test Street'); await p.click('#navDash'); await p.waitForTimeout(600);
out[k].savedDraft=await p.$$eval('tr[data-prop] strong',e=>e.map(x=>x.textContent).includes('77 Test Street')) || (await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')).agreements.some(a=>a.address==='77 Test Street')));
out[k].sideDash=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
await p.click('#signOut'); await p.waitForTimeout(500); out[k].navAfterSignout=await p.isVisible('#agentNav');
await ctx.close();
}
console.log(JSON.stringify(Object.assign(out,{errs}),null,1)); await b.close();})();
