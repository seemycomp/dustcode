import { expect, it } from "bun:test"
import { createNativeChat } from "../../webview-ui/agent-manager/native-chat"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"

it("opens independent scoped Local and worktree drafts without creating backend sessions", () => {
  const sent: WebviewMessage[] = []
  const chat = createNativeChat((message) => sent.push(message))
  chat.draft("b", null)
  chat.draft("b", "w")
  chat.draft("a", "w")
  chat.draft("b", "w")
  expect(sent).toEqual(
    [
      ["b", null],
      ["b", "w"],
      ["a", "w"],
      ["b", "w"],
    ].map(([projectId, worktreeId]) => ({
      type: "agentManager.openDraftInTab",
      projectId,
      worktreeId,
    })),
  )
})

it("separates explicit qualified activation from inspection and correlated creation completions", () => {
  const sent: WebviewMessage[] = []
  const chat = createNativeChat((message) => sent.push(message))
  chat.activate({ projectId: "a", kind: "local" })
  chat.activate({ projectId: "b", kind: "worktree", worktreeId: "w" })
  chat.added("a", "w", "background")
  chat.forked("a", "source", "background")
  chat.setup("a", "w", "background", "ready")
  expect(sent).toEqual([])
  chat.activate({ projectId: "a", kind: "session", sessionId: "same" })
  chat.activate({ projectId: "b", kind: "session", sessionId: "same" })
  chat.activate({ projectId: "a", kind: "session", sessionId: "same" })
  expect(sent).toEqual(
    ["a", "b", "a"].map((projectId) => ({ type: "agentManager.openSessionInTab", projectId, sessionId: "same" })),
  )
  sent.length = 0
  const request = chat.add("b", "w")
  sent.length = 0
  chat.added("a", "w", "wrong", request)
  chat.added("b", "other", "wrong", request)
  chat.added("b", "w", "created", request)
  chat.added("b", "w", "duplicate", request)
  chat.fork("a", "source")
  chat.forked("b", "source", "wrong")
  chat.forked("a", "other", "wrong")
  chat.forked("a", "source", "fork")
  chat.forked("a", "source", "duplicate")
  expect(sent).toEqual([
    { type: "agentManager.openSessionInTab", projectId: "b", sessionId: "created" },
    { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "fork" },
  ])
})

it("opens each explicitly requested worktree version once and ignores known worktrees and background projects", () => {
  const sent: WebviewMessage[] = []
  const chat = createNativeChat((message) => sent.push(message))
  chat.create("a", ["existing"], 2)
  chat.setup("a", "existing", "old", "ready")
  chat.setup("b", "one", "wrong", "ready")
  chat.setup("a", "one", undefined, "starting")
  chat.setup("a", "one", "first", "ready")
  chat.setup("a", "one", "first", "ready")
  chat.setup("a", "two", "second", "ready")
  chat.setup("a", "three", "background", "ready")
  expect(sent).toEqual([
    { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "first" },
    { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "second" },
  ])
})

it("settles exact additions after failures and reversed mixed completions", () => {
  const sent: WebviewMessage[] = []
  const chat = createNativeChat((message) => sent.push(message))
  const failed = chat.add("b", "w", true)
  chat.failed("a", "w", failed)
  chat.failed("b", "w", failed)
  const menu = chat.add("b", "w")
  const toolbar = chat.add("b", "w", true)
  const other = chat.add("a", "w", true)
  sent.length = 0
  expect(chat.added("b", "w", "late", failed)).toBeUndefined()
  expect(chat.added("a", "w", "wrong", toolbar)).toBeUndefined()
  expect(chat.added("b", "other", "wrong", toolbar)).toBeUndefined()
  expect(chat.added("b", "w", "background")).toBeUndefined()
  expect(chat.added("b", "w", "native", toolbar)).toBe(true)
  expect(chat.added("b", "w", "managed", menu)).toBe(false)
  expect(chat.added("a", "w", "other", other)).toBe(true)
  expect(chat.added("b", "w", "duplicate", toolbar)).toBeUndefined()
  expect(sent).toEqual([
    { type: "agentManager.openSessionInTab", projectId: "b", sessionId: "native" },
    { type: "agentManager.openSessionInTab", projectId: "b", sessionId: "managed" },
    { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "other" },
  ])
})
