import {CODES,versionString} from './core/diagnostics.mjs';
const $=id=>document.getElementById(id),VERSION=versionString(chrome.runtime.getManifest().version);
const actions={scan:'扫描与匹配',fill:'授权填写与回读',remap:'字段映射',bind:'经历绑定',locate:'网页定位',stop:'停止填写',lock:'锁定资料',unlock:'解锁资料',create:'创建资料库',save:'保存资料',restore:'恢复备份',password:'更换口令',share:'分享给 MCP',revoke:'撤销分享',pair:'本机配对',local:'切换本地',legacy:'切换旧 MCP',import:'导入',preset:'资料方案',copy:'复制',ui:'界面异常'};
const stages={start:'开始',finish:'结束',field:'字段结果',checkpoint:'检查点'};
const states={running:'已开始',ok:'已返回',error:'失败',partial:'有待处理项',ready:'可填写',missing:'未匹配',manual:'人工处理',preserve:'保留已有',verified:'回读通过',invalid:'校验未通过',stale:'已过期或变化','needs-user':'请核对',cancelled:'取消','not-attempted':'未尝试'};
let state={events:[],enabled:false,dropped:0},page=0,revision=0;
const problem=e=>!['ok','running','verified','ready','preserve'].includes(e.state);
function text(tag,s){const n=document.createElement(tag);n.textContent=s;return n;}
function notice(s,error=false){$('notice').textContent=s;$('notice').dataset.error=String(error);}
async function send(type,extra={}){
 let timer;
 try {const r=await Promise.race([chrome.runtime.sendMessage({type:'diagnostics-'+type,...extra}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('诊断存储响应超时；填写不会因此自动重试')),8000);})]);if(!r||r.error)throw Error(r?.error||'诊断页与后台已断开，请重新加载扩展');return r.data;}
 finally{clearTimeout(timer);}
}
function render(){
 $('version').textContent='插件 '+VERSION;
 $('captureState').textContent=state.enabled?'正在记录':'记录已停止';
 $('captureHint').textContent=state.enabled?'约 '+Math.max(0,Math.ceil((state.until-Date.now())/60000))+' 分钟后到期；不会记录简历正文。':'默认不记录。开启后重现问题，再停止并导出。';
 $('start').disabled=state.enabled;$('stop').disabled=!state.enabled;
 $('count').textContent=state.events.length;$('errors').textContent=state.events.filter(e=>e.phase==='finish'&&problem(e)).length;$('dropped').textContent=state.dropped||0;
 const starts=new Set(state.events.filter(e=>e.phase==='start').map(e=>e.trace)),ends=new Set(state.events.filter(e=>e.phase==='finish').map(e=>e.trace));
 $('unfinished').textContent=[...starts].filter(t=>!ends.has(t)).length;
 const selected=$('trace').value,traces=new Map();for(const e of state.events)if(!traces.has(e.trace))traces.set(e.trace,e);
 $('trace').replaceChildren();const all=text('option','全部操作');all.value='';$('trace').append(all);
 for(const [id,e] of traces){const o=text('option',`${actions[e.action]||e.action} · ${id.slice(2,10)} · ${e.channel}`);o.value=id;$('trace').append(o);}
 if(traces.has(selected))$('trace').value=selected;
 const filtered=state.events.filter(e=>(!$('trace').value||e.trace===$('trace').value)&&($('filter').value==='all'||problem(e)));
 const pages=Math.max(1,Math.ceil(filtered.length/30));page=Math.min(page,pages-1);$('events').replaceChildren();
 const first=state.events[0]?.at||0;
 for(const e of filtered.slice(page*30,page*30+30)){
  const card=text('article','');card.className='event';card.dataset.problem=String(problem(e));
  const top=text('div','');top.className='event-top';top.append(text('h3',`${actions[e.action]||e.action} · ${stages[e.phase]}${e.ordinal?' · #'+e.ordinal:''}`),text('time',`+${((e.at-first)/1000).toFixed(2)}s · ${e.channel}`));
  const status=text('p',`${states[e.state]||e.state}${e.kind?' · '+e.kind:''}${e.durationMs!==undefined?' · '+e.durationMs+' ms':''}${e.count!==undefined?' · '+e.count+' 项':''}`);
  const code=text('p',`${e.trace.slice(2,10)} / ${e.code} / 记录版本 ${e.appVersion||VERSION}`);code.className='code';
  card.append(top,status,code);if(problem(e)){const help=text('div',CODES[e.code]?.[1]||CODES.INTERNAL[1]);help.className='help';card.append(help);}
  $('events').append(card);
 }
 if(!filtered.length){const empty=text('div','尚无对应记录。开启诊断，再到工作台复现问题。');empty.className='empty';$('events').append(empty);}
 $('pageInfo').textContent=`${filtered.length} 条 · ${page+1}/${pages} 页`;$('previous').disabled=page===0;$('next').disabled=page+1>=pages;
 if(state.storageFailed)notice('诊断写入曾失败，日志可能缺失；这不代表填写需要重试。',true);
}
async function refresh(){const request=++revision;const next=await send('state');if(request!==revision)return;state=next;render();}
function click(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){notice(e.message,true);}};}
click('start',async()=>{++revision;state=await send('configure',{enabled:true});render();notice('已开启。回到工作台复现一次问题，完成后点击“停止记录”。');});
click('stop',async()=>{++revision;state=await send('configure',{enabled:false});render();notice('记录已停止。现在可以预览和导出。');});
click('clear',async()=>{if(!confirm('清空所有诊断并停止记录？不会删除简历资料。'))return;++revision;state=await send('clear');$('jsonPreview').textContent='日志已清空。';render();notice('已清空并停止，旧操作不会补回已清理日志。');});
click('refresh',refresh);click('previous',()=>{page--;render();});click('next',()=>{page++;render();});
$('trace').onchange=$('filter').onchange=()=>{page=0;render();$('jsonPreview').textContent='范围已改变，请重新预览。';};
async function preview(){const report=await send('export',{trace:$('trace').value});$('jsonPreview').textContent=JSON.stringify(report,null,2);$('previewBox').open=true;return report;}
click('preview',preview);
click('export',async()=>{const report=await preview();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`resume-diagnostics-${VERSION}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(`已导出 ${report.events.length} 条白名单事件；没有自动上传。`);});
await refresh().then(()=>notice('诊断就绪。先开启记录，再到工作台复现问题。')).catch(e=>notice(e.message,true));
// Reads only while this explicit diagnostics page is visible. It does not keep the worker alive forever.
setInterval(()=>{if(!document.hidden)refresh().catch(e=>notice(e.message,true));},5000);
