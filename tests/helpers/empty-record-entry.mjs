import {readLocalImport} from '../../extension/core/local-import.mjs';
import {makePlan} from '../../extension/core/planner.mjs';
import {entityGroups} from '../../extension/core/entity-binding.mjs';
import {recordTargets} from '../../extension/core/addition-status.mjs';
// Test fixture bundle only; production extension does not expose this object.
globalThis.__emptyRecordTest={readLocalImport,makePlan,entityGroups,recordTargets};
