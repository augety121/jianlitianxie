import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocxXML,MAX_DOCX_BYTES,MAX_XML_BYTES} from '../extension/core/docx-import.mjs';
import {draftText} from '../extension/core/import-assistant.mjs';
import {zip,parts,wordXML,crc} from './helpers/docx-fixture.mjs';
test('DOCX reader uses CRC32 checksum and reads both stored and deflated body parts',async()=>{
 assert.equal(crc(Buffer.from('123456789')),0xcbf43926);
 for(const method of [0,8])assert.equal(await readDocxXML(zip(parts(),{method})),wordXML);
});
test('central sizes allow streamed ZIP local headers with data-descriptor flags',async()=>{
 assert.equal(await readDocxXML(zip(parts(),{flags:8})),wordXML);
});
test('a truncated DOCX, missing body, encrypted member and unsafe path are rejected',async()=>{
 for(const bytes of [zip(parts()).subarray(0,-5),zip(parts().slice(0,1)),zip(parts(),{flags:1}),zip([...parts(),['../anything','no']])])await assert.rejects(readDocxXML(bytes));
});
test('duplicate parts, macros disguised as DOCX and malformed content types are rejected',async()=>{
 for(const bytes of [zip([...parts(),parts()[1]]),zip([...parts(),['word/vbaProject.bin','macro']]),zip([['[Content_Types].xml','macroEnabled'],parts()[1]])])await assert.rejects(readDocxXML(bytes));
});
test('CRC mismatch and local/central identity mismatch never return a partial document',async()=>{
 const bad=zip(parts(),{method:0});const position=bad.indexOf(Buffer.from('Synthetic'));bad[position]=88;
 await assert.rejects(readDocxXML(bad),/校验/);
 const mismatch=zip(parts());mismatch[30]=88;await assert.rejects(readDocxXML(mismatch));
});
test('untrusted compression declarations cannot exceed XML or archive byte limits',async()=>{
 await assert.rejects(readDocxXML(new Uint8Array(MAX_DOCX_BYTES+1)),/8MB/);
 await assert.rejects(readDocxXML(zip(parts('x'.repeat(MAX_XML_BYTES+1)))),/正文过大/);
 const falseSize=zip(parts('x'.repeat(200000)));const index=falseSize.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),falseSize.readUInt32LE(falseSize.length-6));
 // Find the second central header, then deliberately understate its decompressed size.
 const second=falseSize.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),index+4);const local=falseSize.readUInt32LE(second+42);falseSize.writeUInt32LE(1,second+24);falseSize.writeUInt32LE(1,local+22);
 await assert.rejects(readDocxXML(falseSize),/超出/);
});
test('bounded directory parser rejects excess parts, unsupported compression and multiple disks',async()=>{
 await assert.rejects(readDocxXML(zip([...parts(),...Array.from({length:512},(_,i)=>['part'+i,''])])));
 await assert.rejects(readDocxXML(zip(parts(),{method:99})));
 const multiple=zip(parts());multiple.writeUInt16LE(1,multiple.length-18);await assert.rejects(readDocxXML(multiple));
});
test('import abortion and DTD declarations fail without returning text',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(readDocxXML(zip(parts()),{signal:controller.signal}),/取消/);
 await assert.rejects(readDocxXML(zip(parts('<!DOCTYPE x [<!ENTITY x SYSTEM "https://example.invalid/">]>'+wordXML))),/XML声明/);
});
test('document drafts recognise explicit section and entity headings, never invent experience order',()=>{
 const r=draftText('教育经历：本科\n学校：Synthetic Academy\n专业：Engineering\n教育经历：硕士\n学校：Synthetic Institute\n2024-2026\nA free paragraph');
 assert.equal(r.facts.length,3);assert(r.facts.every(f=>f.confirmed===false));assert.equal(r.facts[0].entity,'本科');assert.equal(r.facts[2].entity,'硕士');assert.equal(r.unmapped.length,2);
 assert(!r.facts.some(f=>f.label.includes('时间')));
});
test('table field-value pairs preserve labels, and unknown columns or bare URLs remain unclassified',()=>{
 const r=draftText('姓名\tSynthetic\n邮箱\tmail@example.invalid\n学校\tA\t专业\tB\nhttps://example.invalid/');
 assert.equal(r.facts.length,2);assert.equal(r.unmapped.length,2);assert.equal(r.facts[1].value,'mail@example.invalid');
});
test('blank headings reset record scope and all unclassified content stays available',()=>{
 const r=draftText('教育经历：本科\n学校：A\n工作经历\n公司名称：B\n一整段未识别描述');
 assert.equal(r.facts[1].entity,'');assert.equal(r.facts[1].section,'工作经历');assert.equal(r.unmapped[0].text,'一整段未识别描述');
});
test('document draft line and fact counts are bounded, invalid long pairs remain unclassified',()=>{
 assert.throws(()=>draftText('x\n'.repeat(4001)),/4000/);
 assert.throws(()=>draftText('字段：值\n'.repeat(1001)),/1000/);
 assert.equal(draftText('内容：'+'x'.repeat(10001)).unmapped.length,1);
});
