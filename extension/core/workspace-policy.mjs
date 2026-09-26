/** Shared guardrails; these helpers never authorise actions based on page text. */
export const PLAN_TTL = 5 * 60 * 1000;
export const MAX_FRAMES = 20;
export function secureTarget(value) {
  const u = new URL(value);
  if (u.username || u.password || !(u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) {
    throw Error('为保护资料，仅在 HTTPS 页面或本机演示页填写；不向明文 HTTP 网站发送信息');
  }
  return u;
}
export function trustedWorkspace(sender, runtime, page = 'workspace.html') {
  try {
    const u = new URL(sender.url), expected = new URL(runtime.getURL(page));
    // URL.origin is "null" for some extension URL parsers: compare protocol + host explicitly.
    return sender.id === runtime.id && (sender.frameId === undefined || sender.frameId === 0) &&
      u.protocol === expected.protocol && u.host === expected.host && u.pathname === expected.pathname &&
      (!sender.documentLifecycle || sender.documentLifecycle === 'active');
  } catch { return false; }
}
export const sensitive = label => /身份证|证件|护照|出生|生日|家庭|亲属|住址|地址|健康|残疾|民族|政治|婚姻|性别|宗教|银行卡|薪资|工资|salary|passport|birth|gender|ssn|address/i.test(label);
export const secret = label => /密码|验证码|口令|密钥|password|captcha|one.?time.?code|api.?key|token/i.test(label);
export function selectedFacts(profile, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) throw Error('请选择非重复的资料条目');
  const lookup = new Map(profile.facts.map(f => [f.id, f]));
  return ids.map(id => {
    const f = lookup.get(id);
    if (!f || f.confirmed !== true || f.conflict || secret(f.label)) throw Error('所选资料缺失、待核实、存在冲突或属于密码类信息');
    return structuredClone(f);
  });
}
export function redactSnapshot(snapshot) {
  // Allowlist: arbitrary page metadata or future scanner properties cannot leak silently.
  const fieldKeys=['id','label','section','type','required','maxLength','action','accept','multiple','datePrecision','rowIndex','currentRows'];
  const empty=v=>v==null||v===''||v===false||Array.isArray(v)&&!v.length;
  const fields=snapshot.fields.filter(f=>!secret(f.label)&&f.type!=='password').map(f=>{
    const result=Object.fromEntries(fieldKeys.filter(k=>f[k]!==undefined).map(k=>[k,f[k]]));
    // Empty arrays must remain arrays: the executor compares oldValue before writing.
    result.value=empty(f.value)?structuredClone(f.value??''):'（已有内容，未共享）';
    result.anchors=[];
    if(Array.isArray(f.options))result.options=f.options.map(o=>({label:o.label,value:o.value,disabled:!!o.disabled}));
    return result;
  });
  const coverage={};
  for(const k of ['fields','unlabeled','attachments','customControls','frames','collapsed','planTruncated']){
    const n=snapshot.coverage?.[k];if(Number.isSafeInteger(n)&&n>=0&&n<=100000)coverage[k]=n;
  }
  return {id:snapshot.id,url:snapshot.url,owner:snapshot.owner,engineVersion:snapshot.engineVersion,shareWithCodex:true,fields,coverage};
}
export function summaryOnly(report) {
  const known = new Set(['verified','invalid','stale','manual','needs-user','cancelled','not-attempted','preserve']);
  const counts = {};
  for (const r of report?.results || []) if (known.has(r.status)) counts[r.status] = (counts[r.status] || 0) + 1;
  return {schemaVersion: 1, counts, submitted: false};
}
