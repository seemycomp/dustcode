import { expect, it } from "bun:test"
import * as vscode from "vscode"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { Project, SyntaxKind } from "ts-morph"
import { KiloProvider } from "../../src/KiloProvider"
import { VscodeHost } from "../../src/agent-manager/vscode-host"
import { ProjectContexts } from "../../src/agent-manager/project/contexts"
import { ProjectRouteService } from "../../src/agent-manager/project/route"
import { resolveNativeDraft } from "../../src/agent-manager/project/native"
import { handleProjectMessage, type ProjectMessageDeps } from "../../src/agent-manager/project/messages"
import {
  bindNativeSessionScope,
  NativeSessionContexts,
  nativeSessionScope,
} from "../../src/kilo-provider/native-session-tabs"
import { EXTENSION_DISPLAY_NAME } from "../../src/constants"

// Run the production extension callback and panel factory without activating unrelated services.
const source = new Project({ useInMemoryFileSystem: true }).createSourceFile(
  "extension.ts",
  await Bun.file(`${import.meta.dir}/../../src/extension.ts`).text(),
)
const callback = source
  .getDescendantsOfKind(SyntaxKind.CallExpression)
  .find((call) => call.getExpression().getText() === "agentManagerHost.setOpenDraftInTab")!
  .getArguments()
  .at(0)!
  .getText()
const attach = source
  .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
  .find((node) => node.getName() === "attach")!
  .getText()
const factory = source.getFunctionOrThrow("openKiloInNewTab").getText()
const title = source.getVariableDeclarationOrThrow("panelTitleHandler").getText()
const install = (env: Record<string, unknown>) =>
  new Function(
    ...Object.keys(env),
    new Bun.Transpiler({ loader: "ts" }).transformSync(
      `${factory}; const ${title}; const ${attach}; agentManagerHost.setOpenDraftInTab(${callback});`,
    ),
  )(...Object.values(env))

function surface() {
  const messages: unknown[] = []
  const disposers = new Set<() => void>()
  const raw = {
    title: "",
    active: true,
    visible: true,
    viewColumn: 1,
    webview: {
      html: "",
      options: {},
      cspSource: "vscode-webview:",
      asWebviewUri: (uri: vscode.Uri) => ({ toString: () => uri.fsPath }),
      postMessage: async (message: unknown) => {
        messages.push(message)
        return true
      },
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    },
    onDidChangeViewState: () => ({ dispose: () => {} }),
    onDidDispose: (cb: () => void) => {
      disposers.add(cb)
      return { dispose: () => disposers.delete(cb) }
    },
    dispose: () => {
      for (const cb of disposers) cb()
      disposers.clear()
    },
  }
  return { raw, messages }
}

