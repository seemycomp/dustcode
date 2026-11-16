import { describe, expect, test } from "bun:test"
import {
  NativeSessionContexts,
  nativeChatTarget,
  openNativeSessionTab,
} from "../../src/kilo-provider/native-session-tabs"
import { restoredNativeSession } from "../../src/shared/native-session-state"
import { handleProjectMessage, type ProjectMessageDeps } from "../../src/agent-manager/project/messages"

function setup() {
  const panels = new Map<Panel, Owner>()
  const create = () => {
    const panel = new Panel()
    const owner = new Owner()
    panels.set(panel, owner)
    return { panel, owner }
  }
  const open = (id: string, focused?: Owner) =>
    openNativeSessionTab({
      session: { id, directory: "/repo" },
      panels,
      focused,
      selected: (owner) => owner.id,
      directory: () => "/repo",
      create,
      load: (owner, session) => owner.open(session.id),
    })
  return { panels, create, open }
}

class Panel {
  viewColumn = 1
  reveals: number[] = []
  reveal(column = this.viewColumn) {
    this.reveals.push(column)
  }
}

class Owner {
  projectId: string | undefined
  id: string | undefined
  loads = 0
  ready = Promise.withResolvers<void>()
  async open(id: string) {
    this.id = id
    this.loads++
    await this.ready.promise
  }
}

