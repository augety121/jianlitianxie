"""Synthetic DOM contracts, independently authored. No extension vendor source.
These tests exercise fields already discovered by the previous engine (real inputs).
"""
import json,html
STYLE='''body{font:15px system-ui;margin:32px}form{width:640px}label{display:block;margin:14px 0 6px}.field{margin:15px 0}.selectbox{border:1px solid #abc;min-height:44px;width:330px;position:relative}.trigger{padding:10px;min-height:22px;cursor:pointer}.selectbox input{position:absolute;left:2px;bottom:2px;width:1px;height:1px;border:0;padding:0}.menu{position:fixed;z-index:1000;background:white;border:1px solid #abc;min-width:280px}.option{padding:10px;cursor:pointer}textarea,input.email{width:320px;padding:10px}'''
CONFIGS={
 'phoenix':{'root':'phoenix-select','trigger':'phoenix-select__content','display':'phoenix-select__tipEle','placeholder':'phoenix-select__placeHolder--show','menu':'phoenix-selectList','option':'phoenix-selectList__listItem','readonly':True},
 'ant':{'root':'ant-select','trigger':'ant-select-selector','display':'ant-select-selection-item','placeholder':'ant-select-selection-placeholder','menu':'ant-select-dropdown','option':'ant-select-item-option','readonly':False},
 'ant-legacy':{'root':'ant-select','trigger':'ant-select-selection','display':'ant-select-selection-selected-value','placeholder':'ant-select-selection__placeholder','menu':'ant-select-dropdown','option':'ant-select-dropdown-menu-item','readonly':True},
 'element':{'root':'el-select','trigger':'el-input','display':'','placeholder':'','menu':'el-select-dropdown','option':'el-select-dropdown__item','readonly':True,'inputValue':True},
 'ivu':{'root':'ivu-select','trigger':'ivu-select-selection','display':'ivu-select-selected-value','placeholder':'ivu-select-placeholder','menu':'ivu-select-dropdown','option':'ivu-select-item','readonly':True},
 'react':{'root':'Select','trigger':'Select-control','display':'Select-value-label','placeholder':'Select-placeholder','menu':'Select-menu-outer','option':'Select-option','readonly':True},
 'atsx':{'root':'atsx-select','trigger':'atsx-select-selector','display':'atsx-select-selection-item','placeholder':'atsx-select-selection-placeholder','menu':'atsx-select-dropdown','option':'atsx-select-item-option','readonly':False},
}
SCRIPT='''const cfg=CONFIG;window.counts={opened:0,searches:0,chosen:0,submitted:0};
const root=document.querySelector('.selectbox'),editor=document.getElementById('editor'),trigger=root.querySelector('.trigger');
const desired='示例专业甲';let menu;
function render(){menu.replaceChildren();
 if(cfg.noOptions)return;
 if(cfg.search&&editor.value!==desired)return;
 const option=document.createElement('div');option.className='option '+cfg.option;option.textContent=desired;
 if(cfg.disabledOption)option.setAttribute('aria-disabled','true');
 if(cfg.nested){const child=document.createElement('span');child.setAttribute('role','option');child.textContent=desired;option.replaceChildren(child);}
 option.onclick=()=>{if(option.getAttribute('aria-disabled')==='true')return;counts.chosen++;
  if(cfg.inputValue)editor.value=desired;else{editor.value='';const value=document.createElement('span');value.className=cfg.display;value.textContent=desired;trigger.replaceChildren(value);}
  menu.hidden=true;editor.setAttribute('aria-expanded','false');};menu.append(option);
}
'''
# Limited rendering fixture: only an existing select editor and an email field.
# No login controls, submission, network, extension permissions or external page.
SCRIPT+='''trigger.onclick=()=>{
 counts.opened++;
 if(!menu){menu=document.createElement('div');menu.className='menu '+cfg.menu;document.body.append(menu);}
 const box=root.getBoundingClientRect();menu.style.left=box.left+'px';menu.style.top=box.bottom+'px';menu.hidden=false;render();
};
editor.addEventListener('input',()=>{counts.searches++;setTimeout(()=>{if(menu)render()},60)});
if(cfg.existing){
 if(cfg.inputValue)editor.value=desired;
 else {const value=document.createElement('span');value.className=cfg.display;value.textContent=desired;trigger.replaceChildren(value);}
}
'''
def markup(kind='phoenix',**extras):
 cfg={**CONFIGS[kind],**extras}
 placeholder='<span class="'+cfg['placeholder']+'">请选择</span>' if cfg['placeholder'] else ''
 readonly=' readonly' if cfg['readonly'] else ''
 body='<meta charset="utf-8"><style>'+STYLE+'</style><section data-section="教育经历"><h2>教育经历</h2>'
 body+='<label for="editor">专业</label><div class="selectbox '+cfg['root']+'"><div class="trigger '+cfg['trigger']+'">'+placeholder+'<span class="arrow">⌄</span></div>'
 body+='<input id="editor" autocomplete="off"'+readonly+'></div></section>'
 body+='<section data-section="基本信息"><label for="email">邮箱</label><input class="email" id="email" type="email"></section>'
 return body+'<script>'+SCRIPT.replace('CONFIG',json.dumps(cfg,ensure_ascii=False))+'</script>'
FACTS=[{'id':'major','label':'专业','value':'示例专业甲','section':'教育经历','confirmed':True},{'id':'email','label':'邮箱','value':'adapter@example.invalid','section':'基本信息','confirmed':True}]
