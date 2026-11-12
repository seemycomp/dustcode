---
title: "fix: Complete snapshot recovery safety and validation"
date: 2026-11-11
type: fix
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Complete Snapshot Recovery Safety And Validation

## Goal Capsule
- Objective: Close the legacy-repository safety gap from review, prove the existing snapshot fix, and prepare a verified local build without interrupting live sessions.
- Means: Persist pending reconciliation before mutation, preserve valid legacy recovery, and validate in disposable repositories before a separately approved runtime maintenance step.
- Authority: The user selected a durable source fix that preserves snapshots, rather than only repairing the current machine.
- Execution: Implement locally, verify, build, and report. Do not commit, push, alter user settings, install over a live extension, or stop live backends. Runtime maintenance requires separate explicit approval.
- Stop conditions: Never delete an unknown Git lock, discard historical snapshot objects, or change the source repository's index. Stop recovery if writer quiescence or object availability cannot be established.

---

## Product Contract

### Summary
Use the current working-tree implementation as the starting point; do not reimplement its lock preflight, failure classification, question race, or historical-diff fix. Finish the rejected-capture protection for existing repositories, resolve validation gaps, and prepare the matching compiled backend. Keep baseline capture before agent tools start.

### Problem Frame
The screenshot describes a repository-size problem, but local logs show a concrete Git failure. On 2026-11-11, runs `af7b51a8`, `21d069d5`, and `b25fed46` repeatedly report exit 128 because the private snapshot `index.lock` exists. The latest observed failures at 07:18-07:19 match slow-track messages. The lock file was also present when inspected, and the private repository config points to this workspace.

The affected private repository is under the active runtime data directory at `snapshot/d108415a5f6358af8e9f1dfea9cf0c39b9969b46/54cff2c70548728931b852c52b5d51ce941cdd70`. Runtime evidence is in `log/opencode.log` around lines 44850-44860 and `log/dev.log` around lines 39-51. Resolve the active profile data directory at execution time; these are not workspace-relative files.

The original repeated-scan and obsolete-question defects have an implementation in the working tree. The latest review reran 53 guard/question tests and five integration regressions successfully; typecheck and annotations also passed. This is evidence to preserve, not a substitute for validating the next changes.

Remaining P2: `prepare.initialize` returns early for an existing repository. An unmarked legacy index with no snapshot refs therefore receives no pending marker when its next capture fails. Startup `resume` can subsequently invoke the intentional index-only materializer fallback, which writes and pins that unreconciled index. Marker creation after seeding also leaves an interruption window. This chain is source-verified, not yet reproduced by its own real-Git regression.

Other gaps: broad suites previously failed for symlink permissions, profile-sensitive fixtures and timeouts; their independence from the fix is not fully established. The Promise-facade guard currently expects four listener-runtime test references but finds five. At the last inspection, two installed-extension backends remained active and the affected private lock existed; recheck rather than treating these observations as permanent facts.

The original lock creator remains unknown. Windows force termination is a hypothesis only. The 100-file fixture improved blocked capture from about 2.0-2.6 seconds to 22 ms and a guarded repeat to 3 ms; healthy performance on the real repository and per-phase attribution remain unverified.

### Requirements
- R1. Detect an existing private snapshot `index.lock` before reconciliation and stop repeated expensive capture attempts for the affected worktree/service, with a specific diagnostic and no persisted `snapshot:false`.
- R2. A failed reconciliation must not produce a new snapshot hash, pin an unreconciled tree, or report a misleading successful patch. Preserve deliberate caller-specific fallbacks and explicit restore/revert failures.
- R3. If capture finishes while the slow question is unanswered, return its actual outcome and close only that question and its transient progress. Preserve Continue, Disable, Dismiss, managed-wait, and cancellation behavior.
- R4. Never remove an unknown lock automatically. Controlled recovery must preserve existing snapshot hashes and source-index/workspace contents; healthy baseline capture must still precede tool edits.
- R5. Measure the affected paths before and after the fix. Show elimination of repeated failed scans and verify healthy capture performance rather than claiming that a larger timeout is an optimization.
- R6. Pending protection must survive failed or interrupted reconciliation of both new and existing unpinned repositories. Preserve untouched legacy index-only recovery and all previously pinned hashes.
- R7. Finish code, checks and a verifiable local build first. Stopping/replacing live backends, editing installed extensions, or recovering the real snapshot repository requires a separately confirmed maintenance window.
- R8. Attribute outstanding test/guard failures from evidence. Do not relax assertions, production timeouts or guard counts just to produce a green result.

