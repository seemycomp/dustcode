# Mode Picker Colors And Options

## Goal
- Keep every mode label readable when hovered, selected, or keyboard-focused, including Ask, Debug, Plan, Code, and custom modes.
- Remove Orchestrator from the mode dropdown.

## Context And Scope
- Existing uncommitted changes in `packages/kilo-vscode/webview-ui/src/styles/model-selector.css` already apply contrast styling to all `.mode-switcher-item` badges, not just Code. Preserve these changes.
- Existing Playwright coverage in `packages/kilo-vscode/tests/model-selector-accessibility.spec.ts` checks the selected item and only the first unselected item. Expand it to exercise every relevant mode.
- Preserve the existing `.changeset/mode-picker-contrast.md`; update it to include hiding Orchestrator.
- Limit removal to the dropdown UI and its internal navigation. Do not remove backend agent definitions, edit persisted sessions, or broadly hide every deprecated/custom agent.

## Implementation
1. Verify the shared badge CSS across Code, Ask, Debug, Plan, and a custom-colored mode. Hover/focus should use the row foreground; selected items should use the theme's selection foreground. Keep mode-specific colors for idle items. If the reported blue-on-blue behavior reproduces with the current source, inspect computed styles and fix the winning rule rather than adding mode-specific overrides.
2. In `packages/kilo-vscode/webview-ui/src/components/shared/ModeSwitcher.tsx`, derive one reactive list excluding the exact agent slug `orchestrator`. Use that same filtered list for option rendering, option count, selected index, arrow/Home/End navigation, typeahead, and keyboard selection. Avoid filtering only the rendered rows, which would desynchronize indices.
3. Keep selected-agent label lookup against the original input list so existing sessions referencing Orchestrator remain intelligible. Opening the menu for an excluded selection should focus the first available option without silently changing the session. Keep current empty/single-option visibility behavior based on the filtered list.
4. Extend existing Storybook/Playwright coverage, adjusting the existing story fixture if needed: assert readable foregrounds for every visible mode in light and dark color configurations, selected states for Ask/Debug/Plan as well as Code, hover and keyboard focus, and unchanged idle mode colors. Include an Orchestrator fixture and assert it is absent while other modes remain. Verify keyboard navigation/typeahead/Enter select the correct remaining mode and an existing Orchestrator selection does not corrupt indices.
5. Update the existing changeset with a concise user-facing note covering mode contrast and removal of obsolete Orchestrator from the picker.

## Validation
- Run the focused `tests/model-selector-accessibility.spec.ts` Playwright tests from `packages/kilo-vscode/`, including the expanded mode cases and existing picker navigation tests.
- Run `bun run typecheck` and `bun run lint` from `packages/kilo-vscode/`.
- Review the diff to ensure only the picker, relevant test/story coverage, styles if needed, and existing changeset changed. No backend or persisted-state migration is required.
- Live installed-extension confirmation is separate from browser test evidence; do not claim a running extension reflects changed source without a rebuild/reload.

## Execution Boundary
- This turn is planning-only. Switch to an implementation-capable agent to apply and verify the plan. Do not commit or push unless requested.
