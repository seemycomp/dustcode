import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type ParentComponent,
  useContext,
} from "solid-js"
import { useServer } from "./server"
import { useSession } from "./session"
import { useVSCode } from "./vscode"
import {
  PENDING_TAB_PREFIX,
  addPendingTab,
  addSessionTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  insertSessionTabAfter,
  isPendingTab,
  openSessionTab,
  restoreTabs,
  tabsForCreatedSession,
  tabsForLoadedSessions,
  type LocalTabState,
} from "../utils/local-tabs"
import {
  deletePendingDraft,
  discardPendingDraft,
  isPendingSend,
  promotePendingDraftDiscard,
} from "../utils/draft-store"
import { applyPinnedTabs, reorderPinnedTabs, togglePinnedTab } from "../utils/tab-order"
import { closableRight, closeToRight, sessionCloseDeps } from "../utils/session-close"
import { restoredNativeSession } from "../../../src/shared/native-session-state"
import type { ReadyMessage, ExtensionMessage } from "../types/messages/extension-messages"
import { agentProject, isStaleAgentSession } from "./session-project"

interface LocalTabsState extends Record<string, unknown> {
  sidebarSessionTabIDs?: string[]
  sidebarActiveSessionTabID?: string
  sidebarPinnedSessionTabIDs?: string[]
  nativeSessionContexts?: Record<string, string>
  nativeSessionContext?: string
}

interface LocalTabsValue {
  native: boolean
  ids: Accessor<string[]>
  display: Accessor<string[]>
  active: Accessor<string | undefined>
  pending: Accessor<string | undefined>
  add: () => string
  open: (id: string, options?: { scrollToBottom?: boolean }) => void
  openAfter: (source: string, id: string) => void
  select: (id: string) => void
  close: (id: string) => void
  closeAll: () => void
  closeOthers: (id: string) => void
  closeToRight: (id: string) => void
  closableRight: (id: string) => string[]
  isPinned: (id: string) => boolean
  togglePinned: (id: string) => void
  previewCloud: (id: string) => void
  reorder: (from: string, to: string) => boolean
  move: (id: string, offset: -1 | 1) => number | undefined
  persist: () => void
  scope: Accessor<NonNullable<ReadyMessage["nativeSessionTab"]>["scope"]>
}

const LocalTabsContext = createContext<LocalTabsValue>()

const same = (left: string[], right: string[]) => left.length === right.length && left.every((id, i) => right[i] === id)

