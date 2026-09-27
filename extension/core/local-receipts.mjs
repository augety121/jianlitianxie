import {numericMetrics} from './performance.mjs';
/** Local-only bounded operation receipts. No URLs, labels, values or raw exceptions. */
const KEY='resumeLocalReceiptsV1', FLAG='resumeLocalReceiptsEnabled';
const stages=new Set(['preview','import','scan','fill','bind','map','stop','erase']);
const statuses=new Set(['ready','missing','manual','preserve','verified','invalid','stale','needs-user','cancelled','not-attempted']);
const reasons=new Set(['none','check-input','target-changed','permission','busy','interrupted','review-required']);
const int=(v,max)=>Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
function safe(r) {
  if(!r || !stages.has(r.stage))return null;
  return {seq:int(r.seq,1e9),at:int(r.at,9e15),stage:r.stage,ok:r.ok===true,
    reason:reasons.has(r.reason)?r.reason:'check-input',ms:int(r.ms,3600000),total:int(r.total,20000),
    fields:(Array.isArray(r.fields)?r.fields:[]).slice(0,300).filter(x=>statuses.has(x?.status)).map(x=>({index:int(x.index,20000),status:x.status})),
    omitted:int(r.omitted,20000),performance:{scan:numericMetrics(r.performance?.scan),match:numericMetrics(r.performance?.match),apply:numericMetrics(r.performance?.apply)}};
}
export function receiptReason(error) {
  const s=String(error?.message || '');
  if(/失效|变化|改变|过期|到期/.test(s))return 'target-changed';
  if(/权限|授权当前来源|具体网申/.test(s))return 'permission';
  if(/忙|正在|先停止/.test(s))return 'busy';
  if(/取消|中断/.test(s))return 'interrupted';
  if(/核对|确认|选择/.test(s))return 'review-required';
  return 'check-input';
}
export class LocalReceipts {
  constructor(storage,clock=Date.now){this.storage=storage;this.clock=clock;this.tail=Promise.resolve();this.epoch=0;this.dropped=0;this.pending=0;}
  queue(fn){const p=this.tail.then(fn);this.tail=p.catch(()=>{this.dropped++;});return p;}
  async rows(){const raw=(await this.storage.get(KEY))[KEY];return (Array.isArray(raw)?raw:[]).slice(-80).map(safe).filter(r=>r&&r.at>this.clock()-86400000&&r.at<=this.clock());}
  add(r){
    if(this.pending>=16){this.dropped++;return;}
    const epoch=this.epoch,projected=safe({...r,at:this.clock()});if(!projected)return;
    this.pending++;
    this.queue(async()=>{
      if(epoch!==this.epoch||(await this.storage.get(FLAG))[FLAG]===false)return;
      const rows=await this.rows();if(epoch!==this.epoch)return;
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
export function exportReceipts(data){
  const records=(data.records||[]).map(safe).filter(Boolean),base=records[0]?.at||0;
  return {schemaVersion:1,containsPersonalValues:false,dropped:int(data.dropped,1e9),records:records.map(({at,...r})=>({...r,offsetMs:at-base}))};
}
