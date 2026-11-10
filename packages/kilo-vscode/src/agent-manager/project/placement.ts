import type { ProjectContext } from "./context"
import { samePath } from "./paths"

/** A stored Local assignment must not be confused with absence of an assignment. */
export function resolvePlacement(ctx: ProjectContext, id: string, directory?: string) {
  const state = ctx.peekState()
  const assigned = state?.sessionPlacement(id)
  if (assigned === null) return { worktreeId: null, directory: ctx.root }
  if (assigned !== undefined) {
    const wt = state?.getWorktree(assigned)
    return wt?.path ? { worktreeId: wt.id, directory: wt.path } : undefined
  }
  if (!directory) return
  if (samePath(ctx.root, directory)) return { worktreeId: null, directory: ctx.root }
  const wt = state?.getWorktrees().find((wt) => wt.path && samePath(wt.path, directory))
  if (wt) return { worktreeId: wt.id, directory: wt.path }
}
