import { createSignal, onCleanup, onMount } from "solid-js"
import { ProjectList } from "../../agent-manager/ProjectList"
import { createModeRouter } from "../../agent-manager/mode-router"
import { getVSCodeAPI } from "../context/vscode"
import { useLanguage } from "../context/language"
import { post } from "../utils/webview-message"
import type {
  AgentManagerSidebarTarget,
  AgentManagerStateMessage,
  AgentProjectSnapshot,
  WebviewMessage,
} from "../types/messages"
import type { HistoryRequest, HistoryRow } from "../../../src/shared/agent-history"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { SessionTransferDialog } from "../../agent-manager/SessionTransferDialog"
import type { Activity } from "../utils/session-activity"

/** Real sidebar with a deterministic metadata-only host, shared by stories and browser checks. */
export function HistorySidebar(props: {
  total?: number
  worktrees?: number
  collapsed?: boolean
  legacy?: boolean
  bulk?: boolean
  transfer?: boolean
}) {
  const { t } = useLanguage()
  const dialog = useDialog()
  const expanded: Record<string, boolean> = props.collapsed || props.legacy ? {} : { local: true, "w-0": true }
  const [projects, setProjects] = createSignal<AgentProjectSnapshot[]>(
    ["a", "b"].map((id) => ({
      id,
      root: `/repos/${id}`,
      label: `Project ${id.toUpperCase()}`,
      expanded: true,
      active: id === "b",
      pinned: id === "a",
      initialized: true,
      missing: false,
    })),
  )
  const [selected, setSelected] = createSignal("b")
  const [selection, setSelection] = createSignal("w-0")
  const [session, setSession] = createSignal<string>()
  const [busySession, setBusySession] = createSignal<string>()
  const [activity, setActivity] = createSignal<Activity>("busy")
  const initialStates: Record<string, AgentManagerStateMessage> = Object.fromEntries(
    ["a", "b"].map((id) => [
      id,
      {
        type: "agentManager.state",
        projectId: id,
        isGitRepo: true,
        worktrees: Array.from({ length: id === "a" ? (props.worktrees ?? 2) : 2 }, (_, index) => ({
          id: `w-${index}`,
          branch: `feature/task-${index}`,
          parentBranch: "main",
          label: `Task ${index}`,
          path: `/repos/${id}/w-${index}`,
          createdAt: "2026-11-01T00:00:00Z",
        })),
        sessions: [],
        sections: [{ id: "section", name: "In progress", color: null, order: 0, collapsed: false }],
        historyExpanded: expanded as Record<string, boolean>,
        historyInitialized: !props.legacy,
      } satisfies AgentManagerStateMessage,
    ]),
  )
  const [states, setStates] = createSignal<Record<string, AgentManagerStateMessage>>(initialStates)
  const requests: HistoryRequest[] = []
  const opens: WebviewMessage[] = []
  const limits = new Map<string, number>()
  let initial = false
  let next = false
  let generation = 0
  let renamed = false
  const all = (): HistoryRow[] =>
    Array.from({ length: props.total ?? 75 }, (_, index) => ({
      id: `history-${String(index).padStart(5, "0")}`,
      title:
        index === 0
          ? `${renamed ? "Renamed: " : ""}Lịch sử trò chuyện rất dài không bị mất tiêu đề khi thu hẹp thanh bên`
          : index === 1
            ? "محادثة طويلة لاختبار اتجاه النص والعنوان الكامل"
            : index === 4500
              ? "Needle beyond discovery limit"
              : `Conversation ${String(index).padStart(5, "0")}`,
      updatedAt: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
    }))
  const update = (id: string, fn: (state: AgentManagerStateMessage) => AgentManagerStateMessage) => {
    setStates((prev) => ({ ...prev, [id]: fn(prev[id]!) }))
  }
  const acknowledge = (target: AgentManagerSidebarTarget) => {
    setSelected(target.projectId)
    if (target.kind === "session") {
      const entry = states()[target.projectId]!.sessions.find((item) => item.id === target.sessionId)
      setSelection(entry?.worktreeId ?? "local")
      setSession(target.sessionId)
    }
    if (target.kind === "worktree") {
      setSelection(target.worktreeId)
      setSession(undefined)
    }
    if (target.kind === "local") {
      setSelection("local")
      setSession(undefined)
    }
    post({ type: "agentManager.selectionActivated", target })
  }
  const api = getVSCodeAPI()
  const original = api.postMessage
  const menu = (message: WebviewMessage) => {
    if (message.type === "agentManager.setPinnedTabs") {
      document.body.dataset.historyMenu = JSON.stringify(message)
      update(message.projectId!, (state) => ({
        ...state,
        pinnedTabs: { ...state.pinnedTabs, [message.key]: message.ids },
      }))
      return true
    }
    if (message.type === "agentManager.closeSession") {
      document.body.dataset.historyMenu = JSON.stringify(message)
      update(message.projectId!, (state) => ({
        ...state,
        sessions: state.sessions.filter((row) => row.id !== message.sessionId),
      }))
      return true
    }
    if (
      message.type === "agentManager.forkSession" ||
      message.type === "agentManager.promoteSession" ||
      message.type === "agentManager.addSessionToWorktree"
    ) {
      document.body.dataset.historyMenu = JSON.stringify(message)
      return true
    }
    return false
  }
  const transfer = (message: WebviewMessage) => {
    if (message.type !== "agentManager.sessionTransfer") return false
    document.body.dataset.historyTransfer = JSON.stringify(message)
    if (message.phase === "targets")
      queueMicrotask(() =>
        post({
          ...message,
          type: "agentManager.sessionTransferResult",
          targets: [{ id: "w-1", name: "Other worktree", path: "/repos/a/w-1" }],
          files: ["selected.ts", "other.ts"],
        }),
      )
    if (message.phase === "preview")
      queueMicrotask(() =>
        post({
          ...message,
          type: "agentManager.sessionTransferResult",
          preview: {
            revision: "revision",
            fingerprint: "fingerprint",
            files: message.selectedFiles?.map((path) => ({ path, kind: "modified", sourceHash: "hash" })) ?? [],
          },
        }),
      )
    if (message.phase === "commit")
      queueMicrotask(() =>
        post({
          ...message,
          type: "agentManager.sessionTransferResult",
          result: {
            sessionID: message.action === "move" ? message.sourceSessionId : "copied-session",
            action: message.action,
            directory: "/repos/a/w-1",
          },
        }),
      )
    return true
  }
  api.postMessage = (message) => {
    if (transfer(message)) return
    if (menu(message)) return
    if (message.type === "agentManager.requestHistory") {
      requests.push(message)
      document.body.dataset.historyRequests = String(requests.filter((item) => item.active !== false).length)
      if (message.active === false) return
      const key = `${message.projectId}:${message.worktreeId}:${message.query}`
      const size = message.more ? (limits.get(key) ?? 30) + 30 : (limits.get(key) ?? 30)
      limits.set(key, size)
      const source = all().filter((row) => row.title.toLowerCase().includes(message.query.toLowerCase()))
      const error = message.more && next ? "Next page failed" : initial ? "Initial load failed" : undefined
      next = false
      const reply = {
        ...message,
        type: "agentManager.history",
        generation: message.refresh ? ++generation : generation,
        rows: error ? [] : source.slice(0, size),
        more: size < source.length,
        loading: false,
        error,
      }
      setTimeout(() => post(reply), message.query === "old" ? 350 : 10)
      return
    }
    if (message.type === "agentManager.setHistoryExpanded") {
      update(message.projectId, (state) => ({
        ...state,
        historyInitialized: true,
        historyExpanded: { ...state.historyExpanded, [message.worktreeId ?? "local"]: message.expanded },
      }))
      return
    }
    if (message.type === "agentManager.openHistorySession") {
      opens.push(message)
      document.body.dataset.historyOpens = String(opens.length)
      update(message.projectId, (state) => ({
        ...state,
        sessions: [
          ...state.sessions.filter((row) => row.id !== message.sessionId),
          { id: message.sessionId, worktreeId: message.worktreeId, createdAt: "2026-11-01T00:00:00Z" },
        ],
      }))
      queueMicrotask(() => acknowledge({ projectId: message.projectId, kind: "session", sessionId: message.sessionId }))
      return
    }
    if (message.type === "agentManager.setWorktreePinned") {
      document.body.dataset.historyPins = String(Number(document.body.dataset.historyPins ?? 0) + 1)
      update(message.projectId!, (state) => ({
        ...state,
        worktrees: state.worktrees.map((row) =>
          row.id === message.worktreeId ? { ...row, pinned: message.pinned } : row,
        ),
      }))
      return
    }
    if (message.type === "agentManager.setProjectExpanded") {
      setProjects((prev) =>
        prev.map((row) => (row.id === message.projectId ? { ...row, expanded: message.expanded } : row)),
      )
      return
    }
    if (message.type === "agentManager.activateSelection") {
      acknowledge(message.target)
      return
    }
  }
  const command = (event: Event) => {
    const detail = (event as CustomEvent<{ action: string }>).detail
    if (detail.action === "ack") acknowledge({ projectId: "b", kind: "worktree", worktreeId: "w-0" })
    if (detail.action === "initial-fail") initial = true
    if (detail.action === "recover") initial = false
    if (detail.action === "next-fail") next = true
    if (detail.action === "rename") renamed = true
    if (detail.action === "pin")
      api.postMessage({
        type: "agentManager.setWorktreePinned",
        projectId: "a",
        worktreeId: "w-0",
        pinned: !states().a!.worktrees.at(0)!.pinned,
      })
    if (detail.action === "section")
      update("a", (state) => ({
        ...state,
        worktrees: state.worktrees.map((row) =>
          row.id === "w-0" ? { ...row, sectionId: row.sectionId ? undefined : "section" } : row,
        ),
      }))
    if (detail.action === "accordion")
      setProjects((prev) => prev.map((row) => (row.id === "a" ? { ...row, expanded: !row.expanded } : row)))
    if (detail.action === "stream")
      post({ type: "messagePartUpdated", part: { id: "part", type: "text", text: "stream" } })
    if (detail.action === "menu-tabs")
      update("a", (state) => ({
        ...state,
        sessions: [0, 1, 2].map((index) => ({
          id: `history-${String(index).padStart(5, "0")}`,
          worktreeId: "w-0",
          createdAt: "2026-11-01T00:00:00Z",
        })),
        tabOrder: { "w-0": ["history-00000", "history-00001", "history-00002"] },
        pinnedTabs: { "w-0": ["history-00002"] },
      }))
    if (detail.action === "menu-busy") {
      setBusySession("history-00000")
      setActivity("busy")
    }
    if (detail.action === "menu-waiting") setActivity("waiting")
    if (detail.action === "menu-error") setActivity("error")
    if (detail.action === "menu-idle") setActivity("idle")
  }
  window.addEventListener("history-fixture", command)
  onMount(() => {
    document.body.dataset.historyRequests = "0"
    document.body.dataset.historyOpens = "0"
  })
  onCleanup(() => {
    api.postMessage = original
    window.removeEventListener("history-fixture", command)
  })
  return (
    <div class="am-sidebar" style={{ width: "100%", height: "100%" }}>
      <ProjectList
        mode={createModeRouter()}
        projects={projects()}
        states={states()}
        stats={{}}
        local={{
          a: { branch: "main", files: 0, additions: 0, deletions: 0, ahead: 0, behind: 0 },
          b: { branch: "main", files: 0, additions: 0, deletions: 0, ahead: 0, behind: 0 },
        }}
        prs={{}}
        sessions={{}}
        selectedProject={selected()}
        selection={selection()}
        currentSessionID={session}
        busy={() => false}
        blocked={() => false}
        activityFor={() => "idle"}
        sessionActivity={(id) => (id === busySession() ? activity() : "idle")}
        historyActions={{
          new: (projectId, worktreeId) => {
            if (worktreeId) return api.postMessage({ type: "agentManager.addSessionToWorktree", projectId, worktreeId })
            document.body.dataset.historyMenu = JSON.stringify({ type: "newLocalDraft", projectId })
          },
          close: (projectId, sessionId) => api.postMessage({ type: "agentManager.closeSession", projectId, sessionId }),
          tabs: () => undefined,
          transfer: props.transfer
            ? (projectId, worktreeId, sessionId, action, create) =>
                dialog.show(() => (
                  <SessionTransferDialog
                    projectId={projectId}
                    sourceWorktreeId={worktreeId}
                    sourceSessionId={sessionId}
                    action={action}
                    create={create}
                    onClose={() => dialog.close()}
                    onCommitted={(result) => {
                      document.body.dataset.historyTransferred = result.sessionID
                    }}
                  />
                ))
            : undefined,
        }}
        shortcutMap={() =>
          new Map([
            ["a:local", 1],
            ["a:wt:w-0", 2],
          ])
        }
        bindings={{}}
        t={t}
        onSearchRef={() => {}}
        onShortcuts={() => {}}
        onHistory={() => {}}
      />
    </div>
  )
}
