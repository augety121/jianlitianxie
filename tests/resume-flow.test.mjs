import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResumeText} from '../extension/core/resume-parser.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {WorkspaceRun} from '../extension/core/workspace-run.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
const resume=`测试甲
邮箱：sample@example.invalid
教育背景
虚构大学  软件工程（硕士）  2024.09 - 2027.07
主修课程：算法、数据库
项目经历
演示项目甲
2026.05—至今｜独立开发
项目背景：针对重复录入开发工具。
方法与成果：完成输入验证和结果回读，使用20组虚构数据验证。
演示项目乙
2025.06—2026.03｜主要开发者
方法与成果：另一项独立研究，不能与项目甲合并。
实习经历
虚构科技有限公司  软件开发实习生  2024.03—2024.08
负责开发接口及文档。
自我描述
能独立排查问题。
重视交付质量。`;
test('resume draft separates two-line project headings, dates, education and internship',()=>{
 const p=parseResumeText(resume);
 const projects=p.facts.filter(f=>f.label==='项目名称');assert.deepEqual(projects.map(f=>f.value),['演示项目甲','演示项目乙']);
 assert.equal(p.facts.find(f=>f.label==='专业').value,'软件工程');
 assert.equal(p.facts.find(f=>f.label==='公司名称').value,'虚构科技有限公司');
 const a=p.facts.find(f=>f.label==='项目描述'&&f.entity===projects[0].entity);assert(a.value.includes('20组'));assert(!a.value.includes('另一项'));
 assert(p.facts.every(f=>!f.confirmed));assert(!p.facts.some(f=>/四级|绩点|薪资/.test(f.label)));
 assert.equal(p.facts.filter(f=>f.label==='自我评价').length,1);
});
test('papers following an internship never become extra employers; project responsibility stays verbatim',()=>{
 const p=parseResumeText(resume.replace('方法与成果：完成输入验证','问题与方法：完成输入验证').replace('自我描述','论文与知识产权\nFictional paper 2025.10\nPublished as a research article\n自我描述'));
 assert.equal(p.facts.filter(f=>f.label==='公司名称').length,1);
 assert(!p.facts.find(f=>f.label==='岗位职责').value.includes('Fictional'));
 assert(p.facts.some(f=>f.label==='项目职责'&&f.value.includes('20组')));
 assert(p.skipped.some(x=>x.text.includes('Fictional')));
});
test('editing parsed fields is persisted before matching, never silently discarded',async()=>{
 const h=localHarness();await h.attach();const p=await h.api('preview',{text:JSON.stringify({facts:parseResumeText(resume).facts})});
 const name=p.items.find(x=>x.fact.label==='姓名');
 const saved=await h.api('commit',{previewId:p.id,ids:[name.fact.id],edits:p.items.map(x=>({...x.fact,...(x===name?{value:'核对后的虚构名字'}:{})})),reviewed:true,acceptPlaintext:true});
 assert.equal(saved.facts.find(f=>f.label==='姓名').value,'核对后的虚构名字');
 const plan=await h.api('scan',{tabId:11});assert.equal(plan.entries.find(e=>e.fieldId==='name').value,'核对后的虚构名字');
});
test('existing mismatch is not auto-filled; explicit correction preserves old-value precondition',async()=>{
 const h=localHarness();await h.attach();await importText(h,'姓名：SYNTHETIC_CORRECT');h.values.name='SYNTHETIC_OLD';
 const p=await h.api('scan',{tabId:11}),entry=p.entries.find(e=>e.fieldId==='name');assert.equal(entry.status,'review');
 await assert.rejects(h.api('fill',{planId:p.id,ids:[entry.id],reviewed:true}));
 const approved=await h.api('correct',{planId:p.id,id:entry.id,reviewed:true});const next=approved.entries.find(e=>e.id===entry.id);
 assert.equal(next.allowOverwrite,true);assert.equal(next.oldValue,'SYNTHETIC_OLD');
 await h.api('fill',{planId:approved.id,ids:[entry.id],reviewed:true});assert.equal(h.values.name,'SYNTHETIC_CORRECT');
});
test('matching existing contents stays preserved; missing facts do not become corrections',()=>{
 const fields=[{id:'1',label:'邮箱',type:'email',value:'same@example.invalid'},{id:'2',label:'未知',type:'text',value:'keep'}];
 const p=makePlan({id:'s',url:'https://example.invalid',fields},{facts:[{id:'e',label:'邮箱',value:'same@example.invalid',confirmed:true}]},{},{},{reviewExisting:true});
 assert(p.entries.every(e=>e.status==='preserve'));assert(!p.entries.some(e=>e.allowOverwrite));
});
test('explicit ordered binding previews two education records without mixing their values',async()=>{
 const h=localHarness();await h.attach();h.setScenario('education');
 await importText(h,'## 教育经历 | 学位甲\n学校：甲校\n专业：甲专业\n## 教育经历 | 学位乙\n学校：乙校\n专业：乙专业');
 const p=await h.api('scan',{tabId:11});assert.equal(p.entries.filter(e=>e.status==='ready').length,4,'normal local scan resolves empty cards without hidden manual setup');const next=await h.api('order',{planId:p.id,reviewed:true});
 assert.equal(next.entries.find(e=>e.fieldId==='aschool').value,'甲校');assert.equal(next.entries.find(e=>e.fieldId==='bmajor').value,'乙专业');
 assert.equal(Object.keys(h.values).length,0);
});
test('ordered blank binding reserves an existing later record instead of duplicating it',async()=>{
 const facts=['甲','乙'].flatMap((entity,i)=>[{id:'school'+i,label:'学校',value:entity+'校',entity,section:'教育背景',confirmed:true},{id:'major'+i,label:'专业',value:entity+'专业',entity,section:'教育背景',confirmed:true}]);
 const fields=['a','b'].flatMap(group=>[{id:group+'school',label:'学校',section:'教育背景',groupId:group,type:'text',value:group==='b'?'甲校':''},{id:group+'major',label:'专业',section:'教育背景',groupId:group,type:'text',value:''}]);
 const url='https://example.invalid/apply',profile={revision:1,facts};const run=new WorkspaceRun({unlocked:true,read:()=>profile},{scan:async()=>({url,frames:[{frameId:0,documentId:'d',snapshot:{id:'s',url,fields}}],skipped:[]})});
 const p=await run.scan('o',{tabId:1,factIds:facts.map(f=>f.id)}),next=run.bindInOrder('o',{planId:p.id,reviewed:true});
 assert.equal(next.entries.find(e=>e.fieldId==='aschool').value,'乙校');
 assert.equal(next.entries.find(e=>e.fieldId==='bschool').status,'preserve');
});
