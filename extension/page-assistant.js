/* User-clicked local autofill. No network, direct storage or private-profile DOM.
 * A trusted click on 填写简历 authorizes a fresh scan and one ordinary empty-field batch.
 * Ambiguous/sensitive fields require a separate trusted extension picker; never guessed.
 */
(()=>{
 if(window!==window.top||!/^https?:$/.test(location.protocol))return;
 const previous=globalThis.__resumeLocalAssistant;
 if(previous?.version==='0.15.0'){previous.open();return;}
 previous?.destroy();
 const host=document.createElement('div');host.id='resume-local-assistant';
 host.style.cssText='all:initial!important;position:fixed!important;right:18px!important;bottom:20px!important;z-index:2147483646!important;display:block!important;';
 const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
 style.textContent=`:host{all:initial}*{box-sizing:border-box}button{font:600 13px/1.4 system-ui,'Microsoft YaHei',sans-serif;cursor:pointer;border:0;border-radius:10px;padding:10px 12px;background:#087f70;color:#fff}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:3px solid #dbad32;outline-offset:2px}.panel{width:min(348px,calc(100vw - 36px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;font:14px/1.6 system-ui,'Microsoft YaHei',sans-serif;color:#18364c;background:#fff;border:1px solid #cbdde4;box-shadow:0 12px 48px #193e5233;border-radius:18px;overflow:hidden}.head{padding:15px 17px;background:#f0f8f6;display:flex;justify-content:space-between;align-items:center}.head strong{font-size:16px}.head small{display:block;font-size:11px;color:#55736d}.fixed{padding:12px 17px 0;flex:none}.body{padding:0 17px 14px;overflow-y:auto;min-height:0}.message{max-height:18vh;overflow:auto}.close,.subtle{color:#275d67;background:#edf4f7}.message{margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.counts{font-size:11px;color:#667d88;margin:9px 0}.primary{width:100%;font-size:17px;min-height:48px;background:#087f70;box-shadow:0 4px 12px #087f7020}.links{display:flex;gap:8px;margin-top:10px}.links button{flex:1}.note{font-size:11px;color:#637782;margin:9px 0 0}.pill{display:flex;gap:6px;box-shadow:0 5px 22px #193e5233;border-radius:12px;background:#fff;padding:3px}.pill .run{font-size:15px;min-height:46px}.danger{background:#a4312a}.problem-list{padding:0;list-style:none;margin:8px 0}.problem{padding:10px 0;border-top:1px solid #e6edf0}.problem-title{font-weight:600;font-size:13px;overflow-wrap:anywhere}.hint{font-size:11px;color:#697c85;overflow-wrap:anywhere}.problem-actions{display:flex;gap:6px;margin-top:6px}.problem-actions button{font-size:11px;padding:6px 8px}details{margin-top:12px}summary{font-size:12px;cursor:pointer;color:#476371}.problem-heading{font-size:12px;color:#97631e;margin:12px 0 4px}[hidden]{display:none!important}`;
 const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const b=(label,cls)=>{const e=n('button',label,cls);e.type='button';return e;};
 const panel=n('section',null,'panel'),head=n('div',null,'head'),title=n('div');
 title.append(n('strong','本地简历速填'),n('small','0.15.0 · 资料已在本机 · 不自动提交'));
 const close=b('收起','close');head.append(title,close);
 const body=n('div',null,'body'),message=n('p','点击下方按钮，直接补全这张简历表。','message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const allowAdd=b('按简历顺序添加经历并填写','primary');allowAdd.hidden=true;allowAdd.style.marginTop='10px';
 const additionNote=n('p',null,'note');additionNote.hidden=true;
 const repair=b('整理已有资料','subtle');repair.hidden=true;repair.style.width='100%';
 const repairNote=n('p',null,'note');repairNote.hidden=true;
 const fill=b('填写简历','primary'),counts=n('div',null,'counts'),links=n('div',null,'links');
 const remember=b('我补完了，记住内容','subtle');remember.style.width='100%';remember.style.marginTop='10px';
 const saveExisting=b('读取本页已填内容，核对保存','subtle');saveExisting.style.width='100%';saveExisting.style.marginTop='8px';
 const scan=b('仅检查缺项','subtle'),manage=b('导入 / 核对修正','subtle'),feedback=b('导出问题日志','subtle');links.append(scan,manage);
 const more=n('details',null,'more-tools');more.append(n('summary','更多操作'),remember,saveExisting,feedback,links);
 const details=n('details'),summary=n('summary','查看待处理项'),problems=n('ul',null,'problem-list');details.append(summary,problems);details.hidden=true;
 body.append(additionNote,allowAdd,n('p','点击即使用已核对的本地资料填写普通空白项；一致内容保留；差异在“核对修正”中确认，敏感项另行确认。','note'),repairNote,repair,details,more);
 const fixed=n('div',null,'fixed');fixed.append(message,fill,counts);panel.append(head,fixed,body);message.setAttribute('role','status');
 const pill=n('div',null,'pill'),quick=b('填写简历','run'),stop=b('停止','danger'),expand=b('展开','subtle');
 pill.append(quick,expand,stop);pill.hidden=true;stop.hidden=true;
 root.append(style,panel,pill);document.documentElement.append(host);
 let plan=null,busy=false,dead=false,generation=0,observedUrl=location.href,nextAction='fill';
 const validClick=e=>{
  if(!e.isTrusted||dead||document.visibilityState==='hidden')return false;
  if(e.detail===0)return document.activeElement===host;
  return document.elementFromPoint(e.clientX,e.clientY)===host;
 };
 async function send(type,data={}){
  const r=await chrome.runtime.sendMessage({type:'page-local-'+type,clientVersion:'0.15.0',...data});
  if(!r)throw Error('插件已更新或后台未响应。请重新点击浏览器工具栏插件图标。');
  if(r.error)throw Error(r.error);return r.data;
 }
 function show(){panel.hidden=false;pill.hidden=true;}
 function collapse(){panel.hidden=true;pill.hidden=false;}
 function controls(){repair.disabled=feedback.disabled=allowAdd.disabled=fill.disabled=quick.disabled=scan.disabled=manage.disabled=remember.disabled=saveExisting.disabled=busy;stop.hidden=!busy;quick.textContent=busy?'正在填写…':fill.textContent;}
 function clear(){repair.hidden=true;repairNote.hidden=true;allowAdd.hidden=true;additionNote.hidden=true;additionNote.textContent='';plan=null;problems.replaceChildren();details.hidden=true;counts.textContent='';}
 function error(e){clear();message.textContent=e.message||'本次没有完成，请先检查网页已填内容。';show();}
 function render(p){
  plan=p;counts.textContent=`扫描 ${p.total} · 可填 ${p.counts.ready} · 待匹配 ${p.counts.missing} · 差异 ${p.counts.review||0} · 人工 ${p.counts.manual} · 已有一致 ${p.coverage?.consistent||0} · 待核实 ${p.coverage?.unverified||0}`;
  message.textContent=p.message;problems.replaceChildren();
  let previousSection=null;
  for(const f of [...p.problems||[]].sort((a,b)=>(a.section||'').localeCompare(b.section||''))){
   if(previousSection!==(f.section||'其他')){previousSection=f.section||'其他';const heading=n('li',previousSection,'problem-heading');problems.append(heading);}
   const li=n('li',null,'problem'),actions=n('div',null,'problem-actions');
   li.append(n('div',[f.section,f.label].filter(Boolean).join(' / '),'problem-title'),n('div',f.hint,'hint'));
   if(f.pickable){const pick=b('补填这项','subtle');pick.onclick=async event=>{
    if(!validClick(event)||busy||!plan)return;pick.disabled=true;
    try{collapse();await send('pick',{planId:plan.id,id:f.id});message.textContent='正在打开此字段的资料选择界面，等待浏览器确认…';}
    catch(e){error(e);}finally{pick.disabled=false;}
   };actions.append(pick);}
   const locate=b('看网页位置','subtle');locate.onclick=async event=>{
    if(!validClick(event)||busy||!plan)return;
    try{await send('locate',{planId:plan.id,id:f.id});collapse();}catch(e){error(e);}
   };actions.append(locate);li.append(actions);problems.append(li);
  }
  details.hidden=!p.problems?.length;details.open=false;summary.textContent=`待处理 ${p.problems?.length||0} 项${p.problemMore?'（仅显示前60项）':''}`;
  if(p.more)message.textContent+=`\n主按钮会在同一次任务中处理全部 ${p.quick.length+p.more} 项普通字段。`;
  // The primary action remains visible/enabled even when automatic matches are zero.
  nextAction=p.counts.ready?'fill':p.counts.review||p.coverage?.unverified?'review':'fill';fill.textContent=p.counts.ready?'填写空白项（'+p.counts.ready+'）':nextAction==='review'?'核对已有内容':'重新检查缺项';controls();
 }
 function showReadiness(r){
  repair.hidden=!r?.needsRepair;repairNote.hidden=!r?.needsRepair;
  if(r?.needsRepair){repairNote.textContent=`已有 ${r.repairableRecords||r.repairableProjects} 段资料可整理，核对保存后继续；无需重新上传。`;if(!r.hasUsableRecords){nextAction='repair';fill.textContent='整理已有资料并继续';}}
 }
 async function open(){
  show();if(busy)return;
  if(observedUrl!==location.href){observedUrl=location.href;clear();}
  const g=++generation;
  try{const s=await send('status');if(dead||g!==generation)return;
   if(s.mode!=='local'){clear();message.textContent='当前是 MCP 模式；“导入 / 核对修正”中可切回本地。';}
   else if(!s.hasProfile){clear();nextAction='profile';fill.textContent='建立本地资料';message.textContent='导入原简历，或在更多操作中读取本页已填内容，按经历核对后即可复用。';}
   else if(!plan){nextAction='fill';fill.textContent='填写简历';message.textContent='点击“填写简历”，自动识别并填写本页可确认的空白项。无需先点扫描。';}
   showReadiness(s.readiness);
  }catch(e){if(!dead&&g===generation)error(e);}controls();
 }
 async function start(event,write,addConsent=false){
  if(!validClick(event)||busy)return;
  const g=++generation;busy=true;clear();controls();message.textContent=write?'正在识别并填写这张简历表…':'正在检查这张表…';collapse();
  try{
   if(write){const result=await send('run',{reviewed:true,allowAdd:addConsent===true});if(dead||g!==generation)return;taskFinished(result);return;}
   const p=await send('scan');if(dead||g!==generation)return;
   plan=p;
   if(!write||!p.quick.length){show();render(p);return;}
   // The original trusted click authorizes this fresh, bounded, ordinary empty-field plan.
   // No imported value or unmatched/sensitive fact is exposed in the page assistant DOM.
   const r=await send('fill',{planId:p.id,reviewed:true});if(dead||g!==generation)return;
   clear();counts.textContent=`保留已有 ${p.counts.preserve} 项 · 待匹配 ${p.counts.missing} 项 · 人工 ${p.counts.manual} 项`;
   const pending=r.counts['not-attempted']||0;
   const other=Object.entries(r.counts).filter(([k])=>!['verified','preserve','not-attempted'].includes(k)).reduce((n,[,v])=>n+v,0);
   message.textContent=`已填写并回读通过 ${r.counts.verified||0} 项，未提交。`+(other?`\n${other} 项结果需检查，不会自动重试。`:'\n请核对网页，保存和提交由你完成。');
   if(pending)message.textContent+=`\n${pending} 项因前项异常或取消尚未尝试，不是这些字段都缺资料；核对后重新扫描。`;
   if(p.problems?.length)message.textContent+='\n暂缺资料已跳过。你直接在网页补填，完后点“我补完了，记住内容”。';
   if(p.more)message.textContent+='\n本次最多填写60项；下一批需再次点击“填写简历”。';
   show();
  }catch(e){if(!dead&&g===generation)error(e);}finally{busy=false;controls();}
 }
 remember.onclick=async e=>{
  if(!validClick(e)||busy)return;busy=true;controls();
  try{const r=await send('learn');if(r.requested||r.opened){collapse();message.textContent=r.opened?'已打开补充内容预览，按经历核对后保存。':'正在打开资料核对界面，等待浏览器确认…';}
   else{message.textContent='没有检测到本次新增的有效内容。请先点“填写简历”，然后直接在网页补填，完成后再记住。';show();}}
  catch(errorValue){error(errorValue);}finally{busy=false;controls();}
 };
 saveExisting.onclick=async e=>{
  if(!validClick(e)||busy)return;busy=true;controls();
  try{const r=await send('learn-existing');clear();show();message.textContent=r.opened?'已打开本页内容核对窗口。按经历核对后保存。':r.requested?'正在打开资料核对界面，等待浏览器确认…':'未读取到可保存内容，请查看日志中的字段识别结果。';}
  catch(err){error(err);}finally{busy=false;controls();}
 };
 allowAdd.onclick=e=>start(e,true,true);
 const primary=async e=>{if(!validClick(e)||busy)return;if(nextAction!=='fill'){try{await send('manage',{view:nextAction==='repair'?'repair':'profile'});message.textContent='正在打开资料核对界面，等待浏览器确认…';}catch(err){error(err);}return;}return start(e,true);};fill.onclick=primary;quick.onclick=primary;scan.onclick=e=>start(e,false);
 manage.onclick=async e=>{if(!validClick(e)||busy)return;try{await send('manage',{view:'profile'});}catch(e){error(e);}};
 repair.onclick=async e=>{if(!validClick(e)||busy)return;try{await send('manage',{view:'repair'});}catch(e){error(e);}};
 feedback.onclick=async e=>{if(!validClick(e)||busy)return;try{await send('manage',{view:'logs'});}catch(e){error(e);}};
 stop.onclick=async e=>{if(!validClick(e))return;generation++;stop.disabled=true;
  try{await send('stop');clear();message.textContent='已请求停止；已写内容不会撤销，请检查网页后再操作。';show();}
  catch(e){error(e);}finally{stop.disabled=false;}
 };
 close.onclick=e=>{if(validClick(e))collapse();};expand.onclick=e=>{if(validClick(e))open();};
 const moved=()=>{observedUrl=location.href;if(!busy){clear();message.textContent='页面已切换，点“填写简历”处理当前页。';}};
 window.addEventListener('popstate',moved);window.addEventListener('hashchange',moved);
 function destroy(){dead=true;generation++;host.remove();window.removeEventListener('popstate',moved);window.removeEventListener('hashchange',moved);}
 function taskFinished(result){
  clear();show();
  if(result.summary)render({...result.summary,quick:[],more:0,problems:result.summary.problems.map(p=>({...p,pickable:result.outcome==='no-eligible-fields'&&p.pickable}))});
  if(result.outcome!=='no-eligible-fields')plan=null;
  const count=result.counts?.verified||0,added=result.expansion?.added||0;
  if(result.outcome==='needs-confirmation'){
    message.textContent=(count?`已填写并回读通过 ${count} 项。`:'')+`有 ${result.groups} 段经历需要对应，正在打开整段核对界面。确认对应后继续填写，无需逐字段选择。`;
  }else if(result.outcome==='no-eligible-fields'){
    message.textContent=result.summary?.message||'本次没有可补填项，缺少资料的内容已跳过。';
  }else{
    const pending=result.counts?.['not-attempted']||0;
    message.textContent=`本次回读通过 ${count} 项`+(added?`，新增 ${added} 段记录`:'')+'；未提交。';
    if(result.outcome==='partial')message.textContent+='\n部分控件未完成，请查看详情；不会自动重试不确定的写入。';
    if(pending)message.textContent+=`\n${pending} 项尚未尝试，不等于缺少资料。`;
    if(result.summary?.counts.missing)message.textContent+='\n仍有未匹配项，请查看资料和字段对应；不代表这些资料都未保存。';
    if(result.expansion?.complete===false)message.textContent+='\n新增结果需要核对，未继续填写或重复点击。';
  }
  const expansion=result.expansion,domainNames={education:'教育',work:'实习/工作',project:'项目',language:'语言',award:'获奖'};
  if(expansion?.inventory){
   const pending=expansion.inventory.filter(x=>x.code==='needs-add');
   const absent=expansion.inventory.filter(x=>x.present&&x.target===0);
   const broken=expansion.inventory.filter(x=>x.present&&x.target&&!['satisfied','needs-add'].includes(x.code));
   const notes=[];
   if(expansion.decision==='consent-required'&&pending.length){
    allowAdd.hidden=false;notes.push('还需创建 '+pending.map(x=>domainNames[x.domain]+' '+(x.target-x.current)+' 段').join('、')+'。按所选简历顺序自动添加并填写，之后复用此设置；不删除、不提交。');
   }
   if(absent.length)notes.push('当前资料中未识别到 '+absent.map(x=>domainNames[x.domain]).join('、')+' 的可用记录。'+(result.readiness?.needsRepair?'请先整理已有资料，确认后继续。':'可从已填页面建立记录，或核对已有原稿中缺少的部分。'));
   if(broken.length)notes.push(broken.map(x=>domainNames[x.domain]).join('、')+' 的新增结构未确认，已跳过；其他可填项照常处理。');
   if(notes.length){additionNote.hidden=false;additionNote.textContent=notes.join('\n');}
  }
  showReadiness(result.readiness);
  if(details)details.open=false;controls();
 }
 function finished(report){clear();message.textContent=report.verified?'这项资料已填写并回读通过。其余空白项可继续点“填写简历”。':'这项未通过回读，请核对网页；未自动重试。';show();}
 globalThis.__resumeLocalAssistant={version:'0.15.0',open,destroy,finished,taskFinished,uiState:s=>{if(s.state==='ready'){message.textContent='资料核对界面已打开；按经历核对后继续。';}else if(s.state==='timeout'||s.state==='denied'){message.textContent=s.state==='denied'?'浏览器拒绝打开核对界面；表单保留当前状态。':'尚未确认核对界面已打开。请从工具栏打开资料页；本次不会反复创建窗口。';show();}},progress:stage=>{const labels={adding:'正在补足已允许的经历卡片…',scanning:'正在识别记录和字段…',filling:'正在填写并回读…'};if(labels[stage]){message.textContent=labels[stage];quick.textContent=labels[stage];}},remembered:n=>{clear();message.textContent=`已记住 ${n} 条补充资料，仅保存在本地。下次点击填写简历会继续使用。`;show();}};open();
})();
