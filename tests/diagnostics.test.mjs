import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticRecorder,LOG_KEY,MAX_EVENTS,CAPTURE_MS,RETENTION_MS,cleanEvent,exportReport,errorCode} from '../extension/core/diagnostics.mjs';
import {createDiagnosticHooks,describeResult} from '../extension/core/diagnostic-hooks.mjs';
const id='d-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function memory(){const data={};let writes=0;return {data,get writes(){return writes;},async setAccessLevel(){},async get(k){return {[k]:structuredClone(data[k])};},async set(v){writes++;Object.assign(data,structuredClone(v));}};}
function setup(){const store=memory();let now=100000;const recorder=new DiagnosticRecorder(store,()=>now,'0.6.1');return {store,recorder,advance:n=>now+=n};}
test('diagnostics are opt-in: no operation content or start event is stored by default',async()=>{
 const h=setup();assert.equal(await h.recorder.start('scan'),null);assert.equal(h.store.writes,0);assert.equal((await h.recorder.state()).events.length,0);
});
test('capture records bounded fields and local elapsed time but never raw data',async()=>{
 const h=setup();await h.recorder.configure(true);const t=await h.recorder.start('fill','local');h.advance(550);
 await h.recorder.finish(t,{state:'partial',code:'PARTIAL',url:'PRIVATE',value:'PRIVATE',token:'PRIVATE',stack:'PRIVATE'},[{ordinal:1,state:'invalid',code:'INPUT_REJECTED',kind:'email',label:'PRIVATE',value:'PRIVATE',path:'PRIVATE',required:true}]);
 const s=await h.recorder.state();assert.equal(s.events.length,3);assert.equal(s.events.at(-1).durationMs,550);assert(!JSON.stringify(h.store.data).includes('PRIVATE'));
 const report=exportReport(s,'0.6.1');assert(!report.events.some(e=>'at' in e));assert.equal(report.events[0].offsetMs,0);assert.equal(report.events[0].appVersion,'0.6.1');
});
test('unknown strings and invalid metadata are removed, not regex-redacted in place',()=>{
 const e=cleanEvent({trace:id,at:1,action:'scan',phase:'field',channel:'PRIVATE',state:'PRIVATE',code:'PRIVATE',kind:'PRIVATE',count:Infinity,ordinal:-1,required:'PRIVATE',reason:'PRIVATE'});
 assert(!JSON.stringify(e).includes('PRIVATE'));assert.equal(e.kind,'unknown');assert.equal(e.code,'INTERNAL');assert(!('count' in e));assert.equal(cleanEvent({trace:'PRIVATE',at:1,action:'scan',phase:'start'}),null);
});
test('one large result is batched, retains errors first, and tells the user about omissions',async()=>{
 const h=setup();await h.recorder.configure(true);const t=await h.recorder.start('scan');const before=h.store.writes;
 await h.recorder.finish(t,{state:'partial',code:'PARTIAL'},Array.from({length:1000},(_,i)=>({ordinal:i+1,state:i===999?'invalid':'ready',code:i===999?'INPUT_REJECTED':'OK'})));
 assert.equal(h.store.writes-before,1);const s=await h.recorder.state();assert(s.events.some(e=>e.ordinal===1000));assert.equal(s.events.at(-1).omitted,600);assert.equal(s.dropped,600);
});
test('ring buffer bounds survive worker reconstruction',async()=>{
 const h=setup();await h.recorder.configure(true);
 for(let n=0;n<5;n++){const t=await h.recorder.start('fill');await h.recorder.finish(t,{state:'ok',code:'OK'},Array.from({length:200},(_,i)=>({ordinal:i,state:'verified',code:'OK'})));}
 assert.equal((await h.recorder.state()).events.length,MAX_EVENTS);
 const next=new DiagnosticRecorder(h.store,()=>100000,'0.7.1');const s=await next.state();assert.equal(s.events.length,MAX_EVENTS);assert(s.events.every(e=>e.appVersion==='0.6.1'));assert(s.dropped>0);
});
test('capture expires after thirty minutes and old records are pruned on access',async()=>{
 const h=setup();await h.recorder.configure(true);const t=await h.recorder.start('scan');await h.recorder.finish(t,{state:'ok',code:'OK'});h.advance(CAPTURE_MS);
 assert.equal(await h.recorder.start('fill'),null);assert.equal((await h.recorder.state()).enabled,false);h.advance(RETENTION_MS);assert.equal((await h.recorder.state()).events.length,0);
});
test('clear/stop revoke pending handles so late outcomes cannot resurrect cleared logs',async()=>{
 const h=setup();await h.recorder.configure(true);const t=await h.recorder.start('fill');await h.recorder.clear();await h.recorder.configure(true);await h.recorder.finish(t,{state:'ok',code:'OK'});assert.equal((await h.recorder.state()).events.length,0);
 const current=await h.recorder.start('fill');await h.recorder.configure(false);await h.recorder.finish(current,{state:'ok',code:'OK'});assert.equal((await h.recorder.state()).events.length,1);
});
test('concurrent producers keep both start and finish records',async()=>{
 const h=setup();await h.recorder.configure(true);const ts=await Promise.all(Array.from({length:25},()=>h.recorder.start('scan')));await Promise.all(ts.map(t=>h.recorder.finish(t,{state:'ok',code:'OK'})));
 assert.equal((await h.recorder.state()).events.length,50);assert.equal(new Set(ts.map(t=>t.trace)).size,25);
});
test('diagnostic storage failure never replaces a successful operation or triggers a retry',async()=>{
 const storage={async setAccessLevel(){},async get(){throw Error('PRIVATE STORAGE PATH');},async set(){throw Error('PRIVATE');}};
 const r=new DiagnosticRecorder(storage);assert.equal(await r.start('fill'),null);await r.finish(null);
 const h=chromeHarness(storage);let writes=0;const output=await h.hooks.observe({type:'workspace-fill'},h.sender,async()=>{writes++;return {results:[]};});assert.equal(writes,1);assert.deepEqual(output,{results:[]});
});
test('cleanup does not touch other keys, including encrypted resume storage',async()=>{
 const h=setup();h.store.data.resumeVaultV1={kind:'ciphertext',ciphertext:'SYNTHETIC'};await h.recorder.configure(true);await h.recorder.clear();assert.deepEqual(h.store.data.resumeVaultV1,{kind:'ciphertext',ciphertext:'SYNTHETIC'});
});
test('incomplete operation can still be exported after restart without inventing a finish',async()=>{
 const h=setup();await h.recorder.configure(true);await h.recorder.start('fill');const s=await new DiagnosticRecorder(h.store,()=>100000).state();assert.equal(s.events.length,1);assert.equal(s.events[0].phase,'start');
});
test('per-trace export excludes other activity and drops absolute timestamps',async()=>{
 const h=setup();await h.recorder.configure(true);const a=await h.recorder.start('scan'),b=await h.recorder.start('fill');await h.recorder.finish(a,{state:'ok',code:'OK'});await h.recorder.finish(b,{state:'ok',code:'OK'});
 const r=exportReport(await h.recorder.state(),'0.6.1',a.trace);assert.equal(r.events.length,2);assert(r.events.every(e=>e.trace===a.trace&&!('at' in e)));
});
test('persisted malformed records are sanitized again before reading',async()=>{
 const h=setup();h.store.data[LOG_KEY]={events:[{trace:id,at:100000,action:'fill',phase:'finish',code:'PRIVATE',raw:'PRIVATE'}],until:Infinity,private:'PRIVATE'};
 const s=await h.recorder.state();assert(!JSON.stringify(s).includes('PRIVATE'));assert.equal(s.enabled,false);
});
test('error classification returns fixed codes without storing potentially identifying messages',()=>{
 for(const [message,code] of [['资料库已锁定','LOCKED'],['本机服务超时 PRIVATE','BRIDGE_UNAVAILABLE'],['网页目标已变化 PRIVATE','TARGET_CHANGED'],['配对码错误 SECRET','BRIDGE_AUTH'],['opaque private user detail','INTERNAL']])assert.equal(errorCode(Error(message)),code);
});
function chromeHarness(store=memory()){
 const runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,getManifest:()=>({version:'0.6.1'})};const hooks=createDiagnosticHooks({runtime,storage:{local:store}});
 const sender={id:runtime.id,url:runtime.getURL('workspace.html'),frameId:0,documentId:'work'};
 const diagnosis={...sender,url:runtime.getURL('diagnostics.html')};return {hooks,sender,diagnosis,runtime,store};
}
test('webpage and unrelated extension cannot read, configure or forge diagnostic writes',async()=>{
 const h=chromeHarness();
 for(const sender of [{...h.sender,url:'https://jobs.example.invalid/'},{...h.diagnosis,id:'foreign'},{...h.diagnosis,frameId:1}])for(const type of ['diagnostics-state','diagnostics-configure','diagnostics-clear','diagnostics-panel-start','diagnostics-ui-error'])await assert.rejects(h.hooks.handle({type,enabled:true,action:'fill'},sender));
});
test('production workspace hooks correlate scan and selected field results without labels/values',async()=>{
 const h=chromeHarness();await h.hooks.handle({type:'diagnostics-configure',enabled:true},h.diagnosis);
 const plan={id:'PRIVATE_PLAN',entries:[{id:'PRIVATE_A',label:'PRIVATE_LABEL',value:'PRIVATE_VALUE',status:'ready',kind:'text'},{id:'PRIVATE_B',label:'PRIVATE_LABEL',status:'missing'}]};
 await h.hooks.observe({type:'workspace-scan'},h.sender,async()=>plan);
 await h.hooks.observe({type:'workspace-fill',planId:plan.id},h.sender,async()=>({results:[{id:'PRIVATE_B',status:'invalid',reason:'PRIVATE'}]}));
 const report=await h.hooks.handle({type:'diagnostics-export'},h.diagnosis);assert(!JSON.stringify(report).includes('PRIVATE'));assert(report.events.some(e=>e.action==='fill'&&e.ordinal===2&&e.code==='INPUT_REJECTED'));
});
test('production error hook rethrows the same error but exports only the fixed reason',async()=>{
 const h=chromeHarness();await h.hooks.recorder.configure(true);const error=Error('资料库已锁定 / PRIVATE');await assert.rejects(h.hooks.observe({type:'workspace-fill'},h.sender,async()=>{throw error;}),e=>e===error);
 const report=await h.hooks.handle({type:'diagnostics-export'},h.diagnosis);assert(report.events.some(e=>e.code==='LOCKED'));assert(!JSON.stringify(report).includes('PRIVATE'));
});
test('status polling and ordinary vault reads are not recorded or amplified',async()=>{
 const h=chromeHarness();await h.hooks.recorder.configure(true);for(let i=0;i<20;i++)await h.hooks.observe({type:'workspace-status'},h.sender,async()=>({unlocked:true}));assert.equal((await h.hooks.recorder.state()).events.length,0);
});
test('old-panel spans require their original trusted document and are consumed once',async()=>{
 const h=chromeHarness();await h.hooks.recorder.configure(true);const p={...h.sender,url:h.runtime.getURL('panel.html'),documentId:'panel1'};
 const {trace}=await h.hooks.handle({type:'diagnostics-panel-start',action:'fill'},p);
 const message={type:'diagnostics-panel-finish',trace,summary:{state:'error',code:'INTERNAL',raw:'PRIVATE'},fields:[]};
 assert.equal((await h.hooks.handle(message,{...p,documentId:'panel2'})).recorded,false);
 assert.equal((await h.hooks.handle(message,p)).recorded,true);assert.equal((await h.hooks.handle(message,p)).recorded,false);
 assert(!JSON.stringify((await h.hooks.recorder.state())).includes('PRIVATE'));
});
test('result summary distinguishes ready from verified and rejects unclassified fields',()=>{
 const r=describeResult('scan',{entries:[{status:'ready',value:'PRIVATE'}]});assert.equal(r.fields[0].state,'ready');assert(!('verified' in r.summary));assert(!JSON.stringify(r).includes('PRIVATE'));
});

