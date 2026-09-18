import {parseImport, MAX_PROFILE_BYTES, normalizeFact} from './core/profile.mjs';
import {MAX_BACKUP_BYTES} from './core/vault.mjs';
import {secret, summaryOnly} from './core/workspace-policy.mjs';
const $ = id => document.getElementById(id), tabId = Number(new URLSearchParams(location.search).get('tab'));
let state = {exists:false,unlocked:false,mode:'local'}, profile = {facts:[],revision:0}, chosenFacts = new Set();
let plan = null, chosenFields = new Set(), pendingImport = [], lastReport = null, busy = false, edited = null;
const names = {ready:'可填写',missing:'待映射',manual:'人工处理',preserve:'保留已有'};
const resultNames = {verified:'回读通过',invalid:'网站校验未通过',stale:'页面已变化',manual:'需要人工处理','needs-user':'请检查实际内容',cancelled:'已取消','not-attempted':'尚未尝试',preserve:'保留已有'};
async function send(type, extra = {}) {
  const r = await chrome.runtime.sendMessage({type:'workspace-' + type, ...extra});
  if (!r) throw Error('扩展连接已中断，请重新打开工作台；不要盲目重复填写');
  if (r.error) throw Error(r.error); return r.data;
}
function notify(message, error = false) { $('notice').textContent = message; $('notice').dataset.error = String(error); }
function node(tag, text, className) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; }
function view(name) {
  document.querySelectorAll('[data-section]').forEach(n => n.hidden = n.dataset.section !== name);
  document.querySelectorAll('[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === name));
}
function usable(f) { return f.confirmed === true && !f.conflict && !secret(f.label); }
function controls() {
  const ready = state.unlocked && state.mode === 'local' && !busy;
  document.querySelectorAll('[data-unlocked]').forEach(n => n.disabled = !ready);
  $('fillSelected').disabled = !ready || !plan || !chosenFields.size || !$('reviewed').checked;
  $('stop').disabled = !busy; $('lock').disabled = !state.unlocked && !state.sharedUntil;
  $('selectedCount').textContent = `已选 ${chosenFields.size} 项`;
  $('modeBadge').textContent = state.mode === 'local' ? '本地处理 · 无模型调用' : 'MCP 模式 · 授权共享';
}
function clearPlan() {
  plan = null; chosenFields.clear(); $('entries').replaceChildren(); $('empty').hidden = false;
  $('readyCount').textContent = '—'; $('pendingCount').textContent = '—'; $('coverage').hidden = true;
  $('reviewed').checked = false; $('shareConsent').checked = false; controls();
}
function clearPrivate() {
  profile = {facts:[],revision:0}; chosenFacts.clear(); pendingImport = []; edited = null;
  clearPlan(); $('factList').replaceChildren(); $('importPreview').replaceChildren(); $('saveImport').hidden = true;
  $('importText').value = ''; $('importFile').value = ''; $('factSearch').value=''; $('importEntity').value='';
  $('pairToken').value='';$('pairStatus').textContent='';
  $('restorePassword').value=''; $('newPassword').value=''; $('newPasswordAgain').value='';
  $('factForm').reset(); $('editor').close(); $('factCount').textContent='—'; $('profileSummary').textContent='资料库已锁定';
  $('reveal').checked=false; $('result').textContent=''; $('target').textContent=''; $('coverage').textContent=''; lastReport=null;
}
async function status() {
  const next = await send('status'); state = next;
  if (!state.unlocked) clearPrivate();
  $('gate').hidden = state.unlocked;
  $('gateTitle').textContent = state.exists ? '解锁你的资料库' : '创建只属于你的资料库';
  $('unlock').textContent = state.exists ? '解锁资料库' : '创建加密资料库';
  $('repeatLabel').hidden = $('repeatPassword').hidden = state.exists;
  $('repeatPassword').required = !state.exists;
  $('shareStatus').textContent = state.sharedUntil ? `本次授权将于 ${new Date(state.sharedUntil).toLocaleTimeString()} 到期；可提前撤销。` : '没有本工作台发起的临时授权';
  if(plan&&Date.now()>=plan.expiresAt)clearPlan();
  controls(); return state;
}
function updateProfile(next) {
  profile = next;
  chosenFacts = new Set([...chosenFacts].filter(id => profile.facts.some(f => f.id === id)));
  if (!chosenFacts.size) chosenFacts = new Set(profile.facts.filter(usable).map(f => f.id));
  $('factCount').textContent = profile.facts.filter(usable).length;
  $('profileSummary').textContent = `${profile.facts.length} 条资料 · ${profile.facts.filter(usable).length} 条已核实 · 本次已选 ${chosenFacts.size} 条`;
  renderFacts(); clearPlan();
}
function on(id, fn) {
  $(id).addEventListener('click', async event => {
    if (!event.isTrusted) return;
    try { await fn(event); } catch (e) { notify(e.message, true); }
  });
}
async function discard() { clearPlan(); await send('stop'); }
function renderFacts() {
  const q = $('factSearch').value.trim().toLocaleLowerCase(); $('factList').replaceChildren();
  for (const f of profile.facts.filter(f => [f.label,f.section,f.entity].join(' ').toLocaleLowerCase().includes(q))) {
    const card = node('article', null, 'fact'), label = node('label', null, 'check'), check = document.createElement('input');
    check.type = 'checkbox'; check.checked = chosenFacts.has(f.id); check.disabled = busy || secret(f.label);
    check.addEventListener('change', async () => {
      check.checked ? chosenFacts.add(f.id) : chosenFacts.delete(f.id);
      $('profileSummary').textContent = `${profile.facts.length} 条资料 · 本次已选 ${chosenFacts.size} 条`;
      await discard().catch(e=>notify(e.message,true));
    });
    label.append(check, node('span', f.label));
    const title = [f.section,f.entity].filter(Boolean).join(' / ') || '未分区';
    const edit = node('button','查看 / 编辑','secondary'); edit.disabled=busy; edit.onclick=()=>openEditor(f);
    card.append(label,node('p',title),node('p',usable(f)?'已核实 · 内容默认隐藏':'待核实／冲突 · 不自动填写'),node('small',f.source),document.createElement('br'),edit);
    $('factList').append(card);
  }
}
function openEditor(f) {
  if (!state.unlocked || busy) return;
  edited=f ? structuredClone(f) : null; $('factForm').reset(); $('editorError').textContent='';
  for (const [id,value] of Object.entries({factId:f?.id||'',factLabel:f?.label||'',factSection:f?.section||'基本信息',factEntity:f?.entity||'',factValue:f?.value||'',factSource:f?.source||'本人核对的当前资料',factAliases:(f?.aliases||[]).join('\n'),factOrigin:f?.origin||''})) $(id).value=value;
  $('factConfirmed').checked=f?.confirmed===true&&!f?.conflict; $('deleteFact').hidden=!f; $('editor').showModal();
}
async function saveFacts(facts) {
  const next=await send('save',{facts,revision:profile.revision}); updateProfile(next);
  notify('资料已加密保存。之前的预览已失效，请使用新资料重新扫描。');
}
function showPlan(next) {
  plan=next; chosenFields=new Set(next.entries.filter(e=>e.status==='ready'&&!e.sensitive).map(e=>e.id));
  $('reviewed').checked=false; $('shareConsent').checked=false; $('empty').hidden=true; $('target').textContent=next.origin;
  $('readyCount').textContent=next.entries.filter(e=>e.status==='ready').length;
  $('pendingCount').textContent=next.entries.filter(e=>['manual','missing'].includes(e.status)).length;
  const text=[`已扫描 ${next.frames.length} 个文档、${next.entries.length} 个字段。`];
  if(next.frames.every(f=>f.coverage?.excluded)){
    const omitted={hidden:0,disabled:0,readonly:0,secret:0,truncated:0};
    for(const f of next.frames)for(const k in omitted)omitted[k]+=f.coverage.excluded[k]||0;
    text.push(`未纳入：隐藏 ${omitted.hidden} · 禁用 ${omitted.disabled} · 只读 ${omitted.readonly} · 密码／验证码 ${omitted.secret} · 超上限 ${omitted.truncated}`);
  }else text.push('当前执行器未提供完整隐藏／禁用字段统计；未计算，不代表没有遗漏。');
  const truncated=next.frames.reduce((n,f)=>n+(f.coverage?.planTruncated||0),0);
  if(truncated)text.push(`超过本次计划上限的字段 ${truncated} 项，未纳入填写计划。`);
  if(!next.includeFrames&&next.frames.some(f=>f.coverage?.frames))text.push('页面含嵌入文档，尚未扫描；可启用同源嵌入表单识别。');
  text.push(...next.skipped.map(s=>`文档 ${s.frameId}：${s.reason}`));
  text.push('这些是当前可观察区域的计数，不是整站完整率。');
  $('coverage').textContent=text.join('\n');$('coverage').hidden=false;renderEntries(); controls();
}
function renderEntries() {
  $('entries').replaceChildren(); if(!plan)return;
  const filter=$('filter').value;
  for(const e of plan.entries.filter(e=>filter==='all'||filter==='required'&&e.required&&e.status!=='preserve'||filter==='missing'&&['missing','manual'].includes(e.status)||e.status===filter)) {
    const card=node('article',null,'field-card'),top=node('div',null,'field-top'),label=node('label',null,'check'),check=document.createElement('input');
    check.type='checkbox';check.checked=chosenFields.has(e.id);check.disabled=e.status!=='ready'||busy;
    check.onchange=()=>{check.checked?chosenFields.add(e.id):chosenFields.delete(e.id);$('reviewed').checked=false;controls();};
    label.append(check,node('span',e.label+(e.required?' *':'')));
    const badge=node('span',names[e.status]||e.status,'state');badge.dataset.status=e.status;top.append(label,badge);
    const meta=node('p',[e.frameId?'嵌入文档 '+e.frameId:'主文档',e.section,e.sensitive?'敏感项：需单独勾选':''].filter(Boolean).join(' · '),'field-meta');
    const content=e.status==='ready'?($('reveal').checked?(Array.isArray(e.value)?e.value.join('、'):String(e.value)):'••••••  内容已隐藏，可在上方勾选显示'):e.status==='preserve'?'网页已有内容，保持原样':e.reason;
    const value=node('div',content,'field-value'),actions=node('div',null,'field-actions');
    const locate=node('button','定位到网页','secondary');locate.disabled=busy;locate.onclick=async()=>{try{await send('locate',{planId:plan.id,id:e.id});notify('已在目标网页高亮这个字段；没有点击或更改内容。');}catch(error){notify(error.message,true);}};
    if(plan.capabilities?.locate!==false)actions.append(locate);
    if(e.frameId===0&&e.status!=='preserve'&&e.kind!=='file'){
      const select=document.createElement('select');select.setAttribute('aria-label',e.label+' 资料映射');select.disabled=busy;
      const defaultOption=node('option','自动匹配 / 选择准确来源');defaultOption.value='';select.append(defaultOption);
      for(const f of profile.facts.filter(f=>chosenFacts.has(f.id)&&usable(f))){const o=node('option',[f.section,f.entity,f.label].filter(Boolean).join(' / ')+($('reveal').checked?' · '+f.value.slice(0,35):''));o.value=f.id;o.selected=e.factId===f.id;select.append(o);}
      select.onchange=async()=>{try{showPlan(await send('remap',{planId:plan.id,id:e.id,factId:select.value}));notify('映射已更新，请重新核对本次选择。');}catch(error){notify(error.message,true);}};actions.append(select);
    }
    card.append(top,meta,value,actions);$('entries').append(card);
  }
}
async function download(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>view(button.dataset.view));
$('factSearch').oninput=renderFacts;$('filter').onchange=renderEntries;$('reveal').onchange=renderEntries;$('reviewed').onchange=controls;
on('add',()=>openEditor());on('closeEditor',()=>{$('editor').close();$('factForm').reset();edited=null;});
$('factForm').onsubmit=async event=>{
  event.preventDefault();if(!event.isTrusted||busy)return;
  try{
    const fact=normalizeFact({...edited,id:$('factId').value||crypto.randomUUID(),label:$('factLabel').value,section:$('factSection').value,entity:$('factEntity').value,value:$('factValue').value,source:$('factSource').value,aliases:$('factAliases').value.split(/\r?\n/).filter(s=>s.trim()),origin:$('factOrigin').value,confirmed:$('factConfirmed').checked,conflict:false});
    if(secret(fact.label))throw Error('不要在简历资料库保存密码、验证码或密钥');
    await saveFacts([...profile.facts.filter(f=>f.id!==fact.id),fact]);$('editor').close();$('factForm').reset();edited=null;
  }catch(e){$('editorError').textContent=e.message;}
};
on('deleteFact',async()=>{if(edited&&confirm('删除这条资料？其他资料不会改变。')){await saveFacts(profile.facts.filter(f=>f.id!==edited.id));$('editor').close();$('factForm').reset();edited=null;}});
$('unlockForm').onsubmit=async event=>{
  event.preventDefault();if(!event.isTrusted||busy)return;
  const password=$('password').value,again=$('repeatPassword').value;$('password').value=$('repeatPassword').value='';
  try{if(!state.exists&&password!==again)throw Error('两次口令不一致');busy=true;controls();const p=await send(state.exists?'unlock':'create',{password});await status();updateProfile(p);notify('资料库已解锁。本地模式不调用模型、不上传资料。');}
  catch(e){notify(e.message,true);}finally{busy=false;controls();}
};
on('localMode',async()=>{await send('local');await status();notify('已切换本地模式；上传、匹配和填写无需 Codex。');});
on('lock',async()=>{state.unlocked=false;clearPrivate();await send('lock');await status();notify('资料库已锁定，本工作台发起的临时授权已撤销。');});
on('allFacts',async()=>{chosenFacts=new Set(profile.facts.filter(usable).map(f=>f.id));await discard();renderFacts();});
on('noFacts',async()=>{chosenFacts.clear();await discard();renderFacts();});
on('confirmFacts',async()=>{
  if(!chosenFacts.size)throw Error('请先勾选已经逐条核对的资料');
  if(!confirm(`确认已核对所选 ${chosenFacts.size} 条内容与来源？没有核对的请取消选择。`))return;
  await saveFacts(profile.facts.map(f=>chosenFacts.has(f.id)&&!secret(f.label)?{...f,confirmed:true,conflict:false}:f));
});
$('importFile').onchange=async()=>{try{const f=$('importFile').files[0];if(!f)return;if(f.size>MAX_PROFILE_BYTES||!/\.(txt|json)$/i.test(f.name))throw Error('仅支持不超过2MB的 TXT / JSON');$('importText').value=await f.text();notify('文件仅在本地读取，请解析并检查。');}catch(e){notify(e.message,true);}};
on('parse',()=>{pendingImport=parseImport($('importText').value,{section:$('importSection').value,entity:$('importEntity').value});if(pendingImport.some(f=>secret(f.label)))throw Error('请移除密码、验证码或密钥条目');$('importPreview').textContent=pendingImport.map(f=>`${f.section} / ${f.entity||'无经历标识'} / ${f.label}：${f.value}`).join('\n');$('saveImport').hidden=false;notify(`解析了 ${pendingImport.length} 条待核实资料；尚未保存。`);});
on('saveImport',async()=>{if(!pendingImport.length)return;const ids=pendingImport.map(f=>f.id);await saveFacts([...profile.facts,...pendingImport]);chosenFacts=new Set(ids);pendingImport=[];$('importText').value='';$('importPreview').replaceChildren();$('saveImport').hidden=true;renderFacts();notify('导入内容已加密保存，仍为待核实状态；逐条核对后确认。');});
on('enableFrames',async()=>{const granted=await chrome.permissions.request({permissions:['webNavigation']});$('includeFrames').checked=granted;notify(granted?'已授权文档枚举；只扫描本次标签页的同源文档，不请求所有网站内容权限。':'没有授权；仍可扫描主文档。');});
on('scan',async()=>{
  if(busy)return;const ids=[...chosenFacts];if(!ids.length)throw Error('先到“我的资料”勾选已核实资料');
  if(profile.facts.some(f=>ids.includes(f.id)&&!usable(f)))throw Error('所选资料中还有待核实或冲突条目，请先核对');
  clearPlan();$('result').textContent='';lastReport=null;busy=true;controls();notify('正在扫描当前页面，并在本机匹配所选资料…');
  try{showPlan(await send('scan',{tabId,factIds:ids,includeFrames:$('includeFrames').checked}));notify('扫描完成。请核对字段位置、来源以及未扫描区域。');}
  finally{busy=false;renderEntries();controls();}
});
on('selectSafe',()=>{if(plan){chosenFields=new Set(plan.entries.filter(e=>e.status==='ready'&&!e.sensitive).map(e=>e.id));$('reviewed').checked=false;renderEntries();controls();}});
on('selectNone',()=>{chosenFields.clear();$('reviewed').checked=false;renderEntries();controls();});
on('fillSelected',async()=>{
  if(!plan||busy)return;const labels=new Map(plan.entries.map(e=>[e.id,e.label]));const request={planId:plan.id,ids:[...chosenFields],reviewed:$('reviewed').checked};
  busy=true;controls();renderEntries();notify('正在填写勾选项。停止不会撤销已经填写到网页的内容。');
  try{
    const report=await send('fill',request);lastReport=report;
    const ok=report.results.filter(r=>r.status==='verified').length;
    $('result').textContent=`回读通过 ${ok} 项 · 其他 ${report.results.length-ok} 项 · 未提交\n`+report.results.map(r=>`${labels.get(r.id)||'字段'}：${resultNames[r.status]||'需要核对'}`).join('\n');
    notify('本次执行已结束。请核对逐项结果和网页内容，随后由你保存或提交。');
  }finally{busy=false;clearPlan();}
});
on('stop',async()=>{const r=await send('stop');notify(r.state==='stopping'?'已请求停止，正在等待实际回读；请勿重复执行。':'已停止，旧预览失效。');if(!busy)clearPlan();});
on('diagnostic',()=>download(summaryOnly(lastReport),'resume-diagnostic-counts.json'));
on('backup',async()=>download(await send('backup'),'resume-encrypted-backup.json'));
on('restore',async()=>{
  const f=$('restoreFile').files[0],password=$('restorePassword').value;$('restorePassword').value='';
  if(!f||f.size>MAX_BACKUP_BYTES)throw Error('请选择不超过3MB的加密备份');
  if(state.exists&&!$('replace').checked)throw Error('请先确认备份和替换范围');
  const p=await send('restore',{envelope:JSON.parse(await f.text()),password,replace:$('replace').checked});await status();updateProfile(p);$('restoreFile').value='';notify('备份已校验并恢复到本机。');
});
on('changePassword',async()=>{const password=$('newPassword').value,again=$('newPasswordAgain').value;$('newPassword').value=$('newPasswordAgain').value='';if(password!==again)throw Error('两次口令不一致');await send('password',{password});clearPlan();notify('口令已更换；之前导出的旧备份仍需原口令。');});
on('share',async()=>{
  if(busy)return;
  if(!plan)throw Error('先在本地扫描主页面，并选择本次资料');
  if(!$('shareConsent').checked)throw Error('请先阅读并勾选本次 Codex 分享授权');
  busy=true;controls();
  try{const r=await send('share',{tabId,planId:plan.id,factIds:[...chosenFacts],consent:true});await status();notify(`已将 ${r.count} 条所选资料临时分享给 MCP，5分钟有效、不写入旧主档。现在可以让 Codex 读取 form_context。`);}
  finally{busy=false;controls();}
});
on('pairBridge',async()=>{
  const token=$('pairToken').value.trim();$('pairToken').value='';
  const r=await send('pair',{token});$('pairStatus').textContent=`已配对本机桥接 ${r.version}。尚未共享资料。`;notify('本机配对已验证；回到填写工作台扫描后，再单独授权所选资料。');
});
on('revoke',async()=>{await send('revoke');await status();notify('已撤销后续读取授权；已经进入 Codex 上下文或网站的数据不能因此收回。');});
on('legacy',async()=>{if(!confirm('原 MCP 模式使用旧本机明文主档，与新加密库分开；扫描授权后相关资料会进入 Codex。继续？'))return;await send('legacy',{tabId});await status();notify('已打开原 MCP 模式，新资料库已锁定。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){$('reveal').checked=false;renderEntries();}});
window.addEventListener('pagehide',()=>{send('lock').catch(()=>{});});
await status().then(()=>notify('工作台就绪。先解锁或创建资料库；原 MCP 模式可从右侧主动打开。')).catch(e=>notify(e.message,true));
setInterval(()=>status().catch(()=>{state.unlocked=false;clearPrivate();notify('后台连接已中断，请重新打开工作台。',true);}),20000);
