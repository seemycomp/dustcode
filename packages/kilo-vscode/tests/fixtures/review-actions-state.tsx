import assert from "node:assert/strict"
import { harness } from "./comment-harness"

const { window, mount } = await harness()
const sent: Array<Record<string, unknown>> = []
globalThis.acquireVsCodeApi = () => ({
  postMessage: (message: Record<string, unknown>) => sent.push(message),
  getState: () => undefined,
  setState: () => undefined,
})
const { createSignal } = await import("solid-js")
const { createReviewActions } = await import("../../webview-ui/diff-viewer/session-review")
const { post } = await import("../../webview-ui/src/utils/webview-message")
const [context, setContext] = createSignal("a")
const [source, setSource] = createSignal<string | undefined>("session:one")
let state: ReturnType<typeof createReviewActions>
const dispose = mount(() => {
  state = createReviewActions(context, source)
  return null
})
post({ type: "diffViewer.ready", revision: "source-one" })
const first = sent.at(-1)!
assert.equal(first.type, "diffViewer.review.load")
post({ type: "diffViewer.review.result", requestId: first.requestId, revision: "r1", diffs: [] })
state!.decide("accept", "a.ts", "hunk-one")
const decision = sent.at(-1)!
assert.deepEqual(
  { action: decision.action, file: decision.file, hunk: decision.hunk, revision: decision.revision },
  { action: "accept", file: "a.ts", hunk: "hunk-one", revision: "r1" },
)
setContext("b")
post({ type: "diffViewer.ready", revision: "source-two" })
const second = sent.at(-1)!
post({
  type: "diffViewer.review.result",
  requestId: decision.requestId,
  revision: "stale",
  diffs: [{ file: "old.ts" }],
})
assert.equal(state!.revision(), "")
post({ type: "diffViewer.review.result", requestId: second.requestId, revision: "r2", diffs: [] })
assert.equal(state!.revision(), "r2")
setSource("workspace")
const length = sent.length
state!.decide("reject", "a.ts", "old-hunk")
assert.equal(sent.length, length, "workspace mode must not send a session decision")
dispose()
window.happyDOM.abort()
