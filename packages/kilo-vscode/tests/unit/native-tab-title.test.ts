import { describe, expect, it } from "bun:test"
import type { Session } from "@kilocode/sdk/v2/client"
import { nativeTitle } from "../../src/kilo-provider/native-tab-title"
import type { KiloProviderOptions } from "../../src/kilo-provider/options"
import { ProjectRouteService } from "../../src/agent-manager/project/route"

const session = (title: string | null) => ({ title }) as Session

const host = async (opts: KiloProviderOptions = {}) => {
  const { KiloProvider } = await import("../../src/KiloProvider")
  const titles: string[] = []
  const provider = new KiloProvider(
    { fsPath: "/extension" } as never,
    { unregisterVisible: () => {}, unregisterAttached: () => {} } as never,
    undefined,
    { rootDirectory: () => "/projects/host", ...opts, tabTitle: (title) => titles.push(title) },
  )
  const internal = provider as unknown as {
    setCurrentSession: (session: Session | null) => void
    sendWorkspaceScope: () => void
  }
  return { provider, titles, internal }
}

describe("nativeTitle", () => {
  it("uses the default title without a useful session title", () => {
    expect(nativeTitle(null)).toBe("Dustcode")
    expect(nativeTitle(session(""))).toBe("Dustcode")
    expect(nativeTitle(session("New session - 2026-05-06T10:39:00.000Z"))).toBe("Dustcode")
  })

  it("keeps short session titles", () => {
    expect(nativeTitle(session("Greeting"))).toBe("Greeting")
  })

  it("truncates long session titles", () => {
    expect(nativeTitle(session("Dynamic VS Code tab titles for Kilo sessions"))).toBe("Dynamic VS Code tab...")
  })

  it("retains provenance separately from title truncation and activity", () => {
    expect(
      nativeTitle(session("Dynamic VS Code tab titles for Kilo sessions"), "busy", undefined, "repo / feature/tabs"),
    ).toBe("◔ Dynamic VS Code tab... [repo / feature/tabs]")
    expect(nativeTitle(null, "waiting", undefined, "repo / Local")).toBe("? Dustcode [repo / Local]")
    expect(nativeTitle(session("Child session - 2026-05-06T10:39:00.000Z"), "idle", undefined, "repo / Local")).toBe(
      "Dustcode [repo / Local]",
    )
  })

  it("does not append chat provenance to fixed labels", () => {
    expect(nativeTitle(session("Greeting"), "waiting", "Agent Manager", "repo / feature/tabs")).toBe("? Agent Manager")
    expect(nativeTitle(null, "busy", "Sub-Agent Viewer with a long label", "unrelated")).toBe(
      "◔ Sub-Agent Viewer with a long label",
    )
  })

  it("identifies scoped tabs before a session loads and after New Task", async () => {
    const scope = {
      projectId: "project",
      root: "/projects/repo",
      directory: "/trees/tabs",
      worktreeId: "tree",
      projectLabel: "repo",
      label: "feature/tabs",
      generation: 1,
      routes: new ProjectRouteService(),
      validate: () => {},
      register: () => {},
    }
    const { provider, titles, internal } = await host({ nativeSessionScope: scope })
    try {
      expect(titles).toEqual(["Dustcode [repo / feature/tabs]"])
      internal.setCurrentSession({ ...session("Greeting"), id: "session", directory: "/untrusted/other" })
      internal.setCurrentSession({ ...session("Renamed"), id: "session", directory: "/untrusted/other" })
      internal.setCurrentSession(null)
      expect(titles).toEqual([
        "Dustcode [repo / feature/tabs]",
        "Greeting [repo / feature/tabs]",
        "Renamed [repo / feature/tabs]",
        "Dustcode [repo / feature/tabs]",
      ])
    } finally {
      provider.dispose()
    }
    const local = await host({
      nativeSessionScope: { ...scope, directory: scope.root, worktreeId: null, label: "Local" },
    })
    try {
      expect(local.titles).toEqual(["Dustcode [repo / Local]"])
    } finally {
      local.provider.dispose()
    }
  }, 15000)

  it("uses the ordinary tab's host and tracked directory, not session metadata", async () => {
    const { provider, titles, internal } = await host()
    try {
      expect(titles).toEqual(["Dustcode [host]"])
      provider.reserveSession("session", "/trees/feature")
      internal.setCurrentSession({ ...session("Greeting"), id: "session", directory: "/untrusted/other" })
      provider.setSessionDirectory("session", "/trees/renamed")
      expect(titles.at(-1)).toBe("Greeting [renamed]")
      expect(titles).toContain("Dustcode [feature]")
      expect(titles).toContain("Greeting [feature]")
      provider.clearSessionDirectory("session")
      expect(titles.at(-1)).toBe("Greeting [host]")
      provider.reserveSession("other", "/projects/second")
      expect(titles.at(-1)).toBe("Dustcode [second]")
    } finally {
      provider.dispose()
    }
  })

  it("does not invent workspace provenance for fixed labels or subagent viewers", async () => {
    for (const opts of [
      { tabLabel: "Agent Manager" },
      { tabLabel: "Sub-Agent Viewer", hideTopBar: true },
      { hideTopBar: true },
    ]) {
      const { provider, titles, internal } = await host({
        ...opts,
        rootDirectory: () => {
          throw new Error("unrelated host")
        },
      })
      try {
        internal.setCurrentSession(session("Greeting"))
        expect(titles).toEqual(opts.tabLabel ? [opts.tabLabel] : ["Dustcode", "Greeting"])
      } finally {
        provider.dispose()
      }
    }
  })

  it("does not attribute an unavailable restored conversation to the current workspace", async () => {
    const { provider, titles } = await host({
      nativeSessionTab: { restore: true, unavailable: true },
      rootDirectory: () => {
        throw new Error("unrelated host")
      },
    })
    try {
      expect(titles).toEqual(["Dustcode [Unavailable]"])
    } finally {
      provider.dispose()
    }
  })

  it("retains a root directory when it has no basename", async () => {
    const { provider, titles } = await host({ rootDirectory: () => "/" })
    try {
      expect(titles).toEqual(["Dustcode [/]"])
    } finally {
      provider.dispose()
    }
  })

  it("refreshes an ordinary tab when its host workspace changes", async () => {
    let directory = "/projects/first"
    const { provider, titles, internal } = await host({ rootDirectory: () => directory })
    try {
      directory = "/projects/second"
      internal.sendWorkspaceScope()
      expect(titles).toEqual(["Dustcode [first]", "Dustcode [second]"])
    } finally {
      provider.dispose()
    }
  })

  it("updates the native panel only from valid webview activity reports", async () => {
    const { KiloProvider } = await import("../../src/KiloProvider")
    const titles: string[] = []
    const listener: { current?: (message: { type: string; state: unknown }) => Promise<void> } = {}
    const provider = new KiloProvider(
      { fsPath: "/extension" } as never,
      {
        unregisterVisible: () => {},
        unregisterAttached: () => {},
        onSessionAcknowledged: () => () => {},
      } as never,
      undefined,
      { rootDirectory: () => "/projects/host", tabTitle: (title) => titles.push(title) },
    )
    const internal = provider as unknown as { setupWebviewMessageHandler: (webview: unknown) => void }
    internal.setupWebviewMessageHandler({
      onDidReceiveMessage: (handler: NonNullable<typeof listener.current>) => {
        listener.current = handler
        return { dispose: () => {} }
      },
    })
    for (const state of ["busy", "waiting", "done", "scheduled", "error", "idle", "idle", "invalid", null]) {
      await listener.current?.({ type: "sessionActivity", state })
    }
    expect(titles).toEqual([
      "Dustcode [host]",
      "◔ Dustcode [host]",
      "? Dustcode [host]",
      "✓ Dustcode [host]",
      "◷ Dustcode [host]",
      "⚠ Dustcode [host]",
      "Dustcode [host]",
    ])
    provider.dispose()
  })

  it("renders the same activity values used by webview tabs and worktrees", () => {
    expect(nativeTitle(session("Greeting"), "busy")).toBe("◔ Greeting")
    expect(nativeTitle(session("Greeting"), "retry")).toBe("◔ Greeting")
    expect(nativeTitle(session("Greeting"), "waiting")).toBe("? Greeting")
    expect(nativeTitle(session("Greeting"), "error")).toBe("⚠ Greeting")
    expect(nativeTitle(session("Greeting"), "done")).toBe("✓ Greeting")
    expect(nativeTitle(session("Greeting"), "scheduled")).toBe("◷ Greeting")
    expect(nativeTitle(session("Greeting"), "idle")).toBe("Greeting")
    expect(nativeTitle(session("Greeting"), "waiting", "Agent Manager")).toBe("? Agent Manager")
  })
})
