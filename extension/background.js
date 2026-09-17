chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.session.get('bridgeToken').then(async s=>{if(s.bridgeToken&&!(await chrome.storage.local.get('bridgeToken')).bridgeToken)await chrome.storage.local.set({bridgeToken:s.bridgeToken});});
const API='http://127.0.0.1:19327';
async function api(route,data){const {bridgeToken}=await chrome.storage.local.get('bridgeToken');if(!bridgeToken)throw Error('请先打开资料管理面板完成配对');let r;try{r=await fetch(API+route,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+bridgeToken,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});}catch{throw Error('本机服务未连接，请重连 Codex 的 resume_fill MCP');}const p=await r.json().catch(()=>({}));if(!r.ok)throw Error(p.error|| (r.status===401?'配对码错误，请重新配对':'连接失败 '+r.status));return p;}
async function inject(tabId){await chrome.scripting.executeScript({target:{tabId},files:['engine.js','widget.js']});}
async function engine(tabId,action,arg){const r=await chrome.scripting.executeScript({target:{tabId},func:(a,b)=>globalThis.__resumeFillEngine[a](b),args:[action,arg??null]});return r[0].result;}
chrome.action.onClicked.addListener(async tab=>{if(!tab.id||!/^https?:/.test(tab.url||''))return;try{await inject(tab.id);await chrome.storage.session.set({['attach-'+tab.id]:new URL(tab.url).origin});}catch(e){console.warn('Unable to attach resume assistant:',e.message);}});
chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.status!=='complete'||!tab.url)return;chrome.storage.session.get('attach-'+id).then(s=>{if(s['attach-'+id]===new URL(tab.url).origin)return inject(id);}).catch(()=>{});});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||!sender.tab?.id||sender.frameId!==0||!/^https?:/.test(sender.url||''))return;
 const tabId=sender.tab.id;
 (async()=>{
 if(m.type==='resume-manage'){await chrome.tabs.create({url:chrome.runtime.getURL('panel.html')+'?tab='+tabId});return {ok:true};}
 if(m.type==='resume-scan'){const snapshot=await engine(tabId,'scan');await api('/snapshot',{snapshot:{...snapshot,owner:String(tabId),shareWithCodex:!!m.shareWithCodex},commandId:m.commandId});return api('/plan',{});}
 if(m.type==='resume-upload'){if(!m.file||m.file.base64?.length>14000000)throw Error('附件过大（最多10MB）');return engine(tabId,'upload',{...m,url:sender.url});}
 if(m.type==='resume-poll'){return api('/poll?owner='+tabId);}
 if(m.type==='resume-plan'){return api('/plan');}
 if(m.type==='resume-fill'){
 const plan=await api('/plan');if(!plan||plan.id!==m.planId)throw Error('计划已变化，请重新扫描核对');
 if(plan.url!==sender.url)throw Error('计划不属于当前页面，请重新扫描');
 const selected=new Set(m.fieldIds||[]);const reviewed={...plan,entries:plan.entries.map(e=>({...e,status:e.status==='ready'&&selected.has(e.fieldId)?'ready':'skipped'}))};
 await api('/begin',{planId:plan.id});try{const report=await engine(tabId,'apply',reviewed);await api('/result',{...report,planId:plan.id});return report;}catch(e){await api('/cancel',{planId:plan.id}).catch(()=>{});throw e;}
 }
 throw Error('不支持的操作');
 })().then(data=>reply({data})).catch(e=>reply({error:e.message}));return true;
});
