import {normalizeFact,MAX_PROFILE_BYTES} from './profile.mjs';
/** Deterministic draft assistant. Only explicit field/value pairs become facts.
 * Unclassified paragraphs remain visible; a school/title/age is never inferred.
 */
const sections=new Set(['基本信息','教育经历','教育背景','工作经历','实习经历','项目经历','专业技能','证书','获奖经历','语言能力','家庭信息']);
export function draftText(text,{section='基本信息',entity=''}={}) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_PROFILE_BYTES)throw Error('导入文本最多2MB');
  const facts=[],unmapped=[];let currentSection=section,currentEntity=entity;
  const lines=text.split(/\r?\n/);if(lines.length>4000)throw Error('文档超过4000行，请分段导入');
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();if(!line)continue;
    const heading=line.replace(/^[#【\[]+\s*|\s*[】\]]+$/g,'');
    if(sections.has(heading)){currentSection=heading;currentEntity='';continue;}
    const declaration=heading.match(/^([^：:|]{1,20})\s*[：:|]\s*(.{1,200})$/);
    if(declaration&&sections.has(declaration[1].trim())){currentSection=declaration[1].trim();currentEntity=declaration[2].trim();continue;}
    const m=line.match(/^([^：:\t]{1,80})\s*[：:\t]\s*(\S.*)$/u);
    if(m&&!/^(?:https?|ftp|\d+)$/i.test(m[1].trim())&&!m[2].includes('\t')){
      try{facts.push(normalizeFact({id:crypto.randomUUID(),label:m[1].trim(),value:m[2],section:currentSection,entity:currentEntity,source:`本机文本导入，第${i+1}行，待核实`,confirmed:false}));}
      catch{unmapped.push({line:i+1,text:line,section:currentSection,entity:currentEntity});}
    }else unmapped.push({line:i+1,text:line,section:currentSection,entity:currentEntity});
  }
  if(facts.length>1000)throw Error('本次识别超过1000条资料，请分批导入');
  return {facts,unmapped};
}
