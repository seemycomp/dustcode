import type { ProjectContext } from "./project/context"
import { resolvePlacement } from "./project/placement"
import { samePath } from "./project/paths"
import type { SessionRef } from "./project/route"
import type { Host, SessionProvider } from "./host"

export function abort(
  sessions: Pick<SessionProvider, "getSessionDirectories" | "abortSessions">,
  contexts: Iterable<ProjectContext>,
  ids: Set<string>,
  active: string | undefined,
  host: Pick<Host, "hasNativeSession">,
): Promise<void> {
  const candidates = [...ids, ...(active ? [active] : [])]
  ids.clear()
  return sessions.abortSessions(
    managerSessionIds(
      candidates,
      contexts,
      sessions.getSessionDirectories(),
      (ref, directory) => host.hasNativeSession?.(ref, directory) ?? false,
    ),
  )
}

/** Manager-only attachments keep the existing close-time cancellation policy. */
export function managerSessionIds(
  ids: readonly string[],
  contexts: Iterable<ProjectContext>,
  directories: ReadonlyMap<string, string>,
  attached: (ref: SessionRef, directory: string) => boolean,
): string[] {
  const projects = [...contexts]
  return [...new Set(ids)].filter((id) => {
    const directory = directories.get(id)
    const placements = projects.flatMap((ctx) => {
      const placement = resolvePlacement(ctx, id)
      if (!placement || (directory && !samePath(directory, placement.directory))) return []
      return [{ projectId: ctx.id, sessionId: id, directory: placement.directory }]
    })
    const placement = placements.length === 1 ? placements.at(0) : undefined
    return !placement || !attached(placement, placement.directory)
  })
}
