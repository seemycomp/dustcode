import { afterEach, expect, it } from "bun:test"
import { createKiloClient, type Session } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../../src/agent-manager/history"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../../src/agent-manager/project/registry"
import { handleProjectMessage, type ProjectMessageDeps } from "../../src/agent-manager/project/messages"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import type { AgentManagerOutMessage } from "../../src/agent-manager/types"

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))

function setup(options: { confirm?: boolean; failure?: boolean; local?: boolean } = {}) {
  const registry = new ProjectRegistry({
    read: () => ({ version: 1, projects: [{ id: "background", root: "/background", order: 0, addedAt: "now" }] }),
    write: () => {},
  })
  const contexts = new ProjectContexts({
    registry,
    workspaceRoot: () => "/active",
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
  const active = contexts.active()!
  const ctx = contexts.resolve("background")!
  const state = ctx.stateManager()
  const wt = state.addWorktree({ path: `${ctx.root}/tree`, branch: "feature", parentBranch: "main" })
  const info: Session = {
    id: "ses_exact",
    slug: "exact",
    projectID: "backend",
    directory: wt.path,
    title: "Keep this conversation",
    version: "1",
    time: { created: 1, updated: 2 },
  }
  const placement = options.local ? null : wt.id
  state.addSession(info.id, placement)
  state.setTabOrder(placement ?? "local", [info.id])
  state.setPinnedTabs(placement ?? "local", [info.id])
  state.setActiveTarget({ projectId: ctx.id, kind: "session", sessionId: info.id })
  ctx.setSessions([
    { id: info.id, title: info.title, parentID: null, updatedAt: new Date(2).toISOString(), worktreeId: placement },
  ])
  const requests: Array<{ method: string; path: string; directory: string | null }> = []
  const posts: AgentManagerOutMessage[] = []
  const errors: string[] = []
  const confirmations: string[] = []
  const routes: unknown[] = []
  const native: unknown[] = []
  const preparation: { client?: () => Promise<void>; stop?: () => void } = {}
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requests.push({ method: request.method, path: url.pathname, directory: url.searchParams.get("directory") })
      if (url.pathname.includes("background-process")) preparation.stop?.()
      if (request.method === "DELETE")
        return options.failure
          ? Response.json({ message: "Backend refused deletion" }, { status: 500 })
          : Response.json(true)
      return Response.json(info)
    },
  })
  const client = createKiloClient({ baseUrl: server.url.href })
  const ready: ProjectMessageDeps["ready"] = (ctx) => ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
  const history = new AgentHistory({
    contexts,
    ready,
    exists: () => true,
    sessions: () => ({
      listSessionPage: async () => ({ sessions: [info] }),
      getSessionInfo: async (sessionID, directory) =>
        (await client.session.get({ sessionID, directory }, { throwOnError: true })).data,
    }),
    post: (message) => posts.push(message),
  })
  const deps: ProjectMessageDeps = {
    registry,
    contexts,
    history,
    ready,
    deletion: {
      client: async () => {
        await preparation.client?.()
        return client
      },
      deleted: (ref) => native.push(ref),
      confirm: async (message, action) => {
        confirmations.push(`${message}\n${action}`)
        return options.confirm ?? true
      },
      sessions: () => ({
        clearSessionDirectory: (id) => routes.push(id),
        unregisterSessionRoute: (ref) => routes.push(ref),
      }),
    },
    pickFolder: async () => undefined,
    onboarding: {
      input: async () => undefined,
      confirm: async () => false,
      cloneRepository: async () => undefined,
      isTrusted: () => true,
      notify: () => {},
    },
    activate: () => {
      throw new Error("Deletion must not activate the background project")
    },
    expand: () => {},
    push: () => {},
    pushState: () => {},
    selected: () => {
      throw new Error("Deletion must not select a session")
    },
    post: (message) => posts.push(message),
    error: (message) => errors.push(message),
    openSettings: () => {},
    log: () => {},
  }
  const remove = () =>
    handleProjectMessage({ type: "deleteSession", projectId: ctx.id, worktreeId: placement, sessionID: info.id }, deps)
  cleanup.push(() => {
    history.dispose()
    server.stop(true)
  })
  return {
    contexts,
    active,
    ctx,
    state,
    wt,
    info,
    requests,
    posts,
    errors,
    confirmations,
    routes,
    native,
    preparation,
    history,
    remove,
    deps,
  }
}

