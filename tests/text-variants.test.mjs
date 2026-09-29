import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan} from '../extension/core/planner.mjs';
import {normalizeProfile,planImport,parseImport} from '../extension/core/profile.mjs';
import {semanticLabel} from '../extension/core/semantics.mjs';
import {pageSummary} from '../extension/core/page-summary.mjs';
const fact={id:'project-a',label:'项目描述',section:'项目经历',entity:'Synthetic project A',value:'L'.repeat(800),textVariants:[{name:'简版',value:'S'.repeat(150)},{name:'中版',value:'M'.repeat(400)}],source:'synthetic',confirmed:true};
const field={id:'f1',label:'项目介绍',section:'项目经历',entity:'Synthetic project A',type:'textarea',value:''};
const plan=(f=field,facts=[fact],mapping={})=>makePlan({id:'s',url:'https://example.invalid/form',fields:[f]},{facts},mapping).entries[0];
test('capacity picks the longest intact approved version without modifying facts',()=>{
 const original=structuredClone(fact);
 for(const [limit,length,name] of [[1000,800,'原文'],[500,400,'中版'],[399,150,'简版'],[150,150,'简版']]){
  const e=plan({...field,maxLength:limit});assert.equal(e.status,'ready');assert.equal(e.value.length,length);assert.equal(e.variantName,name);
 }
 assert.equal(plan().value.length,800);assert.deepEqual(fact,original);
 for(const limit of [0,149])assert.equal(plan({...field,maxLength:limit}).reasonCode,'text-too-long');
});
test('no selection across conflicting records, origins, unconfirmed facts or another project',()=>{
 assert.equal(plan(field,[fact,{...fact,id:'other',value:'X'}]).status,'missing');
 assert.equal(plan({...field,entity:'',section:'项目经历'},[fact,{...fact,id:'b',entity:'Synthetic project B'}]).reasonCode,'record-unbound');
 for(const patch of [{confirmed:false},{conflict:true},{origin:'https://other.invalid'}])assert.equal(plan(field,[{...fact,...patch}]).status,'missing');
 const e=plan({...field,maxLength:200},[fact,{...fact,id:'b',entity:'Synthetic project B',value:'B'}],{f1:'project-a'});assert.equal(e.value,'S'.repeat(150));
 assert.equal(plan({...field,value:'my manual edit',maxLength:200}).status,'preserve');
});
test('different variants are a real import change and preserve review step',()=>{
 const fresh={...fact,textVariants:[{name:'简版',value:'updated'}]};assert.equal(planImport([fact],[fresh])[0].status,'change');
 assert.equal(planImport([fact],[fact])[0].status,'duplicate');
 const imported=parseImport(JSON.stringify({facts:[fact]}));assert.equal(imported[0].confirmed,false);assert.deepEqual(imported[0].textVariants,fact.textVariants);
 assert.equal(plan(field,[fact,{...fresh,id:'new'}]).reasonCode,'ambiguous-source');
});
test('variants cannot be used for identity numbers, dates, numeric values or dropdown selection',()=>{
 for(const label of ['姓名','手机号码','毕业日期','英语四级成绩'])assert.throws(()=>normalizeProfile({facts:[{...fact,label}]}),/叙述字段/);
 assert.throws(()=>normalizeProfile({facts:[{...fact,textVariants:[{name:'a',value:'a'},{name:'a',value:'b'}]}]}));
 assert.equal(plan({...field,type:'select',options:[{label:'S'.repeat(150),value:'wrong'}]}).reasonCode,'option-unavailable');
});
test('manual reasons explain actual failures, not missing profile data',()=>{
 const e=plan({...field,maxLength:100});const summary=pageSummary({entries:[{...e,id:'0:f1',frameId:0}]});assert.equal(summary.problems[0].code,'text-too-long');
 const salary=plan({...field,label:'期望薪资',type:'number'},[{...fact,label:'期望薪资',value:'面议',textVariants:[]}]);assert.equal(salary.reasonCode,'number-required');
});
test('generic English labels are scoped and course/date data are not conflated',()=>{
 assert.equal(semanticLabel('Description (Required)','Projects'),semanticLabel('项目描述'));
 assert.equal(semanticLabel('项目介绍（500字内）'),semanticLabel('项目描述'));
 assert.equal(semanticLabel('Name','Education'),semanticLabel('学校'));
 assert.equal(semanticLabel('Name','Personal information'),semanticLabel('姓名'));
 assert.notEqual(semanticLabel('Name','unknown'),semanticLabel('姓名'));
 assert.notEqual(semanticLabel('GPA'),semanticLabel('平均分'));
});
