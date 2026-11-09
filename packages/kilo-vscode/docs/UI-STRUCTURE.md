# UI Structure And Navigation

Agent navigation map for the Dustcode VS Code extension. Verified against the working tree on 2026-11-09, not a release inventory. Start with the task table, then read only the owning component, stylesheet, and relevant test. Source code takes precedence when this map drifts.

Jump to [Task Router](#task-router), [Chat Layout](#chat-layout), [State Ownership](#state-ownership), [Agent Manager](#agent-manager), [Other Surfaces](#other-surfaces), [Style Ownership](#style-ownership), or [Focused Verification](#focused-verification). Do not load every referenced file into context.

## Path Key

Paths are relative to `packages/kilo-vscode/`. Expand these prefixes before using file tools; they are documentation shorthand, not import aliases.

| Prefix | Directory |
|---|---|
| `W/` | `webview-ui/src/` |
| `C/` | `webview-ui/src/components/chat/` |
| `S/` | `webview-ui/src/styles/` |
| `A/` | `webview-ui/agent-manager/` |
| `D/` | `webview-ui/diff-viewer/` |
| `T/` | `tests/` |
| `K/` | `../kilo-ui/src/` |

## Task Router

| Change or symptom | Read first | Style owner / next stop |
|---|---|---|
| Chat regions, spacing, composer vs transcript height | `C/ChatView.tsx` | `S/chat-layout.css` |
| Scroll jumps, streaming follow, history paging, sticky prompt | `C/MessageList.tsx` | `S/chat-layout.css`; `W/context/transcript-rows.ts` |
| Wrong row type, missing/empty/internal prompt | `W/context/transcript-rows.ts` | `W/utils/transcript-parts.ts`; `C/TranscriptRow.tsx` |
| User bubble, clamp, Undo, editing | `C/VscodeUserMessage.tsx`; `C/UserMessageEditor.tsx` | `C/user-message.css`; `C/user-message-editor.css` |
| To-Dos attached to a user prompt | `C/todo/TurnTodos.tsx` | `S/todo-dock.css`; `C/VscodeUserMessage.tsx` |
| Assistant text, thinking, tool cards | `C/AssistantMessage.tsx`; `C/VscodeToolOverrides.tsx` | `S/tool-overrides.css`; `K/components/message-part.tsx` |
| Prompt history navigation rail | `C/PromptRail.tsx`; `C/prompt-rail.ts` | `S/prompt-rail.css`; `C/MessageList.tsx` |
| Search input, highlights, jump to result | `C/TranscriptSearch.tsx`; `W/context/transcript-search.tsx` | `C/TaskHeader.tsx`; `C/transcript-search-highlight.ts`; `S/task-header.css` |
| Composer editor, send/queue/stop, attachments | `C/PromptInput.tsx` | `S/prompt-input.css`; `W/utils/prompt-drafts.ts`; `W/utils/draft-store.ts` |
| Toolbar wrapping, folded actions, selector widths | `C/PromptSelectors.tsx`; `C/prompt-fold.ts`; `C/PromptOverflow.tsx` | `S/prompt-input.css`; `S/prompt-dropdowns.css` |
| Model popup, favorites, preview, keyboard selection | `W/components/shared/ModelSelector.tsx` | `S/model-selector.css`; `W/components/shared/model-selector-utils.ts` |
| Agent/reasoning selectors | `W/components/shared/ModeSwitcher.tsx`; `W/components/shared/ThinkingSelector.tsx` | `C/PromptSelectors.tsx`; `S/prompt-dropdowns.css` |
| Board icon, history, reset, expanded reader | `C/SwarmBoard.tsx` | `S/session-actions.css`; toolbar slot in `C/PromptInput.tsx` |
| Token button, context breakdown, timeline | `C/ContextUsagePanel.tsx` | `C/ContextProgress.tsx`; `C/TaskUsage.tsx`; `C/TaskTimeline.tsx`; `S/prompt-input.css` |
| Compact confirmation | `C/PromptInput.tsx` | Symbols `compactConfirm`, `canCompact`, `onCompact`; `S/prompt-input.css` |
| Sidebar chat tabs and right-click actions | `C/SessionTabStrip.tsx`; `C/SessionTabMenu.tsx` | `W/context/local-tabs.tsx`; `S/session-tabs.css` |
| Permission/question/suggestion interaction | `C/PermissionDock.tsx`; `C/QuestionDock.tsx`; `C/SuggestBar.tsx` | `S/permission-dock.css`; `S/question-dock.css`; `S/suggest-bar.css` |
| Changed-file summary above composer | `C/SessionChanges.tsx`; `C/session-review.ts` | `S/session-changes.css`; not the full diff renderer |
| Review lines, gutters, gap controls, Keep/Undo | `D/review-session-diff.tsx` | `D/review-session-diff.css`; `D/review-controller.ts` |
| Agent Manager shell, sidebar, split panels | `A/AgentManagerApp.tsx` | See Agent Manager map below |
| Settings/history/profile routing | `W/App.tsx` | See Other Surfaces below |
| Theme-wide colors or primitive appearance | `K/styles/vscode-bridge.css`; `K/styles/globals.css` | See Style Ownership below |

## Entry Points

| Surface | Entry and composition |
|---|---|
| Sidebar / Open in Tab | `W/index.tsx` -> `W/App.tsx` -> `C/ChatView.tsx` |
| Agent Manager | `A/index.tsx` -> `A/AgentManagerApp.tsx`; embeds the same `C/ChatView.tsx` |
| Dedicated review viewer | `D/index.tsx` -> `D/DiffViewerApp.tsx` |
| Provider boundary | `W/context/provider-shell.tsx`: `ProviderShell.Root`, `.Session`, `.Chat` |
| Host/webview boundary | `W/context/vscode.tsx`; contracts in `W/types/messages/`; extension handlers in `src/kilo-provider/` and `src/agent-manager/` |

This is SolidJS, not React. Follow existing signals, memos, effects, cleanup, and provider composition. Do not copy an entire provider chain into a feature.

`ProviderShell.Root` delegates to `W/context/provider-base.tsx` and `W/context/rich-provider.tsx` for theme, dialogs, VS Code/server, language, rich content, model providers, config, and display. `.Session` delegates to `W/context/provider-session.tsx` for session-scoped services. `.Chat` adds memory and feedback. Sidebar tabs also use `W/context/local-tabs.tsx`.

## Chat Layout

Conceptual tree; permission, readonly, pending-session, and prompt ownership guards decide which branches render.

```text
App / AgentManagerApp
  ChatView (.chat-view: flex column, min-height: 0)
    SessionTabStrip                  sidebar only, when applicable
    TaskHeader                       transcript search only
    .chat-messages-wrapper           flex: 1, constrained overflow
      MessageList (.message-list-container)
        .message-list               transcript scroll owner
          virtualized history + live rows -> TranscriptRowView
            VscodeUserMessage -> TurnTodos
            AssistantMessage -> rich text / tool renderers
        .message-list-sticky-prompt   outside scroller and virtualization
          VscodeUserMessage(sticky) -> TurnTodos(floating)
        PromptRail                   edge navigation overlay
    .chat-input                      non-scrolling composer region
      StartupErrorBanner / PermissionDock
      SessionChanges                 changed-file summary
      PromptInput
        editor / attachment context
        selectors + actions + Token + [Board, Compact] + send controls
```

### Layout Contracts

- Keep transcript scrolling in `.message-list`, not the outer webview. Preserve `min-height: 0` through flex ancestors.
- `MessageList` coordinates Virtua history, live-row handoff, per-session restoration, auto-follow, sticky prompt, and rail. For geometry bugs, inspect its measurement logic before changing row markup.
- Sticky prompts are absolute siblings of the scroller. Pinning, expanding their To-Dos, or opening toolbar overlays must not change transcript scroll height or the bottom anchor.
- Readable width/gutters belong to `.chat-view` in `S/chat-layout.css`: `--chat-readable-width`, `--chat-gutter`, `--chat-scrollbar-width`, `--prompt-gutter`. Avoid independent hardcoded widths on individual rows.
- User-message To-Dos are turn-scoped: `TurnTodos` reads the last completed `todowrite` in that user's turn, not the latest session-wide list. Transcript copies initially expand inline; sticky copies initially collapse and expand with absolute positioning, not a portal.
- `TaskHeader.tsx` is now a command-driven search mount, not the former title/usage dashboard. Existing class names in `S/task-header.css` do not prove that a header is rendered.
- `SessionDock.tsx` still exists for standalone stories/legacy composition but is not mounted by `ChatView`. Do not restore its reserved row to adjust the current toolbar. `todo-dock.css` now also owns `TurnTodos`, despite its older name.

### Toolbar And Menus

| Interaction | Owner and behavior |
|---|---|
| Token | `PromptInput` renders `.prompt-usage-popover`; `ChatView` supplies `ContextUsagePanel` and controlled open state. Portaled overlay, not an in-flow panel above the editor. |
| Board | `ChatView` owns `useSwarmBoard`; supplies `SwarmBoardButton` through `PromptInput.leadingAction`. Icon sits immediately before Compact in `.prompt-session-controls`. Nonempty eligible main-session board only; scope/read-only/child guards remain in `SwarmBoard`. |
| Compact | `PromptInput` opens `.compact-session-popover` with Yes/No. Only Yes calls `session.compact()`. Recheck eligibility and close on session change/ineligibility. Keyboard command uses the same confirmation. |
| Narrow toolbar | `prompt-fold.ts` budgets widths; `PromptOverflow` holds folded actions. Board/Compact occupy a pinned control group. Preserve the width reservation when adding actions. |
| Model picker | Compact opening expands the active model's preferred group, favoring Favorites. Search-clear must restore a visible selection; provider recovery must not override user navigation or reopen deliberately collapsed groups. Keep closed-popup catalog work disabled. |
| Chat-tab right click | Shared `SessionTabMenu`: New Session, Fork Session, Move to Worktree plus tab management. Actions target the clicked tab, not necessarily the active one. |
| Move to Worktree | Sidebar uses `continueInWorktree`; Agent Manager local tabs use project-scoped `agentManager.promoteSession`. Preserve pending/busy/submitting/git/project guards; do not interchange host contracts. |

The shared Popover portals content outside the trigger's ancestors. Styling `.chat-view .popup` will miss that content; target its own class or `data-component`/`data-slot`. Test Escape, outside click, focus behavior, viewport bounds, and unchanged composer geometry. Do not implement overlays as extra flex rows.

## State Ownership

| State | Start here | Boundary to preserve |
|---|---|---|
| Messages, parts, status, permissions, send/abort/compact | `W/context/session.tsx`; `W/context/session-types.ts` | Session IDs and directory/project routing; use existing methods, not a second UI store. |
| Transcript projection | `W/context/transcript-rows.ts`; `W/utils/transcript-parts.ts` | Message/part changes must update the projection; hidden internal prompts must not create blank turns. |
| Scroll/cache/live handoff | `C/MessageList.tsx`; `C/transcript-cache.ts`; `C/transcript-row-handoff.ts` | Per-session identity, measured geometry, history/live boundary. |
| Models and personalization | `W/context/provider.tsx`; `W/context/session-model-selector.ts`; `W/context/model-selection.ts` | Popup reconciliation must not call the explicit selection handler or silently clear settings. |
| Config / display preferences | `W/context/config.tsx`; `W/context/display.tsx` | Scope settings through existing contexts; do not introduce VS Code-wide settings for extension-only UX. |
| Host connection / capabilities | `W/context/server.tsx`; `W/context/vscode.tsx` | UI events use typed host messages; host and webview do not share runtime state. |
| Drafts and pending tabs | `W/utils/draft-store.ts`; `W/utils/prompt-drafts.ts`; `W/context/local-tabs.tsx` | Draft/tab identity and background sends must survive navigation. |
| Search | `W/context/transcript-search.tsx` | Search matching, virtual jumps, highlights, and focus restoration span several components. |
| Focus / jump routing | `W/utils/focus.ts`; handlers in `C/PromptInput.tsx`, `C/TaskHeader.tsx`, `C/MessageList.tsx` | Search exact events `focusPrompt`, `focusTranscriptSearch`, `scrollToMessage`; respect active panes, open overlays, and IME-safe Enter. |
| Text / locale / RTL | `W/context/language.tsx`; `W/context/language-bridge.tsx`; `W/i18n/en.ts` | Reuse translation keys; new English keys need other locales. Language can set document direction. |

## Agent Manager

Agent Manager has its own shell and tab state; do not modify sidebar `local-tabs` to fix its tabs. Start in `A/AgentManagerApp.tsx`, then follow the specific owner instead of reading that entire file.

| Area | Owner | Important boundary |
|---|---|---|
| Composition and layout | `A/index.tsx`; `A/AgentManagerApp.tsx` | Shared chat embedded in project/worktree-aware providers. |
| Main toolbar / tab chrome | `A/TabBar.tsx`; `A/tab-rendering.tsx`; `A/sortable-tab.tsx`; `C/SessionTabMenu.tsx` | Clicked tab/session and project scope; readonly/setup guards. Shared bulk-close logic: `W/utils/tab-close.ts`. |
| Project sidebar | `A/ProjectList.tsx`; `A/ProjectsSection.tsx`; `A/ProjectSidebarBody.tsx` | Project search, accordion, local/pinned/ungrouped/section rows. Expanded background projects render their own data. |
| Worktree / section row | `A/WorktreeItem.tsx`; `A/SectionHeader.tsx`; `A/section-dnd.ts` | Pinning preserves section membership; moving to a different section unpins. Health `unavailable` is unknown, not proof a worktree is stale. |
| New/import worktree / Apply | `A/NewWorktreeDialog.tsx`; `A/ApplyDialog.tsx`; `A/apply-to-local.tsx` | `A/ProjectActions.tsx` primary + opens configuration; quick-create is a distinct dropdown action. |
| Side-panel identity | `A/side-panel-state.ts` | Diff/PR/Terminal/Documents belong to worktree; Subagents/EditPreview/Browser belong to session. Keys include project. |
| Changes / fullscreen review | `A/DiffPanel.tsx`; `A/DiffPanelCache.tsx`; `D/FullScreenDiffView.tsx` | Bounded project cache, lazy detail activation, shared review renderer. |
| Review scope / PR | `A/diff-scope-state.ts`; `A/pr/PRPanel.tsx` | Branch/Staged/Unstaged/Session scopes differ in revert/Apply eligibility. |
| Subagents / Browser / Documents | `A/SubagentPanel.tsx`; `A/BrowserPanel.tsx`; `A/documents/DocumentPanelHost.tsx` | Child chat has a separate session provider and readonly behavior; do not change parent selection. |
| Terminal lifecycle / visibility | `A/terminal/state.ts`; `A/terminal/render.tsx`; `A/terminal/TerminalTab.tsx` | Keep xterm mounted; offscreen translation rather than `display: none` preserves FitAddon measurements. |
| Per-project state / restore | `A/project/store.ts`; `A/project/registry.ts`; `A/project/selection.ts` | Project identity is part of every shared key; IDs such as `local` collide across projects. |
| Keyboard / focus | `A/shortcuts.ts`; `A/focus.ts`; `A/diff-panel-focus.ts` | Preserve panel-aware focus and navigation rather than adding global shortcuts. |

Agent Manager styles start in `A/agent-manager.css` (sidebar, sections, tabs, layout, terminals, dialogs). Review rules span both that file and `A/agent-manager-review.css`; PR-specific rules live in `A/pr/pr-panel.css`. Browser surface code/styles live in `webview-ui/browser/`.

## Other Surfaces

`W/App.tsx` routes settings, history, profile, migration, and readonly subagent chat. The VS Code host can open dedicated panels or hide the in-webview top bar; inspect `KILO_TOP_BAR` handling before adding a duplicate toolbar.

| Surface | Component / state owner | Style / UX boundary |
|---|---|---|
| Settings | `W/components/settings/Settings.tsx` | `S/settings.css`; lazy tabs and host/feature gating. Agent Manager's project-targeted settings are inline here, not in `A/`. |
| Settings search | `W/components/settings/settings-search.ts`; `W/components/settings/useSettingsSearch.ts` | Derives entries from i18n keys and group mapping; hidden tabs must not leak into search. Preserve Save/Discard and running-agent confirmation. |
| Agent behavior settings | `W/components/settings/AgentBehaviourTab.tsx` | Agents, MCP, Rules, Workflows, Skills; choose the owning subview rather than the whole settings shell. |
| History | `W/components/history/HistoryView.tsx`; `W/components/history/SessionList.tsx`; `W/components/history/CloudSessionList.tsx` | `S/history.css`; local/cloud/worktree sources have different retrieval/actions. `A/SessionRowActions.tsx` is history-only. |
| Profile / provider usage | `W/components/profile/ProfileView.tsx`; `W/components/profile/ProviderUsageCards.tsx` | Kilo-ui plus current inline profile layout; usage rules in `S/provider-usage.css`. There is no dedicated `profile.css`. |
| Welcome account switcher | `W/components/shared/AccountSwitcher.tsx` | Mounted by `C/MessageList.tsx` welcome header; `S/welcome.css`, not just the Profile screen. |

## Style Ownership

Read the owning CSS rule, not every stylesheet. Import/re-export order matters:

```text
@kilocode/kilo-ui/styles -> K/styles/index.css
  upstream @opencode-ai/ui styles
  K/styles/globals.css + K/components/*.css + K/styles/vscode-bridge.css
extension W/App.tsx -> S/chat.css -> focused feature stylesheets
Agent Manager / diff entrypoints -> their own surface styles
feature-local imports -> e.g. C/user-message.css
```

- Extension-only layout belongs in the feature's stylesheet. Reusable primitives belong in `K/`; `../ui/` is shared upstream and a last resort.
- Use deep imports from `@kilocode/kilo-ui`. Some components re-export upstream implementations: follow the export before assuming kilo-ui owns the DOM or behavior. `K/components/icon.tsx` extends the upstream icon registry.
- Primitive selectors use `[data-component]` and `[data-slot]`; their absence can explain unstyled controls even when class names look correct.
- Prefer semantic tokens (`--background-base`, `--surface-raised-base`, `--text-base`, `--text-weak`, `--border-weak-base`) and `--kilo-font-size-*`. `K/styles/vscode-bridge.css` connects these to host `--vscode-*` variables.
- Check body theme classes `vscode-light`, `vscode-dark`, `vscode-high-contrast`, `vscode-high-contrast-light`. Ordinary light overrides must not replace high-contrast borders. Theme switching must update already-mounted content.
- For RTL positioning use logical insets/margins. Review gap slots must remain absolutely positioned outside gutter intrinsic sizing; validate against the visible pane, not just their own offscreen wrapper.
- For expensive diffs preserve patch/hunk-bounded rendering and existing deferred mount/cache policy. Do not replace it with eager complete-file parsing to simplify layout.

## Focused Verification

Paths below use `T/` from the path key. These are check locations, not a claim that every legacy suite currently passes.

| Area | Relevant checks |
|---|---|
| Chat geometry, sticky prompt, To-Dos, tab menu, Compact/Token | `T/chat-prompt-browser.test.ts`; fixture `T/fixtures/chat-prompt-browser.tsx` |
| Scrolling / virtual transcript | `T/chat-auto-scroll.spec.ts`; `T/unit/transcript-rows-reactivity.test.ts`; `T/unit/transcript-row-handoff.test.ts`; `T/unit/transcript-cache.test.ts` |
| Prompt rail | `T/prompt-rail.spec.ts`; `T/unit/prompt-rail.test.ts` |
| Composer layout, selectors, editing | `T/prompt-spacing.spec.ts`; `T/reasoning-efforts.spec.ts`; `T/user-message-editor.test.ts`; `T/unit/prompt-fold.test.ts` |
| Model selection | `T/model-selector-accessibility.spec.ts`; `T/unit/model-selector-lifecycle.test.ts`; `T/unit/model-selector-utils.test.ts` |
| Board / Token | `T/swarm-board.spec.ts`; `T/context-usage.spec.ts` |
| Review / diff | `T/diff-scroll-preservation.spec.ts`; `T/unit/review-session-diff-render.test.ts` |
| Accessibility / themes | `T/accessibility.spec.ts`; `T/settings-accessibility.spec.ts`; `T/history-accessibility.spec.ts` |
| Tabs / layout architecture | `T/unit/local-tabs.test.ts`; `T/unit/agent-manager-arch.test.ts`; `T/unit/session-dock.test.ts` |
| Agent Manager project / inspector state | `T/unit/project-store.test.ts`; `T/unit/section-helpers.test.ts`; `T/unit/side-panel-state.test.ts` |
| Terminal / review scope | `T/unit/agent-manager-terminal-state.test.ts`; `T/unit/agent-manager-diff-scope-state.test.ts` |
| Settings data / search | `T/unit/settings-io.test.ts`; `T/unit/settings-search.test.ts` |

Run from `packages/kilo-vscode/`, never root `bun test`:

```sh
bun test tests/chat-prompt-browser.test.ts
bun run test:visual tests/context-usage.spec.ts tests/swarm-board.spec.ts --workers 1
bun run typecheck
bun run lint
bun run check-kilocode-change
bun run knip
bun run compile
```

Choose the relevant test, not this whole list for every edit. `compile` covers host/webview types, lint, and bundle integration. Package instructions in [AGENTS.md](../AGENTS.md) define additional guards.

Story sources: `W/stories/chat.stories.tsx`, `W/stories/shared.stories.tsx`, `W/stories/agent-manager.stories.tsx`, `W/stories/settings.stories.tsx`, `W/stories/history.stories.tsx`, `W/stories/profile.stories.tsx`; context setup in `W/stories/StoryProviders.tsx`. Some stories render retained standalone components rather than current `ChatView`; verify the mount path before treating a screenshot as the production layout.

`playwright.config.ts` serves a static Storybook build on port 6007 and may reuse a running server. Rebuild/restart stale servers after source changes. `.storybook/preview.tsx` sets theme globals; use Light/Dark/HC Light/HC Dark, narrow/desktop widths, and RTL when affected. Set RTL after language initialization before measuring.

## Keep Searches Small

1. Pick the Task Router row. Open the component and its style owner only.
2. If geometry is wrong, inspect the parent scroll/flex/portal boundary before changing the child.
3. If data is wrong, follow the listed context and typed host contract, not unrelated screens.
4. Search exact symbols/classes within that directory; expand to imports/callers only when ownership is unclear. Avoid reading all of `PromptInput`, `MessageList`, or `AgentManagerApp` for a localized change.
5. Update this map when ownership, mount paths, or UX contracts change. Keep implementation detail in code/tests, not a second exhaustive component catalog.
