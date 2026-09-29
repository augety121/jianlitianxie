import {readLocalImport} from '../../extension/core/local-import.mjs';
import {makePlan} from '../../extension/core/planner.mjs';
import {resolveRecords} from '../../extension/core/record-resolver.mjs';
import {profileDiagnostic} from '../../extension/core/match-diagnostics.mjs';
globalThis.__repair={readLocalImport,makePlan,resolveRecords,profileDiagnostic};
