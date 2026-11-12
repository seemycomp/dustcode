---
title: "test(vscode): Make the full unit suite reliable across platforms"
date: 2026-11-11
type: fix
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Full Extension Unit Suite

## Goal Capsule
- Objective: Make `bun run test:unit` in `packages/kilo-vscode/` complete with zero failures and no unhandled errors on Windows, while retaining the same behavioral coverage on Linux.
- Authority: The user requested a plan before further implementation and selected Windows plus Linux CI as the validation target.
- Execution boundary: Preserve all existing staged/unstaged work, including Custom provider and Agent Manager transfer changes. Do not commit, push, change credentials, elevate Windows privileges, or edit global Git configuration.
- CI policy: Keep current workflows and triggers unchanged. Removing CI, making it manual, and adding a Windows job were discussed but not approved; they are outside this plan.
- Previous work: Custom provider timeout recovery and its focused tests already pass. This follow-up addresses the full extension unit suite, not the still-unreproduced original provider-persistence incident. U1-U3 belong to that earlier work; active units below start at U4.

## Product Contract
### Problem Frame
The full extension unit suite encounters stale mocks, missing locale keys, Windows-incompatible fixtures, and Git timeout/cleanup failures. The available baseline is incomplete: `C:\Users\thinh.tran\.local\share\dustcode\tmp\extension-unit-baseline.log` ends during `agent-project-prepare.test.ts`, without final totals. Treat later static hazards as investigation targets, not an exhaustive failure list.

### Requirements
- R5. Complete the unchanged full unit command successfully, with final totals, zero failed tests, and no unhandled errors or leaked Git processes. A selected subset or interrupted run is not completion.
- R6. Preserve assertions and platform contracts. Do not delete tests, skip applicable behavior, hide errors, blanket-raise the global timeout, or change product behavior merely to obtain a green result. Explicit OS/capability classification is allowed only per KTD9.
- R7. Correct fixture preconditions before modifying production code. Persisted project identity, path canonicalization, Git index/hook safety, and lifecycle ownership must remain unchanged unless a separate failing regression proves an implementation defect.
- R8. Validate on Windows without administrator-only prerequisites and on Linux using the same pinned runtime and unit command. Report either platform as unverified if its execution environment is unavailable; never infer Linux success from a Windows run.

### Scope Boundaries
Scope is `packages/kilo-vscode` unit tests, their fixtures, missing Agent Manager translations, and minimal production fixes required by reproduced suite failures. Root/backend-wide green status, UI redesign, provider-incident E2E, CI policy changes, and unrelated refactors are excluded. Do not revert concurrent work. If a needed edit directly conflicts with it, stop and identify the collision.

## Planning Contract
### Confirmed Evidence
- `tests/unit/agent-manager-close-session.test.ts` stubs the tracker without `releaseSessionTracking`; `src/agent-manager/provider-lifecycle.ts` now calls it before disposal. Production `placement` delegates to real project contexts, but the test's plain context fixture lacks `get`.
- `tests/unit/agent-manager-i18n-split.test.ts` requires exact locale-key parity. New `agentManager.transfer.*` keys occur in English but are absent from other Agent Manager dictionaries.
- `src/agent-manager/project/paths.ts` canonicalizes roots before hashing. Context/message tests hash raw POSIX-looking roots or non-native realpaths instead, producing different IDs on Windows. This does not establish a production identity bug.
- `tests/unit/agent-project-paths.test.ts` creates directory symlinks without a Windows link type, producing `EPERM`. Existing message/prepare tests already use Windows junctions.
- Real-Git preparation cases hit approximately the default five-second test deadline. `GitOps.dispose()` aborts synchronously; command completion awaits child `close`. Immediate temp deletion can then fail with `EBUSY` and contaminate later cases.
- `.github/workflows/test-vscode.yml` runs the unit command in its Linux `check` job; Windows currently builds/packages only. CI success for packaging is not Windows unit-suite evidence.

