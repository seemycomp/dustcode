import { expect, it, spyOn } from "bun:test"
import * as vscode from "vscode"
import { Project, SyntaxKind } from "ts-morph"
import { KiloProvider } from "../../src/KiloProvider"
import { AgentManagerProvider } from "../../src/agent-manager/AgentManagerProvider"
import { VscodeHost } from "../../src/agent-manager/vscode-host"
import type { KiloConnectionService } from "../../src/services/cli-backend"
import type { RemoteStatusService } from "../../src/services/RemoteStatusService"
import type { PanelContext } from "../../src/agent-manager/host"

// Exercise the registered callback without activating unrelated extension services.
const source = new Project({ useInMemoryFileSystem: true }).createSourceFile(
  "extension.ts",
  await Bun.file(`${import.meta.dir}/../../src/extension.ts`).text(),
)
const command = source
  .getDescendantsOfKind(SyntaxKind.CallExpression)
  .find(
    (call) =>
      call.getExpression().getText() === "vscode.commands.registerCommand" &&
      call.getArguments().at(0)?.getText() === '"dustcode.generateTerminalCommand"',
  )
expect(command).toBeDefined()
const callback = command!.getArguments().at(1)!.asKindOrThrow(SyntaxKind.ArrowFunction)
const generate = new Function(
  "vscode",
  "agentManagerProvider",
  `${new Bun.Transpiler({ loader: "ts" }).transformSync(`const callback = ${callback.getText()}`)}; return callback`,
)

async function tick() {
  const pending = Promise.withResolvers<void>()
  setImmediate(pending.resolve)
  await pending.promise
}

function surface() {
  const messages: unknown[] = []
  const disposers = new Set<() => void>()
  const changes = new Set<() => void>()
  let receive: ((msg: unknown) => Promise<void>) | undefined
  const raw = {
    active: true,
    visible: true,
    title: "Agent Manager",
    viewColumn: 1,
    webview: {
      html: "",
      options: {},
      cspSource: "vscode-webview:",
      asWebviewUri: (uri: vscode.Uri) => ({ ...uri, toString: () => uri.fsPath }),
      postMessage: async (msg: unknown) => {
        messages.push(msg)
        return true
      },
      onDidReceiveMessage: (cb: typeof receive) => {
        receive = cb
        return {
          dispose: () => {
            receive = undefined
          },
        }
      },
    },
    onDidDispose: (cb: () => void) => {
      disposers.add(cb)
      return { dispose: () => disposers.delete(cb) }
    },
    onDidChangeVisibility: (cb: () => void) => {
      changes.add(cb)
      return { dispose: () => changes.delete(cb) }
    },
    onDidChangeViewState: (cb: () => void) => {
      changes.add(cb)
      return { dispose: () => changes.delete(cb) }
    },
    reveal: () => {},
    show: () => {},
    dispose: () => {
      for (const cb of disposers) cb()
      disposers.clear()
    },
  }
  return {
    raw,
    messages,
    receive: (msg: unknown) => receive?.(msg),
    show: (visible: boolean) => {
      raw.visible = visible
      for (const cb of changes) cb()
    },
  }
}

