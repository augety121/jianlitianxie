/* Runs only in an explicitly selected tab. No network, no submit/save clicks. */
(()=>{
 if(globalThis.__resumeFillEngine?.version==='0.3.1') return;
 const refs=new Map(),radioGroups=new Map(),repeatGroups=new Map(); let lastSnapshot;
 const wrappers='.ant-form-item,.el-form-item,.form-group,.form-item,.layui-form-item,.form-row,.field-row,.fx-field,.fx-sub-field';
 function activate(e){
  const target=e.querySelector?.('.x-combo-dropdown-label')||e;
  target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
  target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
  target.click();
 }
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=e=>{const closed=e.closest('details:not([open])');return !(closed&&!closed.querySelector('summary')?.contains(e))&&!e.closest('[hidden],[inert]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';};
 function roots(root=document){const out=[root];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)out.push(...roots(el.shadowRoot));return out;}
 const text=e=>(e?.textContent||'').trim().replace(/\s+/g,' ').slice(0,200);
 const labelText=e=>{if(!e)return '';const c=e.cloneNode(true);c.querySelectorAll('input,textarea,select,button,[contenteditable]').forEach(n=>n.remove());return text(c);};
 function subHead(e){
  const cell=e.closest('.subform-cell'),row=e.closest('.fx-subform-row'),field=e.closest('.fx-field');
  if(!cell||!row||!field)return null;
  const index=[...row.children].filter(x=>x.classList.contains('subform-cell')).indexOf(cell);
  return field.querySelector('.subform-head .subform-row')?.children[index]?.querySelector('.subform-title');
 }
 function label(e){
  const sh=subHead(e);if(sh)return (sh.getAttribute('title')||labelText(sh)).replace(/^[*\s]+|[：:*\s]+$/g,'');
  const named=e.getAttribute('aria-labelledby'),root=e.getRootNode();
  const aria=named?named.split(' ').map(id=>text(root.getElementById?.(id))).join(' '):'';
  const wrap=e.closest(wrappers),explicit=labelText(wrap?.querySelector('label,.ant-form-item-label,.el-form-item__label,.form-item__label,.layui-form-label,.field-name'));
  let table='';const cell=e.closest('td');if(cell){const row=cell.parentElement;const cells=[...row.children];const index=cells.indexOf(cell);const previous=cells[index-1];if(previous&&!previous.querySelector('input,select,textarea'))table=labelText(previous);if(!table){const head=e.closest('table')?.querySelector('thead tr');table=labelText(head?.children[index]);}}
  const preceding=e.previousElementSibling;const sibling=preceding?.matches('label,.label,.field-label')?labelText(preceding):'';
  const placeholder=/^(请输入|请选择|请填写|选择|输入|搜索|select|enter|search)/i.test(e.placeholder||'')?'':e.placeholder;
  return ((e.labels?.length?[...e.labels].map(labelText).join(' '):'')||e.getAttribute('aria-label')||aria||explicit||table||sibling||placeholder||e.name||e.id||'未标注字段').replace(/^[*\s]+|[：:*\s]+$/g,'');
 }
 function container(e){if(e.closest('.fx-subform-row'))return e.closest('.fx-subform-row');if(e.closest('td')&&e.closest('table')?.querySelector('thead'))return e.closest('tr');return e.closest('[data-entity],.resume-item,.education-item,.project-item,.experience-item,fieldset,section,[data-section]')||e.closest('table')||e.closest('form');}
 function section(e){if(e.closest('.fx-subform-row'))return text(e.closest('.fx-field')?.querySelector('.field-name'));const parent=container(e);return [parent?.getAttribute('data-section'),text(parent?.querySelector('legend,h2,h3,h4,caption'))||text(e.closest('table')?.querySelector('caption')),parent?.getAttribute('data-entity')].filter(Boolean).join(' ');}
 function anchors(e){const p=container(e);if(!p)return [];return [...p.querySelectorAll('input,select')].filter(x=>/学校|院校|项目名称|公司|单位名称|证书名称|与本人关系/.test(label(x))).map(x=>x.tagName==='SELECT'?text(x.selectedOptions[0]):x.value).filter(Boolean).slice(0,12);}
 function kind(e){
  if(e.matches('.x-radio-group'))return 'custom-radio';if(e.matches('.x-combo,.x-combocheck'))return 'custom-select';if(e.type==='file')return 'file';if(e.type==='radio')return 'radio-group';if(e.type==='month')return 'month';if(e.type==='date')return 'date';
  if(e.closest('.ant-picker,.el-date-editor,.fx-form-datetime')||/日期|年月|时间/.test(label(e))&&/yyyy|年|月|日期/i.test(e.placeholder||''))return 'date-picker';
  if(e.tagName!=='SELECT'&&(e.getAttribute('role')==='combobox'||e.closest('.ant-select,.el-select,.phoenix-select,.ivu-select')))return 'custom-select';return e.type||e.tagName.toLowerCase();
 }
 function val(e){
  if(e.matches('.x-radio-group'))return text(e.querySelector('.x-radio.radio-checked .radio-text,.x-radio.is-checked .radio-text,.x-radio.checked .radio-text,.x-radio[aria-checked=true] .radio-text,.x-radio:has(.radio-check-icon.checked) .radio-text,.x-radio:has(.radio-check-icon.is-checked) .radio-text,.x-radio:has(input:checked) .radio-text,.x-radio:has([aria-checked=true]) .radio-text'));
  if(e.matches('.x-combocheck'))return [...e.querySelectorAll('.value-content .x-tag')].map(text).filter(Boolean);
  if(e.matches('.x-combo'))return text(e.querySelector('.value-content:not(:has(.dropdown-label-placeholder))'));
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
 async function scan(){
  refs.clear();radioGroups.clear();repeatGroups.clear();const fields=[];const seenRadio=new Set();let n=0;
  for(const root of roots()) for(const e of root.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"],.x-combo,.x-combocheck,.x-radio-group')){
   if(e.closest('.x-popup')||e.isContentEditable&&e.closest('.fx-form-file')||e.closest('.ui-invisible'))continue;
   if((!visible(e)&&e.type!=='file')||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(kind(e)))||/^(hidden|submit|button|reset|image)$/.test(e.type))continue;
   if(e.type==='radio'){const group=[...root.querySelectorAll('input[type=radio]')].filter(r=>e.name?r.name===e.name&&r.form===e.form&&r.closest('fieldset')===e.closest('fieldset'):r===e);if(group.some(r=>seenRadio.has(r)))continue;group.forEach(r=>seenRadio.add(r));radioGroups.set(e,group);}
   if(e.getAttribute('role')==='combobox'&&e.querySelector('input'))continue;
   const id='f'+(++n);refs.set(id,e);
   const type=kind(e);const group=radioGroups.get(e);const name=fieldLabel(e);
   fields.push({id,label:name,rowIndex:e.closest('.fx-subform-row')?[...e.closest('.fx-field').querySelectorAll('.fx-subform-row')].indexOf(e.closest('.fx-subform-row')):null,control:{tag:e.tagName,classes:e.className,readOnly:!!e.readOnly,placeholder:e.placeholder||'',nodes:e.matches('.x-radio-group')?[...e.querySelectorAll('.x-radio,.x-radio-wrapper,.radio-check-icon')].map(x=>({tag:x.tagName,classes:x.className,checked:x.getAttribute('aria-checked')})):undefined},section:section(e),anchors:anchors(e),type,value:val(e),datePrecision:datePrecision(e),action:type==='file'?'upload':/date|month/.test(type)?'date':/select|radio/.test(type)?'select':'text',accept:e.accept||'',multiple:!!e.multiple||e.matches('.x-combocheck'),required:e.required||e.getAttribute('aria-required')==='true'||!!subHead(e)?.closest('.subform-cell')?.querySelector('.required')||!!e.closest('.is-required,.ant-form-item-required')||!!e.closest(wrappers)?.querySelector('.required,.field-required,.ant-form-item-required,[aria-required=true]'),maxLength:e.maxLength>0?e.maxLength:null,options:e.matches('.x-radio-group')?[...e.querySelectorAll('.x-radio')].map(r=>({label:text(r.querySelector('.radio-text')),value:text(r.querySelector('.radio-text')),disabled:r.classList.contains('disabled')})):group?group.map(r=>({label:label(r),value:r.value,disabled:r.disabled})):e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled})):null});
  }
  // Inspect rendered dropdown options without choosing anything. Dependent choices
  // appear only after a parent value exists and are refreshed on the next scan.
  for(const f of fields){
   const e=refs.get(f.id);if(!e.matches('.x-combo,.x-combocheck'))continue;
   const menus=()=>[...document.querySelectorAll('.x-combo-dropdown')].filter(visible);
   const before=new Set(menus());
   try{activate(e);let opened=[];for(let i=0;i<4;i++){await wait(50);opened=menus().filter(m=>!before.has(m));if(opened.length)break;}
    if(opened.length===1){f.options=[...opened[0].querySelectorAll('.x-combo-dropdown-item')].filter(visible).map(o=>({label:text(o),value:text(o),disabled:o.classList.contains('is-disabled')||o.getAttribute('aria-disabled')==='true'})).filter(o=>o.label&&o.label!=='全选');activate(e);}
   }catch{f.options=null;}
  }
  for(const group of document.querySelectorAll('.fx-field')){
   const rows=group.querySelectorAll('.fx-subform-row');if(!rows.length)continue;
   const buttons=[...group.querySelectorAll('button,a,[role=button],span,div')].filter(x=>visible(x)&&/^(添加|新增|添加一行|新增一行|增加)$/.test(text(x))&&!x.querySelector('button,a,[role=button]'));
   const leaf=buttons.filter(x=>!buttons.some(y=>y!==x&&x.contains(y)));
   if(leaf.length!==1)continue;const id='f'+(++n);refs.set(id,leaf[0]);repeatGroups.set(id,group);
   fields.push({id,label:text(group.querySelector('.field-name'))+'条数',section:text(group.querySelector('.field-name')),type:'repeat-group',action:'add',value:'',currentRows:rows.length,required:false,options:null});
  }
  const coverage={fields:fields.length,unlabeled:fields.filter(f=>f.label==='未标注字段').length,attachments:fields.filter(f=>f.type==='file').length,customControls:fields.filter(f=>/custom|picker/.test(f.type)).length,frames:document.querySelectorAll('iframe').length,collapsed:document.querySelectorAll('[aria-expanded=false],details:not([open])').length};
  lastSnapshot={engineVersion:'0.3.1',id:crypto.randomUUID(),url:location.href,fields,coverage,limitations:[...(document.querySelector('iframe')?['含iframe：当前仅扫描主文档，嵌入表单请单独打开后扫描']:[]),'仅扫描当前已展开且可编辑的字段；折叠/下一页需展开后重新扫描']};return lastSnapshot;
 }
 async function apply(plan){
  if(!lastSnapshot||plan.snapshotId!==lastSnapshot.id||plan.url!==location.href)throw Error('页面或扫描已变化，请重新扫描');
  const results=[];
  for(const p of plan.entries.filter(x=>x.status==='ready')){
   const e=refs.get(p.fieldId);
   if(p.kind==='repeat-group'){
    const group=repeatGroups.get(p.fieldId);const count=Number(p.value);
    if(!e?.isConnected||!group?.isConnected||!visible(e)||text(group.querySelector('.field-name'))!==p.section||group.querySelectorAll('.fx-subform-row').length!==p.currentRows||!Number.isInteger(count)||count<1||count>20){results.push({fieldId:p.fieldId,status:'stale'});continue;}
    try{while(group.querySelectorAll('.fx-subform-row').length<count){const before=group.querySelectorAll('.fx-subform-row').length;activate(e);for(let i=0;i<15&&group.querySelectorAll('.fx-subform-row').length===before;i++)await wait(100);if(group.querySelectorAll('.fx-subform-row').length!==before+1)throw Error('添加行数未确认，已停止');}results.push({fieldId:p.fieldId,status:'verified',reason:'已添加缺少行，请重新扫描映射每行资料'});}catch(error){results.push({fieldId:p.fieldId,status:'needs-user',reason:error.message});}continue;
   }
   if(!e?.isConnected||!visible(e)||e.disabled||(e.readOnly&&!['custom-select','date-picker'].includes(p.kind))||JSON.stringify(val(e))!==JSON.stringify(p.oldValue)||(fieldLabel(e)!==p.label)||(section(e)!==(p.section||''))){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   if(/password|file|hidden|submit|button|checkbox/.test(e.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(label(e))){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   try{
    if(p.kind==='custom-radio'){const options=[...e.querySelectorAll('.x-radio')].filter(r=>text(r.querySelector('.radio-text'))===String(p.value));if(options.length!==1)throw Error('单选候选不唯一');activate(options[0].querySelector('.radio-check-icon')||options[0].querySelector('.x-radio-wrapper'));
    }else if(p.kind==='custom-select'){
     const before=new Set([...document.querySelectorAll('[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown,.x-combo-dropdown')].filter(visible));
     const trigger=e.closest('.ant-select')?.querySelector('.ant-select-selector')||e;activate(trigger);
     let opts=[];
     for(let tries=0;tries<12;tries++){
      await wait(100);const owned=(e.getAttribute('aria-controls')||e.getAttribute('aria-owns')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
      const opened=[...document.querySelectorAll('[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown,.x-combo-dropdown')].filter(x=>visible(x)&&!before.has(x));
      const menus=owned.length?owned:opened;
      opts=[...new Set(menus.flatMap(m=>[...m.querySelectorAll('[role=option],.ant-select-item-option,.el-select-dropdown__item,.ivu-select-item,.x-combo-dropdown-item')]))].filter(o=>visible(o)&&o.getAttribute('aria-disabled')!=='true'&&!o.classList.contains('is-disabled')&&(Array.isArray(p.value)?p.value:[p.value]).includes(text(o)));
      if(opts.length)break;
     }
     const wanted=Array.isArray(p.value)?p.value:[p.value];
     if(opts.length!==wanted.length||wanted.some(v=>opts.filter(o=>text(o)===v).length!==1))throw Error('候选不唯一或无法关联选项面板');
     for(const v of wanted){
      const current=[...document.querySelectorAll('[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown,.x-combo-dropdown')].filter(m=>visible(m)&&!before.has(m));
      const matches=[...new Set(current.flatMap(m=>[...m.querySelectorAll('[role=option],.ant-select-item-option,.el-select-dropdown__item,.ivu-select-item,.x-combo-dropdown-item')]))].filter(o=>visible(o)&&text(o)===v&&o.getAttribute('aria-disabled')!=='true'&&!o.classList.contains('is-disabled'));
      const o=matches.length===1?matches[0]:opts.find(o=>o.isConnected&&text(o)===v);if(!o)throw Error('选项重绘后无法唯一定位');activate(o);await wait(70);
     }
     if(Array.isArray(p.value))activate(e);
    }else if(p.kind==='date-picker'&&e.closest('.fx-form-datetime')&&!e.readOnly){
     const formats=[String(p.value),String(p.value).replaceAll('-','/')];
     if(/^\d{4}-\d{2}-\d{2}$/.test(p.value))formats.push(p.value.slice(0,7));
     let accepted=false;
     for(const value of [...new Set(formats)]){
      if(e.value)break;e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
      e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));e.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
      e.blur();await wait(120);
      if(e.value){accepted=true;break;}
     }
     if(!accepted)throw Error('日期控件拒绝输入格式，未填写');
    }else if(p.kind==='date-picker'&&e.readOnly){e.click();await new Promise(r=>setTimeout(r,200));const cells=[...document.querySelectorAll('[title],[aria-label]')].filter(c=>visible(c)&&(c.getAttribute('title')===p.value||c.getAttribute('aria-label')===p.value));if(cells.length!==1)throw Error('当前日期面板无唯一目标日期');cells[0].click();
    }else if(p.multiple&&e.tagName==='SELECT'){
     if(!Array.isArray(p.value))throw Error('多选计划无效');for(const o of e.options)o.selected=p.value.includes(o.value);e.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(e.type==='radio'){
     const option=radioGroups.get(e)?.find(x=>x.value===p.value&&!x.disabled);if(!option)throw Error('单选项不匹配');option.click();
    }else if(e.isContentEditable){e.textContent=p.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.value}));}
    else {let inputValue=p.value;if(p.kind==='date-picker'){const fmt=e.placeholder||'';if(/yyyy\/mm\/dd/i.test(fmt))inputValue=inputValue.replaceAll('-','/');else if(/yyyy\.mm\.dd/i.test(fmt))inputValue=inputValue.replaceAll('-','.');}const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,inputValue);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}));}
    results.push({fieldId:p.fieldId,status:'written'});
   }catch(error) {results.push({fieldId:p.fieldId,status:'needs-user',reason:String(error.message).slice(0,160)});}
  }
  await new Promise(r=>setTimeout(r,180));
  for(const r of results)if(r.status==='written'){
   const p=plan.entries.find(x=>x.fieldId===r.fieldId),e=refs.get(r.fieldId);
   const actual=String(val(e));const expected=String(p.value);const equal=Array.isArray(p.value)?JSON.stringify([...val(e)].sort())===JSON.stringify([...p.value].sort()):/date|month/.test(p.kind)?actual.replace(/[/.]/g,'-')===expected:actual===expected;
   r.status=e?.isConnected&&equal?'verified':'needs-user';if(r.status==='needs-user')r.reason='控件未保留目标值，需核对控件格式或选中状态';
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
 globalThis.__resumeFillEngine={version:'0.3.1',scan,apply,upload};
})();

