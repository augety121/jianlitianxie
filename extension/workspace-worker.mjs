import {VaultSession} from './core/vault-session.mjs';
import {FrameBroker} from './core/frame-broker.mjs';
import {WorkspaceRun} from './core/workspace-run.mjs';
import {trustedWorkspace, secureTarget} from './core/workspace-policy.mjs';
/** No web-page sender can call these routes, even if it guesses the message names. */
export function createWorkspace(chrome, {api, inject, pair, legacyBusy}) {
  const storageReady = Promise.all([chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}), chrome.storage.session.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'})]);
  const vault = new VaultSession(chrome.storage.local), broker = new FrameBroker(chrome), run = new WorkspaceRun(vault, broker);
  let sharedTab = null, sharedUntil = 0, grantId = null, epoch = 0, pendingShare = null;
  const restored = chrome.storage.session.get('resumeMcpGrant').then(s=>{const g=s.resumeMcpGrant;if(g){sharedTab=g.tabId;sharedUntil=g.expiresAt;grantId=g.id;}});
  const remember = () => chrome.storage.session.set({resumeMcpGrant:sharedTab===null?null:{tabId:sharedTab,expiresAt:sharedUntil,id:grantId}});
  const mode = async () => (await chrome.storage.local.get('resumeMode')).resumeMode || 'local';
  const owner = sender => { if(sender.documentId)return sender.documentId;if(Number.isSafeInteger(sender.tab?.id))return `workspace:${sender.tab.id}`;throw Error('无法确认工作台文档，请从工具栏重新打开'); };
  async function revoke() {
    epoch++; await restored;
    if (pendingShare) await pendingShare.catch(()=>{});
    if (sharedTab !== null) {
      const tabId=sharedTab, id=grantId;
      // A positive receipt is required. Connection failure is not reported as successful revocation.
      await api('/session/end?owner='+tabId,{grantId:id});
      await chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.__resumeFillEngine?.cancel()}).catch(()=>{});
      sharedTab=null; sharedUntil=0; grantId=null; await remember();
    }
  }
  async function useLocal() {
    if (legacyBusy()) throw Error('旧 MCP 正在填写，请先停止并等待回读');
    await revoke(); await chrome.storage.local.set({resumeMode: 'local'});
  }
  async function open(tab) {
    await storageReady;
    // Opening a workbench does not scan, read the old disk profile or call an AI service.
    await chrome.storage.session.set({['workspace-target-' + tab.id]: new URL(tab.url).origin});
    await chrome.tabs.create({url: chrome.runtime.getURL('workspace.html') + '?tab=' + tab.id});
  }
  async function attached(tabId) {
    const tab = await broker.tab(tabId);
    const key = 'workspace-target-' + tabId, grant = (await chrome.storage.session.get(key))[key];
    if (grant !== new URL(tab.url).origin) throw Error('请在这个申请页面再次点击工具栏图标，以授权当前来源');
    return tab;
  }
  async function request(m, sender) {
    await storageReady; await restored;
    const isMain = trustedWorkspace(sender, chrome.runtime);
    if (!isMain && !(m.type === 'workspace-legacy' && trustedWorkspace(sender, chrome.runtime, 'panel.html'))) throw Error('只有扩展工作台可以操作资料库');
    if (m.type === 'workspace-status') {
      const s = await vault.status();
      if (!s.unlocked && run.job) await run.stop();
      if (sharedTab !== null && Date.now() >= sharedUntil) {sharedTab=null;sharedUntil=0;grantId=null;await remember();}
      return {...s, mode: await mode(), sharedUntil, busy: run.busy};
    }
    if (m.type === 'workspace-pair') {
      if (pendingShare || sharedTab !== null || run.busy || legacyBusy()) throw Error('请先撤销授权并停止当前任务，再更改配对');
      if (typeof pair !== 'function') throw Error('配对功能未初始化，请重新加载扩展');
      return pair(m.token);
    }
    if (m.type === 'workspace-stop') return run.stop();
    if (m.type === 'workspace-lock') { vault.lock(); await run.stop(); await revoke(); return {locked: true}; }
    if (m.type === 'workspace-revoke') { await revoke(); return {revoked: true}; }
    if (m.type === 'workspace-local') { await useLocal(); return {mode: 'local'}; }
    if (m.type === 'workspace-legacy') {
      if (run.busy || legacyBusy()) throw Error('请先停止并等待当前填写结束');
      if(isMain) await attached(m.tabId);
      await revoke(); await run.stop(); vault.lock();
      await chrome.storage.local.set({resumeMode: 'mcp'});
      if((await chrome.storage.local.get('bridgeToken')).bridgeToken)await api('/legacy-mode',{}).catch(()=>{});
      if (isMain) {
        await attached(m.tabId); await inject(m.tabId);
        await chrome.tabs.create({url: chrome.runtime.getURL('panel.html') + '?tab=' + m.tabId});
      }
      return {mode: 'mcp'};
    }
    if (m.type === 'workspace-share') {
      if (pendingShare || run.busy || legacyBusy()) throw Error('另一项任务尚未结束');
      await attached(m.tabId); const started=epoch;
      const data=await run.forMCP(owner(sender),m);
      if(started!==epoch || !vault.unlocked) throw Error('分享已取消');
      if(data.snapshot.owner!==String(m.tabId)) throw Error('不属于当前目标标签页');
      sharedTab=m.tabId; sharedUntil=Date.now()+300000; grantId=crypto.randomUUID();
      await remember();
      if(started!==epoch || !vault.unlocked) throw Error('分享已取消，未发送资料');
      pendingShare=api('/session',{...data,grantId});
      let grant;
      try { grant=await pendingShare; }
      catch (error) {
        // The server may have accepted a request whose response was lost. Revoke the nonce.
        await api('/session/end?owner='+sharedTab,{grantId}).then(async()=>{sharedTab=null;sharedUntil=0;grantId=null;await remember();}).catch(()=>{});
        throw Error('未确认分享完成；请撤销授权或等待5分钟到期，勿重复发送');
      } finally { pendingShare=null; }
      if(started!==epoch || !vault.unlocked) { await revoke(); throw Error('分享已取消，本次授权已撤销'); }
      sharedUntil=grant.expiresAt; await remember();
      if(started!==epoch || !vault.unlocked) { await revoke(); throw Error('分享已取消，本次授权已撤销'); }
      run.job=null; run.epoch++; vault.lock();
      await chrome.storage.local.set({resumeMode:'mcp'});
      await inject(m.tabId);
      await chrome.scripting.executeScript({target:{tabId:m.tabId},func:()=>globalThis.__resumeWidget?.open()});
      return {expiresAt:sharedUntil,count:data.facts.length};
    }
    if (await mode() !== 'local') throw Error('当前是 MCP 模式，请先切换本地模式');
    if (m.type === 'workspace-scan') { await attached(m.tabId); return run.scan(owner(sender), m); }
    if (m.type === 'workspace-remap') return run.remap(owner(sender), m);
    if (m.type === 'workspace-locate') return run.locate(owner(sender), m);
    if (m.type === 'workspace-fill') return run.apply(owner(sender), m);
    if (run.busy) throw Error('正在扫描或填写，资料不能同时修改');
    if (m.type === 'workspace-create') return vault.create(m.password);
    if (m.type === 'workspace-unlock') return vault.unlock(m.password);
    if (m.type === 'workspace-read') return vault.read();
    if (m.type === 'workspace-save') { await run.stop(); return vault.save(m.facts, m.revision); }
    if (m.type === 'workspace-backup') return vault.backup();
    if (m.type === 'workspace-restore') { await run.stop(); return vault.restore(m.envelope, m.password, m.replace === true); }
    if (m.type === 'workspace-password') { await run.stop(); return vault.changePassword(m.password); }
    throw Error('未知工作台操作');
  }
  async function navigated(tabId) {
    await restored;
    if (run.job?.tabId === tabId || run.running?.tabId === tabId) await run.stop();
    if (sharedTab === tabId) await revoke();
  }
  return {request, open, navigated, allowsLegacy: async () => (await mode()) === 'mcp'};
}
