/* Local in-page entry. No network, storage, private profile or arbitrary tool execution.
 * Only explicit trusted clicks can request a scan or approve the displayed ordinary fields.
 */
(()=>{
  if(window!==window.top||!/^https?:$/.test(location.protocol))return;
  const previous=globalThis.__resumeLocalAssistant;
  if(previous?.version==='0.8.2'){previous.open();return;}
  previous?.destroy();
  const host=document.createElement('div');host.id='resume-local-assistant';
  host.style.cssText='all:initial!important;position:fixed!important;right:18px!important;bottom:20px!important;z-index:2147483646!important;display:block!important;';
  const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=`:host{all:initial}*{box-sizing:border-box}button{font:600 13px/1.4 system-ui,sans-serif;cursor:pointer;border:0;border-radius:10px;padding:11px 14px;background:#087f70;color:#fff}button:disabled{opacity:.45;cursor:default}button:focus-visible{outline:3px solid #d2a800;outline-offset:2px}.panel{width:min(360px,calc(100vw - 36px));font:14px/1.6 system-ui,'Microsoft YaHei',sans-serif;color:#18364c;background:#fff;border:1px solid #cbdde4;box-shadow:0 12px 48px #193e5233;border-radius:18px;overflow:hidden}.head{padding:15px 18px;background:#f0f8f6;display:flex;justify-content:space-between;align-items:center}.head strong{font-size:17px}.head small{display:block;color:#526f71;font-size:11px}.close,.subtle{color:#275d67;background:#edf4f7}.body{padding:14px 18px}.message{margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}.counts{font-size:12px;color:#56707c;padding:8px 0}.list{max-height:170px;overflow-y:auto;margin:6px 0 12px;padding:0 0 0 20px;font-size:12px}.list li{padding:3px 0;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap}.primary{flex:1}.links{display:flex;gap:8px;padding-top:10px}.note{font-size:11px;color:#637782;margin:12px 0 0}.pill{display:flex;gap:6px;box-shadow:0 5px 22px #193e5233;border-radius:12px;background:#fff;padding:3px}.danger{background:#a4312a}[hidden]{display:none!important}`;
  const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
  const panel=n('section',null,'panel'),head=n('div',null,'head'),title=n('div');
  title.append(n('strong','本地简历速填'),n('small','在这张申请表上操作 · 不自动提交'));
  const close=n('button','收起','close');close.type='button';head.append(title,close);
  const body=n('div',null,'body'),message=n('p','正在检查本地资料…','message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const counts=n('div',null,'counts'),list=n('ol',null,'list'),actions=n('div',null,'actions');
  const scan=n('button','扫描本页','primary'),fill=n('button','填写普通可填项','primary'),manage=n('button','资料 / 逐项核对','subtle'),stop=n('button','停止填写','danger');
  for(const b of [scan,fill,manage,stop])b.type='button';
  const links=n('div',null,'links');links.append(manage);actions.append(scan,fill);body.append(message,counts,list,actions,links,n('p','使用你已核实的本地资料。不会覆盖已有内容；敏感项请在工作台单独选择。','note'));panel.append(head,body);
  const pill=n('div',null,'pill'),reopen=n('button','简历速填');reopen.type='button';pill.append(reopen,stop);pill.hidden=true;stop.hidden=true;fill.hidden=true;list.hidden=true;
  root.append(style,panel,pill);document.documentElement.append(host);
  let plan=null,busy=false,dead=false,generation=0,observedUrl=location.href;
  const validClick=e=>{
    if(!e.isTrusted||dead||document.visibilityState==='hidden')return false;
    if(e.detail===0)return document.activeElement===host;
    return document.elementFromPoint(e.clientX,e.clientY)===host;
  };
  async function send(type,data={}){
    const r=await chrome.runtime.sendMessage({type:'page-local-'+type,...data});
    if(!r)throw Error('插件已更新或后台未响应，请再点浏览器工具栏插件图标。');
    if(r.error)throw Error(r.error);return r.data;
  }
  function clear(){plan=null;fill.disabled=true;fill.hidden=true;list.replaceChildren();list.hidden=true;counts.textContent='';}
  function show(){panel.hidden=false;pill.hidden=true;}
  function collapse(){panel.hidden=true;pill.hidden=false;}
  function error(e){clear();message.textContent=e.message||'本次操作未完成，请到工作台检查；不要重复填写。';show();}
  function render(p){
    plan=p;show();counts.textContent=`扫描 ${p.total} 项 · 可填 ${p.counts.ready} · 未匹配 ${p.counts.missing} · 人工 ${p.counts.manual} · 保留 ${p.counts.preserve}`;
    message.textContent=p.message;list.replaceChildren();
    for(const f of p.quick)list.append(n('li',[f.section,f.label].filter(Boolean).join(' / ')));
    list.hidden=!p.quick.length;fill.hidden=!p.quick.length;fill.disabled=!p.quick.length;
    fill.textContent=`确认填写上面 ${p.quick.length} 项`;
    if(p.more)message.textContent+=`\n另有 ${p.more} 项请到工作台逐项核对。`;
    manage.textContent=p.counts.missing||p.counts.manual?'查看未匹配项 / 选资料':'资料 / 逐项核对';
  }
  async function open(){
    show();if(busy)return;
    if(observedUrl!==location.href){observedUrl=location.href;clear();}
    const g=++generation;
    try{const s=await send('status');if(dead||g!==generation)return;
      if(s.mode!=='local'){clear();message.textContent='当前是高级 MCP 模式。打开工作台切回本地后再扫描。';scan.disabled=true;}
      else{scan.disabled=false;if(!s.hasProfile){clear();message.textContent='尚未保存本地资料。先导入并确认一次，再回到这里扫描、填写。';manage.textContent='导入本地资料';}
        else if(!plan)message.textContent='资料已在本机。点击“扫描本页”，核对字段清单后即可在这里填写。';}
    }catch(e){if(!dead&&g===generation)error(e);}
  }
  scan.onclick=async e=>{
    if(!validClick(e)||busy)return;busy=true;const g=++generation;clear();scan.disabled=true;manage.disabled=true;message.textContent='正在扫描这张申请表…';
    try{const p=await send('scan');if(!dead&&g===generation)render(p);}catch(e){if(!dead&&g===generation)error(e);}finally{busy=false;scan.disabled=false;manage.disabled=false;}
  };
  fill.onclick=async e=>{
    if(!validClick(e)||busy||!plan||!plan.quick.length)return;
    if(Date.now()>=plan.expiresAt){clear();message.textContent='预览已过期，请重新扫描。';return;}
    const id=plan.id,g=++generation;busy=true;fill.disabled=true;scan.disabled=true;manage.disabled=true;stop.hidden=false;reopen.textContent='填写中';collapse();
    try{const r=await send('fill',{planId:id,reviewed:true});if(dead||g!==generation)return;
      clear();message.textContent=`回读通过 ${r.counts.verified||0} 项；未提交。`;
      const other=Object.entries(r.counts).filter(([k])=>k!=='verified').reduce((n,[,v])=>n+v,0);
      if(other)message.textContent+=`\n另有 ${other} 项需要核对。打开工作台查看问题日志，不会自动重试。`;
      else message.textContent+='\n请检查网页上的内容。其他区块展开后再扫描。';show();
    }catch(e){if(!dead&&g===generation)error(e);}finally{busy=false;stop.hidden=true;scan.disabled=false;manage.disabled=false;reopen.textContent='简历速填';}
  };
  manage.onclick=async e=>{if(!validClick(e)||busy)return;try{await send('manage');}catch(e){error(e);}};
  stop.onclick=async e=>{if(!validClick(e))return;stop.disabled=true;try{await send('stop');message.textContent='已请求停止；已写入内容不会撤销，等待回读。';}catch(e){error(e);}finally{stop.disabled=false;}};
  close.onclick=e=>{if(validClick(e))collapse();};reopen.onclick=e=>{if(validClick(e))open();};
  const moved=()=>{observedUrl=location.href;if(!busy){clear();message.textContent='页面已切换，请重新扫描当前申请表。';}};
  window.addEventListener('popstate',moved);window.addEventListener('hashchange',moved);
  function destroy(){dead=true;generation++;host.remove();window.removeEventListener('popstate',moved);window.removeEventListener('hashchange',moved);}
  globalThis.__resumeLocalAssistant={version:'0.8.2',open,destroy};open();
})();
