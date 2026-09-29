import test from 'node:test';
import assert from 'node:assert/strict';
import {localHarness,importText} from './helpers/local-harness.mjs';
import {pageSummary,planExplanation} from '../extension/core/page-summary.mjs';
import {readLocalImport} from '../extension/core/local-import.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {LocalReceipts} from '../extension/core/local-receipts.mjs';
import {memory} from './helpers/local-harness.mjs';
const contentSender=h=>({id:h.chrome.runtime.id,tab:{id:11},frameId:0,documentId:'target-document',url:'https://jobs.example.invalid/apply',documentLifecycle:'active'});
const call=(h,type,data={},sender=contentSender(h))=>h.workflow.pageRequest({type:'page-local-'+type,...data},sender);
async function setup(){const h=localHarness();await h.attach();await importText(h,'姓名：SYNTHETIC_PRIVATE\n邮箱：private@example.invalid\n性别：虚构选项');return h;}
test('in-page scan returns only page-owned labels and counts, never stored values/source or full profile',async()=>{
 const h=await setup(),p=await call(h,'scan');
 assert.equal(p.counts.ready,3);assert.equal(p.quick.length,2);
 const text=JSON.stringify(p);for(const privateText of ['SYNTHETIC_PRIVATE','private@example.invalid','虚构选项','本人本机导入'])assert(!text.includes(privateText));
 await assert.rejects(call(h,'state'),/不允许/);await assert.rejects(call(h,'read'),/不允许/);
 assert.equal(h.values.name,undefined);
});
test('page fill approves only the server-selected ordinary fields and is one-shot',async()=>{
 const h=await setup(),p=await call(h,'scan');
 await assert.rejects(call(h,'fill',{planId:p.id}),/本人点击/);
 const r=await call(h,'fill',{planId:p.id,reviewed:true,ids:['0:gender']});
 assert.deepEqual(h.values,{name:'SYNTHETIC_PRIVATE',email:'private@example.invalid'});assert.equal(r.counts.verified,2);
 assert(!JSON.stringify(r).includes('SYNTHETIC_PRIVATE'));
 await assert.rejects(call(h,'fill',{planId:p.id,reviewed:true}),/失效/);
});
test('foreign extension, nested frame, stale URL/document and another tab cannot fill a page plan',async()=>{
 const h=await setup(),p=await call(h,'scan'),s=contentSender(h);
 for(const change of [{id:'foreign'},{frameId:1},{documentId:'other-doc'},{url:'https://jobs.example.invalid/other'},{tab:{id:22}},{documentLifecycle:'prerender'}]){
  await assert.rejects(call(h,'fill',{planId:p.id,reviewed:true},{...s,...change}));
 }
 assert.deepEqual(h.values,{});
});
test('page cannot stop a plan owned by the management page',async()=>{
 const h=await setup(),p=await h.api('scan',{tabId:11});
 await assert.rejects(call(h,'stop'),/未停止其他/);
 const r=await h.api('fill',{planId:p.id,ids:['0:name'],reviewed:true});assert.equal(r.results[0].status,'verified');
});
test('existing values are preserved and a zero-ready scan explains why rather than pretending to fill',async()=>{
 const h=await setup();h.values.name='EXISTING';h.values.email='existing@example.invalid';
 const p=await call(h,'scan');assert.equal(p.counts.review,2);assert.equal(p.quick.length,0);
 await assert.rejects(call(h,'fill',{planId:p.id,reviewed:true}),/没有可/);assert.equal(h.values.name,'EXISTING');
 const zero={entries:[...Array.from({length:13},()=>({status:'preserve'})),...Array.from({length:6},()=>({status:'missing'})),{status:'manual'}]};
 assert.match(planExplanation(zero),/6 项未唯一匹配，1 项需人工处理，13 项已有内容/);
});
test('page UI has bounded batch size; unshown or sensitive values never enter quick plan',()=>{
 const p=pageSummary({id:'p',entries:Array.from({length:150},(_,i)=>({id:String(i),label:'普通字段'+i,frameId:0,status:'ready',kind:'text',value:'PRIVATE'}))});
 assert.equal(p.quick.length,60);assert.equal(p.more,90);assert(!JSON.stringify(p).includes('PRIVATE'));
});
test('toolbar attaches an on-page entry without opening another management tab when facts exist',async()=>{
 const h=await setup();h.calls.length=0;const r=await h.workflow.launch({id:11,url:'https://jobs.example.invalid/apply'});
 assert.equal(r.attached,true);assert(!h.calls.some(c=>c.open));
});
test('management return verifies target and never writes fields',async()=>{
 const h=await setup();assert.deepEqual(await h.api('return',{tabId:11}),{returned:true});assert.deepEqual(h.values,{});
 h.setUrl('https://other.example.invalid/');await assert.rejects(h.api('return',{tabId:11}),/授权/);
});
test('Markdown common information tables and numbered section headings retain explicit facts',()=>{
 const r=readLocalImport('## 一、基本信息\n| 字段 | 信息 |\n| --- | --- |\n| 姓名 | **虚构甲** |\n| 邮箱 | demo@example.invalid |\n\n## 2. 教育经历\n### 虚构教育记录\n| 属性 | 填写内容 |\n| --- | --- |\n| 学校 | 虚构学校 |');
 assert.equal(r.facts.length,3);assert.equal(r.facts[0].value,'虚构甲');assert.equal(r.facts[2].entity,'虚构教育记录');assert(r.facts.every(f=>f.confirmed===false));
});
test('common MD heading format produces matchable facts; arbitrary prose remains unclassified',()=>{
 const imported=readLocalImport('## 1. 个人信息\n| 项目 | 信息 |\n| --- | --- |\n| 姓名 | 虚构甲 |\n这是一段没有字段名称的介绍');
 const p=makePlan({id:'s',url:'https://jobs.example.invalid',fields:[{id:'name',label:'姓名',section:'基本信息',type:'text',value:''}]},{facts:imported.facts.map(f=>({...f,confirmed:true}))});
 assert.equal(p.entries[0].status,'ready');assert.equal(imported.skipped.length,1);
});
test('missing-name and unbound-record diagnoses stay fixed codes without revealing evidence',async()=>{
 const snapshot={id:'s',url:'https://jobs.example.invalid',fields:[{id:'name',label:'姓名',type:'text',value:''},{id:'school',label:'学校',section:'教育经历',type:'text',value:''}]};
 const p=makePlan(snapshot,{facts:[{id:'school-fact',label:'学校',value:'PRIVATE_INSTITUTION',section:'教育经历',entity:'ONE_RECORD',confirmed:true}]});
 assert.equal(p.entries[0].reasonCode,'no-label-match');assert.equal(p.entries[1].reasonCode,'record-unbound');
 const logs=new LocalReceipts(memory());logs.add({stage:'scan',ok:true,fields:p.entries.map((e,i)=>({index:i,status:e.status,code:e.reasonCode,value:'PRIVATE'}))});
 const data=await logs.read();assert(!JSON.stringify(data).includes('PRIVATE'));assert.equal(data.records[0].fields[1].code,'record-unbound');
});
