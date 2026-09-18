import {createCandidateIndex} from './semantics.mjs';
/** Build once per snapshot. Never retain this index across snapshots. */
export function indexFields(snapshot) {
  const {origin, pathname} = new URL(snapshot.url);
  const counts = new Map(), keys = new Map(), fields = new Map();
  for (const field of snapshot.fields) {
    const key = JSON.stringify([origin, pathname, field.label, field.section, field.type, field.anchors || []]);
    keys.set(field.id, key); fields.set(field.id, field);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {keys, counts, fields};
}
export function rememberedMappings(index, experience) {
  const mappings = Object.create(null);
  for (const [id, key] of index.keys) {
    if (index.counts.get(key) === 1 && Object.hasOwn(experience, key) && typeof experience[key] === 'string') {
      mappings[id] = experience[key];
    }
  }
  return mappings;
}

/** Same relevance rules as the previous nested search, without repeating a full facts scan per field. */
export function relevantFacts(snapshot, facts, plan) {
  const index = createCandidateIndex(facts, snapshot.url);
  const ids = new Set(plan?.entries.map(e => e.factId));
  for (const field of snapshot.fields) for (const fact of index.candidates(field)) ids.add(fact.id);
  return facts.filter(f => f.confirmed !== false && !f.conflict && ids.has(f.id));
}
