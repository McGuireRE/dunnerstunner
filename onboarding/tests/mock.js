(function(){
const DB = JSON.parse(localStorage.getItem('mockdb')||'null') || {agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};
const save=()=>localStorage.setItem('mockdb',JSON.stringify(DB));
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
localStorage.setItem('mockdb',JSON.stringify(DB));
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
    eq(k,v){filters.push(r=>r[k]===v);return b;}, neq(k,v){filters.push(r=>r[k]!==v);return b;}, is(k,v){filters.push(r=>(v===null?r[k]==null:r[k]===v));return b;}, in(k,vs){filters.push(r=>vs.includes(r[k]));return b;},
    order(k,o){order=[k,o&&o.ascending===false?-1:1];return b;}, limit(){return b;}, single(){single=true;return b;},
    then(res,rej){ if(localStorage.getItem('trHang')==='1'&&table==='user_language') return; try{ res(run()); }catch(e){ res({data:null,error:{message:e.message}}); } }
  };
  function run(){
    const T=(DB[table]||=[]);
    // photos and documents (migration 016): vendors see none of it; guard_property_document() on every write
    if(['property_documents','property_document_events','repo_kinds'].includes(table)){ const r0=repoTable(table,op,payload,op==='update'?T.filter(r=>filters.every(f=>f(r))):[],single); if(r0) return r0; }
    // after signing (migrations 009 and 010): these tables are for the agent only. A vendor sees and writes nothing; nobody writes the
    // stage record directly (agent_set_stage does) or removes a row from any of them.
    // migration 018: nobody but Tim reads the offer tables, nobody writes them directly, and an offer from the form changes only through the agent_offer_* functions
    if((OFFER_TABLES.includes(table)||table==='property_offers')&&!(S&&S.user)) throw new Error('permission denied for table '+table);
    if(OFFER_TABLES.includes(table)&&op!=='select') throw new Error('permission denied for table '+table);
    if(table==='offer_settings'&&op==='select') OSET();
    if(table==='property_offers'&&op==='insert'&&(Array.isArray(payload)?payload:[payload]).some(x=>x&&((x.source||'manual')!=='manual'||x.submission||x.details))) throw new Error('Offers from the form are only added through the form');
    if(table==='property_offers'&&op==='update'&&(DB.property_offers||[]).some(r=>filters.every(f=>f(r))&&(r.source||'manual')!=='manual')) throw new Error('Offers from the form are changed through the Offers tile, so there is a record');
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
const AGENT_ONLY=['property_events','campaign_stats','buyer_feedback','property_offers','offer_links','offer_events','offer_settings','offer_clauses','offer_hits'];
function mkNotices(ag){ if((ag.answers||{}).prior!=='yes') return; (DB.prior_agency_notices||=[]); (ag.answers.priorAgencies||[]).forEach((x,i)=>{ if(x.agency&&!DB.prior_agency_notices.some(n=>n.agreement_id===ag.id&&n.idx===i)) DB.prior_agency_notices.push({id:uid(),agreement_id:ag.id,idx:i,agency:x.agency,agent_name:x.agent||null,email:x.email||null,kind:x.kind,dated:x.dated||null,status:'to_send',created_at:now()}); }); }
const ok=d=>Promise.resolve({data:d,error:null}); const bad=m=>Promise.resolve({data:null,error:{message:m}});
function rpc(name,a){ logCall('rpc:'+name); if(['agent_repo_add','agent_repo_set','agent_repo_share','agent_repo_archive','vendor_repo_list','agent_property_export'].includes(name)) return repoRpc(name,a); if(localStorage.getItem('trHang')==='1'&&['get_translations','set_my_language'].includes(name)) return new Promise(()=>{}); const before=new Map((DB.agreements||[]).map(x=>[x.id,JSON.parse(JSON.stringify(x))]));
  // mockSaveDelay = ms: the inspection save answers late, as on a slow connection (the work is done when the answer arrives)
  let dl=0; try{ dl=+localStorage.getItem('mockSaveDelay')||0; }catch(_){} if(dl&&name==='agent_inspection_save') return new Promise(r=>setTimeout(()=>{ const out=rpcInner(name,a); save(); r(out); },dl));
  const res=rpcInner(name,a); (DB.agreements||[]).forEach(x=>{ const o=before.get(x.id); if(o&&JSON.stringify(o)!==JSON.stringify(x)) syncAgreement(x,o); }); save(); return res; }
function rpcInner(name,a){
  const me=S&&S.user; const ag=a&&a.a?DB.agreements.find(x=>x.id===a.a):null;
  const mine=()=>DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id);
  if(name.startsWith('agent_council_')) return councilRpc(name,a,me);
  if(name.startsWith('agent_offer_')) return offerRpc(name,a,me);
  if(name.startsWith('offer_public_')) return bad('permission denied for function '+name);
  const V=()=>(DB.agreement_variations||=[]), VS=()=>(DB.variation_signatures||=[]);
  const vafter=(vr)=>{ const rem=DB.agreement_people.filter(p=>p.agreement_id===vr.agreement_id&&p.legal_name&&p.signed_at&&!VS().some(s=>s.variation_id===vr.id&&s.person_id===p.id)).length; if(!rem){vr.status='signed';vr.signed_at=now();} save(); return ok({remaining:rem}); };
  if(name==='agent_new_variation'){ if(!['signed','countersigned'].includes(ag.status)) return bad('Only a signed agreement can be varied or extended'); if(V().some(v=>v.agreement_id===a.a&&['draft','sent'].includes(v.status))) return bad('Finish or withdraw the open variation first'); const n=V().filter(v=>v.agreement_id===a.a).reduce((m,v)=>Math.max(m,v.number),0)+1; const r={id:uid(),agreement_id:a.a,number:n,status:'draft',changes:{},summary:[],created_at:now()}; V().push(r); save(); return ok(r.id); }
  if(name==='agent_issue_variation'){ const vr=V().find(v=>v.id===a.v); if(vr.status!=='draft') return bad('issued'); if(!vr.summary.length) return bad('Choose at least one change'); VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:null,signer_role:'agent',signer_name:'Timothy McGuire',snapshot:a.p_snapshot,signed_at:now()}); vr.status='sent'; vr.sent_at=now(); vr.signing_mode=a.p_mode; save(); return ok(null); }
  if(name==='vendor_sign_variation'){ const vr=V().find(v=>v.id===a.v); const m=DB.agreement_people.find(p=>p.agreement_id===vr.agreement_id&&p.user_id===me.id); if(vr.status!=='sent') return bad('not open'); if(VS().some(s=>s.variation_id===vr.id&&s.person_id===m.id)) return bad('Already signed'); VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:m.id,signer_role:'client',signer_name:m.legal_name,snapshot:a.p_snapshot,signed_at:now()}); return vafter(vr); }
  if(name==='agent_sign_variation_in_person'){ const vr=V().find(v=>v.id===a.v); const pr=DB.agreement_people.find(p=>p.id===a.pid); if(vr.status!=='sent') return bad('not open'); VS().push({id:uid(),variation_id:vr.id,agreement_id:vr.agreement_id,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,snapshot:a.p_snapshot,signed_at:now()}); return vafter(vr); }
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
  if(name==='vendor_form_sign'){ const fm=PF().find(x=>x.id===a.f); if(!fm||!isParty(fm.agreement_id)) return bad('Not found'); if(fm.status==='signed') return bad('Already signed by everyone'); if(fm.kind==='healthy_homes'&&fm.status!=='ready') return bad("Tim hasn't finished the checklist yet"); const m=DB.agreement_people.find(p=>p.agreement_id===fm.agreement_id&&p.user_id===me.id&&p.signed_at); if(!m) return bad('Signer not found'); if(FS().some(s=>s.form_id===fm.id&&s.person_id===m.id)) return bad('Already signed'); const ce=fCheck(fm,m.id,a.p_image_path); if(ce) return bad(ce); return fSign(fm,m,a); }
  if(name==='agent_form_sign_in_person'){ if(!AGENTS.includes(me.email)) return bad('Not allowed'); const fm=PF().find(x=>x.id===a.f); if(!fm) return bad('Not found'); if(fm.status==='signed') return bad('Already signed by everyone'); if(fm.kind==='healthy_homes'&&fm.status!=='ready') return bad('Finish the checklist first'); const pr=DB.agreement_people.find(p=>p.id===a.pid&&p.agreement_id===fm.agreement_id&&p.signed_at); if(!pr) return bad('Signer not found'); if(FS().some(s=>s.form_id===fm.id&&s.person_id===pr.id)) return bad('Already signed'); const ce=fCheck(fm,pr.id,a.p_image_path); if(ce) return bad(ce); return fSign(fm,pr,a,{signing_method:"In person, on the licensee's device",witnessed_by:'Timothy McGuire'}); }
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
  if(name==='vendor_forward_to_lawyer'){ if(!mine()) return bad('Not your agreement'); if(!['signed','countersigned'].includes(ag.status)) return bad('not signed'); DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_by:mine().legal_name,sent_at:now(),open_count:0}); save(); return ok(null);}
  if(name==='vendor_request_cancellation'){ const m=DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id); if(!['signed','countersigned'].includes(ag.status)) return bad('state'); if(DB.cancellation_requests.some(r=>r.agreement_id===a.a&&r.status!=='processed')) return bad('A cancellation request is already with Tim'); const r={id:uid(),agreement_id:a.a,person_id:m.id,requested_by:m.legal_name,reasons:a.p_reasons||null,phone:a.p_phone,acks:a.p_acks,requested_at:now(),within_cooling_off:true,status:'requested'}; DB.cancellation_requests.push(r); save(); return ok(r.id);}
  if(name==='agent_process_cancellation'){ const r=DB.cancellation_requests.find(x=>x.id===a.rid); r.status='processed'; r.outcome=a.p_outcome; r.agent_notes=a.p_notes; r.processed_at=now(); if(a.p_outcome==='cancelled'){ const g=DB.agreements.find(x=>x.id===r.agreement_id); g.status='cancelled'; } save(); return ok(null);}
  if(name==='agent_set_legal'){ ag.legal=Object.assign({},ag.legal,{choice:a.choice}); if(['draft','parked'].includes(ag.status)) ag.status='sent'; save(); return ok(null);}
  if(name==='agent_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name}); save(); return ok(uid());}
  if(name==='agent_sign_in_person'){ if(!['draft','sent'].includes(ag.status)) return bad('closed'); if(!['have','waive'].includes((ag.legal||{}).choice)) return bad('legal'); { const an=ag.answers||{}; if(!Array.isArray(an.guide)||!Array.isArray(an.acks)||[0,1,2,3,4,5,6,7].some(i=>!an.guide.includes(String(i)))) return bad('Tick each section of the plain-English guide once you\'ve been through it together'); if([0,1,2,3,4,5,6,7,8,9,10].some(i=>!an.acks.includes(String(i)))) return bad('Tick each item under "Before signing" first'); } const pr=DB.agreement_people.find(x=>x.id===a.pid); if(!pr||pr.signed_at) return bad('signer'); if(ag.status==='draft') ag.status='sent'; pr.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abcdef0123456789ffff',signed_at:now()}); const rem=DB.agreement_people.filter(x=>x.agreement_id===a.a&&x.legal_name&&!x.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-11-03T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
  if(!['agent_end_agency','agent_set_legal','agent_send_to_lawyer','agent_sign_in_person','vendor_request_cancellation','agent_process_cancellation'].includes(name)){ if(!mine()) return bad('Not your agreement'); if(!['sent','parked'].includes(ag.status)) return bad('closed'); }
  if(name==='vendor_save'){ Object.assign(ag.answers,a.patch); save(); return ok(null);}
  if(name==='vendor_upsert_person'){ let r; if(a.pid){ r=DB.agreement_people.find(p=>p.id===a.pid); const pl={legal_name:a.p_legal,pref_name:a.p_pref,phone:a.p_phone}; try{ guard('agreement_people',r,pl); }catch(e){ return bad(e.message); } Object.assign(r,pl); } else { r={id:uid(),agreement_id:a.a,position:9,legal_name:a.p_legal,pref_name:a.p_pref,email:a.p_email,phone:a.p_phone}; DB.agreement_people.push(r); } personSync(r); save(); return ok(null);}
  if(name==='vendor_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name,firm:a.l_firm}); save(); return ok(null);}
  if(name==='vendor_set_legal'){ ag.status='sent'; ag.legal=Object.assign({},ag.legal,{choice:a.choice}); save(); return ok(null);}
  if(name==='vendor_sign'){ const m=mine(); if(!['have','waive'].includes(ag.legal.choice)) return bad('legal'); const an=ag.answers||{}; if(!Array.isArray(an.guide)||!Array.isArray(an.acks)||[0,1,2,3,4,5,6,7].some(i=>!an.guide.includes(String(i)))) return bad('Please go through each part of the agreement before signing'); if([0,1,2,3,4,5,6,7,8,9,10].some(i=>!an.acks.includes(String(i)))) return bad('Please tick each item on the Before you sign page first'); m.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:m.id,signer_role:'client',signer_name:m.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abc123def4567890ffff',signed_at:now()}); const rem=DB.agreement_people.filter(p=>p.agreement_id===a.a&&p.legal_name&&!p.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-10-27T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
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
const OFFER_TABLES=['offer_links','offer_events','offer_settings','offer_clauses','offer_hits'];
const OL=()=>(DB.offer_links||=[]), OE=()=>(DB.offer_events||=[]), OH=()=>(DB.offer_hits||=[]), PO=()=>(DB.property_offers||=[]);
const OSET=()=>{ DB.offer_settings||=[]; if(!DB.offer_settings.length) DB.offer_settings.push({id:true,ks_warn_working_days:15,ai_daily_cap:40,updated_at:now()}); return DB.offer_settings[0]; };
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
  const errs=O.validate(Object.assign({},p,{email:agent&&!t(p.email)?'x@x.nz':p.email}),{skipDates:true});
  if(errs.length) throw new Error(errs[0].text.replace(/\.$/,''));
  const today=nzToday0(), minDay=agent?O.addDays(today,-90):today, maxDay=O.addDays(today,1100), dOk=d=>{ if(!d) return null; if(!O.isDate(d)||d<minDay||d>maxDay) throw new Error('The date for a condition needs to be from today to three years ahead'); return d; };
  const keys=O.CONDITIONS.map(c=>c.key).concat('custom'), seen=[];
  const conds=(p.conditions||[]).map(c=>{ if(!keys.includes(c.key)||seen.includes(c.key)) throw new Error('Please check the conditions'); seen.push(c.key);
    const n=c.days===''||c.days==null?null:Math.floor(+c.days); const d=dOk(t(c.date)); if(!d&&!(n>=1&&n<=250)) throw new Error('Please add the working days or a date for each condition');
    const o={key:c.key}; if(d) o.date=d; else o.days=n; if(c.key==='technical') o.detail=cap(c.detail,300,'the kind of technical report'); if(c.key==='custom'){ const w=cap(c.wording,2000,'your condition'), r=cap(c.request,600,'your description'); if(w) o.wording=w; if(r) o.request=r; o.ai=c.ai===true; } return o; });
  const s=p.settlement||{}; const settlement=s.kind==='date'?{kind:'date',date:dOk(t(s.date))}:{kind:'relative',days:Math.floor(+s.days)};
  if(settlement.kind==='relative'&&!(settlement.days>=1&&settlement.days<=250)) throw new Error('Please add the settlement working days');
  const lw=p.lawyer||{};
  return {email:(cap(p.email,254,'your email')||'').toLowerCase()||null,phone:cap(p.phone,40,'your phone number'),seen_docs:p.seen_docs,sign:p.sign,price:+String(p.price).replace(/[$, ]/g,''),settlement,conditions:conds,lawyer_approval:seen.includes('lawyer'),
    sale_address:seen.includes('sale')?cap(p.sale_address,300,'the address'):null,kiwisaver:p.kiwisaver,entity:cap(p.entity,200,'the company or trust name'),nominee:p.nominee!==false,
    purchasers:(p.purchasers||[]).map(x=>({first:cap(x.first,120,'first names'),last:cap(x.last,120,'last name'),email:(cap(x.email,254,'email')||'').toLowerCase()||null,phone:cap(x.phone,40,'phone')})),
    chattels_add:(p.chattels_add||[]).map(x=>cap(x,200,'each chattel')).filter(Boolean),chattels_exclude:(p.chattels_exclude||[]).map(x=>cap(x,200,'each chattel')).filter(Boolean),
    gst_registered:typeof p.gst_registered==='boolean'?p.gst_registered:null,gst_number:p.gst_registered===true?cap(p.gst_number,40,'the GST number'):null,
    comments:cap(p.comments,3000,'your comments'),lawyer:{firm:cap(lw.firm,200,'the law firm'),person:cap(lw.person,200,'the lawyer'),email:(cap(lw.email,254,'email')||'').toLowerCase()||null,phone:cap(lw.phone,40,'phone')},
    related:p.related,date_help:p.date_help===true,privacy:true,v:1}; }
const offerLabel=d=>(d.entity||(d.purchasers||[]).map(x=>((x.first||'')+' '+(x.last||'')).trim()).join(', ')).slice(0,200);
function offerRow(pid,d,source,by,prov){ const r={id:uid(),property_id:pid,agreement_id:null,received_at:now(),buyer_ref:offerLabel(d),amount:d.price,conditions:d.conditions.map(c=>c.key).join(', '),expires_at:null,status:'received',notes:null,entered_by:by,created_at:now(),updated_at:now(),
  source,submission:JSON.parse(JSON.stringify(d)),details:d,kiwisaver:d.kiwisaver,lawyer_approval:d.lawyer_approval,needs_date_help:d.date_help,related_party:d.related,province:prov||'otago',as_at:nzToday0(),read_at:source==='agent'?now():null,read_by:source==='agent'?by:null,
  status_at:null,status_by:null,gap_override_reason:null,gap_override_by:null,gap_override_at:null,net_hash:source==='buyer'?'h:'+mockNet().length:null,notified_at:null,notify_error:null}; PO().push(r); OE().push({id:OE().length+1,property_id:pid,offer_id:r.id,at:now(),actor:by,kind:'submitted',detail:{source}}); return r; }
function offerInvoke(o){ const b=(o&&o.body)||{}, net=mockNet(); const res=(data,status)=>status&&status>=400?Promise.resolve({data:null,error:{message:String(status),context:{json:async()=>data}}}):ok(data);
  const calls=JSON.parse(localStorage.getItem('offerCalls')||'[]'); calls.push(b.action); localStorage.setItem('offerCalls',JSON.stringify(calls));
  if(offline()) return Promise.resolve({data:null,error:{message:'Failed to fetch'}});
  if(!['info','submit'].includes(b.action)) return res({error:'Bad request'},400);
  if(!TOKEN_RE.test(String(b.token||''))) return ok({ok:false});
  if(hits('bad',net,null,36e5)>=30) return ok({ok:false,reason:'busy'});
  const l=offerLive(b.token); if(!l){ OH().push({at:now(),kind:'bad',net}); save(); return ok({ok:false,reason:b.action==='submit'?'closed':undefined}); }
  const p=PT().find(x=>x.id===l.property_id);
  if(b.action==='info'){ OH().push({at:now(),kind:'info',net,property_id:l.property_id}); save(); const w={}; (DB.offer_clauses||[]).forEach(c=>{ if(c.wording) w[c.key]=c.wording; }); return ok({ok:true,open:true,address:p.address,province:l.province,ks_days:OSET().ks_warn_working_days,wording:w,chattels:(l.chattels||[]).slice()}); }
  if(typeof b.website==='string'&&b.website.trim()) return ok({ok:true,ref:'RECEIVED'});
  if(hits('submit',net,null,6e5)>=3||hits('submit',net,null,864e5)>=10||hits('submit',null,l.property_id,6e5)>=6||hits('submit',null,l.property_id,864e5)>=30) return ok({ok:false,reason:'busy'});
  let d; try{ d=offerClean(b.offer,false); }catch(e){ return res({ok:false,error:e.message},400); } d.chattels_listed=(l.chattels||[]).slice();   // the list shown comes from the link, never the page
  OH().push({at:now(),kind:'submit',net,property_id:l.property_id}); const r=offerRow(l.property_id,d,'buyer','buyer form',l.province);
  (DB.email_log||=[]).push({id:(DB.email_log.length+1),agreement_id:null,at:now(),kind:'offer_received',recipients:'tim',subject:'New offer: '+p.address,ok:true,mock:true}); r.notified_at=now(); save();
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
  return ok({ok:true,draft:true,wording:'This agreement is conditional upon the purchaser being satisfied that '+t.replace(/[<>]/g,'').slice(0,120)+', by the condition date.',summary:'You check this before the agreement goes ahead.'}); }
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
  if(name==='agent_offer_correct'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); const note=String(a.p_note||'').trim(); if(note.length<3||note.length>500) return bad('Say what changed and how you heard (3 to 500 characters)');
    let d; try{ d=offerClean(a.p_details,true); }catch(e){ return bad(e.message); } d.chattels_listed=(o.details.chattels_listed||[]).slice(); const before=o.details; Object.assign(o,{details:d,amount:d.price,conditions:d.conditions.map(c=>c.key).join(', '),buyer_ref:offerLabel(d),kiwisaver:d.kiwisaver,lawyer_approval:d.lawyer_approval,needs_date_help:d.date_help,related_party:d.related,updated_at:now()}); ev(o.property_id,o.id,'corrected',{note,before,after:d}); return ok(d); }
  if(name==='agent_offer_status'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); if(!['withdrawn','lapsed','received'].includes(a.p_status)) return bad('Choose withdrawn or lapsed'); const at=a.p_at||now();
    if(Date.parse(at)>Date.now()+3e5||Date.parse(at)<Date.parse(o.received_at)-6e4) return bad('The time needs to be between when the offer came in and now'); const from=o.status; o.status=a.p_status; o.status_at=a.p_status==='received'?null:at; o.status_by=me.email; ev(o.property_id,o.id,'status',{from,to:a.p_status,at,note:(a.p_note||'').trim()||null}); return ok(null); }
  if(name==='agent_offer_read'){ const o=PO().find(x=>x.id===a.p_offer); if(!o) return bad('No such offer'); if(!o.read_at){ o.read_at=now(); o.read_by=me.email; ev(o.property_id,o.id,'read'); } return ok(null); }
  if(name==='agent_offer_gap'){ const o=fnd(a.p_offer); if(!o) return bad('No such offer'); const r=String(a.p_reason||'').trim()||null; if(r&&(r.length<5||r.length>500)) return bad('Give your reason (5 to 500 characters)');
    o.gap_override_reason=r; o.gap_override_by=r?me.email:null; o.gap_override_at=r?now():null; ev(o.property_id,o.id,r?'gap_override':'gap_override_cleared',{reason:r}); return ok(null); }
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
const rk=k=>{ const L=RKS(), i=L.findIndex(x=>x[0]===k); return i<0?null:{kind:L[i][0],folder:L[i][1],shareable:!!L[i][2],exportable:!!L[i][3],position:i}; };
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
    SO()[p]={size:blob.size,mime}; (window.__repoBlobs||={})[p]=blob; save(); return ok({path:p}); },
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
window.supabase={createClient(){ return {
  from:q, rpc, functions:{invoke:(n,o)=>{ logCall('fn:'+n+(o&&o.body&&o.body.mode?':'+o.body.mode:'')); if(n==='property-lookup') return councilInvoke(o); if(n==='offer-public') return offerInvoke(o); if(n==='doc-prefill'&&o&&o.body&&o.body.mode==='offer_condition') return offerDraftInvoke(o); if(n==='repo-link') return repoLinkInvoke(o); if(n==='doc-prefill'&&o.body&&o.body.mode==='translate'){ const reqs=JSON.parse(localStorage.getItem('trReqs')||'[]'); reqs.push(o.body); localStorage.setItem('trReqs',JSON.stringify(reqs)); const m=localStorage.getItem('translateMode'); if(m==='off') return Promise.resolve({data:null,error:{message:'503',context:{json:async()=>({error:'not_set_up'})}}}); const src=o.body.sources; const rej=m==='rejectFirst'?[src[0]]:[]; let cutL=[]; let use=src.filter(x=>!rej.includes(x)); if(m==='cutOff'){ const h=src.length>1?Math.floor(src.length/2):0; cutL=src.slice(h); use=src.slice(0,h); } const resp={ok:true,model:o.body.kind==='screens'||o.body.kind==='guide'?'claude-sonnet-5-5':'claude-haiku-5-5',cut_off:m==='cutOff',translations:use.map(x=>({source:x,text:'<'+o.body.lang+'> '+x})),rejected:rej.map(x=>({source:x,reason:'number changed'})).concat(cutL.map(x=>({source:x,reason:'cut off'}))),usage:{input:10,output:10}}; const D=+localStorage.getItem('translateDelay')||0; return D?new Promise(r=>setTimeout(()=>r({data:resp,error:null}),D)):ok(resp); }
    if(n==='doc-prefill'){ const mode=localStorage.getItem('prefillMode'); if(mode==='off') return Promise.resolve({data:null,error:{message:'503',context:{json:async()=>({error:'not_set_up'})}}}); return ok({ok:true,skipped:[],result:JSON.parse(localStorage.getItem('prefillResult'))}); }const a=JSON.parse(localStorage.getItem('inv')||'[]');a.push(n+':'+o.body.type);localStorage.setItem('inv',JSON.stringify(a));
    if(n==='notify'&&o.body.type==='form_signed'){ const fm=(DB.property_forms||[]).find(x=>x.id===o.body.form_id); if(fm&&fm.status==='signed'&&(fm.kind==='healthy_homes'||fm.countersigned_at)&&!fm.document_id&&fm.agreement_id===o.body.agreement_id){ const d={id:uid(),property_id:fm.property_id,kind:fm.kind==='healthy_homes'?'Healthy Homes checklist and statement':'Vendor Declaration',name:(fm.kind==='healthy_homes'?'Healthy-Homes-Checklist-and-Statement':'Vendor-Declaration')+'.pdf',path:'properties/'+fm.property_id+'/generated/'+fm.id+'.pdf',source:'generated',created_by:'system',created_at:now(),bucket:'private',folder:'agency'}; (DB.property_documents||=[]).push(d); fm.document_id=d.id; save(); } }
    return ok({ok:true});}},
  storage:{from(b){ if(b===RB) return repoBucket(); return{upload:(p)=>ok({path:p}),createSignedUrl:()=>ok({signedUrl:PNG1})}}},
  auth:{getSession:()=>ok({session:S}),onAuthStateChange(){},signInWithOtp:()=>ok({}),signOut:async()=>{localStorage.removeItem('mocksession');}}
};}};
})();
