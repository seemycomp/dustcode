/**
 * VS Code adapter implementing the Host interface.
 *
 * This file is on the architecture test allowlist — it is one of the few
 * agent-manager files permitted to import "vscode".
 */

import * as vscode from "vscode"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Session } from "@kilocode/sdk/v2/client"
import type { Host, PanelContext, OutputHandle, SessionProvider, Disposable } from "./host"
import type { PRMergeMethod } from "./types"
import { ProjectRouteService } from "./project/route"
import { repoName, validateCloneUrl } from "./project/clone"
import { samePath } from "./project/paths"
import type { KiloConnectionService } from "../services/cli-backend"
import { KiloProvider } from "../KiloProvider"
import { PLATFORM, SNAPSHOT_INITIALIZATION } from "./constants"
import { keybindings, watchKeybindings } from "../kilo-provider/shortcut-context"
import { DiffVirtualProvider } from "../DiffVirtualProvider"
import { buildWebviewHtml } from "../utils"
import { openFileInEditor, getWorkspaceRoot } from "../review-utils"
import { isWebLink } from "../browser-links"
import { TelemetryProxy, type TelemetryEventName } from "../services/telemetry"
import type { AutoApproveController } from "../commands/toggle-auto-approve"
import type { RemoteStatusService } from "../services/RemoteStatusService"
import type { CaffeinationService } from "../services/caffeination"
import { fetchSessionPage } from "../kilo-provider/session-page"
import { isNotFoundError } from "../kilo-provider/handlers/not-found"
import type { NativeSessionTarget } from "../kilo-provider/native-session-tabs"
import type { AgentManagerOpenSessionInTabRequest } from "../../webview-ui/src/types/messages/agent-manager"
import type { AgentManagerProvider } from "./AgentManagerProvider"
import { PresentationLifetime } from "./presentation-lifetime"

const INTRO_KEY = "kilo.agentManager.introDismissed"
const PR_MERGE_METHODS_KEY = "agentManager.prMergeMethod"

export class VscodeHost implements Host {
  private diffVirtual: DiffVirtualProvider | undefined
  private autoApprove: AutoApproveController | undefined
  private focus: { gained: () => void; lost: () => void } | undefined
  private focused: object | undefined
  /**
   * Shared project route registry for every Agent Manager panel opened by
   * this host. One service keeps raw session id ambiguity consistent across
   * panels, so two panels never disagree about whether an id is ambiguous.
   */
  private readonly routes = new ProjectRouteService()
  private native: ((target: NativeSessionTarget) => Promise<void>) | undefined
  private draft: ((scope: import("../kilo-provider/options").NativeSessionScope) => void) | undefined
  private attached: ((ref: import("./project/route").SessionRef, directory: string) => boolean) | undefined
  private deletion: ((ref: import("./project/route").SessionRef) => void) | undefined
  private scope:
    | ((
        binding: import("./project/native").NativeScopeBinding,
      ) => Promise<import("../kilo-provider/options").NativeSessionScope>)
    | undefined

  setNativeScopeResolver(resolve: NonNullable<VscodeHost["scope"]>): void {
    this.scope = resolve
  }

  async resolveNativeScope(binding: import("./project/native").NativeScopeBinding) {
    if (!this.scope) throw new Error("Native chat tabs are unavailable.")
    return this.scope(binding)
  }

  setNativeSessionAttachments(attached: NonNullable<VscodeHost["attached"]>): void {
    this.attached = attached
  }

  hasNativeSession(ref: import("./project/route").SessionRef, directory: string): boolean {
    return this.attached?.(ref, directory) ?? false
  }
  setNativeSessionDeletion(deleted: NonNullable<VscodeHost["deletion"]>): void {
    this.deletion = deleted
  }

  deleteNativeSession(ref: import("./project/route").SessionRef): void {
    this.deletion?.(ref)
  }
  private resolver: ((request: AgentManagerOpenSessionInTabRequest) => Promise<NativeSessionTarget>) | undefined

  setNativeSessionResolver(
    resolve: (request: AgentManagerOpenSessionInTabRequest) => Promise<NativeSessionTarget>,
  ): void {
    this.resolver = resolve
  }

  async resolveNativeSession(request: AgentManagerOpenSessionInTabRequest): Promise<NativeSessionTarget> {
    if (!this.resolver) throw new Error("Native chat tabs are unavailable.")
    return this.resolver(request)
  }

