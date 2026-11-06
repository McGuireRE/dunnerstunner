// Phase 5: after signing. Tim sets the stage of a countersigned property (on the market, under offer, sold, settled,
// withdrawn) from the property page; each move is confirmed and logged, going back needs a reason, and settling or
// withdrawing ends the agency. The journey map's stops 7 to 9 follow the stage for the vendor and for Tim. The dashboard
// reminds Tim of the review date (7 days ahead), the end of a variation's period and notices not yet sent, each linking
// to the right page. The reporting tables are Tim's only. Vendors can't set a stage or read any of them.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cat=fs.readFileSync(path.join(__dirname,'..','..','catalogue.js'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const URL='https://packages.dunnerstunner.co.nz/onboarding/';
(async()=>{
const b=await chromium.launch(); const errs=[], fail=[]; const expect=(ok,msg)=>{ if(!ok) fail.push(msg); }; const out={};
async function setup(w){
  const ctx=await b.newContext({viewport:{width:w||1024,height:900}});
  await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js',r=>r.fulfill({contentType:'application/javascript',body:cat}));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**',r=>r.fulfill({contentType:'text/html',body:html}));
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|row-level security|permission denied|Countersign|confirm the change|Say why|Put it on|Mark it sold|finished|already at/.test(m.text()))errs.push(m.text())});
  return {ctx,p};
}
const T0='2026-11-01T00:00:00Z';
const nzDay=(off)=>{ const d=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'})+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+(off||0)); return d.toISOString().slice(0,10); };
const startFor=(reviewOff)=>nzDay(reviewOff-90);   // commencement such that the review date (start + 90 days) is reviewOff days from today
const prop=(id,address,stage)=>({id,address,title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},stage,stage_at:T0,created_at:T0,updated_at:T0});
const pperson=(id,pid,name,email,user)=>({id,property_id:pid,position:1,legal_name:name,pref_name:'',email,phone:'',user_id:user||null,role:'owner',source:'agent',name_from:'agent'});
const ag=(id,pid,status,extra)=>Object.assign({id,ref:'MRE-2026-'+id,address:'x',property_id:pid,status,config:{appr:'done',ask:'875000',flat:'12000',thr:'250000',pct:'2.95',aml:'Manual',approach:'invited',start:nzDay(-10)},answers:{_step:9,prior:'none'},legal:{choice:'have'},agreement_version:'v3.15-26102026',signed_at:T0,created_at:T0},extra||{});
const aperson=(id,a,name,email,user)=>({id,agreement_id:a,position:1,legal_name:name,pref_name:'',email,phone:'',user_id:user||null,signed_at:T0,id_verified_at:T0});
const BASE={agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[],properties:[],property_people:[],property_documents:[],agreement_variations:[],prior_agency_notices:[],property_events:[]};
const seed=(p,db)=>p.evaluate(db=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify(db));},Object.assign({},BASE,db));
const login=async(p,id,email)=>{await p.evaluate(([id,email])=>localStorage.setItem('mocksession',JSON.stringify({user:{id,email}})),[id,email]); await p.goto(URL); await p.waitForTimeout(700);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb')));
const edit=(p,fn)=>p.evaluate(s=>{const d=JSON.parse(localStorage.getItem('mockdb')); (new Function('d',s))(d); localStorage.setItem('mockdb',JSON.stringify(d));},fn);
const TIM=['agent-1','hello@timmcguire.co.nz'];
const rpc=(p,name,args)=>p.evaluate(([n,a])=>window.supabase.createClient().rpc(n,a),[name,args]);
const sideways=p=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
const openProp=async(p,pid)=>{ await p.click('#navDash'); await p.waitForTimeout(400); await p.click(`tr[data-prop="${pid}"]`); await p.waitForTimeout(500); };
const stgBtns=p=>p.$$eval('#stgTile [data-stg]',e=>e.map(x=>x.dataset.stg));
const pill=p=>p.$eval('.view-pad .pill',e=>e.textContent.trim());
const BAD=/\b(will probably|probably|likely to|expected to|you should expect|within \d+ (days|weeks|months)|in \d+ (days|weeks)|guarantee)/i;
const jinfo=p=>p.evaluate(()=>{ const q=s=>[...document.querySelectorAll('#journey '+s)].map(e=>+e.dataset.j); const ov=document.querySelector('#journey'); return {here:q('.jstop.here'),done:q('.jstop.done'),ahead:q('.jstop.ahead'),pageSide:document.documentElement.scrollWidth>window.innerWidth,ovSide:ov.scrollWidth>ov.clientWidth,text:ov.innerText}; });
const openJ=async p=>{ await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(250); };
const closeJ=async p=>{ await p.click('#jClose'); await p.waitForTimeout(150); };
const tile=p=>p.$eval('#jTile',e=>e.innerText.replace(/\s+/g,' '));

const P1='P1', A1='A1';
const world=()=>({
  properties:[prop(P1,'14 Highgate, Maori Hill','signed')],
  property_people:[pperson('PP1',P1,'Jane Smith','jane@example.com','v-jane')],
  agreements:[ag(A1,P1,'countersigned')],
  agreement_people:[aperson('AP1',A1,'Jane Smith','jane@example.com','v-jane')],
});

// ---------- A to D. Tim sets the stage: confirmation, the log, going back with a reason, skipping, settling, withdrawing ----------
{ const {ctx,p}=await setup(1024);
  await p.goto(URL); await seed(p,world()); await login(p,...TIM);
  await openProp(p,P1);
  expect(await p.isVisible('#stgTile'),'A: the stage tile is on a countersigned property');
  expect((await stgBtns(p)).join()==='live,withdrawn','A: from Signed Tim is offered on the market or withdraw, nothing else (got '+(await stgBtns(p))+')');
  // a confirmation first; "Not now" changes nothing
  await p.click('[data-stg="live"]'); await p.waitForSelector('#stgConfirm');
  expect(/On the market/.test(await p.textContent('#stgConfirm')),'A: the confirmation names the stage');
  await p.click('#stgNo'); await p.waitForTimeout(150);
  expect(!(await p.$('#stgConfirm'))&&(await db(p)).properties[0].stage==='signed'&&!(await db(p)).property_events.length,'A: Not now changes nothing and logs nothing');
  await p.click('[data-stg="live"]'); await p.click('#stgYes'); await p.waitForTimeout(500);
  let d=await db(p);
  expect(d.properties[0].stage==='live','A: the stage is On the market after he confirms');
  expect(d.property_events.length===1&&d.property_events[0].kind==='stage_changed'&&d.property_events[0].actor===TIM[1]&&d.property_events[0].detail.from==='signed'&&d.property_events[0].detail.to==='live'&&d.property_events[0].at,'A: the move is logged with who, when, from and to');
  expect(d.agreement_events.some(e=>e.kind==='stage_changed'&&e.agreement_id===A1),'A: it is also in the agreement\'s record of events');
  expect((await pill(p))==='On the market','A: the property page shows the new stage');
  expect((await stgBtns(p)).join()==='under_offer,sold,withdrawn','A: from live: under offer, sold or withdraw (got '+(await stgBtns(p))+')');
  expect(/Stage history \(1\)/.test(await p.textContent('#stgTile')),'A: the history shows the move');
  // under offer, then an offer falls through: back needs a reason
  await p.click('[data-stg="under_offer"]'); await p.click('#stgYes'); await p.waitForTimeout(500);
  expect((await stgBtns(p)).join()==='sold,live,withdrawn','B: from under offer: sold, back to on the market, withdraw (got '+(await stgBtns(p))+')');
  expect(!/offer is|\$|price/i.test(await p.textContent('#stgTile').then(t=>t.replace(/Nothing about the offer itself is shown to them\./,''))),'B: the tile holds no offer details');
  await p.click('[data-stg="live"]'); await p.waitForSelector('#stgReason');
  await p.click('#stgYes'); await p.waitForTimeout(200);
  expect(/Say why/.test(await p.textContent('#stgErr'))&&(await db(p)).properties[0].stage==='under_offer','B: going back without a reason is stopped on screen and nothing changes');
  await p.fill('#stgReason','  '); await p.click('#stgYes'); await p.waitForTimeout(200);
  expect((await db(p)).properties[0].stage==='under_offer','B: a blank reason is no reason');
  await p.fill('#stgReason','Offer fell through, finance declined'); await p.click('#stgYes'); await p.waitForTimeout(500);
  d=await db(p); const back=d.property_events.at(-1);
  expect(d.properties[0].stage==='live'&&back.kind==='stage_back'&&back.detail.reason==='Offer fell through, finance declined'&&back.detail.from==='under_offer','B: a deliberate go back is allowed with its reason, and the reason is logged');
  expect(/Went back/.test(await p.textContent('#stgTile'))&&/finance declined/.test(await p.textContent('#stgTile')),'B: the history shows that it went back, and why');
  // the database refuses what the screen wouldn't offer (called directly)
  let r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'sold',p_confirmed:false}); expect(r.error&&/confirm/.test(r.error.message),'C: no move without confirmation: '+(r.error&&r.error.message));
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'settled',p_confirmed:true}); expect(r.error&&/sold before/.test(r.error.message),'C: settled only after sold');
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'live',p_confirmed:true}); expect(r.error&&/already/.test(r.error.message),'C: the same stage is refused');
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'appraisal',p_confirmed:true}); expect(r.error,'C: stages before signing can\'t be set here');
  expect((await db(p)).properties[0].stage==='live','C: refused moves change nothing');
  // forward past under offer is allowed; sold then settled ends the agency
  await p.click('[data-stg="sold"]'); await p.click('#stgYes'); await p.waitForTimeout(500);
  expect((await pill(p))==='Sold'&&(await stgBtns(p)).join()==='settled,under_offer,live,withdrawn','C: live to sold is allowed and offers settled, or back (got '+(await stgBtns(p))+')');
  await p.click('[data-stg="settled"]'); await p.waitForSelector('#stgConfirm');
  expect(/ends the agency/.test(await p.textContent('#stgConfirm')),'D: settling warns that it ends the agency');
  await p.click('#stgYes'); await p.waitForTimeout(600);
  d=await db(p);
  expect(d.properties[0].stage==='settled'&&d.agreements[0].status==='ended'&&d.agreements[0].ended_at,'D: settled ends the agency');
  expect(d.agreement_events.some(e=>e.kind==='agency_ended'&&e.detail.reason==='Sold and settled'),'D: through the existing end-agency path (reason Sold and settled)');
  expect(d.property_events.map(e=>e.detail.to).join()==='live,under_offer,live,sold,settled','D: the whole history is kept in order: '+d.property_events.map(e=>e.detail.to));
  expect((await stgBtns(p)).length===0&&await p.isVisible('[data-pfreopen="same"]'),'D: a settled property has no stage buttons, only start again');
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'live',p_reason:'oops',p_confirmed:true}); expect(r.error&&/finished/.test(r.error.message),'D: a settled property can\'t be moved back');
  expect(d.agreements[0].signed_at===T0&&d.agreement_people[0].signed_at===T0&&d.signatures.length===0,'D: signed records are untouched');
  await p.screenshot({path:path.join(__dirname,'out','as_settled_1024.png'),fullPage:true});
  // withdrawn on another property, with a note; and a signed but not countersigned agreement can't go on the market
  await edit(p,`d.properties.push({id:'P2',address:'3 Wharf St',title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},stage:'signed',stage_at:'${T0}',created_at:'${T0}',updated_at:'${T0}'});
    d.agreements.push({id:'A2',ref:'MRE-2026-A2',address:'3 Wharf St',property_id:'P2',status:'countersigned',config:{start:'${nzDay(-5)}'},answers:{},legal:{},created_at:'${T0}'});
    d.properties.push({id:'P3',address:'9 Ocean Rd',title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},stage:'signed',stage_at:'${T0}',created_at:'${T0}',updated_at:'${T0}'});
    d.agreements.push({id:'A3',ref:'MRE-2026-A3',address:'9 Ocean Rd',property_id:'P3',status:'signed',config:{start:'${nzDay(-5)}'},answers:{},legal:{},created_at:'${T0}'});`);
  await p.reload(); await p.waitForTimeout(600); await openProp(p,'P2');
  await p.click('[data-stg="live"]'); await p.click('#stgYes'); await p.waitForTimeout(500);
  await p.click('[data-stg="withdrawn"]'); await p.waitForSelector('#stgReason');
  expect(/ends the agency/.test(await p.textContent('#stgConfirm')),'E: withdrawing warns that it ends the agency');
  await p.fill('#stgReason','Vendors have decided to wait'); await p.click('#stgYes'); await p.waitForTimeout(600);
  d=await db(p);
  expect(d.properties.find(x=>x.id==='P2').stage==='withdrawn'&&d.agreements.find(x=>x.id==='A2').status==='ended','E: withdrawn ends the agency');
  expect(d.property_events.some(e=>e.property_id==='P2'&&e.detail.to==='withdrawn'&&e.detail.reason==='Vendors have decided to wait'),'E: the note is kept in the record');
  expect(d.agreement_events.some(e=>e.agreement_id==='A2'&&e.kind==='agency_ended'&&e.detail.reason==='Withdrawn'),'E: through the existing end-agency path (reason Withdrawn)');
  await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P3"]'); await p.waitForTimeout(500);
  expect((await stgBtns(p)).length===0&&/Countersign the agreement/.test(await p.textContent('#stgTile')),'F: a signed but not countersigned agreement has no stage buttons, and says why');
  r=await rpc(p,'agent_set_stage',{pid:'P3',p_stage:'live',p_confirmed:true}); expect(r.error&&/Countersign/.test(r.error.message),'F: the database refuses it too');
  // stage tile at 390, light and dark
  await p.setViewportSize({width:390,height:844}); await p.click('#navDash'); await p.waitForTimeout(300); await p.click('tr[data-prop="P3"]'); await p.waitForTimeout(500);
  expect(!(await sideways(p)),'F: the property page with the stage tile fits 390');
  await p.emulateMedia({colorScheme:'dark'}); await p.waitForTimeout(150); expect(!(await sideways(p)),'F: and in dark mode');
  await ctx.close();
}

