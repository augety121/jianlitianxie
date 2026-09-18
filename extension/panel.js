import {withDeadline} from './core/execution-deadline.mjs';
const $=id=>document.getElementById(id);const tabId=Number(new URLSearchParams(location.search).get('tab'));
let token='',plan=null,busy=false,loop=null,eventWait=null,cancelRequested=false;const API='http://127.0.0.1:19327';
async function api(route,data,options={}){
 if(route!=='/status' && (await chrome.storage.local.get('resumeMode')).resumeMode!=='mcp') {
  loop?.stop(); throw Error('当前为本地模式；旧面板不会读取或发送资料。需主动连接旧 MCP 模式。');
 }
 if(['/plan','/begin','/cancel','/result'].includes(route))route+='?owner='+tabId;
 const timeout=AbortSignal.timeout(options.timeout||8000);
 const controller=new AbortController(),abort=()=>controller.abort();
 timeout.addEventListener('abort',abort,{once:true});options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)abort();
 try{
 let r;try{r=await fetch(API+route,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});}catch{throw Error('未连上本机服务：请在Codex重新连接resume_fill MCP，再点连接。');}
 const body=await r.json().catch(()=>({}));
 if(!r.ok){if(r.status===401)throw Error('配对码不正确，请重新复制本机 bridge-token.txt 的完整内容。');if(r.status===403)throw Error('来源校验被旧版桥接拒绝：请在Codex重新连接resume_fill MCP，加载更新后再连接。');throw Error(body.error||'本机服务错误（'+r.status+'）');}
 return body;
 }finally{timeout.removeEventListener('abort',abort);options.signal?.removeEventListener('abort',abort);}
}
async function engine(action,arg){const tab=await chrome.tabs.get(tabId);if(!/^https?:/.test(tab.url||''))throw Error('请从岗位网页点击扩展图标');await chrome.scripting.executeScript({target:{tabId},files:['engine.js']});const r=await chrome.scripting.executeScript({target:{tabId},func:(a,b)=>globalThis.__resumeFillEngine[a](b),args:[action,arg??null]});return r[0].result;}
function show(p){plan=p;$('empty').hidden=!!p;$('approve').disabled=!p||!p.entries.some(x=>x.status==='ready');$('table').replaceChildren();$('missing').replaceChildren();if(!p){$('target').textContent='';$('summary').textContent='';return;}
 $('target').textContent=p.url;$('summary').textContent=`待填 ${p.entries.filter(x=>x.status==='ready').length} 项，保留 ${p.entries.filter(x=>x.status==='preserve').length} 项，待处理 ${p.entries.filter(x=>['missing','manual'].includes(x.status)).length} 项`;
 const table=document.createElement('table');const head=document.createElement('tr');for(const t of ['填写','字段 / 分区','本地内容','来源 / 原因']){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);
 for(const entry of p.entries){const tr=document.createElement('tr');const check=document.createElement('input');check.type='checkbox';check.checked=entry.status==='ready';check.disabled=entry.status!=='ready';check.onchange=()=>entry.status=check.checked?'ready':'skipped';
  const cells=[check,`${entry.label}\n${entry.section||''}`,entry.status==='ready'?entry.value:entry.status==='preserve'?'已填写，保留原值':'留空',entry.source||entry.reason];for(const v of cells){const td=document.createElement('td');if(v instanceof Node)td.append(v);else td.textContent=v;tr.append(td);}table.append(tr);
  if(['missing','manual'].includes(entry.status)){const li=document.createElement('li');li.textContent=entry.label+'：'+entry.reason;$('missing').append(li);}
 }$('table').append(table);
}

