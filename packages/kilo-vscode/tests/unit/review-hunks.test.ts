import { describe, expect, it } from "bun:test"
import { reviewHunks } from "../../webview-ui/diff-viewer/review-hunks"

describe("review hunk navigation", () => {
  it("preserves source line numbers and uses the deletion side for removed hunks", () => {
    expect(
      reviewHunks({
        file: "a.ts",
        before: "",
        after: "",
        patch: "--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +10,0 @@\n-a\n-b\n@@ -30 +28,2 @@\n-old\n+new\n+extra\n",
      }),
    ).toEqual([
      { line: 10, side: "deletions" },
      { line: 28, side: "additions" },
    ])
  })

  it("derives hunks for snapshot contents without a patch", () => {
    expect(reviewHunks({ file: "a.ts", before: "a\n", after: "b\n" })).toEqual([{ line: 1, side: "additions" }])
    expect(reviewHunks({ file: "a.ts", before: "a\n", after: "a\n" })).toEqual([])
  })

  it("does not inspect inactive content and bounds snapshot work", () => {
    expect(
      reviewHunks(
        {
          file: "a.ts",
          get before(): string {
            throw new Error("eager read")
          },
          after: "",
        },
        false,
      ),
    ).toEqual([])
    expect(reviewHunks({ file: "large.ts", before: "a".repeat(200_001), after: "b" })).toEqual([])
  })
})