describe("native session tab ownership", () => {
  test("repeated native intent keeps the same pending request current until a different target wins", async () => {
    const ready = Promise.withResolvers<void>()
    const checks: Array<() => boolean> = []
    const deps = {
      native: async (_request, current) => {
        checks.push(current)
        await ready.promise
      },
      error: () => {},
      post: () => {},
    } as ProjectMessageDeps
    const request = { type: "agentManager.openSessionInTab" as const, projectId: "project", sessionId: "same" }
    const first = handleProjectMessage(request, deps)
    const repeated = handleProjectMessage(request, deps)
    const kept = checks.at(0)!()
    const other = handleProjectMessage({ ...request, projectId: "other" }, deps)
    const superseded = checks.at(0)!()
    const latest = checks.at(-1)!()
    ready.resolve()
    await Promise.all([first, repeated, other])
    expect(kept).toBe(true)
    expect(superseded).toBe(false)
    expect(latest).toBe(true)
  })

  test("qualified targets do not reuse ordinary or other-project owners", async () => {
    const panels = new Map<Panel, Owner>()
    const ordinary = new Owner()
    ordinary.id = "same"
    const other = new Owner()
    other.id = "same"
    other.projectId = "other"
    panels.set(new Panel(), ordinary)
    panels.set(new Panel(), other)
    const created = new Owner()
    created.ready.resolve()
    await openNativeSessionTab({
      session: { id: "same", directory: "/repo", projectId: "project" },
      panels,
      selected: (owner) => owner.id,
      directory: () => "/repo",
      project: (owner) => owner.projectId,
      create: () => ({ panel: new Panel(), owner: created }),
      load: (owner, session) => owner.open(session.id),
    })
    expect(created.loads).toBe(1)
  })

  test("failed qualified loads release ownership for a later retry", async () => {
    const panels = new Map<Panel, Owner>()
    let calls = 0
    const open = () =>
      openNativeSessionTab({
        session: { id: "same", directory: "/repo", projectId: "project" },
        panels,
        selected: (owner) => owner.id,
        directory: () => "/repo",
        project: (owner) => owner.projectId,
        create: () => {
          const panel = new Panel()
          const owner = new Owner()
          owner.projectId = "project"
          panels.set(panel, owner)
          return { panel, owner }
        },
        load: async (owner, session) => {
          owner.id = session.id
          calls++
          throw new Error("load failed")
        },
      })
    await expect(open()).rejects.toThrow("load failed")
    await expect(open()).rejects.toThrow("load failed")
    expect(calls).toBe(2)
  })

  test("qualified reservations reuse repeated pending opens after a native move", async () => {
    const panels = new Map<Panel, Owner>()
    const open = () =>
      openNativeSessionTab({
        session: { id: "same", projectId: "project", directory: "/repo" },
        panels,
        selected: (owner) => owner.id,
        directory: () => "/repo",
        create: () => {
          const panel = new Panel()
          const owner = new Owner()
          panels.set(panel, owner)
          return { panel, owner }
        },
        load: (owner, session) => owner.open(session.id),
      })
    const pending = open()
    const [panel, owner] = [...panels].at(0)!
    panel.viewColumn = 3
    await open()
    expect(panels.size).toBe(1)
    expect(panel.reveals).toEqual([3])
    expect(owner.loads).toBe(1)
    owner.ready.resolve()
    await pending
  })

  test("superseded readiness releases only that pending target without a late delivery", async () => {
    const panels = new Map<Panel, Owner>()
    let live = true
    let delivered = 0
    const open = () =>
      openNativeSessionTab({
        session: { id: "same", projectId: "project", directory: "/repo", current: () => live },
        panels,
        selected: (owner) => owner.id,
        directory: () => "/repo",
        create: () => {
          const panel = new Panel()
          const owner = new Owner()
          owner.id = "same"
          owner.projectId = "project"
          panels.set(panel, owner)
          return { panel, owner }
        },
        load: async (owner, _session, current) => {
          await owner.ready.promise
          if (current()) delivered++
        },
      })
    const pending = open()
    const [panel, owner] = [...panels].at(0)!
    live = false
    owner.ready.resolve()
    await pending
    expect(delivered).toBe(0)
    expect(panel.reveals).toEqual([])
    live = true
    const retry = open()
    expect(panels.size).toBe(2)
    for (const owner of panels.values()) owner.ready.resolve()
    await retry
    expect(delivered).toBe(1)
  })

  test("a failed old load cannot release a newer healthy selection", async () => {
    const panels = new Map<Panel, Owner>()
    const panel = new Panel()
    const owner = new Owner()
    owner.projectId = "project"
    const opening = openNativeSessionTab({
      session: { id: "old", projectId: "project", directory: "/repo" },
      panels,
      selected: (item) => item.id,
      directory: () => "/repo",
      create: () => {
        panels.set(panel, owner)
        return { panel, owner }
      },
      load: async (item) => {
        item.id = "old"
        await item.ready.promise
        throw new Error("old failure")
      },
    })
    owner.id = "new"
    owner.ready.resolve()
    await expect(opening).rejects.toThrow("old failure")
    await openNativeSessionTab({
      session: { id: "new", projectId: "project", directory: "/repo" },
      panels,
      selected: (item) => item.id,
      directory: () => "/repo",
      create: () => {
        throw new Error("Must reuse the healthy panel")
      },
      load: async () => {
        throw new Error("Must not reload")
      },
    })
    expect(panel.reveals).toEqual([1])
  })

  test("blank panels remain independent", () => {
    const state = setup()
    state.create()
    state.create()
    expect(state.panels.size).toBe(2)
    expect([...state.panels.values()].map((owner) => owner.id)).toEqual([undefined, undefined])
  })

  test("repeated opens reuse the pending owner and reveal its current group", async () => {
    const state = setup()
    const pending = state.open("B")
    const [entry] = [...state.panels.entries()]
    if (!entry) throw new Error("Expected a reserved panel")
    const [panel, owner] = entry
    panel.viewColumn = 2
    await state.open("B")
    expect(state.panels.size).toBe(1)
    expect(owner.loads).toBe(1)
    expect(panel.reveals).toEqual([2])
    owner.ready.resolve()
    await pending
  })

  test("prefers the last focused matching panel after in-place navigation", async () => {
    const state = setup()
    const first = state.create()
    const second = state.create()
    first.owner.id = second.owner.id = "B"
    await state.open("B", second.owner)
    expect(first.panel.reveals).toEqual([])
    expect(second.panel.reveals).toEqual([1])
  })

  test("navigation and disposal release the old owner", async () => {
    const state = setup()
    const first = state.create()
    first.owner.id = "A"
    first.owner.id = "B"
    const pending = state.open("A")
    expect(state.panels.size).toBe(2)
    for (const owner of state.panels.values()) owner.ready.resolve()
    await pending
    state.panels.delete(first.panel)
    const next = state.open("B")
    expect(state.panels.size).toBe(2)
    for (const owner of state.panels.values()) owner.ready.resolve()
    await next
  })

  test("the same session in another execution context is not reused", async () => {
    const panels = new Map<Panel, Owner>()
    const previous = new Owner()
    previous.id = "A"
    panels.set(new Panel(), previous)
    const owner = new Owner()
    owner.ready.resolve()
    await openNativeSessionTab({
      session: { id: "A", directory: "/other" },
      panels,
      selected: (item) => item.id,
      directory: () => "/repo",
      create: () => ({ panel: new Panel(), owner }),
      load: (item, session) => item.open(session.id),
    })
    expect(owner.loads).toBe(1)
  })
})

