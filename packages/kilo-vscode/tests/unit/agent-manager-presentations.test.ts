import { describe, expect, it } from "bun:test"
import { ManagerPresentations } from "../../src/agent-manager/presentations"
import type { PanelContext, SessionProvider } from "../../src/agent-manager/host"
import { GitStatsPoller } from "../../src/agent-manager/GitStatsPoller"
import { GitOps } from "../../src/agent-manager/GitOps"
import { SourceController } from "../../src/diff/SourceController"
import { WorktreeDiffController } from "../../src/agent-manager/worktree-diff-controller"
import type { DiffSourceCatalog } from "../../src/diff/sources/catalog"
import type { WorktreeStateManager } from "../../src/agent-manager/WorktreeStateManager"

function surface(presentation: "sidebar" | "editor") {
  const messages: unknown[] = []
  const listeners = new Set<(visible: boolean) => void>()
  const disposers = new Set<() => void>()
  const directories = new Map<string, string>()
  const calls: string[] = []
  const ctx: PanelContext = {
    presentation,
    active: true,
    visible: true,
    postMessage: (msg) => messages.push(msg),
    waitForReady: async () => {},
    waitForActive: async () => {},
    reveal: () => calls.push("reveal"),
    sessions: {
      setSessionDirectory: (id, dir) => directories.set(id, dir),
      getSessionDirectories: () => directories,
      trackSession: (id) => calls.push(id),
      dispose: () => calls.push("sessions.dispose"),
    } as SessionProvider,
    onDidChangeVisibility: (cb) => {
      listeners.add(cb)
      return { dispose: () => listeners.delete(cb) }
    },
    onDidDispose: (cb) => {
      disposers.add(cb)
      return { dispose: () => disposers.delete(cb) }
    },
    dispose: () => {
      calls.push("sessions.dispose")
      for (const cb of disposers) cb()
    },
  }
  return {
    ctx,
    messages,
    calls,
    directories,
    show: (visible: boolean) => {
      Object.assign(ctx, { visible, active: visible })
      for (const cb of listeners) cb(visible)
    },
  }
}

