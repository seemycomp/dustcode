import { describe, expect, it } from "bun:test"
import path from "node:path"
import { createProjectStore } from "../../webview-ui/agent-manager/project/store"

const state = (projectId: string, order: string[]) => ({
  type: "agentManager.state" as const,
  projectId,
  worktrees: order.map((id) => ({
    id,
    branch: `${projectId}-${id}`,
    path: `/repo/${projectId}/${id}`,
    parentBranch: "main",
    createdAt: "2026-01-01",
  })),
  sessions: [],
  sections: [],
  worktreeOrder: order,
})

describe("project stores", () => {
  it("reconciles snapshots without rerendering unchanged inventory and orders", () => {
    const child = Bun.spawnSync(
      [
        process.execPath,
        "--conditions=browser",
        "-e",
        `
        import { strict as assert } from "node:assert"
        import { createMemo, createRenderEffect, createRoot } from "solid-js"
        import { createProjectStore } from "./webview-ui/agent-manager/project/store"

        const run = createRoot((dispose) => {
          const store = createProjectStore("a")
          const snapshot = {
            type: "agentManager.state", projectId: "a",
            worktrees: ["one", "two"].map((id) => ({
              id, branch: id, label: id, path: "/repo/" + id,
              parentBranch: "main", createdAt: "2026-01-01", sectionId: "todo",
            })),
            sessions: ["one", "two"].map((id) => ({ id: "ses-" + id, worktreeId: id, createdAt: "2026-01-01" })),
            sections: [{ id: "todo", name: "Todo", color: null, collapsed: false }],
            tabOrder: { one: ["ses-one"], two: ["ses-two"] },
            worktreeOrder: ["one", "two"],
            historyExpanded: { one: true }, historyInitialized: true,
            pinnedTabs: { one: ["ses-one"] },
          }
          store.applyState(structuredClone(snapshot))
          const trees = store.worktrees()
          const sessions = store.managedSessions()
          const sections = store.sections()
          const order = store.worktreeOrder()
          const tabs = store.tabOrder()
          const tree = trees.at(0)
          const session = sessions.at(0)
          const section = sections.at(0)
          const calls = { trees: 0, sessions: 0, sections: 0, orders: 0 }
          const view = createMemo(() => store.worktrees().map((row) => row.label).join(","))
          createRenderEffect(() => {
            store.worktrees().map((row) => row.label)
            calls.trees++
          })
          createRenderEffect(() => {
            store.managedSessions().map((row) => row.worktreeId)
            calls.sessions++
          })
          createRenderEffect(() => {
            store.sections().map((row) => row.collapsed)
            calls.sections++
          })
          createRenderEffect(() => {
            store.worktreeOrder().join(",")
            Object.values(store.tabOrder()).map((ids) => ids.join(","))
            calls.orders++
          })
          const before = { ...calls }
          const frames = []
          createRenderEffect(() => frames.push([view(), store.sections().at(0)?.collapsed]))
          return () => {
            for (let index = 0; index < 3; index++) store.applyState(structuredClone(snapshot))
            assert.equal(store.worktrees(), trees)
            assert.equal(store.managedSessions(), sessions)
            assert.equal(store.sections(), sections)
            assert.equal(store.worktreeOrder(), order)
            assert.equal(store.tabOrder(), tabs)
            assert.equal(store.worktrees().at(0), tree)
            assert.equal(store.managedSessions().at(0), session)
            assert.equal(store.sections().at(0), section)
            assert.deepEqual(calls, before, "identical cloned snapshots must not rerun render effects")

            const changed = structuredClone(snapshot)
            changed.worktrees[0].label = "Renamed"
            changed.sections[0].collapsed = true
            store.applyState(changed)
            assert.equal(store.worktrees().at(0), tree)
            assert.equal(store.sections().at(0), section)
            assert.equal(tree.label, "Renamed")
            assert.equal(section.collapsed, true)
            assert.deepEqual(frames, [["one,two", false], ["Renamed,two", true]], "snapshot writes must be atomic")
            assert.deepEqual(calls, { ...before, trees: before.trees + 1, sections: before.sections + 1 })

            const sibling = store.worktrees().at(1)
            const reordered = structuredClone(changed)
            reordered.worktrees.reverse()
            reordered.sessions.reverse()
            reordered.worktreeOrder.reverse()
            reordered.tabOrder.one = ["ses-extra", "ses-one"]
            store.applyState(reordered)
            assert.deepEqual(store.worktrees().map((row) => row.id), ["two", "one"])
            assert.deepEqual(store.managedSessions().map((row) => row.id), ["ses-two", "ses-one"])
            assert.equal(store.worktrees().at(0), sibling)
            assert.equal(store.worktrees().at(1), tree)
            assert.equal(store.managedSessions().at(1), session)
            assert.deepEqual([...store.worktreeOrder()], ["two", "one"])
            assert.deepEqual([...store.tabOrder().one], ["ses-extra", "ses-one"])
            const deleted = structuredClone(reordered)
            deleted.worktrees.pop()
            deleted.sessions.pop()
            deleted.sections = []
            deleted.worktreeOrder = ["two"]
            store.applyState(deleted)
            assert.deepEqual(store.worktrees().map((row) => row.id), ["two"])
            assert.deepEqual(store.managedSessions().map((row) => row.id), ["ses-two"])
            assert.equal(store.worktrees().at(0), sibling)
            assert.deepEqual([...store.sections()], [])
            store.setWorktrees((prev) => prev.map((row) => ({ ...row, label: "Updated" })))
            assert.equal(sibling.label, "Updated")
            store.setManagedSessions((prev) => prev.filter((row) => row.worktreeId !== "two"))
            assert.equal(store.managedSessions().length, 0)
            store.setSections([{ id: "todo", name: "Todo", color: null, collapsed: false }])
            store.setSections((prev) => prev.map((row) => ({ ...row, collapsed: true })))
            assert.equal(store.sections().at(0).collapsed, true)
            store.applyState({ type: "agentManager.state", projectId: "a", worktrees: [], sessions: [] })
            assert.deepEqual(store.pinnedTabs(), { one: ["ses-one"] })
            assert.equal(store.historyOpen("one"), true)
            assert.equal(store.historyInitialized(), true)
            store.applyState({
              type: "agentManager.state", projectId: "a", worktrees: [], sessions: [],
              pinnedTabs: {}, historyExpanded: {}, historyInitialized: false,
            })
            assert.deepEqual(store.pinnedTabs(), {})
            assert.equal(store.historyOpen("one"), false)
            assert.equal(store.historyInitialized(), false)
            dispose()
          }
        })
        run()
        `,
      ],
      { cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" },
    )
    expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
  })

  it("supports direct and functional inventory setters", () => {
    const store = createProjectStore("a")
    const rows = state("a", ["one", "two"]).worktrees
    expect(store.setWorktrees(rows)).toBe(rows)
    const renamed = store.setWorktrees((prev) => prev.map((row) => ({ ...row, label: "Renamed" })))
    expect(renamed.map((row) => row.label)).toEqual(["Renamed", "Renamed"])
    store.setWorktrees((prev) => prev.filter((row) => row.id === "two"))
    expect(store.worktrees()).toHaveLength(1)
    expect(store.worktrees().map((row) => row.id)).toEqual(["two"])
    store.setManagedSessions([{ id: "ses-one", worktreeId: "two", createdAt: "2026-01-01" }])
    store.setManagedSessions((prev) => [...prev, { id: "ses-two", worktreeId: null, createdAt: "2026-01-01" }])
    expect(store.managedSessions().map((row) => row.id)).toEqual(["ses-one", "ses-two"])
    store.setSections([{ id: "todo", name: "Todo", color: null }])
    store.setSections((prev) => prev.map((row) => ({ ...row, collapsed: true })))
    expect(store.sections().at(0)?.collapsed).toBe(true)
    store.setSections((prev) => prev.filter((row) => row.id !== "todo"))
    expect(store.sections()).toEqual([])
    store.setWorktreeOrder(["one", "two"])
    store.setWorktreeOrder((prev) => prev.toReversed())
    expect(store.worktreeOrder()).toEqual(["two", "one"])
    store.setTabOrder({ local: ["ses-one"] })
    store.setTabOrder((prev) => ({ ...prev, local: [...(prev.local ?? []), "ses-two"] }))
    expect(store.tabOrder().local).toEqual(["ses-one", "ses-two"])
  })

  it("preserves pinned tabs and history flags when snapshots omit them", () => {
    const store = createProjectStore("a")
    store.setPinnedTabs({ local: ["ses-one"] })
    store.setHistoryExpanded({ one: true })
    store.setHistoryInitialized(true)
    store.applyState(state("a", ["one"]))
    expect(store.pinnedTabs()).toEqual({ local: ["ses-one"] })
    expect(store.historyOpen("one")).toBe(true)
    expect(store.historyInitialized()).toBe(true)
    store.applyState({
      ...state("a", ["one"]),
      pinnedTabs: {},
      historyExpanded: { one: false },
      historyInitialized: false,
    })
    expect(store.pinnedTabs()).toEqual({})
    expect(store.historyOpen("one")).toBe(false)
    expect(store.historyInitialized()).toBe(false)
  })

  it("preserves temporary tab positions when durable order is pushed again", () => {
    const store = createProjectStore("a")
    const order = ["terminal:second", "ses-2", "review", "pending:draft", "ses-1", "terminal:first"]
    store.setTabOrder({ local: order })
    store.applyState({ ...state("a", []), tabOrder: { local: ["ses-2", "ses-1"] } })
    expect(store.tabOrder().local).toEqual(order)
    store.applyState({ ...state("a", []), tabOrder: { local: ["ses-2", "ses-1"] } })
    expect(store.tabOrder().local).toEqual(order)
  })

  it("accepts durable changes without dropping temporary tabs", () => {
    const store = createProjectStore("a")
    store.setTabOrder({ local: ["ses-1", "terminal:1", "ses-2", "review"] })
    store.applyState({ ...state("a", []), tabOrder: { local: ["ses-2", "ses-3"] } })
    expect(store.tabOrder().local).toEqual(["terminal:1", "ses-2", "review", "ses-3"])
  })

  it("keeps worktree order isolated between projects", () => {
    const first = createProjectStore("a")
    const second = createProjectStore("b")
    first.applyState(state("a", ["same", "other"]))
    second.applyState(state("b", ["same", "other"]))

    first.setWorktreeOrder(["other", "same"])

    expect(first.worktreeOrder()).toEqual(["other", "same"])
    expect(second.worktreeOrder()).toEqual(["same", "other"])
  })

  it("preserves live run statuses when state omits them", () => {
    const store = createProjectStore("a")
    store.applyState(state("a", ["same", "other"]))
    store.setRunStatuses({
      same: { worktreeId: "same", state: "running" },
    })

    store.applyState(state("a", ["other", "same"]))

    expect(store.runStatuses()).toEqual({
      same: { worktreeId: "same", state: "running" },
    })
  })

  it("keeps busy worktrees isolated between projects", () => {
    const first = createProjectStore("a")
    const second = createProjectStore("b")
    first.applyState(state("a", ["same"]))
    second.applyState(state("b", ["same"]))

    first.setBusy(new Map([["same", { reason: "setting-up" as const }]]))

    expect(first.busy().has("same")).toBe(true)
    expect(second.busy().has("same")).toBe(false)
  })
})
