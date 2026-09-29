/** Local-only, bounded DOCX text reader. No ZIP extraction, rendering, links or network.
 * Supported: ordinary unencrypted ZIP (stored/deflate), Word body paragraphs/tables.
 * Not supported: PDF/.doc, OCR, macros, ZIP64, external parts, embedded documents.
 */
export const MAX_DOCX_BYTES = 8 * 1024 * 1024;
export const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = 512, MAX_TEXT = 2 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
function cancelled(signal) { if (signal?.aborted) throw Error('导入已取消'); }
function bad(message = 'DOCX 压缩结构无效或不受支持') { throw Error(message); }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Return only the main XML part after byte bounds, format and CRC validation. */
export async function readDocxXML(input, {signal} = {}) {
  cancelled(signal);
  if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) bad('DOCX输入必须是文件字节');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || bytes.length > MAX_DOCX_BYTES) bad('DOCX 须为不超过8MB的普通 Word 文档');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (p,n,end=bytes.length) => Number.isSafeInteger(p) && p>=0 && n>=0 && p+n<=end;
  const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
    if(u32(i)===0x06054b50 && i+22+u16(i+20)===bytes.length){end=i;break;}
  }
  if(end<0 || u16(end+4)!==0 || u16(end+6)!==0) bad();
  const count=u16(end+10),length=u32(end+12),offset=u32(end+16);
  if(!count || count>MAX_PARTS || count!==u16(end+8) || offset+length!==end) bad();
  let cursor=offset;const parts=new Map(),ranges=[];
  for(let i=0;i<count;i++) {
    if(!fits(cursor,46,end)||u32(cursor)!==0x02014b50)bad();
    const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),size=u32(cursor+20),plain=u32(cursor+24);
    const nl=u16(cursor+28),el=u16(cursor+30),cl=u16(cursor+32),start=u32(cursor+42),total=46+nl+el+cl;
    if(!fits(cursor,total,end)||u16(cursor+34)!==0||size===0xffffffff||plain===0xffffffff||start===0xffffffff||flags&0x41)bad('不支持加密、分卷或 ZIP64 文档');
    let name;try{name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nl));}catch{bad();}
    if(!name||name.length>300||/[\\\x00]/.test(name)||name.startsWith('/')||name.split('/').includes('..')||parts.has(name))bad();
    if(/(?:^|\/)vbaProject\b/i.test(name)||/\.docm$/i.test(name))bad('不导入包含宏的文档');
    if(!fits(start,30,offset)||u32(start)!==0x04034b50)bad();
    const localNL=u16(start+26),localEL=u16(start+28),dataStart=start+30+localNL+localEL;
    if(!fits(start,30+localNL+localEL,offset)||!fits(dataStart,size,offset)||u16(start+6)!==flags||u16(start+8)!==method)bad();
    if(decoder.decode(bytes.subarray(start+30,start+30+localNL))!==name)bad();
    if(!(flags&8) && (u32(start+14)!==crc||u32(start+18)!==size||u32(start+22)!==plain))bad();
    ranges.push([start,dataStart+size]);parts.set(name,{method,crc,size,plain,dataStart});cursor+=total;
  }
  if(cursor!==end)bad();ranges.sort((a,b)=>a[0]-b[0]);
  if(ranges.some((r,i)=>i>0&&r[0]<ranges[i-1][1]))bad();
  async function part(name,limit) {
    cancelled(signal);const p=parts.get(name);
    if(!p||p.plain>limit||![0,8].includes(p.method))bad('文档缺少正文、正文过大或压缩方式不受支持');
    const compressed=bytes.subarray(p.dataStart,p.dataStart+p.size);let output;
    if(p.method===0)output=compressed;
    else {
      let ds;try{ds=new DecompressionStream('deflate-raw');}catch{bad('此浏览器不能本地解压DOCX，请更新浏览器或使用TXT');}
      const reader=new Blob([compressed]).stream().pipeThrough(ds).getReader();
      const chunks=[];let total=0, timedOut=false;
      const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{timedOut=true;abort();},5000);
      try {
        while(true){cancelled(signal);const {done,value}=await reader.read();cancelled(signal);if(timedOut)bad('本地解压超时，请使用较小文档');if(done)break;
          total+=value.length;if(total>limit||total>p.plain)bad('正文解压超出声明或大小限制');chunks.push(value);}
        output=new Uint8Array(total);let at=0;for(const c of chunks){output.set(c,at);at+=c.length;}
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    if(output.length!==p.plain||crc32(output)!==p.crc)bad('DOCX 内容校验失败，请重新导出文档');
    let text;try{text=decoder.decode(output);}catch{bad('仅支持UTF-8编码的DOCX正文');}
    if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(text)||text.includes('\0'))bad('文档包含不允许的XML声明');
    return text;
  }
  const contentTypes=await part('[Content_Types].xml',128*1024);
  if(/macroEnabled|vbaProject/i.test(contentTypes)||!contentTypes.includes('wordprocessingml.document.main+xml'))bad('不是普通的无宏DOCX文档');
  return part('word/document.xml',MAX_XML_BYTES);
}

/** Read XML as a detached XML document; NEVER inject imported nodes into the UI. */
export function wordXMLToText(xml) {
  if(typeof xml!=='string'||encoder.encode(xml).length>MAX_XML_BYTES||/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml))bad('XML正文不受支持');
  const document=new DOMParser().parseFromString(xml,'application/xml');
  const ns=document.documentElement?.namespaceURI;
  if(document.getElementsByTagName('parsererror').length || document.documentElement?.localName!=='document' ||
    !['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'].includes(ns))bad('Word正文XML无效');
  const body=document.getElementsByTagNameNS(ns,'body')[0];if(!body)bad('没有可读取的Word正文');
  const all=body.getElementsByTagName('*');if(all.length>50000)bad('文档结构过于复杂，请先简化文档');
  const warnings=['只提取正文段落与表格文字；不识别图片、页眉页脚、文本框、批注或嵌入文件。请对照原文核对。'];
  if(document.getElementsByTagNameNS(ns,'del').length||document.getElementsByTagNameNS(ns,'moveFrom').length)warnings.push('检测到修订：删除内容不导入，保留的新增文字仍须核实。');
  const word=(n,name)=>n.nodeType===1&&n.namespaceURI===ns&&n.localName===name;
  const omitted=new Set(['del','moveFrom','instrText','txbxContent','altChunk','pPr','rPr']);
  function walk(n,depth=0) {
    if(depth>80)bad('文档嵌套过深');
    if(n.nodeType!==1||n.namespaceURI!==ns)return '';
    if(omitted.has(n.localName))return '';
    if(word(n,'r')){const props=[...n.children].find(x=>word(x,'rPr'));if(props&&[...props.children].some(x=>word(x,'vanish')||word(x,'webHidden')))return '';}
    if(word(n,'t'))return n.textContent;
    if(word(n,'tab'))return '\t';if(word(n,'br')||word(n,'cr'))return '\n';
    const text=[...n.children].map(c=>walk(c,depth+1)).join('');
    if(word(n,'p'))return text+'\n';if(word(n,'tc'))return text.trimEnd()+'\t';if(word(n,'tr'))return text.trimEnd()+'\n';
    return text;
  }
  const text=walk(body).replace(/\r/g,'').trim();
  if(!text)bad('未找到可导入文字；图片简历需要先在本机转成文字');
  if(encoder.encode(text).length>MAX_TEXT)bad('提取文本超过2MB');
  return {text,warnings};
}
export async function extractDocx(input, options={}) {
  const xml=await readDocxXML(input,options);cancelled(options.signal);
  return wordXMLToText(xml);
}