### Key Technical Decisions
- KTD5. Keep Windows and Linux as validation targets (session-settled: user-directed, chosen over Windows-only validation). Keep CI policy unchanged because no alternative was selected.
- KTD6. Derive registry fixtures from the existing production canonicalizer; keep raw picker/clone-parent forwarding expectations raw. Do not change the persistent ID algorithm to match broken fixtures.
- KTD7. Use real temporary Git repositories and directory aliases. Use absolute-target junctions on Windows and directory symlinks on Linux where the contract is directory identity. File-symlink and executable-bit tests require contract-specific fixtures, not blind substitution or administrator permissions.
- KTD8. Give only measured slow integration cases a bounded local deadline, initially considering 30 seconds. On failure, abort and await fixture-owned work before restoring environment or deleting directories. Do not mistake `await git.dispose()` for process settlement; bounded cleanup retries may follow settlement, not replace it.
- KTD9. Classify genuinely OS-specific tests by supported environment (session-settled: user-approved, chosen over rejecting every OS condition). Keep common behavior fully tested on both platforms; restrict only actual Linux/POSIX permission/sandbox cases or file-link cases requiring an unavailable capability. For capability checks, handle only known unsupported/permission errors, and let unexpected failures fail. Preserve the substantive cases on a supporting environment, never gate a whole portable suite, and disclose every non-applicable case and reason in final totals.

### Execution Flow
Complete failure inventory -> focused repair with preserved assertions -> rerun repaired cluster -> full package run -> repeat for newly exposed failures -> Windows and Linux completion evidence. If a run hangs, isolate its file and settle its owned processes; never report an interrupted run as green.

## Implementation Units
All paths below are relative to `packages/kilo-vscode/` unless explicitly repository-root paths.

### U4. Capture A Complete Baseline
**Requirements:** R5, R8. **Dependencies:** None.

**Files:** `package.json`, `bunfig.toml`, `tests/setup/vscode-mock.ts`, and `tests/setup/worker-url.ts` as runner references; no runner edits initially.

**Approach:** Record the existing worktree, runtime/build identity and package test command. Match the repository's pinned Bun 1.4.4 or checksum-pinned CI runtime, without silently installing/changing global tools. Run the full suite to a saved external log with a sufficient outer execution budget and capture exit code, summary and unhandled errors. Group failures by cause and distinguish confirmed failures from static hazards. For a blocking case, run it separately to diagnose and repair the blocker, then restart the unchanged full command.

**Verification:** An explicit failure ledger covers all reached failures and states whether the inventory is complete. Preserve the normal preload behavior and test discovery; do not use root `bun test`, `--bail`, filters or skips as the final run.

### U5. Repair Lifecycle Fixtures And Locale Completeness
**Requirements:** R5-R7. **Dependencies:** U4.

**Files:** `tests/unit/agent-manager-close-session.test.ts`, `tests/unit/agent-manager-i18n-split.test.ts`, existing `webview-ui/agent-manager/i18n/*.ts`; inspect `src/agent-manager/provider-lifecycle.ts` and `src/agent-manager/project/placement.ts` as contracts.

**Approach:** Add the missing tracker/context behavior to the close-session fixture, preferably using the existing real project context where practical. Preserve cancellation-before-disposal, secondary-project ownership and idempotency assertions. Fill missing transfer keys in every supported locale with actual translations and exact interpolation placeholders; do not remove keys or relax locale parity. Preserve already-staged English strings. Add/extend a concise release changeset only for actual user-facing translation/production changes, not test-only repairs.

**Verification:** Close-session cases pass individually and together; release/cancel/dispose ordering remains asserted. Locale keys and placeholders match English in every dictionary, retaining meaningful localized text.

### U6. Make Project Identity Fixtures Portable
**Requirements:** R6-R8. **Dependencies:** U4. **Decisions:** KTD6-KTD7.

**Files:** `tests/unit/agent-project-contexts.test.ts`, `agent-project-messages.test.ts`, and `agent-project-paths.test.ts`; inspect `src/agent-manager/project/paths.ts` and `src/agent-manager/git-import.ts` without changing identity semantics.

**Approach:** Canonicalize synthetic roots and native realpaths before deriving IDs and registry expectations. Preserve the distinction between canonical stored paths and raw user-input forwarding. Use directory junctions on Windows and directory symlinks on Linux; register cleanup before link creation so failed setup cannot leak fixtures.

**Verification:** Alias/real-path deduplication, ordering, hydration, fallback and linked-worktree-to-primary-root cases pass on both platforms. Keep platform-appropriate case-sensitivity expectations and do not migrate persisted IDs.

### U7. Stabilize Real-Git Lifetime And Cleanup
**Requirements:** R5-R8. **Dependencies:** U4, U6. **Decision:** KTD8.

**Files:** `tests/unit/agent-project-prepare.test.ts`, slow cases in `agent-project-messages.test.ts`, and only other real-Git tests confirmed by U4. Reuse the abort-then-await pattern in `tests/unit/git-ops.test.ts`; inspect `src/agent-manager/GitOps.ts` and `project/prepare.ts` before any source change.

