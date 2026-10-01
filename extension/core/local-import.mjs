import {tableSchema, tableFacts} from './import-table.mjs';
import {normalizeFact, normalizeProfile, parseImport, MAX_PROFILE_BYTES} from './profile.mjs';
import {secret} from './workspace-policy.mjs';

const sections = new Set(['基本信息','教育经历','教育背景','教育经验','学习经历','工作经历','实习经历','项目经历','项目经验','科研与项目经历','科研及项目经历','科研和项目经历','专业技能','语言能力','获奖经历','奖励荣誉','证书','论文','家庭信息','家庭情况','家庭成员','紧急联系人','求职意向','自我评价','自我描述','社团干部经历','软件著作权','专利']);
const sectionTitle=s=>s.replace(/^(?:[一二三四五六七八九十]+[、.．]|\d+[、.．])\s*/, '').trim();
const cleanLabel = s => s.trim().replace(/^\*\*([^*]+)\*\*$/, '$1').replace(/[:：]$/, '').trim();
const cells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(v => v.trim().replace(/\\\|/g, '|'));
/** Explicit facts and header-driven Markdown tables. No AI, rendering or guessing. */
export function readLocalImport(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_PROFILE_BYTES) throw Error('文件最多2MB，请分批导入');
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) throw Error('文件没有文字');
  let facts = [], skipped = [];
  const add = (label, value, section, entity, line) => {
    const f = normalizeFact({id:crypto.randomUUID(), label:cleanLabel(label), value, section, entity, source:`本人本机导入，第${line}行，待核对`, confirmed:false});
    if (secret(f.label)) throw Error(`第${line}行属于口令类信息，请删除后再导入`);
    facts.push(f);
    if (facts.length > 1000) throw Error('最多1000条资料，请分批导入');
  };
  if (/^[\[{]/.test(text)) {
    const json = JSON.parse(text);
    if (Array.isArray(json) || Array.isArray(json?.facts)) {
      const source = Array.isArray(json) ? json : json.facts;
      // Caller-supplied IDs and confirmation never authorise an import.
      facts = normalizeProfile({facts:source.map(f => ({...f,id:crypto.randomUUID(),source:f?.source || '本人JSON导入，待核对',confirmed:false}))}).facts;
    } else if (json && typeof json === 'object' && Object.values(json).every(v => typeof v === 'string')) {
      for (const [key,value] of Object.entries(json)) add(key,value,'基本信息','',1);
    } else facts = parseImport(text);
    if (facts.some(f => secret(f.label))) throw Error('请从JSON中移除密码、验证码或密钥');
    return {facts:normalizeProfile({facts}).facts, skipped};
  }
  let section = '基本信息', entity = '', fence = false, table = null, ignoredTableRows=0, tableRows=0;
  const lines = text.split(/\r?\n/);
  if (lines.length > 5000) throw Error('文字超过5000行，请分批导入');
  for (let i=0;i<lines.length;i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^```|^~~~/.test(line)) { fence=!fence; skipped.push({line:i+1,text:line}); continue; }
    if (fence) { skipped.push({line:i+1,text:line}); continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { skipped.push({line:i+1,text:line}); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const title = sectionTitle(heading[2]), parts = title.split(/\s*[|｜]\s*/);
      if(['个人信息','个人基本信息','联系方式'].includes(parts[0]))parts[0]='基本信息';
      table = false;
      if (sections.has(parts[0])) { section=parts[0];entity=parts.slice(1).join(' | '); }
      else if (heading[1].length === 2) {section=title;entity='';}
      else if (heading[1].length >= 3 && section && section !== '基本信息') entity=title;
      else {section='';entity='';skipped.push({line:i+1,text:line});}
      continue;
    }
    if (sections.has(line)) {section=line;entity='';table=false;continue;}
    // Explicit standalone Markdown field headings own their entire value block.
    // Do not re-parse colons inside a project paragraph as separate profile facts.
    const block=line.match(/^\*\*([^*\n：:]{1,160})[：:]?\*\*\s*[：:]?$/);
    if(block){
      let end=i+1;const value=[];
      while(end<lines.length){
        const next=lines[end].trim();
        const boldNext=next.match(/^\*\*([^*\n：:]{1,160})([：:]?)\*\*(.*)$/);
        const fieldBoundary=boldNext&&(!boldNext[3].trim()||boldNext[2]||/^[：:]/.test(boldNext[3].trim()));
        if(/^#{1,6}\s|^```|^~~~/.test(next)||sections.has(next)||fieldBoundary||/^(?:-{3,}|\*{3,}|_{3,})$/.test(next))break;
        value.push(lines[end]);end++;
      }
      const body=value.join('\n').trim();
      if(body)add(block[1],body,section,entity,i+1);
      else skipped.push({line:i+1,text:line});
      i=end-1;table=false;continue;
    }
    if(!section&&/^(更新日期|文档版本|使用说明)[：:]/.test(line)){skipped.push({line:i+1,text:line});continue;}
    if (line.startsWith('|') || line.includes('|') && (table || /^\s*\|?\s*:?-{3,}/.test(lines[i+1]||''))) {
      const row=cells(line);
      if(row.length>=2&&row.every(c=>/^:?-{3,}:?$/.test(c)))continue;
      const schema=tableSchema(row,section);
      if(schema){table=schema;continue;}
      const parsed=table&&tableFacts(table,row,section,entity,i+1);
      if(parsed){for(const f of parsed)add(f.label,f.value,f.section,f.entity,i+1);tableRows++;}
      else {skipped.push({line:i+1,text:line});ignoredTableRows++;}
      continue;
    }
    table=false;
    const marked=line.replace(/^[-*+]\s+/, '').replace(/^\*\*([^*：:]+[：:])\*\*\s*/, '$1');
    const pair=marked.match(/^(.{1,200}?)[：:]\s*(.+)$/);
    if (pair && !/^(https?|ftp|\d+)$/i.test(pair[1].trim())) {
      add(pair[1],pair[2],section,entity,i+1);
    } else skipped.push({line:i+1,text:line});
  }
  if (!facts.length) throw Error('未识别到字段，请使用示例MD或JSON；普通段落不会被猜成个人信息');
  return {facts:normalizeProfile({facts}).facts, skipped, warnings:ignoredTableRows?[`有${ignoredTableRows}行表格未按明确表头识别，保留在未归类区；保存条数不代表原文完整导入。`]:[], tableRows};
}