### Scope Boundaries
- In scope now: the pending-marker gap, regression coverage, relevant test/guard diagnosis, a compiled local backend and isolated smoke/benchmark evidence.
- Separately gated follow-up: apply the verified build and recover the current machine's private snapshot repository after explicit approval. Planning or implementing this plan does not grant that approval.
- Not built: age-based lock deletion, a new recovery command/settings surface, a new snapshot storage format, broader process-killing policies, or arbitrary timeout increases.
- Deferred: generic EffectFlock cancellation redesign and automatic operation-owned lock cleanup. Investigate lock origin only after safety/validation; add no speculative process-killing or deletion mechanism.
- Do not introduce a new batching, concurrency, or seeding algorithm without measured evidence. Current code already seeds the index, stages large root candidate sets in bulk, and defers materialization.

---

## Planning Contract

### Key Technical Decisions
- KTD1. Put Kilo-specific classification and policy in existing `src/kilocode/snapshot/` modules. Keep edits to shared snapshot/question files narrow and annotated with `kilocode_change`.
- KTD2. Check for the private lock lazily inside the existing semaphore and cross-process flock, before reconciliation. Keep Git exit checking as the race backstop. Do not put a blanket lock rejection around historical tree reads. Holding the flock is not proof that an older CLI has no active writer.
- KTD3. Distinguish a real classified failure from legitimate `undefined` results for disabled/non-Git capture. Carry the failure to the existing `protect` boundary without allowing `wrap` catches to erase it. A narrow adapter may convert only the classified failure to a defect before `wrap`; do not widen the public error-free interface or use unsafe casts to hide error types. Other failures retain their intended semantics.
- KTD4. Open the existing in-memory, worktree-keyed circuit on capture/patch failure. Emit an actionable diagnostic identifying the failed phase/private repository. Existing hashes remain available; new captures are unavailable for that worktree until a fresh service after recovery. Do not persist a disable choice on the user's behalf.
- KTD5. Race a tagged question answer against completion of the existing snapshot fiber, including failed completion. A first-success-only race is insufficient. Abort only the owned question when capture wins, ignore the cancellation-generated dismissed result, and retain owner checks. Reset `asked` only when a valid hash was produced. If an answer wins, retain its existing semantics; concurrent outcomes must never apply both branches.
- KTD6. Install question cleanup across pending registration, Asked publication, and deferred waiting. Reuse `KiloQuestion.finalize`; avoid session-wide dismissal. This closes the publication/interruption gap exposed by KTD5.
- KTD7. Leave shared process termination and global timeout defaults unchanged. Recovery of the already-existing unknown lock is offline and explicitly gated, not an online heuristic.
- KTD8. Reuse the existing private `kilo-prepared` marker for pending reconciliation. Install it under the current semaphore/flock before seed side effects and before any existing-repository reconciliation, including its preflight. Marker creation failure stops mutation. This adds no source-index or Git-lock changes and needs no new storage format.
- KTD9. Do not mark an existing repository merely because its service starts: untouched unmarked legacy recovery remains valid. Cover every index-reconciling `add` caller, not only `track`. A pending marker with no successful snapshot refs, or with a failed refs lookup, blocks index-only recovery. With valid refs, materialize those refs instead of inventing a checkpoint from the current index.
- KTD10. Clear pending protection only after successful snapshot pinning, or after `resume` has positively established valid snapshot refs. Failure, cancellation and restart retain it; cleanup failure must not discard data. Historical reads do not create pending state or require healthy source Git metadata.
- KTD11. Prepare code and build independently from live recovery (session-settled: user-directed - chosen over combining runtime maintenance into implementation, to avoid interrupting active sessions). Governs R7. No automatic install/reload/shutdown follows the build.

### Data Flow
1. Capture request enters the existing worktree guard and availability budget.
2. Under snapshot locks, new initialization marks pending before seed; each reconciliation marks pending before preflight, discovery or mutation. Preflight still rejects an unknown private index lock without starting expensive Git/scanning work.
3. Only successful reconciliation advances to tree creation and pinning. Classified failure reaches the guard, logs the actionable cause, and returns the existing turn-facing fallback.
4. If capture crosses the warning threshold, question completion and capture completion compete; the losing question waiter is cleaned up when capture wins.

