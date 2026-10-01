import {executionReceipt} from './execution-receipt.mjs';
import {numericMetrics,sumMetrics} from './performance.mjs';
import {resolveRecords} from './record-resolver.mjs';
import {makePlan} from './planner.mjs';
import {entityGroups,factMatchesBinding} from './entity-binding.mjs';
import {normalize,semanticLabel} from './semantics.mjs';
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
        facts, reviewExisting:request.reviewExisting===true, expiresAt: this.clock() + PLAN_TTL, frames: observed.frames.map(f => ({...f, mappings: {}, entityBindings: {},corrections:{}}))};
      if(request.autoBindEmpty===true)for(const frame of this.job.frames){
        if(frame.frameId!==0)continue;
        const resolved=resolveRecords(frame.snapshot,facts);
        frame.entityBindings=resolved.bindings;frame.bindingMethods=resolved.methods;
      }
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
    const j = this.job, entries = [], groups = [];
    for (const f of j.frames) {
      f.plan = makePlan(f.snapshot, {facts: j.facts}, f.mappings, f.entityBindings,{reviewExisting:j.reviewExisting,corrections:f.corrections});
      groups.push(...entityGroups(f.snapshot,j.facts,f.entityBindings).map(g=>({...g,id:`${f.frameId}:${g.id}`,
        frameId:f.frameId,bindingMethod:f.bindingMethods?.[g.id]||(g.entity?'manual':'none'),fieldIds:g.fieldIds.map(id=>`${f.frameId}:${id}`),bindable:g.bindable&&f.frameId===0,
        reason:f.frameId===0?g.reason:'嵌入文档仅扫描，请单独打开后绑定'})));
      // The retained executor has no parent-frame hit test. Never send values there.
      if(f.frameId!==0)f.plan.entries=f.plan.entries.map(e=>{
        const {value,factId,source,...entry}=e;
        return {...entry,status:e.status==='preserve'?'preserve':'manual',reason:'嵌入文档仅扫描；请单独打开为主页面后填写'};
      });
      for (const e of f.plan.entries) entries.push({...e, id: `${f.frameId}:${e.fieldId}`, frameId: f.frameId,
        origin: new URL(f.snapshot.url).origin, sensitive: sensitive(e.label), required: !!e.required});
    }
    return {id: j.id, expiresAt: j.expiresAt, origin: new URL(j.url).origin, entries, groups,
      performance:{scan:sumMetrics(j.frames.map(f=>f.plan.performance?.scan)),match:sumMetrics(j.frames.map(f=>f.plan.performance?.match))},
      frames: j.frames.map(f => ({frameId: f.frameId, fields: f.snapshot.fields.length, coverage: f.snapshot.coverage})),
      skipped: j.skipped, includeFrames: j.includeFrames, capabilities:{locate:true,embeddedWrite:false}};
  }
  remap(owner, {planId, id, factId}) {
    if (this.busy) throw Error('请等待当前操作');
    const j = this.current(owner, planId), f = j.frames.find(f => f.snapshot.fields.some(e => `${f.frameId}:${e.id}` === id));
    if (!f || factId && !j.facts.some(x => x.id === factId)) throw Error('字段或资料不属于当前选择');
    const fieldId = id.slice(id.indexOf(':') + 1);
    const field=f.snapshot.fields.find(e=>e.id===fieldId),entity=f.entityBindings?.[field.groupId];
    if(factId&&entity&&!factMatchesBinding(j.facts.find(x=>x.id===factId),field,entity))throw Error('该资料不属于已绑定的经历和分区');
    if (factId) f.mappings[fieldId] = factId; else delete f.mappings[fieldId];
    delete f.corrections?.[fieldId];
    j.id = crypto.randomUUID(); return this.preview();
  }
  approveCorrection(owner,{planId,id,reviewed}){
    if(this.busy||reviewed!==true)throw Error('请先核对该字段的旧值和新值');
    const j=this.current(owner,planId),f=j.frames.find(f=>f.frameId===0&&f.plan.entries.some(e=>`0:${e.fieldId}`===id));
    const entry=f?.plan.entries.find(e=>`0:${e.fieldId}`===id);
    if(!entry||entry.status!=='review')throw Error('该字段没有可确认的修正');
    f.corrections[entry.fieldId]=true;j.id=crypto.randomUUID();return this.preview();
  }
  bindInOrder(owner,{planId,reviewed}){
    if(this.busy||reviewed!==true)throw Error('请核对按简历顺序匹配经历');
    const j=this.current(owner,planId),f=j.frames.find(f=>f.frameId===0);if(!f)throw Error('没有主页面');
    const groups=entityGroups(f.snapshot,j.facts,f.entityBindings),used=new Set(Object.values(f.entityBindings));
      const occupied=x=>x.value!==''&&x.value!=null&&x.value!==false&&(!Array.isArray(x.value)||x.value.length>0);
      // Reserve existing records before assigning empty cards, even if the empty card
      // appears earlier in DOM order. Ambiguous existing anchors reserve all possibilities.
      for(const g of groups){
        const fields=f.snapshot.fields.filter(x=>g.fieldIds.includes(x.id));if(!g.bindable||!fields.some(occupied))continue;
        const anchors=fields.filter(x=>occupied(x)&&['学校','公司名称','项目名称','证书名称'].includes(semanticLabel(x.label,x.section)));
        const possible=g.candidates.filter(c=>anchors.length&&anchors.every(x=>j.facts.some(a=>a.entity===c.entity&&factMatchesBinding(a,x,c.entity)&&semanticLabel(a.label,a.section)===semanticLabel(x.label,x.section)&&normalize(a.value)===normalize(x.value))));
        for(const c of possible.length?possible:g.candidates)used.add(c.entity);
      }
    for(const g of groups){
      if(!g.bindable||g.entity)continue;
      const fields=f.snapshot.fields.filter(x=>g.fieldIds.includes(x.id));
        if(fields.some(occupied))continue;
      const selected=g.candidates.find(c=>!used.has(c.entity));if(!selected)continue;
      f.entityBindings[g.id]=selected.entity;used.add(selected.entity);
    }
    f.corrections={};j.id=crypto.randomUUID();return this.preview();
  }
  bindMany(owner,{planId,bindings,reviewed}) {
    if(this.busy||reviewed!==true||!Array.isArray(bindings)||!bindings.length||bindings.length>100)throw Error('请一次核对所选经历对应');
    const j=this.current(owner,planId),f=j.frames.find(x=>x.frameId===0);
    if(!f)throw Error('没有当前主文档');
    const groups=entityGroups(f.snapshot,j.facts,f.entityBindings),seen=new Set(),chosen=new Set();
    const updates=[];
    for(const b of bindings){
      const g=groups.find(x=>'0:'+x.id===b?.groupId);
      if(!g||!g.bindable||seen.has(g.id)||typeof b.entity!=='string'||!g.candidates.some(c=>c.entity===b.entity))throw Error('对应范围无效或来源不属于本次经历');
      if(g.entity&&g.entity!==b.entity)throw Error('已确认的经历不能由本次空白记录确认覆盖');
      const key=g.scope+'|'+normalize(b.entity);
      if(chosen.has(key)||groups.some(x=>x.id!==g.id&&x.entity&&x.scope===g.scope&&normalize(x.entity)===normalize(b.entity)))throw Error('同一段简历不能分配到两个页面记录');
      seen.add(g.id);chosen.add(key);updates.push([g,b.entity]);
    }
    for(const [g,entity] of updates){
      f.entityBindings[g.id]=entity;f.bindingMethods||={};f.bindingMethods[g.id]='manual';
      for(const id of g.fieldIds){delete f.mappings[id];delete f.corrections[id];}
    }
    j.id=crypto.randomUUID();return this.preview();
  }
  bindEntity(owner,{planId,groupId,entity}) {
    if(this.busy)throw Error('请等待当前操作');
    const j=this.current(owner,planId);
    if(typeof groupId!=='string'||typeof entity!=='string')throw Error('经历绑定格式无效');
    const f=j.frames.find(frame=>frame.frameId===0&&entityGroups(frame.snapshot,j.facts,frame.entityBindings)
      .some(g=>`${frame.frameId}:${g.id}`===groupId));
    if(!f)throw Error('经历区块不属于本次主文档');
    const id=groupId.slice(groupId.indexOf(':')+1),group=entityGroups(f.snapshot,j.facts,f.entityBindings).find(g=>g.id===id);
    if(!group.bindable||entity&&!group.candidates.some(c=>c.entity===entity))throw Error('请选择本次同分区的真实经历');
    f.entityBindings||={};
    if(entity)f.entityBindings[id]=entity;else delete f.entityBindings[id];
    f.bindingMethods||={};f.bindingMethods[id]='manual';
    for(const fieldId of group.fieldIds){delete f.mappings[fieldId];delete f.corrections?.[fieldId];}
    j.id=crypto.randomUUID();return this.preview();
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
    const results = [], metrics=[]; let halt = false;
    try {
      for (const f of j.frames) {
        const entries = f.plan.entries.filter(e => selected.has(`${f.frameId}:${e.fieldId}`));
        if (!entries.length) continue;
        const ids = entries.map(e => `${f.frameId}:${e.fieldId}`);
        if (epoch !== this.epoch || !this.vault.unlocked) { results.push(...ids.map(id => ({id, status: 'cancelled'}))); continue; }
        if (halt) { results.push(...ids.map(id => ({id, status: 'not-attempted'}))); continue; }
        try {
          if ((await this.broker.tab(j.tabId)).url !== j.url || this.vault.read().revision !== j.revision) throw Error('目标或资料改变');
          // stop()/expiry may have happened while tabs.get() was pending.
          if(epoch!==this.epoch||!this.vault.unlocked||this.clock()>=j.expiresAt){results.push(...ids.map(id=>({id,status:'cancelled'})));halt=true;continue;}
          // Only the chosen entries, never the full profile or skipped values, cross into the page.
          const r = (await this.broker.invoke(j.tabId, {frameId:f.frameId,documentId:f.documentId}, 'apply', {...f.plan, expiresAt:j.expiresAt, entries})).result;
          metrics.push(numericMetrics(r.performance));
          const known = new Set(['verified','invalid','stale','manual','needs-user','cancelled','not-attempted','preserve']);
          if (!Array.isArray(r.results) || new Set(r.results.map(x => x.fieldId)).size !== r.results.length ||
            r.results.some(x => !entries.some(e => e.fieldId === x.fieldId) || !known.has(x.status))) throw Error('回读不符合所选范围');
          const byId = new Map(r.results.map(x => [x.fieldId, x]));
          results.push(...entries.map(e => ({id: `${f.frameId}:${e.fieldId}`, status: byId.get(e.fieldId)?.status || 'not-attempted',...executionReceipt(byId.get(e.fieldId))})));
          if (r.results.some(x => x.status !== 'verified' && x.status !== 'preserve') || r.results.length !== entries.length) halt = true;
        } catch { halt = true; results.push(...ids.map(id => ({id, status: 'needs-user'}))); }
      }
      return {results, performance:sumMetrics(metrics), submitted: false, saved: false};
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
    if (j.frames.length !== 1 || j.frames[0].frameId !== 0) throw Error('本次 MCP 协作仅限主文档；嵌入表单请单独打开并重新授权');
    if ((await this.broker.tab(j.tabId)).url !== j.url) throw Error('页面已变化');
    this.current(owner, planId);
    const facts = selectedFacts({facts: j.facts}, factIds);
    const frame=j.frames[0],boundMappings=Object.fromEntries(frame.plan.entries.filter(e=>e.status==='ready'&&frame.entityBindings?.[e.groupId]).map(e=>[e.fieldId,e.factId]));
    return {facts, mappings:Object.fromEntries(Object.entries({...boundMappings,...frame.mappings}).filter(([,id])=>factIds.includes(id))), snapshot: {...redactSnapshot(frame.snapshot), owner: String(j.tabId)}, consent: true};
  }
}
