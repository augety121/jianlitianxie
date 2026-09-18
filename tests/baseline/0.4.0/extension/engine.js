/* Runs only in an explicitly selected tab. No network, no submit/save clicks. */
(()=>{
 if(globalThis.__resumeFillEngine?.version==='0.4.0') return;
 const refs=new Map(),radioGroups=new Map(),repeatGroups=new Map(),contexts=new Map(); let lastSnapshot;
 let busy=false,generation=0;
 const empty=v=>v==null||v===''||v===false||Array.isArray(v)&&v.length===0;
 const prohibited=e=>/^(password|file|hidden|submit|button|reset|image|checkbox)$/.test(e.type)||/验证码|密码|同意|承诺|声明|签名|授权|captcha|consent|signature/i.test(fieldLabel(e));
 const wrappers='.ant-form-item,.el-form-item,.form-group,.form-item,.layui-form-item,.form-row,.field-row,.fx-field,.fx-sub-field';
 function activate(e){
  if(!e)throw Error('控件不可用');
  const target=e.querySelector?.('.x-combo-dropdown-label')||e;
  const button=target.closest('button,input[type=submit],input[type=reset],a[href]');
  if(button&&(button.tagName==='A'||/^(submit|reset)$/.test(button.type)))throw Error('拒绝可能提交、重置或跳转的控件');
  if(target.getAttribute('aria-disabled')==='true'||target.matches(':disabled'))throw Error('控件已禁用');
  target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
  target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
  target.click();
 }
 const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((x,i)=>([4,6,8,10].includes(i)?'-':'')+x.toString(16).padStart(2,'0')).join('');};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=e=>{if(!e)return false;const closed=e.closest('details:not([open])');return !(closed&&!closed.querySelector('summary')?.contains(e))&&!e.closest('[hidden],[inert],[aria-hidden=true]')&&e.getClientRects().length>0&&!['hidden','collapse'].includes(getComputedStyle(e).visibility);};
 function roots(root=document){const out=[root];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)out.push(...roots(el.shadowRoot));return out;}
 const all=selector=>roots().flatMap(root=>[...root.querySelectorAll(selector)]);
 const menuSelector='[role=listbox],.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown,.x-combo-dropdown';
 const optionSelector='[role=option],.ant-select-item-option,.el-select-dropdown__item,.ivu-select-item,.x-combo-dropdown-item';
 function ownedMenus(e,selector=menuSelector){
  return [...new Set((e.getAttribute('aria-controls')||e.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean).map(id=>e.getRootNode().getElementById?.(id)||document.getElementById(id)).filter(Boolean)
    .map(x=>x.closest('.ant-select-dropdown,.el-select-dropdown,.ivu-select-dropdown,.x-combo-dropdown')||x))].filter(x=>visible(x)&&x.matches(selector));
 }
 function menusFor(e,before,selector=menuSelector){
  const owned=ownedMenus(e,selector);if(owned.length)return owned;
  const opened=all(selector).filter(x=>visible(x)&&!before.has(x));
  const outer=opened.filter(x=>!opened.some(y=>y!==x&&y.contains(x)));
  return outer.length===1?outer:[];
 }
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
  const hint=(e.placeholder||'').replace(/^(请输入|请选择|请填写)\s*/,'');
  const placeholder=/^(选择|输入|搜索|select|enter|search)/i.test(hint)?'':hint;
  const autocomplete={name:'姓名','given-name':'名字','family-name':'姓氏',email:'邮箱',tel:'手机号码','tel-national':'手机号码',bday:'出生日期','address-line1':'详细地址'}[(e.autocomplete||'').split(/\s+/).at(-1)]||'';
  return ((e.labels?.length?[...e.labels].map(labelText).join(' '):'')||e.getAttribute('aria-label')||aria||explicit||table||sibling||placeholder||autocomplete||e.name||e.id||'未标注字段').replace(/^[*\s]+|[：:*\s]+$/g,'');
 }
 function container(e){if(e.closest('.fx-subform-row'))return e.closest('.fx-subform-row');if(e.closest('td')&&e.closest('table')?.querySelector('thead'))return e.closest('tr');return e.closest('[data-entity],.resume-item,.education-item,.project-item,.experience-item,fieldset,section,[data-section]')||e.closest('table')||e.closest('form');}
 function section(e){if(e.closest('.fx-subform-row'))return text(e.closest('.fx-field')?.querySelector('.field-name'));const parent=container(e);return [parent?.getAttribute('data-section'),text(parent?.querySelector('legend,h2,h3,h4,caption'))||text(e.closest('table')?.querySelector('caption')),parent?.getAttribute('data-entity')].filter(Boolean).join(' ');}
 function anchors(e){const p=container(e);if(!p)return [];return [...p.querySelectorAll('input,select')].filter(x=>/学校|院校|项目名称|公司|单位名称|证书名称|与本人关系/.test(label(x))).map(x=>x.tagName==='SELECT'?text(x.selectedOptions[0]):x.value).filter(Boolean).slice(0,12);}
 function kind(e){
  if(e.matches('.x-radio-group,[role=radiogroup]'))return 'custom-radio';if(e.matches('.x-combo,.x-combocheck'))return 'custom-select';if(e.type==='file')return 'file';if(e.type==='radio')return 'radio-group';if(e.type==='month')return 'month';if(e.type==='date')return 'date';
  if(e.closest('.ant-picker,.el-date-editor,.fx-form-datetime')||/日期|年月|时间/.test(label(e))&&/yyyy|年|月|日期/i.test(e.placeholder||''))return 'date-picker';
  if(e.tagName!=='SELECT'&&(e.getAttribute('role')==='combobox'||e.closest('.ant-select,.el-select,.phoenix-select,.ivu-select')))return 'custom-select';return e.type||e.tagName.toLowerCase();
 }
 function val(e){
  if(!e)return '';
  if(e.matches('[role=radiogroup]'))return text(e.querySelector('[role=radio][aria-checked=true]'));
  if(e.tagName==='SELECT'&&!e.multiple&&e.selectedOptions[0]?.disabled&&/请选择|please select|select an?/i.test(text(e.selectedOptions[0])))return '';
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
 function datePrecision(e){if(e.type==='date')return 'day';return e.type==='month'||/^(yyyy|YYYY)[-/.](mm|MM)$/.test(e.placeholder||'')||/年月(?!日)/.test(label(e))?'month':'day';}
 async function scanUnsafe(token){
  refs.clear();radioGroups.clear();repeatGroups.clear();contexts.clear();const fields=[];const seenRadio=new Set();let n=0;
  for(const root of roots()) for(const e of root.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"],.x-combo,.x-combocheck,.x-radio-group,[role=radiogroup]')){
   if(token!==generation)throw Error('扫描已取消');
   if(e.type==='password'||e.autocomplete==='one-time-code'||/验证码|密码|captcha|password/i.test(label(e)))continue;
   if(e.closest('.x-radio-group,[role=radiogroup]')&&e.closest('.x-radio-group,[role=radiogroup]')!==e)continue;
   if(e.closest('.x-popup')||e.isContentEditable&&e.closest('.fx-form-file')||e.closest('.ui-invisible'))continue;
   if((!visible(e)&&e.type!=='file')||e.disabled||e.matches(':disabled')||e.getAttribute('aria-disabled')==='true'||(e.readOnly&&!['custom-select','date-picker'].includes(kind(e)))||/^(hidden|submit|button|reset|image)$/.test(e.type))continue;
   if(e.type==='radio'){const group=[...root.querySelectorAll('input[type=radio]')].filter(r=>e.name?r.name===e.name&&r.form===e.form&&r.closest('fieldset')===e.closest('fieldset'):r===e);if(group.some(r=>seenRadio.has(r)))continue;group.forEach(r=>seenRadio.add(r));radioGroups.set(e,group);}
   if(e.getAttribute('role')==='combobox'&&e.querySelector('input'))continue;
   if(n>=1000)break;const id='f'+(++n);refs.set(id,e);contexts.set(id,container(e));
   const type=kind(e);const group=radioGroups.get(e);const name=fieldLabel(e);
   fields.push({id,label:name,rowIndex:e.closest('.fx-subform-row')?[...e.closest('.fx-field').querySelectorAll('.fx-subform-row')].indexOf(e.closest('.fx-subform-row')):null,control:{tag:e.tagName,classes:e.className,readOnly:!!e.readOnly,placeholder:e.placeholder||'',nodes:e.matches('.x-radio-group')?[...e.querySelectorAll('.x-radio,.x-radio-wrapper,.radio-check-icon')].map(x=>({tag:x.tagName,classes:x.className,checked:x.getAttribute('aria-checked')})):undefined},section:section(e),anchors:anchors(e),type,value:val(e),datePrecision:datePrecision(e),action:type==='file'?'upload':/date|month/.test(type)?'date':/select|radio/.test(type)?'select':'text',accept:e.accept||'',multiple:!!e.multiple||e.matches('.x-combocheck'),required:e.required||e.getAttribute('aria-required')==='true'||!!subHead(e)?.closest('.subform-cell')?.querySelector('.required')||!!e.closest('.is-required,.ant-form-item-required')||!!e.closest(wrappers)?.querySelector('.required,.field-required,.ant-form-item-required,[aria-required=true]'),maxLength:e.maxLength>0?e.maxLength:null,options:e.matches('.x-radio-group,[role=radiogroup]')?[...e.querySelectorAll('.x-radio,[role=radio]')].map(r=>({label:text(r.querySelector('.radio-text')||r),value:text(r.querySelector('.radio-text')||r),disabled:r.classList.contains('disabled')||r.getAttribute('aria-disabled')==='true'})):group?group.map(r=>({label:label(r),value:r.value,disabled:r.disabled})):e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled||o.parentElement?.disabled})):null});
  }
  // Inspect rendered dropdown options without choosing anything. Dependent choices
  // appear only after a parent value exists and are refreshed on the next scan.
  for(const f of fields){
   if(token!==generation)throw Error('扫描已取消');
   const e=refs.get(f.id);if(!e.matches('.x-combo,.x-combocheck'))continue;
   const menus=()=>all('.x-combo-dropdown').filter(visible);
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
  lastSnapshot={engineVersion:'0.4.0',id:uuid(),url:location.href,fields,coverage,limitations:[...(document.querySelector('iframe')?['含iframe：当前仅扫描主文档，嵌入表单请单独打开后扫描']:[]),'仅扫描当前已展开且可编辑的字段；折叠/下一页需展开后重新扫描']};return lastSnapshot;
 }
 async function applyUnsafe(plan,token){
  if(!lastSnapshot||plan.snapshotId!==lastSnapshot.id||plan.url!==location.href)throw Error('页面或扫描已变化，请重新扫描');
  const results=[];
  for(const p of plan.entries.filter(x=>x.status==='ready')){
   if(token!==generation){results.push({fieldId:p.fieldId,status:'cancelled'});continue;}
   if(plan.url!==location.href){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   const e=refs.get(p.fieldId);
   if(p.kind==='repeat-group'){
    const group=repeatGroups.get(p.fieldId);const count=Number(p.value);
    if(!e?.isConnected||!group?.isConnected||!visible(e)||text(group.querySelector('.field-name'))!==p.section||group.querySelectorAll('.fx-subform-row').length!==p.currentRows||!Number.isInteger(count)||count<1||count>20){results.push({fieldId:p.fieldId,status:'stale'});continue;}
    try{while(group.querySelectorAll('.fx-subform-row').length<count){if(token!==generation||plan.url!==location.href)throw Error('已停止，请核对已新增的行');const before=group.querySelectorAll('.fx-subform-row').length;activate(e);for(let i=0;i<15&&group.querySelectorAll('.fx-subform-row').length===before;i++)await wait(100);if(group.querySelectorAll('.fx-subform-row').length!==before+1)throw Error('添加行数未确认，已停止');}results.push({fieldId:p.fieldId,status:'verified',reason:'已添加缺少行，请重新扫描映射每行资料'});}catch(error){results.push({fieldId:p.fieldId,status:'needs-user',reason:error.message});}continue;
   }
   if(!e?.isConnected||!visible(e)||e.disabled||e.matches(':disabled')||e.getAttribute('aria-disabled')==='true'||container(e)!==contexts.get(p.fieldId)||(e.readOnly&&!['custom-select','date-picker'].includes(p.kind))||JSON.stringify(val(e))!==JSON.stringify(p.oldValue)||(fieldLabel(e)!==p.label)||(section(e)!==(p.section||''))){results.push({fieldId:p.fieldId,status:'stale'});continue;}
   if(prohibited(e)){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   if(!empty(val(e))){results.push({fieldId:p.fieldId,status:'preserve'});continue;}
   if(!['string','number'].includes(typeof p.value)&&!Array.isArray(p.value)){results.push({fieldId:p.fieldId,status:'manual'});continue;}
   try{
    if(p.kind==='custom-radio'){const options=[...e.querySelectorAll('.x-radio,[role=radio]')].filter(r=>text(r.querySelector('.radio-text')||r)===String(p.value)&&!r.classList.contains('disabled')&&r.getAttribute('aria-disabled')!=='true');if(options.length!==1)throw Error('单选候选不唯一');activate(options[0].querySelector('.radio-check-icon')||options[0].querySelector('.x-radio-wrapper')||options[0]);
    }else if(p.kind==='custom-select'){
     const before=new Set(all(menuSelector).filter(visible));
     const trigger=e.closest('.ant-select')?.querySelector('.ant-select-selector')||e;
     if(!(e.getAttribute('aria-expanded')==='true'&&ownedMenus(e).length))activate(trigger);
     const wanted=Array.isArray(p.value)?p.value:[p.value];
     if(!wanted.length||new Set(wanted).size!==wanted.length)throw Error('选项计划无效');
     for(const v of wanted){
      let matches=[];
      for(let tries=0;tries<12;tries++){
       if(token!==generation||plan.url!==location.href)throw Error('操作已停止或页面变化');
       await wait(100);
       matches=[...new Set(menusFor(e,before).flatMap(m=>[...m.querySelectorAll(optionSelector)]))]
        .filter(o=>visible(o)&&text(o)===String(v)&&o.getAttribute('aria-disabled')!=='true'&&!o.classList.contains('is-disabled'));
       if(matches.length)break;
      }
      if(matches.length!==1)throw Error('候选不唯一或无法关联选项面板');
      if(token!==generation||plan.url!==location.href||!e.isConnected)throw Error('操作已停止或控件已重绘');
      activate(matches[0]);await wait(70);
     }
     if(Array.isArray(p.value)&&token===generation&&menusFor(e,before).length)activate(e);
    }else if(p.kind==='date-picker'&&e.closest('.fx-form-datetime')&&!e.readOnly){
     const formats=[String(p.value),String(p.value).replaceAll('-','/')];
     let accepted=false;
     for(const value of [...new Set(formats)]){
      if(token!==generation||plan.url!==location.href)throw Error('操作已停止');if(e.value)break;e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
      e.blur();await wait(120);
      if(e.value){accepted=true;break;}
     }
     if(!accepted)throw Error('日期控件拒绝输入格式，未填写');
    }else if(p.kind==='date-picker'&&e.readOnly){
     const calendarSelector='[role=dialog],[role=grid],.ant-picker-dropdown,.el-picker-panel,.x-datetime-picker,.x-date-picker';
     const before=new Set(all(calendarSelector).filter(visible));activate(e);await wait(200);
     const menus=menusFor(e,before,calendarSelector);
     const cells=[...new Set(menus.flatMap(m=>[...m.querySelectorAll('[title],[aria-label]')]))]
      .filter(c=>visible(c)&&(c.getAttribute('title')===String(p.value)||c.getAttribute('aria-label')===String(p.value))&&c.getAttribute('aria-disabled')!=='true'&&!c.matches(':disabled'));
     if(cells.length!==1)throw Error('关联的日期面板没有唯一可见目标，需手动选择');
     if(token!==generation||plan.url!==location.href)throw Error('操作已停止');activate(cells[0]);
    }else if(p.multiple&&e.tagName==='SELECT'){
     if(!Array.isArray(p.value)||p.value.some(v=>![...e.options].some(o=>o.value===v&&!o.disabled&&!o.parentElement?.disabled)))throw Error('多选计划无效或选项已变化');for(const o of e.options)o.selected=p.value.includes(o.value);e.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(e.type==='radio'){
     const option=radioGroups.get(e)?.find(x=>x.value===p.value&&!x.matches(':disabled'));if(!option||!option.isConnected||!visible(option))throw Error('单选项不匹配');activate(option);
    }else if(e.isContentEditable){e.textContent=p.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.value}));}
    else {if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(p.value)&&!o.disabled&&!o.parentElement?.disabled))throw Error('候选选项已变化');let inputValue=p.value;if(p.kind==='date-picker'){const fmt=e.placeholder||'';if(/yyyy\/mm\/dd/i.test(fmt))inputValue=inputValue.replaceAll('-','/');else if(/yyyy\.mm\.dd/i.test(fmt))inputValue=inputValue.replaceAll('-','.');}const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,inputValue);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}));}
    results.push({fieldId:p.fieldId,status:'written'});await wait(0);
   }catch(error) {results.push({fieldId:p.fieldId,status:'needs-user',reason:String(error.message).slice(0,160)});}
  }
  await new Promise(r=>setTimeout(r,500));
  for(const r of results)if(r.status==='written'){
   const p=plan.entries.find(x=>x.fieldId===r.fieldId),e=refs.get(r.fieldId);
   const value=val(e),actual=String(value),expected=String(p.value);const equal=Array.isArray(p.value)?Array.isArray(value)&&JSON.stringify([...value].sort())===JSON.stringify([...p.value].sort()):/date|month/.test(p.kind)?actual.replace(/[/.]/g,'-')===expected:actual===expected;
   r.status=e?.isConnected&&plan.url===location.href&&container(e)===contexts.get(r.fieldId)&&equal?'verified':'needs-user';if(r.status==='needs-user')r.reason='控件未保留目标值，需核对控件格式或选中状态';
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
 async function scan(){
  if(busy)throw Error('控件引擎正在执行，请稍候');busy=true;const token=++generation;
  try{const snapshot=await scanUnsafe(token);if(token!==generation){lastSnapshot=null;throw Error('扫描已取消');}return snapshot;}finally{busy=false;}
 }
 async function apply(plan){
  if(busy)throw Error('控件引擎正在执行，请稍候');busy=true;const token=generation;
  try{return await applyUnsafe(plan,token);}finally{busy=false;lastSnapshot=null;}
 }
 function cancel(){generation++;lastSnapshot=null;return {cancelled:true};}
 globalThis.__resumeFillEngine={version:'0.4.0',scan,apply,upload,cancel};
})();
