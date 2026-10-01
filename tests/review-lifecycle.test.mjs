import test from 'node:test';
import assert from 'node:assert/strict';
import {observeReviewWindow,bindReviewDocument} from '../extension/core/review-window-lifecycle.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
const url='chrome-extension://'+'a'.repeat(32)+'/record-review.html?ticket=synthetic';
const ticket=()=>({reviewUrl:url,pickerTab:42,pickerDocument:null,initialComplete:false,claimed:false,expires:1000});
const sender={url,tab:{id:42},documentId:'doc-one',documentLifecycle:'active'};
test('initial URL-less loading stays pending; only exact sender proof binds the first document',()=>{
 const t=ticket();assert.equal(observeReviewWindow(t,{status:'loading'},{}),false);
 assert.equal(t.pickerDocument,null);
 assert.throws(()=>bindReviewDocument(t,{...sender,url:url+'wrong'},100));
 bindReviewDocument(t,sender,100);assert.equal(t.pickerDocument,'doc-one');
 assert.equal(observeReviewWindow(t,{status:'complete'},{}),false);
 assert.equal(observeReviewWindow(t,{status:'loading'},{}),true);
});
test('reload, close and URL changes revoke even without a first read',()=>{
 for(const change of [{removed:true},{url:'https://wrong.invalid/'},{url:url+'#new'}]){
  assert.equal(observeReviewWindow(ticket(),change,{}),true);
 }
 const t=ticket();observeReviewWindow(t,{status:'loading'},{});
 assert.equal(observeReviewWindow(t,{status:'loading'},{}),true);
 const complete=ticket();observeReviewWindow(complete,{status:'complete'},{});
 assert.equal(observeReviewWindow(complete,{status:'loading'},{}),true);
 assert.equal(observeReviewWindow(ticket(),{}, {pendingUrl:'https://wrong.invalid/'}),true);
});
test('wrong tab/document, expiry, replay and inactive documents never acquire a ticket',()=>{
 const invalid=[{tab:{id:41}},{documentId:''},{documentLifecycle:'prerender'},{url:url.replace('a'.repeat(32),'b'.repeat(32))}];
 for(const altered of invalid)assert.throws(()=>bindReviewDocument(ticket(),{...sender,...altered},100));
 assert.throws(()=>bindReviewDocument(ticket(),sender,1000));
 assert.throws(()=>bindReviewDocument({...ticket(),claimed:true},sender,100));
 const t=ticket();bindReviewDocument(t,sender,100);
 assert.throws(()=>bindReviewDocument(t,{...sender,documentId:'doc-two'},100),/已改变/);
});
async function openedReview(){
 const h=localHarness();h.setScenario('education');await h.attach();
 await importText(h,'## 教育经历 | 甲记录\n学校：甲大学\n专业：甲专业\n## 教育经历 | 乙记录\n学校：乙大学\n专业：乙专业');
 let popupUrl;
 h.chrome.windows={create:async options=>{popupUrl=options.url;return {tabs:[{id:42}]};}};
 const page={id:h.chrome.runtime.id,frameId:0,url:'https://jobs.example.invalid/apply',tab:{id:11},documentId:'target-document',documentLifecycle:'active'};
 const result=await h.workflow.pageRequest({type:'page-local-run',reviewed:true},page);
 assert.equal(result.outcome,'needs-confirmation');
 const popup={id:h.chrome.runtime.id,frameId:0,url:popupUrl,tab:{id:42},documentId:'review-doc',documentLifecycle:'active'};
 const id=new URL(popupUrl).searchParams.get('ticket');
 const call=(action,extra={},override={})=>h.workflow.recordsRequest({type:'local-records-'+action,ticket:id,...extra},{...popup,...override});
 return {h,page,popup,id,call};
}
test('real worker workflow survives bootstrap and writes only after collective confirmation',async()=>{
 const {h,call}=await openedReview();await h.workflow.navigated(42,{status:'loading'},{});
 const view=await call('read');assert.equal(view.groups.length,2);assert.deepEqual(h.values,{});
 await h.workflow.navigated(42,{status:'complete'},{});
 const bindings=view.groups.map((g,i)=>({groupId:g.id,entity:i?'甲记录':'乙记录'}));
 const r=await call('fill',{bindings,reviewed:true});assert.equal(r.counts.verified,4);
 assert.equal(h.values.aschool,'乙大学');assert.equal(h.values.bschool,'甲大学');
 await assert.rejects(call('fill',{bindings,reviewed:true}),/失效/);
});
test('real worker rejects stale window, target navigation and closing without any write',async t=>{
 for(const scenario of ['reload','close','wrong-url','target-navigation'])await t.test(scenario,async()=>{
  const {h,call}=await openedReview();await h.workflow.navigated(42,{status:'loading'},{});await call('read');
  if(scenario==='reload')await h.workflow.navigated(42,{status:'loading'},{});
  if(scenario==='close')await h.workflow.navigated(42);
  if(scenario==='wrong-url')await h.workflow.navigated(42,{url:'https://wrong.invalid/'},{});
  if(scenario==='target-navigation')await h.workflow.navigated(11,{status:'loading'},{});
  await assert.rejects(call('read'),/失效/);assert.deepEqual(h.values,{});
 });
});
test('a second popup or a different extension cannot read or close a valid review',async()=>{
 const {h,call}=await openedReview();
 await assert.rejects(call('read',{}, {tab:{id:99}}),/失效/);
 await assert.rejects(call('read',{}, {id:'foreign'}),/只有/);
 assert.equal((await call('read')).groups.length,2);
 await assert.rejects(call('close',{}, {documentId:'replacement-doc'}),/已改变/);
 assert.equal((await call('read')).groups.length,2);assert.deepEqual(h.values,{});
});
