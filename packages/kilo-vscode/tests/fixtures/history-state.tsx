import assert from "node:assert/strict"
import { createRoot } from "solid-js"
import { createProjectStore } from "../../webview-ui/agent-manager/project/store"

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
console.log("History state: scoped persistence and remount lifetime passed")
