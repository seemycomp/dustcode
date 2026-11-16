import { getVSCodeAPI } from "../../webview-ui/src/context/vscode"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"
import { post } from "../../webview-ui/src/utils/webview-message"

document.body.dataset.agentManagerPresentation = "sidebar"
void import("./agent-manager-native-chat").then(() => {
  const api = getVSCodeAPI()
  const send = api.postMessage
  api.postMessage = (message) => {
    send(message)
    if (
      message.type === "agentManager.requestHistory" &&
      message.projectId === "b" &&
      message.worktreeId === new URLSearchParams(location.search).get("wt") &&
      message.active !== false
    )
      queueMicrotask(() =>
        post({
          ...message,
          type: "agentManager.history",
          generation: 2,
          loading: false,
          more: false,
          rows: [{ id: "b-worktree", title: "b-worktree chat", updatedAt: "2026-11-01T00:00:00Z" }],
        }),
      )
    if (message.type === "deleteSession")
      void (window as unknown as { deleteHistory: (message: WebviewMessage) => Promise<void> }).deleteHistory(message)
  }
  document.body.dataset.deletionReady = "true"
})
