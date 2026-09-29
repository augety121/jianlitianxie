// No network or page DOM access. Only a short-lived worker ticket can read candidates.
const $=id=>document.getElementById(id),ticket=new URL(location.href).searchParams.get('ticket');
let data=null,selected='',busy=false,done=false;
async function send(type,extra={}){
 const response=await chrome.runtime.sendMessage({type:'local-picker-'+type,ticket,...extra});
 if(!response||response.error)throw Error(response?.error||'补填窗口已断开，请在简历页重新打开');return response.data;
}
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function render(){
 const q=$('search').value.trim().toLocaleLowerCase();$('choices').replaceChildren();
 const facts=(data?.facts||[]).filter(f=>[f.label,f.section,f.entity].join(' ').toLocaleLowerCase().includes(q));
 for(const f of facts.slice(0,40)){
  const button=document.createElement('button');button.type='button';button.className='choice';button.setAttribute('aria-pressed',String(selected===f.id));button.disabled=busy||done;
  const title=document.createElement('strong');title.textContent=f.label;
  const record=document.createElement('small');record.textContent=[f.section,f.entity,f.exact?'字段名匹配':'手动指定'].filter(Boolean).join(' / ');button.append(title,record);
  button.onclick=e=>{if(!e.isTrusted||busy||done)return;selected=f.id;$('value').textContent=(f.variantName&&f.variantName!=='原文'?`将使用${f.variantName}（${f.value.length}字）\n\n`:'')+f.value;$('preview').hidden=false;render();if(f.fitsTextLimit===false)notify('现有正文超过上限，请返回资料页补充短版。',true);};$('choices').append(button);
 }
 $('apply').hidden=$('search').hidden=done;document.querySelector('label[for=search]').hidden=done;document.querySelector('.note').hidden=done;
 $('more').textContent=done?'':facts.length>40?`共 ${facts.length} 项，显示前40项；请搜索缩小范围。`:facts.length?`${facts.length} 条可选择资料`:'没有可用资料。请取消返回，手动填写此项或在“我的资料”补充。';
 $('apply').disabled=busy||done||!selected;$('search').disabled=busy||done;
}
$('search').oninput=render;
$('apply').onclick=async e=>{
 if(!e.isTrusted||busy||done||!selected)return;busy=true;render();notify('正在把这一条资料填入原申请页面…');
 try{const r=await send('fill',{factId:selected,reviewed:true});done=true;data=null;selected='';$('value').textContent='';$('preview').hidden=true;
  notify(r.verified?'已经填入并回读通过。关闭小窗即可继续填写简历。':'没有通过回读，请核对网页中的内容；不会重复填写。',!r.verified);$('close').textContent='返回简历';
 }catch(error){notify(error.message,true);}finally{busy=false;render();}
};
$('close').onclick=async e=>{if(e.isTrusted&&!busy){await send('close').catch(()=>{});window.close();}};
try{
 for(let attempt=0;attempt<8;attempt++){try{data=await send('read');break;}catch(e){if(attempt===7||!/小窗正在打开|另一项任务/.test(e.message))throw e;await new Promise(r=>setTimeout(r,75));}}
 $('field').textContent=data.label;$('scope').textContent=[data.section,data.origin].filter(Boolean).join(' · ');render();
 notify('选择正确经历的资料，核对下方内容，然后确认填写。');
}catch(error){notify(error.message,true);}
window.addEventListener('pagehide',()=>{data=null;selected='';$('value').textContent='';$('choices').replaceChildren();});
