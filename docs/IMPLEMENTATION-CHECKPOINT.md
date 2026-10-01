# Refactor checkpoint - 2026-10-01

Status: development code saved, NOT an accepted release.
Spec decisions: B/A/A/A/B/A/B/A/A. Implementation was explicitly authorized.
Baseline: 0b29f4bb156c19b75e67e0eaa9f2a2ad654af36b, isolated branch codex/dameng-local-core-20261001.
Original dirty worktree remains unchanged. Source backup exists; it is not a browser-data backup.

## Saved implementation
- Independent named local resume versions; legacy read compatibility, first-write backup, revision checks, full backup/restore UI.
- Per-origin opt-in registration; add-record opt-in independent from initial page display.
- Single page request coordinates add/scan/record matching/fill/receipts; no repeated 60-field clicks.
- Explicit aggregate record mapping; no silent source-order assignment of ambiguous cards.
- MIT upstream validatePlan reused with provenance; bounded independent repeat controller.
- Search-select exact approved query support and committed-display readback.
- Page/background/engine version checks, local task IDs and terminal outcomes.

## Actual verification and blocker
- Baseline Node: 250 pass, before changes.
- Initial remote candidate Node: one old source-order expectation failed; assertion updated to explicit confirmation while keeping all value/readback checks.
- Release syntax/privacy-pattern check passed (415 files, 112 JS checks) before the final test file was added.
- New installed test passes MD import and site opt-in, then FAILS: the record-review popup has zero records.
- Diagnostic evidence: initial popup loading is handled as navigation; its new review ticket is removed. This is a new candidate bug, not proof of the user's old failure cause.
- Two source-edit requests for that lifecycle fix were blocked by tool safety checks. The denied edits were NOT applied; do not reroute them through another write method.
- Final Node / existing-local installed rerun is tracked in test-results/refactor-node-final.log and refactor-existing-local.log. Read actual results before reporting counts.
- No authenticated Dameng page or Tata comparison has been run. Do not offer this candidate as a working replacement.

Next: inspect exact checked-in state and blocked lifecycle edit; obtain a permitted resolution before repeating the installed aggregate-confirmation test. Keep failing test enabled. Do not overwrite the original install, merge main, or claim completion based on Node/packaging checks.

## Final observed results before checkpoint commit
Remote candidate Node rerun: 258 tests passed, 0 failed; log refactor-node-final.log.
Remote existing local installed workflow: 9 passed, 0 failed; log refactor-existing-local.log.
New aggregate-record installed workflow: import/site settings passed; popup record list failed (zero instead of four). This failure blocks release regardless of the successful older workflow.
The new failing installed test is added as its own GitHub workflow; no continue-on-error or disabled assertion.
