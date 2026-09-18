import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {createWorkspace} from '../extension/workspace-worker.mjs';
async function harness(fetcher) {
 let listener, opened = 0; const executed = [], routes = [];
 const local={bridgeToken:'fictional-test',resumeMode:'mcp'}, session={};
 const store=data=>({setAccessLevel:async()=>{},get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values))});
 const plan = {id:'p', url:'https://jobs.test/apply', entries:[{fieldId:'f',status:'ready'}]};
 const chrome = {runtime:{id:'own-extension',getURL:x=>'chrome-extension://own/'+x,onMessage:{addListener:f=>listener=f}},
  storage:{local:store(local),session:store(session)},
  tabs:{create:async()=>opened++,onUpdated:{addListener(){}},onRemoved:{addListener(){}}},action:{onClicked:{addListener(){}}},
  scripting:{executeScript:async o=>{executed.push(o);return [{result:{results:[{fieldId:'f',status:'verified'}]}}];}}};
 const fetch = async (url, options) => {
  const route=new URL(url).pathname, body=options.body ? JSON.parse(options.body) : null;routes.push({url,route,body});
  if(fetcher)return fetcher(url,options);
  if(route==='/begin' && body.url!==plan.url)return {ok:false,json:async()=>({error:'计划不属于当前页面'})};
  return {ok:true,json:async()=>route==='/begin'?{ok:true,plan}:{ok:true}};
 };
 const source=(await fs.readFile('extension/background.js','utf8')).replace("import {createWorkspace} from './workspace-worker.mjs';",'');
 vm.runInNewContext(source,{createWorkspace,chrome,URL,Set,Map,console,AbortController,setTimeout,clearTimeout,fetch});
 const call=(m,url='https://jobs.test/apply',id='own-extension',frameId=0)=>new Promise(resolve=>{const handled=listener(m,{id,frameId,tab:{id:77},url},resolve);if(!handled)resolve(null);});
 return {call,executed,routes,get opened(){return opened;},local};
}
test('page messages reject foreign senders, wrong frame, stale URL and empty selection',async()=>{
 const h=await harness();
 assert.equal(await h.call({type:'resume-fill'},undefined,'foreign'),null);
 assert.equal(await h.call({type:'resume-fill'},undefined,undefined,1),null);
 assert.match((await h.call({type:'resume-fill',planId:'p',fieldIds:['f']},'https://jobs.test/search')).error,/当前页面/);
 assert.equal(h.executed.length,0);
 assert.match((await h.call({type:'resume-fill',planId:'p',fieldIds:[]})).error,/勾选/);
 assert.equal(h.executed.length,0);
 await h.call({type:'resume-manage'});assert.equal(h.opened,1);
});
test('fill uses one begin request, server-approved plan, sender-owned route, and a result receipt',async()=>{
 const h=await harness();await h.call({type:'resume-fill',planId:'p',fieldIds:['f']});
 assert.deepEqual(h.routes.map(r=>r.route),['/begin','/result']);
 assert(h.routes.every(r=>new URL(r.url).searchParams.get('owner')==='77'));
 assert.equal(h.executed.length,1);assert.equal(h.executed[0].target.tabId,77);
 assert.equal(h.executed[0].args[0],'apply');assert.equal(h.executed[0].args[1].id,'p');
});
test('aborted notification waits are cleaned up and cannot execute a form',async()=>{
 let active=0;
 const h=await harness((url,options)=>new Promise((resolve,reject)=>{
  active++; options.signal.addEventListener('abort',()=>{active--;reject(new DOMException('Aborted','AbortError'));},{once:true});
 }));
 const waiting=h.call({type:'resume-events',after:1});
 await new Promise(r=>setTimeout(r,10));assert.equal(active,1);
 await h.call({type:'resume-stop-poll'});assert.match((await waiting).error,/停止/);
 assert.equal(active,0);assert.equal(h.executed.length,0);
});
test('wrong plan URL returned by a bridge never reaches the page executor',async()=>{
 const h=await harness(async(url)=>({ok:true,json:async()=>new URL(url).pathname==='/begin'?{plan:{id:'p',url:'https://wrong.test/'}}:{ok:true}}));
 assert.match((await h.call({type:'resume-fill',planId:'p',fieldIds:['f']})).error,/当前页面/);
 assert.equal(h.executed.length,0);assert.deepEqual(h.routes.map(r=>r.route),['/begin','/cancel']);
});

// Inject the real imported factory in this classic-script VM harness, not a workspace stub.
test('local mode blocks every legacy page request without touching the bridge',async()=>{
 const h=await harness();h.local.resumeMode='local';
 for(const type of ['resume-scan','resume-plan','resume-poll','resume-fill']){
  assert.match((await h.call({type,planId:'p',fieldIds:['f']})).error,/本地模式/);
 }
 assert.equal(h.routes.length,0);assert.equal(h.executed.length,0);
});
test('website cannot impersonate trusted workspace to read or unlock the vault',async()=>{
 const h=await harness();
 for(const type of ['workspace-read','workspace-unlock','workspace-create','workspace-share']){
  assert.match((await h.call({type,password:'synthetic test passphrase',tabId:77})).error,/只有扩展工作台/);
 }
 assert.equal(h.routes.length,0);assert.equal(h.executed.length,0);
});