async function scan(commandId){
 if(busy)return;busy=true;$('scan').disabled=true;show(null);
 try{const snapshot=await engine('scan');const response=await api('/snapshot',{snapshot:{...snapshot,owner:String(tabId),shareWithCodex:true},commandId,prepare:true});show(response.plan);$('result').textContent=snapshot.limitations.join('；');}
 finally{busy=false;$('scan').disabled=false;}
}
function handle(fn){return async()=>{try{await fn();}catch(e){$('status').textContent=e.message;$('status').dataset.state='error';}};}
function startLoop(){
 loop?.stop();
 loop=globalThis.__resumePollLoop({
  poll:async isActive=>{while(busy&&isActive())await new Promise(r=>setTimeout(r,50));if(!isActive())return {commands:[]};return api('/poll?owner='+tabId);},
  wait:async after=>{const controller=new AbortController();eventWait=controller;try{return await api('/events?owner='+tabId+'&after='+after+'&wait=20000',undefined,{signal:controller.signal,timeout:23000});}finally{if(eventWait===controller)eventWait=null;}},
  stopWait:()=>eventWait?.abort(),
  onError:(e,retry)=>{$('status').textContent=e.message+`；${Math.ceil(retry/1000)}秒后仅重连通知，不重试填写`;$('status').dataset.state='error';},
  handle:async response=>{
   if(response.selected===false){if(!busy)show(null);$('status').textContent='另一个标签页是当前共享目标；扫描本页可切换';return;}
   $('status').textContent='已连接 · 事件通知已启用 · 不自动提交';$('status').dataset.state='ok';$('count').textContent=`${response.profileCount} 条本地事实`;
   for(const c of response.commands||[]){
    while(busy)await new Promise(r=>setTimeout(r,50));
    if(!loop.running)break;
    if(c.type==='scan')await scan(c.id);
    if(c.type==='review')show(await api('/plan'));
    if(c.type==='fill'){const p=await api('/plan');if(!p||p.id!==c.planId)throw Error('Codex计划已过期');show({...p,entries:p.entries.map(e=>({...e,status:c.fieldIds.includes(e.fieldId)?e.status:'skipped'}))});await fill();}
   }
  }
 });loop.start();
}
$('connect').onclick=handle(async()=>{
 const switched=await chrome.runtime.sendMessage({type:'workspace-legacy'});
 if(!switched || switched.error)throw Error(switched?.error || '请重新加载扩展后连接');
 token=$('token').value.trim();if(!token)throw Error('请先粘贴本机配对码');loop?.stop();const status=await api('/status');
 if(status.transport!==2)throw Error('需要更新并重启 0.3.2 resume_fill 桥接，不要关闭无关 Node 程序');
 await chrome.storage.local.set({bridgeToken:token});startLoop();await catalog();
});
$('scan').onclick=handle(()=>scan());
async function fill(){
 if(!plan||busy)return;
 const requested=plan,fieldIds=requested.entries.filter(e=>e.status==='ready').map(e=>e.fieldId);if(!fieldIds.length)throw Error('请勾选至少一项');
 busy=true;cancelRequested=false;$('approve').disabled=true;$('scan').disabled=true;$('cancelFill').disabled=false;let begun=false;
 try{
  const {plan:approved}=await api('/begin',{planId:requested.id,fieldIds,url:requested.url});begun=true;
  if(cancelRequested)throw Error('本人已停止');
  const report=await withDeadline(approved,()=>engine('apply',approved),()=>engine('cancel'));const receipt=await api('/result',{...report,planId:requested.id});
  $('result').textContent=`回读通过 ${report.results.filter(x=>x.status==='verified').length} 项；需核对 ${report.results.filter(x=>x.status!=='verified').length} 项。未提交。`+(receipt.warning||'');
  $('missing').replaceChildren();for(const r of report.results.filter(x=>x.status!=='verified')){const li=document.createElement('li');li.textContent=(requested.entries.find(x=>x.fieldId===r.fieldId)?.label||r.fieldId)+'：'+(r.reason||r.status);$('missing').append(li);}
 }catch(e){if(begun)await api('/cancel',{planId:requested.id,executionStopped:true}).catch(()=>{});$('result').textContent='结果需核对，未自动重试；请检查网页已填内容。';throw e;}
 finally{plan=null;busy=false;$('approve').disabled=true;$('scan').disabled=false;$('cancelFill').disabled=true;}
}
$('approve').onclick=handle(fill);
$('cancelFill').onclick=handle(async()=>{if(!plan)return;const planId=plan.id;cancelRequested=true;$('cancelFill').disabled=true;await engine('cancel');await api('/cancel',{planId});if(plan?.id===planId)$('result').textContent='已请求停止；已写入内容不会撤销，等待回读。';});
$('import').onchange=handle(async()=>{const f=$('import').files[0];if(!f)return;const p=JSON.parse(await f.text());await api('/profile',p);$('count').textContent=p.facts.length+' 条事实已导入';show(null);});
let profileFacts=[];
function renderProfile(){const q=$('profileSearch').value.trim().toLowerCase();$('profileList').replaceChildren();for(const f of profileFacts.filter(f=>[f.label,f.entity,f.section,f.value].join(' ').toLowerCase().includes(q))){const card=document.createElement('div');card.className='profile-fact';const title=document.createElement('strong');title.textContent=[f.section,f.entity,f.label].filter(Boolean).join(' / ');const v=document.createElement('p');v.textContent=f.value;const note=document.createElement('small');note.textContent=(f.confirmed===false?'仅参考，不自动填写 · ':'可复用 · ')+(f.source||'来源待补充');card.append(title,v,note);$('profileList').append(card);}}
$('profileSearch').oninput=renderProfile;
$('profile').onclick=handle(async()=>{$('profileBrowse').hidden=!$('profileBrowse').hidden;if(!$('profileBrowse').hidden){const p=await api('/profile');profileFacts=p.facts;$('profileText').value=JSON.stringify(p,null,2);renderProfile();}await catalog();});
async function catalog(){const p=await api('/profile');$('shareFacts').replaceChildren();for(const f of p.facts){const o=document.createElement('option');o.value=f.id;o.textContent=`${f.id} ${f.entity||f.section||''} ${f.label}`;$('shareFacts').append(o);}}
$('remap').onclick=handle(async()=>{show(await api('/plan',{mappings:JSON.parse($('mappings').value)}));});
$('share').onclick=handle(async()=>{const ids=[...$('shareFacts').selectedOptions].map(x=>x.value);if(!ids.length)throw Error('先点击查看资料并选择要分享的条目');await api('/share',{ids});$('status').textContent='已授权所选资料本次分享，5分钟内有效';});
$('saveProfile').onclick=handle(async()=>{await api('/profile',JSON.parse($('profileText').value));show(null);$('status').textContent='本地资料已更新';});
async function records(){const {records=[]}=await chrome.storage.local.get('records');$('records').textContent=records.map(r=>`${r.date} ${r.company} ${r.role} ${r.stage}`).join('\n');return records;}
$('record').onclick=handle(async()=>{const list=await records();list.unshift({company:$('company').value,role:$('role').value,stage:$('stage').value,date:new Date().toISOString().slice(0,10)});await chrome.storage.local.set({records:list});await records();});
$('export').onclick=handle(async()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(await records(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='投递记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
if(chrome?.storage?.local)chrome.storage.local.get('bridgeToken').then(s=>{if(s.bridgeToken){$('token').value=s.bridgeToken;$('status').textContent='配对码已在本机保存。点击连接将主动切换至旧 MCP 明文资料模式。';}});if(chrome?.storage?.local)records();

$('forgetToken').onclick=handle(async()=>{loop?.stop();await chrome.storage.local.remove('bridgeToken');await chrome.storage.session.remove('bridgeToken');token='';$('token').value='';$('status').textContent='已清除本机配对码';});

$('enableSite').onclick=handle(async()=>{const tab=await chrome.tabs.get(tabId);const u=new URL(tab.url);if(!/^https?:$/.test(u.protocol))throw Error('请从招聘网页打开设置');const origin=u.origin+'/*';const allowed=await chrome.permissions.request({origins:[origin]});if(!allowed)throw Error('未开启该网站权限');const id='resume-'+u.hostname.replace(/[^a-z0-9]/gi,'-');const registered=await chrome.scripting.getRegisteredContentScripts({ids:[id]});if(registered.length)await chrome.scripting.unregisterContentScripts({ids:[id]});await chrome.scripting.registerContentScripts([{id,matches:[origin],js:['poll-loop.js','engine.js','widget.js'],runAt:'document_idle',persistAcrossSessions:true}]);await chrome.scripting.executeScript({target:{tabId},files:['poll-loop.js','engine.js','widget.js']});$('status').textContent='已开启：此网站以后自动显示扫描和填写按钮';});

window.addEventListener('pagehide',()=>loop?.stop());
