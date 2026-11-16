import { existsSync } from "node:fs"
import { basename } from "node:path"
import type { Session } from "@kilocode/sdk/v2/client"
import type {
  AgentManagerOpenDraftInTabRequest,
  AgentManagerOpenSessionInTabRequest,
} from "../../../webview-ui/src/types/messages/agent-manager"
import type { NativeSessionTarget } from "../../kilo-provider/native-session-tabs"
import type { NativeSessionScope } from "../../kilo-provider/options"
import type { AgentHistory } from "../history"
import type { ProjectContext, ProjectInitResult } from "./context"
import type { ProjectContexts } from "./contexts"
import { resolvePlacement } from "./placement"
import { samePath } from "./paths"
import type { ProjectRouteService } from "./route"

export type NativeScopeBinding = Pick<NativeSessionScope, "projectId" | "root" | "directory" | "worktreeId">
type ScopeDeps = {
  contexts: Pick<ProjectContexts, "resolve">
  ready: (ctx: ProjectContext, opts?: { warm?: boolean }) => Promise<ProjectInitResult>
  routes: ProjectRouteService
}

/** Draft creation needs trusted host placement, never a backend session or active-project fallback. */
export function resolveNativeDraft(request: AgentManagerOpenDraftInTabRequest, deps: ScopeDeps): NativeSessionScope {
  const ctx = deps.contexts.resolve(request.projectId)
  if (!ctx) throw new Error("The project is unavailable. Refresh Agent Manager and try again.")
  const directory = request.worktreeId === null ? ctx.root : ctx.peekState()?.getWorktree(request.worktreeId)?.path
  if (!directory) throw new Error("The worktree is unavailable. Refresh Agent Manager and try again.")
  const scope = nativeScope(ctx, directory, request.worktreeId, deps, async () => {
    const result = await deps.ready(ctx, { warm: false })
    if (!result.ok || !result.current) throw new Error("The project is not ready. Refresh Agent Manager and try again.")
    scope.validate()
  })
  return scope
}

/** Rehydrate the exact saved placement, including a blank New Task, without loading an old session. */
export async function restoreNativeScope(binding: NativeScopeBinding, deps: ScopeDeps): Promise<NativeSessionScope> {
  const ctx = deps.contexts.resolve(binding.projectId)
  if (!ctx || !samePath(ctx.root, binding.root)) throw new Error("The saved chat project is unavailable.")
  const result = await deps.ready(ctx, { warm: false })
  if (!result.ok || !result.current) throw new Error("The saved chat project is not ready.")
  return nativeScope(ctx, binding.directory, binding.worktreeId, deps)
}

/** Resolve only host placement. Backend directory metadata is checked by the existing history validator. */
export async function resolveNativeSession(
  request: AgentManagerOpenSessionInTabRequest,
  deps: {
    contexts: Pick<ProjectContexts, "resolve">
    ready: (ctx: ProjectContext, opts?: { warm?: boolean }) => Promise<ProjectInitResult>
    history: AgentHistory
    routes: ProjectRouteService
  },
): Promise<NativeSessionTarget & { ctx: ProjectContext; info: Session }> {
  const ref = Object.freeze({ projectId: request.projectId, sessionId: request.sessionId })
  const ctx = deps.contexts.resolve(ref.projectId)
  if (!ctx) throw new Error("The project is unavailable.")
  const result = await deps.ready(ctx, { warm: false })
  if (!result.ok || !result.current) throw new Error("The project is not ready.")
  const generation = ctx.generation
  const state = ctx.peekState()
  const placement = resolvePlacement(ctx, ref.sessionId)
  const worktreeId = request.worktreeId === undefined ? placement?.worktreeId : request.worktreeId
  if (worktreeId === undefined) throw new Error("This conversation has no trusted project placement.")
  if (placement && placement.worktreeId !== worktreeId)
    throw new Error("This conversation's placement changed. Refresh it before opening.")
  const validated = await deps.history.validate({
    type: "agentManager.openHistorySession",
    ...ref,
    worktreeId,
    requestId: request.requestId ?? "native",
  })
  if (validated.ctx !== ctx || !ctx.isCurrent(generation))
    throw new Error("The project changed while opening this conversation.")
  const directory = validated.directory
  // History-only entries acquire the same persisted placement evidence as existing history opens.
  if (!placement) state?.closeSession(ref.sessionId, worktreeId)
  const scope = nativeScope(ctx, directory, worktreeId, deps)
  deps.routes.registerSession(ref, directory, generation)
  scope.validate(ref.sessionId)
  return Object.freeze({ id: ref.sessionId, projectId: ctx.id, directory, scope, ctx, info: validated.info })
}

