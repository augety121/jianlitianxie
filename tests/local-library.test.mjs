import test from 'node:test';
import assert from 'node:assert/strict';
import {ProfileLibrary,PROFILE_LIBRARY_KEY,LEGACY_PROFILE_KEY,LEGACY_BACKUP_KEY} from '../extension/core/profile-library.mjs';
import {localHarness,importText,memory} from './helpers/local-harness.mjs';
import {SiteAccess,SITE_ACCESS_KEY} from '../extension/core/site-access.mjs';
import {WorkspaceRun} from '../extension/core/workspace-run.mjs';
const original={version:1,storage:'plain-local',accepted:true,profile:{revision:7,facts:[{id:'f',label:'姓名',value:'TEST_PERSON',confirmed:true,source:'synthetic'}]}};
test('reading legacy is non-mutating; first write keeps an exact legacy backup',async()=>{
 const s=memory({[LEGACY_PROFILE_KEY]:original}),lib=new ProfileLibrary(s);let p=await lib.load();
 assert.equal(p.facts[0].value,'TEST_PERSON');assert.equal(s.data[PROFILE_LIBRARY_KEY],undefined);
 p=await lib.save(p.facts,p.revision,false);assert.deepEqual(s.data[LEGACY_BACKUP_KEY],original);assert.equal(p.revision,8);
});
test('cloned versions have independent values, selection and restart invalidate old revisions',async()=>{
 const s=memory({[LEGACY_PROFILE_KEY]:original}),lib=new ProfileLibrary(s);let p=await lib.load();const first=lib.describe().activeId;
 p=await lib.create('第二版',true,p.revision,false);const second=lib.describe().activeId;
 p=await lib.save([{...p.facts[0],value:'SECOND_PERSON'}],p.revision,false);
 p=await lib.select(first,p.revision);assert.equal(p.facts[0].value,'TEST_PERSON');
 const recovered=new ProfileLibrary(s);let r=await recovered.load();assert.equal(recovered.describe().activeId,first);
 r=await recovered.select(second,r.revision);assert.equal(r.facts[0].value,'SECOND_PERSON');
 await assert.rejects(lib.save(p.facts,p.revision,false),/窗口已改变/);
});
test('invalid library does not fall back to legacy, and wrong restore preserves current bytes',async()=>{
 const s=memory({[LEGACY_PROFILE_KEY]:original,[PROFILE_LIBRARY_KEY]:{schemaVersion:0}});
 await assert.rejects(new ProfileLibrary(s).load(),/格式异常/);delete s.data[PROFILE_LIBRARY_KEY];
 const lib=new ProfileLibrary(s);await lib.load();let p=await lib.create('备用',false,7,false);const before=JSON.stringify(s.data);
 await assert.rejects(lib.restore({kind:'bogus'},p.revision,true));assert.equal(JSON.stringify(s.data),before);
 const bad=lib.backup();bad.library.activeId='missing';await assert.rejects(lib.restore(bad,p.revision,true),/缺失/);assert.equal(JSON.stringify(s.data),before);
});
test('storage failure keeps the previous active version and all user facts',async()=>{
 const s=memory({[LEGACY_PROFILE_KEY]:original}),lib=new ProfileLibrary(s);await lib.load();const before=lib.describe();
 s.set=async()=>{throw Error('synthetic storage error')};await assert.rejects(lib.create('新版本',true,7,false));assert.deepEqual(lib.describe(),before);assert.deepEqual(s.data[LEGACY_PROFILE_KEY],original);
});
test('workflow switches isolated profiles and cannot execute previous version plan',async()=>{
 const h=localHarness();await h.attach();await importText(h,'姓名：TEST_PERSON\n邮箱：person@example.invalid');let state=await h.api('state',{tabId:11});const first=state.library.activeId;
 const plan=await h.api('scan',{tabId:11});await h.api('library-create',{name:'备用岗位',duplicate:true,revision:state.profile.revision,reviewed:true});
 await assert.rejects(h.api('fill',{planId:plan.id,ids:['0:name'],reviewed:true}),/失效/);
 state=await h.api('state',{tabId:11});await h.api('edit',{revision:state.profile.revision,reviewed:true,fact:{...state.profile.facts[0],value:'SECOND_PERSON'}});
 state=await h.api('state',{tabId:11});await h.api('library-select',{id:first,revision:state.profile.revision});
 assert.equal((await h.api('state')).profile.facts[0].value,'TEST_PERSON');h.restart();assert.equal((await h.api('state')).library.resumes.length,2);
});
test('site opt-in requires browser origin permission and registers only that site',async()=>{
 const storage=memory(),scripts=new Map();let permission=false;
 const api={storage:{local:storage},permissions:{contains:async()=>permission},scripting:{getRegisteredContentScripts:async({ids})=>ids.filter(id=>scripts.has(id)).map(id=>scripts.get(id)),registerContentScripts:async list=>list.forEach(x=>scripts.set(x.id,x)),updateContentScripts:async list=>list.forEach(x=>scripts.set(x.id,x)),unregisterContentScripts:async({ids})=>ids.forEach(id=>scripts.delete(id))}};
 const sites=new SiteAccess(api),origin='https://jobs.example.invalid';await assert.rejects(sites.set(origin,true,true),/授权/);assert.equal(scripts.size,0);
 permission=true;await sites.set(origin,true,true);assert.equal(scripts.size,1);assert.deepEqual([...scripts.values()][0].matches,[origin+'/*']);
 assert(await sites.allowed(origin));permission=false;assert.equal(await sites.allowed(origin),false);
 permission=true;await sites.set(origin,false,true);assert.equal(scripts.size,0);assert.equal((await sites.get(origin)).add,false);
 await assert.rejects(sites.set(origin+'/path',true,false),/准确/);assert(storage.data[SITE_ACCESS_KEY]);
});
test('two blank education cards require one explicit aggregate binding, never first-record guessing',async()=>{
 const h=localHarness();h.setScenario('education');await h.attach();await importText(h,'## 教育经历 | 硕士记录\n学校：甲大学\n专业：电子工程\n## 教育经历 | 本科记录\n学校：乙大学\n专业：软件工程');
 const p=await h.api('scan',{tabId:11});assert.equal(p.entries.filter(e=>e.status==='ready').length,0);assert(p.groups.every(g=>!g.entity));
});
test('aggregate binding validates every choice before mutating the plan',async()=>{
 const facts=['A','B'].flatMap((entity,i)=>[{id:'s'+i,label:'学校',value:entity+'大学',section:'教育经历',entity,confirmed:true},{id:'m'+i,label:'专业',value:entity+'专业',section:'教育经历',entity,confirmed:true}]);
 const snapshot={id:'snap',url:'https://jobs.example.invalid/apply',fields:['a','b'].flatMap(g=>[{id:g+'s',label:'学校',section:'教育经历',groupId:g,type:'text',value:''},{id:g+'m',label:'专业',section:'教育经历',groupId:g,type:'text',value:''}])};
 const vault={unlocked:true,read:()=>({facts,revision:1})};const broker={scan:async()=>({url:snapshot.url,frames:[{frameId:0,documentId:'doc',snapshot}],skipped:[]})};
 const run=new WorkspaceRun(vault,broker);const p=await run.scan('owner',{tabId:3,factIds:facts.map(f=>f.id),autoBindEmpty:true});
 assert.throws(()=>run.bindMany('owner',{planId:p.id,bindings:[{groupId:'0:a',entity:'A'},{groupId:'0:b',entity:'A'}],reviewed:true}),/两个/);assert.deepEqual(run.job.frames[0].entityBindings,{});
 const after=run.bindMany('owner',{planId:p.id,bindings:[{groupId:'0:a',entity:'B'},{groupId:'0:b',entity:'A'}],reviewed:true});
 assert.equal(after.entries.find(e=>e.id==='0:am').value,'B专业');assert.equal(after.entries.find(e=>e.id==='0:bm').value,'A专业');assert.notEqual(after.id,p.id);
});
