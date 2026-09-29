// Test-only browser export; never included in extension runtime.
import {makePlan} from '../../extension/core/planner.mjs';
import {entityGroups} from '../../extension/core/entity-binding.mjs';
globalThis.__compatPlanner = makePlan;
globalThis.__compatGroups = entityGroups;

// about:blank is not a secure origin; IDs here are test identities, not release randomness.
if (!crypto.randomUUID) { let sequence=0; crypto.randomUUID=()=>`fixture-${++sequence}`; }
