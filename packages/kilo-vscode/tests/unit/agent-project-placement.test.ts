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
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { AgentHistory } from "../../src/agent-manager/history"
import { ProjectRouteService } from "../../src/agent-manager/project/route"
import { resolveNativeSession } from "../../src/agent-manager/project/native"
import { adoptHistory, type ProjectMessageDeps } from "../../src/agent-manager/project/messages"

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

  function native(metadata = async (id: string, dir: string) => session(id, dir)) {
    const contexts = new ProjectContexts({
      workspaceRoot: () => path.join(root, "active"),
      registry: {
        list: () => [{ id: "inactive", root, label: "Inactive", expanded: true }],
        get: (id) => (id === "inactive" ? { id, root, label: "Inactive", expanded: true } : undefined),
      },
      deps: { log: () => {}, state: () => state },
    })
    const active = contexts.active()
    const inactive = contexts.resolve("inactive")!
    inactive.stateManager()
    const calls: unknown[] = []
    const ready = async (ctx: ProjectContext, opts?: { warm?: boolean }) => {
      calls.push([ctx.id, opts])
      return ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
    }
    const history = new AgentHistory({
      contexts,
      ready,
      sessions: () => ({
        getSessionInfo: (id, dir) => metadata(id, dir!),
      }),
      post: () => {},
    })
    const routes = new ProjectRouteService()
    return { contexts, active, inactive, calls, history, routes, ready }
  }

  test("native open resolves inactive project placement without warming or selecting it", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    fs.mkdirSync(wt.path)
    state.addSession("promoted", wt.id)
    const deps = native(async (id) => session(id, root))
    const target = await resolveNativeSession(
      {
        type: "agentManager.openSessionInTab",
        projectId: "inactive",
        sessionId: "promoted",
        directory: root,
      } as Parameters<typeof resolveNativeSession>[0],
      deps,
    )
    expect(target.directory).toBe(wt.path)
    expect(target.scope.root).toBe(root)
    expect(target.scope.worktreeId).toBe(wt.id)
    expect(deps.contexts.active()).toBe(deps.active)
    expect(deps.calls).toEqual([
      ["inactive", { warm: false }],
      ["inactive", { warm: false }],
    ])
    expect(deps.routes.trySessionDirectoryFor({ projectId: "inactive", sessionId: "promoted" })).toBe(wt.path)
    expect(Object.isFrozen(target.scope)).toBe(true)
    deps.contexts.activate("inactive")
    target.scope.validate("promoted")
    target.scope.register("new")
    expect(state.sessionPlacement("new")).toBe(wt.id)
    state.moveSession("promoted", null)
    expect(() => target.scope.validate("promoted")).toThrow("placement")
    deps.history.dispose()
  })

  test("native local opens retain explicit Local despite worktree backend metadata", async () => {
    const wt = state.addWorktree({ branch: "feature", path: path.join(root, "worktree"), parentBranch: "main" })
    state.addSession("local", null)
    const deps = native(async (id) => session(id, wt.path))
    const target = await resolveNativeSession(
      { type: "agentManager.openSessionInTab", projectId: "inactive", sessionId: "local" },
      deps,
    )
    expect(target.directory).toBe(root)
    expect(target.scope.worktreeId).toBeNull()
    deps.history.dispose()
  })

  test("native opens fail on unknown placement, conflicting history context and stale generation", async () => {
    const deps = native()
    const request = { type: "agentManager.openSessionInTab" as const, projectId: "inactive", sessionId: "unknown" }
    await expect(resolveNativeSession(request, deps)).rejects.toThrow("trusted project placement")
    state.addSession("local", null)
    await expect(resolveNativeSession({ ...request, sessionId: "local", worktreeId: "wrong" }, deps)).rejects.toThrow(
      "placement changed",
    )
    const pending = Promise.withResolvers<Session>()
    const entered = Promise.withResolvers<void>()
    const stale = native(() => {
      entered.resolve()
      return pending.promise
    })
    const opening = resolveNativeSession({ ...request, sessionId: "local" }, stale)
    await entered.promise
    stale.inactive.suspend()
    pending.resolve(session("local", root))
    await expect(opening).rejects.toThrow("project changed")
    expect(stale.routes.trySessionDirectoryFor({ projectId: "inactive", sessionId: "local" })).toBeUndefined()
    deps.history.dispose()
    stale.history.dispose()
  })

  test("native history opens use history validation and retain retry after metadata failure", async () => {
    let available = false
    const deps = native(async (id) => {
      if (!available) throw new Error("metadata unavailable")
      return session(id, root)
    })
    const request = {
      type: "agentManager.openSessionInTab" as const,
      projectId: "inactive",
      sessionId: "history",
      worktreeId: null,
      requestId: "history-request",
    }
    await expect(resolveNativeSession(request, deps)).rejects.toThrow("metadata unavailable")
    expect(state.sessionPlacement("history")).toBeUndefined()
    available = true
    const target = await resolveNativeSession(request, deps)
    expect(target.directory).toBe(root)
    expect(state.sessionPlacement("history")).toBeNull()
    expect(state.getSessions()).toEqual([])
    const posts: string[] = []
    const selected: unknown[] = []
    adoptHistory(target, null, {
      contexts: deps.contexts,
      activate: () => {},
      push: () => {},
      post: (message: { type: string }) => posts.push(message.type),
      selected: (target: unknown) => selected.push(target),
    } as unknown as ProjectMessageDeps)
    expect(state.getSession("history")?.worktreeId).toBeNull()
    expect(posts).toEqual(["agentManager.projectSessions"])
    expect(selected).toEqual([{ projectId: "inactive", kind: "session", sessionId: "history" }])
    expect(deps.contexts.active()).toBe(deps.inactive)
    deps.history.dispose()
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
