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
const as=async(id,email)=>{await p.evaluate(([id,email])=>localStorage.setItem('mocksession',JSON.stringify({user:{id,email}})),[id,email]); await go();};
const tick=async sel=>p.$$eval(sel,els=>els.forEach(e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}));
const next=async(w=400)=>{await p.click('#next'); await p.waitForTimeout(w);};
const out={};
await go(); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('mockdb',JSON.stringify({agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[],prelistings:[]}));});
// 1 agent creates appraisal page
await as('agent-1','hello@timmcguire.co.nz');
await p.click('#navDash'); await p.waitForTimeout(500); await p.click('#newPl'); await p.waitForTimeout(300);
await p.click('#plSaveAp'); await p.waitForTimeout(200); out.e1=await p.textContent('#plApErr');
await p.fill('#plAddr','22 Queens Drive, Belleknowes'); await p.fill('#plCName','William Jones'); await p.fill('#plCEmail','bill@example.com');
await p.selectOption('#plMethod','Auction'); await p.fill('#plPrice','$850,000 to $900,000'); await p.fill('#plStart','Early February'); await p.fill('#plMkt','Premium package, $5,800'); await p.fill('#plNote','Lovely home with great light.');
await p.click('#plSaveAp'); await p.waitForTimeout(400); out.agentH1=await p.textContent('h1');
await p.click('#plEmail'); await p.waitForTimeout(300);
// 2 vendor
await as('v-bill','bill@example.com'); out.vH1=await p.textContent('h1'); out.vBtn=await p.textContent('#next'); await p.screenshot({path:require('path').join(__dirname,'out','q1_appraisal.png'),fullPage:true});
await next(); out.s1=await p.textContent('main h1'); out.s1count=await p.textContent('#stepCount'); await p.screenshot({path:require('path').join(__dirname,'out','q2_step1.png'),fullPage:true});
await p.fill('#pl_spoke','Yes, one other agent came through.'); await p.fill('#pl_spokeFeel','Liked their energy, wondered about the price they quoted.');
await next(); await p.fill('#pl_choose','Probably you.'); await p.fill('#pl_chooseWhy','You listened.');
await next(); await p.fill('#pl_ideas','Twilight photos.');
await next(); out.s4=await p.textContent('main h1'); await tick('input[name=rate_method][value="4"]'); await tick('input[name=rate_price][value="3"]'); await p.fill('#pl_likeMost','The timing.'); await p.screenshot({path:require('path').join(__dirname,'out','q3_step4.png'),fullPage:true});
await next(); out.s5helper=await p.textContent('main .small');  await p.fill('#pl_easyYes','Clear communication.');
await next(); out.s6=await p.textContent('main h1'); out.prefEmail=await p.inputValue('.plo [data-o=email]');
await p.fill('.plo [data-o=name]','William Robert Jones'); await p.fill('.plo [data-o=pref]','Bill'); await p.fill('.plo [data-o=mobile]','021 123 4567');
await p.click('#plAddO'); await p.fill('.plo:nth-of-type(2) [data-o=name]','Mary Jones');
await tick('[data-meet][value="Weekday evenings"]');
out.sendLabel=await p.textContent('#next'); await next(300); out.e6=await p.textContent('.err');
await p.fill('.plo:nth-of-type(2) [data-o=email]','mary@example.com'); await p.screenshot({path:require('path').join(__dirname,'out','q4_step6.png'),fullPage:true});
await next(600); out.thanks=await p.textContent('h1'); await p.screenshot({path:require('path').join(__dirname,'out','q5_thanks.png'),fullPage:true});
// back & resume check: reload shows thanks
await go(); out.reload=await p.textContent('h1');
// 3 agent publishes plan
await as('agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500); out.listStatus=await p.textContent('tr[data-plrow] .pill'); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500); await p.click('[data-plopen]'); await p.waitForTimeout(400);
out.answersShown=(await p.textContent('.view-pad')).includes('Twilight photos');
await p.click('#plPublish'); await p.waitForTimeout(200); out.pubErr=await p.textContent('#plErr');
await p.fill('.plp [data-p=said]','You wondered about the price another agent quoted.'); await p.fill('.plp [data-p=changed]','I\'ve added recent sales so you can see where the range comes from.');
await p.click('#plAddPair'); await p.fill('.plp:nth-of-type(2) [data-p=said]','Twilight photos.'); await p.fill('.plp:nth-of-type(2) [data-p=changed]','Added to the campaign at no extra cost.');
await p.screenshot({path:require('path').join(__dirname,'out','q6_agent.png'),fullPage:true});
await p.click('#plPublish'); await p.waitForTimeout(500);
// 4 vendor sees plan, asks question
await as('v-bill','bill@example.com'); out.planH1=await p.textContent('h1'); out.nextDisabled=await p.$eval('#next',b=>b.disabled); await p.screenshot({path:require('path').join(__dirname,'out','q7_plan.png'),fullPage:true});
await p.click('#plAsk'); await p.fill('#plQ','Will there be open homes on Sundays?'); await p.click('#plQGo'); await p.waitForTimeout(400); out.qH1=await p.textContent('h1');
// 5 agent republishes
await as('agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500); await p.click('[data-plopen]'); await p.waitForTimeout(400); out.agentQ=await p.textContent('.warnc'); await p.click('#plPublish'); await p.waitForTimeout(500);
// 6 vendor accepts
await as('v-bill','bill@example.com'); await tick('#plOk'); out.enabled=!(await p.$eval('#next',b=>b.disabled)); await next(600); out.onward=await p.textContent('h1'); await p.screenshot({path:require('path').join(__dirname,'out','q8_onward.png'),fullPage:true});
// 7 agent opens the agreement
await as('agent-1','hello@timmcguire.co.nz'); await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500); await p.click('[data-plopen]'); await p.waitForTimeout(400); await p.click('#plOpenAg'); await p.waitForTimeout(500);
out.tPeople=await p.$$eval('#tPeople [data-pk=legal_name]',e=>e.map(x=>x.value)); out.tPref=await p.$$eval('#tPeople [data-pk=pref_name]',e=>e.map(x=>x.value)); out.tAddr=await p.inputValue('#tAddr');
const db=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdb'))); const ag=db.agreements[0];
out.agCfg={method:ag.config.method,ask:ag.config.ask,pl:!!ag.config.prelisting_id};
// 8 Tim sends it; vendor lands in the agreement
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('mockdb')); d.agreements[0].status='sent'; localStorage.setItem('mockdb',JSON.stringify(d));});
await as('v-bill','bill@example.com'); out.agH1=await p.textContent('h1'); await next(400); await next(400); out.step1=await p.textContent('main h1'); out.checkNote=(await p.textContent('main')).includes('matches the title exactly');
out.inv=await p.evaluate(()=>localStorage.getItem('inv'));
out.side=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
console.log(JSON.stringify(Object.assign(out,{errs}),null,1)); await b.close();})();
