/* Runs only in an explicitly selected tab. No network, no submit/save clicks. */
(()=>{
 if(globalThis.__resumeFillEngine) return;
 const refs=new Map(),radioGroups=new Map(); let lastSnapshot;
 const visible=e=>e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
 function roots(root=document){const out=[root];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)out.push(...roots(el.shadowRoot));return out;}
 const text=e=>(e?.textContent||'').trim().replace(/\s+/g,' ').slice(0,200);
 const labelText=e=>{if(!e)return '';const c=e.cloneNode(true);c.querySelectorAll('input,textarea,select,button,[contenteditable]').forEach(n=>n.remove());return text(c);};
 function label(e){
  const named=e.getAttribute('aria-labelledby');
  return (e.labels?.length ? [...e.labels].map(labelText).join(' ') : '') || e.getAttribute('aria-label') || (named?named.split(' ').map(id=>text(document.getElementById(id))).join(' '):'') || labelText(e.closest('.ant-form-item,.el-form-item,.form-group,.form-item')?.querySelector('label,.ant-form-item-label,.el-form-item__label')) || e.placeholder || e.name || e.id || '未标注字段';
 }
 function section(e){const parent=e.closest('fieldset,section,[data-section],.resume-item,.education-item,.project-item');return (text(parent?.querySelector('legend,h2,h3,h4'))+' '+(parent?.getAttribute('data-entity')||'')).trim();}
 function kind(e){if(e.type==='file')return 'file';if(e.type==='radio')return 'radio-group';if(e.type==='month')return 'month';if(e.type==='date')return 'date';if(e.closest('.ant-picker,.el-date-editor')||/日期|年月|时间/.test(label(e))&&/yyyy|年|月|日期/i.test(e.placeholder||''))return 'date-picker';if(e.tagName!=='SELECT'&&(e.getAttribute('role')==='combobox'||e.closest('.ant-select,.el-select')))return 'custom-select';return e.type||e.tagName.toLowerCase();}
 function val(e){if(e.type==='radio'&&radioGroups.has(e))return radioGroups.get(e).find(x=>x.checked)?.value||'';if(e.type==='radio'||e.type==='checkbox')return e.checked ? e.value : '';return e.isContentEditable?e.innerText:e.value??'';}
 function scan(){
  refs.clear();radioGroups.clear();const fields=[];const seenRadio=new Set();let n=0;
  for(const root of roots()) for(const e of root.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"]')){
   if((!visible(e)&&e.type!=='file')||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(kind(e)))||/^(hidden|submit|button|reset|image)$/.test(e.type))continue;
   if(e.type==='radio'){const key=e.name||e;if(seenRadio.has(key))continue;seenRadio.add(key);radioGroups.set(e,[...root.querySelectorAll('input[type=radio]')].filter(r=>e.name?r.name===e.name:r===e));}
   if(e.getAttribute('role')==='combobox'&&e.querySelector('input'))continue;
   const id='f'+(++n);refs.set(id,e);
   const type=kind(e);const group=radioGroups.get(e);const fieldLabel=group?(labelText(e.closest('fieldset')?.querySelector('legend'))||labelText(e.closest('.ant-form-item,.el-form-item,.form-group,.form-item')?.querySelector('label'))||e.name||label(e)):label(e);
   fields.push({id,label:fieldLabel,section:section(e),type,value:val(e),action:type==='file'?'upload':/date|month/.test(type)?'date':/select|radio/.test(type)?'select':'text',accept:e.accept||'',multiple:!!e.multiple,required:e.required||e.getAttribute('aria-required')==='true',maxLength:e.maxLength>0?e.maxLength:null,options:group?group.map(r=>({label:label(r),value:r.value,disabled:r.disabled})):e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled})):null});
  }
  lastSnapshot={id:crypto.randomUUID(),url:location.href,fields,limitations:[...(document.querySelector('iframe')?['含iframe：当前仅扫描主文档，嵌入表单请单独打开后扫描']:[]),'仅扫描当前已展开且可编辑的字段；折叠/下一页需展开后重新扫描']};return lastSnapshot;
 }
 async function apply(plan){
  if(!lastSnapshot||plan.snapshotId!==lastSnapshot.id||plan.url!==location.href)throw Error('页面或扫描已变化，请重新扫描');
  const results=[];
  for(const p of plan.entries.filter(x=>x.status==='ready')){
   const e=refs.get(p.fieldId);
   if(!e?.isConnected||!visible(e)||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(p.kind))||val(e)!==p.oldValue||(lastSnapshot.fields.find(f=>f.id===p.fieldId)?.label!==p.label)){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   if(/password|file|hidden|submit|button|checkbox/.test(e.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(label(e))){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   try{
    if(p.kind==='custom-select'){
     const trigger=e.closest('.ant-select')?.querySelector('.ant-select-selector')||e;trigger.click();
     await new Promise(r=>setTimeout(r,250));
     let opts=[...document.querySelectorAll('[role="option"],.ant-select-item-option,.el-select-dropdown__item')].filter(o=>visible(o)&&text(o)===p.value);
     for(let tries=0;opts.length===0&&tries<8;tries++){await new Promise(r=>setTimeout(r,100));opts=[...document.querySelectorAll('[role=option],.ant-select-item-option,.el-select-dropdown__item')].filter(o=>visible(o)&&text(o)===p.value);}
     if(opts.length!==1)throw Error('候选不唯一或未展开');opts[0].click();
    }else if(p.kind==='date-picker'&&e.readOnly){e.click();await new Promise(r=>setTimeout(r,200));const cells=[...document.querySelectorAll('[title],[aria-label]')].filter(c=>visible(c)&&(c.getAttribute('title')===p.value||c.getAttribute('aria-label')===p.value));if(cells.length!==1)throw Error('当前日期面板无唯一目标日期');cells[0].click();
    }else if(e.type==='radio'){
     const option=radioGroups.get(e)?.find(x=>x.value===p.value&&!x.disabled);if(!option)throw Error('单选项不匹配');option.click();
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
 async function upload(request){
  if(!lastSnapshot||request.snapshotId!==lastSnapshot.id||request.url!==location.href)throw Error('页面变化，请重新扫描');
  const e=refs.get(request.fieldId),file=request.file;if(!e?.isConnected||e.type!=='file'||e.disabled||!file)throw Error('附件字段不可用');
  if(e.files?.length)throw Error('已有附件，不自动覆盖');
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));if(bytes.length>10*1024*1024)throw Error('附件最大10MB');
  const accept=(e.accept||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(accept.length&&!accept.some(a=>a.startsWith('.')?file.name.toLowerCase().endsWith(a):a.endsWith('/*')?file.type.startsWith(a.slice(0,-1)):file.type===a))throw Error('文件类型与网站要求不符');
  const dt=new DataTransfer();dt.items.add(new File([bytes],file.name,{type:file.type,lastModified:file.lastModified}));e.files=dt.files;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
  return {status:e.files?.[0]?.name===file.name?'attached':'needs-user',message:'文件已交给网页，请核对网站上传回执；未提交申请'};
 }
 globalThis.__resumeFillEngine={scan,apply,upload};
})();

