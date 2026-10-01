# Refactor checkpoint — PR #12 repair, 2026-10-01

Spec decisions: B/A/A/A/B/A/B/A/A. Implementation and PR repairs explicitly authorized.
Branch: `codex/dameng-local-core-20261001`; base main `0b29f4bb156c19b75e67e0eaa9f2a2ad654af36b`.
Initial WIP commit: `2d28ae8320fcd3b4cc3070219cf6e7bd0238ceb7`.
Use `git status` and the current PR head for the repair SHA and current CI results.
Original dirty worktree and browser installation remain untouched. Source backup is not a browser-data backup.

## What the initial WIP saved

Independent named local resumes, version isolation/backup/restore, per-origin opt-in, one-click task coordination, aggregate record review, bounded repeat-card controller, MIT validatePlan reuse, exact search-select actions, version checks and local no-value task receipts.
The original WIP had Node 258 passed and old local installed 9 passed, but the new installed confirmation test failed with zero record candidates. Packaging success did not mean usable.

## Current repair

- Dedicated popup lifecycle state keeps the first unbound load pending, then requires exact URL/tab/document proof; reload, close, wrong destination, expiration and replay still invalidate.
- The page can expand collapsed zero-match details and open a valid single-field review; consumed plans stay non-replayable.
- Worker startup restores only previously opted-in, still browser-authorized site registrations and their page entries. No new hosts or permissions.
- UI mocks now speak the real task protocol, ambiguous-record tests explicitly choose records, and installed version checks compare to the manifest.
- New negative tests cover popup refresh, target navigation and closure without writes, plus wrong sender and ticket reuse.
- Real installed refactor workflow has passed all seven cases locally, including 14 independent field values, record choices, reload/cancel boundaries, version isolation and browser restart.
- Recovery installation test has passed after explicit selection of seven records; all 40 independent value checks remain.
- Full command results are in `test-results/pr12-*.log`. Read them instead of assuming tests passed. Local MCP fixture could not bind its own fixed port; no user service was terminated.

## Next and remaining product scope

Complete current-commit CI verification and record results in PR #12. Never disable failing assertions or merge main automatically.
Authenticated Dameng acceptance and same-workload Tata performance comparison have NOT been performed. Do not label synthetic fixtures as live-site acceptance or install into the original directory without that separate checkpoint.
See `docs/PR12-FIX-VERIFICATION.md` for the failure-to-fix record and preserved test boundaries.
