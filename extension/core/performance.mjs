/** Fixed numeric schema only: never include URLs, field labels, values, IDs or tokens. */
const COUNTERS = [
  'durationMs', 'waitMs', 'rootWalks', 'nodesVisited', 'labelReads',
  'labelComputations', 'anchorComputations', 'waitCalls', 'waitProbes',
  'mutationSignals', 'fallbackPolls', 'observersCreated', 'observersClosed',
  'hitTests', 'writesAttempted', 'uncertainStops', 'yieldCount',
  'fieldCount', 'factCount', 'candidateChecks', 'indexEntries'
];
export function numericMetrics(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of COUNTERS) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9) {
      out[key] = Math.round(n * 100) / 100;
    }
  }
  return out;
}
export function performanceSummary(plan, report) {
  return {
    schemaVersion: 1,
    scan: numericMetrics(plan?.performance?.scan),
    match: numericMetrics(plan?.performance?.match),
    apply: numericMetrics(report?.performance)
  };
}
