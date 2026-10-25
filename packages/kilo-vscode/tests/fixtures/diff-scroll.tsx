import assert from "node:assert/strict"
import type { DiffHandle } from "../../../kilo-ui/src/pierre"
import { harness } from "./comment-harness"

const { root, window, mount, wait } = await harness()
const { Diff } = await import("../../../kilo-ui/src/components/diff")
const { processFile } = await import("@pierre/diffs")
root.style.overflowY = "auto"
Object.defineProperty(root, "clientHeight", { value: 200 })
root.getBoundingClientRect = () => new window.DOMRect(0, 50, 500, 200)
root.scrollTop = 40

for (const style of ["unified", "split"] as const) {
  for (const change of ["insertion", "deletion"] as const) {
    const patch =
      change === "insertion"
        ? "--- a/file.txt\n+++ b/file.txt\n@@ -10,5 +10,7 @@\n anchor\n+insert one\n+insert two\n middle\n target\n tail\n end\n"
        : "--- a/file.txt\n+++ b/file.txt\n@@ -10,7 +10,5 @@\n anchor\n-delete one\n-delete two\n middle\n target\n tail\n end\n"
    const metadata = processFile(patch)
    assert.ok(metadata)
    let handle: DiffHandle | undefined
    let offset: number | undefined
    const dispose = mount(() => (
      <Diff
        fileDiff={metadata}
        diffStyle={style}
        virtualized={false}
        visible
        handle={(value) => (handle = value)}
        scrollTo={(value) => (offset = value)}
      />
    ))
    await wait()
    const shadow = root.querySelector("diffs-container")?.shadowRoot
    assert.ok(shadow)
    const rows = Array.from(shadow.querySelectorAll<HTMLElement>("[data-code] [data-line]"))
    assert.ok(rows.length > 0, "Use actual Pierre-rendered line attributes")
    for (const [index, row] of rows.entries()) {
      row.getBoundingClientRect = () => new window.DOMRect(0, 300 + index * 20, 500, 20)
    }

    for (const side of ["additions", "deletions"] as const) {
      for (const [index, text] of ["anchor", "middle", "target", "tail", "end"].entries()) {
        const target = rows.find(
          (row) => row.textContent?.trim() === text && (style === "unified" || row.closest(`[data-${side}]`)),
        )
        assert.ok(target)
        const shift = index > 0 && (change === "insertion") === (side === "additions") ? 2 : 0
        const line = 10 + index + shift
        assert.equal(
          Number(style === "unified" && side === "deletions" ? target.dataset.altLine : target.dataset.line),
          line,
          "Pierre context numbering follows the requested source side",
        )
        offset = undefined
        assert.equal(handle?.scrollToLine(line, side), true)
        assert.equal(
          offset,
          40 + target.getBoundingClientRect().top - 50 - 100 + 10,
          `${style} ${change} ${side} ${text}`,
        )
      }
    }

    const side = change === "insertion" ? "additions" : "deletions"
    const target = rows.find(
      (row) => row.textContent?.trim() === (change === "insertion" ? "insert one" : "delete one"),
    )
    assert.ok(target)
    assert.equal(handle?.scrollToLine(11, side), true, "Changed lines use their own source side")
    assert.equal(offset, 40 + target.getBoundingClientRect().top - 50 - 100 + 10)
    offset = undefined
    assert.equal(handle?.scrollToLine(15, side === "additions" ? "deletions" : "additions"), false)
    assert.equal(offset, undefined, "An opposite-side context number must not resolve an absent source line")
    offset = undefined
    assert.equal(handle?.scrollToLine(999, "additions"), false, "Missing lines do not scroll")
    assert.equal(offset, undefined)
    dispose()
    assert.equal(handle, undefined, "Disposal clears the scrolling handle")
  }
}
window.happyDOM.abort()
