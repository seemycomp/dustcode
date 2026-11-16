import type { AgentManagerSidebarTarget, WebviewMessage } from "../src/types/messages"

/** Native activation is user intent, not a side effect of management selection. */
export function createNativeChat(post: (message: WebviewMessage) => void) {
  const additions = new Map<string, { project: string; worktree: string; exclusive: boolean }>()
  const forks = new Map<string, number>()
  const worktrees = new Map<string, { seen: Set<string>; count: number }>()
  const key = (project: string, id: string) => JSON.stringify([project, id])
  const consume = (pending: Map<string, number>, id: string) => {
    const count = pending.get(id)
    if (!count) return false
    if (count === 1) pending.delete(id)
    else pending.set(id, count - 1)
    return true
  }
  const open = (projectId: string | undefined, sessionId: string) => {
    if (!projectId) return
    post({ type: "agentManager.openSessionInTab", projectId, sessionId })
  }
  const settle = (project: string | undefined, worktree: string | undefined, id: string | undefined) => {
    if (!id) return
    const pending = additions.get(id)
    if (!pending || pending.project !== project || pending.worktree !== worktree) return
    additions.delete(id)
    return pending
  }
  return {
    open,
    draft: (projectId: string, worktreeId: string | null) =>
      post({ type: "agentManager.openDraftInTab", projectId, worktreeId }),
    activate: (target: AgentManagerSidebarTarget) => {
      if (target.kind === "session") open(target.projectId, target.sessionId)
    },
    add: (project: string | undefined, worktree: string, exclusive = false) => {
      if (!project) return
      const requestId = crypto.randomUUID()
      additions.set(requestId, { project, worktree, exclusive })
      post({ type: "agentManager.addSessionToWorktree", projectId: project, worktreeId: worktree, requestId })
      return requestId
    },
    added: (project: string | undefined, worktree: string, session: string, requestId?: string) => {
      const pending = settle(project, worktree, requestId)
      if (!pending) return
      open(project, session)
      return pending.exclusive
    },
    failed: (project: string | undefined, worktree: string | undefined, requestId?: string) =>
      settle(project, worktree, requestId),
    fork: (project: string | undefined, session: string) => {
      if (!project) return
      const id = key(project, session)
      forks.set(id, (forks.get(id) ?? 0) + 1)
    },
    forked: (project: string | undefined, source: string, session: string) => {
      if (project && consume(forks, key(project, source))) open(project, session)
    },
    create: (project: string, existing: string[], count = 1) =>
      worktrees.set(project, { seen: new Set(existing), count }),
    setup: (project: string | undefined, worktree: string | undefined, session: string | undefined, status: string) => {
      if (!project) return
      const pending = worktrees.get(project)
      if (!pending) return
      if (status === "error") return worktrees.delete(project)
      if (status !== "ready" || !worktree || !session || pending.seen.has(worktree)) return
      pending.seen.add(worktree)
      pending.count -= 1
      if (!pending.count) worktrees.delete(project)
      open(project, session)
    },
  }
}
