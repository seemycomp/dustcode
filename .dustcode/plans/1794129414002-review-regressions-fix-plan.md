# Fix Reviewed Webview Regressions

## Goal And Decisions

Fix the four P2 findings from the working-tree review without reverting the intended UI changes. The user explicitly chose to keep the compact model selector: on each open, expand only the preferred group containing the current model, then respect the user's group interactions until the popup closes.

- Preserve compact diff gutters, native context expansion, the white light-theme transcript, and ordinary light-theme message styling.
- Fix accidental model clearing, hidden keyboard selection after provider recovery, RTL gap-control positioning, and High Contrast Light message borders.
- Keep fixes within `packages/kilo-vscode/` and its existing patch changeset. No backend, SDK, public component API, persisted preferences, or migration changes.
- Do not alter `.dustcode/kilo.jsonc`, unrelated working-tree edits, upstream shared packages, or release versions. Do not commit or push as part of this plan.

## Verified Baseline

These results come from the preceding review, not a new implementation run:

- Type checking and lint passed. Selector unit tests passed 47/47; user-message tests passed 2/2; the session-diff render unit test passed.
- Six focused LTR session-review browser tests passed.
- Two of four focused selector browser tests failed because they assume groups start expanded. The complete browser suites have not been validated.
- In `shared--model-selector-selected-favorite`, opening Alpha, searching for Bravo, clearing search, and pressing Enter changes Alpha to the default model.
- With the selected provider initially missing and models from another provider already in Most Used, recovery can leave `selectedKey()` absent from `nodeMap()`; Enter does nothing.
- With `html.dir = "rtl"`, the full-width separator extends out of the review pane. Logical inline-start positioning fixed Unified and Split clicks in browser diagnostics.
- High Contrast Light computes a gray `rgb(214, 214, 214)` message border instead of its theme token `#0F4A85`, reducing contrast against white from about 8.98:1 to 1.45:1.

## Behavioral Contract

| Situation | Required behavior |
|---|---|
| Open with an available current model | Expand its preferred group, select a rendered row, show its preview, and focus search once. Prefer Favorites when the current model appears there. |
| Open without a configured model | Keep groups compact; expose the clear/default row when `allowClear` permits it. |
| Open while the current model is unavailable | Keep a valid visible fallback and retain the model identity as pending. Do not change the configured value. |
| Pending model becomes available without user interaction | Expand its preferred destination once, then restore its visible row and preview. |
| Provider refresh after user navigation, search, or group interaction | Preserve that interaction. Do not rerun initial collapse, clear the query, steal focus, or select an invisible row. |
| Clear a search with an available favorite | Restore its visible favorite row, not the clear/default option. Enter confirms the existing model. |
| User explicitly collapses the active group | Keep focus on a visible group heading; passive refreshes must not reopen it. Enter on a heading continues to toggle that group. |
| Remove the active favorite row | Move to the post-update canonical destination, expanding that destination for this explicit action when necessary. Preserve the configured model and scroll anchor. |
| Search has no matches | Preserve existing empty-result announcement and explicit default-option selection when clearing is allowed. |
| Close and reopen | Reset transient collapse/pending state, apply the new current model, and ignore callbacks from the previous opening. |

Data flow remains: provider catalog + configured selection + personalization -> groups -> collapse state -> visible nodes/rows -> keyboard selection and preview -> explicit selection handler. Only an explicit row selection may call `onSelect`; reconciliation must not modify settings.

## Implementation Sequence

### 1. Add Selector Regression Coverage

Extend `tests/unit/model-selector-lifecycle.test.ts` using its existing extraction harness, which runs the real Solid component setup and handlers. Do not reproduce the production selection algorithm inside tests.

- Add search-clear cases with an active favorite for both `allowClear: true` and `false`; check selected node membership, model value, preview, and Enter behavior.
- Add provider-recovery cases with a pre-existing Most Used group and usage history for both providers. Verify recovery selects a rendered row when untouched and preserves user navigation/search/group choices after interaction.
- Exercise favorite removal, explicit collapse, no configured model, unavailable model, close/reopen, and refresh while closed.
- Retain the existing assertions that a closed popup performs no catalog filtering or personalization work. Expose only additional handlers needed by these tests; reuse reactive fixture data rather than adding a separate mock implementation.
- Capture the new failures before modifying production behavior.