it("keeps same-id conversations in another project's history after qualified deletion", async () => {
  const f = setup()
  f.active.stateManager().addSession(f.info.id, null)
  await f.history.request({
    type: "agentManager.requestHistory",
    projectId: f.active.id,
    worktreeId: null,
    requestId: "active",
    query: "",
  })
  await f.history.request({
    type: "agentManager.requestHistory",
    projectId: f.ctx.id,
    worktreeId: f.wt.id,
    requestId: "background",
    query: "",
  })
  const before = f.posts
    .filter((message) => message.type === "agentManager.history" && message.projectId === f.active.id)
    .at(-1)
  expect(before).toMatchObject({ rows: [{ id: f.info.id }] })
  await f.remove()
  const target = await f.history.validate({
    type: "agentManager.openHistorySession",
    projectId: f.active.id,
    worktreeId: null,
    sessionId: f.info.id,
    requestId: "still-there",
  })
  expect(target.ctx).toBe(f.active)
  expect(f.active.peekState()?.getSession(f.info.id)).toBeDefined()
  const after = f.posts
    .filter((message) => message.type === "agentManager.history" && message.projectId === f.active.id)
    .at(-1)
  expect(after).toMatchObject({ rows: [{ id: f.info.id }] })
})

it("cancels scoped history deletion without changing history, tabs, routes, or selection", async () => {
  const f = setup({ confirm: false })
  expect(await f.remove()).toBe(true)
  expect(f.confirmations).toHaveLength(1)
  expect(f.confirmations[0]).toContain(f.info.title)
  expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([])
  expect(f.state.getSession(f.info.id)).toBeDefined()
  expect(f.ctx.sessions()).toHaveLength(1)
  expect(f.routes).toEqual([])
  expect(f.native).toEqual([])
  expect(f.posts).toEqual([])
  expect(f.contexts.active()).toBe(f.active)
})

it.each([false, true])(
  "deletes the exact backend session and forgets only its project references (local: %s)",
  async (local) => {
    const f = setup({ local })
    await f.remove()
    expect(f.errors).toEqual([])
    expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([
      { method: "DELETE", path: `/session/${f.info.id}`, directory: f.info.directory },
    ])
    expect(f.state.getSession(f.info.id)).toBeUndefined()
    expect(f.state.sessionPlacement(f.info.id)).toBeUndefined()
    expect(f.state.getTabOrder()).toEqual({})
    expect(f.state.getPinnedTabs()).toEqual({})
    expect(f.state.getActiveTarget()).toEqual({
      projectId: f.ctx.id,
      kind: local ? "local" : "worktree",
      ...(local ? {} : { worktreeId: f.wt.id }),
    })
    expect(f.ctx.sessions()).toEqual([])
    expect(f.state.getWorktree(f.wt.id)).toBeDefined()
    expect(f.posts).toContainEqual({
      type: "sessionDeleted",
      projectId: f.ctx.id,
      worktreeId: local ? null : f.wt.id,
      sessionID: f.info.id,
    })
    expect(f.routes).toContainEqual({ projectId: f.ctx.id, sessionId: f.info.id })
    expect(f.native).toEqual([{ projectId: f.ctx.id, sessionId: f.info.id }])
    expect(f.contexts.active()).toBe(f.active)
  },
)

it("retains the history and manager references and surfaces backend deletion failures", async () => {
  const f = setup({ failure: true })
  await f.remove()
  expect(f.errors.join(" ")).toContain("Failed to delete session")
  expect(f.state.getSession(f.info.id)).toBeDefined()
  expect(f.ctx.sessions()).toHaveLength(1)
  expect(f.state.getPinnedTabs()[f.wt.id]).toEqual([f.info.id])
  expect(f.routes).toEqual([])
  expect(f.native).toEqual([])
  expect(f.posts.filter((message) => message.type === "sessionDeleted")).toEqual([])
  expect(f.state.getWorktree(f.wt.id)).toBeDefined()
})

it("rejects a mismatched project/context and does not intercept unqualified sidebar deletion", async () => {
  const f = setup()
  expect(await handleProjectMessage({ type: "deleteSession", sessionID: f.info.id }, f.deps)).toBe(false)
  await handleProjectMessage(
    { type: "deleteSession", projectId: f.ctx.id, worktreeId: null, sessionID: f.info.id },
    f.deps,
  )
  expect(f.confirmations).toEqual([])
  expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([])
  expect(f.errors.join(" ")).toContain("requested project and context")
})

it.each(["confirmation", "client", "stop"] as const)(
  "retains a session when its confirmed ownership changes during %s",
  async (stage) => {
    const f = setup()
    if (stage === "confirmation")
      f.deps.deletion!.confirm = async () => {
        f.wt.path = "/background/moved"
        return true
      }
    if (stage === "client") f.preparation.client = () => f.ctx.dispose()
    if (stage === "stop")
      f.preparation.stop = () => {
        f.wt.path = "/background/moved"
      }
    await f.remove()
    expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([])
    expect(f.posts.filter((message) => message.type === "sessionDeleted")).toEqual([])
    expect(f.state.getSession(f.info.id)).toBeDefined()
    expect(f.native).toEqual([])
    expect(f.errors.join(" ")).toContain("changed")
  },
)
