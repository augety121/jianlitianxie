import test from 'node:test';import assert from 'node:assert/strict';import {makePlan} from '../bridge/planner.mjs';
import {dateValue,semanticLabel} from '../bridge/semantics.mjs';
const run=(fields,facts,mappings={})=>makePlan({id:'s',url:'https://example.test/apply',fields:fields.map((f,i)=>({id:'f'+i,type:'text',value:'',...f}))},{facts},mappings).entries;
const fact=(id,label,value,extra={})=>({id,label,value,confirmed:true,...extra});
test('seven document-derived field schemas resolve synonyms without personal data',()=>{
 const cases=[['诺瓦星云','电子邮箱','默认邮箱'],['麒麟软件','现居住地','当前所在地区'],['万兴科技','毕业届次','毕业届别'],['虹软','导师姓名','导师'],['查看申请','项目介绍','项目描述'],['国家能源','生源所在地','生源地'],['恒生','实习内容','岗位职责']];
 for(const [platform,label,stored] of cases)assert.equal(run([{label}],[fact('a',stored,'测试值')])[0].value,'测试值',platform);
});
test('personal and emergency contact never collide',()=>{
 const facts=[fact('p','手机号码','personal',{section:'基本信息'}),fact('e','紧急联系人电话','emergency',{section:'紧急联系人'})];
 const rows=run([{label:'联系电话',section:'个人信息'},{label:'联系电话',section:'紧急联系人'},{label:'联系电话',section:'家庭成员'}],facts);
 assert.equal(rows[0].value,'personal');assert.equal(rows[1].value,'emergency');assert.equal(rows[2].status,'missing');
});
test('education anchors survive reordered rows; empty records stay unresolved',()=>{
 const facts=[fact('a','专业','专业甲',{section:'教育经历',entity:'甲大学'}),fact('b','专业','专业乙',{section:'教育经历',entity:'乙大学'})];
 const rows=run([{label:'所学专业',section:'教育经历',anchors:['乙大学']},{label:'专业',section:'教育经历',anchors:['甲大学']},{label:'专业',section:'教育经历'}],facts);
 assert.equal(rows[0].value,'专业乙');assert.equal(rows[1].value,'专业甲');assert.equal(rows[2].status,'missing');
});
test('date normalization validates leap days and does not invent day precision',()=>{
 assert.equal(dateValue('2024/2/29','day'),'2024-02-29');assert.equal(dateValue('2023/2/29','day'),null);assert.equal(dateValue('2024.9','month'),'2024-09');assert.equal(dateValue('2024.9','day'),null);
 const rows=run([{label:'入党时间',type:'date-picker',datePrecision:'month'},{label:'入党日期',type:'date'}],[fact('a','入党月份','2022.11')],{f0:'a',f1:'a'});
 assert.equal(rows[0].value,'2022-11');assert.equal(rows[1].status,'missing');
});
test('date and month evidence for same entity use required precision',()=>{
 const facts=[fact('a','开始月份','2024-09',{entity:'甲大学'}),fact('b','入学日期','2024-09-01',{entity:'甲大学'})];
 assert.equal(run([{label:'开始时间',type:'month',section:'甲大学'}],facts)[0].value,'2024-09');
 assert.equal(run([{label:'入学日期',type:'date',section:'甲大学'}],facts)[0].value,'2024-09-01');
});
test('non-equivalent degree, institution and citizenship values are never guessed',()=>{
 for(const [label,value,option] of [['学校','甲学院','甲大学'],['学位','学士','硕士'],['外语水平','未通过','四级']])assert.equal(run([{label,options:[{label:option,value:'x'}]}],[fact('a',label,value)])[0].status,'missing');
});
test('scoped option synonyms and numeric units',()=>{
 assert.equal(run([{label:'学习形式',options:[{label:'全国普通高等院校全日制',value:'full'}]}],[fact('a','学习形式','全日制')])[0].value,'full');
 assert.equal(run([{label:'身高(cm)',type:'number'}],[fact('a','身高厘米','180cm')])[0].value,'180');
 assert.equal(semanticLabel(' ＊政治面貌：'),'政治面貌');
});
test('attachments, multi-select, cross-company answers and conflicting history stay manual',()=>{
 assert.equal(run([{label:'成绩单',type:'file'}],[fact('a','成绩单','local.pdf')])[0].status,'manual');
 assert.equal(run([{label:'意向城市',type:'select',multiple:true}],[fact('a','意向城市','甲市')])[0].status,'manual');
 assert.equal(run([{label:'是否有亲属'}],[fact('a','是否有亲属','否',{origin:'https://other.test'})])[0].status,'missing');
 assert.equal(run([{label:'体重'}],[fact('a','体重','70'),fact('b','体重','75')])[0].status,'missing');
});