it("registers the Activity Bar with production manager, focuses without editor creation, and restores independent editor transport", async () => {
  const prior = { folders: vscode.workspace.workspaceFolders, command: vscode.commands.executeCommand }
  const window = Object.fromEntries(
    ["onDidCloseTerminal", "onDidChangeActiveTerminal", "registerWebviewViewProvider", "createWebviewPanel"].map(
      (key) => [key, Reflect.get(vscode.window, key)],
    ),
  )
  const commands: string[] = []
  let registration: vscode.WebviewViewProvider | undefined
  const panels: ReturnType<typeof surface>[] = []
  Object.assign(vscode.workspace, { workspaceFolders: [] })
  Object.assign(vscode.commands, {
    executeCommand: async (command: string) => {
      commands.push(command)
    },
  })
  Object.assign(vscode.window, {
    onDidCloseTerminal: () => ({ dispose: () => {} }),
    onDidChangeActiveTerminal: () => ({ dispose: () => {} }),
    registerWebviewViewProvider: (id: string, provider: vscode.WebviewViewProvider, opts: unknown) => {
      expect(id).toBe("dustcode.SidebarProvider")
      expect(opts).toEqual({ webviewOptions: { retainContextWhenHidden: true } })
      registration = provider
      return { dispose: () => {} }
    },
    createWebviewPanel: () => {
      const panel = surface()
      panels.push(panel)
      return panel.raw
    },
  })
  const subscribe = () => () => {}
  const pending = Promise.withResolvers<void>()
  const backend = {
    onEvent: subscribe,
    onEventFiltered: subscribe,
    onStateChange: subscribe,
    onSessionAcknowledged: subscribe,
    registerDirectoryProvider: subscribe,
    getServerInfo: () => undefined,
    registerVisible: () => {},
    registerAttached: () => {},
    getClient: () => undefined,
    getConnectionState: () => "disconnected",
    getConnectionError: () => undefined,
    getPendingCompletions: () => [],
    connect: () => pending.promise,
    unregisterVisible: () => {},
    unregisterAttached: () => {},
  } as unknown as KiloConnectionService
  const memory = { get: () => undefined, update: async () => {} }
  const context = {
    globalState: memory,
    workspaceState: memory,
    extensionUri: vscode.Uri.file("/extension"),
  } as unknown as vscode.ExtensionContext
  const host = new VscodeHost(context.extensionUri, backend, context, {
    onChange: subscribe,
  } as unknown as RemoteStatusService)
  const manager = new AgentManagerProvider(host, backend)
  // This workspace-free host fixture has no project to route readiness through.
  const handle = manager.handleMessage.bind(manager)
  const intercept = spyOn(manager, "handleMessage").mockImplementation((msg, ctx) =>
    msg.type === "webviewReady" ? Promise.resolve(msg) : handle(msg, ctx),
  )
  const stop = spyOn(KiloProvider.prototype, "abortSessions")
  const dispose = spyOn(KiloProvider.prototype, "dispose")
  try {
    host.registerSidebar(manager)
    await manager.openPanel()
    expect(panels).toHaveLength(0)
    const sidebar = surface()
    await registration!.resolveWebviewView(
      sidebar.raw as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken,
    )
    expect(sidebar.raw.webview.html).toContain("agent-manager.js")
    expect(sidebar.raw.webview.html).toContain('data-agent-manager-presentation="sidebar"')
    expect(sidebar.raw.webview.html).not.toContain("/dist/webview.js")
    await sidebar.receive({ type: "webviewFocusChanged", focused: true })
    expect(manager.isActive()).toBe(true)
    await manager.openPanel()
    expect(commands).toContain("dustcode.SidebarProvider.focus")
    expect(panels).toHaveLength(0)
    const request = { type: "agentManager.openDialog", dialog: "worktree", projectId: "background-project" }
    const opening = sidebar.receive(request)
    await tick()
    expect(panels).toHaveLength(0)
    const dialogs = (view: ReturnType<typeof surface>) =>
      view.messages.filter((msg) => (msg as { type: string }).type === "agentManager.openDialog")
    expect(dialogs(sidebar)).toEqual([])
    await sidebar.receive({ type: "webviewReady" })
    await opening
    expect(dialogs(sidebar)).toEqual([request])
    const shortcuts = { type: "agentManager.openDialog", dialog: "shortcuts" }
    await sidebar.receive(shortcuts)
    expect(dialogs(sidebar)).toEqual([request, shortcuts])
    expect(panels).toHaveLength(0)
    const project = sidebar.receive({ type: "agentManager.openDialog", dialog: "project" })
    await tick()
    expect(panels).toHaveLength(1)
    expect(panels[0]!.raw.webview.html).toContain('data-agent-manager-presentation="editor"')
    const editor = panels[0]!
    expect(dialogs(editor)).toEqual([])
    await editor.receive({ type: "webviewReady" })
    await project
    expect(dialogs(editor).at(-1)).toEqual({ type: "agentManager.openDialog", dialog: "project" })
    await sidebar.receive(shortcuts)
    expect(dialogs(sidebar).at(-1)).toEqual(shortcuts)
    expect(dialogs(editor)).toEqual([{ type: "agentManager.openDialog", dialog: "project" }])
    expect(panels).toHaveLength(1)
    await manager.openAdvancedWorktree()
    expect(dialogs(editor)).toEqual([{ type: "agentManager.openDialog", dialog: "project" }])
    expect(dialogs(sidebar).at(-1)).toEqual({ type: "agentManager.openDialog", dialog: "worktree" })
    expect(panels).toHaveLength(1)
    await editor.receive({ type: "webviewFocusChanged", focused: true })
    editor.raw.active = false
    const run = generate({ window: { showInputBox: async () => "list files" } }, manager) as () => Promise<void>
    const tasks = (view: ReturnType<typeof surface>) =>
      view.messages.filter((msg) => (msg as { type: string }).type === "triggerTask")
    const task = run()
    await tick()
    expect(editor.raw.visible).toBe(true)
    expect(editor.raw.active).toBe(false)
    expect(tasks(editor)).toEqual([])
    await task
    expect(tasks(sidebar)).toEqual([
      {
        type: "triggerTask",
        text: "Generate a terminal command: list files",
        injectedTitle: "Generate terminal command",
      },
    ])
    expect(tasks(editor)).toEqual([])
    editor.raw.active = true
    sidebar.show(false)
    expect(manager.isActive()).toBe(true)
    expect(stop).not.toHaveBeenCalled()
    panels[0]!.raw.dispose()
    expect(stop).not.toHaveBeenCalled()
    sidebar.show(true)
    await sidebar.receive({ type: "agentManager.requestProjects" })
    expect(sidebar.messages.some((msg) => (msg as { type: string }).type === "agentManager.projects")).toBe(true)
    const restored = surface()
    const ctx: PanelContext = host.wrapExistingPanel(restored.raw as unknown as vscode.WebviewPanel, {
      onBeforeMessage: (msg) => manager.handleMessage(msg, ctx),
    })
    manager.deserializePanel(ctx)
    expect(restored.raw.webview.html).toContain('data-agent-manager-presentation="editor"')
    sidebar.raw.dispose()
    expect(stop).not.toHaveBeenCalled()
    await restored.receive({ type: "agentManager.requestProjects" })
    expect(restored.messages.some((msg) => (msg as { type: string }).type === "agentManager.projects")).toBe(true)
    await restored.receive({ type: "webviewReady" })
    await restored.receive({ type: "webviewFocusChanged", focused: true })
    restored.raw.active = false
    const waiting = surface()
    await registration!.resolveWebviewView(
      waiting.raw as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken,
    )
    const cancelled = run()
    await tick()
    expect(tasks(waiting)).toEqual([])
    waiting.raw.dispose()
    await cancelled
    expect(tasks(waiting)).toEqual([])
    expect(tasks(restored)).toEqual([])
    expect(stop).not.toHaveBeenCalled()
    for (const action of ["focus", "dispose"] as const) {
      const view = surface()
      const wrapped = host.wrapSidebar(view.raw as unknown as vscode.WebviewView, {
        onBeforeMessage: async (msg) => msg,
      })
      expect(wrapped.visible).toBe(true)
      expect(wrapped.active).toBe(false)
      let settled = false
      const pending = wrapped.waitForActive().then(() => {
        settled = true
      })
      if (action === "focus") await view.receive({ type: "webviewFocusChanged", focused: true })
      if (action === "dispose") wrapped.dispose()
      const tick = Promise.withResolvers<void>()
      setImmediate(tick.resolve)
      await tick.promise
      expect(settled).toBe(true)
      await pending
      wrapped.dispose()
    }
    restored.show(false)
    expect(stop).not.toHaveBeenCalled()
    const count = dispose.mock.calls.length
    restored.raw.dispose()
    expect(stop).toHaveBeenCalledTimes(1)
    // This host has no workspace; native lifetime tests cover the candidate IDs.
    expect(stop).toHaveBeenCalledWith([])
    expect(dispose).toHaveBeenCalledTimes(count + 1)
    expect(stop.mock.invocationCallOrder.at(-1)!).toBeLessThan(dispose.mock.invocationCallOrder.at(-1)!)
    const view = surface()
    await registration!.resolveWebviewView(
      view.raw as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken,
    )
    view.show(false)
    view.raw.dispose()
    expect(stop).toHaveBeenCalledTimes(1)
  } finally {
    await manager.shutdown()
    intercept.mockRestore()
    stop.mockRestore()
    dispose.mockRestore()
    Object.assign(vscode.workspace, { workspaceFolders: prior.folders })
    Object.assign(vscode.commands, { executeCommand: prior.command })
    Object.assign(vscode.window, window)
  }
})
