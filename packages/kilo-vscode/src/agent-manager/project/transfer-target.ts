import type { ProjectContext } from "./context"
import type { AgentManagerOutMessage } from "../types"
import { createWorktreeOnDisk } from "../worktree-create"
import { copyEnvFiles } from "../env-copy"
import { SetupScriptRunner, type RunTask } from "../SetupScriptRunner"
import { exec } from "../../util/process"

/** No session is created until setup succeeds and backend transfer preflight passes. */
export async function createTransferTarget(
  ctx: ProjectContext,
  input: {
    run: (id: string) => RunTask
    post: (message: AgentManagerOutMessage) => void
    push: () => void
    log: (...args: unknown[]) => void
    source: string
    branch?: string
  },
) {
  const head = (await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: input.source })).stdout.trim()
  const created = await createWorktreeOnDisk(
    {
      getWorktreeManager: () => ctx.worktreeManager(),
      getStateManager: () => ctx.peekState(),
      postToWebview: input.post,
      capture: () => {},
      pushState: input.push,
      log: input.log,
    },
    { name: "conversation-transfer", baseRef: head, branchName: input.branch },
  )
  if (!created) throw new Error("A new worktree could not be created. The source was left unchanged.")
  const tree = created.worktree
  const cleanup = async () => {
    const state = ctx.peekState()
    if (!state || state.getSessions().some((session) => session.worktreeId === tree.id)) return false
    const active = state.getActiveTarget()
    if (active?.kind === "worktree" && active.worktreeId === tree.id) return false
    const branch = (await exec("git", ["branch", "--show-current"], { cwd: tree.path })).stdout.trim()
    const current = (await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: tree.path })).stdout.trim()
    if (current !== head || branch !== tree.branch) return false
    const status = await exec("git", ["status", "--porcelain", "--untracked-files=all", "--ignored"], {
      cwd: tree.path,
    })
    if (status.stdout.trim()) return false
    await ctx.worktreeManager().removeWorktree(tree.path, tree.branch)
    state.removeWorktree(tree.id)
    await state.flush()
    return true
  }
  await copyEnvFiles(ctx.root, tree.path, (message) => input.log(message))
  let failure: string | undefined
  const runner = new SetupScriptRunner(
    (message) => input.log(message),
    ctx.setupService(),
    async (config) => {
      const code = await input.run(tree.id)(config)
      if (code !== 0) throw new Error(`Setup did not complete successfully (${code ?? "unknown exit code"})`)
      return code
    },
    (message) => {
      failure = message
    },
  )
  await runner.runIfConfigured({ worktreePath: tree.path, repoPath: ctx.root })
  if (failure) {
    const removed = await cleanup()
    throw new Error(
      removed
        ? `Setup failed and the unused worktree was removed: ${failure}`
        : `The new worktree was kept for inspection, but setup failed: ${failure}`,
    )
  }
  if ((await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: input.source })).stdout.trim() !== head) {
    const removed = await cleanup()
    throw new Error(
      removed
        ? "Source HEAD changed during setup; the unused worktree was removed."
        : "Source HEAD changed during setup. The new worktree was kept; review the destination again.",
    )
  }
  await ctx.peekState()?.flush()
  return tree
}
