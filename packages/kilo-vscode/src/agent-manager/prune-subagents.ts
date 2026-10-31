import type { SessionProvider } from "./host"
import type { ProjectContext } from "./project/context"

export async function pruneSubagents(
  ctx: ProjectContext | undefined,
  sessions: Pick<SessionProvider, "getSessionInfo" | "clearSessionDirectory"> | undefined,
  id: string,
  push: (ctx: ProjectContext) => void,
  log: (message: string) => void,
): Promise<void> {
  const state = ctx?.peekState()
  const get = sessions?.getSessionInfo
  if (!ctx || !state?.getSession(id) || !sessions || !get) return
  const generation = ctx.generation
  const info = await get(id).catch((err: unknown) => {
    log(`Failed to validate managed session ${id}: ${err}`)
    return undefined
  })
  if (!ctx.isCurrent(generation) || !state.getSession(id) || info?.parentID == null) return
  state.removeSession(id)
  sessions.clearSessionDirectory(id)
  log(`Removed subagent session ${id} from managed state`)
  push(ctx)
}
