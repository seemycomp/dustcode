import { batch, createMemo, createSignal, type Accessor, type Setter } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { isTerminalTabId } from "../../src/utils/terminal-tab-id"
import { mergeTransientTabs } from "../tab-order"
import { PENDING_PREFIX, REVIEW_TAB_ID } from "../tab-ids"
import { createHistoryState } from "../history-state"
import type {
  AgentManagerStateMessage,
  LocalGitStats,
  ManagedSessionState,
  PRStatus,
  RunStatus,
  SectionState,
  WorktreeGitStats,
  WorktreeState,
} from "../../src/types/messages"

export interface WorktreeBusyState {
  reason: "setting-up" | "deleting"
  message?: string
  branch?: string
}

/** Why a worktree cannot be polled, as classified by the extension's health reconcile. */
export type WorktreeHealthState = NonNullable<AgentManagerStateMessage["worktreeHealth"]>[string]

/** A directory under `.kilo/worktrees/` that no worktree claims, and whether it still holds a checkout. */
export type OrphanDirectory = NonNullable<AgentManagerStateMessage["orphanDirectories"]>[number]

/** Local session tab ids owned by one project. */
export function createStoreTabs(initial: string[] = []) {
  const [ids, setIds] = createSignal<string[]>(initial)
  const set = (next: string[] | ((prev: string[]) => string[])) => {
    const cur = ids()
    const value = typeof next === "function" ? next(cur) : next
    if (value !== cur) setIds(value)
  }
  /** Ids safe to persist (ephemeral pending drafts removed). */
  const durable = (pending: (id: string) => boolean) => ids().filter((id) => !pending(id))
  return { ids, set, durable }
}

function field<T>(initial: T): [Accessor<T>, Setter<T>] {
  const [get, set] = createSignal<T>(initial)
  return [get, set]
}

function collection<T extends { id: string }>(): [Accessor<T[]>, Setter<T[]>] {
  const [state, write] = createStore<{ rows: T[] }>({ rows: [] })
  const set: Setter<T[]> = (value) => {
    const next = typeof value === "function" ? value(state.rows) : value
    write(reconcile({ rows: next }, { key: "id" }))
    return next
  }
  return [() => state.rows, set]
}

/**
 * Per-project state that must never be shared with other projects: sidebar
 * inventory (worktrees, sessions, sections, orders), live data (stats, PR and
 * run statuses, apply/busy state), local session tabs, and per-context tab
 * memory. Worktree ids and the "local" context collide across projects, so
 * every keyed collection here is safe only because each project owns one.
 */
