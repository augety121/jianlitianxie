import {normalize,semanticLabel,scope} from './semantics.mjs';
import {normalizeFact} from './profile.mjs';
import {restricted} from './planner.mjs';
import {secret,sensitive} from './workspace-policy.mjs';
const records=new Set(['education','work','project','certificate','award','family']);
const anchors=new Set(['学校','公司名称','项目名称','证书名称'].map(x=>semanticLabel(x)));
const sameScope=(a,b)=>scope(a)===scope(b)&& (scope(a)!==''||normalize(a)===normalize(b));
const sameValue=(a,b)=>String(a).trim()===String(b).trim();
/** Proposals, not verified facts. Unknown record identities must be supplied by the user. */
export function learningPreview(captured,profile,origin){
  if(!captured||!Array.isArray(captured.fields)||captured.fields.length>100)throw Error('补充内容超出本次范围');
  const eligible=profile.facts.filter(f=>f.confirmed&&!f.conflict&&(!f.origin||f.origin===origin));
  const seen=new Set(),items=[];
  for(const f of captured.fields){
    if(!f||typeof f.id!=='string'||seen.has(f.id)||typeof f.label!=='string'||typeof f.value!=='string'||!f.value.trim()||
       f.value.length>10000||!f.label||f.label==='未标注字段'||secret(f.label)||restricted(f)||f.multiple)continue;
    seen.add(f.id);
    const sk=scope(f.section),record=records.has(sk);let entity='';
    if(record){
      const byAnchor=(f.anchors||[]).map(value=>new Set(eligible.filter(a=>a.entity&&scope(a.section)===sk&&anchors.has(semanticLabel(a.label,a.section))&&normalize(a.value)===normalize(value)).map(a=>a.entity))).filter(set=>set.size);
      if(byAnchor.length){const common=[...byAnchor[0]].filter(e=>byAnchor.every(set=>set.has(e)));if(common.length===1)entity=common[0];}
    }
    const label=semanticLabel(f.label,f.section);
    const old=eligible.filter(a=>sameScope(a.section,f.section)&&normalize(a.entity)===normalize(entity)&&semanticLabel(a.label,a.section)===label);
    const state=record&&!entity?'record-required':old.some(a=>sameValue(a.value,f.value))?'duplicate':old.length?'conflict':'new';
    items.push({id:f.id,label:f.label.slice(0,200),section:(f.section||'').slice(0,200),value:f.value,
      entity,groupId:f.groupId||'',recordRequired:record,sensitive:sensitive(f.label)||sk==='family',state});
  }
  return {items,omitted:Number.isSafeInteger(captured.omitted)?captured.omitted:0};
}
/** Only explicit reviewed selections are added; no overwrite, invented facts, or aliases by value. */
export function mergeLearned(profile,items,selections,origin,reuse=false){
  if(!Array.isArray(selections)||!selections.length||selections.length>100||new Set(selections.map(s=>s.id)).size!==selections.length)throw Error('请选择本次补充的非重复条目');
  const facts=profile.facts.slice(),added=[];
  for(const selected of selections){
    const item=items.find(i=>i.id===selected.id);
    if(!item||['duplicate','conflict'].includes(item.state))throw Error('条目已存在或与旧资料冲突；请到资料页核对，不自动覆盖');
    const entity=typeof selected.entity==='string'?selected.entity.trim():item.entity;
    if(entity.length>200||item.recordRequired&&!entity)throw Error('请填写这条资料所属的教育、工作或项目经历名称');
    if(!item.recordRequired&&entity)throw Error('普通字段不应附加经历');
    const key=semanticLabel(item.label,item.section);
    const old=facts.filter(f=>(!f.origin||f.origin===origin||reuse)&&sameScope(f.section,item.section)&&normalize(f.entity)===normalize(entity)&&semanticLabel(f.label,f.section)===key);
    if(old.length){if(old.every(f=>sameValue(f.value,item.value)))continue;throw Error('存在不同的同字段内容，已保留旧资料；请在资料页修改');}
    const fact=normalizeFact({id:crypto.randomUUID(),label:item.label,section:item.section,entity,value:item.value,
      source:'本人核对网页补充（仅本地保存）',confirmed:true,origin:reuse?'':origin});
    facts.push(fact);added.push(fact.id);
  }
  return {facts,added};
}
