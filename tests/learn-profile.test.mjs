import test from 'node:test';
import assert from 'node:assert/strict';
import {learningPreview,mergeLearned} from '../extension/core/learn-profile.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {pageSummary} from '../extension/core/page-summary.mjs';
import {semanticLabel} from '../extension/core/semantics.mjs';
const origin='https://jobs.example.invalid';
const fact=(id,label,value,entity='',section='基本信息')=>({id,label,value,entity,section,source:'synthetic fixture',confirmed:true});
const cap=(fields)=>({fields:fields.map((f,i)=>({id:'f'+i,type:'text',section:'基本信息',...f}))});
test('learning suggests only selected-context fields and never treats them as already saved',()=>{
 const profile={facts:[fact('e','邮箱','a@example.invalid')]};
 const preview=learningPreview(cap([{label:'爱好',value:'SYNTHETIC READING'},{label:'邮箱',value:'a@example.invalid'},{label:'密码',value:'NEVER_CAPTURE'},{label:'验证码',value:'NEVER_CAPTURE'}]),profile,origin);
 assert.equal(preview.items.length,2);assert.equal(preview.items[0].state,'new');assert.equal(preview.items[1].state,'duplicate');assert.equal(profile.facts.length,1);
 assert(!JSON.stringify(preview).includes('NEVER_CAPTURE'));
});
test('learned facts remain local/site-scoped; explicit selections do not overwrite previous values',()=>{
 const profile={revision:1,facts:[fact('e','邮箱','a@example.invalid')]};
 const p=learningPreview(cap([{label:'爱好',value:'SYNTHETIC READING'},{label:'邮箱',value:'different@example.invalid'}]),profile,origin);
 assert.equal(p.items[1].state,'conflict');
 const out=mergeLearned(profile,p.items,[{id:'f0'}],origin);assert.equal(out.added.length,1);assert.equal(out.facts[1].origin,origin);assert(out.facts[1].confirmed);
 assert.throws(()=>mergeLearned(profile,p.items,[{id:'f1'}],origin),/冲突/);assert.throws(()=>mergeLearned(profile,p.items,[],origin),/请选择/);
 assert.throws(()=>mergeLearned(profile,p.items,[{id:'f0'},{id:'f0'}],origin),/非重复/);
 assert.throws(()=>mergeLearned(profile,p.items,[{id:'not-present'}],origin));
 assert.equal(mergeLearned(profile,p.items,[{id:'f0'}],origin,true).facts[1].origin,'');
 assert.equal(makePlan({id:'s',url:origin+'/next',fields:[{id:'h',label:'兴趣爱好',section:'基本信息',type:'text',value:''}]},{facts:out.facts}).entries[0].value,'SYNTHETIC READING');
});
test('records require an identity; an exact unique employer anchor can supply it without guessing',()=>{
 const profile={facts:[fact('c','公司名称','SYNTHETIC CO','实习A','实习经历')]};
 const fields=cap([{label:'所在部门',value:'SYNTHETIC DEPT',section:'实习经历',anchors:['SYNTHETIC CO']}]);
 const p=learningPreview(fields,profile,origin);assert.equal(p.items[0].entity,'实习A');
 const result=mergeLearned(profile,p.items,[{id:'f0',entity:'实习A'}],origin);assert.equal(result.facts[1].entity,'实习A');
 const ambiguous={facts:[...profile.facts,fact('d','公司名称','SYNTHETIC CO','实习B','实习经历')]};
 const q=learningPreview(fields,ambiguous,origin);assert.equal(q.items[0].state,'record-required');
 assert.throws(()=>mergeLearned(ambiguous,q.items,[{id:'f0'}],origin),/所属/);
});
test('explicit evaluation/dept labels match, but project facts never fill internship descriptions',()=>{
 assert.equal(semanticLabel('评价内容*？ *','自我评价'),semanticLabel('自我评价'));
 const facts=[fact('d','部门','SYNTHETIC DEPT','实习A','实习经历'),fact('c','公司名称','SYNTHETIC CO','实习A','实习经历'),fact('p','项目描述','WRONG_PROJECT','项目A','项目经历')];
 const p=makePlan({id:'s',url:origin,fields:[{id:'d',label:'所在部门',type:'text',section:'实习经历',value:'',anchors:['SYNTHETIC CO']},{id:'p',label:'项目介绍',type:'textarea',section:'实习经历',value:'',anchors:['SYNTHETIC CO']}]},{facts});
 assert.equal(p.entries[0].value,'SYNTHETIC DEPT');assert.equal(p.entries[1].status,'missing');
 const summary=pageSummary({...p,entries:p.entries.map(e=>({...e,frameId:0,id:e.fieldId}))});assert.equal(summary.quick.length,1,'missing optional data must not block known data');
});
async function setup(){
 const h=localHarness();let ticket,current=[{id:'h',label:'兴趣爱好',type:'text',section:'基本信息',value:'SYNTHETIC LEARNED',anchors:[]}];
 const original=h.chrome.scripting.executeScript;
 h.chrome.scripting.executeScript=async cmd=>cmd.args?.[0]==='capture'? [{frameId:0,documentId:'target-document',result:{snapshotId:cmd.args[1].snapshotId,fields:structuredClone(current)}}]:original(cmd);
 h.chrome.windows={create:async ({url})=>{ticket=new URL(url).searchParams.get('ticket');return {tabs:[{id:91}]};}};
 await h.attach();await importText(h,'姓名：SYNTHETIC USER\n邮箱：a@example.invalid');
 const pageSender={id:h.chrome.runtime.id,frameId:0,tab:{id:11},documentId:'target-document',url:origin+'/apply',documentLifecycle:'active'};
 const page=(type,extra={})=>h.workflow.pageRequest({type:'page-local-'+type,...extra},pageSender);
 const popup=(type,extra={},patch={})=>h.workflow.learnerRequest({type:'local-learn-'+type,ticket,...extra},{id:h.chrome.runtime.id,frameId:0,tab:{id:91},documentId:'learn-doc',url:h.chrome.runtime.getURL('learn-review.html'),...patch});
 return {h,page,popup,pageSender,setValue(v){current[0].value=v;}};
}
test('real controller opens a trusted review, saves only after confirmation, and logs no personal values',async()=>{
 const s=await setup();await s.page('scan');const response=await s.page('learn');assert(response.opened);assert(!JSON.stringify(response).includes('SYNTHETIC LEARNED'));
 await assert.rejects(s.popup('read',{},s.pageSender),/只有保存/);await assert.rejects(s.popup('read',{}, {tab:{id:92}}),/不属于/);
 const preview=await s.popup('read');assert.equal(preview.items[0].value,'SYNTHETIC LEARNED');
 await assert.rejects(s.popup('save',{selections:[{id:'h'}]}),/核对/);
 assert.equal((await s.h.api('state')).profile.facts.length,2);
 const r=await s.popup('save',{selections:[{id:'h'}],reviewed:true});assert.equal(r.saved,1);
 assert.equal((await s.h.api('state')).profile.facts.length,3);assert.deepEqual(s.h.values,{});
 await assert.rejects(s.popup('save',{selections:[{id:'h'}],reviewed:true}),/过期/);
 const logs=await s.h.api('logs');assert(logs.records.some(x=>x.stage==='learn'));assert(!JSON.stringify(logs).includes('SYNTHETIC LEARNED'));
 s.h.restart();assert.equal((await s.h.api('state')).profile.facts.length,3);
});
test('changed values, new scan, edited profile and navigation invalidate learning approval',async()=>{
 for(const action of ['value','scan','edit','navigate','stop']){
  const s=await setup();await s.page('scan');await s.page('learn');await s.popup('read');
  if(action==='value')s.setValue('CHANGED');if(action==='scan')await s.page('scan');if(action==='stop')await s.page('stop');
  if(action==='navigate')s.h.setUrl(origin+'/different');
  if(action==='edit'){const state=await s.h.api('state');await s.h.api('edit',{revision:state.profile.revision,fact:{...state.profile.facts[0],value:'DIFFERENT'},reviewed:true});}
  await assert.rejects(s.popup('save',{selections:[{id:'h'}],reviewed:true}));assert.equal((await s.h.api('state')).profile.facts.length,2,action);
 }
});

