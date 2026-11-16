import { AsyncLocalStorage } from "node:async_hooks"
import type { Disposable, Host, PanelContext, SessionProvider } from "./host"
import { focusPanelPrompt, revealPanel } from "./focus-panel"

export type ManagerPresentation = "sidebar" | "editor"

const shared = new Set([
  "agentManager.state",
  "agentManager.projects",
  "agentManager.projectSessions",
  "agentManager.worktreeStats",
  "agentManager.localStats",
  "agentManager.worktreeActivity",
  "agentManager.prStatus",
  "agentManager.sessionClosed",
  "agentManager.selectionActivated",
  "agentManager.repoInfo",
  "agentManager.keybindings",
  "agentManager.terminal.fontChanged",
  "agentManager.terminal.destinationChanged",
  "agentManager.runState",
])
const commands = new Set([
  "action",
  "navigate",
  "triggerTask",
  "appendChatContext",
  "appendChatBoxMessage",
  "appendReviewComments",
  "agentManager.sendInitialMessage",
])
const mutations = new Set<keyof SessionProvider>([
  "setSessionDirectory",
  "clearSessionDirectory",
  "trackSession",
  "registerSession",
  "registerProjectRoute",
  "unregisterProjectRoute",
  "registerWorktreeRoute",
  "registerSessionRoute",
  "unregisterSessionRoute",
  "refreshGitStatus",
  "recoverPendingPrompts",
  "refreshSessions",
])

/** One manager owner, with independently disposable webview transports. */
export class ManagerPresentations implements Disposable {
  private readonly contexts = new Map<ManagerPresentation, PanelContext>()
  private readonly source = new AsyncLocalStorage<PanelContext>()
  private readonly visibility = new Set<(visible: boolean) => void>()
  private readonly disposed = new Set<() => void>()
  private followup: Parameters<SessionProvider["onFollowupAdopted"]>[0] | undefined
  private focused: PanelContext | undefined

  private current(): PanelContext | undefined {
    const source = this.source.getStore()
    if (source) return [...this.contexts.values()].includes(source) ? source : undefined
    if (this.focused?.visible) return this.focused
    return [...this.contexts.values()].find((ctx) => ctx.active) ?? this.contexts.values().next().value
  }

  readonly panel: PanelContext = {
    postMessage: (msg) => {
      const origin = this.source.getStore()
      if (origin && ![...this.contexts.values()].includes(origin)) return
      const type = (msg as { type?: string }).type ?? ""
      if (shared.has(type) || (!origin && !commands.has(type))) {
        for (const ctx of this.contexts.values()) ctx.postMessage(msg)
        return
      }
      this.current()?.postMessage(msg)
    },
    waitForReady: () => this.current()?.waitForReady() ?? Promise.resolve(),
    waitForActive: () => this.current()?.waitForActive() ?? Promise.resolve(),
    reveal: (preserve) => this.current()?.reveal(preserve),
    active: false,
    visible: false,
    sessions: new Proxy({} as SessionProvider, {
      get: (_, key: keyof SessionProvider) => {
        if (key === "onFollowupAdopted")
          return (cb: NonNullable<ManagerPresentations["followup"]>) => {
            this.followup = cb
            for (const ctx of this.contexts.values()) ctx.sessions.onFollowupAdopted(cb)
          }
        if (key === "dispose") return () => {}
        return (...args: unknown[]) => {
          if (mutations.has(key)) {
            for (const ctx of this.contexts.values()) {
              const method = ctx.sessions[key]
              if (typeof method === "function") Reflect.apply(method, ctx.sessions, args)
            }
            return
          }
          const sessions = this.current()?.sessions
          const method = sessions?.[key]
          if (typeof method === "function") return Reflect.apply(method, sessions, args)
          if (key === "getSessionDirectories") return new Map<string, string>()
        }
      },
    }),
    onDidChangeVisibility: (cb) => {
      this.visibility.add(cb)
      return { dispose: () => this.visibility.delete(cb) }
    },
    onDidDispose: (cb) => {
      this.disposed.add(cb)
      return { dispose: () => this.disposed.delete(cb) }
    },
    dispose: () => this.dispose(),
  }

