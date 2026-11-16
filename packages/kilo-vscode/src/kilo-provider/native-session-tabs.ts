import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { stat } from "node:fs/promises"
import type { Memento } from "vscode"
import type { NativeSessionScope } from "./options"

type Session = {
  id: string
  directory: string
  projectId?: string
  scope?: NativeSessionScope
  current?: () => boolean
}
type Reservation = { session: Session; pending: boolean; failed?: boolean; current?: () => boolean }
export type NativeSessionTarget = Session & { projectId: string; scope: NativeSessionScope }

// Ownership metadata belongs to the existing panel map, including loads awaiting readiness.
const reservations = new WeakMap<object, Reservation>()

export function nativeSessionScope(owner: object): NativeSessionScope | undefined {
  return reservations.get(owner)?.session.scope
}

/** Restore/blank panels carry immutable qualification even without a selected session. */
export function bindNativeSessionScope(owner: object, scope: NativeSessionScope): void {
  reservations.set(owner, {
    session: { id: "", directory: scope.directory, projectId: scope.projectId, scope },
    pending: false,
  })
}

export async function nativeContextAvailable(
  native: { sessionID?: string; restore: boolean; context?: string; unavailable?: boolean },
  id: string,
  directory: string,
): Promise<boolean> {
  if (!native.restore || native.sessionID !== id) return true
  if (native.unavailable) return false
  if (!native.context) return true
  return stat(directory).then(
    (item) => item.isDirectory(),
    () => false,
  )
}

/** Persist trusted execution bindings, not panel ownership or a global active session. */
export class NativeSessionContexts {
  private readonly key = "dustcode.nativeSessionContexts"
  private readonly bindings: Record<
    string,
    { id: string; directory: string; scope?: Pick<NativeSessionScope, "projectId" | "root" | "worktreeId"> }
  >

  constructor(private readonly state: Pick<Memento, "get" | "update">) {
    const saved = state.get<typeof this.bindings>(this.key, {})
    this.bindings = saved && typeof saved === "object" ? { ...saved } : {}
  }

  save(id: string, directory: string, scope?: Pick<NativeSessionScope, "projectId" | "root" | "worktreeId">): string {
    const placement = scope && { projectId: scope.projectId, root: scope.root, worktreeId: scope.worktreeId }
    const context = createHash("sha256")
      .update(JSON.stringify(placement ? [id, directory, placement] : [id, directory]))
      .digest("hex")
    const binding = this.bindings[context]
    if (binding?.id === id && binding.directory === directory) return context
    this.bindings[context] = { id, directory, ...(placement ? { scope: placement } : {}) }
    void this.state.update(this.key, { ...this.bindings }).then(undefined, (error) => {
      console.error("[Dustcode] Failed to persist native session context:", error)
    })
    return context
  }

  restore(
    state: unknown,
    id: string | undefined,
  ): {
    context?: string
    directory?: string
    unavailable?: boolean
    scope?: Pick<NativeSessionScope, "projectId" | "root" | "worktreeId">
  } {
    if (!state || typeof state !== "object") return {}
    const panel = state as Record<string, unknown>
    if (!id && !Object.hasOwn(panel, "nativeSessionContext")) return {}
    if (id && !Object.hasOwn(panel, "nativeSessionContexts"))
      return Object.hasOwn(panel, "nativeSessionContext") ? { unavailable: true } : {}
    const saved = panel.nativeSessionContexts
    if (id && (!saved || typeof saved !== "object" || !Object.hasOwn(saved, id))) return { unavailable: true }
    const context = id ? (saved as Record<string, unknown>)[id] : panel.nativeSessionContext
    return this.resolve(context, id)
  }

