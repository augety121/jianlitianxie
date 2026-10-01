import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalImport} from '../extension/core/local-import.mjs';
import {recordTargets,cleanAddition} from '../extension/core/addition-status.mjs';
import {LocalReceipts,exportReceipts} from '../extension/core/local-receipts.mjs';
import {memory} from './helpers/local-harness.mjs';
const md='# 虚构资料\n\n更新日期：2026-10-01\n\n## 基本信息\n\n**姓名**\n\n测试人\n\n**默认邮箱**\n\nsample@example.invalid\n\n## 教育经历\n### 测试大学\n**学校**\n\n测试大学\n\n**专业**\n\n电子工程\n\n## 项目经历\n### 记录甲\n**项目名称**\n\n演示项目\n\n**项目描述**\n\n项目背景：段落不能被拆成另一个字段。\n方案设计：保留原文。\n\n第二段也保留。\n\n**项目职责**\n\n负责校验。';
test('standalone bold labels keep identity, full paragraphs and record sections',()=>{
 const p=readLocalImport(md);assert.equal(p.facts.length,7);
 assert.equal(p.facts[0].label,'姓名');assert.equal(p.facts[0].value,'测试人');
 assert.equal(p.facts[3].section,'教育经历');assert.equal(p.facts[3].entity,'测试大学');
 assert.equal(p.facts[5].label,'项目描述');assert(p.facts[5].value.includes('\n\n第二段也保留。'));
 assert(!p.facts.some(f=>f.label==='项目背景'||f.label==='更新日期'));
 assert(p.facts.every(f=>f.confirmed===false));
 assert.deepEqual(recordTargets(p.facts.map(f=>({...f,confirmed:true})),'https://example.invalid'),{education:1,work:0,project:1});
});
test('hundreds of bold-labelled facts retain every explicit pair without colon fragmentation',()=>{
 const expected=Array.from({length:376},(_,i)=>['测试字段'+i,'正文'+i+'\n备注：仍然属于正文。']);
 const source='## 基本信息\n'+expected.map(([k,v])=>'**'+k+'**\n\n'+v).join('\n\n');
 assert.deepEqual(readLocalImport(source).facts.map(f=>[f.label,f.value]),expected);
});
test('empty bold fields never consume the next record and password blocks are rejected',()=>{
 const p=readLocalImport('## 基本信息\n**空字段**\n\n**姓名**\n\n测试人\n## 家庭成员\n### 父亲\n**姓名**\n\n虚构家属');
 assert.equal(p.facts.length,2);assert.equal(p.facts[1].section,'家庭成员');assert.equal(p.skipped.length,1);
 assert.throws(()=>readLocalImport('**密码**\n\nNOT-A-REAL-SECRET'),/口令/);
});
test('addition metadata distinguishes missing source, missing consent and unsupported controls without values',async()=>{
 const s=memory(),log=new LocalReceipts(s);
 log.add({stage:'add',ok:false,reason:'review-required',total:0,ms:2,addition:{enabled:false,decision:'consent-required',url:'https://PRIVATE.invalid',value:'PRIVATE',inventory:[{domain:'education',present:true,current:0,target:2,code:'needs-add',name:'PRIVATE'},{domain:'work',present:true,current:0,target:0,code:'no-source-records'}]}});
 const result=exportReceipts(await log.read());const a=result.records[0].addition;
 assert.equal(a.decision,'consent-required');assert.equal(a.inventory[0].target,2);
 assert(!JSON.stringify(result).includes('PRIVATE'));
 assert.deepEqual(cleanAddition({inventory:[{domain:'family',target:5}]}).inventory,[]);
});
test('unclassified project fragments cannot generate unfillable empty cards',()=>{
 const facts=[{id:'a',label:'项目背景',value:'some text',section:'项目经历',entity:'甲',confirmed:true},{id:'b',label:'学校',value:'A',section:'教育经历',entity:'E',confirmed:false}];
 assert.deepEqual(recordTargets(facts,'https://example.invalid'),{education:0,work:0,project:0});
});
test('explicit add consent is independent from automatic host access and survives reload',async()=>{
 const {SiteAccess}=await import('../extension/core/site-access.mjs');const store=memory();
 let registered=0;const api={storage:{local:store},permissions:{contains:async()=>false},scripting:{registerContentScripts:async()=>registered++,getRegisteredContentScripts:async()=>[],unregisterContentScripts:async()=>{}}};
 const sites=new SiteAccess(api),origin='https://jobs.example.invalid';
 assert.equal((await sites.get(origin)).add,false);
 await sites.grantAdd(origin);assert.equal(registered,0);assert.equal(await sites.allowed(origin),false);
 assert.equal((await new SiteAccess(api).get(origin)).add,true);
 await sites.set(origin,false,false);assert.equal((await sites.get(origin)).add,false);
 assert.throws(()=>sites.grantAdd('https://*.example.invalid'),/准确/);
});
test('explicit aliases can identify a usable record but not a conflicting record',()=>{
 const f={label:'毕业高校',aliases:['学校'],value:'测试大学',entity:'本科',section:'教育经历',confirmed:true};
 assert.equal(recordTargets([f],'https://jobs.example.invalid').education,1);
 assert.equal(recordTargets([{...f,conflict:true}],'https://jobs.example.invalid').education,0);
});
