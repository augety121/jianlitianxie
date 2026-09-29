import {DiagnosticRecorder,errorCode,exportReport} from './diagnostics.mjs';
import {trustedWorkspace} from './workspace-policy.mjs';
const actions={'bind-entity':'bind',password:'password',presets:'preset','preset-save':'preset','preset-delete':'preset','preset-read':'preset','copy-fact':'copy'};
const recorded=new Set(['scan','fill','remap','bind','locate','stop','lock','unlock','create','save','restore','password','share','revoke','pair','local','legacy','import','preset','copy']);
function actionOf(type){const suffix=type.replace(/^(workspace-|resume-)/,'');return actions[suffix]||suffix;}
const stateCode={ready:'OK',verified:'OK',missing:'MATCH_UNRESOLVED',manual:'CONTROL_MANUAL',preserve:'EXISTING_VALUE',invalid:'INPUT_REJECTED',stale:'TARGET_CHANGED',cancelled:'CANCELLED','not-attempted':'RECEIPT_INVALID','needs-user':'RECEIPT_INVALID'};
/** Sanitize at production time AND again at persistence/export; keep no values or labels. */
export function describeResult(action,result,ids=[]) {
  const fields=[],summary={state:'ok',code:'OK'};
  if(Array.isArray(result?.entries)){
    const counts={};
    result.entries.forEach((e,i)=>{counts[e.status]=(counts[e.status]||0)+1;fields.push({ordinal:i+1,state:e.status,code:stateCode[e.status]||'CONTROL_MANUAL',kind:e.kind||e.type||'unknown',required:!!e.required});});
    summary.count=result.entries.length;
    for(const k of ['ready','missing','manual','preserve'])summary[k]=counts[k]||0;
    summary.frames=result.frames?.length||1;summary.skippedFrames=result.skipped?.length||0;
    for(const k of ['hidden','disabled','readonly','truncated'])summary[k]=(result.frames||[]).reduce((n,f)=>n+(Number.isSafeInteger(f.coverage?.excluded?.[k])?f.coverage.excluded[k]:0)+(k==='truncated'?(f.coverage?.planTruncated||0):0),0);
    if(counts.missing||counts.manual){summary.state='partial';summary.code='MATCH_UNRESOLVED';}
  }
  if(Array.isArray(result?.results)){
    const counts={},positions=new Map(ids.map((id,i)=>[id,i]));
    result.results.forEach((r,i)=>{
      counts[r.status]=(counts[r.status]||0)+1;
      const mapped=(positions.get(r.id??r.fieldId)??-1);
      fields.push({ordinal:mapped>=0?mapped+1:i+1,state:r.status,code:stateCode[r.status]||'RECEIPT_INVALID'});
    });
    summary.count=result.results.length;
    for(const k of ['verified','invalid','stale','cancelled','preserve'])summary[k]=counts[k]||0;
    summary.notAttempted=counts['not-attempted']||0;
    if(result.results.some(r=>!['verified','preserve'].includes(r.status))){summary.state='partial';summary.code='PARTIAL';}
    if(result.warning){summary.state='partial';summary.code='RECORD_FAILED';}
  }
  if(Array.isArray(result?.facts))summary.count=result.facts.length;
  if(result?.state==='stopping'||result?.state==='stopped'){summary.state='cancelled';summary.code='CANCELLED';}
  return {summary,fields};
}
export function createDiagnosticHooks(chrome) {
  const recorder=new DiagnosticRecorder(chrome.storage.local,Date.now,chrome.runtime.getManifest?.().version);
  // Maps are bounded and contain only opaque field identifiers, never user values.
  const ordinals=new Map(),panelRuns=new Map(),pending=new Set();
  const flush=()=>Promise.allSettled([...pending]);
  function enqueue(handle,summary,fields=[]){const task=handle.then(h=>recorder.finish(h,summary,fields)).catch(()=>{});pending.add(task);task.finally(()=>pending.delete(task));}
  function remember(result){if(result?.id&&Array.isArray(result.entries)){ordinals.set(result.id,result.entries.map(e=>e.id??e.fieldId));while(ordinals.size>8)ordinals.delete(ordinals.keys().next().value);}}
  async function handle(m,sender){
    const panel=trustedWorkspace(sender,chrome.runtime,'panel.html');
    if(m.type==='diagnostics-ui-error' && (panel||trustedWorkspace(sender,chrome.runtime))) {
      const h=await recorder.start('ui','ui');await recorder.finish(h,{state:'error',code:m.code==='UI_REJECTION'?'UI_REJECTION':'UI_SCRIPT'});return {recorded:!!h};
    }
    if(m.type==='diagnostics-panel-start' && panel){
      if(!['scan','fill'].includes(m.action))throw Error('不支持的面板诊断');
      const h=await recorder.start(m.action,'mcp');
      if(h){panelRuns.set(h.trace,{handle:h,owner:sender.documentId||sender.tab?.id});while(panelRuns.size>16)panelRuns.delete(panelRuns.keys().next().value);}
      return {trace:h?.trace||null};
    }
    if(m.type==='diagnostics-panel-finish' && panel){
      const item=panelRuns.get(m.trace);if(!item||item.owner!==(sender.documentId||sender.tab?.id))return {recorded:false};
      panelRuns.delete(m.trace);await recorder.finish(item.handle,m.summary,m.fields);return {recorded:true};
    }
    if(!trustedWorkspace(sender,chrome.runtime,'diagnostics.html'))throw Error('只有扩展诊断页可读取或配置日志');
    if(m.type==='diagnostics-configure')return recorder.configure(m.enabled);
    if(m.type==='diagnostics-clear'){ordinals.clear();panelRuns.clear();return recorder.clear();}
    await flush();
    const state=await recorder.state();
    if(m.type==='diagnostics-state')return state;
    if(m.type==='diagnostics-export')return exportReport(state,chrome.runtime.getManifest?.().version,m.trace||'');
    throw Error('未知诊断操作');
  }
  async function observe(m,sender,fn,channel='local') {
    const action=actionOf(m.type||'');
    if(!recorded.has(action))return fn();
    if(channel==='local'&&!trustedWorkspace(sender,chrome.runtime)&&!(m.type==='workspace-legacy'&&trustedWorkspace(sender,chrome.runtime,'panel.html')))return fn();
    // Never delay cancellation or a page write waiting for diagnostics storage.
    // The queue retains only the allowlisted summary, not result objects or errors.
    if(pending.size>=32)return fn();
    const handle=recorder.start(action,channel);
    let data;
    try { data=await fn(); }
    catch(e) {enqueue(handle,{state:'error',code:errorCode(e)});throw e;}
    try {
      remember(data);
      const {summary,fields}=describeResult(action,data,ordinals.get(m.planId)||[]);
      enqueue(handle,summary,fields);
      if(['lock','local','legacy','revoke'].includes(action))ordinals.clear();
    } catch {enqueue(handle,{state:'error',code:'INTERNAL'});}
    return data;
  }
  return {recorder,handle,observe,flush};
}
