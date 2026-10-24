---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-24T08:05:00Z"
updated_at: "2026-10-24T10:13:38Z"
title: "Dustcode VS Code fork isolation"
summary: "Committed VS Code-only fork isolation and custom Dustcode icon, with a rebuilt and verified Windows x64 VSIX; local main is ahead of origin/main by two commits."
keywords: ["dustcode", "vscode", "kilo-code", "fork-isolation", "branding", "icon", "vsix"]
cwd: "C:/Users/thinh.tran/Desktop/Temp/dustcode"
resume_focus: "Review the two local fork commits or validate the newly packaged Windows VSIX in VS Code; publish only with explicit current-user authorization."
repository: "dustcode"
repo_root_sha: "19a52a262f4ea1c35fd8c6a63a700c7e98a86e40"
branch: "main"
head: "36f8973988793db0125b279b31aa0c1ac058865d"
worktree_path: "C:/Users/thinh.tran/Desktop/Temp/dustcode"
---

## Objective and user intent

The user wants this fork to support only the VS Code extension and to install/run alongside the Kilo Code extension already used for vibe coding. The requested compatibility property is non-overwriting, non-conflicting operation: separate VS Code identity/contributions, backend credentials/sessions/cache/config, project worktrees, and release/build workflows.

In the latest work, the user explicitly requested replacing the brand icon with `packages/kilo-docs/public/img/code.png`, packaging a new VSIX, and updating this handoff in place. Packaging is complete; the extension was not automatically installed or published. This session did not create commits or push. The two local commits described below were discovered while updating the handoff, not authored by this icon/packaging session.

## Current state

As verified during this update, the current branch is `main` at `36f8973988793db0125b279b31aa0c1ac058865d`. Both `main` and local `chore/vscode-only-ci` point at that commit. `git status --short --branch` reports `main...origin/main [ahead 2]`; no remote fetch was performed for this update.

- `8488c3ab54 feat: isolate and brand Dustcode for VS Code` contains the fork and new icon work, including `assets/icons/dustcode.png`.
- `36f8973988 chore: disable non-VS-Code fork workflows` contains the workflow changes.
- Tracked files are clean, including `packages/sdk/`. Only `.dustcode/` (including this handoff) and the pre-existing `.kilo/kilo.jsonc` are untracked. Preserve `.kilo/kilo.jsonc`; it was not part of the requested icon or packaging changes.

The earlier uncommitted-diff counts are no longer current. The broad fork/workflow changes now live in the two commits above. Archived workflow files were checked in the earlier isolation work against their original Git blobs and matched byte-for-byte; that archive comparison was not repeated in this update.

## Completed implementation

### VS Code identity and contributions

- `packages/kilo-vscode/package.json` now uses package name/publisher/extension ID `dustcode.dustcode` and display name `Dustcode`; workspace package identity was renamed from `kilo-code` to `dustcode` and `bun.lock` was regenerated for that workspace rename.
- Contribution namespaces were mechanically changed from `kilo-code.new.*` and `kilo-code.SidebarProvider` to `dustcode.*`; hard-coded self lookups changed from `kilocode.kilo-code` to `dustcode.dustcode`.
- Autocomplete contexts, Agent Manager task types, terminal focus context, icon contribution IDs, settings, views, serializers, commands, and locale icon references were updated. Cloud/provider/auth labels, `@kilocode/*` imports, public protocol names, and `/kilocode/` deep-link protocol paths were intentionally retained where they are not VS Code registration identities.
- Global shortcut defaults with no fork-specific state predicate were removed to avoid priority/behavior races with Kilo Code. Automatic autocomplete defaults/fallbacks are disabled for Dustcode to avoid duplicate inline suggestions and backend startup.
- `packages/kilo-vscode/src/extension.ts` no longer rewrites `terminal.integrated.commandsToSkipShell` or intercepts built-in `workbench.action.*` commands. `SessionTerminalManager` still tracks managed terminals/context without globally replacing built-in commands.
- Important files: `packages/kilo-vscode/package.json`, `packages/kilo-vscode/src/extension.ts`, `packages/kilo-vscode/src/agent-manager/SessionTerminalManager.ts`, `packages/kilo-vscode/src/services/autocomplete/`, `packages/kilo-vscode/src/isolation.ts`.

