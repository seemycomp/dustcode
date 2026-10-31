import { afterEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Session } from "@kilocode/sdk/v2/client"
import { ProjectContext } from "../../src/agent-manager/project/context"
import { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"
import { pruneSubagents } from "../../src/agent-manager/prune-subagents"
import { AgentManagerProvider } from "../../src/agent-manager/AgentManagerProvider"

const contexts: ProjectContext[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) {
    await ctx.dispose()
    fs.rmSync(ctx.root, { recursive: true, force: true })
  }
})

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "am-lazy-session-"))
  const state = new WorktreeStateManager(root, () => {})
  state.addSession("opened", null)
  state.addSession("unopened", null)
  const ctx = new ProjectContext("project", root, true, { log: () => {}, state: () => state })
  contexts.push(ctx)
  ctx.stateManager()
  const calls: string[] = []
  const cleared: string[] = []
  const pushed: string[] = []
  const gate = Promise.withResolvers<Session | undefined>()
  const sessions = {
    getSessionInfo: async (id: string) => {
      calls.push(id)
      return gate.promise
    },
    clearSessionDirectory: (id: string) => cleared.push(id),
  }
  return { ctx, state, calls, cleared, pushed, gate, sessions, push: () => pushed.push("state") }
}

describe("Agent Manager lazy session validation", () => {
  it("publishes initial state without looking up any unopened session", async () => {
    const test = setup()
    await test.ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
    const calls: string[] = []
    const manager = Object.assign(Object.create(AgentManagerProvider.prototype), {
      contexts: { active: () => test.ctx },
      host: {},
      panel: {
        sessions: {
          ...test.sessions,
          setSessionDirectory: () => {},
          trackSession: () => {},
          refreshSessions: () => calls.push("list"),
          recoverPendingPrompts: () => calls.push("prompts"),
        },
      },
      pushState: () => calls.push("state"),
      log: () => {},
    }) as { initializeState: () => Promise<void> }
    const done = manager.initializeState().then(() => "ready")
    const outcome = await Promise.race([done, Bun.sleep(100).then(() => "blocked")])
    // Resolve the gate even if this regresses, so the test leaves no pending work.
    test.gate.resolve(undefined)
    await done
    expect(outcome).toBe("ready")
    expect(test.calls).toEqual([])
    expect(calls).toEqual(["state", "list", "prompts"])
  })

  it("only validates the opened managed session and publishes child cleanup", async () => {
    const test = setup()
    const pending = pruneSubagents(test.ctx, test.sessions, "opened", test.push, () => {})
    expect(test.calls).toEqual(["opened"])
    expect(test.state.getSessions()).toHaveLength(2)
    test.gate.resolve({ id: "opened", parentID: "parent" } as Session)
    await pending
    expect(test.state.getSessions().map((item) => item.id)).toEqual(["unopened"])
    expect(test.cleared).toEqual(["opened"])
    expect(test.pushed).toEqual(["state"])
  })

  it("does not fetch details for sessions outside managed state", async () => {
    const test = setup()
    await pruneSubagents(test.ctx, test.sessions, "unknown", test.push, () => {})
    expect(test.calls).toEqual([])
  })

  it("keeps root sessions without publishing another state", async () => {
    const test = setup()
    test.gate.resolve({ id: "opened" } as Session)
    await pruneSubagents(test.ctx, test.sessions, "opened", test.push, () => {})
    expect(test.state.getSessions()).toHaveLength(2)
    expect(test.pushed).toEqual([])
  })

  it("ignores detail completion after the project generation changes", async () => {
    const test = setup()
    const pending = pruneSubagents(test.ctx, test.sessions, "opened", test.push, () => {})
    test.ctx.suspend()
    test.gate.resolve({ id: "opened", parentID: "parent" } as Session)
    await pending
    expect(test.state.getSessions()).toHaveLength(2)
    expect(test.cleared).toEqual([])
    expect(test.pushed).toEqual([])
  })
})
