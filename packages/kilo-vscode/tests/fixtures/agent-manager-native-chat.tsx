import { render } from "solid-js/web"
import { AgentManagerApp } from "../../webview-ui/agent-manager/AgentManagerApp"
import { post } from "../../webview-ui/src/utils/webview-message"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import type {
  AgentManagerStateMessage,
  AgentProjectSnapshot,
  ExtensionMessage,
  WebviewMessage,
} from "../../webview-ui/src/types/messages"
import "@kilocode/kilo-ui/styles"

applyKiloTheme("kilo-vscode", applyVscodeTheme(new URLSearchParams(location.search).get("theme") ?? "dark-modern"))
const projects: AgentProjectSnapshot[] = ["a", "b"].map((id) => ({
  id,
  root: `/repos/${id}`,
  label: `Project ${id.toUpperCase()}`,
  expanded: true,
  active: id === "a",
  pinned: false,
  initialized: true,
  missing: false,
}))
const states: Record<string, AgentManagerStateMessage> = Object.fromEntries(
  projects.map(({ id }) => [
    id,
    {
      type: "agentManager.state",
      projectId: id,
      isGitRepo: true,
      worktrees: [
        {
          id: "w",
          branch: `feature/${id}`,
          path: `/repos/${id}/w`,
          parentBranch: "main",
          remote: "origin",
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
      sessions: [
        { id: `${id}-local`, worktreeId: null, createdAt: "2026-11-01T00:00:00Z" },
        { id: `${id}-worktree`, worktreeId: "w", createdAt: "2026-11-01T00:00:00Z" },
      ],
      sections: [],
      historyInitialized: true,
      historyExpanded: { local: true, w: true },
    } satisfies AgentManagerStateMessage,
  ]),
)
const messages: WebviewMessage[] = []
const sessions = (id: string) =>
  states[id]!.sessions.map((row) => ({
    ...row,
    title: `${row.id} chat`,
    parentID: null,
    updatedAt: "2026-11-01T00:00:00Z",
  }))
let saved: unknown = { projects: { a: { localSessionIDs: ["a-local"] } } }
let active = "a"
let ready = !new URL(window.location.href).searchParams.has("cold")
const catalog = () => {
  post({ type: "agentManager.projects", projects: [...projects] })
  for (const state of Object.values(states)) post(state)
}
const select = (
  target:
    | { projectId: string; kind: "local" }
    | { projectId: string; kind: "session"; sessionId: string }
    | { projectId: string; kind: "worktree"; worktreeId: string },
) => {
  active = target.projectId
  for (const project of projects) project.active = project.id === active
  catalog()
  post(states[active]!)
  post({ type: "sessionsLoaded", sessions: sessions(active), projectId: active })
  post({ type: "agentManager.selectionActivated", target })
}
const send = (message: WebviewMessage) => {
  messages.push(message)
  document.body.dataset.messages = JSON.stringify(messages)
  queueMicrotask(() => {
    if (!ready) return
    if (message.type === "agentManager.requestProjects") catalog()
    if (message.type === "agentManager.requestState") post(states[active]!)
    if (message.type === "requestSessions")
      post({ type: "sessionsLoaded", sessions: sessions(active), projectId: active })
    if (message.type === "agentManager.requestHistory" && message.active !== false)
      post({
        ...message,
        type: "agentManager.history",
        generation: 1,
        loading: false,
        more: false,
        rows: sessions(message.projectId).filter((row) => row.worktreeId === message.worktreeId),
      })
    if (message.type === "agentManager.activateSelection") {
      select(message.target)
    }
    if (message.type === "agentManager.openSessionInTab" && message.requestId)
      select({ projectId: message.projectId, kind: "session", sessionId: message.sessionId })
    if (message.type === "agentManager.openHistorySession")
      select({ projectId: message.projectId, kind: "session", sessionId: message.sessionId })
    if (message.type === "loadMessages")
      post({ type: "messagesLoaded", sessionID: message.sessionID, messages: [], hasMore: false })
  })
}
Object.assign(window, {
  acquireVsCodeApi: () => ({
    postMessage: send,
    getState: () => saved,
    setState: (value: unknown) => {
      saved = value
    },
  }),
})
window.addEventListener("native-fixture", (event) => {
  const detail = (event as CustomEvent<ExtensionMessage | "clear" | "initialize">).detail
  if (detail === "initialize") {
    ready = true
    catalog()
    post({ type: "sessionsLoaded", sessions: sessions(active), projectId: active })
    return
  }
  if (detail === "clear") {
    messages.length = 0
    document.body.dataset.messages = "[]"
    return
  }
  post(detail)
})
const root = document.createElement("main")
root.style.cssText = "height:100vh;width:100vw"
document.body.append(root)
render(() => <AgentManagerApp />, root)
queueMicrotask(() => ready && post({ type: "sessionsLoaded", sessions: sessions(active), projectId: active }))
