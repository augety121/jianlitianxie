export const normalize = s=>String(s??'').toLowerCase().replace(/[\s*：:（）()\-_]/g,'');
export const restricted = f=>/password|file|hidden|submit|button|checkbox/.test(f.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(f.label);
export function makePlan(snapshot, profile, mappings={}) {
 const facts=profile.facts||[];
 const counts=new Map(); for(const f of snapshot.fields) counts.set(normalize(f.label),(counts.get(normalize(f.label))||0)+1);
 const entries=snapshot.fields.map(f=>{
  const row={fieldId:f.id,label:f.label,section:f.section,kind:f.type,oldValue:f.value,required:f.required};
  if(restricted(f)) return {...row,status:'manual',reason:'附件、声明、密码及提交控件由本人操作'};
  if(f.value!=='' && f.value!==false && f.value!=null) return {...row,status:'preserve',reason:'已有内容保留；请在网页修正后重新扫描'};
  let candidates=facts.filter(a=>a.confirmed!==false&&!a.conflict && [a.label,...a.aliases||[]].some(v=>normalize(v)===normalize(f.label)));
  if(mappings[f.id]) candidates=facts.filter(a=>a.id===mappings[f.id]&&!a.conflict&&a.confirmed!==false);
  else if(candidates.length>1 || counts.get(normalize(f.label))>1) candidates=candidates.filter(a=>a.entity && normalize(f.section).includes(normalize(a.entity)));
  if(candidates.length!==1) return {...row,status:'missing',reason:candidates.length?'同名字段或多段经历需指定资料':'本地没有确定的匹配资料'};
  const fact=candidates[0]; let value=String(fact.value);
  if(f.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)) return {...row,status:'missing',reason:'日期精度不足，不补造日'};
  if(f.maxLength>0 && value.length>f.maxLength) return {...row,status:'missing',reason:'超过字数限制，需审阅压缩文字'};
  if(f.options?.length) {
   const options=f.options.filter(o=>!o.disabled && normalize(o.label)===normalize(value));
   if(options.length!==1) return {...row,status:'missing',reason:'没有唯一准确的候选选项'};
   value=options[0].value;
  }
  return {...row,status:'ready',value,factId:fact.id,source:fact.source,reason:'本地事实精确匹配'};
 });
 return {id:crypto.randomUUID(),snapshotId:snapshot.id,url:snapshot.url,createdAt:Date.now(),entries};
}
export function publicSnapshot(s){return {id:s.id,origin:new URL(s.url).origin,fields:s.fields.map(({id,label,type,section,required,maxLength,options,value})=>({id,label,type,section,required,maxLength,hasValue:value!==''&&value!=null,options:options?.map(o=>({label:o.label}))})),limitations:s.limitations};}
export function publicPlan(p){return {id:p.id,snapshotId:p.snapshotId,entries:p.entries.map(({fieldId,label,status,reason,factId})=>({fieldId,label,status,reason,factId}))};}
