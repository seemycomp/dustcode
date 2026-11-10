import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { Session } from "@kilocode/sdk/v2/client"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import { ProjectContext } from "../../src/agent-manager/project/context"
import { collectProjectSessions } from "../../src/agent-manager/project/init"
import { resolvePlacement } from "../../src/agent-manager/project/placement"
import { handleSessionLifecycle } from "../../src/agent-manager/session-lifecycle"
import type { ProjectContexts } from "../../src/agent-manager/project/contexts"

describe("authoritative project placement", () => {
  let root: string
  let state: WorktreeStateManager
  let ctx: ProjectContext

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "am-placement-"))
    state = new WorktreeStateManager(root, () => {})
    ctx = new ProjectContext("project", root, false, { log: () => {}, state: () => state })
    ctx.stateManager()
  })

  afterEach(async () => {
    await state.flush()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const session = (id: string, directory: string): Session => ({
    id,
    directory,
    slug: id,
    projectID: "backend-project",
    version: "1",
    title: id,
    time: { created: 1, updated: 2 },
  })

  test("distinguishes explicit Local from missing placement and rejects descendant or empty directories", () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    state.addSession("local", null)
    state.closeSession("closed", wt.id)
    expect(resolvePlacement(ctx, "local", wt.path)).toEqual({ worktreeId: null, directory: root })
    expect(resolvePlacement(ctx, "closed", root)).toEqual({ worktreeId: wt.id, directory: wt.path })
    expect(resolvePlacement(ctx, "native", wt.path)).toEqual({ worktreeId: wt.id, directory: wt.path })
    expect(resolvePlacement(ctx, "unknown", path.join(root, "nested"))).toBeUndefined()
    expect(resolvePlacement(ctx, "unknown", "")).toBeUndefined()
    expect(resolvePlacement(ctx, "unknown")).toBeUndefined()
  })

  test("retains closed assignments beyond 1000 later closes and panel reopen without adopting tabs", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    state.addSession("promoted", wt.id)
    state.closeSession("promoted", wt.id)
    state.removeSession("promoted")
    for (let i = 0; i < 1005; i++) state.closeSession(`later-${i}`, null)
    await state.flush()
    const loaded = new WorktreeStateManager(root, () => {})
    await loaded.load()
    expect(loaded.sessionPlacements().get("promoted")).toBe(wt.id)
    expect(loaded.getSessions()).toEqual([])
    loaded.removeWorktree(wt.id)
    expect(loaded.sessionPlacements().has("promoted")).toBe(false)
    loaded.closeSession("deleted", null)
    loaded.forgetSession("deleted")
    expect(loaded.sessionPlacements().has("deleted")).toBe(false)
    await loaded.flush()
  })

  test("discovery cannot undo promoted, closed or explicit Local assignments", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    state.addSession("promoted", wt.id)
    state.closeSession("closed", wt.id)
    state.addSession("local", null)
    const routes = new Map<string, string>()
    const rows = await collectProjectSessions(ctx, {
      listSessions: async (dir) =>
        dir === root ? [session("promoted", root), session("closed", root)] : [session("local", wt.path)],
      setSessionDirectory: (id, dir) => void routes.set(id, dir),
    })
    expect(rows.map((row) => [row.id, row.worktreeId])).toEqual([
      ["promoted", wt.id],
      ["closed", wt.id],
      ["local", null],
    ])
    expect(routes.get("promoted")).toBe(wt.path)
    expect(routes.get("closed")).toBe(wt.path)
    expect(routes.get("local")).toBe(root)
  })

  test("SSE projection keeps explicit Local placement and deletes closed placement evidence", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    state.addSession("local", null)
    await ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
    const deps = {
      contexts: {
        values: () => [ctx].values(),
        byDirectory: () => ctx,
        byLiveSession: () => ctx,
      } as unknown as ProjectContexts,
      busy: new Set<string>(),
      removed: new Set<string>(),
      closeBrowser: () => {},
      post: () => {},
    }
    handleSessionLifecycle({ type: "session.updated", properties: { info: session("local", wt.path) } }, deps)
    expect(ctx.sessions().find((row) => row.id === "local")?.worktreeId).toBeNull()
    state.closeSession("closed", wt.id)
    handleSessionLifecycle({ type: "session.deleted", properties: { sessionID: "closed" } }, deps)
    expect(state.sessionPlacements().has("closed")).toBe(false)
  })

  test("persists independent history disclosures and initializes only once", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    expect(state.getHistoryInitialized()).toBe(false)
    state.setHistoryExpanded(wt.id, true, true)
    state.setHistoryExpanded(wt.id, false)
    state.setHistoryExpanded(null, true, true)
    expect(state.getHistoryExpanded()).toEqual({ [wt.id]: false })
    state.setHistoryExpanded(null, true)
    await state.flush()
    const loaded = new WorktreeStateManager(root, () => {})
    await loaded.load()
    expect(loaded.getHistoryInitialized()).toBe(true)
    expect(loaded.getHistoryExpanded()).toEqual({ [wt.id]: false, local: true })
    loaded.removeWorktree(wt.id)
    expect(loaded.getHistoryExpanded()).toEqual({ local: true })
    await loaded.flush()
  })
})
