import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startBridge} from './helpers/bridge-harness.mjs';
const fact={id:'new-name',label:'姓名',value:'EPHEMERAL_ONLY',source:'synthetic',confirmed:true};
const second={id:'new-email',label:'邮箱',value:'ephemeral@example.invalid',source:'synthetic',confirmed:true};
const grant=()=>({grantId:crypto.randomUUID(),consent:true,facts:[fact,second],snapshot:{id:crypto.randomUUID(),owner:'11',url:'https://jobs.example.invalid/apply?private=URL_PRIVATE',fields:[{id:'f',label:'姓名',type:'text',value:'',anchors:['ANCHOR_PRIVATE']},{id:'e',label:'邮箱',type:'email',value:''},{id:'old',label:'备注',type:'text',value:'WEBSITE_PRIVATE',control:{private:'CONTROL_PRIVATE'}}]}});
test('temporary MCP grant is scoped, revocable and never falls back to old disk facts',async t=>{
 const h=await startBridge();t.after(()=>h.close());
 await fs.writeFile(path.join(h.dir,'profile.json'),JSON.stringify({facts:[{...fact,id:'legacy',value:'LEGACY_ONLY'}]}));
 await fs.writeFile(path.join(h.dir,'evidence.json'),JSON.stringify({pages:[{document:'legacy',text:'LEGACY_EVIDENCE'}]}));
 const g=grant();
 assert.equal((await h.request('/session',{...g,consent:false})).status,400);
 const receipt=await h.json('/session',g);assert.equal(receipt.storage,'memory-only');assert(receipt.expiresAt>Date.now()&&receipt.expiresAt<=Date.now()+300000);
 const context=JSON.stringify(await h.tool('form_context'));
 assert(context.includes('EPHEMERAL_ONLY'));
 for(const str of ['LEGACY_ONLY','WEBSITE_PRIVATE','ANCHOR_PRIVATE','CONTROL_PRIVATE','URL_PRIVATE'])assert(!context.includes(str),str+' leaked');
 assert.deepEqual((await h.tool('source_search',{query:'LEGACY'})).pages,[]);
 assert.equal((await h.request('/profile',{facts:[fact]})).status,400);
 await assert.rejects(h.tool('profile_upsert',{facts:[fact]}),/临时资料/);
 assert.equal((await h.request('/plan?owner=22')).status,400);
 assert.equal((await h.request('/snapshot',{snapshot:{...g.snapshot,owner:'22'}})).status,400);
 await h.json('/snapshot',{snapshot:{...g.snapshot,id:crypto.randomUUID()},prepare:true});
 assert.equal((await h.json('/status')).sessionExpiresAt,receipt.expiresAt,'rescan cannot renew grant');
 const plan=await h.json('/plan?owner=11');const begun=await h.json('/begin?owner=11',{planId:plan.id,fieldIds:['f'],url:g.snapshot.url});
 assert.equal(begun.plan.entries.length,1);assert(!JSON.stringify(begun).includes(second.value));assert.equal(begun.plan.expiresAt,receipt.expiresAt);
 assert.equal((await h.json('/session/end?owner=11',{grantId:g.grantId})).state,'stopping');
 await assert.rejects(h.tool('profile_search',{query:'姓名'}),/撤销|到期/);
 assert.equal((await h.request('/plan?owner=11')).status,400);
 await h.json('/result?owner=11',{planId:plan.id,results:[{fieldId:'f',status:'verified'}]});
 assert.equal((await h.json('/result?owner=11')).state,'cancelled');
 assert.equal((await h.request('/session',g)).status,400,'cancelled grant nonce replay');
 const canceled=grant();await h.json('/session/end?owner=11',{grantId:canceled.grantId});assert.equal((await h.request('/session',canceled)).status,400,'cancel-before-arrival');
 const disk=(await Promise.all((await fs.readdir(h.dir)).map(n=>fs.readFile(path.join(h.dir,n),'utf8')))).join('');
 assert(!disk.includes('EPHEMERAL_ONLY'));assert(!disk.includes('ephemeral@example.invalid'));
 assert(!(await fs.readdir(h.dir)).includes('audit.jsonl'));assert(!(await fs.readdir(h.dir)).includes('experience.json'));
 await h.json('/legacy-mode',{});await h.json('/snapshot',{snapshot:h.snapshot('11'),prepare:true});
 assert((JSON.stringify(await h.tool('form_context'))).includes('LEGACY_ONLY'),'explicit legacy switch restores old disk mode');
});
test('temporary grant rejects malformed structures, unconfirmed data and public plaintext targets',async t=>{
 const h=await startBridge();t.after(()=>h.close());const g=grant();
 for(const data of [{...g,facts:[{...fact,confirmed:false}]},{...g,facts:[{...fact,label:'password'}]},{...g,snapshot:{...g.snapshot,url:'http://jobs.example.invalid/'}},{...g,mappings:{unknown:'new-name'}},{...g,snapshot:{...g.snapshot,fields:[g.snapshot.fields[0],g.snapshot.fields[0]]}}]){
  assert.equal((await h.request('/session',{...data,grantId:crypto.randomUUID()})).status,400);
 }
});