### Recovery States
| State | Capture/recovery behavior |
|---|---|
| Untouched legacy, no marker, no snapshot refs | Keep the established index-only recovery fallback. |
| Pending marker, no refs or failed ref lookup | Do not write-tree/pin via recovery; retain marker and object dependencies. |
| Reconciliation succeeded but pin has not succeeded | Remain pending, including across interruption/restart. |
| Successful pin, valid snapshot refs | Historical refs remain authoritative; pending cleanup and materialization may proceed. |

Dependency path: U4 safety fix -> U5 validation -> U6 isolated compiled build -> U7 approved maintenance. U8 uses disposable fixtures initially and real-workspace measurements only after U7.

### Affected Boundaries
- `packages/opencode/src/snapshot/index.ts`: `stage`, `add`, `track`, `patch`, `prepare`, and `diff` call sites; service adapter wiring.
- `packages/opencode/src/kilocode/snapshot/lock.ts` and `track.ts`: failure policy and slow-question lifecycle.
- `packages/opencode/src/question/index.ts` and `packages/opencode/src/kilocode/question/index.ts`: narrow registration/publication/wait cleanup.
- `packages/opencode/src/kilocode/snapshot/prepare.ts`, `seed.ts`, and `materialize.ts`: preserve existing seed, alternate-object, and recovery contracts; change only if required by failure propagation.

---

## Implementation Units

### U4. Close Pending-Marker Gaps
**Priority:** High. **Requirements:** R1, R2, R4, R6. **Dependencies:** Current implementation. **Decisions:** KTD1-KTD4, KTD8-KTD10.

**Files:** `src/kilocode/snapshot/prepare.ts`, minimal annotated hooks in `src/snapshot/index.ts`; existing `test/kilocode/snapshot-prepare.test.ts`, `snapshot-seed.test.ts` and `test/snapshot/snapshot.test.ts`, all under `packages/opencode/`. Reuse the existing CLI patch changeset rather than creating duplicate release notes.

**Execution note:** Reproduce the reviewed legacy sequence with real Git before production edits. Prefer one Kilo-owned pending helper reused by initialization and reconciliation; avoid new per-call refs scans or service APIs.

1. Mark a new private repository after Git initialization/configuration but before seeding borrows objects or installs its index.
2. Under the existing locks, persist pending before any `add` preflight/discovery/mutation for an existing repository. Marker writes must fail closed without touching the index. Merely starting a service must not mark a legacy repository.
3. Keep pending on all failed/interrupted capture, patch, prepare and current-worktree diff paths. Only successful pinning or positively verified existing refs permits cleanup; no changes to historical read behavior.
4. Preserve `resume` refusal on an empty or failed refs lookup while pending. With valid refs, recover from those refs, not a newly written index-only checkpoint. Do not delete source pins, alternates, seed objects or private indexes on rejection.

**Test scenarios:**
- Unmarked legacy index + alternates + source pin, no snapshot refs: change a file, force a required clean-filter stage failure, then run `resume` and a fresh service. No snapshot ref is created; marker and object dependencies survive, source index bytes are unchanged.
- Repeat with a planted unknown index lock: no lock deletion, expensive discovery or child Git capture commands; the pending state survives restart.
- Interrupt new initialization after seed side effects but before successful capture: marker is already present and recovery cannot pin the partial index. Use controlled Effect checkpoints; no production test flags or actual machine-wide process kills.
- Untouched legacy index-only recovery still succeeds. A previously pinned repository retains its hashes after a later failed capture. Successful retry in a fresh service records the correct tree and permits marker cleanup.
- Marker write failure stops mutation; ref lookup failure retains protection. Existing historical-diff, disabled, source-index, tool-ordering and owned-question tests remain valid.

**Acceptance:** The new regression fails before the fix and passes after it. No pending unpinned state can reach the index-only fallback, and valid legacy fallback remains covered.

### U5. Attribute And Resolve Validation Failures
**Priority:** High. **Requirements:** R1-R4, R6, R8. **Dependencies:** U4 for final verification.

**Files:** Existing affected tests; profile-sensitive fixture paths only when proven wrong. Inspect `script/check-opencode-promise-facades.ts` and `test/kilocode/server/listener-runtime.test.ts`; modify outside-snapshot files only for a demonstrated, narrowly owned cause, never unrelated user changes.

