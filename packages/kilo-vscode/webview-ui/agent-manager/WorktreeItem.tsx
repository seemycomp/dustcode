/**
 * Sidebar worktree item with inline delete confirmation, metadata, rename, and stats.
 * Extracted from AgentManagerApp for reuse and visual-regression testing via Storybook.
 */
import { Component, For, Match, Show, Switch, createEffect, onCleanup, type ParentProps, type JSX } from "solid-js"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { ContextMenu } from "@kilocode/kilo-ui/context-menu"
import { Button } from "@kilocode/kilo-ui/button"
import type { WorktreeState, WorktreeGitStats, SectionState, RunStatus } from "../src/types/messages"
import type { PRStatus } from "../src/types/messages"
import { ActivityIcon } from "../src/components/shared/ActivityIcon"
import { label, running, strongest, type Activity } from "../src/utils/session-activity"
import { colorCss } from "./section-colors"
import { useLanguage } from "../src/context/language"
import { formatRelativeDate } from "../src/utils/date"

import { parseBindingTokens } from "../src/utils/keybind-tokens"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

type WorktreeHealth = "absent-restorable" | "absent-gone" | "unregistered" | "unavailable"
type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * True for the health states the user can actually act on.
 *
 * `unavailable` means the reconcile could not determine health — one failed `git worktree list`
 * marks every row that way — so it must not render as a warning, must not hide "Update from base",
 * and above all must not offer the entry-dropping removal actions.
 */
export function actionable(health?: WorktreeHealth): boolean {
  return health !== undefined && health !== "unavailable"
}

/** Short badge text for an unhealthy worktree. */
function healthLabel(t: Translate, health: WorktreeHealth): string {
  return t(`agentManager.worktree.health.${health}`)
}

/** One sentence explaining the state and what can be done about it. */
function healthNote(t: Translate, health: WorktreeHealth, branch: string): string {
  return t(`agentManager.worktree.health.${health}Note`, { branch })
}

/**
 * Inline health details and recovery actions.
 *
 * Its own component so the reasons and the actions can grow without pushing the row component past
 * its complexity budget.
 */
const HealthSection: Component<{
  t: Translate
  health?: WorktreeHealth
  branch: string
  sessions: number
  onRestore?: () => void
  onRemoveStale: () => void
  onRemoveKeepSessions?: () => void
}> = (props) => {
  const label = () => (props.health ? healthLabel(props.t, props.health) : props.t("agentManager.worktree.stale"))
  const note = () =>
    props.health ? healthNote(props.t, props.health, props.branch) : props.t("agentManager.worktree.staleTooltip")
  // Keeping the conversations is only meaningful while there are any to keep.
  const keep = () => props.sessions > 0 && props.onRemoveKeepSessions !== undefined
  const badge = () => (props.health === "unavailable" ? "help" : "warning")
  const click = (action?: () => void) => (event: MouseEvent) => {
    event.stopPropagation()
    action?.()
  }
  return (
    <>
      <div class="am-worktree-health" data-health={props.health}>
        <span class="am-worktree-health-label">
          <Icon name={badge()} size="small" />
          {label()}
        </span>
        <span class="am-worktree-health-note">{note()}</span>
        {/* No actions for `unavailable`: nothing is known to be wrong, so there is nothing to fix. */}
        <Show when={actionable(props.health) || props.health === undefined}>
          <div class="am-worktree-health-actions" on:pointerdown={(event) => event.stopPropagation()}>
            <Show when={props.health === "absent-restorable" && props.onRestore}>
              <Button variant="ghost" size="small" onClick={click(props.onRestore)}>
                {props.t("agentManager.worktree.restore")}
              </Button>
            </Show>
            <Show
              when={keep()}
              fallback={
                <Button variant="ghost" size="small" onClick={click(props.onRemoveStale)}>
                  {props.t("agentManager.worktree.removeStale")}
                </Button>
              }
            >
              <Button variant="ghost" size="small" onClick={click(props.onRemoveKeepSessions)}>
                {props.t("agentManager.worktree.removeKeepSessions")}
              </Button>
            </Show>
          </div>
        </Show>
      </div>
    </>
  )
}