export function createProjectStore(id: string, opts: { tabs?: string[] } = {}) {
  const tabs = createStoreTabs(opts.tabs)
  const history = createHistoryState(id)
  const [historyExpandedStore, setHistoryExpandedStore] = createStore<Record<string, boolean>>({})
  const historyExpanded = createMemo(() => ({ ...historyExpandedStore }))
  const historyOpen = (key: string) => historyExpandedStore[key] === true
  const setHistoryExpanded = (
    value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    const next = typeof value === "function" ? value(historyExpanded()) : value
    for (const key of Object.keys(historyExpanded())) if (!(key in next)) setHistoryExpandedStore(key, false)
    for (const [key, open] of Object.entries(next)) setHistoryExpandedStore(key, open)
  }
  const [historyInitialized, setHistoryInitialized] = field(false)

  /** Last visible tab per sidebar context ("local" or a worktree id). */
  const [memory, setMemory] = createSignal<Record<string, string>>({})
  const tabMemory = {
    all: memory,
    get: (sel: string) => memory()[sel],
    set: (sel: string, tab: string) => setMemory((prev) => (prev[sel] === tab ? prev : { ...prev, [sel]: tab })),
  }
  /** Last session tab to restore after leaving a central terminal. */
  const [sessionMemory, setSessionMemory] = createSignal<Record<string, string>>({})
  const sessionRestore = {
    all: sessionMemory,
    get: (sel: string) => sessionMemory()[sel],
    set: (sel: string, tab: string) => setSessionMemory((prev) => (prev[sel] === tab ? prev : { ...prev, [sel]: tab })),
  }

  const [worktrees, setWorktrees] = collection<WorktreeState>()
  const [managedSessions, setManagedSessions] = collection<ManagedSessionState>()
  const [sections, setSections] = collection<SectionState>()
  const [staleWorktreeIds, setStaleWorktreeIds] = field<Set<string>>(new Set())
  const [worktreeHealth, setWorktreeHealth] = field<Record<string, WorktreeHealthState>>({})
  const [orphanDirectories, setOrphanDirectories] = field<OrphanDirectory[]>([])
  const [tabOrder, setTabOrder] = field<Record<string, string[]>>({})
  const [pinnedTabs, setPinnedTabs] = field<Record<string, string[]>>({})
  const [worktreeOrder, setWorktreeOrder] = field<string[]>([])
  const [sessionsCollapsed, setSessionsCollapsed] = field<boolean | undefined>(undefined)
  const [defaultBaseBranch, setDefaultBaseBranch] = field<string | undefined>(undefined)
  const [runScriptConfigured, setRunScriptConfigured] = field(false)
  const [prStatuses, setPrStatuses] = field<Record<string, PRStatus | null>>({})
  const [runStatuses, setRunStatuses] = field<Record<string, RunStatus>>({})
  const [worktreeStats, setWorktreeStats] = field<Record<string, WorktreeGitStats>>({})
  const [localStats, setLocalStats] = field<LocalGitStats | undefined>(undefined)
  const [busy, setBusy] = field<Map<string, WorktreeBusyState>>(new Map())

  /** Write a project state payload into this store (data fields only). */
  const applyState = (state: AgentManagerStateMessage): void =>
    batch(() => {
      setWorktrees(state.worktrees)
      setManagedSessions(state.sessions)
      setStaleWorktreeIds(new Set(state.staleWorktreeIds ?? []))
      setWorktreeHealth(state.worktreeHealth ?? {})
      setOrphanDirectories(state.orphanDirectories ?? [])
      setSections(state.sections ?? [])
      if (state.historyExpanded) setHistoryExpanded(state.historyExpanded)
      if (state.historyInitialized !== undefined) setHistoryInitialized(state.historyInitialized)
      history.prune(new Set(state.worktrees.map((wt) => wt.id)))
      if (state.tabOrder) {
        const incoming = state.tabOrder
        setTabOrder((previous) => {
          const next = { ...previous }
          for (const [key, order] of Object.entries(incoming)) {
            const merged = mergeTransientTabs(
              previous[key] ?? [],
              order,
              (id) => id === REVIEW_TAB_ID || isTerminalTabId(id) || id.startsWith(PENDING_PREFIX),
            )
            const current = previous[key]
            next[key] =
              current?.length === merged.length && merged.every((id, index) => current.at(index) === id)
                ? current
                : merged
          }
          return Object.keys(next).every((key) => next[key] === previous[key]) ? previous : next
        })
      }
      if (state.pinnedTabs) setPinnedTabs(state.pinnedTabs)
      if (state.worktreeOrder) {
        const order = state.worktreeOrder
        setWorktreeOrder((previous) =>
          previous.length === order.length && order.every((id, index) => previous.at(index) === id) ? previous : order,
        )
      }
      if ("defaultBaseBranch" in state) setDefaultBaseBranch(state.defaultBaseBranch || undefined)
      setRunScriptConfigured(state.runScriptConfigured === true)
      if (state.sessionsCollapsed !== undefined) setSessionsCollapsed(state.sessionsCollapsed)
      if (state.runStatuses) {
        const runs: Record<string, RunStatus> = {}
        for (const item of state.runStatuses) runs[item.worktreeId] = item
        setRunStatuses(runs)
      }
      // Reconcile busy flags with the worktree list (deleted worktrees drop out).
      const ids = new Set(state.worktrees.map((wt) => wt.id))
      setBusy((prev) => {
        const next = new Map([...prev].filter(([key]) => ids.has(key)))
        return next.size === prev.size ? prev : next
      })
    })

  return {
    id,
    tabs,
    history,
    historyExpanded,
    historyOpen,
    setHistoryExpanded,
    historyInitialized,
    setHistoryInitialized,
    applyState,
    removeSession: (id: string) =>
      batch(() => {
        history.remove(id)
        tabs.set((rows) => rows.filter((row) => row !== id))
        setManagedSessions(managedSessions().filter((row) => row.id !== id))
        setTabOrder((previous) =>
          Object.fromEntries(Object.entries(previous).map(([key, rows]) => [key, rows.filter((row) => row !== id)])),
        )
        setPinnedTabs((previous) =>
          Object.fromEntries(Object.entries(previous).map(([key, rows]) => [key, rows.filter((row) => row !== id)])),
        )
        setMemory((previous) => Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== id)))
        setSessionMemory((previous) => Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== id)))
      }),
    tabMemory,
    sessionRestore,
    worktrees,
    setWorktrees,
    managedSessions,
    setManagedSessions,
    sections,
    setSections,
    staleWorktreeIds,
    setStaleWorktreeIds,
    worktreeHealth,
    setWorktreeHealth,
    orphanDirectories,
    setOrphanDirectories,
    tabOrder,
    setTabOrder,
    pinnedTabs,
    setPinnedTabs,
    worktreeOrder,
    setWorktreeOrder,
    sessionsCollapsed,
    setSessionsCollapsed,
    defaultBaseBranch,
    setDefaultBaseBranch,
    runScriptConfigured,
    setRunScriptConfigured,
    prStatuses,
    setPrStatuses,
    runStatuses,
    setRunStatuses,
    worktreeStats,
    setWorktreeStats,
    localStats,
    setLocalStats,
    busy,
    setBusy,
  }
}

export type ProjectStore = ReturnType<typeof createProjectStore>
