import {normalizeFact, normalizeProfile, parseImport, MAX_PROFILE_BYTES} from './profile.mjs';
import {secret} from './workspace-policy.mjs';

const sections = new Set(['基本信息','教育经历','教育背景','工作经历','实习经历','项目经历','专业技能','语言能力','获奖经历','证书','论文','家庭信息']);
const cleanLabel = s => s.trim().replace(/^\*\*([^*]+)\*\*$/, '$1').replace(/[:：]$/, '').trim();
const cells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(v => v.trim().replace(/\\\|/g, '|'));
/** Explicit key/value and two-column Markdown tables only. No AI, rendering or guessing. */
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
  let section = '基本信息', entity = '', fence = false, table = false;
  const lines = text.split(/\r?\n/);
  if (lines.length > 5000) throw Error('文字超过5000行，请分批导入');
  for (let i=0;i<lines.length;i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^```|^~~~/.test(line)) { fence=!fence; skipped.push({line:i+1,text:line}); continue; }
    if (fence) { skipped.push({line:i+1,text:line}); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const title = heading[2].trim(), parts = title.split(/\s*[|｜]\s*/);
      table = false;
      if (sections.has(parts[0])) { section=parts[0];entity=parts.slice(1).join(' | '); }
      else if (heading[1].length >= 3 && section !== '基本信息') entity=title;
      else skipped.push({line:i+1,text:line});
      continue;
    }
    if (sections.has(line)) {section=line;entity='';table=false;continue;}
    if (line.startsWith('|')) {
      const row = cells(line);
      if (row.length===2 && /^(字段|属性|项目|field)$/i.test(row[0]) && /^(内容|值|value)$/i.test(row[1])) {table=true;continue;}
      if (table && row.length===2 && row.every(c=>/^:?-{3,}:?$/.test(c))) continue;
      if (table && row.length===2 && row[0] && row[1]) add(row[0],row[1],section,entity,i+1);
      else skipped.push({line:i+1,text:line});
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
  return {facts:normalizeProfile({facts}).facts, skipped};
}
