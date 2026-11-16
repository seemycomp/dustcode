import { strict as assert } from "node:assert"
import { createRoot } from "solid-js"
import { createProjectStore } from "../../webview-ui/agent-manager/project/store"
import type { HistoryRequest } from "../../src/shared/agent-history"

await createRoot(async (dispose) => {
  const store = createProjectStore("b", { tabs: ["deleted", "keep"] })
  const sibling = createProjectStore("a", { tabs: ["deleted"] })
  store.setManagedSessions([{ id: "deleted", worktreeId: "w", createdAt: "now" }])
  store.setTabOrder({ w: ["deleted", "keep"], local: ["deleted"] })
  store.setPinnedTabs({ w: ["deleted", "keep"] })
  store.tabMemory.set("w", "deleted")
  store.sessionRestore.set("w", "deleted")
  const history = store.history.context("w")
  let request: HistoryRequest | undefined
  const detach = history.attach((message) => {
    if (message.type === "agentManager.requestHistory") request = message
  })
  const receive = () =>
    store.history.receive({
      ...request!,
      type: "agentManager.history",
      generation: 1,
      loading: false,
      more: false,
      rows: [
        { id: "deleted", title: "Matching", updatedAt: "now" },
        { id: "keep", title: "Matching too", updatedAt: "now" },
      ],
    })
  receive()
  const initial = history.current()
  history.input("Matching")
  await new Promise((resolve) => setTimeout(resolve, 250))
  receive()
  const search = history.current()
  assert.equal(search.data.rows.length, 2)
  assert.notEqual(initial, search)
  store.removeSession("deleted")
  assert.deepEqual(
    initial.data.rows.map((row) => row.id),
    ["keep"],
  )
  assert.deepEqual(
    search.data.rows.map((row) => row.id),
    ["keep"],
  )
  receive()
  assert.deepEqual(
    search.data.rows.map((row) => row.id),
    ["keep"],
    "in-flight stale response cannot resurrect a deleted session",
  )
  history.clear()
  receive()
  assert.deepEqual(
    history.current().data.rows.map((row) => row.id),
    ["keep"],
    "returning to the cached unfiltered query retains deletion",
  )
  assert.deepEqual(store.tabs.ids(), ["keep"])
  assert.deepEqual(
    store.managedSessions().map((row) => row.id),
    [],
  )
  assert.deepEqual(store.tabOrder(), { w: ["keep"], local: [] })
  assert.deepEqual(store.pinnedTabs(), { w: ["keep"] })
  assert.equal(store.tabMemory.get("w"), undefined)
  assert.equal(store.sessionRestore.get("w"), undefined)
  assert.deepEqual(sibling.tabs.ids(), ["deleted"], "other projects remain independent")
  detach()
  store.history.dispose()
  dispose()
})
