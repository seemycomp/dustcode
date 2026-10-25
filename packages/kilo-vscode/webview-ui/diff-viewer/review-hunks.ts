import { parsePatch, structuredPatch } from "diff"

export function reviewHunks(diff: { file: string; patch?: string; before: string; after: string }, enabled = true) {
  if (!enabled || (!diff.patch && diff.before.length + diff.after.length > 200_000)) return []
  const hunks = diff.patch
    ? parsePatch(diff.patch).flatMap((patch) => patch.hunks)
    : (structuredPatch(diff.file, diff.file, diff.before, diff.after, undefined, undefined, { timeout: 25 })?.hunks ??
      [])
  return hunks.map((hunk) => ({
    line: hunk.newLines > 0 ? hunk.newStart : hunk.oldStart,
    side: hunk.newLines > 0 ? ("additions" as const) : ("deletions" as const),
  }))
}