function nativeScope(
  ctx: ProjectContext,
  directory: string,
  worktreeId: string | null,
  deps: ScopeDeps,
  ready?: () => Promise<void>,
): NativeSessionScope {
  let generation = ctx.generation
  const state = ctx.stateManager()
  const ref = { projectId: ctx.id }
  available(ctx, directory, worktreeId)
  const scope: NativeSessionScope = Object.freeze({
    projectId: ctx.id,
    root: ctx.root,
    directory,
    worktreeId,
    projectLabel: basename(ctx.root),
    label: worktreeId === null ? "Local" : (state?.getWorktree(worktreeId)?.branch ?? worktreeId),
    get generation() {
      return ctx.generation
    },
    routes: deps.routes,
    ready,
    validate: (id?: string) => {
      if (deps.contexts.resolve(ctx.id) !== ctx || !ctx.isCurrent(ctx.generation) || ctx.missing())
        throw new Error("This conversation's project is no longer available.")
      available(ctx, directory, worktreeId)
      // Accordion suspension cancels manager work, not an already-bound native conversation.
      if (generation !== ctx.generation) {
        hydrate(ctx, deps.routes)
        generation = ctx.generation
      }
      deps.routes.projectRoot(ref, generation)
      if (!id) return
      const assigned = resolvePlacement(ctx, id)
      const routed = deps.routes.trySessionDirectoryFor({ projectId: ctx.id, sessionId: id })
      if (
        !assigned ||
        assigned.worktreeId !== worktreeId ||
        !samePath(assigned.directory, directory) ||
        !routed ||
        !samePath(routed, directory)
      )
        throw new Error("This conversation's placement is missing or changed.")
    },
    register: (id: string) => {
      scope.validate()
      state?.addSession(id, worktreeId)
      deps.routes.registerSession({ projectId: ctx.id, sessionId: id }, directory, generation)
    },
  })
  hydrate(ctx, deps.routes)
  scope.validate()
  return scope
}

function hydrate(ctx: ProjectContext, routes: ProjectRouteService): void {
  routes.registerProject(ctx.id, ctx.root, ctx.generation)
  for (const tree of ctx.peekState()?.getWorktrees() ?? []) {
    if (tree.path) routes.registerWorktree({ projectId: ctx.id, worktreeId: tree.id }, tree.path, ctx.generation)
  }
  for (const id of ctx.peekState()?.sessionPlacements().keys() ?? []) {
    const placement = resolvePlacement(ctx, id)
    if (placement) routes.registerSession({ projectId: ctx.id, sessionId: id }, placement.directory, ctx.generation)
  }
}

function available(ctx: ProjectContext, directory: string, id: string | null): void {
  const current = id === null ? ctx.root : ctx.peekState()?.getWorktree(id)?.path
  const health = ctx.report?.entries.find((entry) => entry.id === id)?.health
  if (
    !current ||
    !samePath(current, directory) ||
    !existsSync(directory) ||
    (id !== null &&
      (ctx.stale.has(id) || health === "absent-restorable" || health === "absent-gone" || health === "unregistered"))
  )
    throw new Error("This conversation's working directory is missing or changed.")
}
