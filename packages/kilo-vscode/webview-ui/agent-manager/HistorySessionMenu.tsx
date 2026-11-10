import type { ParentComponent } from "solid-js"
import { SessionTabMenu } from "../src/components/chat/SessionTabMenu"
import { useVSCode } from "../src/context/vscode"
import { useLanguage } from "../src/context/language"
import { running, type Activity } from "../src/utils/session-activity"
import { closeOthers, closableRightOf, closeToRight, type CloseToRightDeps } from "../src/utils/tab-close"
import type { ProjectStore } from "./project/store"
import { applyPinnedTabs, applyTabOrder } from "./tab-order"
import { createTabPersistence } from "./tab-persistence"
import { PENDING_PREFIX, REVIEW_TAB_ID } from "./tab-ids"

export interface HistoryMenuActions {
  new: (projectId: string, worktreeId: string | null) => void
  close: (projectId: string, sessionId: string) => void
  tabs: (projectId: string, worktreeId: string | null) => CloseToRightDeps | undefined
  transfer?: (
    projectId: string,
    worktreeId: string | null,
    sessionId: string,
    action: "move" | "copy",
    create?: boolean,
  ) => void
}

/** Scope tab actions to the history row, not the currently selected chat. */
export const HistorySessionMenu: ParentComponent<{
  store: ProjectStore
  worktreeId: string | null
  sessionId: string
  git?: boolean
  disabled?: boolean
  activity?: Activity
  actions?: HistoryMenuActions
  onOpen: () => void
}> = (props) => {
  const vscode = useVSCode()
  const { t } = useLanguage()
  const key = () => props.worktreeId ?? "local"
  const pin = createTabPersistence(
    () => props.store,
    key,
    REVIEW_TAB_ID,
    (message) => vscode.postMessage({ ...message, projectId: props.store.id }),
  ).tab
  const ids = () => {
    const sessions = props.store.managedSessions().filter((item) => item.worktreeId === props.worktreeId)
    const rows =
      props.worktreeId === null
        ? [...new Set([...props.store.tabs.ids(), ...sessions.map((item) => item.id)])]
        : sessions.map((item) => item.id)
    return applyPinnedTabs(
      applyTabOrder(
        rows.map((id) => ({ id })),
        props.store.tabOrder()[key()],
      ),
      props.store.pinnedTabs()[key()],
    ).map((item) => item.id)
  }
  const open = () => ids().includes(props.sessionId)
  const actionable = () => !props.disabled && !running(props.activity ?? "idle") && props.activity !== "waiting"
  const close = (id: string) => {
    if (props.actions) return props.actions.close(props.store.id, id)
    props.store.tabs.set((rows) => rows.filter((row) => row !== id))
    vscode.postMessage({ type: "agentManager.closeSession", projectId: props.store.id, sessionId: id })
  }
  const tabs = (): CloseToRightDeps =>
    props.actions?.tabs(props.store.id, props.worktreeId) ?? {
      REVIEW_TAB_ID,
      tabIds: ids,
      isPending: (id) => id.startsWith(PENDING_PREFIX),
      activateTerminal: () => {},
      deactivateTerminal: () => {},
      closeTerminal: () => {},
      closeReview: () => {},
      selectReviewTab: () => {},
      selectSessionTab: props.onOpen,
      sessionClose: close,
      isPinned: pin.isPinned,
      visibleTabId: () => undefined,
    }
  return (
    <SessionTabMenu
      showNewSession
      onNewSession={
        !props.disabled && (props.actions || props.worktreeId)
          ? () => {
              if (props.actions) return props.actions.new(props.store.id, props.worktreeId)
              if (props.worktreeId)
                vscode.postMessage({
                  type: "agentManager.addSessionToWorktree",
                  projectId: props.store.id,
                  worktreeId: props.worktreeId,
                })
            }
          : undefined
      }
      showFork
      onFork={
        actionable()
          ? () => {
              if (!actionable()) return
              vscode.postMessage({
                type: "agentManager.forkSession",
                projectId: props.store.id,
                sessionId: props.sessionId,
                worktreeId: props.worktreeId ?? undefined,
              })
            }
          : undefined
      }
      showMoveToWorktree={props.git && (!!props.actions?.transfer || props.worktreeId === null)}
      showCopyToWorktree={props.git && !!props.actions?.transfer}
      transferOptions={
        props.actions?.transfer
          ? {
              new: t("agentManager.transfer.new"),
              existing: t("agentManager.transfer.existing"),
              copy: t("agentManager.transfer.copyMenu"),
            }
          : undefined
      }
      onCopyToWorktree={
        actionable() && props.actions?.transfer
          ? (create) => props.actions?.transfer?.(props.store.id, props.worktreeId, props.sessionId, "copy", create)
          : undefined
      }
      onMoveToWorktree={
        actionable()
          ? (create) => {
              if (props.actions?.transfer)
                return props.actions.transfer(props.store.id, props.worktreeId, props.sessionId, "move", create)
              if (actionable())
                vscode.postMessage({
                  type: "agentManager.promoteSession",
                  projectId: props.store.id,
                  sessionId: props.sessionId,
                })
            }
          : undefined
      }
      pinned={pin.isPinned(props.sessionId)}
      onTogglePin={
        props.disabled
          ? undefined
          : () => {
              const pinned = pin.isPinned(props.sessionId)
              pin.togglePinned(props.sessionId)
              if (!pinned && !open()) props.onOpen()
            }
      }
      closeable={open()}
      onClose={() => close(props.sessionId)}
      onCloseOthers={open() ? () => closeOthers(props.sessionId, tabs()) : undefined}
      onCloseToRight={
        open() && closableRightOf(props.sessionId, tabs().tabIds(), REVIEW_TAB_ID, pin.isPinned).length
          ? () => closeToRight(props.sessionId, tabs())
          : undefined
      }
    >
      {props.children}
    </SessionTabMenu>
  )
}
