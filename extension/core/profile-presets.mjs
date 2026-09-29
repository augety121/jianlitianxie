import {secret} from './workspace-policy.mjs';
export const MAX_PRESETS = 24;
/** A preset references facts; it is NOT a second identity or a snapshot of their values. */
export function normalizePresets(input, facts) {
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>MAX_PRESETS)throw Error('资料方案最多24个');
  const known=new Set(facts.map(f=>f.id)),ids=new Set(),names=new Set();
  return input.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('资料方案格式无效');
    if(typeof p.id!=='string'||!/^preset-[\w-]{1,100}$/.test(p.id)||ids.has(p.id))throw Error('方案ID无效或重复');
    const name=typeof p.name==='string'?p.name.trim():'';
    if(!name||name.length>60||/[\x00-\x1f\x7f]/.test(name)||names.has(name.toLocaleLowerCase()))throw Error('方案名称为空、重复或超过60字');
    if(!Array.isArray(p.factIds)||p.factIds.length>1000||new Set(p.factIds).size!==p.factIds.length||p.factIds.some(id=>!known.has(id)))throw Error('方案引用了重复或不存在的资料');
    ids.add(p.id);names.add(name.toLocaleLowerCase());
    return {id:p.id,name,factIds:[...p.factIds]};
  });
}
export function selectPreset(profile, id) {
  const preset=normalizePresets(profile.presets,profile.facts).find(p=>p.id===id);
  if(!preset)throw Error('方案已不存在，请重新读取资料');
  const byId=new Map(profile.facts.map(f=>[f.id,f]));
  const eligible=preset.factIds.filter(id=>{const f=byId.get(id);return f.confirmed===true&&!f.conflict&&!secret(f.label);});
  return {ids:eligible,excluded:preset.factIds.length-eligible.length};
}
