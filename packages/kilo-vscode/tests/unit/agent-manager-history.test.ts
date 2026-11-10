import { describe, expect, it } from "bun:test"
import type { Session } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../../src/agent-manager/history"
import { ProjectContext } from "../../src/agent-manager/project/context"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import type { HistoryMessage, HistoryRequest } from "../../src/shared/agent-history"
import type { SessionPage } from "../../src/kilo-provider/session-page"

function session(id: string, directory: string, updated = 100, title = id): Session {
  return { id, directory, title, slug: id, projectID: "backend", version: "1", time: { created: 1, updated } }
}

function setup() {
  const state = new WorktreeStateManager("/history", () => {})
  // State writes are not part of metadata discovery; keep this real state in memory.
  state.save = async () => {}
  const wt = state.addWorktree({ path: "/history/w", branch: "w", parentBranch: "main" })
  const ctx = new ProjectContext("p", "/history", false, { log: () => {}, exists: () => true, state: () => state })
  ctx.stateManager()
  const posts: HistoryMessage[] = []
  const pages: Array<SessionPage | Error | (() => Promise<SessionPage>)> = []
  const calls: Array<{ directory: string; cursor?: number; cursorID?: string; limit: number; search?: string }> = []
  const metadata = new Map<string, Session | Error | (() => Promise<Session | undefined>)>()
  const lookups: string[] = []
  const clock = { value: 50_000 }
  const history = new AgentHistory({
    contexts: { resolve: (id) => (id === ctx.id ? ctx : undefined), values: () => [ctx].values() },
    ready: async () => ({ ok: true, current: true, refsFixed: 0 }),
    sessions: () => ({
      listSessionPage: async (input) => {
        calls.push(input)
        const page = pages.shift()
        if (page instanceof Error) throw page
        if (typeof page === "function") return page()
        return page ?? { sessions: [] }
      },
      getSessionInfo: async (id) => {
        lookups.push(id)
        const value = metadata.get(id)
        if (value instanceof Error) throw value
        if (typeof value === "function") return value()
        return value
      },
    }),
    post: (message) => posts.push(message),
    exists: () => true,
    now: () => clock.value,
  })
  const request = (extra: Partial<HistoryRequest> = {}) =>
    history.request({
      type: "agentManager.requestHistory",
      projectId: "p",
      worktreeId: null,
      query: "",
      requestId: "r",
      ...extra,
    })
  return { history, state, wt, ctx, posts, pages, calls, metadata, lookups, clock, request }
}