interface WorktreeItemProps {
  preview?: boolean
  worktree: WorktreeState
  /** Stable composite ID used by multi-project sidebar bodies. */
  sidebarId?: string
  /** Worktree display name (explicit label or branch). */
  label: string
  /** Recorded base ref, including its remote when available. */
  subtitle?: string
  active: boolean
  pendingDelete: boolean
  completed?: boolean
  onCompletionEnd?: () => void
  busy: boolean
  activity: Activity
  blocked?: boolean
  /**
   * The worktree has a problem the user can act on. Drives the stale styling and hides actions that
   * need a live directory, so an indeterminate `unavailable` health must not set it — see
   * {@link actionable}.
   */
  stale: boolean
  /**
   * Why this worktree is unhealthy, when the health reconcile knows. Refines the generic "stale"
   * badge into something actionable, and decides which recovery actions are offered.
   */
  health?: "absent-restorable" | "absent-gone" | "unregistered" | "unavailable"
  /** Re-create the worktree folder from its surviving branch. */
  onRestore?: () => void
  /** Drop the entry but keep its sessions, moving them to Local. */
  onRemoveKeepSessions?: () => void
  /** 1-indexed shortcut number shown as ⌘2, ⌘3, etc. Pass 0, >9, or undefined to hide. */
  shortcut?: number
  stats?: WorktreeGitStats
  status?: JSX.Element
  clock?: () => number
  /** Navigation hint text (e.g. "⌘⌥↑"). */
  navHint?: string
  /** Number of sessions attached to this worktree. */
  sessions: number
  /** Whether this worktree is part of a multi-version group. */
  grouped: boolean
  /** Whether this is the first item in a group. */
  groupStart: boolean
  /** Whether this is the last item in a group. */
  groupEnd: boolean
  /** Group size (only used when groupStart is true). */
  groupSize: number
  /** Whether renaming is active on this item. */
  renaming: boolean
  /** Current rename input value. */
  renameValue: string
  /** Keybinding string for the close/delete action. */
  closeKeybind: string
  /** Keybinding string for the open-in-vscode action. */
  openKeybind: string
  /** PR status for this worktree's branch, or null if no PR. */
  pr?: PRStatus
  runStatus?: RunStatus
  /** Callback when the PR badge is clicked. */
  onOpenPR?: () => void
  onOpenComments?: () => void
  /** Available sections for the "Move to Section" submenu. */
  sections?: SectionState[]
  /** ID of the section this worktree currently belongs to (for disabling current item). */
  currentSectionId?: string
  /** Move this worktree to a section (or null for ungrouped). */
  onMoveToSection?: (sectionId: string | null) => void
  /** Move this worktree to a new section. */
  onMoveToNewSection?: () => void
  /** Pinned worktrees lead the sidebar. */
  pinned?: boolean
  /** Toggle the pin. Shift+click on the row calls it too. */
  onTogglePin?: () => void

  onClick: () => void
  onDelete: (e: MouseEvent) => void
  onCancelDelete?: () => void
  onStartRename: (current: string) => void
  onRenameInput: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRemoveStale: () => void
  onCopyPath: () => void
  onOpen: () => void
  onUpdateBase?: () => void
}

const MAX_SHORTCUT = 9

const hasStats = (s: WorktreeGitStats | undefined): s is WorktreeGitStats =>
  !!s && (s.files > 0 || s.additions > 0 || s.deletions > 0 || s.ahead > 0 || s.behind > 0)

/**
 * Accent color for a PR badge, derived from the PR's lifecycle state
 * (open/draft/merged/closed). The one exception is an open PR with checks still
 * running, which uses amber and pulses its background (see prChecksRunning) — a
 * transient, unambiguous signal since no lifecycle state uses amber. Terminal CI
 * and review results are conveyed by a separate status icon (see prBadgeIndicator)
 * so a failing check is not mistaken for a closed PR.
 */
/** True while an open PR's checks are still running — drives the pulsing amber badge. */
export function prChecksRunning(pr: PRStatus): boolean {
  return pr.state === "open" && pr.checks.status === "pending"
}

