(()=>{
 if(globalThis.__resumeWidget?.version==='0.3.2'&&globalThis.__resumeWidget.runtime===chrome.runtime){globalThis.__resumeWidget.open();return;}
 globalThis.__resumeWidget?.destroy?.();document.getElementById('resume-companion-local')?.remove();
 const host=document.createElement('div');host.id='resume-companion-local';host.style.cssText='all:initial;position:fixed;right:20px;bottom:90px;z-index:2147483646';
 const root=host.attachShadow({mode:'closed'});document.documentElement.append(host);
 root.innerHTML=`<style>:host{all:initial}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:10px 15px;background:#087e70;color:#fff;font-weight:600}button:disabled{background:#c5d7d1;cursor:default}.fab{box-shadow:0 5px 24px #164e4340;padding:14px 20px;font:600 15px 'Microsoft YaHei',sans-serif}.drawer{font:14px/1.6 'Microsoft YaHei',sans-serif;position:fixed;right:16px;top:18px;bottom:18px;width:min(460px,calc(100vw - 32px));background:#f6f9f7;border:1px solid #d7e6df;border-radius:18px;box-shadow:0 10px 60px #17352f33;color:#243e35;display:flex;flex-direction:column;overflow:hidden}.head{padding:20px;background:white;display:flex;justify-content:space-between;align-items:center}.head strong{font-size:18px}.head small{display:block;color:#789187;font-size:11px}.light{background:#eaf2ed;color:#41715d}.body{padding:18px;overflow:auto;flex:1}.actions{display:flex;gap:8px;flex-wrap:wrap}.status{padding:12px 0;color:#537864;white-space:pre-wrap}.list{display:grid;gap:10px}.row{background:white;padding:13px;border:1px solid #e1eae4;border-radius:10px;overflow-wrap:anywhere}.row label{font-weight:600;display:flex;gap:8px;align-items:center}.row small{display:block;color:#8a9b92;margin:5px 0}.value{white-space:pre-wrap;max-height:150px;overflow:auto;font-size:12px;color:#466355}.foot{padding:16px;background:#fff;border-top:1px solid #e1eae4}.foot button{width:100%}.foot p{font-size:11px;color:#83988b;margin:8px 0 0}.help{font-size:12px;color:#7e9286;margin:13px 0}input{accent-color:#087e70} [hidden]{display:none!important}</style><div class="launch"><button class="fab scan-launch">扫描给 Codex</button> <button class="fab">填写简历</button></div><section class="drawer" hidden><div class="head"><div><strong>简历填写助手</strong><small>当前页面 · 本地资料 · 不自动提交</small></div><button class="light close" aria-label="收起">×</button></div><div class="body"><div class="actions"><button class="scan">扫描给 Codex</button><button class="light manage">资料 / 连接设置</button><button class="light stop" disabled>停止填写</button></div><p class="help">扫描会把当前表单及匹配的本地资料提供给 Codex；先展开分区；你也可在对话中授权 Codex 按本次计划填写。</p><div class="status" role="status">点击扫描，读取本页面的实际字段。</div><div class="actions"><button class="light select-all" disabled>全选可填项</button><button class="light select-none" disabled>全部取消选择</button></div><div class="list"></div></div><div class="foot"><button class="fill" disabled>授权并填写所选项目</button><p>只补充勾选的空白项；保存与最终提交由你完成。</p></div></section>`;

 const $ = s => root.querySelector(s);
 const send = async m => {
  const r = await chrome.runtime.sendMessage(m);
  if (!r) throw Error('扩展已更新，请点击工具栏图标重新打开，无需刷新表单');
  if (r.error) throw Error(r.error); return r.data;
 };
 let plan = null, busy = false, shareAuthorized = false, currentPlanId = null;
 const checks = new Map(), statuses = {verified:'回读通过', invalid:'网站校验未通过', stale:'页面已变化', manual:'需要本人操作', 'needs-user':'需要核对', cancelled:'已停止', 'not-attempted':'未尝试', preserve:'已有内容保留'};
 const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
 function selectionChanged() { $('.fill').disabled = busy || !plan || ![...checks.values()].some(x => x.check.checked && !x.check.disabled); }
 function render(p) {
  plan = p; checks.clear(); $('.list').replaceChildren();
  $('.select-all').disabled = $('.select-none').disabled = !p;
  selectionChanged(); if (!p) return;
  $('.status').textContent = `可填写 ${p.entries.filter(e => e.status === 'ready').length} 项 · 保留 ${p.entries.filter(e => e.status === 'preserve').length} 项 · 待处理 ${p.entries.filter(e => ['missing','manual'].includes(e.status)).length} 项`;
  if (p.limitations?.length) $('.status').textContent += '\n' + p.limitations.join('；');
  const fragment = document.createDocumentFragment();
  for (const e of p.entries) {
   const row = document.createElement('div'); row.className = 'row';
   const label = document.createElement('label'), check = document.createElement('input');
   check.type = 'checkbox'; check.checked = e.status === 'ready'; check.disabled = e.status !== 'ready'; check.dataset.field = e.fieldId; check.onchange = selectionChanged;
   label.append(check, document.createTextNode(e.label));
   const source = document.createElement('small'); source.textContent = [e.section, e.reason].filter(Boolean).join(' · ');
   const value = document.createElement('div'); value.className = 'value'; value.textContent = e.status === 'ready' ? e.value : e.status === 'preserve' ? '已填写，保持原样' : '留给你补充';
   row.append(label, source, value); checks.set(e.fieldId, {check, source});
   if (e.kind === 'file') {
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = e.accept || '';
    const upload = document.createElement('button'); upload.textContent = '授权上传所选文件'; upload.disabled = true;
    picker.onchange = () => upload.disabled = !picker.files.length;
    upload.onclick = async event => {
     if (!event.isTrusted || !picker.files[0] || busy) return;
     const file = picker.files[0]; if (file.size > 10 * 1024 * 1024) { value.textContent = '文件大于10MB'; return; }
     busy = true; upload.disabled = true;
     try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let data = '';
      for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await send({type:'resume-upload', snapshotId:p.snapshotId, fieldId:e.fieldId, file:{name:file.name,type:file.type,lastModified:file.lastModified,base64:btoa(data)}});
      value.textContent = result.message;
     } catch (error) { value.textContent = error.message; } finally { busy = false; }
    };
    row.append(picker, upload);
   }
   fragment.append(row);
  }
  $('.list').append(fragment); selectionChanged();
 }
 function reportResult(report) {
  const success = report.results.filter(r => r.status === 'verified').length;
  $('.status').textContent = `回读通过 ${success} 项 · 需核对 ${report.results.length - success} 项。未提交。`;
  if (Number.isFinite(report.performance?.durationMs)) $('.status').textContent += `\n网页执行及回读 ${(report.performance.durationMs / 1000).toFixed(2)} 秒（不含模型思考）。`;
  if (report.warning) $('.status').textContent += '\n' + report.warning;
  for (const r of report.results) {
   const refs = checks.get(r.fieldId); if (!refs) continue;
   refs.check.disabled = true; refs.source.textContent = (statuses[r.status] || '需核对') + (r.reason ? '：' + r.reason : '');
  }
  plan = null; selectionChanged();
 }
 async function scan(commandId) {
  if (busy) return;
  busy = true; $('.scan').disabled = true; render(null); $('.status').textContent = '正在扫描并匹配；不会填写或提交…';
  try { render(await send({type:'resume-scan', commandId, shareWithCodex:shareAuthorized})); }
  catch (error) { $('.status').textContent = error.message; }
  finally { busy = false; $('.scan').disabled = false; selectionChanged(); }
 }
 async function fill(planId, fieldIds) {
  if (busy) return;
  busy = true; currentPlanId = planId; $('.stop').disabled = false; $('.scan').disabled = true; selectionChanged();
  try { reportResult(await send({type:'resume-fill', planId, fieldIds})); }
  catch (error) { $('.status').textContent = error.message + '\n未自动重试。请核对网页现值，再重新扫描。'; plan = null; }
  finally { busy = false; currentPlanId = null; $('.stop').disabled = true; $('.scan').disabled = false; selectionChanged(); }
 }
 const loop = globalThis.__resumePollLoop({
  poll: async isActive => { while (busy && isActive()) await wait(50); if (!isActive()) return {commands:[]}; return send({type:'resume-poll'}); },
  wait: after => send({type:'resume-events', after}),
  stopWait: () => { send({type:'resume-stop-poll'}).catch(() => {}); },
  onError: (error, retryMs) => { $('.status').textContent = `${error.message}\n${Math.ceil(retryMs / 1000)}秒后仅重连通知；不会重试填写。`; },
  handle: async response => {
   if (response.selected === false && !busy) { plan = null; selectionChanged(); $('.status').textContent = '当前共享目标在另一个标签页；扫描本页可切换。'; }
   for (const command of response.commands || []) {
    while (busy) await wait(50);
    if (!loop.running) break;
    if (command.type === 'scan') await scan(command.id);
    if (command.type === 'review') render(await send({type:'resume-plan'}));
    if (command.type === 'fill') await fill(command.planId, command.fieldIds);
   }
  }
 });
 function open() { $('.drawer').hidden = false; $('.launch').hidden = true; loop.start(); }
 root.querySelectorAll('.fab')[1].onclick = e => { if (e.isTrusted) open(); };
 $('.scan-launch').onclick = e => { if (e.isTrusted) { shareAuthorized = true; open(); scan(); } };
 $('.close').onclick = () => { $('.drawer').hidden = true; $('.launch').hidden = false; loop.stop(); };
 $('.scan').onclick = e => { if (e.isTrusted) { shareAuthorized = true; scan(); } };
 $('.manage').onclick = async e => { if (e.isTrusted) try { await send({type:'resume-manage'}); } catch (error) { $('.status').textContent = error.message; } };
 $('.select-all').onclick = e => { if (!e.isTrusted || busy) return; for (const {check} of checks.values()) if (!check.disabled) check.checked = true; selectionChanged(); };
 $('.select-none').onclick = e => { if (!e.isTrusted || busy) return; for (const {check} of checks.values()) if (!check.disabled) check.checked = false; selectionChanged(); };
 $('.fill').onclick = e => { if (e.isTrusted && plan && !busy) fill(plan.id, [...checks].filter(([,x]) => x.check.checked && !x.check.disabled).map(([id]) => id)); };
 $('.stop').onclick = async e => {
  if (!e.isTrusted || !currentPlanId) return;
  $('.stop').disabled = true; $('.status').textContent = '正在停止；已写入内容不会撤销，等待回读…';
  try { await send({type:'resume-cancel', planId:currentPlanId}); } catch (error) { $('.status').textContent = error.message + '；请核对页面。'; }
 };
 // Switching to Codex must not disconnect an explicitly open application drawer.
 const leaving = () => loop.stop();
 window.addEventListener('pagehide', leaving);
 globalThis.__resumeWidget = {version:'0.3.2', runtime:chrome.runtime, open, destroy(){ loop.stop(); window.removeEventListener('pagehide', leaving); host.remove(); }};
})();
