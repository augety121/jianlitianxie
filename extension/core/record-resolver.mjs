import {entityGroups, factMatchesBinding} from './entity-binding.mjs';
import {semanticLabel, normalize} from './semantics.mjs';
const occupied=f=>f.value!==''&&f.value!=null&&f.value!==false&&(!Array.isArray(f.value)||f.value.length>0);
const anchors=new Set(['学校','公司名称','项目名称','证书名称','获奖名称']);
/** Resolve whole records before individual fields. Existing records reserve their source
 * even when a blank card appears first. Never infer relatives or conflicting records. */
export function resolveRecords(snapshot,facts,existing={}) {
 const bindings={...existing},methods={},groups=entityGroups(snapshot,facts,bindings),used=new Set(Object.values(bindings));
 for(const g of groups){
  if(!g.bindable||g.entity||g.scope==='family')continue;
  const fields=snapshot.fields.filter(f=>g.fieldIds.includes(f.id)),filled=fields.filter(occupied);
  if(!filled.length)continue;
  const keys=filled.filter(f=>anchors.has(semanticLabel(f.label,f.section)));
  const candidates=g.candidates.filter(c=>keys.length&&keys.every(f=>facts.some(a=>factMatchesBinding(a,f,c.entity)&&semanticLabel(a.label,a.section)===semanticLabel(f.label,f.section)&&normalize(a.value)===normalize(f.value))));
  for(const c of candidates.length?candidates:g.candidates)used.add(c.entity);
  if(candidates.length===1){bindings[g.id]=candidates[0].entity;methods[g.id]='anchor';}
 }
 for(const g of groups){
  if(!g.bindable||bindings[g.id]||g.scope==='family')continue;
  if(snapshot.fields.some(f=>g.fieldIds.includes(f.id)&&occupied(f)))continue;
  const next=g.candidates.find(c=>!used.has(c.entity));
  if(next){bindings[g.id]=next.entity;methods[g.id]='source-order';used.add(next.entity);}
 }
 return {bindings,methods};
}
