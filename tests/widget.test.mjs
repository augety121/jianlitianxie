import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
test('in-page messages bind to sender tab and reject stale URL before writes',async()=>{
 let listener,opened=0,executed=[];const plan={id:'p',url:'https://jobs.test/apply',entries:[{fieldId:'f',status:'ready'}]};
 const chrome={runtime:{id:'own-extension',getURL:x=>'chrome-extension://own/'+x,onMessage:{addListener:f=>listener=f}},storage:{session:{get:async()=>({bridgeToken:'fictional-test'})}},tabs:{create:async()=>opened++,onUpdated:{addListener(){}}},action:{onClicked:{addListener(){}}},scripting:{executeScript:async o=>{executed.push(o);return [{result:{results:[]}}];}}};
 let routes=[];vm.runInNewContext(await fs.readFile('extension/background.js','utf8'),{chrome,URL,Set,console,AbortSignal,fetch:async u=>{routes.push(u);return {ok:true,json:async()=>u.endsWith('/plan')?plan:{ok:true}};}});
 const call=(m,url='https://jobs.test/apply',id='own-extension')=>new Promise(resolve=>{const handled=listener(m,{id,frameId:0,tab:{id:77},url},resolve);if(!handled)resolve(null);});
 assert.equal(await call({type:'resume-fill'},undefined,'foreign'),null);
 const bad=await call({type:'resume-fill',planId:'p',fieldIds:['f']},'https://jobs.test/search');assert.match(bad.error,/当前页面/);assert.equal(executed.length,0);assert.ok(!routes.some(x=>x.endsWith('/begin')));
 await call({type:'resume-manage'});assert.equal(opened,1);
 await call({type:'resume-fill',planId:'p',fieldIds:[]});assert.equal(executed[0].target.tabId,77);assert.equal(executed[0].args[1].entries[0].status,'skipped');
});