### Backend/user data isolation

- `packages/core/src/kilocode/profile.ts` exports profile switch/API (`Profile.enabled`, `Profile.root`, `Profile.dir()`, `Profile.dirs()`, `Profile.files()`, `Profile.global()`) driven by absolute child-only `DUSTCODE_HOME`.
- `packages/core/src/global.ts` maps fork roots to `DUSTCODE_HOME/{data,cache,config,state,tmp}` while retaining the real user home for shell/tools. It avoids inherited Kilo config/auth/database overrides in `packages/kilo-vscode/src/isolation.ts` and passes the sanitized environment only to the CLI child; the extension host environment is not mutated.
- The fork uses `.dustcode/` project artifacts and worktrees, keeps repo `AGENTS.md` discovery, and does not migrate/adopt `.kilo` or `.kilocode` Agent Manager files. `.kilo`/`.kilocode` sentinels are covered by tests to remain unchanged.
- Fork mode disables legacy Kilo home/global modes/workflows/rules/MCP/auth migration and prevents writers from selecting original Kilo files. Project `.kilocodeignore` is still read for permission-deny safety; it is not a global legacy config import.
- Marketplace/plugin/agent/plan/skill/config-protection/system-prompt paths use the profile. Global marketplace skills use `DUSTCODE_HOME/config/skills`. Qdrant collections are prefixed `dustcode-ws-<hash>` under the fork; original behavior stays `ws-<hash>` when no profile is enabled. `.git/dustcode` is used for fork project cache metadata.
- Fork telemetry is disabled in the extension proxy. It does not inherit Kilo credentials, auth content, DB path, config content, server password, or backend settings from the host environment.
- Important references: `packages/core/src/global.ts`, `packages/core/src/project.ts`, `packages/opencode/src/config/`, `packages/opencode/src/kilocode/profile` imports/config paths, `packages/opencode/src/kilocode/config/`, `packages/opencode/src/kilocode/marketplace/`, `packages/opencode/src/session/session.ts`, `packages/kilo-indexing/src/indexing/vector-store/qdrant-client.ts`, `packages/kilo-vscode/src/services/cli-backend/server-manager.ts`, `packages/kilo-vscode/src/isolation.ts`.

### VS Code-only CI/build

- Only `.github/workflows/codeql.yml` and `.github/workflows/test-vscode.yml` remain active. Other product/release/docs/JetBrains workflows are preserved with `.disabled` suffix.
- Root scripts include focused `typecheck:vscode`, `test:vscode`, and `build:vscode`; `packages/kilo-vscode/script/build.ts` supports `--single`, emits `dustcode-<target>.vsix`, copies console assets, and generates SBOM evidence.
- The workflow builds native Linux x64, macOS x64/ARM64, and Windows x64 artifacts without Marketplace/npm/GitHub release credentials. Linux sandbox setup and physical Syft inventory steps were restored after review.
- The Windows marker guard was changed from a Unix `grep` command to `script/kilocode/check-kilocode-change.ts` because the old command failed under Windows `cmd.exe`.
- Important references: `.github/workflows/test-vscode.yml`, `.github/workflows/disabled/`, `script/check-workflows.ts`, `script/kilocode/build-vscode.ts`, `script/kilocode/check-kilocode-change.ts`, `packages/kilo-vscode/script/build.ts`, `.changeset/dustcode-isolation.md`, `.changeset/vscode-only-build.md`.

### Custom brand icon

