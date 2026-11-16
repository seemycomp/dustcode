import { afterEach, expect, test } from "bun:test"
import type { Session } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../../src/agent-manager/history"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../../src/agent-manager/project/registry"
import { handleSessionLifecycle, sessionProject } from "../../src/agent-manager/session-lifecycle"
import { createWorktreeActivity } from "../../src/agent-manager/worktree-activity"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import type { AgentManagerOutMessage } from "../../src/agent-manager/types"
import { isStaleAgentSession } from "../../webview-ui/src/context/session-project"

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))

async function setup() {
  const contexts = new ProjectContexts({
    registry: new ProjectRegistry({
      read: () => ({ version: 1, projects: [{ id: "b", root: "/b", order: 0, addedAt: "now" }] }),
      write: () => {},
    }),
    workspaceRoot: () => "/a",
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
  const a = contexts.active()!
  const b = contexts.resolve("b")!
  const ready = (ctx: typeof a) => ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
  await Promise.all([ready(a), ready(b)])
  const tree = b.stateManager().addWorktree({ path: "/b/tree", branch: "feature", parentBranch: "main" })
  const info = (directory: string): Session => ({
    id: "same",
    slug: "same",
    projectID: "backend",
    directory,
    title: directory,
    version: "1",
    parentID: null,
    time: { created: 1, updated: 2 },
  })
  for (const [ctx, placement] of [
    [a, null],
    [b, tree.id],
  ] as const) {
    ctx.stateManager().addSession("same", placement)
    ctx.stateManager().setTabOrder(placement ?? "local", ["same"])
    ctx.stateManager().setPinnedTabs(placement ?? "local", ["same"])
    ctx.setSessions([
      { id: "same", title: ctx.id, parentID: null, updatedAt: new Date(2).toISOString(), worktreeId: placement },
    ])
  }
  const posts: AgentManagerOutMessage[] = []
  const raw: string[] = []
  const routes: unknown[] = []
  const busy = new Set(["same"])
  const removed = new Set<string>()
  const gate = Promise.withResolvers<{ sessions: Session[] }>()
  let hold = false
  const history = new AgentHistory({
    contexts,
    ready,
    exists: () => true,
    sessions: () => ({
      listSessionPage: async ({ directory }) =>
        directory === tree.path && hold ? gate.promise : { sessions: [info(directory)] },
      getSessionInfo: async (_id, directory) => info(directory!),
    }),
    post: (message) => posts.push(message),
  })
  const deps = {
    contexts,
    busy,
    removed,
    history,
    post: (message: AgentManagerOutMessage) => posts.push(message),
    closeBrowser: (id: string) => raw.push(`browser:${id}`),
    transfer: {
      closeBrowser: (id: string) => raw.push(`browser:${id}`),
      sessions: () =>
        ({
          clearSessionDirectory: (id: string) => raw.push(`cache:${id}`),
          unregisterSessionRoute: (ref: unknown) => routes.push(ref),
        }) as never,
    },
  }
  const listeners = new Set<(event: unknown, directory?: string) => void>()
  const activity = createWorktreeActivity({
    connection: {
      onEventFiltered: (
        filter: (event: unknown) => boolean,
        listener: (event: unknown, directory?: string) => void,
      ) => {
        const accept = (event: unknown, directory?: string) => {
          if (filter(event)) listener(event, directory)
        }
        listeners.add(accept)
        return () => listeners.delete(accept)
      },
      onStateChange: () => () => {},
      getConnectionState: () => "disconnected",
    } as never,
    paths: () => [tree.path],
    post: () => {},
    status: () => {},
    lifecycle: (event, directory) => handleSessionLifecycle(event, deps, directory),
    log: () => {},
  })
  const emit = (
    directory?: string,
    event: unknown = { type: "session.deleted", properties: { sessionID: "same" } },
  ) => {
    for (const listener of listeners) listener(event, directory)
  }
  const request = (ctx: typeof a, refresh = false) =>
    history.request({
      type: "agentManager.requestHistory",
      projectId: ctx.id,
      worktreeId: ctx === a ? null : tree.id,
      requestId: `${ctx.id}:${refresh}`,
      query: "",
      refresh,
    })
  const rows = (projectId: string) =>
    posts.filter((message) => message.type === "agentManager.history" && message.projectId === projectId).at(-1)
  cleanup.push(() => {
    activity.dispose()
    history.dispose()
    void contexts.dispose()
  })
  return {
    contexts,
    a,
    b,
    tree,
    info,
    posts,
    raw,
    routes,
    busy,
    removed,
    gate,
    history,
    emit,
    request,
    rows,
    hold: () => {
      hold = true
    },
  }
}

test("directory-qualified deletion traverses activity/lifecycle/history without clearing a same-ID owner", async () => {
  const f = await setup()
  await Promise.all([f.request(f.a), f.request(f.b)])
  expect(f.rows(f.a.id)).toMatchObject({ rows: [{ id: "same", title: f.a.root }] })
  expect(f.rows(f.b.id)).toMatchObject({ rows: [{ id: "same", title: f.tree.path }] })
  const state = f.a.stateManager()
  const tabs = state.getTabOrder()
  const pins = state.getPinnedTabs()
  f.hold()
  const pending = f.request(f.b, true)
  f.emit(f.tree.path)
  f.gate.resolve({ sessions: [f.info(f.tree.path)] })
  await pending
  expect(state.getSession("same")).toBeDefined()
  expect(state.getTabOrder()).toEqual(tabs)
  expect(state.getPinnedTabs()).toEqual(pins)
  expect(f.a.hasLiveSession("same")).toBe(true)
  expect(f.b.hasLiveSession("same")).toBe(false)
  expect(f.b.stateManager().sessionPlacement("same")).toBeUndefined()
  expect(f.raw).toEqual([])
  expect(f.routes).toEqual([{ projectId: f.b.id, sessionId: "same" }])
  expect(f.busy.has("same")).toBe(true)
  expect(f.removed.has("same")).toBe(false)
  expect(f.rows(f.a.id)).toMatchObject({ rows: [{ id: "same", title: f.a.root }] })
  expect(f.rows(f.b.id)).toMatchObject({ rows: [] })
  f.emit()
  f.emit("/unknown")
  expect(f.a.stateManager().getSession("same")).toBeDefined()
  expect(f.rows(f.a.id)).toMatchObject({ rows: [{ id: "same", title: f.a.root }] })
  f.emit(f.tree.path, {
    type: "session.updated",
    properties: { info: { ...f.info(f.tree.path), time: { created: 1, updated: 5 } } },
  })
  expect(f.a.sessions().at(0)?.title).toBe(f.a.id)
  expect(f.b.sessions()).toEqual([])
  expect(f.rows(f.a.id)).toMatchObject({ rows: [{ id: "same", title: f.a.root }] })
  expect(f.rows(f.b.id)).toMatchObject({ rows: [] })
  await expect(
    f.history.validate({
      type: "agentManager.openHistorySession",
      projectId: f.a.id,
      worktreeId: null,
      sessionId: "same",
      requestId: "alive",
    }),
  ).resolves.toMatchObject({ ctx: f.a })
  await expect(
    f.history.validate({
      type: "agentManager.openHistorySession",
      projectId: f.b.id,
      worktreeId: f.tree.id,
      sessionId: "same",
      requestId: "deleted",
    }),
  ).rejects.toThrow("no longer available")
})

test.each([undefined, "/unknown"])(
  "missing or unknown event directory %s does not guess an owner",
  async (directory) => {
    const f = await setup()
    await Promise.all([f.request(f.a), f.request(f.b)])
    f.emit(directory)
    expect(f.a.stateManager().getSession("same")).toBeDefined()
    expect(f.b.stateManager().getSession("same")).toBeDefined()
    expect(f.raw).toEqual([])
    expect(f.routes).toEqual([])
    expect(f.removed.size).toBe(0)
    expect(f.rows(f.a.id)).toMatchObject({ rows: [{ id: "same" }] })
    expect(f.rows(f.b.id)).toMatchObject({ rows: [{ id: "same" }] })
  },
)

test("backend info.directory resolves a moved-to-Local owner without using its Local override", async () => {
  const f = await setup()
  f.b.stateManager().moveSession("same", null)
  f.emit(undefined, { type: "session.deleted", properties: { info: f.info(f.tree.path) } })
  expect(f.a.stateManager().getSession("same")).toBeDefined()
  expect(f.b.stateManager().sessionPlacement("same")).toBeUndefined()
  expect(f.raw).toEqual([])
  expect(f.routes).toEqual([{ projectId: f.b.id, sessionId: "same" }])
})

test("an exact session route can identify an otherwise unknown backend directory", async () => {
  const f = await setup()
  const sessions = {
    routeSessionDirectoryFor: (ref: { projectId: string; sessionId: string }) =>
      ref.projectId === f.b.id ? "/old/backend" : undefined,
  } as never
  expect(sessionProject("same", "/old/backend", f.contexts, sessions)).toBe(f.b.id)
  f.a.stateManager().forgetSession("same")
  f.a.removeLiveSession("same")
  f.b.stateManager().forgetSession("same")
  f.b.removeLiveSession("same")
  expect(sessionProject("same", undefined, f.contexts, sessions)).toBe(f.b.id)
})

test("directoryless deletion resolves a unique persisted owner even after its live row closes", async () => {
  const f = await setup()
  f.a.stateManager().forgetSession("same")
  f.a.removeLiveSession("same")
  f.b.removeLiveSession("same")
  expect(sessionProject("same", undefined, f.contexts)).toBe(f.b.id)
  f.emit()
  expect(f.b.stateManager().sessionPlacement("same")).toBeUndefined()
  expect(f.raw).toEqual(["browser:same", "cache:same"])
})

test("a directory shared by two contexts is ambiguous rather than first-match ownership", async () => {
  const f = await setup()
  f.a.stateManager().addWorktree({ path: f.tree.path, branch: "duplicate", parentBranch: "main" })
  expect(sessionProject("same", f.tree.path, f.contexts)).toBeUndefined()
  f.emit(f.tree.path)
  expect(f.a.stateManager().getSession("same")).toBeDefined()
  expect(f.b.stateManager().getSession("same")).toBeDefined()
  expect(f.raw).toEqual([])
})

test("shared consumers reject scoped deletion until their owner is known but accept legacy sidebar messages", () => {
  const scoped = { type: "sessionDeleted", projectId: "b", sessionID: "same" } as const
  expect(isStaleAgentSession(scoped, undefined)).toBe(true)
  expect(isStaleAgentSession(scoped, "a")).toBe(true)
  expect(isStaleAgentSession(scoped, "b")).toBe(false)
  expect(isStaleAgentSession({ type: "sessionDeleted", sessionID: "same" }, undefined)).toBe(false)
  expect(isStaleAgentSession({ type: "sessionDeleted", sessionID: "same" }, "a")).toBe(false)
})