export type PRBadgeIndicator = "failure" | "changes" | "approved" | "none"

/**
 * Terminal CI/review status shown as an icon overlaid on the PR badge, independent
 * of the badge's state-based accent color. Running checks are not represented here —
 * they are shown by the pulsing amber background instead. Terminal PRs (merged/closed)
 * show no indicator since their checks are no longer actionable.
 */
export function prBadgeIndicator(pr: PRStatus): PRBadgeIndicator {
  if (pr.state === "merged" || pr.state === "closed") return "none"
  if (pr.checks.status === "failure") return "failure"
  if (pr.review === "changes_requested") return "changes"
  if (pr.review === "approved") return "approved"
  return "none"
}

function runAccent(status: RunStatus | undefined): "running" | "stopping" | "success" | "error" | undefined {
  if (status?.state === "running") return "running"
  if (status?.state === "stopping") return "stopping"
  if (status?.exitCode === undefined && !status?.error) return undefined
  if (status.exitCode === 0 && !status.error) return "success"
  return "error"
}

function RunBadge(props: { status?: RunStatus }) {
  const kind = () => runAccent(props.status)
  return (
    <Show when={kind()}>
      <span class="am-run-badge" data-run-state={kind()}>
        <Icon name={kind() === "success" ? "check-small" : kind() === "error" ? "warning" : "play"} size="small" />
        <Show when={props.status?.state === "running" || props.status?.state === "stopping"}>
          <span class="am-run-badge-label">{props.status?.state === "stopping" ? "Stopping" : "Running"}</span>
        </Show>
      </span>
    </Show>
  )
}

/** Context menu item that pins or unpins the worktree. */
function PinItem(props: { t: Translate; pinned?: boolean; onToggle?: () => void }) {
  return (
    <Show when={props.onToggle}>
      <ContextMenu.Item onSelect={() => props.onToggle?.()}>
        <Icon name={props.pinned ? "pin-filled" : "pin"} size="small" />
        <ContextMenu.ItemLabel>
          {props.t(props.pinned ? "agentManager.worktree.unpin" : "agentManager.worktree.pin")}
        </ContextMenu.ItemLabel>
      </ContextMenu.Item>
      <ContextMenu.Separator />
    </Show>
  )
}

/** Hover button that unpins a pinned worktree. */
function UnpinButton(props: { t: Translate; show: boolean; onToggle?: () => void }) {
  return (
    <Show when={props.show}>
      <div class="am-worktree-unpin">
        <Tooltip value={props.t("agentManager.worktree.unpin")} placement="top">
          <IconButton
            icon="pin-filled"
            size="small"
            variant="ghost"
            aria-label={props.t("agentManager.worktree.unpin")}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              props.onToggle?.()
            }}
          />
        </Tooltip>
      </div>
    </Show>
  )
}

function Completion(props: ParentProps<{ completed?: boolean; onEnd?: () => void }>) {
  return (
    <div
      class="am-worktree-exit"
      classList={{ "am-worktree-completed": props.completed }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && props.completed) props.onEnd?.()
      }}
    >
      <div class="am-worktree-exit-content">{props.children}</div>
    </div>
  )
}

