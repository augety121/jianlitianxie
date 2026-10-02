import {semanticLabel,scope} from './semantics.mjs';
import {RECORD_DOMAINS,inOrigin} from './record-model.mjs';
import {fieldDiagnostic} from './match-diagnostics.mjs';
/** Internal quality view; exact custom matching still belongs to the page planner. */
export function factQuality(f,origin=''){
 const semantic=semanticLabel(f.label,f.section),domain=scope(f.section);
 const canonical=fieldDiagnostic({label:f.label,section:f.section}).semantic!=='unknown';
 const date=!/出生|开始|结束|毕业|获得|获奖|日期|时间|月份/.test(semantic)?'unspecified':/^\d{4}$/.test(f.value)?'year':/^\d{4}[-/.]\d{1,2}$/.test(f.value)?'month':/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(f.value)?'day':/^(至今|目前|present|ongoing)$/i.test(f.value)?'ongoing':'unspecified';
 const usability=f.conflict?'conflict':!inOrigin(f,origin)?'out-of-scope':!f.confirmed?'needs-confirmation':RECORD_DOMAINS[domain]&&!f.entity?'needs-record':!canonical?'needs-classification':'usable';
 return {domain,canonicalSemantic:canonical?semantic:'unknown',semanticState:canonical?'canonical':'unrecognized',fieldRole:RECORD_DOMAINS[domain]?.identity.includes(semantic)?'identity':'detail',datePrecision:date,sourceKind:f.sourceKind||'legacy',sourceRefs:f.sourceRefs||[f.id],usability,exclusionReason:usability==='usable'?'none':usability};
}
