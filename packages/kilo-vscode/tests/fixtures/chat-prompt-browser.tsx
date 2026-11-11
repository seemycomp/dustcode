import { createSignal, onCleanup, Show } from "solid-js"
import { render } from "solid-js/web"
import { StoryProviders, defaultMockData, mockSessionValue } from "../../webview-ui/src/stories/StoryProviders"
import { SessionContext } from "../../webview-ui/src/context/session"
import type { SessionContextValue } from "../../webview-ui/src/context/session-types"
import { MessageList } from "../../webview-ui/src/components/chat/MessageList"
import { PromptInput } from "../../webview-ui/src/components/chat/PromptInput"
import { post } from "../../webview-ui/src/utils/webview-message"
import { TaskHeader } from "../../webview-ui/src/components/chat/TaskHeader"
import { SessionChanges } from "../../webview-ui/src/components/chat/SessionChanges"
import type { Message, Part, SessionStatus } from "../../webview-ui/src/types/messages"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/src/styles/chat.css"
import { ContextUsagePanel } from "../../webview-ui/src/components/chat/ContextUsagePanel"
import { LocalTabsProvider } from "../../webview-ui/src/context/local-tabs"
import { SessionTabStrip } from "../../webview-ui/src/components/chat/SessionTabStrip"
import { getVSCodeAPI } from "../../webview-ui/src/context/vscode"

applyKiloTheme("kilo-vscode", applyVscodeTheme("dark-modern"))
const sid = "prompt-browser"
if (location.search.includes("tabs")) {
  const api = getVSCodeAPI()
  let state: unknown = { sidebarSessionTabIDs: [sid, "other-session"], sidebarActiveSessionTabID: sid }
  api.getState = () => state
  api.setState = (value) => {
    state = value
  }
  const send = api.postMessage
  api.postMessage = (message) => {
    if (message.type === "forkSession") document.body.dataset.forked = message.sessionId
    send(message)
  }
}
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
const images = [
  [160, 40],
  [40, 160],
].map(([width, height]) => {
  const canvas = document.createElement("canvas")
  canvas.width = width!
  canvas.height = height!
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#0066cc"
  ctx.fillRect(0, 0, canvas.width, 4)
  ctx.fillStyle = "#cc3300"
  ctx.fillRect(0, canvas.height - 4, canvas.width, 4)
  return canvas.toDataURL()
})
for (const message of messages.filter((message) => message.role === "user")) {
  parts[message.id]!.push(
    ...images.map(
      (url, index): Part => ({
        id: `image-${message.id}-${index}`,
        sessionID: sid,
        messageID: message.id,
        type: "file",
        mime: "image/png",
        filename: `${index === 0 ? "landscape" : "portrait"}.png`,
        url,
      }),
    ),
  )
}

if (location.search.includes("internal")) {
  for (const i of [15, 30]) {
    const id = `internal-${i}`
    const reply = `continuation-${i}`
    const index = messages.findIndex((message) => message.id === `assistant-${i}`)
    messages.splice(
      index + 1,
      0,
      { id, sessionID: sid, role: "user", time: { created: i * 100 + 60 } },
      { ...messages.at(index)!, id: reply, parentID: id, time: { created: i * 100 + 70 } },
    )
    parts[id] =
      i === 15 || location.search.includes("compaction")
        ? [{ id: `part-${id}`, messageID: id, type: "compaction", auto: true }]
        : [
            {
              id: `part-${id}`,
              messageID: id,
              type: "text",
              text: "Internal continuation",
              synthetic: true,
              metadata: location.search.includes("background") ? { background: true } : undefined,
            },
          ]
    parts[reply] = [{ id: `part-${reply}`, messageID: reply, type: "text", text: answer }]
  }
}

if (location.search.includes("todos")) {
  parts["assistant-30"]!.push({
    id: "todo-part",
    type: "tool",
    tool: "todowrite",
    callID: "todo-call",
    messageID: "assistant-30",
    sessionID: sid,
    state: {
      status: "completed",
      input: {},
      output: "Updated todos",
      metadata: {
        todos: location.search.includes("complete")
          ? [{ content: "Create test.txt with content test", status: "completed" }]
          : [
              { content: "Review the sticky tracker", status: "completed" },
              { content: "Keep the conversation in place", status: "in_progress" },
              { content: "Verify the floating list", status: "pending" },
            ],
      },
    },
  })
}

