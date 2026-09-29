import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readLocalImport} from '../extension/core/local-import.mjs';
import {LOCAL_PROFILE_KEY} from '../extension/local-worker.mjs';
import {LocalReceipts,exportReceipts} from '../extension/core/local-receipts.mjs';
import {createVault} from '../extension/core/vault.mjs';
import {localHarness,importText,memory} from './helpers/local-harness.mjs';
const text='## 基本信息\n姓名：FICTIONAL_USER\n邮箱：candidate@example.invalid\n性别：测试选项';
test('MD and simplified facts JSON templates contain exactly the same records and values',async()=>{
 const a=readLocalImport(await fs.readFile('extension/examples/local-profile.md','utf8')),b=readLocalImport(await fs.readFile('extension/examples/local-profile.json','utf8'));
 const project=f=>[f.section,f.entity,f.label,f.value];assert.deepEqual(a.facts.map(project),b.facts.map(project));assert.equal(a.skipped.length,0);assert(a.facts.every(f=>f.confirmed===false));
});
test('Markdown headings, bold field names and unknown paragraphs have explicit boundaries',()=>{
 const parsed=readLocalImport('## 基本信息\n- **姓名**：A\n- **邮箱：** a@example.invalid\n\n## 教育经历 | 学位A\n学校：A学校\n这是未归类说明\n```\n邮箱：hidden@example.invalid\n```');
 assert.equal(parsed.facts.length,3);assert.equal(parsed.facts[1].label,'邮箱');assert.equal(parsed.facts[2].entity,'学位A');assert.equal(parsed.skipped.length,4);assert(!parsed.facts.some(f=>f.value.includes('hidden@')));
});
test('JSON accepts missing IDs/source as drafts, but never file-supplied verification',()=>{
 const p=readLocalImport(JSON.stringify({facts:[{id:'from-file',label:'姓名',value:'Test',confirmed:true}]}));assert.notEqual(p.facts[0].id,'from-file');assert.equal(p.facts[0].confirmed,false);
 assert.equal(readLocalImport('{"姓名":"测试","邮箱":"a@example.invalid"}').facts.length,2);
 assert.throws(()=>readLocalImport('{"facts":[{"label":"密码","value":"NEVER_STORE"}]}'),/移除/);
 assert.throws(()=>readLocalImport('验证码：NEVER_STORE'),/口令类/);
 assert.throws(()=>readLocalImport('x'.repeat(2*1024*1024+1)),/2MB/);
});
test('first use has no password, but plaintext persistence needs informed confirmation',async()=>{
 const h=localHarness();assert.equal((await h.api('state')).accepted,false);const p=await h.api('preview',{text});
 await assert.rejects(h.api('commit',{previewId:p.id,ids:[p.items[0].fact.id],reviewed:true}),/未加密/);
 assert.equal(h.local.data[LOCAL_PROFILE_KEY],undefined);
 await h.api('commit',{previewId:p.id,ids:[p.items[0].fact.id],reviewed:true,acceptPlaintext:true});
 assert.equal(h.local.data[LOCAL_PROFILE_KEY].profile.facts[0].value,'FICTIONAL_USER');
 assert(h.local.access.every(x=>x==='TRUSTED_CONTEXTS'));
});
test('closing/restarting the worker restores local facts without password and scans all confirmed facts',async()=>{
 const h=localHarness();await h.attach();await importText(h,text);h.restart();const s=await h.api('state',{tabId:11});assert.equal(s.profile.facts.length,3);assert.equal(s.accepted,true);
 const p=await h.api('scan',{tabId:11});assert.equal(p.entries.filter(e=>e.status==='ready').length,3);
 const r=await h.api('fill',{planId:p.id,ids:['0:name','0:email'],reviewed:true});assert.equal(r.results.length,2);assert.equal(h.values.gender,undefined);
 assert(!JSON.stringify(h.calls).includes('password'));await assert.rejects(h.api('fill',{planId:p.id,ids:['0:name'],reviewed:true}),/失效/);
});
test('ordinary webpage cannot read, edit, scan or export local logs',async()=>{
 const h=localHarness();const sender={...h.sender,url:'https://jobs.example.invalid/apply',tab:{id:11}};
 for(const action of ['state','preview','commit','scan','logs','log-settings','encrypted-preview'])await assert.rejects(h.api(action,{text},sender),/只有本地/);
 assert.deepEqual(h.local.data,{});
});
test('imports skip duplicates, withhold entire contradictory key and require explicit update selection',async()=>{
 const h=localHarness();await importText(h,text);const old=(await h.api('state')).profile;
 const same=await h.api('preview',{text});assert(same.items.every(i=>i.status==='duplicate'));
 const conflict=await h.api('preview',{text:'邮箱：first@example.invalid\n电子邮箱：other@example.invalid'});assert(conflict.items.every(i=>i.status==='conflict'));assert.equal((await h.api('state')).profile.revision,old.revision);
 const change=await h.api('preview',{text:'邮箱：changed@example.invalid'});assert.equal(change.items[0].status,'change');
 const updated=await h.api('commit',{previewId:change.id,ids:[change.items[0].fact.id],reviewed:true});assert.equal(updated.facts.find(f=>f.label==='邮箱').value,'changed@example.invalid');
});
test('profile revision changes invalidate old forms and edits cannot silently overwrite another window',async()=>{
 const h=localHarness();await h.attach();const {profile}=await importText(h,text);const p=await h.api('scan',{tabId:11}),fact=profile.facts[0];
 await h.api('edit',{fact:{...fact,value:'FICTIONAL_NEW'},revision:profile.revision,reviewed:true});
 await assert.rejects(h.api('fill',{planId:p.id,ids:['0:name'],reviewed:true}),/失效/);
 await assert.rejects(h.api('edit',{fact,revision:profile.revision,reviewed:true}),/改变/);assert.equal(h.values.name,undefined);
});
test('active MCP mode and old workbench activity cannot race a local fill',async()=>{
 const h=localHarness();await h.attach();await importText(h,text);h.setMode('mcp');await assert.rejects(h.api('scan',{tabId:11}),/MCP/);
 await h.api('switch');h.setExternal(true);await assert.rejects(h.api('scan',{tabId:11}),/正在/);h.setExternal(false);assert((await h.api('scan',{tabId:11})).entries.length);
});
test('encrypted migration is read-only until confirmed, and the old encrypted bytes are preserved',async()=>{
 const h=localHarness(),p={facts:readLocalImport(text).facts};const {envelope}=await createVault('synthetic migration password',p);h.local.data.resumeVaultV1=envelope;const old=JSON.stringify(envelope);
 await assert.rejects(h.api('encrypted-preview',{password:'wrong synthetic password'}),/错误/);assert.equal(h.local.data[LOCAL_PROFILE_KEY],undefined);
 const preview=await h.api('encrypted-preview',{password:'synthetic migration password'});assert.equal(h.local.data[LOCAL_PROFILE_KEY],undefined);
 await h.api('commit',{previewId:preview.id,ids:preview.items.map(i=>i.fact.id),reviewed:true,acceptPlaintext:true});h.restart();assert.equal((await h.api('state')).profile.facts.length,3);assert.equal(JSON.stringify(h.local.data.resumeVaultV1),old);
});
test('logs record actual scan/fill by default without personal content, URLs or raw errors',async()=>{
 const h=localHarness();await h.attach();await importText(h,text);const p=await h.api('scan',{tabId:11});await h.api('fill',{planId:p.id,ids:['0:name'],reviewed:true});
 const log=await h.api('logs'),serialized=JSON.stringify(log);assert(log.enabled);assert(log.records.some(r=>r.stage==='fill'&&r.fields[0].index===1&&r.fields[0].status==='verified'));
 for(const value of ['FICTIONAL_USER','candidate@example.invalid','https://','target-document','local-document'])assert(!serialized.includes(value),value);
 assert(log.records.find(r=>r.stage==='scan').fields.some(f=>f.semantic==='姓名'));
 await h.api('log-settings',{enabled:false,clear:true});await h.api('scan',{tabId:11});assert.equal((await h.api('logs')).records.length,0);
});
test('receipt sanitize, retention, capacity and queued clear are bounded',async()=>{
 let now=100000000;const store=memory(),logs=new LocalReceipts(store,()=>now);
 for(let i=0;i<90;i++){logs.add({stage:'scan',ok:true,reason:'PRIVATE_ERROR',ms:3,total:5,value:'PRIVATE_VALUE',fields:[{index:1,status:'ready',label:'PRIVATE_LABEL'},{index:2,status:'unexpected'}]});await logs.read();}
 let r=await logs.read();assert.equal(r.records.length,80);assert.equal(r.records[0].fields.length,1);assert(!JSON.stringify(r).includes('PRIVATE_'));assert(!('at' in exportReceipts(r).records[0]));
 now+=86400001;assert.equal((await logs.read()).records.length,0);
 logs.add({stage:'scan',ok:true});await logs.settings(true,true);assert.equal((await logs.read()).records.length,0);
});
test('logs unavailable never change an actual fill success or trigger another write',async()=>{
 const h=localHarness();await h.attach();await importText(h,text);const p=await h.api('scan',{tabId:11});
 const get=h.local.get.bind(h.local);h.local.get=async k=>k==='resumeLocalReceiptsEnabled'?new Promise(()=>{}):get(k);
 const out=await h.api('fill',{planId:p.id,ids:['0:name'],reviewed:true});assert.equal(out.results[0].status,'verified');assert.equal(h.calls.filter(c=>c.action==='apply').length,1);
});
test('delete only removes plaintext facts, and increments revision to reject stale operations',async()=>{
 const h=localHarness();h.local.data.resumeVaultV1={opaque:'existing-encrypted-data'};const {profile}=await importText(h,text);const result=await h.api('erase',{revision:profile.revision,confirm:true});assert.equal(result.facts.length,0);assert.equal(result.revision,profile.revision+1);assert.deepEqual(h.local.data.resumeVaultV1,{opaque:'existing-encrypted-data'});
});

