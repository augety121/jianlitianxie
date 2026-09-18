import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ChangeSignal} from '../bridge/change-signal.mjs';
import {indexFields,rememberedMappings,relevantFacts} from '../bridge/field-memory.mjs';
import {candidatesFor} from '../bridge/semantics.mjs';
import {startBridge} from './helpers/bridge-harness.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('notification revision avoids lost wakeups, timeout and abort release all waiters',async()=>{
 const signal=new ChangeSignal();const waiting=signal.wait(0);assert.equal(signal.waiting,1);signal.notify();assert.equal(await waiting,1);assert.equal(signal.waiting,0);
 assert.equal(await signal.wait(0),1);assert.equal(await signal.wait(1,{timeout:2}),1);
 const abort=new AbortController(),stopped=signal.wait(1,{signal:abort.signal});abort.abort();await assert.rejects(stopped);assert.equal(signal.waiting,0);
 await assert.rejects(signal.wait(-1));await assert.rejects(signal.wait(1,{timeout:Infinity}));
});
test('bounded notification connections are cleaned on shutdown',async()=>{
 const signal=new ChangeSignal();const waits=Array.from({length:64},()=>signal.wait(0).catch(()=>null));
 await assert.rejects(signal.wait(0),/过多/);signal.close();await Promise.all(waits);assert.equal(signal.waiting,0);
});
test('one-pass memory index preserves ambiguous keys and source ordering',()=>{
 const snapshot={url:'https://example.invalid/form?secret=test',fields:[{id:'one',label:'姓名',type:'text'},{id:'two',label:'姓名',type:'text'},{id:'three',label:'邮箱',type:'text'}]};
 const index=indexFields(snapshot);const remembered=rememberedMappings(index,{[index.keys.get('one')]:'not-safe',[index.keys.get('three')]:'email'});
 assert.deepEqual({...remembered},{three:'email'});assert(![...index.keys.values()].some(k=>k.includes('secret')));
});
test('indexed context relevance is equivalent to the old per-fact nested search',()=>{
 for(let trial=0;trial<50;trial++){
  const fields=Array.from({length:25},(_,i)=>({id:'f'+i,label:['姓名','学校','专业','邮箱','自我评价'][i%5],section:i%2?'教育经历':'个人信息'}));
  const facts=Array.from({length:100},(_,i)=>({id:'id'+i,label:fields[i%25].label,section:fields[(i+trial)%25].section,confirmed:i%7!==0,conflict:i%11===0,origin:i%9?'':'https://other.invalid',value:'SYNTHETIC'}));
  const snapshot={url:'https://example.invalid/form',fields},plan={entries:[{factId:'id20'}]};
  const expected=facts.filter(f=>f.confirmed!==false&&!f.conflict&&(plan.entries.some(e=>e.factId===f.id)||fields.some(x=>candidatesFor({...x,url:snapshot.url},[f]).length)));
  assert.deepEqual(relevantFacts(snapshot,facts,plan),expected);
 }
});
test('HTTP/MCP notification, ownership, one-shot execution and recovery',{timeout:20000},async t=>{
 const h=await startBridge();t.after(()=>h.close());
 await t.test('snapshot prepares plan in one request; private plans are bound to owner',async()=>{
  const p=await h.setup();assert.equal(p.entries[0].value,'SYNTHETIC_PERSON');
  assert.equal((await h.request('/plan')).status,400);assert.equal((await h.request('/plan?owner=B')).status,400);
  assert.equal((await h.json('/plan?owner=A')).id,p.id);
  assert.equal((await h.request('/begin?owner=B',{planId:p.id,fieldIds:['f']})).status,400);
  assert.equal((await h.request('/begin?owner=A',{planId:p.id,fieldIds:['f'],url:'https://wrong.invalid/'})).status,400);
 });
 await t.test('event wakes immediately but does not consume commands or return private data',async()=>{
  const p=await h.setup();const poll=await h.json('/poll?owner=A');
  const event=h.json(`/events?owner=A&after=${poll.revision}&wait=1000`);
  await delay(20);assert.equal((await h.json('/status')).waiting,1);
  await h.tool('form_request_fill',{planId:p.id});const response=await event;
  assert.deepEqual(Object.keys(response).sort(),['revision','selected']);assert(response.revision>poll.revision);
  assert.deepEqual((await h.json('/poll?owner=B')).commands,[]);
  const command=(await h.json('/poll?owner=A')).commands[0];assert.equal(command.type,'review');assert.equal(command.planId,p.id);
  assert.equal((await h.json('/status')).waiting,0);
 });
 await t.test('aborting an HTTP wait cannot lose a later fill command',async()=>{
  const p=await h.setup();const poll=await h.json('/poll?owner=A');const controller=new AbortController();
  const event=h.json(`/events?owner=A&after=${poll.revision}&wait=1000`,undefined,{signal:controller.signal});const failed=assert.rejects(event);await delay(20);controller.abort();await failed;await delay(20);
  assert.equal((await h.json('/status')).waiting,0);await h.tool('form_fill',{planId:p.id});
  assert.equal((await h.json('/poll?owner=A')).commands[0].type,'fill');
  await assert.rejects(h.tool('form_fill',{planId:p.id}),/已经发送/);
  await h.json('/cancel?owner=A',{planId:p.id});
 });
 await t.test('concurrent begin has one winner; result cannot report unselected or repeated fields',async()=>{
  const p=await h.setup(),body={planId:p.id,fieldIds:['f']};
  const responses=await Promise.all([h.request('/begin?owner=A',body),h.request('/begin?owner=A',body)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
  assert.equal((await h.request('/result?owner=A',{planId:p.id,results:[{fieldId:'email',status:'verified'}]})).status,400);
  assert.equal((await h.request('/result?owner=A',{planId:p.id,results:[{fieldId:'f',status:'verified'},{fieldId:'f',status:'verified'}]})).status,400);
  await h.json('/result?owner=A',{planId:p.id,results:[]});
  const result=await h.tool('form_result');assert.equal(result.results[0].status,'not-attempted');assert.equal(result.counts.verified,undefined);
 });
 await t.test('stop retains execution lock until executor has returned a report',async()=>{
  const p=await h.setup();await h.json('/begin?owner=A',{planId:p.id,fieldIds:['f','email']});
  assert.equal((await h.json('/cancel?owner=A',{planId:p.id})).state,'stopping');
  assert.equal((await h.request('/snapshot',{snapshot:h.snapshot('B')})).status,400);
  await h.json('/result?owner=A',{planId:p.id,results:[{fieldId:'f',status:'verified'},{fieldId:'email',status:'cancelled'}]});
  const r=await h.tool('form_result');assert.equal(r.state,'cancelled');assert.equal(r.counts.verified,1);
  assert.equal((await h.request('/begin?owner=A',{planId:p.id,fieldIds:['f']})).status,400);
 });
 await t.test('profile changed on disk after preview invalidates authorization',async()=>{
  const p=await h.setup();await fs.writeFile(path.join(h.dir,'profile.json'),JSON.stringify({facts:[{id:'name',label:'姓名',value:'CHANGED',confirmed:true}]}));
  assert.equal((await h.request('/begin?owner=A',{planId:p.id,fieldIds:['f']})).status,400);
  assert.equal(await h.json('/plan?owner=A'),null);
 });
 await t.test('rescan request is bound to old snapshot and cannot replace another tab',async()=>{
  await h.setup();const waiting=h.rpc('form_scan');await delay(20);
  const command=(await h.json('/poll?owner=A')).commands[0];assert.equal(command.type,'scan');
  await h.json('/snapshot',{snapshot:h.snapshot('B'),prepare:true});const r=await waiting;assert.equal(r.result.isError,true);
  assert.equal((await h.request('/snapshot',{snapshot:h.snapshot('A'),commandId:command.id})).status,400);
  assert.equal((await h.request('/plan?owner=A')).status,400);
 });
 await t.test('successful MCP rescan returns correct snapshot without deadlock',async()=>{
  await h.setup();const waiting=h.tool('form_scan');await delay(20);const command=(await h.json('/poll?owner=A')).commands[0];
  const s=h.snapshot('A');await h.json('/snapshot',{snapshot:s,commandId:command.id,prepare:true});assert.equal((await waiting).id,s.id);
 });
 await t.test('diagnostic write failure cannot leave a completed execution locked or trigger a retry',async()=>{
  const p=await h.setup();await h.json('/begin?owner=A',{planId:p.id,fieldIds:['f']});
  await fs.rm(path.join(h.dir,'audit.jsonl'),{force:true});await fs.mkdir(path.join(h.dir,'audit.jsonl'));
  const receipt=await h.json('/result?owner=A',{planId:p.id,results:[{fieldId:'f',status:'verified',reason:'PRIVATE_DO_NOT_LOG'}]});
  assert.match(receipt.warning,/记录写入失败/);assert.equal((await h.tool('form_result')).counts.verified,1);
  await h.json('/snapshot',{snapshot:h.snapshot(),prepare:true});await fs.rm(path.join(h.dir,'audit.jsonl'),{recursive:true});
 });
 await t.test('audit only includes count/status data, not private values or webpage error text',async()=>{
  const p=await h.setup();await h.json('/begin?owner=A',{planId:p.id,fieldIds:['f']});
  await h.json('/result?owner=A',{planId:p.id,results:[{fieldId:'f',status:'verified',reason:'PRIVATE_DO_NOT_LOG'}]});
  const text=await fs.readFile(path.join(h.dir,'audit.jsonl'),'utf8');assert(!/PRIVATE|SYNTHETIC|姓名|example\.invalid/.test(text));
 });
});