export const WorktreeItem: Component<WorktreeItemProps> = (props) => {
  const { t } = useLanguage()
  const compact = document.body.dataset.agentManagerPresentation === "sidebar"
  let card: HTMLDivElement | undefined
  const state = () =>
    strongest([
      props.activity,
      !props.completed && (props.busy || props.runStatus?.state === "running") ? "busy" : "idle",
    ])
  /** Any health problem worth surfacing on the row, actionable or merely indeterminate. */
  const problem = () => props.stale || props.health !== undefined
  /** `unavailable` is "not checked", so it gets a question mark rather than a warning triangle. */
  const badge = () => (props.health === "unavailable" ? "help" : "warning")
  const pinnable = () => props.onTogglePin !== undefined
  const pin = () => (props.pinned ? "true" : undefined)
  const unpinnable = () => pinnable() && props.pinned === true && !props.pendingDelete
  const select = (e: MouseEvent) => {
    props.onCancelDelete?.()
    if (e.shiftKey && props.onTogglePin) {
      e.preventDefault()
      props.onTogglePin()
      return
    }
    props.onClick()
  }
  const blocked = () =>
    props.completed ||
    props.busy ||
    props.blocked ||
    running(state()) ||
    props.runStatus?.state === "running" ||
    props.runStatus?.state === "stopping"

  createEffect(() => {
    if (!props.pendingDelete) return
    if (blocked()) {
      props.onCancelDelete?.()
      return
    }
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !card?.contains(event.target)) props.onCancelDelete?.()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      props.onCancelDelete?.()
      card?.focus()
    }
    document.addEventListener("pointerdown", dismiss, true)
    document.addEventListener("keydown", escape, true)
    onCleanup(() => {
      document.removeEventListener("pointerdown", dismiss, true)
      document.removeEventListener("keydown", escape, true)
    })
  })

  const handleOpenPR = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    props.onOpenPR?.()
  }

  return (
    <Completion completed={props.completed} onEnd={props.onCompletionEnd}>
      <Show when={props.groupStart}>
        <div class="am-wt-group-header">
          <Icon name="layers" size="small" />
          <span class="am-wt-group-label">{t("agentManager.worktree.versions", { count: props.groupSize })}</span>
        </div>
      </Show>
      <ContextMenu slide={compact} fitViewport={compact}>
        <ContextMenu.Trigger as="div" style={{ display: "contents" }}>
          <div
            ref={card}
            tabIndex={-1}
            inert={props.completed}
            class="am-worktree-item"
            classList={{
              "am-worktree-item-active": props.active,
              "am-worktree-pending-delete": props.pendingDelete,
              "am-wt-grouped": props.grouped,
              "am-wt-group-end": props.groupEnd,
            }}
            data-sidebar-id={props.preview || props.completed ? undefined : (props.sidebarId ?? props.worktree.id)}
            data-pinned={pin()}
            onMouseDown={(e) => {
              // Shift+mousedown extends the text selection. Stop it so Shift+click only pins.
              if (e.shiftKey && pinnable()) e.preventDefault()
            }}
            onClick={select}
          >
            <div class="am-wt-icon" data-activity={state()} aria-label={t(label(state()))}>
              <ActivityIcon state={state()} idle={<Icon name="branch" size="small" />} />
            </div>
            <div class="am-wt-content">
              {/* Keep the worktree name and base separate from the date/stats column. */}
              <div class="am-wt-row1">
                <Show when={problem()}>
                  <Tooltip
                    value={
                      props.health
                        ? healthNote(t, props.health, props.worktree.branch)
                        : t("agentManager.worktree.staleTooltip")
                    }
                    placement="top"
                    contentClass="am-tooltip-wrap"
                  >
                    <span class="am-worktree-stale-badge" data-health={props.health}>
                      <Icon name={badge()} size="small" />
                    </span>
                  </Tooltip>
                </Show>
                <Show
                  when={props.renaming}
                  fallback={
                    <span
                      class="am-worktree-branch"
                      title={props.label}
                      onDblClick={(e) => {
                        e.stopPropagation()
                        props.onStartRename(props.label)
                      }}
                    >
                      {/* Inner span keeps the finish strikethrough tight to the text. */}
                      <span class="am-wt-name">{props.label}</span>
                    </span>
                  }
                >
                  <input
                    class="am-worktree-rename-input"
                    value={props.renameValue}
                    onInput={(e) => props.onRenameInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        props.onCommitRename()
                      }
                      if (e.key === "Escape") {
                        e.preventDefault()
                        props.onCancelRename()
                      }
                    }}
                    onBlur={() => props.onCommitRename()}
                    onClick={(e) => e.stopPropagation()}
                    ref={(el) =>
                      requestAnimationFrame(() =>
                        requestAnimationFrame(() => {
                          el.focus()
                          el.select()
                        }),
                      )
                    }
                  />
                </Show>
              </div>
              <time class="am-worktree-date" dateTime={props.worktree.createdAt}>
                {(() => {
                  props.clock?.()
                  return formatRelativeDate(props.worktree.createdAt)
                })()}
              </time>
              <div class="am-wt-actions-cell">
                <Show when={props.stats === undefined}>
                  <div class="am-worktree-stats-skeleton">
                    <div class="am-worktree-stats-skeleton-row" />
                  </div>
                </Show>
                <Show when={hasStats(props.stats)}>
                  <div class="am-worktree-stats">
                    <Show when={props.stats!.behind > 0}>
                      <span class="am-worktree-behind">↓{props.stats!.behind}</span>
                    </Show>
                    <Show when={props.stats!.ahead > 0}>
                      <span class="am-worktree-commits">↑{props.stats!.ahead}</span>
                    </Show>
                    <Show
                      when={props.stats!.additions > 0 || props.stats!.deletions > 0}
                      fallback={
                        <Show when={props.stats!.files > 0}>
                          <span class="am-stat-files">{props.stats!.files}f</span>
                        </Show>
                      }
                    >
                      <Show when={props.stats!.additions > 0}>
                        <span class="am-stat-additions">+{props.stats!.additions}</span>
                      </Show>
                      <Show when={props.stats!.deletions > 0}>
                        <span class="am-stat-deletions">−{props.stats!.deletions}</span>
                      </Show>
                    </Show>
                  </div>
                </Show>
                <Show when={props.pendingDelete && !blocked()}>
                  <Button
                    class="am-worktree-delete-hint"
                    size="small"
                    variant="ghost"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      if (!blocked()) props.onDelete(e)
                    }}
                  >
                    {t("agentManager.worktree.confirmDelete")}
                  </Button>
                </Show>
                <div class="am-wt-hover-actions">
                  <Show when={props.shortcut !== undefined && props.shortcut >= 2 && props.shortcut <= MAX_SHORTCUT}>
                    <span class="am-shortcut-badge">
                      {isMac ? "⌘" : "Ctrl+"}
                      {props.shortcut}
                    </span>
                  </Show>
                  <UnpinButton t={t} show={unpinnable()} onToggle={props.onTogglePin} />
                </div>
              </div>
              <div class="am-worktree-meta">
                <span class="am-worktree-name" title={props.subtitle}>
                  {props.subtitle}
                </span>
                <Show when={props.pr || runAccent(props.runStatus) || props.stats === undefined}>
                  <div class="am-wt-row2">
                    <RunBadge status={props.runStatus} />
                    <Show
                      when={props.pr}
                      fallback={
                        <Show when={props.stats === undefined}>
                          <div class="am-pr-badge-skeleton" />
                        </Show>
                      }
                    >
                      {(pr) => {
                        const indicator = () => prBadgeIndicator(pr())
                        const count = () => pr().unresolvedThreads ?? pr().comments?.unresolved ?? 0
                        const tooltip = () =>
                          t(
                            count() === 1
                              ? "agentManager.pr.comment.unresolvedThread"
                              : "agentManager.pr.comment.unresolvedThreads",
                            { count: count() },
                          )
                        return (
                          <span
                            class="am-pr-badge"
                            classList={{
                              "am-pr-accent-draft": pr().state === "draft",
                              "am-pr-accent-merged": pr().state === "merged",
                              "am-pr-accent-closed": pr().state === "closed",
                              "am-pr-accent-pending": pr().state === "open" && pr().checks.status === "pending",
                              "am-pr-accent-open": pr().state === "open" && pr().checks.status !== "pending",
                              "am-pr-badge-pending": prChecksRunning(pr()),
                            }}
                            onClick={handleOpenPR}
                          >
                            <Icon name="pull-request" size="small" />
                            <span class="am-pr-badge-number">#{pr().number}</span>
                            <Switch>
                              <Match when={indicator() === "failure"}>
                                <Icon
                                  name="circle-x-outline"
                                  size="small"
                                  class="am-pr-badge-status"
                                  data-status="failure"
                                />
                              </Match>
                              <Match when={indicator() === "changes"}>
                                <Icon name="warning" size="small" class="am-pr-badge-status" data-status="changes" />
                              </Match>
                              <Match when={indicator() === "approved"}>
                                <Icon
                                  name="circle-check"
                                  size="small"
                                  class="am-pr-badge-status"
                                  data-status="approved"
                                />
                              </Match>
                            </Switch>
                            <Show when={count() > 0}>
                              <Tooltip value={tooltip()} placement="top">
                                <Button
                                  class="am-pr-badge-comments"
                                  variant="ghost"
                                  size="small"
                                  aria-label={tooltip()}
                                  onClick={(e: MouseEvent) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    props.onOpenComments?.()
                                  }}
                                >
                                  <Icon name="speech-bubble" size="small" />
                                  <span>{count()}</span>
                                </Button>
                              </Tooltip>
                            </Show>
                          </span>
                        )
                      }}
                    </Show>
                  </div>
                </Show>
              </div>
              <Show when={problem()}>
                <HealthSection
                  t={t}
                  health={props.health}
                  branch={props.worktree.branch}
                  sessions={props.sessions}
                  onRestore={props.onRestore}
                  onRemoveStale={props.onRemoveStale}
                  onRemoveKeepSessions={props.onRemoveKeepSessions}
                />
              </Show>
              <div class="am-worktree-status">{props.status}</div>
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content class="am-ctx-menu">
            <PinItem t={t} pinned={props.pinned} onToggle={props.onTogglePin} />
            <ContextMenu.Item onSelect={() => props.onStartRename(props.label)}>
              <Icon name="edit" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.worktree.rename")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <Show when={!blocked()}>
              <ContextMenu.Item
                onSelect={() => {
                  if (blocked()) return
                  props.onCancelDelete?.()
                  props.onDelete(new MouseEvent("click"))
                }}
              >
                <Icon name="trash" size="small" />
                <ContextMenu.ItemLabel>{t("agentManager.worktree.delete")}</ContextMenu.ItemLabel>
                <Show when={props.closeKeybind}>
                  <span class="am-menu-shortcut">
                    {parseBindingTokens(props.closeKeybind).map((token) => (
                      <kbd class="am-menu-key">{token}</kbd>
                    ))}
                  </span>
                </Show>
              </ContextMenu.Item>
            </Show>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={() => props.onOpen()}>
              <Icon name="open-file" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.worktree.openInVscode")}</ContextMenu.ItemLabel>
              <Show when={props.openKeybind}>
                <span class="am-menu-shortcut">
                  {parseBindingTokens(props.openKeybind).map((token) => (
                    <kbd class="am-menu-key">{token}</kbd>
                  ))}
                </span>
              </Show>
            </ContextMenu.Item>
            <Show when={props.onUpdateBase && !props.stale}>
              <ContextMenu.Item onSelect={() => props.onUpdateBase?.()}>
                <Icon name="branch" size="small" />
                <ContextMenu.ItemLabel>{t("agentManager.updateBase.title")}</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            </Show>
            <ContextMenu.Item onSelect={() => props.onCopyPath()}>
              <Icon name="copy" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.worktree.copyPath")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={() => props.onMoveToNewSection?.()}>
              <Icon name="plus" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.worktree.newSection")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <Show when={props.sections && props.sections.length > 0}>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => props.onMoveToSection?.(null)}>
                <Show when={!props.currentSectionId}>
                  <Icon name="check" size="small" />
                </Show>
                <ContextMenu.ItemLabel>{t("agentManager.worktree.ungrouped")}</ContextMenu.ItemLabel>
              </ContextMenu.Item>
              <For each={props.sections}>
                {(sec) => (
                  <ContextMenu.Item onSelect={() => props.onMoveToSection?.(sec.id)}>
                    <Show
                      when={props.currentSectionId === sec.id}
                      fallback={
                        <span
                          class="am-color-swatch am-color-swatch-sm"
                          style={{ background: colorCss(sec.color) ?? "var(--vscode-panel-border)" }}
                        />
                      }
                    >
                      <Icon name="check" size="small" />
                    </Show>
                    <ContextMenu.ItemLabel>{sec.name}</ContextMenu.ItemLabel>
                  </ContextMenu.Item>
                )}
              </For>
            </Show>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
      <Show when={props.completed}>
        <span class="am-worktree-completion-status" role="status">
          {props.label}: {t("ui.patch.action.deleted")}
        </span>
      </Show>
    </Completion>
  )
}