test('returning to local after an expired temporary grant does not need an offline bridge',async()=>{
 const {createWorkspace}=await import('../extension/workspace-worker.mjs');
 const h=localHarness();h.local.data.resumeMode='mcp';h.session.data.resumeMcpGrant={tabId:11,expiresAt:Date.now()-1,id:'expired-fixture'};
 let calls=0;const workspace=createWorkspace(h.chrome,{api:async()=>{calls++;throw Error('offline');},inject:async()=>{},legacyBusy:()=>false});
 await workspace.useLocal();assert.equal(calls,0);assert.equal(h.local.data.resumeMode,'local');assert.equal(h.session.data.resumeMcpGrant,null);
});
test('an unexpired temporary grant is not silently called revoked when its bridge is offline',async()=>{
 const {createWorkspace}=await import('../extension/workspace-worker.mjs');
 const h=localHarness();h.local.data.resumeMode='mcp';h.session.data.resumeMcpGrant={tabId:11,expiresAt:Date.now()+60000,id:'active-fixture'};
 let calls=0;const workspace=createWorkspace(h.chrome,{api:async()=>{calls++;throw Error('offline');},inject:async()=>{},legacyBusy:()=>false});
 await assert.rejects(workspace.useLocal(),/offline/);assert.equal(calls,1);assert.equal(h.local.data.resumeMode,'mcp');assert(h.session.data.resumeMcpGrant);
});