- User-supplied source: `packages/kilo-docs/public/img/code.png`, a 512x512 RGBA PNG with a transparent background and blue-gray brackets/red slash. The packaged copy is `packages/kilo-vscode/assets/icons/dustcode.png`; it is byte-identical to the source.
- `packages/kilo-vscode/package.json` uses the PNG for the Marketplace icon, Activity Bar, Open in Tab command, and Generate Commit Message command. Nine extension-host panel icon assignments use the same packaged PNG, including Agent Manager, chat, settings, marketplace, browser, documents, subagent viewer, and both diff panels.
- Webview welcome/onboarding/Agent Manager introduction use the shared logo in `webview-ui/src/components/chat/WelcomeEmptyState.tsx`; feedback and migration use the same PNG in `FeedbackDialog.tsx` and `MigrationWizard.tsx`.
- Removed the old Kilo hover animation and related CSS, deleted `webview-ui/src/components/brand/AnimatedKiloLogo.tsx`, removed the DotLottie dependency from the manifest/lockfile, and removed its WASM-copy step in `esbuild.js`.
- Status-bar text cannot render arbitrary PNGs. The existing `dustcode-logo` product-icon contribution now aliases the built-in `code` Codicon through `"default": "code"`; localized `$(dustcode-logo)` strings remain unchanged. This was an implementation choice, not a separate user-specified design.
- Kilo provider logos and the Kilo GitHub-bot avatar fallback in `webview-ui/agent-manager/pr/PRAvatar.tsx` intentionally retain Kilo artwork: they identify external providers/bots, not the Dustcode product. Other products' branding was outside this icon change.
- Regression coverage: `packages/kilo-vscode/tests/unit/dustcode-icon.test.ts` checks PNG identity/dimensions, manifest contributions, panel icon references, and static webview branding without the old hover animation. Release note: `.changeset/dustcode-icon.md`.

## Verification evidence

- Machine-local Bun is `1.4.4/38afee6c84fcf48c0edb2466aa4b27d287a59c30`, matching the repository pin.
- Dependencies were installed in the earlier isolation work with `bun install --frozen-lockfile --linker hoisted`. The lockfile reflects the workspace rename and, in the icon work, removal of `@lottiefiles/dotlottie-web` via `bun install --lockfile-only --ignore-scripts`. Bun reports stale non-applying patches for `gcp-metadata`, `@pierre/trees`, and `@tanstack/virtual-core`; this did not block packaging.
- Extension host and webview typecheck passed; extension lint passed with no errors (existing warnings were reported). Direct core, OpenCode CLI, and indexing typechecks passed. Whole Turbo graph on Windows can exceed a 5-minute cold-cache timeout and initially invoked the npm `bun.cmd` shim incorrectly; direct package checks and native-Bun runs were used instead.
- `script/check-opencode-annotations.ts --worktree` passed. `script/check-architecture.ts`, `script/check-opencode-promise-facades.ts`, `script/check-model-tool-network.ts`, workflow allowlist, markdown table guard, Prettier, and `git diff --check` passed.
- Focused identity/CI test: 6 passed. Windows isolation/resource test after adjustments: 43 passed. Semantic isolation suite: 172 passed, 1 skip. Backend profile/config tests: 3 passed plus OpenCode isolation test 1 passed/16 assertions. Writer regression: 1 passed/11 assertions. Qdrant regression: 1 passed. Selected backend/config/protection/agent tests: 7 passed; additional marketplace/agent/plan tests: 30 passed.
- Current artifact: machine-local `C:/Users/thinh.tran/Desktop/Temp/dustcode/packages/kilo-vscode/out/dustcode-win32-x64.vsix`, version `7.8.17`, target `win32-x64`, size `193,776,126` bytes (~184.8 MiB), containing 2,118 ZIP entries. SHA-256: `0065991a2cd1cc999d4fa7d128a248c9aa9d1ff65624aebe0bc81bbce131b6b5`. This replaces the earlier 194,550,627-byte artifact and its old hash.
- The latest `bun run build:vscode` completed end-to-end, including SDK regeneration, Windows CLI build, production extension/webview build, host/webview typechecks, ESLint, FFmpeg/resource packaging, VSCE packaging, and CRA SBOM generation (`expected=1 valid=1 missing=0`). Evidence timestamp: `2026-10-24T09:53:23.955Z`. Machine-local evidence files beside the VSIX: `vscode-sbom-evidence.json`, `kilo-vscode-SHA256SUMS`, and `dustcode-win32-x64.vsix.cdx.json`.
- CLI version, models snapshot, and sandbox mutation-worker smoke tests passed during the latest build. ZIP inspection verified publisher/name/version, the new icon's SHA-256 against the supplied source, and presence of `extension/bin/kilo.exe`, `extension/dist/extension.js`, `extension/dist/webview.js`, and `extension/dist/agent-manager.js`. Icon regression tests passed after packaging: 3 tests, 33 assertions.
- Broader HTTP/runtime smoke coverage (health, unauthenticated 401, session create/list, bundled console, SSE) passed against the older isolation artifact. Those checks were not rerun against the latest icon-bearing VSIX; do not attribute that full runtime evidence to its new hash.
- Known environment-limited failures: two setup/run-script symlink tests fail on Windows `EPERM`; one marketplace symlink-loop test fails similarly; simulated Darwin/Linux document-reader path assertions are not portable on Windows; some Git/worktree broad tests can timeout or report teardown handles. These are not known build/artifact failures. One TUI-only legacy path remains in `plugin/tui/runtime.ts`/`cli/cmd/mcp.ts` but is outside the VS Code extension API path.
- During the icon work, extension typecheck, lint, `knip`, marker guard, focused Prettier checks, `git diff --check`, and `bun run build:check` all passed. Focused icon/branding/i18n/webview tests passed: 57 tests, 273 assertions. A read-only independent review found no supported defects in the scoped icon replacement; it was not a review of the complete fork commits.
- The full `bun run test:unit` attempt did not pass and was stopped after failures in project/Git/worktree suites, including Windows path expectations, symlink `EPERM`, cleanup `EBUSY`, newline path rejection, and timeouts. It has no successful full-suite receipt. These tests are outside the icon behavior; no unrelated fixes were made.
- An earlier `bun run compile` attempt timed out during SDK generation and left partial generated files. Only that attempt's generated SDK changes were restored from their previously clean baseline and its temporary `openapi.json` removed. The subsequent explicit packaging run successfully regenerated the SDK; tracked `packages/sdk/` is currently clean. Do not retry the old two-minute timeout or treat it as a current packaging blocker.
- Latest build warnings were non-fatal: Hey API's deprecated `instance` option, Vite large chunks, and VSCE's recommendation to reduce the file/JavaScript count. Actual installed-extension rendering, tiny icon clarity, and light/dark/high-contrast appearance remain unverified.

