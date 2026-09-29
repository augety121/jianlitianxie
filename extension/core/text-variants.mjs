import {semanticLabel} from './semantics.mjs';
const narrativeLabels=new Set(['项目描述','项目职责','项目成果','岗位职责','工作成果','自我评价','教育经历描述','技能描述'].map(x=>semanticLabel(x)));
export const supportsTextVariants=label=>narrativeLabels.has(semanticLabel(label));
/** Alternatives are authored and reviewed with the fact, never generated or truncated. */
export function normalizeTextVariants(input,label){
 if(input==null)return [];
 if(!Array.isArray(input)||input.length>5)throw Error('长短文备选最多5份');
 if(input.length&&!supportsTextVariants(label))throw Error('只有项目、工作和个人介绍等叙述字段可以设置长短文');
 const names=new Set();
 return input.map(v=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.name!=='string'||!v.name.trim()||v.name.length>40||names.has(v.name.trim()))throw Error('备选版本名称为空、重复或过长');
  if(typeof v.value!=='string'||!v.value.trim()||v.value.length>10000)throw Error('备选正文为空或超过10000字');
  names.add(v.name.trim());return {name:v.name.trim(),value:v.value};
 });
}
export function chooseText(fact,field){
 const versions=[{name:'原文',value:String(fact.value)}];
 if(supportsTextVariants(field.label)&&supportsTextVariants(fact.label)&&['text','textarea','contenteditable'].includes(field.type)&&!field.options?.length&&!field.multiple){
  versions.push(...normalizeTextVariants(fact.textVariants,fact.label));
 }
 const limit=Number.isInteger(field.maxLength)&&field.maxLength>=0?field.maxLength:Infinity;
 return versions.filter(v=>v.value.length<=limit).sort((a,b)=>b.value.length-a.value.length)[0]||null;
}
