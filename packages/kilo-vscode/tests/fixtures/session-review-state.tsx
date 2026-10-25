import assert from "node:assert/strict"
import { harness } from "./comment-harness"

const { window, mount, wait } = await harness()
const sent: Array<Record<string, unknown>> = []
globalThis.acquireVsCodeApi = () => ({
  postMessage: (message: Record<string, unknown>) => sent.push(message),
  getState: () => undefined,
  setState: () => undefined,
})
const { createSignal } = await import("solid-js")
const { createSessionReview } = await import("../../webview-ui/src/components/chat/session-review")
const { post } = await import("../../webview-ui/src/utils/webview-message")
const [id, setID] = createSignal("session-a")
const [status, setStatus] = createSignal("idle")
const [project, setProject] = createSignal("one")
let review: ReturnType<typeof createSessionReview>
const dispose = mount(() => {
  review = createSessionReview(id, status, () => true, project)
  return null
})
const request = () => sent.filter((message) => message.type === "sessionReview.load").at(-1)!
const a = request()
assert.equal(a.sessionID, "session-a")
setID("session-b")
const b = request()
assert.equal(b.sessionID, "session-b")
const file = {
  file: "b.txt",
  before: "",
  after: "",
  patch: "+b",
  additions: 1,
  deletions: 0,
  reviewStatus: "pending",
  rejectable: true,
}
post({ ...a, files: [file], revision: "old", type: "sessionReview.result" })
assert.equal(review!.files().length, 0, "late session results cannot leak across chats")
post({ ...b, type: "sessionReview.result", files: [file], revision: "current" })
assert.equal(review!.files().at(0)?.file, "b.txt")
setStatus("busy")
review!.decide("reject", "b.txt")
assert.equal(sent.filter((message) => message.type === "sessionReview.decide").length, 0)
setStatus("idle")
const refresh = request()
post({ ...refresh, type: "sessionReview.result", files: [file], revision: "fresh" })
review!.decide("accept", "b.txt")
const accept = sent.at(-1)!
assert.equal(accept.type, "sessionReview.decide")
assert.equal(accept.sessionID, "session-b")
assert.equal(accept.revision, "fresh")
post({ ...accept, type: "sessionReview.result", error: "conflict" })
assert.equal(review!.error(), "conflict")
assert.equal(review!.revision(), "")
review!.refresh()
const old = request()
setProject("two")
const current = request()
assert.notEqual(current.requestId, old.requestId, "switching projects invalidates same-ID session requests")
post({ ...old, type: "sessionReview.result", files: [file], revision: "old-project" })
assert.equal(review!.files().length, 0)
post({ ...current, type: "sessionReview.result", files: [file], revision: "new-project" })
assert.equal(review!.revision(), "new-project")
review!.decide("accept-all")
assert.equal(sent.at(-1)?.action, "accept-all", "Keep All must never route to a reject action")
dispose()
await wait()
window.happyDOM.abort()
