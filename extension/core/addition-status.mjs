import {RECORD_DOMAINS,recordDirectory} from './record-model.mjs';
const domains=Object.keys(RECORD_DOMAINS);
const codes=new Set(['needs-add','satisfied','no-source-records','section-not-found','section-ambiguous','add-control-unrecognized','record-container-unrecognized']);
const count=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,100):0;
export function recordTargets(facts,origin){
  const usable=Object.fromEntries(domains.map(k=>[k,new Set()]));
  for(const g of recordDirectory(facts,origin))if(g.usable)usable[g.domain].add(g.entity);
  return Object.fromEntries(domains.map(k=>[k,usable[k].size]));
}
export function cleanAddition(value){
  if(!value||typeof value!=='object')return undefined;
  return {enabled:value.enabled===true,decision:['consent-required','checked','no-source-records','attempted','unavailable'].includes(value.decision)?value.decision:'unavailable',
    added:count(value.added),attempted:count(value.attempted),uncertain:value.uncertain===true,
    inventory:(Array.isArray(value.inventory)?value.inventory:[]).slice(0,5).filter(x=>domains.includes(x?.domain)).map(x=>({domain:x.domain,present:x.present===true,current:count(x.current),target:count(x.target),...(Number.isSafeInteger(x.availableRecords)?{availableRecords:count(x.availableRecords),selectedRecords:count(x.selectedRecords),existingCards:count(x.existingCards)}:{}),code:codes.has(x.code)?x.code:'section-not-found'}))};
}
