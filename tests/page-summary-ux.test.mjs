import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSummary} from '../extension/core/page-summary.mjs';

test('sensitive or protected ready entries are not advertised as another automatic batch',()=>{
 const entries=[{id:'0:n',frameId:0,label:'姓名',kind:'text',status:'ready'},{id:'0:g',frameId:0,label:'性别',kind:'text',status:'ready'}];
 const p=pageSummary({id:'p',entries});assert.equal(p.quick.length,1);assert.equal(p.more,0);assert.equal(p.problems[0].code,'sensitive-review');
});