### 2. Resolve Selection Against Visible Nodes

Modify `webview-ui/src/components/shared/ModelSelector.tsx` with a small local, reusable resolution path where needed by opening, search reset, and tree reconciliation.

- For an empty query, resolve the current model to a visible favorite row first, then a visible canonical row. If its group was intentionally collapsed, use its visible heading instead of an absent row or an accidental clear fallback.
- Keep nonempty search canonical and relevance-ranked. Only use `CLEAR_KEY` when the documented fallback/default behavior actually applies.
- Keep resolution inside the existing `untrack` boundary for the search-reset effect so star/unstar changes do not unexpectedly reset an unrelated search or keyboard position.
- Before assigning selection from deferred work, validate it against the current `nodeMap()`. Clear preview/pre-active references when they no longer identify a visible model row.
- Preserve the explicit unfavorite transition: resolve the canonical group after personalization recomputes, retain the existing scroll anchor, and never clear the configured model as a side effect.

### 3. Separate Opening From Catalog Recovery

Adjust the same component's lifecycle without introducing a global store or persisted settings.

- Make initial snapshot, compact defaults, initial search focus, and initial centering opening-scoped rather than rerunning on arbitrary catalog/group updates. Capture the configured model identity at open time even if its provider is unresolved.
- Retain unresolved selection as a local pending identity. If the catalog is already partially available, use compact provisional groups and a valid fallback; do not treat missing active-model data as successful active-group initialization.
- Resolve pending identity once the model appears, provided no user interaction superseded the opening intent. Open its destination and resolve selection only after visible nodes recompute.
- Cancel automatic recovery selection on explicit search, keyboard/pointer navigation, or group interaction. Continue reconciling invalid nodes without overriding valid user focus or manually collapsed groups.
- Reset opening/pending state on close. Guard queued microtasks and animation callbacks against close, disposal, and a newer opening; do not add timing-based `setTimeout` sequencing.
- Keep helper/state additions local and minimal. Preserve existing virtualization, provider filtering, constrained catalogs, preview controls, and IME-safe Enter handling.

### 4. Update Selector Browser Tests And Fixtures

Update `tests/model-selector-accessibility.spec.ts` and, only as needed, `webview-ui/src/stories/shared.stories.tsx`.

- Assert compact defaults explicitly: the active group is open and unrelated groups are closed.
- Tests inspecting Auto or Recommended models must open those groups explicitly before inspecting/clicking their rows. Restore any group state needed for subsequent keyboard assertions.
- Update the duplicate-favorite test to deliberately open the canonical group before checking duplicate behavior, rather than assuming both groups start open. Also cover collapsing the only visible active group without producing a hidden active descendant.
- Add a browser regression using the existing selected-favorite story: search, clear search, Enter, and verify the model remains Alpha.
- Add one small reactive recovery fixture if needed for DOM coverage. Use signal-driven catalog changes, not network delays or arbitrary sleeps; unit coverage must still exercise the normal provider path.
- Verify real focus, `aria-activedescendant`, preview content, Escape restoration, explicit clear, and bounded rendering of the 600-model catalog. Do not skip or weaken old tests to obtain green results.

### 5. Fix RTL Diff Anchoring

In `webview-ui/diff-viewer/review-session-diff.tsx`, replace the physical slot inset with logical block-start and inline-start positioning.

- Preserve absolute positioning, the 24px separator row, and the existing unified/split width variables so gap controls remain excluded from gutter intrinsic sizing.
- Keep `review-session-diff.css` spacing unchanged unless a new test proves an additional correction is required. Do not revert to `display: contents` or modify Pierre internals.
- Extend `tests/diff-scroll-preservation.spec.ts` for LTR/RTL, Unified/Split, and 1000px/420px viewports. Set direction after the story's language initialization and assert it before measuring.
- Assert gutters exist before measuring them. Check controls against the visible review pane/viewport, not only their own gap wrapper; the previous wrapper-only check accepts an entire separator positioned offscreen.
- Exercise actual normal clicks on Show 20 and Expand All, including both split-side separators where applicable. Confirm newly exposed lines, compact gutters, unchanged scrolling, and reachable Keep/Undo actions. Do not use forced clicks.
- Do not broaden this fix into a redesign for pre-existing long-label overflow at extreme widths.

