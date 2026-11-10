import { describe, expect, it } from "bun:test"
import type { Session } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../../src/agent-manager/history"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../../src/agent-manager/project/registry"
import { handleProjectMessage, type ProjectMessageDeps } from "../../src/agent-manager/project/messages"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import type { AgentManagerOutMessage } from "../../src/agent-manager/types"
import type { HistoryOpen } from "../../src/shared/agent-history"

function setup() {
  const registry = new ProjectRegistry({ read: () => undefined, write: () => {} })
  const contexts = new ProjectContexts({
    registry,
    workspaceRoot: () => "/history",
    deps: {
      log: () => {},
      exists: () => true,
      state: (root, log) => {
        const state = new WorktreeStateManager(root, log)
        state.save = async () => {}
        return state
      },
    },
  })
  const ctx = contexts.active()!
  const state = ctx.stateManager()
  const wt = state.addWorktree({ path: `${ctx.root}/w`, branch: "w", parentBranch: "main" })
  const records = new Map<string, Session>()
  const events: string[] = []
  const posts: AgentManagerOutMessage[] = []
  const ready: ProjectMessageDeps["ready"] = (ctx) => ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
  const history = new AgentHistory({
    contexts,
    ready,
    sessions: () => ({ getSessionInfo: async (id) => records.get(id) }),
    exists: () => true,
    post: () => {},
  })
  const deps: ProjectMessageDeps = {
    registry,
    contexts,
    history,
    ready,
    pickFolder: async () => undefined,
    onboarding: {
      input: async () => undefined,
      confirm: async () => false,
      cloneRepository: async () => undefined,
      isTrusted: () => true,
      notify: () => {},
    },
    activate: () => events.push("activate"),
    expand: () => {},
    push: () => events.push("projects"),
    pushState: () => events.push("state"),
    selected: () => events.push("selected"),
    post: (message) => posts.push(message),
    error: (message) => {
      throw new Error(message)
    },
    openSettings: () => {},
    log: () => {},
    routeSession: (_project, _session, directory) => events.push(`route:${directory}`),
  }
  const info: Session = {
    id: "original",
    slug: "original",
    projectID: "backend",
    directory: wt.path,
    title: "Original conversation",
    version: "1",
    time: { created: 1, updated: 100 },
  }
  records.set(info.id, info)
  const open = (extra: Partial<HistoryOpen> = {}) =>
    handleProjectMessage(
      {
        type: "agentManager.openHistorySession",
        projectId: ctx.id,
        worktreeId: wt.id,
        sessionId: info.id,
        requestId: "open",
        ...extra,
      },
      deps,
    )
  return { registry, contexts, ctx, state, wt, records, events, posts, deps, history, info, open }
}

