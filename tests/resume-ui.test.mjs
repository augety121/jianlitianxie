import {profileReadiness,readinessText} from '../extension/core/profile-readiness.mjs';
import {recordDirectory} from '../extension/core/record-model.mjs';
import {logPreview,logBlob,selectLogExport} from '../extension/core/log-export.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {localHarness} from './helpers/local-harness.mjs';
import {planExplanation} from '../extension/core/page-summary.mjs';
import {semanticLabel} from '../extension/core/semantics.mjs';
import {reviewPage,mappingCandidates} from '../extension/core/review-model.mjs';
import {parseResumeText} from '../extension/core/resume-parser.mjs';
import {extractResumeFile} from '../extension/core/resume-file.mjs';
import {explainDiagnostic} from '../extension/core/match-diagnostics.mjs';
import {zip,parts} from './helpers/docx-fixture.mjs';
const html=await fs.readFile(new URL('../extension/local.html',import.meta.url),'utf8');
const source=(await fs.readFile(new URL('../extension/local.js',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'');
test('management UI uploads Word, edits draft, saves confirmed facts and prepares filling',async()=>{
 const h=localHarness();await h.attach();
 const dom=new JSDOM(html,{url:'https://extension.example.invalid/local.html?tab=11',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const oldParser=globalThis.DOMParser;globalThis.DOMParser=w.DOMParser;
 w.scrollTo=()=>{};w.confirm=()=>true;
 w.chrome={runtime:{sendMessage:async message=>{try{return {data:await h.workflow.request(message,h.sender)};}catch(e){return {error:e.message};}},getManifest:()=>({version:'0.9.0'})}};
 Object.assign(w,{acknowledgeUi:async()=>{},recordDirectory,readinessText,profileReadiness,logPreview,logBlob,selectLogExport,planExplanation,semanticLabel,reviewPage,mappingCandidates,parseResumeText,extractResumeFile,explainDiagnostic});
 const waitUntil=async condition=>{for(let i=0;i<80;i++){if(condition())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.querySelector('#notice').textContent);};
 try{
  await w.eval('(async()=>{'+source+'})()');
  const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>姓名：解析名字</w:t></w:r></w:p><w:p><w:r><w:t>邮箱：sample@example.invalid</w:t></w:r></w:p></w:body></w:document>';
  const file=new File([zip(parts(xml))],'synthetic.docx');Object.defineProperty(w.document.querySelector('#importFile'),'files',{value:[file],configurable:true});
  await w.document.querySelector('#importFile').onchange();
  const rows=[...w.document.querySelectorAll('.import-row')];assert.equal(rows.length,2);assert.equal(w.document.querySelector('#importPreview').hidden,false);
  const name=rows.find(row=>row.querySelector('input[aria-label="字段名称"]').value==='姓名');const value=name.querySelector('textarea');value.value='核对名字';value.oninput();
  // Invoke only the UI event handler in a synthetic DOM. This is not a trusted-browser-click test.
  w.document.querySelector('#commitImport').onclick({isTrusted:true});
  await waitUntil(()=>w.document.querySelector('#savedCount').textContent==='2'&&!w.document.querySelector('#review').hidden);
  const state=await h.api('state',{tabId:11});assert.equal(state.profile.facts.find(f=>f.label==='姓名').value,'核对名字');
  assert(state.profile.facts.every(f=>f.confirmed));assert(w.document.querySelector('#counts').textContent.includes('可填 2'));
  assert.equal(h.calls.filter(c=>c.action==='apply').length,0);
  w.document.querySelector('[data-view="logs"]').click();
  await waitUntil(()=>w.document.querySelector('#logs details'));
  const details=w.document.querySelector('#logs details');assert.equal(details.querySelector('pre'),null);details.open=true;details.ontoggle();
  await waitUntil(()=>w.document.querySelector('#logs').textContent.includes('最终候选'));
  assert(w.document.querySelector('#logs').textContent.includes('阶段：matching'));
 }finally{globalThis.DOMParser=oldParser;w.close();}
});
