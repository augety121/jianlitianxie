import {normalizeFact} from './profile.mjs';
import {semanticLabel,scope,normalize} from './semantics.mjs';
import {RECORD_DOMAINS,recordAnchors} from './record-model.mjs';
/** Review-only recovery. Originals are retained; origin/entity boundaries cannot merge. */
const narrative=/^(项目背景|方案设计|训练与优化|低标注研究|模型设计|训练验证|研究到服务|大模型应用|问题与方法|方法与实现|技术实现|设计与实现|结果与指标|结果与验证|结果与能力|研究能力|能力积累|配套代码)$/;
const responsibility=/^(个人职责|负责内容)$/;
const fragmentLabel=value=>String(value||'').trim().replace(/^\*\*(.*?)\*\*$/, '$1').replace(/[：:]$/, '').trim();
export function proposeStoredRepair(profile){
 const buckets=new Map(),facts=[],conflicts=[];
 for(const f of profile.facts||[]){
  if(f.confirmed!==true||f.conflict||!f.entity||scope(f.section)!=='project')continue;
  const key=JSON.stringify([normalize(f.entity),f.origin||'']);
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(f);
 }
 let repairedRecords=0;
 for(const rows of buckets.values()){
  let repaired=false;
  for(const [label,pattern] of [['项目描述',narrative],['项目职责',responsibility]]){
   const fragments=rows.filter(f=>pattern.test(fragmentLabel(f.label)));if(!fragments.length)continue;
   if(fragments.some(a=>fragments.some(b=>fragmentLabel(a.label)===fragmentLabel(b.label)&&a.value!==b.value))){conflicts.push({domain:'project',reason:'fragment-conflict'});continue;}
   const value=[...new Set(fragments.map(f=>fragmentLabel(f.label)+'：'+f.value))].join('\n');if(value.length>10000)continue;
   const existing=rows.filter(f=>semanticLabel(f.label,f.section)===semanticLabel(label,'项目经历'));
   if(existing.some(f=>f.value===value))continue;
   // A difference is a review proposal (planImport defaults changes to unselected).
   const first=fragments[0];
   facts.push(normalizeFact({id:crypto.randomUUID(),label,value,section:'项目经历',entity:first.entity,
    recordId:rows.find(f=>f.recordId)?.recordId||first.id,sourceRefs:fragments.slice(0,20).map(f=>f.id),
    origin:first.origin||'',confirmed:false,sourceKind:'stored-repair',source:'已存资料逐段整理，原句保留，待本人核对'}));repaired=true;
  }
  if(repaired)repairedRecords++;
 }
 const orphanGroups=new Map();
 for(const f of profile.facts||[]){const domain=scope(f.section);if(!RECORD_DOMAINS[domain]||f.entity||!f.confirmed||f.conflict)continue;
  const key=domain+'|'+(f.origin||'');if(!orphanGroups.has(key))orphanGroups.set(key,[]);orphanGroups.get(key).push(f);
 }
 for(const rows of orphanGroups.values()){
  const domain=scope(rows[0].section),identities=rows.filter(f=>recordAnchors.has(semanticLabel(f.label,f.section)));
  if(identities.length!==1||rows.some(a=>rows.some(b=>semanticLabel(a.label,a.section)===semanticLabel(b.label,b.section)&&a.value!==b.value))){conflicts.push({domain,reason:'record-ambiguous'});continue;}
  const anchor=identities[0],entity=anchor.value.trim().slice(0,200),recordId=anchor.id;
  // Do not attach an orphan batch to an existing record just because its name matches.
  if((profile.facts||[]).some(f=>f.entity&&scope(f.section)===domain&&normalize(f.entity)===normalize(entity)&&(f.origin||'')===(anchor.origin||'')))continue;
  for(const f of rows)facts.push(normalizeFact({...f,id:crypto.randomUUID(),entity,recordId,sourceRefs:[f.id],confirmed:false,sourceKind:'stored-repair',source:'已存同域资料归组，待本人核对'}));
 }
 return {facts,skipped:conflicts.map(c=>({line:c.domain,text:c.reason==='fragment-conflict'?'同名片段存在不同内容，原条目均保留，请整组核对':'缺少唯一记录身份，未自动归组'})),warnings:['仅整理有明确来源的存量资料；原条目保留，差异默认不选，不推断日期或记录。'],repairedRecords,conflicts};
}
export function storedProfileHealth(profile){
 const byScope=new Map();let fragments=0;
 for(const f of profile.facts||[]){
  if(!f.confirmed||f.conflict)continue;
  const sk=scope(f.section)||'unknown';if(!byScope.has(sk))byScope.set(sk,new Set());
  if(f.entity)byScope.get(sk).add(f.entity);
  if(sk==='project'&&narrative.test(f.label.trim()))fragments++;
 }
 return {facts:profile.facts?.length||0,education:byScope.get('education')?.size||0,
  projects:byScope.get('project')?.size||0,work:byScope.get('work')?.size||0,projectFragments:fragments};
}