export const LocalTabsProvider: ParentComponent = (props) => {
  const vscode = useVSCode()
  const server = useServer()
  const session = useSession()
  const saved = vscode.getState<LocalTabsState>()
  const host = window as Window & {
    KILO_TOP_BAR_SURFACE?: string
    KILO_NATIVE_SESSION_TAB?: ReadyMessage["nativeSessionTab"]
  }
  const native = host.KILO_TOP_BAR_SURFACE === "tab_title"
  const [scope, setScope] = createSignal(native ? host.KILO_NATIVE_SESSION_TAB?.scope : undefined)
  const [project, setProject] = createSignal<string>()
  const stale = (message: ExtensionMessage) => isStaleAgentSession(message, scope()?.projectId ?? project())
  onCleanup(
    vscode.onMessage((message) => {
      const owner = agentProject(message)
      if (owner) setProject(owner)
    }),
  )
  const [binding, setBinding] = createSignal(scope() ? host.KILO_NATIVE_SESSION_TAB?.context : undefined)
  const [contexts, setContexts] = createSignal<Record<string, string>>({ ...saved?.nativeSessionContexts })
  const remember = (id?: string, context?: string) => {
    if (scope() && context) setBinding(context)
    if (!id || !context) return
    setContexts((prev) => ({ ...prev, [id]: context }))
  }
  remember(host.KILO_NATIVE_SESSION_TAB?.sessionID, host.KILO_NATIVE_SESSION_TAB?.context)
  const [initial, setInitial] = createSignal<{ sessionID?: string; restore: boolean }>()
  const pending = () => `${PENDING_TAB_PREFIX}${crypto.randomUUID()}`
  const selected = native
    ? host.KILO_NATIVE_SESSION_TAB
      ? host.KILO_NATIVE_SESSION_TAB.sessionID
      : restoredNativeSession(saved)
    : saved?.sidebarActiveSessionTabID
  const list = Array.isArray(saved?.sidebarSessionTabIDs)
    ? saved.sidebarSessionTabIDs.filter((id) => typeof id === "string")
    : undefined
  const init = native
    ? restoreTabs(selected ? [selected] : [], selected, pending)
    : restoreTabs(list, selected, pending)
  const [ids, setIds] = createSignal(init.ids)
  onCleanup(session.trackScopes(ids))
  onCleanup(session.keepSessions(ids))
  const [active, setActive] = createSignal(init.active)
  const [pinned, setPinned] = createSignal((saved?.sidebarPinnedSessionTabIDs ?? []).filter((id) => !isPendingTab(id)))
  const [cloud, setCloud] = createSignal<string>()
  const fresh = new Set<string>()
  const current = (): LocalTabState => ({ ids: ids(), active: active() })
  const apply = (next: LocalTabState) => {
    if (!same(ids(), next.ids)) setIds(next.ids)
    if (active() !== next.active) setActive(next.active)
  }
  const display = createMemo(() =>
    applyPinnedTabs(
      ids().map((id) => ({ id })),
      pinned(),
    ).map((item) => item.id),
  )
  const isPinned = (id: string) => pinned().includes(id)
  const togglePinned = (id: string) => {
    if (isPendingTab(id)) return
    setPinned((prev) => togglePinnedTab(prev, id))
  }
  let navigated = false
  const focus = (id: string | undefined, options: { scrollToBottom?: boolean } = {}) => {
    navigated = true
    setCloud(undefined)
    if (!id || isPendingTab(id)) {
      session.clearCurrentSession()
      return
    }
    session.selectSession(id, options)
  }
  const real = createMemo(() => ids().filter((id) => !isPendingTab(id)))
  const activePending = createMemo(() => {
    const id = active()
    return id && isPendingTab(id) ? id : undefined
  })

  const select = (id: string) => {
    if (!ids().includes(id)) return
    setActive(id)
    focus(id)
  }

  const open = (id: string, options: { scrollToBottom?: boolean } = {}) => {
    apply(openSessionTab(current(), id))
    focus(id, options)
  }

  const openAfter = (source: string, id: string) => {
    apply(insertSessionTabAfter(current(), source, id))
    focus(id)
    persist()
  }

  const add = () => {
    const id = pending()
    apply(addPendingTab(current(), id))
    focus(id)
    return id
  }

  const close = (id: string) => {
    const before = active()
    const next = closeTab(current(), id, pending)
    apply(next)
    if (before === id || before !== next.active) focus(next.active)
    if (isPendingTab(id)) {
      if (session.isSubmitting(id) || isPendingSend(id)) discardPendingDraft(id)
      queueMicrotask(() => deletePendingDraft(id))
    }
  }

  const closeAll = () => {
    const removed = ids()
    const next = closeAllTabs(pending)
    apply(next)
    setPinned([])
    focus(next.active)
    const drafts = removed.filter(isPendingTab)
    for (const id of drafts) {
      if (session.isSubmitting(id) || isPendingSend(id)) discardPendingDraft(id)
    }
    if (drafts.length > 0) queueMicrotask(() => drafts.forEach(deletePendingDraft))
  }

  const closeDeps = sessionCloseDeps({
    ids: display,
    visible: active,
    isPending: isPendingTab,
    isPinned,
    close,
    reveal: select,
  })

  const closeOthers = (id: string) => {
    const removed = ids().filter((tab) => tab !== id && isPendingTab(tab))
    const next = closeOtherTabs(current(), id, pinned())
    apply(next)
    focus(next.active)
    for (const pending of removed) {
      if (session.isSubmitting(pending) || isPendingSend(pending)) discardPendingDraft(pending)
    }
    queueMicrotask(() => removed.forEach(deletePendingDraft))
  }
  const closeToRightTab = (id: string) => closeToRight(id, closeDeps)
  const rightTabs = (id: string) => closableRight(id, closeDeps)
  const previewCloud = (id: string) => setCloud(id)
  const reorder = (from: string, to: string) => {
    const next = reorderPinnedTabs(ids(), pinned(), from, to)
    if (!next) return false
    setIds(next.ids)
    setPinned(next.pinned)
    return true
  }
  const move = (id: string, offset: -1 | 1) => {
    const list = display()
    const index = list.indexOf(id)
    if (index === -1) return undefined
    const target = list[index + offset]
    if (target === undefined) return undefined
    if (!reorder(id, target)) return undefined
    return display().indexOf(id)
  }

  let restored = false
  createEffect(() => {
    if (restored || !server.isConnected() || (native && !initial())) return
    restored = true
    if (real().length > 0) session.loadSessions()
    if (native && (!initial()?.restore || navigated)) return
    const id = active()
    if (id && !isPendingTab(id)) session.selectSession(id)
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    const tabs = real()
    const tab = active()
    const selected = tab && !isPendingTab(tab) ? tab : undefined
    const pins = pinned().filter((id) => real().includes(id))
    const prev = vscode.getState<LocalTabsState>() ?? {}
    vscode.setState({
      ...prev,
      sidebarSessionTabIDs: tabs,
      sidebarActiveSessionTabID: selected ?? (native ? "" : undefined),
      sidebarPinnedSessionTabIDs: pins,
      ...(native ? { nativeSessionContexts: contexts() } : {}),
      ...(native && scope() ? { nativeSessionContext: binding() } : {}),
    })
  }
  createEffect(() => {
    real()
    active()
    pinned()
    contexts()
    binding()
    clearTimeout(timer)
    if (native) persist()
    else timer = setTimeout(persist, 300)
  })
  onCleanup(() => clearTimeout(timer))

  createEffect(() => {
    vscode.postMessage({ type: "sidebar.openSessions", sessionIDs: real() })
  })

  onCleanup(
    vscode.onMessage((message) => {
      if (message.type === "ready" && native && message.nativeSessionTab) {
        const target = message.nativeSessionTab
        setScope(target.scope)
        remember(target.sessionID, target.context)
        if (!navigated && target.sessionID) apply(restoreTabs([target.sessionID], target.sessionID, pending))
        setInitial(target)
      }
    }),
  )

  onCleanup(
    vscode.onMessage((message) => {
      if (message.type !== "nativeSessionContext" || !native) return
      remember(message.sessionID, message.context)
    }),
  )

  const cleanup = vscode.onMessage((message) => {
    if (message.type === "openCloudSession") {
      setCloud(message.sessionId)
      return
    }
    if (message.type === "sessionCreated") {
      if (message.draftID && promotePendingDraftDiscard(message.draftID, message.session.id)) return
      const next = tabsForCreatedSession(current(), message.session.id, message.draftID, message.activate)
      if (!next) return
      fresh.add(message.session.id)
      apply(next)
      focus(next.active)
      return
    }
    if (message.type === "cloudSessionImported") {
      const activate = cloud() === message.cloudSessionId
      fresh.add(message.session.id)
      apply(activate ? openSessionTab(current(), message.session.id) : addSessionTab(current(), message.session.id))
      if (activate) setCloud(undefined)
      return
    }
    if (message.type === "sessionsLoaded") {
      const before = active()
      const listed = message.sessions.map((item) => item.id)
      for (const id of listed) fresh.delete(id)
      const next = tabsForLoadedSessions(current(), message, fresh, pending, native ? active() : undefined)
      if (!next) return
      apply(next)
      if (before !== next.active) focus(next.active)
      return
    }
    if (message.type === "sessionDeleted") {
      if (stale(message)) return
      fresh.delete(message.sessionID)
      const before = active()
      const next =
        native && before === message.sessionID ? closeAllTabs(pending) : closeTab(current(), message.sessionID, pending)
      apply(next)
      if (before !== next.active) focus(next.active)
    }
  })
  onCleanup(cleanup)

  return (
    <LocalTabsContext.Provider
      value={{
        native,
        ids,
        display,
        active,
        pending: activePending,
        add,
        open,
        openAfter,
        select,
        close,
        closeAll,
        closeOthers,
        closeToRight: closeToRightTab,
        closableRight: rightTabs,
        isPinned,
        togglePinned,
        previewCloud,
        reorder,
        move,
        persist,
        scope,
      }}
    >
      {props.children}
    </LocalTabsContext.Provider>
  )
}

export function useLocalTabs(): LocalTabsValue | undefined {
  return useContext(LocalTabsContext)
}
