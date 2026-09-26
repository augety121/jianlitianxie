/** Actual authenticated localhost HTTP/MCP notification latency; NOT total form-fill time. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {startBridge} from './helpers/bridge-harness.mjs';
import {indexFields,rememberedMappings,relevantFacts} from '../bridge/field-memory.mjs';
import {candidatesFor} from '../bridge/semantics.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=process.argv[2]||'test-results/transport-benchmark.json';
const pairs=Number(process.argv[3]||6);
if(!Number.isInteger(pairs)||pairs<1||pairs>12)throw Error('pairs must be 1..12');
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={scope:'synthetic localhost HTTP/MCP notification + isolated memory preparation; no browser, model, external site or submit',baselineCommit:'9cbcac860aa4080cd638eda0b49233de281aa9b7',node:process.version,platform:process.platform,intervalMs:1500,pairs,
 sources:{server:await sha('bridge/server.mjs'),memory:await sha('bridge/field-memory.mjs'),driver:await sha('tests/transport-bench.mjs')},complete:false,notification:[],preparation:[]};
await fs.mkdir(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
const save=()=>fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
const h=await startBridge();
try{
 for(let pair=0;pair<pairs;pair++)for(const arm of pair%2?['event','interval']:['interval','event']){
  const p=await h.setup();let requests=0;
  const poll=()=>{requests++;return h.json('/poll?owner=A');};
  const initial=await poll();assert.equal(initial.commands.length,0);
  const controller=new AbortController();
  // Scheduling starts from the last empty poll; both arms have the same task arrival phase.
  const phase=[100,400,700,1000,1300,250][pair%6];
  const consumer=(async()=>{
   if(arm==='interval')await sleep(1500);
   else{requests++;await h.json(`/events?owner=A&after=${initial.revision}&wait=4000`,undefined,{signal:controller.signal});}
   const response=await poll();return {receivedAt:performance.now(),response};
  })().catch(error=>({error}));
  await sleep(phase);const start=performance.now();
  const row={pair:pair+1,arm,phaseMs:phase,verified:false};report.notification.push(row);
  try{
   await h.tool('form_request_fill',{planId:p.id});const value=await consumer;if(value.error)throw value.error;
   const {receivedAt,response}=value;assert.equal(response.commands.length,1);const c=response.commands[0];
   assert.equal(c.type,'review');assert.equal(c.owner,'A');assert.equal(c.planId,p.id);assert.equal(c.snapshotId,p.snapshotId);
   row.latencyMs=receivedAt-start;row.requests=requests;row.verified=true;
  }catch(e){row.error=String(e.message);throw e;}finally{controller.abort();await save();}
 }
 // Idle request count in the same six-second window; neither consumer receives a command.
 await h.setup();report.idle={windowMs:6000,intervalRequests:0,eventRequests:0};
 const idleController=new AbortController(),idleStart=performance.now();
 const legacy=(async()=>{while(performance.now()-idleStart<6000){report.idle.intervalRequests++;await h.json('/poll?owner=A');await sleep(1500);}})();
 const event=(async()=>{report.idle.eventRequests++;const cursor=await h.json('/poll?owner=A');report.idle.eventRequests++;try{await h.json(`/events?owner=A&after=${cursor.revision}&wait=20000`,undefined,{signal:idleController.signal});}catch(e){if(!idleController.signal.aborted)throw e;}})();
 await sleep(6000);idleController.abort();await Promise.all([legacy,event]);report.idle.elapsedMs=performance.now()-idleStart;
 // These two reference functions reproduce the old server's algorithms, not an old browser runtime.
 const oldKey=(s,f)=>{const u=new URL(s.url);return JSON.stringify([u.origin,u.pathname,f.label,f.section,f.type,f.anchors||[]]);};
 const oldMemory=(s,m)=>{const result={};for(const f of s.fields){const k=oldKey(s,f);if(s.fields.filter(x=>oldKey(s,x)===k).length===1&&m[k])result[f.id]=m[k];}return result;};
 const oldRelevant=(s,facts,p)=>facts.filter(f=>f.confirmed!==false&&!f.conflict&&(p.entries.some(e=>e.factId===f.id)||s.fields.some(x=>candidatesFor({...x,url:s.url},[f]).length)));
 for(const count of [160,500]){
  const snapshot={url:'https://benchmark.example.invalid/form',fields:Array.from({length:count},(_,i)=>({id:'f'+i,label:'字段'+i,type:'text',value:'',section:'基本信息'}))};
  const facts=snapshot.fields.map((f,i)=>({id:'id'+i,label:f.label,value:'SYNTHETIC-'+i,confirmed:true,section:f.section}));
  const plan={entries:[]},memory=Object.fromEntries(snapshot.fields.map((f,i)=>[oldKey(snapshot,f),'id'+i]));
  const expected=oldMemory(snapshot,memory);
  for(let pair=0;pair<pairs;pair++)for(const arm of pair%2?['indexed','nested']:['nested','indexed']){
   const row={fields:count,pair:pair+1,arm,verified:false};report.preparation.push(row);const start=performance.now();
   const mappings=arm==='nested'?oldMemory(snapshot,memory):rememberedMappings(indexFields(snapshot),memory);
   const relevant=arm==='nested'?oldRelevant(snapshot,facts,plan):relevantFacts(snapshot,facts,plan);
   row.durationMs=performance.now()-start;
   assert.deepEqual({...mappings},expected);assert.deepEqual(relevant,facts);row.verified=true;await save();
  }
 }
 report.complete=true;
}catch(error){report.failure=String(error.message);throw error;}
finally{await h.close();await save();}
const median=values=>{values.sort((a,b)=>a-b);return (values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2;};
report.summary={notification:Object.fromEntries(['interval','event'].map(arm=>[arm,{medianMs:median(report.notification.filter(r=>r.arm===arm).map(r=>r.latencyMs))}])),preparation:[160,500].map(fields=>({fields,...Object.fromEntries(['nested','indexed'].map(arm=>[arm,median(report.preparation.filter(r=>r.arm===arm&&r.fields===fields).map(r=>r.durationMs))]))}))};
await save();console.log(JSON.stringify(report.summary,null,2));
