import {parseResumeText} from '../../extension/core/resume-parser.mjs';
import {makePlan} from '../../extension/core/planner.mjs';
import {resolveRecords} from '../../extension/core/record-resolver.mjs';
import {proposeStoredRepair} from '../../extension/core/stored-profile-repair.mjs';
globalThis.__recovery={parseResumeText,makePlan,resolveRecords,proposeStoredRepair};
