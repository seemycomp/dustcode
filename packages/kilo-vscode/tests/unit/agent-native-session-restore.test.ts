import { describe, expect, it } from "bun:test"
import { NativeSessionContexts } from "../../src/kilo-provider/native-session-tabs"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRouteService } from "../../src/agent-manager/project/route"
import { restoreNativeScope } from "../../src/agent-manager/project/native"

function memento() {
  const values = new Map<string, unknown>()
  return {
    get: <T>(key: string, fallback: T): T => (values.get(key) as T | undefined) ?? fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, value)
    },
  }
}

const scope = { projectId: "project-a", root: "/projects/a", worktreeId: "tree-a" }

describe("Agent Manager native restore bindings", () => {
  it("rehydrates an inactive worktree before any manager panel or old session exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "native-restore-"))
    const directory = join(root, "tree")
    mkdirSync(directory)
    const contexts = new ProjectContexts({
      workspaceRoot: () => join(root, "active"),
      registry: {
        list: () => [{ id: "inactive", root, label: "Inactive", expanded: false }],
        get: (id) => (id === "inactive" ? { id, root, label: "Inactive", expanded: false } : undefined),
      },
      deps: { log: () => {} },
    })
    const active = contexts.active()
    const ctx = contexts.resolve("inactive")!
    const state = ctx.stateManager()
    const tree = state.addWorktree({ branch: "feature", path: directory, parentBranch: "main" })
    const routes = new ProjectRouteService()
    const calls: unknown[] = []
    const deps = {
      contexts,
      routes,
      ready: async (project: typeof ctx, opts?: { warm?: boolean }) => {
        calls.push([project.id, opts])
        return project.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
      },
    }
    try {
      const binding = { projectId: ctx.id, root, directory, worktreeId: tree.id }
      const restored = await restoreNativeScope(binding, deps)
      expect(contexts.active()).toBe(active)
      expect(calls).toEqual([["inactive", { warm: false }]])
      contexts.expand(ctx.id)
      contexts.collapse(ctx.id)
      restored.validate()
      restored.register("new-task")
      expect(state.sessionPlacement("new-task")).toBe(tree.id)
      expect(routes.trySessionDirectoryFor({ projectId: ctx.id, sessionId: "new-task" })).toBe(directory)
      await deps.ready(ctx, { warm: false })
      routes.registerProject(ctx.id, ctx.root, ctx.generation)
      restored.validate("new-task")
      state.moveSession("new-task", null)
      expect(() => restored.validate("new-task")).toThrow("placement")
      await expect(restoreNativeScope({ ...binding, root: join(root, "wrong") }, deps)).rejects.toThrow("project")
      await expect(restoreNativeScope({ ...binding, directory: root }, deps)).rejects.toThrow("directory")
      state.removeWorktree(tree.id)
      await expect(restoreNativeScope(binding, deps)).rejects.toThrow("directory")
      await expect(restoreNativeScope({ ...binding, projectId: "missing" }, deps)).rejects.toThrow("project")
      await contexts.remove(ctx.id)
      expect(() => restored.validate()).toThrow("project")
    } finally {
      await state.flush()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("hydrates persisted sibling routes for cold native History without adopting management tabs", async () => {
    const root = mkdtempSync(join(tmpdir(), "native-siblings-"))
    const directory = join(root, "tree")
    mkdirSync(directory)
    const contexts = new ProjectContexts({
      workspaceRoot: () => root,
      registry: { list: () => [], get: () => undefined },
      deps: { log: () => {} },
    })
    const ctx = contexts.active()!
    const state = ctx.stateManager()
    const tree = state.addWorktree({ branch: "feature", path: directory, parentBranch: "main" })
    state.closeSession("first", tree.id)
    state.closeSession("second", tree.id)
    state.closeSession("local", null)
    const routes = new ProjectRouteService()
    try {
      const restored = await restoreNativeScope(
        { projectId: ctx.id, root: ctx.root, directory, worktreeId: tree.id },
        {
          contexts,
          routes,
          ready: (project) => project.ensureReady(async () => ({ ok: true, refsFixed: 0 })),
        },
      )
      for (const id of ["first", "second"]) {
        expect(routes.trySessionDirectoryFor({ projectId: ctx.id, sessionId: id })).toBe(directory)
        restored.validate(id)
      }
      expect(() => restored.validate("local")).toThrow("placement")
      expect(() => restored.validate("unknown")).toThrow("placement")
      expect(state.getSessions()).toEqual([])
      state.addSession("second", null)
      expect(() => restored.validate("second")).toThrow("placement")
    } finally {
      await state.flush()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("persists exact project and stable placement without a runtime generation", () => {
    const state = memento()
    const contexts = new NativeSessionContexts(state)
    const context = contexts.save("session", "/trees/a", scope)
    const restored = new NativeSessionContexts(state).restore(
      { nativeSessionContexts: { session: context } },
      "session",
    )
    expect(restored).toEqual({ context, directory: "/trees/a", scope })
    expect(JSON.stringify(state.get("dustcode.nativeSessionContexts", {}))).not.toContain("generation")
  })

  it("does not collide across project or Local/worktree placement", () => {
    const contexts = new NativeSessionContexts(memento())
    const context = contexts.save("session", "/trees/a", scope)
    expect(contexts.save("session", "/trees/a", { ...scope, projectId: "project-b" })).not.toBe(context)
    expect(contexts.save("session", "/trees/a", { ...scope, worktreeId: null })).not.toBe(context)
    expect(contexts.save("session", "/trees/a")).not.toBe(context)
  })

  it("retains a scoped blank New Task through only its opaque host binding", () => {
    const contexts = new NativeSessionContexts(memento())
    const context = contexts.save("previous", "/trees/a", scope)
    expect(contexts.restore({ sidebarActiveSessionTabID: "", nativeSessionContext: context }, undefined)).toEqual({
      context,
      directory: "/trees/a",
      scope,
    })
  })

  it("rejects missing, forged and cross-session context references", () => {
    const contexts = new NativeSessionContexts(memento())
    const context = contexts.save("session", "/trees/a", scope)
    expect(contexts.restore({ nativeSessionContext: "forged", sidebarActiveSessionTabID: "" }, undefined)).toEqual({
      unavailable: true,
    })
    expect(contexts.restore({ nativeSessionContexts: { other: context } }, "other")).toEqual({ unavailable: true })
    expect(contexts.restore({ nativeSessionContext: context, nativeSessionContexts: {} }, "session")).toEqual({
      unavailable: true,
    })
  })

  it("does not turn an ordinary binding into a scoped blank tab", () => {
    const contexts = new NativeSessionContexts(memento())
    const context = contexts.save("session", "/projects/a")
    expect(contexts.restore({ nativeSessionContext: context, sidebarActiveSessionTabID: "" }, undefined)).toEqual({
      unavailable: true,
    })
    expect(contexts.restore({ nativeSessionContexts: { session: context } }, "session")).toEqual({
      context,
      directory: "/projects/a",
    })
    expect(contexts.restore({}, "legacy")).toEqual({})
    expect(contexts.restore({}, undefined)).toEqual({})
  })
})
