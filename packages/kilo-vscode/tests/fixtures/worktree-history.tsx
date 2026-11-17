import { render } from "solid-js/web"
import type { HistoryMessage, HistoryRequest } from "../../src/shared/agent-history"
import { post } from "../../webview-ui/src/utils/webview-message"
import { VSCodeProvider, getVSCodeAPI } from "../../webview-ui/src/context/vscode"
import { LanguageProvider } from "../../webview-ui/src/context/language"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { HistorySidebar } from "../../webview-ui/src/stories/agent-manager-history"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/agent-manager/agent-manager.css"

const params = new URLSearchParams(location.search)
applyKiloTheme("kilo-vscode", applyVscodeTheme(params.get("theme") ?? "dark-modern"))
const root = document.createElement("main")
root.style.cssText = `width:${params.get("width") ?? "280"}px;height:760px`
document.body.append(root)
render(
  () => (
    <VSCodeProvider>
      <LanguageProvider>
        <DialogProvider>
          <HistorySidebar
            total={Number(params.get("total") ?? 75)}
            worktrees={Number(params.get("worktrees") ?? 2)}
            collapsed={params.has("collapsed")}
            legacy={params.has("legacy")}
            bulk={params.has("bulk")}
            transfer={params.has("transfer")}
          />
        </DialogProvider>
      </LanguageProvider>
    </VSCodeProvider>
  ),
  root,
)
// The metadata-only host keeps its existing adoption simulation for both open boundaries.
const api = getVSCodeAPI()
const send = api.postMessage
let held = false
let pending: HistoryRequest | undefined
let failed: HistoryMessage | undefined
let generation = 0
window.addEventListener("message", (event) => {
  if (event.data?.type === "agentManager.history") generation = Math.max(generation, event.data.generation)
})
const respond = (error?: string, newer = false) => {
  if (!pending) return
  const message = pending
  pending = undefined
  if (!error) return send(message)
  failed = {
    ...message,
    type: "agentManager.history",
    rows: [],
    loading: false,
    more: true,
    generation: generation + (newer ? 10 : 0),
    error,
  }
  post(failed)
}
window.addEventListener("history-control", (event) => {
  const action = (event as CustomEvent<string>).detail
  held = action === "hold"
  if (action === "release") respond()
  if (action === "fail") respond("History unavailable")
  if (action === "unavailable") respond("The project is not ready.", true)
  if (action === "stale" && failed) post({ ...failed, generation: generation + 10 })
})
api.postMessage = (message) => {
  if (message.type === "agentManager.requestHistory" && message.active !== false && held) {
    pending = message
    return
  }
  if (message.type === "agentManager.openSessionInTab" && held) {
    post({
      ...message,
      type: "agentManager.historyOpenFailed",
      error: "Could not open conversation",
    })
    return
  }
  send(
    message.type === "agentManager.openSessionInTab"
      ? {
          ...message,
          type: "agentManager.openHistorySession",
          worktreeId: message.worktreeId ?? null,
          requestId: message.requestId!,
        }
      : message,
  )
}
