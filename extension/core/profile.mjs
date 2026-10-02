import {normalize, semanticLabel, scope} from './semantics.mjs';
import {normalizeTextVariants} from './text-variants.mjs';
import {normalizePresets} from './profile-presets.mjs';
/** Strict, bounded facts. Only this schema is persisted; never spread imported objects. */
export const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
export const MAX_FACTS = 1000;
const encoder = new TextEncoder();
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => forbidden.has(key))) throw Error('资料对象格式无效');
}
function text(value, name, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw Error(`${name}为空、类型错误或超过长度限制`);
  }
  return value;
}
function strings(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 20) throw Error(`${name}最多20项`);
  return [...new Set(value.map(v => text(v, name, 200, true).trim()))];
}
export function normalizeFact(raw) {
  object(raw);
  const id = text(raw.id, '资料ID', 128, true);
  if (forbidden.has(id) || !/^[\w.:-]+$/u.test(id)) throw Error('资料ID格式无效');
  let origin = text(raw.origin, '网站范围', 300);
  if (origin) {
    const url = new URL(origin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw Error('网站范围须为完整的 http(s) 来源，不含路径');
    origin = url.origin;
  }
  return {
    id, label: text(raw.label, '字段名称', 200, true).trim(),
    value: text(raw.value, '字段内容', 10000, true),
    section: text(raw.section, '分区', 200).trim(),
    entity: text(raw.entity, '经历标识', 200).trim(),
    source: text(raw.source, '来源', 500, true),
    aliases: strings(raw.aliases, '字段别名'),
    ...(raw.recordId?{recordId:text(raw.recordId,'记录ID',128,true)}:{}),
    ...(raw.sourceRefs?{sourceRefs:strings(raw.sourceRefs,'来源条目')} : {}),
    ...(['page-observed','file-imported','stored-repair','manual'].includes(raw.sourceKind)?{sourceKind:raw.sourceKind}:{}),
    entityAliases: strings(raw.entityAliases, '经历别名'), origin,
    ...(raw.textVariants!==undefined?{textVariants:normalizeTextVariants(raw.textVariants,raw.label)}:{}),
    confirmed: raw.confirmed === true, conflict: raw.conflict === true
  };
}
export function normalizeProfile(raw) {
  object(raw);
  if (raw.schemaVersion != null && raw.schemaVersion !== 1) throw Error('不支持此资料版本');
  if (!Array.isArray(raw.facts) || raw.facts.length > MAX_FACTS) throw Error(`资料须为 facts 数组，最多${MAX_FACTS}项`);
  const facts = raw.facts.map(normalizeFact);
  if (new Set(facts.map(f => f.id)).size !== facts.length) throw Error('资料ID重复，未导入');
  const result = {
    schemaVersion: 1,
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    facts
  };
  if(raw.presets!==undefined)result.presets=normalizePresets(raw.presets,facts);
  if(raw.selectedRecordIds!==undefined){
    if(!Array.isArray(raw.selectedRecordIds)||raw.selectedRecordIds.length>1000)throw Error('记录选择格式无效');
    result.selectedRecordIds=[...new Set(raw.selectedRecordIds.map(v=>text(v,'所选记录ID',128,true)))];
  }
  if (encoder.encode(JSON.stringify(result)).length > MAX_PROFILE_BYTES) throw Error('资料总大小超过2MB');
  return result;
}
/** Paste and JSON imports are drafts, not automatically confirmed facts. */
export function parseImport(input, {section = '基本信息', entity = ''} = {}) {
  if (typeof input !== 'string' || encoder.encode(input).length > MAX_PROFILE_BYTES) throw Error('导入内容超过2MB');
  const value = input.trim();
  if (!value) throw Error('请先输入资料');
  let facts;
  if (/^[\[{]/.test(value)) {
    const json = JSON.parse(value);
    facts = normalizeProfile(Array.isArray(json) ? {facts: json} : json.facts ? json : fromJsonResume(json)).facts;
  } else {
    facts = value.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const match = line.match(/^([^：:\t]{1,200})[：:\t]\s*(.+)$/u);
      if (!match) throw Error(`第${index + 1}行须为“字段名称：内容”；多行描述请用单项编辑`);
      return normalizeFact({
        id: crypto.randomUUID(), label: match[1].trim(), value: match[2], section, entity,
        source: '本人导入，待确认', confirmed: false
      });
    });
  }
  if (!facts.length) throw Error('没有可导入的资料');
  // New IDs prevent imports from silently overwriting unrelated existing facts.
  return normalizeProfile({facts: facts.map(f => ({...f, id: crypto.randomUUID(), confirmed: false}))}).facts;
}

/** JSON Resume is an interchange format; importing it never verifies its claims. */
export function fromJsonResume(raw) {
  object(raw);
  if (!raw.basics && !raw.education && !raw.work && !raw.projects) throw Error('请使用 facts JSON 或 JSON Resume 格式');
  const facts = [];
  const add = (label,value,section,entity='') => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) { if(value.some(v=>typeof v!=='string'))throw Error('列表须为文本'); value=value.join('\n'); }
    facts.push(normalizeFact({id:crypto.randomUUID(),label,value,section,entity,source:'JSON Resume 本机导入，待核实',confirmed:false}));
  };
  const b=raw.basics || {}; object(b);
  for(const [key,label] of Object.entries({name:'姓名',email:'邮箱',phone:'手机号码',url:'个人主页',summary:'自我评价'}))add(label,b[key],'基本信息');
  const groups = [
    ['education','教育经历','institution',{institution:'学校',area:'专业',studyType:'学历',startDate:'入学时间',endDate:'毕业时间',score:'成绩',courses:'主修课程'}],
    ['work','工作经历','name',{name:'公司名称',position:'职位名称',startDate:'开始时间',endDate:'结束时间',summary:'岗位职责',highlights:'工作成果',url:'公司网站'}],
    ['projects','项目经历','name',{name:'项目名称',startDate:'开始时间',endDate:'结束时间',description:'项目描述',highlights:'项目成果',roles:'项目职责',url:'作品链接'}],
    ['awards','获奖经历','title',{title:'获奖名称',date:'获奖时间',awarder:'颁发单位',summary:'奖励说明'}],
    ['certificates','证书','name',{name:'证书名称',date:'获得日期',issuer:'颁发单位',url:'证书链接'}],
    ['publications','论文','name',{name:'论文名称',publisher:'发表期刊',releaseDate:'发表日期',summary:'论文情况',url:'论文链接'}],
    ['skills','专业技能','name',{name:'技能名称',level:'熟练程度',keywords:'技能描述'}],
    ['languages','语言能力','language',{language:'语言',fluency:'语言水平'}]
  ];
  for(const [key,section,nameKey,mapping] of groups){
    if(raw[key]==null)continue;
    if(!Array.isArray(raw[key])||raw[key].length>MAX_FACTS)throw Error(`${key}须为有界数组`);
    for(const record of raw[key]){
      object(record);const name=text(record[nameKey],`${key}经历名称`,200,true);
      const qualifiers=key==='education'?['studyType','startDate','endDate']:key==='work'?['position','startDate','endDate']:key==='projects'?['startDate','endDate']:[];
      // Same institution/employer can represent separate degrees or employment periods.
      const entity=[name,...qualifiers.map(k=>record[k]==null?'':text(record[k],`${key}.${k}`,200)).filter(Boolean)].join(' | ');
      for(const [k,label] of Object.entries(mapping))add(label,record[k],section,entity);
    }
  }
  return {schemaVersion:1,facts};
}

