(function(){
const DB = JSON.parse(localStorage.getItem('mockdb')||'null') || {agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};
window.__mockDB = DB;   // tests reach the mock's own data (as another request would leave it)
const save=()=>{ try{ sharedSync(); }catch(e){ console.warn('sharedSync',e); } localStorage.setItem('mockdb',JSON.stringify(DB)); };   // LW0: the shared records follow every write, as the triggers do
const uid=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
// ── property file emulation (mirrors migrations/001 and 002) ──
const PT=()=>(DB.properties||=[]), PP=()=>(DB.property_people||=[]);
const DESC=['pType','pYear','pBed','pBath','pFloor','pLand','pBuild','pPark','pHeat','pLove','chattels','chatOther'], DISC=['work','workDetail','wt','wtDetail','meth','methDetail','def','defDetail','hazards','hazOther'];
const pick=(j,ks)=>{const o={}; ks.forEach(k=>{ if(j&&k in j) o[k]=j[k]; }); return o;};
function newProp(address){ const p={id:uid(),address:address||'',title_ref:null,owners_on_title:null,ownership:{},description:{},disclosures:{},found:{},provenance:{},stage:'appraisal',stage_at:now(),created_at:now(),updated_at:now()}; PT().push(p); return p; }
const norm=x=>(x||'').toLowerCase().replace(/\s+/g,' ').trim();
const sameName=(a,b)=>{ a=norm(a); b=norm(b); if(!a||!b) return false; if(a===b) return true; const A=a.split(' '), B=b.split(' '); return A.length>1&&B.length>1&&A[0]===B[0]&&A.at(-1)===B.at(-1); };
const nameRank=s=>s==='appraisal'?1:s==='questionnaire'?2:3;
const active=pid=>PP().filter(x=>x.property_id===pid&&(x.role||'owner')!=='former');
function mergePerson(pid,name,pref,email,phone,user,source){ const em=(email||'').trim().toLowerCase(), nm=(name||'').replace(/\s+/g,' ').trim(); if(!nm&&!em) return null;
  let r=active(pid).find(x=>em&&(x.email||'').toLowerCase()===em) || (nm?active(pid).find(x=>(!em||!x.email)&&sameName(x.legal_name,nm)):null);
  if(!r){ r={id:uid(),property_id:pid,position:active(pid).reduce((m,x)=>Math.max(m,x.position),0)+1,legal_name:nm,pref_name:(pref||'').trim(),email:em,phone:(phone||'').trim(),user_id:user||null,source,name_from:source,role:'owner',created_at:now(),updated_at:now()}; PP().push(r); }
  else { if(nm&&(!r.legal_name||nameRank(source)>=nameRank(r.name_from||r.source))){ r.legal_name=nm; r.name_from=source; } if((pref||'').trim()) r.pref_name=pref.trim(); if(em&&!r.email) r.email=em; if((phone||'').trim()) r.phone=phone.trim(); if(user&&!r.user_id) r.user_id=user; if(r.role==='contact'&&source!=='appraisal') r.role='owner'; }
  return r.id; }
const RANK=['appraisal','questionnaire','plan','accepted','agreement','signed','live','under_offer','sold','settled'];
function bump(pid,st){ const p=PT().find(x=>x.id===pid); if(p&&p.stage!=='withdrawn'&&RANK.indexOf(p.stage)<RANK.indexOf(st)){ p.stage=st; p.stage_at=now(); } }
const live=a=>!['ended','cancelled'].includes(a.status);
function syncAgreement(ag,old){ if(!ag.property_id) return; const p=PT().find(x=>x.id===ag.property_id); if(!p) return;
  const others=(DB.agreements||[]).filter(o=>o.property_id===p.id&&o.id!==ag.id&&live(o));
  const changed=!old||old.address!==ag.address||JSON.stringify(old.config)!==JSON.stringify(ag.config)||JSON.stringify(old.answers)!==JSON.stringify(ag.answers);
  if(live(ag)&&changed&&!others.some(o=>(o.created_at||'')>(ag.created_at||''))){ if(ag.address) p.address=ag.address; if((ag.config||{}).title) p.title_ref=ag.config.title; if((ag.config||{}).owners) p.owners_on_title=ag.config.owners; Object.assign(p.ownership,pickKeep(p.ownership,pick(ag.answers,['capacity','entity']))); Object.assign(p.description,pickKeep(p.description,pick(ag.answers,DESC))); Object.assign(p.disclosures,pickKeep(p.disclosures,pick(ag.answers,DISC))); }
  if(!live(ag)){ if(old&&live(old)&&!others.length&&!['settled','withdrawn'].includes(p.stage)){ p.stage='withdrawn'; p.stage_at=now(); } }
  else bump(p.id, ['signed','countersigned'].includes(ag.status)?'signed':'agreement'); }
function syncPrelisting(pl,old){ if(!pl.property_id) return; if(old&&old.address!==pl.address&&!(DB.agreements||[]).some(a=>a.property_id===pl.property_id&&live(a))){ const p=PT().find(x=>x.id===pl.property_id); if(p) p.address=pl.address; } bump(pl.property_id, {appraisal:pl.proceeded_at?'questionnaire':'appraisal',submitted:'questionnaire',plan:'plan',question:'plan',accepted:'accepted'}[pl.status]||'appraisal'); }
function personGone(r){ const ag=(DB.agreements||[]).find(x=>x.id===r.agreement_id); if(!ag||!ag.property_id||!live(ag)) return;
  const onOther=x=>(DB.agreements||[]).some(o=>o.property_id===ag.property_id&&o.id!==ag.id&&live(o)&&DB.agreement_people.some(y=>y.agreement_id===o.id&&((x.email&&(y.email||'').toLowerCase()===x.email)||norm(y.legal_name)===norm(x.legal_name))));
  active(ag.property_id).forEach(x=>{ if(((r.email&&x.email===r.email.toLowerCase())||(!r.email&&norm(x.legal_name)===norm(r.legal_name)))&&!onOther(x)) x.role='former'; }); }
// the guards on signed records (guard_signed_agreement, guard_signed_person)
const noNotes=c=>{ const o=Object.assign({},c||{}); delete o.agent_notes; return JSON.stringify(o); };
function guard(table,r,payload){ if(table==='agreements'&&(DB.agreement_people||[]).some(x=>x.agreement_id===r.id&&x.signed_at)&&(('address' in payload&&payload.address!==r.address)||('answers' in payload&&JSON.stringify(payload.answers)!==JSON.stringify(r.answers))||('config' in payload&&noNotes(payload.config)!==noNotes(r.config)))) throw new Error('This agreement has been signed, so its terms can no longer be changed');
  if(table==='agreement_people'&&r.signed_at&&['legal_name','email','position'].some(k=>k in payload&&payload[k]!==r[k])) throw new Error('This person has signed, so their name and email can no longer be changed');
  if(table==='property_forms'&&(('status' in payload&&(payload.status==='signed')!==(r.status==='signed'))||['signed_at','countersigned_at','document_id','filing_at'].some(k=>k in payload&&(payload[k]??null)!==(r[k]??null)))) throw new Error('A document is only signed or filed by signing it');
  if(table==='property_forms'&&(DB.form_signatures||[]).some(x=>x.form_id===r.id)){ if(['data','agent_data','kind','form_version','agreement_id','property_id'].some(k=>k in payload&&!same(payload[k],r[k]))) throw new Error('This document has been signed, so it can no longer be changed'); if(r.status==='signed'&&'status' in payload&&payload.status!=='signed') throw new Error('This document has been signed by everyone'); }
  if(['form_signatures','guide_receipts','signatures'].includes(table)) throw new Error('Records in '+table+' cannot be changed or deleted');
  if(table==='properties'&&(('found' in payload&&!same(payload.found,r.found||{}))||('provenance' in payload&&!same(payload.provenance,r.provenance||{})))) throw new Error('Public record values are only saved with Use these'); }
function personSync(ap,old){ const ag=(DB.agreements||[]).find(x=>x.id===ap.agreement_id); if(ag&&ag.property_id&&live(ag)&&old&&old.email&&ap.email&&old.email.toLowerCase()!==ap.email.toLowerCase()&&!active(ag.property_id).some(x=>x.email===ap.email.toLowerCase())) active(ag.property_id).forEach(x=>{ if(x.email===old.email.toLowerCase()) x.email=ap.email.trim().toLowerCase(); }); if(ag&&ag.property_id&&live(ag)) mergePerson(ag.property_id,ap.legal_name,ap.pref_name,ap.email,ap.phone,ap.user_id,'agreement'); }
// backfill on load, like the migration
(DB.agreements||[]).slice().sort((a,b)=>(a.created_at||'')<(b.created_at||'')?-1:1).forEach(ag=>{ if(ag.property_id) return; let p=PT().find(x=>ag.address&&x.address.toLowerCase().trim()===ag.address.toLowerCase().trim()); if(!p) p=newProp(ag.address); ag.property_id=p.id; (DB.agreement_people||[]).filter(x=>x.agreement_id===ag.id).forEach(x=>mergePerson(p.id,x.legal_name,x.pref_name,x.email,x.phone,x.user_id,'agreement')); syncAgreement(ag); if(ag.status==='ended'&&!(DB.agreements||[]).some(o=>o.property_id===p.id&&o.status!=='ended')) p.stage='withdrawn'; });
(DB.prelistings||[]).forEach(pl=>{ if(pl.property_id) return; const ag=(DB.agreements||[]).find(x=>x.id===pl.agreement_id); let p=ag?PT().find(x=>x.id===ag.property_id):PT().find(x=>pl.address&&x.address.toLowerCase().trim()===pl.address.toLowerCase().trim()); if(!p) p=newProp(pl.address); pl.property_id=p.id; mergePerson(p.id,pl.contact_name,'',pl.contact_email,'',pl.user_id,'appraisal'); syncPrelisting(pl); });
// ── LW0, the shared records (mirrors migrations/028): one property profile, one person record, the question bank ──
// The database keeps these in step with triggers; the mock does the same after every write (sharedSync, from save()), recording
// only what changed, so the result is the same as the triggers' (same choice rules: Tim's own entries chosen and ticked, an
// agreement's value chosen only when nothing ticked stands, a record never replacing a person's entry, a cleared value handing over to
// the newest other one). Nobody writes these tables directly; vendors read only their own profile (never Relab) and their own answers.
const PROFILE_KEYS=['pType','pYear','pBed','pBath','pFloor','pLand','pBuild','pPark','pHeat','pLove','chattels','chatOther','title_ref','legal_description','title_type','capital_value','land_value','improvements_value','valuation_ref','rates_council','rates_orc','zone','land_use','owners_relab'];
const PROFILE_LABEL={pType:'Type of property',pYear:'Year built',pBed:'Bedrooms',pBath:'Bathrooms',pFloor:'Floor area (m²)',pLand:'Land area (m²)',pBuild:'Construction',pPark:'Parking',pHeat:'Heating',pLove:'What they love about it',chattels:'Chattels',chatOther:'Other chattels',title_ref:'Title reference',legal_description:'Legal description',title_type:'Title type',capital_value:'Capital value',land_value:'Land value',improvements_value:'Value of improvements',valuation_ref:'Valuation reference',rates_council:'City or district rates',rates_orc:'Regional rates',zone:'District plan zone',land_use:'Land use',owners_relab:'Owners (Relab)'};
const SHARED_TABLES=['property_fact_values','property_profile','person_links','crm_contacts','crm_contact_methods','crm_property_links','property_person_roles','qa_answers','qa_questions','profile_keys','shared_record_log'];
const QA_PL={spoke:'other_agents_spoken',spokeFeel:'other_agents_feel',choose:'agent_choice_same_fee',chooseWhy:'agent_choice_why',ideas:'plan_ideas',conf:'plan_confidence',likeMost:'plan_like_most',easyYes:'easy_yes',meet:'meeting_times'};
const FV=()=>(DB.property_fact_values||=[]), PRF=()=>(DB.property_profile||=[]), CT=()=>(DB.crm_contacts||=[]), CM=()=>(DB.crm_contact_methods||=[]), PLK=()=>(DB.person_links||=[]), CPL=()=>(DB.crm_property_links||=[]), QA=()=>(DB.qa_answers||=[]);
const recKind=s=>['council','reinz','relab','title','reader'].includes(s)?'record':'person';
const OFFICIAL_KINDS=['Record of title','Cross lease or unit title document','Survey plan'];
const lwToday=()=>new Date().toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric',timeZone:'Pacific/Auckland'});
let SEQ=0; const stamp=()=>new Date(Date.now()+(SEQ++)).toISOString();
// After the first review (26 November 2026): 'offer' (a check answer) never replaces a ticked value; the file's values are on the
// profile as Tim's ('Property file'); whatever is chosen is written back to the file (not on the first pass, the backfill); names that
// don't fit are kept apart and flagged; a name holding two people is flagged to be split.
let LW0_BACKFILL=false;   // the first pass: no property file is changed
// an unsigned draft agency agreement follows an official figure and Tim's choice on the profile; never one sent, parked or signed
function profileSyncDraft(pid,key){ if(LW0_BACKFILL||!DESC.includes(key)) return; const c=PRF().find(x=>x.property_id===pid&&x.key===key), f=c&&FV().find(x=>x.id===c.value_id); if(!f||f.value==null) return;
  (DB.agreements||[]).filter(a=>a.property_id===pid&&a.status==='draft'&&!a.signed_at&&!(DB.agreement_people||[]).some(x=>x.agreement_id===a.id&&x.signed_at)).forEach(a=>{ a.answers||={}; if(!sameTxt(a.answers[key],f.value)) a.answers[key]=typeof f.value==='string'||Array.isArray(f.value)?f.value:String(f.value); }); }
const txt=v=>v==null?null:(typeof v==='string'?v:JSON.stringify(v)), sameTxt=(a,b)=>txt(a)===txt(b)||(typeof a!=='object'&&typeof b!=='object'&&String(a)===String(b));
function profileSyncFile(pid,key){ if(LW0_BACKFILL) return; const c=PRF().find(x=>x.property_id===pid&&x.key===key), f=c&&FV().find(x=>x.id===c.value_id); if(!f||f.value==null) return;
  const p=PT().find(x=>x.id===pid); if(!p) return; if(!(DESC.includes(key)||key==='title_ref'||key==='legal_description')) return;
  const cur=DESC.includes(key)?(p.description||{})[key]:key==='title_ref'?p.title_ref:p.legal_description;
  if(cur!=null&&sameTxt(cur,f.value)) return; p.description||={}; profileWriteBack(pid,key,f.value); }
function profileRecord(pid,key,value,source,ref,asOf,sourceName,display,by,choose){
  if(!pid||!key) return null; if(!PROFILE_KEYS.includes(key)&&source!=='council') return null;
  const v=jblank(value)?null:value;
  const last=FV().filter(f=>f.property_id===pid&&f.key===key&&f.source===source).sort((a,b)=>a.recorded_at<b.recorded_at?1:-1)[0];
  let vid;
  if(last&&same(last.value,v)&&(last.display||'')===(display||'')&&(last.source_ref||null)===(ref||null)) vid=last.id;
  else { if(!last&&v==null) return null; const row={id:uid(),property_id:pid,key,value:v,display:display||null,source,source_name:sourceName||null,source_ref:ref||null,as_of:asOf||null,recorded_at:stamp(),recorded_by:by||'agent'}; FV().push(row); vid=row.id; }
  const c=PRF().find(x=>x.property_id===pid&&x.key===key), cv=c?FV().find(f=>f.id===c.value_id):null;
  const setC=(id,by_,tick)=>{ const n={property_id:pid,key,value_id:id,chosen_by:by_,chosen_at:now(),ticked:!!tick,ticked_at:tick?now():null,ticked_by:tick?(by||'agent'):null}; if(c) Object.assign(c,n); else PRF().push(n); };
  if(v==null){ if(c&&cv&&cv.source===source&&(!c.ticked||choose==='tim')){
      // what the property file still says takes its place (a source going never changes the file), else the newest other value
      const pf=PT().find(x=>x.id===pid)||{}, fv=DESC.includes(key)?(pf.description||{})[key]:key==='title_ref'?pf.title_ref:key==='legal_description'?pf.legal_description:null;
      if(!jblank(fv)&&source!=='tim'){ const fid=profileRecord(pid,key,fv,'tim',null,lwToday(),'Property file',null,by,'never'); setC(fid,'auto',false); return vid; }
      const alt=Object.values(FV().filter(f=>f.property_id===pid&&f.key===key&&f.source!==source).reduce((m,f)=>{ if(!m[f.source]||m[f.source].recorded_at<f.recorded_at) m[f.source]=f; return m; },{})).filter(f=>f.value!=null).sort((a,b)=>a.recorded_at<b.recorded_at?1:-1)[0];
      if(alt){ setC(alt.id,'auto',false); profileSyncFile(pid,key); } else DB.property_profile=PRF().filter(x=>x!==c); } return vid; }
  if(choose==='never') return vid;
  if(choose==='beside'){ if(c&&cv&&cv.source!==source&&(c.ticked||cv.source==='tim')&&!sameTxt(cv.value,v)){ profileSyncFile(pid,key); return vid; } choose='tim'; }
  // the disclosures check: Tim's own choice, unless an official figure from the property's documents says something else
  if(choose==='check'){ const off=FV().filter(f=>f.property_id===pid&&f.key===key&&f.source==='title').sort((a,b)=>a.recorded_at<b.recorded_at?1:-1)[0];
    if(off&&off.value!=null&&!sameTxt(off.value,v)&&(!c||c.chosen_by!=='profile')){ if(!c||c.value_id!==off.id) setC(off.id,'auto',true); profileSyncFile(pid,key); profileSyncDraft(pid,key); return vid; } choose='tim'; }
  // an official figure Tim ticked in the import review (record of title, survey plan): wins over a check answer or an informal value,
  // whichever came first; never over a fact he cleared, or a value he chose on the profile once an official figure was there
  if(choose==='official'){ if(c&&cv&&cv.source!==source&&!sameTxt(cv.value,v)&&((cv.source==='tim'&&cv.value==null)||(c.chosen_by==='profile'&&FV().some(t=>t.property_id===pid&&t.key===key&&t.source==='title'&&t.recorded_at<c.chosen_at)))) return vid;
    if(!c||c.value_id!==vid||!c.ticked) setC(vid,'auto',true); profileSyncFile(pid,key); profileSyncDraft(pid,key); return vid; }
  if(choose==='tim'){ setC(vid,'tim',true); profileSyncFile(pid,key); return vid; }
  let move; if(!c) move=true; else if(sameTxt(cv&&cv.value,v)) move=false; else if(c.ticked) move=false; else if(cv&&cv.source===source) move=true; else if(cv&&cv.source==='tim') move=false; else if(recKind(source)==='record'&&recKind(cv&&cv.source)==='person') move=false; else move=true;
  if(move){ setC(vid,'auto',false); profileSyncFile(pid,key); } return vid; }
function profileRead(pid,vendor){
  const ok=f=>!vendor||(f.source!=='relab'&&f.key!=='owners_relab');
  const latest={}; FV().filter(f=>f.property_id===pid&&ok(f)).forEach(f=>{ const k=f.key+'|'+f.source; if(!latest[k]||latest[k].recorded_at<f.recorded_at) latest[k]=f; });
  const L=Object.values(latest), keys=[...new Set(L.map(f=>f.key))];
  return keys.map(k=>{ const c=PRF().find(x=>x.property_id===pid&&x.key===k), cv=c?FV().find(f=>f.id===c.value_id&&ok(f)):null;
    const others=L.filter(f=>f.key===k&&f.value!=null&&(!cv||(f.id!==cv.id&&!sameTxt(f.value,cv.value)))).sort((a,b)=>a.recorded_at<b.recorded_at?1:-1).map(f=>({value_id:f.id,value:f.value,display:f.display,source:f.source,source_name:f.source_name,as_of:f.as_of,recorded_at:f.recorded_at}));
    return {key:k,label:PROFILE_LABEL[k]||k,position:PROFILE_KEYS.includes(k)?PROFILE_KEYS.indexOf(k):500,value_id:cv&&cv.value!=null?cv.id:null,value:cv?cv.value:null,display:cv?cv.display:null,source:cv?cv.source:null,source_name:cv?cv.source_name:null,as_of:cv?cv.as_of:null,recorded_at:cv?cv.recorded_at:null,ticked:!!(c&&c.ticked&&cv&&cv.value!=null),chosen_by:c?c.chosen_by:null,cleared:!!(cv&&cv.value==null),others}; })
    .filter(x=>x.value_id||x.cleared||x.others.length).sort((a,b)=>a.position-b.position||(a.key<b.key?-1:1)); }
function profileWriteBack(pid,key,v){ const p=PT().find(x=>x.id===pid); if(!p) return; if(DESC.includes(key)){ if(v==null) delete p.description[key]; else p.description[key]=(key==='chattels'&&Array.isArray(v))?v:(typeof v==='string'?v:String(v)); } else if(key==='title_ref') p.title_ref=v; else if(key==='legal_description') p.legal_description=v; }
// people: one contact per person (the same email with a name that fits; no email, the same legal name on the property)
const first=s=>norm(s).split(' ')[0];
const joint=s=>/(\s(and|&)\s|&|\+)/i.test(s||'');
const nick=(a,b)=>!!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=3&&(a.startsWith(b)||b.startsWith(a))));
const shortSame=(a,b)=>norm(a).includes(' ')&&norm(b).includes(' ')&&norm(a).replace(/^.* /,'')===norm(b).replace(/^.* /,'')&&nick(first(a),first(b));
function nameFits(c,nm,inf){ const n=norm(nm), one=!n.includes(' '); if(!n) return true; if(joint(nm)||!c||!c.id) return false;
  if(c.legal_name){ if(sameName(c.legal_name,nm)||norm(c.legal_name)===n||shortSame(c.legal_name,nm)) return true; if(!inf) return false; if(norm(c.preferred_name)===n||norm(c.display_name)===n) return true; return one&&nick(n,first(c.legal_name)); }
  if(joint(c.display_name)) return false; let known=false;
  for(const x of [c.display_name,c.preferred_name]){ if(!x||x.includes('@')||!norm(x)) continue; known=true; if(norm(x)===n) return true; if((one||!norm(x).includes(' '))&&nick(first(x),first(nm))) return true; if(shortSame(x,nm)) return true; }
  return !known; }
function personFind(nm,pref,em,pid,inf,src){
  const jt=joint(nm);
  if(em){ const cands=CT().filter(c=>!c.archived_at&&CM().some(m=>m.contact_id===c.id&&m.kind==='email'&&m.value_norm===em)); const fits=jt?[]:cands.filter(c=>nameFits(c,nm,inf));
    if(fits.length===1) return {id:fits[0].id,by:'email'};
    if(fits.length>1){ const best=fits.find(c=>c.legal_name&&nm&&(sameName(c.legal_name,nm)||norm(c.legal_name)===norm(nm))); if(best) return {id:best.id,by:'email'}; const pick=fits.find(c=>c.legal_name)||fits[0]; return {id:pick.id,by:'email',doubt:'The same email belongs to more than one person. Check this is the right one.',dc:(fits.find(c=>c!==pick)||{}).id}; }
    const sur=s=>norm(s).replace(/^.* /,''), likely=cands.slice().sort((a,b)=>((nm.includes(' ')&&sur(b.legal_name)===sur(nm))-(nm.includes(' ')&&sur(a.legal_name)===sur(nm)))||(!!b.legal_name-!!a.legal_name))[0];
    var dbt=cands.length?{doubt:'Same email as another person with a different name, so kept as a separate person. Check whether they are the same.',dc:likely.id}:{}; }
  else if(nm&&pid&&!jt){ const ids=[...new Set(PLK().filter(l=>l.property_id===pid).map(l=>l.contact_id))].filter(id=>{ const c=CT().find(x=>x.id===id); return c&&!c.archived_at&&(norm(c.legal_name)===norm(nm)||(inf&&norm(c.display_name)===norm(nm))); });
    if(ids.length) return {id:ids[0],by:'name',doubt:ids.length>1?'More than one person on this property has this name. Check this is the right one.':null,dc:ids[1]||null};
    const sim=[...new Set(PLK().filter(l=>l.property_id===pid).map(l=>l.contact_id))].map(id=>CT().find(x=>x.id===id)).find(c=>c&&!c.archived_at&&shortSame(c.legal_name||c.display_name,nm));
    if(sim) var dbt={doubt:'A similar name is already on this property, so kept as a separate person. Check whether they are the same.',dc:sim.id}; }
  if(!nm&&!em) return null;
  if(jt) dbt={doubt:'This name looks like more than one person ('+nm.slice(0,80)+'). Split it into one record each.',dc:(dbt||{}).dc||null};
  const c={id:uid(),kind:'person',display_name:(pref||nm||em).slice(0,200),legal_name:inf||jt?null:(nm||null),preferred_name:pref||null,lead_source:src,marketing_consent:'unknown',status:'active',aml_status:'none',created_at:stamp(),updated_at:now()}; CT().push(c);
  return Object.assign({id:c.id,by:'new'},dbt||{}); }
function personLink(src,sid,pid,name,pref,email,phone,inf,role,current,contact){
  if(!sid) return null; const em=(email||'').trim().toLowerCase(), nm=(name||'').replace(/\s+/g,' ').trim(), ph=(phone||'').trim();
  let l=PLK().find(x=>x.source===src&&x.source_id===sid); if(!nm&&!em&&!contact) return l?l.contact_id:null;
  const keep=l&&(l.matched_by==='tim'||(contact&&l.contact_id===contact)||(!contact&&(!em||CM().some(m=>m.contact_id===l.contact_id&&m.kind==='email'&&m.value_norm===em))&&(nameFits(CT().find(c=>c.id===l.contact_id)||{},nm,inf)||(()=>{ const c=CT().find(x=>x.id===l.contact_id); return !!c&&!c.legal_name&&norm(c.display_name)===norm(nm); })())));
  let cid;
  if(keep){ cid=l.contact_id; if(pid) l.property_id=pid; if(role) l.role=role; }
  else { const f=contact?{id:contact,by:'record'}:personFind(nm,pref,em,pid,inf,src); if(!f) return null; cid=f.id; const old=l&&l.contact_id, oldRole=l&&l.role;
    if(!l){ l={id:uid(),source:src,source_id:sid,created_at:now()}; PLK().push(l); }
    Object.assign(l,{contact_id:cid,property_id:pid||l.property_id||null,role:role||null,matched_by:f.by,doubt:f.doubt||null,doubt_contact_id:f.dc||null,updated_at:now()});
    if(old&&old!==cid&&oldRole&&pid) CPL().filter(x=>x.contact_id===old&&x.property_id===pid&&x.role===oldRole&&x.source===src).forEach(x=>{ x.is_current=false; x.ended_on=x.ended_on||now().slice(0,10); }); }
  const addM=(kind,value,vn)=>{ if(!CM().some(m=>m.contact_id===cid&&m.kind===kind&&m.value_norm===vn)) CM().push({id:uid(),contact_id:cid,kind,value,value_norm:vn,is_primary:!CM().some(m=>m.contact_id===cid&&(kind==='email'?m.kind==='email':['mobile','phone'].includes(m.kind))),source:src,created_at:now()}); };
  if(em) addM('email',em,em);
  if(ph){ let vn=ph.replace(/[^0-9+]/g,''); if(vn.startsWith('+64')) vn='0'+vn.slice(3); if(vn) addM(vn.startsWith('02')?'mobile':'phone',ph,vn); }
  const c=CT().find(x=>x.id===cid); if(c){ if(!c.legal_name&&!inf&&nm&&!joint(nm)){ if(c.display_name===em) c.display_name=nm; c.legal_name=nm; } if(!c.preferred_name&&(pref||'').trim()) c.preferred_name=pref.trim(); }
  if(pid&&role){ let x=CPL().find(y=>y.contact_id===cid&&y.property_id===pid&&y.role===role); const cur=current!==false;
    if(!x) CPL().push({id:uid(),contact_id:cid,property_id:pid,role,is_current:cur,started_on:now().slice(0,10),ended_on:cur?null:now().slice(0,10),source:src,created_at:now(),updated_at:now()});
    else { x.is_current=x.source===src?cur:(x.is_current||cur); x.ended_on=x.is_current?null:(x.ended_on||now().slice(0,10)); } }
  return cid; }
function qaPut(key,pid,cid,value,source,ref,byVendor,by){
  const blank=jblank(value)||(typeof value==='string'&&!value.trim()); const i=QA().findIndex(a=>a.question_key===key&&a.source===source&&a.source_ref===ref);
  if(blank){ if(i>=0) QA().splice(i,1); return; }
  if(i>=0){ const a=QA()[i]; if(!same(a.value,value)) a.answered_at=now(); a.value=value; a.property_id=pid||a.property_id; a.contact_id=cid||a.contact_id; a.recorded_by=by; }
  else QA().push({id:uid(),question_key:key,property_id:pid||null,contact_id:cid||null,value,source,source_ref:ref,by_vendor:byVendor,answered_at:now(),recorded_by:by}); }
// the triggers, as one pass over what changed since the last pass
function sharedSync(){
  const seen=(DB._lw0||={});
  const once=(k,sig,fn)=>{ if(seen[k]!==sig){ fn(seen[k]===undefined?null:JSON.parse(seen[k])); seen[k]=sig; } };
  // the first pass is the backfill: each property file's own values first, as Tim's; no file is changed
  LW0_BACKFILL=!seen._done;
  if(LW0_BACKFILL) PT().forEach(p=>{ Object.entries(p.description||{}).forEach(([k,v])=>{ if(DESC.includes(k)&&!jblank(v)) profileRecord(p.id,k,v,'tim',null,lwToday(),'Property file',null,'backfill','auto'); });
    if((p.title_ref||'').trim()) profileRecord(p.id,'title_ref',p.title_ref,'tim',null,lwToday(),'Property file',null,'backfill','auto'); });
  (DB.agreement_people||[]).forEach(ap=>{ const ag=(DB.agreements||[]).find(x=>x.id===ap.agreement_id)||{}; const sig=JSON.stringify([ap.legal_name,ap.pref_name,ap.email,ap.phone,ag.property_id]);
    once('ap:'+ap.id,sig,()=>{ const cap=(ag.answers||{}).capacity; const cid=personLink('agreement_people',ap.id,ag.property_id,ap.legal_name,ap.pref_name,ap.email,ap.phone,false,!cap||cap==='Owners'?null:cap==='Trustee'?'trustee':'vendor',!['ended','cancelled'].includes(ag.status)); if(!ap.signed_at&&cid) ap.contact_id=cid; }); });
  PP().forEach(x=>once('pp:'+x.id,JSON.stringify([x.legal_name,x.pref_name,x.email,x.phone,x.role,x.name_from]),()=>{ const cid=personLink('property_people',x.id,x.property_id,x.legal_name,x.pref_name,x.email,x.phone,(x.name_from||x.source||'')==='appraisal',x.role==='contact'?'contact':'owner',x.role!=='former'); if(cid) x.contact_id=cid; }));
  (DB.prelistings||[]).forEach(pl=>{ once('pl:'+pl.id,JSON.stringify([pl.contact_name,pl.contact_email,pl.property_id,pl.status]),()=>personLink('prelisting',pl.id,pl.property_id,pl.contact_name,null,pl.contact_email,null,true,null,pl.status!=='closed'));
    const cid=(PLK().find(l=>l.source==='prelisting'&&l.source_id===pl.id)||{}).contact_id||null;
    Object.entries(QA_PL).forEach(([k,q])=>once('plq:'+pl.id+':'+k,JSON.stringify([(pl.answers||{})[k]??null,pl.property_id]),()=>qaPut(q,pl.property_id,cid,(pl.answers||{})[k],'questionnaire',pl.id,true,pl.contact_email))); });
  PT().forEach(p=>Object.keys(Object.assign({},p.found||{},JSON.parse(seen['found:'+p.id]||'{}'))).forEach(k=>{ const v=(p.found||{})[k]; once('found:'+p.id+':'+k,JSON.stringify(v??null),()=>{
    const f=v||{}; const pk=['title_ref','legal_description'].concat(DESC).includes(f.field)?f.field:k; const ch=!v?'tim':(f.field&&!f.written?'never':LW0_BACKFILL?'beside':'tim');
    profileRecord(p.id,(v?pk:(JSON.parse(seen['foundkey:'+p.id+':'+k]||'null')||k)),v?f.value:null,'council',null,f.as_of_label||f.as_of||(f.fetched_at||'').slice(0,10),f.source_name,f.display,'agent',ch);
    if(v) seen['foundkey:'+p.id+':'+k]=JSON.stringify(pk); }); }));
  PT().forEach(p=>{ seen['found:'+p.id]=JSON.stringify(Object.fromEntries(Object.keys(Object.assign({},JSON.parse(seen['found:'+p.id]||'{}'),p.found||{})).map(k=>[k,1]))); });
  (DB.agreements||[]).forEach(ag=>{ if(!ag.property_id||['ended','cancelled'].includes(ag.status)) return; DESC.forEach(k=>once('aga:'+ag.id+':'+k,JSON.stringify([(ag.answers||{})[k]??null,ag.property_id]),prev=>{ const v=(ag.answers||{})[k]; if(jblank(v)&&(!prev||jblank(prev[0]))) return; profileRecord(ag.property_id,k,v,'agreement',ag.id,lwToday(),'Agency agreement '+(ag.ref||''),null,'agent','auto'); })); });
  (DB.property_inspections||[]).forEach(i=>DESC.forEach(k=>once('insp:'+i.id+':'+k,JSON.stringify((i.facts||{})[k]??null),prev=>{ const v=(i.facts||{})[k]; if(jblank(v)&&prev===null) return; profileRecord(i.property_id,k,v,'inspection',i.id,lwToday(),'Inspect a property',null,i.created_by,(i.conflicts||{})[k]?'never':LW0_BACKFILL?'beside':'check'); })));
  // official figures from a record of title or survey plan among the property's documents (read_result.fields from the reader)
  (DB.property_documents||[]).forEach(dc=>{ const on=!dc.archived_at&&OFFICIAL_KINDS.includes(dc.kind); const fields=on&&dc.read_result&&Array.isArray(dc.read_result.fields)?dc.read_result.fields:[];
    once('doc:'+dc.id,JSON.stringify([on,fields]),prev=>{
      const keyOf=x=>x.key==='pLand'?'pLand':x.key==='title'?'title_ref':null, ok=x=>keyOf(x)&&/(title|survey|plan|cross lease|unit title|\bct\b|\bdp\b)/i.test(x.source||'');
      const srcOf=x=>x.ticked===true?'title':'reader';
      if(!on){ if(prev&&prev[0]) (prev[1]||[]).filter(ok).forEach(x=>{ if(FV().some(f=>f.property_id===dc.property_id&&f.key===keyOf(x)&&f.source===srcOf(x)&&f.source_ref===dc.id)) profileRecord(dc.property_id,keyOf(x),null,srcOf(x),dc.id,null,dc.kind,null,'agent','auto'); }); return; }
      fields.filter(ok).forEach(x=>{ const k=keyOf(x), tk=x.ticked===true, raw=tk&&x.used!=null?x.used:x.value;
        const v=!tk?String(x.value).trim():k==='pLand'?(String(raw).match(/[0-9]+(\.[0-9]+)?/)||[String(raw)])[0]:String(raw).trim();
        profileRecord(dc.property_id,k,v,srcOf(x),dc.id,lwToday(),tk?dc.kind+(x.source?' ('+x.source+')':''):'From the '+String(dc.kind).toLowerCase()+', not checked',null,'agent',!tk||LW0_BACKFILL?'never':'official'); }); }); });
  seen._done=1; LW0_BACKFILL=false;
}
function sharedRpc(name,a,me){
  const agent=me&&AGENTS.includes(me.email);
  if(name==='my_property_profile'){ if(!propParty(a.p_property)) return bad('Not found'); return ok({property_id:a.p_property,facts:profileRead(a.p_property,true)}); }
  if(!agent) return bad('Agent only');
  if(name==='agent_property_profile') return ok({property_id:a.p_property,facts:profileRead(a.p_property,false)});
  if(name==='agent_profile_choose'){ const f=FV().find(x=>x.id===a.p_value_id&&x.property_id===a.p_property&&x.key===a.p_key); if(!f||f.value==null) return bad('That value is not on this property');
    const c=PRF().find(x=>x.property_id===a.p_property&&x.key===a.p_key), n={property_id:a.p_property,key:a.p_key,value_id:f.id,chosen_by:'profile',chosen_at:stamp(),ticked:true,ticked_at:now(),ticked_by:me.email}; if(c) Object.assign(c,n); else PRF().push(n);
    profileWriteBack(a.p_property,a.p_key,f.value); profileSyncDraft(a.p_property,a.p_key); save(); return ok({property_id:a.p_property,facts:profileRead(a.p_property,false)}); }
  if(name==='agent_profile_tick'){ PRF().filter(x=>x.property_id===a.p_property&&(!a.p_keys||a.p_keys.includes(x.key))).forEach(x=>{ x.ticked=!!a.p_on; x.ticked_at=a.p_on?now():null; x.ticked_by=a.p_on?me.email:null; }); save(); return ok({property_id:a.p_property,facts:profileRead(a.p_property,false)}); }
  if(name==='agent_profile_set'){ if(!PROFILE_KEYS.includes(a.p_key)) return bad('Not a property fact'); if(jblank(a.p_value)){ // Tim cleared it on the file: his empty entry is chosen (not ticked), so no later source fills it by itself
      profileWriteBack(a.p_property,a.p_key,null); const row={id:uid(),property_id:a.p_property,key:a.p_key,value:null,display:null,source:'tim',source_name:'Tim',source_ref:null,as_of:lwToday(),recorded_at:stamp(),recorded_by:me.email}; FV().push(row);
      const c=PRF().find(x=>x.property_id===a.p_property&&x.key===a.p_key), n={property_id:a.p_property,key:a.p_key,value_id:row.id,chosen_by:'profile',chosen_at:stamp(),ticked:false,ticked_at:null,ticked_by:null}; if(c) Object.assign(c,n); else PRF().push(n);
      save(); return ok({property_id:a.p_property,facts:profileRead(a.p_property,false)}); }
    { const vid=profileRecord(a.p_property,a.p_key,a.p_value,'tim',null,lwToday(),'Tim',null,me.email,'tim'); const c=PRF().find(x=>x.property_id===a.p_property&&x.key===a.p_key&&x.value_id===vid); if(c){ c.chosen_by='profile'; c.chosen_at=stamp(); } }
    profileWriteBack(a.p_property,a.p_key,jblank(a.p_value)?null:a.p_value); save(); return ok({property_id:a.p_property,facts:profileRead(a.p_property,false)}); }
  if(name==='agent_person_link_resolve'){ const l=PLK().find(x=>x.id===a.p_link); if(!l) return bad('Not found'); if(!l.doubt) return bad('Nothing to check here');
    if(a.p_same){ if(!l.doubt_contact_id) return bad('There is no other person to join this to'); const old=l.contact_id, to=l.doubt_contact_id; l.contact_id=to;
      // the working lists follow (never a signed row)
      if(l.source==='property_people') PP().filter(x=>x.id===l.source_id&&x.contact_id===old).forEach(x=>{ x.contact_id=to; });
      if(l.source==='agreement_people') (DB.agreement_people||[]).filter(x=>x.id===l.source_id&&!x.signed_at&&x.contact_id===old).forEach(x=>{ x.contact_id=to; });
      if(l.source==='prelisting') QA().filter(x=>x.source==='questionnaire'&&x.source_ref===l.source_id&&x.contact_id===old).forEach(x=>{ x.contact_id=to; });
      if(l.property_id&&l.role){ if(!CPL().some(x=>x.contact_id===to&&x.property_id===l.property_id&&x.role===l.role)) CPL().push({id:uid(),contact_id:to,property_id:l.property_id,role:l.role,is_current:true,started_on:now().slice(0,10),ended_on:null,source:l.source,created_at:now(),updated_at:now()});
        if(!PLK().some(x=>x.contact_id===old&&x.property_id===l.property_id&&x.role===l.role)) CPL().filter(x=>x.contact_id===old&&x.property_id===l.property_id&&x.role===l.role).forEach(x=>{ x.is_current=false; x.ended_on=x.ended_on||now().slice(0,10); }); }
      if(!PLK().some(x=>x.contact_id===old)){ const c=CT().find(x=>x.id===old); if(c){ c.archived_at=now(); c.status='archived'; } CPL().filter(x=>x.contact_id===old).forEach(x=>{ x.is_current=false; }); } }
    Object.assign(l,{matched_by:'tim',doubt:null,doubt_contact_id:null,resolved_at:now(),resolved_by:me.email}); save(); return ok(l); }
  return bad('unknown '+name); }
save();   // LW0 backfill on load, like the migration
const S = JSON.parse(localStorage.getItem('mocksession')||'null');
// who may read a property, like is_property_party() in migration 002: an owner still on it, a party to its live agreement, or the contact of this round's open pre-listing
// is_party(): a person on the agreement, by user id only (an email match is not enough)
const partyOf=aid=>{ const me=S&&S.user; return !!me&&(DB.agreement_people||[]).some(p=>p.agreement_id===aid&&p.user_id===me.id); };
const AG_TABLES=['agreement_people','signatures','property_forms','form_signatures','guide_receipts','lawyer_links','cancellation_requests','agreement_variations','variation_signatures','prior_agency_notices'];
function propParty(pid){ const me=S&&S.user; if(!me) return false; const em=(me.email||'').toLowerCase(), p=PT().find(x=>x.id===pid);
  return PP().some(x=>x.property_id===pid&&(x.role||'owner')!=='former'&&(x.user_id===me.id||(x.email&&x.email.toLowerCase()===em)))
    ||(DB.agreements||[]).some(a=>a.property_id===pid&&!['ended','cancelled'].includes(a.status)&&partyOf(a.id))
    ||(DB.prelistings||[]).some(l=>l.property_id===pid&&l.status!=='closed'&&(!p||!p.cycle_at||l.created_at>=p.cycle_at)&&(l.user_id===me.id||(l.contact_email||'').toLowerCase()===em)); }
// translations (migration 008): a visitor or vendor reads approved text only, and plans and variations only when they are theirs
const ZERO='00000000-0000-0000-0000-000000000000';
function trVisible(r){ if(r.status!=='approved') return false; if(r.scope==='screens'||r.scope==='guide') return true; const me=S&&S.user; if(!me) return false;
  if(r.scope==='plan') return (DB.prelistings||[]).some(l=>l.id===r.ref&&l.status!=='closed'&&(l.user_id===me.id||(l.contact_email||'').toLowerCase()===(me.email||'').toLowerCase()));
  if(r.scope==='variation'){ const v=(DB.agreement_variations||[]).find(x=>x.id===r.ref); return !!v&&v.status!=='draft'&&partyOf(v.agreement_id); } return false; }
function logCall(k){ try{ const l=JSON.parse(localStorage.getItem('callLog')||'[]'); l.push(k); localStorage.setItem('callLog',JSON.stringify(l)); }catch(_){} }
function q(table){ logCall('from:'+table);
  let rows=null, op='select', payload=null, filters=[], single=false, sel='*', order=null, wantSel=false;
  const b={
    select(c){ if(op==='select'){sel=c||'*';} else wantSel=true; return b;},
    insert(p){op='insert';payload=p;return b;}, update(p){op='update';payload=p;return b;}, delete(){op='delete';return b;},
    eq(k,v){filters.push(r=>r[k]===v);return b;}, neq(k,v){filters.push(r=>r[k]!==v);return b;}, gt(k,v){filters.push(r=>r[k]>v);return b;}, gte(k,v){filters.push(r=>r[k]>=v);return b;}, is(k,v){filters.push(r=>(v===null?r[k]==null:r[k]===v));return b;}, in(k,vs){filters.push(r=>vs.includes(r[k]));return b;},
    order(k,o){order=[k,o&&o.ascending===false?-1:1];return b;}, limit(){return b;}, single(){single=true;return b;},
    then(res,rej){ if(localStorage.getItem('trHang')==='1'&&table==='user_language') return; try{ res(run()); }catch(e){ res({data:null,error:{message:e.message}}); } }
  };
  function run(){
    // localStorage mockFailTable = a table name: reading it fails, as with a dropped connection or a database error
    if(op==='select'&&localStorage.getItem('mockFailTable')===table) throw new Error('Failed to fetch');
    // localStorage mockFailWrite = a table name: writing to it fails, as with no signal
    if(op!=='select'&&localStorage.getItem('mockFailWrite')===table) throw new Error('Failed to fetch');
    // 026: the views of what stands (read only; security invoker, so the same rules as the tables they read)
    const T=LIVE_VIEWS[table]?LIVE_VIEWS[table]():(DB[table]||=[]);
    // photos and documents (migration 016): vendors see none of it; guard_property_document() on every write
    if(['property_documents','property_document_events','repo_kinds'].includes(table)){ const r0=repoTable(table,op,payload,op==='update'?T.filter(r=>filters.every(f=>f(r))):[],single); if(r0) return r0; }
    // after signing (migrations 009 and 010): these tables are for the agent only. A vendor sees and writes nothing; nobody writes the
    // stage record directly (agent_set_stage does) or removes a row from any of them.
    // migration 018: nobody but Tim reads the offer tables, nobody writes them directly, and an offer from the form changes only through the agent_offer_* functions
    if((OFFER_TABLES.includes(table)||table==='property_offers')&&!(S&&S.user)) throw new Error('permission denied for table '+table);
    if(OFFER_TABLES.includes(table)&&op!=='select') throw new Error('permission denied for table '+table);
    if(table==='offer_signers'&&op==='select'&&(sel==='*'||/token_hash|code_hash|session_hash|code_tries|codes_window_at|session_expires_at/.test(sel))) throw new Error('permission denied for table offer_signers');   // column privileges (020)
    // column privileges on offer_settings (018, 024, 025): a named column outside the grants is refused (never the salt)
    if(table==='offer_settings'&&op==='select'){ const ok_=['id','ks_warn_working_days','ai_daily_cap','updated_by','updated_at','resign_every_round','link_changes_default','agent_phone','agent_email']; const cols=String(sel||'*').split(',').map(x=>x.trim());
      if(cols[0]!=='*'&&cols.some(c=>!ok_.includes(c))) throw new Error('permission denied for table offer_settings'); OSET(); }   // named columns only ('*' as before: the policy then decides)
    if(table==='offer_terms'&&op==='select') OTERMS();
    if(table==='property_offers'&&op==='insert'&&(Array.isArray(payload)?payload:[payload]).some(x=>x&&((x.source||'manual')!=='manual'||x.submission||x.details))) throw new Error('Offers from the form are only added through the form');
    if(table==='property_offers'&&op==='update'&&(DB.property_offers||[]).some(r=>filters.every(f=>f(r))&&(r.source||'manual')!=='manual')&&Object.keys(payload||{}).some(k=>!['notes','expires_at'].includes(k))) throw new Error('Offers from the form are changed through the Offers tile, so there is a record');
    if(table==='property_offers'&&op==='update'&&['submission','details','suspected_spam','source'].some(k=>k in (payload||{}))) throw new Error('Offers from the form are only added through the form');
    // 028: nobody writes the shared records directly (the triggers and the agent_profile_* functions do); vendors read their own
    // profile only through my_property_profile here (the vendor policies on the live tables are checked in the rollback test)
    if(SHARED_TABLES.includes(table)&&op!=='select') throw new Error('permission denied for table '+table);
    if(AGENT_ONLY.includes(table)){ const vendor=S&&S.user&&!AGENTS.includes(S.user.email); if(vendor){ if(op==='select') return {data:single?undefined:[],error:single?{message:'not found'}:null}; throw new Error('new row violates row-level security policy for table "'+table+'"'); }
      if(op==='delete'||(table==='property_events'&&op!=='select')) throw new Error('permission denied for table '+table); }
    if((op==='insert'||op==='update'||op==='delete')&&['translations','translation_log','user_language','translation_sets'].includes(table)) throw new Error('new row violates row-level security policy for table "'+table+'"');
    // property inspections (migration 012): Tim reads them; nobody writes them directly (the agent_inspection_* functions do); vendors see none.
    // With localStorage mockOffline = '1' the inspection calls fail as they would with no signal.
    if(table==='property_inspections'){ if(offline()) throw new Error('Failed to fetch'); if(op!=='select') throw new Error('permission denied for table property_inspections'); if(!(S&&S.user&&AGENTS.includes(S.user.email))) return {data:single?undefined:[],error:single?{message:'not found'}:null}; }
    if(table==='council_lookups'||table==='council_use_log') { const r0=councilTable(op); if(r0) return r0; }
    if(table==='properties'&&op==='insert'&&(Array.isArray(payload)?payload:[payload]).some(x=>x&&(!jblank(x.found)||!jblank(x.provenance)))) throw new Error('Public record values are only saved with Use these');
    // guard_form_checks (after guard_form, as triggers fire in name order): a direct write can't add a declaration with answers, change what one says, change a form to or from one, or remove one
    if(table==='property_forms'&&op==='insert'){ (Array.isArray(payload)?payload:[payload]).forEach(x=>{ if(x&&x.kind==='vendor_declaration'&&!jblank(x.data)) throw new Error('Only the vendors fill in their declaration'); }); }
    if(table==='property_forms'&&op==='update'){ (DB.property_forms||[]).filter(r=>filters.every(f=>f(r))).forEach(r=>{ guard(table,r,payload); if('kind' in payload&&payload.kind!==r.kind&&[payload.kind,r.kind].includes('vendor_declaration')) throw new Error('Only the vendors fill in their declaration'); if(r.kind==='vendor_declaration'&&'data' in payload&&!same(payload.data,r.data)) throw new Error('Only the vendors fill in their declaration'); }); }
    if(table==='property_forms'&&op==='delete'&&(DB.property_forms||[]).some(r=>filters.every(f=>f(r))&&r.kind==='vendor_declaration'&&!(DB.form_signatures||[]).some(x=>x.form_id===r.id))) throw new Error("The Vendor Declaration is the vendors' own record, so it can't be removed here");
    if(op==='insert'){ const arr=(Array.isArray(payload)?payload:[payload]).map(p=>{const r=Object.assign({id:uid(),created_at:now(),updated_at:now()},p); if(table==='agreements'){r.ref=r.ref||'MRE-2026-'+(1001+T.length); r.status=r.status||'draft'; r.config=r.config||{}; r.answers=r.answers||{}; r.legal=r.legal||{}; r.agreement_version='v3.15-26102026';} if(table.endsWith('events')) r.at=now(); if(table==='signatures') r.signed_at=now(); if(table==='agreement_variations'){r.status='draft';} if(table==='prelistings'){r.status=r.status||'appraisal';r.answers=r.answers||{};r.plan=r.plan||{}; if(!r.property_id){ const p=newProp(r.address); r.property_id=p.id; } mergePerson(r.property_id,r.contact_name,'',r.contact_email,'',null,'appraisal'); }
      if(table==='agreements'&&!r.property_id){ const p=newProp(r.address); p.title_ref=(r.config||{}).title||null; p.owners_on_title=(r.config||{}).owners||null; r.property_id=p.id; }
      if(table==='property_forms'&&(r.status==='signed'||r.signed_at||r.countersigned_at||r.document_id||r.filing_at)) throw new Error('A document is only signed or filed by signing it'); if(table==='property_forms'&&r.kind==='vendor_declaration') r.data=inspPrefill(r.property_id,r.data||{}); if(table==='property_people'){ r.role=r.role||'owner'; r.name_from=r.name_from||r.source; } if(table==='properties'){ r.ownership=r.ownership||{}; r.description=r.description||{}; r.disclosures=r.disclosures||{}; r.stage=r.stage||'appraisal'; r.stage_at=now(); } T.push(r); if(table==='agreements') syncAgreement(r); if(table==='prelistings') syncPrelisting(r); if(table==='agreement_people') personSync(r); return r;}); save(); return {data: single?arr[0]:arr, error:null}; }
    let out=T.filter(r=>filters.every(f=>f(r)));
    if(op==='select'&&S&&S.user&&!AGENTS.includes(S.user.email)){ if(table==='properties') out=out.filter(r=>propParty(r.id)); if(table==='property_people') out=out.filter(r=>(r.role||'owner')!=='former'&&propParty(r.property_id));
    if(table==='agreements') out=out.filter(r=>partyOf(r.id)); if(AG_TABLES.includes(table)) out=out.filter(r=>partyOf(r.agreement_id));
    if(table==='prelistings') out=out.filter(r=>r.status!=='closed'&&(r.user_id===S.user.id||(r.contact_email||'').toLowerCase()===(S.user.email||'').toLowerCase()));
    if(table==='translations') out=out.filter(trVisible); if(table==='translation_log') out=[]; if(table==='user_language') out=out.filter(r=>r.user_id===S.user.id); }   // row level security for vendors (migrations 001, 002 and 008)
    if(op==='select'&&!(S&&S.user)){ if(table==='translations') out=out.filter(trVisible); else if(['user_language','translation_log'].includes(table)) out=[]; }
    if(op==='update'){ out.forEach(r=>{ if(table==='aml_files'&&r.locked_at&&payload.data) throw new Error('locked'); guard(table,r,payload); const old=JSON.parse(JSON.stringify(r)); Object.assign(r,payload,{updated_at:now()}); if(table==='agreements') syncAgreement(r,old); if(table==='prelistings') syncPrelisting(r,old); if(table==='agreement_people') personSync(r,old); if(table==='aml_files'&&payload.locked_at){ const p=DB.agreement_people.find(x=>x.id===r.person_id); if(p)p.id_verified_at=payload.locked_at; } }); save(); return {data:out,error:null}; }
    if(op==='delete'){ if(['form_signatures','guide_receipts','signatures'].includes(table)&&out.length) return {data:null,error:{message:'Records in '+table+' cannot be changed or deleted'}}; if(table==='property_forms'&&out.some(r=>(DB.form_signatures||[]).some(x=>x.form_id===r.id))) return {data:null,error:{message:"This document has been signed, so it can't be removed"}}; if(table==='agreement_people') out.forEach(personGone); DB[table]=(DB[table]||[]).filter(r=>!out.includes(r)); save(); return {data:null,error:null}; }
    out=out.map(r=>{ const c=Object.assign({},r); if(sel.includes('agreement_people(')) c.agreement_people=DB.agreement_people.filter(p=>p.agreement_id===r.id); if(table==='properties'){ if(sel.includes('property_people(')) c.property_people=PP().filter(x=>x.property_id===r.id); if(sel.includes('agreements(')) c.agreements=(DB.agreements||[]).filter(x=>x.property_id===r.id); if(sel.includes('prelistings(')) c.prelistings=(DB.prelistings||[]).filter(x=>x.property_id===r.id); } return c;});
    if(order) out.sort((a,b)=>(a[order[0]]>b[order[0]]?1:-1)*order[1]);
    return {data: single?out[0]:out, error: single&&!out[0]?{message:'not found'}:null};
  }
  return b;
}
const AGENTS=['hello@timmcguire.co.nz'].concat((()=>{ try{ return JSON.parse(localStorage.getItem('mockAgents')||'[]'); }catch(_){ return []; } })());   // mockAgents: more agent sign-ins for a test
const offline=()=>{ try{ return localStorage.getItem('mockOffline')==='1'||navigator.onLine===false; }catch(_){ return false; } };
// property inspections (mirrors migrations/012_property_inspection.sql)
const PI=()=>(DB.property_inspections||=[]);
const DECL_KEYS=['pegs','unpaid','history','meth','chattels','repairs','faults','era','wt','dux','asbestos','pipes','reno','consents','lim','claims','reports','hazard','water','sewer','storm','power','internet','insulation','glazing','hai','burner','tenanted'];
const NOTE_KEYS=['outside','structure','inside','services','history','tenancy'];
// jblank and pickKeep are function declarations so the backfill near the top (syncAgreement) can use them as the mock loads
function jblank(v){ return v==null||v===''||(Array.isArray(v)&&!v.length)||(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length); }
// compared by value with key order not mattering, as Postgres compares jsonb
function canon(x){ return Array.isArray(x)?'['+x.map(canon).join(',')+']':(x&&typeof x==='object')?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}':JSON.stringify(x??null); }
function same(a,b){ return canon(a??null)===canon(b??null); }
// decl_same(): two Vendor Declaration answers by value (choice and details); the tenancy answer is a plain value
const declSame=(x,y)=>(isObj(x)||isObj(y))?((isObj(x)?x.a:null)||'')===((isObj(y)?y.a:null)||'')&&((isObj(x)?x.d:null)||'')===((isObj(y)?y.d:null)||''):same(x,y);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const confirmed=(chk,k)=>isObj(chk)&&isObj(chk[k]);   // is_confirmed(): a {by, name, at} written by vendor_form_save
const stampTs=t=>typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)&&!isNaN(Date.parse(t))?Date.parse(t):null;
const nzDay=iso=>new Date(iso).toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
function pickKeep(cur,j){ const o={}; Object.entries(j||{}).forEach(([k,v])=>{ if(!(jblank(v)&&!jblank((cur||{})[k]))) o[k]=v; }); return o; }   // pick_keep()
function mergeDecl(d,i){ d=JSON.parse(JSON.stringify(isObj(d)?d:{}));
  let ans=isObj(d.answers)?d.answers:{}, pre=isObj(d.pre)?d.pre:{}, chk=isObj(d.checked)?d.checked:{}, nt=isObj(d.noted)?d.noted:{}; let added=0, updated=0; const kept=[];
  Object.keys(pre).filter(k=>pre[k]==='inspection').forEach(k=>{ if(!(k in i.declaration)&&!confirmed(chk,k)){ if(k==='tenanted') delete d.tenanted; else delete ans[k]; delete pre[k]; delete nt[k]; } });
  Object.entries(i.declaration).forEach(([k,v])=>{ const tims=pre[k]==='inspection'&&!confirmed(chk,k);
    if(k==='tenanted'){ const cur=d.tenanted; if(jblank(cur)||tims){ if(jblank(cur)) added++; else if(cur!==v.a) updated++; d.tenanted=v.a; pre[k]='inspection'; nt[k]=v.a; delete chk[k]; } else if(cur!==v.a) kept.push({k,vendor:{a:cur},inspection:v}); return; }
    const cur=ans[k], empty=jblank(cur)||(jblank(cur.a)&&!(cur.d||''));
    if(empty||tims){ if(empty) added++; else if(!same(cur,v)) updated++; ans[k]=v; pre[k]='inspection'; nt[k]=v; delete chk[k]; }
    else if((cur.a||'')!==(v.a||'')||(cur.d||'')!==(v.d||'')) kept.push({k,vendor:cur,inspection:v}); });
  Object.assign(d,{answers:ans,pre,noted:nt,checked:chk,insp:{id:i.id,on:nzDay(i.started_at),by:'Tim McGuire'}}); if(added+updated) d.complete=false;
  return {data:d,added,updated,kept}; }
// latest_inspection(): the newest inspection of this round, with the declaration merged across all of them (newest answer per question wins)
function latestInsp(pid){ const p=PT().find(x=>x.id===pid)||{}; const L=PI().filter(i=>i.property_id===pid&&(!p.cycle_at||i.started_at>=p.cycle_at)); if(!L.length) return null;
  const newest=L.slice().sort((a,b)=>((a.finished_at||a.updated_at)<(b.finished_at||b.updated_at)?1:-1))[0]; const best={};
  L.forEach(i=>{ const keys=new Set(Object.keys(i.declaration).concat(Object.keys(i.stamps||{}).filter(s=>s.startsWith('d:')).map(s=>s.slice(2))));
    keys.forEach(k=>{ const t=stampTs((i.stamps||{})['d:'+k])??Date.parse(i.updated_at); if(!best[k]||t>best[k].t) best[k]={t,v:i.declaration[k]}; }); });
  const decl={}; Object.entries(best).forEach(([k,x])=>{ if(!jblank(x.v)) decl[k]=x.v; }); return Object.assign({},newest,{declaration:decl}); }
/* like coalesce(new.data,'{}') ? 'insp': the key alone, even when null, means the form already has Tim's notes */
function inspPrefill(pid,data){ if(isObj(data)&&('insp' in data)) return data; const i=latestInsp(pid); return i&&Object.keys(i.declaration).length?mergeDecl(data,i).data:data; }
// guard_form_checks(): on any path but the vendors' own save, an answer that changes loses its confirmation
function clearChanged(oldD,newD){ const oa=isObj((oldD||{}).answers)?oldD.answers:{}, na=isObj(newD.answers)?newD.answers:{}; if(!isObj(newD.checked)) return newD;
  Object.keys(newD.checked).forEach(k=>{ if(k==='tenanted'?!same((oldD||{}).tenanted,newD.tenanted):!same(na[k],oa[k])) delete newD.checked[k]; }); return newD; }
const needsChecks=fm=>{ const d=fm.data||{}, pre=isObj(d.pre)?d.pre:{}; return Object.keys(pre).some(k=>pre[k]==='inspection'&&!confirmed(d.checked,k)); };
// decl_text_keys() and decl_has_answer() (migration 014): an answer with a choice; Unknown is one
const DECL_TEXT=['faults','reno','internet','insulation','glazing'];
const hasAnswer=(k,v)=>k==='tenanted'?['now','will','no'].includes(v):DECL_TEXT.includes(k)?isObj(v)&&String(v.d||'').trim()!=='':isObj(v)&&['yes','no','unknown'].includes(v.a);
const needsAnswers=fm=>{ const d=fm.data||{}, pre=isObj(d.pre)?d.pre:{}, ans=isObj(d.answers)?d.answers:{}; return Object.keys(pre).some(k=>pre[k]==='inspection'&&!hasAnswer(k,k==='tenanted'?d.tenanted:ans[k])); };
const NEED_ANSWER='Please answer each question Tim noted at the inspection';
const AGENT_ONLY=SHARED_TABLES.concat(['property_events','campaign_stats','buyer_feedback','property_offers','offer_links','offer_events','offer_settings','offer_clauses','offer_hits','offer_blanks','offer_blank_maps','offer_blank_reads','offer_terms','offer_term_changes','offer_drafts','offer_draft_approvals','offer_lawyer_lookups','offer_file_hashes','offer_signings','offer_signers','offer_sign_taps','offer_sign_receipts','offer_sign_marks','offer_sign_reviews','offer_sign_asks','offer_rounds','offer_documents','offer_agreements','offer_mail_drafts','offer_mail_log','offer_holds','offer_requests','offer_deposit_holders','offer_sign_undos','offer_sign_redraws','offer_confirm_holds','offer_sign_taps_live','offer_sign_marks_live','offer_sign_reviews_live']);
function mkNotices(ag){ if((ag.answers||{}).prior!=='yes') return; (DB.prior_agency_notices||=[]); (ag.answers.priorAgencies||[]).forEach((x,i)=>{ if(x.agency&&!DB.prior_agency_notices.some(n=>n.agreement_id===ag.id&&n.idx===i)) DB.prior_agency_notices.push({id:uid(),agreement_id:ag.id,idx:i,agency:x.agency,agent_name:x.agent||null,email:x.email||null,kind:x.kind,dated:x.dated||null,status:'to_send',created_at:now()}); }); }
const ok=d=>Promise.resolve({data:d,error:null}); const bad=m=>Promise.resolve({data:null,error:{message:m}});
// 029 guard_signature_identity (Tim, 26 November 2026): in person, Tim's photo ID check is in the snapshot (type, never a number, at now);
// by the signer's own link, nobody else on the agreement has the same email
const PHOTO_IDS=['nz_driver_licence','passport','nz_firearms_licence','kiwi_access_card','other_photo_id'];
function idCheckErr(snap,name,personId){ const c=(snap||{}).id_check; const photo=!!c&&PHOTO_IDS.includes(c.type)&&c.checked===true&&!('warned' in c), none=!!c&&c.type==='none'&&c.warned===true&&c.note==='Signed in person without an identity check'&&!('checked' in c)&&!('aml_file_id' in c);
  if(!c||typeof c!=='object'||!String(c.by||'').trim()||!(photo||none)) return `Choose the photo ID you checked for ${name}, and tick that you checked it and watched them sign (or confirm finishing without an ID check)`;
  if(Object.keys(c).some(k=>!['type','checked','by','at','aml_file_id','warned','note'].includes(k))) return 'Only the ID type is kept here, never its number';
  if(!(Math.abs(Date.parse(c.at)-Date.now())<=9e5)) return 'Please record the ID check again, at the time you check it';
  if(c.aml_file_id&&!(DB.aml_files||[]).some(f=>f.id===c.aml_file_id&&f.person_id===personId)) return "That AML file isn't this person's"; return null; }
function ownEmailErr(agreementId,person){ const em=String((person||{}).email||'').trim().toLowerCase(); if(!em||(DB.agreement_people||[]).some(x=>x.agreement_id===agreementId&&x.id!==person.id&&String(x.email||'').trim().toLowerCase()===em)) return 'Each person signs from their own email. Ask Tim to give each person their own email, or sign in person with him'; return null; }
function rpc(name,a){ logCall('rpc:'+name); try{ if(localStorage.getItem('mockFailRpc')===name) return bad('Failed to fetch'); }catch(_){}   // mockFailRpc = a function name: calling it fails, as with no signal
if(['agent_repo_add','agent_repo_set','agent_repo_share','agent_repo_archive','vendor_repo_list','agent_property_export'].includes(name)) return repoRpc(name,a); if(localStorage.getItem('trHang')==='1'&&['get_translations','set_my_language'].includes(name)) return new Promise(()=>{}); const before=new Map((DB.agreements||[]).map(x=>[x.id,JSON.parse(JSON.stringify(x))]));
  // mockSaveDelay = ms: the inspection save answers late, as on a slow connection (the work is done when the answer arrives)
  // mockRpcDelay = ms: every function call answers late (the shared records' button notes: "Saving..." while it waits)
  let rd=0; try{ rd=+localStorage.getItem('mockRpcDelay')||0; }catch(_){} if(rd) return new Promise(r=>setTimeout(()=>{ const out=rpcInner(name,a); save(); Promise.resolve(out).then(r); },rd));
  let dl=0; try{ dl=+localStorage.getItem('mockSaveDelay')||0; }catch(_){} if(dl&&name==='agent_inspection_save') return new Promise(r=>setTimeout(()=>{ const out=rpcInner(name,a); save(); r(out); },dl));
  const res=rpcInner(name,a); (DB.agreements||[]).forEach(x=>{ const o=before.get(x.id); if(o&&JSON.stringify(o)!==JSON.stringify(x)) syncAgreement(x,o); }); save(); return res; }
function rpcInner(name,a){
  const me=S&&S.user; const ag=a&&a.a?DB.agreements.find(x=>x.id===a.a):null;
  const mine=()=>DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id);
  if(['agent_property_profile','agent_profile_choose','agent_profile_tick','agent_profile_set','agent_person_link_resolve','my_property_profile'].includes(name)) return sharedRpc(name,a,me);
  if(name.startsWith('agent_council_')) return councilRpc(name,a,me);
  if(SIGN_RPCS.includes(name)) return signRpc(name,a,me);
  if(DRAFT_RPCS.includes(name)) return draftRpc(name,a,me);
  if(name.startsWith('offer_sign_')||name.startsWith('offer_round_')) return bad('permission denied for function '+name);
  if(name.startsWith('agent_offer_')) return offerRpc(name,a,me);
  if(name.startsWith('offer_public_')) return bad('permission denied for function '+name);
  const V=()=>(DB.agreement_variations||=[]), VS=()=>(DB.variation_signatures||=[]);
  const vafter=(vr)=>{ const rem=DB.agreement_people.filter(p=>p.agreement_id===vr.agreement_id&&p.legal_name&&p.signed_at&&!VS().some(s=>s.variation_id===vr.id&&s.person_id===p.id)).length; if(!rem){vr.status='signed';vr.signed_at=now();} save(); return ok({remaining:rem}); };
  if(name==='agent_new_variation'){ if(!['signed','countersigned'].includes(ag.status)) return bad('Only a signed agreement can be varied or extended'); if(V().some(v=>v.agreement_id===a.a&&['draft','sent'].includes(v.status))) return bad('Finish or withdraw the open variation first'); const n=V().filter(v=>v.agreement_id===a.a).reduce((m,v)=>Math.max(m,v.number),0)+1; const r={id:uid(),agreement_id:a.a,number:n,status:'draft',changes:{},summary:[],created_at:now()}; V().push(r); save(); return ok(r.id); }
  if(name==='agent_issue_variation'){ const vr=V().find(v=>v.id===a.v); if(vr.status!=='draft') return bad('issued'); if(!vr.summary.length) return bad('Choose at least one change'); VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:null,signer_role:'agent',signer_name:'Timothy McGuire',snapshot:a.p_snapshot,signed_at:now()}); vr.status='sent'; vr.sent_at=now(); vr.signing_mode=a.p_mode; save(); return ok(null); }
  if(name==='vendor_sign_variation'){ const vr=V().find(v=>v.id===a.v); const m=DB.agreement_people.find(p=>p.agreement_id===vr.agreement_id&&p.user_id===me.id); if(vr.status!=='sent') return bad('not open'); if(VS().some(s=>s.variation_id===vr.id&&s.person_id===m.id)) return bad('Already signed'); { const e_=ownEmailErr(vr.agreement_id,m); if(e_) return bad(e_); } VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:m.id,signer_role:'client',signer_name:m.legal_name,snapshot:a.p_snapshot,signed_at:now()}); return vafter(vr); }
  if(name==='agent_sign_variation_in_person'){ const vr=V().find(v=>v.id===a.v); const pr=DB.agreement_people.find(p=>p.id===a.pid); if(vr.status!=='sent') return bad('not open'); { const e_=idCheckErr(a.p_snapshot,pr.legal_name,pr.id); if(e_) return bad(e_); } VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,snapshot:a.p_snapshot,signed_at:now()}); return vafter(vr); }
  if(name==='agent_withdraw_variation'){ const vr=V().find(v=>v.id===a.v); if(vr.status==='draft') DB.agreement_variations=V().filter(v=>v!==vr); else {vr.status='withdrawn';vr.withdrawn_at=now();} save(); return ok(null); }
  const PLS=()=>(DB.prelistings||=[]);
  if(name.startsWith('pl_')){ const r=PLS().find(x=>x.id===a.p); if(!r||r.contact_email!==me.email) return bad('Not found');
    if(name==='pl_save'){ if(r.status!=='appraisal') return bad('sent'); Object.assign(r.answers,a.patch); r.proceeded_at=r.proceeded_at||now(); save(); return ok(null); }
    if(name==='pl_submit'){ if(r.status!=='appraisal') return bad('sent'); const os=(a.patch.owners||[]); if(!os.length||os.some(o=>!o.name||!o.email)) return bad("Add each owner's full name and email"); Object.assign(r.answers,a.patch); r.status='submitted'; r.submitted_at=now(); if(r.property_id){ const ids=(r.answers.owners||[]).map(o=>mergePerson(r.property_id,o.name,o.pref,o.email,o.mobile,null,'questionnaire')).filter(Boolean); if(ids.length) PP().forEach(x=>{ if(x.property_id===r.property_id&&x.role==='owner'&&x.source==='appraisal'&&!ids.includes(x.id)) x.role='contact'; }); syncPrelisting(r); } save(); return ok(null); }
    if(name==='pl_question'){ if(!['plan','question'].includes(r.status)) return bad('no plan'); r.status='question'; r.question=a.q; r.question_at=now(); save(); return ok(null); }
    if(name==='pl_accept'){ if(r.status!=='plan') return bad('tick first'); const aid=uid(); const pr=PT().find(x=>x.id===r.property_id)||{description:{},disclosures:{},ownership:{}}; DB.agreements.push({id:aid,ref:'MRE-2026-'+(1001+DB.agreements.length),address:pr.address||r.address,property_id:r.property_id,status:'draft',config:{appr:'done',ask:'875000',askBasis:'median',flat:'',thr:'250000',pct:'',aml:'Manual',approach:'invited',method:r.appraisal.method,prelisting_id:r.id,title:pr.title_ref||'',owners:pr.owners_on_title||''},answers:Object.assign({},pr.description,pr.disclosures,pr.ownership,{_from_prelisting:true}),legal:{},agreement_version:'v3.15-26102026',created_at:now(),updated_at:now()}); PP().filter(x=>x.property_id===r.property_id&&(x.role||'owner')==='owner'&&(x.legal_name||x.email)).sort((a,b)=>a.position-b.position).forEach((o,i)=>DB.agreement_people.push({id:uid(),agreement_id:aid,position:i+1,legal_name:o.legal_name,pref_name:o.pref_name||'',email:o.email,phone:o.phone||''})); syncAgreement(DB.agreements.at(-1)); r.status='accepted'; r.accepted_at=now(); r.agreement_id=aid; save(); return ok(aid); }
    if(name==='pl_signing_ready'){ const g=DB.agreements.find(x=>x.id===r.agreement_id); return ok(!!g&&g.status!=='draft'); }
  }
  // documents after signing (migrations/005): forms, their signatures, and the REA guide receipt
  const PF=()=>(DB.property_forms||=[]), FS=()=>(DB.form_signatures||=[]), GR=()=>(DB.guide_receipts||=[]);
  const isParty=aid=>!!me&&DB.agreement_people.some(p=>p.agreement_id===aid&&p.user_id===me.id);
  const FV={vendor_declaration:'VD-2026-11',healthy_homes:'HH-2026-11'};
  const fsha=o=>{ let h=0; const t=JSON.stringify(o); for(let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0; return h.toString(16).padStart(8,'0').repeat(8); };
  const fAfter=fm=>{ const rem=DB.agreement_people.filter(p=>p.agreement_id===fm.agreement_id&&p.legal_name&&p.signed_at&&!FS().some(s=>s.form_id===fm.id&&s.person_id===p.id)).length; if(!rem){ fm.status='signed'; fm.signed_at=now(); DB.agreement_events.push({id:uid(),agreement_id:fm.agreement_id,at:now(),actor:'system',kind:'form_all_signed',detail:{form:fm.kind}}); } save(); return ok({remaining:rem}); };
  const fCheck=(fm,signer,path)=>{ const g=DB.agreements.find(x=>x.id===fm.agreement_id); if(!g||!['signed','countersigned'].includes(g.status)) return 'The agreement for this document is no longer in force'; const pre='agreements/'+fm.agreement_id+'/signatures/'; if(!String(path||'').startsWith(pre)||!String(path).slice(pre.length).includes('form-'+fm.id+'-'+signer+'-')) return 'Bad signature path'; return ''; };
  const fSign=(fm,pr,a,extra)=>{ if(needsChecks(fm)) return bad('Please check each answer Tim noted at the inspection before signing'); if(needsAnswers(fm)) return bad('Please answer each question Tim noted at the inspection before signing'); const snap=Object.assign({},a.p_snapshot,{form_kind:fm.kind,form_version:fm.form_version,form_data:fm.data,agent_data:fm.agent_data},extra||{}); FS().push({id:uid(),form_id:fm.id,agreement_id:fm.agreement_id,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,image_path:a.p_image_path,snapshot:JSON.parse(JSON.stringify(snap)),snapshot_sha256:fsha(snap),user_agent:a.p_user_agent,signed_at:now()}); DB.agreement_events.push({id:uid(),agreement_id:fm.agreement_id,at:now(),actor:me.email,kind:'form_signed',detail:{form:fm.kind,name:pr.legal_name}}); return fAfter(fm); };
  if(name==='vendor_form_start'){ if(!isParty(a.a)) return bad('Not your agreement'); const g=DB.agreements.find(x=>x.id===a.a); if(!['signed','countersigned'].includes(g.status)) return bad('This comes after the agreement is signed'); if(!FV[a.p_kind]) return bad('Unknown document'); let fm=PF().find(x=>x.agreement_id===a.a&&x.kind===a.p_kind); if(!fm){ fm={id:uid(),property_id:g.property_id,agreement_id:a.a,kind:a.p_kind,form_version:FV[a.p_kind],status:'draft',data:a.p_kind==='vendor_declaration'?inspPrefill(g.property_id,{}):{},agent_data:{},created_by:me.email,created_at:now(),updated_at:now(),document_id:null}; PF().push(fm); DB.agreement_events.push({id:uid(),agreement_id:a.a,at:now(),actor:me.email,kind:'form_started',detail:{form:a.p_kind}}); save(); } return ok(fm.id); }
  if(name==='vendor_form_save'){ const fm=PF().find(x=>x.id===a.f); if(!fm||!isParty(fm.agreement_id)) return bad('Not found'); if(fm.kind!=='vendor_declaration') return bad('Tim fills in this one'); if(fm.status!=='draft') return bad('This document can no longer be changed');
    const P=JSON.parse(JSON.stringify(a.patch||{})); if(!isObj(P)) return bad('Too much to save at once'); try{ localStorage.setItem('lastVendorSave', JSON.stringify(P)); }catch(_){} /* for tests: what the page sent */ const m=DB.agreement_people.filter(p=>p.agreement_id===fm.agreement_id&&p.user_id===me.id).sort((x,y)=>x.position-y.position)[0]; if(!m) return bad('Not found');
    const d=JSON.parse(JSON.stringify(fm.data||{})), ans=isObj(d.answers)?d.answers:{}, pre=isObj(d.pre)?d.pre:{}, chk=isObj(d.checked)?d.checked:{}, nt=isObj(d.noted)?d.noted:{};
    // any change to one of Tim's notes: the person changing it, and whether it now differs from his note (by value)
    const mine=(k,val)=>({by:m.id,name:m.legal_name,at:now(),changed:(k in nt)&&!declSame(nt[k],val)});
    if(isObj(P.answers)) for(const [k,v] of Object.entries(P.answers)){ if(!isObj(v)) return bad('Not an answer'); if(pre[k]==='inspection'&&!declSame(ans[k],v)){ if(!hasAnswer(k,v)) return bad(NEED_ANSWER); chk[k]=mine(k,v); } ans[k]=v; }
    const ten='tenanted' in P?P.tenanted:d.tenanted;
    if('tenanted' in P&&pre.tenanted==='inspection'&&!declSame(d.tenanted,P.tenanted)){ if(!hasAnswer('tenanted',ten)) return bad(NEED_ANSWER); chk.tenanted=mine('tenanted',ten); }
    if(isObj(P.checked)) for(const [k,v] of Object.entries(P.checked)){ if(pre[k]!=='inspection') continue; if(v===true){ if(!confirmed(chk,k)){ if(!hasAnswer(k,k==='tenanted'?ten:ans[k])) return bad(NEED_ANSWER); chk[k]=mine(k,k==='tenanted'?ten:ans[k]); } } else if(v===false) delete chk[k]; }
    ['tenanted','facts','fileOk','fileChanges','notes','hh','_step','complete','fromFile'].forEach(k=>{ if(k in P) d[k]=P[k]; }); d.answers=ans; d.checked=chk;
    try{ guard('property_forms',fm,{data:d}); }catch(e){ return bad(e.message); } fm.data=d; fm.updated_at=now(); save(); return ok(null); }
  if(name==='vendor_form_sign'){ { const f0=PF().find(x=>x.id===a.f), m0=f0&&DB.agreement_people.find(p=>p.agreement_id===f0.agreement_id&&p.user_id===me.id); if(m0){ const e_=ownEmailErr(f0.agreement_id,m0); if(e_) return bad(e_); } } const fm=PF().find(x=>x.id===a.f); if(!fm||!isParty(fm.agreement_id)) return bad('Not found'); if(fm.status==='signed') return bad('Already signed by everyone'); if(fm.kind==='healthy_homes'&&fm.status!=='ready') return bad("Tim hasn't finished the checklist yet"); const m=DB.agreement_people.find(p=>p.agreement_id===fm.agreement_id&&p.user_id===me.id&&p.signed_at); if(!m) return bad('Signer not found'); if(FS().some(s=>s.form_id===fm.id&&s.person_id===m.id)) return bad('Already signed'); const ce=fCheck(fm,m.id,a.p_image_path); if(ce) return bad(ce); return fSign(fm,m,a); }
  if(name==='agent_form_sign_in_person'){ if(!AGENTS.includes(me.email)) return bad('Not allowed'); { const p0=DB.agreement_people.find(p=>p.id===a.pid); if(p0){ const e_=idCheckErr(a.p_snapshot,p0.legal_name,p0.id); if(e_) return bad(e_); } } const fm=PF().find(x=>x.id===a.f); if(!fm) return bad('Not found'); if(fm.status==='signed') return bad('Already signed by everyone'); if(fm.kind==='healthy_homes'&&fm.status!=='ready') return bad('Finish the checklist first'); const pr=DB.agreement_people.find(p=>p.id===a.pid&&p.agreement_id===fm.agreement_id&&p.signed_at); if(!pr) return bad('Signer not found'); if(FS().some(s=>s.form_id===fm.id&&s.person_id===pr.id)) return bad('Already signed'); const ce=fCheck(fm,pr.id,a.p_image_path); if(ce) return bad(ce); return fSign(fm,pr,a,{signing_method:"In person, on the licensee's device",witnessed_by:'Timothy McGuire'}); }
  if(name==='agent_form_countersign'){ if(!AGENTS.includes(me.email)) return bad('Not allowed'); const fm=PF().find(x=>x.id===a.f); if(!fm) return bad('Not found'); if(fm.kind!=='vendor_declaration') return bad('Only the Vendor Declaration is countersigned'); if(fm.status!=='signed') return bad('Every vendor signs first'); if(fm.countersigned_at) return bad('Already countersigned'); const ce=fCheck(fm,'agent',a.p_image_path); if(ce) return bad(ce); const snap=Object.assign({},a.p_snapshot,{form_kind:fm.kind,form_version:fm.form_version,form_data:fm.data,agent_data:fm.agent_data,countersigned_by:'Timothy McGuire REA#20117983, for McGuire Real Estate Limited',vendor_signatures:FS().filter(s=>s.form_id===fm.id&&s.signer_role==='client').map(s=>s.snapshot_sha256)}); FS().push({id:uid(),form_id:fm.id,agreement_id:fm.agreement_id,person_id:null,signer_role:'agent',signer_name:'Timothy McGuire',image_path:a.p_image_path,snapshot:JSON.parse(JSON.stringify(snap)),snapshot_sha256:fsha(snap),user_agent:a.p_user_agent,signed_at:now()}); fm.countersigned_at=now(); DB.agreement_events.push({id:uid(),agreement_id:fm.agreement_id,at:now(),actor:me.email,kind:'form_countersigned',detail:{form:fm.kind}}); save(); return ok(null); }
  if(name==='vendor_guide_receipt'){ if(!isParty(a.a)) return bad('Not your agreement'); const g=DB.agreements.find(x=>x.id===a.a); if(!['signed','countersigned'].includes(g.status)) return bad('This comes after the agreement is signed'); if(!String(a.p_version||'').trim()) return bad('Guide version missing'); if(!/^[A-Za-z0-9._-]+\.pdf$/.test(a.p_file||'')) return bad('Not a guide file'); if(a.p_sha256!=null&&!/^[0-9a-f]{64}$/.test(a.p_sha256)) return bad('Not a guide fingerprint'); const m=DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id); let r=GR().find(x=>x.person_id===m.id&&x.guide===a.p_guide&&x.version===a.p_version); if(!r){ r={id:GR().length+1,agreement_id:a.a,person_id:m.id,guide:a.p_guide,version:a.p_version,file:a.p_file,sha256:a.p_sha256||null,received_at:now(),user_agent:a.p_user_agent}; GR().push(r); DB.agreement_events.push({id:uid(),agreement_id:a.a,at:now(),actor:me.email,kind:'guide_received',detail:{guide:a.p_guide,version:a.p_version}}); save(); } return ok(r.id); }
  // translation (migration 008)
  const trProblem=(source,text)=>{ const t=String(text==null?'':text).trim(), PH=/\{[A-Za-z][A-Za-z0-9_]*\}/g, TG=/<br\/>|<\/?\d+>/g, NM=/\$?\d+(?:[,.:/]\d+)*%?/g; if(!t) return 'empty'; if(/[\u2014\u2013]/.test(t)) return 'dash'; const bag=(s,re)=>(s.match(re)||[]).slice().sort().join('|'); if(bag(source,PH)!==bag(t,PH)) return 'placeholders changed'; if(bag(source,TG)!==bag(t,TG)) return 'tags changed'; const st=s=>s.replace(PH,' ').replace(TG,' '); if(bag(st(source),NM)!==bag(st(t),NM)) return 'number changed'; for(const k of ['McGuire Real Estate','Timothy McGuire','Tim McGuire','McGuire','Tim','List Now','NZRET','Public Trust','LIM','GST','REA','AML/CFT','Real Estate Authority','Real Estate Agents Act']){ const re=new RegExp('(^|[^A-Za-z])'+k.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'($|[^A-Za-z])'); if(re.test(source)&&!re.test(t)) return 'name changed: '+k; } return ''; };
  const TS=()=>(DB.translation_sets||=[]), pulledSet=(sc,ref,lang)=>TS().some(x=>x.withdrawn&&sameSet(x,sc,ref,lang)), TR=()=>(DB.translations||=[]), UL=()=>(DB.user_language||=[]), TL=()=>(DB.translation_log||=[]);
  const sameSet=(x,sc,ref,lang)=>x.scope===sc&&x.lang===lang&&(x.ref||ZERO)===(ref||ZERO);
  if(name==='get_translations'){ const o={}; TR().filter(x=>x.lang===a.p_lang&&x.scope===a.p_scope&&(x.ref||ZERO)===(a.p_ref||ZERO)&&trVisible(x)).forEach(x=>{ o[x.source]=x.text; }); return ok(o); }
  if(name==='set_my_language'){ if(!me) return bad('Not signed in'); if(!['en','mi','sm','to','hi','ko','zh'].includes(a.p_lang)) return bad('Unknown language'); const r=UL().find(x=>x.user_id===me.id); if(r){ r.lang=a.p_lang; r.updated_at=now(); } else UL().push({user_id:me.id,lang:a.p_lang,updated_at:now()}); save(); return ok(null); }
  if(name.startsWith('agent_')&&['agent_save_translations','agent_store_translations','agent_publish_translations','agent_translation_usage','agent_edit_translation','agent_approve_translations','agent_withdraw_translations'].includes(name)){
    if(!me||!AGENTS.includes(me.email)) return bad('Not allowed');
    if(name==='agent_store_translations'||name==='agent_save_translations'){ if(!['screens','guide','plan','variation'].includes(a.p_scope)||!['mi','sm','to','hi','ko','zh'].includes(a.p_lang)) return bad('Unknown set'); if((a.p_scope==='plan'||a.p_scope==='variation')!==!!a.p_ref) return bad('A plan or variation needs its id'); let n=0, held=0, skipped=0; const problems=[]; const pulled=pulledSet(a.p_scope,a.p_ref,a.p_lang), stt=pulled?'awaiting_check':'approved', who=pulled?null:'Automatic (not checked by a person)';
      (a.p_rows||[]).forEach(r=>{ if(!String(r.source||'').trim()||!String(r.text||'').trim()){ skipped++; return; } const why=trProblem(r.source,r.text); if(why){ skipped++; problems.push({source:String(r.source),reason:why}); return; } let x=TR().find(t=>sameSet(t,a.p_scope,a.p_ref,a.p_lang)&&t.source===r.source); if(!x){ x={id:uid(),scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,source:r.source,text:r.text,status:stt,model:a.p_model,translated_at:now(),created_at:now(),approved_by:who,approved_at:pulled?null:now()}; TR().push(x); if(pulled) held++; else n++; } else if(!x.edited_by){ x.text=r.text; x.status=stt; x.approved_by=who; x.approved_at=pulled?null:now(); x.model=a.p_model; x.translated_at=now(); if(pulled) held++; else n++; } });
      if(n) TL().push({id:TL().length+1,at:now(),kind:'approved',scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,by_name:'Automatic (not checked by a person)',by_email:me.email,strings:n}); save(); return ok(name==='agent_save_translations'?n:{saved:n,held,skipped,problems}); }
    if(name==='agent_publish_translations'){ let n=0; { const t=TS().find(x=>sameSet(x,a.p_scope,a.p_ref,a.p_lang)); if(t) t.withdrawn=false; else TS().push({scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,withdrawn:false}); } TR().filter(x=>sameSet(x,a.p_scope,a.p_ref,a.p_lang)&&x.status==='awaiting_check'&&!trProblem(x.source,x.text)).forEach(x=>{ x.status='approved'; x.approved_by=x.approved_by||'Automatic (not checked by a person)'; x.approved_at=now(); n++; }); if(n) TL().push({id:TL().length+1,at:now(),kind:'approved',scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,by_name:'Automatic (not checked by a person)',by_email:me.email,strings:n}); save(); return ok(n); }
    if(name==='agent_translation_usage'){ const c=JSON.parse(localStorage.getItem('trReqs')||'[]').length; return ok({calls:c,failed:0,input_tokens:c*1000,output_tokens:c*500,by_model:{}}); }
    if(name==='agent_edit_translation'){ const x=TR().find(t=>t.id===a.p_id); if(!x) return bad('Not found'); if(x.text===a.p_text) return ok(null); const why=trProblem(x.source,a.p_text); if(why) return bad('That correction cannot be saved ('+why+')'); x.text=a.p_text; x.status=pulledSet(x.scope,x.ref,x.lang)?'awaiting_check':'approved'; x.approved_by=x.approved_by||'Automatic (not checked by a person)'; x.approved_at=x.approved_at||now(); x.edited_by=(a.p_by||'').trim()||'Unnamed'; x.edited_at=now(); TL().push({id:TL().length+1,at:now(),kind:'edited',scope:x.scope,ref:x.ref||null,lang:x.lang,by_name:x.edited_by,by_email:me.email,strings:1,translation_id:x.id}); save(); return ok(null); }
    if(name==='agent_approve_translations'){ return bad('permission denied for function agent_approve_translations'); if(!String(a.p_name||'').trim()) return bad('Type the name of the person who checked it'); if(!Array.isArray(a.p_items)||!a.p_items.length) return bad('Nothing was shown to approve'); let n=0; a.p_items.forEach(it=>{ const x=TR().find(t=>t.id===it.id&&sameSet(t,a.p_scope,a.p_ref,a.p_lang)&&t.status==='awaiting_check'&&t.text===it.text); if(x){ x.status='approved'; x.approved_by=a.p_name.trim(); x.approved_at=now(); n++; } }); if(!n) return bad('Nothing is waiting to be checked, or it changed after you read it'); TL().push({id:TL().length+1,at:now(),kind:'approved',scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,by_name:a.p_name.trim(),by_email:me.email,strings:n}); save(); return ok(n); }
    if(name==='agent_withdraw_translations'){ { const t=TS().find(x=>sameSet(x,a.p_scope,a.p_ref,a.p_lang)); if(t) t.withdrawn=true; else TS().push({scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,withdrawn:true}); } const rows=TR().filter(x=>sameSet(x,a.p_scope,a.p_ref,a.p_lang)&&x.status==='approved'); rows.forEach(x=>{ x.status='awaiting_check'; }); TL().push({id:TL().length+1,at:now(),kind:'withdrawn',scope:a.p_scope,ref:a.p_ref||null,lang:a.p_lang,by_email:me.email,strings:rows.length}); save(); return ok(rows.length); }
  }
  // agent_set_stage (migration 009): the same rules as the database function
  if(name==='agent_set_stage'){ if(!me||!AGENTS.includes(me.email)) return bad('Agent only'); if(a.p_confirmed!==true) return bad('Please confirm the change first');
    if(!['live','under_offer','sold','settled','withdrawn'].includes(a.p_stage)) return bad('That is not a stage you can set here');
    const p=PT().find(x=>x.id===a.pid); if(!p) return bad('Property not found'); if(['settled','withdrawn'].includes(p.stage)) return bad('This property has finished. Start it again from an appraisal first');
    const RK=['signed','live','under_offer','sold']; if(!RK.includes(p.stage)) return bad('The agreement has to be signed and countersigned first'); if(p.stage===a.p_stage) return bad('It is already at that stage');
    const lv=(DB.agreements||[]).filter(g=>g.property_id===p.id&&live(g)).sort((x,y)=>(x.created_at||'')<(y.created_at||'')?-1:1); if(!lv.length) return bad('There is no agreement in force on this property'); const govs=lv.filter(g=>g.status==='countersigned'); if(!govs.length) return bad('Countersign the agreement first');
    const why=String(a.p_reason||'').trim()||null, newest=govs[govs.length-1], from=p.stage; let back=false;   // the governing agreement: the newest in force that is countersigned
    if(['live','under_offer','sold'].includes(a.p_stage)){ if(RK.indexOf(a.p_stage)<RK.indexOf(from)){ back=true; if(!why||why.length<3) return bad('Say why you are going back'); } else if(from==='signed'&&a.p_stage!=='live') return bad('Put it on the market first'); p.stage=a.p_stage; p.stage_at=now(); }
    else { if(a.p_stage==='settled'&&from!=='sold') return bad('Mark it sold before it is settled'); const reason=a.p_stage==='settled'?'Sold and settled':'Withdrawn';
      lv.forEach(g=>{ g.status='ended'; g.ended_at=g.ended_at||now(); DB.agreement_events.push({id:uid(),agreement_id:g.id,at:now(),actor:me.email,kind:'agency_ended',detail:{reason}}); }); p.stage=a.p_stage; p.stage_at=now(); }
    const kind=back?'stage_back':'stage_changed', detail=Object.assign({from,to:a.p_stage},why?{reason:why}:{});
    (DB.property_events||=[]).push({id:DB.property_events.length+1,property_id:p.id,agreement_id:newest.id,at:now(),actor:me.email,kind,detail});
    DB.agreement_events.push({id:uid(),agreement_id:newest.id,at:now(),actor:me.email,kind,detail}); save(); return ok({from,to:a.p_stage,agreement_id:newest.id}); }
  if(name.startsWith('agent_inspection_')){ if(offline()) return bad('Failed to fetch');
    // test switches: mockAuthFail = '1' (the sign-in has run out), mockRefuse = 'd:pegs' (the server names one answer it refuses) or 'all' (a refusal naming none)
    try{ if(localStorage.getItem('mockAuthFail')==='1') return bad('JWT expired'); }catch(_){}
    if(!me||!AGENTS.includes(me.email)) return bad('Agent only');
    if(name==='agent_inspection_start'){ let pid=a.p_property; const addr=String(a.p_address||'').replace(/\s+/g,' ').trim(); let made=false;
      if(!pid){ if(addr.length<3) return bad('Add the address'); if(PT().some(p=>(p.address||'').replace(/\s+/g,' ').trim().toLowerCase()===addr.toLowerCase())) return bad('That address is already on file. Choose it from the list'); pid=newProp(addr).id; made=true; }
      else if(!PT().some(p=>p.id===pid)) return bad('Property not found');
      const p=PT().find(x=>x.id===pid); const open=PI().filter(i=>i.property_id===pid&&i.status==='in_progress'&&(!p.cycle_at||i.started_at>=p.cycle_at)).sort((x,y)=>x.started_at<y.started_at?1:-1)[0];
      if(open){ save(); return ok({inspection_id:open.id,property_id:pid,created_property:made,resumed:true}); }
      const i={id:uid(),property_id:pid,status:'in_progress',facts:{},declaration:{},notes:{},photos:[],stamps:{},applied:{},conflicts:{},resolved:{},sent_form_id:null,sent_at:null,created_by:me.email,started_at:now(),finished_at:null,created_at:now(),updated_at:now()}; PI().push(i); save();
      return ok({inspection_id:i.id,property_id:pid,created_property:made,resumed:false}); }
    const i=PI().find(x=>x.id===a.iid); if(!i) return bad('Inspection not found');
    if(name==='agent_inspection_save'){ const isO=x=>x==null||isObj(x); if(!isO(a.p_facts)||!isO(a.p_decl)||!isO(a.p_notes)||!isO(a.p_stamps)) return bad('Bad answers');
      // the server's limit on one save (60000 characters of answers); mockMaxBatch = n lowers it, for testing how the phone splits a queue
      const size=JSON.stringify(a.p_facts||{}).length+JSON.stringify(a.p_decl||{}).length+JSON.stringify(a.p_notes||{}).length; let lim=60000; try{ lim=+localStorage.getItem('mockMaxBatch')||60000; }catch(_){}
      if(size>lim){ try{ const l=JSON.parse(localStorage.getItem('mockBatchLog')||'[]'); l.push('refused:'+size); localStorage.setItem('mockBatchLog',JSON.stringify(l)); }catch(_){} return bad('Too much to save at once'); }
      try{ const l=JSON.parse(localStorage.getItem('mockBatchLog')||'[]'); l.push('saved:'+size); localStorage.setItem('mockBatchLog',JSON.stringify(l)); }catch(_){}
      let refuse=null; try{ refuse=localStorage.getItem('mockRefuse'); }catch(_){}
      if(refuse==='all') return bad('Something went wrong on the server');
      const W=JSON.parse(JSON.stringify(i)); W.stamps||={}; const ST=a.p_stamps||{}, skipped={}, nowIso=()=>new Date().toISOString();
      const older=sk=>{ const t=stampTs(ST[sk]), o=stampTs(W.stamps[sk]); return t!=null&&o!=null&&o>t; };
      const named=sk=>refuse===sk;   // the server refuses this one answer, by name
      for(const [k,v] of Object.entries(a.p_notes||{})){ const sk='n:'+k; if(!NOTE_KEYS.includes(k)) return bad('Not saved ('+sk+'): unknown section'); if(older(sk)){ skipped[sk]=W.notes[k]??null; continue; } W.stamps[sk]=ST[sk]||nowIso(); if(jblank(v)) delete W.notes[k]; else if(typeof v!=='string'||v.length>4000||named(sk)) return bad('Not saved ('+sk+'): a note can be up to 4000 characters'); else W.notes[k]=v; }
      for(const [k,v] of Object.entries(a.p_decl||{})){ const sk='d:'+k; if(!DECL_KEYS.includes(k)) return bad('Not saved ('+sk+'): unknown question'); if(older(sk)){ skipped[sk]=W.declaration[k]??null; continue; }
        if(jblank(v)||(isObj(v)&&jblank(v.a)&&jblank(v.d))){ delete W.declaration[k]; W.stamps[sk]=ST[sk]||nowIso(); continue; } if(!isObj(v)) return bad('Not saved ('+sk+'): not an answer');
        if(named(sk)) return bad('Not saved ('+sk+'): not one of the choices');
        if(k==='tenanted'){ if(!['now','will','no'].includes(v.a)) return bad('Not saved ('+sk+'): not one of the choices'); W.declaration[k]={a:v.a}; }
        else { if(!jblank(v.a)&&!['yes','no','unknown'].includes(v.a)) return bad('Not saved ('+sk+'): not one of the choices'); if(String(v.d||'').length>4000) return bad('Not saved ('+sk+'): details can be up to 4000 characters'); W.declaration[k]=Object.assign(v.a?{a:v.a}:{},{d:v.d||''}); }
        W.stamps[sk]=ST[sk]||nowIso(); }
      const pr=PT().find(x=>x.id===i.property_id); const ag=(DB.agreements||[]).filter(g=>g.property_id===i.property_id&&live(g)).sort((x,y)=>(x.created_at||'')<(y.created_at||'')?1:-1)[0];
      const draftOk=!!ag&&ag.status==='draft'&&!DB.agreement_people.some(p=>p.agreement_id===ag.id&&p.signed_at), draft={};
      const dsc=Object.assign({},pr.description), dis=Object.assign({},pr.disclosures);
      for(const [k,v] of Object.entries(a.p_facts||{})){ const sk='f:'+k; if(!DESC.includes(k)&&!DISC.includes(k)) return bad('Not saved ('+sk+'): unknown property detail');
        if(named(sk)||(!jblank(v)&&!(typeof v==='string'&&v.length<=4000)&&!(Array.isArray(v)&&v.length<=40&&v.every(e=>typeof e==='string')))) return bad('Not saved ('+sk+'): not a property detail');
        if(older(sk)){ skipped[sk]=W.facts[k]??null; continue; } W.stamps[sk]=ST[sk]||nowIso();
        const T=DESC.includes(k)?dsc:dis;
        if(jblank(v)){ if(k in W.applied&&same(T[k],W.applied[k].v)){ const was=W.applied[k].was; if(jblank(was)) delete T[k]; else T[k]=was; }
          // 014: "no hazards" while the agreement in force lists some is a difference for Tim, not a silent clear
          if(['hazards','hazOther'].includes(k)&&ag&&!jblank((ag.answers||{})[k])){ W.facts[k]=v; delete W.applied[k]; delete W.resolved[k]; W.conflicts[k]={agreement_id:ag.id,ref:ag.ref,agreement:ag.answers[k],inspection:v}; continue; }
          delete W.facts[k]; delete W.conflicts[k]; delete W.applied[k]; delete W.resolved[k]; continue; }
        W.facts[k]=v; delete W.resolved[k];
        if(ag&&!jblank((ag.answers||{})[k])&&!same(ag.answers[k],v)){ W.conflicts[k]={agreement_id:ag.id,ref:ag.ref,agreement:ag.answers[k],inspection:v}; continue; }
        delete W.conflicts[k]; W.applied[k]={v,was:k in W.applied?W.applied[k].was:(T[k]??null)}; T[k]=v;
        if(draftOk&&!same((ag.answers||{})[k],v)) draft[k]=v; }
      pr.description=dsc; pr.disclosures=dis; Object.assign(i,W,{updated_at:now()});
      if(Object.keys(draft).length){ const old=JSON.parse(JSON.stringify(ag)); ag.answers=Object.assign({},ag.answers,draft); syncAgreement(ag,old); DB.agreement_events.push({id:uid(),agreement_id:ag.id,at:now(),actor:me.email,kind:'inspection_applied',detail:{keys:Object.keys(draft)}}); }
      save(); return ok({conflicts:i.conflicts,resolved:i.resolved,skipped}); }
    if(name==='agent_inspection_resolve'){ if(!['inspection','agreement'].includes(a.p_use)) return bad('Choose which to keep'); const c=i.conflicts[a.p_key]; if(!c) return bad('Nothing to choose here'); let upd=false;
      const g=(DB.agreements||[]).find(x=>x.id===c.agreement_id)||{};
      if(a.p_use==='inspection'){ const v=i.facts[a.p_key], pr=PT().find(x=>x.id===i.property_id), T=DESC.includes(a.p_key)?pr.description:pr.disclosures; i.applied[a.p_key]={v,was:T[a.p_key]??null}; T[a.p_key]=v;
        if(g.status==='draft'&&!DB.agreement_people.some(p=>p.agreement_id===g.id&&p.signed_at)){ g.answers=Object.assign({},g.answers,{[a.p_key]:v}); upd=true; DB.agreement_events.push({id:uid(),agreement_id:g.id,at:now(),actor:me.email,kind:'inspection_applied',detail:{key:a.p_key}}); } }
      delete i.conflicts[a.p_key]; i.resolved[a.p_key]={use:a.p_use,at:now()}; i.updated_at=now(); save(); return ok({agreement_updated:upd,agreement_status:g.status||null,ref:g.ref||null}); }
    if(name==='agent_inspection_finish'){ i.status='finished'; i.finished_at=i.finished_at||now(); i.updated_at=now(); save(); return ok(null); }
    if(name==='agent_inspection_send'){ const li=latestInsp(i.property_id); if(!li||!Object.keys(li.declaration).length) return bad('There are no Vendor Declaration answers to send');
      const g=(DB.agreements||[]).filter(x=>x.property_id===i.property_id&&['signed','countersigned'].includes(x.status)).sort((x,y)=>(x.created_at||'')<(y.created_at||'')?1:-1)[0]; if(!g) return bad('The agreement has to be signed first');
      let fm=PF().find(x=>x.agreement_id===g.id&&x.kind==='vendor_declaration'); if(fm&&(fm.status!=='draft'||FS().some(s=>s.form_id===fm.id))) return bad("The Vendor Declaration has been signed, so the inspection can't change it");
      const m=mergeDecl(fm?fm.data:{},li); let made=false;
      if(!fm){ fm={id:uid(),property_id:g.property_id,agreement_id:g.id,kind:'vendor_declaration',form_version:FV.vendor_declaration,status:'draft',data:m.data,agent_data:{},created_by:me.email,created_at:now(),updated_at:now(),document_id:null}; PF().push(fm); made=true; DB.agreement_events.push({id:uid(),agreement_id:g.id,at:now(),actor:me.email,kind:'form_started',detail:{form:'vendor_declaration',via:'inspection'}}); }
      else { fm.data=clearChanged(fm.data,m.data); fm.updated_at=now(); }
      i.sent_form_id=fm.id; i.sent_at=now(); DB.agreement_events.push({id:uid(),agreement_id:g.id,at:now(),actor:me.email,kind:'inspection_sent',detail:{added:m.added,updated:m.updated,kept:m.kept.length}}); save();
      return ok({form_id:fm.id,agreement_id:g.id,created:made,added:m.added,updated:m.updated,kept:m.kept}); }
  }
  if(name==='agent_reopen_property'){ const p=PT().find(x=>x.id===a.pid); if(!p||!['withdrawn','settled'].includes(p.stage)) return bad('Only a withdrawn or settled property can start again'); if(a.new_owners){ active(p.id).forEach(x=>x.role='former'); p.owners_on_title=null; p.ownership={}; p.disclosures={}; p.cycle_at=now(); if(Object.keys(p.found||{}).length){ p.found={}; p.provenance={}; (DB.council_use_log||=[]).push({id:DB.council_use_log.length+1,property_id:p.id,kind:'cleared',detail:{reason:'new owners'},actor:me.email,at:now()}); }
      /* migration 016: new owners start with nothing shared */ (DB.property_documents||[]).filter(d=>d.property_id===p.id&&d.shared_at).forEach(d=>pdUpdate(d,{shared_at:null})); } p.stage='appraisal'; p.stage_at=now(); save(); return ok(null); }
  if(name==='is_agent') return ok(AGENTS.includes(me.email));
  if(name==='claim_my_agreements'){ DB.agreement_people.forEach(p=>{ if(p.email.toLowerCase()===me.email&&!p.user_id) p.user_id=me.id;}); save(); return ok([...new Set(DB.agreement_people.filter(p=>p.user_id===me.id).map(p=>p.agreement_id))].filter(id=>DB.agreements.find(x=>x.id===id).status!=='draft')); }
  if(['vendor_forward_to_lawyer','vendor_send_to_lawyer','agent_send_to_lawyer'].includes(name)&&a.l_phone&&String(a.l_phone).trim()&&!/^[0-9+()\-. ]{6,40}$/.test(String(a.l_phone).trim())) return bad("That phone number doesn't look right");   // 030
  if(name==='vendor_forward_to_lawyer'){ if(!mine()) return bad('Not your agreement'); if(!['signed','countersigned'].includes(ag.status)) return bad('not signed'); DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,phone:a.l_phone?String(a.l_phone).trim()||null:null,sent_by:mine().legal_name,sent_at:now(),open_count:0}); save(); return ok(null);}
  if(name==='vendor_request_cancellation'){ const m=DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id); if(!['signed','countersigned'].includes(ag.status)) return bad('state'); if(DB.cancellation_requests.some(r=>r.agreement_id===a.a&&r.status!=='processed')) return bad('A cancellation request is already with Tim'); const r={id:uid(),agreement_id:a.a,person_id:m.id,requested_by:m.legal_name,reasons:a.p_reasons||null,phone:a.p_phone,acks:a.p_acks,requested_at:now(),within_cooling_off:true,status:'requested'}; DB.cancellation_requests.push(r); save(); return ok(r.id);}
  if(name==='agent_process_cancellation'){ const r=DB.cancellation_requests.find(x=>x.id===a.rid); r.status='processed'; r.outcome=a.p_outcome; r.agent_notes=a.p_notes; r.processed_at=now(); if(a.p_outcome==='cancelled'){ const g=DB.agreements.find(x=>x.id===r.agreement_id); g.status='cancelled'; } save(); return ok(null);}
  if(name==='agent_set_legal'){ ag.legal=Object.assign({},ag.legal,{choice:a.choice}); if(['draft','parked'].includes(ag.status)) ag.status='sent'; save(); return ok(null);}
  if(name==='agent_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,phone:a.l_phone?String(a.l_phone).trim()||null:null,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name}); save(); return ok(uid());}
  if(name==='agent_sign_in_person'){ if(!['draft','sent'].includes(ag.status)) return bad('closed'); { const p0=DB.agreement_people.find(p=>p.id===a.pid); if(p0){ const e_=idCheckErr(a.p_snapshot,p0.legal_name,p0.id); if(e_) return bad(e_); } } if(!['have','waive'].includes((ag.legal||{}).choice)) return bad('legal'); { const an=ag.answers||{}; if(!Array.isArray(an.guide)||!Array.isArray(an.acks)||[0,1,2,3,4,5,6,7].some(i=>!an.guide.includes(String(i)))) return bad('Tick each section of the plain-English guide once you\'ve been through it together'); if([0,1,2,3,4,5,6,7,8,9,10].some(i=>!an.acks.includes(String(i)))) return bad('Tick each item under "Before signing" first'); } const pr=DB.agreement_people.find(x=>x.id===a.pid); if(!pr||pr.signed_at) return bad('signer'); if(ag.status==='draft') ag.status='sent'; pr.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abcdef0123456789ffff',signed_at:now()}); const rem=DB.agreement_people.filter(x=>x.agreement_id===a.a&&x.legal_name&&!x.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-11-03T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
  if(!['agent_end_agency','agent_set_legal','agent_send_to_lawyer','agent_sign_in_person','vendor_request_cancellation','agent_process_cancellation'].includes(name)){ if(!mine()) return bad('Not your agreement'); if(!['sent','parked'].includes(ag.status)) return bad('closed'); }
  if(name==='vendor_save'){ Object.assign(ag.answers,a.patch); save(); return ok(null);}
  if(name==='vendor_upsert_person'){ let r; if(a.pid){ r=DB.agreement_people.find(p=>p.id===a.pid); const pl={legal_name:a.p_legal,pref_name:a.p_pref,phone:a.p_phone}; try{ guard('agreement_people',r,pl); }catch(e){ return bad(e.message); } Object.assign(r,pl); } else { r={id:uid(),agreement_id:a.a,position:9,legal_name:a.p_legal,pref_name:a.p_pref,email:a.p_email,phone:a.p_phone}; DB.agreement_people.push(r); } personSync(r); save(); return ok(null);}
  if(name==='vendor_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,phone:a.l_phone?String(a.l_phone).trim()||null:null,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name,firm:a.l_firm}); save(); return ok(null);}
  if(name==='vendor_set_legal'){ ag.status='sent'; ag.legal=Object.assign({},ag.legal,{choice:a.choice}); save(); return ok(null);}
  if(name==='vendor_sign'){ const m=mine(); if(m){ const e_=ownEmailErr(m.agreement_id,m); if(e_) return bad(e_); } if(!['have','waive'].includes(ag.legal.choice)) return bad('legal'); const an=ag.answers||{}; if(!Array.isArray(an.guide)||!Array.isArray(an.acks)||[0,1,2,3,4,5,6,7].some(i=>!an.guide.includes(String(i)))) return bad('Please go through each part of the agreement before signing'); if([0,1,2,3,4,5,6,7,8,9,10].some(i=>!an.acks.includes(String(i)))) return bad('Please tick each item on the Before you sign page first'); m.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:m.id,signer_role:'client',signer_name:m.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abc123def4567890ffff',signed_at:now()}); const rem=DB.agreement_people.filter(p=>p.agreement_id===a.a&&p.legal_name&&!p.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-10-27T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
  if(name==='agent_end_agency'){ if(ag.status!=='cancelled') ag.status='ended'; const p=PT().find(x=>x.id===ag.property_id); if(p&&!(DB.agreements||[]).some(o=>o.property_id===p.id&&o.id!==ag.id&&!['ended','cancelled'].includes(o.status))){ p.stage=a.reason==='Sold and settled'?'settled':'withdrawn'; } save(); return ok(null);}
  return bad('unknown rpc '+name);
}
// ── public council records (mirrors migrations/013_council_lookup.sql and fn/property_lookup.ts) ──
// localStorage councilResults = { "<normalised address>[|unit ref][#candidate]": <result from fn/property_lookup_core.ts> } (the test
// computes them with the real core and recorded answers); councilMode = 'offline' (the function can't be reached) or 'hang' (it
// never answers); councilDelay = ms (the function answers late).
const CL=()=>(DB.council_lookups||=[]), CUL=()=>(DB.council_use_log||=[]);
const cNorm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isAgentMe=()=>!!(S&&S.user&&AGENTS.includes(S.user.email));
function councilTable(op){ if(offline()) throw new Error('Failed to fetch'); if(op!=='select') throw new Error('permission denied for this table'); if(!isAgentMe()) return {data:[],error:null}; return null; }
// ── the offer form (mirrors migrations/018_offer_form.sql and fn/offer_public_handler.ts) ──
// Vendors and anyone not signed in get nothing from the offer tables. The public door is functions.invoke('offer-public') (info,
// submit) and doc-prefill's offer_condition mode (help wording a condition). localStorage mockNet names the caller's network (for
// the rate limits); offerAiMode = 'off' | 'fail' | 'unsuitable' changes the helper's answer. No email is ever sent: the
// notification is recorded in email_log with mock: true.
const DRAFT_TABLES=['offer_blanks','offer_blank_maps','offer_blank_reads','offer_terms','offer_term_changes','offer_drafts','offer_draft_approvals','offer_lawyer_lookups','offer_file_hashes'];   // migration 019
const OFFER_TABLES=['offer_links','offer_events','offer_settings','offer_clauses','offer_hits'].concat(DRAFT_TABLES,['offer_signings','offer_signers','offer_sign_taps','offer_sign_receipts','offer_sign_marks','offer_sign_reviews','offer_sign_asks','offer_rounds','offer_documents','offer_agreements','offer_mail_drafts','offer_mail_log','offer_holds','offer_requests','offer_deposit_holders','offer_sign_undos','offer_sign_redraws','offer_confirm_holds','offer_sign_taps_live','offer_sign_marks_live','offer_sign_reviews_live']);   // and migrations 023, 024 and 026
const OL=()=>(DB.offer_links||=[]), OE=()=>chainArr(DB.offer_events||=[]), OH=()=>(DB.offer_hits||=[]), PO=()=>(DB.property_offers||=[]);
const OSET=()=>{ DB.offer_settings||=[]; if(!DB.offer_settings.length) DB.offer_settings.push({id:true,ks_warn_working_days:15,ai_daily_cap:40,updated_at:now()}); const o_=DB.offer_settings[0]; if(o_.agent_phone==null) o_.agent_phone='027 562 7207'; if(o_.agent_email==null) o_.agent_email=AGENTS[0]; return o_; };   // 025: the agent's own phone and email
const offerStageOk=s=>['signed','live','under_offer'].includes(s);
const offerToken=()=>{ const b=new Uint8Array(32); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); };
const TOKEN_RE=/^[A-Za-z0-9_-]{40,64}$/;
function offerLive(tok){ if(!TOKEN_RE.test(String(tok||''))) return null; const l=OL().find(x=>x.token===tok&&x.open); if(!l) return null; const p=PT().find(x=>x.id===l.property_id); return p&&offerStageOk(p.stage)?l:null; }
const hits=(kind,net,pid,ms)=>OH().filter(h=>h.kind===kind&&Date.now()-Date.parse(h.at)<ms&&(net==null||h.net===net)&&(pid==null||h.property_id===pid)).length;
const mockNet=()=>{ try{ return localStorage.getItem('mockNet')||'net-1'; }catch(_){ return 'net-1'; } };
const nzToday0=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
// offer_clean(): known fields only, each checked and capped. Throws the first problem in plain words.
function offerClean(p,agent){ const O=window.OFFERS; if(!p||typeof p!=='object'||Array.isArray(p)) throw new Error('Nothing was sent'); if(JSON.stringify(p).length>60000) throw new Error('That is more than the form can take');
  const t=v=>{ const s=String(v??'').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim(); return s||null; };
  const cap=(v,n,what)=>{ const s=t(v); if(s&&s.length>n) throw new Error(`Please shorten ${what}: ${n} characters at most`); return s; };
  // migration 021: a condition may wait for another on the same offer ({key, after, days}); refused as the database refuses it
  if(Array.isArray(p.conditions)){ const ks=p.conditions.map(c=>c&&c.key);
    for(const c of p.conditions){ if(!c||c.after==null||c.after==='') continue; const n=c.days===''||c.days==null?null:Math.floor(+c.days);
      if(typeof c.after!=='string'||c.after===c.key||!ks.includes(c.after)) throw new Error("Please check the conditions: a condition waits for one that isn't on the offer");
      if(!(n>=1&&n<=250)) throw new Error('Please add the working days for each condition'); }
    for(const c of p.conditions){ const cp=c&&c.after?O.chainProblem(p.conditions,c.key):null; if(cp&&cp.kind==='loop') throw new Error('Please check the conditions: they wait for each other in a loop'); if(cp&&cp.kind==='deep') throw new Error('Please check the conditions: too many wait for one another in a row'); } }
  if(p.line_up!=null&&typeof p.line_up!=='boolean') throw new Error('Please check the conditions');
  const errs=O.validate(Object.assign({},p,{email:agent&&!t(p.email)?'x@x.nz':p.email}),{skipDates:true});
  if(errs.length) throw new Error(errs[0].text.replace(/\.$/,''));
  const today=nzToday0(), minDay=agent?O.addDays(today,-90):today, maxDay=O.addDays(today,1100), dOk=d=>{ if(!d) return null; if(!O.isDate(d)||d<minDay||d>maxDay) throw new Error('The date for a condition needs to be from today to three years ahead'); return d; };
  const keys=O.CONDITIONS.map(c=>c.key).concat('custom'), seen=[];
  const conds=(p.conditions||[]).map(c=>{ if(!keys.includes(c.key)||seen.includes(c.key)) throw new Error('Please check the conditions'); seen.push(c.key);
    const n=c.days===''||c.days==null?null:Math.floor(+c.days); const a=t(c.after); const d=a?null:dOk(t(c.date)); if(!d&&!(n>=1&&n<=250)) throw new Error('Please add the working days or a date for each condition');
    const o={key:c.key}; if(a){ o.after=a; o.days=n; } else if(d) o.date=d; else o.days=n; if(c.key==='technical') o.detail=cap(c.detail,300,'the kind of technical report'); if(c.key==='custom'){ const w=cap(c.wording,2000,'your condition'), r=cap(c.request,600,'your description'); if(w) o.wording=w; if(r) o.request=r; o.ai=c.ai===true; } return o; });
  const s=p.settlement||{}; const settlement=s.kind==='date'?{kind:'date',date:dOk(t(s.date))}:{kind:'relative',days:Math.floor(+s.days)};
  if(settlement.kind==='relative'&&!(settlement.days>=1&&settlement.days<=250)) throw new Error('Please add the settlement working days');
  const lw=p.lawyer||{};
  return {email:(cap(p.email,254,'your email')||'').toLowerCase()||null,phone:cap(p.phone,40,'your phone number'),seen_docs:p.seen_docs,sign:p.sign,price:+String(p.price).replace(/[$, ]/g,''),settlement,conditions:conds,lawyer_approval:seen.includes('lawyer'),
    sale_address:seen.includes('sale')?cap(p.sale_address,300,'the address'):null,kiwisaver:p.kiwisaver,entity:cap(p.entity,200,'the company or trust name'),nominee:p.nominee!==false,
    purchasers:(p.purchasers||[]).map(x=>({first:cap(x.first,120,'first names'),last:cap(x.last,120,'last name'),email:(cap(x.email,254,'email')||'').toLowerCase()||null,phone:cap(x.phone,40,'phone')})),
    chattels_add:(p.chattels_add||[]).map(x=>cap(x,200,'each chattel')).filter(Boolean),chattels_exclude:(p.chattels_exclude||[]).map(x=>cap(x,200,'each chattel')).filter(Boolean),
    gst_registered:typeof p.gst_registered==='boolean'?p.gst_registered:null,gst_number:p.gst_registered===true?cap(p.gst_number,40,'the GST number'):null,
    comments:cap(p.comments,3000,'your comments'),lawyer:{firm:cap(lw.firm,200,'the law firm'),person:cap(lw.person,200,'the lawyer'),email:(cap(lw.email,254,'email')||'').toLowerCase()||null,phone:cap(lw.phone,40,'phone')},
    related:p.related,date_help:p.date_help===true,privacy:true,v:1,...(p.line_up===true?{line_up:true}:{})}; }
const offerLabel=d=>(d.entity||(d.purchasers||[]).map(x=>((x.first||'')+' '+(x.last||'')).trim()).join(', ')).slice(0,200);
function offerRow(pid,d,source,by,prov){ const r={id:uid(),property_id:pid,agreement_id:null,received_at:now(),buyer_ref:offerLabel(d),amount:d.price,conditions:d.conditions.map(c=>c.key).join(', '),expires_at:null,status:'received',notes:null,entered_by:by,created_at:now(),updated_at:now(),
  source,submission:JSON.parse(JSON.stringify(d)),details:d,kiwisaver:d.kiwisaver,lawyer_approval:d.lawyer_approval,needs_date_help:d.date_help,related_party:d.related,province:prov||'otago',as_at:nzToday0(),read_at:source==='agent'?now():null,read_by:source==='agent'?by:null,
  suspected_spam:false,status_at:null,status_by:null,gap_override_reason:null,gap_override_by:null,gap_override_at:null,net_hash:source==='buyer'?'h:'+mockNet().length:null,notified_at:null,notify_error:null}; PO().push(r); OE().push({id:OE().length+1,property_id:pid,offer_id:r.id,at:now(),actor:by,kind:'submitted',detail:{source}}); return r; }
function offerInvoke(o){ const b=(o&&o.body)||{}, net=mockNet(); const res=(data,status)=>status&&status>=400?Promise.resolve({data:null,error:{message:String(status),context:{json:async()=>data}}}):ok(data);
  const calls=JSON.parse(localStorage.getItem('offerCalls')||'[]'); calls.push(b.action); localStorage.setItem('offerCalls',JSON.stringify(calls));
  if(offline()) return Promise.resolve({data:null,error:{message:'Failed to fetch'}});
  if(b.action==='draft'){ if(JSON.stringify(b).length>4000) return res({ok:false,error:'That is more than the helper can take.'},413); return offerDraftInvoke(o); }
  if(!['info','submit'].includes(b.action)) return res({error:'Bad request'},400);
  if(!TOKEN_RE.test(String(b.token||''))) return ok({ok:false});
  // a token that isn't live: counted per network (up to 30 an hour); a live token is never refused because of guesses
  const l=offerLive(b.token); if(!l){ if(hits('bad',net,null,36e5)<30) OH().push({at:now(),kind:'bad',net}); save(); return ok({ok:false,reason:b.action==='submit'?'closed':undefined}); }
  const p=PT().find(x=>x.id===l.property_id);
  if(b.action==='info'){ OH().push({at:now(),kind:'info',net,property_id:l.property_id}); save(); const w={}; (DB.offer_clauses||[]).forEach(c=>{ if(c.wording) w[c.key]=c.wording; }); return ok({ok:true,open:true,address:p.address,province:l.province,ks_days:OSET().ks_warn_working_days,wording:w,chattels:(l.chattels||[]).slice()}); }
  const spam=typeof b.website==='string'&&b.website.trim()!=='';   // kept, flagged for Tim, nobody emailed
  if(hits('submit',net,null,6e5)>=3||hits('submit',net,null,864e5)>=10) return ok({ok:false,reason:'busy_network'});
  if(hits('submit',null,l.property_id,6e5)>=60||hits('submit',null,l.property_id,864e5)>=200) return ok({ok:false,reason:'busy_property'});
  if(hits('submit',null,null,864e5)>=1000) return ok({ok:false,reason:'busy_site'});
  let d; try{ d=offerClean(b.offer,false); }catch(e){ return res({ok:false,error:e.message},400); } d.chattels_listed=(l.chattels||[]).slice();   // the list shown comes from the link, never the page
  OH().push({at:now(),kind:'submit',net,property_id:l.property_id}); const r=offerRow(l.property_id,d,'buyer','buyer form',l.province); r.suspected_spam=spam;
  if(!spam){ (DB.email_log||=[]).push({id:(DB.email_log.length+1),agreement_id:null,at:now(),kind:'offer_received',recipients:'tim',subject:'New offer: '+p.address,ok:true,mock:true}); r.notified_at=now(); } save();
  return ok({ok:true,ref:r.id.replace(/-/g,'').slice(0,8).toUpperCase()}); }
function offerDraftInvoke(o){ const b=(o&&o.body)||{}, net=mockNet(), m=localStorage.getItem('offerAiMode');
  const calls=JSON.parse(localStorage.getItem('offerCalls')||'[]'); calls.push('draft'); localStorage.setItem('offerCalls',JSON.stringify(calls));
  if(m==='off') return ok({ok:false,reason:'off'}); const t=String(b.text||'').trim();
  if(t.length<10||t.length>600) return Promise.resolve({data:null,error:{message:'400',context:{json:async()=>({ok:false,error:t.length<10?'Please describe what you need in a few more words.':'Please keep it under 600 characters.'})}}});
  const l=offerLive(b.token); if(!l) return ok({ok:false,reason:'closed'});
  if(hits('ai',null,null,864e5)>=OSET().ai_daily_cap) return ok({ok:false,reason:'cap'});
  if(hits('ai',net,null,36e5)>=5||hits('ai',net,null,864e5)>=12||hits('ai',null,l.property_id,36e5)>=8||hits('ai',null,l.property_id,864e5)>=20) return ok({ok:false,reason:'busy'});
  OH().push({at:now(),kind:'ai',net,property_id:l.property_id}); (DB.ai_calls||=[]).push({id:(DB.ai_calls.length+1),at:now(),purpose:'offer condition draft',model:'claude-sonnet-5-5',ok:m!=='fail',agent:'buyer form'}); save();
  if(m==='fail') return ok({ok:false,reason:'failed'});
  if(m==='unsuitable') return ok({ok:false,reason:'unsuitable',why:'That does not look like a condition for buying this property.'});
  // the helper writes the time as {timing} (fn/prefill_shared.ts), filled in from the buyer's chosen timing on the agreement
  return ok({ok:true,draft:true,wording:'This agreement is conditional upon the purchaser being satisfied that '+t.replace(/[<>]/g,'').slice(0,120)+' {timing}.',summary:'You check this before the agreement goes ahead.'}); }
function offerRpc(name,a,me){ if(!me||!AGENTS.includes(me.email)) return bad('Only Tim can do this');
  const fnd=id=>PO().find(x=>x.id===id&&x.source!=='manual'); const ev=(pid,oid,kind,detail)=>OE().push({id:OE().length+1,property_id:pid,offer_id:oid||null,at:now(),actor:me.email,kind,detail:detail||{}});
  if(name==='agent_offer_link'){ const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('No such property'); let l=OL().find(x=>x.property_id===p.id);
    if(a.p_action==='open'&&!offerStageOk(p.stage)) return bad(`Offers open once the agreement is signed and the property is on the market (now: ${p.stage})`);   // refused before anything is made, as the database rolls back
    if(!l){ l={property_id:p.id,token:offerToken(),open:false,province:a.p_province||'otago',opened_at:null,closed_at:null,regenerated_at:null,updated_by:me.email,created_at:now(),updated_at:now()}; OL().push(l); ev(p.id,null,'link_made',{province:l.province}); }
    if(a.p_action==='open'){ if(!offerStageOk(p.stage)) return bad(`Offers open once the agreement is signed and the property is on the market (now: ${p.stage})`); if(!l.open){ l.open=true; l.opened_at=now(); ev(p.id,null,'link_opened'); } }
    else if(a.p_action==='close'){ if(l.open){ l.open=false; l.closed_at=now(); ev(p.id,null,'link_closed'); } }
    else if(a.p_action==='regenerate'){ l.token=offerToken(); l.regenerated_at=now(); ev(p.id,null,'link_regenerated'); }
    else if(a.p_action==='province'){ l.province=a.p_province; ev(p.id,null,'link_province',{province:a.p_province}); }
    else if(a.p_action!=='get') return bad('Unknown action');
    l.updated_at=now(); return ok({property_id:p.id,token:l.token,open:l.open,live:l.open&&offerStageOk(p.stage),province:l.province,stage:p.stage}); }
  if(name==='agent_offer_chattels'){ const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('No such property'); if(!Array.isArray(a.p_items)||a.p_items.length>60) return bad('Up to 60 chattels');
    if(a.p_items.some(x=>String(x??'').trim().length>200)) return bad('Please shorten each chattel: 200 characters at most'); const items=a.p_items.map(x=>String(x??'').trim()).filter(Boolean);
    offerRpc('agent_offer_link',{p_property:p.id,p_action:'get'},me); const l=OL().find(x=>x.property_id===p.id); const before=l.chattels||[]; l.chattels=items; ev(p.id,null,'chattels',{before,after:items}); return ok(items); }
  if(name==='agent_offer_add'){ const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('No such property'); let d; try{ d=offerClean(a.p_offer,true); }catch(e){ return bad(e.message); } const l=OL().find(x=>x.property_id===p.id); d.chattels_listed=((l&&l.chattels)||[]).slice(); return ok(offerRow(p.id,d,'agent',me.email,l&&l.province).id); }
  if(name==='agent_offer_correct'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); if((DB.offer_agreements||[]).some(x=>x.offer_id===o.id)) return bad("The agreement has been made, so the offer can't be corrected. The agreed terms are kept with the agreement");
    // migration 021: with p_expected (the details as the screen loaded them), refused when the offer has changed since
    if('p_expected' in a&&(a.p_expected==null||JSON.stringify(canonJ(o.details))!==JSON.stringify(canonJ(a.p_expected)))) return bad('The offer has changed since this screen opened, so nothing was saved. Go back to the offer, open the newest draft and try again'); const note=String(a.p_note||'').trim(); if(note.length<3||note.length>500) return bad('Say what changed and how you heard (3 to 500 characters)');
    let d; try{ d=offerClean(a.p_details,true); }catch(e){ return bad(e.message); } d.chattels_listed=(o.details.chattels_listed||[]).slice(); const before=o.details; Object.assign(o,{details:d,amount:d.price,conditions:d.conditions.map(c=>c.key).join(', '),buyer_ref:offerLabel(d),kiwisaver:d.kiwisaver,lawyer_approval:d.lawyer_approval,needs_date_help:d.date_help,related_party:d.related,updated_at:now()}); ev(o.property_id,o.id,'corrected',{note,before,after:d}); return ok(d); }
  if(name==='agent_offer_status'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); if(!['withdrawn','lapsed','received'].includes(a.p_status)) return bad('Choose withdrawn or lapsed'); const at=a.p_at||now();
    if((DB.offer_agreements||[]).some(x=>x.offer_id===o.id)) return bad("The agreement has been made, so it can't be marked here. Talk to the lawyers");
    if(Date.parse(at)>Date.now()+3e5||Date.parse(at)<Date.parse(o.received_at)-6e4) return bad('The time needs to be between when the offer came in and now'); const from=o.status;
    const off_=['withdrawn','lapsed'].includes(a.p_status), stopped=off_?stopSignings(o.id,null,me.email,'The offer was marked '+a.p_status,'withdrawn'):0; if(off_) docClose(o.id,me.email,'The offer was marked '+a.p_status);   // migration 021: open links stop working; a fresh copy is needed
    o.status=a.p_status; o.status_at=a.p_status==='received'?null:at; o.status_by=me.email; ev(o.property_id,o.id,'status',{from,to:a.p_status,at,note:(a.p_note||'').trim()||null,stopped}); return ok(null); }
  if(name==='agent_offer_read'){ const o=PO().find(x=>x.id===a.p_offer); if(!o) return bad('No such offer'); if(!o.read_at){ o.read_at=now(); o.read_by=me.email; ev(o.property_id,o.id,'read'); } return ok(null); }
  if(name==='agent_offer_gap'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); const r=String(a.p_reason||'').trim()||null; if(r&&(r.length<5||r.length>500)) return bad('Give your reason (5 to 500 characters)');
    o.gap_override_reason=r; o.gap_override_by=r?me.email:null; o.gap_override_at=r?now():null; ev(o.property_id,o.id,r?'gap_override':'gap_override_cleared',{reason:r}); return ok(null); }
  if(name==='agent_offer_not_spam'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); if(o.suspected_spam){ o.suspected_spam=false; o.read_at=null; o.read_by=null; ev(o.property_id,o.id,'not_spam'); } return ok(null); }
  if(name==='agent_offer_settings'){ const n=+a.p_ks_days; if(!(n>=1&&n<=60)||n!==Math.floor(n)) return bad('Choose 1 to 60 working days'); Object.assign(OSET(),{ks_warn_working_days:n,updated_by:me.email,updated_at:now()}); return ok(null); }
  if(name==='agent_offer_clause'){ if(!['electrical','technical','sale','sdd'].includes(a.p_key)) return bad('Only your own clauses are held here'); const w=String(a.p_wording||'').trim()||null; if(w&&w.length>4000) return bad('That wording is too long (4,000 characters at most)');
    DB.offer_clauses||=[]; const c=DB.offer_clauses.find(x=>x.key===a.p_key); if(c) Object.assign(c,{wording:w,updated_by:me.email,updated_at:now()}); else DB.offer_clauses.push({key:a.p_key,wording:w,updated_by:me.email,updated_at:now()}); return ok(null); }
  return bad('unknown rpc '+name); }
function councilInvoke(o){ const mode=localStorage.getItem('councilMode');
  if(mode==='offline'||offline()) return Promise.resolve({data:null,error:{name:'FunctionsFetchError',message:'Failed to send a request to the Edge Function'}});
  if(mode==='hang') return new Promise(()=>{});
  if(!isAgentMe()) return Promise.resolve({data:null,error:{name:'FunctionsHttpError',message:'Edge Function returned a non-2xx status code'}});
  const b=(o&&o.body)||{}; if(b.mode!=='lookup') return ok({ok:true,suggestions:[]});
  const all=JSON.parse(localStorage.getItem('councilResults')||'{}'); const asked=String(b.address||'').replace(/\s+/g,' ').trim();
  const key=cNorm(asked)+(b.unit_ref?'|'+b.unit_ref:'')+(b.candidate!=null?'#'+b.candidate:'');
  const result=all[key]||{status:'not_found',asked,values:[],sources:[],links:[],info:[]};
  const row={id:uid(),property_id:b.property_id||null,asked,asked_norm:cNorm(asked),matched_address:result.matched_address||null,council:result.council||null,status:result.status,result:JSON.parse(JSON.stringify(result)),created_by:S.user.email,created_at:now()};
  CL().push(row); save(); const resp={ok:true,saved:true,lookup_id:row.id,created_at:row.created_at,result};
  const dl=+localStorage.getItem('councilDelay')||0; return dl?new Promise(r=>setTimeout(()=>r({data:resp,error:null}),dl)):ok(resp); }
const cSame=(f,a,b)=>{ const n=x=>String(x??'').trim(); if(f==='pLand'&&/^\d+(\.\d+)?$/.test(n(a))&&/^\d+(\.\d+)?$/.test(n(b))) return Math.round(+n(a))===Math.round(+n(b)); return n(a).toLowerCase().replace(/[^a-z0-9]/g,'')===n(b).toLowerCase().replace(/[^a-z0-9]/g,''); };
// council_addr_key() and council_addr_fits()
function cAddrKey(t){ const v=String(t||'').toLowerCase().replace(/^\s*(flat|unit|apartment|apt)\.?\s*([0-9]+[a-z]?|[a-z])\s*,?\s+/,'$2/').replace(/[^a-z0-9/ ]+/g,' '); const m=v.match(/^\s*(?:([0-9]+[a-z]?|[a-z])\s*\/\s*)?([0-9]+[a-z]?)\s+([a-z]+)/); return m?{unit:m[1]||null,number:m[2],street:m[3]}:null; }
// council_addr_towns(): what follows the first comma, without postcodes
const cTowns=t=>{ const x=String(t||'').split(',').slice(1).map(s=>cNorm(s.replace(/[0-9]+/g,''))).filter(Boolean); return x.length?x:null; };
function cFits(prop,look,chosen){ const a=cAddrKey(prop), b=cAddrKey(look); if(!a||!b) return cNorm(prop).length>=3&&cNorm(prop)===cNorm(look);
  const ta=cTowns(prop), tb=cTowns(look);
  return a.number===b.number&&a.street===b.street&&(!ta||!tb||ta.some(x=>tb.includes(x)))&&(!b.unit?true:!a.unit?!!chosen:a.unit===b.unit); }
const lookFits=(prop,l)=>{ const ch=!!(l.result||{}).unit_ref; return cFits(prop,l.asked,ch)||cFits(prop,l.matched_address,ch)||cFits(prop,(l.result||{}).unit_address,ch); };
const DAY30=30*864e5;
function councilRpc(name,a,me){ if(offline()) return bad('Failed to fetch'); if(!me||!AGENTS.includes(me.email)) return bad('Agent only');
  if(name==='agent_council_cached'){ const n=cNorm(a.p_asked), pid=a.p_property||null, addr=pid?(PT().find(x=>x.id===pid)||{}).address:null;
    const L=CL().filter(l=>l.status==='ok'&&Date.now()-Date.parse(l.created_at)<DAY30&&((pid&&l.property_id===pid&&lookFits(addr,l)&&lookFits(a.p_asked,l))||(n.length>=3&&(!l.property_id||l.property_id===pid)&&(l.asked_norm===n||cNorm(l.matched_address)===n)&&(!pid||lookFits(addr,l)))))
      .sort((x,y)=>((pid&&y.property_id===pid)-(pid&&x.property_id===pid))||(x.created_at<y.created_at?1:-1));
    const r=L[0]; return ok(r?{id:r.id,property_id:r.property_id,asked:r.asked,matched_address:r.matched_address,council:r.council,status:r.status,result:r.result,created_at:r.created_at}:null); }
  // councilAcceptFail = '1': the next accept fails as with no signal (for the retry test)
  if(name==='agent_council_accept'&&localStorage.getItem('councilAcceptFail')==='1'){ localStorage.removeItem('councilAcceptFail'); return bad('Failed to fetch'); }
  if(name==='agent_council_accept'){ const l=CL().find(x=>x.id===a.p_lookup); if(!l) return bad('Lookup not found'); if(l.property_id&&l.property_id!==a.p_property) return bad('That lookup is for another property');
    if(l.status!=='ok') return bad('Nothing usable was found in that lookup'); if(Date.now()-Date.parse(l.created_at)>=DAY30) return bad('That lookup is more than 30 days old. Look again first');
    const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('Property not found');
    if(!lookFits(p.address,l)) return bad(`That lookup is for ${(l.result||{}).unit_address||l.matched_address||l.asked}, but the property file says ${p.address}. Look up the file's address, or correct the address first`);
    const keys=[...new Set(a.p_keys||[])].sort(); if(!keys.length) return bad('Tick at least one'); if(keys.length>80) return bad('Too many at once');
    const rep=a.p_replace||[], keep=a.p_keep||[], who=me.email;
    const ag=(DB.agreements||[]).filter(g=>g.property_id===p.id&&live(g)).sort((x,y)=>(x.created_at||'')<(y.created_at||'')?1:-1)[0];
    const agSigned=!!ag&&(['signed','countersigned'].includes(ag.status)||DB.agreement_people.some(x=>x.agreement_id===ag.id&&x.signed_at)), agDraft=!!ag&&!agSigned&&ag.status==='draft';
    const agC=ag?Object.assign({},ag.config):{}, agA=ag?Object.assign({},ag.answers):{}; const agKeys=[], left=[];
    const f=Object.assign({},p.found), pv=Object.assign({},p.provenance), desc=Object.assign({},p.description); let title=p.title_ref, legal=p.legal_description;
    const out={written:[],stored:[],kept:[],conflicts:[],skipped:[]};
    for(const k of keys){ if(!/^[a-z0-9_]{1,60}$/.test(k)){ out.skipped.push(k); continue; } let it=((l.result||{}).values||[]).find(x=>x.key===k);
      if(!it||!['string','number'].includes(typeof it.value)){ out.skipped.push(k); continue; } it=JSON.parse(JSON.stringify(it)); let v=String(it.value).trim(); if(!v||v.length>1000){ out.skipped.push(k); continue; }
      const field={title_ref:'title_ref',legal_description:'legal_description',land_area:'pLand'}[k]||null;
      if(field==='pLand'){ if(!/^\d+(\.\d+)?$/.test(v)){ out.skipped.push(k); continue; } v=String(Math.round(+v)); }
      let doWrite=false;
      if(field){ const cur=field==='title_ref'?title:field==='legal_description'?legal:desc.pLand; const held=!ag?null:field==='title_ref'?agC.title:field==='pLand'?agA.pLand:null;
        const dF=String(cur??'').trim()!==''&&!cSame(field,cur,v), dA=String(held??'').trim()!==''&&!cSame(field,held,v);
        if(agSigned&&dA){ if(keep.includes(k)) out.kept.push(k); else { out.conflicts.push({key:k,label:it.label,found:v,current:held,where:'signed_agreement',ref:ag.ref}); continue; } }
        else if(dF||dA){ if(rep.includes(k)) doWrite=true; else if(keep.includes(k)) out.kept.push(k); else { out.conflicts.push({key:k,label:it.label,found:v,current:dA?held:cur,where:dA?(agDraft?'agreement':'agreement_sent'):'file',ref:dA?ag.ref:null}); continue; } }
        else doWrite=true;
        if(doWrite){ const prev=pv[field]; const was=prev&&prev.from==='public_records'&&cSame(field,cur,prev.value)?prev.was:(String(cur??'').trim()||null);
          pv[field]={from:'public_records',key:k,value:v,source:it.source,source_name:it.source_name,source_url:it.source_url,as_of:it.as_of,as_of_label:it.as_of_label,fetched_at:it.fetched_at,at:now(),was};
          if(field==='title_ref') title=v; else if(field==='legal_description') legal=v; else desc.pLand=v;
          if(ag&&['title_ref','pLand'].includes(field)&&!cSame(field,held,v)){ if(agDraft){ if(field==='title_ref') agC.title=v; else agA.pLand=v; agKeys.push(k); } else if(!agSigned) left.push({key:k,ref:ag.ref,status:ag.status,says:held}); }
          out.written.push(k); } }
      const LIM='Not a substitute for a LIM.'; if(['hazard','zone'].includes(it.kind)&&!(it.note||'').includes(LIM)) it.note=((it.note||'')+' '+LIM).trim();
      else if(it.kind==='valuation'&&!(it.note||'').includes('not a market value')) it.note=('Council rating valuation (as at '+(it.as_of_label||'date not given')+'), not a market value. '+(it.note||'')).trim();
      else if(it.kind==='rates'&&!(it.note||'').includes('rates notice')) it.note=('Rates as the council publishes them (as at '+(it.as_of_label||'date not given')+'). Check the latest rates notice. '+(it.note||'')).trim();
      delete it.lookup_id; delete it.used_by;
      f[k]=Object.assign(it,{value:field==='pLand'?+v:it.value,field,written:doWrite,matched_address:l.matched_address,unit_address:(l.result||{}).unit_address||null,council:l.council,used_at:now()}); out.stored.push(k); }
    Object.assign(p,{found:f,provenance:pv,title_ref:title,legal_description:legal,description:desc,updated_at:now()});
    if(agKeys.length){ const old=JSON.parse(JSON.stringify(ag)); ag.config=agC; ag.answers=agA; syncAgreement(ag,old); DB.agreement_events.push({id:uid(),agreement_id:ag.id,at:now(),actor:who,kind:'public_records_applied',detail:{keys:agKeys}}); }
    if(!l.property_id) l.property_id=p.id;
    if(out.stored.length) CUL().push({id:CUL().length+1,property_id:p.id,lookup_id:l.id,kind:'used',keys:out.stored,detail:{written:out.written,kept:out.kept,agreement_updated:agKeys,agreement_left:left},actor:who,at:now()});
    save(); return ok(Object.assign(out,{agreement_updated:agKeys.length>0,agreement_left:left,ref:ag?ag.ref:null})); }
  if(name==='agent_council_remove'){ const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('Property not found'); const e=(p.found||{})[a.p_key]; if(!e) return bad("That value isn't on the property file");
    // only a value written to its field gives that field back; a kept one (written false) leaves the field and its provenance alone
    const field=e.field||null, pv=Object.assign({},p.provenance), desc=Object.assign({},p.description); let restored=false, keptBy=null;
    if(field&&e.written===true&&pv[field]&&pv[field].key===a.p_key){ const pr=pv[field]; delete pv[field]; const cur=field==='title_ref'?p.title_ref:field==='legal_description'?p.legal_description:desc.pLand;
      if(cSame(field,cur,pr.value)){ const ag=(DB.agreements||[]).filter(g=>g.property_id===p.id&&live(g)).sort((x,y)=>(x.created_at||'')<(y.created_at||'')?1:-1)[0]; const held=!ag?null:field==='title_ref'?(ag.config||{}).title:field==='pLand'?(ag.answers||{}).pLand:null;
        if(String(held??'').trim()&&cSame(field,held,pr.value)) keptBy=ag.ref; else { if(field==='title_ref') p.title_ref=pr.was??null; else if(field==='legal_description') p.legal_description=pr.was??null; else if(pr.was==null) delete desc.pLand; else desc.pLand=pr.was; restored=true; } } }
    const f=Object.assign({},p.found); delete f[a.p_key]; Object.assign(p,{found:f,provenance:pv,description:desc,updated_at:now()});
    CUL().push({id:CUL().length+1,property_id:p.id,lookup_id:null,kind:'removed',keys:[a.p_key],detail:{value:e.value,field,restored,agreement_holds:keptBy},actor:me.email,at:now()}); save();
    return ok({removed:a.p_key,field,restored,agreement_holds:keptBy}); }
  return bad('unknown rpc '+name); }
// ── photos and documents on the property file (mirrors migrations/016_property_repository.sql) ──
// Storage: the 'property-files' bucket keeps each file's size and type in DB.storage_objects (as storage.objects does) and the
// bytes in memory (window.__repoBlobs, for the tests to inspect). Kinds come from src/repo-core.js (the test checks that list
// against repo_kinds in the migration). localStorage mockOffline = '1' fails uploads and the repository calls as with no
// signal; mockDropReply = 'N' files the next N items but answers as if the signal dropped, so the phone never hears back.
const RB='property-files', PNG1='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const RKS=()=>(window.REPO&&window.REPO.KINDS)||[];
const RKS_ALL=()=>RKS().concat((window.REPO&&window.REPO.SPECIAL_KINDS)||[]);   // migration 019 adds the REINZ agreement blank, filed only from the Offers tile
const rk=k=>{ const L=RKS_ALL(), i=L.findIndex(x=>x[0]===k); return i<0?null:{kind:L[i][0],folder:L[i][1],shareable:!!L[i][2],exportable:!!L[i][3],position:i}; };
const repoShareable=(kind,source)=>source!=='generated'&&!!(rk(kind)||{}).shareable;
const PD=()=>(DB.property_documents||=[]), PDE=()=>(DB.property_document_events||=[]), SO=()=>(DB.storage_objects||={});
const meEmail=()=>(S&&S.user&&S.user.email)||'system';
const STORED_MIME=['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel','text/plain','text/csv'];
const netFail=()=>Promise.resolve({data:null,error:{message:'Failed to fetch'}});
function pdLog(d,kind,detail){ PDE().push({id:PDE().length+1,property_id:d.property_id,document_id:d.id||null,at:now(),actor:meEmail(),kind,detail:detail||{}}); }
// guard_property_document() on insert
function pdInsertRow(x){ if(x.shared_at||x.archived_at) throw new Error('Share or remove an item after it is filed'); x.bucket=x.bucket||'private'; x.folder=(rk(x.kind)||{}).folder||null;
  if(x.bucket===RB&&!String(x.path||'').startsWith('properties/'+x.property_id+'/')) throw new Error("A file must sit in its own property's folder");
  x.shared_by=null; x.archived_by=null; x.shared_at=null; x.archived_at=null; return x; }
// guard_property_document() and log_property_document() on update
function pdUpdate(o,patch){ const n=Object.assign({},o,patch), who=meEmail();
  n.folder=(rk(n.kind)||{}).folder||null;
  if(n.bucket===RB&&!String(n.path).startsWith('properties/'+n.property_id+'/')) throw new Error("A file must sit in its own property's folder");
  if(n.thumb_path&&!String(n.thumb_path).startsWith('properties/'+n.property_id+'/')) throw new Error("A preview must sit in its own property's folder");
  if(o.source==='generated'){ const strip=x=>{ const c=Object.assign({},x); delete c.updated_at; delete c.folder; return canon(c); }; if(strip(n)!==strip(o)) throw new Error('A signed document is kept exactly as it was filed'); }
  if(['id','property_id','path','bucket','source','created_at','created_by','client_key','inspection_id'].some(k=>!same(n[k],o[k]))||['thumb_path','sha256','size_bytes','mime_type','taken_at'].some(k=>o[k]!=null&&!same(n[k],o[k]))) throw new Error("Where a file is kept, what it is and its fingerprint can't change");
  if(n.bucket===RB&&!rk(n.kind)) throw new Error('Choose a kind from the list');
  if(o.kind==='REINZ agreement blank'&&(n.kind!==o.kind||n.shared_at)) throw new Error('An agreement blank stays an agreement blank, and is never shared');   // guard_blank_document (019)
  if(n.kind==='REINZ agreement blank'&&o.kind!==n.kind) throw new Error("Load an agreement blank from the property's Offers tile");
  if(n.archived_at&&!o.archived_at){ n.shared_at=null; n.shared_by=null; n.archived_by=who; }
  if(!n.archived_at) n.archived_by=null;
  if(n.shared_at){ if(n.archived_at) throw new Error("A removed item can't be shared"); if(n.bucket!==RB) throw new Error('Only a file added under Photos and documents can be shared'); if(!repoShareable(n.kind,n.source)) throw new Error('This kind of item is never shared with the vendors');
    if(!o.shared_at) n.shared_by=who; else { n.shared_at=o.shared_at; n.shared_by=o.shared_by; } } else n.shared_by=null;
  n.updated_at=now();
  const ch={}; ['kind','title','issued_on','room','caption'].forEach(k=>{ if(!same(n[k]??null,o[k]??null)) ch[k]={from:o[k]??null,to:n[k]??null}; });
  const was=Object.assign({},o); Object.assign(o,n);
  if(Object.keys(ch).length) pdLog(o,'changed',ch);
  if(!was.archived_at&&o.archived_at) pdLog(o,'archived',{was_shared:!!was.shared_at});
  if(was.archived_at&&!o.archived_at) pdLog(o,'restored');
  if(!was.shared_at&&o.shared_at) pdLog(o,'shared');
  if(was.shared_at&&!o.shared_at&&!o.archived_at) pdLog(o,'unshared');
  return o; }
// table access: vendors see none of it; nobody removes a row or writes the record or the kind list
function repoTable(table,op,payload,rows,single){
  if(!isAgentMe()){ if(op==='select') return {data:single?undefined:[],error:single?{message:'not found'}:null}; throw new Error('new row violates row-level security policy for table "'+table+'"'); }
  if(table!=='property_documents'){ if(op!=='select') throw new Error('permission denied for table '+table); if(table==='repo_kinds') return {data:RKS().map((r,i)=>({kind:r[0],folder:r[1],position:i,shareable:!!r[2],exportable:!!r[3]})),error:null}; return null; }
  if(op==='delete') throw new Error('Items on a property file are kept. Remove one with Remove, which archives it');
  if(op==='insert'){ (Array.isArray(payload)?payload:[payload]).forEach(pdInsertRow); return null; }
  if(op==='update'){ rows.forEach(r=>pdUpdate(r,payload)); save(); return {data:rows,error:null}; }
  return null; }
// repo_party(): an owner on the property now (role owner, by user id or email), or a person on an agreement made in this round
// (created at or after cycle_at) that hasn't ended or been cancelled. Not contacts, not the pre-listing contact, not earlier rounds.
function repoParty(pid){ const me=S&&S.user; if(!me) return false; const p=PT().find(x=>x.id===pid); if(!p) return false; const em=(me.email||'').toLowerCase(), cyc=p.cycle_at||'';
  return PP().some(x=>x.property_id===pid&&(x.role||'owner')==='owner'&&(x.user_id===me.id||(x.email&&x.email.toLowerCase()===em)))
    ||(DB.agreements||[]).some(a=>a.property_id===pid&&!['ended','cancelled'].includes(a.status)&&(a.created_at||'')>=cyc&&(DB.agreement_people||[]).some(ap=>ap.agreement_id===a.id&&ap.user_id===me.id)); }
const repoSeen=d=>{ const p=PT().find(x=>x.id===d.property_id)||{}; return d.bucket===RB&&!!d.shared_at&&d.shared_at>=(p.cycle_at||'')&&!d.archived_at&&repoShareable(d.kind,d.source)&&repoParty(d.property_id); };
const repoCanRead=path=>PD().some(d=>(d.path===path||d.thumb_path===path)&&repoSeen(d));
// the repo-link edge function (fn/repo_link.ts): a signed-in caller, a file they may read, a link for 600 seconds
function repoLinkInvoke(o){ if(offline()) return Promise.resolve({data:null,error:{name:'FunctionsFetchError',message:'Failed to send a request to the Edge Function'}});
  if(!(S&&S.user)) return Promise.resolve({data:null,error:{name:'FunctionsHttpError',message:'Edge Function returned a non-2xx status code',status:401}});
  const path=String(((o&&o.body)||{}).path||''); if(!repoCanRead(path)) return Promise.resolve({data:null,error:{name:'FunctionsHttpError',message:'Edge Function returned a non-2xx status code',status:403}});
  const bl=(window.__repoBlobs||{})[path]; return ok({url:bl?URL.createObjectURL(bl):PNG1,expires_in:600}); }
function repoBucket(){ return {
  upload:(p,blob,o)=>{ logCall('up:'+p); if(offline()) return netFail(); if(!isAgentMe()) return bad('new row violates row-level security policy');
    const f=String(p).split('/'); if(f[0]!=='properties'||!['docs','photos'].includes(f[2])) return bad('new row violates row-level security policy');
    if(SO()[p]) return Promise.resolve({data:null,error:{message:'The resource already exists',statusCode:'409'}});
    const mime=(o&&o.contentType)||blob.type; if(!STORED_MIME.includes(mime)) return bad('mime type '+mime+' is not supported');
    if(blob.size>26214400) return bad('The object exceeded the maximum allowed size');
    SO()[p]={size:blob.size,mime}; (window.__repoBlobs||={})[p]=blob; save(); return (mime==='application/pdf'?blobKeep(p,blob):Promise.resolve()).then(()=>({data:{path:p},error:null})); },
  createSignedUrl:(p)=>{ if(offline()) return netFail(); if(!isAgentMe()) return bad('Object not found');   // vendors have no storage policy: they use repo-link if(!SO()[p]) return bad('Object not found');
    const bl=(window.__repoBlobs||{})[p]; return ok({signedUrl:bl?URL.createObjectURL(bl):PNG1}); } }; }
function repoRpc(name,a){
  if(offline()) return netFail();
  const me=S&&S.user;
  if(name==='vendor_repo_list'){ if(!me) return bad('permission denied for function vendor_repo_list');
    return ok(PD().filter(d=>d.property_id===a.p_property&&repoSeen(d)).sort((x,y)=>x.folder===y.folder?(x.created_at<y.created_at?1:-1):(x.folder<y.folder?-1:1))
      .map(d=>({id:d.id,kind:d.kind,folder:d.folder,title:d.title||null,name:d.name,issued_on:d.issued_on||null,mime_type:d.mime_type,size_bytes:d.size_bytes,path:d.path,thumb_path:d.thumb_path||null,room:d.room||null,caption:d.caption||null,taken_at:d.taken_at||null,created_at:d.created_at}))); }
  if(!isAgentMe()) return bad({agent_property_export:'Only Tim can export a property file',agent_repo_add:'Only Tim can add to a property file',agent_repo_share:'Only Tim can share from a property file',agent_repo_archive:'Only Tim can remove from a property file'}[name]||'Only Tim can change a property file');
  if(name==='agent_repo_add'){ const it=a.p_item||{}, k=it.key;
    if(localStorage.getItem('mockAuthFail')==='1') return bad('JWT expired');   // localStorage mockAuthFail = '1': the sign-in has run out, nothing is filed
    if(!/^[0-9a-f-]{36}$/i.test(k||'')) return bad('Each item needs its own key');
    const ex=PD().find(d=>d.client_key===k);
    if(ex){ if(ex.property_id!==a.p_property) return bad('That item is filed on another property'); return ok({id:ex.id,existing:true}); }
    if(!PT().some(p=>p.id===a.p_property)) return bad('Property not found');
    const kd=rk(it.kind); if(!kd) return bad('Choose a kind from the list');
    const photo=kd.kind==='Photo', nm=String(it.name||'').replace(/[\x00-\x1f/\\]/g,'').slice(0,200); if(!nm) return bad('The item needs a file name');
    const base='properties/'+a.p_property+(photo?'/photos/':'/docs/');
    if(photo?it.path!==base+k+'.jpg':!new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+k+'-[A-Za-z0-9._-]{1,120}$').test(it.path||'')) return bad(photo?'A photo is stored at its own key':'A document is stored at its own key');
    if(it.thumb_path&&it.thumb_path!==base+k+'.thumb.jpg') return bad('A preview is stored beside its item');
    if(!STORED_MIME.includes(it.mime_type)) return bad("That type of file isn't accepted");
    if(photo&&it.mime_type!=='image/jpeg') return bad('Photos are stored as JPEG');
    if(!(it.size_bytes>0&&it.size_bytes<=26214400)) return bad('Files can be up to 25 MB');
    if(!/^[0-9a-f]{64}$/.test(it.sha256||'')) return bad('The item needs its fingerprint');
    const obj=SO()[it.path]; if(!obj) return bad("The file hasn't arrived yet");
    if(obj.size!==it.size_bytes||obj.mime!==it.mime_type) return bad("The stored file doesn't match what the phone sent");
    if(it.thumb_path&&!(SO()[it.thumb_path]&&SO()[it.thumb_path].mime==='image/jpeg')) return bad("The preview hasn't arrived yet");
    if(it.inspection_id&&!PI().some(i=>i.id===it.inspection_id&&i.property_id===a.p_property)) return bad('That inspection is of another property');
    const t=s=>{ s=String(s??'').trim(); return s||null; };
    const d=pdInsertRow({id:uid(),property_id:a.p_property,kind:kd.kind,name:nm,title:(t(it.title)||'').slice(0,200)||null,path:it.path,thumb_path:it.thumb_path||null,bucket:RB,source:'uploaded',created_by:me.email,
      mime_type:it.mime_type,size_bytes:it.size_bytes,sha256:it.sha256,client_key:k,inspection_id:it.inspection_id||null,room:(t(it.room)||'').slice(0,60)||null,caption:(t(it.caption)||'').slice(0,1000)||null,
      issued_on:/^\d{4}-\d{2}-\d{2}$/.test(it.issued_on||'')?it.issued_on:null,taken_at:/^\d{4}-\d{2}-\d{2}T/.test(it.taken_at||'')?it.taken_at:null,width:it.width||null,height:it.height||null,read_result:null,created_at:now(),updated_at:now()});
    PD().push(d); pdLog(d,'added',{kind:d.kind,name:d.name,source:'uploaded',sha256:d.sha256,size_bytes:d.size_bytes}); save();
    const drop=+localStorage.getItem('mockDropReply')||0; if(drop>0){ localStorage.setItem('mockDropReply',String(drop-1)); return netFail(); }
    return ok({id:d.id,existing:false}); }
  const d=a.p_id&&PD().find(x=>x.id===a.p_id);
  if(['agent_repo_set','agent_repo_share','agent_repo_archive'].includes(name)){ if(!d) return bad('Not found');
    try {
      if(name==='agent_repo_set'){ const p=a.p_patch||{}, patch={}; if('kind' in p){ if(!rk(p.kind)) return bad('Choose a kind from the list'); patch.kind=p.kind; }
        if('issued_on' in p){ if(p.issued_on&&!/^\d{4}-\d{2}-\d{2}$/.test(p.issued_on)) return bad('Check the date'); patch.issued_on=p.issued_on||null; }
        [['title',200],['room',60],['caption',1000]].forEach(([k,n])=>{ if(k in p){ const v=String(p[k]??'').trim(); patch[k]=v?v.slice(0,n):null; } });
        pdUpdate(d,patch); }
      if(name==='agent_repo_share'){ if(a.p_on&&d.bucket!==RB) return bad('Only a file added under Photos and documents can be shared'); pdUpdate(d,{shared_at:a.p_on?(d.shared_at||now()):null}); }
      if(name==='agent_repo_archive') pdUpdate(d,{archived_at:a.p_on?(d.archived_at||now()):null});
    } catch(e){ return bad(e.message); }
    save(); return ok(null); }
  if(name==='agent_property_export'){ const p=PT().find(x=>x.id===a.p_property); if(!p) return bad('Property not found');
    const DMAP={workDetail:'work_detail',wtDetail:'weathertightness_detail',methDetail:'meth_detail',defDetail:'defects_detail',hazOther:'hazards_other'};
    const ds=Object.assign({},p.disclosures||{}), withheld=[];
    if(!a.p_details) Object.keys(DMAP).forEach(k=>{ if(String(ds[k]??'').trim()) withheld.push('disclosures.'+DMAP[k]); delete ds[k]; });
    withheld.sort();
    const dsc=p.description||{}, strip=o=>{ const c={}; Object.entries(o).forEach(([k,v])=>{ if(v!=null) c[k]=v; }); return c; };
    const lm=String(dsc.pLand||'').match(/^\s*(\d+(?:\.\d+)?)\s*(m2|m²|sqm|square metres)?\s*$/);
    const recs=Object.entries(p.found||{}).filter(([,v])=>isObj(v)).sort((x,y)=>x[0]<y[0]?-1:1).map(([k,v])=>strip({key:k,label:v.label,value:v.value,display:v.display,note:v.note,source:v.source,source_name:v.source_name,source_url:v.source_url,as_of:v.as_of,as_of_label:v.as_of_label,fetched_at:v.fetched_at}));
    const prov={}; Object.entries(p.provenance||{}).filter(([,v])=>isObj(v)).forEach(([k,v])=>{ prov[k]=strip({from:v.from,source:v.source,source_name:v.source_name,as_of:v.as_of,as_of_label:v.as_of_label}); });
    const mine=PD().filter(x=>x.property_id===p.id);
    const items=mine.filter(x=>!x.archived_at&&x.source!=='generated'&&(rk(x.kind)||{}).exportable&&x.sha256&&x.size_bytes&&x.mime_type)
      .sort((x,y)=>rk(x.kind).position-rk(y.kind).position||(x.created_at<y.created_at?-1:1))
      .map(x=>strip({id:x.id,kind:x.kind,folder:rk(x.kind).folder,title:x.title||x.name,file_name:x.name,date:x.issued_on||nzDay(x.taken_at||x.created_at),issued_on:x.issued_on||null,taken_at:x.taken_at||null,added_at:x.created_at,
        size_bytes:x.size_bytes,sha256:x.sha256,mime_type:x.mime_type,room:x.room||null,caption:x.caption||null,width:x.width||null,height:x.height||null,origin:x.source,shared_with_vendors:!!x.shared_at}));
    const live=mine.filter(x=>!x.archived_at);
    const out={schema:'mre.property/1',exported_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),source:{system:'dunnerstunner onboarding',agency:'McGuire Real Estate Limited'},
      property:strip({ref:p.id,address:p.address,title_ref:p.title_ref||null,legal_description:p.legal_description||null,land_area_m2:lm?+lm[1]:null,
        description:strip({type:dsc.pType,year_built:dsc.pYear,bedrooms:dsc.pBed,bathrooms:dsc.pBath,floor_area:dsc.pFloor,land_area:dsc.pLand,construction:dsc.pBuild,parking:dsc.pPark,heating:dsc.pHeat,chattels:dsc.chattels,other_chattels:dsc.chatOther}),
        disclosures:strip({work:ds.work,work_detail:ds.workDetail,weathertightness:ds.wt,weathertightness_detail:ds.wtDetail,meth:ds.meth,meth_detail:ds.methDetail,defects:ds.def,defects_detail:ds.defDetail,hazards:ds.hazards,hazards_other:ds.hazOther}),
        provenance:prov}),
      public_records:recs, items,
      left_out:{agency_papers:live.filter(x=>x.source==='generated'||(rk(x.kind)||{}).folder==='agency').length,removed:mine.filter(x=>x.archived_at).length,
        not_sorted:live.filter(x=>x.source!=='generated'&&!rk(x.kind)).length,missing_details:live.filter(x=>x.source!=='generated'&&(rk(x.kind)||{}).exportable&&!(x.sha256&&x.size_bytes&&x.mime_type)).length,withheld}};
    PDE().push({id:PDE().length+1,property_id:p.id,document_id:null,at:now(),actor:me.email,kind:'exported',detail:{schema:'mre.property/1',items:items.length,public_records:recs.length}}); save();
    return ok(out); }
  return bad('unknown rpc '+name); }
// ── drafting offers onto the REINZ blank (mirrors migrations/019_offer_drafting.sql and fn/offer_draft_handler.ts) ──
// Tim only; vendors and anyone not signed in see nothing; nobody writes these tables directly; nothing made is ever changed. The
// offer-draft edge function answers from the pages it is sent: a line saying a buyer acknowledges something becomes an "ack"
// proposal, "Witnessed" a "sign" one, a page that mentions a LIM a note. localStorage draftAiMode = 'off' | 'fail', and
// lawyerMode = 'off' | 'no_search' | 'none' | 'reception' change its answers. No model is ever called.
const DRAFT_RPCS=['agent_blank_add','agent_blank_map_save','agent_offer_term','agent_draft_add','agent_draft_approve','agent_lawyer_use'];
const EDITIONS_OK=['Eleventh Edition 2022 (4)'];
const OTERMS=()=>{ DB.offer_terms||=[]; if(!DB.offer_terms.length) [
  ['deposit_nzret','Deposit held by NZ Real Estate Trust (printed clause 21.2)','printed','21.2',null,{when:{kiwisaver:false},strike_when_unused:false},10],
  ['deposit_kiwisaver',"Whole deposit to the vendor's lawyer's trust account when KiwiSaver funds it (printed clause 21.3)",'printed','21.3',null,{when:{kiwisaver:true},strike_when_unused:false},11],
  ['lawyer_approval',"Lawyer's approval (printed clause 22.0): struck through when not chosen",'printed','22.0',null,{when:{condition:'lawyer'},strike_when_unused:true},12],
  ['electrical','Electrical report','further_term',null,'electrical',{when:{condition:'electrical'}},20],['technical','Specified technical report','further_term',null,'technical',{when:{condition:'technical'}},21],
  ['sale','Sale of another property','further_term',null,'sale',{when:{condition:'sale'}},22],['sdd','Specified Due Diligence','further_term',null,'sdd',{when:{condition:'sdd'}},23],
  ['custom',"The buyer's own condition (only once you tick its wording)",'further_term',null,'custom',{when:{condition:'custom'}},24],['chattels','Chattels to add or leave out','further_term',null,null,{when:{chattels:true},where:'schedule'},30]
].forEach(([key,title,kind,clause,wf,rule,position])=>DB.offer_terms.push({key,title,kind,clause,wording:null,wording_from:wf,rule,position,active:true,updated_by:null,updated_at:now()})); return DB.offer_terms; };
const PLACE_KINDS=['text','area','date','yesno','strike','block','signature','initial','witness','name','ack','never'];
function draftRpc(name,a,me){ if(!me||!AGENTS.includes(me.email)) return bad('Only Tim can do this');
  const OB=()=>(DB.offer_blanks||=[]), OBM=()=>(DB.offer_blank_maps||=[]), OD=()=>(DB.offer_drafts||=[]), ODA=()=>(DB.offer_draft_approvals||=[]), OLL=()=>(DB.offer_lawyer_lookups||=[]);
  const ev=(pid,oid,kind,detail)=>OE().push({id:OE().length+1,property_id:pid,offer_id:oid||null,at:now(),actor:me.email,kind,detail:detail||{}});
  if(name==='agent_blank_add'){ const d=PD().find(x=>x.id===a.p_document); if(!d) return bad("That file isn't on a property file");
    if(d.kind!=='REINZ agreement blank'||d.bucket!==RB||d.mime_type!=='application/pdf') return bad('Only a PDF filed as an agreement blank can be used'); if(d.archived_at) return bad('That file has been removed');
    const ex=OB().find(b=>b.document_id===d.id); if(ex) return ok({id:ex.id,existing:true,edition_checked:ex.edition_checked});
    if(!(DB.offer_file_hashes||[]).some(h=>h.path===d.path&&h.sha256===d.sha256&&h.size_bytes===d.size_bytes)) return bad("The file's fingerprint hasn't been confirmed by the server yet. Try again");
    if(!(a.p_pages>=1&&a.p_pages<=400)) return bad('Please check the page count');
    if(!Array.isArray(a.p_sizes)||a.p_sizes.length!==a.p_pages||a.p_sizes.some(s=>!Array.isArray(s)||s.length!==2||!(s[0]>=50&&s[0]<=5000)||!(s[1]>=50&&s[1]<=5000))) return bad('Please check the page sizes');
    const ed=String(a.p_edition||'').trim().slice(0,80)||null; const b={id:uid(),property_id:d.property_id,document_id:d.id,sha256:d.sha256,size_bytes:d.size_bytes,file_name:d.name,pages:a.p_pages,sizes:a.p_sizes,edition:ed,edition_checked:EDITIONS_OK.includes(ed),created_by:me.email,created_at:now()};
    OB().push(b); ev(b.property_id,null,'blank_loaded',{blank_id:b.id,sha256:b.sha256,edition:ed,edition_checked:b.edition_checked,pages:b.pages}); return ok({id:b.id,existing:false,edition_checked:b.edition_checked}); }
  if(name==='agent_blank_map_save'){ const b=OB().find(x=>x.id===a.p_blank); if(!b) return bad('No such blank'); if(!b.edition_checked) return bad("This edition of the agreement hasn't been checked yet, so it can't be mapped or drafted on");
    const pl=a.p_places||[]; if(!Array.isArray(pl)||pl.length>400) return bad('Please check the places');
    for(const x of pl){ const sz=b.sizes[(x.page|0)-1]; if(!/^[A-Za-z0-9_.:-]{1,60}$/.test(x.id||'')||!/^[a-z][a-z0-9_]{0,40}$/.test(x.key||'')||!PLACE_KINDS.includes(x.kind)||!sz||!(x.x>=-1&&x.x<=sz[0]+1&&x.y>=-1&&x.y<=sz[1]+1&&x.w>=0&&x.w<=sz[0]+1&&x.h>=0&&x.h<=sz[1]+1)) return bad("One of the places doesn't sit on a page of this blank"); }
    if(new Set(pl.map(x=>x.id)).size!==pl.length) return bad('Two places have the same id');
    if(!Array.isArray(a.p_chattels||[])||(a.p_chattels||[]).length>60) return bad('Up to 60 chattels');
    const ch=(a.p_chattels||[]).map(x=>String(x??'').trim()).filter(Boolean); if(ch.some(x=>x.length>200)) return bad('Please shorten each chattel: 200 characters at most');
    const v=OBM().filter(m=>m.blank_id===b.id).reduce((m,x)=>Math.max(m,x.version),0)+1; const m={id:uid(),blank_id:b.id,version:v,places:JSON.parse(JSON.stringify(pl)),proposals:a.p_proposals||[],chattels:ch,notes:a.p_notes||[],missing:a.p_missing||[],approved:!!a.p_approve,created_by:me.email,created_at:now()};
    OBM().push(m); const pr=m.proposals; ev(b.property_id,null,m.approved?'map_approved':'map_saved',{blank_id:b.id,sha256:b.sha256,map_id:m.id,version:v,places:pl.length,ai_kept:pr.filter(x=>['kept','moved'].includes(x.decision)).length,ai_deleted:pr.filter(x=>x.decision==='deleted').length});
    if(m.approved&&ch.length) offerRpc('agent_offer_chattels',{p_property:b.property_id,p_items:ch},me);
    return ok({id:m.id,version:v,approved:m.approved}); }
  if(name==='agent_offer_term'){ const k=a.p_key; if(!/^[a-z][a-z0-9_]{1,40}$/.test(k||'')) return bad('A key is lower-case letters, digits and underscores'); const r=a.p_rule||{};
    if(Object.keys(r.when||{}).some(x=>!['always','kiwisaver','condition','no_condition','lawyer_approval','gst_registered','entity','nominee','chattels','settlement'].includes(x))) return bad("That rule uses something the drafting doesn't know");
    const w=String(a.p_wording||'').trim()||null; if(w&&w.length>4000) return bad('That wording is too long (4,000 characters at most)'); const T=OTERMS(), o=T.find(x=>x.key===k), before=o?JSON.parse(JSON.stringify(o)):null;
    if(!o){ const ti=String(a.p_title||'').trim(); if(!ti) return bad('Give the clause a title'); T.push({key:k,title:ti.slice(0,200),kind:'further_term',clause:null,wording:w,wording_from:null,rule:r,position:a.p_position??100,active:a.p_active!==false,updated_by:me.email,updated_at:now()}); }
    else { if(o.wording_from&&w) return bad("This clause's wording is kept with your condition wording (Offers tile, Link and settings)"); if(o.kind==='printed'&&w) return bad('A printed clause is referred to by its number; it has no wording here');
      Object.assign(o,{title:String(a.p_title||'').trim()||o.title,wording:o.kind==='printed'||o.wording_from?null:w,rule:r,position:a.p_position??o.position,active:a.p_active??o.active,updated_by:me.email,updated_at:now()}); }
    (DB.offer_term_changes||=[]).push({id:DB.offer_term_changes.length+1,key:k,before,after:JSON.parse(JSON.stringify(T.find(x=>x.key===k))),actor:me.email,at:now()}); return ok(null); }
  if(name==='agent_draft_add'){ const o=PO().find(x=>x.id===a.p_offer&&x.source!=='manual'); if(!o||!o.details) return bad('No such offer'); const m=OBM().find(x=>x.id===a.p_map); if(!m) return bad('No such map'); if(!m.approved) return bad('Approve the places on the blank first');
    const b=OB().find(x=>x.id===m.blank_id); if(b.property_id!==o.property_id) return bad('That blank is for another property'); if(!b.edition_checked) return bad("This edition of the agreement hasn't been checked yet");
    const newest=OBM().filter(x=>x.blank_id===b.id&&x.approved).sort((x,y)=>y.version-x.version)[0]; if(newest.id!==m.id) return bad('A newer version of the places on this blank has been approved. Draft again');
    if(!/^[0-9a-f]{64}$/.test(a.p_sha256||'')) return bad('The draft needs its fingerprint'); if(a.p_sha256===b.sha256) return bad('That is the blank itself, not a draft');
    if(!new RegExp('^properties/'+o.property_id+'/docs/offer-draft-'+o.id+'-[0-9]{1,4}-[0-9a-f]{12}\\.pdf$').test(a.p_path||'')) return bad('A draft is stored at its own place');
    const obj=SO()[a.p_path]; if(!obj) return bad("The draft hasn't arrived yet"); if(obj.size!==a.p_size||obj.mime!=='application/pdf') return bad("The stored draft doesn't match");
    if(!(DB.offer_file_hashes||[]).some(h=>h.path===a.p_path&&h.sha256===a.p_sha256&&h.size_bytes===a.p_size)) return bad("The draft's fingerprint hasn't been confirmed by the server yet. Try again");
    if(!draftEditsOk(a.p_edits||{},b.sizes)) return bad("One of your changes on the review screen couldn't be kept: a mark or moved place off the page, too many terms, or text too long. Check them and draft again");   // migration 021
    const n=OD().filter(x=>x.offer_id===o.id).reduce((m_,x)=>Math.max(m_,x.number),0)+1;
    const d={id:uid(),offer_id:o.id,property_id:o.property_id,number:n,blank_id:b.id,blank_sha256:b.sha256,map_id:m.id,details:JSON.parse(JSON.stringify(o.details)),edits:a.p_edits||{},placed:a.p_placed||[],needs:a.p_needs||[],path:a.p_path,sha256:a.p_sha256,size_bytes:a.p_size,note:(a.p_note||'').trim()||null,created_by:me.email,created_at:now()};
    OD().push(d); ev(o.property_id,o.id,'drafted',{draft_id:d.id,number:n,sha256:d.sha256,blank_sha256:b.sha256,map_version:m.version,needs:d.needs.length,note:d.note}); return ok({id:d.id,number:n}); }
  if(name==='agent_draft_approve'){ const d=OD().find(x=>x.id===a.p_draft); if(!d) return bad('No such draft'); if(a.p_sha256!==d.sha256) return bad("That isn't the draft on your screen. Open it again");
    if(ODA().some(x=>x.draft_id===d.id)) return ok({ok:true,existing:true});
    if(d.number!==Math.max(...OD().filter(x=>x.offer_id===d.offer_id).map(x=>x.number))) return bad('There is a newer draft of this offer. Approve that one');
    if(!same((PO().find(x=>x.id===d.offer_id)||{}).details,d.details)) return bad('The offer has changed since this draft. Re-draft it first');
    const m=OBM().find(x=>x.id===d.map_id), b=OB().find(x=>x.id===d.blank_id);
    if(OBM().some(x=>x.blank_id===b.id&&x.approved&&x.version>m.version)) return bad('The places on the blank have been approved again since this draft. Re-draft it first');
    if(OB().some(x=>x.property_id===b.property_id&&x.edition_checked&&x.created_at>b.created_at)) return bad('A newer agreement blank has been loaded since this draft. Approve its places and re-draft first');
    const ck=Array.isArray(a.p_checked)?a.p_checked:[];
    if(d.needs.some(x=>x.blocking===true&&!(x.ackable===true&&ck.includes(x.id)))) return bad('Some places still need you. Fill them in and draft again');
    ODA().push({id:ODA().length+1,draft_id:d.id,sha256:d.sha256,approved_by:me.email,approved_at:now(),checked:ck}); ev(d.property_id,d.offer_id,'draft_approved',{draft_id:d.id,number:d.number,sha256:d.sha256,blank_sha256:d.blank_sha256,checked:ck}); return ok({ok:true,existing:false}); }
  if(name==='agent_lawyer_use'){ const l=OLL().find(x=>x.id===a.p_lookup); if(!l||!l.ok) return bad('No such lookup'); const o=PO().find(x=>x.id===l.offer_id); if(!o) return bad('No such offer');
    if(!Array.isArray(a.p_keys)||!a.p_keys.length) return bad('Tick at least one'); const law=Object.assign({},o.details.lawyer||{}), used=[];
    for(const k of a.p_keys){ const v=((l.result||{}).values||[]).find(x=>x.id===k); if(!v) return bad("That value isn't in the lookup"); if(!['email','phone'].includes(v.field)) return bad("Only the lawyer's email and phone are used"); law[v.field]=v.field==='email'?v.value.toLowerCase():v.value; used.push({field:v.field,value:v.value,kind:v.kind,source_url:v.source_url}); }
    if(l.firm&&!law.firm) law.firm=l.firm; if(l.person&&!law.person) law.person=l.person; const before=o.details; o.details=Object.assign({},o.details,{lawyer:law}); o.updated_at=now();
    ev(o.property_id,o.id,'corrected',{note:"Lawyer's contact details from the lookup, ticked by Tim",before,after:o.details,lookup:l.id,used}); return ok(law); }
  return bad('unknown rpc '+name); }
// migration 021: offer_draft_edits_ok, what Tim did on the review screen (marks and moved places on the blank's own pages, and the shape of the rest)
const canonJ=x=>Array.isArray(x)?x.map(canonJ):x&&typeof x==='object'?Object.keys(x).sort().reduce((m,k)=>{ if(x[k]!==undefined) m[k]=canonJ(x[k]); return m; },{}):x;
function draftEditsOk(e,sizes){ const num=(v,lo,hi)=>typeof v==='number'&&isFinite(v)&&v>=lo&&v<=hi;
  const box=(v,min)=>{ if(!v||typeof v!=='object'||!Number.isInteger(v.page)||v.page<1||v.page>sizes.length) return false; const [w,h]=sizes[v.page-1]; return num(v.x,-1,w+1)&&num(v.y,-1,h+1)&&num(v.w,min,w+1)&&num(v.h,min,h+1)&&v.x+v.w<=w+1&&v.y+v.h<=h+1; };
  if(!e||typeof e!=='object'||Array.isArray(e)||JSON.stringify(e).length>200000) return false; e=JSON.parse(JSON.stringify(e));
  if('marks' in e){ if(!Array.isArray(e.marks)||e.marks.length>100) return false; for(const m of e.marks){ if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(m&&m.id||''))||!['initials','signature','strike','text','highlight'].includes(m.type)) return false; if(m.who!=null&&!['purchasers','vendors','both'].includes(m.who)) return false; if(String(m.text||'').length>500||!box(m,8)) return false; } }
  if('moves' in e){ if(!e.moves||typeof e.moves!=='object'||Array.isArray(e.moves)||Object.keys(e.moves).length>200) return false; for(const [k,v] of Object.entries(e.moves)){ if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(k)||!v||!box(v.from,0)||!box(v.to,4)||v.from.page!==v.to.page) return false; } }
  if('added_terms' in e){ if(!Array.isArray(e.added_terms)||e.added_terms.length>30) return false; if(!e.added_terms.every(x=>x&&/^[A-Za-z0-9_]{1,80}$/.test(String(x.id||''))&&/^[a-z][a-z0-9_]{0,40}$/.test(String(x.key||'')))) return false; }
  if('term_order' in e&&(!Array.isArray(e.term_order)||e.term_order.length>120||!e.term_order.every(x=>typeof x==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(x)))) return false;
  if('extra_terms' in e){ if(!Array.isArray(e.extra_terms)||e.extra_terms.length>60) return false; for(const x of e.extra_terms){ if(typeof x==='string'){ if(x.length>4000) return false; continue; }
    if(!x||typeof x!=='object'||Array.isArray(x)||!/^[A-Za-z0-9_]{1,80}$/.test(String(x.id||''))||typeof x.title!=='string'||x.title.length>200||typeof x.text!=='string'||x.text.length>4000) return false;
    if('ai' in x&&typeof x.ai!=='boolean') return false; if(Object.keys(x).some(k=>!['id','title','text','ai'].includes(k))) return false; } }
  if('items' in e){ if(!e.items||typeof e.items!=='object'||Array.isArray(e.items)||Object.keys(e.items).length>300) return false; for(const [k,v] of Object.entries(e.items)) if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(k)||typeof v!=='string'||v.length>4000) return false; }
  if(e.custom_wording!=null&&(typeof e.custom_wording!=='string'||e.custom_wording.length>4000)) return false;
  if('retired_numbers' in e&&(!Array.isArray(e.retired_numbers)||e.retired_numbers.length>120||!e.retired_numbers.every(n=>num(n,1,999)))) return false;
  if('term_timing' in e){ if(!e.term_timing||typeof e.term_timing!=='object'||Array.isArray(e.term_timing)) return false; for(const [k,x] of Object.entries(e.term_timing)){ if(!/^[A-Za-z0-9_]{1,80}$/.test(k)||!x||typeof x!=='object') return false; if(x.days!=null&&!num(x.days,1,250)) return false; if(x.date!=null&&!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))) return false; if(x.after!=null&&!/^[a-z_]{1,20}$/.test(String(x.after))) return false; } }
  return true; }
function draftInvoke(o){ const b=(o&&o.body)||{}; const me=S&&S.user; const res=(data,status)=>status&&status>=400?Promise.resolve({data:null,error:{message:String(status),context:{json:async()=>data}}}):ok(data);
  const calls=JSON.parse(localStorage.getItem('draftCalls')||'[]'); calls.push(b.action); localStorage.setItem('draftCalls',JSON.stringify(calls));
  if(!me) return res({error:'Sign in first'},401); if(!AGENTS.includes(me.email)) return res({error:'Only Tim can do this'},403);
  const ai=row=>(DB.ai_calls||=[]).push(Object.assign({id:(DB.ai_calls.length+1),at:now(),model:'claude-haiku-5-5',agent:me.email},row));
  if(b.action==='confirm_file'){ const pth=String(b.path||''); if(!/^properties\/[0-9A-Za-z-]+\/docs\/[A-Za-z0-9._-]{1,200}$/.test(pth)) return res({error:'Bad request'},400);
    const bl=(window.__repoBlobs||{})[pth]; if(!bl) return res({ok:false,error:"The file isn't in storage yet. Try again."},404);
    return bl.arrayBuffer().then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>{ const sha=Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join(''); const H=(DB.offer_file_hashes||=[]); const ex=H.find(x=>x.path===pth);
      if(ex&&(ex.sha256!==sha||ex.size_bytes!==buf.byteLength)) return {data:null,error:{message:'409',context:{json:async()=>({ok:false,error:"The file's fingerprint couldn't be recorded."})}}};
      if(!ex) H.push({path:pth,sha256:sha,size_bytes:buf.byteLength,confirmed_by:me.email,confirmed_at:now()}); save(); return {data:{ok:true,sha256:sha,size:buf.byteLength},error:null}; })); }
  // Tim's clause writer (fn/offer_draft_handler.ts write_clause): the daily cap from ai_calls, logged as Sonnet, {timing} for a condition.
  // localStorage clauseAiMode = 'off' | 'fail' | 'unsuitable' | 'plain' (not a condition) changes the answer.
  if(b.action==='write_clause'){ const m=localStorage.getItem('clauseAiMode'); const t=String(b.text||'').trim();
    if(t.length<10||t.length>3000) return res({ok:false,error:t.length<10?'Describe the clause in a few more words.':'Please keep the description under 3000 characters.'},400);
    if(m==='off') return ok({ok:false,reason:'off',message:"The clause writer isn't switched on yet."});
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}), used=(DB.ai_calls||[]).filter(x=>x.purpose==='offer clause draft'&&new Date(x.at).toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'})===today).length;
    if(used>=OSET().ai_daily_cap) return ok({ok:false,reason:'cap',message:"Today's AI help limit has been reached. It starts again tomorrow, or you can change the limit in the offer settings."});
    ai({purpose:'offer clause draft',model:'claude-sonnet-5-5',ok:m!=='fail'}); save();
    if(m==='fail') return ok({ok:false,reason:'failed',message:"The AI didn't answer. Try again in a minute."});
    if(m==='unsuitable') return ok({ok:false,reason:'unsuitable',message:"That doesn't look like a clause for this agreement."});
    const words=t.replace(/[<>]/g,'').slice(0,160);
    if(m==='plain') return ok({ok:true,draft:true,title:'Your clause',wording:'The Vendor shall '+words+'.',summary:'As you described.',is_condition:false});
    return ok({ok:true,draft:true,title:'Your clause',wording:'This agreement is conditional upon '+words+'. This condition is to be satisfied or waived {timing}.',summary:'As you described, by the time you choose.',is_condition:true}); }
  if(b.action==='read_pack'){ const m=localStorage.getItem('draftAiMode'); if(m==='off') return ok({ok:false,reason:'off',message:"Document reading isn't switched on yet."});
    if(!Array.isArray(b.pages)||!b.pages.length||b.pages.length>8) return res({error:'Send 1 to 8 pages at a time'},400);
    ai({purpose:'agreement pack read',ok:m!=='fail'}); if(m==='fail'){ save(); return ok({ok:false,reason:'failed',message:"The AI didn't answer. Try again in a minute."}); }
    const places=[], notes=[], chattels=[];
    b.pages.forEach(pg=>{ (pg.lines||[]).forEach(l=>{ if(/acknowledges/i.test(l.t)) places.push({page:pg.page,line:l.i,kind:'ack',reason:'The buyer acknowledges something here.'}); if(/^Witnessed/i.test(l.t)) places.push({page:pg.page,line:l.i,kind:'sign',reason:'A witness signs here.'}); });
      if((pg.lines||[]).some(l=>/inserted LIM/i.test(l.t))) notes.push({page:pg.page,text:'A LIM page is inserted into the pack.'}); if((pg.lines||[]).some(l=>/^SCHEDULE 2/.test(l.t))) chattels.push({name:'Spa pool',qty:null,included:true,page:pg.page}); });
    (DB.offer_blank_reads||=[]).push({id:(DB.offer_blank_reads.length+1),blank_id:b.blank_id,pages:b.pages.map(p=>p.page),model:'claude-haiku-5-5',ok:true,result:{places,notes,chattels},created_by:me.email,created_at:now()}); save();
    return ok({ok:true,read_id:DB.offer_blank_reads.length,places,notes,chattels}); }
  if(b.action==='lawyer_lookup'){ const m=localStorage.getItem('lawyerMode'); const q=encodeURIComponent([b.person,b.firm,'lawyer New Zealand contact'].filter(Boolean).join(' '));
    const manual=[{label:'Search the web',url:'https://www.google.com/search?q='+q},{label:'NZ Law Society: find a lawyer',url:'https://www.lawsociety.org.nz/for-the-public/find-a-lawyer/'},{label:'NZ Law Society register',url:'https://www.lawsociety.org.nz/registry-lookup/'}];
    if(m==='off') return ok({ok:false,reason:'off',message:"The lookup isn't switched on yet. Use the links to look the lawyer up yourself.",manual});
    ai({purpose:'lawyer contact lookup',ok:m!=='no_search'});
    if(m==='no_search'){ save(); return ok({ok:false,reason:'no_search',message:"Web search isn't switched on for the AI account. Use the links to look the lawyer up yourself.",manual}); }
    const values=m==='none'?[]:m==='reception'?[{id:'v1',field:'phone',kind:'reception',value:'03 477 0000',source_url:'https://synthlaw.example/contact',source_title:'Contact us'}]
      :[{id:'v1',field:'email',kind:'email',value:'pat@synthlaw.example',source_url:'https://synthlaw.example/people/pat',source_title:'Pat Solicitor'},{id:'v2',field:'phone',kind:'direct',value:'03 477 1234',source_url:'https://synthlaw.example/people/pat',source_title:'Pat Solicitor'}];
    const l={id:((DB.offer_lawyer_lookups||=[]).length+1),offer_id:b.offer_id,firm:b.firm,person:b.person,model:'claude-haiku-5-5',ok:true,result:{values,manual,fallback:m==='reception'},created_by:me.email,created_at:now()}; DB.offer_lawyer_lookups.push(l); save();
    return ok({ok:true,lookup_id:l.id,values,fallback:m==='reception',dropped:0,manual}); }
  return res({error:'Bad request'},400); }
// ── purchaser signing (mirrors migrations/023_offer_signing.sql and fn/offer_sign_handler.ts) ──
// Tim only for the tables; nobody writes them directly; vendors and anyone not signed in see nothing; offer_signers can't be read with
// select('*') or for the link's fingerprints (column privileges). offer_events carry the hash chain, made as each is written. The
// offer-sign edge function: purchasers by their own link (token, then the emailed code's session), Tim's send and lock. No email is
// ever sent: each is kept in email_log (mock: true) and in localStorage mockSignMail ({kind, to, code?, link?}) for the tests to read.
// localStorage mockMailFail = an address: email to it fails.
const SIGN_TABLES=['offer_signings','offer_signers','offer_sign_taps','offer_sign_receipts','offer_sign_marks','offer_sign_reviews','offer_sign_asks','offer_rounds','offer_documents','offer_agreements','offer_mail_drafts','offer_mail_log','offer_holds','offer_requests','offer_deposit_holders','offer_sign_undos','offer_sign_redraws','offer_confirm_holds','offer_sign_taps_live','offer_sign_marks_live','offer_sign_reviews_live'];
const SIGN_RPCS=['agent_signing_undo','agent_signing_revert_round','agent_offer_revert_sealed','agent_offer_confirm_hold','agent_offer_confirm_held','agent_offer_confirm_hold_discard','agent_offer_freeze','agent_offer_unfreeze','agent_offer_withdraw_now','agent_offer_request_carry_on','agent_offer_deposit_holder','agent_mail_draft_unstick','agent_mail_draft_add','agent_mail_draft_edit','agent_mail_draft_review','agent_mail_draft_void','agent_signing_turn_ok','agent_signing_cancel','agent_signing_release','agent_signing_start','agent_signing_consent','agent_signing_receipt','agent_signing_marks','agent_signing_tap','agent_signing_finish','agent_signing_mark','agent_signing_review','agent_offer_chain_check','agent_round_present','agent_round_change','agent_offer_layers','agent_document_close','agent_negotiation_withdraw','agent_offer_negotiation_setting','agent_offer_link_changes_default','agent_signing_release_edited','agent_round_present_edited','agent_signing_finish_checked'];
const OSG=()=>(DB.offer_signings||=[]), OSR=()=>(DB.offer_signers||=[]), OST=()=>(DB.offer_sign_taps||=[]), OSC=()=>(DB.offer_sign_receipts||=[]), OSM=()=>(DB.offer_sign_marks||=[]), OSV=()=>(DB.offer_sign_reviews||=[]), OSA=()=>(DB.offer_sign_asks||=[]), ORN=()=>(DB.offer_rounds||=[]);
const shaS=t=>window.SIGN.sha256Hex(String(t));
// 026 (Offers fixes 3): undone work is kept. A tap or change is never changed or removed; undoing one adds an offer_sign_undos row, and a
// place tapped again adds a 'redo' row. What stands is read through the views (offer_sign_taps_live, _marks_live, _reviews_live). A
// signature drawn again once every tap is undone is an offer_sign_redraws row; the newest is used (offer_sign_ink). Confirm held while frozen:
// offer_confirm_holds.
const OSU=()=>(DB.offer_sign_undos||=[]), OSD=()=>(DB.offer_sign_redraws||=[]), OCH=()=>(DB.offer_confirm_holds||=[]);
const tapLast=t=>OSU().filter(u=>u.tap_id===t.id).sort((a,b)=>b.id-a.id)[0];
const tapLive=t=>{ const u=tapLast(t); return !u||u.action==='redo'; };
const liveTaps=()=>OST().filter(tapLive).map(t=>{ const u=tapLast(t); return Object.assign({},t,{at:u?u.at:t.at}); });
const markLive=m=>!OSU().some(u=>u.mark_id===m.id);
const liveMarks=()=>OSM().filter(markLive);
const reviewLive=r=>!(r.marks||[]).length||(r.marks||[]).some(k=>!OSU().some(u=>u.mark_id===k));
const liveReviews=()=>OSV().filter(reviewLive);
const LIVE_VIEWS={offer_sign_taps_live:liveTaps,offer_sign_marks_live:()=>liveMarks().map(m=>Object.assign({},m)),offer_sign_reviews_live:()=>liveReviews().map(r=>Object.assign({},r))};
const idCheckedAt=s=>{ const e=OE().filter(x=>x.kind==='sign_id_checked'&&(x.detail||{}).signer_id===s.id).pop(); return e?e.at:null; };
const noIdAt=s=>{ const e=OE().filter(x=>x.kind==='sign_no_id_check'&&(x.detail||{}).signer_id===s.id).pop(); return e?e.at:null; };
const sgInk=s=>{ const r=OSD().filter(x=>x.signer_id===s.id).sort((a,b)=>b.id-a.id)[0]; return r?{sig_png:r.sig_png,init_png:r.init_png,redrawn_at:r.at}:{sig_png:s.sig_png,init_png:s.init_png,redrawn_at:null}; };
// has a freeze on the offer been lifted since this round was released (offer_revert_offered: from the offer's timeline, in order)
function revertOffered(g){ const ev=OE().filter(e=>e.offer_id===g.offer_id), rel=ev.filter(e=>['sign_released','round_presented'].includes(e.kind)&&(e.detail||{}).signing_id===g.id).map(e=>e.seq).sort((a,b)=>b-a)[0];
  return rel!=null&&ev.some(e=>e.kind==='offer_unfrozen'&&e.seq>rel)&&!OHD().some(h=>h.offer_id===g.offer_id&&h.kind==='withdraw'); }
const SIGN_ID_TYPES=['nz_driver_licence','passport','nz_firearms_licence','kiwi_access_card','other_photo_id','known_to_tim'];
// the hash chain: each new offer event carries the fingerprint of the one before it in its chain (offer_event_chain())
function chainPush(arr,e){ const X=window.SIGN; if(!X) return; e.chain=e.offer_id||('p:'+e.property_id); const prev=arr.filter(x=>x.chain===e.chain&&x.hash).sort((a,b)=>b.seq-a.seq)[0];
  e.seq=prev?prev.seq+1:1; e.prev_hash=prev?prev.hash:X.ZERO; e.at=e.at||now(); e.detail=e.detail||{}; e.body=X.chainBody(e); e.hash=X.chainHash(e.prev_hash,e.body); }
function chainArr(a){ if(!a.__c){ Object.defineProperty(a,'push',{value:function(...xs){ xs.forEach(x=>chainPush(this,x)); return Array.prototype.push.apply(this,xs); },enumerable:false}); Object.defineProperty(a,'__c',{value:true,enumerable:false}); } return a; }
function sgMail(kind,to,extra){ const l=JSON.parse(localStorage.getItem('mockSignMail')||'[]'); if(localStorage.getItem('mockMailFail')===to) throw new Error('SMTP down');
  l.push(Object.assign({kind,to,at:now()},extra||{})); localStorage.setItem('mockSignMail',JSON.stringify(l)); (DB.email_log||=[]).push({id:DB.email_log.length+1,agreement_id:(extra&&extra.agreement_id)||null,at:now(),kind,recipients:to,subject:(extra&&extra.subject)||kind,ok:true,mock:true}); }
const sgEv=(g,actor,kind,detail)=>OE().push({id:OE().length+1,property_id:g.property_id,offer_id:g.offer_id,at:now(),actor,kind,detail:detail||{}});
// 024 freeze and withdrawal: offer_holds, offer_requests (Tim, 24 November 2026)
const OHD=()=>(DB.offer_holds||=[]), ORQ=()=>(DB.offer_requests||=[]), ODH=()=>(DB.offer_deposit_holders||=[]);
const holdActive=offerId=>OHD().some(h=>h.offer_id===offerId&&(h.kind==='withdraw'||!h.lifted_at));
const NEUTRAL_STOP='This version is no longer being signed. Tim will be in touch.', ASKED_STOP='Your request has gone to Tim. He will contact you straight away.';
const sgStopFor=(s,g)=>holdActive(g.offer_id)?NEUTRAL_STOP:s.void_at?'This version has been replaced. Tim will send you the new one.':ORQ().some(r=>r.signer_id===s.id&&!r.handled_at)?ASKED_STOP:sgCurrent(g);
function sgCurrent(g){ if(holdActive(g.offer_id)) return NEUTRAL_STOP; if(g.status==='replaced') return 'This version has been replaced. Tim will send you the new one.'; if(g.status==='locked') return 'Signing is finished, and the signed copy is locked.'; if(g.status==='cancelled') return 'This signing was stopped before anyone signed. Tim will send it to you again.';
  const ds=(DB.offer_drafts||[]).filter(x=>x.offer_id===g.offer_id), d=ds.find(x=>x.id===g.draft_id), o=PO().find(x=>x.id===g.offer_id);
  if(g.status==='withdrawn'||['withdrawn','lapsed','declined'].includes(o.status)) return 'This version is no longer being signed. Tim will be in touch.';   // 024: Tim tells them himself
  if(OAG().some(x=>x.offer_id===g.offer_id)) return 'This version is no longer being signed. Tim will be in touch.';
  if(g.document_id&&(ODC().find(x=>x.id===g.document_id)||{}).status!=='open') return 'This version is no longer being signed. Tim will be in touch.';
  if(d.number!==Math.max(...ds.map(x=>x.number))||!same(o.details,d.details)) return (g.round_no||1)>1?'This version is no longer being signed. Tim will be in touch.':'The offer has changed since it was sent for signing. Tim will send you the new version.'; return null; }
function sgReady(s,allowFinished){ const g=OSG().find(x=>x.id===s.signing_id); if(holdActive(g.offer_id)) throw new Error(NEUTRAL_STOP); if(s.void_at) throw new Error('This version has been replaced. Tim will send you the new one.'); const w=sgCurrent(g); if(w) throw new Error(w); if(ORQ().some(r=>r.signer_id===s.id&&!r.handled_at)) throw new Error(ASKED_STOP);
  if(g.status==='ready') throw new Error("Signing hasn't started yet"); if(g.status==='held') throw new Error('Tim is checking a change to the document. Signing carries on once he has.');
  if(g.status==='complete') throw new Error('Everyone has signed. The signed copy is being locked.'); if(s.finished_at&&!allowFinished) throw new Error('You have finished signing. Thank you.'); return g; }
const sgRequired=(g,pos)=>[...new Set(g.places.filter(p=>p.signer===pos).map(p=>p.id).concat(liveReviews().filter(r=>r.signing_id===g.id).flatMap(r=>r.places.filter(p=>p.signer===pos).map(p=>p.id))))];
function sgPlacesOk(pl,pages,n,needAll){ if(!Array.isArray(pl)||pl.length>6000) return false; const num=(v,lo,hi)=>typeof v==='number'&&v>=lo&&v<=hi;
  for(const x of pl){ if(!x||!/^[a-z]{3,8}:[A-Za-z0-9_.:-]{1,110}:s[0-9]{1,2}$/.test(x.id||'')||!num(x.signer,1,n)||!['initial','signature','name'].includes(x.kind)||!['filled','foot','term','block','ack','mark','change'].includes(x.why)) return false;
    if(!new RegExp(':s'+x.signer+'$').test(x.id)||!num(x.page,1,pages.length)) return false; const [w,h]=pages[x.page-1]; if(!(num(x.x,-1,w+1)&&num(x.y,-1,h+1)&&num(x.w,1,w+1)&&num(x.h,1,h+1))) return false; }
  if(new Set(pl.map(x=>x.id)).size!==pl.length) return false;
  if(needAll) for(let s=1;s<=n;s++){ if(!pl.some(p=>p.signer===s&&p.kind==='signature'&&p.why==='block')) return false; if(new Set(pl.filter(p=>p.signer===s&&p.why==='foot').map(p=>p.page)).size!==pages.length) return false; }
  return true; }
const PNG_RE=/^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
function sgConsent(s,ua,net){ const g=sgReady(s); if(s.consent_at) return; s.consent_at=now(); s.user_agent=(ua||s.user_agent||'').slice(0,400); if(net) s.net_hash=net; sgEv(g,s.name,'sign_consent',{signing_id:g.id,signer:s.position}); }
function sgReceipt(s,guide,version,file,sha,pages){ const g=sgReady(s); if(!s.consent_at) throw new Error('Agree to sign electronically first'); if(!['cca','sale_purchase','chattels'].includes(guide)||(guide==='chattels'&&g.side!=='vendor')) throw new Error('Unknown guide');
  if(guide==='cca'&&(!g.cca_pages.length||JSON.stringify(pages||[])!==JSON.stringify(g.cca_pages))) throw new Error('Please read the Client and Customer Acknowledgement pages first');
  if(guide==='sale_purchase'&&(!/^[A-Za-z0-9._-]{1,120}\.pdf$/.test(file||'')||!version||String(version).length>60||(sha!=null&&!/^[0-9a-f]{64}$/.test(sha)))) throw new Error('Please open the guide first');
  if(OSC().some(r=>r.signer_id===s.id&&r.guide===guide)) return;
  const sp=guide==='sale_purchase'; OSC().push({id:OSC().length+1,signing_id:g.id,signer_id:s.id,guide,version:sp?version:null,file:sp?file:null,sha256:sp?(sha||null):null,pages:guide==='cca'?g.cca_pages.slice():[],at:now()}); sgEv(g,s.name,'sign_receipt',{signing_id:g.id,signer:s.position,guide,version:sp?version||null:null}); }
function sgMarks(s,sig,init){ const g=sgReady(s); if(!s.consent_at) throw new Error('Agree to sign electronically first'); if(!PNG_RE.test(sig||'')||sig.length>400000||sig.length<200) throw new Error('Please draw your signature');
  if(!PNG_RE.test(init||'')||init.length>200000||init.length<150) throw new Error('Please draw your initials'); if(liveTaps().some(t=>t.signer_id===s.id)) throw new Error('Your signature and initials are kept as you first used them');
  if(liveMarks().some(m=>m.signer_id===s.id&&['own_initials','own_signature'].includes(m.kind))) throw new Error('Your signature and initials are kept as you first used them');   // 029 review: never two drawings for one person
  // 026: every tap undone: the first drawing stays as it was, and this one is added
  if(OST().some(t=>t.signer_id===s.id)||OSD().some(r=>r.signer_id===s.id)){ OSD().push({id:OSD().length+1,signing_id:g.id,signer_id:s.id,sig_png:sig,init_png:init,by_name:s.name,at:now()}); sgEv(g,s.name,'sign_redrawn',{signing_id:g.id,signer:s.position,round:g.round_no||1,side:g.side||'purchaser'}); return; }
  s.sig_png=sig; s.init_png=init; s.marks_at=now(); }
function sgTap(s,place){ const g=sgReady(s); if(!s.consent_at) throw new Error('Agree to sign electronically first');
  if((g.round_no||1)===1&&(!OSC().some(r=>r.signer_id===s.id&&r.guide==='sale_purchase')||(g.cca_pages.length&&!OSC().some(r=>r.signer_id===s.id&&r.guide==='cca')))) throw new Error('Please read and tick the guides first');
  if(g.side==='vendor'&&!OSC().some(r=>r.signer_id===s.id&&r.guide==='chattels')) throw new Error('Please read the reminder about chattels first');
  const ink=sgInk(s); if(!ink.sig_png||!ink.init_png) throw new Error('Draw your signature and initials first'); const req=sgRequired(g,s.position); if(!req.includes(place)) throw new Error("That place isn't yours to sign");
  const t0=OST().find(t=>t.signer_id===s.id&&t.place_id===place);
  if(!t0) OST().push({id:OST().length+1,signing_id:g.id,signer_id:s.id,place_id:place,at:now()});
  else if(!tapLive(t0)){ if(OSU().filter(u=>u.signer_id===s.id&&u.action==='redo'&&Date.parse(u.at)>Date.now()-36e5).length>=30) throw new Error('You have tapped places again a lot in the last hour. Please call Tim on 027 562 7207'); OSU().push({id:OSU().length+1,signing_id:g.id,signer_id:s.id,tap_id:t0.id,mark_id:null,action:'redo',scope:'tap',by_name:s.name,at:now()}); }   // 026: tapped again
  return {done:liveTaps().filter(t=>t.signer_id===s.id&&req.includes(t.place_id)).length,of:req.length}; }
function sgFinish(s,ua,net,idType,witness){ const g=sgReady(s); if(!s.consent_at||!sgInk(s).sig_png) throw new Error('Agree, read the guides and draw your signature and initials first');
  const LT=liveTaps(), req=sgRequired(g,s.position), miss=req.filter(p=>!LT.some(t=>t.signer_id===s.id&&t.place_id===p)).length; if(miss) throw new Error(`There ${miss===1?'is':'are'} still ${miss===1?'1 place':miss+' places'} to do`);
  const taps=LT.filter(t=>t.signer_id===s.id).map(t=>t.place_id+'@'+t.at).join('\n');
  const seen=shaS(g.draft_sha256+':'+g.places_sha256+':'+liveReviews().filter(r=>r.signing_id===g.id).map(r=>r.places_sha256).join(',')+':'+s.position);
  Object.assign(s,{finished_at:now(),seen_sha256:seen,id_sighted:idType||s.id_sighted||null,witnessed_by:witness||s.witnessed_by||null,user_agent:(ua||s.user_agent||'').slice(0,400),net_hash:net||s.net_hash||null});
  sgEv(g,s.name,'sign_finished',{signing_id:g.id,signer:s.position,method:g.method,places:req.length,taps_sha256:shaS(taps),seen_sha256:seen,id_sighted:idType||s.id_sighted||null});
  const left=OSR().filter(x=>x.signing_id===g.id&&!x.void_at&&!x.finished_at).length; if(!left){ g.status='complete'; g.completed_at=now(); sgEv(g,'system','sign_complete',{signing_id:g.id,signers:OSR().filter(x=>x.signing_id===g.id).length}); }
  return {ok:true,complete:!left,signing_id:g.id}; }
// 026 offer_sign_do_undo: the signer's last step that stands, or their whole turn (their drawing cleared only if they ask); each undone step
// is an offer_sign_undos row, and the timeline says what was undone. A round held for Tim may still have its mark undone.
function sgUndo(s,scope,clear,by){ if(!['last','turn'].includes(scope)) throw new Error('Choose undo your last step, or start your turn again');
  if(scope==='last'&&clear) throw new Error('Your signature and initials are cleared only when you start your turn again');
  const g=OSG().find(x=>x.id===s.signing_id); if(holdActive(g.offer_id)) throw new Error(NEUTRAL_STOP); if(s.void_at) throw new Error('This version has been replaced. Tim will send you the new one.');
  const w=sgCurrent(g); if(w) throw new Error(w); if(ORQ().some(r=>r.signer_id===s.id&&!r.handled_at)) throw new Error(ASKED_STOP);
  if(g.status==='ready') throw new Error("Signing hasn't started yet"); if(g.status==='complete') throw new Error('Everyone has signed. The signed copy is being locked.');
  if(!['signing','held'].includes(g.status)) throw new Error("Signing isn't open, so there is nothing to undo");
  if(s.finished_at) throw new Error('You have finished signing, so your turn is closed. Tim can start the round again if something needs changing');
  if(OE().filter(e=>e.offer_id===g.offer_id&&e.kind==='sign_undone'&&(e.detail||{}).signing_id===g.id&&(e.detail||{}).signer===s.position&&Date.parse(e.at)>Date.now()-36e5).length>=30) throw new Error('You have undone a lot in the last hour. Please call Tim on 027 562 7207');
  const myT=liveTaps().filter(x=>x.signer_id===s.id), myM=liveMarks().filter(m=>m.signer_id===s.id); let taps=[], marks=[];
  if(scope==='last'){ const all=myT.map(x=>({k:'tap',x,at:x.at,ref:String(x.id).padStart(20,'0')})).concat(myM.map(m=>({k:'change',x:m,at:m.at,ref:m.id}))).sort((a,z)=>a.at<z.at?1:a.at>z.at?-1:(a.ref<z.ref?1:-1));
    if(!all.length) throw new Error('There is nothing of yours to undo on this round'); if(all[0].k==='tap') taps=[all[0].x]; else marks=[all[0].x]; }
  else { taps=myT; marks=myM; if(!taps.length&&!marks.length&&!(clear&&sgInk(s).sig_png)) throw new Error('There is nothing of yours to undo on this round'); }
  const ids=marks.map(m=>m.id); if(liveMarks().some(r=>r.kind==='reinstate'&&ids.includes(r.target)&&!ids.includes(r.id))) throw new Error("Someone has reinstated that since, so it can't be undone here. Ask Tim to start the round again");
  taps.forEach(x=>OSU().push({id:OSU().length+1,signing_id:g.id,signer_id:s.id,tap_id:x.id,mark_id:null,action:'undo',scope,by_name:by,at:now()}));
  marks.forEach(m=>OSU().push({id:OSU().length+1,signing_id:g.id,signer_id:s.id,tap_id:null,mark_id:m.id,action:'undo',scope,by_name:by,at:now()}));
  let cleared=false; if(scope==='turn'&&clear&&sgInk(s).sig_png){ OSD().push({id:OSD().length+1,signing_id:g.id,signer_id:s.id,sig_png:null,init_png:null,by_name:by,at:now()}); cleared=true; }
  if(g.status==='held'&&!liveMarks().some(m=>m.signing_id===g.id&&!liveReviews().some(r=>r.signing_id===g.id&&(r.marks||[]).includes(m.id)))) g.status='signing';
  sgEv(g,by,'sign_undone',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',signer:s.position,scope,taps:taps.length,places:taps.map(x=>x.place_id),changes:marks.length,change_ids:ids,change_kinds:marks.map(m=>m.kind),ink_cleared:cleared});
  if(marks.length) voidStaleReopened(g.id,by);
  const req=sgRequired(g,s.position); return {scope,taps:taps.length,changes:marks.length,ink_cleared:cleared,done:liveTaps().filter(x=>x.signer_id===s.id&&req.includes(x.place_id)).length,of:req.length}; }
// 026: "please initial the change" drafts that no longer ask for anything (offer_mail_void_stale_reopened): set aside, never removed
function voidStaleReopened(gid,by){ OMD().filter(m=>m.signing_id===gid&&m.kind==='reopened'&&m.status==='draft').forEach(m=>{ const s=OSR().find(x=>x.id===m.signer_id); if(!s) return;
  const owed=liveMarks().some(k=>k.signing_id===gid&&k.at<=m.created_at&&!liveTaps().some(l=>l.signer_id===s.id&&l.place_id===`chg:${k.id}:s${s.position}`)); if(owed) return;
  Object.assign(m,{status:'void',void_at:now(),void_by:by||'system',void_reason:'The change it asked them to initial was undone'}); OE().push({id:OE().length+1,property_id:m.property_id,offer_id:m.offer_id,at:now(),actor:by||'system',kind:'mail_set_aside',detail:{draft_id:m.id,kind:m.kind,reason:'change undone'}}); }); }
// 026: a held confirmation settles itself when the agreement is made (completed, or superseded) or the offer is withdrawn (discarded)
function holdSettle(oid,how,by,ag){ OCH().filter(x=>x.offer_id===oid&&!x.resolved_at).forEach(x=>Object.assign(x,{resolved_at:now(),resolved_by:by,resolved_as:how==='withdrawn'?'discarded':(x.round_id===ag.round_id&&x.accepted_at===ag.accepted_at&&x.date_text===ag.date_text?'completed':'superseded'),resolve_note:how==='withdrawn'?'The offer was withdrawn':null})); }
const sgTry=f=>{ try{ const r=f(); save(); return ok(r===undefined?null:r); }catch(e){ save(); return bad(e.message); } };
// ── emails as drafts (mirrors 024: offer_mail_drafts, offer_mail_log and their functions) ──
const OMD=()=>(DB.offer_mail_drafts||=[]), OML=()=>(DB.offer_mail_log||=[]);
const lowAll=a=>(a||[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);
// 030 after review: each side's own addresses (Tim's own never a party's; the offer's lawyer email isn't the purchasers' own)
const agentOwnE=()=>AGENTS.concat([OSET().agent_email]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);
function vendorOwnE(offerId){ const o=PO().find(x=>x.id===offerId)||{}; return lowAll([...(DB.property_people||[]).filter(x=>x.property_id===o.property_id).map(x=>x.email),
  ...(DB.agreement_people||[]).filter(x=>(DB.agreements||[]).some(a=>a.id===x.agreement_id&&a.property_id===o.property_id)).map(x=>x.email),
  ...OSR().filter(x=>{ const g=OSG().find(y=>y.id===x.signing_id); return g&&g.offer_id===offerId&&g.side==='vendor'; }).map(x=>x.email)]).filter(e=>!agentOwnE().includes(e)); }
function purchaserOwnE(offerId){ const d=(PO().find(x=>x.id===offerId)||{}).details||{}, law=String((d.lawyer||{}).email||'').trim().toLowerCase();
  return lowAll([d.email,...(d.purchasers||[]).map(q=>q.email)]).filter(e=>e!==law&&!agentOwnE().includes(e)); }
function mailAllowed(offerId,kind,signerId){ const o=PO().find(x=>x.id===offerId); if(!o) return [];
  if(kind==='sign_link'||kind==='reopened'){ const sr=OSR().find(x=>x.id===signerId), g=sr&&OSG().find(x=>x.id===sr.signing_id); return sr&&g&&g.offer_id===offerId?lowAll([sr.email]):[]; }
  const d=o.details||{};
  // 030 (Agreed emails filled in): also the purchasers' lawyer's email and email for notices on the agreed draft's contact page
  if(kind==='agreed_purchasers'){ const ag=OAG().find(x=>x.offer_id===offerId), doc=ag&&ODC().find(x=>x.id===ag.document_id), dr=doc&&DB.offer_drafts.find(x=>x.id===doc.draft_id);
    return lowAll([d.email,...(d.purchasers||[]).map(q=>q.email),(d.lawyer||{}).email,...lowAll(((dr&&dr.placed)||[]).filter(x=>['pl_email','pl_service'].includes(x.id)).map(x=>x.text)).filter(e=>!vendorOwnE(offerId).includes(e))]).filter(x=>x.indexOf('@')>0); }
  if(kind==='agreed_vendors'){ const ag=OAG().find(x=>x.offer_id===offerId), doc=ag&&ODC().find(x=>x.id===ag.document_id), dr=doc&&DB.offer_drafts.find(x=>x.id===doc.draft_id), ags=(DB.agreements||[]).filter(x=>x.property_id===o.property_id).map(x=>x.id);
    const inForce=(DB.agreements||[]).filter(x=>x.property_id===o.property_id&&['signed','countersigned'].includes(x.status)).sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at)))[0];   // 024: the vendor signers and the lawyer of the agreement in force
    const po=purchaserOwnE(offerId);   // 030 after review: the vendors' lawyer is never a purchaser's own address
    return lowAll([...OSR().filter(x=>{ const g=OSG().find(y=>y.id===x.signing_id); return g&&g.offer_id===offerId&&g.side==='vendor'&&!x.void_at; }).map(x=>x.email),...lowAll((DB.lawyer_links||[]).filter(x=>inForce&&x.agreement_id===inForce.id).map(x=>x.email)).filter(e=>!po.includes(e)),
      ...lowAll(((dr&&dr.placed)||[]).filter(x=>['vl_email','vl_service'].includes(x.id)).map(x=>x.text)).filter(e=>!po.includes(e))]).filter(x=>x.indexOf('@')>0); }
  if(kind==='withdraw_party'||kind==='withdraw_lawyer'){ let side=wdSide(offerId); if(!side) return []; if(kind==='withdraw_lawyer') side=side==='vendor'?'purchaser':'vendor'; const party=kind==='withdraw_party';
    if(side==='purchaser') return lowAll([party&&d.email,...(party?(d.purchasers||[]).map(q=>q.email):[]),(d.lawyer||{}).email]).filter(x=>x.indexOf('@')>0);
    const inForce=(DB.agreements||[]).filter(x=>x.property_id===o.property_id&&['signed','countersigned'].includes(x.status)).sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at)))[0];
    const dr=(DB.offer_drafts||[]).filter(x=>x.offer_id===offerId).sort((x,y)=>y.number-x.number)[0];
    return lowAll([...(party?OSR().filter(x=>{ const g=OSG().find(y=>y.id===x.signing_id); return g&&g.offer_id===offerId&&g.side==='vendor'; }).map(x=>x.email):[]),...(party?(DB.property_people||[]).filter(x=>x.property_id===o.property_id&&x.role==='owner').map(x=>x.email):[]),...(DB.lawyer_links||[]).filter(x=>inForce&&x.agreement_id===inForce.id).map(x=>x.email),
      ...((dr&&dr.placed)||[]).filter(x=>['vl_email','vl_service'].includes(x.id)).map(x=>x.text)]).filter(x=>x.indexOf('@')>0); }
  return []; }
const wdSide=offerId=>((OHD().filter(h=>h.offer_id===offerId&&h.kind==='withdraw').sort((x,y)=>String(y.made_at).localeCompare(String(x.made_at)))[0])||{}).side||null;
// the other side's own phone or email (024 offer_mail_side_hit): forbid 'vendor' in anything to the purchasers, 'purchaser' in anything to the vendors
function mailSideHit(offerId,forbid,text){ const o=PO().find(x=>x.id===offerId); if(!o) return null; const d=o.details||{}, law=String((d.lawyer||{}).email||'').toLowerCase(), D=window.DRAFT;
  const own=forbid==='purchaser'?[{who:'a purchaser',email:d.email,phone:d.phone}].concat((d.purchasers||[]).map(q=>({who:'a purchaser',email:q.email,phone:q.phone})))
    :(DB.property_people||[]).filter(x=>x.property_id===o.property_id).map(x=>({who:'a vendor',email:x.email,phone:x.phone})).concat((DB.agreement_people||[]).filter(x=>(DB.agreements||[]).some(a=>a.id===x.agreement_id&&a.property_id===o.property_id)).map(x=>({who:'a vendor',email:x.email,phone:x.phone})))
      .concat(OSR().filter(x=>{ const g=OSG().find(y=>y.id===x.signing_id); return g&&g.offer_id===offerId&&g.side==='vendor'; }).map(x=>({who:'a vendor',email:x.email,phone:null})));
  // 025: the agent's own contact details are never a party's, even where the agent is the party (Tim selling his own property)
  const st_=OSET(), ownE=AGENTS.concat([st_.agent_email]).map(x=>String(x||'').trim().toLowerCase()), ownP=D?D.nsn(st_.agent_phone):'';
  const keep=own.map(x=>Object.assign({},x,{email:ownE.includes(String(x.email||'').trim().toLowerCase())?null:x.email,phone:D&&ownP&&D.nsn(x.phone)===ownP?null:x.phone}));
  return D?D.holdsOwn(text,D.ownContacts(keep.filter(x=>String(x.email||'').toLowerCase()!==law||!law))):null; }
const mailSide=(kind,signerId,offerId)=>kind==='agreed_purchasers'?'purchaser':kind==='agreed_vendors'?'vendor':kind==='withdraw_party'?wdSide(offerId):kind==='withdraw_lawyer'?({vendor:'purchaser',purchaser:'vendor'})[wdSide(offerId)]:((OSG().find(g=>g.id===(OSR().find(x=>x.id===signerId)||{}).signing_id))||{}).side||'purchaser';
function mailCheck(offerId,kind,signerId,to,cc,subject,body,sending){ const allowed=mailAllowed(offerId,kind,signerId);
  if(sending&&(String(subject||'')+' '+String(body||'')).indexOf('[Tim to')>=0) throw new Error('Fill or delete the marked blanks first.');
  if(!(to||[]).length||(to||[]).length+(cc||[]).length>12) throw new Error('Choose who it goes to');
  for(const x of (to||[]).concat(cc||[])) if(!allowed.includes(String(x).trim().toLowerCase())) throw new Error(`It can only go to the people on this side of the offer and their lawyer (${x} isn't one)`);
  if((kind==='sign_link'||kind==='reopened')&&(cc||[]).length) throw new Error('A signing email goes to its signer alone');
  if(!String(subject||'').trim()||String(subject).length>300) throw new Error('The subject needs 1 to 300 characters');
  if(!String(body||'').trim()||String(body).length>30000) throw new Error('The email needs some words (up to 30,000 characters)');
  if(kind==='sign_link'&&String(body).indexOf('[the signing link]')<0) throw new Error('Keep [the signing link] in the email: the personal link goes there when it is sent');
  const who=mailSideHit(offerId,mailSide(kind,signerId,offerId)==='vendor'?'purchaser':'vendor',subject+' '+body); if(who) throw new Error(`This email holds ${who}'s own phone or email. Each side sees only their own details and both lawyers'`); }
function mailInsert(actor,a){ const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); let g=null, ag=null;
  if(a.p_kind==='sign_link'||a.p_kind==='reopened'){ const sr=OSR().find(x=>x.id===a.p_signer); g=sr&&OSG().find(x=>x.id===sr.signing_id); if(!sr||!g||g.offer_id!==o.id) throw new Error('No such signer on this offer');
    if(g.method!=='link') throw new Error('This signer signs in person, on your device'); if(sr.void_at) throw new Error("This signer's version was replaced"); const w=sgCurrent(g); if(w) throw new Error(w);
    if(a.p_kind==='sign_link'&&(sr.finished_at||!['ready','signing'].includes(g.status))) throw new Error('Signing is held or finished, so no link is sent'); }
  else if(a.p_kind==='agreed_purchasers'||a.p_kind==='agreed_vendors'){ ag=OAG().find(x=>x.offer_id===o.id); if(!ag) throw new Error("The agreement hasn't been made yet");
    const at=a.p_attach||{}; if(at.path!==ag.path||at.sha256!==ag.sha256||!at.name||at.name.length<5) throw new Error('Attach the agreed copy'); }
  else if(a.p_kind==='withdraw_party'||a.p_kind==='withdraw_lawyer'){ if(!wdSide(o.id)) throw new Error('Record the withdrawal first'); if(a.p_signer||a.p_attach) throw new Error('A withdrawal email has no link or attachment'); }
  else throw new Error('Choose what kind of email it is');
  mailCheck(o.id,a.p_kind,a.p_signer||null,a.p_to,a.p_cc||[],a.p_subject,a.p_body);
  OMD().filter(m=>m.offer_id===o.id&&m.kind===a.p_kind&&m.status==='draft'&&(m.signer_id||null)===(a.p_signer||null)).forEach(m=>Object.assign(m,{status:'void',void_at:now(),void_by:actor,void_reason:'A newer draft replaced it'}));
  const m={id:uid(),offer_id:o.id,property_id:o.property_id,signing_id:g?g.id:null,signer_id:a.p_signer||null,agreement_id:ag?ag.id:null,kind:a.p_kind,to_addr:a.p_to,cc_addr:a.p_cc||[],subject:a.p_subject,body:a.p_body,attach:ag?a.p_attach:null,status:'draft',reviewed_at:null,reviewed_by:null,created_at:now(),created_by:actor,edited_at:null,sent_at:null,sent_by:null};
  OMD().push(m); OE().push({id:OE().length+1,property_id:o.property_id,offer_id:o.id,at:now(),actor,kind:'mail_drafted',detail:{draft_id:m.id,kind:m.kind,signing_id:m.signing_id,to:(m.to_addr||[]).length,cc:(m.cc_addr||[]).length}}); return m.id; }
// 029 (signing: places, chattels initials and four more marks): a signer's own initials, name or signature is checked by Tim in Round 1
// but initialled by nobody, and from Round 2 on it is not a change. Every new mark sits inside the page, clear of the date place and of
// other signers' places (guard_offer_mark_place); a side signing the whole agreement initials inside the chattels box (guard_offer_signing_chattels).
const OWN_K=['own_initials','own_name','own_signature'], isOwnK=k=>OWN_K.includes(k);
function chattelsRectOf(draftId){ const d=(DB.offer_drafts||[]).find(x=>x.id===draftId), m=d&&(DB.offer_blank_maps||[]).find(x=>x.id===d.map_id); return m?window.SIGN.chattelsArea(m.places||[]):null; }
function chattelsCheck(g){ const whole=(g.round_no||1)===1||!ORN().some(r=>r.document_id===g.document_id&&r.side===(g.side||'purchaser'))||!!OSET().resign_every_round; if(!whole) return;
  const cr=chattelsRectOf(g.draft_id); if(!cr) throw new Error('The places on the blank have no chattels area, so nobody can initial the chattels. Add the chattels area to the places on the blank, then load it again');
  [...new Set(g.places.filter(e=>e.kind==='signature'&&e.why==='block').map(e=>e.signer))].forEach(sn=>{ if(!g.places.some(e=>e.signer===sn&&e.kind==='initial'&&window.SIGN.insideOf(e,cr))) throw new Error(`Please check the signing places: everyone initials the chattels, inside the chattels box (signer ${sn} has no initials there)`); }); }
const ovl=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
function hitsDate(draftId,page,rc){ const dp=datePlaceOf(draftId); if(!dp||dp.page!==page) return false; const d={x:dp.x,y:dp.y-2,w:dp.w||100,h:(dp.h||10)+2}; return ovl(d,rc)>0; }
function ownOk(kind,g,w,h){ const num=(v,lo,hi)=>typeof v==='number'&&v>=lo&&v<=hi; if(!g||typeof g!=='object'||!isOwnK(kind)) return false;
  if(!(num(g.x,0,w)&&num(g.y,0,h)&&num(g.w,8,400)&&num(g.h,4,160))||g.x+g.w>w||g.y+g.h>h) return false; if(kind==='own_initials'&&(g.w>200||g.h>100)) return false;
  if(kind==='own_name'&&(typeof g.text!=='string'||!num(g.size,6,14)||g.h>60)) return false; if(kind==='own_name'&&g.w<g.text.length*g.size*0.35) return false; return JSON.stringify(g).length<=2000; }
function insOk(g,w,h){ return !!g&&typeof g.text==='string'&&g.text.trim().length>=1&&g.text.length<=300&&g.text===g.text.trim()&&!/[\u0001-\u001F\u007F]/.test(g.text)&&g.x>=0&&g.x<=w&&g.y>=0&&g.y<=h&&g.size>=6&&g.size<=14; }
// guard_offer_mark_place, as the trigger runs it before every mark of these kinds goes in
function markPlaceGuard(g,s,m){ if(!['insert',...OWN_K].includes(m.kind)) return; const [w,h]=g.pages[m.page-1]||[0,0], geo=m.geometry||{};
  if(isOwnK(m.kind)){ if(!ownOk(m.kind,geo,w,h)) throw new Error("That doesn't sit on the page. Put it inside the page"); const ink=sgInk(s);
    if(m.kind==='own_initials'&&m.ink_png!==ink.init_png) throw new Error('Only your own initials, as you drew them, can be added');
    if(m.kind==='own_signature'&&m.ink_png!==ink.sig_png) throw new Error('Only your own signature, as you drew it, can be added');
    if(m.kind==='own_name'&&geo.text!==s.name) throw new Error('Only your own name, exactly as it is on the agreement, can be added'); }
  else if(!insOk(geo,w,h)) throw new Error("That doesn't sit on the page");
  const rc=isOwnK(m.kind)?{x:geo.x,y:geo.y,w:geo.w,h:geo.h}:chgRect(m.kind,geo);
  if(hitsDate(g.draft_id,m.page,rc)) throw new Error('That is where the date goes once the agreement is made. Put it somewhere else');
  const docSigns=g.document_id?ORN().filter(r=>r.document_id===g.document_id).map(r=>r.signing_id):[];
  const pls=sgAllPlaces(g).filter(e=>e.signer!==s.position).concat(isOwnK(m.kind)?docSigns.flatMap(id=>sgAllPlaces(OSG().find(x=>x.id===id))):[]);
  if(pls.some(e=>e.page===m.page&&ovl(e,rc)>0.5)) throw new Error("That would sit on someone else's place to sign or initial. Put it in a clear space"); }
// offer_sign_do_mark: added text (Round 1) or a signer's own initials, name or signature (any round), in person or by link
// by link in Round 1 the note, line, cross and reinstatement too, checked as on Tim's screen (Tim, 26 November 2026)
function sgDoMark(s,kind,page,geo,net,link,target){ const old_=['note','strike','cross','reinstate'].includes(kind); if(!['insert',...OWN_K].includes(kind)&&!(old_&&link)) throw new Error('Choose what to add');
  if(kind!=='reinstate'&&target) throw new Error('Only a reinstatement points at another mark'); let g=OSG().find(x=>x.id===s.signing_id);
  if((g.round_no||1)>1&&(kind==='insert'||old_)) throw new Error('In a counteroffer, that is a change: use the change tools');
  if((g.round_no||1)>1) g=sgReady(s,false);
  else { if(holdActive(g.offer_id)) throw new Error(NEUTRAL_STOP); if(s.void_at) throw new Error('This version has been replaced. Tim will send you the new one.'); const w=sgCurrent(g); if(w) throw new Error(w);
    if(ORQ().some(r=>r.signer_id===s.id&&!r.handled_at)) throw new Error(ASKED_STOP); if(!['signing','held'].includes(g.status)) throw new Error("Signing isn't open"); if(s.finished_at) throw new Error('You have finished signing. Thank you.'); }
  if((g.method==='link')!==!!link) throw new Error('Please try that again'); if(!s.consent_at) throw new Error('Agree to sign electronically first');
  const ink=sgInk(s); if(isOwnK(kind)&&(!ink.sig_png||!ink.init_png)) throw new Error('Draw your signature and initials first');
  if(OSM().filter(m=>m.signer_id===s.id&&Date.parse(m.at)>Date.now()-36e5).length>=30) throw new Error('You have marked the page a lot in the last hour. Please call Tim on 027 562 7207');
  if(link){ if(hits('sign_change',net,null,36e5)>=60) throw new Error('A lot of changes have been made from here in the last hour. Please call Tim on 027 562 7207'); OH().push({at:now(),kind:'sign_change',net}); }
  if(!(page>=1&&page<=g.pages.length)) throw new Error("That page isn't in the document"); const [w,h]=g.pages[page-1];
  if(old_){ if(!window.SIGN.markOk({kind,geometry:geo,target:kind==='reinstate'?target||'x':null},{w,h})) throw new Error("That mark doesn't sit on the page");
    if(kind==='reinstate'){ const t=liveMarks().find(x=>x.id===target&&x.signing_id===g.id); if(!t||!['strike','cross'].includes(t.kind)) throw new Error('Choose a line or crossed-out box to reinstate'); if(liveMarks().some(x=>x.target===t.id&&x.kind==='reinstate')) throw new Error('That has already been reinstated'); } }
  else if(kind==='insert'){ if(!insOk(geo,w,h)) throw new Error("That doesn't sit on the page"); const who=privateHit(PO().find(x=>x.id===g.offer_id),geo.text); if(who) throw new Error(`Those words hold ${who}'s own phone or email, so they can't go on the agreement. Only the lawyers' details go on it`); }
  else if(!ownOk(kind,geo,w,h)) throw new Error("That doesn't sit on the page. Put it inside the page");
  const m={id:uid(),signing_id:g.id,signer_id:s.id,by_name:s.name,kind,page,geometry:geo,target:kind==='reinstate'?target:null,at:now(),ink_png:kind==='own_initials'?ink.init_png:kind==='own_signature'?ink.sig_png:null};
  markPlaceGuard(g,s,m); OSM().push(m);
  if((g.round_no||1)===1){ g.status='held'; g.held_at=now(); sgEv(g,s.name,'sign_marked',{signing_id:g.id,mark_id:m.id,kind,page,signer:s.position,target:m.target,by_link:!!link,text:['insert','own_name','strike'].includes(kind)?geo.text:null}); }
  else sgEv(g,s.name,'sign_own_mark',{signing_id:g.id,round:g.round_no,side:g.side,mark_id:m.id,kind,page,signer:s.position,by_link:!!link,text:kind==='own_name'?geo.text:null});
  return {id:m.id,held:(g.round_no||1)===1,name:s.name,round:g.round_no||1,side:g.side||'purchaser',kind,page,address:(PT().find(x=>x.id===g.property_id)||{}).address}; }
// Tim's own changes to the places (offer_places_edits_ok), recorded on the round's timeline (sign_places_edited)
// (the database also keeps a later round's places off a signer's own marks from earlier rounds: ownClearCheck, as guard_offer_signing_own_clear)
const docOwnMarks=docId=>{ const sig=ORN().filter(r=>r.document_id===docId).map(r=>r.signing_id); return liveMarks().filter(m=>sig.includes(m.signing_id)&&isOwnK(m.kind)); };
function ownClearCheck(pl,docId){ if(!docId) return; const om=docOwnMarks(docId); if(pl.some(x=>om.some(m=>m.page===x.page&&ovl(x,{x:m.geometry.x,y:m.geometry.y,w:m.geometry.w,h:m.geometry.h})>0.5))) throw new Error("A signing place would cover a signer's own initials, name or signature from an earlier round. Move it to a clear space"); }
function placesEditsOk(pl,e,draftId,docId){ e=e||{}; if(typeof e!=='object'||JSON.stringify(e).length>60000) throw new Error('Please check the places you changed'); const A=e.added||[], M=e.moved||[], R=e.removed||[];
  ownClearCheck(pl,docId);
  A.concat(M).forEach(id=>{ const q=pl.find(x=>x.id===id); if(!q) throw new Error("Please check the places you changed: one of them isn't in the list"); if(hitsDate(draftId,q.page,q)) throw new Error('That is where the date goes once the agreement is made. Put the place somewhere else');
    if(pl.some(y=>y.signer!==q.signer&&y.page===q.page&&ovl(y,q)>0.5)) throw new Error("A place you added or moved sits on another signer's place. Put it in a clear space"); });
  A.forEach(id=>{ if(!/^ack:tim[A-Za-z0-9-]{1,60}:s[0-9]{1,2}$/.test(id)) throw new Error('Please check the places you added'); });
  R.forEach(x=>{ if(!x||typeof x!=='object'||String(x.id||'').length<3||String(x.id).length>140||String(x.label||'').length>400||pl.some(q=>q.id===x.id)) throw new Error('Please check the places you removed'); });
  const byWhy={}; pl.forEach(x=>{ byWhy[x.why]=(byWhy[x.why]||0)+1; });
  return {added:A,moved:M,removed:R,checked:{sent_sha256:shaS(JSON.stringify(pl)),sent:pl.length,sent_by_why:byWhy,added_or_moved_clear:A.length+M.length,removed_absent:R.length,own_marks_kept_clear:docId?docOwnMarks(docId).length:0,
    proposed_sha256_screen:/^[0-9a-f]{64}$/.test(String(e.proposed_sha256||''))?e.proposed_sha256:null,proposed_screen:typeof e.proposed==='number'?e.proposed:null}}; }
function placesEditedEv(r,ed,me){ if(r.existing||!(ed.added.length+ed.moved.length+ed.removed.length)) return; const g=OSG().find(x=>x.id===r.id);
  sgEv(g,me.email,'sign_places_edited',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',added:ed.added.length,moved:ed.moved.length,removed:ed.removed.length,added_ids:ed.added,moved_ids:ed.moved,removed_places:ed.removed,places_sha256:g.places_sha256,checked:ed.checked}); }
function signRpc(name,a,me){ if(!me||!AGENTS.includes(me.email)) return bad('Only Tim can do this');
  const person=id=>{ const s=OSR().find(x=>x.id===id); if(!s) throw new Error('No such signer'); const g_=OSG().find(g=>g.id===s.signing_id); if(g_.method!=='in_person') throw new Error('This purchaser signs by their own link'); if(s.void_at||['cancelled','replaced','withdrawn'].includes(g_.status)) throw new Error('This signing has stopped, so this turn is closed'); return s; };
  if(name==='agent_mail_draft_add') return sgTry(()=>mailInsert(me.email,a));
  if(name==='agent_mail_draft_unstick') return sgTry(()=>{ const m=OMD().find(x=>x.id===a.p_draft); if(!m) throw new Error('No such email'); if(m.status!=='sending') throw new Error("This email isn't waiting on a send");
    OML().filter(l=>l.draft_id===m.id&&l.status==='pending').forEach(l=>Object.assign(l,{status:'unconfirmed',error:'Tim checked it had not arrived',done_at:now()})); Object.assign(m,{status:'draft',reviewed_at:null}); return null; });
  if(name==='agent_mail_draft_edit') return sgTry(()=>{ const m=OMD().find(x=>x.id===a.p_draft); if(!m) throw new Error('No such email'); if(m.status!=='draft') throw new Error('This email was sent or set aside, so it is kept as it was');
    mailCheck(m.offer_id,m.kind,m.signer_id,a.p_to,a.p_cc||[],a.p_subject,a.p_body); Object.assign(m,{to_addr:a.p_to,cc_addr:a.p_cc||[],subject:a.p_subject,body:a.p_body,edited_at:now(),edited_by:me.email,reviewed_at:null,reviewed_by:null});
    OE().push({id:OE().length+1,property_id:m.property_id,offer_id:m.offer_id,at:now(),actor:me.email,kind:'mail_edited',detail:{draft_id:m.id,kind:m.kind}}); return null; });
  if(name==='agent_mail_draft_review') return sgTry(()=>{ const m=OMD().find(x=>x.id===a.p_draft); if(!m) throw new Error('No such email'); if(m.status!=='draft') throw new Error('This email was sent or set aside, so it is kept as it was'); Object.assign(m,{reviewed_at:a.p_reviewed?now():null,reviewed_by:a.p_reviewed?me.email:null}); return null; });
  if(name==='agent_mail_draft_void') return sgTry(()=>{ const m=OMD().find(x=>x.id===a.p_draft); if(!m) throw new Error('No such email'); if(m.status!=='draft') throw new Error('This email was sent or set aside, so it is kept as it was'); Object.assign(m,{status:'void',void_at:now(),void_by:me.email,void_reason:a.p_reason||null});
    OE().push({id:OE().length+1,property_id:m.property_id,offer_id:m.offer_id,at:now(),actor:me.email,kind:'mail_set_aside',detail:{draft_id:m.id,kind:m.kind}}); return null; });
  if(name==='agent_signing_turn_ok'){ const s=OSR().find(x=>x.id===a.p_signer), g=s&&OSG().find(x=>x.id===s.signing_id); return ok(!!(s&&g&&g.id===a.p_signing&&g.offer_id===a.p_offer&&g.property_id===a.p_property&&g.method==='in_person'&&!s.void_at)); }
  if(name==='agent_offer_chain_check') return ok(window.SIGN.verifyChain(OE().filter(e=>e.offer_id===a.p_offer)));
  if(name==='agent_signing_release') return sgTry(()=>{ if(!['in_person','link'].includes(a.p_method)) throw new Error('Choose in person or by link');
    const d=(DB.offer_drafts||[]).find(x=>x.id===a.p_draft); if(!d) throw new Error('No such draft'); const o=PO().find(x=>x.id===d.offer_id);
    if(holdActive(o.id)) throw new Error('This offer is frozen or withdrawn, so nothing is released for signing. Unfreeze it first; a withdrawn offer is never signed again');
    if(!(DB.offer_draft_approvals||[]).some(x=>x.draft_id===d.id&&x.sha256===d.sha256)) throw new Error('Approve the draft first');
    if(d.number!==Math.max(...DB.offer_drafts.filter(x=>x.offer_id===d.offer_id).map(x=>x.number))) throw new Error('There is a newer draft of this offer. Use that one');
    if(!same(o.details,d.details)) throw new Error('The offer has changed since this draft. Re-draft and approve it first');
    { const ft=(d.placed||[]).find(x=>x.id==='further_terms'); if(!(d.edits&&'term_last' in d.edits)||(ft&&(ft.terms||[]).length&&!(ft.term_boxes||[]).length)) throw new Error('This draft was made before signing was added. Make a fresh draft from the offer, then choose Ready to sign.'); }   // 024: drafts from before the numbering
    if(['withdrawn','lapsed','declined'].includes(o.status)) throw new Error('This offer has been withdrawn, declined or has lapsed');
    if(ODC().some(x=>x.offer_id===o.id&&['open','agreed'].includes(x.status))) throw new Error('This offer already has a signed Round 1. For a fresh copy, close the current document first');
    if(ODC().some(x=>x.draft_id===d.id)) throw new Error('That draft belongs to a closed document. Re-draft the offer for a fresh copy');
    const ex=OSG().find(g=>g.draft_id===d.id&&(g.round_no||1)===1&&!['cancelled','withdrawn'].includes(g.status)); if(ex) return {id:ex.id,existing:true};
    const ppl=d.details.purchasers||[], n=ppl.length; if(n<1||n>12) throw new Error('The offer needs 1 to 12 purchasers');
    const pages=a.p_pages; if(!Array.isArray(pages)||!pages.length||pages.length>400||pages.some(s=>!Array.isArray(s)||s.length!==2||!(s[0]>=50&&s[0]<=5000)||!(s[1]>=50&&s[1]<=5000))) throw new Error('Please check the page sizes');
    if(!sgPlacesOk(a.p_places,pages,n,true)) throw new Error('Please check the signing places: every purchaser needs a signature and initials at the foot of every page');
    const cca=[...new Set((a.p_cca_pages||[]))].sort((x,y)=>x-y); if(cca.some(x=>x<1||x>pages.length)) throw new Error('Please check the acknowledgement pages');
    if(a.p_method==='link') ppl.forEach((p,i)=>{ const em=String(p.email||'').trim().toLowerCase(); if(!em||!/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(em)) throw new Error(`Purchaser ${i+1} has no email to send a link to. Add it with Correct details, or sign in person`);
      if(ppl.filter(q=>String(q.email||'').trim().toLowerCase()===em).length>1) throw new Error('Two purchasers have the same email. Each needs their own to sign by link'); });
    const g={id:uid(),offer_id:o.id,property_id:o.property_id,draft_id:d.id,draft_sha256:d.sha256,method:a.p_method,pages,places:JSON.parse(JSON.stringify(a.p_places)),places_sha256:shaS(JSON.stringify(a.p_places)),cca_pages:cca,status:'ready',round_no:1,side:'purchaser',document_id:null,base_round_id:null,released_by:me.email,released_at:now(),sent_at:null,held_at:null,completed_at:null,locked_at:null,replaced_at:null,replaced_by:null};
    chattelsCheck(g); OSG().push(g); ppl.forEach((p,i)=>OSR().push({id:uid(),signing_id:g.id,position:i+1,name:([p.first,p.last].map(x=>String(x||'').trim()).filter(Boolean).join(' ')||'Purchaser '+(i+1)).slice(0,250),email:String(p.email||'').trim().toLowerCase()||null,
      token_hash:null,link_sent_at:null,link_expires_at:null,code_hash:null,code_expires_at:null,code_tries:0,codes_sent:0,codes_window_at:null,session_hash:null,session_expires_at:null,opened_at:null,verified_at:null,consent_at:null,sig_png:null,init_png:null,marks_at:null,id_sighted:null,witnessed_by:null,finished_at:null,seen_sha256:null,user_agent:null,net_hash:null,void_at:null}));
    OSG().filter(x=>x.offer_id===o.id&&x.id!==g.id&&['ready','signing','held','complete'].includes(x.status)).forEach(x=>{ const c=OSR().filter(s=>s.signing_id===x.id&&s.finished_at).length;
      OSR().filter(s=>s.signing_id===x.id).forEach(s=>Object.assign(s,{void_at:now(),token_hash:null,session_hash:null,code_hash:null})); Object.assign(x,{status:'replaced',replaced_at:now(),replaced_by:g.id}); sgEv(x,me.email,'sign_replaced',{signing_id:x.id,replaced_by:g.id,finished:c}); });
    sgEv(g,me.email,'sign_released',{signing_id:g.id,draft_id:d.id,number:d.number,sha256:d.sha256,method:g.method,signers:n,places:g.places.length,places_sha256:g.places_sha256,cca_pages:cca});
    return {id:g.id,existing:false}; });
  if(name==='agent_signing_cancel') return sgTry(()=>{ const g=OSG().find(x=>x.id===a.p_signing); if(!g) throw new Error('No such signing'); if(!['ready','signing'].includes(g.status)) throw new Error(`This signing can't be changed now (${g.status})`);
    const who=OSR().filter(s=>s.signing_id===g.id&&(s.consent_at||OST().some(t=>t.signer_id===s.id))).map(s=>s.name); if(who.length) throw new Error(`${who.join(', ')} ${who.length>1?'have':'has'} started signing, so how they sign can't be changed. To start again, correct the offer and re-draft it`);
    OSR().filter(s=>s.signing_id===g.id).forEach(s=>Object.assign(s,{void_at:now(),token_hash:null,session_hash:null,code_hash:null})); g.status='cancelled';
    sgEv(g,me.email,'sign_cancelled',{signing_id:g.id,method:g.method,links_sent:!!g.sent_at,reason:String(a.p_reason||'').trim().slice(0,300)||null}); return {ok:true,draft_id:g.draft_id}; });
  if(name==='agent_signing_start') return sgTry(()=>{ const g=OSG().find(x=>x.id===a.p_signing); if(!g) throw new Error('No such signing'); if(g.method!=='in_person') throw new Error('This signing is by link: use Send');
    const w=sgCurrent(g); if(w) throw new Error(w); if(g.status!=='ready') return; g.status='signing'; g.sent_at=now(); sgEv(g,me.email,'sign_started',{signing_id:g.id,method:'in_person'}); });
  if(name==='agent_signing_consent') return sgTry(()=>sgConsent(person(a.p_signer),a.p_ua,null));
  if(name==='agent_signing_receipt') return sgTry(()=>sgReceipt(person(a.p_signer),a.p_guide,a.p_version,a.p_file,a.p_sha256,a.p_pages));
  if(name==='agent_signing_marks') return sgTry(()=>sgMarks(person(a.p_signer),a.p_sig,a.p_init));
  if(name==='agent_signing_tap') return sgTry(()=>sgTap(person(a.p_signer),a.p_place));
  // 029 (Tim, 26 November 2026): in person, each turn finishes only once Tim logs the photo ID he checked and ticks that he watched them sign
  if(name==='agent_signing_finish') return bad('Choose the photo ID you checked, and tick that you checked it and watched them sign');
  // or, after a warning, Tim's explicit choice to finish without one ('no_id_warned'); an empty choice is refused (029, 17:57)
  if(name==='agent_signing_finish_checked') return sgTry(()=>{ const s=person(a.p_signer), none=a.p_id_type==='no_id_warned'; if(!none&&!PHOTO_IDS.includes(a.p_id_type)) throw new Error('Choose the photo ID you checked for '+s.name);
    if(a.p_checked!==true) throw new Error(none?`Confirm that you are finishing for ${s.name} without an ID check`:`Tick that you checked ${s.name}'s ID and watched them sign`); const g=OSG().find(x=>x.id===s.signing_id); const r=sgFinish(s,a.p_ua,null,none?null:a.p_id_type,'Tim McGuire');
    if(none){ sgEv(g,me.email,'sign_no_id_check',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',signer:s.position,signer_id:s.id,by:'Tim McGuire',warned:true,note:'Signed in person without an identity check'}); return r; }
    sgEv(g,me.email,'sign_id_checked',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',signer:s.position,signer_id:s.id,id_type:a.p_id_type,checked_by:'Tim McGuire',watched:true}); return r; });
  if(name==='agent_signing_mark') return sgTry(()=>{ const s=person(a.p_signer), g=OSG().find(x=>x.id===s.signing_id);
    if(['insert',...OWN_K].includes(a.p_kind)){ if(a.p_target) throw new Error('Only a reinstatement points at another mark'); return sgDoMark(s,a.p_kind,a.p_page,a.p_geometry,null,false); } if((g.round_no||1)>1) throw new Error('In a counteroffer, use the change tools'); if(s.void_at) throw new Error('This version has been replaced'); const w=sgCurrent(g); if(w) throw new Error(w);
    if(!['signing','held'].includes(g.status)) throw new Error("Signing isn't open"); if(!s.consent_at) throw new Error('Agree to sign electronically first');
    if(!(a.p_page>=1&&a.p_page<=g.pages.length)) throw new Error("That page isn't in the document"); const [w_,h_]=g.pages[a.p_page-1];
    const m={id:uid(),signing_id:g.id,signer_id:s.id,by_name:s.name,kind:a.p_kind,page:a.p_page,geometry:a.p_geometry,target:a.p_kind==='reinstate'?a.p_target:null,at:now()};
    if(!window.SIGN.markOk(m,{w:w_,h:h_})) throw new Error("That mark doesn't sit on the page");
    if(a.p_kind==='reinstate'){ const t=liveMarks().find(x=>x.id===a.p_target&&x.signing_id===g.id); if(!t||!['strike','cross'].includes(t.kind)) throw new Error('Choose a line or crossed-out box to reinstate'); if(liveMarks().some(x=>x.target===t.id&&x.kind==='reinstate')) throw new Error('That has already been reinstated'); }
    else if(a.p_target) throw new Error('Only a reinstatement points at another mark');
    OSM().push(m); g.status='held'; g.held_at=now(); sgEv(g,s.name,'sign_marked',{signing_id:g.id,mark_id:m.id,kind:m.kind,page:m.page,signer:s.position,target:a.p_target||null}); return {id:m.id}; });
  if(name==='agent_signing_review') return sgTry(()=>{ const g=OSG().find(x=>x.id===a.p_signing); if(!g) throw new Error('No such signing'); if(g.status!=='held') throw new Error('Nothing is waiting for you to check'); const w=sgCurrent(g); if(w) throw new Error(w);
    const ms=liveMarks().filter(m=>m.signing_id===g.id&&!liveReviews().some(r=>r.signing_id===g.id&&r.marks.includes(m.id))).map(m=>m.id), n=OSR().filter(s=>s.signing_id===g.id).length, pl=a.p_places||[];
    if(!sgPlacesOk(pl,g.pages,n,false)) throw new Error('Please check the places for the initials');
    const need=ms.filter(id=>!isOwnK((OSM().find(m=>m.id===id)||{}).kind));   // 029: a signer's own mark needs nobody's initials
    if(pl.length!==need.length*n||pl.some(x=>x.why!=='mark'||x.kind!=='initial'||!need.includes(x.ref)||x.id!==`mark:${x.ref}:s${x.signer}`)) throw new Error('Each purchaser initials each mark once');
    OSV().push({id:OSV().length+1,signing_id:g.id,marks:ms,places:JSON.parse(JSON.stringify(pl)),places_sha256:shaS(JSON.stringify(pl)),reviewed_by:me.email,at:now()});
    let re=0; OSR().filter(s=>s.signing_id===g.id&&s.finished_at&&!s.void_at).forEach(s=>{ s.finished_at=null; s.seen_sha256=null; re++; }); g.status='signing';
    sgEv(g,me.email,'sign_reviewed',{signing_id:g.id,marks:ms,places:pl.length,reopened:re}); return {ok:true,marks:ms.length,reopened:re}; });
  if(name==='agent_round_present') return sgTry(()=>roundPresent(a,me));
  if(name==='agent_signing_release_edited'){ let ed; try{ ed=placesEditsOk(a.p_places||[],a.p_edits,a.p_draft,null); }catch(e){ return bad(e.message); }
    return signRpc('agent_signing_release',a,me).then(r=>{ if(r.error) return r; placesEditedEv(r.data,ed,me); save(); return {data:Object.assign({},r.data,{edited:ed}),error:null}; }); }
  if(name==='agent_round_present_edited') return sgTry(()=>{ const doc=ODC().find(x=>x.offer_id===a.p_offer&&x.status==='open'); if(!doc) return roundPresent(a,me);
    const ed=placesEditsOk(a.p_places||[],a.p_edits,doc.draft_id,doc.id), r=roundPresent(a,me); placesEditedEv(r,ed,me); return Object.assign({},r,{edited:ed}); });
  if(name==='agent_round_change') return sgTry(()=>sgChange(person(a.p_signer),a));
  if(name==='agent_offer_layers') return sgTry(()=>{ const doc=ODC().filter(x=>x.offer_id===a.p_offer&&(a.p_document?x.id===a.p_document:['open','agreed'].includes(x.status))).sort((x,y)=>y.number-x.number)[0]; return doc?{document:doc,layers:docLayers(doc.id,1e5)}:{document:null,layers:[]}; });
  if(name==='agent_document_close') return sgTry(()=>{ const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); const doc=ODC().find(x=>x.offer_id===o.id&&x.status==='open'); if(!doc) throw new Error('There is no open document to close');
    const why=String(a.p_reason||'').trim(); if(why.length<3||why.length>500) throw new Error('Say why you are starting a fresh copy (3 to 500 characters)');
    const stopped=stopSignings(o.id,doc.id,me.email,'The document was closed for a fresh copy','cancelled'), rounds=ORN().filter(r=>r.document_id===doc.id).length; docClose(o.id,me.email,why);
    sgEv({property_id:o.property_id,offer_id:o.id},me.email,'document_closed',{document_id:doc.id,document:doc.number,rounds,stopped,reason:why}); return {ok:true,document:doc.number,rounds,stopped}; });
  if(name==='agent_negotiation_withdraw') return sgTry(()=>negWithdraw(a,me));
  function negWithdraw(a,me){ if(!['purchaser','vendor'].includes(a.p_side)) throw new Error('Choose who withdrew: the purchasers or the vendors'); const o=PO().find(x=>x.id===a.p_offer&&x.source!=='manual'); if(!o) throw new Error('No such offer');
    if(OAG().some(x=>x.offer_id===o.id)) throw new Error("The agreement has been made, so it can't be withdrawn here. Talk to the lawyers"); if(['withdrawn','lapsed','declined'].includes(o.status)) throw new Error('This offer has already been withdrawn, declined or has lapsed');
    const at=a.p_at||now(); if(Date.parse(at)>Date.now()+3e5||Date.parse(at)<Date.parse(o.received_at)-6e4) throw new Error('The time needs to be between when the offer came in and now'); if(String(a.p_note||'').length>500) throw new Error('The note is too long');
    const why=a.p_side==='vendor'?'The vendors declined':'The purchasers withdrew', st=a.p_side==='vendor'?'declined':'withdrawn', stopped=stopSignings(o.id,null,me.email,why,'withdrawn'), closed=docClose(o.id,me.email,why); const from=o.status; Object.assign(o,{status:st,status_at:at,status_by:me.email});
    sgEv({property_id:o.property_id,offer_id:o.id},me.email,'withdrawn',{side:a.p_side,status:st,from,at,note:String(a.p_note||'').trim()||null,stopped,document_closed:closed}); return {ok:true,stopped,status:st}; }
  // freeze, unfreeze, withdraw now, let a requester carry on, and who holds the deposit (mirror 024)
  const reason=(t,msg)=>{ t=String(t||'').trim(); if(t.length<3||t.length>500) throw new Error(msg); return t; };
  if(name==='agent_offer_freeze') return sgTry(()=>{ const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); if(OAG().some(x=>x.offer_id===o.id)) throw new Error('The agreement has been made. Talk to the lawyers');
    if(holdActive(o.id)) throw new Error('This offer is already frozen or withdrawn'); const why=reason(a.p_reason,'Say why (3 to 500 characters)'); let rq=null;
    if(a.p_request){ rq=ORQ().find(x=>x.id===a.p_request&&x.offer_id===o.id); if(!rq) throw new Error('No such request'); }
    const asked=String(a.p_asked_by||'').trim()||(rq?rq.side+' request':'Tim McGuire');
    const h={id:uid(),offer_id:o.id,property_id:o.property_id,kind:'freeze',side:null,person:asked.slice(0,250),reason:why,told_at:rq?rq.at:null,told_how:rq?'link_request':null,request_id:rq?rq.id:null,made_by:me.email,made_at:now(),lifted_at:null,lifted_by:null,lift_note:null}; OHD().push(h);
    ORQ().filter(x=>x.offer_id===o.id&&!x.handled_at).forEach(x=>Object.assign(x,{handled_at:now(),handled_by:me.email,handled_as:'freeze'}));
    sgEv({property_id:o.property_id,offer_id:o.id},me.email,'offer_frozen',{hold_id:h.id,reason:why,asked_by:String(a.p_asked_by||'').trim()||(rq?rq.side:'Tim'),request_id:rq?rq.id:null}); return h.id; });
  if(name==='agent_offer_unfreeze') return sgTry(()=>{ if(OHD().some(h=>h.offer_id===a.p_offer&&h.kind==='withdraw')) throw new Error('This offer was withdrawn, so it stays stopped');
    const h=OHD().find(x=>x.offer_id===a.p_offer&&x.kind==='freeze'&&!x.lifted_at); if(!h) throw new Error("This offer isn't frozen"); const why=reason(a.p_note,'Say why it carries on (3 to 500 characters)');
    Object.assign(h,{lifted_at:now(),lifted_by:me.email,lift_note:why}); sgEv(h,me.email,'offer_unfrozen',{hold_id:h.id,note:why}); return null; });
  if(name==='agent_offer_withdraw_now') return sgTry(()=>{ if(!['purchaser','vendor'].includes(a.p_side)) throw new Error('Choose who directed it: the purchasers or the vendors');
    const person=String(a.p_person||'').trim(); if(person.length<2||person.length>250) throw new Error('Choose which person directed it'); const why=reason(a.p_reason,'Give the reason (3 to 500 characters)');
    if(!['in_person','phone','email','link_request'].includes(a.p_told_how)) throw new Error('Choose how you were told'); if(!a.p_told_at) throw new Error('Say when you were told');
    const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); if(OHD().some(h=>h.offer_id===o.id&&h.kind==='withdraw')) throw new Error('This offer has already been withdrawn');
    if(a.p_request&&!ORQ().some(x=>x.id===a.p_request&&x.offer_id===o.id)) throw new Error('No such request on this offer');
    const r={data:negWithdraw({p_offer:o.id,p_side:a.p_side,p_at:a.p_told_at,p_note:('Directed by '+person+': '+why).slice(0,500)},me)};
    OHD().filter(h=>h.offer_id===o.id&&h.kind==='freeze'&&!h.lifted_at).forEach(h=>Object.assign(h,{lifted_at:now(),lifted_by:me.email,lift_note:'Withdrawn'}));
    const h={id:uid(),offer_id:o.id,property_id:o.property_id,kind:'withdraw',side:a.p_side,person,reason:why,told_at:a.p_told_at,told_how:a.p_told_how,request_id:a.p_request||null,made_by:me.email,made_at:now(),lifted_at:null,lifted_by:null,lift_note:null}; OHD().push(h); holdSettle(o.id,'withdrawn',me.email,null);   // 026
    ORQ().filter(x=>x.offer_id===o.id&&!x.handled_at).forEach(x=>Object.assign(x,{handled_at:now(),handled_by:me.email,handled_as:'withdraw'}));
    sgEv(h,me.email,'offer_withdrawn_now',{hold_id:h.id,side:a.p_side,person,reason:why,told_at:a.p_told_at,told_how:a.p_told_how,request_id:a.p_request||null,stopped:(r.data||{}).stopped}); return h.id; });
  if(name==='agent_offer_request_carry_on') return sgTry(()=>{ const rq=ORQ().find(x=>x.id===a.p_request); if(!rq||rq.handled_at) throw new Error('No open request'); const why=reason(a.p_note,'Say what you agreed with them (3 to 500 characters)');
    Object.assign(rq,{handled_at:now(),handled_by:me.email,handled_as:'carry_on'}); sgEv(rq,me.email,'request_carry_on',{request_id:rq.id,note:why}); return null; });
  if(name==='agent_offer_deposit_holder') return sgTry(()=>{ const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); const ag=OAG().find(x=>x.offer_id===o.id); if(!ag) throw new Error("The agreement hasn't been made yet");
    if(!['nzret','vendor_lawyer','other'].includes(a.p_holder)) throw new Error('Choose who holds the deposit'); const other=String(a.p_other||'').trim(); if(a.p_holder==='other'&&(other.length<3||other.length>200)) throw new Error('Type who holds the deposit (3 to 200 characters)');
    const ks=(ag.terms||{}).kiwisaver===true||(o.details||{}).kiwisaver===true, rec=ks?'vendor_lawyer':'nzret', warned=ks&&a.p_holder!=='vendor_lawyer', byDef=a.p_default===true;
    if(byDef&&(a.p_holder!==rec||ODH().some(x=>x.offer_id===o.id))) throw new Error('The recommended holder is used only when nothing has been chosen');
    const row={id:ODH().length+1,offer_id:o.id,property_id:o.property_id,agreement_id:ag.id,holder:a.p_holder,other_text:a.p_holder==='other'?other:null,recommended:rec,kiwisaver:ks,warned,by_default:byDef,chosen_by:me.email,chosen_at:now()}; ODH().push(row);
    sgEv({property_id:o.property_id,offer_id:o.id},me.email,'deposit_holder_chosen',{id:row.id,holder:a.p_holder,other:row.other_text,recommended:rec,kiwisaver:ks,by_default:byDef,agreement_id:ag.id}); return {id:row.id,holder:a.p_holder,recommended:rec,warned,by_default:byDef}; });
  // 026: undo on Tim's device, Tim starting a round again, going back to the last sealed round, and Confirm held while frozen
  if(name==='agent_signing_undo') return sgTry(()=>{ const s=person(a.p_signer); return sgUndo(s,a.p_scope,a.p_clear===true,s.name); });
  if(name==='agent_signing_revert_round') return sgTry(()=>{ const why=reason(a.p_reason,'Say why you are starting this round again (3 to 500 characters)'); const g=OSG().find(x=>x.id===a.p_signing); if(!g) throw new Error('No such signing');
    if(!['ready','signing','held','complete'].includes(g.status)||ORN().some(r=>r.signing_id===g.id)) throw new Error('This round is sealed or stopped, so it is kept exactly as it is');
    if(OAG().some(x=>x.offer_id===g.offer_id)) throw new Error('The agreement has been made. Talk to the lawyers'); if(OHD().some(h=>h.offer_id===g.offer_id&&h.kind==='withdraw')) throw new Error('This offer was withdrawn, so it stays stopped');
    const T_=liveTaps().filter(x=>x.signing_id===g.id), M_=liveMarks().filter(m=>m.signing_id===g.id), F_=OSR().filter(x=>x.signing_id===g.id&&x.finished_at&&!x.void_at);
    if(!T_.length&&!M_.length&&!F_.length) throw new Error('Nothing has been done on this round yet, so there is nothing to start again');
    T_.forEach(x=>OSU().push({id:OSU().length+1,signing_id:g.id,signer_id:x.signer_id,tap_id:x.id,mark_id:null,action:'undo',scope:'round',by_name:me.email,at:now()}));
    M_.forEach(m=>OSU().push({id:OSU().length+1,signing_id:g.id,signer_id:m.signer_id,tap_id:null,mark_id:m.id,action:'undo',scope:'round',by_name:me.email,at:now()}));
    if(['held','complete'].includes(g.status)) g.status='signing'; F_.forEach(x=>Object.assign(x,{finished_at:null,seen_sha256:null})); if(M_.length) voidStaleReopened(g.id,me.email);
    sgEv(g,me.email,'round_reset',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',reason:why,taps:T_.length,changes:M_.length,change_ids:M_.map(m=>m.id),reopened:F_.length}); return {ok:true,taps:T_.length,changes:M_.length,reopened:F_.length}; });
  if(name==='agent_offer_revert_sealed') return sgTry(()=>{ const why=reason(a.p_note,'Say why you are going back (3 to 500 characters)'); const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer');
    if(OAG().some(x=>x.offer_id===o.id)) throw new Error('The agreement has been made. Talk to the lawyers'); if(OHD().some(h=>h.offer_id===o.id&&h.kind==='withdraw')) throw new Error('This offer was withdrawn, so it stays stopped');
    let h=null; if(a.p_unfreeze===true){ h=OHD().find(x=>x.offer_id===o.id&&x.kind==='freeze'&&!x.lifted_at); if(!h) throw new Error("This offer isn't frozen"); } else if(holdActive(o.id)) throw new Error('The offer is frozen. Unfreeze it and go back in one step');
    let rq=null; if(a.p_request){ rq=ORQ().find(x=>x.id===a.p_request&&x.offer_id===o.id); if(!rq||rq.handled_at||rq.kind!=='revert') throw new Error('There is no open request to go back on this offer'); }
    const det=OSG().filter(g=>g.offer_id===o.id&&['ready','signing','held','complete'].includes(g.status)).sort((x,y)=>String(x.released_at).localeCompare(String(y.released_at))).map(g=>({signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',method:g.method,
      taps:liveTaps().filter(x=>x.signing_id===g.id).length,changes:liveMarks().filter(m=>m.signing_id===g.id).length,change_ids:liveMarks().filter(m=>m.signing_id===g.id).map(m=>m.id),finished:OSR().filter(x=>x.signing_id===g.id&&x.finished_at&&!x.void_at).length}));
    if(!det.length) throw new Error('Nothing is out for signing, so there is nothing to go back from');
    const n=stopSignings(o.id,null,me.email,('Went back to the last sealed round: '+why).slice(0,300),'cancelled'), doc=ODC().find(x=>x.offer_id===o.id&&x.status==='open'), last=doc?docLast(doc.id):null;
    if(rq) Object.assign(rq,{handled_at:now(),handled_by:me.email,handled_as:'revert'});
    sgEv({property_id:o.property_id,offer_id:o.id},me.email,'round_reverted',{to_round:last?last.doc_round:null,discarded:det,reason:why,request_id:rq?rq.id:null,unfrozen:a.p_unfreeze===true});
    if(h){ Object.assign(h,{lifted_at:now(),lifted_by:me.email,lift_note:('Unfrozen, going back to the last sealed round: '+why).slice(0,500)}); sgEv(h,me.email,'offer_unfrozen',{hold_id:h.id,note:why,reverted:true}); }
    return {ok:true,stopped:n,to_round:last?last.doc_round:null,discarded:det}; });
  if(name==='agent_offer_confirm_hold') return sgTry(()=>{ const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer'); if(OHD().some(h=>h.offer_id===o.id&&h.kind==='withdraw')) throw new Error('This offer was withdrawn, so no agreement is made');
    const h=OHD().find(x=>x.offer_id===o.id&&x.kind==='freeze'&&!x.lifted_at); if(!h) throw new Error("The offer isn't frozen, so confirm the agreement as usual");
    if(OCH().some(x=>x.offer_id===o.id&&!x.resolved_at)) throw new Error('A confirmation is already held for this offer. Discard it first to hold a new one');
    const c=agreementCheck(o.id,a.p_accepted_at,a.p_date_text,true), row={id:uid(),offer_id:o.id,property_id:o.property_id,document_id:c.doc.id,round_id:c.last.id,hold_id:h.id,accepted_at:a.p_accepted_at,date_text:c.date_text,agreement_date:c.iso,held_by:me.email,held_at:now(),resolved_at:null,resolved_by:null,resolved_as:null,resolve_note:null};
    OCH().push(row); sgEv({property_id:o.property_id,offer_id:o.id},me.email,'agreement_held',{held_id:row.id,document:c.doc.number,round:c.last.doc_round,accepted_at:a.p_accepted_at,date:c.date_text,freeze_id:h.id}); return {id:row.id,round:c.last.doc_round,accepted_at:a.p_accepted_at,date_text:c.date_text}; });
  if(name==='agent_offer_confirm_held') return sgTry(()=>{ const x=OCH().find(y=>y.offer_id===a.p_offer&&!y.resolved_at); if(!x) throw new Error('There is no held confirmation on this offer');
    if(holdActive(a.p_offer)) throw new Error('Unfreeze the offer first. The confirmation stays held until then'); const doc=ODC().find(y=>y.offer_id===a.p_offer&&y.status==='open'), last=doc&&docLast(doc.id);
    if(!last||last.id!==x.round_id) throw new Error('The newest sealed round has changed since you held this. Discard it, then confirm again'); return {id:x.id,accepted_at:x.accepted_at,date_text:x.date_text,round:last.doc_round}; });
  if(name==='agent_offer_confirm_hold_discard') return sgTry(()=>{ const x=OCH().find(y=>y.offer_id===a.p_offer&&!y.resolved_at); if(!x) throw new Error('There is no held confirmation on this offer'); if(String(a.p_note||'').length>500) throw new Error('The note is too long');
    Object.assign(x,{resolved_at:now(),resolved_by:me.email,resolved_as:'discarded',resolve_note:String(a.p_note||'').trim()||null}); sgEv(x,me.email,'agreement_hold_discarded',{held_id:x.id,accepted_at:x.accepted_at,date:x.date_text,note:String(a.p_note||'').trim()||null}); return null; });
  if(name==='agent_offer_link_changes_default') return sgTry(()=>{ if(typeof a.p_on!=='boolean') throw new Error('Choose yes or no'); OSET().link_changes_default=a.p_on; OSET().updated_by=me.email; return null; });
  if(name==='agent_offer_negotiation_setting') return sgTry(()=>{ if(typeof a.p_resign_every_round!=='boolean') throw new Error('Choose yes or no'); OSET().resign_every_round=a.p_resign_every_round; OSET().updated_by=me.email; return null; });
  return bad('unknown rpc '+name); }
// ── presentation and counteroffers (mirrors migrations/024_offer_negotiation.sql) ──
const ODC=()=>(DB.offer_documents||=[]), OAG=()=>(DB.offer_agreements||=[]);
const sgAllPlaces=g=>g.places.concat(liveReviews().filter(r=>r.signing_id===g.id).flatMap(r=>r.places));
const sgMarksOf=gid=>liveMarks().filter(m=>m.signing_id===gid).map(m=>Object.assign({id:m.id,kind:m.kind,page:m.page,geometry:m.geometry,target:m.target,by:m.by_name,at:m.at},m.ink_png?{ink:m.ink_png}:{}));
const docLast=docId=>ORN().filter(r=>r.document_id===docId).sort((a,b)=>b.doc_round-a.doc_round)[0];
function docLayers(docId,upto){ return ORN().filter(r=>r.document_id===docId&&r.doc_round<=upto).sort((a,b)=>a.doc_round-b.doc_round).map(r=>{ const g=OSG().find(x=>x.id===r.signing_id);
  return {round_id:r.id,number:r.number,doc_round:r.doc_round,side:r.side,signing_id:g.id,sha256:r.sha256,locked_at:r.locked_at,changes:r.changes,places:sgAllPlaces(g),
    taps:liveTaps().filter(t=>t.signing_id===g.id).map(t=>({place_id:t.place_id,signer:OSR().find(s=>s.id===t.signer_id).position})),
    signers:OSR().filter(s=>s.signing_id===g.id&&!s.void_at).sort((x,y)=>x.position-y.position).map(s=>Object.assign({position:s.position,name:s.name,sig_png:sgInk(s).sig_png,init_png:sgInk(s).init_png},s.id_sighted?{id_sighted:s.id_sighted,id_checked_at:idCheckedAt(s)}:{},noIdAt(s)?{no_id_check_at:noIdAt(s)}:{})),marks:sgMarksOf(g.id)}; }); }
function stopSignings(oid,docId,actor,reason,status){ let n=0; const st=status||'cancelled'; OSG().filter(g=>g.offer_id===oid&&['ready','signing','held','complete'].includes(g.status)&&(!docId||g.document_id===docId)).forEach(g=>{
  OSR().filter(s=>s.signing_id===g.id&&!s.void_at).forEach(s=>Object.assign(s,{void_at:now(),token_hash:null,session_hash:null,code_hash:null})); g.status=st;
  sgEv(g,actor,st==='withdrawn'?'sign_withdrawn':'sign_cancelled',{signing_id:g.id,round:g.round_no||1,side:g.side||'purchaser',method:g.method,links_sent:!!g.sent_at,reason}); n++; }); return n; }
function docClose(oid,actor,reason){ const doc=ODC().find(x=>x.offer_id===oid&&x.status==='open'); if(!doc) return null; Object.assign(doc,{status:'closed',closed_at:now(),closed_by:actor,close_reason:String(reason).slice(0,500)}); return doc.number; }
// the change's rectangle as the database works it out (typed words allowed 0.62 of the size a letter), and the gap to a place
function chgRect(kind,g){ if(kind==='insert') return {x:g.x,y:g.y-2,w:Math.max(8,String(g.text||'').length*(g.size||9)*0.62),h:(g.size||9)+4}; return window.SIGN.markRect({kind,geometry:g}); }
const gapOf=(p,r)=>Math.hypot(Math.max(0,r.x-(p.x+p.w),p.x-(r.x+r.w)),Math.max(0,r.y-(p.y+p.h),p.y-(r.y+r.h)));
function datePlaceOf(draftId){ const d=(DB.offer_drafts||[]).find(x=>x.id===draftId), m=d&&(DB.offer_blank_maps||[]).find(x=>x.id===d.map_id); return m?((m.places||[]).find(x=>x.id==='date')||(m.places||[]).find(x=>x.kind==='date')||null):null; }
// whose own phone or email some typed words hold (offer_private_hit)
// the parties as the agreement names them, for the vendors' screen (offer_parties)
function offerParties(o){ const d=(o&&o.details)||{}, lw=d.lawyer||{}; return {purchasers:(d.purchasers||[]).map(q=>[q.first,q.last].map(x=>String(x||'').trim()).join(' ').trim()),entity:String(d.entity||'').trim()||null,lawyer:{firm:lw.firm||null,person:lw.person||null,email:lw.email||null,phone:lw.phone||null},chattels:d.chattels_listed||[],chattels_add:d.chattels_add||[],chattels_exclude:d.chattels_exclude||[]}; }
function privateHit(o,text){ const X=window.DRAFT, ags=(DB.agreements||[]).filter(g=>g.property_id===o.property_id).map(g=>g.id), list=[{who:'a purchaser',email:(o.details||{}).email,phone:(o.details||{}).phone}].concat(((o.details||{}).purchasers||[]).map(q=>({who:'a purchaser',email:q.email,phone:q.phone})),
  (DB.property_people||[]).filter(pp=>pp.property_id===o.property_id).map(pp=>({who:'a vendor',email:pp.email,phone:pp.phone})), (DB.agreement_people||[]).filter(ap=>ags.includes(ap.agreement_id)).map(ap=>({who:'a vendor',email:ap.email,phone:ap.phone}))); return X.holdsOwn(text,X.ownContacts(list)); }
const SIDE_PEOPLE=(o,doc)=>doc&&docLast(doc.id).side==='purchaser'?(DB.property_people||[]).filter(pp=>pp.property_id===o.property_id&&(pp.role||'owner')==='owner').sort((x,y)=>(x.position||0)-(y.position||0)).map(pp=>({name:String(pp.legal_name||'').replace(/\s+/g,' ').trim(),email:String(pp.email||'').trim().toLowerCase()||null,person:pp.id}))
  :OSR().filter(s=>s.signing_id===ORN().find(r=>r.document_id===doc.id&&r.doc_round===1).signing_id&&!s.void_at).sort((x,y)=>x.position-y.position).map(s=>({name:s.name,email:s.email,person:null}));
function roundPresent(a,me){ if(!['in_person','link'].includes(a.p_method)) throw new Error('Choose in person or by link'); const o=PO().find(x=>x.id===a.p_offer); if(!o) throw new Error('No such offer');
  if(holdActive(o.id)) throw new Error('This offer is frozen or withdrawn, so nothing is presented. Unfreeze it first; a withdrawn offer is never presented again');
  if(['withdrawn','lapsed','declined'].includes(o.status)) throw new Error('This offer has been withdrawn or has lapsed'); if(OAG().some(x=>x.offer_id===o.id)) throw new Error('The agreement has been made');
  const doc=ODC().find(x=>x.offer_id===o.id&&x.status==='open'); if(!doc&&ODC().some(x=>x.offer_id===o.id&&x.status==='closed')) throw new Error('The last document was closed (withdrawn, declined or for a fresh copy). Correct the offer, re-draft it, and have the purchasers sign a fresh copy first');
  if(!doc) throw new Error('Lock Round 1 first: the purchasers sign the offer before it goes to the vendors'); const last=docLast(doc.id);
  if(a.p_checked!==true) throw new Error(`Tick that you have looked at Round ${last.doc_round} first`);
  if(last.doc_round>1&&!last.changes&&!last.outstanding.length) throw new Error(`Round ${last.doc_round} accepted everything with nothing changed. Confirm the agreement instead`);
  const side=last.side==='purchaser'?'vendor':'purchaser', ex=OSG().find(g=>g.draft_id===doc.draft_id&&g.round_no===last.doc_round+1&&!['cancelled','withdrawn'].includes(g.status)); if(ex) return {id:ex.id,existing:true};
  // a side's later round: the same people as its newest locked round, in the same order; the vendors refused if the owners changed
  const prev=ORN().filter(r=>r.document_id===doc.id&&r.side===side).sort((x,y)=>y.doc_round-x.doc_round)[0];
  let ppl; if(prev){ ppl=OSR().filter(x=>x.signing_id===prev.signing_id&&!x.void_at).sort((x,y)=>x.position-y.position).map(x=>{ const pp=(DB.property_people||[]).find(q=>q.id===x.person_id); return {name:x.name,email:(pp&&String(pp.email||'').trim().toLowerCase())||x.email,person:x.person_id}; });
    if(side==='vendor'){ const own=(DB.property_people||[]).filter(pp=>pp.property_id===o.property_id&&(pp.role||'owner')==='owner').map(pp=>pp.id).sort().join(), was=ppl.map(x=>x.person).sort().join(); if(own!==was) throw new Error(`The owners on the property have changed since Round ${prev.doc_round}. Start a fresh copy, so the right people sign`); } }
  else ppl=SIDE_PEOPLE(o,doc);
  const base=OSG().find(g=>g.id===last.signing_id), n=ppl.length; if(ppl.some(x=>!x.name)) throw new Error("Add each vendor's legal name on the property first");
  if(n<1||n>12) throw new Error(`There need to be 1 to 12 people to sign (now ${n})`);
  if(a.p_method==='link'){ ppl.forEach(x=>{ if(!x.email||!/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(x.email)) throw new Error(`${x.name} has no email to send a link to. Add it, or sign in person`); }); if(new Set(ppl.map(x=>x.email)).size!==n) throw new Error('Two people have the same email. Each needs their own to sign by link'); }
  const first=!prev, pl=a.p_places||[], resign=!!OSET().resign_every_round;
  if(!sgPlacesOk(pl,base.pages,n,first)||((first||resign)&&ppl.some((_,i)=>!pl.some(p=>p.signer===i+1&&p.kind==='signature'&&p.why==='block')))) throw new Error('Please check the signing places: everyone signs'+(first?', and initials the foot of every page':''));
  liveMarks().filter(m=>m.signing_id===last.signing_id&&!isOwnK(m.kind)).forEach(m=>ppl.forEach((_,i)=>{ if(!pl.some(p=>p.id===`chg:${m.id}:s${i+1}`&&p.why==='change'&&p.kind==='initial')) throw new Error(`Please check the signing places: everyone initials each change made in Round ${last.doc_round}`); }));
  const docSigns=ORN().filter(r=>r.document_id===doc.id).map(r=>r.signing_id);
  pl.filter(p=>p.why==='change').forEach(p=>{ const m=liveMarks().find(k=>k.id===p.ref&&docSigns.includes(k.signing_id)); if(!m||p.page!==m.page||gapOf(p,chgRect(m.kind,m.geometry))>60) throw new Error('Please check the signing places: initials for a change go beside it'); });
  const g={id:uid(),offer_id:o.id,property_id:o.property_id,draft_id:doc.draft_id,draft_sha256:doc.draft_sha256,method:a.p_method,pages:base.pages,places:JSON.parse(JSON.stringify(pl)),places_sha256:shaS(JSON.stringify(pl)),cca_pages:[],status:'ready',round_no:last.doc_round+1,side,document_id:doc.id,base_round_id:last.id,link_changes:(a.p_link_changes!=null?!!a.p_link_changes:OSET().link_changes_default===true),released_by:me.email,released_at:now(),sent_at:null,held_at:null,completed_at:null,locked_at:null,replaced_at:null,replaced_by:null};
  chattelsCheck(g); ownClearCheck(g.places,doc.id); OSG().push(g); ppl.forEach((x,i)=>OSR().push({id:uid(),signing_id:g.id,position:i+1,name:x.name.slice(0,250),email:x.email,person_id:x.person,token_hash:null,link_sent_at:null,link_expires_at:null,code_hash:null,code_expires_at:null,code_tries:0,codes_sent:0,codes_window_at:null,session_hash:null,session_expires_at:null,opened_at:null,verified_at:null,consent_at:null,sig_png:null,init_png:null,marks_at:null,id_sighted:null,witnessed_by:null,finished_at:null,seen_sha256:null,user_agent:null,net_hash:null,void_at:null}));
  sgEv(g,me.email,'round_presented',{signing_id:g.id,document:doc.number,round:g.round_no,side,method:a.p_method,checked_round:last.doc_round,checked_sha256:last.sha256,signers:n,places:pl.length,places_sha256:g.places_sha256,note:String(a.p_note||'').trim().slice(0,300)||null,link_changes:g.link_changes});
  return {id:g.id,existing:false,round:g.round_no,side,link_changes:g.link_changes}; }
// a change (offer_sign_do_change): Round 2 on, by a signer of the countering side, with everyone's initials beside it
function sgChange(s,a){ const g=sgReady(s,true); if((g.round_no||1)<2) throw new Error('Changes are made when the offer is answered, from Round 2 on'); if(!s.consent_at) throw new Error('Agree to sign electronically first');
  const id=a.p_id; if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')||OSM().some(m=>m.id===id)) throw new Error('Please try that again');
  if(OSM().filter(m=>m.signer_id===s.id&&Date.parse(m.at)>Date.now()-36e5).length>=30) throw new Error('You have made a lot of changes in the last hour. Please call Tim on 027 562 7207');
  if(!(a.p_page>=1&&a.p_page<=g.pages.length)) throw new Error("That page isn't in the document"); const [w,h]=g.pages[a.p_page-1], geo=a.p_geometry||{};
  const shapeOk=a.p_kind==='insert'?(typeof geo.text==='string'&&geo.text.trim().length>=1&&geo.text.length<=300&&geo.text===geo.text.trim()&&!/[\u0001-\u001F\u007F]/.test(geo.text)&&geo.x>=0&&geo.x<=w&&geo.y>=0&&geo.y<=h&&geo.size>=6&&geo.size<=14)
    :['note','strike','cross','reinstate'].includes(a.p_kind)&&window.SIGN.markOk({kind:a.p_kind,geometry:geo,target:a.p_kind==='reinstate'?a.p_target||'x':null},{w,h});
  if(!shapeOk) throw new Error("That change doesn't sit on the page");
  if(a.p_kind==='reinstate'){ const docSigns=ORN().filter(r=>r.document_id===g.document_id).map(r=>r.signing_id).concat(g.id), t=liveMarks().find(m=>m.id===a.p_target&&docSigns.includes(m.signing_id));
    if(!t||!['strike','cross'].includes(t.kind)) throw new Error('Choose a line or crossed-out box to reinstate'); if(liveMarks().some(m=>m.target===t.id&&m.kind==='reinstate')) throw new Error('That has already been reinstated'); }
  else if(a.p_target) throw new Error('Only a reinstatement points at another change');
  const rc=chgRect(a.p_kind,geo), dp=datePlaceOf(g.draft_id);
  if(dp&&dp.page===a.p_page&&window.SIGN.overlap({x:dp.x,y:dp.y-2,w:dp.w||100,h:(dp.h||10)+2},rc)>0) throw new Error('That is where the date goes once the agreement is made. Make the change somewhere else');
  if(a.p_kind==='insert'){ const who=privateHit(PO().find(x=>x.id===g.offer_id),geo.text); if(who) throw new Error(`Those words hold ${who}'s own phone or email, so they can't go on the agreement. Only the lawyers' details go on it`); }
  // 024: a new further term's number must be free in this agreement (above term_last and retired numbers, not taken in this document)
  if(a.p_kind==='insert'&&/^\s*\d{1,3}(\.0|\.)\s/.test(geo.text||'')){ const num=t=>+(/^\s*(\d{1,3})/.exec(t)[1]), tn=num(geo.text), dr=DB.offer_drafts.find(x=>x.id===g.draft_id)||{}, E=dr.edits||{}, ret=(E.retired_numbers||[]).map(Number);
    const docSigs=new Set([g.id].concat((DB.offer_rounds||[]).filter(r=>r.document_id===g.document_id).map(r=>r.signing_id)));
    const used=liveMarks().filter(m=>m.kind==='insert'&&docSigs.has(m.signing_id)&&/^\s*\d{1,3}(\.0|\.)\s/.test((m.geometry||{}).text||'')).map(m=>num(m.geometry.text));
    const base=Math.max(+E.term_last||0,...ret,0), top_=Math.max(base,...used,0);
    if(tn<=base||used.includes(tn)||tn>top_+1){ let nx=top_+1; while(ret.includes(nx)) nx++; const st=/^\s*\d{1,3}\.0\s/.test(geo.text)?'.0':'.'; throw new Error(`Further term ${tn}${st} is already taken or out of order in this agreement. The next free number is ${nx}${st}`); } }
  const n=OSR().filter(x=>x.signing_id===g.id&&!x.void_at).length, pl=a.p_places||[];
  if(!sgPlacesOk(pl,g.pages,n,false)||pl.length!==n||pl.some(x=>x.why!=='change'||x.kind!=='initial'||x.ref!==id||x.id!==`chg:${id}:s${x.signer}`)) throw new Error('Everyone on your side initials each change once');
  if(pl.some(x=>x.page!==a.p_page||gapOf(x,rc)>60)) throw new Error("Each person's initials go beside the change, on its page");
  { const m={id,signing_id:g.id,signer_id:s.id,by_name:s.name,kind:a.p_kind,page:a.p_page,geometry:geo,target:a.p_kind==='reinstate'?a.p_target:null,at:now(),ink_png:null}; markPlaceGuard(g,s,m); OSM().push(m); }   // 029: typed words clear of others' places
  OSV().push({id:OSV().length+1,signing_id:g.id,marks:[id],places:JSON.parse(JSON.stringify(pl)),places_sha256:shaS(JSON.stringify(pl)),kind:'change',reviewed_by:null,changed_by:s.name,at:now()});
  const back=OSR().filter(x=>x.signing_id===g.id&&x.finished_at&&!x.void_at&&x.id!==s.id).sort((x,y)=>x.position-y.position).map(x=>({id:x.id,position:x.position,name:x.name,email:g.method==='link'?x.email:null}));
  let re=0; OSR().filter(x=>x.signing_id===g.id&&x.finished_at&&!x.void_at).forEach(x=>{ x.finished_at=null; x.seen_sha256=null; re++; });
  sgEv(g,s.name,'round_change',{signing_id:g.id,round:g.round_no,side:g.side,mark_id:id,kind:a.p_kind,page:a.p_page,signer:s.position,target:a.p_target||null,text:a.p_kind==='insert'?geo.text:null,reopened:re}); return {id,reopened:re,reopened_signers:back,by:s.name,method:g.method,side:g.side,round:g.round_no,address:(PT().find(x=>x.id===g.property_id)||{}).address}; }
// offer_agreement_check
function agreementCheck(oid,acc,dateText,ignoreFreeze){ const o=PO().find(x=>x.id===oid); if(!o) throw new Error('No such offer'); if(OAG().some(x=>x.offer_id===oid)) throw new Error('The agreement has already been made');
  if(['withdrawn','lapsed','declined'].includes(o.status)) throw new Error('This offer has been withdrawn or has lapsed'); if(holdActive(oid)&&!(ignoreFreeze&&!OHD().some(h=>h.offer_id===oid&&h.kind==='withdraw'))) throw new Error('This offer is frozen or withdrawn, so no agreement is made while it is'); const doc=ODC().find(x=>x.offer_id===oid&&x.status==='open'); if(!doc) throw new Error('There is no open document');
  const last=docLast(doc.id); if(last.doc_round<2) throw new Error('Both sides sign before the agreement is made'); if(last.changes>0) throw new Error(`Round ${last.doc_round} changed the document, so the other side answers it first`);
  if(last.outstanding.length) throw new Error(`Something is still outstanding on Round ${last.doc_round}`);
  if(OSG().some(g=>g.document_id===doc.id&&g.round_no>last.doc_round&&['ready','signing','held','complete'].includes(g.status))) throw new Error('A newer round is out for signing. Stop it first');
  const iso=window.NEGO.parseFullDate(String(dateText||'').trim()); if(!/^([1-9]|[12][0-9]|3[01]) [A-Z][a-z]+ 20[0-9]{2}$/.test(String(dateText||'').trim())||!window.NEGO.MONTHS.includes(String(dateText).trim().split(' ')[1])) throw new Error('Type the date in full with the month name, for example 24 November 2026');
  if(!iso) throw new Error("That date isn't a real day"); const first=ORN().filter(r=>r.document_id===doc.id).map(r=>r.locked_at).sort()[0];
  const nzDay=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const fin=OSR().filter(s=>s.signing_id===last.signing_id&&s.finished_at).map(s=>s.finished_at).sort().pop(); if(!acc||Date.parse(acc)>Date.now()+3e5||Date.parse(acc)<Date.parse(fin)-6e4) throw new Error('The time acceptance was communicated needs to be after the last signature and not in the future');
  if(iso>nzDay(Date.now())||iso<nzDay(acc)) throw new Error('The agreement date needs to be from the day acceptance was communicated to today'); void first;
  if(!datePlaceOf(doc.draft_id)) throw new Error("The agreement blank has no date place, so the date can't be added. Add it to the places on the blank first");
  return {doc,last,iso,date_text:String(dateText).trim()}; }
// the stored files survive a reload (a purchaser's link opens in a new page): kept in localStorage as base64
function blobsLoad(){ try{ const m=JSON.parse(localStorage.getItem('mockBlobs')||'{}'); const B=(window.__repoBlobs||={}); Object.entries(m).forEach(([p,v])=>{ if(!B[p]){ const b=atob(v.b64), u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); B[p]=new Blob([u],{type:v.mime}); } }); }catch(_){} }
async function blobKeep(p,blob){ if(blob.size>3e6) return; const u=new Uint8Array(await blob.arrayBuffer()); let s=''; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode(...u.subarray(i,i+0x8000));
  try{ const m=JSON.parse(localStorage.getItem('mockBlobs')||'{}'); m[p]={mime:blob.type||'application/pdf',b64:btoa(s)}; localStorage.setItem('mockBlobs',JSON.stringify(m)); }catch(_){} }
blobsLoad();
const hex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
const pdfLibLoad=()=>window.PDFLib?Promise.resolve(window.PDFLib):new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload=()=>res(window.PDFLib); s.onerror=rej; document.head.appendChild(s); });
async function sgLock(sid,actor){ if(localStorage.getItem('mockLockFail')==='1') throw new Error('storage down');   // localStorage mockLockFail = '1': making the round fails
  const g=OSG().find(x=>x.id===sid); if(!g) throw new Error('No such signing'); const ex=ORN().find(r=>r.signing_id===g.id); if(ex) return {number:ex.number,round:ex.doc_round,sha256:ex.sha256,existing:true};
  if(g.status!=='complete') throw new Error('Not everyone has finished signing'); const w=sgCurrent(g); if(w) throw new Error(w);
  const round=g.round_no||1, side=g.side||'purchaser'; let doc=g.document_id?ODC().find(x=>x.id===g.document_id):null;
  if(round===1){ if(ODC().some(x=>x.offer_id===g.offer_id&&['open','agreed'].includes(x.status))) throw new Error('This offer already has a signed Round 1'); }
  else { const last=docLast(doc.id); if(!last||last.id!==g.base_round_id||last.doc_round!==round-1) throw new Error("This round no longer answers the newest round, so it wasn't locked"); }
  const d=DB.offer_drafts.find(x=>x.id===g.draft_id), o=PO().find(x=>x.id===g.offer_id), p=PT().find(x=>x.id===g.property_id), bl=(window.__repoBlobs||{})[d.path]; if(!bl) throw new Error('The approved draft could not be read');
  const draft=new Uint8Array(await bl.arrayBuffer()); if(hex(await crypto.subtle.digest('SHA-256',draft))!==d.sha256) throw new Error("The approved draft doesn't match its fingerprint, so the round wasn't made. Tim will look into it.");
  const signers=OSR().filter(s=>s.signing_id===g.id&&!s.void_at).sort((a,b)=>a.position-b.position), places=sgAllPlaces(g);
  const LT=liveTaps(), taps=LT.filter(t=>t.signing_id===g.id).map(t=>({place_id:t.place_id,signer:OSR().find(s=>s.id===t.signer_id).position,at:t.at}));
  const marks=liveMarks().filter(m=>m.signing_id===g.id).map(m=>Object.assign(m.ink_png?{ink:m.ink_png}:{},{id:m.id,kind:m.kind,page:m.page,geometry:m.geometry,target:m.target,by:m.by_name,at:m.at,reviewed_at:(liveReviews().find(r=>r.signing_id===g.id&&(r.kind||'review')==='review'&&r.marks.includes(m.id))||{}).at||null}));
  const n=(ORN().filter(r=>r.offer_id===g.offer_id).map(r=>r.number).sort((a,b)=>b-a)[0]||0)+1;
  const record={address:p.address,offer_ref:o.buyer_ref,round,draft:{number:d.number,sha256:d.sha256},places_sha256:g.places_sha256,made_at:now(),
    signers:signers.map(s=>Object.assign({name:s.name,method:g.method,verified_at:s.verified_at,witnessed_by:s.witnessed_by,id_sighted:s.id_sighted,consent_at:s.consent_at,receipts:OSC().filter(r=>r.signer_id===s.id).map(r=>({guide:r.guide,version:r.version,sha256:r.sha256,pages:r.pages,at:r.at})),
      first_tap:LT.filter(t=>t.signer_id===s.id).map(t=>t.at).sort()[0],last_tap:LT.filter(t=>t.signer_id===s.id).map(t=>t.at).sort().slice(-1)[0],finished_at:s.finished_at,places:sgRequired(g,s.position).length,ua:s.user_agent,net:s.net_hash,seen_sha256:s.seen_sha256},idCheckedAt(s)?{id_checked_at:idCheckedAt(s)}:{},noIdAt(s)?{no_id_check_at:noIdAt(s)}:{})),
    marks:marks.map(m=>Object.assign({kind:m.kind,page:m.page,by:m.by,at:m.at,reviewed_at:m.reviewed_at},['strike','insert'].includes(m.kind)&&(m.geometry||{}).text?{text:m.geometry.text}:{})),replaced:OSG().filter(x=>x.offer_id===g.offer_id&&x.status==='replaced').map(x=>({number:DB.offer_drafts.find(y=>y.id===x.draft_id).number,at:x.replaced_at}))};
  const L=await pdfLibLoad(); let r, lifted=[], outstanding=[], formed=false; const chg=marks.filter(m=>!isOwnK(m.kind)), own=marks.filter(m=>isOwnK(m.kind));
  if(round===1) r=await window.SIGN.renderRound(L,draft,{places,taps,signers:signers.map(s=>Object.assign({},s,sgInk(s))),marks,record,title:'Round 1 (signed by the purchasers): '+p.address});
  else { const NG=window.NEGO, earlier=docLayers(doc.id,round-1), cur={doc_round:round,number:n,side,signing_id:g.id,places,taps,signers:signers.map(s=>({position:s.position,name:s.name,sig_png:sgInk(s).sig_png,init_png:sgInk(s).init_png})),marks};
    const all=earlier.concat([cur]), st=NG.standing(all), sides={}; all.forEach(x=>{ sides[x.side]=x.signers.map(s=>({position:s.position,name:s.name})); });
    lifted=st.lifted.filter(x=>x.by_round===round).map(x=>({side:x.side,signer:x.signer,who:x.who,kind:x.kind,why:x.why,page:x.page,round:x.round,by:x.by})); outstanding=NG.outstanding(st,sides);
    formed=!chg.length&&!outstanding.length&&Object.keys(sides).length===2; const base=earlier[earlier.length-1];
    const title=`Round ${round} (signed by the ${side==='vendor'?'vendors':'purchasers'}): `+p.address;
    Object.assign(record,{number:n,document:doc.number,side,base:{round:base.doc_round,sha256:base.sha256},link_changes:g.link_changes==null?null:!!g.link_changes,changes:chg.map(m=>({kind:m.kind,page:m.page,by:m.by,at:m.at,text:m.kind==='insert'||m.kind==='strike'?(m.geometry||{}).text||undefined:undefined})),...(own.length?{own:own.map(m=>({kind:m.kind,page:m.page,by:m.by,at:m.at}))}:{}),lifted,outstanding:outstanding.length});
    r=await NG.renderWorking(L,draft,{ink:st.ink,changes:st.changes,own:st.own,lines:NG.roundLines(record),title}); Object.assign(record,{title,draw_version:NG.DRAW_VERSION,check:{lifted,outstanding}}); }
  const sha=hex(await crypto.subtle.digest('SHA-256',r.bytes)), path=`properties/${g.property_id}/docs/offer-round-${g.offer_id}-${n}-${sha.slice(0,12)}.pdf`, blob=new Blob([r.bytes],{type:'application/pdf'});
  SO()[path]={size:blob.size,mime:'application/pdf'}; (window.__repoBlobs||={})[path]=blob; await blobKeep(path,blob);
  (DB.offer_file_hashes||=[]).push({path,sha256:sha,size_bytes:blob.size,confirmed_by:actor,confirmed_at:now()});
  if(round===1){ doc={id:uid(),offer_id:g.offer_id,property_id:g.property_id,number:ODC().filter(x=>x.offer_id===g.offer_id).length+1,draft_id:g.draft_id,draft_sha256:g.draft_sha256,status:'open',opened_at:now(),closed_at:null,closed_by:null,close_reason:null,agreed_at:null}; ODC().push(doc); }
  sgEv(g,actor,'round_locked',{signing_id:g.id,number:n,document:doc.number,round,side,changes:chg.length,sha256:sha,draft_sha256:g.draft_sha256,places_sha256:g.places_sha256,path,lifted:lifted.length,outstanding:outstanding.length});
  const ev=OE()[OE().length-1]; ORN().push({id:uid(),offer_id:g.offer_id,property_id:g.property_id,signing_id:g.id,number:n,draft_id:g.draft_id,draft_sha256:g.draft_sha256,places_sha256:g.places_sha256,path,sha256:sha,size_bytes:blob.size,execution:record,chain_last:ev.hash,locked_by:actor,locked_at:now(),
    document_id:doc.id,doc_round:round,side,base_round_id:g.base_round_id||null,changes:chg.length,lifted,outstanding});
  g.status='locked'; g.locked_at=now(); if(round>1&&chg.length&&['received','countered'].includes(o.status)) o.status='countered';
  // Tim alone, once per submitted round, with who, what changed and the round's portal address (024; src/mail-core.js roundNotice)
  { const nt=window.MAIL.roundNotice({side:side||'purchaser',round,address:p.address,signers:signers.map(x=>x.name),changes:chg.map(m=>({kind:m.kind,page:m.page,text:(m.geometry||{}).text,by:m.by||m.by_name})),portalUrl:`https://portal.dunnerstunner.co.nz/properties/${g.property_id}/offers/${g.offer_id}/signing/${g.id}`});
    try{ sgMail('offer_round_locked','tim',{subject:nt.subject,body:nt.body,formed,round,signing_id:g.id}); }catch(_){} } save(); return {number:n,round,sha256:sha,existing:false,formed}; }
// the agreed copy (the edge function's "agree"): every round's layers, nothing outstanding, the date Tim typed at the top
async function sgAgree(b,me){ const c=agreementCheck(b.offer_id,b.accepted_at,b.date_text), o=PO().find(x=>x.id===b.offer_id), p=PT().find(x=>x.id===o.property_id), NG=window.NEGO;
  const layers=docLayers(c.doc.id,c.last.doc_round), st=NG.standing(layers), sides={}; layers.forEach(x=>{ sides[x.side]=x.signers.map(s=>({position:s.position,name:s.name})); });
  if(NG.outstanding(st,sides).length) throw new Error("Something is still outstanding, so the agreement can't be confirmed yet.");
  const d=DB.offer_drafts.find(x=>x.id===c.doc.draft_id), bl=(window.__repoBlobs||{})[d.path], draft=new Uint8Array(await bl.arrayBuffer());
  const map=(DB.offer_blank_maps||[]).find(x=>x.id===d.map_id)||{}, dp=(map.places||[]).find(x=>x.id==='date')||(map.places||[]).find(x=>x.kind==='date')||null;
  const rounds=ORN().filter(r=>r.offer_id===o.id).sort((a,z)=>a.number-z.number).map(r=>({number:r.number,document:(ODC().find(x=>x.id===r.document_id)||{}).number,round:r.doc_round,side:r.side,changes:r.changes,sha256:r.sha256,locked_at:r.locked_at}));
  if(!dp) throw new Error("The agreement blank has no date place, so the date can't be added. Add it to the places on the blank first.");
  const record={address:p.address,offer_ref:o.buyer_ref,date_text:c.date_text,accepted_at:b.accepted_at,confirmed_by:'Tim McGuire',made_at:now(),document:c.doc.number,round:c.last.doc_round,rounds,base:{round:c.last.doc_round,sha256:c.last.sha256},draw_version:NG.DRAW_VERSION};
  { const idc=layers.flatMap(L=>(L.signers||[]).filter(s=>s.id_checked_at||s.no_id_check_at).map(s=>s.no_id_check_at?{round:L.doc_round,who:s.name,none:true,at:s.no_id_check_at}:{round:L.doc_round,who:s.name,id_sighted:s.id_sighted,at:s.id_checked_at})); if(idc.length) record.id_checks=idc; }   // 029
  const L=await pdfLibLoad(), r=await NG.renderWorking(L,draft,{ink:st.ink,changes:st.changes,own:st.own,lines:NG.agreementLines(record),date:{text:c.date_text,place:dp},title:'Agreement: '+p.address});
  const sha=hex(await crypto.subtle.digest('SHA-256',r.bytes)), path=`properties/${o.property_id}/docs/offer-agreement-${o.id}-${sha.slice(0,12)}.pdf`, blob=new Blob([r.bytes],{type:'application/pdf'});
  SO()[path]={size:blob.size,mime:'application/pdf'}; (window.__repoBlobs||={})[path]=blob; await blobKeep(path,blob); (DB.offer_file_hashes||=[]).push({path,sha256:sha,size_bytes:blob.size,confirmed_by:me.email,confirmed_at:now()});
  sgEv({property_id:o.property_id,offer_id:o.id},me.email,'agreement_formed',{document:c.doc.number,round:c.last.doc_round,number:c.last.number,date:c.date_text,accepted_at:b.accepted_at,sha256:sha,path});
  // the agreed terms (offer_agreed_terms): the offer as drafted and every change made, for later phases to read from here
  const pl=d.placed||[], docSigns=ORN().filter(r=>r.document_id===c.doc.id).map(r=>r.signing_id), dep=(map.places||[]).find(x=>x.id==='deposit');
  const terms={price:d.details.price,settlement:d.details.settlement,conditions:d.details.conditions,kiwisaver:d.details.kiwisaver,lawyer_approval:d.details.lawyer_approval,
    as_drafted:Object.fromEntries(pl.filter(x=>['price','deposit','settlement','purchaser'].includes(x.id)||/^[cd]_/.test(x.id)).map(x=>[x.id,x.text!=null?x.text:x.value!=null?x.value:null])),deposit_printed:dep?dep.printed||null:null,
    further_terms:(pl.find(x=>x.id==='further_terms')||{}).terms||null,
    changes:liveMarks().filter(m=>docSigns.includes(m.signing_id)&&!isOwnK(m.kind)).map(m=>{ const g=OSG().find(x=>x.id===m.signing_id); return {round:g.round_no,side:g.side,kind:m.kind,page:m.page,text:m.geometry.text||null,by:m.by_name,at:m.at}; }).sort((x,y)=>x.round-y.round||(x.at<y.at?-1:1)),
    note:'Where a change made in the negotiation alters a term above, the change governs. Read with the signed rounds.'};
  const ev=OE()[OE().length-1]; OAG().push({id:uid(),offer_id:o.id,property_id:o.property_id,document_id:c.doc.id,round_id:c.last.id,path,sha256:sha,size_bytes:blob.size,agreement_date:c.iso,date_text:c.date_text,accepted_at:b.accepted_at,record,chain_last:ev.hash,confirmed_by:me.email,locked_at:now(),round_sha256:c.last.sha256,draw_version:NG.DRAW_VERSION,terms});
  holdSettle(o.id,'agreed',me.email,OAG()[OAG().length-1]);   // 026: offer_confirm_hold_settle
  Object.assign(c.doc,{status:'agreed',agreed_at:now()}); Object.assign(o,{status:'accepted',status_at:b.accepted_at,status_by:me.email}); save();
  // Offers fixes 2: Tim alone is emailed the locked dated copy at once (mirrors fn/offer_sign_handler.ts agreedNotice)
  let emailed=null; try{ agreedNoticeMock(o.id,false); emailed=true; }catch(_){ emailed=false; } save(); return {sha256:sha,existing:false,property_id:o.property_id,emailed}; }
// the email to Tim (src/mail-core.js agreedNotice) from the same data offer_agreed_notice_material (025) gives the function; nothing is sent
function agreedNoticeMock(oid,again){ const ag=OAG().find(x=>x.offer_id===oid); if(!ag) throw new Error("The agreement hasn't been made yet."); const o=PO().find(x=>x.id===oid), p=PT().find(x=>x.id===o.property_id);
  const doc=ODC().find(x=>x.id===ag.document_id), rd=ORN().find(x=>x.id===ag.round_id), layers=docLayers(doc.id,rd.doc_round), d=DB.offer_drafts.find(x=>x.id===doc.draft_id), pp=(d.placed||[]).find(x=>x.id==='price');
  const names=side=>((layers.filter(L=>L.side===side).sort((a,z)=>z.doc_round-a.doc_round)[0]||{}).signers||[]).map(x=>x.name), labels={}; ((ag.terms||{}).conditions||[]).forEach(c=>{ const i=window.OFFERS.condInfo(c.key); labels[c.key]=(i&&i.label)||c.key; });
  const dh=(DB.offer_deposit_holders||[]).filter(x=>x.offer_id===oid).sort((a,z)=>z.id-a.id)[0], big=localStorage.getItem('mockAgreedBig')==='1';
  const nt=window.MAIL.agreedNotice({address:p.address,agreement:ag,purchasers:names('purchaser'),vendors:names('vendor'),terms:ag.terms||{},layers,priceBoxes:pp?(pp.boxes&&pp.boxes.length?pp.boxes:[pp]):[],province:o.province||((OL().find(l=>l.property_id===o.property_id))||{}).province||'otago',offers:window.OFFERS,labels,
    depositHolder:dh?{holder:dh.holder,other:dh.other_text,by_default:dh.by_default}:null,kiwisaver:((ag.terms||{}).kiwisaver===true)||((o.details||{}).kiwisaver===true),portalUrl:`https://portal.dunnerstunner.co.nz/properties/${o.property_id}/offers/${o.id}`,attached:!big,tooBig:big,again});
  const agency=(DB.agreements||[]).filter(x=>x.property_id===o.property_id&&['signed','countersigned'].includes(x.status)).sort((a,z)=>String(z.created_at).localeCompare(String(a.created_at)))[0];
  sgMail(again?'offer_agreed_copy_again':'offer_agreed_copy','tim',{subject:nt.subject,body:nt.body,agreement_id:agency?agency.id:null,attachments:big?[]:[{name:'Agreement '+p.address+'.pdf',sha256:ag.sha256,path:ag.path}]}); return {attached:!big}; }
async function signInvoke(o){ const b=(o&&o.body)||{}, me=S&&S.user, net='h:'+mockNet(), ua=navigator.userAgent;
  const res=(data,status)=>status&&status>=400?{data:null,error:{message:String(status),context:{json:async()=>data}}}:{data,error:null};
  const calls=JSON.parse(localStorage.getItem('signCalls')||'[]'); calls.push(b.action); localStorage.setItem('signCalls',JSON.stringify(calls));
  if(offline()) return {data:null,error:{message:'Failed to fetch'}};
  const fail=e=>{ save(); return res({ok:false,error:e.message},400); };
  if(b.action==='send_mail'||b.action==='lock'||b.action==='agree'||b.action==='agreed_notice'){ if(!me||!AGENTS.includes(me.email)) return res({error:'Only Tim can do this'},403);
    try{ if(b.action==='lock') return res({ok:true,round:await sgLock(b.signing_id,me.email)});
      if(b.action==='agreed_notice'){ const r_=agreedNoticeMock(b.offer_id,true); save(); return res({ok:true,attached:r_.attached}); }
      if(b.action==='agree'){ if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(String(b.accepted_at||''))) return res({error:'Bad request'},400); return res({ok:true,agreement:await sgAgree(b,me)}); }
      // send_mail (mirrors fn/offer_sign_handler.ts and 024): take moves the draft to 'sending' with a pending log row of exactly what
      // goes; a second Send is refused; done records the outcome. localStorage mockMailDoneFail='1': recording fails after the mail went.
      const m=OMD().find(x=>x.id===b.draft_id); if(!m) throw new Error('No such email');
      if(m.status==='sending') throw new Error('This email is already being sent, or may have gone. Check before sending again'); if(m.status!=='draft') throw new Error('This email was already sent or set aside');
      mailCheck(m.offer_id,m.kind,m.signer_id,m.to_addr,m.cc_addr,m.subject,m.body,true); let link=null, tok=null;
      if(['sign_link','reopened'].includes(m.kind)&&holdActive(m.offer_id)) throw new Error('This offer is frozen or withdrawn, so no signing email goes');
      if(m.kind==='sign_link'){ const g=OSG().find(x=>x.id===m.signing_id), sr=OSR().find(x=>x.id===m.signer_id); const w=sgCurrent(g); if(w) throw new Error(w); if(sr.void_at||sr.finished_at||!['ready','signing'].includes(g.status)) throw new Error('Signing is held or finished, so no link is sent');
        tok=offerToken(); Object.assign(sr,{token_hash:shaS(tok),link_sent_at:now(),link_expires_at:new Date(Date.now()+14*864e5).toISOString(),session_hash:null,code_hash:null,code_tries:0}); link=location.origin+location.pathname+'?sign='+tok;
        g.status='signing'; g.sent_at=g.sent_at||now(); sgEv(g,me.email,'sign_links_sent',{signing_id:g.id,signers:1,signer:sr.position,round:g.round_no||1,side:g.side||'purchaser',draft_id:m.id}); }
      const att=m.attach?[{name:m.attach.name,sha256:m.attach.sha256}]:[];
      const L={id:OML().length+1,draft_id:m.id,offer_id:m.offer_id,property_id:m.property_id,kind:m.kind,to_addr:m.to_addr.slice(),cc_addr:(m.cc_addr||[]).slice(),subject:m.subject,body:String(m.body).split('[the signing link]').join(tok?'[personal link]':'[the signing link]'),attachments:att,sent_by:me.email,sent_at:now(),status:'pending',ok:null,error:null,done_at:null};
      OML().push(L); m.status='sending'; save();
      try{ sgMail(m.kind==='sign_link'?'offer_sign_link':m.kind==='reopened'?'offer_change_reopened':'offer_mail_'+m.kind,(m.to_addr||[]).join(', '),{side:(OSG().find(g=>g.id===m.signing_id)||{}).side||null,to_list:m.to_addr,cc:m.cc_addr,subject:m.subject,body:m.body,link,attachments:att,draft_id:m.id}); }
      catch(e){ Object.assign(L,{status:'failed',ok:false,error:String(e.message),done_at:now()}); Object.assign(m,{status:'draft',reviewed_at:null}); save(); return res({ok:false,error:"It didn't send. Nothing has gone. Try again."}); }
      if(localStorage.getItem('mockMailDoneFail')==='1'){ save(); return res({ok:false,maybe_sent:true,error:'This may have gone. Check before sending again.'}); }
      Object.assign(L,{status:'sent',ok:true,done_at:now()}); Object.assign(m,{status:'sent',sent_at:L.sent_at,sent_by:me.email}); OE().push({id:OE().length+1,property_id:m.property_id,offer_id:m.offer_id,at:now(),actor:me.email,kind:'mail_sent',detail:{draft_id:m.id,log_id:L.id,kind:m.kind,to:(m.to_addr||[]).length,cc:(m.cc_addr||[]).length}}); save(); return res({ok:true}); }
    catch(e){ return fail(e); } }
  const tok=String(b.token||''); if(!TOKEN_RE.test(tok)) return res({ok:false});
  const s=OSR().find(x=>x.token_hash&&x.token_hash===shaS(tok)&&x.link_expires_at>now());
  if(!s){ if(b.action==='open'&&hits('bad',net,null,36e5)<30){ OH().push({at:now(),kind:'bad',net}); save(); } return res({ok:false}); }
  const g=OSG().find(x=>x.id===s.signing_id), p=PT().find(x=>x.id===g.property_id);
  const mayAct=()=>!s.finished_at&&!s.void_at&&['signing','held'].includes(g.status), codeOk=()=>mayAct()&&!sgStopFor(s,g);   // 023/024: no code once stopped, frozen, replaced, or while their own request is with Tim
  const me_=()=>{ if(!mayAct()) throw new Error("This link isn't working. Ask Tim for a new one."); if(!/^[A-Za-z0-9_-]{40,64}$/.test(b.session||'')||s.session_hash!==shaS(b.session)||s.session_expires_at<now()) throw new Error('Please enter the code from your email again'); return s; };
  try{
    if(b.action==='open'){ if(!s.opened_at){ s.opened_at=now(); save(); } const e=s.email||''; return res({ok:true,first:s.name.split(' ')[0],address:p.address,finished:!!s.finished_at,stopped:sgStopFor(s,g),held:g.status==='held',side:g.side||'purchaser',round:g.round_no||1,email_hint:e.indexOf('@')>0?e[0]+'***@'+e.split('@')[1]:''}); }
    if(b.action==='send_code'){ if(hits('sign_code',net,null,36e5)>=20) return res({ok:false,reason:'busy'}); OH().push({at:now(),kind:'sign_code',net}); if(!codeOk()||!s.email){ save(); return res({ok:false,reason:'stopped'}); } const inWin=s.codes_window_at&&Date.parse(s.codes_window_at)>Date.now()-36e5; if(inWin&&s.codes_sent>=5) return res({ok:false,reason:'busy'});
      const code=String(Math.floor(Math.random()*1e6)).padStart(6,'0'); Object.assign(s,{code_hash:shaS('mocksalt:'+s.id+':'+code),code_expires_at:new Date(Date.now()+9e5).toISOString(),code_tries:0,codes_sent:inWin?s.codes_sent+1:1,codes_window_at:inWin?s.codes_window_at:now()});
      try{ sgMail('offer_sign_code',s.email,{code,subject:'Your signing code',body:'Your signing code is '+code+'\n\nFrom Tim McGuire, McGuire Real Estate.'}); }catch(_){ save(); return res({ok:false,reason:'mail'}); } save(); return res({ok:true}); }
    if(b.action==='verify'){ if(hits('sign_try',net,null,36e5)>=30) return res({ok:false,reason:'busy'}); OH().push({at:now(),kind:'sign_try',net}); if(!codeOk()){ save(); return res({ok:false,reason:'stopped'}); } if(!s.code_hash){ save(); return res({ok:false,reason:'no_code'}); } if(s.code_expires_at<now()) return res({ok:false,reason:'expired'}); const c=String(b.code||'').replace(/\s+/g,'');
      if(!/^[0-9]{6}$/.test(c)||s.code_hash!==shaS('mocksalt:'+s.id+':'+c)){ s.code_tries++; const t=s.code_tries>=5; if(t) s.code_hash=null; save(); return res({ok:false,reason:t?'tries':'wrong'}); }
      const ses=offerToken(); Object.assign(s,{code_hash:null,code_expires_at:null,code_tries:0,session_hash:shaS(ses),session_expires_at:new Date(Date.now()+72e5).toISOString(),verified_at:now(),user_agent:ua.slice(0,400),net_hash:net}); sgEv(g,s.name,'sign_code_ok',{signing_id:g.id,signer:s.position}); save(); return res({ok:true,session:ses}); }
    me_();
    if(b.action==='state'){ const d=DB.offer_drafts.find(x=>x.id===g.draft_id), bl=(window.__repoBlobs||{})[d.path];
      const ink=sgInk(s), mineT=liveTaps().filter(t=>t.signer_id===s.id).map(t=>({what:'tap',place_id:t.place_id,kind:null,page:null,at:t.at,ref:String(t.id).padStart(20,'0')})), mineM=liveMarks().filter(m=>m.signer_id===s.id).map(m=>({what:'change',place_id:null,kind:m.kind,page:m.page,at:m.at,ref:m.id}));
      const last=mineT.concat(mineM).sort((a,z)=>a.at<z.at?1:a.at>z.at?-1:(a.ref<z.ref?1:-1))[0]||null; if(last) delete last.ref;
      return res({ok:true,signer:{position:s.position,name:s.name,consent_at:s.consent_at,has_marks:!!ink.sig_png,sig_png:ink.sig_png,init_png:ink.init_png,finished_at:s.finished_at,void:!!s.void_at,receipts:OSC().filter(r=>r.signer_id===s.id).map(r=>({guide:r.guide,version:r.version,at:r.at})),last,ever_tapped:OST().some(t=>t.signer_id===s.id)},
        signing:{status:g.status,stopped:sgStopFor(s,g),pages:g.pages,cca_pages:g.cca_pages,draft_sha256:d.sha256,address:p.address,draft_url:bl&&s.consent_at?URL.createObjectURL(bl):null,
          places:g.places.filter(x=>x.signer===s.position).concat(liveReviews().filter(r=>r.signing_id===g.id).flatMap(r=>r.places.filter(x=>x.signer===s.position))),
          round:g.round_no||1,side:g.side||'purchaser',link_changes:!!g.link_changes,terms:{last:(d.edits||{}).term_last??null,retired:(d.edits||{}).retired_numbers||[],style:((d.placed||[]).find(x=>x.id==='further_terms')||{}).number_style||((d.edits||{}).term_last!=null?'dot0':null)},signers:OSR().filter(x=>x.signing_id===g.id&&!x.void_at).length,parties:g.side==='vendor'?offerParties(PO().find(x=>x.id===g.offer_id)):null,
          layers:(g.round_no||1)>1&&s.consent_at?docLayers(g.document_id,g.round_no-1):[],marks:sgMarksOf(g.id).map(m=>Object.assign(m,{mine:(OSM().find(k=>k.id===m.id)||{}).signer_id===s.id})),side_places:(g.round_no||1)>1?sgAllPlaces(g):[],
          revert:revertOffered(g)?{round:(g.round_no||1)-1}:null},taps:liveTaps().filter(t=>t.signer_id===s.id).sort((a,z)=>a.id-z.id).map(t=>t.place_id)}); }
    if(b.action==='undo'){ const r=sgUndo(s,b.scope==='turn'?'turn':b.scope==='last'?'last':b.scope,b.clear===true,s.name); save(); return res(Object.assign({ok:true},r)); }
    if(b.action==='consent'){ sgConsent(s,ua,net); save(); return res({ok:true}); }
    if(b.action==='receipt'){ sgReceipt(s,b.guide,b.version,b.file,b.sha256==null?null:b.sha256,b.pages); save(); return res({ok:true}); }
    if(b.action==='marks'){ sgMarks(s,b.sig,b.init); save(); return res({ok:true}); }
    if(b.action==='tap'){ const r=sgTap(s,b.place); save(); return res(Object.assign({ok:true},r)); }
    if(b.action==='change'){ if(!/^[0-9a-f-]{36}$/i.test(String(b.id||''))||!Number.isInteger(b.page)||!b.geometry||typeof b.geometry!=='object'||!Array.isArray(b.places)) return res({ok:false,error:"That change didn't save. Please try again."},400);
      if(g.link_changes!==true) throw new Error("Tim hasn't switched on changes from this link for this round. You can accept it, decline it, or use Ask Tim for a change");
      if(hits('sign_change',net,null,36e5)>=60) throw new Error('A lot of changes have been made from here in the last hour. Please call Tim on 027 562 7207'); OH().push({at:now(),kind:'sign_change',net});
      const r=sgChange(s,{p_id:b.id,p_kind:b.kind,p_page:b.page,p_geometry:b.geometry,p_target:b.target||null,p_places:b.places}); save();
      // 024: a draft for each reopened link signer, which Tim sends himself; no email to anyone now, Tim included (he hears once per round)
      if(r.reopened>0) (r.reopened_signers||[]).forEach(x=>{ if(!x.email||!x.id) return; try{ const w=window.MAIL.reopenedDraft({first:String(x.name||'').split(' ')[0],address:r.address,by:r.by,side:g.side}); mailInsert('system',{p_offer:g.offer_id,p_kind:'reopened',p_signer:x.id,p_to:[x.email],p_cc:[],p_subject:w.subject,p_body:w.body}); }catch(_){} }); save();
      return res({ok:true,id:r.id,reopened:r.reopened}); }
    // 029: added text or the signer's own initials, name or signature from their link; in Round 1 it holds the round and Tim alone is told
    if(b.action==='mark'){ if(!['note','strike','cross','reinstate','insert',...OWN_K].includes(String(b.kind))||(b.target!=null&&!/^[0-9a-f-]{36}$/i.test(String(b.target)))||!Number.isInteger(b.page)||!b.geometry||typeof b.geometry!=='object'||Array.isArray(b.geometry)) return res({ok:false,error:"That didn't save. Please try again."},400);
      const r=sgDoMark(s,b.kind,b.page,b.geometry,net,true,b.target||null); save(); let emailed=null;
      if(r.held){ emailed=true; try{ sgMail('offer_sign_marked','tim',{mark_kind:b.kind,page:b.page,subject:'A purchaser marked the offer: '+p.address,text:b.kind==='insert'?b.geometry.text:null}); }catch(_){ emailed=false; } }
      save(); return res({ok:true,id:r.id,held:r.held,emailed}); }
    if(b.action==='ask'){ if(s.void_at||['locked','replaced'].includes(g.status)) throw new Error('This version is no longer being signed'); if(holdActive(g.offer_id)) throw new Error(NEUTRAL_STOP); if(ORQ().some(r=>r.signer_id===s.id&&!r.handled_at)) throw new Error(ASKED_STOP); const t=String(b.text||'').trim(); if(t.length<3||t.length>1000) throw new Error('Please say what you would like changed (up to 1,000 characters)');
      OSA().push({id:OSA().length+1,signing_id:g.id,signer_id:s.id,text:t,at:now()}); sgEv(g,s.name,'sign_change_asked',{signing_id:g.id,signer:s.position,length:t.length,round:g.round_no||1,side:g.side||'purchaser'}); let emailed=true;
      const v=g.side==='vendor', later=(g.round_no||1)>1, decline=b.decline===true&&later, who=v?'vendor':later?'purchaser':'buyer';   // worded by side; a decline has its own subject
      try{ sgMail(decline?'offer_sign_decline':'offer_sign_ask','tim',{text:t,side:g.side||'purchaser',subject:decline?(v?'The vendors have declined the offer':"The purchasers have declined the vendors' counteroffer")+' for '+p.address:`A ${who} asks for a change: `+p.address}); }catch(_){ emailed=false; } save(); return res({ok:true,emailed}); }
    // 024 offer_sign_request: a party asks Tim to stop or withdraw; one urgent email to Tim at once; only this signer stops until he acts
    if(b.action==='request'){ const L={finance_changed:'Our financial situation has changed',contract_elsewhere:'We have entered a contract elsewhere',incapacitated:'One of our party is incapacitated',property_integrity:'We have concerns about the integrity of the property',property_viability:'We have concerns about the viability of the property',material_change:'Something important changed while signing was paused'};
      if(s.void_at||!['ready','signing','held','complete'].includes(g.status)||sgCurrent(g)) throw new Error(NEUTRAL_STOP); if(ORQ().some(x=>x.signer_id===s.id&&!x.handled_at)) throw new Error(ASKED_STOP); const kind=b.kind; if(!['freeze','withdraw','revert'].includes(kind)) throw new Error('Choose stop for now, or withdraw');
      if(kind==='revert'&&!revertOffered(g)) throw new Error('Going back is offered only after signing was paused on this round. Use Ask Tim for a change instead');
      if(!(b.reason_key in L)&&b.reason_key!=='other') throw new Error('Choose a reason'); const why=b.reason_key==='other'?String(b.reason||'').trim():L[b.reason_key]; if(why.length<3||why.length>500) throw new Error('Type the reason (3 to 500 characters)');
      if(ORQ().some(x=>x.signer_id===s.id&&!x.handled_at)||ORQ().filter(x=>x.signer_id===s.id&&Date.parse(x.at)>Date.now()-36e5).length>=5) throw new Error(ASKED_STOP);   // one open request at a time
      const rq={id:uid(),offer_id:g.offer_id,property_id:g.property_id,signing_id:g.id,signer_id:s.id,side:g.side||'purchaser',kind,reason_key:b.reason_key,reason:why,at:now(),net_hash:net,handled_at:null,handled_by:null,handled_as:null}; ORQ().push(rq);
      sgEv(g,s.name,'party_request',{request_id:rq.id,kind,side:rq.side,signer:s.position,round:g.round_no||1,reason_key:b.reason_key,reason:why}); let emailed=true; const v=rq.side==='vendor';
      try{ sgMail('offer_sign_request','tim',{side:rq.side,request:kind,reason:why,subject:window.MAIL.requestNotice({kind,side:rq.side,round:g.round_no||1,name:s.name,address:p.address,reason:why,portalUrl:''}).subject}); }catch(_){ emailed=false; } save(); return res({ok:true,emailed}); }
    if(b.action==='finish'){ const r=sgFinish(s,ua,net,null,null); save(); if(!r.complete) return res({ok:true,complete:false}); try{ const rd=await sgLock(r.signing_id,'system (last signer finished)'); return res({ok:true,complete:true,locked:true,round:rd.round}); }catch(_){ return res({ok:true,complete:true,locked:false}); } }
  }catch(e){ return fail(e); }
  return res({error:'Bad request'},400); }
window.supabase={createClient(){ return {
  from:q, rpc, functions:{invoke:(n,o)=>{ logCall('fn:'+n+(o&&o.body&&o.body.mode?':'+o.body.mode:'')); if(n==='property-lookup') return councilInvoke(o); if(n==='offer-public') return offerInvoke(o); if(n==='offer-draft') return draftInvoke(o); if(n==='offer-sign') return signInvoke(o); if(n==='repo-link') return repoLinkInvoke(o); if(n==='doc-prefill'&&o.body&&o.body.mode==='translate'){ const reqs=JSON.parse(localStorage.getItem('trReqs')||'[]'); reqs.push(o.body); localStorage.setItem('trReqs',JSON.stringify(reqs)); const m=localStorage.getItem('translateMode'); if(m==='off') return Promise.resolve({data:null,error:{message:'503',context:{json:async()=>({error:'not_set_up'})}}}); if(m==='noTool') return ok({ok:false,reason:'no_tool',message:"The AI didn't give a usable answer. Try again."}); const src=o.body.sources; const rej=m==='rejectFirst'?[src[0]]:[]; let cutL=[]; let use=src.filter(x=>!rej.includes(x)); if(m==='cutOff'){ const h=src.length>1?Math.floor(src.length/2):0; cutL=src.slice(h); use=src.slice(0,h); } const resp={ok:true,model:o.body.kind==='screens'||o.body.kind==='guide'?'claude-sonnet-5-5':'claude-haiku-5-5',cut_off:m==='cutOff',translations:use.map(x=>({source:x,text:'<'+o.body.lang+'> '+x})),rejected:rej.map(x=>({source:x,reason:'number changed'})).concat(cutL.map(x=>({source:x,reason:'cut off'}))),usage:{input:10,output:10}}; const D=+localStorage.getItem('translateDelay')||0; return D?new Promise(r=>setTimeout(()=>r({data:resp,error:null}),D)):ok(resp); }
    if(n==='doc-prefill'){ const mode=localStorage.getItem('prefillMode'); if(mode==='off') return Promise.resolve({data:null,error:{message:'503',context:{json:async()=>({error:'not_set_up'})}}}); return ok({ok:true,skipped:[],result:JSON.parse(localStorage.getItem('prefillResult'))}); }const a=JSON.parse(localStorage.getItem('inv')||'[]');a.push(n+':'+o.body.type);localStorage.setItem('inv',JSON.stringify(a));
    if(n==='notify'&&o.body.type==='form_signed'){ const fm=(DB.property_forms||[]).find(x=>x.id===o.body.form_id); if(fm&&fm.status==='signed'&&(fm.kind==='healthy_homes'||fm.countersigned_at)&&!fm.document_id&&fm.agreement_id===o.body.agreement_id){ const d={id:uid(),property_id:fm.property_id,kind:fm.kind==='healthy_homes'?'Healthy Homes checklist and statement':'Vendor Declaration',name:(fm.kind==='healthy_homes'?'Healthy-Homes-Checklist-and-Statement':'Vendor-Declaration')+'.pdf',path:'properties/'+fm.property_id+'/generated/'+fm.id+'.pdf',source:'generated',created_by:'system',created_at:now(),bucket:'private',folder:'agency'}; (DB.property_documents||=[]).push(d); fm.document_id=d.id; save(); } }
    return ok({ok:true});}},
  storage:{from(b){ if(b===RB) return repoBucket(); return{upload:(p)=>ok({path:p}),createSignedUrl:()=>ok({signedUrl:PNG1})}}},
  auth:{getSession:()=>ok({session:S}),onAuthStateChange(){},signInWithOtp:o=>{ try{ const l=JSON.parse(localStorage.getItem('otpLog')||'[]'); l.push(o||null); localStorage.setItem('otpLog',JSON.stringify(l)); }catch(_){} return ok({}); },   // otpLog: each sign-in link asked for, with where it brings the person back to
 signOut:async()=>{localStorage.removeItem('mocksession');}}
};}};
})();
