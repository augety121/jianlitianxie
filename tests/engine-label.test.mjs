import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Isolated function tests, not a DOM/installed-browser substitute. Exercise the real scanner function.
const source=readFileSync(new URL('../extension/engine.js',import.meta.url),'utf8');
const raw=source.slice(source.indexOf(' function labelRaw(e){'),source.indexOf(' // Many ATS pages'));
const label=vm.runInNewContext(raw+';labelRaw',{
 memo:(_key,_node,read)=>read(),labelled:(_node,value)=>value,controlTarget:e=>e,componentValueSelector:'.selected-value',placeholderSelector:'.placeholder',menuSelector:'[role=listbox]',
 subHead:()=>null,labelText:n=>n?.text||'',text:n=>n?.text||n?.textContent||'',visible:n=>n.visible!==false,
 wrappers:'.form-item',controlsSelector:'input,textarea,select',selectWrap:()=>null,selectedSelector:'.selected-value'
});
function input(attrs={},extra={}){return {labels:[],getAttribute:k=>attrs[k]||null,getRootNode:()=>({getElementById:()=>null}),closest:()=>null,...extra};}
test('standard autocomplete beats example placeholders, formal labels still take precedence',()=>{
 assert.equal(label(input({}, {autocomplete:'section-primary email',placeholder:'person@example.invalid'})),'邮箱');
 assert.equal(label(input({}, {autocomplete:'email',labels:[{text:'紧急联系人邮箱'}]})),'紧急联系人邮箱');
 assert.equal(label(input({'data-label':'项目职责'},{placeholder:'请填写'})),'项目职责');
});
test('ARIA IDREF whitespace and missing IDs do not cause wrong labels',()=>{
 assert.equal(label(input({'aria-labelledby':' missing\t  label-id\n'},{getRootNode:()=>({getElementById:id=>id==='label-id'?{text:'专业'}:null})})),'专业');
});
test('shared field wrapper does not steal a neighboring label',()=>{
 const a=input({}, {id:'company',contains:()=>false}),b=input({}, {id:'job',autocomplete:'organization-title',contains:()=>false});
 const wrap={querySelector:()=>({text:'公司名称',htmlFor:'company'}),querySelectorAll:()=>[a,b]};
 b.closest=s=>s==='.form-item'?wrap:null;
 assert.equal(label(b),'职位名称');
});
