/* Runs only in an explicitly selected tab. No network, no submit/save clicks. */
(()=>{
 if(globalThis.__resumeFillEngine) return;
 const refs=new Map(); let lastSnapshot;
 const visible=e=>e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
 function roots(root=document){const out=[root];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)out.push(...roots(el.shadowRoot));return out;}
 const text=e=>(e?.textContent||'').trim().replace(/\s+/g,' ').slice(0,200);
 const labelText=e=>{if(!e)return '';const c=e.cloneNode(true);c.querySelectorAll('input,textarea,select,button,[contenteditable]').forEach(n=>n.remove());return text(c);};
 function label(e){
  const named=e.getAttribute('aria-labelledby');
  return (e.labels?.length ? [...e.labels].map(labelText).join(' ') : '') || e.getAttribute('aria-label') || (named?named.split(' ').map(id=>text(document.getElementById(id))).join(' '):'') || labelText(e.closest('.ant-form-item,.el-form-item,.form-group')?.querySelector('label,.ant-form-item-label,.el-form-item__label')) || e.placeholder || e.name || e.id || '未标注字段';
 }
 function section(e){const parent=e.closest('fieldset,section,[data-section],.resume-item,.education-item,.project-item');return (text(parent?.querySelector('legend,h2,h3,h4'))+' '+(parent?.getAttribute('data-entity')||'')).trim();}
 function val(e){if(e.type==='radio'||e.type==='checkbox')return e.checked ? e.value : '';return e.isContentEditable?e.innerText:e.value??'';}
 function scan(){
  refs.clear();const fields=[];let n=0;
  for(const root of roots()) for(const e of root.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"]')){
   if(!visible(e)||e.disabled||e.readOnly||/^(hidden|submit|button|reset|image)$/.test(e.type))continue;
   if(e.getAttribute('role')==='combobox'&&e.querySelector('input'))continue;
   const id='f'+(++n);refs.set(id,e);
   const custom=e.getAttribute('role')==='combobox'&&e.tagName!=='SELECT';
   fields.push({id,label:label(e),section:section(e),type:custom?'custom-select':e.type||e.tagName.toLowerCase(),value:val(e),required:e.required||e.getAttribute('aria-required')==='true',maxLength:e.maxLength>0?e.maxLength:null,options:e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled})):null});
  }
  lastSnapshot={id:crypto.randomUUID(),url:location.href,fields,limitations:[...(document.querySelector('iframe')?['含iframe：当前仅扫描主文档，嵌入表单请单独打开后扫描']:[]),'仅扫描当前已展开且可编辑的字段；折叠/下一页需展开后重新扫描']};return lastSnapshot;
 }
 async function apply(plan){
  if(!lastSnapshot||plan.snapshotId!==lastSnapshot.id||plan.url!==location.href)throw Error('页面或扫描已变化，请重新扫描');
  const results=[];
  for(const p of plan.entries.filter(x=>x.status==='ready')){
   const e=refs.get(p.fieldId);
   if(!e?.isConnected||!visible(e)||e.disabled||e.readOnly||val(e)!==p.oldValue||label(e)!==p.label){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   if(/password|file|hidden|submit|button|checkbox/.test(e.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(label(e))){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   try{
    if(p.kind==='custom-select'){
     const trigger=e.closest('.ant-select')?.querySelector('.ant-select-selector')||e;trigger.click();
     await new Promise(r=>setTimeout(r,120));
     const opts=[...document.querySelectorAll('[role="option"],.ant-select-item-option,.el-select-dropdown__item')].filter(o=>visible(o)&&text(o)===p.value);
     if(opts.length!==1)throw Error('候选不唯一或未展开');opts[0].click();
    }else if(e.type==='radio'){
     if(e.value!==p.value && label(e)!==p.value)throw Error('单选项不匹配'); e.click();
    }else if(e.isContentEditable){e.textContent=p.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.value}));}
    else {const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,p.value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}));}
    results.push({fieldId:p.fieldId,status:'written'});
   }catch {results.push({fieldId:p.fieldId,status:'needs-user'});}
  }
  await new Promise(r=>setTimeout(r,180));
  for(const r of results)if(r.status==='written'){
   const p=plan.entries.find(x=>x.fieldId===r.fieldId),e=refs.get(r.fieldId);
   r.status=e?.isConnected&&String(val(e))===String(p.value)?'verified':'needs-user';
   if(e?.validity&&!e.validity.valid)r.status='invalid';
  }
  return {snapshotId:plan.snapshotId,results,submitted:false,saved:false};
 }
 globalThis.__resumeFillEngine={scan,apply};
})();