test('worker recreation preserves only bounded learning context, not captured values or target URL',async()=>{
 const s=await setup();await s.page('scan');
 const metadata=s.h.session.data.resumeManualLearningContextV1;
 assert(metadata?.snapshotId);assert(!JSON.stringify(metadata).includes(origin));assert(!JSON.stringify(metadata).includes('SYNTHETIC'));
 s.h.restart();
 assert.equal((await s.page('learn')).opened,true);
 const p=await s.popup('read');assert.equal(p.items[0].value,'SYNTHETIC LEARNED');
 await s.popup('save',{selections:[{id:'h'}],reviewed:true});
 assert.equal((await s.h.api('state')).profile.facts.length,3);
});
test('restored learning context rejects same-document URL changes, expiration and full browser session loss',async()=>{
 for(const variation of ['url','expiry','session-loss']){
  const s=await setup();await s.page('scan');
  if(variation==='url'){const changed=origin+'/apply?step=other';s.h.setUrl(changed);s.pageSender.url=changed;}
  if(variation==='expiry')s.h.session.data.resumeManualLearningContextV1.expires=Date.now()-1;
  if(variation==='session-loss')delete s.h.session.data.resumeManualLearningContextV1;
  s.h.restart();await assert.rejects(s.page('learn'));
  assert.equal((await s.h.api('state')).profile.facts.length,2);
 }
});
