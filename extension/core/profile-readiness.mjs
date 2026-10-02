import {recordTargets} from './addition-status.mjs';
import {proposeStoredRepair} from './stored-profile-repair.mjs';
/** Non-personal counts only. Entity metadata alone is NOT a fillable record. */
export function profileReadiness(profile, origin='') {
  const facts=(profile?.facts||[]).filter(f=>f.confirmed===true&&!f.conflict&&(!origin||!f.origin||f.origin===origin));
  const usable=recordTargets(facts,origin);
  const repair=proposeStoredRepair({facts});
  const repairs=new Set(repair.facts.map(f=>JSON.stringify([f.entity,f.origin||''])));
  return {confirmed:facts.length,usable,repairableProjects:repairs.size,repairableFields:repair.facts.length,
    needsRepair:repair.facts.length>0,hasUsableRecords:Object.values(usable).some(Boolean)};
}
export function readinessText(r) {
  if(!r)return '';
  const u=r.usable;
  return `可填写记录：教育 ${u.education} 段 · 实习/工作 ${u.work} 段 · 项目 ${u.project} 段 · 语言 ${u.language||0} 项 · 获奖 ${u.award||0} 项`+
    (r.repairableProjects?`；另有 ${r.repairableProjects} 段旧项目片段可整理，核对保存后即可使用。`:r.confirmed&&!r.hasUsableRecords?'。已存条目中尚无可匹配的经历；请核对原文件的解析结果。':'。');
}
