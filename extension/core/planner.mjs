import {normalize,semanticLabel,candidatesFor,createCandidateIndex,entityMatches,dateValue,optionKey} from './semantics.mjs';
import {numericMetrics} from './performance.mjs';
import {entityGroups,factMatchesBinding} from './entity-binding.mjs';
import {chooseText} from './text-variants.mjs';
export {normalize};
export const restricted=f=>/password|file|hidden|submit|button|checkbox/.test(f.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(f.label);
export function makePlan(snapshot,profile,mappings={},entityBindings={},options={}){
 const start=performance.now(),facts=profile.facts||[],counts=new Map();
 const metrics={fieldCount:snapshot.fields.length,factCount:facts.length};
 const index=createCandidateIndex(facts,snapshot.url,metrics);
 const groups=new Map(entityGroups(snapshot,facts,entityBindings).map(g=>[g.id,g]));
 for(const f of snapshot.fields){const k=semanticLabel(f.label,f.section);counts.set(k,(counts.get(k)||0)+1);}
 const entries=snapshot.fields.map(original=>{
  const f={...original};if(Array.isArray(f.type)&&/\bx-combocheck\b/.test(f.control?.classes||''))f.type='custom-select';
  const row={fieldId:f.id,label:f.label,dateLabel:f.dateLabel,datePart:f.datePart,section:f.section,groupId:f.groupId,kind:f.type,oldValue:f.value,recognition:f.recognition,required:f.required,optionCount:f.options?.length||0,action:f.action,accept:f.accept,multiple:f.multiple,datePrecision:f.datePrecision,rowIndex:f.rowIndex,currentRows:f.currentRows};
  if(restricted(f))return {...row,status:'manual',reasonCode:'restricted-control',reason:'附件须选择文件；声明、密码和提交由本人操作'};
  if(!options.reviewExisting&&f.value!==''&&f.value!==false&&f.value!=null&&(!Array.isArray(f.value)||f.value.length))return {...row,status:'preserve',reason:'已有内容保留；可检查已有内容后逐项核对差异'};
  if((f.multiple||f.type==='repeat-group')&&!mappings[f.id])return {...row,status:'manual',reason:'请明确指定本次多选资料或经历条数'};
  let candidates=index.candidates(f.dateLabel?{...f,label:f.dateLabel}:f),needsBinding=false,dateRejected=false;
  const bound=groups.get(f.groupId);
  if(mappings[f.id])candidates=index.byId(mappings[f.id]);
  if(bound?.entity){
   if(!bound.valid)return {...row,status:'missing',reasonCode:'record-unbound',reason:bound.reason};
   candidates=candidates.filter(a=>factMatchesBinding(a,f,bound.entity));
  }else if(!mappings[f.id]){const named=candidates.filter(a=>entityMatches(a,f)),anchored=named.length?named:index.anchored(f,candidates);if(anchored.length)candidates=anchored;else if(candidates.some(a=>a.entity)||counts.get(semanticLabel(f.label,f.section))>1){needsBinding=candidates.length>0;candidates=[];}}
  const targetPrecision=f.datePart?null:f.type==='month'||f.datePrecision==='month'&&f.type==='date-picker'?'month':['date','date-picker'].includes(f.type)?'day':null;
  if(targetPrecision){const before=candidates.length;candidates=candidates.filter(a=>dateValue(a.value,targetPrecision)).map(a=>({...a,value:dateValue(a.value,targetPrecision)}));dateRejected=before>0&&!candidates.length;}
  candidates=candidates.filter((a,i,all)=>all.findIndex(b=>b.value===a.value&&b.entity===a.entity&&JSON.stringify(b.textVariants||[])===JSON.stringify(a.textVariants||[]))===i);
  if(candidates.length!==1)return {...row,status:'missing',reasonCode:candidates.length?'ambiguous-source':dateRejected?'date-precision':needsBinding?'record-unbound':'no-label-match',candidateIds:candidates.map(a=>a.id),reason:candidates.length?'多个来源不一致，请指定资料':dateRejected?'资料没有所需日期精度，不补造日期':needsBinding?'请先选择这段教育、工作或项目记录对应的经历':'资料中没有相同字段或别名（或分区不同），点击选资料核对；不要重复导入相同文件'};
  const fact=candidates[0];let value=String(fact.value),variantName='';
  if(f.datePart){const normalized=dateValue(value,f.datePart==='day'?'day':'month');if(!normalized)return {...row,status:'missing',reasonCode:'date-precision',reason:'资料缺少此日期的准确年月或日，请核对'};value=String(Number(normalized.split('-')[{year:0,month:1,day:2}[f.datePart]]));}
  if(f.type==='repeat-group'){
   const count=Number(value);if(!Number.isInteger(count)||count<1||count>20)return {...row,status:'missing',reason:'经历总条数须为1至20'};
   if(count<=f.currentRows)return {...row,status:'preserve',reason:'已有足够行，不删除或重复添加'};
   return {...row,status:'ready',value:count,factId:fact.id,source:fact.source,reason:'仅添加缺少的经历行，完成后重新扫描'};
  }
  if(f.multiple){
   let requested;try{requested=JSON.parse(value);}catch{return {...row,status:'missing',reason:'多选资料须明确列出JSON数组'};}
   if(!Array.isArray(requested)||!requested.length||requested.some(v=>typeof v!=='string')||new Set(requested).size!==requested.length)return {...row,status:'missing',reason:'多选列表无效'};
   const values=[];for(const v of requested){const opts=(f.options||[]).filter(o=>!o.disabled&&optionKey(f.label,o.label)===optionKey(f.label,v));if(opts.length!==1)return {...row,status:'missing',reason:'多选候选尚未加载或不唯一，请先完成上级选项'};values.push(opts[0].value);}
   return {...row,status:'ready',value:values,factId:fact.id,source:fact.source,reason:'明确映射并逐项匹配全部选项'};
  }
  const precision=f.type==='date'?'day':f.type==='month'||f.type==='date-picker'&&f.datePrecision==='month'?'month':f.type==='date-picker'?'day':null;
  if(precision){value=dateValue(value,precision);if(!value)return {...row,status:'missing',reason:precision==='day'?'需要准确日期，不把月份补成1日':'需要有效年月'};}
  if(f.type==='number'){if(['身高','体重'].includes(semanticLabel(f.label)))value=value.replace(/\s*(cm|kg|厘米|公斤|千克)$/i,'');if(!/^-?\d+(\.\d+)?$/.test(value))return {...row,status:'missing',reasonCode:'number-required',reason:'网页只接受数值；面议等文字不能换算，请本人填写'};}
  if(!f.datePart&&['text','textarea','contenteditable'].includes(f.type)){
   const chosen=chooseText(fact,f);if(!chosen)return {...row,status:'missing',reasonCode:'text-too-long',reason:'所有已核实版本均超过字数限制，请补充短版；不会截断项目正文'};
   value=chosen.value;variantName=chosen.name;
  }else if(f.maxLength>0&&value.length>f.maxLength)return {...row,status:'missing',reasonCode:'text-too-long',reason:'超过字数限制，需审阅压缩文字'};
  if(f.options?.length){const key=v=>f.datePart&&/^\d{1,4}[年月日]?$/.test(String(v).trim())?String(Number(String(v).trim().replace(/[年月日]$/,''))):optionKey(f.label,v);const options=f.options.filter(o=>!o.disabled&&key(o.label)===key(value));if(options.length!==1)return {...row,status:'missing',reasonCode:'option-unavailable',reason:'没有唯一准确的候选选项，请核对选项或先选择上级地区'};value=options[0].value;}
  return {...row,status:'ready',value,factId:fact.id,source:fact.source,...(variantName?{variantName}:{}),reason:variantName&&variantName!=='原文'?`已按字数上限选择已核实的${variantName}`:bound?.entity?'已按本人指定的整段经历匹配':'分区、字段及经历匹配'};
 });
 const reviewedEntries=entries.map(e=>{
  const occupied=e.oldValue!==''&&e.oldValue!==false&&e.oldValue!=null&&(!Array.isArray(e.oldValue)||e.oldValue.length);
  if(!options.reviewExisting||!occupied||e.status==='manual')return e;
  if(e.status!=='ready')return {...e,status:'preserve',evidenceCode:e.reasonCode,reasonCode:'existing-unverified',reason:'已有内容保留；没有足够资料判断是否需要修正'};
  if(String(e.oldValue).trim()===String(e.value).trim()||e.datePart&&/^\d{1,4}[年月日]?$/.test(String(e.oldValue).trim())&&Number(String(e.oldValue).trim().replace(/[年月日]$/,''))===Number(e.value))return {...e,status:'preserve',reasonCode:'existing-consistent',reason:'与已核实资料一致，保留原值'};
  return {...e,status:options.corrections?.[e.fieldId]===true?'ready':'review',allowOverwrite:options.corrections?.[e.fieldId]===true,reasonCode:'existing-difference',reason:'网页已有内容与资料不同；核对旧值和新值后确认修正'};
 });
 return {id:crypto.randomUUID(),snapshotId:snapshot.id,url:snapshot.url,createdAt:Date.now(),coverage:snapshot.coverage,limitations:snapshot.limitations,performance:{scan:numericMetrics(snapshot.performance),match:numericMetrics({...metrics,durationMs:performance.now()-start})},entries:reviewedEntries};
}
export function publicSnapshot(s){return {id:s.id,origin:new URL(s.url).origin,fields:s.fields.map(({id,label,type,section,required,maxLength,options,value,action,accept,multiple,datePrecision})=>({id,label,type,section,required,maxLength,action,accept,multiple,datePrecision,hasValue:value!==''&&value!=null,options:options?.map(o=>({label:o.label}))})),coverage:s.coverage,limitations:s.limitations};}
export function publicPlan(p){return {id:p.id,snapshotId:p.snapshotId,coverage:p.coverage,limitations:p.limitations,entries:p.entries.map(({fieldId,label,section,status,reason,factId,candidateIds})=>({fieldId,label,section,status,reason,factId,candidateIds}))};}
