import {acknowledgeUi} from './ui-ready.mjs';
import {readinessText} from './core/profile-readiness.mjs';
await acknowledgeUi();
const $=id=>document.getElementById(id),ticket=new URLSearchParams(location.search).get('ticket');
let items=[],busy=false,closed=false;
const selections=new Map();
async function request(action,extra={}){
 const r=await chrome.runtime.sendMessage({type:'local-learn-'+action,ticket,...extra});
 if(!r||r.error)throw Error(r?.error||'后台已重新启动，请从申请页重新打开');return r.data;
}
function clear(){items=[];selections.clear();$('items').replaceChildren();$('save').disabled=true;}
function notice(text){$('notice').textContent=text;}
function refresh(){ $('save').disabled=busy||!selections.size; }
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
async function load(){
 let data;
 // The UI can load before windows.create returns its tab ID. Retry only this read.
 for(let n=0;n<5;n++){try{data=await request('read');break;}catch(e){if(n===4||!e.message.includes('正在打开'))throw e;await new Promise(r=>setTimeout(r,80));}}
 if(closed)return;
 items=data.items;notice(`检测到 ${items.length} 条补充内容。${data.omitted?'部分字段已变化或格式未通过，没有纳入。':''}`);
 const groups=new Map();
 for(const item of items){const key=item.recordRequired?(item.section+'|'+(item.groupId||item.id)):'basic';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 for(const rows of groups.values()){
  const group=node('section',null,'record-group');group.append(node('h2',rows[0].recordRequired?rows[0].section:'基本资料'));
  let entity=rows[0].entity||'';
  if(rows[0].recordRequired){
   const prompt=node('label','这段经历的名称（本组字段共用）'),input=document.createElement('input');input.className='entity';input.value=entity;input.maxLength=200;
   input.setAttribute('aria-label',rows[0].section+' 所属经历');input.placeholder='核对或填写这段经历的名称';prompt.append(input);group.append(prompt);
   input.oninput=()=>{entity=input.value.trim();for(const row of rows)if(selections.has(row.id))selections.set(row.id,{id:row.id,entity});refresh();};
  }
  for(const item of rows){
   const row=node('article',null,'item'),label=node('label'),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','保存 '+item.label);
   const blocked=['duplicate','conflict'].includes(item.state);check.disabled=blocked;check.checked=!blocked&&!item.sensitive&&(!item.recordRequired||!!entity);
   if(check.checked)selections.set(item.id,{id:item.id,entity});
   label.append(check,node('span',item.label));row.append(label,node('pre',item.value));
   if(blocked)row.append(node('p',item.state==='duplicate'?'资料库已有相同内容，无需重复保存。':'与已有资料不同，本次不会覆盖；请到“我的资料”核对后修改。','warn'));
   if(item.sensitive)row.append(node('p','敏感条目默认不选；确认需要保存后再勾选。','warn'));
   check.onchange=()=>{check.checked?selections.set(item.id,{id:item.id,entity}):selections.delete(item.id);refresh();};group.append(row);
  }
  $('items').append(group);
 }
 refresh();
}
$('save').onclick=async e=>{
 if(!e.isTrusted||busy||!selections.size)return;
 if([...selections.values()].some(s=>items.find(i=>i.id===s.id)?.recordRequired&&!s.entity)){notice('请填写所选条目的所属经历，避免下次填到另一段经历。');return;}
 busy=true;refresh();
 try{const r=await request('save',{reviewed:true,selections:[...selections.values()],reuse:$('reuse').checked,acceptPlaintext:true});clear();notice(`已新增保存 ${r.saved} 条到本地。${readinessText(r.readiness)}网页未被修改或提交。`);$('cancel').textContent='完成，返回简历';}
 catch(error){notice(error.message);}finally{busy=false;refresh();}
};
$('cancel').onclick=async e=>{if(!e.isTrusted||busy)return;closed=true;clear();await request('close').catch(()=>{});window.close();};
window.addEventListener('pagehide',()=>{closed=true;clear();request('close').catch(()=>{});});
load().catch(e=>{clear();notice(e.message);});
