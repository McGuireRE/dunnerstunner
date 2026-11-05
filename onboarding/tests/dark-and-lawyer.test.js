const {chromium}=require('playwright');const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(require('path').join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(require('path').join(__dirname,'mock.js'),'utf8');
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
let LSTATUS='signed';
await ctx.route('https://hwpwyjxhdvlqrjwzxzqz.supabase.co/functions/v1/lawyer-view**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({agreement:{ref:'MRE-2026-1001',address:'14 Highgate, Maori Hill',status:LSTATUS,agreement_version:'v3.15-26102026',config:{flat:'10000',thr:'250000',pct:'3.95',ask:'900000',appr:'done'},answers:{},signed_at:LSTATUS==='signed'?'2026-11-03T02:00:00Z':null},people:[{legal_name:'Jane Smith',signed_at:LSTATUS==='signed'?'2026-11-03T02:00:00Z':null}],lawyer:{name:'Lee Lawyer'}})}));
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const go=async(q='')=>{await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'+q);await p.waitForTimeout(500);};
const out={};
// lawyer views
await go('?lawyer='+'a'.repeat(48)); out.lawSigned=await p.textContent('.lawyer-banner'); out.lawBtn=await p.textContent('.toolbar a'); await p.screenshot({path:require('path').join(__dirname,'out','d1_lawyer_signed.png')});
LSTATUS='sent'; await go('?lawyer='+'a'.repeat(48)); out.lawDraft=await p.textContent('.lawyer-banner'); out.lawBtn2=await p.textContent('.toolbar a'); await p.screenshot({path:require('path').join(__dirname,'out','d2_lawyer_draft.png')});
// vendor signing in dark mode
await go(); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('mocksession',JSON.stringify({user:{id:'v-jane',email:'jane@example.com'}}));
 const db={agreements:[{id:'A1',ref:'MRE-2026-1001',address:'14 Highgate, Maori Hill',status:'sent',config:{approach:'invited',flat:'10000',thr:'250000',pct:'3.95',ask:'1150000',appr:'done',aml:'Manual'},answers:{_step:9,pBed:'5',guide:['0','1','2','3','4','5','6','7'],acks:['0','1','2','3','4','5','6','7','8','9','10']},legal:{choice:'have'},agreement_version:'v3.15-26102026'}],agreement_people:[{id:'P1',agreement_id:'A1',position:1,legal_name:'Jane Smith',email:'jane@example.com',user_id:'v-jane'}],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};localStorage.setItem('mockdb',JSON.stringify(db));});
await go(); out.h1=await p.textContent('h1'); out.nextLabel=await p.textContent('#next');
const el=await p.$('#sig0'); await el.scrollIntoViewIfNeeded(); const bx=await el.boundingBox();
await p.mouse.move(bx.x+30,bx.y+50); await p.mouse.down(); await p.mouse.move(bx.x+150,bx.y+100,{steps:8}); await p.mouse.move(bx.x+280,bx.y+40,{steps:8}); await p.mouse.up();
out.unsaved=await p.textContent('.unsaved'); out.padBg=await p.$eval('.sig-wrap',e=>getComputedStyle(e).backgroundColor);
await p.screenshot({path:require('path').join(__dirname,'out','d3_drawn_dark.png')});
await p.click('#next'); await p.waitForTimeout(700);
out.overlay=await p.$eval('.sig-ok',e=>e.textContent); await (await p.$('.sig-wrap')).screenshot({path:require('path').join(__dirname,'out','d4_overlay.png')});
await p.waitForTimeout(2600); out.after=await p.textContent('h1');
console.log(JSON.stringify(Object.assign(out,{errs}),null,1)); await b.close();})();
