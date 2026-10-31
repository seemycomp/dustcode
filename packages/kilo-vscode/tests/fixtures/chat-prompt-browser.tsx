import { createSignal, Show } from "solid-js"
import { render } from "solid-js/web"
import { StoryProviders, defaultMockData, mockSessionValue } from "../../webview-ui/src/stories/StoryProviders"
import { SessionContext } from "../../webview-ui/src/context/session"
import type { SessionContextValue } from "../../webview-ui/src/context/session-types"
import { MessageList } from "../../webview-ui/src/components/chat/MessageList"
import { PromptInput } from "../../webview-ui/src/components/chat/PromptInput"
import { post } from "../../webview-ui/src/utils/webview-message"
import { TaskHeader } from "../../webview-ui/src/components/chat/TaskHeader"
import type { Message, Part } from "../../webview-ui/src/types/messages"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/src/styles/chat.css"

applyKiloTheme("kilo-vscode", applyVscodeTheme("dark-modern"))
const sid = "prompt-browser"
const prompt = Array.from({ length: 8 }, (_, i) => `Prompt line ${i + 1}: preserve this full original text.`).join("\n")
const answer = Array.from({ length: 35 }, (_, i) => `Assistant paragraph ${i + 1}. Readable chat lane proof.`).join(
  "\n\n",
)
const messages: Message[] = Array.from({ length: 31 }, (_, i) => [
  { id: `user-${i}`, sessionID: sid, role: "user" as const, time: { created: i * 100 } },
  {
    id: `assistant-${i}`,
    sessionID: sid,
    role: "assistant" as const,
    parentID: `user-${i}`,
    time: { created: i * 100 + 50 },
    finish: i === 30 ? "tool-calls" : "stop",
    providerID: "kilo",
    modelID: "anthropic/claude-sonnet-4-6",
    agent: "code",
  },
]).flat()
const parts: Record<string, Part[]> = Object.fromEntries(
  messages.map((message) => [
    message.id,
    [
      {
        id: `part-${message.id}`,
        sessionID: sid,
        messageID: message.id,
        type: "text",
        text: message.role === "user" ? prompt : answer,
      },
    ],
  ]),
)
for (const message of messages.filter((message) => message.role === "user")) {
  parts[message.id]!.push({
    id: `image-${message.id}`,
    sessionID: sid,
    messageID: message.id,
    type: "file",
    mime: "image/gif",
    filename: "pixel.gif",
    url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  })
}

function App() {
  const [revision, refresh] = createSignal(0)
  const session = {
    ...mockSessionValue({ id: sid, status: "busy" }),
    messages: () => messages,
    visibleMessages: () => messages,
    contextUsage: () => ({ tokens: 25533, percentage: 13 }),
    status: () => (location.search.includes("composer") ? "idle" : "busy"),
    compact: () => document.body.setAttribute("data-compacted", "true"),
    userMessages: () => messages.filter((message) => message.role === "user"),
    statusInfo: () => ({ type: "busy" as const }),
    getParts: (message: string | Message) => {
      revision()
      const id = typeof message === "string" ? message : message.id
      return (parts[id] ?? []).map((part) => ({ ...part }))
    },
    resubmitMessage: async () => true,
  }
  return (
    <StoryProviders data={{ ...defaultMockData, message: { [sid]: messages }, part: parts }} noPadding config={{}}>
      <SessionContext.Provider value={session as unknown as SessionContextValue}>
        <button
          data-testid="refresh-parts"
          onClick={() => refresh((value) => value + 1)}
          style={{ position: "fixed", right: "20px", bottom: "20px", "z-index": 20 }}
        >
          Refresh parts
        </button>
        <div class="chat-view" style={{ height: "100vh" }}>
          <Show when={location.search.includes("composer")} fallback={<MessageList />}>
            <TaskHeader />
            <PromptInput />
          </Show>
        </div>
      </SessionContext.Provider>
    </StoryProviders>
  )
}
render(() => <App />, document.body)
post({ type: "connectionState", state: "connected" })
