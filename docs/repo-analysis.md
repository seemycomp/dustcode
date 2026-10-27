---
title: "Dustcode repository analysis"
generated_at: "2026-10-25T12:47:24Z"
repository: "seemycomp/dustcode"
branch: "main"
head: "fa345665f0f250801c2d9b93dec00be3b858b86a"
purpose: "Token-efficient orientation for future agents"
---

# Dustcode Repository Analysis

## Read This First

This repository is **Dustcode**, a VS Code-only fork of Kilo Code. It ships a
VS Code extension plus its bundled local backend; it is not currently a
standalone CLI, JetBrains plugin, desktop app, or cloud product.

Authoritative product scope:

- `README.md:3-14` describes the product and supported features.
- `README.md:18-24` defines VSIX installation, `dustcode.*` settings/commands,
  `.dustcode/` project state, and isolated user state.
- `RELEASING.md:1-18` defines manual VSIX distribution.
- `RELEASING.md:20-33` defines active CI artifacts and explicitly says there
  is no publishing pipeline.
- `packages/kilo-vscode/package.json:1-58` identifies the extension as
  `dustcode.dustcode`, version `7.8.17`.

The tree contains upstream-derived products and names. Do not infer release
scope from directory existence or inherited package names such as
`@kilocode/cli` and `@opencode-ai/core`.

## Architecture At A Glance

```text
SolidJS webview (chat/settings/Agent Manager)
        │ vscode.Webview.postMessage()
        ▼
VS Code extension host
  KiloProvider + commands + Agent Manager
        │ shared KiloConnectionService
        ▼
bundled kilo serve --port 0
  local HTTP API + SSE + agent runtime
        │
        ├─ SessionPrompt / SessionProcessor
        ├─ model providers (Vercel AI SDK and integrations)
        ├─ tools / permissions / sandbox / MCP / plugins
        ├─ SQLite + Drizzle + Effect services
        └─ durable events → SSE clients
```

Main transport and lifecycle references:

- `packages/kilo-vscode/src/extension.ts:90-105`: one shared
  `KiloConnectionService` per extension host.
- `packages/kilo-vscode/src/services/cli-backend/server-manager.ts:59-175`:
  lazy backend startup, startup coalescing, random Basic Auth password,
  bundled CLI process, environment setup, parent PID watchdog.
- `packages/kilo-vscode/src/services/cli-backend/connection-service.ts:959-1024`:
  reset stale client, create SDK client, wire SSE state/events, reconnect/error
  handling.
- `packages/kilo-vscode/webview-ui/src/context/vscode.tsx:47-124`: typed
  webview-to-host message bridge, persisted webview state and cleanup.
- `packages/kilo-vscode/webview-ui/src/context/provider-shell.tsx:1-16`:
  SolidJS provider composition (`Root`, `Session`, `Chat`).

## Backend Request Flow

```text
SDK/client
  → Effect HttpApi session handler
  → SessionPrompt queue and prompt preparation
  → context/history/instructions/tools
  → SessionProcessor
  → LLM streamText/provider
  → tool permission/sandbox/plugin/MCP hooks
  → next model turn, compaction, abort, or completion
  → messages/parts/events/persistence
  → SSE → extension → webview
```

Evidence:

- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:327-393`:
  typed `HttpApi` prompt and `prompt_async` handlers, attachment validation,
  async fork, error event publication.
- `packages/opencode/src/session/prompt.ts:1766-1872`: prompt orchestration,
  history/context/tool preparation and processor entry.
- `packages/opencode/src/session/llm.ts:345-405`: model streaming path and
  provider options.
- `packages/opencode/src/session/tools.ts:176-221`: tool registry and
  execution hooks.
- `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`:
  SSE event stream and directory filtering.

This is a stateful AI agent runtime, not merely an LLM proxy.

## Persistence And Event Model

Current inspected code uses SQLite with Drizzle and Effect:

- `packages/core/src/database/database.ts:16-47`: database service layer,
  WAL, busy timeout, foreign keys, migrations and compatibility handling.
- `packages/core/src/database/database.ts:50-75`: database path selection,
  channel-specific names and `KILO_DB` override.
- `packages/opencode/src/storage/db.ts:97-120`: legacy/CLI database client,
  SQLite initialization and migration path.

Important documentation drift: `packages/opencode/AGENTS.md` still has a
storage section describing filesystem JSON storage and an older Hono server.
The current inspected session path uses SQLite and Effect `HttpApi` handlers.
Treat source and current tests as authoritative; check other routes before
generalizing the statement to every legacy subsystem.

## Agent Manager

Agent Manager is an extension feature, not a separate backend product.

- `packages/kilo-vscode/src/agent-manager/AgentManagerProvider.ts:967-1032`:
  creates Git worktrees and starts sessions using the shared SDK client with
  `directory: worktreePath`.
- `packages/kilo-vscode/src/agent-manager/project/route.ts:45-120`:
  project/session/worktree route ownership, generation invalidation and
  ambiguity-safe raw session lookup.
- `packages/kilo-vscode/tests/unit/agent-project-route.test.ts:4-117`:
  route tests cover unknown/stale projects, duplicate raw session IDs and
  cleanup; last targeted run was **13 passed, 0 failed**.

Critical distinction:

- Git worktrees isolate checkout, branch and directory-scoped state.
- They do **not** start one `kilo serve` process per session.
- They are not a complete security boundary. Tools, plugins, MCP and browser
  activity still need the configured permissions/sandbox/trust model.

## UI And Diff Performance

`packages/kilo-ui` is partly its own Kilo component layer and partly an adapter
over upstream UI:

- `packages/kilo-ui/src/components/button.tsx:1` re-exports upstream Button.
- `packages/kilo-ui/src/styles/index.css:1-52` imports upstream styles, then
  Kilo globals/component overrides and the VS Code variable bridge.
- `packages/kilo-ui/src/components/diff.tsx:51-134` shares one
  `IntersectionObserver`, defers offscreen diff rendering and enforces a
  per-frame budget.

When changing diff/review scheduling, verify both rapid session switching and
fast scrolling. Moving work from one path to the other is not automatically an
optimization.

## Package Map

| Path | Role |
|---|---|
| `packages/kilo-vscode/` | VS Code host, webview, Agent Manager, packaging |
| `packages/opencode/` | Bundled CLI/backend, HTTP API, sessions, tools, providers |
| `packages/core/` | Effect services, database, domain/runtime foundations |
| `packages/server/` | Server-side shared package using core/protocol |
| `packages/sdk/js/` | Generated client/transport boundary; do not hand-edit generated sources |
| `packages/kilo-ui/` | SolidJS/Kilo UI components, theme, diff/markdown |
| `packages/plugin/` | Plugin and custom-tool contracts/hooks |
| `packages/kilo-gateway/` | Auth and external Kilo provider routing |
| `packages/kilo-sandbox/` | Sandbox implementation and tests |
| `packages/kilo-memory/` | Memory-related runtime features |
| `packages/kilo-indexing/` | Indexing-related runtime features |
| `script/` | Build, architecture, workflow and CI checks |
| `.github/workflows/` | Active `test-vscode.yml` and `codeql.yml` only |

## Build, Test And CI

Root `package.json:7-30` pins Bun `1.4.4`, defines the workspace and explicitly
rejects root `bun test`.

Recommended checks for extension/backend work:

```sh
bun install --frozen-lockfile
bun run typecheck:vscode
bun run test:vscode
bun run build:vscode
```

Useful focused commands:

```sh
bun run check:architecture
bun run script/check-workflows.ts
bun run --cwd packages/kilo-vscode test:unit
```

For the focused route test, run `bun test ./tests/unit/agent-project-route.test.ts`
from `packages/kilo-vscode/`. The checks above are run from the repository root.

Observed in this analysis:

- `bun run check:architecture` → pass, 6 classified Kilo ratchet sites,
  0 boundary violations.
- `bun run script/check-workflows.ts` → pass, 2 active workflows.
- `bun test ./tests/unit/agent-project-route.test.ts` from
  `packages/kilo-vscode` → 13 pass, 0 fail.
- Branding CI test for Dustcode identity → 1 pass, 0 fail.

Active CI: `.github/workflows/test-vscode.yml:25-73` checks architecture,
SDK, typecheck, lint, extension tests, core/sandbox tests, and selected
backend test suites. `.github/workflows/test-vscode.yml:75-143` packages Linux
x64, macOS x64/arm64 and Windows x64 VSIX artifacts, then scans them with Syft.
There is no active publish job.

## Security Model

`SECURITY.md:9-23` is the authoritative high-level warning:

- shell, file, web and external integration tools are powerful;
- permission prompts are not a security isolation boundary;
- OS sandboxing only covers supported operations;
- MCP servers, plugins, browser activity and provider handling are outside
  complete local trust control;
- use a container or VM for stronger isolation.

The extension backend uses a generated local Basic Auth password. This protects
the loopback HTTP server from casual unauthorized access; it does not turn the
agent into a sandboxed process.

## Maintenance Risks

These are architectural risk areas, not confirmed defects:

1. **Shared backend lifecycle:** one process serves several UI surfaces; restart,
   global config or global service state can affect multiple sessions.
2. **Directory/project routing:** asynchronous Agent Manager events must retain
   project, generation and directory ownership; never resolve an ambiguous raw
   session ID to an arbitrary project.
3. **SSE and webview ordering:** cached messages, reconnects, remounts and
   request/reply retries can create timing regressions.
4. **Upstream coupling:** `kilo-ui` re-exports upstream primitives and imports
   upstream CSS, so dependency upgrades can alter behavior indirectly.
5. **Large diffs and many worktrees:** Git polling, review rendering and
   virtualization need measured performance changes.
6. **Documentation drift:** inherited `AGENTS.md` sections can describe an
   older architecture; validate claims against current source and active CI.

## Suggested Reading Order

1. `README.md`, `RELEASING.md`, `SECURITY.md` for product scope and trust model.
2. `packages/kilo-vscode/AGENTS.md` for extension architecture and file map.
3. `packages/kilo-vscode/src/extension.ts` and `src/services/cli-backend/` for
   activation and backend lifecycle.
4. `packages/kilo-vscode/src/KiloProvider.ts` and
   `webview-ui/src/context/` for host/webview messaging.
5. `packages/kilo-vscode/src/agent-manager/` and its route tests for worktree
   and multi-project behavior.
6. `packages/opencode/src/server/routes/instance/httpapi/` for API contracts.
7. `packages/opencode/src/session/` for prompt, LLM and tools orchestration.
8. `packages/core/src/database/` and event services for persistence semantics.
9. `packages/kilo-ui/` for shared components and diff performance.

## Scope And Limitations

This document is a static architecture survey at commit
`fa345665f0f250801c2d9b93dec00be3b858b86a`. It did not run a full typecheck,
full extension build, full backend test suite or VS Code integration tests. It
does not exhaustively trace every provider, MCP transport, migration or legacy
route. The two untracked files `test_1.txt` and `test_2.txt` existed before
this document was created and were intentionally left untouched.
