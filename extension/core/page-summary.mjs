import {sensitive} from './workspace-policy.mjs';
export const QUICK_LIMIT = 60;
export function pageSummary(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  const eligible=plan.entries.filter(e=>e.frameId===0&&e.status==='ready'&&!sensitive(e.label)&&e.kind!=='repeat-group').slice(0,QUICK_LIMIT);
  return {id:plan.id,expiresAt:plan.expiresAt,counts,total:plan.entries.length,
    quick:eligible.map(e=>({id:e.id,label:String(e.label).slice(0,160),section:String(e.section||'').slice(0,100)})),
    more:Math.max(0,counts.ready-eligible.length),
    message:counts.ready===0 ? (counts.missing||counts.manual ? '没有可直接填写的空白字段：请查看未匹配原因；已有内容不会覆盖。' : '当前扫描字段已有内容，无需重复填写。') : !eligible.length ? '只有敏感项或需要工作台核对的字段，未自动选择；请打开工作台。' : '仅填写下列普通空白字段；敏感项和未匹配项请到工作台核对。'};
}
export function planExplanation(plan) {
  const counts={ready:0,missing:0,manual:0,preserve:0};
  for(const e of plan.entries)if(Object.hasOwn(counts,e.status))counts[e.status]++;
  return counts.ready ? `可填 ${counts.ready} 项；已有 ${counts.preserve} 项保持不变。` :
    `暂时没有可直接填写项：${counts.missing} 项未唯一匹配，${counts.manual} 项需人工处理，${counts.preserve} 项已有内容。点击未匹配行的“选资料”，并核对当前申请页。`;
}
