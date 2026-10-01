import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {makePlan} from '../extension/core/planner.mjs';
import {entityGroups} from '../extension/core/entity-binding.mjs';
import {resolveRecords} from '../extension/core/record-resolver.mjs';
const source=await fs.readFile(new URL('../extension/engine.js',import.meta.url),'utf8');
// Synthetic DOM only: no live site, browser connection, or external resources.
function harness(html){
 const dom=new JSDOM(html,{url:'https://form.example.invalid/apply',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const controls=[...w.document.querySelectorAll('input,textarea,select')];
 w.HTMLElement.prototype.getBoundingClientRect=function(){const i=Math.max(0,controls.indexOf(this));return {x:10,y:10+i*25,left:10,top:10+i*25,width:200,height:20,right:210,bottom:30+i*25};};
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.document.elementFromPoint=(_x,y)=>controls.find(e=>{const r=e.getBoundingClientRect();return y>=r.top&&y<=r.bottom;});
 w.eval(source);return {w,engine:w.__resumeFillEngine,close:()=>w.close()};
}
const field=(label,control='<input>')=>`<div class="field_abc"><div class="label_abc">${label}</div><div class="input_abc">${control}</div></div>`;
test('semantic section with repeated unmarked cards resolves and fills each actual record',async()=>{
 const card=()=>`<div class="card_xyz">${field('项目名称')}${field('项目描述','<textarea></textarea>')}</div>`;
 const h=harness(`<form><section><h3>项目经历</h3>${card()}${card()}</section></form>`);
 try{const s=await h.engine.scan();assert.equal(new Set(s.fields.map(f=>f.groupId)).size,2);
  const facts=['甲','乙'].flatMap(entity=>[['项目名称',entity+'项目'],['项目描述',entity+'正文']].map(([label,value])=>({id:entity+label,label,value,entity,section:'项目经历',confirmed:true})));
  const resolved=resolveRecords(s,facts);assert.equal(Object.keys(resolved.bindings).length,0,'blank ambiguous cards await explicit record confirmation');
  const groups=entityGroups(s,facts),bindings=Object.fromEntries(groups.map((g,i)=>[g.id,['甲','乙'][i]])),p=makePlan(s,{facts},{},bindings);assert.equal(p.entries.filter(e=>e.status==='ready').length,4);
  const lifecycle=[];const input=h.w.document.querySelector('input');for(const event of ['focus','input','change','blur'])input.addEventListener(event,()=>lifecycle.push(event));
  const result=await h.engine.apply(p);assert.equal(result.results.filter(r=>r.status==='verified').length,4);
  assert.deepEqual(lifecycle,['focus','input','change','blur']);
  assert.deepEqual(Array.from(h.w.document.querySelectorAll('textarea'),e=>e.value),['甲正文','乙正文']);
 }finally{h.close();}
});
test('plain div labels are associated with their own controls without placeholder or native label',async()=>{
 const h=harness(`<form><div><h3>个人信息</h3>${field('姓名')}${field('邮箱','<input type="email">')}</div><div><h3>自我描述</h3>${field('自我描述','<textarea placeholder="简介"></textarea>')}</div></form>`);
 try{const s=await h.engine.scan();assert.deepEqual(Array.from(s.fields,f=>f.label),['姓名','邮箱','自我描述']);
  const facts=[['姓名','示例人'],['邮箱','sample@example.invalid'],['自我评价','这里是示例介绍']].map(([label,value])=>({id:label,label,value,confirmed:true}));
  const p=makePlan(s,{facts});assert.equal(p.entries.filter(e=>e.status==='ready').length,3);
  const r=await h.engine.apply(p);assert.equal(r.results.filter(e=>e.status==='verified').length,3,JSON.stringify(r));
  assert.equal(h.w.document.querySelector('textarea').value,'这里是示例介绍');
 }finally{h.close();}
});
test('two CSS module project cards stay separate while all fields in each card share the record',async()=>{
 const card=()=>`<div class="card_abc"><div class="row_abc">${field('项目名称')}${field('职责')}</div>${field('项目描述','<textarea></textarea>')}${field('项目中职责','<textarea></textarea>')}</div>`;
 const h=harness(`<form><div><h3>项目经历</h3>${card()}${card()}</div></form>`);
 try{const s=await h.engine.scan();assert(s.fields.every(f=>f.section==='项目经历'));
  assert.equal(new Set(s.fields.slice(0,4).map(f=>f.groupId)).size,1,JSON.stringify(s.fields.map(f=>[f.label,f.groupId])));
  assert.equal(new Set(s.fields.map(f=>f.groupId)).size,2);
  const facts=['甲','乙'].flatMap(entity=>[['项目名称',entity+'项目'],['项目角色','开发者'+entity],['项目描述','项目正文'+entity],['项目职责','职责'+entity]].map(([label,value])=>({id:entity+label,label,value,entity,section:'项目经历',confirmed:true})));
  const groups=entityGroups(s,facts),bindings=Object.fromEntries(groups.map((g,i)=>[g.id,['甲','乙'][i]]));
  const p=makePlan(s,{facts},{},bindings);assert(p.entries.every(e=>e.status==='ready'),JSON.stringify(p.entries));
  const r=await h.engine.apply(p);assert.equal(r.results.filter(e=>e.status==='verified').length,8,JSON.stringify(r));
  assert.deepEqual(Array.from(h.w.document.querySelectorAll('textarea'),e=>e.value),['项目正文甲','职责甲','项目正文乙','职责乙']);
 }finally{h.close();}
});
test('explicit correction writes changed value but rejects a value edited after scan',async()=>{
 const h=harness(`<form>${field('姓名','<input value="旧名字">')}</form>`);
 try{const facts=[{id:'n',label:'姓名',value:'新名字',confirmed:true}];let s=await h.engine.scan();
  let p=makePlan(s,{facts},{},{},{reviewExisting:true,corrections:{[s.fields[0].id]:true}});
  let r=await h.engine.apply(p);assert.equal(r.results[0].status,'verified');
  h.w.document.querySelector('input').value='另一个旧值';s=await h.engine.scan();p=makePlan(s,{facts},{},{},{reviewExisting:true,corrections:{[s.fields[0].id]:true}});
  h.w.document.querySelector('input').value='本人刚修改';r=await h.engine.apply(p);assert.notEqual(r.results[0].status,'verified');assert.equal(h.w.document.querySelector('input').value,'本人刚修改');
 }finally{h.close();}
});
test('explicit split start/end year/month controls use their own date and preserve month precision',async()=>{
 const dates=label=>field(label,'<select><option value="">年</option><option value="y2024">2024年</option><option value="y2027">2027年</option></select><select><option value="">月</option><option value="m09">09月</option><option value="m07">07月</option></select>');
 const h=harness(`<form><div><h3>教育背景</h3><div>${field('学校')}${dates('入学时间')}${dates('毕业时间')}</div></div></form>`);
 try{const s=await h.engine.scan();assert.deepEqual(Array.from(s.fields,f=>f.label),['学校','入学时间（年）','入学时间（月）','毕业时间（年）','毕业时间（月）']);
  const facts=[['学校','虚构大学'],['入学时间','2024-09'],['毕业时间','2027-07']].map(([label,value])=>({id:label,label,value,entity:'硕士',section:'教育背景',confirmed:true}));
  const groups=entityGroups(s,facts);assert.equal(groups.length,1);assert(groups[0].bindable);
  const p=makePlan(s,{facts},{},{[groups[0].id]:'硕士'});assert(p.entries.every(e=>e.status==='ready'),JSON.stringify(p.entries));
  const r=await h.engine.apply(p);assert.equal(r.results.filter(x=>x.status==='verified').length,5,JSON.stringify(r));
  assert.deepEqual(Array.from(h.w.document.querySelectorAll('select'),e=>e.value),['y2024','m09','y2027','m07']);
 }finally{h.close();}
});

test('filled searchable selects expose selected value, not empty search input or numeric label',async()=>{
 const choice=value=>`<div class="Select"><div class="Select-control"><span class="Select-value-label">${value}</span><div class="Select-input"><input></div></div></div>`;
 const card=(name,y,m)=>`<div class="card">${field('获奖时间',choice(y)+choice(m))}${field('奖项名称',`<input value="${name}">`)}</div>`;
 const h=harness(`<form><div><div><div><h3>获奖经历</h3></div></div></div>${card('测试奖甲','2024','5')}${card('测试奖乙','2023','4')}</form>`);
 try{const s=await h.engine.scan();
  assert.deepEqual(Array.from(s.fields,f=>f.label),['获奖时间（年）','获奖时间（月）','奖项名称','获奖时间（年）','获奖时间（月）','奖项名称']);
  assert.deepEqual(Array.from(s.fields,f=>f.value),['2024','5','测试奖甲','2023','4','测试奖乙']);
  assert(s.fields.every(f=>f.section==='获奖经历'),JSON.stringify(s.fields));
  assert.equal(new Set(s.fields.map(f=>f.groupId)).size,2);
  const facts=['甲','乙'].flatMap((entity,i)=>[['获奖名称',`测试奖${entity}`],['获奖时间',i?'2023-04':'2024-05']].map(([label,value])=>({id:entity+label,entity,label,value,section:'获奖经历',confirmed:true})));
  const {bindings}=resolveRecords(s,facts),p=makePlan(s,{facts},{},bindings,{reviewExisting:true});
  assert(p.entries.every(e=>e.status==='preserve'&&e.reasonCode==='existing-consistent'),JSON.stringify(p.entries));
  assert.equal(h.engine.capture({snapshotId:s.id,url:s.url}).fields.length,0);
  const captured=h.engine.capture({snapshotId:s.id,url:s.url,includeExisting:true});
  assert.deepEqual(Array.from(captured.fields,f=>[f.label,f.value]),[['获奖时间','2024-05'],['奖项名称','测试奖甲'],['获奖时间','2023-04'],['奖项名称','测试奖乙']]);
 }finally{h.close();}
});

test('flat sections and legacy ant selected text keep scopes and existing content',async()=>{
 const h=harness(`<form><div><h3>个人信息</h3></div>${field('性别','<div class="ant-select"><span class="ant-select-selection-selected-value">测试值</span><input role="combobox"></div>')}<div><h3>项目经历</h3></div><div>${field('项目名称','<input value="示例项目">')}${field('项目描述','<textarea>原有正文</textarea>')}</div></form>`);
 try{const s=await h.engine.scan();assert.deepEqual(Array.from(s.fields,f=>f.section),['个人信息','项目经历','项目经历']);
  assert.equal(s.fields[0].label,'性别');assert.equal(s.fields[0].value,'测试值');assert.equal(s.fields[0].type,'custom-select');
  const p=makePlan(s,{facts:[]},{},{},{reviewExisting:true});assert(p.entries.every(e=>e.status==='preserve'));
 }finally{h.close();}
});

test('numeric adjacent text is not accepted as a field label',async()=>{
 const h=harness('<form><div><span>2022</span><input></div></form>');
 try{const s=await h.engine.scan();assert.equal(s.fields[0].label,'未标注字段');}finally{h.close();}
});

test('new wrapped heading invalidates an old flat-section plan even if the nearest preceding title is unchanged',async()=>{
 const h=harness(`<form><div><h3>个人信息</h3></div>${field('姓名')}${field('邮箱')}</form>`);
 try{const s=await h.engine.scan(),facts=[['姓名','示例'],['邮箱','fiction@example.invalid']].map(([label,value])=>({id:label,label,value,confirmed:true}));
  const p=makePlan(s,{facts});h.w.document.querySelector('input').addEventListener('change',()=>{const n=h.w.document.createElement('div');n.innerHTML='<h3>项目经历</h3>';h.w.document.querySelector('form').append(n);},{once:true});
  const r=await h.engine.apply(p);assert.equal(h.w.document.querySelectorAll('input')[1].value,'');assert(r.results.some(x=>x.status==='stale'));
 }finally{h.close();}
});


test('four-part range resolves selected dates, empty dates, checkbox and two distinct captured dates',async()=>{
 const select=(values,value='')=>`<select>${['',...values].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x||'请选择'}</option>`).join('')}</select>`;
 const range=field('起止时间',select(['2025','2026'],'2025')+select(['6','9'],'6')+select(['2025','2026'])+select(['3','9'])+'<input type="checkbox">至今');
 const h=harness(`<form><section><h3>项目经历</h3><div>${field('项目名称','<input value="示例项目">')}${range}</div></section></form>`);
 try{let s=await h.engine.scan();assert.deepEqual(Array.from(s.fields.slice(1,5),f=>[f.dateLabel,f.datePart]),[['开始时间','year'],['开始时间','month'],['结束时间','year'],['结束时间','month']]);
  const facts=[['项目名称','示例项目'],['开始时间','2025-06'],['结束时间','2026-03']].map(([label,value])=>({id:label,label,value,entity:'示例项目',section:'项目经历',confirmed:true}));
  const {bindings}=resolveRecords(s,facts),p=makePlan(s,{facts},{},bindings,{reviewExisting:true});assert.equal(p.entries.filter(e=>e.status==='ready').length,2,JSON.stringify(p.entries));
  const r=await h.engine.apply(p);assert.equal(r.results.filter(x=>x.status==='verified').length,2);assert.equal(h.w.document.querySelector('input[type=checkbox]').checked,false);
  s=await h.engine.scan();const c=h.engine.capture({snapshotId:s.id,url:s.url,includeExisting:true});assert.deepEqual(Array.from(c.fields.filter(f=>/时间/.test(f.label)),f=>[f.label,f.value]),[['开始时间','2025-06'],['结束时间','2026-03']]);
 }finally{h.close();}
});

test('numeric aria and placeholder do not override structural field labels',async()=>{
 const h=harness(`<form>${field('项目名称','<input aria-label="2026" placeholder="4">')}</form>`);
 try{const s=await h.engine.scan();assert.equal(s.fields[0].label,'项目名称');}finally{h.close();}
});

test('a unique exact long project duty binds a partially filled card, shared duty stays unbound',()=>{
 const description='这是只属于某个项目的完整职责正文，负责需求分析、编码实现、接口联调、测试验证以及结果核对。';
 const snapshot={url:'https://form.example.invalid/apply',fields:[{id:'name',label:'项目名称',section:'项目经历',groupId:'g',value:''},{id:'body',label:'项目职责',section:'项目经历',groupId:'g',value:description}]};
 const facts=['甲','乙'].flatMap(entity=>[['项目名称',entity+'项目'],['项目职责',entity==='甲'?description:'另一段职责正文']].map(([label,value])=>({id:entity+label,label,value,entity,section:'项目经历',confirmed:true})));
 let r=resolveRecords(snapshot,facts);assert.equal(Object.values(r.bindings)[0],'甲');assert.equal(Object.values(r.methods)[0],'exact-content');
 facts.find(f=>f.id==='乙项目职责').value=description;r=resolveRecords(snapshot,facts);assert.equal(Object.keys(r.bindings).length,0);
 snapshot.fields[0].value='不存在的名字';r=resolveRecords(snapshot,facts);assert.equal(Object.keys(r.bindings).length,0);
});
