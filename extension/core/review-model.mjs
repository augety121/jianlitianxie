import {normalize, semanticLabel, scope} from './semantics.mjs';

export const REVIEW_PAGE_SIZE = 30;
/** Filtering never changes the approved selection; pagination is presentation only. */
export function reviewPage(entries, {status = 'all', section = '', query = '', page = 0, selected = []} = {}) {
  const chosen = new Set(selected), q = normalize(query);
  const filtered = entries.filter(e => {
    const matches = status === 'all' || status === 'selected' && chosen.has(e.id) ||
      status === 'required' && e.required && ['manual', 'missing'].includes(e.status) ||
      status === 'missing' && ['manual', 'missing'].includes(e.status) || status === e.status;
    // Values are deliberately not searched while hidden.
    return matches && (!section || (e.section || '未分区') === section) &&
      (!q || normalize([e.label, e.section, e.reason].join(' ')).includes(q));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE));
  const index = Math.min(pages - 1, Math.max(0, Number.isInteger(page) ? page : 0));
  const rows = filtered.slice(index * REVIEW_PAGE_SIZE, (index + 1) * REVIEW_PAGE_SIZE);
  return {rows, total: filtered.length, page: index, pages, selectedOutside: chosen.size - rows.filter(e => chosen.has(e.id)).length};
}
/** Candidate values are not used for searching; only one bounded chooser is rendered. */
export function mappingCandidates(entry, facts, query = '', entity = '') {
  const q = normalize(query), fs = scope(entry.section), key = semanticLabel(entry.label, entry.section);
  return facts.filter(f => f.confirmed === true && !f.conflict && (!f.origin || f.origin === entry.origin) &&
    (!fs || !scope(f.section) || scope(f.section) === fs || fs === 'personal' && scope(f.section) === 'language') &&
    (!entity || normalize(f.entity) === normalize(entity)) &&
    (!q || normalize([f.label, f.section, f.entity, ...(f.aliases || [])].join(' ')).includes(q)))
    .map(f => ({fact: f, exact: [f.label, ...(f.aliases || [])].some(l => semanticLabel(l, f.section) === key)}))
    .sort((a, b) => Number(b.exact) - Number(a.exact));
}