it("creates scoped native panels before backend connection or session creation, and retains actionable failures", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-draft-"))
  const background = join(root, "background")
  mkdirSync(background)
  const directory = join(background, "tree")
  mkdirSync(directory)
  const contexts = new ProjectContexts({
    workspaceRoot: () => root,
    registry: {
      list: () => [{ id: "b", root: background, label: "B", expanded: false }],
      get: (id) => (id === "b" ? { id, root: background, label: "B", expanded: false } : undefined),
    },
    deps: { log: () => {} },
  })
  const ctx = contexts.resolve("b")!
  const state = ctx.stateManager()
  const tree = state.addWorktree({ branch: "feature/background", path: directory, parentBranch: "main" })
  const routes = new ProjectRouteService()
  const hydration = Promise.withResolvers<void>()
  const ready = (project: typeof ctx) =>
    project.ensureReady(async () => {
      await hydration.promise
      return { ok: true, refsFixed: 0 }
    })
  const pending = Promise.withResolvers<void>()
  const creation = Promise.withResolvers<never>()
  const started = Promise.withResolvers<void>()
  const calls: string[] = []
  const created: ReturnType<typeof surface>[] = []
  const panels = new Map<vscode.WebviewPanel, KiloProvider>()
  const subscribe = () => () => {}
  const client = {
    session: {
      create: (input: { directory: string }) => {
        calls.push(`create:${input.directory}`)
        started.resolve()
        return creation.promise
      },
    },
  }
  const backend = {
    sandboxPreference: { wait: async () => {}, explicit: () => false, onChange: subscribe },
    connect: (dir: string) => {
      calls.push(dir)
      return pending.promise
    },
    getClient: () => client,
    getConnectionState: () => "disconnected",
    getConnectionError: () => undefined,
    getServerInfo: () => undefined,
    onSessionAcknowledged: subscribe,
    registerVisible: () => {},
    registerAttached: () => {},
    unregisterVisible: () => {},
    unregisterAttached: () => {},
  }
  const memory = { get: <T>(_key: string, fallback: T) => fallback, update: async () => {} }
  const context = {
    extensionUri: vscode.Uri.file(root),
    subscriptions: [],
    globalState: memory,
    workspaceState: memory,
  }
  const host = new VscodeHost(context.extensionUri, backend as never, context as never, {} as never)
  const errors: string[] = []
  const deps = {
    draft: async (request) => host.openDraftInTab(resolveNativeDraft(request, { contexts, routes, ready })),
    error: (message) => errors.push(message),
  } as ProjectMessageDeps
  const prior = Reflect.get(vscode.window, "createWebviewPanel")
  Object.assign(vscode.window, {
    createWebviewPanel: (kind: string) => {
      expect(kind).toBe("dustcode.TabPanel")
      const panel = surface()
      created.push(panel)
      return panel.raw
    },
  })
  install({
    vscode: { ...vscode, ViewColumn: { Active: 1 } },
    KiloProvider,
    EXTENSION_DISPLAY_NAME,
    bindNativeSessionScope,
    context,
    connectionService: backend,
    contexts: new NativeSessionContexts(memory),
    tabPanels: panels,
    agentManagerHost: host,
    remoteService: { onChange: subscribe },
    autoApprove: { onChange: () => ({ dispose: () => {} }), active: () => false },
    agentManagerProvider: {},
    openLink: () => false,
    diffVirtualProvider: undefined,
    diffViewerProvider: undefined,
    deliver: undefined,
    focus: { gained: () => {}, lost: () => {} },
    openSessionInTab: () => {},
    chat: undefined,
  })
  try {
    const active = contexts.active()
    for (const worktreeId of [tree.id, null, tree.id]) {
      await handleProjectMessage({ type: "agentManager.openDraftInTab", projectId: "b", worktreeId }, deps)
    }
    expect(errors).toEqual([])
    expect(created).toHaveLength(3)
    expect(panels.size).toBe(3)
    expect(calls).toEqual([])
    expect(contexts.active()).toBe(active)
    expect(state.getSessions()).toEqual([])
    for (const [index, [panel, owner]] of [...panels].entries()) {
      const scope = nativeSessionScope(owner)!
      expect(scope.projectId).toBe("b")
      expect(scope.directory).toBe(index === 1 ? background : directory)
      expect(owner.getSelectedSessionId()).toBeUndefined()
      expect(panel.title).toContain(`[${basename(background)} / ${index === 1 ? "Local" : "feature/background"}]`)
      expect(panel.webview.html).toContain("KILO_NATIVE_SESSION_TAB")
      expect(panel.webview.html).toContain('"restore":false')
    }
    const owner = [...panels.values()].at(0)!
    const creating = (owner as unknown as { handleCreateSession: () => Promise<void> }).handleCreateSession()
    expect(panels.size).toBe(3)
    expect(calls).toEqual([])
    hydration.resolve()
    await started.promise
    expect(panels.size).toBe(3)
    expect(calls.at(-1)).toBe(`create:${directory}`)
    expect(calls.slice(0, 3)).toEqual([background, background, background])
    creation.reject(new Error("Session creation failed. Retry after reconnecting."))
    await creating
    expect(created.at(0)!.messages).toContainEqual({
      type: "error",
      message: "Session creation failed. Retry after reconnecting.",
    })
    expect(owner.getSelectedSessionId()).toBeUndefined()
    await handleProjectMessage({ type: "agentManager.openDraftInTab", projectId: "unknown", worktreeId: null }, deps)
    await handleProjectMessage({ type: "agentManager.openDraftInTab", projectId: "b", worktreeId: "unknown" }, deps)
    rmSync(directory, { recursive: true })
    await handleProjectMessage({ type: "agentManager.openDraftInTab", projectId: "b", worktreeId: tree.id }, deps)
    expect(created).toHaveLength(3)
    expect(errors).toHaveLength(3)
    expect(errors.every((error) => error.startsWith("Unable to open New Session:"))).toBe(true)
    const inits = [...panels.values()].map(
      (owner) => (owner as unknown as { initConnectionPromise: Promise<void> }).initConnectionPromise,
    )
    pending.reject(new Error("Backend unavailable. Retry to reconnect."))
    await Promise.all(inits)
    for (const panel of created)
      expect(panel.messages).toContainEqual({
        type: "connectionState",
        state: "error",
        error: "Backend unavailable. Retry to reconnect.",
      })
    for (const panel of created) panel.raw.dispose()
    expect(panels.size).toBe(0)
    expect(calls.filter((call) => call.startsWith("create:"))).toHaveLength(1)
  } finally {
    Object.assign(vscode.window, { createWebviewPanel: prior })
    for (const owner of panels.values()) owner.dispose()
    await state.flush()
    rmSync(root, { recursive: true, force: true })
  }
})

