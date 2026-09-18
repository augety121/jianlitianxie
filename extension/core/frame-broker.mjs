import {secureTarget, MAX_FRAMES} from './workspace-policy.mjs';
/** Chrome document IDs, not CSS selectors or frame array positions, identify destinations. */
export class FrameBroker {
  constructor(chrome) { this.chrome = chrome; }
  async tab(tabId) {
    if (!Number.isSafeInteger(tabId) || tabId < 1) throw Error('请从具体网申页面点击扩展图标');
    const tab = await this.chrome.tabs.get(tabId); secureTarget(tab.url); return tab;
  }
  async invoke(tabId, frame, action, argument) {
    if (!['scan','apply','cancel','locate'].includes(action)) throw Error('不支持的控件操作');
    const target = frame.documentId ? {tabId, documentIds: [frame.documentId]} : {tabId, frameIds: [frame.frameId]};
    const results = await this.chrome.scripting.executeScript({target, func: async (a, arg) => {
      if(a==='cancel')return globalThis.__resumeFillEngine?.cancel();
      // A hidden same-origin ancestor must not receive personal information.
      let w = window;
      try {
        while (w !== w.top) {
          const node = w.frameElement;
          if(node&&['locate','apply'].includes(a))node.scrollIntoView({block:'center',behavior:'instant'});
          if (!node || !node.isConnected || !node.getClientRects().length || node.closest('[hidden],[inert]') ||
            w.parent.getComputedStyle(node).visibility !== 'visible') return {unavailable: true};
          for(let n=node;n;n=n.parentElement||n.getRootNode?.().host) {
            if(n.matches?.('[hidden],[inert],[aria-hidden=true]') || w.parent.getComputedStyle(n).opacity==='0') return {unavailable:true};
          }
          w = w.parent;
        }
      } catch { return {unavailable: true}; }
      if(a==='scan')globalThis.__resumeWidget?.destroy?.();
      return globalThis.__resumeFillEngine?.[a](arg);
    }, args: [action, argument ?? null]});
    const r = results?.find(x => x.frameId === frame.frameId);
    if (!r?.documentId || frame.documentId && r.documentId !== frame.documentId || r.result === undefined || r.result?.unavailable) {
      throw Error('目标文档已变化、隐藏或不可访问，请重新扫描；未自动重试');
    }
    return {result: r.result, documentId: r.documentId, frameId: r.frameId};
  }
  async scan(tabId, includeFrames = false) {
    const tab = await this.tab(tabId), topOrigin = new URL(tab.url).origin;
    let frames = [{frameId: 0, url: tab.url}], skipped = [];
    if (includeFrames) {
      const allowed = await this.chrome.permissions.contains({permissions: ['webNavigation']});
      if (!allowed) throw Error('请先授权同源嵌入表单识别');
      frames = await this.chrome.webNavigation.getAllFrames({tabId}) || frames;
      frames.sort((a,b) => a.frameId - b.frameId);
    }
    const scanned = [];
    for (const frame of frames) {
      if (scanned.length >= MAX_FRAMES) { skipped.push({frameId: frame.frameId, reason: '达到20个文档上限，请分批处理'}); continue; }
      if (!frame.url || !/^https?:/.test(frame.url) || new URL(frame.url).origin !== topOrigin) {
        skipped.push({frameId: frame.frameId, reason: '跨域或特殊文档：请在新标签页单独打开并授权'}); continue;
      }
      try {
        secureTarget(frame.url);
        const target = frame.documentId ? {tabId, documentIds: [frame.documentId]} : {tabId, frameIds: [frame.frameId]};
        await this.chrome.scripting.executeScript({target, files: ['engine.js']});
        const r = await this.invoke(tabId, frame, 'scan');
        if (new URL(r.result.url).origin !== topOrigin) throw Error('页面来源已变化');
        scanned.push({...r, snapshot: r.result});
      } catch (e) {
        if (frame.frameId === 0) throw Error('无法扫描主页面，请在具体申请页重新点击工具栏图标');
        skipped.push({frameId: frame.frameId, reason: '嵌入文档隐藏、已导航或未获授权'});
      }
    }
    if (!(scanned.some(f => f.frameId === 0)) || (await this.tab(tabId)).url !== tab.url) throw Error('扫描时网页发生变化，请重扫');
    return {url: tab.url, frames: scanned, skipped, includeFrames};
  }
  async locate(tabId, frame, request) {
    const r = await this.invoke(tabId, frame, 'locate', request);
    await this.chrome.tabs.update(tabId, {active: true}); return r.result;
  }
  async cancel(tabId, frames) {
    await Promise.allSettled(frames.map(frame => this.invoke(tabId, frame, 'cancel')));
  }
}
