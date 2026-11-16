import { render } from "solid-js/web"
import { createEffect, onCleanup } from "solid-js"
import { ProviderShell } from "../../webview-ui/src/context/provider-shell"
import { LocalTabsProvider, useLocalTabs } from "../../webview-ui/src/context/local-tabs"
import { ChatView } from "../../webview-ui/src/components/chat/ChatView"
import App, { DataBridge } from "../../webview-ui/src/App"
import { WorkStyleProvider } from "../../webview-ui/src/context/work-style"
import { post } from "../../webview-ui/src/utils/webview-message"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import type { ExtensionMessage, WebviewMessage } from "../../webview-ui/src/types/messages"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/src/styles/chat.css"

applyKiloTheme("kilo-vscode", applyVscodeTheme("dark-modern"))
const scope = { projectId: "a", projectLabel: "Project A", label: "feature/independent-worktree" }
const params = new URLSearchParams(location.search)
const tab = { sessionID: "s1", restore: params.has("restore"), context: "opaque-original", scope }
const native = params.get("surface") !== "sidebar"
let saved: unknown = params.has("stale")
  ? { sidebarSessionTabIDs: ["unrelated", "s1"], sidebarActiveSessionTabID: "unrelated" }
  : native
    ? {}
    : { sidebarSessionTabIDs: ["s1", "s2"], sidebarActiveSessionTabID: "s1" }
const messages: WebviewMessage[] = []
Object.assign(window, {
  KILO_TOP_BAR: true,
  KILO_TOP_BAR_SURFACE: native ? "tab_title" : "sidebar_body",
  KILO_NATIVE_SESSION_TAB: native && (!params.has("deferred") || params.has("restore")) ? tab : undefined,
  acquireVsCodeApi: () => ({
    postMessage: (message: WebviewMessage) => {
      messages.push(message)
      document.body.dataset.messages = JSON.stringify(messages)
      if (message.type === "webviewReady")
        queueMicrotask(() => {
          if (!params.has("deferred")) post({ type: "ready", nativeSessionTab: native ? tab : undefined })
          post({ type: "connectionState", state: "connected" })
        })
    },
    getState: () => saved,
    setState: (value: unknown) => {
      saved = value
      document.body.dataset.saved = JSON.stringify(value)
    },
  }),
})
window.addEventListener("scope-message", (event) => post((event as CustomEvent<ExtensionMessage>).detail))
window.addEventListener("scope-ready", () => post({ type: "ready", nativeSessionTab: tab }))
function Content() {
  const tabs = useLocalTabs()!
  const clear = () => tabs.add()
  const open = () => tabs.open("s2")
  createEffect(() => {
    document.body.dataset.tabs = JSON.stringify({ ids: tabs.ids(), active: tabs.active(), pending: tabs.pending() })
  })
  window.addEventListener("scope-new", clear)
  window.addEventListener("scope-open", open)
  onCleanup(() => {
    window.removeEventListener("scope-new", clear)
    window.removeEventListener("scope-open", open)
  })
  return <ChatView interactivePrompts={params.has("deletion")} />
}
const root = document.createElement("main")
document.body.append(root)
render(
  () =>
    params.has("app") ? (
      <App />
    ) : (
      <ProviderShell.Root>
        <WorkStyleProvider>
          <ProviderShell.Session>
            <LocalTabsProvider>
              <ProviderShell.Chat>
                <DataBridge>
                  <Content />
                </DataBridge>
              </ProviderShell.Chat>
            </LocalTabsProvider>
          </ProviderShell.Session>
        </WorkStyleProvider>
      </ProviderShell.Root>
    ),
  root,
)
