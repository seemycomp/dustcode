/** Preserve an explicit native tab identity instead of falling back to a different saved conversation. */
export function restoredNativeSession(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return
  const saved = state as Record<string, unknown>
  const valid = (id: unknown): id is string =>
    typeof id === "string" && !!id && !id.startsWith("sidebar-pending:") && !id.startsWith("cloud:")
  if ("sidebarActiveSessionTabID" in saved) {
    return valid(saved.sidebarActiveSessionTabID) ? saved.sidebarActiveSessionTabID : undefined
  }
  return Array.isArray(saved.sidebarSessionTabIDs) ? saved.sidebarSessionTabIDs.find(valid) : undefined
}