  setOpenSessionInTab(open: (target: NativeSessionTarget) => Promise<void>): void {
    this.native = open
  }

  async openSessionInTab(target: NativeSessionTarget): Promise<void> {
    if (!this.native) throw new Error("Native chat tabs are unavailable.")
    await this.native(target)
  }

  setOpenDraftInTab(open: NonNullable<VscodeHost["draft"]>): void {
    this.draft = open
  }

  openDraftInTab(scope: import("../kilo-provider/options").NativeSessionScope): void {
    if (!this.draft) throw new Error("Native chat tabs are unavailable.")
    scope.validate()
    this.draft(scope)
  }

  projectRoutes(): ProjectRouteService {
    return this.routes
  }

  historySessions(): Pick<SessionProvider, "getSessionInfo" | "listSessionPage"> {
    return {
      getSessionInfo: async (sessionID, directory) => {
        if (!directory) throw new Error("A project directory is required.")
        const client = await this.connectionService.getClientAsync(directory)
        return client.session
          .get({ sessionID, directory }, { throwOnError: true })
          .then((result) => result.data)
          .catch((error: unknown) => {
            if (isNotFoundError(error)) return undefined
            throw error
          })
      },
      listSessionPage: async ({ directory, ...input }) =>
        fetchSessionPage(await this.connectionService.getClientAsync(directory), { dir: directory, ...input }),
    }
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionService: KiloConnectionService,
    private readonly context: vscode.ExtensionContext,
    private readonly remoteService: RemoteStatusService,
    private readonly caffeination?: Pick<CaffeinationService, "getState" | "onChange" | "setEnabled">,
  ) {}

  setDiffVirtualProvider(provider: DiffVirtualProvider): void {
    this.diffVirtual = provider
  }

  setAutoApproveController(ctrl: AutoApproveController): void {
    this.autoApprove = ctrl
  }

  /** Report Agent Manager panel focus so commands can find the user's surface. */
  setFocusListener(listener: { gained: () => void; lost: () => void }): void {
    this.focus = listener
  }

  async showSidebar(preserveFocus?: boolean): Promise<void> {
    await vscode.commands.executeCommand("dustcode.SidebarProvider.focus", { preserveFocus: preserveFocus ?? false })
  }

