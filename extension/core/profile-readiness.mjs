import {recordTargets} from './addition-status.mjs';
import {proposeStoredRepair} from './stored-profile-repair.mjs';
import {selectedProfileFacts,RECORD_DOMAINS} from './record-model.mjs';
import {scope} from './semantics.mjs';
import {factQuality} from './fact-quality.mjs';
/** Non-personal counts only. Entity metadata alone is NOT a fillable record. */
export function profileReadiness(profile, origin='') {
  const facts=selectedProfileFacts(profile||{},origin).filter(f=>f.confirmed===true&&!f.conflict);
  const usable=recordTargets(facts,origin);
  const repair=proposeStoredRepair({facts});
  const repairable=Object.fromEntries(Object.keys(RECORD_DOMAINS).map(domain=>[domain,new Set(repair.facts.filter(f=>scope(f.section)===domain).map(f=>JSON.stringify([f.entity,f.origin||'']))).size]));
  const quality=(profile?.facts||[]).map(f=>factQuality(f,origin)),reasons={},reasonsByDomain={};for(const q of quality){reasons[q.usability]=(reasons[q.usability]||0)+1;const group=reasonsByDomain[q.domain||'unknown']??={};group[q.usability]=(group[q.usability]||0)+1;}
  return {storedFacts:profile?.facts?.length||0,canonicalFacts:quality.filter(q=>q.semanticState==='canonical').length,unresolvedFacts:quality.filter(q=>q.usability!=='usable').length,reasons,reasonsByDomain,confirmed:facts.length,usable,repairable,repairableRecords:Object.values(repairable).reduce((a,b)=>a+b,0),repairableProjects:repairable.project,repairableFields:repair.facts.length,
    needsRepair:repair.facts.length>0,hasUsableRecords:Object.values(usable).some(Boolean)};
}
export function readinessText(r) {
  if(!r)return '';
  const u=r.usable;
  return `可填写记录：教育 ${u.education} 段 · 实习/工作 ${u.work} 段 · 项目 ${u.project} 段 · 语言 ${u.language||0} 项 · 获奖 ${u.award||0} 项`+
    (r.repairableRecords?`；另有 ${r.repairableRecords} 段旧资料可整理，核对保存后即可使用。`:r.confirmed&&!r.hasUsableRecords?'。已存条目中尚无可匹配的经历；请核对已存资料或从已填页面建立记录。':'。');
}