// ---------- G. The journey map follows the stage: stops 7 to 9, for the vendor and for Tim ----------
{ const {ctx,p}=await setup(1024);
  await p.goto(URL); await seed(p,world()); await login(p,...TIM);
  const vendorAt=async(stage,reload)=>{ // the vendor opens the map
    await edit(p,`d.properties[0].stage='${stage}'`);
    await p.evaluate(()=>localStorage.setItem('mocksession',JSON.stringify({user:{id:'v-jane',email:'jane@example.com'}}))); await p.setViewportSize({width:390,height:844}); await p.goto(URL); await p.waitForTimeout(700);
    await openJ(p); const i=await jinfo(p); await closeJ(p); return i; };
  const timAt=async()=>{ await p.evaluate(()=>localStorage.setItem('mocksession',JSON.stringify({user:{id:'agent-1',email:'hello@timmcguire.co.nz'}}))); await p.setViewportSize({width:1024,height:900}); await p.goto(URL); await p.waitForTimeout(600); await openProp(p,P1); return tile(p); };
  const steps=[['signed',[6],null,null],['live',[7],[1,2,3,4,5,6],'Your property is on the market.'],['under_offer',[8],[1,2,3,4,5,6,7],'Your property is under offer.'],['sold',[9],[1,2,3,4,5,6,7,8],'Your property has sold. Settlement is next.'],['settled',[],[1,2,3,4,5,6,7,8,9],'Settlement is done.']];
  for (const [stage,here,done,say] of steps) {
    const i=await vendorAt(stage); out['vendor_'+stage]={here:i.here,done:i.done};
    if (stage!=='signed') {
      expect(i.here.join()===here.join(),'G: vendor at '+stage+': marker at '+here+' (got '+i.here+')');
      expect(done.every(k=>i.done.includes(k)),'G: vendor at '+stage+': earlier stops ticked (got '+i.done+')');
      expect(i.text.includes(say),'G: vendor at '+stage+': plain wording "'+say+'"');
    } else expect(i.here.join()==='6'||i.here.join()==='5'||i.here.join()==='','G: the signed stage is still before the market');
    expect(!i.pageSide&&!i.ovSide,'G: the map fits 390 at '+stage);
    expect(!BAD.test(i.text)&&!/offer (of|for|at)|\$\d|asking|price/i.test(i.text.replace(/Questions at any stage/,'')),'G: nothing predictive or about offers in the wording at '+stage);
    expect(!/—|–/.test(i.text),'G: no long dashes at '+stage);
    const t=await timAt();
    if (stage==='settled') expect(/All nine stops are done/.test(t),'G: Tim\'s tile: all nine done once settled');
    else if (stage!=='signed') expect(new RegExp('Stop '+here[0]+' of 9').test(t),'G: Tim\'s tile follows the same stage ('+stage+'): '+t.slice(0,80));
  }
  // an offer that falls through moves the marker back for both
  await edit(p,`d.properties[0].stage='live'; d.agreements[0].status='countersigned'; d.agreements[0].ended_at=null; d.property_events.push({id:99,property_id:'P1',at:'${T0}',actor:'hello@timmcguire.co.nz',kind:'stage_back',detail:{from:'under_offer',to:'live',reason:'Offer fell through, finance declined'}});`);
  const i2=await vendorAt('live'); expect(i2.here.join()==='7'&&!i2.done.includes(8),'G: after going back the vendor is at On the market again, and the offer stop is ahead');
  expect(!/fell through|finance/i.test(i2.text),'G: a reason Tim logged is never shown to the vendor');
  // dark mode
  await p.emulateMedia({colorScheme:'dark'}); await openJ(p); const idk=await jinfo(p); expect(!idk.pageSide&&!idk.ovSide&&idk.here.join()==='7','G: the map at stop 7 fits in dark mode'); await p.screenshot({path:path.join(__dirname,'out','as_journey7_dark_390.png')}); await closeJ(p);
  await p.emulateMedia({colorScheme:'light'});
  await ctx.close();
}