  registerSidebar(manager: AgentManagerProvider): vscode.Disposable {
    return vscode.window.registerWebviewViewProvider(
      "dustcode.SidebarProvider",
      {
        resolveWebviewView: (view) => {
          const ctx: PanelContext = this.wrapSidebar(view, {
            onBeforeMessage: (msg) => manager.handleMessage(msg, ctx),
            worktreeDirectories: () => manager.getWorktreeDirectories(),
            workspaceRoot: manager.workspaceRoot,
            projectId: manager.projectId,
            sessionProject: () => manager.sessionProject(),
          })
          manager.deserializePanel(ctx)
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  }

  wrapSidebar(view: vscode.WebviewView, opts: Parameters<Host["openPanel"]>[0]): PanelContext {
    return this.wirePanel({ view }, opts)
  }

  openPanel(opts: Parameters<Host["openPanel"]>[0]): PanelContext {
    const panel = vscode.window.createWebviewPanel(
      "dustcode.AgentManagerPanel",
      "Agent Manager",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        enableForms: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    )
    return this.wirePanel({ panel }, opts)
  }

  /** Wrap an existing vscode.WebviewPanel (e.g. deserialized on restart). */
  wrapExistingPanel(
    panel: vscode.WebviewPanel,
    opts: {
      onBeforeMessage: (msg: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      worktreeDirectories?: () => string[]
      workspaceRoot?: () => string | undefined
      projectId?: () => string | undefined
      sessionProject?: () => string | undefined
    },
  ): PanelContext {
    return this.wirePanel({ panel }, opts)
  }

  private wirePanel(
    target: { panel: vscode.WebviewPanel } | { view: vscode.WebviewView },
    opts: {
      onBeforeMessage: (msg: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      worktreeDirectories?: () => string[]
      workspaceRoot?: () => string | undefined
      projectId?: () => string | undefined
      sessionProject?: () => string | undefined
    },
  ): PanelContext {
    const panel = "panel" in target ? target.panel : undefined
    const view = "view" in target ? target.view : undefined
    const surface = "panel" in target ? target.panel : target.view
    const presentation = panel ? "editor" : "sidebar"
    let focused = false
    const activation = new Set<() => void>()
    const active = () => panel?.active ?? (view?.visible === true && focused)
    const visible = () => surface.visible
    const changed = (cb: () => void) =>
      "panel" in target ? target.panel.onDidChangeViewState(cb) : target.view.onDidChangeVisibility(cb)
    const reveal = (preserve?: boolean) =>
      panel ? panel.reveal(vscode.ViewColumn.One, preserve ?? false) : view?.show(preserve ?? false)
    surface.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [this.extensionUri],
    }

    if (panel) panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "dustcode.png")

    const port = this.connectionService.getServerInfo()?.port
    surface.webview.html = buildWebviewHtml(surface.webview, {
      scriptUri: surface.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "agent-manager.js")),
      styleUri: surface.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "agent-manager.css")),
      iconsBaseUri: surface.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "assets", "icons")),
      workerUri: surface.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "shiki-worker.js")),
      title: "Agent Manager",
      port,
      browserAutomation: this.browserAutomation(),
      introDismissed: this.context.globalState.get<boolean>(INTRO_KEY) === true,
      frameSrc: ["localhost", "127.0.0.1"].map((host) => `http://${host}:*`).join(" "),
    }).replace("<body", `<body data-agent-manager-presentation="${presentation}"`)

    const provider = new KiloProvider(this.extensionUri, this.connectionService, this.context, {
      tabTitle: (title) => {
        if (panel) panel.title = title
      },
      tabLabel: "Agent Manager",
      platform: PLATFORM,
      snapshotInitialization: SNAPSHOT_INITIALIZATION,
      slimEditMetadata: true,
      worktreeDirectories: () => opts.worktreeDirectories?.() ?? [],
      rootDirectory: opts.workspaceRoot,
      disableViewedRegistration: true,
      disableStatsPolling: true,
      focusTargetContext: {
        prompt: "dustcode.agentManagerPromptFocused",
        mainTerminal: "dustcode.agentManagerMainTerminalFocused",
        sideTerminal: "dustcode.agentManagerSideTerminalFocused",
      },
      onFocused: () => {
        this.focused = surface
        this.focus?.gained()
      },
      routeService: this.routes,
      projectQualifier: () => {
        const projectId = opts.projectId?.()
        return projectId ? { projectId } : undefined
      },
    })
    if (this.diffVirtual) {
      provider.setDiffVirtualProvider(this.diffVirtual)
    }
    provider.setRemoteService(this.remoteService)
    const snapshot = () => {
      if (this.caffeination) {
        void surface.webview.postMessage({ type: "agentManager.caffeination", ...this.caffeination.getState() })
      }
    }
    const unsubscribe = this.caffeination?.onChange(snapshot)
    provider.attachToWebview(surface.webview, {
      onBeforeMessage: async (msg) => {
        if (msg.type === "webviewFocusChanged") {
          focused = msg.focused === true
          provider.setStreamVisibility(focused && visible())
          for (const cb of activation) cb()
        }
        if (msg.type === "agentManager.setCaffeination") {
          if (typeof msg.enabled === "boolean") await this.caffeination?.setEnabled(msg.enabled)
          return null
        }
        if (msg.type === "agentManager.requestCaffeination") {
          snapshot()
          return null
        }
        if (msg.type !== "agentManager.setIntroDismissed") return opts.onBeforeMessage(msg)
        if (typeof msg.dismissed === "boolean") await this.context.globalState.update(INTRO_KEY, msg.dismissed)
        return null
      },
    })
    provider.setStreamVisibility(active() && visible())
    const streams = changed(() => provider.setStreamVisibility(active() && visible()))
    const lifetime = new PresentationLifetime(
      (cb) => surface.onDidDispose(cb),
      () => panel?.dispose(),
      () => {
        unsubscribe?.()
        streams.dispose()
        provider.dispose()
        if (this.focused === surface) {
          this.focused = undefined
          this.focus?.lost()
        }
      },
    )
    if (this.autoApprove) provider.setAutoApproveController(this.autoApprove)

    const sessions: SessionProvider = {
      setSessionDirectory: (id, dir) => provider.setSessionDirectory(id, dir),
      clearSessionDirectory: (id) => provider.clearSessionDirectory(id),
      getSessionDirectories: () => provider.getSessionDirectories(),
      getSessionInfo: (id, directory) => provider.getSessionInfo(id, directory),
      listSessions: (dir) => this.listProjectSessions(dir),
      listSessionPage: async ({ directory, ...input }) =>
        fetchSessionPage(await this.connectionService.getClientAsync(directory), { dir: directory, ...input }),
      trackSession: (id) => provider.trackSession(id),
      refreshSessions: () => provider.refreshSessions(),
      registerSession: (s) => provider.registerSession(s, false, opts.sessionProject?.()),
      recoverPendingPrompts: () => provider.recoverPendingPrompts(),
      onFollowupAdopted: (cb) => provider.onFollowupAdopted(cb),
      acknowledgeDraft: (draftID, sessionID) => provider.acknowledgeDraft(draftID, sessionID),
      abortSessions: (ids) => provider.abortSessions(ids),
      showMemory: (id) => provider.showMemory(id),
      toggleMemory: (id) => provider.toggleMemory(id),
      registerProjectRoute: (ref, root, generation) => provider.registerProjectRoute(ref, root, generation),
      unregisterProjectRoute: (projectId) => provider.unregisterProjectRoute(projectId),
      registerWorktreeRoute: (ref, directory, generation) => provider.registerWorktreeRoute(ref, directory, generation),
      registerSessionRoute: (ref, directory, generation) => provider.registerSessionRoute(ref, directory, generation),
      unregisterSessionRoute: (ref) => provider.unregisterSessionRoute(ref),
      isSessionRouteAmbiguous: (sessionId) => provider.isSessionRouteAmbiguous(sessionId),
      routeSessionDirectoryFor: (ref) => provider.routeSessionDirectoryFor(ref),
      refreshGitStatus: () => void provider.refreshGitStatus(),
      retryInitialization: () => void provider.retryInitialization(),
      dispose: () => provider.dispose(),
    }

    return {
      presentation,
      get active() {
        return active()
      },
      get visible() {
        return visible()
      },
      postMessage(msg) {
        void surface.webview.postMessage(msg)
      },
      waitForReady() {
        return provider.waitForReady()
      },
      waitForActive() {
        return lifetime.when(active, (cb) => {
          activation.add(cb)
          const sub = changed(cb)
          return {
            dispose: () => {
              activation.delete(cb)
              sub.dispose()
            },
          }
        })
      },
      reveal(preserveFocus) {
        reveal(preserveFocus)
      },
      sessions,
      onDidChangeVisibility(cb) {
        return changed(() => cb(visible()))
      },
      onDidDispose(cb) {
        return lifetime.onDidDispose(cb)
      },
      dispose() {
        lifetime.dispose()
      },
    }
  }

  /**
   * List root sessions for one project directory via the shared CLI backend.
   * Used by per-project session discovery so multi-project Agent Manager lists
   * real Local/history sessions by their exact directory instead of only the
   * persisted managed records. Returns [] when the backend is not connected or
   * the listing fails, so one directory's failure cannot erase another's
   * results.
   */
  private async listProjectSessions(dir: string): Promise<Session[]> {
    try {
      const client = await this.connectionService.getClientAsync(dir)
      const res = await client.session.list({ directory: dir, roots: true }, { throwOnError: true })
      return res.data
    } catch (err) {
      console.warn(`[Dustcode] Agent Manager: failed to list project sessions for ${dir}:`, err)
      return []
    }
  }

  workspacePath(): string | undefined {
    return getWorkspaceRoot()
  }

  dirtyFiles(): string[] {
    return vscode.workspace.textDocuments
      .filter((doc) => doc.isDirty && doc.uri.scheme === "file")
      .map((doc) => doc.uri.fsPath)
  }

  async pickFolder(opts?: { defaultPath?: string; title?: string }): Promise<string | undefined> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: vscode.l10n.t("Select Folder"),
      title: opts?.title ?? vscode.l10n.t("Add Project to Agent Manager"),
      defaultUri: opts?.defaultPath ? vscode.Uri.file(opts.defaultPath) : undefined,
    })
    return uris?.at(0)?.fsPath
  }

  async input(opts: Parameters<Host["input"]>[0]): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: opts.title,
      prompt: opts.prompt,
      value: opts.value,
      validateInput: opts.validate,
      ignoreFocusOut: true,
    })
  }

  async confirm(message: string, action: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action
  }

  private async git() {
    if (!vscode.workspace.isTrusted) {
      throw new Error(vscode.l10n.t("Trust this workspace before cloning a repository."))
    }
    const version = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(vscode.version)
    if (!version || !(Number(version.at(1)) > 1 || (Number(version.at(1)) === 1 && Number(version.at(2)) >= 111))) {
      throw new Error(
        vscode.l10n.t("Update VS Code to 1.111 or later to clone here. You can still use Open local folder."),
      )
    }
    const extension = vscode.extensions.getExtension<{
      enabled: boolean
      getAPI(version: number): { openRepository(uri: vscode.Uri): Thenable<{ rootUri: vscode.Uri } | null> }
    }>("vscode.git")
    if (!extension || !vscode.workspace.getConfiguration("git").get("enabled", true)) {
      throw new Error(vscode.l10n.t("Enable the built-in Git extension and git.enabled to clone a repository."))
    }
    const git = extension.isActive ? extension.exports : await extension.activate()
    if (!extension.isActive || !git.enabled || !(await vscode.commands.getCommands(true)).includes("git.clone")) {
      throw new Error(
        vscode.l10n.t("The Git clone command is unavailable. Enable the built-in Git extension and reload VS Code."),
      )
    }
    return git.getAPI(1)
  }

  private async existingCheckout(name: string | undefined, selected: string): Promise<string | undefined> {
    if (!name) return undefined
    const dir = path.join(selected, name)
    if (!(await fs.stat(path.join(dir, ".git")).catch(() => undefined))) return undefined
    return dir
  }

  private async directory(dir: string, message: string): Promise<string> {
    const real = await fs.realpath(dir).catch(() => undefined)
    if (!real || !(await fs.stat(real).catch(() => undefined))?.isDirectory()) throw new Error(message)
    return real
  }

  async cloneRepository(url: string, parent: string): Promise<string | undefined> {
    const invalid = validateCloneUrl(url)
    if (invalid) throw new Error(vscode.l10n.t(invalid))
    const git = await this.git()
    const selected = await this.directory(parent, vscode.l10n.t("Select a parent folder for the cloned repository."))
    // Opening an existing checkout beats failing a clone into an occupied folder.
    const name = repoName(url)
    const existing = await this.existingCheckout(name, selected)
    if (existing) {
      const open = await this.confirm(
        vscode.l10n.t("A checkout already exists at {0}. Open it instead of cloning again?", existing),
        vscode.l10n.t("Open existing checkout"),
      )
      return open ? existing : undefined
    }
    let result: string | undefined
    let failure: unknown
    try {
      result = await vscode.commands.executeCommand<string | undefined>("git.clone", url, parent, {
        postCloneAction: "none",
        returnRepositoryPath: true,
      })
    } catch (err) {
      failure = err
    }
    if (result === undefined && failure !== undefined) {
      // A clone can complete while checkout fails, for example a missing Git LFS object.
      const recovered = await this.existingCheckout(name, selected)
      if (!recovered) throw failure
      const attach = await this.confirm(
        vscode.l10n.t("Checkout failed, but the repository was cloned. Attach {0} anyway?", recovered),
        vscode.l10n.t("Attach repository"),
      )
      if (!attach) return undefined
      result = recovered
    }
    if (result === undefined) return undefined
    const message = vscode.l10n.t(
      "Git did not return a repository folder. Use Open local folder to attach the checkout.",
    )
    if (typeof result !== "string" || !path.isAbsolute(result)) throw new Error(message)
    const root = await this.directory(result, message)
    const repo = await Promise.resolve(git.openRepository(vscode.Uri.file(root))).catch(() => undefined)
    const canonical = repo && (await fs.realpath(repo.rootUri.fsPath).catch(() => undefined))
    if (!canonical || !samePath(canonical, root)) {
      throw new Error(vscode.l10n.t("The folder returned by Git is not a repository: {0}", root))
    }
    if (
      !samePath(path.dirname(root), selected) &&
      !(await this.confirm(
        vscode.l10n.t("Git returned an existing checkout outside the selected parent folder: {0}", root),
        vscode.l10n.t("Attach existing project at {0}", root),
      ))
    )
      return undefined
    return root
  }

  browserAutomation(): boolean {
    return vscode.workspace.getConfiguration("dustcode.experimental").get("browserAutomation", false)
  }

  async approveBrowserNavigation(origin: string): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      `Allow the Agent Manager browser to navigate to ${origin}?`,
      { modal: true },
      "Allow",
    )
    return answer === "Allow"
  }

  worktreePool(): boolean {
    return vscode.workspace.getConfiguration("dustcode.agentManager").get("worktreePool", true)
  }

  readProjects(): unknown {
    return this.context.globalState.get("agentManager.projects")
  }

  async writeProjects(value: unknown): Promise<void> {
    await this.context.globalState.update("agentManager.projects", value)
  }

  getPRMergeMethod(repo: string): PRMergeMethod | undefined {
    const values = this.context.globalState.get<Record<string, unknown>>(PR_MERGE_METHODS_KEY)
    const value = values?.[repo]
    if (value === "merge" || value === "squash" || value === "rebase") return value
    return undefined
  }

  async savePRMergeMethod(repo: string, method: PRMergeMethod): Promise<void> {
    const values = this.context.globalState.get<Record<string, unknown>>(PR_MERGE_METHODS_KEY) ?? {}
    await this.context.globalState.update(PR_MERGE_METHODS_KEY, { ...values, [repo]: method })
  }

  unregisterProjectRoutes(projectId: string): void {
    this.routes.unregisterProject(projectId)
  }

  onDidChangeWorkspaceFolders(cb: () => void): Disposable {
    return vscode.workspace.onDidChangeWorkspaceFolders(() => cb())
  }

  onDidChangeWorktreePool(cb: (enabled: boolean) => void): Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dustcode.agentManager.worktreePool")) cb(this.worktreePool())
    })
  }

  isTrusted(): boolean {
    return vscode.workspace.isTrusted
  }

  autoBranchNaming(): { enabled: boolean; prefix: string } {
    const cfg = vscode.workspace.getConfiguration("dustcode.agentManager")
    return {
      enabled: cfg.get("autoBranchNaming", true),
      prefix: cfg.get("branchPrefix", ""),
    }
  }

  showError(msg: string): void {
    void vscode.window.showErrorMessage(msg)
  }

  notify(kind: "info" | "warning" | "error", msg: string): void {
    if (kind === "info") void vscode.window.showInformationMessage(msg)
    else if (kind === "warning") void vscode.window.showWarningMessage(msg)
    else void vscode.window.showErrorMessage(msg)
  }

  revealInOS(path: string): void {
    if (vscode.env.remoteName) {
      console.warn(`[Dustcode] Cannot reveal ${path} in the OS file manager on a remote workspace`)
      return
    }
    void vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(path))
  }

  async withProgress<T>(title: string, task: (cancelled: () => boolean) => Promise<T>): Promise<T> {
    return await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      (_progress, token) => task(() => token.isCancellationRequested),
    )
  }

  async openDocument(path: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(path)
      await vscode.window.showTextDocument(doc)
    } catch {
      // Silently ignore — file may not exist
    }
  }

  openFile(path: string, line?: number, column?: number): void {
    openFileInEditor(path, line, column, vscode.ViewColumn.Active, "AgentManagerProvider")
  }

  openFolder(path: string, newWindow: boolean): void {
    const uri = vscode.Uri.file(path)
    void vscode.commands.executeCommand("vscode.openFolder", uri, newWindow)
  }

  createOutput(name: string): OutputHandle {
    const channel = vscode.window.createOutputChannel(name)
    return {
      appendLine: (msg) => channel.appendLine(msg),
      show: () => channel.show(true),
      dispose: () => channel.dispose(),
    }
  }

  extensionKeybindings(): Array<{ command: string; key?: string; mac?: string; when?: string }> {
    return keybindings(this.context)
  }

  onDidChangeKeybindings(cb: () => void): Disposable {
    return watchKeybindings(this.context, cb)
  }

  async copyToClipboard(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text)
  }

  async readClipboard(): Promise<string> {
    return vscode.env.clipboard.readText()
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    TelemetryProxy.capture(event as TelemetryEventName, properties)
  }

  openExternal(url: string): void {
    if (!isWebLink(url)) return
    void vscode.env.openExternal(vscode.Uri.parse(url))
  }

  openSettings(tab?: string, projectId?: string): void {
    void vscode.commands.executeCommand("dustcode.settingsButtonClicked", tab, projectId)
  }

  refreshGit(): void {
    void vscode.commands.executeCommand("git.refresh")
  }

  dispose(): void {}
}