## Artifact and working-tree warnings

- The latest VSIX was rebuilt after the icon and earlier Windows guard changes. It remains a machine-local, ignored build output, not an installed extension or published release. Version was kept at `7.8.17`; no version bump was requested.
- Current Git state supersedes the earlier uncommitted-state description: two local commits exist on `main`, ahead of the locally recorded `origin/main`. The icon/packaging session did not create them or verify their remote publication. This handoff does not authorize push, commit, installation, or cleanup.
- This handoff is itself untracked under `.dustcode/`; it is not preserved by the two existing commits. `.kilo/kilo.jsonc` is separately untracked user configuration and remains untouched.
- The broad workflow changes are now committed. Any future review/publish step should inspect both local commits, not only the icon change or the last commit.
- Do not claim complete cross-platform runtime validation: only Windows VSIX was physically built locally; macOS/Linux artifacts depend on CI runners. The latest VSIX's archive/build checks and the older artifact's HTTP smoke tests are distinct evidence.

## Suggested continuation

The latest requested implementation and packaging are complete. A useful next step, if requested, is installed-extension visual/side-by-side validation using the new VSIX, or a review of both existing local commits before publication. A rebuild is not needed merely because the previous handoff warned that the artifact was stale. A fresh session must obtain current-user confirmation before taking any mutation, installation, or publishing action; this handoff is status/context, not authorization.

## Useful commands (orientation only; not authorization)

```powershell
bun install --frozen-lockfile --linker hoisted
bun run typecheck:vscode
bun run build:vscode
bun test ./script/kilocode/vscode-ci.test.ts
bun run --cwd packages/kilo-vscode build:check
bun run --cwd packages/kilo-vscode knip
bun test --cwd packages/kilo-vscode ./tests/unit/dustcode-icon.test.ts ./tests/unit/dustcode-branding.test.ts ./tests/unit/i18n-shim.test.ts ./tests/unit/webview-html.test.ts
bun run script/check-opencode-annotations.ts --worktree
bun run script/check-workflows.ts
```

Relevant skills already used: `ce-explain`, `ce-work`, `ce-code-review`, `kilocode-merge-minimizer`, and `ce-handoff`. A future shipping pass may use `ce-code-review` before commit and `ce-commit`/`ce-commit-push-pr` only after explicit user request.