// ---------- H. Vendors can't set a stage or read the stage record and the reporting tables; Tim can use the tables, not delete ----------
{ const {ctx,p}=await setup(1024);
  await p.goto(URL); await seed(p,world()); await login(p,...TIM);
  const c=(t,row)=>p.evaluate(([t,row])=>window.supabase.createClient().from(t).insert(row),[t,row]);
  let r=await c('campaign_stats',{property_id:P1,period_start:'2026-11-01',period_end:'2026-11-07',metrics:{views:12}}); expect(!r.error,'H: Tim can add campaign statistics');
  r=await c('buyer_feedback',{property_id:P1,feedback:'Liked the kitchen',source:'open_home'}); expect(!r.error,'H: Tim can add buyer feedback');
  r=await c('property_offers',{property_id:P1,amount:900000,status:'received'}); expect(!r.error,'H: Tim can add an offer record');
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'live',p_confirmed:true}); expect(!r.error,'H: Tim can set a stage');
  const del=await p.evaluate(()=>window.supabase.createClient().from('property_offers').delete().eq('property_id','P1')); expect(del.error&&/permission denied/.test(del.error.message),'H: a reporting row can\'t be deleted');
  const dir=await c('property_events',{property_id:P1,actor:'x',kind:'stage_changed'}); expect(dir.error,'H: nobody writes the stage record directly');
  const upd=await p.evaluate(()=>window.supabase.createClient().from('property_events').update({actor:'z'}).eq('property_id','P1')); expect(upd.error,'H: the stage record can\'t be changed');
  expect((await db(p)).property_events.length===1,'H: the stage record is as it was');
  // the vendor
  await p.evaluate(()=>localStorage.setItem('mocksession',JSON.stringify({user:{id:'v-jane',email:'jane@example.com'}}))); await p.goto(URL); await p.waitForTimeout(700);
  r=await rpc(p,'agent_set_stage',{pid:P1,p_stage:'under_offer',p_confirmed:true}); expect(r.error&&/Agent only/.test(r.error.message),'H: a vendor can\'t set a stage: '+(r.error&&r.error.message));
  expect((await db(p)).properties[0].stage==='live','H: and the stage is unchanged');
  for (const t of ['property_events','campaign_stats','buyer_feedback','property_offers']) {
    const s=await p.evaluate(t=>window.supabase.createClient().from(t).select('*'),t); expect(!s.error&&s.data.length===0,'H: a vendor reads nothing from '+t+' (got '+(s.data&&s.data.length)+')');
    const w=await c(t,{property_id:P1,feedback:'x',actor:'x',kind:'x',period_start:'2026-11-01',period_end:'2026-11-02'}); expect(w.error,'H: a vendor can\'t write to '+t);
  }
  const own=await p.evaluate(()=>window.supabase.createClient().from('properties').select('id,stage')); expect(own.data.length===1&&own.data[0].stage==='live','H: a vendor still reads their own property\'s stage');
  expect(!(await p.$('#stgTile')),'H: the vendor never sees Tim\'s stage tile');
  await ctx.close();
}