if (location.search.includes("updates")) {
  parts["assistant-29"]!.push({
    id: "previous-todos",
    type: "tool",
    tool: "todowrite",
    callID: "previous-todo-call",
    messageID: "assistant-29",
    sessionID: sid,
    state: {
      status: "completed",
      input: {},
      output: "Updated todos",
      metadata: { todos: [{ content: "Previous independent plan", status: "pending" }] },
    },
  })
}

function App() {
  const [revision, refresh] = createSignal(0)
  const [work, update] = createSignal({
    type: "busy" as SessionStatus,
    label: "Thinking",
    submitting: false,
    blocked: false,
  })
  const working = location.search.includes("working")
  const timing = { active: 2000, since: Date.now() }
  const change = (event: Event) => {
    const next = (event as CustomEvent<Partial<ReturnType<typeof work>>>).detail
    update((prev) => ({ ...prev, ...next }))
  }
  window.addEventListener("fixtureStatus", change)
  onCleanup(() => window.removeEventListener("fixtureStatus", change))
  const session = {
    ...mockSessionValue({ id: sid, status: "busy" }),
    messages: () => messages,
    visibleMessages: () => messages,
    contextUsage: () => ({ tokens: 25533, percentage: 13 }),
    status: () => (working ? work().type : location.search.includes("composer") ? "idle" : "busy"),
    submitting: () => working && work().submitting,
    statusText: () => (working ? work().label : "Thinking"),
    busyTiming: () => timing,
    compact: () => document.body.setAttribute("data-compacted", "true"),
    sessions: () => [
      { id: sid, title: "Active session" },
      { id: "other-session", title: "Other session" },
    ],
    activityFor: (id: string) => (location.search.includes("tabs-busy") && id === "other-session" ? "busy" : "idle"),
    isSubmitting: () => false,
    userMessages: () => messages.filter((message) => message.role === "user"),
    statusInfo: () => {
      if (!working) return { type: "busy" as const }
      const type = work().type
      if (type === "retry") return { type, attempt: 1, message: work().label, next: Date.now() + 30000 }
      if (type === "offline") return { type, message: work().label }
      return { type }
    },
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
        <Show when={location.search.includes("updates")}>
          <button
            data-testid="finish-todos"
            onClick={() => {
              const part = parts["assistant-30"]?.find((part) => part.type === "tool" && part.tool === "todowrite")
              if (part?.type !== "tool" || part.state.status !== "completed") return
              const items = part.state.metadata?.todos
              if (!Array.isArray(items)) return
              const id = location.search.includes("internal") ? "continuation-30" : "assistant-30"
              parts[id] = [
                ...(parts[id] ?? []),
                {
                  ...part,
                  id: "todo-final",
                  messageID: id,
                  state: {
                    ...part.state,
                    metadata: { todos: items.map((item) => ({ ...item, status: "completed" })) },
                  },
                },
              ]
              refresh((value) => value + 1)
            }}
            style={{ position: "fixed", right: "20px", bottom: "60px", "z-index": 20 }}
          >
            Finish todos
          </button>
        </Show>
        <div class="chat-view" style={{ height: "100vh" }}>
          <Show
            when={location.search.includes("composer")}
            fallback={<MessageList blocked={working && work().blocked} />}
          >
            <TaskHeader />
            <SessionChanges
              files={[{ file: "example.txt", additions: 1, deletions: 0 }]}
              onAccept={() => {}}
              onReject={() => {}}
              onKeepAll={() => {}}
              onUndoAll={() => {}}
              onReview={() => {}}
              onRetry={() => {}}
            />
            <Show when={location.search.includes("tabs")} fallback={<Composer />}>
              <LocalTabsProvider>
                <SessionTabStrip
                  onMoveToWorktree={(id) => {
                    document.body.dataset.moved = id
                  }}
                />
                <Composer />
              </LocalTabsProvider>
            </Show>
          </Show>
        </div>
      </SessionContext.Provider>
    </StoryProviders>
  )
}

function Composer() {
  const [usage, setUsage] = createSignal(false)
  return (
    <PromptInput
      contextUsage={usage()}
      onContextUsage={() => setUsage((value) => !value)}
      contextUsagePanel={<ContextUsagePanel onClose={() => setUsage(false)} />}
    />
  )
}
render(() => <App />, document.body)
post({ type: "connectionState", state: "connected" })
