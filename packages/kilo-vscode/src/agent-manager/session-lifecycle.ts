import type { Session } from "@kilocode/sdk/v2/client"
import { sessionToWebview } from "../kilo-provider-utils"
import { resolvePlacement } from "./project/placement"
import type { ProjectContexts } from "./project/contexts"
import type { AgentManagerOutMessage } from "./types"
import { samePath } from "./project/paths"
import type { ProjectContext } from "./project/context"
import type { ProjectMessageDeps } from "./project/messages"

type Deps = {
  busy: Set<string>
  removed: Set<string>
  contexts: ProjectContexts
  closeBrowser?: (sessionId: string) => void
  post: (message: AgentManagerOutMessage) => void
  relocate?: (projectId: string, sessionId: string, directory: string, generation: number) => void
  transfer?: Pick<NonNullable<ProjectMessageDeps["transfer"]>, "sessions" | "closeBrowser">
}

type Event = { type?: string; properties?: { info?: Session; sessionID?: string } }

function remove(id: string, deps: Deps): void {
  deps.removed.add(id)
  deps.busy.delete(id)
  const close = deps.closeBrowser ?? deps.transfer?.closeBrowser
  close?.(id)
  deps.transfer?.sessions()?.clearSessionDirectory(id)
  for (const ctx of deps.contexts.values()) {
    const known = ctx.hasLiveSession(id)
    ctx.peekState()?.forgetSession(id)
    deps.transfer?.sessions()?.unregisterSessionRoute?.({ projectId: ctx.id, sessionId: id })
    if (!known) continue
    ctx.removeLiveSession(id)
    deps.post({ type: "agentManager.projectSessions", projectId: ctx.id, sessions: [...ctx.sessions()] })
  }
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

function upsert(info: Session, deps: Deps): void {
  if (deps.removed.has(info.id)) return
  const dir = info.directory
  if (!info.time || !dir) return
  const ctx =
    [...deps.contexts.values()].find((ctx) => ctx.peekState()?.sessionPlacement(info.id) !== undefined) ??
    deps.contexts.byDirectory(dir)
  if (!ctx || ctx.lifecycle !== "ready") return
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

export function handleSessionLifecycle(event: unknown, deps: Deps): void {
  const ev = event as Event
  if (ev.type === "session.error") {
    if (ev.properties?.sessionID) deps.busy.delete(ev.properties.sessionID)
    return
  }
  if (ev.type === "session.deleted") {
    const id = ev.properties?.sessionID ?? ev.properties?.info?.id
    if (id) remove(id, deps)
    return
  }
  const info = ev.properties?.info
  if (!info) return
  if (ev.type === "session.created") deps.removed.delete(info.id)
  upsert(info, deps)
}