it.each(["disposed", "placement"])(
  "cleans lazy native creations when %s changes during backend creation",
  async (mode) => {
    const pending = Promise.withResolvers<{ data: { id: string } }>()
    const started = Promise.withResolvers<void>()
    const deleted: unknown[] = []
    let changed = false
    const scope = {
      projectId: "b",
      root: "/b",
      directory: "/b/tree",
      worktreeId: "w",
      label: "feature",
      projectLabel: "B",
      generation: 1,
      routes: new ProjectRouteService(),
      validate: () => {},
      register: () => {
        if (changed) throw new Error("placement changed")
      },
    }
    const provider = new KiloProvider(
      {} as never,
      {
        sandboxPreference: { wait: async () => {}, explicit: () => false, onChange: () => () => {} },
        getClient: () => ({
          session: {
            create: () => {
              started.resolve()
              return pending.promise
            },
            delete: async (input: unknown) => {
              deleted.push(input)
            },
          },
        }),
        unregisterVisible: () => {},
        unregisterAttached: () => {},
      } as never,
      undefined,
      { nativeSessionScope: scope },
    )
    const task = (
      provider as unknown as { resolveSession: (id?: string, draft?: string) => Promise<unknown> }
    ).resolveSession(undefined, "draft")
    await started.promise
    if (mode === "disposed") provider.dispose()
    if (mode === "placement") changed = true
    pending.resolve({ data: { id: "late" } })
    if (mode === "placement") await expect(task).rejects.toThrow("placement changed")
    if (mode === "disposed") expect(await task).toBeUndefined()
    expect(deleted).toEqual([{ sessionID: "late", directory: "/b/tree" }])
    expect(provider.getSelectedSessionId()).toBeUndefined()
    provider.dispose()
  },
)

it("clears only qualified native references even when Local placement differs from backend directory", () => {
  const ref = { projectId: "b", sessionId: "same" }
  const sent: unknown[][] = []
  const scopes = ["a", "b", undefined]
  const providers = scopes.map((projectId) => {
    const messages: unknown[] = []
    sent.push(messages)
    const provider = new KiloProvider(
      {} as never,
      {
        unregisterVisible: () => {},
        unregisterAttached: () => {},
        clearPermissionSession: () => {},
        pruneSession: () => {},
      } as never,
      undefined,
      {
        nativeSessionScope: projectId
          ? {
              projectId,
              root: "/local",
              directory: "/local",
              worktreeId: null,
              projectLabel: projectId,
              label: "Local",
              generation: 1,
              routes: new ProjectRouteService(),
              validate: () => {},
              register: () => {},
            }
          : undefined,
      },
    )
    const state = provider as unknown as { webview: { postMessage: (message: unknown) => Promise<boolean> } }
    state.webview = {
      postMessage: async (message) => {
        messages.push(message)
        return true
      },
    }
    provider.reserveSession(ref.sessionId, "/local")
    return provider
  })
  const host = new VscodeHost({} as never, {} as never, {} as never, {} as never)
  host.setNativeSessionDeletion((target) => {
    for (const provider of providers) provider.notifySessionDeleted(target)
  })
  try {
    host.deleteNativeSession(ref)
    expect(providers.map((provider) => provider.getSelectedSessionId())).toEqual(["same", undefined, "same"])
    expect(sent.at(0)).toEqual([])
    expect(sent.at(1)).toEqual([{ type: "sessionDeleted", projectId: "b", sessionID: "same" }])
    expect(sent.at(2)).toEqual([])
  } finally {
    for (const provider of providers) provider.dispose()
  }
})
