import test from 'node:test';
import assert from 'node:assert/strict';
import {TrustedUiOpens} from '../extension/core/ui-open.mjs';
import {recordDirectory,selectedProfileFacts} from '../extension/core/record-model.mjs';
import {resultSummary} from '../extension/core/page-summary.mjs';
import {resolveRecords} from '../extension/core/record-resolver.mjs';
import {fieldDiagnostic,cleanDiagnostic} from '../extension/core/match-diagnostics.mjs';
import {localHarness} from './helpers/local-harness.mjs';

test('UI creation is only requested until an exact trusted tab/document acknowledges it',async()=>{
 const events=[],runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p};
 const ui=new TrustedUiOpens({runtime},{onState:r=>events.push(r),timeout:20});let openedUrl;
 const r=await ui.open({url:runtime.getURL('local.html')+'?tab=11',view:'manager',create:async url=>{openedUrl=url;return {id:42};}});
 assert(r.requested);assert.equal(r.opened,false);
 const sender={id:runtime.id,url:openedUrl,documentId:'doc',tab:{id:42},frameId:0};
 assert.throws(()=>ui.ready({requestId:r.uiRequest},{...sender,tab:{id:43}}));
 assert(ui.ready({requestId:r.uiRequest},sender).ready);assert.equal(events.at(-1).state,'ready');
 assert.throws(()=>ui.ready({requestId:r.uiRequest},sender));ui.cancel();
});
test('host denial and silent creation are distinct, bounded and revoke the pending ticket',async()=>{
 const events=[],runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p};let revoked=0;
 const ui=new TrustedUiOpens({runtime},{onState:r=>events.push(r),timeout:10});
 await assert.rejects(ui.open({url:runtime.getURL('local.html'),view:'manager',create:async()=>{throw Error('private host string');},onRevoke:()=>revoked++}),e=>e.code==='host-ui-denied');
 await ui.open({url:runtime.getURL('local.html'),view:'manager',create:async()=>({id:42}),onRevoke:()=>revoked++});
 await new Promise(r=>setTimeout(r,25));assert.equal(revoked,2);assert.deepEqual(events.map(e=>e.state),['requested','denied','requested','timeout']);assert(!JSON.stringify(events).includes('private'));
});
test('record selection excludes only unselected records and leaves the library intact',()=>{
 const facts=['A','B'].map(entity=>({id:entity,label:'项目名称',section:'项目经历',value:entity,entity,confirmed:true}));
 const profile={facts,selectedRecordIds:['B']};assert.equal(recordDirectory(facts).length,2);assert.deepEqual(selectedProfileFacts(profile).map(f=>f.id),['B']);assert.equal(profile.facts.length,2);
});
test('source order is limited to explicitly authorized newly created empty domains',()=>{
 const facts=['A','B'].map(entity=>({id:entity,label:'学校',section:'教育经历',value:entity,entity,confirmed:true}));
 const snapshot={url:'https://example.invalid',fields:['one','two'].map(id=>({id,label:'学校',section:'教育经历',type:'text',value:'',groupId:id}))};
 assert.equal(Object.keys(resolveRecords(snapshot,facts).bindings).length,0);
 assert.deepEqual(resolveRecords(snapshot,facts,{},['education']).bindings,{one:'A',two:'B'});
 snapshot.fields[0].value='unverified existing';assert.equal(Object.keys(resolveRecords(snapshot,facts,{},['education']).bindings).length,0);
});
test('post-execution summary removes verified fields from pending without hiding unresolved targets',()=>{
 const plan={entries:[{id:'a',frameId:0,label:'姓名',status:'ready'},{id:'b',frameId:0,label:'学校',status:'missing',reasonCode:'record-unbound'}]};
 const result=resultSummary(plan,[{id:'a',status:'verified'}]);assert.equal(result.counts.ready,0);assert.equal(result.written,1);assert.equal(result.counts.missing,1);assert.equal(plan.entries[0].status,'ready');
});
test('custom exact matches remain distinguishable from redacted unknown labels',()=>{
 const d=cleanDiagnostic(fieldDiagnostic({label:'自定义岗位意向',kind:'custom-select',status:'ready',factId:'f'},[{label:'自定义岗位意向',id:'f',confirmed:true}]));
 assert.equal(d.semantic,'unknown');assert.equal(d.semanticState,'custom-exact');assert.equal(d.controlKindState,'known');assert(!JSON.stringify(d).includes('自定义岗位意向'));
});
test('empty profile can capture an already-filled page without authorizing writes or persistence',async()=>{
 const h=localHarness();await h.attach();const invoke=h.chrome.scripting.executeScript;
 h.chrome.scripting.executeScript=async c=>c.args?.[0]==='capture'?[{frameId:0,documentId:'target-document',result:{fields:[{id:'name',label:'姓名',value:'虚构人',type:'text'}]}}]:invoke(c);
 h.chrome.windows={create:async()=>({tabs:[{id:42}]})};
 const sender={id:h.chrome.runtime.id,frameId:0,tab:{id:11},documentId:'target-document',url:'https://jobs.example.invalid/apply'};
 const r=await h.workflow.pageRequest({type:'page-local-learn-existing'},sender);assert(r.requested);assert.equal((await h.api('state')).accepted,false);assert.deepEqual(h.values,{});
 await assert.rejects(h.workflow.pageRequest({type:'page-local-run',reviewed:true},sender),e=>e.code==='profile-not-initialized');
});