test('diagnostic formatting failure cannot mask a successful caller response',async()=>{
 const h=chromeHarness();await h.hooks.recorder.configure(true);const response={entries:[null]};let writes=0;
 const result=await h.hooks.observe({type:'workspace-fill'},h.sender,async()=>{writes++;return response;});
 assert.equal(result,response);assert.equal(writes,1);
});

test('a hanging diagnostic storage read does not delay stop or change its response',async()=>{
 const store={async setAccessLevel(){},get:()=>new Promise(()=>{}),async set(){}};const h=chromeHarness(store);let stopped=false;
 const response=await h.hooks.observe({type:'workspace-stop'},h.sender,async()=>{stopped=true;return {state:'stopped'};});
 assert.equal(stopped,true);assert.deepEqual(response,{state:'stopped'});
});


test('old panel diagnostic client bounds a nonresponsive optional IPC call',async()=>{
  const {default:vm}=await import('node:vm');
  const {readFile}=await import('node:fs/promises');
  const context={chrome:{runtime:{sendMessage:()=>new Promise(()=>{})}},window:{addEventListener(){}},setTimeout,clearTimeout};
  vm.runInNewContext(await readFile('extension/diagnostic-client.js','utf8'),context);
  const started=Date.now();
  assert.equal(await context.__resumeDiagnosticClient.start('fill'),null);
  assert(Date.now()-started<1200,'optional diagnostic IPC blocked the panel');
});

test('early UI diagnostic capture sends fixed category only, never raw error details',async()=>{
  const {default:vm}=await import('node:vm');
  const {readFile}=await import('node:fs/promises');
  const handlers={},messages=[];
  const context={chrome:{runtime:{sendMessage:async m=>{messages.push(m);return {data:{}};}}},window:{addEventListener:(type,fn)=>handlers[type]=fn},setTimeout,clearTimeout};
  vm.runInNewContext(await readFile('extension/diagnostic-client.js','utf8'),context);
  handlers.error({message:'PRIVATE_NAME',filename:'PRIVATE_PATH',error:new Error('PRIVATE_TOKEN')});
  handlers.unhandledrejection({reason:'PRIVATE_RESUME'});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(messages.length,2);assert(!JSON.stringify(messages).includes('PRIVATE_'));
  assert.equal(messages[0].code,'UI_SCRIPT');assert.equal(messages[1].code,'UI_REJECTION');
});
