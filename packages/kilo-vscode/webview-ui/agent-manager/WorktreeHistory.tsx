import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
  type ParentProps,
} from "solid-js"
import { Virtualizer, type VirtualizerHandle } from "virtua/solid"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { useVSCode } from "../src/context/vscode"
import { useLanguage } from "../src/context/language"
import { formatRelativeDate } from "../src/utils/date"
import type { HistoryRow } from "../../src/shared/agent-history"
import type { ProjectStore } from "./project/store"
import { HistorySessionMenu, type HistoryMenuActions } from "./HistorySessionMenu"
import { label, type Activity } from "../src/utils/session-activity"
import { ActivityIcon } from "../src/components/shared/ActivityIcon"

const HEIGHT = 28

/** The header's selection/drag activator is a sibling of every history control. */
export function WorktreeHistory(
  props: ParentProps<{
    store: ProjectStore
    worktreeId: string | null
    label: string
    clock: () => number
    active: (id: string) => boolean
    disabled?: boolean
    git?: boolean
    activity?: (id: string) => Activity
    actions?: HistoryMenuActions
  }>,
) {
  const vscode = useVSCode()
  const { t, locale } = useLanguage()
  const id = createUniqueId()
  const history = props.store.history.context(props.worktreeId)
  const expanded = createMemo(
    () => !props.disabled && props.store.historyInitialized() && props.store.historyOpen(props.worktreeId ?? "local"),
  )
  const page = history.current
  const rows = () => page().data.rows
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  const [target, setTarget] = createSignal<string>()
  let virtual: VirtualizerHandle | undefined
  let input: HTMLInputElement | undefined
  let search: HTMLButtonElement | undefined
  const toggle = (value: boolean) => {
    props.store.setHistoryExpanded((prev) => ({ ...prev, [props.worktreeId ?? "local"]: value }))
    props.store.setHistoryInitialized(true)
    vscode.postMessage({
      type: "agentManager.setHistoryExpanded",
      projectId: props.store.id,
      worktreeId: props.worktreeId,
      expanded: value,
    })
  }
  createEffect(() => {
    if (!expanded()) return
    const detach = untrack(() => history.attach(vscode.postMessage))
    onCleanup(detach)
  })
  const focus = (index: number) => {
    const row = rows().at(index)
    if (!row) return
    page().focus = row.id
    setTarget(row.id)
    virtual?.scrollToIndex(index, { align: "nearest" })
    if (!virtual) {
      const el = scroller()
      if (el) el.scrollTop = index * HEIGHT
    }
  }
  const navigate = (event: KeyboardEvent, id: string) => {
    const index = rows().findIndex((row) => row.id === id)
    const next =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? rows().length - 1
              : event.key === "PageDown"
                ? Math.min(rows().length - 1, index + 6)
                : event.key === "PageUp"
                  ? Math.max(0, index - 6)
                  : undefined
    if (next === undefined || next < 0 || next >= rows().length) return
    event.preventDefault()
    focus(next)
  }
  createEffect(() => {
    const value = page()
    const el = scroller()
    if (!el) return
    const restore = requestAnimationFrame(() => {
      el.scrollTop = value.scroll
    })
    onCleanup(() => cancelAnimationFrame(restore))
  })
  const more = () => history.request({ more: true })
  const row = (item: HistoryRow) => (
    <HistorySessionMenu
      store={props.store}
      worktreeId={props.worktreeId}
      sessionId={item.id}
      git={props.git}
      disabled={props.disabled}
      activity={props.activity?.(item.id)}
      actions={props.actions}
      onOpen={() => history.open(item.id)}
    >
      <Button
        ref={(el: HTMLButtonElement) =>
          createEffect(() => {
            if (target() !== item.id) return
            // Virtual rows can mount after scrollToIndex's layout turn.
            requestAnimationFrame(() => {
              if (!el.isConnected || target() !== item.id) return
              el.focus({ preventScroll: true })
              el.scrollIntoView({ block: "nearest" })
              setTarget(undefined)
            })
          })
        }
        class="am-history-row"
        variant="ghost"
        size="small"
        data-history-session={item.id}
        tabIndex={page().focus === item.id ? 0 : -1}
        aria-current={props.active(item.id) ? "page" : undefined}
        title={`${item.title || t("agentManager.session.untitled")}\n${new Date(item.updatedAt).toLocaleString(locale())}`}
        onFocus={() => {
          page().focus = item.id
        }}
        onClick={() => history.open(item.id)}
        onKeyDown={(event: KeyboardEvent) => navigate(event, item.id)}
      >
        <Show when={props.activity?.(item.id) && props.activity?.(item.id) !== "idle"}>
          <span
            class="am-history-status am-local-status"
            data-activity={props.activity?.(item.id)}
            aria-label={t(label(props.activity?.(item.id) ?? "idle"))}
          >
            <ActivityIcon state={props.activity?.(item.id) ?? "idle"} />
          </span>
        </Show>
        <span class="am-history-title" dir="auto">
          {item.title || t("agentManager.session.untitled")}
        </span>
        <time class="am-history-time" dateTime={item.updatedAt}>
          {(() => {
            props.clock()
            return formatRelativeDate(item.updatedAt)
          })()}
        </time>
      </Button>
    </HistorySessionMenu>
  )
  return (
    <div class="am-history-context" data-history-context={`${props.store.id}:${props.worktreeId ?? "local"}`}>
      <div class="am-history-header">
        <IconButton
          class="am-history-disclosure"
          icon={expanded() ? "chevron-down" : "chevron-right"}
          size="small"
          variant="ghost"
          disabled={props.disabled}
          aria-label={t("agentManager.history.toggle", { context: props.label })}
          aria-expanded={expanded()}
          aria-controls={id}
          onClick={() => toggle(!expanded())}
        />
        <div class="am-history-card">{props.children}</div>
      </div>
      <Show when={expanded() || page().data.loaded}>
        <section
          id={id}
          class="am-history"
          hidden={!expanded()}
          aria-hidden={!expanded()}
          aria-label={t("agentManager.history.label", { context: props.label })}
        >
          <div class="am-history-tools">
            <Show
              when={history.searching()}
              fallback={<span class="am-history-caption">{t("agentManager.history.title")}</span>}
            >
              <TextField
                ref={(el: HTMLInputElement) => {
                  input = el
                  queueMicrotask(() => el.focus())
                }}
                class="am-history-input"
                label={t("agentManager.history.search", { context: props.label })}
                hideLabel
                placeholder={t("agentManager.history.placeholder")}
                value={history.text()}
                onChange={history.input}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key !== "Escape") return
                  event.preventDefault()
                  event.stopPropagation()
                  history.clear()
                  search?.focus()
                }}
              />
            </Show>
            <IconButton
              ref={search}
              icon="magnifying-glass"
              size="small"
              variant="ghost"
              aria-label={t("agentManager.history.search", { context: props.label })}
              aria-expanded={history.searching()}
              onClick={() => {
                history.search(true)
                input?.focus()
              }}
            />
            <IconButton
              icon="refresh"
              size="small"
              variant="ghost"
              aria-label={t("agentManager.history.refresh", { context: props.label })}
              onClick={() => history.request({ refresh: true })}
            />
          </div>
          <div
            class="am-history-viewport"
            classList={{ "am-history-viewport-virtual": rows().length > 30 }}
            ref={setScroller}
            role="group"
            tabIndex={0}
            aria-label={t("agentManager.history.conversations")}
            aria-busy={page().data.loading}
            onKeyDown={(event: KeyboardEvent) => {
              const id = (event.target as HTMLElement).dataset.historySession
              if (id) navigate(event, id)
            }}
            onScroll={(event) => {
              const el = event.currentTarget
              page().scroll = el.scrollTop
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - HEIGHT * 2 && !page().data.error) more()
            }}
          >
            <Show when={rows().length > 30} fallback={<For each={rows()}>{row}</For>}>
              <Show when={scroller()}>
                {(el) => (
                  <Virtualizer
                    ref={(handle) => {
                      virtual = handle
                    }}
                    data={rows()}
                    scrollRef={el()}
                    itemSize={HEIGHT}
                    bufferSize={HEIGHT * 4}
                  >
                    {row}
                  </Virtualizer>
                )}
              </Show>
            </Show>
            <Show when={rows().length === 0 && !page().data.loading && !page().data.error}>
              <p class="am-history-note" role="status">
                {t(history.query() ? "agentManager.history.noMatches" : "agentManager.history.empty")}
              </p>
            </Show>
          </div>
          <Show when={page().data.loading}>
            <div class="am-history-note" role="status">
              <Spinner />
              {t(rows().length ? "agentManager.history.loadingMore" : "agentManager.history.loading")}
            </div>
          </Show>
          <Show when={page().data.error}>
            <div class="am-history-note am-history-error" role="alert">
              <span title={page().data.error}>
                {t(rows().length ? "agentManager.history.nextFailed" : "agentManager.history.failed")}
              </span>
              <Button size="small" variant="ghost" onClick={history.retry}>
                {t("agentManager.history.retry")}
              </Button>
            </div>
          </Show>
          <Show when={page().data.more && !page().data.loading && !page().data.error}>
            <Button class="am-history-more" size="small" variant="ghost" onClick={more}>
              {t("agentManager.history.more")}
            </Button>
          </Show>
          <Show when={history.failure()}>
            <div class="am-history-note am-history-error" role="alert">
              <span>{history.failure()}</span>
              <Button size="small" variant="ghost" onClick={history.reopen}>
                {t("agentManager.history.retry")}
              </Button>
            </div>
          </Show>
        </section>
      </Show>
    </div>
  )
}
