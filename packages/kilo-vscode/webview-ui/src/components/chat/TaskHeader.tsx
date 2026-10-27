/**
 * TaskHeader component
 * Sticky header above the chat messages showing session title,
 * cost, context usage, and a compact button.
 * Todo progress lives in the session dock (see TodoChip).
 *
 * Context usage details are available from the composer action near the input.
 */

import { Component, For, Show, createMemo, createSignal, createEffect, on, onCleanup } from "solid-js"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { useSession } from "../../context/session"
import { collapseCostBreakdown, sessionCost } from "../../context/session-utils"
import { useLanguage } from "../../context/language"
import { TranscriptSearch } from "./TranscriptSearch"
import { useTranscriptSearch } from "../../context/transcript-search"
import { sessionModel } from "../../context/model-usage"
import { useProvider } from "../../context/provider"
import { buildTriggerLabel, sanitizeName } from "../shared/model-selector-utils"
import { SessionRenameEditor } from "../shared/SessionRenameEditor"

interface TaskHeaderProps {
  readonly?: boolean
}

export const TaskHeader: Component<TaskHeaderProps> = (props) => {
  const session = useSession()
  const language = useLanguage()
  const search = useTranscriptSearch()

  const title = createMemo(() => session.currentSession()?.title ?? language.t("command.session.new"))
  const canRename = createMemo(() => !props.readonly && !!session.currentSession())
  const hasMessages = createMemo(() => session.messages().length > 0)
  const busy = createMemo(() => session.status() === "busy")
  const canCompact = createMemo(() => !busy() && session.visibleMessages().length > 0 && !!session.selected())

  const money = createMemo(() => new Intl.NumberFormat(language.locale(), { style: "currency", currency: "USD" }))
  const fmt = (n: number) => money().format(n)

  const breakdown = () => session.costBreakdown()
  const total = createMemo(() => sessionCost(breakdown(), session.currentSession(), session.modelUsage()))

  const cost = createMemo(() => {
    const value = total().total
    if (value === 0) return undefined
    return fmt(value)
  })

  const costTooltip = createMemo(() => {
    const items = breakdown()
    if (items.length <= 1 || total().partial) return <span>{language.t("context.usage.sessionCost")}</span>
    const collapsed = collapseCostBreakdown(items, (n) =>
      language.t("context.usage.olderSessions", { count: String(n) }),
    )
    return (
      <div style={{ "text-align": "left", "white-space": "nowrap" }}>
        <For each={collapsed}>{(e) => <div>{`${e.label}: ${fmt(e.cost)}`}</div>}</For>
      </div>
    )
  })

  const context = createMemo(() => {
    const usage = session.contextUsage()
    if (!usage) return undefined
    const tokens = usage.tokens.toLocaleString(language.locale())
    const pct = usage.percentage !== null ? `${usage.percentage}%` : undefined
    return { tokens, pct }
  })

  // Subagents run with their own model and reasoning effort, so show them in the header.
  // Subagent viewers are read-only and may not have the child session info loaded.
  const provider = useProvider()
  const model = createMemo(() => {
    if (!props.readonly && !session.currentSession()?.parentID) return undefined
    const sel = sessionModel(session.messages())
    if (!sel) return undefined
    const info = provider.findModel(sel)
    const name = buildTriggerLabel(info && sanitizeName(info.name), sel.providerID, sel, false, "", true, {
      select: language.t("dialog.model.select.title"),
      noProviders: language.t("dialog.model.noProviders"),
      notSet: language.t("dialog.model.notSet"),
    })
    const variant = sel.variant ? sel.variant.charAt(0).toUpperCase() + sel.variant.slice(1) : undefined
    return { name, variant, id: `${sel.providerID}/${sel.modelID}` }
  })

  // "Dustcode: Toggle Chat Search" (Command Palette) toggles the search
  // bar from here rather than TranscriptSearch.tsx itself: that component
  // only mounts once search.active() is already true (it's behind a
  // <Show>), so it can never be what turns search on in the first place —
  // and it also wouldn't exist anymore to react to a request to close it.
  // TaskHeader is mounted the whole time there's an active chat, so it's
  // the right place to react to the external toggle request.
  const toggleSearch = () => (search.active() ? search.closeSearch() : search.setActive(true))
  window.addEventListener("focusTranscriptSearch", toggleSearch)
  onCleanup(() => window.removeEventListener("focusTranscriptSearch", toggleSearch))

  // Whenever search closes via an explicit user action — the header toggle
  // button, the command palette toggle above, the search bar's own "X", or
  // Escape — send focus back to the chat input rather than leaving it
  // stranded on whatever control was just clicked/removed. Watches
  // `closeSignal` rather than `active()` transitions so that MessageList
  // silently resetting the widget on a session/tab change (which also
  // flips `active()` false) can't trigger this same aggressive restore and
  // steal focus back from the tab strip's own focus handling. `defer: true`
  // skips the initial run so mounting doesn't immediately steal focus.
  createEffect(
    on(
      () => search.closeSignal(),
      () => {
        window.dispatchEvent(new CustomEvent("focusPrompt", { detail: { restore: true } }))
      },
      { defer: true },
    ),
  )

  const [renaming, setRenaming] = createSignal<{ id: string; title: string }>()

  const startRename = () => {
    if (props.readonly) return
    const info = session.currentSession()
    if (!info) return
    setRenaming({ id: info.id, title: info.title ?? "" })
  }

  const commitRename = (title: string) => {
    const info = renaming()
    if (!info) return
    setRenaming(undefined)
    if (title === info.title) return
    session.renameSession(info.id, title)
  }

  const cancelRename = () => {
    setRenaming(undefined)
  }

  createEffect(() => {
    const info = renaming()
    if (info && session.currentSession()?.id !== info.id) setRenaming(undefined)
  })

  return (
    <Show when={hasMessages()}>
      <div data-component="task-header">
        <div data-slot="task-header-title">
          <Show
            when={!renaming()}
            fallback={
              <SessionRenameEditor
                title={renaming()?.title ?? ""}
                autosize
                onSave={commitRename}
                onCancel={cancelRename}
              />
            }
          >
            <span
              data-slot="task-header-title-trigger"
              data-renamable={canRename() ? "" : undefined}
              title={canRename() ? language.t("agentManager.worktree.doubleClickRename") : title()}
              tabIndex={canRename() ? 0 : undefined}
              role={canRename() ? "button" : undefined}
              onDblClick={startRename}
              onKeyDown={(e) => {
                if (!canRename() || (e.key !== "Enter" && e.key !== " ")) return
                e.preventDefault()
                startRename()
              }}
            >
              <span data-slot="task-header-title-label" dir="auto">
                {title()}
              </span>
            </span>
          </Show>
        </div>
        <Show when={model()}>
          {(m) => (
            <Tooltip
              class="task-header-model"
              value={
                <div style={{ "text-align": "left", "white-space": "nowrap" }}>
                  <div>{m().id}</div>
                  <Show when={m().variant}>
                    <div>{`${language.t("prompt.thinking.tooltip")}: ${m().variant}`}</div>
                  </Show>
                </div>
              }
              placement="bottom"
            >
              <span data-slot="task-header-model-name">{m().name}</span>
              <Show when={m().variant}>
                <span data-slot="task-header-model-variant">{m().variant}</span>
              </Show>
            </Tooltip>
          )}
        </Show>
        <div data-slot="task-header-stats">
          <Show when={cost()}>
            {(c) => (
              <Tooltip value={costTooltip()} placement="bottom">
                <span>{c()}</span>
              </Tooltip>
            )}
          </Show>
          <Show when={context()}>
            {(ctx) => (
              <Tooltip
                value={ctx().pct ? `${ctx().tokens} tokens (${ctx().pct} of context)` : `${ctx().tokens} tokens`}
                placement="bottom"
              >
                <span>{ctx().pct ?? ctx().tokens}</span>
              </Tooltip>
            )}
          </Show>
          <Show when={!props.readonly}>
            <Tooltip value={language.t("command.session.compact")} placement="bottom">
              <IconButton
                icon="compress"
                size="small"
                variant="ghost"
                disabled={!canCompact()}
                onClick={() => session.compact()}
                aria-label={language.t("command.session.compact")}
              />
            </Tooltip>
          </Show>
          <Show when={hasMessages()}>
            <Tooltip value={language.t("chat.search.toggle")} placement="bottom">
              <IconButton
                icon="magnifying-glass"
                size="small"
                variant="ghost"
                class="task-header-search-toggle"
                data-active={search.active() ? "" : undefined}
                onClick={toggleSearch}
                aria-label={language.t("chat.search.toggle")}
                aria-pressed={search.active()}
              />
            </Tooltip>
          </Show>
        </div>
      </div>
      {/* Standalone search bar, directly under the header, so it has room for
          the VS Code–style inline options and doesn't require the timeline
          to be expanded. */}
      <Show when={search.active()}>
        <div data-component="task-header-search">
          <TranscriptSearch />
        </div>
      </Show>
    </Show>
  )
}
