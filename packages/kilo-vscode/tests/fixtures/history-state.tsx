import assert from "node:assert/strict"
import { createRoot } from "solid-js"
import { createProjectStore } from "../../webview-ui/agent-manager/project/store"
import { createHistoryState } from "../../webview-ui/agent-manager/history-state"
import type { HistoryMessage, HistoryOpen, HistoryRequest } from "../../src/shared/agent-history"

createRoot((dispose) => {
  const store = createProjectStore("project-b")
  const state = {
    type: "agentManager.state" as const,
    projectId: "project-b",
    worktrees: [{ id: "w", branch: "task", parentBranch: "main", path: "/b/w", createdAt: "2026-11-09T00:00:00Z" }],
    sessions: [],
    isGitRepo: true,
    historyExpanded: { local: false, w: true },
    historyInitialized: true,
  }
  store.applyState(state)
  assert.deepEqual(store.historyExpanded(), { local: false, w: true })
  assert.equal(store.historyInitialized(), true)
  const history = store.history.context("w")
  history.input("needle")
  history.search(true)
  assert.equal(store.history.context("w"), history, "row remounts reuse panel-lifetime presentation state")
  assert.equal(history.text(), "needle")
  assert.equal(history.searching(), true)
  assert.equal(createProjectStore("project-a").history.context("w").text(), "", "projects isolate colliding IDs")
  store.applyState({ ...state, historyExpanded: { local: false, w: false } })
  assert.equal(store.historyExpanded().w, false)
  assert.equal(history.text(), "needle", "host state does not reset panel-only search")
  dispose()
})

await createRoot(async (dispose) => {
  const state = createHistoryState("project")
  const history = state.context(null)
  const requests: HistoryRequest[] = []
  const opens: HistoryOpen[] = []
  history.attach((message) => {
    if (message.type === "agentManager.requestHistory") requests.push(message)
    if (message.type === "agentManager.openHistorySession") opens.push(message)
  })
  const receive = (extra: Partial<HistoryMessage> = {}) => {
    const request = requests.at(-1)!
    state.receive({
      ...request,
      type: "agentManager.history",
      generation: 1,
      rows: [{ id: "cached", title: "Cached", updatedAt: "2026-11-16T00:00:00Z" }],
      loading: false,
      more: true,
      ...extra,
    })
  }
  receive()
  assert.equal(history.current().data.loaded, true)
  history.request()
  receive({ generation: 10, rows: [], error: "Project temporarily unavailable" })
  assert.equal(history.current().data.error, "Project temporarily unavailable")
  assert.equal(history.current().data.rows.length, 1, "a real failed revalidation preserves cached rows and its error")
  state.revalidate()
  const current = requests.at(-1)!
  receive({ generation: 1 })
  assert.equal(history.current().data.loading, false, "a new request can reuse an older host cache generation")
  assert.equal(history.current().data.error, undefined, "successful cached history clears its corresponding error")
  receive({ generation: 0, error: "Obsolete generation" })
  assert.equal(history.current().data.error, undefined, "older generations within the current request are rejected")
  history.request({ more: true })
  receive({ generation: 1, error: "Older page failed" })
  assert.equal(history.current().data.error, "Older page failed")
  assert.equal(history.current().paging, true)
  history.request({ refresh: true })
  receive({ generation: 2 })
  state.receive({
    ...current,
    type: "agentManager.history",
    generation: 99,
    rows: [],
    more: false,
    loading: false,
    error: "Stale request",
  })
  assert.equal(history.current().data.error, undefined, "a superseded request cannot restore its error")
  assert.equal(history.current().data.rows.length, 1)
  history.open("cached", false)
  state.receive({ ...opens.at(-1)!, type: "agentManager.historyOpenFailed", error: "Conversation unavailable" })
  history.request({ refresh: true })
  receive({ generation: 3 })
  assert.equal(
    history.failure(),
    "Conversation unavailable",
    "loading history does not clear an independent opening error",
  )
  history.open("cached", false)
  assert.equal(history.failure(), undefined, "a valid opening attempt clears its corresponding error")

  const cached = history.current()
  const previous = requests.at(-1)!
  history.input("needle")
  await Bun.sleep(225)
  assert.equal(history.query(), "needle")
  receive({ generation: 4, rows: [{ id: "match", title: "needle", updatedAt: "2026-11-16T00:00:00Z" }] })
  state.receive({
    ...previous,
    type: "agentManager.history",
    generation: 99,
    rows: [],
    more: false,
    loading: false,
    error: "Retired query",
  })
  assert.equal(
    cached.data.error,
    undefined,
    "stopping a query retires its request, including replies already in transit",
  )
  assert.equal(history.current().data.rows.at(0)?.id, "match")
  const obsolete = requests.at(-1)!
  history.clear()
  receive({ generation: 1 })
  state.receive({
    ...obsolete,
    type: "agentManager.history",
    generation: 100,
    rows: [],
    more: false,
    loading: false,
    error: "Old search",
  })
  assert.equal(history.current(), cached)
  assert.equal(history.current().data.error, undefined)
  assert.equal(history.current().data.loading, false)
  assert.equal(history.current().data.rows.at(0)?.id, "cached")
  state.dispose()
  dispose()
})
console.log("History state: scoped persistence and remount lifetime passed")
