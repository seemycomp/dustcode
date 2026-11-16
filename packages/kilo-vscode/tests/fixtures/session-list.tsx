import { render } from "solid-js/web"
import { ProviderShell } from "../../webview-ui/src/context/provider-shell"
import SessionList from "../../webview-ui/src/components/history/SessionList"
import { historyRowActions } from "../../webview-ui/agent-manager/history-actions"
import { useLanguage } from "../../webview-ui/src/context/language"
import { SessionContext, useSession } from "../../webview-ui/src/context/session"
import { post } from "../../webview-ui/src/utils/webview-message"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/src/styles/history.css"

applyKiloTheme("kilo-vscode", applyVscodeTheme("dark-modern"))
const messages: WebviewMessage[] = []
const sessions = ["saved", "sidebar-pending:draft", "cloud:preview"].map((id) => ({
  id,
  title: `${id} conversation with a long descriptive title`,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
}))
Object.assign(window, {
  acquireVsCodeApi: () => ({
    getState: () => undefined,
    setState: () => {},
    postMessage: (message: WebviewMessage) => {
      messages.push(message)
      document.body.dataset.messages = JSON.stringify(messages)
      queueMicrotask(() => {
        if (message.type === "webviewReady") post({ type: "connectionState", state: "connected" })
        if (message.type === "requestSessions") post({ type: "sessionsLoaded", sessions })
      })
    },
  }),
})

function History() {
  const language = useLanguage()
  const session = useSession()
  const actions = historyRowActions({
    t: language.t,
    onPromote: (id) => (document.body.dataset.promote = id),
    onLocal: (id) => (document.body.dataset.local = id),
  })
  return (
    <SessionContext.Provider value={{ ...session, sessions: () => sessions }}>
      <SessionList separateTabs rowActions={actions} onSelectSession={(id) => (document.body.dataset.selected = id)} />
    </SessionContext.Provider>
  )
}

const root = document.createElement("main")
root.style.cssText = "height:100vh;width:100vw"
document.body.append(root)
render(
  () => (
    <ProviderShell.Root>
      <ProviderShell.Session>
        <History />
      </ProviderShell.Session>
    </ProviderShell.Root>
  ),
  root,
)
queueMicrotask(() => {
  post({ type: "connectionState", state: "connected" })
  post({ type: "sessionsLoaded", sessions })
})
