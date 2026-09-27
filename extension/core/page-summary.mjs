import {sensitive} from './workspace-policy.mjs';
import {restricted} from './planner.mjs';
export const QUICK_LIMIT = 60;
const reasons={
 'no-label-match':'未找到对应资料，可在小窗选择这一项',
 'record-unbound':'需要指定这段经历的资料',
 'ambiguous-source':'有多份可能资料，请选择正确的一份',
 'date-precision':'资料缺少完整日期，不补造日期',
 'restricted-control':'请直接在网页处理附件、声明或验证码',
 'sensitive-review':'敏感资料需要逐项确认'
};
/** The page receives its own labels, bounded counts and fixed codes, not profile values. */
export function pageSummary(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  const eligible=plan.entries.filter(e=>e.frameId===0&&e.status==='ready'&&!sensitive(e.label)&&e.kind!=='repeat-group').slice(0,QUICK_LIMIT);
  const exceptional=plan.entries.filter(e=>['missing','manual'].includes(e.status)||e.status==='ready'&&sensitive(e.label));
  const problems=exceptional.slice(0,60).map(e=>{
    const code=e.status==='ready'?'sensitive-review':Object.hasOwn(reasons,e.reasonCode)?e.reasonCode:'no-label-match';
    return {id:e.id,label:String(e.label||'未识别名称的输入框').slice(0,160),section:String(e.section||'').slice(0,100),code,
      hint:reasons[code],pickable:e.frameId===0&&!e.multiple&&e.kind!=='repeat-group'&&!restricted({type:e.kind,label:e.label})};
  });
  return {id:plan.id,expiresAt:plan.expiresAt,counts,total:plan.entries.length,
    quick:eligible.map(e=>({id:e.id,label:String(e.label).slice(0,160),section:String(e.section||'').slice(0,100)})),
    problems,problemMore:Math.max(0,exceptional.length-problems.length),
    more:Math.max(0,counts.ready-eligible.length),
    message:counts.ready===0 ? (counts.missing||counts.manual ? `本次没有可自动补全的空白项。已保留 ${counts.preserve} 项，以下项目需要补充资料或本人处理。` : '本页可识别的字段已有内容，不需要重复填写。') : !eligible.length ? '剩余敏感项需单独确认；请在下方选择这一项的资料。' : `已找到 ${eligible.length} 个可直接补全的普通空白项。`};
}
export function planExplanation(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  return counts.ready ? `可填 ${counts.ready} 项；已有 ${counts.preserve} 项保持不变。` :
    `暂时没有可直接填写项：${counts.missing} 项未唯一匹配，${counts.manual} 项需人工处理，${counts.preserve} 项已有内容。可回到申请页点击“填写简历”，并用缺项旁的“补填这项”选择资料。`;
}