**Approach:** Measure focused test duration before selecting local budgets. Ensure teardown tracks and settles complete fixture operations, then restores environment and removes temporary repositories. Retain real Git and byte-for-byte index, hook-suppression and concurrent-ref assertions. Do not introduce global sleep/retry workarounds or make production disposal asynchronous solely for tests.

**Verification:** Normal, failed-command and cancelled-operation cases leave no dangling processes, unhandled rejection, disposed-after-timeout work, environment leak or `EBUSY` cleanup error. Run the affected files together as well as individually to detect contamination.

### U8. Repair Remaining Confirmed Portability Or Isolation Failures
**Requirements:** R5-R8. **Dependencies:** U4; integrate with U5-U7 without overlapping edits.

**Files:** Existing `tests/unit/` cases identified by the complete ledger and their minimal owning source files. Static candidates, not established failures: `shell-env.test.ts`, `bwrap-helper.test.ts`, `pr-suggestion-actions.test.ts`, `worktree-manager.test.ts`, `git-stats-poller.test.ts`, `browser-element.test.ts`, `local-diff.test.ts`, `orphan-size.test.ts`, `run-script-service.test.ts`, and `legacy-migration/path.test.ts` / `legacy-migration/migrate.test.ts`.

**Approach:** Reproduce each candidate before editing. Replace shell-builtin assumptions with `process.execPath` probes where the behavior under test is execution/cwd/env; preserve inherited Windows environment semantics. Use Windows-valid pathspec-metacharacter filenames and normalize paths at Git/sh boundaries. Directory junctions cannot replace file symlinks blindly; use equivalent real fixtures only when they prove the same property. Apply KTD9 narrowly to Linux helper/POSIX mode and true file-link capability cases, without weakening containment, escaping or executable-bit assertions. Replace process-wide module stubs with restored real-module spies where possible, or isolate unavoidable module mocking in a child process without narrowing the main runner. If a production defect survives fixture corrections, add a focused failing regression and the smallest owning-layer fix.

**Verification:** Preserve escaping, symlink containment, executable-bit, path quoting and cleanup protections. Account for every OS/capability-specific non-applicable case under KTD9; unavailable coverage on all supporting environments is a blocker, not a green result. Rerun both the individual file and its neighboring cluster to detect mock leakage.

### U9. Prove The Whole Suite And Package Checks
**Requirements:** R5-R8. **Dependencies:** U5-U8. **Decision:** KTD5.

**Files:** No new test runner or CI workflow is planned. Format only touched files; inspect final diff for weakened coverage or unrelated changes.

**Approach:** Run the exact full command to completion on Windows and Linux with matching runtime/dependencies. Reuse an available Linux environment or existing CI result for the actual changes; publishing or triggering remote workflows requires separate authorization. If Linux execution is unavailable, explicitly mark the Linux acceptance criterion blocked. Repeat the full Windows run after final changes to catch order/lifetime flakes. Continue the failure-ledger repair loop if further failures appear; never stop at green clusters.

**Verification:** Preserve complete logs and summarize runtime, exit code, pass/fail/skip totals, unhandled errors and platform. Require no unexplained skips, no dangling processes and reproducible green results. Disclose OS/capability exclusions per KTD9. Do not call either platform green without its own completed run.

## Verification Contract
- In `packages/kilo-vscode/`: focused repaired cases, then `bun run test:unit` without selection filters; `bun run typecheck`, `bun run lint`, `bun run knip`, and `bun run check-kilocode-change`.
- Check formatting only on owned files. Run `bun run compile` if production, webview, or locale integration changes.
- Retain Custom provider regressions: `provider-action.test.ts`, `provider-actions-save.test.ts`, Settings routing cases, and the existing browser save-recovery test. The suite follow-up must not regress timeout recovery.
- Check tests individually and in the full process; module mocks and global environment must not hide order-dependent failures.
- Both platforms need actual completed results. Current CI is unchanged, and a Windows VSIX build is not a replacement for Windows unit evidence. No tests or implementation edits were performed after the user switched this work back to planning.

## Definition of Done
The full extension unit command exits successfully on Windows and Linux with no failures, unexplained skips, unhandled errors or leaked fixture resources; OS/capability-specific coverage remains executed on supporting environments and its exclusions are disclosed. Final package checks pass and complete evidence is recorded. Existing work is preserved. Missing Linux execution or an incomplete full run is explicitly blocked rather than described as green. CI-policy decisions and the original provider-persistence investigation remain separate work.
