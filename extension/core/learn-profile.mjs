import {normalize,semanticLabel,scope} from './semantics.mjs';
import {normalizeFact} from './profile.mjs';
import {restricted} from './planner.mjs';
import {secret,sensitive} from './workspace-policy.mjs';
import {recordScopes as records,recordAnchors as anchors,RECORD_DOMAINS} from './record-model.mjs';
const sameScope=(a,b)=>scope(a)===scope(b)&& (scope(a)!==''||normalize(a)===normalize(b));
const sameValue=(a,b)=>String(a).trim()===String(b).trim();
/** Proposals, not verified facts. Unknown record identities must be supplied by the user. */
export function learningPreview(captured,profile,origin){
  if(!captured||!Array.isArray(captured.fields)||captured.fields.length>100)throw Error('补充内容超出本次范围');
  const eligible=profile.facts.filter(f=>f.confirmed&&!f.conflict&&(!f.origin||f.origin===origin));
  const seen=new Set(),items=[],groups=new Map();
  for(const f of captured.fields){
    if(!f?.groupId||!RECORD_DOMAINS[scope(f.section)])continue;
    const key=scope(f.section)+'|'+f.groupId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);
  }
  const proposed=new Map();
  for(const [key,rows] of groups){
    const domain=scope(rows[0].section),identity=rows.filter(f=>anchors.has(semanticLabel(f.label,f.section))&&f.value?.trim());
    if(identity.length!==1||rows.some(f=>scope(f.section)!==domain))continue;
    const anchor=identity[0],same=eligible.filter(f=>scope(f.section)===domain&&f.entity&&semanticLabel(f.label,f.section)===semanticLabel(anchor.label,anchor.section)&&sameValue(f.value,anchor.value));
    const entities=[...new Set(same.map(f=>f.entity))];
    if(entities.length>1)continue;
    const qualifier=rows.filter(f=>RECORD_DOMAINS[domain].qualifiers.includes(semanticLabel(f.label,f.section))).map(f=>f.value.trim());
    // A new observed card is a review draft, never a fact until the user saves it.
    const qualifierConflict=entities.length===1&&rows.some(row=>RECORD_DOMAINS[domain].qualifiers.includes(semanticLabel(row.label,row.section))&&eligible.some(f=>f.entity===entities[0]&&scope(f.section)===domain&&semanticLabel(f.label,f.section)===semanticLabel(row.label,row.section)&&!sameValue(f.value,row.value)));
    const entity=(!qualifierConflict&&entities[0])||[anchor.value.trim(),...qualifier].join(' | ').slice(0,170);
    const duplicate=[...proposed.values()].some(g=>g.entity===entity&&g.domain===domain);
    const recordId=(!duplicate&&!qualifierConflict&&same.find(f=>f.recordId)?.recordId)||crypto.randomUUID();
    proposed.set(key,{domain,entity:duplicate?entity+' · '+recordId.slice(0,8):entity,recordId});
  }
  for(const f of captured.fields){
    if(!f||typeof f.id!=='string'||seen.has(f.id)||typeof f.label!=='string'||typeof f.value!=='string'||!f.value.trim()||
       f.value.length>10000||!f.label||f.label==='未标注字段'||secret(f.label)||restricted(f)||f.multiple)continue;
    seen.add(f.id);
    const sk=scope(f.section),record=records.has(sk);let entity='';
    if(record){
      const byAnchor=(f.anchors||[]).map(value=>new Set(eligible.filter(a=>a.entity&&scope(a.section)===sk&&anchors.has(semanticLabel(a.label,a.section))&&normalize(a.value)===normalize(value)).map(a=>a.entity))).filter(set=>set.size);
      if(byAnchor.length){const common=[...byAnchor[0]].filter(e=>byAnchor.every(set=>set.has(e)));if(common.length===1)entity=common[0];}
    }
    const group=proposed.get(sk+'|'+f.groupId);
    if(record&&group&&sk!=='family')entity=group.entity;
    const label=semanticLabel(f.label,f.section);
    const old=eligible.filter(a=>sameScope(a.section,f.section)&&normalize(a.entity)===normalize(entity)&&semanticLabel(a.label,a.section)===label);
    const state=record&&!entity?'record-required':old.some(a=>sameValue(a.value,f.value))?'duplicate':old.length?'conflict':'new';
    items.push({id:f.id,label:f.label.slice(0,200),section:(f.section||'').slice(0,200),value:f.value,
      entity,groupId:f.groupId||'',recordId:group?.recordId||'',recordRequired:record,sensitive:sensitive(f.label)||sk==='family',state});
  }
  return {items,omitted:Number.isSafeInteger(captured.omitted)?captured.omitted:0};
}
/** Only explicit reviewed selections are added; no overwrite, invented facts, or aliases by value. */
export function mergeLearned(profile,items,selections,origin,reuse=false){
  if(!Array.isArray(selections)||!selections.length||selections.length>100||new Set(selections.map(s=>s.id)).size!==selections.length)throw Error('请选择本次补充的非重复条目');
  const facts=profile.facts.slice(),added=[],groupEntities=new Map();
  for(const selected of selections){
    const item=items.find(i=>i.id===selected.id);
    if(!item||['duplicate','conflict'].includes(item.state))throw Error('条目已存在或与旧资料冲突；请到资料页核对，不自动覆盖');
    const entity=typeof selected.entity==='string'?selected.entity.trim():item.entity;
    if(entity.length>200||item.recordRequired&&!entity)throw Error('请填写这组资料所属的经历名称');
    if(!item.recordRequired&&entity)throw Error('普通字段不应附加经历');
    if(item.recordRequired&&item.groupId){const key=scope(item.section)+'|'+item.groupId;if(groupEntities.has(key)&&groupEntities.get(key)!==entity)throw Error('同一张经历卡片的字段必须属于同一记录');groupEntities.set(key,entity);}
    const key=semanticLabel(item.label,item.section);
    const old=facts.filter(f=>(!f.origin||f.origin===origin||reuse)&&sameScope(f.section,item.section)&&normalize(f.entity)===normalize(entity)&&semanticLabel(f.label,f.section)===key);
    if(old.length){if(old.every(f=>sameValue(f.value,item.value)))continue;throw Error('存在不同的同字段内容，已保留旧资料；请在资料页修改');}
    const fact=normalizeFact({id:crypto.randomUUID(),label:item.label,section:item.section,entity,value:item.value,
      ...(item.recordId?{recordId:item.recordId}:{}),
      source:'本人核对网页补充（仅本地保存）',sourceKind:'page-observed',confirmed:true,origin:reuse?'':origin});
    facts.push(fact);added.push(fact.id);
  }
  return {facts,added};
}
