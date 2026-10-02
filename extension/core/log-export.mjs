// Receipts arriving here have already passed the background's privacy allowlist.
// Never render a complete report in the DOM. Keep the file complete and yield
// between bounded records so close/cancel and other page input remain responsive.
export function selectLogExport(report,{scope='recent',environment='unspecified'}={}){
 const lastTask=[...(report.records||[])].reverse().find(r=>r.taskId)?.taskId;
 return {...report,exportScope:scope==='task'?'task':'recent',environment:{value:['Edge','IAB','other'].includes(environment)?environment:'unspecified',source:'user-declared'},
  records:scope==='task'?(report.records||[]).filter(r=>lastTask?r.taskId===lastTask:r.operationId===(report.records||[]).at(-1)?.operationId):(report.records||[])};
}
export function logPreview(report) {
 const records=report.records||[], counts={};
 for(const r of records)for(const f of r.fields||[])counts[f.code||f.status]=(counts[f.code||f.status]||0)+1;
 return JSON.stringify({schemaVersion:report.schemaVersion,containsPersonalValues:false,
  previewOnly:true,recordCount:records.length,fieldCount:records.reduce((n,r)=>n+r.fields.length,0),
  reasons:counts,dropped:report.dropped,limitations:report.limitations,
  note:'此处只展示摘要及最近一次操作的前3项；下载文件保留所有已记录字段。omitted表示采集时已达上限。',
  records:records.slice(-1).map(({fields,profile,diagnosis,...r})=>({...r,fields:fields.slice(0,3)}))},null,2);
}
export async function logBlob(report,{signal,onProgress=()=>{},yieldTurn=()=>new Promise(r=>setTimeout(r,0))}={}) {
 const check=()=>{if(signal?.aborted)throw new DOMException('导出已取消','AbortError');};
 const {enabled,records=[],...metadata}=report,parts=[JSON.stringify(metadata).slice(0,-1)+',"records":['];
 for(let i=0;i<records.length;i++){
  check();parts.push((i?',':'')+JSON.stringify(records[i]));onProgress(i+1,records.length);
  await yieldTurn();
 }
 check();parts.push(']}');return new Blob(parts,{type:'application/json'});
}
