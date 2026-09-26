import test from 'node:test';
import assert from 'node:assert/strict';
import {entityGroups} from '../extension/core/entity-binding.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {WorkspaceRun} from '../extension/core/workspace-run.mjs';
import {FrameBroker} from '../extension/core/frame-broker.mjs';
const fact=(id,label,value,entity='甲大学硕士',section='教育经历')=>({id,label,value,entity,section,confirmed:true,source:'虚构夹具'});
const facts=[fact('a-school','学校','甲大学'),fact('a-major','专业','计算机'),fact('a-start','开始月份','2024-09'),
  fact('b-school','学校','乙大学','乙大学本科'),fact('b-major','专业','通信','乙大学本科'),fact('b-start','开始月份','2020-09','乙大学本科'),
  fact('p-start','开始月份','2025-01','甲大学硕士','项目经历')];
const field=(id,label,groupId,extra={})=>({id,label,groupId,section:'教育经历',type:'text',value:'',...extra});
const snapshot=()=>({id:'s',url:'https://example.invalid/apply',fields:[field('as','学校','a'),field('am','专业','a'),field('ad','开始月份','a',{type:'month'}),field('bs','学校','b'),field('bm','专业','b')]});

test('one binding resolves one empty education record without index guessing',()=>{
  const s=snapshot(),unbound=makePlan(s,{facts});assert.ok(unbound.entries.every(e=>e.status==='missing'));
  const p=makePlan(s,{facts},{},{a:'乙大学本科',b:'甲大学硕士'});
  assert.deepEqual(p.entries.map(e=>e.value),['乙大学','通信','2020-09','甲大学','计算机']);
  assert.ok(p.entries.every(e=>e.status==='ready'));
});
test('group candidates require the same record scope and selected confirmed facts',()=>{
  const groups=entityGroups(snapshot(),[...facts,fact('fake','学校','丙大学','丙'),{...fact('unconfirmed','学校','丁大学','丁'),confirmed:false},{...fact('offsite','学校','戊大学','戊'),origin:'https://another.invalid'}]);
  assert.equal(groups.length,2);assert.deepEqual(groups[0].candidates.map(c=>c.entity),['甲大学硕士','乙大学本科','丙']);
  const p=makePlan(snapshot(),{facts},{ad:'p-start'},{a:'甲大学硕士'});
  assert.equal(p.entries.find(e=>e.fieldId==='ad').status,'missing');
});
test('mixed/ambiguous/unknown scopes and duplicate record labels refuse group binding',()=>{
  for(const fields of [[field('1','学校','g'),field('2','学校','g')],[field('1','学校','g'),field('2','项目名称','g',{section:'项目经历'})],[field('1','学校','g',{section:''})]]){
    const groups=entityGroups({...snapshot(),fields},facts);assert.equal(groups[0].bindable,false);
  }
});
test('binding keeps old values and date precision; nonexistent entity never falls back',()=>{
  const s=snapshot();s.fields[0].value='网页原值';s.fields[2].type='date';
  const p=makePlan(s,{facts},{},{a:'甲大学硕士'});assert.equal(p.entries[0].status,'preserve');assert.equal(p.entries[2].status,'missing');
  const invalid=makePlan(snapshot(),{facts},{},{a:'不存在'});assert.equal(invalid.entries[0].status,'missing');
});
function host(){
  const profile={revision:1,facts},calls=[],vault={unlocked:true,read:()=>profile};
  const broker={scan:async()=>({url:snapshot().url,frames:[{frameId:0,documentId:'doc',snapshot:snapshot()}],skipped:[],includeFrames:false}),cancel:async()=>{},tab:async()=>({url:snapshot().url}),
    invoke:async(t,f,action,p)=>{calls.push(p);return {result:{results:p.entries.map(e=>({fieldId:e.fieldId,status:'verified'}))}};}};
  return {run:new WorkspaceRun(vault,broker),profile,calls};
}
test('workbench group binding renews plan, validates owner and forbids cross-entity remap',async()=>{
  const {run}=host();let p=await run.scan('owner',{tabId:2,factIds:facts.map(f=>f.id)});const before=p.id;
  assert.equal(p.groups[0].id,'0:a');assert.equal(p.groups[0].bindable,true);
  assert.throws(()=>run.bindEntity('other',{planId:p.id,groupId:'0:a',entity:'甲大学硕士'}),/失效/);
  p=run.bindEntity('owner',{planId:p.id,groupId:'0:a',entity:'甲大学硕士'});assert.notEqual(p.id,before);
  assert.throws(()=>run.bindEntity('owner',{planId:before,groupId:'0:a',entity:'甲大学硕士'}),/失效/);
  assert.throws(()=>run.remap('owner',{planId:p.id,id:'0:am',factId:'b-major'}),/不属于/);
  assert.throws(()=>run.bindEntity('owner',{planId:p.id,groupId:'1:a',entity:'甲大学硕士'}),/主文档/);
  const r=await run.apply('owner',{planId:p.id,ids:['0:as','0:am','0:ad'],reviewed:true});assert.ok(r.results.every(r=>r.status==='verified'));
});
test('re-scan discards group bindings and profile revision invalidates the whole plan',async()=>{
  const {run,profile}=host();let p=await run.scan('owner',{tabId:2,factIds:facts.map(f=>f.id)});
  p=run.bindEntity('owner',{planId:p.id,groupId:'0:a',entity:'甲大学硕士'});p=await run.scan('owner',{tabId:2,factIds:facts.map(f=>f.id)});
  assert.equal(p.groups[0].entity,'');assert.equal(p.entries[0].status,'missing');profile.revision++;
  assert.throws(()=>run.bindEntity('owner',{planId:p.id,groupId:'0:a',entity:'甲大学硕士'}),/失效/);
});
test('MCP handoff carries only selected ready mappings, never an implicit group grant',async()=>{
  const {run}=host();let p=await run.scan('owner',{tabId:2,factIds:facts.map(f=>f.id)});
  p=run.bindEntity('owner',{planId:p.id,groupId:'0:a',entity:'甲大学硕士'});
  const shared=await run.forMCP('owner',{planId:p.id,factIds:['a-major'],consent:true});
  assert.deepEqual(shared.mappings,{am:'a-major'});assert.equal(shared.facts.length,1);assert.equal(shared.snapshot.fields[0].groupId,undefined);
});
test('locate is bound to a Chrome document, cannot target child frames, and activates only after receipt',async()=>{
  const calls=[],chrome={scripting:{executeScript:async command=>{calls.push(command);return [{frameId:0,documentId:'doc',result:{located:true}}];}},tabs:{update:async(id,options)=>calls.push({id,options})}};
  const broker=new FrameBroker(chrome);
  await assert.rejects(broker.locate(4,{frameId:1,documentId:'child'},{snapshotId:'s',fieldId:'f'}),/嵌入/);
  await assert.rejects(broker.locate(4,{frameId:0,documentId:'changed'},{snapshotId:'s',fieldId:'f'}),/变化/);
  assert.ok(calls.every(c=>!c.options));
  assert.deepEqual(await broker.locate(4,{frameId:0,documentId:'doc'},{snapshotId:'s',fieldId:'f'}),{located:true});
  assert.deepEqual(calls.at(-1),{id:4,options:{active:true}});
});