test('whole-page evidence separates 6 verified existing values from 90 unverified values',async()=>{
 const {pageSummary}=await import('../extension/core/page-summary.mjs');
 const entries=[...Array.from({length:6},()=>({status:'preserve',reasonCode:'existing-consistent'})),...Array.from({length:90},()=>({status:'preserve',reasonCode:'existing-unverified'})),...Array.from({length:3},()=>({status:'missing',reasonCode:'no-label-match'})),...Array.from({length:3},()=>({status:'manual',reasonCode:'restricted-control',kind:'file'}))];
 const s=pageSummary({entries});assert.equal(s.total,102);assert.equal(s.coverage.consistent,6);assert.equal(s.coverage.unverified,90);assert.equal(s.counts.missing,3);assert.equal(s.counts.manual,3);
});

test('full library recovery retains the preceding snapshot and selected record set',async()=>{
 const {ProfileLibrary,BEFORE_CHANGE_KEY}=await import('../extension/core/profile-library.mjs');
 const {memory}=await import('./helpers/local-harness.mjs');const storage=memory(),library=new ProfileLibrary(storage);await library.load();
 let p=await library.save([{id:'p',label:'项目名称',section:'项目经历',entity:'测试项目',source:'fixture',value:'测试项目',confirmed:true}],0,true);
 p=await library.selectRecords(['p'],p.revision);p=await library.save([...p.facts,{id:'n',label:'姓名',value:'测试人',source:'fixture',confirmed:true}],p.revision);
 const snapshot=storage.data[BEFORE_CHANGE_KEY];assert.equal(snapshot.library.resumes[0].profile.facts.length,1);
 p=await library.restore(snapshot,p.revision,true);assert.equal(p.facts.length,1);assert.deepEqual(p.selectedRecordIds,['p']);assert.equal(storage.data[BEFORE_CHANGE_KEY].library.resumes[0].profile.facts.length,2);
});

test('task export excludes other tasks and keeps environment explicitly user declared',async()=>{
 const {selectLogExport}=await import('../extension/core/log-export.mjs');
 const r=selectLogExport({records:[{taskId:'old'},{operationId:'scan'},{taskId:'new'},{taskId:'new'}]},{scope:'task',environment:'Edge'});
 assert.equal(r.records.length,2);assert(r.records.every(x=>x.taskId==='new'));assert.deepEqual(r.environment,{value:'Edge',source:'user-declared'});
});

test('window ID is not confused with the created tab during UI handshake',async()=>{
 const runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p},ui=new TrustedUiOpens({runtime});let url;
 const r=await ui.open({url:runtime.getURL('record-review.html'),view:'records',create:async u=>{url=u;return {id:5,tabs:[{id:42}]};}});
 assert(ui.ready({requestId:r.uiRequest},{id:runtime.id,url,documentId:'doc',tab:{id:42},frameId:0}).ready);
});
