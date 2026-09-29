import {storedProfileHealth} from './core/stored-profile-repair.mjs';
import {logPreview,logBlob} from './core/log-export.mjs';
import {explainDiagnostic} from './core/match-diagnostics.mjs';
import {planExplanation} from './core/page-summary.mjs';
import {semanticLabel} from './core/semantics.mjs';
import {reviewPage,mappingCandidates} from './core/review-model.mjs';
import {parseResumeText} from './core/resume-parser.mjs';
import {extractResumeFile} from './core/resume-file.mjs';
const $=id=>document.getElementById(id),tabId=Number(new URLSearchParams(location.search).get('tab'));
let profile={facts:[],revision:0},state={},plan=null,selected=new Set(),pageIndex=0,factPage=0,preview=null,importIds=new Set();
let busy=false,disposed=false,generation=0,fileGeneration=0,mapping=null,editing=null,exportData=null;
let resumeNotes=[];
const statusNames={review:'已有内容待核对',ready:'可填写',missing:'缺资料 / 待匹配',manual:'人工处理',preserve:'保留已有',verified:'回读通过',invalid:'校验未通过',stale:'目标已变化','needs-user':'需要核对',cancelled:'已取消','not-attempted':'尚未尝试'};
const codeNames={'existing-difference':'网页已有内容与资料不同','restricted-control':'受保护控件，人工操作','record-unbound':'需要绑定经历','ambiguous-source':'多个资料来源冲突','date-precision':'日期精度不足','no-label-match':'字段名称、别名或分区未对应','text-too-long':'所有正文版本超出字数上限','number-required':'网页只接受数字','option-unavailable':'没有准确匹配的选项'};
const stageNames={preview:'读取与预览',import:'导入',scan:'扫描与匹配',fill:'填写与回读',bind:'绑定经历',map:'修改映射',stop:'停止',erase:'删除免口令资料',learn:'核对并保存网页内容'};
const reasonNames={'none':'', 'check-input':'检查输入格式或资料内容','target-changed':'目标或资料已改变，请重新扫描','permission':'请在申请页重新点击工具栏授权','busy':'等待上一项任务完成','interrupted':'操作被取消或中断','review-required':'请核对并确认本次选择'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
function notice(text,error=false){$('notice').textContent=text;$('notice').dataset.error=String(error);}
async function send(action,data={}){const r=await chrome.runtime.sendMessage({type:'local-'+action,...data});if(!r)throw Error('扩展后台未响应，请重新打开。不要重复填写。');if(r.error)throw Error(r.error);return r.data;}
function view(name){window.scrollTo({top:0,behavior:'instant'});document.querySelectorAll('[data-section]').forEach(n=>n.hidden=n.dataset.section!==name);document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===name));}
function controls(){
  $('returnTarget').disabled=busy||!tabId;
  $('continueSaved').disabled=busy||!profile.facts.length;
  $('scan').disabled=busy||!profile.facts.length||!tabId||state.mode==='mcp';
  $('fillSelected').disabled=busy||!plan||!selected.size;
  $('fillSelected').textContent=selected.size?`已核对，填写所选 ${selected.size} 项`:'已核对，填写所选项';
  $('stop').disabled=!busy&&!plan;
  $('selectedCount').textContent=plan?`本次选择 ${selected.size} 项`:'导入一次，之后直接扫描填写';
  for(const id of ['repairStored','bindOrder','previewImport','commitImport','eraseProfile','importOld','advanced','readOld'])$(id).disabled=busy;
  document.querySelectorAll('.field input,.field button,.fact button').forEach(n=>{if(busy)n.disabled=true;});
  document.querySelectorAll('.group select').forEach(n=>n.disabled=busy);
  $('commitImport').disabled=busy||!preview||!importIds.size;
}
function clearPlan(){plan=null;selected.clear();$('entries').replaceChildren();$('review').hidden=true;$('groups').replaceChildren();controls();}
function setProfile(p){profile=p;const health=storedProfileHealth(p);$('profileHealth').textContent=`教育 ${health.education} 段 · 项目 ${health.projects} 段 · 工作/实习 ${health.work} 段`+(health.projectFragments?' · 检测到项目分段资料，可检查整理':'。条目总数不代表原简历已完整识别。');$('savedCount').textContent=p.facts.filter(f=>f.confirmed&&!f.conflict).length;$('firstRun').hidden=p.facts.length>0;renderFacts();controls();}
async function refresh(){
  const g=generation,next=await send('state',{tabId});if(disposed||g!==generation)return;
  state=next;setProfile(next.profile);$('importOld').hidden=!next.encryptedExists;$('modeWarning').hidden=next.mode!=='mcp';$('autoLogs').checked=next.logging;
  $('logBadge').textContent=next.logging?'● 自动脱敏日志已开启':'○ 自动日志已关闭';$('target').textContent=next.target||'请在申请页点击插件图标';$('targetSummary').textContent=[next.targetTitle,next.target].filter(Boolean).join(' · ')||'目标不可用，请到正确的申请页再点一次浏览器插件图标';controls();
}
async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;if(plan)renderEntries();renderFacts();controls();}}
function click(id,fn){$(id).onclick=event=>{if(event.isTrusted)Promise.resolve().then(fn).catch(e=>notice(e.message,true));};}
function showPlan(p){plan=p;selected=new Set(p.entries.filter(e=>e.status==='ready'&&!e.sensitive).map(e=>e.id));pageIndex=0;$('review').hidden=false;$('firstRun').hidden=true;$('target').textContent=p.origin;
  $('matchAdvice').hidden=false;$('matchAdvice').textContent=planExplanation(p);
  $('counts').replaceChildren();for(const [status,label] of [['ready','可填'],['missing','缺项'],['manual','人工'],['review','差异待核对'],['preserve','保留']])$('counts').append(el('span',`${label} ${p.entries.filter(e=>e.status===status).length}`,status==='ready'?'good':''));
  $('groups').replaceChildren();
  for(const g of p.groups||[]){if(!g.bindable)continue;const box=el('div',null,'group');box.append(el('b',`${g.section||'经历'} · ${g.label||g.id}`));const select=el('select');select.setAttribute('aria-label','选择对应经历');const option=el('option','请选择这一区块对应的真实经历');option.value='';select.append(option);for(const c of g.candidates){const o=el('option',c.entity);o.value=c.entity;o.selected=g.entity===c.entity||g.boundEntity===c.entity;select.append(o);}select.onchange=()=>task(async()=>{showPlan(await send('bind',{planId:plan.id,groupId:g.id,entity:select.value}));notice('经历已绑定，请核对匹配结果。');});box.append(select);$('groups').append(box);}
  const coverage=p.frames.map(f=>`文档 ${f.frameId}：${f.fields} 个已扫描字段；隐藏 ${f.coverage?.excluded?.hidden??'未统计'}；禁用 ${f.coverage?.excluded?.disabled??'未统计'}；只读 ${f.coverage?.excluded?.readonly??'未统计'}；截断 ${f.coverage?.planTruncated||0}`).join('\n');
  $('coverage').textContent=coverage+'\n'+(p.skipped||[]).map(s=>s.reason).join('\n');
  if(p.frames.some(f=>f.coverage?.frames))$('coverage').textContent+='\n发现嵌入文档；本页未保证扫描其内部控件，可单独打开后授权。';
  renderEntries();controls();
}
function renderEntries(){
  $('entries').replaceChildren();if(!plan)return;
  const paged=reviewPage(plan.entries,{status:$('filter').value,query:$('search').value,page:pageIndex,selected:[...selected]});pageIndex=paged.page;
  $('pageInfo').textContent=`${paged.page+1} / ${paged.pages} 页 · 当前页外已选 ${paged.selectedOutside} 项`;$('prev').disabled=!paged.page;$('next').disabled=paged.page+1>=paged.pages;
  for(const e of paged.rows){const row=el('div',null,'field'),check=el('input');check.type='checkbox';check.checked=selected.has(e.id);check.disabled=busy||e.status!=='ready';check.setAttribute('aria-label','填写 '+e.label);check.onchange=()=>{check.checked?selected.add(e.id):selected.delete(e.id);controls();};
    const info=el('div');info.append(el('strong',e.label+(e.required?' *':'')),el('small',`#${plan.entries.indexOf(e)+1} · ${e.section||'未分区'}${e.sensitive?' · 敏感项':''}`));
    const value=el('div',e.status==='ready'?($('showValues').checked?String(e.value):'••••••'):statusNames[e.status]||e.status,'value');if(e.status==='ready'&&e.variantName&&e.variantName!=='原文')value.append(el('small',e.reason,'reason'));if(e.status!=='ready'&&e.status!=='preserve')value.append(el('div',e.reason,'reason'));
    if(e.status==='review')value.append(el('pre','网页现有：'+String(e.oldValue)+'\n简历资料：'+String(e.value)));const actions=el('div',null,'field-actions');if(e.frameId===0){if(e.status==='review'){const correct=el('button','确认使用简历值','subtle');correct.onclick=()=>task(async()=>{showPlan(await send('correct',{planId:plan.id,id:e.id,reviewed:true}));selected.add(e.id);controls();notice('这项修正已加入待填写项，请点击下方填写按钮。');});actions.append(correct);}const locate=el('button','定位','subtle');locate.onclick=()=>task(async()=>{await send('locate',{planId:plan.id,id:e.id});notice('已在申请页定位，没有点击或填写。');});actions.append(locate);
      if(!['preserve'].includes(e.status)&&e.kind!=='file'){const choose=el('button','选资料','subtle');choose.setAttribute('aria-label',e.label+' 资料映射');choose.onclick=()=>{mapping=e;$('mappingTitle').textContent='对应资料 · '+e.label;$('mappingSearch').value='';renderMapping();$('mappingDialog').showModal();};actions.append(choose);}}
    row.append(check,info,value,actions);$('entries').append(row);
  }
}
function renderMapping(){
  $('mappingChoices').replaceChildren();if(!mapping||!plan)return;
  const group=plan.groups?.find(g=>g.fieldIds.includes(mapping.id)),entity=group?.entity||group?.boundEntity||'';
  for(const {fact,exact} of mappingCandidates(mapping,profile.facts,$('mappingSearch').value,entity).slice(0,40)){
    const b=el('button',[fact.section,fact.entity,fact.label].filter(Boolean).join(' / ')+($('showValues').checked?'：'+fact.value.slice(0,100):''));b.onclick=()=>task(async()=>{if(!exact&&!confirm('字段名称不同，请确认这条资料确实用于当前字段。'))return;const p=await send('map',{planId:plan.id,id:mapping.id,factId:fact.id});$('mappingDialog').close();$('mappingChoices').replaceChildren();mapping=null;showPlan(p);notice('映射已更改，请重新核对本次选择。');});$('mappingChoices').append(b);
  }
}
async function scan(){
  if(!tabId){notice('先在要填写的申请页面点击浏览器工具栏插件图标。');return;}
  clearPlan();$('result').hidden=true;notice('正在本地扫描并匹配，不调用模型…');
  const g=generation,p=await send('scan',{tabId});if(disposed||g!==generation)return;showPlan(p);notice(timingText(p.performance)+'。'+planExplanation(p));
}
function renderFacts(){
  const q=$('profileSearch').value.trim().toLowerCase(),facts=profile.facts.filter(f=>[f.label,f.entity,f.section].join(' ').toLowerCase().includes(q)),pages=Math.max(1,Math.ceil(facts.length/40));factPage=Math.min(factPage,pages-1);$('facts').replaceChildren();
  for(const f of facts.slice(factPage*40,(factPage+1)*40)){const row=el('div',null,'fact'),info=el('div');info.append(el('b',f.label),el('small',[f.section,f.entity,f.confirmed?'已核实':'待核实'].filter(Boolean).join(' · ')));const b=el('button','查看 / 修改','subtle');b.disabled=busy;b.onclick=()=>{editing=f;for(const [id,key] of [['editLabel','label'],['editSection','section'],['editEntity','entity'],['editValue','value']])$(id).value=f[key]||'';renderVariants(f);$('editDialog').showModal();};row.append(info,b);$('facts').append(row);}
  $('factsPage').textContent=`${facts.length} 条 · ${factPage+1} / ${pages} 页`;$('factsPrev').disabled=factPage===0;$('factsNext').disabled=factPage+1>=pages;
}
function showImport(data){
  preview=data;importIds=new Set(data.items.filter(x=>x.status==='new').map(x=>x.fact.id));$('importRows').replaceChildren();$('importSummary').replaceChildren();
  for(const [s,label] of [['new','新增'],['change','更新待确认'],['duplicate','重复跳过'],['conflict','文件冲突']])$('importSummary').append(el('span',`${label} ${data.items.filter(x=>x.status===s).length}`));
  const duplicates=data.items.filter(x=>x.status==='duplicate').length;
  $('importNextMessage').textContent=duplicates===data.items.length?'这份文件的条目已保存，无需再次导入。':'核对导入结果后保存，再去填写申请页。';
  const present=new Set(data.items.map(x=>semanticLabel(x.fact.label,x.fact.section)));
  $('importHealth').textContent='本次文件基础字段检查：'+['姓名','手机号码','邮箱'].map(k=>k+' '+(present.has(semanticLabel(k))?'已识别':'未识别（请检查格式或未归类区域）')).join(' · ');
  for(const x of data.items)renderImportRow(x);
  data.skipped=[...data.skipped,...resumeNotes];
  if(data.warnings?.length)$('importHealth').textContent+='。'+data.warnings.join('；');
  $('skippedBox').hidden=!data.skipped.length;$('skippedCount').textContent=`${data.skipped.length} 行没有自动归类，展开核对`;$('skippedText').textContent=data.skipped.map(x=>`第${x.line}行：${x.text}`).join('\n');$('importPreview').hidden=false;view('profile');controls();notice('已识别的资料如下。勾选项保存后立即可用于匹配；未知段落不会猜测。');
}
function clearImport(){resumeNotes=[];$('resumeSource').textContent='';$('resumeSourceBox').hidden=true;preview=null;importIds.clear();$('importPreview').hidden=true;$('importRows').replaceChildren();$('importSummary').replaceChildren();$('skippedText').textContent='';controls();}
async function readFile(){
  const f=$('importFile').files[0],id=++fileGeneration;if(!f)return;
  let text;resumeNotes=[];
  if(/\.(pdf|docx)$/i.test(f.name)){
    notice('正在本机读取简历并解析，文件不会上传到解析服务…');
    const extracted=await extractResumeFile(f);if(disposed||id!==fileGeneration)return;
    const draft=parseResumeText(extracted.text,{sourceName:f.name});text=JSON.stringify({schemaVersion:1,facts:draft.facts});
    resumeNotes=[...extracted.warnings,...draft.warnings].map(text=>({line:'提示',text})).concat(draft.skipped);
    $('resumeSource').textContent=extracted.text;$('resumeSourceBox').hidden=false;
  }else{
    if(f.size>2*1024*1024||!(/\.(md|markdown|json|txt)$/i.test(f.name)))throw Error('请选择12MB以内PDF/DOCX简历，或2MB以内MD/JSON/TXT资料');
    text=await f.text();$('resumeSource').textContent='';$('resumeSourceBox').hidden=true;
  }
  if(disposed||id!==fileGeneration)return;
  $('importText').value=text;$('fileState').textContent='已读取文件，仅在本机处理';
  await task(async()=>{const d=await send('preview',{text});if(id===fileGeneration&&!disposed)showImport(d);});
}
let logPage=0,logRequest=0,exportController=null,exportPending=false;
async function refreshLogs(){const request=++logRequest,data=await send('logs');if(disposed||request!==logRequest)return;exportData={...data,productVersion:chrome.runtime.getManifest().version};$('autoLogs').checked=data.enabled;logPage=0;renderLogs();}
function renderLogs(){
 const data=exportData;if(!data)return;$('logs').replaceChildren();
 const records=[...data.records].reverse(),pages=Math.max(1,Math.ceil(records.length/10));logPage=Math.min(logPage,pages-1);
 if(!records.length)$('logs').append(el('p','还没有操作记录。导入、扫描和填写时会自动记录。','help'));
 const pager=el('div',null,'toolbar'),prev=el('button','上一页','subtle'),next=el('button','下一页','subtle');
 prev.disabled=logPage===0;next.disabled=logPage+1>=pages;prev.onclick=()=>{logPage--;renderLogs();};next.onclick=()=>{logPage++;renderLogs();};
 pager.append(prev,el('span',`${logPage+1} / ${pages} 页 · 共 ${records.length} 次操作 · 详情按需加载`),next);$('logs').append(pager);
 for(const r of records.slice(logPage*10,logPage*10+10)){
  const row=el('div',null,'log'),info=el('div'),abnormal=r.fields.some(f=>!['verified','preserve','ready'].includes(f.status));
  info.append(el('b',`${stageNames[r.stage]||'操作'} · ${r.ok?(abnormal?'有待处理项':'完成'):'未完成'}`,(!r.ok||abnormal)?'bad':''),el('small',`${r.ms} 毫秒 · ${r.total} 项 · 日志 ${r.seq}`),el('small',`插件 ${r.version||'unknown'} / 引擎 ${r.engineVersion||'unknown'} · 本地资料 ${r.profile?.total??'未知'} 条`));
  const timing=timingText(r.performance);if(timing)info.append(el('small',timing));if(r.reason!=='none')info.append(el('small',reasonNames[r.reason]||'请查看详情'));
  const details=el('details');details.append(el('summary','结果详情'));
  details.ontoggle=()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='true';details.append(el('pre',(r.profile?'资料类型（不含内容）：\n'+r.profile.inventory.map(x=>`${x.semantic} / ${x.section}：${x.count} 条，已确认 ${x.confirmed} 条`).join('\n')+'\n\n':'')+r.fields.map(explainDiagnostic).join('\n\n')+(r.omitted?`\n另有 ${r.omitted} 项未记录详情`:'')));};
  row.append(info,details);$('logs').append(row);
 }
 if(data.dropped)$('logs').prepend(el('p',`${data.dropped} 条日志未能写入；不要据此重复填写。`,'help'));
}
async function previewLogs(){
 if(exportPending||exportController)return;exportPending=true;$('exportLogs').disabled=true;$('downloadLogs').disabled=true;
 $('logPreview').textContent='正在读取脱敏日志，可以随时关闭…';$('logDialog').showModal();const request=++logRequest;
 try{const data=await send('logs');if(disposed||request!==logRequest||!$('logDialog').open)return;exportData={...data,productVersion:chrome.runtime.getManifest().version};$('logPreview').textContent=logPreview(exportData);$('downloadLogs').disabled=false;}
 catch(e){$('logPreview').textContent=e.message;}
 finally{exportPending=false;$('exportLogs').disabled=false;}
}
async function downloadLogs(){
 if(!exportData||exportController)return;const controller=new AbortController();exportController=controller;$('downloadLogs').disabled=true;
 try{const blob=await logBlob(exportData,{signal:controller.signal,onProgress:(done,total)=>{$('downloadLogs').textContent=`正在生成 ${done}/${total} · 可关闭取消`;}});
  if(disposed||controller.signal.aborted)return;const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='local-fill-diagnostics.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('logDialog').close();notice(`日志已生成（${Math.ceil(blob.size/1024)} KB），请查看浏览器下载列表。`);
 }catch(e){if(e.name!=='AbortError')notice('导出失败：'+e.message,true);}
 finally{if(exportController===controller)exportController=null;$('downloadLogs').disabled=false;$('downloadLogs').textContent='确认导出 JSON';}
}
$('logDialog').addEventListener('close',()=>{logRequest++;exportController?.abort();$('logPreview').textContent='';});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view(b.dataset.view);if(b.dataset.view==='logs')refreshLogs().catch(e=>notice(e.message,true));});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{$(b.dataset.close).close();if(b.dataset.close==='oldDialog')$('oldPassword').value='';if(b.dataset.close==='editDialog')$('editForm').reset();if(b.dataset.close==='mappingDialog'){$('mappingChoices').replaceChildren();mapping=null;}});
click('returnTarget',()=>task(async()=>{await send('return',{tabId});notice('已回到申请页。点击右下角“填写简历”即可扫描并填写；复杂项可返回工作台。');}));
click('showFill',()=>task(async()=>{view('fill');if(profile.facts.length)await scan();}));
click('continueSaved',()=>task(async()=>{view('fill');await scan();}));
click('repairStored',()=>task(async()=>{clearImport();clearPlan();const d=await send('repair-preview');if(!d.items.length){notice('没有可自动整理的已存项目片段。未曾导入的教育/项目需从原简历重新提取，原有资料保持不变。');return;}showImport(d);notice('已从本地旧资料整理出项目正文预览。原句保留、原条目不删除，核对后保存即可用于填写。');}));
click('goImport',()=>view('profile'));click('goLogs',async()=>{view('logs');await refreshLogs();});
click('scan',()=>task(scan));click('previewImport',()=>task(async()=>{clearImport();const g=++fileGeneration,d=await send('preview',{text:$('importText').value});if(g===fileGeneration&&!disposed)showImport(d);}));
$('importFile').onchange=()=>readFile().catch(e=>notice(e.message,true));
click('commitImport',()=>task(async()=>{const g=++generation,p=await send('commit',{previewId:preview.id,ids:[...importIds],edits:preview.items.filter(x=>importIds.has(x.fact.id)).map(x=>({id:x.fact.id,label:x.fact.label,section:x.fact.section,entity:x.fact.entity,value:x.fact.value})),reviewed:true,acceptPlaintext:true});if(disposed||g!==generation)return;setProfile(p);clearImport();$('importText').value='';$('importFile').value='';$('fileState').textContent='资料已保存；不会在关闭时删除。';clearPlan();if(tabId&&state.mode!=='mcp'){view('fill');await scan();}else notice('已经保存到本浏览器。到申请页点击插件图标即可扫描。');}));
click('fillSelected',()=>task(async()=>{const g=++generation,requested=plan,labels=new Map(plan.entries.map((e,i)=>[e.id,`#${i+1} ${e.label}`]));try{const r=await send('fill',{planId:plan.id,ids:[...selected],reviewed:true});if(disposed||g!==generation)return;$('result').hidden=false;$('result').textContent=`回读通过 ${r.results.filter(x=>x.status==='verified').length} 项；未提交。\n`+timingText({apply:r.performance})+'\n'+r.results.filter(x=>x.status!=='verified').map(x=>`${labels.get(x.id)}：${statusNames[x.status]}`).join('\n');notice('填写结束。问题日志已自动记录；请核对网页内容后自行提交。');}catch(e){notice(e.message+'；未自动重试，请先检查网页已填内容。',true);}finally{if(g===generation)clearPlan();}}));
click('stop',async()=>{generation++;fileGeneration++;const r=await send('stop');clearPlan();clearImport();notice(r.state==='stopping'?'已请求停止，等待执行结束。已填入的内容不会撤销。':'已停止；本地资料仍然保留。');});
click('switchLocal',()=>task(async()=>{await send('switch');await refresh();notice('已切回本地模式。不需要模型、配对或口令。');}));
click('advanced',()=>task(async()=>{await send('advanced',{tabId});notice('已打开高级模式；免口令资料不会自动共享给MCP。');}));
$('search').oninput=()=>{pageIndex=0;renderEntries();};$('filter').onchange=()=>{pageIndex=0;renderEntries();};$('showValues').onchange=renderEntries;
click('prev',()=>{pageIndex--;renderEntries();});click('next',()=>{pageIndex++;renderEntries();});$('profileSearch').oninput=()=>{factPage=0;renderFacts();};click('factsPrev',()=>{factPage--;renderFacts();});click('factsNext',()=>{factPage++;renderFacts();});$('mappingSearch').oninput=renderMapping;
$('editForm').onsubmit=e=>{e.preventDefault();if(e.isTrusted)task(async()=>{const next={...editing,label:$('editLabel').value,section:$('editSection').value,entity:$('editEntity').value,value:$('editValue').value,textVariants:[...$('editVariants').children].map(row=>({name:row.querySelector('input').value,value:row.querySelector('textarea').value}))};const p=await send('edit',{fact:next,revision:profile.revision,reviewed:true});generation++;setProfile(p);clearPlan();$('editDialog').close();$('editForm').reset();editing=null;notice('资料已修改，重新扫描后使用新值。');});};
click('eraseProfile',()=>task(async()=>{if(!confirm('删除所有免口令资料？原加密库和MCP旧主档保持不变。'))return;generation++;fileGeneration++;const p=await send('erase',{confirm:true,revision:profile.revision});setProfile(p);clearImport();clearPlan();$('importText').value='';$('result').hidden=true;notice('免口令资料已清空。原加密库未修改。');}));
click('importOld',()=>{$('oldPassword').value='';$('oldDialog').showModal();});click('readOld',()=>task(async()=>{const password=$('oldPassword').value;$('oldPassword').value='';const d=await send('encrypted-preview',{password});$('oldDialog').close();showImport(d);notice('原加密库已读取但未修改。确认保存后，所选资料才会复制到免口令存储。');}));
click('refreshLogs',refreshLogs);click('exportLogs',previewLogs);click('downloadLogs',downloadLogs);
$('autoLogs').onchange=async()=>{try{await send('log-settings',{enabled:$('autoLogs').checked});await refresh();await refreshLogs();}catch(e){notice(e.message,true);}};
click('clearLogs',async()=>{await send('log-settings',{enabled:$('autoLogs').checked,clear:true});await refreshLogs();notice('日志已清空，资料未修改。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){$('showValues').checked=false;renderEntries();}});
window.addEventListener('pagehide',()=>{disposed=true;exportController?.abort();generation++;fileGeneration++;chrome.runtime.sendMessage({type:'local-stop'}).catch(()=>{});});
await refresh().then(async()=>{if(disposed)return;if(!profile.facts.length){view('profile');notice('欢迎使用本地速填。上传PDF/Word简历或JSON资料，核对解析结果后保存。');}else if(tabId&&state.mode!=='mcp'){await task(scan);}else notice('本地资料已恢复，无需再次输入口令。请从申请页点击插件图标。');}).catch(e=>notice(e.message,true));

function timingText(phases){
  if(!phases)return '';
  const parts=[];
  for(const [key,label] of [['scan','扫描'],['match','匹配'],['apply','填写及回读']]){
    const ms=phases[key]?.durationMs;if(Number.isFinite(ms))parts.push(`${label} ${Math.round(ms)} ms`);
  }
  if(Number.isFinite(phases.scan?.unlabeledFields))parts.push('未识别名称 '+phases.scan.unlabeledFields+' 项');
  return parts.length?'本机执行：'+parts.join(' · '):'';
}

function addVariant(v={name:'短版',value:''}){
 if($('editVariants').children.length>=5)return notice('最多5份备选版本',true);
 const row=el('div',null,'variant-editor'),name=el('input'),value=el('textarea'),remove=el('button','删除这一版本','subtle');
 name.value=v.name;name.maxLength=40;name.required=true;name.setAttribute('aria-label','版本名称');value.value=v.value;value.rows=4;value.maxLength=10000;value.required=true;value.setAttribute('aria-label','版本正文');
 remove.type='button';remove.onclick=()=>row.remove();row.append(name,value,remove);$('editVariants').append(row);
}
function renderVariants(f){$('editVariants').replaceChildren();for(const v of f.textVariants||[])addVariant(v);}
click('addVariant',()=>addVariant());

function renderImportRow(x){
 const row=el('div',null,'import-row'),c=el('input');c.type='checkbox';c.checked=importIds.has(x.fact.id);c.disabled=x.status==='conflict';c.setAttribute('aria-label','导入 '+x.fact.label);c.onchange=()=>{c.checked?importIds.add(x.fact.id):importIds.delete(x.fact.id);controls();};
 const title=el('div');for(const [key,label] of [['label','字段名称'],['section','分区'],['entity','所属经历']]){const input=el('input');input.value=x.fact[key]||'';input.maxLength=200;input.setAttribute('aria-label',label);input.placeholder=label;input.oninput=()=>{x.fact[key]=input.value;c.checked=true;importIds.add(x.fact.id);controls();};title.append(input);}
 const body=el('div',null,'import-value'),value=el('textarea');value.value=x.fact.value;value.rows=4;value.maxLength=10000;value.setAttribute('aria-label','解析内容');value.oninput=()=>{x.fact.value=value.value;c.checked=true;importIds.add(x.fact.id);controls();};body.append(value);
 for(const v of x.fact.textVariants||[]){const d=el('details');d.append(el('summary',v.name+' · '+v.value.length+'字'),el('p',v.value));body.append(d);}
 row.append(c,title,body,el('span',{new:'新增',change:'更新待核对',duplicate:'相同可跳过',conflict:'冲突'}[x.status]));$('importRows').append(row);
}
click('addDraftFact',()=>{if(!preview||busy)return;const x={fact:{id:crypto.randomUUID(),label:'',section:'基本信息',entity:'',value:'',source:'本人补充',confirmed:false},status:'new'};preview.items.push(x);importIds.add(x.fact.id);renderImportRow(x);controls();});

click('bindOrder',()=>task(async()=>{showPlan(await send('order',{planId:plan.id,reviewed:true}));notice('已按资料顺序匹配空白经历，请核对各段后填写；已有内容的经历不重排。');}));
