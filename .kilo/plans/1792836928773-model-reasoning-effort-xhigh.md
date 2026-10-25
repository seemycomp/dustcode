---
title: "feat(vscode): Configure model reasoning efforts including Extra High"
date: 2026-10-24
type: feat
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Per-Model Reasoning Effort

## Goal Capsule
Allow configuring reasoning efforts for individual custom models, including GPT 6.1 Sol, and selecting Extra High using the wire value `xhigh`.
Reuse model variants and the existing provider-config save path rather than adding a global effort override.
Do not change the selected effort automatically or modify unrelated worktree changes.

## Product Contract
### Requirements
- R1. Add Reasoning effort configuration to individual model cards in Settings > Providers > Custom Provider when reasoning is enabled.
- R2. Offer the standard preset items Low (`low`), Medium (`medium`), High (`high`), and Extra High (`xhigh`) by default for OpenAI-compatible/OpenAI custom models. Permit choosing which efforts the model exposes; include Extra High in the initial preset for models without explicit variants.
- R3. Preserve existing explicitly configured variants and unknown provider options. An existing explicit list is not silently extended; Extra High is available to add.
- R4. Saving a model with Extra High produces `variants.xhigh.reasoningEffort = "xhigh"`; choosing it in chat persists and sends variant `xhigh`, not its display label.
- R5. Display `xhigh` as Extra High in the shared selector, including chat, mode settings, subagent model settings, and Agent Manager callers that reuse it. Preserve other custom variant names.
- R6. Do not select Extra High automatically. Keep Default/unset and existing selection semantics, including nearest-supported fallback when a selected variant is removed.
- R7. Models not being edited must retain their existing capabilities and variants; do not globally append xhigh or infer support for every reasoning model.

### Decision And Scope
Per-model configuration was chosen by the user over a global list or a Sol-only hardcoded fix.
Default means a supplied option/preset, not a new default request effort.
No automatic migration of saved provider config, new global VS Code setting, SDK/server schema change, API capability probing, generic JSON variant editor, or VSIX packaging is included.
Anthropic-specific thinking/budget payloads remain unchanged; do not convert their variants to OpenAI `reasoningEffort` payloads. The new standard effort preset applies to the two OpenAI transports only.

## Planning Contract
### Evidence
- `packages/opencode/src/provider/transform.ts:1066-1074` generates only low/medium/high for generic OpenAI-compatible models.
- `packages/opencode/src/kilocode/provider/provider.ts:108-133` already accepts explicit variants and supplies broad fallback efforts only when generation returns no variants. Therefore extending the fallback constant does not fix this case.
- `packages/opencode/src/provider/provider.ts:1637-1652` merges configured variants and honors disabled/null removals.
- `packages/kilo-vscode/webview-ui/src/context/session-variants.ts:32-37` obtains available choices directly from model variants.
- `CustomProviderDialog.tsx` already parses variants, and `CustomProviderValidation.ts:108-117` serializes them, but `CustomProviderModelCard.tsx` exposes only basic model fields and toggles.
- `ThinkingSelector.tsx:69-72` capitalizes raw keys, so `xhigh` currently renders as Xhigh.
- `packages/kilo-vscode/src/shared/custom-provider.ts:187-224` supplies null deletion sentinels because provider saves deep-merge config.

### Technical Decisions
- KTD1. Persist per-model configuration in the existing `provider.<id>.models.<id>.variants` map (session-settled: user-directed, chosen over a global list to avoid sending unsupported effort values to unrelated models).
- KTD2. Present a compact preset checklist/multiselect using existing kilo-ui components. Initialize missing explicit variants in the edit form only; save via the normal Save action. Cancel performs no writes. Preserve all configured custom/advanced variants.
- KTD3. Retain raw variant objects when unchanged. Updates to a standard effort must modify the backing raw object too, since `serializeVariant` prefers `raw`; preserve unrelated fields such as thinking, summaries, include lists, and custom payload options.
- KTD4. Reuse current removal/reset and provider-refresh behavior. Ensure deselecting an effort cannot reappear from backend inferred variants after reload: represent a deliberate disabled inferred effort using the existing `disabled: true` mechanism where needed, rather than relying only on a removed key/null. Do not conflate reset-to-auto with an explicit empty list.
- KTD5. No backend inference changes should be required: explicit configured variants already carry `reasoningEffort` through the runtime. Extend backend tests to prove this rather than duplicating the option list in UI and backend.

### Data Flow
Model card effort choices -> existing provider validation/serialization -> host sanitize/save/deep-merge -> backend model variants -> provider refresh -> shared effort selector -> session variant storage -> existing prompt request -> provider reasoning options.

