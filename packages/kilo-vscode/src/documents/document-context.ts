export type DocumentContext = { sessionId?: string; directory?: string }

/** Recover a retained directory when a replayed session no longer supplies one. */
export function resolveDocumentDirectory(
  contexts: ReadonlyMap<string, DocumentContext>,
  currentKey: string,
  sessionId?: string,
  directory?: string,
): string | undefined {
  if (directory) return directory
  if (sessionId) {
    for (const context of contexts.values()) {
      if (context.sessionId === sessionId && context.directory) return context.directory
    }
  }
  return contexts.get(currentKey)?.directory
}