const importKey = f => JSON.stringify([scope(f.section)||normalize(f.section), normalize(f.entity), semanticLabel(f.label,f.section), f.origin || '']);
const sameContent=(a,b)=>a.value===b.value&&JSON.stringify(a.textVariants||[])===JSON.stringify(b.textVariants||[]);
/** Preview semantic duplicates/changes before any write; IDs from files are never trusted. */
export function planImport(existing, incoming) {
  const old=normalizeProfile({facts:existing}).facts, fresh=normalizeProfile({facts:incoming}).facts;
  const seen=new Map();for(const f of old){const k=importKey(f);seen.set(k,[...(seen.get(k)||[]),f]);}
  const batch=new Map();
  return fresh.map(f=>{
    const key=importKey(f), previous=seen.get(key)||[], earlier=batch.get(key)||[]; batch.set(key,[...earlier,f]);
    if(earlier.some(a=>sameContent(a,f)))return {fact:f,status:'duplicate',reason:'本文件内的相同内容已合并',existingIds:[]};
    if(earlier.length)return {fact:f,status:'conflict',reason:'本文件同一字段提供不同内容，请先修正文件',existingIds:[]};
    if(previous.some(a=>sameContent(a,f)))return {fact:f,status:'duplicate',reason:'资料库已有相同内容，保留核实状态',existingIds:previous.map(a=>a.id)};
    return {fact:f,status:previous.length?'change':'new',reason:previous.length?'与资料库内容不同，默认保留原值':'新增待核实资料',existingIds:previous.map(a=>a.id)};
  });
}
export function mergeImport(existing, incoming, replaceIds=[]) {
  if(!Array.isArray(replaceIds)||new Set(replaceIds).size!==replaceIds.length)throw Error('替换选择无效');
  const plan=planImport(existing,incoming), allowed=new Set(plan.filter(p=>p.status==='change').map(p=>p.fact.id));
  if(replaceIds.some(id=>!allowed.has(id)))throw Error('替换项目不属于当前预览');
  const choices=new Set(replaceIds), removed=new Set(), additions=[];
  for(const p of plan){
    if(p.status==='new'||p.status==='change'&&choices.has(p.fact.id)){
      if(p.status==='change')p.existingIds.forEach(id=>removed.add(id));
      additions.push({...p.fact,confirmed:false});
    }
  }
  // A contradictory file must never install its first value while silently dropping the next.
  const conflicts=new Set(plan.filter(p=>p.status==='conflict').map(p=>importKey(p.fact)));
  const facts=normalizeProfile({facts:[...existing.filter(f=>!removed.has(f.id)||conflicts.has(importKey(f))),...additions.filter(f=>!conflicts.has(importKey(f)))]}).facts;
  return {facts,addedIds:additions.filter(f=>!conflicts.has(importKey(f))).map(f=>f.id),plan};
}
