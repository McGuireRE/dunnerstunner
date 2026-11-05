const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(require('path').join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(require('path').join(__dirname,'mock.js'),'utf8');
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:430,height:900}});
await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const tick=async(sel)=>p.$$eval(sel,els=>els.forEach(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}));
const go=async()=>{await p.goto('https://packages.dunnerstunner.co.nz/onboarding/');await p.waitForTimeout(500);};
const as=async(u)=>p.evaluate(u=>localStorage.setItem('mocksession',JSON.stringify({user:u})),u);
await go(); await p.evaluate(()=>localStorage.clear());
// seed a signed agreement with Jane as sole vendor
await p.evaluate(()=>{const db={agreements:[{id:'A1',ref:'MRE-2026-1001',address:'14 Highgate, Maori Hill',status:'signed',config:{approach:'invited',flat:'10000',thr:'250000',pct:'3.5',ask:'1150000'},answers:{_step:9,guide:['0','1','2','3','4','5','6','7'],acks:[]},legal:{choice:'have'},signed_at:new Date().toISOString(),cooling_off_until:new Date(Date.now()+864e5).toISOString(),agreement_version:'v3.15-26102026'}],agreement_people:[{id:'P1',agreement_id:'A1',position:1,legal_name:'Jane Smith',pref_name:'Jane',email:'jane@example.com',phone:'021 555 1234',user_id:'v-jane',signed_at:new Date().toISOString()}],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};localStorage.setItem('mockdb',JSON.stringify(db));});
// vendor guide tick all
await as({id:'v-jane2',email:'jane2@example.com'});
await p.evaluate(()=>{const db=JSON.parse(localStorage.getItem('mockdb'));db.agreements.push({id:'A2',ref:'MRE-2026-1002',address:'22 Cliffs Road',status:'sent',config:{approach:'invited',flat:'10000',thr:'250000',pct:'3.5',ask:'900000',appr:'done'},answers:{_step:6},legal:{},agreement_version:'v3.15-26102026'});db.agreement_people.push({id:'P2',agreement_id:'A2',position:1,legal_name:'Jane Two',email:'jane2@example.com',phone:'',user_id:null});localStorage.setItem('mockdb',JSON.stringify(db));});
await go(); const h6=await p.textContent('h1'); await p.click('[data-tickall=guide]'); await p.waitForTimeout(100); const cnt=await p.textContent('#readCount');
await p.screenshot({path:require('path').join(__dirname,'out','g_tickall.png'),fullPage:true});
await p.click('#next'); await p.waitForTimeout(300); const h7=await p.textContent('h1'); await p.click('[data-tickall=acks]'); const n7=await p.$$eval('[data-multi=acks]:checked',e=>e.length);
// Jane cancels
await as({id:'v-jane',email:'jane@example.com'}); await go();
const done=(await p.textContent('main')).replace(/\s+/g,' ');
await p.screenshot({path:require('path').join(__dirname,'out','c1_done.png'),fullPage:true});
await p.click('#cancelLink'); await p.waitForTimeout(300); const c1=await p.textContent('h1'); await p.screenshot({path:require('path').join(__dirname,'out','c2_request.png'),fullPage:true});
await p.click('#next'); await p.waitForTimeout(100); const e1=await p.textContent('.err');
await tick('#crC1,#crC2'); await p.fill('#crWhy','Our plans have changed, we might wait until the new year.');
await p.click('#next'); await p.waitForTimeout(300); const c2=await p.textContent('h1'); await p.screenshot({path:require('path').join(__dirname,'out','c3_confirm.png'),fullPage:true});
await p.click('#next'); await p.waitForTimeout(100); const e2=await p.textContent('.err');
await tick('#crFinal'); await p.click('#next'); await p.waitForTimeout(400); const c3=await p.textContent('h1'); await p.screenshot({path:require('path').join(__dirname,'out','c4_sent.png')});
await p.click('#next'); await p.waitForTimeout(300); const doneAfter=(await p.textContent('main')).replace(/\s+/g,' ').slice(-220);
// Tim processes
await as({id:'agent-1',email:'hello@timmcguire.co.nz'}); await p.setViewportSize({width:1024,height:900}); await go(); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-ag="A1"]'); await p.waitForTimeout(500); await p.click('[data-agopen="A1"]'); await p.waitForTimeout(400);
await p.screenshot({path:require('path').join(__dirname,'out','c5_agent.png'),fullPage:true});
await p.click('[data-crdo=cancelled]'); await p.waitForTimeout(100); const e3=await p.textContent('[data-cr] .err');
await p.fill('[data-crnotes]','Spoke to Jane 3pm. Plans changed, moving in the new year. Agreed to cancel.'); await p.click('[data-crdo=cancelled]'); await p.waitForTimeout(500);
const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')).agreements[0].status);
const after=(await p.textContent('main')).replace(/\s+/g,' ').slice(0,400);
const inv=await p.evaluate(()=>localStorage.getItem('inv'));
console.log(JSON.stringify({h6,cnt,h7,n7,doneHasCancelCard:done.includes('Changed your mind'),doneHasLink:done.includes('start here'),c1,e1,c2,e2,c3,doneAfter,e3,st,after,inv,errs},null,1));
await b.close();})();
