import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldDiagnostic,cleanDiagnostic,explainDiagnostic,profileDiagnostic} from '../extension/core/match-diagnostics.mjs';
import {exportReceipts} from '../extension/core/local-receipts.mjs';
import {resolveRecords} from '../extension/core/record-resolver.mjs';
test('diagnostics distinguish scope mismatch from missing data without exporting raw labels or values',()=>{
 const d=fieldDiagnostic({label:'专业',section:'教育背景',status:'missing',reasonCode:'no-label-match'},[{label:'专业',section:'项目经历',value:'PRIVATE',confirmed:true}]);
 assert.equal(d.sourceCount,1);assert.equal(d.scopedCount,0);assert.equal(d.confirmedCount,0);
 const report=exportReceipts({records:[{stage:'scan',fields:[{...d,index:1,status:'missing',label:'PRIVATE_LABEL',value:'PRIVATE_VALUE'},{index:2,status:'missing',semantic:'PRIVATE_SEMANTIC',section:'PRIVATE_SECTION'}]}]});
 assert(!JSON.stringify(report).includes('PRIVATE'));assert(report.records[0].diagnosis[0].includes('同字段 1 → 同分区 0'));
 assert.equal(cleanDiagnostic({semantic:'unknown user supplied'}).semantic,'unknown');
 assert(explainDiagnostic({index:1,status:'preserve',code:'existing-unverified'}).includes('不能将保留当作核验通过'));
});

test('new receipts explain profile coverage and versions without raw profile data',()=>{
 const profile=profileDiagnostic([{label:'姓名',section:'基本信息',value:'PRIVATE VALUE',confirmed:true},{label:'PRIVATE LABEL',section:'PRIVATE SECTION',value:'SECRET',confirmed:true}]);
 const f=fieldDiagnostic({label:'2022',section:'',status:'missing',reasonCode:'no-label-match'});
 assert.equal(f.code,'field-unrecognized');
 const exported=exportReceipts({records:[{stage:'scan',version:'0.10.1',engineVersion:'0.10.0',profile,fields:[{...f,index:1,status:'missing'}]}]});
 assert.equal(exported.records[0].profile.total,2);assert.equal(exported.records[0].profile.inventory[0].semantic,'姓名');
 assert.equal(exported.records[0].engineVersion,'0.10.0');assert(!/PRIVATE|SECRET/.test(JSON.stringify(exported)));
 assert(exported.records[0].diagnosis[0].includes('页面识别问题'));
});
test('resolver reserves populated later record and refuses ambiguous shared schools and family',()=>{
 const facts=['甲','乙'].flatMap(entity=>[{id:entity+'s',label:'学校',value:entity+'校',entity,section:'教育经历',confirmed:true},{id:entity+'m',label:'专业',value:entity+'专业',entity,section:'教育经历',confirmed:true}]);
 const fields=['a','b'].flatMap(groupId=>[{id:groupId+'s',label:'学校',value:groupId==='b'?'甲校':'',section:'教育经历',groupId,type:'text'},{id:groupId+'m',label:'专业',value:'',section:'教育经历',groupId,type:'text'}]);
 const s={url:'https://example.invalid',fields};let r=resolveRecords(s,facts);assert.equal(r.bindings.a,'乙');assert.equal(r.bindings.b,'甲');assert.equal(r.methods.b,'anchor');
 facts[2].value='甲校';r=resolveRecords(s,facts);assert.deepEqual(r.bindings,{});
});
