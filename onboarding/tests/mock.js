(function(){
const DB = JSON.parse(localStorage.getItem('mockdb')||'null') || {agreements:[],agreement_people:[],agreement_events:[],signatures:[],lawyer_links:[],aml_files:[],aml_events:[],email_log:[],cancellation_requests:[]};
const save=()=>localStorage.setItem('mockdb',JSON.stringify(DB));
const uid=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
const S = JSON.parse(localStorage.getItem('mocksession')||'null');
function q(table){
  let rows=null, op='select', payload=null, filters=[], single=false, sel='*', order=null, wantSel=false;
  const b={
    select(c){ if(op==='select'){sel=c||'*';} else wantSel=true; return b;},
    insert(p){op='insert';payload=p;return b;}, update(p){op='update';payload=p;return b;}, delete(){op='delete';return b;},
    eq(k,v){filters.push(r=>r[k]===v);return b;}, neq(k,v){filters.push(r=>r[k]!==v);return b;}, in(k,vs){filters.push(r=>vs.includes(r[k]));return b;},
    order(k,o){order=[k,o&&o.ascending===false?-1:1];return b;}, limit(){return b;}, single(){single=true;return b;},
    then(res,rej){ try{ res(run()); }catch(e){ res({data:null,error:{message:e.message}}); } }
  };
  function run(){
    const T=(DB[table]||=[]);
    if(op==='insert'){ const arr=(Array.isArray(payload)?payload:[payload]).map(p=>{const r=Object.assign({id:uid(),created_at:now(),updated_at:now()},p); if(table==='agreements'){r.ref=r.ref||'MRE-2026-'+(1001+T.length); r.status=r.status||'draft'; r.config=r.config||{}; r.answers=r.answers||{}; r.legal=r.legal||{}; r.agreement_version='v3.15-26102026';} if(table.endsWith('events')) r.at=now(); if(table==='signatures') r.signed_at=now(); if(table==='agreement_variations'){r.status='draft';} if(table==='prelistings'){r.status=r.status||'appraisal';r.answers=r.answers||{};r.plan=r.plan||{};} T.push(r); return r;}); save(); return {data: single?arr[0]:arr, error:null}; }
    let out=T.filter(r=>filters.every(f=>f(r)));
    if(op==='update'){ out.forEach(r=>{ if(table==='aml_files'&&r.locked_at&&payload.data) throw new Error('locked'); Object.assign(r,payload,{updated_at:now()}); if(table==='aml_files'&&payload.locked_at){ const p=DB.agreement_people.find(x=>x.id===r.person_id); if(p)p.id_verified_at=payload.locked_at; } }); save(); return {data:out,error:null}; }
    if(op==='delete'){ DB[table]=T.filter(r=>!out.includes(r)); save(); return {data:null,error:null}; }
    out=out.map(r=>{ const c=Object.assign({},r); if(sel.includes('agreement_people(')) c.agreement_people=DB.agreement_people.filter(p=>p.agreement_id===r.id); return c;});
    if(order) out.sort((a,b)=>(a[order[0]]>b[order[0]]?1:-1)*order[1]);
    return {data: single?out[0]:out, error: single&&!out[0]?{message:'not found'}:null};
  }
  return b;
}
const AGENTS=['hello@timmcguire.co.nz'];
function mkNotices(ag){ if((ag.answers||{}).prior!=='yes') return; (DB.prior_agency_notices||=[]); (ag.answers.priorAgencies||[]).forEach((x,i)=>{ if(x.agency&&!DB.prior_agency_notices.some(n=>n.agreement_id===ag.id&&n.idx===i)) DB.prior_agency_notices.push({id:uid(),agreement_id:ag.id,idx:i,agency:x.agency,agent_name:x.agent||null,email:x.email||null,kind:x.kind,dated:x.dated||null,status:'to_send',created_at:now()}); }); }
const ok=d=>Promise.resolve({data:d,error:null}); const bad=m=>Promise.resolve({data:null,error:{message:m}});
function rpc(name,a){
  const me=S&&S.user; const ag=a&&a.a?DB.agreements.find(x=>x.id===a.a):null;
  const mine=()=>DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id);
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
    if(name==='pl_submit'){ if(r.status!=='appraisal') return bad('sent'); const os=(a.patch.owners||[]); if(!os.length||os.some(o=>!o.name||!o.email)) return bad("Add each owner's full name and email"); Object.assign(r.answers,a.patch); r.status='submitted'; r.submitted_at=now(); save(); return ok(null); }
    if(name==='pl_question'){ if(!['plan','question'].includes(r.status)) return bad('no plan'); r.status='question'; r.question=a.q; r.question_at=now(); save(); return ok(null); }
    if(name==='pl_accept'){ if(r.status!=='plan') return bad('tick first'); const aid=uid(); DB.agreements.push({id:aid,ref:'MRE-2026-'+(1001+DB.agreements.length),address:r.address,status:'draft',config:{appr:'done',ask:'875000',askBasis:'median',flat:'',thr:'250000',pct:'',aml:'Manual',approach:'invited',method:r.appraisal.method,prelisting_id:r.id},answers:{_from_prelisting:true},legal:{},agreement_version:'v3.15-26102026',created_at:now(),updated_at:now()}); (r.answers.owners||[]).forEach((o,i)=>DB.agreement_people.push({id:uid(),agreement_id:aid,position:i+1,legal_name:o.name,pref_name:o.pref||'',email:o.email.toLowerCase(),phone:o.mobile||''})); r.status='accepted'; r.accepted_at=now(); r.agreement_id=aid; save(); return ok(aid); }
    if(name==='pl_signing_ready'){ const g=DB.agreements.find(x=>x.id===r.agreement_id); return ok(!!g&&g.status!=='draft'); }
  }
  if(name==='is_agent') return ok(AGENTS.includes(me.email));
  if(name==='claim_my_agreements'){ DB.agreement_people.forEach(p=>{ if(p.email.toLowerCase()===me.email&&!p.user_id) p.user_id=me.id;}); save(); return ok([...new Set(DB.agreement_people.filter(p=>p.user_id===me.id).map(p=>p.agreement_id))].filter(id=>DB.agreements.find(x=>x.id===id).status!=='draft')); }
  if(name==='vendor_forward_to_lawyer'){ if(!mine()) return bad('Not your agreement'); if(!['signed','countersigned'].includes(ag.status)) return bad('not signed'); DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_by:mine().legal_name,sent_at:now(),open_count:0}); save(); return ok(null);}
  if(name==='vendor_request_cancellation'){ const m=DB.agreement_people.find(p=>p.agreement_id===a.a&&p.user_id===me.id); if(!['signed','countersigned'].includes(ag.status)) return bad('state'); if(DB.cancellation_requests.some(r=>r.agreement_id===a.a&&r.status!=='processed')) return bad('A cancellation request is already with Tim'); const r={id:uid(),agreement_id:a.a,person_id:m.id,requested_by:m.legal_name,reasons:a.p_reasons||null,phone:a.p_phone,acks:a.p_acks,requested_at:now(),within_cooling_off:true,status:'requested'}; DB.cancellation_requests.push(r); save(); return ok(r.id);}
  if(name==='agent_process_cancellation'){ const r=DB.cancellation_requests.find(x=>x.id===a.rid); r.status='processed'; r.outcome=a.p_outcome; r.agent_notes=a.p_notes; r.processed_at=now(); if(a.p_outcome==='cancelled'){ const g=DB.agreements.find(x=>x.id===r.agreement_id); g.status='cancelled'; } save(); return ok(null);}
  if(name==='agent_set_legal'){ ag.legal=Object.assign({},ag.legal,{choice:a.choice}); if(['draft','parked'].includes(ag.status)) ag.status='sent'; save(); return ok(null);}
  if(name==='agent_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name}); save(); return ok(uid());}
  if(name==='agent_sign_in_person'){ if(!['draft','sent'].includes(ag.status)) return bad('closed'); if(!['have','waive'].includes((ag.legal||{}).choice)) return bad('legal'); const pr=DB.agreement_people.find(x=>x.id===a.pid); if(!pr||pr.signed_at) return bad('signer'); if(ag.status==='draft') ag.status='sent'; pr.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:pr.id,signer_role:'client',signer_name:pr.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abcdef0123456789ffff',signed_at:now()}); const rem=DB.agreement_people.filter(x=>x.agreement_id===a.a&&x.legal_name&&!x.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-11-03T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
  if(!['agent_end_agency','agent_set_legal','agent_send_to_lawyer','agent_sign_in_person','vendor_request_cancellation','agent_process_cancellation'].includes(name)){ if(!mine()) return bad('Not your agreement'); if(!['sent','parked'].includes(ag.status)) return bad('closed'); }
  if(name==='vendor_save'){ Object.assign(ag.answers,a.patch); save(); return ok(null);}
  if(name==='vendor_upsert_person'){ if(a.pid){ Object.assign(DB.agreement_people.find(p=>p.id===a.pid),{legal_name:a.p_legal,pref_name:a.p_pref,phone:a.p_phone}); } else DB.agreement_people.push({id:uid(),agreement_id:a.a,position:9,legal_name:a.p_legal,pref_name:a.p_pref,email:a.p_email,phone:a.p_phone}); save(); return ok(null);}
  if(name==='vendor_send_to_lawyer'){ DB.lawyer_links.push({id:uid(),agreement_id:a.a,lawyer_name:a.l_name,firm:a.l_firm,email:a.l_email,sent_at:now(),open_count:0}); ag.status='parked'; ag.legal=Object.assign({},ag.legal,{status:'sent',lawyer:a.l_name,firm:a.l_firm}); save(); return ok(null);}
  if(name==='vendor_set_legal'){ ag.status='sent'; ag.legal=Object.assign({},ag.legal,{choice:a.choice}); save(); return ok(null);}
  if(name==='vendor_sign'){ const m=mine(); if(!['have','waive'].includes(ag.legal.choice)) return bad('legal'); m.signed_at=now(); DB.signatures.push({id:uid(),agreement_id:a.a,person_id:m.id,signer_role:'client',signer_name:m.legal_name,image_path:a.p_image_path,snapshot:a.p_snapshot,snapshot_sha256:'abc123def4567890ffff',signed_at:now()}); const rem=DB.agreement_people.filter(p=>p.agreement_id===a.a&&p.legal_name&&!p.signed_at).length; if(!rem){ag.status='signed';ag.signed_at=now();ag.cooling_off_until='2026-10-27T04:00:00Z';mkNotices(ag);} save(); return ok({remaining:rem});}
  if(name==='agent_end_agency'){ ag.status='ended'; save(); return ok(null);}
  return bad('unknown rpc '+name);
}
window.supabase={createClient(){ return {
  from:q, rpc, functions:{invoke:(n,o)=>{ if(n==='doc-prefill'){ const mode=localStorage.getItem('prefillMode'); if(mode==='off') return Promise.resolve({data:null,error:{message:'503',context:{json:async()=>({error:'not_set_up'})}}}); return ok({ok:true,skipped:[],result:JSON.parse(localStorage.getItem('prefillResult'))}); }const a=JSON.parse(localStorage.getItem('inv')||'[]');a.push(n+':'+o.body.type);localStorage.setItem('inv',JSON.stringify(a));return ok({ok:true});}},
  storage:{from(){return{upload:(p)=>ok({path:p}),createSignedUrl:()=>ok({signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='})}}},
  auth:{getSession:()=>ok({session:S}),onAuthStateChange(){},signInWithOtp:()=>ok({}),signOut:async()=>{localStorage.removeItem('mocksession');}}
};}};
})();
