import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace} from '../extension/workspace-worker.mjs';
const origin='https://jobs.example.invalid',url=origin+'/form';
const sender={id:'extension',frameId:0,url:'chrome-extension://extension/workspace.html',documentId:'trusted'};
const area=data=>({async setAccessLevel(){},async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,structuredClone(v));}});
function setup(){
 const local={},session={'workspace-target-11':origin},apiCalls=[];
 let release,hold=false;
 const chrome={storage:{local:area(local),session:area(session)},runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p},
   tabs:{get:async()=>hold?new Promise(resolve=>{release=resolve;}):{id:11,url}},
   scripting:{executeScript:async r=>r.files?[{frameId:0,documentId:'page'}]:[{frameId:0,documentId:'page',result:{id:'scan',url,fields:[{id:'f',label:'姓名',type:'text',value:''}],coverage:{fields:1}}}]}};
 const w=createWorkspace(chrome,{api:async(route,data)=>{apiCalls.push({route,data});return {expiresAt:Date.now()+300000};},inject:async()=>{},legacyBusy:()=>false});
 return {w,apiCalls,hold(){hold=true;},release(){hold=false;release({id:11,url});},waiting:()=>!!release};
}
async function prepare(h){
 await h.w.request({type:'workspace-create',password:'Synthetic share test phrase'},sender);
 await h.w.request({type:'workspace-save',revision:0,facts:[{id:'name',label:'姓名',value:'SYNTHETIC_PERSON',source:'synthetic test',confirmed:true}]},sender);
 return h.w.request({type:'workspace-scan',tabId:11,factIds:['name']},sender);
}
test('two concurrent shares cannot pass the first asynchronous boundary together',async()=>{
 const h=setup(),plan=await prepare(h);h.hold();
 const request={type:'workspace-share',tabId:11,planId:plan.id,factIds:['name'],consent:true};
 const first=h.w.request(request,sender).then(x=>({x}),e=>({e}));
 while(!h.waiting())await new Promise(r=>setTimeout(r,1));
 await assert.rejects(h.w.request(request,sender),/另一项任务/);
 await h.w.request({type:'workspace-lock'},sender);h.release();
 assert((await first).e);assert.equal(h.apiCalls.length,0,'lock must prevent sending private facts');
});
test('revoke arriving during attached-tab check cancels the not-yet-sent share',async()=>{
 const h=setup(),plan=await prepare(h);h.hold();
 const first=h.w.request({type:'workspace-share',tabId:11,planId:plan.id,factIds:['name'],consent:true},sender).then(x=>({x}),e=>({e}));
 while(!h.waiting())await new Promise(r=>setTimeout(r,1));
 await h.w.request({type:'workspace-revoke'},sender);h.release();
 assert.match((await first).e.message,/取消/);assert.equal(h.apiCalls.length,0);
});
