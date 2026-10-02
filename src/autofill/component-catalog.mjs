/** DOM interoperability contracts, independently implemented for this project.
 * No vendor extension source, page JavaScript objects, network or profile storage.
 * Each adapter owns discovery, canonical field, trigger, display and menu vocabulary.
 */
export function createComponentCatalog({visible}) {
  const contracts = [
    {id:'moka',root:'[class*="sd-Dropdown-container"]:has([class*="sd-Select-container"])',
      trigger:['[class*="sd-Select-container"]'],
      display:['[class*="sd-Input-display-value"]','[class*="sd-Select-value"]'],
      placeholder:'[class*="sd-Input-placeholder"],[class*="sd-Select-placeholder"]',
      menu:'[class*="sd-Dropdown-dropdown"],[class*="sd-Select-menu"],[class*="sd-panal-menu-wrapper"]',
      option:'[class*="sd-Menu-content-item"],[role=option]',
      disabled:'[aria-disabled=true],[class*="sd-Select-disabled"],[class*="sd-Select-containerDisabled"]'},
    {id:'phoenix', root:'.phoenix-select',
      trigger:['.phoenix-select__content','.phoenix-select__input'],
      display:['.phoenix-select__tipEle','.phoenix-select-selection-selected-value','.phoenix-select__content [data-selected-label]'],
      placeholder:'.phoenix-select__placeHolder--show',
      menu:'.phoenix-selectList,.phoenix-select__dropdown',
      option:'.phoenix-selectList__listItem,[role=option]',
      disabled:'.phoenix-select--disabled', multi:'.phoenix-select--multi'},
    {id:'phoenix-autocomplete', root:'.phoenix-auto-complete-container',
      trigger:['input'], display:[], placeholder:'', menu:'.phoenix-selectList',
      option:'.phoenix-selectList__listItem,[role=option]', editableValue:true},
    {id:'atsx', root:'.atsx-select', trigger:['.atsx-select-selector','.atsx-select-selection'],
      display:['.atsx-select-selection-item','.atsx-select-value','.atsx-select-selection-selected-value'],
      placeholder:'.atsx-select-selection-placeholder', menu:'.atsx-select-dropdown',
      option:'.atsx-select-item-option,.atsx-select-dropdown-menu-item,[role=option]',
      disabled:'.atsx-select-disabled',multi:'.atsx-select-multiple'},
    {id:'ant', root:'.ant-select', trigger:['.ant-select-selector','.ant-select-selection'],
      display:['.ant-select-selection-item','.ant-select-selection-selected-value'],
      placeholder:'.ant-select-selection-placeholder,.ant-select-selection__placeholder',
      menu:'.ant-select-dropdown', option:'.ant-select-item-option,.ant-select-dropdown-menu-item,[role=option]',
      disabled:'.ant-select-disabled',multi:'.ant-select-multiple,.ant-select-selection--multiple'},
    {id:'element', root:'.el-select',trigger:['.el-select__wrapper','.el-input'],
      display:['.el-select__selected-item:not(.is-placeholder)'],
      placeholder:'.el-select__placeholder.is-transparent,.el-select__selected-item.is-placeholder',
      menu:'.el-select-dropdown',option:'.el-select-dropdown__item,[role=option]',
      disabled:'.el-select--disabled,.is-disabled',readonlyValue:true},
    {id:'ivu',root:'.ivu-select',trigger:['.ivu-select-selection'],
      display:['.ivu-select-selected-value'],placeholder:'.ivu-select-placeholder',
      menu:'.ivu-select-dropdown',option:'.ivu-select-item,[role=option]',disabled:'.ivu-select-disabled'},
    {id:'react-select',root:'.Select,.react-select__control',trigger:['.Select-control'],
      display:['.Select-value-label','.react-select__single-value'],
      placeholder:'.Select-placeholder,.react-select__placeholder',
      menu:'.Select-menu-outer,.react-select__menu',option:'.Select-option,.react-select__option,[role=option]'}
  ].map(c => Object.freeze(c));
  const rootSelector=contracts.map(c=>c.root).join(',');
  const menuSelector=[...new Set(contracts.map(c=>c.menu))].join(',');
  const optionSelector=[...new Set(contracts.map(c=>c.option))].join(',');
  const displaySelector=contracts.flatMap(c=>c.display).join(',');
  const placeholderSelector=contracts.map(c=>c.placeholder).filter(Boolean).join(',');
  const editorSelector='input:not([type=hidden]):not([type=password]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])';
  const normalized=node=>String(node?.getAttribute('data-selected-label')||node?.textContent||'').replace(/\s+/g,' ').trim();
  function identify(node) {
    if(!node?.closest||node.tagName==='SELECT'||node.closest(menuSelector))return null;
    const root=node.closest(rootSelector);
    if(!root)return null;
    const contract=contracts.find(c=>root.matches(c.root));
    return {root,contract};
  }
  function editors(root) {
    return [...root.querySelectorAll(editorSelector)].filter(e=>!e.closest(menuSelector)&&e.closest(rootSelector)===root);
  }
  function canonical(node) {
    const item=identify(node);if(!item)return node;
    const inputs=editors(item.root);
    // A single logical editor remains stable even when its visual input is tiny.
    // Several editors are ambiguous, not permission to address the whole wrapper.
    if(inputs.length>1)return null;
    return inputs[0]||item.root;
  }
  function trigger(node) {
    const item=identify(node);if(!item)return null;
    for(const selector of item.contract.trigger) {
      const candidate=item.root.querySelector(selector),r=candidate?.getBoundingClientRect();
      if(candidate&&visible(candidate)&&r.width>=12&&r.height>=12)return candidate;
    }
    return item.root;
  }
  function displayNodes(node) {
    const item=identify(node);if(!item)return null;
    for(const selector of item.contract.display) {
      const list=[...item.root.querySelectorAll(selector)].filter(n=>!n.matches('input,textarea,select')&&
        !n.querySelector('input,textarea,select')&&!n.closest(menuSelector)&&visible(n)&&normalized(n));
      if(list.length)return list.filter(n=>!list.some(x=>x!==n&&n.contains(x)));
    }
    return [];
  }
  function read(node) {
    const item=identify(node);if(!item)return {known:false};
    const nodes=displayNodes(node),values=[...new Set(nodes.map(normalized))];
    if(values.length)return {known:true,value:values.length===1?values[0]:values,displayed:true};
    const {root,contract}=item,inputs=editors(root),input=inputs.length===1?inputs[0]:null;
    if(contract.placeholder&&[...root.querySelectorAll(contract.placeholder)].some(visible))return {known:true,value:'',displayed:false};
    if(input&&(contract.editableValue||contract.readonlyValue&&input.readOnly))return {known:true,value:input.value||'',displayed:false};
    return {known:true,value:'',displayed:false};
  }
  function disabled(node) {
    const item=identify(node);return !!(item&&(item.root.getAttribute('aria-disabled')==='true'||
      item.contract.disabled&&(item.root.matches(item.contract.disabled)||[...item.root.querySelectorAll(item.contract.disabled)].some(n=>!n.closest(menuSelector)))));
  }
  function multiple(node) {
    const item=identify(node);return !!(item&&(item.root.getAttribute('aria-multiselectable')==='true'||
      item.contract.multi&&(item.root.matches(item.contract.multi)||item.root.querySelector(item.contract.multi))));
  }
  function optionNodes(menu,node) {
    const item=identify(node),selector=item?.contract.option||optionSelector;
    if(item&&!menu.matches(item.contract.menu)&&!menu.querySelector(item.contract.menu)){
      const linked=(node.getAttribute('aria-controls')||node.getAttribute('aria-owns')||item.root.getAttribute('aria-controls')||item.root.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean);
      if(!linked.some(id=>menu.id===id))return [];
    }
    const nodes=[...menu.querySelectorAll(selector)].filter(visible);
    return nodes.filter(n=>!nodes.some(x=>x!==n&&x.contains(n)));
  }
  return Object.freeze({contracts,rootSelector,menuSelector,optionSelector,displaySelector,placeholderSelector,
    identify,canonical,trigger,displayNodes,read,disabled,multiple,optionNodes});
}
