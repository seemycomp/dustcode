import { describe, expect, test } from "bun:test"
import { handleSessionLifecycle } from "../../src/agent-manager/session-lifecycle"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../../src/agent-manager/project/registry"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import type { AgentManagerOutMessage } from "../../src/agent-manager/types"
import type { Session } from "@kilocode/sdk/v2/client"

const info: Session = {
  id: "session",
  slug: "test-session",
  projectID: "project",
  directory: "/repo",
  title: "Browser session",
  version: "1",
  time: { created: 1, updated: 2 },
}

describe("session lifecycle merge integration", () => {
  test("a transfer from another client replaces stale placement instead of restoring an override", async () => {
    const contexts = new ProjectContexts({
      registry: new ProjectRegistry({ read: () => undefined, write: () => {} }),
      workspaceRoot: () => "/repo",
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
    await ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
    const state = ctx.stateManager()
    const source = state.addWorktree({ path: `${ctx.root}/a`, branch: "a", parentBranch: "main" })
    const target = state.addWorktree({ path: `${ctx.root}/b`, branch: "b", parentBranch: "main" })
    state.addSession(info.id, source.id)
    const routes: string[] = []
    const closed: string[] = []
    const deps = {
      contexts,
      busy: new Set<string>(),
      removed: new Set<string>(),
      post: () => {},
      closeBrowser: (id: string) => closed.push(id),
      relocate: (_project: string, _session: string, directory: string) => routes.push(directory),
    }
    const moved = {
      ...info,
      directory: target.path,
      metadata: { "kilocode.transfer": { operationID: "external", directory: target.path } },
    }
    handleSessionLifecycle({ type: "session.updated", properties: { info: moved } }, deps)
    expect(state.sessionPlacement(info.id)).toBe(target.id)
    expect(ctx.sessions().find((row) => row.id === info.id)?.worktreeId).toBe(target.id)
    expect(routes).toEqual([target.path])
    expect(closed).toEqual([info.id])
    handleSessionLifecycle({ type: "session.updated", properties: { info: { ...moved, title: "renamed" } } }, deps)
    expect(routes).toHaveLength(1)
    expect(closed).toHaveLength(1)
    await state.flush()
    contexts.dispose()
  })
  test.each(["sessionID", "info"])("preserves deletion guards and browser cleanup for %s events", (shape) => {
    const sessions: Array<{ id: string }> = []
    const closed: string[] = []
    const posted: AgentManagerOutMessage[] = []
    const context = {
      id: "project",
      root: "/repo",
      lifecycle: "ready",
      hasLiveSession: (id: string) => sessions.some((session) => session.id === id),
      peekState: () => undefined,
      sessions: () => sessions,
      upsertSession: (session: { id: string }) => sessions.push(session),
      removeLiveSession: (id: string) =>
        sessions.splice(
          sessions.findIndex((session) => session.id === id),
          1,
        ),
      invalidateSessions: () => {},
    }
    const deps = {
      busy: new Set([info.id]),
      removed: new Set<string>(),
      contexts: {
        values: () => [context].values(),
        byDirectory: () => context,
        byLiveSession: () => context,
      } as unknown as ProjectContexts,
      closeBrowser: (id: string) => closed.push(id),
      post: (message: AgentManagerOutMessage) => posted.push(message),
    }
    handleSessionLifecycle({ type: "session.created", properties: { info } }, deps)
    expect(sessions).toHaveLength(1)
    handleSessionLifecycle(
      { type: "session.deleted", properties: shape === "info" ? { info } : { sessionID: info.id } },
      deps,
    )
    expect(closed).toEqual([info.id])
    expect(deps.removed.has(info.id)).toBe(true)
    expect(deps.busy.has(info.id)).toBe(false)
    expect(sessions).toHaveLength(0)
    const count = posted.length
    handleSessionLifecycle({ type: "session.updated", properties: { info } }, deps)
    expect(sessions).toHaveLength(0)
    expect(posted).toHaveLength(count)
    handleSessionLifecycle({ type: "session.created", properties: { info } }, deps)
    expect(deps.removed.has(info.id)).toBe(false)
    expect(sessions).toHaveLength(1)
  })
})
