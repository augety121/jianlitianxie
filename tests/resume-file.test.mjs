import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {extractResumeFile,pdfItemsToLines} from '../extension/core/resume-file.mjs';
import {parseResumeText} from '../extension/core/resume-parser.mjs';
import {zip,parts} from './helpers/docx-fixture.mjs';
test('Word upload reads real compressed OOXML bytes into editable draft facts',async()=>{
 const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;
 try{
  const paragraphs=['姓名：示例乙','教育背景','虚构大学 计算机（硕士） 2024.09—2027.07','项目经历','模拟工具','2026.05—至今｜独立开发','问题与方法：实现可回读的表单填写。','结果与指标：通过12项虚构测试。'];
  const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs.map(t=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>';
  const out=await extractResumeFile(new File([zip(parts(xml))],'synthetic.docx'));
  const draft=parseResumeText(out.text);assert.equal(draft.facts.find(f=>f.label==='姓名').value,'示例乙');
  assert(draft.facts.some(f=>f.label==='项目成果'&&f.value.includes('12项')));assert(draft.facts.every(f=>!f.confirmed));
 }finally{delete globalThis.DOMParser;dom.window.close();}
});
test('PDF text fragments preserve word gaps and line changes',()=>{
 const item=(str,x,y,width,hasEOL=false)=>({str,transform:[1,0,0,1,x,y],width,hasEOL});
 assert.equal(pdfItemsToLines([item('项目',0,100,20),item('标题',21,100,20),item('2026.05',90,100,45,true),item('正文',0,80,20)]),'项目标题  2026.05\n正文');
});
test('unsupported format and oversized resume fail before parsing',async()=>{
 await assert.rejects(extractResumeFile(new File(['data'],'old.doc')),/DOCX/);
 await assert.rejects(extractResumeFile({name:'large.pdf',size:13*1024*1024}),/12MB/);
});