describe("Agent Manager safe history selection", () => {
  it("adopts only the explicitly opened session into its owning worktree before the existing selection acknowledgement", async () => {
    const f = setup()
    f.records.set("unopened", { ...f.info, id: "unopened" })
    await f.open()
    expect(f.state.getSessions().map((session) => session.id)).toEqual(["original"])
    expect(f.state.getSession("original")?.worktreeId).toBe(f.wt.id)
    expect(f.events).toEqual([`route:${f.wt.path}`, "state", "projects", "selected"])
    expect(f.state.getActiveTarget()).toEqual({ projectId: f.ctx.id, kind: "session", sessionId: "original" })
    expect(f.records.get("original")?.directory).toBe(f.wt.path)
    expect(f.posts.some((message) => message.type === "agentManager.projectSessions")).toBe(true)
    await f.open({ requestId: "again" })
    expect(f.state.getSessions()).toHaveLength(1)
    f.history.dispose()
  })

  it("honors explicit Local and closed placement rather than the persisted backend directory", async () => {
    const f = setup()
    f.state.addSession("original", null)
    f.state.closeSession("original", null)
    f.state.removeSession("original")
    await f.open({ worktreeId: null })
    expect(f.state.getSession("original")?.worktreeId).toBeNull()
    expect(f.events.at(0)).toBe(`route:${f.ctx.root}`)
    expect(f.records.get("original")?.directory).toBe(f.wt.path)
    f.history.dispose()
  })

  it("rejects a globally found foreign, child, deleted, or wrong-context session without a Local fallback", async () => {
    const f = setup()
    for (const record of [
      { ...f.info, directory: "/other/project" },
      { ...f.info, parentID: "parent" },
      { ...f.info, directory: "" },
    ]) {
      f.records.set("original", record)
      await f.open()
    }
    f.records.set("original", f.info)
    await f.open({ worktreeId: null })
    f.records.delete("original")
    await f.open()
    expect(f.state.getSessions()).toEqual([])
    expect(f.events).toEqual([])
    expect(f.posts.filter((message) => message.type === "agentManager.historyOpenFailed")).toHaveLength(5)
    f.history.dispose()
  })

  it("rejects stale health but permits indeterminate health alone", async () => {
    const f = setup()
    f.ctx.report = {
      entries: [{ id: f.wt.id, path: f.wt.path, branch: f.wt.branch, health: "unregistered", sessions: 0 }],
      orphans: [],
      dropped: [],
      pruned: false,
      degraded: false,
    }
    await f.open()
    expect(f.state.getSessions()).toEqual([])
    f.ctx.report.entries.at(0)!.health = "unavailable"
    await f.open()
    expect(f.state.getSession("original")?.worktreeId).toBe(f.wt.id)
    f.history.dispose()
  })

  it("does not open a session deleted while metadata is pending", async () => {
    const f = setup()
    f.history.dispose()
    const pending = Promise.withResolvers<Session | undefined>()
    const history = new AgentHistory({
      contexts: f.contexts,
      ready: f.deps.ready,
      sessions: () => ({ getSessionInfo: () => pending.promise }),
      exists: () => true,
      post: () => {},
    })
    f.deps.history = history
    const opening = f.open()
    await Bun.sleep(0)
    history.event({ type: "session.deleted", properties: { sessionID: "original" } })
    pending.resolve(f.info)
    await opening
    expect(f.state.getSessions()).toEqual([])
    expect(f.posts.at(-1)?.type).toBe("agentManager.historyOpenFailed")
    history.dispose()
  })

  it("does not let an obsolete history click override a newer ordinary selection", async () => {
    const f = setup()
    f.history.dispose()
    const pending = Promise.withResolvers<Session | undefined>()
    const history = new AgentHistory({
      contexts: f.contexts,
      ready: f.deps.ready,
      sessions: () => ({ getSessionInfo: () => pending.promise }),
      exists: () => true,
      post: () => {},
    })
    f.deps.history = history
    const opening = f.open()
    await Bun.sleep(0)
    await handleProjectMessage(
      { type: "agentManager.activateSelection", target: { projectId: f.ctx.id, kind: "local" } },
      f.deps,
    )
    pending.resolve(f.info)
    await opening
    expect(f.state.getSessions()).toEqual([])
    expect(f.state.getActiveTarget()).toEqual({ projectId: f.ctx.id, kind: "local" })
    expect(f.events).toEqual(["projects", "selected"])
    history.dispose()
  })

  it("rejects a removed worktree or missing directory without registering a route", async () => {
    const f = setup()
    f.history.dispose()
    const history = new AgentHistory({
      contexts: f.contexts,
      ready: f.deps.ready,
      sessions: () => ({ getSessionInfo: async () => f.info }),
      exists: () => false,
      post: () => {},
    })
    f.deps.history = history
    await f.open()
    expect(f.state.getSessions()).toEqual([])
    expect(f.events).toEqual([])
    f.state.removeWorktree(f.wt.id)
    await f.open()
    expect(f.posts.filter((message) => message.type === "agentManager.historyOpenFailed")).toHaveLength(2)
    history.dispose()
  })

  it("switches from another project without moving the conversation or touching its draft target", async () => {
    const f = setup()
    await f.registry.add({ id: "other", root: "/other" })
    const other = f.contexts.resolve("other")!
    const state = other.stateManager()
    state.setActiveTarget({ projectId: other.id, kind: "local" })
    f.contexts.activate(other.id)
    await f.open()
    expect(f.contexts.active()?.id).toBe(f.ctx.id)
    expect(state.getActiveTarget()).toEqual({ projectId: other.id, kind: "local" })
    expect(f.state.getSession("original")?.worktreeId).toBe(f.wt.id)
    expect(f.events.indexOf("state")).toBeLessThan(f.events.indexOf("selected"))
    f.history.dispose()
  })
})
