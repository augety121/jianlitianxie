import {normalizeFact} from './profile.mjs';
import {semanticLabel,scope,normalize} from './semantics.mjs';
/** Review-only recovery. Originals are retained; origin/entity boundaries cannot merge. */
const narrative=/^(项目背景|方案设计|训练与优化|低标注研究|模型设计|训练验证|研究到服务|大模型应用|问题与方法|方法与实现|技术实现|设计与实现|结果与指标|结果与验证|结果与能力|研究能力|能力积累|配套代码)$/;
const responsibility=/^(个人职责|负责内容)$/;
export function proposeStoredRepair(profile){
 const buckets=new Map(),facts=[];
 for(const f of profile.facts||[]){
  if(f.confirmed!==true||f.conflict||!f.entity||scope(f.section)!=='project')continue;
  const key=JSON.stringify([normalize(f.entity),f.origin||'']);
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(f);
 }
 let repairedRecords=0;
 for(const rows of buckets.values()){
  let repaired=false;
  for(const [label,pattern] of [['项目描述',narrative],['项目职责',responsibility]]){
   if(rows.some(f=>semanticLabel(f.label,f.section)===semanticLabel(label,'项目经历')))continue;
   const fragments=rows.filter(f=>pattern.test(f.label.trim()));if(!fragments.length)continue;
   if(fragments.some(a=>fragments.some(b=>a.label===b.label&&a.value!==b.value)))continue;
   const value=[...new Set(fragments.map(f=>f.label+'：'+f.value))].join('\n');if(value.length>10000)continue;
   const first=fragments[0];
   facts.push(normalizeFact({id:crypto.randomUUID(),label,value,section:'项目经历',entity:first.entity,
    origin:first.origin||'',confirmed:false,source:'已存资料逐段整理，原句保留，待本人核对'}));repaired=true;
  }
  if(repaired)repairedRecords++;
 }
 return {facts,skipped:[],warnings:['只整理已存的明确项目片段，不删除原条目，不推断姓名、日期、亲属、健康或语言水平。'],repairedRecords};
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