describe("native chat toolbar targeting", () => {
  class Provider {}
  const sidebar = new Provider()
  const active = new Provider()
  const focused = new Provider()
  const options = {
    provider: (value: unknown): value is Provider => value instanceof Provider,
    active,
    focused,
    fallback: sidebar,
  }

  test("native editor URI arguments are not treated as providers or last-focused chats", () => {
    const source = { scheme: "webview-panel" }
    expect(nativeChatTarget({ ...options, source, resource: true })).toBe(active)
    expect(nativeChatTarget({ ...options, source, resource: true, contextual: sidebar })).toBe(sidebar)
  })

  test("sidebar wrappers retain their explicit provider while keyboard actions use concrete focus", () => {
    expect(nativeChatTarget({ ...options, source: sidebar, resource: false })).toBe(sidebar)
    expect(nativeChatTarget({ ...options, source: undefined, resource: false })).toBe(focused)
  })
})

describe("native execution context restoration", () => {
  function registry() {
    const storage = new Map<string, unknown>()
    const state = {
      get: <T>(key: string, fallback?: T) => (storage.get(key) as T | undefined) ?? fallback,
      update: async (key: string, value: unknown) => {
        storage.set(key, value)
      },
    }
    const create = () => new NativeSessionContexts(state as ConstructorParameters<typeof NativeSessionContexts>[0])
    return { create }
  }

  test("restores the host execution directory rather than session metadata across registries", () => {
    const state = registry()
    const context = state.create().save("s1", "/worktree")
    expect(state.create().restore({ nativeSessionContexts: { s1: context } }, "s1")).toEqual({
      context,
      directory: "/worktree",
    })
  })

  test("two panels with the same session retain distinct trusted execution contexts", () => {
    const state = registry()
    const first = state.create().save("s1", "/first")
    const second = state.create().save("s1", "/second")
    expect(state.create().restore({ nativeSessionContexts: { s1: first } }, "s1").directory).toBe("/first")
    expect(state.create().restore({ nativeSessionContexts: { s1: second } }, "s1").directory).toBe("/second")
  })

  test("rejects forged, mismatched, or lost bindings instead of trusting webview directories", () => {
    const state = registry()
    const context = state.create().save("s1", "/trusted")
    expect(state.create().restore({ nativeSessionContexts: null }, "s1")).toEqual({ unavailable: true })
    expect(state.create().restore({ nativeSessionContexts: undefined }, "s1")).toEqual({ unavailable: true })
    expect(state.create().restore({ nativeSessionContexts: {} }, "s1")).toEqual({ unavailable: true })
    expect(state.create().restore({ nativeSessionContexts: { s2: context } }, "s2")).toEqual({ unavailable: true })
    expect(state.create().restore({ nativeSessionContexts: { s1: "/untrusted" } }, "s1")).toEqual({ unavailable: true })
    expect(
      registry()
        .create()
        .restore({ nativeSessionContexts: { s1: context } }, "s1"),
    ).toEqual({ unavailable: true })
  })

  test("legacy panels without context metadata retain their existing restore path", () => {
    expect(registry().create().restore({ sidebarActiveSessionTabID: "s1" }, "s1")).toEqual({})
  })
})

describe("native panel restore identity", () => {
  test("keeps explicit active targets even when absent from the saved list", () => {
    expect(restoredNativeSession({ sidebarSessionTabIDs: ["A"], sidebarActiveSessionTabID: "B" })).toBe("B")
  })

  test("legacy state without an active key keeps its existing first-tab fallback", () => {
    expect(restoredNativeSession({ sidebarSessionTabIDs: ["A", "B"] })).toBe("A")
    expect(restoredNativeSession(undefined)).toBeUndefined()
  })

  test("explicit empty selection and malformed state do not substitute another session", () => {
    expect(restoredNativeSession({ sidebarSessionTabIDs: ["A"], sidebarActiveSessionTabID: "" })).toBeUndefined()
    expect(restoredNativeSession({ sidebarActiveSessionTabID: "sidebar-pending:1" })).toBeUndefined()
    expect(restoredNativeSession({ sidebarSessionTabIDs: [null, 1, "A"] })).toBe("A")
    expect(restoredNativeSession({ sidebarActiveSessionTabID: {} })).toBeUndefined()
  })
})