describe("Agent Manager lazy history", () => {
  it("keeps raw paired cursors independent of projected rows and preserves a failed next page", async () => {
    const f = setup()
    f.state.addSession("moved", f.wt.id)
    f.pages.push({
      sessions: [session("native", f.ctx.root, 200), session("moved", f.ctx.root, 100)],
      cursor: 100,
      nextCursorID: "moved",
    })
    await f.request()
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["native"])
    f.pages.push(new Error("offline"))
    await f.request({ more: true })
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "native" }], error: "offline", more: true, loading: false })
    f.pages.push({ sessions: [session("older", f.ctx.root, 50)] })
    await f.request({ more: true })
    expect(f.calls.at(-1)).toMatchObject({ cursor: 100, cursorID: "moved", limit: 30 })
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["native", "older"])
    f.history.dispose()
  })

  it("holds older assigned candidates behind the raw watermark", async () => {
    const f = setup()
    f.state.addSession("assigned", f.wt.id)
    f.metadata.set("assigned", session("assigned", f.ctx.root, 20))
    f.pages.push({ sessions: [session("newer", f.wt.path, 100)], cursor: 100, nextCursorID: "newer" })
    await f.request({ worktreeId: f.wt.id })
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["newer"])
    f.pages.push({ sessions: [session("middle", f.wt.path, 50)] })
    await f.request({ worktreeId: f.wt.id, more: true })
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["newer", "middle", "assigned"])
    f.history.dispose()
  })

  it("does not let pending snapshots overwrite newer lifecycle metadata or resurrect deleted rows", async () => {
    const f = setup()
    const pending = Promise.withResolvers<{ sessions: Session[] }>()
    f.history.dispose()
    const history = new AgentHistory({
      contexts: { resolve: () => f.ctx, values: () => [f.ctx].values() },
      ready: async () => ({ ok: true, current: true, refsFixed: 0 }),
      sessions: () => ({ listSessionPage: () => pending.promise }),
      exists: () => true,
      post: (message) => f.posts.push(message),
    })
    const loading = history.request({
      type: "agentManager.requestHistory",
      projectId: "p",
      worktreeId: null,
      query: "",
      requestId: "r",
    })
    await Bun.sleep(0)
    history.event({
      type: "session.updated",
      properties: { info: { ...session("renamed", f.ctx.root, 300, "New title"), parentID: null } },
    })
    history.event({ type: "session.deleted", properties: { sessionID: "deleted" } })
    pending.resolve({ sessions: [session("renamed", f.ctx.root, 100, "Old title"), session("deleted", f.ctx.root)] })
    await loading
    expect(f.posts.at(-1)?.rows).toEqual([
      { id: "renamed", title: "New title", updatedAt: new Date(300).toISOString() },
    ])
    history.dispose()
  })

  it("cancels bounded sparse scans on collapse, then resumes the raw continuation", async () => {
    const f = setup()
    f.state.addSession("moved", f.wt.id)
    f.pages.push({ sessions: [session("moved", f.ctx.root)], cursor: 100, nextCursorID: "moved" })
    await f.request()
    expect(f.calls).toHaveLength(1)
    expect(f.posts.at(-1)).toMatchObject({ rows: [], more: true, loading: true })
    await f.request({ active: false })
    await Bun.sleep(10)
    expect(f.calls).toHaveLength(1)
    f.pages.push({ sessions: [session("found", f.ctx.root, 50)] })
    await f.request({ more: true })
    expect(f.calls.at(-1)).toMatchObject({ cursor: 100, cursorID: "moved" })
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["found"])
    f.history.dispose()
  })

  it("continues one sparse page per turn until safe candidates are available", async () => {
    const f = setup()
    f.state.addSession("moved", f.wt.id)
    f.pages.push({ sessions: [session("moved", f.ctx.root)], cursor: 100, nextCursorID: "moved" })
    f.pages.push({ sessions: [session("found", f.ctx.root, 50)] })
    await f.request()
    expect(f.calls).toHaveLength(1)
    await Bun.sleep(20)
    expect(f.calls).toHaveLength(2)
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "found" }], more: false, loading: false })
    f.history.dispose()
  })

  it("reuses fresh cache, retains stale rows on refresh failure, and replaces its cursor generation", async () => {
    const f = setup()
    f.pages.push({ sessions: [session("cached", f.ctx.root)], cursor: 100, nextCursorID: "cached" })
    await f.request()
    const generation = f.posts.at(-1)!.generation
    await f.request({ requestId: "cached" })
    expect(f.calls).toHaveLength(1)
    f.clock.value += 30_001
    f.pages.push(new Error("revalidate failed"))
    await f.request({ requestId: "stale" })
    expect(f.calls.at(-1)?.cursor).toBeUndefined()
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "cached" }], error: "revalidate failed" })
    expect(f.posts.at(-1)!.generation).toBeGreaterThan(generation)
    f.history.dispose()
  })

  it("retires obsolete queries and prevents an older page replacing refresh results", async () => {
    const f = setup()
    const pending = Promise.withResolvers<SessionPage>()
    f.pages.push(() => pending.promise)
    const first = f.request({ query: "a", requestId: "old" })
    await Bun.sleep(0)
    f.pages.push({ sessions: [session("b", f.ctx.root, 200)] })
    await f.request({ query: "b", requestId: "current" })
    pending.resolve({ sessions: [session("a", f.ctx.root)] })
    await first
    expect(f.posts.at(-1)).toMatchObject({ query: "b", requestId: "current", rows: [{ id: "b" }] })
    const refresh = Promise.withResolvers<SessionPage>()
    f.pages.push(() => refresh.promise)
    const loading = f.request({ query: "b", more: true, refresh: true, requestId: "superseded" })
    await Bun.sleep(0)
    f.pages.push({ sessions: [session("b-new", f.ctx.root, 400)] })
    await f.request({ query: "b", refresh: true, requestId: "refreshed" })
    refresh.resolve({ sessions: [session("b-old", f.ctx.root, 300)] })
    await loading
    expect(f.posts.at(-1)).toMatchObject({ requestId: "refreshed", rows: [{ id: "b-new" }] })
    f.history.dispose()
  })

  it("reuses root metadata, revalidates assignments, and applies title search without adopting tabs", async () => {
    const f = setup()
    f.state.addSession("known", f.wt.id)
    f.state.addSession("unknown", f.wt.id)
    f.state.addSession("child", f.wt.id)
    f.ctx.upsertSession({
      id: "known",
      title: "Find Known",
      parentID: null,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(200).toISOString(),
      worktreeId: f.wt.id,
      revert: null,
      summary: null,
    })
    f.metadata.set("known", session("known", f.ctx.root, 200, "Find Known"))
    f.metadata.set("unknown", session("unknown", f.ctx.root, 100, "find Unknown"))
    f.metadata.set("child", { ...session("child", f.ctx.root, 100, "find Child"), parentID: "parent" })
    f.pages.push({ sessions: [] })
    const count = f.state.getSessions().length
    await f.request({ worktreeId: f.wt.id, query: "FIND" })
    await Bun.sleep(20)
    expect(f.lookups).toEqual(["known", "unknown", "child"])
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["known", "unknown"])
    expect(f.state.getSessions()).toHaveLength(count)
    expect(f.calls).toHaveLength(1)
    expect(f.calls.at(-1)).toMatchObject({ search: "FIND", limit: 30 })
    f.history.dispose()
  })

  it("projects a closed placement only to its destination and excludes descendants and children", async () => {
    const f = setup()
    f.state.addSession("closed", f.wt.id)
    f.state.closeSession("closed", f.wt.id)
    f.state.removeSession("closed")
    f.metadata.set("closed", session("closed", f.ctx.root))
    f.pages.push({
      sessions: [
        session("closed", f.ctx.root),
        session("descendant", `${f.ctx.root}/nested`),
        { ...session("child", f.ctx.root), parentID: "parent" },
      ],
    })
    await f.request()
    expect(f.posts.at(-1)?.rows).toEqual([])
    f.pages.push({ sessions: [] })
    await f.request({ worktreeId: f.wt.id })
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["closed"])
    f.history.dispose()
  })

  it("limits all page and assigned lookups to two concurrent calls and deduplicates expands", async () => {
    const f = setup()
    f.history.dispose()
    f.state.addSession("assigned", null)
    const pending: Array<ReturnType<typeof Promise.withResolvers<void>>> = []
    let running = 0
    let peak = 0
    const call = async () => {
      running++
      peak = Math.max(peak, running)
      const deferred = Promise.withResolvers<void>()
      pending.push(deferred)
      await deferred.promise
      running--
    }
    const history = new AgentHistory({
      contexts: { resolve: () => f.ctx, values: () => [f.ctx].values() },
      ready: async () => ({ ok: true, current: true, refsFixed: 0 }),
      sessions: () => ({
        listSessionPage: async () => {
          await call()
          return { sessions: [] }
        },
        getSessionInfo: async () => {
          await call()
          return session("assigned", f.ctx.root)
        },
      }),
      post: (message) => f.posts.push(message),
    })
    const request: HistoryRequest = {
      type: "agentManager.requestHistory",
      projectId: f.ctx.id,
      worktreeId: null,
      query: "",
      requestId: "r",
    }
    const first = history.request(request)
    await Bun.sleep(0)
    const duplicate = history.request({ ...request, requestId: "duplicate" })
    const other = history.request({ ...request, worktreeId: f.wt.id })
    await Bun.sleep(0)
    expect(pending).toHaveLength(2)
    expect(peak).toBe(2)
    pending.at(0)!.resolve()
    pending.at(1)!.resolve()
    await Bun.sleep(0)
    expect(pending).toHaveLength(3)
    pending.at(2)!.resolve()
    await Promise.all([first, duplicate, other])
    expect(peak).toBe(2)
    history.dispose()
  })

  it("lets a later authoritative refresh supersede an earlier lifecycle rename", async () => {
    const f = setup()
    f.pages.push({ sessions: [session("renamed", f.ctx.root, 100, "Original")] })
    await f.request()
    f.history.event({
      type: "session.updated",
      properties: { info: session("renamed", f.ctx.root, 200, "Local rename") },
    })
    f.pages.push({ sessions: [session("renamed", f.ctx.root, 300, "External rename")] })
    await f.request({ refresh: true })
    expect(f.posts.at(-1)?.rows.at(0)?.title).toBe("External rename")
    f.history.dispose()
  })

  it("preserves a newer rename in stale rows when revalidation fails", async () => {
    const f = setup()
    f.pages.push({ sessions: [session("renamed", f.ctx.root, 100, "Original")] })
    await f.request()
    const pending = Promise.withResolvers<SessionPage>()
    f.pages.push(() => pending.promise)
    const refresh = f.request({ refresh: true })
    await Bun.sleep(0)
    f.history.event({
      type: "session.updated",
      properties: { info: { ...session("renamed", f.ctx.root, 200, "New title"), parentID: null } },
    })
    pending.reject(new Error("offline"))
    await refresh
    expect(f.posts.at(-1)?.rows.at(0)?.title).toBe("New title")
    f.history.dispose()
  })

  it("drops retired search caches but keeps the unfiltered cache", async () => {
    const f = setup()
    f.pages.push({ sessions: [session("root", f.ctx.root)] })
    await f.request()
    f.pages.push({ sessions: [session("a", f.ctx.root)] })
    await f.request({ query: "a" })
    f.pages.push({ sessions: [session("b", f.ctx.root)] })
    await f.request({ query: "b" })
    await f.request()
    expect(f.calls).toHaveLength(3)
    f.pages.push({ sessions: [session("a-new", f.ctx.root)] })
    await f.request({ query: "a" })
    expect(f.calls).toHaveLength(4)
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["a-new"])
    f.history.dispose()
  })

  it("isolates Local history and errors across projects and similarly named directories", async () => {
    const f = setup()
    f.history.dispose()
    const state = new WorktreeStateManager("/other", () => {})
    state.save = async () => {}
    const other = new ProjectContext("other", "/other", false, {
      log: () => {},
      exists: () => true,
      state: () => state,
    })
    other.stateManager()
    const map = new Map([
      [f.ctx.id, f.ctx],
      [other.id, other],
    ])
    const history = new AgentHistory({
      contexts: { resolve: (id) => map.get(id), values: () => map.values() },
      ready: async () => ({ ok: true, current: true, refsFixed: 0 }),
      sessions: () => ({
        listSessionPage: async ({ directory, search }) => {
          if (search === "error") throw new Error(`failed:${directory}`)
          return { sessions: [session(directory, directory)] }
        },
      }),
      post: (message) => f.posts.push(message),
    })
    const request: HistoryRequest = {
      type: "agentManager.requestHistory",
      projectId: f.ctx.id,
      worktreeId: null,
      query: "",
      requestId: "first",
    }
    await Promise.all([
      history.request(request),
      history.request({ ...request, projectId: other.id, requestId: "second" }),
    ])
    expect(f.posts.findLast((message) => message.projectId === f.ctx.id)?.rows.at(0)?.id).toBe(f.ctx.root)
    expect(f.posts.findLast((message) => message.projectId === other.id)?.rows.at(0)?.id).toBe(other.root)
    await history.request({ ...request, projectId: other.id, query: "error" })
    expect(f.posts.at(-1)).toMatchObject({ projectId: other.id, error: "failed:/other", rows: [] })
    expect(f.posts.findLast((message) => message.projectId === f.ctx.id)?.error).toBeUndefined()
    history.dispose()
  })

  it("reconnect starts a new raw generation and rejects an earlier in-flight page", async () => {
    const f = setup()
    f.pages.push({ sessions: [session("cached", f.ctx.root)], cursor: 100, nextCursorID: "cached" })
    await f.request()
    const generation = f.posts.at(-1)!.generation
    const pending = Promise.withResolvers<SessionPage>()
    f.pages.push(() => pending.promise)
    const old = f.request({ more: true })
    await Bun.sleep(0)
    f.pages.push({ sessions: [session("fresh", f.ctx.root, 200)] })
    f.history.reconnect()
    await Bun.sleep(20)
    expect(f.calls.at(-1)?.cursor).toBeUndefined()
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "fresh" }], more: false, loading: false })
    expect(f.posts.at(-1)!.generation).toBeGreaterThan(generation)
    pending.resolve({ sessions: [session("obsolete", f.ctx.root, 50)] })
    await old
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["fresh"])
    f.history.dispose()
  })

  it("does not scan older raw pages merely to hydrate assigned metadata", async () => {
    const f = setup()
    for (const id of ["a", "b", "c"]) {
      f.state.addSession(id, f.wt.id)
      f.metadata.set(id, session(id, f.ctx.root, 50))
    }
    f.pages.push({ sessions: [session("native", f.wt.path, 100)], cursor: 100, nextCursorID: "native" })
    await f.request({ worktreeId: f.wt.id })
    await Bun.sleep(20)
    expect(f.lookups).toEqual(["a", "b", "c"])
    expect(f.calls).toHaveLength(1)
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "native" }], more: true, loading: false })
    f.history.dispose()
  })

  it("invalidates source and destination on placement changes while a source page is pending", async () => {
    const f = setup()
    f.state.addSession("placed", null)
    f.metadata.set("placed", session("placed", f.ctx.root))
    f.pages.push({ sessions: [session("placed", f.ctx.root)], cursor: 100, nextCursorID: "placed" })
    await f.request()
    f.pages.push({ sessions: [] })
    await f.request({ worktreeId: f.wt.id })
    const pending = Promise.withResolvers<SessionPage>()
    f.pages.push(() => pending.promise)
    const old = f.request({ more: true })
    await Bun.sleep(0)
    f.pages.push({ sessions: [session("placed", f.ctx.root)] }, { sessions: [] })
    f.state.moveSession("placed", f.wt.id)
    await Bun.sleep(20)
    pending.resolve({ sessions: [session("placed", f.ctx.root)] })
    await old
    expect(f.posts.findLast((message) => message.worktreeId === null)?.rows).toEqual([])
    expect(f.posts.findLast((message) => message.worktreeId === f.wt.id)?.rows.map((row) => row.id)).toEqual(["placed"])
    f.history.dispose()
  })

  it("does not start metadata work when collapse wins pending project readiness", async () => {
    const f = setup()
    f.history.dispose()
    const pending = Promise.withResolvers<{ ok: boolean; current: boolean; refsFixed: number }>()
    let calls = 0
    const history = new AgentHistory({
      contexts: { resolve: () => f.ctx, values: () => [f.ctx].values() },
      ready: () => pending.promise,
      sessions: () => ({
        listSessionPage: async () => {
          calls++
          return { sessions: [] }
        },
      }),
      post: () => {},
    })
    const request: HistoryRequest = {
      type: "agentManager.requestHistory",
      projectId: f.ctx.id,
      worktreeId: null,
      query: "",
      requestId: "r",
    }
    const opening = history.request(request)
    await history.request({ ...request, active: false })
    pending.resolve({ ok: true, current: true, refsFixed: 0 })
    await opening
    expect(calls).toBe(0)
    history.dispose()
  })

  it("does not scan an extra raw page when a refresh returns the cached first page", async () => {
    const f = setup()
    const page = { sessions: [session("same", f.ctx.root)], cursor: 100, nextCursorID: "same" }
    f.pages.push(page)
    await f.request()
    f.pages.push(page)
    await f.request({ refresh: true })
    await Bun.sleep(20)
    expect(f.calls).toHaveLength(2)
    expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "same" }], more: true, loading: false })
    f.history.dispose()
  })

  it("retries an assigned-metadata failure without draining another raw page", async () => {
    const f = setup()
    f.state.addSession("a", f.wt.id)
    f.state.addSession("b", f.wt.id)
    f.metadata.set("a", session("a", f.ctx.root, 200))
    f.metadata.set("b", new Error("metadata offline"))
    f.pages.push({ sessions: [session("native", f.wt.path)], cursor: 100, nextCursorID: "native" })
    await f.request({ worktreeId: f.wt.id })
    await Bun.sleep(20)
    expect(f.posts.at(-1)?.error).toBe("metadata offline")
    f.metadata.set("b", session("b", f.ctx.root, 150))
    await f.request({ worktreeId: f.wt.id })
    expect(f.posts.at(-1)?.error).toBeUndefined()
    expect(f.posts.at(-1)?.rows.map((row) => row.id)).toEqual(["a", "b", "native"])
    expect(f.calls).toHaveLength(1)
    f.history.dispose()
  })

  it("finishes a missing closed assignment once per generation without retrying indefinitely", async () => {
    const f = setup()
    f.state.closeSession("missing", f.wt.id)
    f.pages.push({ sessions: [] })
    try {
      await f.request({ worktreeId: f.wt.id })
      expect(f.posts.at(-1)).toMatchObject({ rows: [], more: false, loading: false })
      expect(f.posts.at(-1)?.error).toBeUndefined()
      await Bun.sleep(25)
      await f.request({ worktreeId: f.wt.id })
      expect(f.lookups).toEqual(["missing"])
      expect(f.state.sessionPlacement("missing")).toBe(f.wt.id)

      f.metadata.set("missing", session("missing", f.ctx.root))
      f.pages.push({ sessions: [] })
      await f.request({ worktreeId: f.wt.id, refresh: true })
      expect(f.lookups).toEqual(["missing", "missing"])
      expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "missing" }], more: false, loading: false })
    } finally {
      f.history.dispose()
    }
  })

  it.each(["refresh", "expiry", "reconnect"])("revalidates assigned-only cached metadata after %s", async (trigger) => {
    const f = setup()
    f.state.addSession("assigned", f.wt.id)
    f.ctx.upsertSession({
      id: "assigned",
      title: "Original",
      parentID: null,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(100).toISOString(),
      worktreeId: f.wt.id,
      revert: null,
      summary: null,
    })
    f.metadata.set("assigned", session("assigned", f.ctx.root, 100, "Original"))
    f.pages.push({ sessions: [] })
    try {
      await f.request({ worktreeId: f.wt.id })
      expect(f.posts.at(-1)?.rows.at(0)?.title).toBe("Original")

      f.metadata.set("assigned", session("assigned", f.ctx.root, 200, "External rename"))
      f.pages.push({ sessions: [] })
      if (trigger === "expiry") f.clock.value += 30_001
      if (trigger === "reconnect") {
        f.history.reconnect()
        await Bun.sleep(25)
      }
      if (trigger !== "reconnect") await f.request({ worktreeId: f.wt.id, refresh: trigger === "refresh" })
      expect(f.posts.at(-1)).toMatchObject({ rows: [{ id: "assigned", title: "External rename" }], loading: false })
      expect(f.lookups).toEqual(["assigned", "assigned"])

      f.metadata.delete("assigned")
      f.pages.push({ sessions: [] })
      await f.request({ worktreeId: f.wt.id, refresh: true })
      expect(f.posts.at(-1)).toMatchObject({ rows: [], more: false, loading: false })
      expect(f.state.getSession("assigned")?.worktreeId).toBe(f.wt.id)
      expect(f.ctx.sessions().at(0)?.title).toBe("Original")
    } finally {
      f.history.dispose()
    }
  })

  it("retains the last validated assigned title when refresh fails with an older project view", async () => {
    const f = setup()
    f.state.addSession("assigned", f.wt.id)
    f.ctx.upsertSession({
      id: "assigned",
      title: "Original",
      parentID: null,
      worktreeId: f.wt.id,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(100).toISOString(),
      revert: null,
      summary: null,
    })
    f.metadata.set("assigned", session("assigned", f.ctx.root, 200, "External rename"))
    f.pages.push({ sessions: [] })
    try {
      await f.request({ worktreeId: f.wt.id })
      expect(f.posts.at(-1)?.rows.at(0)?.title).toBe("External rename")
      f.metadata.set("assigned", new Error("metadata offline"))
      f.pages.push({ sessions: [] })
      await f.request({ worktreeId: f.wt.id, refresh: true })
      expect(f.posts.at(-1)).toMatchObject({
        rows: [{ title: "External rename" }],
        error: "metadata offline",
        loading: false,
      })
    } finally {
      f.history.dispose()
    }
  })

  it.each(["missing", "child"])(
    "preserves a newer lifecycle update when an assigned lookup returns %s",
    async (result) => {
      const f = setup()
      f.state.closeSession("assigned", f.wt.id)
      const pending = Promise.withResolvers<Session | undefined>()
      f.metadata.set("assigned", () => pending.promise)
      f.pages.push({ sessions: [] })
      try {
        const loading = f.request({ worktreeId: f.wt.id })
        await Bun.sleep(0)
        f.history.event({
          type: "session.updated",
          properties: { info: { ...session("assigned", f.ctx.root, 300, "Latest title"), parentID: null } },
        })
        pending.resolve(result === "child" ? { ...session("assigned", f.ctx.root), parentID: "parent" } : undefined)
        await loading
        expect(f.posts.at(-1)).toMatchObject({
          rows: [{ id: "assigned", title: "Latest title" }],
          more: false,
          loading: false,
        })
      } finally {
        f.history.dispose()
      }
    },
  )
})
