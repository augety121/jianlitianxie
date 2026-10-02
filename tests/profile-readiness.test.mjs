import test from 'node:test';
import assert from 'node:assert/strict';
import {profileReadiness,readinessText} from '../extension/core/profile-readiness.mjs';
import {proposeStoredRepair} from '../extension/core/stored-profile-repair.mjs';
import {localHarness,importText} from './helpers/local-harness.mjs';
const fact=(label,value,entity='记录甲',extra={})=>({id:crypto.randomUUID(),label,value,entity,section:'项目经历',confirmed:true,...extra});
test('old fragments are repairable but never presented as already fillable records',()=>{
 const p={facts:[fact('项目背景','虚构段落甲'),fact('方案设计','虚构段落乙')]};
 const r=profileReadiness(p);assert.equal(r.usable.project,0);assert.equal(r.repairableProjects,1);assert.equal(r.repairableFields,1);
 assert.equal(r.hasUsableRecords,false);assert.equal(r.needsRepair,true);
 assert(!JSON.stringify(r).includes('虚构')&&!JSON.stringify(r).includes('记录甲'));assert(readinessText(r).includes('核对保存'));
});
test('reviewed recovery becomes usable, is idempotent, and never invents names or dates',()=>{
 const p={facts:[fact('**项目背景**','段落甲'),fact('方案设计：','段落乙')]};const old=JSON.stringify(p);
 const repaired=proposeStoredRepair(p);assert.equal(repaired.facts.length,1);assert.equal(repaired.facts[0].label,'项目描述');
 assert.equal(repaired.facts[0].confirmed,false);assert.equal(profileReadiness({...p,facts:[...p.facts,...repaired.facts]}).usable.project,0);
 const saved={facts:[...p.facts,...repaired.facts.map(f=>({...f,confirmed:true}))]};
 assert.equal(profileReadiness(saved).usable.project,1);assert.equal(profileReadiness(saved).needsRepair,false);assert.equal(JSON.stringify(p),old);
});
test('origin restrictions, conflicts and unconfirmed facts never authorize recovery',()=>{
 const facts=[fact('项目背景','甲','一',{origin:'https://a.invalid'}),fact('方案设计','乙','二',{confirmed:false}),fact('项目名称','丙','三',{conflict:true})];
 const r=profileReadiness({facts},'https://b.invalid');assert.equal(r.confirmed,0);assert.equal(r.needsRepair,false);assert.equal(r.usable.project,0);
 assert.equal(profileReadiness({facts},'https://a.invalid').repairableProjects,1);
});
test('metadata-only and family records do not authorize education addition',()=>{
 const facts=[fact('段落','已存','教育甲',{section:'教育经历'}),fact('学校','亲属学校','家属甲',{section:'家庭信息'})];
 assert.equal(profileReadiness({facts}).usable.education,0);
});
test('format variants of conflicting fragments are not consolidated',()=>{
 assert.equal(proposeStoredRepair({facts:[fact('项目背景','甲'),fact('**项目背景**','乙')]}).facts.length,0);
});
test('webpage cannot read repair candidates; trusted preview leaves source records intact',async()=>{
 const h=localHarness();await h.attach();await importText(h,'## 项目经历\n### 虚构记录\n项目背景：第一段\n方案设计：第二段');
 const sender={id:h.chrome.runtime.id,frameId:0,url:'https://jobs.example.invalid/apply',documentId:'target-document',tab:{id:11}};
 await assert.rejects(h.api('repair-preview',{},sender),/只有/);
 const state=await h.api('state',{tabId:11});assert.equal(state.readiness.needsRepair,true);assert.equal(state.readiness.usable.project,0);
 const before=JSON.stringify(h.local.data.resumeLocalLibraryV1),preview=await h.api('repair-preview');
 assert.equal(JSON.stringify(h.local.data.resumeLocalLibraryV1),before);assert.equal(preview.items.length,1);
});