  private resolve(context: unknown, id: string | undefined): ReturnType<NativeSessionContexts["restore"]> {
    const binding = typeof context === "string" ? this.bindings[context] : undefined
    if (!binding || (id && binding.id !== id) || typeof binding.directory !== "string" || !binding.directory) {
      return { unavailable: true }
    }
    if (binding.scope) {
      const scope = binding.scope
      if (
        typeof scope.projectId !== "string" ||
        !scope.projectId ||
        typeof scope.root !== "string" ||
        !scope.root ||
        (scope.worktreeId !== null && (typeof scope.worktreeId !== "string" || !scope.worktreeId))
      )
        return { unavailable: true }
      return { context: context as string, directory: binding.directory, scope }
    }
    if (!id) return { unavailable: true }
    return { context: context as string, directory: binding.directory }
  }
}

/** Explicit sidebar callers pass a provider; native title actions pass an editor URI. */
export function nativeChatTarget<T>(opts: {
  source: unknown
  provider: (value: unknown) => value is T
  resource: boolean
  contextual?: T
  active?: T
  focused?: T
  fallback: T
}): T {
  if (opts.provider(opts.source)) return opts.source
  if (opts.resource) return opts.contextual ?? opts.active ?? opts.fallback
  return opts.focused ?? opts.active ?? opts.fallback
}

/** Uses the live panel map so navigation and native editor moves need no second tab store. */
export async function openNativeSessionTab<
  Owner extends object,
  Panel extends { viewColumn?: number; reveal(column?: number): void },
>(opts: {
  session: Session
  panels: ReadonlyMap<Panel, Owner>
  focused?: Owner
  selected: (owner: Owner) => string | undefined
  directory: (owner: Owner, id: string) => string | undefined
  project?: (owner: Owner) => string | undefined
  create: (session: Session) => { panel: Panel; owner: Owner }
  load: (owner: Owner, session: Session, current: () => boolean) => Promise<void>
}): Promise<void> {
  if (opts.session.current?.() === false) return
  opts.session.scope?.validate(opts.session.id)
  const canonical = (dir: string) => (process.platform === "win32" ? resolve(dir).toLowerCase() : resolve(dir))
  const matches = [...opts.panels].filter(([, owner]) => {
    const reserved = reservations.get(owner)
    if (reserved?.failed && reserved.session.id === opts.session.id) return false
    const scope = reserved?.session.scope
    if (
      scope &&
      opts.session.scope &&
      (scope.generation !== opts.session.scope.generation ||
        scope.worktreeId !== opts.session.scope.worktreeId ||
        canonical(scope.root) !== canonical(opts.session.scope.root))
    )
      return false
    const project = reserved?.session.projectId ?? opts.project?.(owner)
    if (project !== opts.session.projectId) return false
    if (reserved?.pending ? reserved.session.id !== opts.session.id : opts.selected(owner) !== opts.session.id)
      return false
    const dir = reserved?.pending ? reserved.session.directory : opts.directory(owner, opts.session.id)
    return dir !== undefined && canonical(dir) === canonical(opts.session.directory)
  })
  const match = matches.find(([, owner]) => owner === opts.focused) ?? matches.at(0)
  if (match) {
    const [panel, owner] = match
    const reservation = reservations.get(owner)
    if (reservation?.pending) reservation.current = opts.session.current
    panel.reveal(panel.viewColumn)
    return
  }
  const { panel, owner } = opts.create(opts.session)
  const reservation: Reservation = { session: opts.session, pending: true, current: opts.session.current }
  reservations.set(owner, reservation)
  try {
    const current = () =>
      opts.panels.get(panel) === owner &&
      reservations.get(owner) === reservation &&
      reservation.current?.() !== false &&
      opts.selected(owner) === opts.session.id
    await opts.load(owner, opts.session, current)
    if (opts.panels.get(panel) !== owner || reservations.get(owner) !== reservation) return
    if (!current()) {
      reservation.pending = false
      reservation.failed = opts.selected(owner) === opts.session.id
      return
    }
    opts.session.scope?.validate(opts.session.id)
    reservation.pending = false
  } catch (err) {
    if (reservations.get(owner) === reservation) {
      reservation.pending = false
      reservation.failed = opts.selected(owner) === opts.session.id
    }
    throw err
  }
}