1. Run the Verification Contract. Record exact command, environment, failing assertion and timing; run slow Git suites sequentially to avoid manufactured contention.
2. For Windows symlink EPERM, use an appropriately privileged/Developer Mode environment or supported CI runner. Keep the symlink assertions; an unexecuted platform case remains a coverage gap.
3. Use the canonical active profile in fixtures or explicitly isolate the test process profile. Do not change real user configuration. For timeouts, establish fixture completion/order and baseline comparison first; do not increase product thresholds or weaken assertions.
4. Inspect all five listener-runtime facade references and their diff/history. If the added reference is redundant, remove it; if it is a legitimate allowed boundary, justify the exact classification change. Do not blindly change four to five. If it belongs to concurrent work or a broader service redesign, report it as a separate CI blocker.

**Test scenarios:** Genuine baseline failures are distinguished from introduced failures; valid behavior is still asserted. Restore/revert preserves a locked workspace, and baseline capture still precedes tools. Updated classifications reject an unapproved extra facade reference.

**Acceptance:** Relevant checks pass, or reproducible baseline/environment evidence names each remaining external blocker. Never label the whole change CI-ready while a required guard is still failing.

### U6. Build And Smoke-Test In Isolation
**Priority:** High after code validation. **Requirements:** R4, R7. **Dependencies:** U4; U5 determines release readiness. **Decision:** KTD11.

**Files:** Build outputs only unless a packaging defect is proven. Follow `packages/kilo-vscode/AGENTS.md`, `script/local-bin.ts` and root `TESTING.md`.

1. Produce a fresh compiled host CLI from `packages/opencode/` with `bun run script/build.ts --single --skip-install`; record the input revision/diff identity and binary SHA-256. Never reuse an unexplained prebuilt artifact.
2. Prepare the extension's local compiled binary with `bun script/local-bin.ts --force --compiled` from `packages/kilo-vscode/`, only after confirming it is not in use and preserving needed local build outputs. This script can remove local `dist` artifacts. Do not copy over installed-extension directories or start a live reload.
3. Smoke-test source/compiled behavior with disposable repository and isolated runtime data, using the existing backend testing procedure. Confirm the actual executable path/hash, not just its version string. If extension launch is necessary, use the existing isolated CLI launch script with a disposable workspace and separate state, never the current workspace.

**Test scenarios:** Healthy capture yields a readable hash; a private lock fails closed without deletion/repeat scans; capture completion closes the question; prior hashes and disposable-worktree undo/redo remain correct.

**Acceptance:** The local compiled artifact demonstrably contains the fix and passes the smoke scenarios. Report build-only readiness separately from installation and full CI readiness.

### U7. Separately Approved Runtime Maintenance
**Priority:** High operational follow-up, not automatic execution. **Requirements:** R4, R7. **Dependencies:** U4-U6 and new explicit user approval. **Decision:** KTD11.

1. Before approval, produce only a maintenance checklist: affected sessions/backend PIDs, executable paths, resolved profile data directory, proposed build hash, backup location, object dependencies and rollback constraints. Never disclose server credentials in process/log output.
2. After approval, quiesce and stop only the affected backend owners and prevent automatic respawn for the window. Include both extension hosts if they can write the target repository. A momentary absence of `git.exe`, lock age or holding the new flock is not proof that writers are stopped.
3. Back up private metadata/refs and all required borrowed objects/source pins. Verify historical trees are readable and that the backup is not merely a directory copy with dangling alternates. If ownership or recoverability is uncertain, stop without removing the lock.
4. Remove only the confirmed orphaned private `index.lock`. Never remove the source lock, snapshot index, refs or objects. Apply the verified build through the intended extension lifecycle and start one intended backend with fresh in-memory service state.
5. Verify prior hashes and a new capture. Run restore/redo assertions only in a disposable worktree, not the dirty live workspace. Preserve backup and logs; on failure, stop the affected backend rather than repeatedly mutating data. Binary rollback must be compatible with the pending-marker state; do not blindly restore unrelated source-repository files.

**Acceptance:** Exact new executable/hash observed, old hashes resolve and new capture succeeds without stale-pin creation. If the user has not approved maintenance, deliver the checklist and explicitly report runtime recovery as pending.

### U8. Measure And Investigate Without Speculative Fixes
**Priority:** Medium. **Requirements:** R5, R7, R8. **Dependencies:** Disposable measurements after U4; real-workspace measurements only after U7.

