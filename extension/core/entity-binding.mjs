import {normalize, scope, semanticLabel, restrictedFactScope} from './semantics.mjs';

const recordScopes = new Set(['education', 'work', 'project', 'certificate', 'award', 'family']);
/** Groups identify observed DOM containers for one scan, never an array position or a saved selector. */
export function entityGroups(snapshot, facts, bindings = {}) {
  const buckets = new Map(), origin = new URL(snapshot.url).origin;
  for (const f of snapshot.fields) {
    if (typeof f.groupId !== 'string' || !f.groupId) continue;
    if (!buckets.has(f.groupId)) buckets.set(f.groupId, []);
    buckets.get(f.groupId).push(f);
  }
  return [...buckets].map(([id, fields]) => {
    const scopes = new Set(fields.map(f => scope(f.section)).filter(Boolean));
    const kind = scopes.size === 1 ? [...scopes][0] : '';
    const labels = fields.filter(f => !/^(file|hidden|button|submit|repeat-group|checkbox)$/.test(f.type))
      .map(f => semanticLabel(f.label, f.section));
    let reason = '';
    if (!recordScopes.has(kind) || fields.some(f => scope(f.section) !== kind)) reason = '分区不明确，不能整段绑定';
    else if (new Set(labels).size !== labels.length) reason = '该区块存在重复字段，可能包含多段经历，请逐项核对';
    const byEntity = new Map(),sourceLabels=new Set(fields.map(f=>semanticLabel(f.dateLabel||f.label,f.section)));
    if (!reason) for (const fact of facts) {
      if (fact.confirmed !== true || fact.conflict || !fact.entity || fact.origin && fact.origin !== origin ||
          restrictedFactScope(fact, kind) || !sourceLabels.has(semanticLabel(fact.label, fact.section))) continue;
      if (!byEntity.has(fact.entity)) byEntity.set(fact.entity, 0);
      byEntity.set(fact.entity, byEntity.get(fact.entity) + 1);
    }
    const candidates = [...byEntity].map(([entity, factCount]) => ({entity, label: entity, factCount}));
    const entity = typeof bindings[id] === 'string' ? bindings[id] : '';
    if (!reason && !candidates.length) reason = '本次资料没有同分区的可用经历';
    const valid = !reason && (!entity || candidates.some(c => c.entity === entity));
    return {id, label: fields[0].groupLabel || fields[0].section || '经历区块', section: fields[0].section || '',
      scope: kind, fieldIds: fields.map(f => f.id), candidates, entity, bindable: !reason, valid,
      reason: reason || (!valid ? '绑定的经历已不在本次资料中，请重新选择' : '')};
  });
}

export function factMatchesBinding(fact, field, entity) {
  return !!entity && normalize(fact.entity) === normalize(entity) && !restrictedFactScope(fact, scope(field.section));
}