## Implementation Units
### U1. Configure Efforts On Custom Models
**Requirements:** R1-R4, R6-R7; KTD1-KTD4.
**Files:** `packages/kilo-vscode/webview-ui/src/components/settings/CustomProviderModelCard.tsx`, `CustomProviderDialog.tsx`, `CustomProviderValidation.ts`, `packages/kilo-vscode/src/shared/custom-provider.ts` only if existing sanitized variant support needs adjustment, and extension `webview-ui/src/i18n/` dictionaries.
**Tests:** `packages/kilo-vscode/tests/unit/custom-provider-dialog-validate.test.ts`, `custom-provider.test.ts`, and `provider-actions-save.test.ts`; add focused browser coverage in `packages/kilo-vscode/tests/` using existing custom-provider/settings Storybook fixtures.
1. Add per-model effort controls and localized explanatory text; pass transport and change callbacks from the dialog. Keep controls hidden for non-reasoning models and preserve Anthropic transport semantics.
2. Supply four standard presets for OpenAI transports without explicit variants. Preserve existing lists and offer xhigh without silently changing them.
3. Save through the existing path, preserving raw options and disabled/deletion behavior. Selecting/deselecting a preset must work after closing and reopening Settings.
**Test Scenarios:**
- A new OpenAI-compatible GPT 6.1 Sol reasoning model includes Extra High; save produces the correct xhigh payload.
- An existing model with only low/medium/high can add xhigh; an unrelated model remains byte-equivalent in its relevant config.
- Explicit custom names, advanced raw options, disabled variants, and Anthropic thinking settings survive an untouched save.
- Deselect an inferred or previously saved effort, save, refresh providers, and verify it does not reappear; reset-to-auto is distinguishable if exposed.
- Turning reasoning off/on, changing transport, cancelling, and save failure do not silently discard existing configuration or persist unsaved presets.

### U2. Show And Select Extra High
**Dependencies:** U1.
**Requirements:** R4-R6.
**Files:** `packages/kilo-vscode/webview-ui/src/components/shared/ThinkingSelector.tsx`, existing shared variant formatting utility if present, relevant i18n dictionaries, and `webview-ui/src/stories/` fixtures.
**Tests:** `packages/kilo-vscode/tests/unit/typeahead.test.ts`, `session-variant-store.test.ts`, `session-variants.test.ts` if present, and `tests/model-selector-accessibility.spec.ts` or a narrowly scoped new browser test.
1. Special-case the known wire key `xhigh` to the localized Extra High label in the shared picker and trigger/tooltip. Keep custom labels unchanged.
2. Verify the same source list reaches sidebar and Agent Manager, Shift+Tab cycling, mode and subagent selectors, and persisted selections. Do not inject UI-only options absent from model variants.
**Test Scenarios:**
- Extra High follows High, is keyboard-selectable/searchable, and emits `xhigh`.
- Picking Extra High sends and remembers `xhigh`; switching sessions does not leak selection.
- Default remains unset; removing xhigh falls back by existing supported-effort rules, and a model with no xhigh never displays it.

### U3. Prove Runtime Payload And Complete Verification
**Dependencies:** U1, U2.
**Requirements:** R3-R7.
**Files:** `packages/opencode/test/kilocode/provider-reasoning-options.test.ts`, existing provider request/payload test owning custom variants, and one new `.changeset/` entry for `dustcode`.
1. Add regression coverage that a custom OpenAI-compatible GPT 6.1 Sol configured with xhigh exposes that variant with `reasoningEffort: "xhigh"`, despite the generic three-effort heuristic.
2. Cover disabled inferred efforts and unchanged explicit variant precedence. Confirm the final outgoing OpenAI-compatible request uses `reasoning_effort: "xhigh"` through the real adapter/test seam, without a live paid model call.
3. Review only feature-owned changes; preserve earlier copy/mention fixes and unrelated worktree edits. Do not commit, install, or package unless separately requested.

## Verification Contract
- Extension: `bun run typecheck`, `bun run lint`, targeted unit tests above, `bun run knip`, `bun run check-kilocode-change`, and `bun run bundle` from `packages/kilo-vscode/`.
- Browser: settings preset/save/reopen plus shared selector Extra High accessibility and keyboard behavior on built Storybook; test both narrow sidebar and Agent Manager usage.
- Backend: targeted `bun test ./test/kilocode/provider-reasoning-options.test.ts` and the relevant adapter payload test from `packages/opencode/`; run package typecheck if backend code changes.
- Run scoped formatting and `git diff --check`; shared upstream source edits, if unavoidable, require narrow markers and `bun run script/check-opencode-annotations.ts --worktree`.
- No tests/builds were run during planning. Exact live GPT 6.1 Sol support is user-supplied; this feature enables explicit model configuration, not a promise every API accepts xhigh. Existing API error behavior remains authoritative.

## Definition of Done
The user can configure Extra High for an individual custom model, save and reopen it, select Extra High in chat, and send `xhigh` through the existing request path without changing unrelated models or the current effort automatically.
Relevant unit/browser/payload checks pass; any unavailable checks are identified precisely.
No blocking product questions remain. Exact helper names and browser fixture extraction are implementation details, not additional scope.
