import {makePlan} from './planner.mjs';
import {PLAN_TTL, selectedFacts, sensitive, redactSnapshot} from './workspace-policy.mjs';
/** One explicit user task. Private values stay in the trusted worker until selected for a write. */
export class WorkspaceRun {
  constructor(vault, broker, clock = Date.now) { this.vault = vault; this.broker = broker; this.clock = clock; this.job = null; this.epoch = 0; this.busy = false; }
  async invalidate() {
    this.epoch++; const job = this.job; this.job = null;
    if (job) await this.broker.cancel(job.tabId, job.frames);
  }
  async scan(owner, request) {
    if (this.busy) throw Error('任务正在执行，请等待或停止');
    this.busy = true; this.job = null; const epoch = ++this.epoch;
    try {
      const profile = this.vault.read(), facts = selectedFacts(profile, request.factIds);
      const observed = await this.broker.scan(request.tabId, request.includeFrames === true);
      if (epoch !== this.epoch || !this.vault.unlocked || this.vault.read().revision !== profile.revision) throw Error('扫描被取消或资料已修改');
      this.job = {...observed, id: crypto.randomUUID(), owner, tabId: request.tabId, revision: profile.revision,
        facts, expiresAt: this.clock() + PLAN_TTL, frames: observed.frames.map(f => ({...f, mappings: {}}))};
      return this.preview();
    } finally { this.busy = false; }
  }
  current(owner, planId) {
    const j = this.job;
    if (!j || j.owner !== owner || j.id !== planId || this.clock() >= j.expiresAt || !this.vault.unlocked || this.vault.read().revision !== j.revision) {
      throw Error('预览已失效、资料已改变或不是当前工作台的计划，请重新扫描');
    }
    return j;
  }
  preview() {
    const j = this.job, entries = [];
    for (const f of j.frames) {
      f.plan = makePlan(f.snapshot, {facts: j.facts}, f.mappings);
      for (const e of f.plan.entries) entries.push({...e, id: `${f.frameId}:${e.fieldId}`, frameId: f.frameId,
        origin: new URL(f.snapshot.url).origin, sensitive: sensitive(e.label), required: !!e.required});
    }
    return {id: j.id, expiresAt: j.expiresAt, origin: new URL(j.url).origin, entries,
      frames: j.frames.map(f => ({frameId: f.frameId, fields: f.snapshot.fields.length, coverage: f.snapshot.coverage})),
      skipped: j.skipped, includeFrames: j.includeFrames};
  }
  remap(owner, {planId, id, factId}) {
    if (this.busy) throw Error('请等待当前操作');
    const j = this.current(owner, planId), f = j.frames.find(f => f.snapshot.fields.some(e => `${f.frameId}:${e.id}` === id));
    if (!f || factId && !j.facts.some(x => x.id === factId)) throw Error('字段或资料不属于当前选择');
    const fieldId = id.slice(id.indexOf(':') + 1);
    if (factId) f.mappings[fieldId] = factId; else delete f.mappings[fieldId];
    j.id = crypto.randomUUID(); return this.preview();
  }
  async locate(owner, {planId, id}) {
    if (this.busy) throw Error('请等待当前操作');
    const j = this.current(owner, planId);
    const f = j.frames.find(f => f.snapshot.fields.some(e => `${f.frameId}:${e.id}` === id));
    if (!f) throw Error('未知字段');
    if ((await this.broker.tab(j.tabId)).url !== j.url) throw Error('页面已变化');
    return this.broker.locate(j.tabId, {frameId:f.frameId,documentId:f.documentId}, {snapshotId: f.snapshot.id, fieldId: id.slice(id.indexOf(':') + 1), url: f.snapshot.url});
  }
  async apply(owner, {planId, ids, reviewed}) {
    if (this.busy) throw Error('正在执行，不能重复填写');
    const j = this.current(owner, planId);
    const allowed = new Set(j.frames.flatMap(f => f.plan.entries.filter(e => e.status === 'ready').map(e => `${f.frameId}:${e.fieldId}`)));
    if (reviewed !== true || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !allowed.has(id))) throw Error('须核对并明确选择当前可填写字段');
    this.busy = true; const epoch = this.epoch, selected = new Set(ids); this.job = null;
    this.running = j;
    const results = []; let halt = false;
    try {
      for (const f of j.frames) {
        const entries = f.plan.entries.filter(e => selected.has(`${f.frameId}:${e.fieldId}`));
        if (!entries.length) continue;
        const ids = entries.map(e => `${f.frameId}:${e.fieldId}`);
        if (epoch !== this.epoch || !this.vault.unlocked) { results.push(...ids.map(id => ({id, status: 'cancelled'}))); continue; }
        if (halt) { results.push(...ids.map(id => ({id, status: 'not-attempted'}))); continue; }
        try {
          if ((await this.broker.tab(j.tabId)).url !== j.url || this.vault.read().revision !== j.revision) throw Error('目标或资料改变');
          // Only the chosen entries, never the full profile or skipped values, cross into the page.
          const r = (await this.broker.invoke(j.tabId, {frameId:f.frameId,documentId:f.documentId}, 'apply', {...f.plan, entries})).result;
          const known = new Set(['verified','invalid','stale','manual','needs-user','cancelled','not-attempted','preserve']);
          if (!Array.isArray(r.results) || new Set(r.results.map(x => x.fieldId)).size !== r.results.length ||
            r.results.some(x => !entries.some(e => e.fieldId === x.fieldId) || !known.has(x.status))) throw Error('回读不符合所选范围');
          const byId = new Map(r.results.map(x => [x.fieldId, x.status]));
          results.push(...entries.map(e => ({id: `${f.frameId}:${e.fieldId}`, status: byId.get(e.fieldId) || 'not-attempted'})));
          if (r.results.some(x => x.status !== 'verified' && x.status !== 'preserve') || r.results.length !== entries.length) halt = true;
        } catch { halt = true; results.push(...ids.map(id => ({id, status: 'needs-user'}))); }
      }
      return {results, submitted: false, saved: false};
    } finally { this.running = null; this.busy = false; }
  }
  async stop() {
    this.epoch++; const j = this.running || this.job; this.job = null;
    if (j) await this.broker.cancel(j.tabId, j.frames);
    return {state: this.busy ? 'stopping' : 'stopped'};
  }
  async forMCP(owner, {planId, factIds, consent}) {
    if (this.busy || consent !== true) throw Error('须明确授权所选资料进入 Codex 上下文');
    const j = this.current(owner, planId);
    if (j.frames.length !== 1 || j.frames[0].frameId !== 0) throw Error('本次 MCP 协作仅限主文档；嵌入表单请使用本地填写或单独打开');
    if ((await this.broker.tab(j.tabId)).url !== j.url) throw Error('页面已变化');
    this.current(owner, planId);
    const facts = selectedFacts({facts: j.facts}, factIds);
    return {facts, mappings:Object.fromEntries(Object.entries(j.frames[0].mappings).filter(([,id])=>factIds.includes(id))), snapshot: {...redactSnapshot(j.frames[0].snapshot), owner: String(j.tabId)}, consent: true};
  }
}
