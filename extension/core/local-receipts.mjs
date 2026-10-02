import {cleanAddition} from './addition-status.mjs';
import {preflightCodes} from './preflight.mjs';
import {numericMetrics} from './performance.mjs';
import {cleanDiagnostic,cleanProfileDiagnostic,diagnosticCodes,explainDiagnostic} from './match-diagnostics.mjs';
/** Local-only bounded operation receipts. No URLs, labels, values or raw exceptions. */
const KEY='resumeLocalReceiptsV1', FLAG='resumeLocalReceiptsEnabled';
const stages=new Set(['preview','import','scan','fill','bind','map','stop','erase','learn','task','add','ui']);
const statuses=new Set(['ready','review','missing','manual','preserve','verified','invalid','stale','needs-user','cancelled','not-attempted']);
const codes=new Set(Object.keys(diagnosticCodes));
const reasons=new Set(['none','check-input','target-changed','permission','busy','interrupted','review-required',...preflightCodes]);
const int=(v,max)=>Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
const domainCounts=value=>Object.fromEntries(['education','work','project','language','award'].map(k=>[k,int(value?.[k],1000)]));
function profileState(value){if(!value)return undefined;return {accepted:value.accepted===true,activeVersionState:['available','uninitialized','invalid'].includes(value.activeVersionState)?value.activeVersionState:'unknown',revision:int(value.revision,1e9),total:int(value.total,20000),canonical:int(value.canonical,20000),customExact:int(value.customExact,20000),unrecognized:int(value.unrecognized,20000),usable:domainCounts(value.usable),repairable:domainCounts(value.repairable)};}
function runtimeIdentity(r={}){
  return {extensionId:/^[a-p]{32}$/.test(r.extensionId||'')?r.extensionId:'unknown',
    mode:['local','mcp'].includes(r.mode)?r.mode:'unknown',adapterVersion:/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.adapterVersion||'')?r.adapterVersion:'unknown',
    buildId:['moka-20261002.1','recovery-20261002.1','import-review-20261002.2'].includes(r.buildId)?r.buildId:'unknown'};
}
function safe(r) {
  if(!r || !stages.has(r.stage))return null;
  return {...(typeof r.taskId==='string'&&/^[a-f0-9-]{36}$/.test(r.taskId)?{taskId:r.taskId}:{}),...( ['running','completed','partial','needs-confirmation','no-eligible-fields','cancelled','failed'].includes(r.outcome)?{outcome:r.outcome}:{}),seq:int(r.seq,1e9),at:int(r.at,9e15),stage:r.stage,ok:r.ok===true,
    ...(typeof r.operationId==='string'&&/^[a-f0-9-]{36}$/.test(r.operationId)?{operationId:r.operationId}:{}),
    ...(r.ui?{ui:{view:['manager','learn','records','picker'].includes(r.ui.view)?r.ui.view:'unknown',state:['requested','ready','denied','timeout','closed'].includes(r.ui.state)?r.ui.state:'unknown'}}:{}),
    ...(r.profileState?{profileState:profileState(r.profileState)}:{}),
    ...(['not-started','blocked','no-write-needed','applied','interrupted'].includes(r.executionOutcome)?{executionOutcome:r.executionOutcome}:{}),
    ...(r.learning?{learning:{candidates:int(r.learning.candidates,1000),saved:int(r.learning.saved,1000),duplicates:int(r.learning.duplicates,1000),conflicts:int(r.learning.conflicts,1000),unselected:int(r.learning.unselected,1000),missingRecord:int(r.learning.missingRecord,1000),before:domainCounts(r.learning.before),after:domainCounts(r.learning.after)}}:{}),
    ...(r.coverage?{coverage:{state:['complete-in-scope','partial','incomplete','uncertain','profile-not-ready','host-limited','verified-existing'].includes(r.coverage.state)?r.coverage.state:'incomplete',written:int(r.coverage.written,20000),consistent:int(r.coverage.consistent,20000),unverified:int(r.coverage.unverified,20000),missing:int(r.coverage.missing,20000),manual:int(r.coverage.manual,20000)}}:{}),
    version:/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.version||'')?r.version:'unknown',runtime:runtimeIdentity(r.runtime),
    engineVersion:/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.engineVersion||'')?r.engineVersion:'unknown',
    ...(cleanProfileDiagnostic(r.profile)?{profile:cleanProfileDiagnostic(r.profile)}:{}),
    ...(cleanAddition(r.addition)?{addition:cleanAddition(r.addition)}:{}),
    reason:reasons.has(r.reason)?r.reason:'check-input',ms:int(r.ms,3600000),total:int(r.total,20000),
    fields:(Array.isArray(r.fields)?r.fields:[]).slice(0,300).filter(x=>statuses.has(x?.status)).map(x=>({index:int(x.index,20000),status:x.status,...(codes.has(x.code)?{code:x.code}:{}),...cleanDiagnostic(x)})),
    omitted:int(r.omitted,20000),performance:{scan:numericMetrics(r.performance?.scan),match:numericMetrics(r.performance?.match),apply:numericMetrics(r.performance?.apply)}};
}
export function receiptReason(error) {
  if(preflightCodes.has(error?.code))return error.code;
  const s=String(error?.message || '');
  if(/失效|变化|改变|过期|到期/.test(s))return 'target-changed';
  if(/权限|授权当前来源|具体网申/.test(s))return 'permission';
  if(/忙|正在|先停止/.test(s))return 'busy';
  if(/取消|中断/.test(s))return 'interrupted';
  if(/核对|确认|选择/.test(s))return 'review-required';
  return 'check-input';
}
export class LocalReceipts {
  constructor(storage,clock=Date.now,runtime={}){this.storage=storage;this.clock=clock;this.version=runtime.version;this.runtime=runtimeIdentity(runtime);this.tail=Promise.resolve();this.epoch=0;this.dropped=0;this.pending=0;}
  queue(fn){const p=this.tail.then(fn);this.tail=p.catch(()=>{this.dropped++;});return p;}
  async rows(){const raw=(await this.storage.get(KEY))[KEY];return (Array.isArray(raw)?raw:[]).slice(-80).map(safe).filter(r=>r&&r.at>this.clock()-86400000&&r.at<=this.clock());}
  add(r){
    if(this.pending>=16){this.dropped++;return;}
    const epoch=this.epoch,projected=safe({operationId:crypto.randomUUID(),version:this.version,...r,runtime:this.runtime,at:this.clock()});if(!projected)return;
    this.pending++;
    this.queue(async()=>{
      if(epoch!==this.epoch||(await this.storage.get(FLAG))[FLAG]===false)return;
      const rows=await this.rows();if(epoch!==this.epoch)return;
      if(rows.length>=80)this.dropped++;
      const next={...projected,seq:(rows.at(-1)?.seq||0)+1};await this.storage.set({[KEY]:[...rows,next].slice(-80)});
    }).finally(()=>{this.pending--;}).catch(()=>{});
  }
  async read(){
    // Log storage never holds up a fill. Reading logs may independently report a timeout.
    let timer;try{return await Promise.race([this.queue(async()=>{const enabled=(await this.storage.get(FLAG))[FLAG]!==false,records=await this.rows();await this.storage.set({[KEY]:records});return {enabled,dropped:this.dropped,records};}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('日志存储未响应；不影响填写')),1200);})]);}finally{clearTimeout(timer);}
  }
  settings(enabled,clear=false){
    if(typeof enabled!=='boolean')throw Error('日志开关无效');this.epoch++;
    return this.queue(()=>this.storage.set({[FLAG]:enabled,...(clear?{[KEY]:[]}: {})}));
  }
}
export function exportReceipts(data,{includeExplanations=true}={}){
  const records=(data.records||[]).map(safe).filter(Boolean),base=records[0]?.at||0;
    return {schemaVersion:4,containsPersonalValues:false,dropped:int(data.dropped,1e9),legend:diagnosticCodes,limitations:['仅记录固定规范字段名，不含原始标签、个人值、网址或简历正文','verified仅表示页面回读，不表示保存或提交','unknown 可能是诊断脱敏，不等于无法匹配；旧记录缺少的信息不补造'],records:records.map(({at,...r})=>({...r,offsetMs:at-base,...(includeExplanations?{diagnosis:r.fields.map(explainDiagnostic)}:{})}))};
}
