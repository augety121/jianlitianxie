import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImport,planImport,mergeImport,fromJsonResume} from '../extension/core/profile.mjs';
const fact=(id,label,value,entity='学校甲',extra={})=>({id,label,value,entity,section:'教育经历',source:'synthetic test',confirmed:true,...extra});

test('semantic duplicate import keeps original ID and verification',()=>{
 const old=[fact('a','毕业学校','学校甲')], fresh=parseImport(JSON.stringify({facts:[fact('b','学校','学校甲')]}));
 assert.equal(planImport(old,fresh)[0].status,'duplicate');
 const result=mergeImport(old,fresh);assert.deepEqual(result.facts.map(f=>f.id),['a']);assert.equal(result.facts[0].confirmed,true);assert.equal(result.addedIds.length,0);
});
test('changed value requires explicit current-preview selection and becomes draft',()=>{
 const old=[fact('a','专业','专业甲')], fresh=[fact('b','专业','专业乙')];
 assert.equal(planImport(old,fresh)[0].status,'change');assert.equal(mergeImport(old,fresh).facts[0].value,'专业甲');
 const chosen=mergeImport(old,fresh,['b']);assert.equal(chosen.facts[0].value,'专业乙');assert.equal(chosen.facts[0].confirmed,false);
 assert.throws(()=>mergeImport(old,fresh,['not-in-preview']),/预览/);
});
test('schools and website scopes never overwrite one another',()=>{
 const old=[fact('a','开始月份','2020-09')];
 const fresh=[fact('b','开始时间','2024-09','学校乙'),fact('c','开始月份','2021-09','学校甲',{origin:'https://careers.example.invalid'})];
 assert.equal(mergeImport(old,fresh).facts.length,3);
});
test('contradictory file withholds entire conflicting key and preserves old value',()=>{
 const old=[fact('a','专业','原专业')];const fresh=[fact('b','专业','新专业1'),fact('c','专业','新专业2'),fact('d','学校','学校甲')];
 const result=mergeImport(old,fresh,['b']);assert.deepEqual(result.facts.map(f=>f.value),['原专业','学校甲']);assert.deepEqual(result.addedIds,['d']);
 assert.equal(mergeImport([],fresh).facts.length,1);
});
test('JSON Resume imports structured records with exact dates and never credentials',()=>{
 const source={basics:{name:'合成姓名',email:'fake@example.invalid',password:'DO_NOT_IMPORT'},education:[{institution:'学校甲',area:'计算机',startDate:'2024-09',endDate:'2027-06'}],projects:[{name:'演示项目',description:'有限边界',highlights:['结果甲','结果乙']}],token:'DO_NOT_IMPORT'};
 const result=parseImport(JSON.stringify(source));assert.equal(result.find(f=>f.label==='入学时间').value,'2024-09');assert.equal(result.find(f=>f.label==='项目成果').value,'结果甲\n结果乙');assert(result.every(f=>!f.confirmed));assert(!JSON.stringify(result).includes('DO_NOT_IMPORT'));
});
test('JSON Resume rejects ambiguous unnamed records, nested values and prototype injection',()=>{
 assert.throws(()=>fromJsonResume({education:[{area:'计算机'}]}),/经历名称/);
 assert.throws(()=>fromJsonResume({basics:{phone:{value:'123'}}}),/类型/);
 assert.throws(()=>fromJsonResume(JSON.parse('{"basics":{},"__proto__":{"x":1}}')),/格式/);
 assert.throws(()=>fromJsonResume({projects:[{name:'演示',highlights:[{text:'不接受'}]}]}),/列表须为文本/);
});
test('same-school degrees and same-employer tenures remain distinct records',()=>{
 const p=parseImport(JSON.stringify({education:[{institution:'同校',studyType:'本科',startDate:'2020-09',endDate:'2024-06'},{institution:'同校',studyType:'硕士',startDate:'2024-09',endDate:'2027-06'}],work:[{name:'同公司',position:'实习生',startDate:'2023-07'},{name:'同公司',position:'工程师',startDate:'2024-07'}],projects:[{name:'同名项目',startDate:'2022-01'},{name:'同名项目',startDate:'2025-01'}]}));
 assert.equal(new Set(p.map(f=>f.entity)).size,6);assert(planImport([],p).every(x=>x.status==='new'));
 const again=parseImport(JSON.stringify({facts:p}));assert(planImport(p,again).every(x=>x.status==='duplicate'));
});
