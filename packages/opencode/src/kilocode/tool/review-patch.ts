import { createTwoFilesPatch } from "diff"

// Machine-applicable patches retain indentation and line endings, unlike display diffs.
export function reviewPatch(file: string, before: string, after: string) {
  const limit = 1024 * 1024
  if (Buffer.byteLength(before) + Buffer.byteLength(after) > limit) return ""
  const patch = createTwoFilesPatch(file, file, before, after, undefined, undefined, { timeout: 100 })
  return patch && Buffer.byteLength(patch) <= limit ? patch : ""
}

export function refreshReviewPatches(
  files: Array<{ rawPatch: string }>,
  changes: Array<{ filePath: string; oldContent: string; newContent: string }>,
) {
  files.forEach((file, index) => {
    const change = changes.at(index)!
    file.rawPatch = reviewPatch(change.filePath, change.oldContent, change.newContent)
  })
}
