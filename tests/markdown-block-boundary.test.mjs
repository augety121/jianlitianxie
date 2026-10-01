import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalImport} from '../extension/core/local-import.mjs';
// Structural parsing only: every label and value here is invented test text.
test('standalone and inline Markdown key boundaries keep separate values',()=>{
 const source='## 专业技能\n**字段甲：**\n\n测试段落甲\n\n**字段乙**：测试段落乙\n\n**字段丙：** 测试段落丙\n\n**字段丁**\n\n测试段落丁\n---';
 const parsed=readLocalImport(source);
 assert.deepEqual(parsed.facts.map(f=>[f.label,f.value]),[['字段甲','测试段落甲'],['字段乙','测试段落乙'],['字段丙','测试段落丙'],['字段丁','测试段落丁']]);
 assert(parsed.facts.every(f=>f.confirmed===false));
});
test('plain recognized section headings end the previous explicit block',()=>{
 const parsed=readLocalImport('专业技能\n**字段甲**\n\n测试段落甲\n教育经历\n### 示例记录\n**字段乙**\n\n测试段落乙');
 assert.deepEqual(parsed.facts.map(f=>[f.value,f.section]),[['测试段落甲','专业技能'],['测试段落乙','教育经历']]);
 assert.equal(parsed.facts[1].entity,'示例记录');
});
