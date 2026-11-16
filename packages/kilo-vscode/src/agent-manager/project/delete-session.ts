import type { KiloClient } from "@kilocode/sdk/v2/client"
import type { DeleteSessionRequest } from "../../../webview-ui/src/types/messages/webview-messages"
import { stopSessionProcesses } from "../../kilo-provider/background-process"
import type { Host, SessionProvider } from "../host"
import type { ProjectMessageDeps } from "./messages"
import type { SessionRef } from "./route"
import type { ProjectContext } from "./context"
import { resolvePlacement } from "./placement"
import { samePath } from "./paths"

export interface SessionDeletion {
  client: (directory: string) => Promise<KiloClient>
  confirm: Host["confirm"]
  sessions: () => Pick<SessionProvider, "clearSessionDirectory" | "unregisterSessionRoute"> | undefined
  deleted?: (ref: SessionRef) => void
}

const pending = new WeakMap<ProjectMessageDeps, Set<string>>()

/** Qualified history deletion never changes the active project or deletes its worktree. */
export async function deleteHistorySession(request: DeleteSessionRequest, deps: ProjectMessageDeps): Promise<void> {
  const key = JSON.stringify([request.projectId, request.sessionID])
  const inflight = pending.get(deps) ?? new Set<string>()
  if (inflight.has(key)) return
  pending.set(deps, inflight)
  inflight.add(key)
  try {
    if (!deps.history || !deps.deletion) throw new Error("Session deletion is unavailable.")
    if (!request.projectId || (request.worktreeId !== null && typeof request.worktreeId !== "string"))
      throw new Error("The requested project and context are required.")
    const scope = {
      type: "agentManager.openHistorySession" as const,
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      sessionId: request.sessionID,
      requestId: key,
    }
    const target = await deps.history.validate(scope)
    const generation = target.ctx.generation
    const directory = target.info.directory
    const current = () => {
      const placement = resolvePlacement(target.ctx, request.sessionID, directory)
      if (
        deps.contexts.resolve(scope.projectId) !== target.ctx ||
        !target.ctx.isCurrent(generation) ||
        placement?.worktreeId !== scope.worktreeId ||
        !samePath(placement.directory, target.directory)
      )
        throw new Error("The project or conversation context changed. Refresh history before deleting this session.")
    }
    if (
      !(await deps.deletion.confirm(
        `Delete session "${target.info.title || "Untitled"}"? This cannot be undone.`,
        "Delete Session",
      ))
    )
      return
    // Confirmation can outlive a project/worktree change. Revalidate before the destructive request.
    const { ctx, info } = await deps.history.validate(scope)
    current()
    if (!samePath(info.directory, directory)) throw new Error("The conversation directory changed.")
    const client = await deps.deletion.client(info.directory)
    current()
    await stopSessionProcesses(client, info.id, info.directory)
    current()
    await client.session.delete({ sessionID: info.id, directory: info.directory }, { throwOnError: true })
    deps.history.event({ type: "session.deleted", properties: { sessionID: info.id } }, ctx.id)
    forget(ctx, info.id, request.worktreeId)
    deps.deletion.deleted?.({ projectId: ctx.id, sessionId: info.id })
    const sessions = deps.deletion.sessions()
    sessions?.clearSessionDirectory(info.id)
    sessions?.unregisterSessionRoute?.({ projectId: ctx.id, sessionId: info.id })
    deps.post({ type: "sessionDeleted", projectId: ctx.id, worktreeId: request.worktreeId, sessionID: info.id })
    deps.post({ type: "agentManager.projectSessions", projectId: ctx.id, sessions: [...ctx.sessions()] })
    deps.pushState?.(ctx)
  } catch (err) {
    deps.log("Failed to delete history session:", err)
    deps.error(`Failed to delete session: ${err instanceof Error ? err.message : "The backend request failed."}`)
  } finally {
    inflight.delete(key)
  }
}

function forget(ctx: ProjectContext, id: string, worktreeId: string | null): void {
  const state = ctx.peekState()
  state?.forgetSession(id)
  const selected = state?.getActiveTarget()
  if (selected?.kind === "session" && selected.sessionId === id)
    state?.setActiveTarget(
      worktreeId === null ? { projectId: ctx.id, kind: "local" } : { projectId: ctx.id, kind: "worktree", worktreeId },
    )
  ctx.removeLiveSession(id)
}
