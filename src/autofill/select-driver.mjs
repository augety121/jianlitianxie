/** Existing select routine extracted without widening discovery or permissions. */
export function createSelectDriver({componentObservations,all,menuSelector:baseMenus,optionSelector:baseOptions,visible,selectWrap,controlTarget,ownedMenus,menusFor,activate,waitFor,text,wait,tick,guardUnchanged,fieldLabel,container,contexts}) {
 return async (e,p,{alive,beginWrite,phase})=>{
  const component=componentObservations.identify(e),wrap=selectWrap(e);
  const adapter=component?.root===wrap?component.contract:null;
  if(adapter&&componentObservations.disabled(e))throw Error('已识别控件处于禁用状态');
  const menuSelector=adapter?adapter.menu+','+baseMenus:baseMenus;
  const optionSelector=adapter?adapter.option:baseOptions;
     phase('opening');
     const before=new Set(all(menuSelector).filter(visible));
     const trigger=(adapter?componentObservations.trigger(e):null)||selectWrap(e)?.querySelector('.ant-select-selector,.ant-select-selection,.Select-control')||controlTarget(e);
     if(!(e.getAttribute('aria-expanded')==='true'&&ownedMenus(e,menuSelector).length))activate(trigger);
     const wanted=Array.isArray(p.value)?p.value:[p.value];
     if(!wanted.length||new Set(wanted).size!==wanted.length)throw Error('选项计划无效');
     for(const v of wanted){
      const exactOptions=()=>[...new Set(menusFor(e,before,menuSelector).flatMap(m=>adapter?componentObservations.optionNodes(m,e):[...m.querySelectorAll(optionSelector)]))]
        .filter(o=>visible(o)&&(p.datePart&&/^\d{1,4}[年月日]?$/.test(text(o))?String(Number(text(o).replace(/[年月日]$/,'')))===String(v):text(o)===String(v))&&o.getAttribute('aria-disabled')!=='true'&&!o.classList.contains('is-disabled'));
      // Search only within the recognized logical control, and only for this
      // already-approved exact value. The editable search text is NOT a selection.
      const wrap=selectWrap(e),editors=wrap?[...wrap.querySelectorAll('input:not([type=hidden]):not([type=password])')].filter(x=>!x.disabled&&!x.readOnly&&!x.closest(menuSelector)):[];
      const search=editors.length===1?editors[0]:null;
      if(!p.datePart&&!p.multiple&&search&&search.value===''&&!exactOptions().length){
       if(!alive()||!guardUnchanged(e,p.fieldId))throw Error('搜索前目标已变化');
       phase('searching');search.focus({preventScroll:true});
       if(!search.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,composed:true,cancelable:true,inputType:'insertText',data:String(v)})))throw Error('网页拒绝搜索输入');
       beginWrite();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,String(v));
       search.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:String(v)}));
       tick('selectSearches');
      }
      const matches=await waitFor(()=>{
       if(!guardUnchanged(e,p.fieldId)||fieldLabel(e)!==p.label||container(e)!==contexts.get(p.fieldId))throw Error('等待期间目标已变化');
       const found=exactOptions();return found.length===1?found:null;
      },{element:e,stableMs:40,alive:()=>alive()&&e.isConnected});
      if(!alive()||!guardUnchanged(e,p.fieldId))throw Error('操作已停止或目标已变化');
      phase('choosing');beginWrite();activate(matches[0]);await wait(0);
     }
     if(Array.isArray(p.value)&&alive()&&menusFor(e,before,menuSelector).length)activate(e);
 };
}