1. Use a repeatable disposable fixture to compare current/updated code: cold capture and at least five healthy warm captures, plus two blocked calls. Record file count, median/range and environment; separate lock wait from seed, discover, ignore/stat, stage, tree and localization/pin using existing spans or narrowly scoped monotonic timing.
2. Preserve the uncontended early-lock regression: no expensive capture/discovery commands and a sub-second first rejection; the guarded repeat performs no Git capture work. Investigate healthy warm changes above 10% against repeated samples, not a single timing.
3. After approved maintenance, measure the same real repository without resetting/deleting its cache to manufacture a cold test. Use a disposable equivalent for cold behavior. Collect process ownership and cancellation chronology; retain logs without credentials or file contents.
4. If the slow phase or lock creator is confirmed, report a narrow next fix with evidence. Otherwise record the exact unknown. Do not implement concurrency changes, force-kill policy, age-based deletion or a generic lock redesign in this pass.

**Acceptance:** Separate measured improvements from unresolved hypotheses. Real-repository results may remain explicitly pending while U7 is unapproved; this does not authorize maintenance or a speculative optimization.

---

## Verification Contract
Run from `packages/opencode/`:
- `bun run typecheck`.
- `bun test ./test/kilocode/snapshot-lock.test.ts ./test/kilocode/snapshot-track-timeout.test.ts ./test/kilocode/question-cancel.test.ts`.
- `bun test ./test/snapshot/snapshot.test.ts ./test/kilocode/snapshot-prepare.test.ts ./test/kilocode/snapshot-seed.test.ts ./test/kilocode/snapshot-disabled.test.ts`.
- `bun test ./test/session/snapshot-tool-race.test.ts ./test/kilocode/session/revert.test.ts`.

Run from the repository root:
- `bun run script/check-opencode-annotations.ts --worktree`.
- `bun run script/check-opencode-promise-facades.ts` if adapter/service wiring changes.
- Check formatting for changed TypeScript files with the existing formatter; do not reformat unrelated work.

Use real Git for index/ref/object assertions. First run U4-specific tests red/green, then the suites above sequentially. Avoid arbitrary wall-clock sleeps for startup recovery tests; expose controlled checkpoints through existing test services instead. Do not run root `bun test`.

For smoke tests, follow `TESTING.md` with a local source backend, then the freshly built local binary; never treat an installed production backend as evidence for source changes. No endpoint/SDK regeneration is expected. If extension packaging/integration source changes become necessary, additionally run the extension's typecheck, lint, relevant unit tests and compile; do not broaden source edits merely to build the CLI.

## Definition Of Done
- The blocked-index regression no longer triggers repeated repository scans or a stale successful baseline.
- Capture completion automatically ends its obsolete question, with no leaked pending/progress state.
- Snapshot configuration stays enabled unless the user explicitly selects Disable; healthy captures and historical undo/redo remain correct.
- Legacy failed-capture/restart, seed-interruption and untouched-legacy recovery cases all have regression coverage; pending state never manufactures a baseline.
- Targeted tests, typecheck and applicable guards pass, or exact evidenced baseline/environment failures are reported as blockers without a false release-ready claim.
- Numeric before/after evidence is reported honestly. Unknown lock origin is not presented as proven, and live recovery is not claimed unless completed safely.
- Only intended source/test/release-note files change. Preserve all pre-existing staged workspace edits; remove abandoned experimental code. No commit or push is authorized.
- A verified local binary and isolated smoke evidence are delivered. Installed extensions and live data remain untouched unless the separately reserved maintenance approval was actually granted.
- There are no blocking design questions for U4-U6. Approval and writer-quiescence checks are explicit gates for U7, not permission inferred from implementing this plan.

## References
- `packages/opencode/src/snapshot/index.ts`: reconciliation at 184-328, capture at 410-460, adapters at 974-1001.
- `packages/opencode/src/kilocode/snapshot/track.ts`: availability guard at 176-208, question wait at 414-495.
- `packages/opencode/src/kilocode/snapshot/prepare.ts`: existing repository shortcut at 58-59.
- `packages/opencode/src/question/index.ts`: pending registration/publication/wait at 113-125.
- `packages/core/src/cross-spawn-spawner.ts`: Windows force termination at 303-314 and finalization at 431-460; evidence for a hypothesis only.
- `packages/core/src/util/effect-flock.ts`: acquisition can outlive turn timeout; redesign is deferred.
