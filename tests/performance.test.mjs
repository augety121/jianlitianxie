import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatesFor,createCandidateIndex} from '../extension/core/semantics.mjs';
import {makePlan} from '../extension/core/planner.mjs';
import {numericMetrics,performanceSummary} from '../extension/core/performance.mjs';

test('per-plan index preserves reference candidate order, aliases, scope and origin',()=>{
 const labels=['姓名','Full name','邮箱','专业','学校','开始月份','字段'],sections=['基本信息','教育经历','语言能力','项目经历','紧急联系人',''];
 let seed=19;const random=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
 for(let round=0;round<120;round++){
  const facts=Array.from({length:100},(_,i)=>({id:'fact-'+i,label:labels[random(labels.length)],section:sections[random(sections.length)],
   aliases:[labels[random(labels.length)]],value:'synthetic-'+i,confirmed:[true,false,undefined][random(3)],conflict:random(13)===0,
   origin:['','https://allowed.invalid','https://other.invalid'][random(3)]}));
  const metrics={},index=createCandidateIndex(facts,'https://allowed.invalid/form',metrics);
  for(let i=0;i<30;i++){
   const f={label:labels[random(labels.length)],section:sections[random(sections.length)],url:'https://allowed.invalid/form'};
   assert.deepEqual(index.candidates(f),candidatesFor(f,facts));
  }
  for(const f of facts)assert.deepEqual(index.byId(f.id),facts.filter(a=>a.id===f.id&&a.confirmed!==false&&!a.conflict&&(!a.origin||a.origin==='https://allowed.invalid')));
 }
});
test('indexed matcher handles 800 unique facts without 640,000 full candidate comparisons',()=>{
 const facts=Array.from({length:800},(_,i)=>({id:'id-'+i,label:'字段'+i,value:'synthetic-'+i,source:'synthetic',confirmed:true}));
 const fields=facts.map((f,i)=>({id:'f'+i,label:f.label,type:'text',value:''}));
 const p=makePlan({id:'s',url:'https://fixture.invalid',fields},{facts});
 assert(p.entries.every(e=>e.status==='ready'));assert.equal(p.performance.match.candidateChecks,800);
 assert.equal(p.performance.match.indexEntries,800);assert.equal(p.performance.match.factCount,800);
});
test('a new profile revision builds a new index; old values cannot be retained',()=>{
 const snapshot={id:'s',url:'https://fixture.invalid',fields:[{id:'f',label:'姓名',type:'text',value:''}]};
 const facts=[{id:'n',label:'姓名',value:'OLD_SYNTHETIC',confirmed:true}];
 assert.equal(makePlan(snapshot,{facts}).entries[0].value,'OLD_SYNTHETIC');
 facts[0]={...facts[0],value:'NEW_SYNTHETIC'};
 assert.equal(makePlan(snapshot,{facts}).entries[0].value,'NEW_SYNTHETIC');
});
test('performance diagnostics accept only bounded numeric fields',()=>{
 assert.deepEqual(numericMetrics({durationMs:1.23456,waitMs:Infinity,fieldCount:-1,labelReads:'PRIVATE',url:'PRIVATE',value:'PRIVATE',nodesVisited:1e15}),{durationMs:1.23});
 assert.deepEqual(numericMetrics(null),{});
 const data=performanceSummary({performance:{scan:{durationMs:2,url:'PRIVATE'},match:{factCount:2,value:'PRIVATE'}},entries:[]},{performance:{durationMs:5,token:'PRIVATE'},results:[{status:'not-attempted'}]});
 assert(!JSON.stringify(data).includes('PRIVATE'));assert.equal(data.apply.durationMs,5);
 assert.deepEqual(performanceSummary({},{}),{schemaVersion:1,scan:{},match:{},apply:{}});
});
