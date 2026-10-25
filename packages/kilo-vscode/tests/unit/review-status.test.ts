import { describe, expect, it } from "bun:test"
import {
  pruneReviewStatuses,
  reviewProgress,
  reviewStatus,
  setReviewStatus,
} from "../../webview-ui/diff-viewer/review-status"
import type { WorktreeFileDiff } from "../../webview-ui/src/types/messages"

const diff = (file: string, stamp = "1"): WorktreeFileDiff => ({
  file,
  before: "old\n",
  after: "new\n",
  patch: "@@ -1 +1 @@\n-old\n+new\n",
  additions: 1,
  deletions: 1,
  status: "modified",
  stamp,
})

describe("review status", () => {
  it("tracks accepted files only while their diff revision is unchanged", () => {
    const first = diff("src/a.ts")
    const accepted = setReviewStatus({}, first, "accepted")
    expect(reviewStatus(accepted, first)).toBe("accepted")
    expect(reviewStatus(accepted, diff("src/a.ts", "2"))).toBe("pending")
  })

  it("prunes removed or stale files and reports progress", () => {
    const a = diff("a.ts")
    const b = diff("b.ts")
    const map = setReviewStatus(setReviewStatus({}, a, "accepted"), b, "accepted")
    const next = pruneReviewStatuses(map, [a])
    expect(Object.keys(next)).toEqual(["a.ts"])
    expect(reviewStatus(next, a)).toBe("accepted")
    expect(reviewProgress(next, [a, b])).toEqual({ accepted: 1, total: 2, pending: 1 })
  })

  it("invalidates equal-count edits when the source does not supply stamps", () => {
    const first = { ...diff("a.ts"), stamp: undefined }
    const accepted = setReviewStatus({}, first, "accepted")
    expect(reviewStatus(accepted, { ...first, after: "another\n" })).toBe("pending")
    expect(reviewStatus(accepted, { ...first })).toBe("accepted")
  })

  it("invalidates changed text and patches even with an unchanged stamp", () => {
    const first = diff("a.ts")
    const accepted = setReviewStatus({}, first, "accepted")
    expect(reviewStatus(accepted, { ...first, after: "different\n" })).toBe("pending")
    expect(reviewStatus(accepted, { ...first, patch: "@@ -1 +1 @@\n-old\n+different\n" })).toBe("pending")
  })
})