// ---------- I. Dashboard reminders under Needs you ----------
{ const {ctx,p}=await setup(1024);
  await p.goto(URL);
  const mk=(n,reviewOff,extra)=>({prop:prop('RP'+n,'Reminder House '+n,'live'),pp:pperson('RPP'+n,'RP'+n,'Owner '+n,'o'+n+'@example.com'),ag:ag('RA'+n,'RP'+n,'countersigned',Object.assign({address:'Reminder House '+n,config:{appr:'done',ask:'800000',flat:'10000',thr:'250000',pct:'3',aml:'Manual',approach:'invited',start:startFor(reviewOff)}},extra||{}))});
  const rows=[mk(1,7),mk(2,8),mk(3,-3),mk(4,0),mk(5,30),mk(6,6)];   // 7 ahead (shown), 8 (not yet), passed, today, far off, 6 ahead; 6 becomes a sold property
  const variationSigned=(id,agId,number,reviewUntil)=>({id,agreement_id:agId,number,status:'signed',changes:{reviewUntil},summary:[{label:'Review date'}],created_at:T0});
  await seed(p,{properties:rows.map(r=>r.prop),property_people:rows.map(r=>r.pp),agreements:rows.map(r=>r.ag),
    agreement_variations:[variationSigned('V5','RA5',1,nzDay(5))]});   // RA5's review date was extended; the extension ends in 5 days
  await edit(p,`d.properties.find(x=>x.id==='RP6').stage='sold'`);
  await login(p,...TIM); await p.click('#navDash'); await p.waitForTimeout(600);
  const needs=()=>p.$$eval('.needs li',e=>e.map(x=>x.querySelector('.what').innerText.replace(/\s+/g,' ')));
  let n=await needs(); out.needs=n;
  const has=(re)=>n.some(x=>re.test(x));
  expect(has(/Review date in 7 days.*Reminder House 1/),'I: the review date 7 days ahead appears');
  expect(!has(/Reminder House 2/),'I: 8 days ahead does not appear yet');
  expect(has(/The review date has passed.*Reminder House 3/),'I: a review date that has passed still appears until it is dealt with');
  expect(has(/Review date today.*Reminder House 4/),'I: a review date today appears');
  expect(!has(/Reminder House 6/),'I: a property that has sold has no review reminder');
  expect(has(/The extended period ends in 5 days.*Reminder House 5/),'I: the end of a variation\'s period appears, worded as the extension');
  expect(has(/Review date in 7 days.*Fixed period ends/),'I: it says when the fixed period ends');
  expect(!has(/Reminder House 5.*Review date in 30/),'I: the original review date of an extended agreement is not reminded');
  const stat=await p.$eval('.stat.hot .n,.stat .n',e=>+e.textContent); expect(stat===n.length,'I: the Need you count includes them ('+stat+' vs '+n.length+')');
  expect(!(await sideways(p)),'I: dashboard fits at 1024');
  // opening one lands on the agreement, at the variations part, with the right property
  const idx=n.findIndex(x=>/Reminder House 1/.test(x));
  await p.click(`[data-need="${idx}"]`); await p.waitForTimeout(600);
  expect(/Reminder House 1/.test(await p.textContent('h1')),'I: the reminder opens that property\'s agreement');
  const vis=await p.evaluate(()=>{ const e=document.querySelector('#varPanel'); if(!e) return null; const r=e.getBoundingClientRect(); return r.top>=-2&&r.top<window.innerHeight; });
  expect(vis===true,'I: and scrolls to the part about the review date and extending');
  // Done ticks it off, and it stays gone
  await p.click('#toList'); await p.waitForTimeout(500);
  n=await needs(); const i3=n.findIndex(x=>/Reminder House 3/.test(x));
  await p.click(`[data-needdone="${i3}"]`); await p.waitForTimeout(600);
  n=await needs(); expect(!has(/Reminder House 3/),'I: Done removes a review reminder');
  let d=await db(p); expect(d.agreement_events.some(e=>e.agreement_id==='RA3'&&e.kind==='review_checked'&&e.detail.date===nzDay(-3)),'I: and it is recorded who and when');
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs(); expect(!has(/Reminder House 3/),'I: it stays gone after a reload');
  // a signed variation that extends the date makes the reminder go
  await edit(p,`d.agreement_variations.push({id:'V1',agreement_id:'RA1',number:1,status:'signed',changes:{reviewUntil:'${nzDay(60)}'},summary:[{label:'Review date'}],created_at:'${T0}'});`);
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs();
  expect(!has(/Reminder House 1/),'I: extending the review date by a signed variation clears the reminder');
  // an unsigned (sent) variation does not
  await edit(p,`d.agreement_variations.find(x=>x.id==='V1').status='sent'`);
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs();
  expect(has(/Review date in 7 days.*Reminder House 1/),'I: a variation still waiting for signatures doesn\'t move the date');
  // the agreement ending clears it
  await edit(p,`d.agreements.find(x=>x.id==='RA4').status='ended'`);
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs(); expect(!has(/Reminder House 4/),'I: an ended agreement has no reminder');
  // not started (appraisal pending) has no review date
  await edit(p,`d.agreements.find(x=>x.id==='RA1').config={appr:'pending'}; d.agreements.find(x=>x.id==='RA1').signed_at='${nzDay(-83)}T00:00:00Z'`);
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs(); expect(!has(/Reminder House 1/),'I: an agreement still waiting for its appraisal has no review date');
  await p.screenshot({path:path.join(__dirname,'out','as_needs_1024.png'),fullPage:true});
  // phone, light and dark
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(150);
  expect(!(await sideways(p)),'I: Needs you with reminders fits 390 (light)');
  await p.emulateMedia({colorScheme:'dark'}); await p.waitForTimeout(150); expect(!(await sideways(p)),'I: and dark'); await p.screenshot({path:path.join(__dirname,'out','as_needs_dark_390.png'),fullPage:true});
  await p.emulateMedia({colorScheme:'light'});
  await ctx.close();
}

