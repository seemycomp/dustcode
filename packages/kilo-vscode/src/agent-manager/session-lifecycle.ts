import type { Session } from "@kilocode/sdk/v2/client"
import { sessionToWebview } from "../kilo-provider-utils"
import { resolvePlacement } from "./project/placement"
import type { ProjectContexts } from "./project/contexts"
import type { AgentManagerOutMessage } from "./types"
import { samePath } from "./project/paths"
import type { ProjectContext } from "./project/context"
import type { ProjectMessageDeps } from "./project/messages"
import type { SessionProvider } from "./host"
import type { AgentHistory } from "./history"

type Deps = {
  busy: Set<string>
  removed: Set<string>
  contexts: ProjectContexts
  history?: Pick<AgentHistory, "event">
  closeBrowser?: (sessionId: string) => void
  post: (message: AgentManagerOutMessage) => void
  relocate?: (projectId: string, sessionId: string, directory: string, generation: number) => void
  transfer?: Pick<NonNullable<ProjectMessageDeps["transfer"]>, "sessions" | "closeBrowser">
}

type Event = { type?: string; properties?: { info?: Session; sessionID?: string } }

function known(ctx: ProjectContext, id: string, sessions?: SessionProvider): boolean {
  return (
    ctx.hasLiveSession(id) ||
    ctx.peekState()?.sessionPlacement(id) !== undefined ||
    sessions?.routeSessionDirectoryFor?.({ projectId: ctx.id, sessionId: id }) !== undefined
  )
}

function remove(id: string, deps: Deps, projectId: string): void {
  const sessions = deps.transfer?.sessions()
  deps.removed.add(JSON.stringify([projectId, id]))
  // Raw-ID resources are shared; a qualified deletion cannot clear another owner's state.
  if (![...deps.contexts.values()].some((ctx) => ctx.id !== projectId && known(ctx, id, sessions))) {
    deps.removed.add(id)
    deps.busy.delete(id)
    const close = deps.closeBrowser ?? deps.transfer?.closeBrowser
    close?.(id)
    sessions?.clearSessionDirectory(id)
  }
  for (const ctx of deps.contexts.values()) {
    if (ctx.id !== projectId) continue
    const known = ctx.hasLiveSession(id)
    ctx.peekState()?.forgetSession(id)
    deps.transfer?.sessions()?.unregisterSessionRoute?.({ projectId: ctx.id, sessionId: id })
    if (!known) continue
    ctx.removeLiveSession(id)
    deps.post({ type: "agentManager.projectSessions", projectId: ctx.id, sessions: [...ctx.sessions()] })
  }
}

/** An event directory is authoritative; missing directories require unique known membership. */
export function sessionProject(
  id: string,
  directory: string | undefined,
  contexts: ProjectContexts,
  sessions?: SessionProvider,
  removed?: ReadonlySet<string>,
): string | undefined {
  const owners = [...contexts.values()].filter((ctx) => {
    if (!directory) return known(ctx, id, sessions) || removed?.has(JSON.stringify([ctx.id, id]))
    const route = sessions?.routeSessionDirectoryFor?.({ projectId: ctx.id, sessionId: id })
    return (
      samePath(ctx.root, directory) ||
      ctx
        .peekState()
        ?.getWorktrees()
        .some((tree) => tree.path && samePath(tree.path, directory)) ||
      (route !== undefined && samePath(route, directory))
    )
  })
  if (owners.length === 1) return owners.at(0)?.id
}

function reroute(info: Session, ctx: ProjectContext, deps: Deps): void {
  const provider = deps.transfer?.sessions()
  provider?.clearSessionDirectory(info.id)
  provider?.registerSessionRoute?.({ projectId: ctx.id, sessionId: info.id }, info.directory, ctx.generation)
  deps.relocate?.(ctx.id, info.id, info.directory, ctx.generation)
}

function transferred(info: Session, ctx: ProjectContext, deps: Deps): void {
  const epoch = info.metadata?.["kilocode.transfer"]
  if (
    !epoch ||
    typeof epoch !== "object" ||
    !("directory" in epoch) ||
    typeof epoch.directory !== "string" ||
    !samePath(epoch.directory, info.directory)
  )
    return
  const state = ctx.peekState()
  const tree = state?.findWorktreeByPath(info.directory)
  if (!tree || state?.sessionPlacement(info.id) === tree.id) return
  if (info.parentID != null) {
    reroute(info, ctx, deps)
    return
  }
  state?.transferSession(info.id, tree.id)
  const close = deps.closeBrowser ?? deps.transfer?.closeBrowser
  close?.(info.id)
  reroute(info, ctx, deps)
}

function upsert(info: Session, deps: Deps, projectId?: string): void {
  if (deps.removed.has(info.id)) return
  const dir = info.directory
  if (!info.time || !dir) return
  const ctx = projectId
    ? [...deps.contexts.values()].find((ctx) => ctx.id === projectId)
    : ([...deps.contexts.values()].find((ctx) => ctx.peekState()?.sessionPlacement(info.id) !== undefined) ??
      deps.contexts.byDirectory(dir))
  if (!ctx || ctx.lifecycle !== "ready") return
  if (deps.removed.has(JSON.stringify([ctx.id, info.id]))) return
  const previous = ctx.sessions().find((session) => session.id === info.id)
  if (previous && Date.parse(previous.updatedAt) > info.time.updated) return
  transferred(info, ctx, deps)
  if (info.parentID !== undefined && info.parentID !== null) return
  const placement = resolvePlacement(ctx, info.id, dir)
  if (!placement) return
  ctx.upsertSession({ ...sessionToWebview(info), worktreeId: placement.worktreeId })
  ctx.invalidateSessions()
  deps.post({ type: "agentManager.projectSessions", projectId: ctx.id, sessions: [...ctx.sessions()] })
}

export function handleSessionLifecycle(event: unknown, deps: Deps, directory?: string): void {
  const ev = event as Event
  if (ev.type === "session.error") {
    if (ev.properties?.sessionID) deps.busy.delete(ev.properties.sessionID)
    return
  }
  const info = ev.properties?.info
  const id = ev.properties?.sessionID ?? info?.id
  const owner = id
    ? sessionProject(id, directory ?? info?.directory, deps.contexts, deps.transfer?.sessions(), deps.removed)
    : undefined
  if (ev.type === "session.deleted") {
    if (!id || !owner) return
    remove(id, deps, owner)
    deps.history?.event(event, owner)
    return
  }
  if (!info) return
  if (ev.type === "session.created") {
    deps.removed.delete(info.id)
    if (owner) deps.removed.delete(JSON.stringify([owner, info.id]))
  }
  upsert(info, deps, owner)
  deps.history?.event(event, owner)
}
