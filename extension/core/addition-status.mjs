import {scope,semanticLabel} from './semantics.mjs';
const domains=['education','work','project'];
const codes=new Set(['needs-add','satisfied','no-source-records','section-not-found','section-ambiguous','add-control-unrecognized','record-container-unrecognized']);
const count=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,100):0;
export function recordTargets(facts,origin){
  const usable={education:new Set(),work:new Set(),project:new Set()};
  const identity={education:new Set(['学校']),work:new Set(['公司名称']),project:new Set(['项目名称','项目描述','项目职责'])};
  for(const f of facts){
    const sk=scope(f.section);
    if(!identity[sk]||!f.entity||!f.confirmed||f.conflict||f.origin&&f.origin!==origin)continue;
    if([f.label,...f.aliases||[]].some(label=>identity[sk].has(semanticLabel(label,f.section))))usable[sk].add(f.entity);
  }
  return Object.fromEntries(domains.map(k=>[k,usable[k].size]));
}
export function cleanAddition(value){
  if(!value||typeof value!=='object')return undefined;
  return {enabled:value.enabled===true,decision:['consent-required','checked','no-source-records','attempted','unavailable'].includes(value.decision)?value.decision:'unavailable',
    added:count(value.added),attempted:count(value.attempted),uncertain:value.uncertain===true,
    inventory:(Array.isArray(value.inventory)?value.inventory:[]).slice(0,3).filter(x=>domains.includes(x?.domain)).map(x=>({domain:x.domain,present:x.present===true,current:count(x.current),target:count(x.target),code:codes.has(x.code)?x.code:'section-not-found'}))};
}
