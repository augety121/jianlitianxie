/* Runs only in an explicitly selected tab. No network, no submit/save clicks. */
(()=>{
 if(globalThis.__resumeFillEngine) return;
 const refs=new Map(),radioGroups=new Map(); let lastSnapshot;
 const wrappers='.ant-form-item,.el-form-item,.form-group,.form-item,.layui-form-item,.form-row,.field-row';
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=e=>{const closed=e.closest('details:not([open])');return !(closed&&!closed.querySelector('summary')?.contains(e))&&!e.closest('[hidden],[inert]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';};
 function roots(root=document){const out=[root];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)out.push(...roots(el.shadowRoot));return out;}
 const text=e=>(e?.textContent||'').trim().replace(/\s+/g,' ').slice(0,200);
 const labelText=e=>{if(!e)return '';const c=e.cloneNode(true);c.querySelectorAll('input,textarea,select,button,[contenteditable]').forEach(n=>n.remove());return text(c);};
 function label(e){
  const named=e.getAttribute('aria-labelledby'),root=e.getRootNode();
  const aria=named?named.split(' ').map(id=>text(root.getElementById?.(id))).join(' '):'';
  const wrap=e.closest(wrappers),explicit=labelText(wrap?.querySelector('label,.ant-form-item-label,.el-form-item__label,.form-item__label,.layui-form-label'));
  let table='';const cell=e.closest('td');if(cell){const row=cell.parentElement;const cells=[...row.children];const index=cells.indexOf(cell);const previous=cells[index-1];if(previous&&!previous.querySelector('input,select,textarea'))table=labelText(previous);if(!table){const head=e.closest('table')?.querySelector('thead tr');table=labelText(head?.children[index]);}}
  const preceding=e.previousElementSibling;const sibling=preceding?.matches('label,.label,.field-label')?labelText(preceding):'';
  const placeholder=/^(请输入|请选择|请填写|选择|输入|搜索|select|enter|search)/i.test(e.placeholder||'')?'':e.placeholder;
  return ((e.labels?.length?[...e.labels].map(labelText).join(' '):'')||e.getAttribute('aria-label')||aria||explicit||table||sibling||placeholder||e.name||e.id||'未标注字段').replace(/^[*\s]+|[：:*\s]+$/g,'');
 }
 function container(e){if(e.closest('td')&&e.closest('table')?.querySelector('thead'))return e.closest('tr');return e.closest('[data-entity],.resume-item,.education-item,.project-item,.experience-item,fieldset,section,[data-section]')||e.closest('table')||e.closest('form');}
 function section(e){const parent=container(e);return [parent?.getAttribute('data-section'),text(parent?.querySelector('legend,h2,h3,h4,caption'))||text(e.closest('table')?.querySelector('caption')),parent?.getAttribute('data-entity')].filter(Boolean).join(' ');}
 function anchors(e){const p=container(e);if(!p)return [];return [...p.querySelectorAll('input,select')].filter(x=>/学校|院校|项目名称|公司名称|单位名称|证书名称|与本人关系/.test(label(x))).map(x=>x.tagName==='SELECT'?text(x.selectedOptions[0]):x.value).filter(Boolean).slice(0,12);}
 function kind(e){
  if(e.type==='file')return 'file';if(e.type==='radio')return 'radio-group';if(e.type==='month')return 'month';if(e.type==='date')return 'date';
  if(e.closest('.ant-picker,.el-date-editor')||/日期|年月|时间/.test(label(e))&&/yyyy|年|月|日期/i.test(e.placeholder||''))return 'date-picker';
  if(e.tagName!=='SELECT'&&(e.getAttribute('role')==='combobox'||e.closest('.ant-select,.el-select,.phoenix-select,.ivu-select')))return 'custom-select';return e.type||e.tagName.toLowerCase();
 }
 function val(e){
  if(e.type==='radio'&&radioGroups.has(e))return radioGroups.get(e).find(x=>x.checked)?.value||'';
  if(e.type==='radio'||e.type==='checkbox')return e.checked?e.value:'';
  if(e.tagName==='SELECT'&&e.multiple)return [...e.selectedOptions].map(o=>o.value);
  if(kind(e)==='custom-select'){
   const wrap=e.closest('.ant-select,.el-select,.phoenix-select,.ivu-select');
   const selected=wrap?.querySelector('.ant-select-selection-item,.el-select__selected-item:not(.is-placeholder),.ivu-select-selected-value,.phoenix-select-selection-selected-value');
   return selected?text(selected):e.value||'';
  }
  return e.isContentEditable?e.innerText:e.value??'';
 }
 function fieldLabel(e){return e.type==='radio'?(labelText(e.closest('fieldset')?.querySelector('legend'))||labelText(e.closest(wrappers)?.querySelector('label'))||e.name||label(e)):label(e);}
 function datePrecision(e){return e.type==='month'||/^(yyyy|YYYY)[-/.](mm|MM)$/.test(e.placeholder||'')||/年月/.test(label(e))?'month':'day';}
 function scan(){
  refs.clear();radioGroups.clear();const fields=[];const seenRadio=new Set();let n=0;
  for(const root of roots()) for(const e of root.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"]')){
   if((!visible(e)&&e.type!=='file')||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(kind(e)))||/^(hidden|submit|button|reset|image)$/.test(e.type))continue;
   if(e.type==='radio'){const group=[...root.querySelectorAll('input[type=radio]')].filter(r=>e.name?r.name===e.name&&r.form===e.form&&r.closest('fieldset')===e.closest('fieldset'):r===e);if(group.some(r=>seenRadio.has(r)))continue;group.forEach(r=>seenRadio.add(r));radioGroups.set(e,group);}
   if(e.getAttribute('role')==='combobox'&&e.querySelector('input'))continue;
   const id='f'+(++n);refs.set(id,e);
   const type=kind(e);const group=radioGroups.get(e);const name=fieldLabel(e);
   fields.push({id,label:name,section:section(e),anchors:anchors(e),type,value:val(e),datePrecision:datePrecision(e),action:type==='file'?'upload':/date|month/.test(type)?'date':/select|radio/.test(type)?'select':'text',accept:e.accept||'',multiple:!!e.multiple,required:e.required||e.getAttribute('aria-required')==='true'||!!e.closest('.is-required,.ant-form-item-required')||!!e.closest(wrappers)?.querySelector('.required,.ant-form-item-required,[aria-required=true]'),maxLength:e.maxLength>0?e.maxLength:null,options:group?group.map(r=>({label:label(r),value:r.value,disabled:r.disabled})):e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled})):null});
  }
  const coverage={fields:fields.length,unlabeled:fields.filter(f=>f.label==='未标注字段').length,attachments:fields.filter(f=>f.type==='file').length,customControls:fields.filter(f=>/custom|picker/.test(f.type)).length,frames:document.querySelectorAll('iframe').length,collapsed:document.querySelectorAll('[aria-expanded=false],details:not([open])').length};
  lastSnapshot={id:crypto.randomUUID(),url:location.href,fields,coverage,limitations:[...(document.querySelector('iframe')?['含iframe：当前仅扫描主文档，嵌入表单请单独打开后扫描']:[]),'仅扫描当前已展开且可编辑的字段；折叠/下一页需展开后重新扫描']};return lastSnapshot;
 }
 async function apply(plan){
  if(!lastSnapshot||plan.snapshotId!==lastSnapshot.id||plan.url!==location.href)throw Error('页面或扫描已变化，请重新扫描');
  const results=[];
  for(const p of plan.entries.filter(x=>x.status==='ready')){
   const e=refs.get(p.fieldId);
   if(!e?.isConnected||!visible(e)||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(p.kind))||JSON.stringify(val(e))!==JSON.stringify(p.oldValue)||(fieldLabel(e)!==p.label)||(section(e)!==(p.section||''))){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   if(/password|file|hidden|submit|button|checkbox/.test(e.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(label(e))){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   try{
    if(p.kind==='custom-select'){
     const before=new Set([...document.querySelectorAll('[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown')].filter(visible));
     const trigger=e.closest('.ant-select')?.querySelector('.ant-select-selector')||e;trigger.click();
     let opts=[];
     for(let tries=0;tries<12;tries++){
      await wait(100);const owned=(e.getAttribute('aria-controls')||e.getAttribute('aria-owns')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
      const opened=[...document.querySelectorAll('[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown')].filter(x=>visible(x)&&!before.has(x));
      const menus=owned.length?owned:opened;
      opts=[...new Set(menus.flatMap(m=>[...m.querySelectorAll('[role=option],.ant-select-item-option,.el-select-dropdown__item,.ivu-select-item')]))].filter(o=>visible(o)&&o.getAttribute('aria-disabled')!=='true'&&!o.classList.contains('is-disabled')&&text(o)===String(p.value));
      if(opts.length)break;
     }
     if(opts.length!==1)throw Error('候选不唯一或无法关联选项面板');opts[0].click();
    }else if(p.kind==='date-picker'&&e.readOnly){e.click();await new Promise(r=>setTimeout(r,200));const cells=[...document.querySelectorAll('[title],[aria-label]')].filter(c=>visible(c)&&(c.getAttribute('title')===p.value||c.getAttribute('aria-label')===p.value));if(cells.length!==1)throw Error('当前日期面板无唯一目标日期');cells[0].click();
    }else if(e.type==='radio'){
     const option=radioGroups.get(e)?.find(x=>x.value===p.value&&!x.disabled);if(!option)throw Error('单选项不匹配');option.click();
    }else if(e.isContentEditable){e.textContent=p.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.value}));}
    else {let inputValue=p.value;if(p.kind==='date-picker'){const fmt=e.placeholder||'';if(/yyyy\/mm\/dd/i.test(fmt))inputValue=inputValue.replaceAll('-','/');else if(/yyyy\.mm\.dd/i.test(fmt))inputValue=inputValue.replaceAll('-','.');}const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,inputValue);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}));}
    results.push({fieldId:p.fieldId,status:'written'});
   }catch {results.push({fieldId:p.fieldId,status:'needs-user'});}
  }
  await new Promise(r=>setTimeout(r,180));
  for(const r of results)if(r.status==='written'){
   const p=plan.entries.find(x=>x.fieldId===r.fieldId),e=refs.get(r.fieldId);
   const actual=String(val(e));const expected=String(p.value);const equal=/date|month/.test(p.kind)?actual.replace(/[/.]/g,'-')===expected:actual===expected;
   r.status=e?.isConnected&&equal?'verified':'needs-user';
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