  constructor(private readonly closing?: (ctx: PanelContext) => void) {
    // Accessors retain the stable facade without capturing a particular webview.
    const group = this
    Object.defineProperties(this.panel, {
      active: { get: () => group.active },
      visible: { get: () => group.visible },
    })
  }

  get active(): boolean {
    return [...this.contexts.values()].some((ctx) => ctx.active)
  }
  get visible(): boolean {
    return [...this.contexts.values()].some((ctx) => ctx.visible)
  }
  get size(): number {
    return this.contexts.size
  }
  get(presentation: ManagerPresentation): PanelContext | undefined {
    return this.contexts.get(presentation)
  }

  from<T>(ctx: PanelContext, task: () => T): T {
    return this.source.run(ctx, task)
  }

  background<T>(task: () => T): T {
    return this.source.exit(task)
  }

  async ready(presentation?: ManagerPresentation): Promise<boolean> {
    const ctx = presentation ? this.get(presentation) : this.current()
    if (!ctx) return false
    const closed = Promise.withResolvers<boolean>()
    const sub = ctx.onDidDispose(() => closed.resolve(false))
    return Promise.race([
      ctx.waitForReady().then(() => this.get(ctx.presentation ?? "editor") === ctx),
      closed.promise,
    ]).finally(() => sub.dispose())
  }

  focus(ctx: PanelContext): void {
    this.focused = ctx
  }

  restore(ctx: PanelContext, attach: (ctx: PanelContext) => void): void {
    if (this.get(ctx.presentation ?? "editor")) return ctx.dispose()
    attach(ctx)
  }

  openEditor(
    host: Host,
    opts: Omit<Parameters<Host["openPanel"]>[0], "onBeforeMessage"> & {
      onBeforeMessage: (msg: Record<string, unknown>, ctx: PanelContext) => Promise<Record<string, unknown> | null>
    },
    attach: (ctx: PanelContext) => void,
    preserve?: boolean,
  ): void {
    const editor = this.get("editor")
    const focus = (ctx: PanelContext) =>
      focusPanelPrompt(
        ctx,
        ctx.waitForReady().then(() => true),
        ctx.waitForActive().then(() => true),
      )
    if (editor) return revealPanel(editor, preserve, () => focus(editor))
    const panel: PanelContext = host.openPanel({ ...opts, onBeforeMessage: (msg) => opts.onBeforeMessage(msg, panel) })
    attach(panel)
    if (!preserve) focus(panel)
  }

  add(ctx: PanelContext, editor?: (visible: boolean) => void): void {
    const presentation = ctx.presentation ?? "editor"
    if (this.contexts.has(presentation)) throw new Error(`Agent Manager ${presentation} is already attached`)
    if (presentation === "editor") {
      editor?.(true)
      ctx.onDidDispose(() => editor?.(false))
    }
    for (const [id, dir] of this.panel.sessions.getSessionDirectories()) {
      ctx.sessions.setSessionDirectory(id, dir)
      ctx.sessions.trackSession(id)
    }
    this.contexts.set(presentation, ctx)
    if (this.followup) ctx.sessions.onFollowupAdopted(this.followup)
    const visibility = ctx.onDidChangeVisibility(() => this.changed())
    ctx.onDidDispose(() => {
      visibility.dispose()
      if (this.size === 1) this.closing?.(ctx)
      this.contexts.delete(presentation)
      if (this.focused === ctx) this.focused = undefined
      this.changed()
      if (!this.size) {
        for (const cb of this.disposed) cb()
        this.disposed.clear()
        this.visibility.clear()
      }
    })
    this.changed()
  }

  private changed(): void {
    this.background(() => {
      for (const cb of this.visibility) cb(this.visible)
    })
  }

  dispose(): void {
    for (const ctx of [...this.contexts.values()]) ctx.dispose()
  }
}
