import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProjectContext } from "../../src/agent-manager/project/context"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import { abort, managerSessionIds } from "../../src/agent-manager/native-session-lifetime"

const roots: string[] = []
const states: WorktreeStateManager[] = []
function project(id: string) {
  const root = mkdtempSync(join(tmpdir(), "native-lifetime-"))
  roots.push(root)
  const state = new WorktreeStateManager(root, () => {})
  states.push(state)
  const ctx = new ProjectContext(id, root, false, { log: () => {}, state: () => state })
  ctx.stateManager()
  return { root, state, ctx }
}

afterEach(async () => {
  await Promise.all(states.splice(0).map((state) => state.flush()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("manager close-time native attachments", () => {
  it("snapshots tracked and active IDs before a provider is disposed or tracking is cleared", async () => {
    const a = project("a")
    a.state.addSession("native", null)
    a.state.addSession("active", null)
    const ids = new Set(["native", "tracked"])
    const calls: string[][] = []
    const closing = abort(
      {
        getSessionDirectories: () =>
          new Map([
            ["native", a.root],
            ["active", a.root],
          ]),
        abortSessions: async (values) => {
          calls.push([...values])
        },
      },
      [a.ctx],
      ids,
      "active",
      { hasNativeSession: (ref) => ref.projectId === "a" && ref.sessionId === "native" },
    )
    expect(ids.size).toBe(0)
    await closing
    expect(calls).toEqual([["tracked", "active"]])
  })

  it("preserves only sessions still attached to their exact project and directory", () => {
    const a = project("a")
    const b = project("b")
    const tree = a.state.addWorktree({ branch: "feature", path: join(a.root, "tree"), parentBranch: "main" })
    a.state.addSession("native", tree.id)
    a.state.addSession("manager", null)
    b.state.addSession("other", null)
    const directories = new Map([
      ["native", tree.path],
      ["manager", a.root],
      ["other", b.root],
    ])
    const attached = (ref: { projectId: string; sessionId: string }, directory: string) =>
      ref.projectId === "a" && ref.sessionId === "native" && directory === tree.path
    expect(
      managerSessionIds(["native", "manager", "other", "manager", "pending"], [a.ctx, b.ctx], directories, attached),
    ).toEqual(["manager", "other", "pending"])
    expect(managerSessionIds(["native"], [a.ctx, b.ctx], directories, () => false)).toEqual(["native"])
  })

  it("does not confuse identical IDs in different projects or a moved placement", () => {
    const a = project("a")
    const b = project("b")
    a.state.addSession("same", null)
    b.state.addSession("same", null)
    const attached = (ref: { projectId: string }) => ref.projectId === "a"
    expect(managerSessionIds(["same"], [a.ctx, b.ctx], new Map([["same", b.root]]), attached)).toEqual(["same"])
    expect(managerSessionIds(["same"], [a.ctx, b.ctx], new Map(), attached)).toEqual(["same"])
    expect(managerSessionIds(["same"], [a.ctx, b.ctx], new Map([["same", a.root]]), attached)).toEqual([])
    a.state.moveSession(
      "same",
      a.state.addWorktree({ branch: "moved", path: join(a.root, "moved"), parentBranch: "main" }).id,
    )
    expect(managerSessionIds(["same"], [a.ctx, b.ctx], new Map([["same", a.root]]), attached)).toEqual(["same"])
  })
})
