/** Synthetic ZIP fixtures only; uses node:zlib independently of the production reader. */
import {deflateRawSync} from 'node:zlib';
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
export const crc=b=>{let c=0xffffffff;for(const n of b)c=(c>>>8)^table[(c^n)&255];return (c^0xffffffff)>>>0;};
export function zip(entries,{method=8,flags=0}={}){
 const locals=[],central=[];let offset=0;
 for(const [name,text] of entries){const filename=Buffer.from(name),plain=Buffer.from(text),data=method===8?deflateRawSync(plain):plain;
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(flags,6);l.writeUInt16LE(method,8);l.writeUInt16LE(filename.length,26);
  if(!(flags&8)){l.writeUInt32LE(crc(plain),14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(plain.length,22);}
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc(plain),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(plain.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
  const payload=Buffer.concat([l,filename,data]);locals.push(payload);offset+=payload.length;central.push(c,filename);
 }
 const end=Buffer.alloc(22),cd=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,end]);
}
export const typeXML='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
export const wordXML='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>姓名：Synthetic</w:t></w:r></w:p></w:body></w:document>';
export const parts=(xml=wordXML)=>[['[Content_Types].xml',typeXML],['word/document.xml',xml]];
