import test from 'node:test';import assert from 'node:assert/strict';import {makePlan} from '../bridge/planner.mjs';
const plan=(field,fact,map={f:'a'})=>makePlan({id:'s',url:'https://jobs.test/apply',fields:[{id:'f',value:'',...field}]},{facts:[{id:'a',confirmed:true,...fact}]},map).entries[0];
test('multi-select requires explicit complete list and exact current options',()=>{
 const f={label:'意向岗位',type:'custom-select',multiple:true,options:[{label:'后端',value:'backend'},{label:'AI',value:'ai'}]};
 assert.equal(plan(f,{label:'意向岗位',value:'["后端","AI"]'},{}).status,'manual');
 assert.deepEqual(plan(f,{label:'意向岗位',value:'["后端","AI"]'}).value,['backend','ai']);
 for(const value of ['后端','["未知"]','["后端","后端"]','[]'])assert.equal(plan(f,{label:'意向岗位',value}).status,'missing');
 assert.equal(plan({...f,value:['backend']},{label:'意向岗位',value:'["AI"]'}).status,'preserve');
});
test('repeated records require explicit bounded total, never remove rows',()=>{
 const f={label:'获奖经历条数',type:'repeat-group',currentRows:1,section:'获奖经历'};
 assert.equal(plan(f,{label:f.label,value:'3'},{}).status,'manual');
 assert.equal(plan(f,{label:f.label,value:'3'}).value,3);
 assert.equal(plan({...f,currentRows:3},{label:f.label,value:'2'}).status,'preserve');
 for(const value of ['-1','21','1.5','NaN'])assert.equal(plan(f,{label:f.label,value}).status,'missing');
});
