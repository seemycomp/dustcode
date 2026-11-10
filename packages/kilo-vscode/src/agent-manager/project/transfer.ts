import type { SessionTransferRequest, SessionTransferReply } from "../../shared/session-transfer"
import type { ProjectMessageDeps } from "./messages"
import { samePath } from "./paths"
import { sessionToWebview } from "../../kilo-provider-utils"
import type { ProjectContext } from "./context"
import { exec } from "../../util/process"

type Operation = {
  input: {
    operationID: string
    action: "move" | "copy"
    projectID: string
    sourceSessionID: string
    sourceDirectory: string
    targetDirectory: string
    selectedFiles?: string[]
  }
  project: ProjectContext
  generation: number
  target: string
  preview: { revision: string; fingerprint: string }
  pending?: Promise<void>
}
const operations = new WeakMap<ProjectMessageDeps["contexts"], Map<string, Operation>>()

function cache(contexts: ProjectMessageDeps["contexts"]) {
  const current = operations.get(contexts)
  if (current) return current
  const next = new Map<string, Operation>()
  operations.set(contexts, next)
  return next
}

/** This boundary receives IDs only. Neither source nor target paths come from the webview. */
function valid(
  current: Operation | undefined,
  ctx: ProjectContext,
  request: SessionTransferRequest,
): current is Operation {
  return (
    !!current &&
    current.project === ctx &&
    ctx.isCurrent(current.generation) &&
    current.input.sourceSessionID === request.sourceSessionId &&
    current.input.action === request.action
  )
}

function destination(ctx: ProjectContext, info: import("@kilocode/sdk/v2/client").Session, project?: string) {
  const tree = ctx.peekState()?.findWorktreeByPath(info.directory)
  if (!tree || (project && info.projectID !== project) || info.parentID != null)
    throw new Error("The committed conversation moved again or is no longer available. Refresh its history.")
  return tree
}

function body(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined
  const data =
    cause && typeof cause === "object" && "body" in cause
      ? cause.body
      : error && typeof error === "object" && "data" in error
        ? error.data
        : error
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined
}

function failure(error: unknown) {
  const data = body(error)
  const paths = Array.isArray(data?.paths)
    ? data.paths.filter((value): value is string => typeof value === "string")
    : []
  const message =
    typeof data?.message === "string" ? data.message : "Session transfer failed. Retry to resolve the operation result."
  const code = typeof data?.code === "string" ? data.code : undefined
  return { error: message, paths, code }
}

function assertCurrent(ctx: ProjectContext, generation: number, message: string): void {
  if (!ctx.isCurrent(generation)) throw new Error(message)
}

function perform(
  client: Awaited<ReturnType<NonNullable<ProjectMessageDeps["transfer"]>["client"]>>,
  request: SessionTransferRequest,
  directory: string,
) {
  const input = { operationID: request.operationID, directory }
  return request.phase === "status"
    ? client.kilocode.sessionTransfer.status(input, { throwOnError: true })
    : client.kilocode.sessionTransfer.commit(input, { throwOnError: true })
}

async function reconcile(
  request: SessionTransferRequest,
  ctx: ProjectContext,
  deps: ProjectMessageDeps,
  result: NonNullable<SessionTransferReply["result"]> & { sourceSessionID: string },
  generation: number,
  project?: string,
) {
  if (
    !ctx.isCurrent(generation) ||
    result.sourceSessionID !== request.sourceSessionId ||
    result.action !== request.action
  )
    throw new Error("The transfer result does not match the current project selection.")
  const hooks = deps.transfer!
  const client = await hooks.client(ctx.root)
  const info = await client.session.get(
    { sessionID: result.sessionID, directory: result.directory },
    { throwOnError: true },
  )
  assertCurrent(
    ctx,
    generation,
    "The project changed while resolving the committed transfer. Its receipt remains available.",
  )
  const actual = destination(ctx, info.data, project)
  const state = ctx.peekState()!
  state.transferSession(info.data.id, actual.id, result.action === "move")
  assertCurrent(
    ctx,
    generation,
    "The project changed while publishing the committed transfer. Its receipt remains available.",
  )
  await state.flush()
  assertCurrent(
    ctx,
    generation,
    "The project changed while publishing the committed transfer. Its receipt remains available.",
  )
  hooks.closeBrowser(info.data.id)
  hooks.sessions()?.clearSessionDirectory(info.data.id)
  hooks.sessions()?.registerSession(info.data)
  hooks.sessions()?.registerSessionRoute?.({ projectId: ctx.id, sessionId: info.data.id }, actual.path, ctx.generation)
  ctx.upsertSession({ ...sessionToWebview(info.data), parentID: null, worktreeId: actual.id })
  ctx.invalidateSessions()
  deps.history?.event({ type: "session.updated", properties: { info: info.data } })
  deps.pushState?.(ctx)
  deps.post({ type: "agentManager.projectSessions", projectId: ctx.id, sessions: [...ctx.sessions()] })
  state.clearPendingTransfer(request.operationID)
  await state.flush()
  return { sessionID: info.data.id, directory: actual.path, action: request.action }
}

