const $=id=>document.getElementById(id),ticket=new URLSearchParams(location.search).get('ticket');
let groups=[],busy=false,done=false;
async function send(action,extra={}) {
  const r=await chrome.runtime.sendMessage({type:'local-records-'+action,ticket,...extra});
  if(!r||r.error)throw Error(r?.error||'后台连接已中断，请回申请页重新操作');return r.data;
}
function say(text){$('state').textContent=text;}
async function read(){
  let data;
  for(let i=0;i<6;i++){
    try{data=await send('read');break;}catch(e){if(i===5||!/尚未就绪/.test(e.message))throw e;await new Promise(r=>setTimeout(r,100));}
  }
  groups=data.groups;$('origin').textContent=data.origin;$('groups').replaceChildren();
  for(const [index,g] of groups.entries()){
    const row=document.createElement('label');row.className='record';
    const title=document.createElement('strong');title.textContent=(g.section||'经历')+' · 页面第'+(index+1)+'段';
    const detail=document.createElement('small');detail.textContent='此记录内 '+g.fieldIds.length+' 个字段统一对应';
    const select=document.createElement('select');select.dataset.group=g.id;select.setAttribute('aria-label',title.textContent);
    const empty=document.createElement('option');empty.value='';empty.textContent='暂不分配，留给我手动填写';select.append(empty);
    for(const c of g.candidates){const option=document.createElement('option');option.value=c.entity;option.textContent=c.entity;select.append(option);}
    row.append(title,detail,select);$('groups').append(row);
  }
  $('continue').disabled=false;say('不想填写的记录保留“暂不分配”，不会影响其他已确认字段。');
}
$('review').onsubmit=async event=>{
  event.preventDefault();if(!event.isTrusted||busy||done)return;
  const bindings=[...document.querySelectorAll('select[data-group]')].filter(s=>s.value).map(s=>({groupId:s.dataset.group,entity:s.value}));
  const keys=bindings.map(b=>groups.find(g=>g.id===b.groupId).scope+'|'+b.entity);
  if(new Set(keys).size!==keys.length){say('同一段资料选了两次，请调整后再确认。');return;}
  busy=true;$('continue').disabled=true;$('cancel').disabled=true;say('正在填写并核对，未提交申请…');
  try{const result=await send('fill',{bindings,reviewed:true});done=true;say(`回读通过 ${result.counts?.verified||0} 项。请返回申请页检查，最后由你提交。`);$('groups').replaceChildren();$('continue').hidden=true;$('cancel').textContent='关闭并返回申请页';}
  catch(e){say(e.message);}
  finally{busy=false;$('cancel').disabled=false;if(!done)$('continue').disabled=false;}
};
$('cancel').onclick=async event=>{if(!event.isTrusted||busy)return;if(!done)await send('close').catch(()=>{});done=true;window.close();};
window.addEventListener('pagehide',()=>{if(!busy&&!done)send('close').catch(()=>{});});
read().catch(e=>say(e.message));
