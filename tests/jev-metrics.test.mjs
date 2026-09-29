import test from 'node:test';
import assert from 'node:assert/strict';
import {numericMetrics,sumMetrics} from '../extension/core/performance.mjs';
import {LocalReceipts,exportReceipts} from '../extension/core/local-receipts.mjs';
import {WorkspaceRun} from '../extension/core/workspace-run.mjs';
test('phase metrics accept finite counters only, not personal values or nested page data',()=>{
 const raw={durationMs:12.456,recordShapeQueries:1,recordShapeCacheHits:99,verificationWaitMs:500,readbackChecks:10,label:'PRIVATE_NAME',value:'PRIVATE_VALUE',url:'PRIVATE_URL',reason:'PRIVATE_ERROR',waitMs:-1,hitTests:NaN,writesAttempted:Infinity,readbackMs:'50'};
 assert.deepEqual(numericMetrics(raw),{durationMs:12.46,recordShapeQueries:1,recordShapeCacheHits:99,verificationWaitMs:500,readbackChecks:10});
 assert.deepEqual(sumMetrics([raw,{durationMs:2,readbackChecks:3,recordShapeQueries:1}]),{durationMs:14.46,recordShapeQueries:2,recordShapeCacheHits:99,verificationWaitMs:500,readbackChecks:13});
});
test('automatic receipts double-filter numeric metrics and preserve no labels or values',async()=>{
 const data={};const storage={async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,structuredClone(v));}};
 const log=new LocalReceipts(storage,()=>2000000);
 log.add({stage:'fill',ok:true,ms:600,total:1,fields:[{index:1,status:'verified'}],performance:{apply:{durationMs:560,recordShapeQueries:1,label:'PRIVATE_A'},rawProfile:'PRIVATE_B'}});
 const first=await log.read();assert.equal(first.records[0].performance.apply.durationMs,560);
 assert(!JSON.stringify(data).includes('PRIVATE_'));
 data.resumeLocalReceiptsV1[0].performance.apply.value='PRIVATE_C';
 assert(!JSON.stringify(exportReceipts(await log.read())).includes('PRIVATE_'));
});
test('preview and execution propagate bounded metrics without sending unselected facts',async()=>{
 const facts=[{id:'a',label:'姓名',value:'SYNTHETIC_A',source:'synthetic',confirmed:true},{id:'b',label:'邮箱',value:'sample@example.invalid',source:'synthetic',confirmed:true}];
 const vault={unlocked:true,read:()=>({facts,revision:1})};
 let approved;
 const broker={scan:async()=>({url:'https://fixture.invalid/',frames:[{frameId:0,documentId:'document',snapshot:{id:'s',url:'https://fixture.invalid/',performance:{durationMs:15,value:'PRIVATE'},fields:[{id:'a',label:'姓名',type:'text',value:''},{id:'b',label:'邮箱',type:'email',value:''}]}}],skipped:[]}),tab:async()=>({url:'https://fixture.invalid/'}),cancel:async()=>{},invoke:async(tab,frame,action,plan)=>{approved=plan;return {result:{results:[{fieldId:'a',status:'verified'}],performance:{durationMs:550,readbackChecks:1,url:'PRIVATE'}}};}};
 const run=new WorkspaceRun(vault,broker,()=>1),preview=await run.scan('owner',{tabId:11,factIds:['a','b']});
 assert.equal(preview.performance.scan.durationMs,15);assert(!JSON.stringify(preview.performance).includes('PRIVATE'));
 const report=await run.apply('owner',{planId:preview.id,ids:['0:a'],reviewed:true});
 assert.equal(approved.entries.length,1);assert(!JSON.stringify(approved).includes('sample@example.invalid'));
 assert.deepEqual(report.performance,{durationMs:550,readbackChecks:1});
});
