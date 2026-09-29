import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePresets,selectPreset} from '../extension/core/profile-presets.mjs';
import {VaultSession} from '../extension/core/vault-session.mjs';
import {openVault} from '../extension/core/vault.mjs';
import {normalizeProfile} from '../extension/core/profile.mjs';
const facts=[{id:'name',label:'姓名',value:'SYNTHETIC',source:'synthetic',confirmed:true},{id:'email',label:'邮箱',value:'a@example.invalid',source:'synthetic',confirmed:true}];
const presets=[{id:'preset-algorithm',name:'Synthetic engineering kit',factIds:['name']}];
const password='Synthetic independent test passphrase';
const memory=()=>{const data={};return {data,async get(k){return {[k]:structuredClone(data[k])};},async set(v){Object.assign(data,structuredClone(v));}};};
test('profile presets reject malformed references, duplicates, unsupported IDs and extra metadata',()=>{
 assert.deepEqual(normalizePresets(presets,facts),presets);
 for(const p of [{...presets[0],factIds:['unknown']},{...presets[0],factIds:['name','name']},{...presets[0],name:''},{...presets[0],id:'__proto__'}])assert.throws(()=>normalizePresets([p],facts));
 assert.throws(()=>normalizePresets([presets[0],presets[0]],facts));
 assert.throws(()=>normalizePresets(Array(25).fill(presets[0]),facts),/24/);
 assert.deepEqual(normalizePresets([{...presets[0],private:'unused'}],facts),presets);
});
test('additive preset schema keeps old profiles valid and validates new backup metadata',()=>{
 assert.equal(normalizeProfile({facts}).presets,undefined);
 assert.deepEqual(normalizeProfile({facts,presets}).presets,presets);
 assert.throws(()=>normalizeProfile({facts,presets:[{...presets[0],factIds:['missing']}]}));
});
test('choosing a kit excludes drafts, conflicts and passwords without substituting other facts',()=>{
 const input={facts:[facts[0],{...facts[1],confirmed:false},{...facts[1],id:'pass',label:'Password'}],presets:[{...presets[0],factIds:['name','email','pass']}]};
 assert.deepEqual(selectPreset(input,'preset-algorithm'),{ids:['name'],excluded:2});
 input.presets[0].factIds=[];assert.deepEqual(selectPreset(input,'preset-algorithm'),{ids:[],excluded:0});
});
test('names and references persist only in encrypted profile, survive backup and password rotation',async()=>{
 const storage=memory(),session=new VaultSession(storage);await session.create(password);await session.save(facts,0);
 const result=await session.savePresets(presets,1);assert.equal(result.revision,2);assert.deepEqual(result.presets,presets);
 assert(!JSON.stringify(storage.data).includes('Synthetic engineering kit'));
 assert.deepEqual((await openVault(await session.backup(),password)).profile.presets,presets);
 session.lock();assert.deepEqual((await session.unlock(password)).presets,presets);
 await session.changePassword(password+' new');assert.deepEqual((await openVault(await session.backup(),password+' new')).profile.presets,presets);
});
test('fact edits preserve presets, deletion prunes references and never adds unrelated facts',async()=>{
 const storage=memory(),session=new VaultSession(storage);await session.create(password);await session.save(facts,0);await session.savePresets(presets,1);
 const edit=await session.save([{...facts[0],value:'UPDATED'},facts[1]],2);assert.deepEqual(edit.presets,presets);
 const removed=await session.save([facts[1]],3);assert.deepEqual(removed.presets[0].factIds,[]);assert.deepEqual(selectPreset(removed,'preset-algorithm').ids,[]);
});
test('stale revisions, locked state and failed storage cannot silently replace schemes',async()=>{
 const storage=memory(),session=new VaultSession(storage);await session.create(password);await session.save(facts,0);await session.savePresets(presets,1);
 await assert.rejects(session.savePresets([],1),/其他窗口/);assert.deepEqual(session.read().presets,presets);
 storage.set=async()=>{throw Error('synthetic quota failure');};await assert.rejects(session.savePresets([],2));assert.deepEqual(session.read().presets,presets);
 session.lock();await assert.rejects(session.savePresets([],2),/锁定/);
});
test('explicit removal deletes only preset metadata and preserves every fact',async()=>{
 const session=new VaultSession(memory());await session.create(password);const p=await session.save(facts,0);await session.savePresets(presets,1);
 const next=await session.savePresets([],2);assert.deepEqual(next.facts,p.facts);assert.deepEqual(next.presets,[]);
});

test('simultaneous preset mutations share the profile revision guard; only one wins',async()=>{
 const session=new VaultSession(memory());await session.create(password);await session.save(facts,0);
 const results=await Promise.allSettled([session.savePresets(presets,1),session.savePresets([],1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(session.read().presets,presets);
});
test('worker copy and preset routes require trusted sender, current revision and eligible fact',async()=>{
 const {createWorkspace}=await import('../extension/workspace-worker.mjs');
 const chrome={storage:{local:{...memory(),async setAccessLevel(){}},session:{...memory(),async setAccessLevel(){}}},runtime:{id:'trusted',getURL:p=>'chrome-extension://trusted/'+p}};
 const worker=createWorkspace(chrome,{api:()=>assert.fail('local action called bridge'),inject:()=>{},legacyBusy:()=>false});
 const sender={id:'trusted',url:'chrome-extension://trusted/workspace.html',documentId:'workbench',frameId:0};
 const call=m=>worker.request(m,sender);
 await call({type:'workspace-create',password});await call({type:'workspace-save',facts,revision:0});
 assert.deepEqual(await call({type:'workspace-copy',factId:'name',revision:1}),{value:'SYNTHETIC'});
 await assert.rejects(call({type:'workspace-copy',factId:'name',revision:0}),/修改/);
 for(const type of ['workspace-copy','workspace-presets'])await assert.rejects(worker.request({type,factId:'name',presets,revision:1},{...sender,url:'https://example.invalid/'}),/工作台/);
 await call({type:'workspace-lock'});await assert.rejects(call({type:'workspace-copy',factId:'name',revision:1}),/锁定/);
});
