import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceRun} from '../extension/core/workspace-run.mjs';
import {FrameBroker} from '../extension/core/frame-broker.mjs';
import {secureTarget,trustedWorkspace,selectedFacts,redactSnapshot,summaryOnly} from '../extension/core/workspace-policy.mjs';
import {createWorkspace} from '../extension/workspace-worker.mjs';
import {withDeadline} from '../extension/core/execution-deadline.mjs';
const fact={id:'person',label:'姓名',value:'SYNTHETIC_PERSON',source:'synthetic fixture',confirmed:true};
const email={id:'email',label:'邮箱',value:'example@example.invalid',source:'synthetic fixture',confirmed:true};
const snapshot=(id='s')=>({id,url:'https://jobs.example.invalid/form',fields:[{id:'f',type:'text',label:'姓名',value:''},{id:'e',type:'email',label:'邮箱',value:''}],coverage:{fields:2,frames:0}});
function harness({frames=1,clock=()=>1000}={}) {
 const profile={facts:[fact,email],revision:1}; const calls=[];
 const vault={unlocked:true,read(){if(!this.unlocked)throw Error('locked');return structuredClone(profile);}};
 const observed={url:snapshot().url,frames:Array.from({length:frames},(_,i)=>({frameId:i,documentId:'doc'+i,snapshot:snapshot('s'+i)})),skipped:[],includeFrames:frames>1};
 const broker={async scan(){return structuredClone(observed);},async tab(){return {url:snapshot().url};},async cancel(){calls.push({cancel:true});},async invoke(tabId,target,action,plan){calls.push({tabId,target,action,plan});return {result:{results:plan.entries.map(e=>({fieldId:e.fieldId,status:'verified'}))}};}};
 const run=new WorkspaceRun(vault,broker,clock), scan=()=>run.scan('workspace1',{tabId:11,factIds:['person','email'],includeFrames:frames>1});
 return {run,scan,vault,broker,profile,calls};
}
test('workspace origin check distinguishes extension hosts even when URL.origin is null',()=>{
 const runtime={id:'our-id',getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p};
 const sender={id:'our-id',url:runtime.getURL('workspace.html')+'?tab=11',frameId:0,documentLifecycle:'active'};
 assert(trustedWorkspace(sender,runtime));
 for(const changed of [{id:'foreign'},{url:sender.url.replace('a'.repeat(32),'b'.repeat(32))},{frameId:2},{documentLifecycle:'prerender'},{url:runtime.getURL('workspace.html.evil')},{url:'https://jobs.example.invalid/workspace.html'}])assert(!trustedWorkspace({...sender,...changed},runtime));
});
test('public HTTP, credentials and non-web destinations cannot receive local profile data',()=>{
 for(const url of ['http://jobs.example.invalid/','https://user:pass@jobs.example.invalid/','file:///tmp','javascript:alert(1)','http://127.0.0.1.evil.invalid/'])assert.throws(()=>secureTarget(url));
 for(const url of ['https://jobs.example.invalid/','http://127.0.0.1:19876/','http://localhost:19876/','http://[::1]:19876/'])assert.equal(secureTarget(url).href,url);
});
test('selected facts reject drafts, conflicts, missing IDs, duplicates and credentials',()=>{
 assert.deepEqual(selectedFacts({facts:[fact,email]},['person']),[fact]);
 for(const f of [{...fact,confirmed:false},{...fact,conflict:true},{...fact,label:'API token'}])assert.throws(()=>selectedFacts({facts:[f]},['person']));
 for(const ids of [[],['person','person'],['unknown'],[7]])assert.throws(()=>selectedFacts({facts:[fact]},ids));
});
test('AI snapshot uses a metadata allowlist and preserves empty multi-value types',()=>{
 const input={...snapshot(),private:'PRIVATE_ROOT',fields:[{...snapshot().fields[0],value:'PRIVATE_VALUE',anchors:['PRIVATE_ANCHOR'],control:{title:'PRIVATE_CONTROL'},custom:'PRIVATE_EXTENSION',entity:'PRIVATE_ENTITY'},{id:'m',label:'方向',type:'select',multiple:true,value:[],options:[{label:'测试',value:'test',disabled:false,hidden:'PRIVATE_OPTION'}]},{id:'p',label:'Password',type:'password',value:'PRIVATE_SECRET'}],coverage:{fields:3,private:'PRIVATE_COVERAGE'}};
 const redacted=redactSnapshot(input),string=JSON.stringify(redacted);
 assert(!string.includes('PRIVATE_'));assert.deepEqual(redacted.fields[1].value,[]);assert.equal(redacted.fields.length,2);
 assert.deepEqual(redactSnapshot(redacted),redacted,'double redaction must be idempotent');
});
test('diagnostics do not return values, labels, URLs, errors or unknown statuses',()=>{
 assert.deepEqual(summaryOnly({url:'PRIVATE_URL',results:[{status:'verified',value:'PRIVATE_VALUE',reason:'PRIVATE_ERROR'},{status:'invented'}]}),{schemaVersion:1,counts:{verified:1},submitted:false});
});
test('local preview and writes do not use a bridge; only selected entries reach one document',async()=>{
 const h=harness(), p=await h.scan();
 assert.equal(p.entries.length,2);assert.equal(p.capabilities.locate,false);
 const report=await h.run.apply('workspace1',{planId:p.id,ids:['0:f'],reviewed:true});
 assert.equal(report.results[0].status,'verified');assert.equal(h.calls.length,1);
 assert.deepEqual(h.calls[0].target,{frameId:0,documentId:'doc0'});
 assert.equal(h.calls[0].plan.entries.length,1);assert(!JSON.stringify(h.calls[0]).includes(email.value));
 await assert.rejects(h.run.apply('workspace1',{planId:p.id,ids:['0:f'],reviewed:true}),/失效/);
});
test('wrong workbench document, expired plans and changed profile revisions cannot execute',async()=>{
 let now=1000;const h=harness({clock:()=>now});let p=await h.scan();
 assert.throws(()=>h.run.current('other',p.id),/失效/);
 h.profile.revision++;assert.throws(()=>h.run.current('workspace1',p.id),/失效/);
 p=await h.scan();now=p.expiresAt;assert.throws(()=>h.run.current('workspace1',p.id),/失效/);
 assert.equal(h.calls.length,0);
});
test('consent, nonempty selected IDs and exact allowed set are required',async()=>{
 const h=harness(),p=await h.scan();
 for(const change of [{reviewed:false},{ids:[]},{ids:['0:f','0:f']},{ids:['5:f']}])await assert.rejects(h.run.apply('workspace1',{planId:p.id,ids:['0:f'],reviewed:true,...change}),/明确选择/);
 assert.equal(h.calls.length,0);
});
test('same-origin child fields can be inventoried but receive neither planned private values nor writes',async()=>{
 const h=harness({frames:2}),p=await h.scan();const children=p.entries.filter(e=>e.frameId===1);
 assert(children.every(e=>e.status==='manual'&&e.value===undefined&&e.source===undefined));
 await assert.rejects(h.run.apply('workspace1',{planId:p.id,ids:['1:f'],reviewed:true}),/明确选择/);
 await assert.rejects(h.run.forMCP('workspace1',{planId:p.id,factIds:['person'],consent:true}),/主文档/);
 assert.equal(h.calls.length,0);
});
test('stop during asynchronous tab check prevents a later page write',async()=>{
 const h=harness(),p=await h.scan();let resume;
 h.broker.tab=()=>new Promise(r=>{resume=r;});
 const writing=h.run.apply('workspace1',{planId:p.id,ids:['0:f'],reviewed:true});
 await h.run.stop();resume({url:snapshot().url});
 const report=await writing;assert.equal(report.results[0].status,'cancelled');assert(!h.calls.some(c=>c.action==='apply'));
});
test('scan cancellation is not allowed to revive a stale private plan',async()=>{
 const h=harness();let resume;const original=h.broker.scan;
 h.broker.scan=()=>new Promise(r=>{resume=r;});
 const scanning=h.scan();await h.run.stop();resume(await original());
 await assert.rejects(scanning,/取消/);assert.equal(h.run.job,null);
});
test('remapping rotates plan identity and cannot select an unshared fact',async()=>{
 const h=harness(),p=await h.scan();
 assert.throws(()=>h.run.remap('workspace1',{planId:p.id,id:'0:f',factId:'unshared'}),/不属于/);
 const next=h.run.remap('workspace1',{planId:p.id,id:'0:f',factId:'person'});
 assert.notEqual(next.id,p.id);assert.throws(()=>h.run.current('workspace1',p.id),/失效/);
});
test('unknown, duplicated and missing receipts are not promoted to successful filling',async()=>{
 for(const results of [[{fieldId:'unknown',status:'verified'}],[{fieldId:'f',status:'verified'},{fieldId:'f',status:'verified'}],[]]){
  const h=harness(),p=await h.scan();h.broker.invoke=async()=>({result:{results}});
  const report=await h.run.apply('workspace1',{planId:p.id,ids:['0:f'],reviewed:true});
  assert.notEqual(report.results[0].status,'verified');assert.equal(h.run.busy,false);
 }
});
test('MCP receives only explicitly selected facts and redacted form structure',async()=>{
 const h=harness(),p=await h.scan();
 await assert.rejects(h.run.forMCP('workspace1',{planId:p.id,factIds:['person'],consent:false}),/授权/);
 const grant=await h.run.forMCP('workspace1',{planId:p.id,factIds:['person'],consent:true});
 assert.equal(grant.facts.length,1);assert(!JSON.stringify(grant).includes(email.value));assert.equal(grant.snapshot.owner,'11');
});
test('broker rejects child writes and changed browser document IDs before trusting results',async()=>{
 const chrome={scripting:{executeScript:async()=>[{frameId:0,documentId:'new-doc',result:{results:[]}}]}};
 const b=new FrameBroker(chrome);
 await assert.rejects(b.invoke(11,{frameId:1,documentId:'child'},'apply',{}),/仅扫描/);
 await assert.rejects(b.invoke(11,{frameId:0,documentId:'old-doc'},'apply',{}),/已变化/);
});
test('deadline stops uncertain execution instead of treating late results as success',async()=>{
 let stopped=0;
 await assert.rejects(withDeadline({expiresAt:Date.now()-1},()=>assert.fail('must not write'),()=>stopped++),/到期/);
 await assert.rejects(withDeadline({expiresAt:Date.now()+15},async()=>{await new Promise(r=>setTimeout(r,40));return {ok:true};},()=>stopped++),/到期/);
 assert.equal(stopped,1);
 assert.deepEqual(await withDeadline({expiresAt:Date.now()+1000},async()=>({ok:true}),()=>stopped++),{ok:true});
 await new Promise(r=>setTimeout(r,20));assert.equal(stopped,1);
});
function store(data={}){return {async setAccessLevel(){},async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,structuredClone(v));}};}
test('cold-start trusted storage configuration completes before any workspace action',async()=>{
 let release;const gate=new Promise(r=>release=r),local=store();local.setAccessLevel=()=>gate;
 const chrome={storage:{local,session:store()},runtime:{id:'own',getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p}};
 const w=createWorkspace(chrome,{api:()=>assert.fail('no bridge'),inject:()=>{},legacyBusy:()=>false});
 let done=false;const response=w.request({type:'workspace-status'},{id:'own',frameId:0,url:chrome.runtime.getURL('workspace.html'),documentId:'trusted'}).then(r=>{done=true;return r;});
 await new Promise(r=>setTimeout(r,10));assert.equal(done,false);release();assert.equal((await response).exists,false);
});

test('pairing verifies the fixed endpoint, refuses redirects/bad tokens and only returns safe metadata',async()=>{
 const {verifyBridgePairing}=await import('../extension/core/bridge-pairing.mjs');let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:19327/status');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({version:'0.4.3',transport:2,private:'MUST_NOT_RETURN'})};};
 await assert.rejects(verifyBridgePairing('bad',fetcher),/64/);assert.equal(calls,0);
 assert.deepEqual(await verifyBridgePairing('a'.repeat(64),fetcher),{connected:true,version:'0.4.3'});
 await assert.rejects(verifyBridgePairing('a'.repeat(64),async()=>({ok:false})),/拒绝/);
 await assert.rejects(verifyBridgePairing('a'.repeat(64),async()=>({ok:true,json:async()=>({version:'0.3.2',transport:2})})),/更新/);
});