export async function handleTransfer(request: SessionTransferRequest, deps: ProjectMessageDeps): Promise<void> {
  const reply = (value: Partial<SessionTransferReply>) =>
    deps.post({
      type: "agentManager.sessionTransferResult",
      phase: request.phase,
      projectId: request.projectId,
      sourceSessionId: request.sourceSessionId,
      requestId: request.requestId,
      operationID: request.operationID,
      ...value,
    })
  try {
    const hooks = deps.transfer
    if (!hooks) throw new Error("Session transfer is unavailable.")
    const ctx = deps.contexts.resolve(request.projectId)
    if (!ctx || !deps.history) throw new Error("The project is unavailable.")
    const ready = await deps.ready(ctx, { warm: false })
    if (!ready.ok || !ready.current) throw new Error("The project is not ready.")
    const state = ctx.peekState()
    if (!state) throw new Error("The project state is unavailable.")
    if (request.phase === "targets") {
      const source = await deps.history.validate({
        type: "agentManager.openHistorySession",
        projectId: ctx.id,
        worktreeId: request.sourceWorktreeId,
        sessionId: request.sourceSessionId,
        requestId: request.requestId,
      })
      const targets = state
        .getWorktrees()
        .filter(
          (tree) =>
            tree.id !== request.sourceWorktreeId &&
            tree.path &&
            !samePath(tree.path, source.directory) &&
            !ctx.report?.entries.some((entry) => entry.id === tree.id && entry.health !== "ok"),
        )
      const client = await hooks.client(ctx.root)
      const diffs = await client.worktree.diffSummary(
        { directory: source.directory, base: "HEAD" },
        { throwOnError: true },
      )
      reply({
        head: (await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: source.directory })).stdout.trim(),
        targets: targets.map((tree) => ({ id: tree.id, name: tree.label || tree.branch, path: tree.path })),
        files: diffs.data.map((file) => file.file).filter((file): file is string => !!file),
      })
      return
    }
    const map = cache(deps.contexts)
    const current = map.get(request.operationID)
    const client = await hooks.client(ctx.root)
    if (request.phase === "preview") {
      const source = await deps.history.validate({
        type: "agentManager.openHistorySession",
        projectId: ctx.id,
        worktreeId: request.sourceWorktreeId,
        sessionId: request.sourceSessionId,
        requestId: request.requestId,
      })
      const target = request.create
        ? await ctx.run(() => hooks.create(ctx, source.directory, request.branch))
        : request.targetWorktreeId && state.getWorktree(request.targetWorktreeId)
      if (!target || target.id === request.sourceWorktreeId || samePath(target.path, source.directory))
        throw new Error("Choose a different worktree.")
      const generation = ctx.generation
      const input = {
        operationID: request.operationID,
        action: request.action,
        projectID: source.info.projectID,
        sourceSessionID: source.info.id,
        sourceDirectory: source.directory,
        targetDirectory: target.path,
        selectedFiles: request.selectedFiles,
      }
      const result = await client.kilocode.sessionTransfer.preview(
        { ...input, directory: ctx.root },
        { throwOnError: true },
      )
      assertCurrent(ctx, generation, "The project changed during preview.")
      map.set(request.operationID, { input, project: ctx, generation, target: target.id, preview: result.data })
      state.setPendingTransfer({
        operationID: request.operationID,
        projectID: ctx.id,
        sourceSessionID: request.sourceSessionId,
        sourceWorktreeId: request.sourceWorktreeId,
        action: request.action,
        targetWorktreeId: target.id,
      })
      await state.persistTransfers()
      assertCurrent(ctx, generation, "The project changed while publishing the transfer preview.")
      reply({
        preview: result.data,
        targetWorktreeId: target.id,
        targets: [{ id: target.id, name: target.label || target.branch, path: target.path }],
      })
      return
    }
    if (!current) {
      const generation = ctx.generation
      const result = await perform(client, request, ctx.root)
      reply({ result: await ctx.run(() => reconcile(request, ctx, deps, result.data, generation)) })
      return
    }
    if (!valid(current, ctx, request)) throw new Error("The transfer preview expired. Review it again.")
    if (current.pending) {
      await current.pending
      return handleTransfer({ ...request, phase: "status" }, deps)
    }
    const run = async () => {
      const target = state.getWorktree(current.target)
      if (!target || !samePath(target.path, current.input.targetDirectory))
        throw new Error("The target worktree changed.")
      const result = await perform(client, request, ctx.root)
      assertCurrent(ctx, current.generation, "The transfer committed, but the project changed. Refresh its history.")
      reply({ result: await reconcile(request, ctx, deps, result.data, current.generation, current.input.projectID) })
    }
    current.pending = ctx.run(run).finally(() => {
      current.pending = undefined
    })
    await current.pending
  } catch (error) {
    deps.log("Session transfer failed:", error)
    reply(failure(error))
  }
}

export async function reconnectTransfers(deps: ProjectMessageDeps): Promise<void> {
  for (const project of deps.contexts.snapshots()) {
    const ctx = deps.contexts.resolve(project.id)
    if (!ctx) continue
    const ready = await deps.ready(ctx, { warm: false })
    if (!ready.ok || !ready.current) continue
    const state = ctx.peekState()
    if (!state) continue
    for (const item of state.getPendingTransfers()) {
      await handleTransfer(
        {
          type: "agentManager.sessionTransfer",
          phase: "status",
          projectId: item.projectID,
          sourceSessionId: item.sourceSessionID,
          sourceWorktreeId: item.sourceWorktreeId,
          requestId: `reconnect-${item.operationID}`,
          operationID: item.operationID,
          action: item.action,
          targetWorktreeId: item.targetWorktreeId,
        },
        deps,
      )
    }
  }
}
