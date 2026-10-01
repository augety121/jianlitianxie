import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createComponentCatalog} from '../src/autofill/component-catalog.mjs';
import {executionReceipt} from '../extension/core/execution-receipt.mjs';
import {cleanDiagnostic,fieldDiagnostic,explainDiagnostic} from '../extension/core/match-diagnostics.mjs';
import {LocalReceipts,exportReceipts} from '../extension/core/local-receipts.mjs';
import {memory} from './helpers/local-harness.mjs';
const catalogFor=html=>{const dom=new JSDOM(html),catalog=createComponentCatalog({visible:n=>!n.hidden&&!n.closest('[hidden],[aria-hidden=true]')});return {dom,catalog,document:dom.window.document};};
test('Phoenix uses committed display, never its empty search editor',()=>{
 const {document,catalog}=catalogFor('<div class="phoenix-select"><div class="phoenix-select__content"><span class="phoenix-select__tipEle">示例选择</span></div><input id="e"></div>');
 const read=catalog.read(document.getElementById('e'));
 assert.deepEqual(read,{known:true,value:'示例选择',displayed:true});
});
test('component catalog never adopts a native select or a menu search as a main field',()=>{
 const {document,catalog}=catalogFor('<select id="n"></select><div class="phoenix-selectList"><input id="s"></div>');
 assert.equal(catalog.identify(document.getElementById('n')),null);assert.equal(catalog.identify(document.getElementById('s')),null);
});
test('multiple internal editors remain ambiguous and do not collapse into a new field',()=>{
 const {document,catalog}=catalogFor('<div class="ant-select"><input id="a"><input id="b"></div>');
 assert.equal(catalog.canonical(document.getElementById('a')),null);
});
test('nested option nodes represent a single option instead of false duplicate candidates',()=>{
 const {document,catalog}=catalogFor('<div class="ant-select"><input id="e"></div><div id="menu" class="ant-select-dropdown"><div class="ant-select-item-option"><span role="option">示例选择</span></div></div>');
 const options=catalog.optionNodes(document.getElementById('menu'),document.getElementById('e'));
 assert.equal(options.length,1);assert.equal(options[0].className,'ant-select-item-option');
});
test('execution metadata is a strict allowlist, not an error-message or value channel',()=>{
 const input={executionPhase:'searching',attempted:true,reasonCode:'option-unavailable',value:'PRIVATE_SENTINEL',url:'https://private.invalid/path',reason:'PRIVATE_SENTINEL'};
 assert.deepEqual(executionReceipt(input),{executionPhase:'searching',attempted:true,reasonCode:'option-unavailable'});
 assert.deepEqual(executionReceipt({executionPhase:'PRIVATE_SENTINEL',attempted:'true',reasonCode:'PRIVATE_SENTINEL'}),{});
 const d=fieldDiagnostic({...input,status:'needs-user',label:'专业',section:'教育经历'});
 assert.equal(d.code,'option-unavailable');assert.equal(d.executionPhase,'searching');
 assert(explainDiagnostic(d).includes('searching'));assert(!JSON.stringify(cleanDiagnostic(d)).includes('PRIVATE_SENTINEL'));
});
test('execution phase and attempted state survive local export without arbitrary strings',async()=>{
 const storage=memory(),receipts=new LocalReceipts(storage);
 receipts.add({stage:'fill',ok:true,ms:1,total:1,fields:[{index:1,status:'needs-user',code:'option-unavailable',executionPhase:'opening',attempted:false,value:'PRIVATE_SENTINEL',reason:'PRIVATE_SENTINEL'}]});
 const exported=exportReceipts(await receipts.read()),field=exported.records[0].fields[0];
 assert.equal(field.executionPhase,'opening');assert.equal(field.attempted,false);assert.equal(field.code,'option-unavailable');
 assert(!JSON.stringify(exported).includes('PRIVATE_SENTINEL'));
});
test('a hidden display marker never becomes committed text',()=>{
 const {document,catalog}=catalogFor('<div class="phoenix-select"><span class="phoenix-select__tipEle" hidden>HIDDEN</span><input id="e"></div>');
 assert.equal(catalog.read(document.getElementById('e')).value,'');
});