describe("production manager presentation lifetime", () => {
  it.each(["activate", "reactivate", "show"] as const)(
    "shares changed autonomous diff polls after request-origin %s and editor disposal",
    async (mode) => {
      const group = new ManagerPresentations()
      const sidebar = surface("sidebar")
      const editor = surface("editor")
      group.add(sidebar.ctx)
      group.add(editor.ctx)
      const produced = Promise.withResolvers<void>()
      let content = "initial"
      let fetches = 0
      const diff = () => ({
        file: "shared.ts",
        before: "old\n",
        after: `${content}\n`,
        patch: `diff --git a/shared.ts b/shared.ts\n--- a/shared.ts\n+++ b/shared.ts\n@@ -1 +1 @@\n-old\n+${content}\n`,
        additions: 1,
        deletions: 1,
      })
      const controller = new SourceController(
        () => ({
          descriptor: {
            id: "workspace",
            type: "workspace",
            group: "Git",
            capabilities: { revert: true, comments: true },
          },
          fetch: async () => {
            fetches++
            return { diffs: [diff()] }
          },
        }),
        () => [],
        (msg) => {
          group.panel.postMessage(msg)
          if ((msg as { type: string }).type === "diffViewer.diffs" && content === "updated") produced.resolve()
        },
        undefined,
        (task) => group.background(task),
      )
      controller.setContext({ workspaceRoot: "/project" })
      try {
        if (mode !== "activate") await controller.activate("workspace")
        if (mode === "show") await controller.setVisible(false)
        sidebar.messages.length = 0
        editor.messages.length = 0
        await group.from(editor.ctx, () => {
          if (mode === "reactivate") return controller.reactivate()
          if (mode === "show") return controller.setVisible(true)
          return controller.activate("workspace")
        })
        expect(sidebar.messages).toEqual([])
        expect(editor.messages).toContainEqual({ type: "diffViewer.diffs", diffs: [diff()] })
        const initial = fetches
        content = "updated"
        editor.ctx.dispose()
        await produced.promise
        expect(fetches).toBe(initial + 1)
        expect(controller.isPolling).toBe(true)
        expect(sidebar.messages).toContainEqual({ type: "diffViewer.diffs", diffs: [diff()] })
      } finally {
        controller.dispose()
        group.dispose()
        expect(controller.isPolling).toBe(false)
      }
    },
  )

  it("shares a watch preserved by a request-origin base change during its initial fetch", async () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    const entered = Promise.withResolvers<void>()
    const pending = Promise.withResolvers<void>()
    const produced = Promise.withResolvers<void>()
    const bases: (string | undefined)[] = []
    let content = "initial"
    let fetches = 0
    const diff = () => ({ file: `${content}.ts`, before: "old", after: "new", additions: 1, deletions: 1 })
    const catalog = {
      build: (id, ctx) => {
        bases.push(ctx.baseBranch)
        return {
          descriptor: { id, type: "workspace", group: "Git", capabilities: { revert: true, comments: true } },
          fetch: async () => {
            if (++fetches === 1) {
              entered.resolve()
              await pending.promise
            }
            return { diffs: [diff()] }
          },
        }
      },
    } as DiffSourceCatalog
    const state = {
      getWorktree: (id: string) =>
        id === "w1" ? { id, path: "/project/tree", parentBranch: "main", remote: "origin" } : undefined,
    } as unknown as WorktreeStateManager
    const git = new GitOps({ log: () => {} })
    const controller = new WorktreeDiffController({
      getState: () => state,
      getRoot: () => "/project",
      getStateReady: () => undefined,
      catalog,
      git,
      localDiffFile: async () => null,
      post: (msg) => {
        group.panel.postMessage(msg)
        if (msg.type === "agentManager.worktreeDiff" && content === "updated") produced.resolve()
      },
      log: () => {},
      projectId: () => "project",
      background: (task) => group.background(task),
    })
    try {
      controller.start("w1#branch")
      await entered.promise
      sidebar.messages.length = 0
      await group.from(editor.ctx, () => controller.setBase("w1#branch", "feature"))
      expect(bases).toEqual(["origin/main", "feature"])
      expect(sidebar.messages).toEqual([])
      expect(editor.messages).toContainEqual({
        type: "agentManager.worktreeDiff",
        projectId: "project",
        sessionId: "w1#branch",
        diffs: [diff()],
      })
      editor.ctx.dispose()
      pending.resolve()
      content = "updated"
      await produced.promise
      expect(fetches).toBe(3)
      expect(sidebar.messages).toContainEqual({
        type: "agentManager.worktreeDiff",
        projectId: "project",
        sessionId: "w1#branch",
        diffs: [diff()],
      })
    } finally {
      pending.resolve()
      controller.stop()
      git.dispose()
      group.dispose()
    }
  })

  it("drops a real source's late file reply rather than falling back to the surviving sidebar", async () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    const entered = Promise.withResolvers<void>()
    const pending = Promise.withResolvers<void>()
    const controller = new SourceController(
      () => ({
        descriptor: {
          id: "workspace",
          type: "workspace",
          group: "Git",
          capabilities: { revert: true, comments: true },
        },
        fetch: async () => ({ diffs: [] }),
        fetchFile: async () => {
          entered.resolve()
          await pending.promise
          return { file: "private.ts", before: "old", after: "new", additions: 1, deletions: 1 }
        },
      }),
      () => [],
      (msg) => group.panel.postMessage(msg),
      undefined,
      (task) => group.background(task),
    )
    controller.setContext({ workspaceRoot: "/project" })
    try {
      await group.from(editor.ctx, () => controller.activate("workspace", { poll: false }))
      expect(sidebar.messages).toEqual([])
      editor.messages.length = 0
      const reply = group.from(editor.ctx, () => controller.requestFile("private.ts"))
      await entered.promise
      editor.ctx.dispose()
      pending.resolve()
      await reply
      expect(sidebar.messages).toEqual([])
      expect(editor.messages).toEqual([])
      expect(controller.isPolling).toBe(false)
    } finally {
      pending.resolve()
      controller.dispose()
      group.dispose()
    }
  })

  it("keeps autonomous real stats polling alive after its originating editor closes", async () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    const pending = Promise.withResolvers<void>()
    const emitted = Promise.withResolvers<void>()
    const repeated = Promise.withResolvers<void>()
    let sequence = 0
    const poller = new GitStatsPoller({
      getWorktrees: () => [],
      getWorkspaceRoot: () => "/project",
      git: new GitOps({ log: () => {}, runGit: async () => "0\t0" }),
      intervalMs: 1,
      source: {
        refs: async () => ({ oids: new Map(), upstreams: new Map([["refs/heads/main", "refs/remotes/origin/main"]]) }),
        status: async () => {
          await pending.promise
          sequence++
          return { branch: "main", dirty: true, head: "head", fingerprint: String(sequence), untracked: [] }
        },
        diff: async () => ({ files: 1, additions: sequence * 2, deletions: 0 }),
      },
      onStats: () => {},
      onLocalStats: (stats) => {
        group.panel.postMessage({ type: "agentManager.localStats", projectId: "project", stats })
        emitted.resolve()
        if (stats.additions === 4) repeated.resolve()
      },
      log: () => {},
    })
    try {
      group.from(editor.ctx, () => group.background(() => poller.setEnabled(true)))
      editor.ctx.dispose()
      pending.resolve()
      await emitted.promise
      await repeated.promise
      expect(sidebar.messages).toEqual([
        {
          type: "agentManager.localStats",
          projectId: "project",
          stats: { branch: "main", files: 1, additions: 2, deletions: 0, ahead: 0, behind: 0 },
        },
        {
          type: "agentManager.localStats",
          projectId: "project",
          stats: { branch: "main", files: 1, additions: 4, deletions: 0, ahead: 0, behind: 0 },
        },
      ])
      expect(editor.messages).toEqual([])
    } finally {
      poller.stop()
      group.dispose()
    }
  })

  it("waits for the selected sidebar readiness and cancels without rerouting to an already-ready editor", async () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    const wait = Promise.withResolvers<void>()
    Object.assign(sidebar.ctx, { waitForReady: () => wait.promise })
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    group.focus(editor.ctx)
    const pending = group.ready("sidebar")
    sidebar.ctx.dispose()
    expect(await pending).toBe(false)
    expect(await group.ready("sidebar")).toBe(false)
    expect(await group.ready("editor")).toBe(true)
    group.dispose()
  })
  it("keeps both transports attached, shares registrations, and routes asynchronous replies to their source", async () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    group.panel.sessions.setSessionDirectory("session", "/project/worktree")
    expect(sidebar.directories.get("session")).toBe("/project/worktree")
    expect(editor.directories.get("session")).toBe("/project/worktree")
    const wait = Promise.withResolvers<void>()
    const pending = group.from(sidebar.ctx, async () => {
      await wait.promise
      group.panel.postMessage({ type: "agentManager.historyResult", requestId: "sidebar" })
      group.panel.postMessage({ type: "agentManager.state", projectId: "project" })
    })
    group.from(editor.ctx, () => group.panel.postMessage({ type: "agentManager.historyResult", requestId: "editor" }))
    wait.resolve()
    await pending
    expect(sidebar.messages).toEqual([
      { type: "agentManager.historyResult", requestId: "sidebar" },
      { type: "agentManager.state", projectId: "project" },
    ])
    expect(editor.messages).toEqual([
      { type: "agentManager.historyResult", requestId: "editor" },
      { type: "agentManager.state", projectId: "project" },
    ])
    sidebar.messages.length = 0
    editor.messages.length = 0
    group.focus(editor.ctx)
    group.panel.postMessage({ type: "agentManager.sendInitialMessage", text: "one prompt" })
    expect(sidebar.messages).toEqual([])
    expect(editor.messages).toEqual([{ type: "agentManager.sendInitialMessage", text: "one prompt" }])
    group.panel.postMessage({ type: "agentManager.terminalData", terminalId: "terminal", data: "background" })
    expect(sidebar.messages).toEqual([
      { type: "agentManager.terminalData", terminalId: "terminal", data: "background" },
    ])
    expect(editor.messages).toHaveLength(2)
    const abandoned = Promise.withResolvers<void>()
    const late = group.from(sidebar.ctx, async () => {
      await abandoned.promise
      group.panel.postMessage({ type: "agentManager.historyResult", requestId: "disposed" })
      group.panel.postMessage({ type: "agentManager.state", projectId: "disposed" })
    })
    sidebar.ctx.dispose()
    editor.messages.length = 0
    abandoned.resolve()
    await late
    expect(editor.messages).toEqual([])
    group.dispose()
  })

  it("does not dispose sessions on hide, preserves the other host on disposal, and allows reattachment", () => {
    const group = new ManagerPresentations()
    const sidebar = surface("sidebar")
    const editor = surface("editor")
    group.add(sidebar.ctx)
    group.add(editor.ctx)
    const visibility: boolean[] = []
    const closed: boolean[] = []
    group.panel.onDidChangeVisibility((value) => visibility.push(value))
    group.panel.onDidDispose(() => closed.push(true))
    sidebar.show(false)
    expect(group.panel.visible).toBe(true)
    expect(sidebar.calls).toEqual([])
    editor.ctx.dispose()
    expect(group.panel.visible).toBe(false)
    expect(closed).toEqual([])
    expect(editor.calls).toEqual(["sessions.dispose"])
    sidebar.show(true)
    expect(group.panel.visible).toBe(true)
    sidebar.ctx.dispose()
    expect(closed).toEqual([true])
    expect(visibility).toEqual([true, false, true, false])
    const next = surface("sidebar")
    group.add(next.ctx)
    expect(group.get("sidebar")).toBe(next.ctx)
    group.panel.postMessage({ type: "action", action: "search" })
    expect(next.messages).toHaveLength(1)
    expect(editor.messages).toHaveLength(0)
    group.dispose()
    expect(next.calls).toEqual(["sessions.dispose"])
  })
})
