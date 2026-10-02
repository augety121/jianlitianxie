import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseResumeText,resumeLines} from '../extension/core/resume-parser.mjs';
import {proposeStoredRepair,storedProfileHealth} from '../extension/core/stored-profile-repair.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {resolveRecords} from '../extension/core/record-resolver.mjs';
import {candidatesFor,createCandidateIndex} from '../extension/core/semantics.mjs';
import {fieldDiagnostic,cleanDiagnostic} from '../extension/core/match-diagnostics.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
const source=fs.readFileSync(new URL('./helpers/recovery-source.txt',import.meta.url),'utf8');
const fact=(label,value,section='项目经历',entity='测试记录',extra={})=>({id:crypto.randomUUID(),label,value,section,entity,confirmed:true,source:'虚构测试',...extra});
const snap=fields=>({id:'s',url:'https://example.invalid/apply',fields});
const field=(label,extra={})=>({id:crypto.randomUUID(),label,type:'text',value:'',...extra});
test('source-shaped resume recovers two education records, five numbered projects and one employer',()=>{
 const p=parseResumeText(source);const h=storedProfileHealth({facts:p.facts.map(f=>({...f,confirmed:true}))});
 assert.equal(h.education,2);assert.equal(h.projects,5);assert.equal(h.work,1);
 assert(p.facts.every(f=>f.confirmed===false));
 assert.deepEqual(p.facts.filter(f=>f.label==='专业').map(f=>f.value),['电子工程','软件工程']);
 assert.equal(p.facts.filter(f=>f.label==='项目描述').length,5);
 for(const f of p.facts.filter(f=>f.label==='项目描述'))assert(!/1 \/ 2|能力补充|Fictional publication/.test(f.value));
});
test('publication-only year never becomes project date, and present does not get invented end date',()=>{
 const facts=parseResumeText(source).facts,names=facts.filter(f=>f.label==='项目名称');
 assert(names[0].value.endsWith('项目甲）'));assert(!facts.some(f=>f.entity===names[0].entity&&/开始|结束/.test(f.label)));
 assert(facts.some(f=>f.entity===names[3].entity&&f.label==='是否至今'&&f.value==='是'));
 assert(!facts.some(f=>f.entity===names[3].entity&&f.label==='结束时间'));
});
test('split school date join requires adjacent explicit range and does not eat narrative',()=>{
 assert.equal(resumeLines('示例大学  电子工程（硕士）\n2024.09—2028.06').length,1);
 assert.equal(resumeLines('示例大学\n负责开发项目\n2024.09—2028.06').length,3);
 assert(!parseResumeText(source).facts.some(f=>/听说|读写|健康|家庭|薪资/.test(f.label)));
});
test('award year-only fills exact year; month and full date remain unknown',()=>{
 const facts=[fact('获奖时间','2021','获奖经历','奖励甲')];
 const s=snap(['year','month'].map(datePart=>field('获奖时间（'+datePart+'）',{groupId:'award',section:'获奖经历',dateLabel:'获奖时间',datePart,type:'select',options:[]})));
 const p=makePlan(s,{facts},{},{award:'奖励甲'});
 assert.equal(p.entries[0].status,'ready');assert.equal(p.entries[0].value,'2021');assert.equal(p.entries[1].reasonCode,'date-precision');
});
test('language type anchors record but never supplies proficiency, listening or writing',()=>{
 const facts=[fact('语种','英语','语言能力','外语甲')];
 const s=snap([field('语言类型',{section:'语言能力',groupId:'lang',value:'英语'}),field('听说',{section:'语言能力',groupId:'lang'}),field('读写',{section:'语言能力',groupId:'lang'})]);
 const b=resolveRecords(s,facts);assert.equal(b.bindings.lang,'外语甲');
 assert(makePlan(s,{facts},{},b.bindings).entries.slice(1).every(e=>e.status==='missing'));
});
test('family and emergency contexts reject unscoped and personal name/phone facts',()=>{
 for(const section of ['家庭情况','紧急联系人'])for(const sourceSection of ['','基本信息']){
  const f=field('姓名',{section}),facts=[fact('姓名','测试本人',sourceSection,'')];
  assert.equal(candidatesFor(f,facts).length,0);assert.equal(createCandidateIndex(facts,snap([]).url).candidates(f).length,0);
 }
});
test('repair concatenates only explicit source fragments, never invents identity, dates or abilities',()=>{
 const originals=[fact('项目背景','第一段。'),fact('方案设计','第二段。'),fact('其他字段','不混入正文')];const before=JSON.stringify(originals);
 const p=proposeStoredRepair({facts:originals});assert.equal(p.facts.length,2);assert.equal(p.facts[0].label,'项目描述');
 assert.equal(p.facts[0].value,'项目背景：第一段。\n方案设计：第二段。');assert.equal(p.facts[0].confirmed,false);assert.equal(JSON.stringify(originals),before);
});
test('repair is idempotent after confirmation, rejects contradictory fragments and separates origins',()=>{
 const originals=[fact('项目背景','第一段。'),fact('方案设计','第二段。')];
 const recovered=proposeStoredRepair({facts:originals}).facts.map(f=>({...f,confirmed:true}));
 assert.equal(proposeStoredRepair({facts:[...originals,...recovered]}).facts.length,0);
 assert.equal(proposeStoredRepair({facts:[...originals,fact('项目背景','相反内容')]}).facts.length,0);
 const scoped=proposeStoredRepair({facts:[fact('项目背景','甲','项目经历','A',{origin:'https://a.invalid'}),fact('方案设计','乙','项目经历','A',{origin:'https://b.invalid'})]}).facts;
 assert.equal(scoped.length,4);assert(scoped.every(f=>f.origin));assert(scoped.every(f=>!(f.value.includes('甲')&&f.value.includes('乙'))));
});
test('trusted repair preview does not write; review commit retains original facts and stale preview is rejected',async()=>{
 const h=localHarness();await h.attach();await importText(h,'## 科研与项目经历\n### 测试甲\n项目背景：保留第一段\n方案设计：保留第二段');
 const initial=JSON.stringify(h.local.data.resumePlainLocalV1),p=await h.api('repair-preview');
 assert.equal(JSON.stringify(h.local.data.resumePlainLocalV1),initial);assert.equal(p.items.length,2);
 await assert.rejects(h.api('commit',{previewId:p.id,ids:[p.items[0].fact.id],reviewed:false}),/核对/);
 const saved=await h.api('commit',{previewId:p.id,ids:p.items.map(i=>i.fact.id),reviewed:true});assert.equal(saved.facts.length,4);assert.equal(saved.revision,2);
 assert.equal((await h.api('repair-preview')).items.length,0);
 await assert.rejects(h.api('commit',{previewId:p.id,ids:[p.items[0].fact.id],reviewed:true}),/失效/);
});
test('web page cannot request stored repair preview or read fact inventory',async()=>{
 const h=localHarness();await h.attach();
 await assert.rejects(h.api('repair-preview',{}, {...h.sender,url:'https://example.invalid',documentId:'page'}),/只有/);
});
test('not-attempted diagnostic differs from no matching data and exports no raw field values',()=>{
 const d=fieldDiagnostic({status:'not-attempted',label:'PRIVATE_MARKER',section:'家庭情况',value:'PRIVATE_VALUE'},[]);
 assert.equal(d.code,'not-attempted');assert(!JSON.stringify(cleanDiagnostic(d)).includes('PRIVATE'));
 const s=fieldDiagnostic({status:'missing',reasonCode:'no-label-match',label:'姓名',section:'家庭情况'},[fact('姓名','本人','基本信息','')]);
 assert.equal(s.code,'scope-mismatch');
});

test('same label in family section does not block the personal-name plan',()=>{
 const facts=[fact('姓名','测试本人','基本信息','')];
 const s=snap([field('姓名',{section:'基本信息'}),field('姓名',{section:'家庭情况'})]);
 const p=makePlan(s,{facts});assert.equal(p.entries[0].status,'ready');assert.equal(p.entries[0].value,'测试本人');
 assert.equal(p.entries[1].status,'missing');
});

test('engine write counter is normalized without exporting arbitrary metadata',async()=>{
 const {numericMetrics}=await import('../extension/core/performance.mjs');
 assert.deepEqual(numericMetrics({writeAttempts:40,label:'PRIVATE'}),{writesAttempted:40});
 assert.deepEqual(numericMetrics({writeAttempts:'PRIVATE'}),{});
});
