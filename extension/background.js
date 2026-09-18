import {createWorkspace} from './workspace-worker.mjs';
/* Only the user-selected tab may drive the authenticated local bridge. */
chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
chrome.storage.session.get('bridgeToken').then(async s => {
  if (s.bridgeToken && !(await chrome.storage.local.get('bridgeToken')).bridgeToken) await chrome.storage.local.set({bridgeToken: s.bridgeToken});
});
const API = 'http://127.0.0.1:19327', waits = new Map(), runs = new Map();
async function api(route, data, {signal, timeout = 10000} = {}) {
  const {bridgeToken} = await chrome.storage.local.get('bridgeToken');
  if (!bridgeToken) throw Error('请先打开资料管理面板完成配对');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeout);
  try {
    const r = await fetch(API + route, {method: data === undefined ? 'GET' : 'POST', headers: {Authorization: 'Bearer ' + bridgeToken, 'Content-Type': 'application/json'}, body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal});
    const p = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(p.error || (r.status === 401 ? '配对码错误，请重新配对' : '连接失败 ' + r.status));
    return p;
  } catch (e) {
    if (signal?.aborted) throw Error('通知等待已停止');
    if (e.name === 'AbortError' || e instanceof TypeError) throw Error('本机服务未连接或响应超时，请重连 resume_fill MCP');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function inject(tabId) { await chrome.scripting.executeScript({target: {tabId}, files: ['poll-loop.js', 'engine.js', 'widget.js']}); }
async function engine(tabId, action, arg) {
  const r = await chrome.scripting.executeScript({target: {tabId}, func: (a, b) => globalThis.__resumeFillEngine[a](b), args: [action, arg ?? null]});
  if (!r?.length || r[0].result === undefined) throw Error('网页未返回执行结果，请核对已填写内容，不要自动重试');
  return r[0].result;
}
const workspace = createWorkspace(chrome, {api, inject, legacyBusy: () => runs.size > 0});
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return;
  try { await workspace.open(tab); }
  catch (e) { console.warn('Unable to attach resume assistant:', e.message); }
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.status === 'loading') { waits.get(id)?.abort(); waits.delete(id); workspace.navigated(id).catch(()=>{}); }
  if (change.status !== 'complete' || !tab.url) return;
  chrome.storage.session.get('attach-' + id).then(s => {
    if (s['attach-' + id] === new URL(tab.url).origin) return workspace.allowsLegacy().then(allowed=>allowed&&inject(id));
  }).catch(() => {});
});
chrome.tabs.onRemoved?.addListener(id => { waits.get(id)?.abort(); waits.delete(id); runs.delete(id); workspace.navigated(id).catch(()=>{}); });
// Upgrade only already-authorized registrations; do not request new host access.
chrome.runtime.onInstalled?.addListener(async () => {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    for (const script of scripts) if (script.id.startsWith('resume-') && script.js?.includes('widget.js')) {
      await chrome.scripting.updateContentScripts([{id: script.id, js: ['poll-loop.js', 'engine.js', 'widget.js']}]);
    }
  } catch { console.warn('请从目标网页点击工具栏图标重新打开助手'); }
});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (typeof m?.type === 'string' && m.type.startsWith('workspace-')) {
    workspace.request(m, sender).then(data=>reply({data})).catch(e=>reply({error:e.message})); return true;
  }
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0 || !/^https?:/.test(sender.url || '')) return;
  const tabId = sender.tab.id, owned = route => route + '?owner=' + tabId;
  (async () => {
    if (!await workspace.allowsLegacy()) throw Error('当前为本地模式，请从工具栏工作台主动切换 MCP；未共享资料');
    if (m.type === 'resume-manage') { await chrome.tabs.create({url: chrome.runtime.getURL('panel.html') + '?tab=' + tabId}); return {ok: true}; }
    if (m.type === 'resume-scan') {
      const snapshot = await engine(tabId, 'scan');
      const response = await api('/snapshot', {snapshot: {...snapshot, owner: String(tabId), shareWithCodex: !!m.shareWithCodex}, commandId: m.commandId, prepare: true});
      return response.plan;
    }
    if (m.type === 'resume-upload') {
      if (!m.file || m.file.base64?.length > 14000000) throw Error('附件过大（最多10MB）');
      return engine(tabId, 'upload', {...m, url: sender.url});
    }
    if (m.type === 'resume-poll') return api(owned('/poll'));
    if (m.type === 'resume-events') {
      if (!Number.isSafeInteger(m.after) || m.after < 0) throw Error('通知版本无效');
      waits.get(tabId)?.abort(); const controller = new AbortController(); waits.set(tabId, controller);
      try { return await api(owned('/events') + '&after=' + m.after + '&wait=20000', undefined, {signal: controller.signal, timeout: 23000}); }
      finally { if (waits.get(tabId) === controller) waits.delete(tabId); }
    }
    if (m.type === 'resume-stop-poll') { waits.get(tabId)?.abort(); waits.delete(tabId); return {ok: true}; }
    if (m.type === 'resume-plan') return api(owned('/plan'));
    if (m.type === 'resume-result') return api(owned('/result'));
    if (m.type === 'resume-cancel') {
      const run = runs.get(tabId); if (run?.planId === m.planId) run.cancelled = true;
      await engine(tabId, 'cancel');
      return api(owned('/cancel'), {planId: m.planId});
    }
    if (m.type === 'resume-fill') {
      if (!Array.isArray(m.fieldIds) || !m.fieldIds.length) throw Error('请勾选至少一项，不执行空计划');
      if (runs.has(tabId)) throw Error('当前标签页正在填写，请等待回读');
      const run = {planId: m.planId, cancelled: false}; runs.set(tabId, run);
      let begun = false;
      try {
        const {plan} = await api(owned('/begin'), {planId: m.planId, fieldIds: m.fieldIds, url: sender.url}); begun = true;
        if (!plan || plan.url !== sender.url || run.cancelled) throw Error('操作已取消或计划不属于当前页面');
        const report = await engine(tabId, 'apply', plan);
        const receipt = await api(owned('/result'), {...report, planId: plan.id});
        return {...report, ...(receipt.warning ? {warning: receipt.warning} : {})};
      } catch (e) {
        // Awaited engine execution has returned/rejected, so no background write is retried.
        if (begun) await api(owned('/cancel'), {planId: m.planId, executionStopped: true}).catch(() => {});
        throw e;
      } finally { if (runs.get(tabId) === run) runs.delete(tabId); }
    }
    throw Error('不支持的操作');
  })().then(data => reply({data})).catch(e => reply({error: e.message}));
  return true;
});
