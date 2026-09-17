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
    entityAliases: strings(raw.entityAliases, '经历别名'), origin,
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
    facts = normalizeProfile(Array.isArray(json) ? {facts: json} : json).facts;
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
