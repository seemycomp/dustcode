import { afterEach, describe, expect, it, mock, spyOn } from "bun:test"
import { ProjectContext } from "../../src/agent-manager/project/context"

const { AgentManagerProvider } = await import("../../src/agent-manager/AgentManagerProvider")

type Manager = {
  projectScope: { current: () => ProjectContext | undefined; run: (ctx: unknown, fn: () => unknown) => unknown }
  contexts: { active: () => ProjectContext }
  connectionService: { getClient: () => unknown }
  panel: {
    postMessage: (message: unknown) => void
    sessions: {
      getSessionDirectories: () => ReadonlyMap<string, string>
      clearSessionDirectory: (id: string) => void
      abortSessions: (ids: readonly string[]) => Promise<void>
    }
  }
  panelSessions: Set<string>
  getStateManager: () => unknown
  getRoot: () => string
  pushState: () => void
  log: (...args: unknown[]) => void
  onCloseSession: (sessionId: string) => Promise<null>
}

afterEach(() => mock.restore())

function createManager(options?: { dir?: string; panelDir?: string; state?: boolean; secondary?: boolean }) {
  const stopped: unknown[] = []
  const aborted: string[][] = []
  const cleared: string[] = []
  const removed: string[] = []
  const messages: unknown[] = []
  const events: string[] = []
  const client = {
    backgroundProcess: {
      stopSession: mock(async (params: unknown) => {
        stopped.push(params)
        events.push("processes")
        return { data: {} }
      }),
    },
  }
  const ctx = new ProjectContext("project", "/repo", true, { log: () => undefined })
  const secondary = new ProjectContext("secondary", "/secondary", false, { log: () => undefined })
  const owner = options?.secondary ? secondary : ctx
  const state = options?.state === false ? undefined : owner.stateManager()
  if (state) {
    // Keep placement and close bookkeeping real without writing fixture state to disk.
    spyOn(state, "save").mockResolvedValue(undefined)
    const wt = options?.dir
      ? state.addWorktree({ branch: "topic", path: options.dir, parentBranch: "main" })
      : undefined
    state.addSession("s1", wt?.id ?? null)
    const remove = state.removeSession.bind(state)
    spyOn(state, "removeSession").mockImplementation((id) => {
      removed.push(id)
      events.push("remove")
      remove(id)
    })
  }
  const manager = Object.create(AgentManagerProvider.prototype) as Manager
  manager.connectionService = { getClient: () => client }
  manager.panel = {
    postMessage: (message) => messages.push(message),
    sessions: {
      getSessionDirectories: () => new Map(options?.panelDir ? [["s1", options.panelDir]] : []),
      clearSessionDirectory: (id) => cleared.push(id),
      abortSessions: async (ids) => {
        aborted.push([...ids])
        events.push("abort")
      },
    },
  }
  manager.panelSessions = new Set(["s1"])
  manager.getStateManager = () => (options?.state === false ? undefined : state)
  manager.getRoot = () => "/repo"
  manager.pushState = mock(() => undefined)
  manager.log = mock(() => undefined)
  manager.projectScope = { current: () => (options?.secondary ? secondary : undefined), run: (_, fn) => fn() }
  manager.contexts = { active: () => ctx }

  return { manager, stopped, aborted, cleared, removed, messages, events, ctx, owner, state }
}

describe("AgentManagerProvider closeSession", () => {
  // The session leaves Agent Manager state before its processes are stopped:
  // process shutdown can be slow, and a state push that still listed the closed
  // session would restore the tab the user just closed.
  it("aborts the agent, drops the tab, then stops its processes", async () => {
    const { manager, stopped, aborted, cleared, removed, messages, events, state } = createManager({
      dir: "/repo/worktree",
    })
    const placement = state?.sessionPlacement("s1")

    await manager.onCloseSession("s1")

    expect(aborted).toEqual([["s1"]])
    expect(stopped).toEqual([{ sessionID: "s1", directory: "/repo/worktree" }])
    expect(events).toEqual(["abort", "remove", "processes"])
    expect(removed).toEqual(["s1"])
    expect(cleared).toEqual(["s1"])
    expect(messages).toEqual([])
    expect(manager.panelSessions.has("s1")).toBe(false)
    expect(state?.getSession("s1")).toBeUndefined()
    expect(state?.isSessionClosed("s1")).toBe(true)
    expect(state?.sessionPlacement("s1")).toBe(placement)
  })

  it("falls back to session provider directory mappings", async () => {
    const { manager, stopped } = createManager({ panelDir: "/repo/panel-worktree" })

    await manager.onCloseSession("s1")

    expect(stopped).toEqual([{ sessionID: "s1", directory: "/repo/panel-worktree" }])
  })

  it("still aborts when Agent Manager has no workspace state", async () => {
    const { manager, aborted, removed } = createManager({ state: false })

    await manager.onCloseSession("s1")

    expect(aborted).toEqual([["s1"]])
    expect(removed).toEqual([])
  })

  it("closes a session in its scoped secondary project without changing the active project", async () => {
    const { manager, ctx, owner, state, stopped, events } = createManager({
      dir: "/secondary/worktree",
      secondary: true,
    })

    await manager.onCloseSession("s1")

    expect(manager.contexts.active()).toBe(ctx)
    expect(owner.id).toBe("secondary")
    expect(ctx.loaded).toBe(false)
    expect(state?.getSession("s1")).toBeUndefined()
    expect(state?.isSessionClosed("s1")).toBe(true)
    expect(stopped).toEqual([{ sessionID: "s1", directory: "/secondary/worktree" }])
    expect(events).toEqual(["abort", "remove", "processes"])
  })

  it("keeps the closed placement when the same session is closed again", async () => {
    const { manager, state, aborted, cleared, events } = createManager({ dir: "/repo/worktree" })
    const placement = state?.sessionPlacement("s1")

    await manager.onCloseSession("s1")
    await manager.onCloseSession("s1")

    expect(aborted).toEqual([["s1"], ["s1"]])
    expect(cleared).toEqual(["s1", "s1"])
    expect(events).toEqual(["abort", "remove", "processes", "abort", "remove", "processes"])
    expect(state?.getSession("s1")).toBeUndefined()
    expect(state?.isSessionClosed("s1")).toBe(true)
    expect(state?.sessionPlacement("s1")).toBe(placement)
    expect(manager.panelSessions.has("s1")).toBe(false)
  })
})
