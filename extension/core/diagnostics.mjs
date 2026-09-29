/** Opt-in local diagnostics. No caller strings survive unless they are fixed enums.
 * The worker is the sole writer. One write per batch, never one write per field.
 */
export const LOG_KEY = 'resumeDiagnosticsV1';
export const MAX_EVENTS = 600;
export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const CAPTURE_MS = 30 * 60 * 1000;
export const ACTIONS = ['scan','fill','remap','bind','locate','stop','lock','unlock','create','save','restore','password','share','revoke','pair','local','legacy','navigate','import','preset','copy','ui'];
const PHASES = ['start','finish','field','checkpoint'];
const STATES = ['running','ok','error','partial','ready','missing','manual','preserve','verified','invalid','stale','needs-user','cancelled','not-attempted'];
const CHANNELS = ['local','mcp','ui'];
const KINDS = ['text','email','tel','url','number','date','month','textarea','select','multiselect','radio','checkbox','combobox','contenteditable','file','unknown'];
export const CODES = {
  UI_SCRIPT: ['界面脚本异常','重新加载扩展；描述触发步骤。错误原文与调用栈不导出。'],
  UI_REJECTION: ['界面异步操作异常','描述触发步骤；日志不包含拒绝原因原文。'],
  OK: ['完成','本步骤已返回；不代表网站已保存或提交。'],
  MATCH_UNRESOLVED: ['资料未唯一匹配','检查本次选择的资料、分区和经历绑定；不要强行映射无关资料。'],
  CONTROL_MANUAL: ['控件需要人工处理','检查控件类型；提供虚构最小页面以便增加适配。'],
  EXISTING_VALUE: ['保留网页已有值','需要修正时先自行检查或清空，再重新扫描。'],
  INPUT_REJECTED: ['输入未通过校验','核对格式、长度、日期或数字范围；不应虚构缺失事实。'],
  TARGET_CHANGED: ['页面或目标已变化','重新扫描并核对经历；不要重复执行旧计划。'],
  TARGET_BLOCKED: ['目标不可交互','关闭遮挡层、展开对应区块后重新扫描。'],
  EXPIRED: ['授权已过期','重新扫描和授权；已写内容先由本人核对。'],
  CANCELLED: ['已请求停止或取消','核对已写内容；取消不会撤回网站已收到的数据。'],
  PERMISSION: ['缺少权限或文档不可访问','在具体申请页重新点击扩展图标；嵌入文档按提示处理。'],
  LOCKED: ['资料库未解锁','在工作台解锁；旧计划不会恢复。'],
  VAULT_OPEN: ['口令或备份校验未通过','检查口令与备份，不向他人发送口令。'],
  REVISION: ['资料版本已变化','重新读取资料和扫描；不要覆盖另一窗口的新修改。'],
  BRIDGE_AUTH: ['本机桥接配对问题','核对本机版本和配对状态；不要上传配对码。'],
  BRIDGE_UNAVAILABLE: ['本机桥接未连接或超时','只重启对应的 resume_fill，核对网页后再决定是否重试。'],
  BUSY: ['另一项操作尚未结束','等待或停止当前任务，不并发重复填写。'],
  SELECTION: ['选择或审阅尚未完成','检查勾选项、确认状态和本次授权范围。'],
  RECEIPT_INVALID: ['执行结果不完整或无效','核对网页实际值；不能将无回读当成成功。'],
  RECORD_FAILED: ['执行后记录保存失败','不要为补记录重复填表，先核对网页。'],
  INTERNAL: ['未分类错误','日志没有保存错误原文；请描述操作步骤和虚构复现。'],
  PARTIAL: ['仍有待处理项目','查看本次字段结果；不要只看总完成提示。'],
  STORAGE: ['诊断存储不可用','日志可能不完整；填写操作不会因日志失败被自动重试。'],
  INTERRUPTED: ['只看到开始，尚无结束','可能仍在执行、已停止录制或后台中断；不能据此判定失败或重试。']
};
const int = (n,max) => Number.isFinite(n) && n>=0 && n<=max ? Math.round(n) : undefined;
const enumOf = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const traceValid = s => typeof s==='string' && /^d-[a-f0-9]{8}-[a-f0-9-]{27}$/.test(s);
export function errorCode(error) {
  // Classify in memory; neither message nor stack is persisted or returned in export.
  if (error && Object.hasOwn(CODES,error.code)) return error.code;
  const s=String(error?.message||'').slice(0,1200);
  for (const [rx,code] of [
    [/口令错误|备份损坏|校验失败/,'VAULT_OPEN'],[/配对|旧版桥接|不兼容桥接/,'BRIDGE_AUTH'],
    [/本机服务|未连上|超时|Failed to fetch|fetch failed|网络/,'BRIDGE_UNAVAILABLE'],
    [/期限|过期|到期/,'EXPIRED'],[/取消|停止/,'CANCELLED'],[/锁定|解锁|locked/,'LOCKED'],
    [/其他窗口|资料已改变|资料已变化|资料已修改|修订/,'REVISION'],
    [/遮挡|不可交互|不可点击/,'TARGET_BLOCKED'],[/页面.*变化|目标.*变化|记录.*变化|不属于当前页面|扫描已变化/,'TARGET_CHANGED'],
    [/权限|不可访问|Cannot access|主页面|工具栏|来源/,'PERMISSION'],[/正在|尚未结束|并发/,'BUSY'],
    [/回读|执行结果/,'RECEIPT_INVALID'],[/勾选|选择|核对|映射|范围/,'SELECTION'],[/格式|长度|范围|日期|step/,'INPUT_REJECTED']
  ]) if(rx.test(s))return code;
  return 'INTERNAL';
}
export function cleanEvent(raw) {
  if(!raw || !traceValid(raw.trace) || !ACTIONS.includes(raw.action) || !PHASES.includes(raw.phase))return null;
  const at=int(raw.at,9e15);if(at===undefined)return null;
  const e={trace:raw.trace,appVersion:versionString(raw.appVersion),at,action:raw.action,phase:raw.phase,channel:enumOf(raw.channel,CHANNELS,'local'),state:enumOf(raw.state,STATES,'error'),code:Object.hasOwn(CODES,raw.code)?raw.code:'INTERNAL'};
  for(const k of ['durationMs','elapsedMs']){const n=int(raw[k],3600000);if(n!==undefined)e[k]=n;}
  for(const k of ['count','ready','missing','manual','preserve','verified','invalid','stale','cancelled','notAttempted','frames','skippedFrames','omitted','hidden','disabled','readonly','truncated','ordinal','options']){const n=int(raw[k],100000);if(n!==undefined)e[k]=n;}
  if(raw.kind!==undefined)e.kind=enumOf(raw.kind,KINDS,'unknown');
  if(typeof raw.required==='boolean')e.required=raw.required;
  return e;
}
export function versionString(s){return typeof s==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)?s:'0.0.0';}
function cleanStore(raw, now) {
  const events=Array.isArray(raw?.events)?raw.events.slice(-MAX_EVENTS).map(cleanEvent).filter(e=>e&&e.at<=now&&now-e.at<RETENTION_MS):[];
  const until=Number.isFinite(raw?.until)&&raw.until>now&&raw.until<=now+CAPTURE_MS?raw.until:0;
  return {schemaVersion:1,until,dropped:int(raw?.dropped,100000)||0,events};
}
export function exportReport(state, version, selectedTrace='') {
  let events=state.events.map(cleanEvent).filter(Boolean);
  if(selectedTrace)events=events.filter(e=>e.trace===selectedTrace);
  const first=events[0]?.at||0;
  return {schemaVersion:1,appVersion:versionString(version),scope:'local-opt-in-value-free-diagnostics',retentionHours:24,capacity:MAX_EVENTS,dropped:state.dropped||0,
    scopeNotes:['No form values, labels, facts, URLs, tokens, passwords, document IDs, HTML, screenshots or raw errors.','Ordinals are local to a scan/operation, not stable site selectors.','Logs are partial evidence: no finish is not proof of failure. No server-save or submission verification.'],
    events:events.map(e=>{const {at,...safe}=e;return {...safe,offsetMs:Math.max(0,at-first)};})};
}
export class DiagnosticRecorder {
  #storage;#clock;#version;#tail=Promise.resolve();#epoch=0;#ready;#failed=false;
  constructor(storage,clock=Date.now,version='0.0.0'){this.#version=versionString(version);this.#storage=storage;this.#clock=clock;this.#ready=Promise.resolve().then(()=>storage.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}));this.#ready.catch(()=>{});}
  #queue(fn){const next=this.#tail.then(async()=>{await this.#ready;return fn();});this.#tail=next.catch(()=>{});return next;}
  async #read(){return cleanStore((await this.#storage.get(LOG_KEY))[LOG_KEY],this.#clock());}
  async state(){return this.#queue(async()=>{const s=await this.#read();await this.#storage.set({[LOG_KEY]:s});return {...s,enabled:!!s.until,storageFailed:this.#failed};});}
  async configure(enabled){if(typeof enabled!=='boolean')throw Error('请选择开启或停止诊断');this.#epoch++;return this.#queue(async()=>{const s=await this.#read();s.until=enabled?this.#clock()+CAPTURE_MS:0;await this.#storage.set({[LOG_KEY]:s});this.#failed=false;return {...s,enabled};});}
  async clear(){this.#epoch++;return this.#queue(async()=>{const s={schemaVersion:1,until:0,dropped:0,events:[]};await this.#storage.set({[LOG_KEY]:s});this.#failed=false;return {...s,enabled:false};});}
  async start(action,channel='local'){
    if(!ACTIONS.includes(action))return null;
    const epoch=this.#epoch,at=this.#clock();
    try{return await this.#queue(async()=>{const s=await this.#read();if(!s.until||epoch!==this.#epoch)return null;
      const handle={trace:'d-'+crypto.randomUUID(),action,channel,epoch,at};
      const event=cleanEvent({...handle,appVersion:this.#version,phase:'start',state:'running',code:'OK'});
      s.events.push(event);if(s.events.length>MAX_EVENTS){s.dropped+=s.events.length-MAX_EVENTS;s.events=s.events.slice(-MAX_EVENTS);}
      await this.#storage.set({[LOG_KEY]:s});return handle;
    });}catch{this.#failed=true;return null;}
  }
  async finish(handle, summary={}, fields=[]) {
    if(!handle)return;
    try{await this.#queue(async()=>{const s=await this.#read();if(!s.until||handle.epoch!==this.#epoch)return;
      const now=this.#clock(),total=Array.isArray(fields)?fields.length:0;
      // Preserve non-success details first when one very large operation exceeds the budget.
      const entries=Array.isArray(fields)?[...fields.filter(f=>!['verified','ready','preserve'].includes(f.state)),...fields.filter(f=>['verified','ready','preserve'].includes(f.state))].slice(0,400):[];
      const batch=entries.map(f=>cleanEvent({...f,appVersion:this.#version,trace:handle.trace,action:handle.action,channel:handle.channel,at:now,phase:'field'})).filter(Boolean);
      batch.push(cleanEvent({...summary,appVersion:this.#version,trace:handle.trace,action:handle.action,channel:handle.channel,at:now,phase:'finish',durationMs:Math.max(0,now-handle.at),omitted:Math.max(0,total-entries.length)}));
      s.events.push(...batch);s.dropped=Math.min(100000,s.dropped+Math.max(0,total-entries.length)+Math.max(0,s.events.length-MAX_EVENTS));s.events=s.events.slice(-MAX_EVENTS);
      await this.#storage.set({[LOG_KEY]:s});
    });}catch{this.#failed=true;}
  }
}
