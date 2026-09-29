import {extractDocx} from './docx-import.mjs';
export function pdfItemsToLines(items){
 const lines=[];let line='',lastY=null,lastEnd=null;
 for(const item of items){if(typeof item.str!=='string')continue;const x=item.transform?.[4]??0,y=item.transform?.[5]??0;
  if(lastY!==null&&Math.abs(y-lastY)>3&&line){lines.push(line);line='';lastEnd=null;}
  if(line&&lastEnd!==null&&x-lastEnd>6)line+='  ';
  line+=item.str;lastY=y;lastEnd=x+(item.width||0);
  if(item.hasEOL){lines.push(line);line='';lastY=null;lastEnd=null;}
 }
 if(line)lines.push(line);return lines.join('\n');
}
export async function extractResumeFile(file){
 if(!file||file.size>12*1024*1024)throw Error('简历文件最多12MB');
 const ext=file.name.split('.').pop().toLowerCase();
 if(ext==='docx')return extractDocx(new Uint8Array(await file.arrayBuffer()));
 if(ext!=='pdf')throw Error('请选择PDF或DOCX简历；旧版DOC请另存为DOCX');
 const pdfjs=await import('../vendor/pdfjs/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:false,
  cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href});
 const timeout=setTimeout(()=>task.destroy(),30000);
 try{
  const pdf=await task.promise;if(pdf.numPages>30)throw Error('简历超过30页，请使用较短版本');
  const pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);pages.push(pdfItemsToLines((await page.getTextContent()).items));page.cleanup();}
  const text=pages.join('\n');if(text.replace(/\s/g,'').length<15)throw Error('PDF没有可读取的文字层；图片扫描件需先在本机转为文字');
  if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('简历正文超过2MB');
  return {text,warnings:['PDF本地读取文字层；多栏排版、图片及特殊字体请对照原文件核对。']};
 }catch(e){if(e.name==='PasswordException')throw Error('PDF有密码，请使用解密后的副本');throw e;}
 finally{clearTimeout(timeout);await task.destroy();}
}
