import {normalize,scope,semanticLabel} from './semantics.mjs';
// Shared by capture, repair, readiness and addition. Values are never inferred.
export const RECORD_DOMAINS=Object.freeze({
 education:{title:'教育经历',identity:['学校'],qualifiers:['学历','开始月份','结束月份']},
 work:{title:'工作经历',identity:['公司名称'],qualifiers:['职位名称','开始月份','结束月份']},
 project:{title:'项目经历',identity:['项目名称','项目描述','项目职责'],qualifiers:['开始月份','结束月份']},
 language:{title:'语言能力',identity:['语言类型'],qualifiers:[]},
 award:{title:'获奖经历',identity:['获奖名称'],qualifiers:['获奖时间']}
});
export const recordScopes=new Set([...Object.keys(RECORD_DOMAINS),'certificate','family']);
export const recordAnchors=new Set(['学校','公司名称','项目名称','语言类型','获奖名称','证书名称'].map(x=>semanticLabel(x)));
export const inOrigin=(f,origin)=>!origin||!f.origin||f.origin===origin;
export const recordKey=f=>JSON.stringify([scope(f.section),normalize(f.entity),f.origin||'']);
export function recordDirectory(facts,origin=''){
 const groups=new Map();
 for(const f of facts||[]){const domain=scope(f.section);if(!RECORD_DOMAINS[domain]||!f.entity||!inOrigin(f,origin))continue;
  const key=recordKey(f);if(!groups.has(key))groups.set(key,{key,domain,entity:f.entity,origin:f.origin||'',facts:[]});groups.get(key).facts.push(f);
 }
 return [...groups.values()].map(g=>({...g,recordId:g.facts.find(f=>f.recordId)?.recordId||g.facts[0].id,
  usable:g.facts.some(f=>f.confirmed===true&&!f.conflict&&[f.label,...f.aliases||[]].some(l=>RECORD_DOMAINS[g.domain].identity.includes(semanticLabel(l,f.section)))),
  factIds:g.facts.map(f=>f.id)}));
}
export function selectedProfileFacts(profile,origin=''){
 const eligible=(profile.facts||[]).filter(f=>inOrigin(f,origin));
 if(!Array.isArray(profile.selectedRecordIds))return eligible;
 const selected=new Set(profile.selectedRecordIds),allowed=new Set(recordDirectory(eligible,origin).filter(g=>selected.has(g.recordId)).flatMap(g=>g.factIds));
 return eligible.filter(f=>!RECORD_DOMAINS[scope(f.section)]||!f.entity||allowed.has(f.id));
}
