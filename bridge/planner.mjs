import {normalize,semanticLabel,candidatesFor,entityMatches,dateValue,optionKey} from './semantics.mjs';
export {normalize};
export const restricted=f=>/password|file|hidden|submit|button|checkbox/.test(f.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(f.label);
export function makePlan(snapshot,profile,mappings={}){
 const facts=profile.facts||[],counts=new Map();
 for(const f of snapshot.fields){const k=semanticLabel(f.label,f.section);counts.set(k,(counts.get(k)||0)+1);}
 const entries=snapshot.fields.map(f=>{
  const row={fieldId:f.id,label:f.label,section:f.section,kind:f.type,oldValue:f.value,required:f.required,action:f.action,accept:f.accept,multiple:f.multiple,datePrecision:f.datePrecision};
  if(restricted(f))return {...row,status:'manual',reason:'附件须选择文件；声明、密码和提交由本人操作'};
  if(f.value!==''&&f.value!==false&&f.value!=null&&(!Array.isArray(f.value)||f.value.length))return {...row,status:'preserve',reason:'已有内容保留；请在网页修正后重新扫描'};
  if(f.multiple)return {...row,status:'manual',reason:'多选需本人核对全部选项，不以单个值替代'};
  let candidates=candidatesFor({...f,url:snapshot.url},facts);
  if(mappings[f.id])candidates=facts.filter(a=>a.id===mappings[f.id]&&a.confirmed!==false&&!a.conflict&&(!a.origin||a.origin===new URL(snapshot.url).origin));
  else{const anchored=candidates.filter(a=>entityMatches(a,f));if(anchored.length)candidates=anchored;else if(candidates.some(a=>a.entity)||counts.get(semanticLabel(f.label,f.section))>1)candidates=[];}
  const targetPrecision=f.type==='month'||f.datePrecision==='month'&&f.type==='date-picker'?'month':['date','date-picker'].includes(f.type)?'day':null;
  if(targetPrecision)candidates=candidates.filter(a=>dateValue(a.value,targetPrecision)).map(a=>({...a,value:dateValue(a.value,targetPrecision)}));
  candidates=candidates.filter((a,i,all)=>all.findIndex(b=>b.value===a.value&&b.entity===a.entity)===i);
  if(candidates.length!==1)return {...row,status:'missing',candidateIds:candidates.map(a=>a.id),reason:candidates.length?'多个来源不一致，请指定资料':'未找到唯一资料或缺少经历锚点，请核对分区'};
  const fact=candidates[0];let value=String(fact.value);
  const precision=f.type==='month'||f.datePrecision==='month'?'month':['date','date-picker'].includes(f.type)?'day':null;
  if(precision){value=dateValue(value,precision);if(!value)return {...row,status:'missing',reason:precision==='day'?'需要准确日期，不把月份补成1日':'需要有效年月'};}
  if(f.type==='number'){if(['身高','体重'].includes(semanticLabel(f.label)))value=value.replace(/\s*(cm|kg|厘米|公斤|千克)$/i,'');if(!/^-?\d+(\.\d+)?$/.test(value))return {...row,status:'missing',reason:'资料不是有效数值'};}
  if(f.maxLength>0&&value.length>f.maxLength)return {...row,status:'missing',reason:'超过字数限制，需审阅压缩文字'};
  if(f.options?.length){const options=f.options.filter(o=>!o.disabled&&optionKey(f.label,o.label)===optionKey(f.label,value));if(options.length!==1)return {...row,status:'missing',reason:'没有唯一准确的候选选项'};value=options[0].value;}
  return {...row,status:'ready',value,factId:fact.id,source:fact.source,reason:'分区、字段及经历匹配'};
 });
 return {id:crypto.randomUUID(),snapshotId:snapshot.id,url:snapshot.url,createdAt:Date.now(),coverage:snapshot.coverage,limitations:snapshot.limitations,entries};
}
export function publicSnapshot(s){return {id:s.id,origin:new URL(s.url).origin,fields:s.fields.map(({id,label,type,section,required,maxLength,options,value,action,accept,multiple,datePrecision})=>({id,label,type,section,required,maxLength,action,accept,multiple,datePrecision,hasValue:value!==''&&value!=null,options:options?.map(o=>({label:o.label}))})),coverage:s.coverage,limitations:s.limitations};}
export function publicPlan(p){return {id:p.id,snapshotId:p.snapshotId,coverage:p.coverage,limitations:p.limitations,entries:p.entries.map(({fieldId,label,section,status,reason,factId,candidateIds})=>({fieldId,label,section,status,reason,factId,candidateIds}))};}
