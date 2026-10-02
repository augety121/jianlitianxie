import {sensitive} from './workspace-policy.mjs';
import {restricted} from './planner.mjs';
export const QUICK_LIMIT = 60;
const reasons={
 'no-label-match':'未找到对应资料，可在小窗选择这一项',
 'record-unbound':'需要指定这段经历的资料',
 'ambiguous-source':'有多份可能资料，请选择正确的一份',
 'date-precision':'资料缺少完整日期，不补造日期',
 'text-too-long':'正文超过字数上限，请在资料中补充已核实的短版',
 'number-required':'网页只接受数字，面议等情况请在网页自行填写',
 'option-unavailable':'没有准确匹配的选项，请核对候选或先选上级选项',
 'existing-difference':'已有内容与简历不同，请到核对页确认是否修正',
 'restricted-control':'请直接在网页处理附件、声明或验证码',
 'existing-unverified':'已有内容已保留，但尚未与资料核实；可按经历整组核对',
 'sensitive-review':'敏感资料需要逐项确认'
};
/** The page receives its own labels, bounded counts and fixed codes, not profile values. */
export function pageSummary(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0,review:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  const coverage={consistent:plan.entries.filter(e=>e.status==='preserve'&&e.reasonCode==='existing-consistent').length,unverified:plan.entries.filter(e=>e.status==='preserve'&&e.reasonCode==='existing-unverified').length,requiredMissing:plan.entries.filter(e=>e.required&&['missing','review'].includes(e.status)).length};
  const ordinary=plan.entries.filter(e=>e.frameId===0&&e.status==='ready'&&!sensitive(e.label)&&e.kind!=='repeat-group');
  const eligible=ordinary.slice(0,QUICK_LIMIT);
  const exceptional=plan.entries.filter(e=>['missing','manual','review'].includes(e.status)||e.status==='preserve'&&e.reasonCode==='existing-unverified'||e.status==='ready'&&sensitive(e.label));
  const problems=exceptional.slice(0,60).map(e=>{
    const code=e.status==='ready'?'sensitive-review':Object.hasOwn(reasons,e.reasonCode)?e.reasonCode:'no-label-match';
    return {id:e.id,label:String(e.label||'未识别名称的输入框').slice(0,160),section:String(e.section||'').slice(0,100),code,
      hint:reasons[code],pickable:!['review','preserve'].includes(e.status)&&e.frameId===0&&!e.multiple&&e.kind!=='repeat-group'&&!restricted({type:e.kind,label:e.label})};
  });
  return {id:plan.id,expiresAt:plan.expiresAt,counts,coverage,total:plan.entries.length,
    quick:eligible.map(e=>({id:e.id,label:String(e.label).slice(0,160),section:String(e.section||'').slice(0,100)})),
    problems,problemMore:Math.max(0,exceptional.length-problems.length),
    more:Math.max(0,ordinary.length-eligible.length),
    message:counts.ready===0 ? (counts.review?`${counts.review} 项已有内容与简历不同，请进入核对页确认修正；其他已有内容保留。`:counts.missing||counts.manual||coverage.unverified ? `本次没有可自动补全的空白项。${counts.missing} 项未匹配；已有一致 ${coverage.consistent} 项、待核实 ${coverage.unverified} 项。` : '本页可识别的字段已有内容，不需要重复填写。') : !eligible.length ? '剩余敏感项需单独确认；可以稍后在网页自行填写。' : `已找到 ${eligible.length} 个可直接补全的普通空白项。`};
}
export function resultSummary(plan,results=[]){
 const outcomes=new Map(results.map(r=>[r.id,r]));
 const entries=plan.entries.map(e=>outcomes.get(e.id)?.status==='verified'?{...e,status:'preserve',reasonCode:'existing-consistent'}:outcomes.has(e.id)?{...e,status:'manual',reasonCode:'readback-failed'}:e);
 const summary=pageSummary({...plan,entries});
 return {...summary,asOf:'execution-readback',written:results.filter(r=>r.status==='verified').length,quick:[],more:0,problems:summary.problems.map(p=>({...p,pickable:false}))};
}
export function planExplanation(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0,review:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  return counts.review?`发现 ${counts.review} 项已有内容与简历不同。请核对差异并确认修正；另有 ${counts.ready} 项可补填、${counts.preserve} 项保留。`:counts.ready ? `可填 ${counts.ready} 项；已有 ${counts.preserve} 项保持不变。` :
    `暂时没有可直接填写项：${counts.missing} 项未唯一匹配，${counts.manual} 项需人工处理，${counts.preserve} 项已有内容。暂缺资料直接跳过，不影响其他可填项；在网页补完后可保存补充内容。`;
}