### 6. Restore The High-Contrast Border

In `webview-ui/src/components/chat/user-message.css`, separate white background styling from the ordinary-light gray border override.

- Keep white backgrounds for the intended light surfaces.
- Apply `#d6d6d6` only to ordinary light mode. Let High Contrast Light keep `var(--border-weak-base)` from the established theme rules; preserve dark/high-contrast-dark behavior and existing geometry.
- Add parameterized browser computed-style checks in `tests/accessibility.spec.ts`, using the existing user-message story and theme globals. Name the cases with the prefix `user message theme` for focused execution.
- Cover Light Modern, High Contrast Light, Dark Modern, and High Contrast Dark, including a theme switch on the same rendered message to detect stale overrides. Compare HC borders to the resolved theme token rather than only asserting a hardcoded palette.
- Use actual rendered messages and the existing Playwright setup. Axe alone does not protect this non-text outline; no optional VS Code self-test harness installation is needed.

### 7. Release Notes And Diff Hygiene

- Extend `.changeset/compact-review-diff-gutter.md` with concise user-facing descriptions covering reliable compact-model selection, RTL context expansion, and high-contrast outlines. Keep one `dustcode: patch` changeset for this related change set.
- Keep production modifications scoped to the selector, diff slot anchoring, and user-message border. Reuse existing test files and stories; do not create additional documentation or generic utilities.
- No SDK regeneration, source-link extraction, upstream annotations, migration, or feature flag is needed for the planned changes.

## Validation

Run these from `packages/kilo-vscode/` during implementation, not during planning:

```sh
bun test tests/unit/model-selector-lifecycle.test.ts tests/unit/model-selector-utils.test.ts tests/unit/review-session-diff-render.test.ts tests/unit/diff-viewer-css-arch.test.ts tests/unit/user-message-edit.test.ts
bun run test:visual tests/model-selector-accessibility.spec.ts tests/diff-scroll-preservation.spec.ts --workers 1
bun run test:visual tests/accessibility.spec.ts --grep "user message theme" --workers 1
bun run typecheck
bun run lint
bun run check-kilocode-change
bun run knip
bun run compile
```

- Use the complete selector and diff browser files for final validation, not only the previously passing/failing subset. Existing Playwright configuration manages Storybook; when reusing a server, confirm it serves current sources. Record cold-start infrastructure failures separately and reproduce them before attributing them to a patch.
- Check formatting only for changed implementation/test files. Run `git diff --check` and inspect final status to avoid unrelated formatting or generated artifacts.
- If any check fails outside the patch, report its exact command and failure; do not silently label the implementation ready. Do not run root `bun test`.

## Completion And Rollout

- All four reported reproductions are covered by regression tests and pass. The two known selector browser failures are corrected through explicit compact-state setup, not assertion removal.
- Selection always targets an existing node when nodes are available; preview never references a removed row. Clearing search cannot silently clear an available configured favorite.
- Provider recovery is usable without stealing an established user interaction; explicit group collapse survives passive updates. Closing the popup retains its zero-catalog-work behavior.
- RTL gap controls remain inside their visible diff columns and are clickable; gutters remain compact in both directions.
- High Contrast Light retains its theme-provided outline while ordinary light styling remains unchanged.
- Deliver as a normal patch release with no data migration or persistent state changes. If a fix must be rolled back, revert only the new implementation hunks, preserving pre-existing user edits and the chosen compact UX.
- The final implementation report must list changed behavior, checks actually run, and any remaining failures. Full installed-VS-Code testing is optional follow-up, not a substitute for the automated checks above.

No unresolved product decisions remain. This file is a plan only; implementation requires switching to an implementation-capable agent.
