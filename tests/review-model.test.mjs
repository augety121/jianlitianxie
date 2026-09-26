import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPage, mappingCandidates, REVIEW_PAGE_SIZE} from '../extension/core/review-model.mjs';
const entries=Array.from({length:1000},(_,i)=>({id:String(i),label:'字段'+i,section:i%2?'教育经历':'基本信息',status:i%3?'ready':'missing',required:true,value:'PRIVATE_VALUE'}));
test('a thousand fields renders a bounded page without losing off-page selection',()=>{
 const p=reviewPage(entries,{page:1,selected:entries.map(e=>e.id)});
 assert.equal(p.rows.length,REVIEW_PAGE_SIZE);assert.equal(p.rows[0].id,'30');assert.equal(p.total,1000);assert.equal(p.selectedOutside,970);
 assert.equal(reviewPage(entries,{page:999}).page,33);
});
test('required filter means unresolved required items, not all required ready fields',()=>{
 const p=reviewPage(entries,{status:'required'});assert(p.rows.every(e=>e.status==='missing'));assert.equal(p.total,334);
 assert.equal(reviewPage(entries,{status:'selected',selected:['5']}).rows[0].id,'5');
});
test('filters combine and never search hidden personal values',()=>{
 assert.equal(reviewPage(entries,{query:'PRIVATE_VALUE'}).total,0);
 assert(reviewPage(entries,{query:'字段',section:'教育经历',status:'ready'}).rows.every(e=>e.section==='教育经历'&&e.status==='ready'));
 assert.equal(reviewPage([]).pages,1);
});
test('chooser prioritises exact aliases and enforces source, scope and bound entity',()=>{
 const fact={id:'a',label:'学校',value:'DO_NOT_SEARCH_VALUE',confirmed:true,section:'教育经历',entity:'学校甲'};
 const list=[{...fact,id:'b',label:'专业'},fact,{...fact,id:'c',confirmed:false},{...fact,id:'d',origin:'https://other.invalid'}, {...fact,id:'e',section:'家庭信息'}, {...fact,id:'f',entity:'学校乙'}];
 const field={label:'毕业院校',section:'教育经历',origin:'https://jobs.invalid'};
 assert.deepEqual(mappingCandidates(field,list,'','学校甲').map(x=>x.fact.id),['a','b']);
 assert.equal(mappingCandidates(field,list,'DO_NOT_SEARCH_VALUE').length,0);
});
