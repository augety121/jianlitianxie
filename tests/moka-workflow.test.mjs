import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTargets,cleanAddition} from '../extension/core/addition-status.mjs';
import {taskOutcome} from '../extension/core/task-outcome.mjs';
import {exportReceipts} from '../extension/core/local-receipts.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
test('five-domain inventory preserves all ten awards and language identity',()=>{
 const facts=Array.from({length:10},(_,i)=>({entity:'award'+i,label:'奖项名称',section:'获奖经历',confirmed:true}));
 facts.push({entity:'en',label:'语言类型',section:'语言能力',confirmed:true});
 facts.push({entity:'fr',label:'掌握程度',section:'语言能力',confirmed:true});
 const counts=recordTargets(facts,'https://example.invalid');assert.equal(counts.award,10);assert.equal(counts.language,1);
 const inventory=Object.entries(counts).map(([domain,target])=>({domain,target,current:target,code:'satisfied'}));
 assert.equal(cleanAddition({inventory}).inventory.length,5);
});
test('successful selected subset is partial if any ordinary field remains unresolved',()=>{
 const filled={id:'a',status:'ready'},verified=[{id:'a',status:'verified'}];
 for(const rest of [{id:'b',status:'missing'},{id:'b',status:'review'},{id:'b',status:'preserve',reasonCode:'existing-unverified'}])assert.equal(taskOutcome({entries:[filled,rest]},verified),'partial');
 assert.equal(taskOutcome({entries:[filled,{id:'b',status:'preserve',reasonCode:'existing-consistent'}]},verified),'completed');
 assert.equal(taskOutcome({entries:[filled]},verified,{inventory:[{target:1,code:'section-not-found'}]}),'partial');
 assert.equal(taskOutcome({entries:[filled]},[]),'no-eligible-fields');
});
test('schema 3 retains Moka evidence and old records without exporting arbitrary runtime strings',()=>{
 const report=exportReceipts({records:[{stage:'scan',fields:[{status:'preserve',recognition:{controlFamily:'moka',selectedDisplay:true}}]},{stage:'fill',fields:[{status:'verified',recognition:{controlFamily:'PRIVATE'}}]}]});
 assert.equal(report.schemaVersion,3);assert.equal(report.records[0].fields[0].recognition.controlFamily,'moka');assert(!JSON.stringify(report).includes('PRIVATE'));
});
test('one-click scan, fill and final task receipts share one task identity',async()=>{
 const h=localHarness();await h.attach();await importText(h,'姓名：虚构人\n邮箱：moka@example.invalid\n性别：虚构值');
 const sender={id:h.chrome.runtime.id,frameId:0,tab:{id:11},documentId:'target-document',url:'https://jobs.example.invalid/apply',documentLifecycle:'active'};
 const result=await h.workflow.pageRequest({type:'page-local-run',reviewed:true},sender);
 const log=await h.api('logs'),rows=log.records.filter(r=>r.taskId===result.taskId);
 for(const stage of ['task','add','scan','fill'])assert(rows.some(r=>r.stage===stage),stage);
});
test('unbound repeated records do not block independent confirmed fields',async()=>{
 const h=localHarness();h.setScenario('education');await h.attach();
 await importText(h,'姓名：虚构人\n## 教育经历 | 甲\n学校：甲校\n专业：甲专业\n## 教育经历 | 乙\n学校：乙校\n专业：乙专业');
 const execute=h.chrome.scripting.executeScript;let opened=false;
 h.chrome.scripting.executeScript=async command=>{const result=await execute(command);if(command.args?.[0]==='scan')result[0].result.fields.unshift({id:'name',label:'姓名',section:'基本信息',type:'text',value:h.values.name||''});return result;};
 h.chrome.windows={create:async()=>{opened=true;assert.equal(h.values.name,'虚构人');return {tabs:[{id:42}]};}};
 const sender={id:h.chrome.runtime.id,frameId:0,tab:{id:11},documentId:'target-document',url:'https://jobs.example.invalid/apply',documentLifecycle:'active'};
 const result=await h.workflow.pageRequest({type:'page-local-run',reviewed:true},sender);
 assert(opened);assert.equal(result.outcome,'needs-confirmation');assert.deepEqual(h.values,{name:'虚构人'});
});
