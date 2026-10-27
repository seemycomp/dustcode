import assert from "node:assert/strict"
import type { WorktreeFileDiff } from "../../webview-ui/src/types/messages"
import { harness } from "./comment-harness"

const { root, window, mount, wait } = await harness()
const { createSignal } = await import("solid-js")
const { Accordion } = await import("@kilocode/kilo-ui/accordion")
const { ReviewDiffItem } = await import("../../webview-ui/diff-viewer/ReviewDiffItem")
const { sessionHunk } = await import("../../webview-ui/diff-viewer/review-session-diff")
const { processFile } = await import("@pierre/diffs")
const before = Array.from({ length: 160 }, (_, index) => `line ${index + 1}\n`).join("")
const after = before.replace("line 40\n", "changed 40\n").replace("line 120\n", "changed 120\n")
const original: WorktreeFileDiff = {
  file: "src/example.txt",
  before,
  after,
  patch:
    "--- a/src/example.txt\n+++ b/src/example.txt\n@@ -39,3 +39,3 @@\n line 39\n-line 40\n+changed 40\n line 41\n@@ -119,3 +119,3 @@\n line 119\n-line 120\n+changed 120\n line 121\n",
  hunks: [{ id: "first" }, { id: "second" }],
  rejectable: true,
  additions: 2,
  deletions: 2,
}
const [diff, setDiff] = createSignal(original)
const [open, setOpen] = createSignal<string[]>([original.file])
const [visible, setVisible] = createSignal(false)
const [active, setActive] = createSignal(false)
const [busy, setBusy] = createSignal(false)
const [style, setStyle] = createSignal<"unified" | "split">("unified")
const decisions: Array<[string, string | undefined]> = []
const files: string[] = []
let added = 0
const dispose = mount(() => (
  <Accordion multiple value={open()} onChange={setOpen}>
    <ReviewDiffItem
      diff={diff()}
      open={open}
      viewport={{ ref: () => undefined, visible, intersects: visible }}
      active={active}
      loading={() => false}
      comments={() => 0}
      diffStyle={style}
      markdownRender={() => false}
      annotations={() => [
        {
          side: "additions",
          lineNumber: 40,
          metadata: { type: "draft", file: original.file, side: "additions", line: 40, comment: null },
        },
      ]}
      renderAnnotation={() => {
        const node = document.createElement("div")
        node.className = "fixture-comment"
        node.textContent = "Existing comment"
        return node
      }}
      onGutterUtilityClick={() => undefined}
      onOpenFile={(file) => files.push(file)}
      reverting={() => false}
      canComment={() => true}
      sessionReview
      sessionBusy={busy()}
      onAddFileToChat={() => added++}
      onSessionDecision={(action, hunk) => decisions.push([action, hunk])}
    />
  </Accordion>
))
const button = (label: string, scope: ParentNode = root) => {
  const found = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  assert.ok(found, `Missing button ${label}`)
  return found
}
await wait()
assert.equal(root.querySelector("button button"), null, "Session headers cannot nest action buttons in the trigger")
button("Add file to chat").click()
assert.equal(added, 1)
assert.deepEqual(open(), [original.file], "Header actions do not collapse the diff")
root.querySelector<HTMLButtonElement>(".session-review-file")!.click()
assert.deepEqual(files, [original.file])
assert.deepEqual(open(), [original.file], "Filename opens the file without collapsing")
assert.equal(root.querySelector("diffs-container"), null, "Inactive/offscreen rows do not construct Pierre")
setVisible(true)
await wait()
assert.equal(root.querySelector("diffs-container"), null, "Visibility alone cannot activate a background session")
setActive(true)
await wait()
assert.ok(root.querySelector("diffs-container"), "Visible active detail renders through the shared Diff")
assert.ok(root.querySelector(".fixture-comment"), "Session rendering preserves the existing annotation renderer")
button("Undo").click()
button("Keep").click()
assert.deepEqual(decisions, [
  ["reject", undefined],
  ["accept", undefined],
])
setBusy(true)
assert.equal(button("Undo").disabled, true)
assert.equal(button("Keep").disabled, true)
setBusy(false)
setDiff({ ...original, rejectable: false })
assert.equal(button("Undo").disabled, true)
assert.equal(button("Keep").disabled, true)
assert.equal(
  button("Show entire file").disabled,
  true,
  "Read-only patch-only previews cannot expand invented full context",
)
setDiff(original)
await wait()
const metadata = processFile(original.patch!, {
  oldFile: { name: original.file, contents: before },
  newFile: { name: original.file, contents: after },
})!
assert.equal(metadata.isPartial, false)
assert.equal(metadata.hunks.length, 2, "Full sides preserve displayed patch hunk segmentation")
for (const side of ["additions", "deletions"] as const) {
  assert.deepEqual(sessionHunk(metadata, original.hunks, 40, side), { index: 0, id: "first" })
  assert.deepEqual(sessionHunk(metadata, original.hunks, 120, side), { index: 1, id: "second" })
  assert.equal(sessionHunk(metadata, original.hunks, 80, side), undefined, "Expanded gap lines are not decision hunks")
}
assert.equal(sessionHunk(metadata, undefined, 40, "additions"), undefined)
assert.equal(sessionHunk(metadata, [{ id: "first" }], 40, "additions"), undefined)
assert.equal(sessionHunk(metadata, [{ id: "first" }, { id: "first" }], 40, "additions"), undefined)
for (const patch of [
  "--- a/new.txt\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n",
  "--- a/old.txt\n+++ b/old.txt\n@@ -1,2 +0,0 @@\n-one\n-two\n",
]) {
  const file = processFile(patch)!
  const side = file.hunks.at(0)!.additionCount ? "additions" : "deletions"
  assert.deepEqual(sessionHunk(file, [{ id: "zero" }], 1, side), { index: 0, id: "zero" })
  assert.equal(sessionHunk(file, [{ id: "zero" }], 1, side === "additions" ? "deletions" : "additions"), undefined)
}
const shadow = () => {
  const found = root.querySelector("diffs-container")?.shadowRoot
  assert.ok(found)
  return found
}
const rows = () => Array.from(shadow().querySelectorAll<HTMLElement>("[data-code] [data-line]"))
assert.equal(
  rows().some((row) => row.textContent?.trim() === "line 80"),
  false,
)
const gap = root.querySelector<HTMLDivElement>('.session-review-gap[data-gap="1"]')
assert.ok(gap)
const gaptext = gap.textContent!
button("Show 20 more lines", gap).click()
await wait()
assert.notEqual(
  root.querySelector('.session-review-gap[data-gap="1"]')?.textContent,
  gaptext,
  "Native gap expansion reveals another 20 lines",
)
const all = Array.from(root.querySelectorAll<HTMLButtonElement>('.session-review-gap[data-gap="1"] button')).find(
  (node) => node.textContent === "Expand All",
)
assert.ok(all)
all.click()
await wait()
assert.ok(
  rows().some((row) => row.textContent?.trim() === "line 80"),
  "Expand All reveals the remaining middle gap",
)
assert.equal(
  rows().some((row) => row.textContent?.trim() === "line 1"),
  false,
  "Expand All is scoped to a single gap",
)
button("Show entire file").click()
await wait()
assert.ok(
  rows().some((row) => row.textContent?.trim() === "line 80"),
  "Full-file toggle reveals unchanged middle context",
)
button("Show diff only").click()
await wait()
assert.equal(
  rows().some((row) => row.textContent?.trim() === "line 80"),
  false,
  "Diff-only toggle restores collapsed context",
)
for (const mode of ["unified", "split"] as const) {
  setStyle(mode)
  await wait()
  const row = rows().find((node) => node.textContent?.trim() === "changed 120")
  assert.ok(row)
  const context = rows().find((node) => node.textContent?.trim() === "line 121")
  assert.ok(context)
  const box = (top: number, height: number) => ({
    x: 0,
    y: top,
    top,
    left: 0,
    right: 800,
    bottom: top + height,
    width: 800,
    height,
    toJSON: () => ({}),
  })
  root.querySelector<HTMLElement>(".session-review-diff")!.getBoundingClientRect = () => box(100, 600)
  row.getBoundingClientRect = () => box(300, 24)
  context.getBoundingClientRect = () => box(324, 24)
  row.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, composed: true, pointerType: "mouse" }))
  const toolbar = root.querySelector<HTMLElement>(".session-review-hunk-actions")
  assert.ok(toolbar, `${mode} hover produces block actions`)
  assert.equal(toolbar.dataset.hunk, "second")
  assert.equal(
    toolbar.style.getPropertyValue("--session-review-action-top"),
    "224px",
    "Actions sit directly after the last changed line, not after context",
  )
  toolbar.querySelector<HTMLButtonElement>("button")!.click()
  assert.deepEqual(decisions.at(-1), ["reject", "second"], "Hover action targets the matching displayed hunk")
  toolbar.dispatchEvent(new window.PointerEvent("pointerenter", { bubbles: false }))
  assert.ok(
    root.querySelector(".session-review-hunk-actions"),
    "Moving from a line to its actions retains the controls",
  )
  context.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, composed: true, pointerType: "mouse" }))
  assert.equal(
    root.querySelector(".session-review-hunk-actions"),
    null,
    "Unchanged context must not show change actions",
  )
  row.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, composed: true, pointerType: "mouse" }))
  root
    .querySelector<HTMLElement>(".session-review-diff")!
    .dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }))
  assert.equal(
    root.querySelector(".session-review-hunk-actions"),
    null,
    "Moving into empty diff space hides change actions",
  )
}
const keyboard = root.querySelector<HTMLButtonElement>(".session-review-keyboard-actions button")!
keyboard.focus()
keyboard.click()
assert.deepEqual(decisions.at(-1), ["reject", "first"], "Keyboard fallback targets its explicit hunk")
setDiff({ ...original, hunks: undefined })
await wait()
assert.equal(
  root.querySelector(".session-review-keyboard-actions button"),
  null,
  "Absent IDs cannot expose hunk decisions",
)
const trigger = root.querySelector<HTMLButtonElement>(".session-review-toggle")
assert.ok(trigger)
trigger.click()
assert.deepEqual(open(), [])
trigger.click()
assert.deepEqual(open(), [original.file])
dispose()
const legacy = mount(() => (
  <Accordion>
    <ReviewDiffItem
      diff={original}
      open={() => []}
      viewport={{ ref: () => undefined, visible: () => false, intersects: () => false }}
      loading={() => false}
      comments={() => 0}
      diffStyle={() => "unified"}
      markdownRender={() => false}
      annotations={() => []}
      renderAnnotation={() => undefined}
      onGutterUtilityClick={() => undefined}
      reverting={() => false}
      canComment={() => false}
    />
  </Accordion>
))
assert.equal(root.querySelector(".session-review-header"), null, "Non-session rows retain their existing header")
assert.ok(root.querySelector('[data-slot="session-review-trigger-content"]'))
legacy()
window.happyDOM.abort()