// ---------- J. Prior-agency notices not yet sent ----------
{ const {ctx,p}=await setup(1024);
  await p.goto(URL);
  await seed(p,{properties:[prop('NP1','5 Notice Lane','signed'),prop('NP2','6 Ended Lane','withdrawn')],property_people:[pperson('NPP1','NP1','Owner N','n@example.com')],
    agreements:[ag('NA1','NP1','signed',{address:'5 Notice Lane',config:{appr:'done',ask:'800000',flat:'10000',thr:'250000',pct:'3',aml:'Manual',approach:'invited',start:nzDay(-2)},answers:{prior:'yes',priorAgencies:[{agency:'Smith Realty Ltd',kind:'Sole agency',dated:'3 August 2026',email:''}]}}), ag('NA2','NP2','ended',{address:'6 Ended Lane'})],
    agreement_people:[aperson('NAP1','NA1','Owner N','n@example.com','v-n')],
    prior_agency_notices:[{id:'N1',agreement_id:'NA1',idx:0,agency:'Smith Realty Ltd',kind:'Sole agency',status:'to_send',created_at:T0},{id:'N2',agreement_id:'NA2',idx:0,agency:'Old Agency Ltd',kind:'Sole agency',status:'to_send',created_at:T0}]});
  await login(p,...TIM); await p.click('#navDash'); await p.waitForTimeout(600);
  const needs=()=>p.$$eval('.needs li',e=>e.map(x=>x.querySelector('.what').innerText.replace(/\s+/g,' ')));
  let n=await needs();
  expect(n.some(x=>/Send the notice to Smith Realty Ltd.*5 Notice Lane.*not sent yet/.test(x)),'J: a notice not yet sent appears: '+n.join(' | '));
  expect(!n.some(x=>/Old Agency/.test(x)),'J: a notice on an ended agreement doesn\'t');
  const idx=n.findIndex(x=>/Smith Realty/.test(x)); await p.click(`[data-need="${idx}"]`); await p.waitForTimeout(600);
  expect(/5 Notice Lane/.test(await p.textContent('h1')),'J: it opens that property\'s agreement');
  expect(await p.evaluate(()=>{ const e=document.querySelector('#noticePanel'); if(!e) return false; const r=e.getBoundingClientRect(); return r.top>=-2&&r.top<window.innerHeight; }),'J: at the notices');
  await edit(p,`d.prior_agency_notices[0].status='sent'; d.prior_agency_notices[0].sent_at='${T0}'`);
  await p.reload(); await p.waitForTimeout(700); await p.click('#navDash'); await p.waitForTimeout(500); n=await needs(); expect(!n.some(x=>/Smith Realty/.test(x)),'J: once it is sent, the reminder goes');
  await ctx.close();
}

await b.close();
console.log(JSON.stringify({out,fail,errs:errs.concat(fail.map(x=>'FAILED: '+x))},null,1));
})();
