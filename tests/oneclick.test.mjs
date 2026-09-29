import test from 'node:test';
import assert from 'node:assert/strict';
import {localHarness,importText} from './helpers/local-harness.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {pageSummary} from '../extension/core/page-summary.mjs';
const pageSender=h=>({id:h.chrome.runtime.id,frameId:0,tab:{id:11},documentId:'target-document',url:'https://jobs.example.invalid/apply',documentLifecycle:'active'});
const pageCall=(h,type,data={})=>h.workflow.pageRequest({type:'page-local-'+type,...data},pageSender(h));
async function setup(){
 const h=localHarness();let lastTicket;
 h.chrome.windows={create:async({url})=>{lastTicket=new URL(url).searchParams.get('ticket');return {id:77,tabs:[{id:88}]};}};
 await h.attach();await importText(h,'姓名：SYNTHETIC_ALPHA\n邮箱：alpha@example.invalid\n性别：虚构值');
 return {h,get ticket(){return lastTicket;},picker(type,data={},patch={}){return h.workflow.pickerRequest({type:'local-picker-'+type,ticket:lastTicket,...data},{id:h.chrome.runtime.id,tab:{id:88},frameId:0,documentId:'picker-document',url:h.chrome.runtime.getURL('quick-pick.html'),...patch});}};
}
test('page summary explains unresolved fields inline without revealing local values or sources',()=>{
 const p=pageSummary({id:'p',entries:[{id:'0:x',frameId:0,label:'专业',section:'教育经历',kind:'text',status:'missing',reasonCode:'record-unbound',source:'PRIVATE',value:'SECRET'},{id:'0:file',frameId:0,label:'附件',kind:'file',status:'manual',reasonCode:'restricted-control'}]});
 assert.equal(p.problems.length,2);assert.equal(p.problems[0].pickable,true);assert.equal(p.problems[1].pickable,false);
 assert.equal(p.problems[0].code,'record-unbound');assert(!JSON.stringify(p).includes('SECRET'));assert(!JSON.stringify(p).includes('PRIVATE'));
});
test('picker content is available only to the exact opened extension window, not the website',async()=>{
 const s=await setup(),p=await pageCall(s.h,'scan');await pageCall(s.h,'pick',{planId:p.id,id:'0:gender'});
 await assert.rejects(s.picker('read',{},pageSender(s.h)),/只有补填/);
 await assert.rejects(s.picker('read',{}, {tab:{id:99}}),/不属于/);
 const data=await s.picker('read');assert(data.facts.some(f=>f.value==='虚构值'));
 await assert.rejects(s.picker('read',{}, {documentId:'different-document'}),/窗口已变化/);
 const response=await pageCall(s.h,'status');assert(!JSON.stringify(response).includes('SYNTHETIC_ALPHA'));
});
test('single-field picker requires explicit consent and fills only the chosen field once',async()=>{
 const s=await setup(),p=await pageCall(s.h,'scan');await pageCall(s.h,'pick',{planId:p.id,id:'0:gender'});
 const data=await s.picker('read'),fact=data.facts.find(f=>f.label==='性别');
 await assert.rejects(s.picker('fill',{factId:fact.id}),/核对后确认/);
 await assert.rejects(s.picker('fill',{factId:'unknown',reviewed:true}),/请选择/);
 const result=await s.picker('fill',{factId:fact.id,reviewed:true});assert(result.verified);assert.deepEqual(s.h.values,{gender:'虚构值'});
 await assert.rejects(s.picker('fill',{factId:fact.id,reviewed:true}),/过期|结束/);
});
test('picker refuses file controls and protected fields instead of offering a data selector',async()=>{
 const s=await setup();s.h.setScenario('unmatched');const p=await pageCall(s.h,'scan');
 await assert.rejects(pageCall(s.h,'pick',{planId:p.id,id:'0:upload'}),/网页手动处理/);assert.equal(s.ticket,undefined);
});
test('new scan, profile edit, navigation and cancellation revoke an existing picker',async()=>{
 for(const action of ['scan','edit','navigation','stop']){
  const s=await setup(),p=await pageCall(s.h,'scan');await pageCall(s.h,'pick',{planId:p.id,id:'0:gender'});const data=await s.picker('read');
  if(action==='scan')await pageCall(s.h,'scan');
  if(action==='stop')await pageCall(s.h,'stop');
  if(action==='navigation')s.h.setUrl('https://jobs.example.invalid/other');
  if(action==='edit'){const state=await s.h.api('state');await s.h.api('edit',{fact:{...state.profile.facts[0],value:'CHANGED'},revision:state.profile.revision,reviewed:true});}
  await assert.rejects(s.picker('fill',{factId:data.facts[0].id,reviewed:true}));assert.deepEqual(s.h.values,{});
 }
});
const fact=(id,label,value,entity,section='教育经历')=>({id,label,value,entity,section,source:'synthetic',confirmed:true});
const snap=(anchors,section='教育经历')=>({id:'s',url:'https://jobs.example.invalid/apply',fields:[{id:'major',label:'专业',section,type:'text',value:'',anchors}]});
test('exact existing school anchors identify the right entity even when record names differ',()=>{
 const facts=[fact('as','学校','虚构大学甲','本科学习'),fact('am','专业','虚构专业甲','本科学习'),fact('bs','学校','虚构大学乙','硕士学习'),fact('bm','专业','虚构专业乙','硕士学习')];
 assert.equal(makePlan(snap(['虚构大学乙']),{facts}).entries[0].value,'虚构专业乙');
 assert.equal(makePlan(snap(['虚构大学甲']),{facts}).entries[0].value,'虚构专业甲');
});
test('same school, conflicting anchors, unknown section or cross-scope records remain ambiguous',()=>{
 const facts=[fact('as','学校','共同学校','本科'),fact('am','专业','MAJOR_A','本科'),fact('bs','学校','共同学校','硕士'),fact('bm','专业','MAJOR_B','硕士')];
 assert.equal(makePlan(snap(['共同学校']),{facts}).entries[0].status,'missing');
 facts[0].value='学校甲';facts[2].value='学校乙';
 for(const s of [snap(['学校甲','学校乙']),snap(['学校甲'],'')])assert.equal(makePlan(s,{facts}).entries[0].status,'missing');
 const other=[fact('x','学校','学校甲','亲属','家庭信息'),fact('y','专业','PRIVATE','亲属','家庭信息')];
 assert.equal(makePlan(snap(['学校甲']),{facts:other}).entries[0].status,'missing');
});
