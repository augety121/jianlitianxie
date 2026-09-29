import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalImport} from '../extension/core/local-import.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {fieldDiagnostic,cleanDiagnostic} from '../extension/core/match-diagnostics.mjs';
const table=(header,rows)=>'|'+header.join('|')+'|\n|'+header.map(()=>'---').join('|')+'|\n'+rows.map(row=>'|'+row.join('|')+'|').join('\n');
test('three/four-column vertical tables map header positions, not column count',()=>{
 const p=readLocalImport('## 基本信息\n'+table(['备注','填写内容','字段'],[['核对','hello@example.invalid','邮箱'],['','示例人','姓名']]));
 assert.deepEqual(p.facts.map(f=>[f.label,f.value]),[['邮箱','hello@example.invalid'],['姓名','示例人']]);assert(p.facts.every(f=>f.confirmed===false));
});
test('explicit section and entity columns bind each fact without narrative inference',()=>{
 const p=readLocalImport(table(['字段','内容','分区','经历'],[['学校','示例学校','教育经历','记录甲'],['专业','电子工程','教育经历','记录甲']]));
 assert(p.facts.every(f=>f.section==='教育经历'&&f.entity==='记录甲'));
});
test('horizontal education rows stay separate even when school names are the same',()=>{
 const p=readLocalImport('## 教育背景\n'+table(['学校名称','专业','学历','毕业时间'],[['示例学院','电子工程','本科','2024-06'],['示例学院','软件工程','硕士','2028-06']]));
 assert.equal(p.facts.length,8);assert.equal(new Set(p.facts.map(f=>f.entity)).size,2);
 assert.equal(p.facts[0].entity,p.facts[3].entity);assert.notEqual(p.facts[3].entity,p.facts[4].entity);
 const facts=p.facts.map(f=>({...f,confirmed:true}));const s={url:'https://fixture.invalid',id:'s',fields:[{id:'m',label:'专业',section:'教育经历',type:'text',value:''}]};
 assert.equal(makePlan(s,{facts}).entries[0].status,'missing','same school must not choose a degree by name alone');
});
test('unknown table headers and inconsistent cell counts remain visible instead of being guessed',()=>{
 const p=readLocalImport('姓名：示例\n'+table(['奇怪列','第二列'],[['未归类','原文保留']])+'\n'+table(['字段','内容','备注'],[['专业','电子工程',''],['姓名','缺了一列']]));
 assert.equal(p.facts.length,2);assert(p.skipped.some(r=>r.text.includes('未归类')));assert(p.skipped.some(r=>r.text.includes('缺了一列')));assert(p.warnings.length);
});
test('new top-level headings cannot leak a previous project entity into subsequent facts',()=>{
 const p=readLocalImport('## 项目经历\n### 项目甲\n项目名称：示例项目\n## 其他资料\n邮箱：hello@example.invalid');
 assert.equal(p.facts[0].entity,'项目甲');assert.equal(p.facts[1].entity,'');assert.equal(p.facts[1].section,'');
});
test('no outer pipes, escaped pipes and bold headers preserve explicit values',()=>{
 const p=readLocalImport('## 基本信息\n**字段** | **内容** | 备注\n---|---|---\n自我评价|甲\\|乙|原文');
 assert.equal(p.facts[0].value,'甲|乙');assert.equal(p.facts[0].label,'自我评价');
});
test('imports reject password facts from new table formats',()=>{
 assert.throws(()=>readLocalImport(table(['字段','内容','备注'],[['密码','not-for-storage','']])),/口令类/);
});
test('diagnostics distinguish unknown canonical vocabulary from missing DOM labels',()=>{
 assert.equal(fieldDiagnostic({label:'真实自定义字段',reasonCode:'no-label-match',recognition:{labelSource:'label'}}).code,'no-label-match');
 assert.equal(fieldDiagnostic({label:'hash_unique_123',reasonCode:'no-label-match',recognition:{labelSource:'attribute'}}).code,'field-unrecognized');
 const clean=cleanDiagnostic({semantic:'PERSONAL SENTINEL',recognition:{labelSource:'PERSONAL SENTINEL',controlFamily:'marked-select',selectedDisplay:true}});
 assert(!JSON.stringify(clean).includes('PERSONAL'));assert.equal(clean.recognition.labelSource,'unknown');
});
