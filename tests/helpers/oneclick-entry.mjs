import {makePlan} from '../../extension/core/planner.mjs';
import {pageSummary} from '../../extension/core/page-summary.mjs';
globalThis.__onePlan=makePlan;globalThis.__oneSummary=pageSummary;
// Test IDs only for isolated about:blank layout fixtures, not production randomness.
if(!crypto.randomUUID){let sequence=0;crypto.randomUUID=()=>`test-${++sequence}`;}
