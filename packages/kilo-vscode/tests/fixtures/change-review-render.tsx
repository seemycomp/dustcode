import assert from "node:assert/strict"
import { harness } from "./comment-harness"
import type { WorktreeFileDiff } from "../../webview-ui/src/types/messages"

const { root, window, mount, wait } = await harness()
Object.assign(globalThis, { NodeFilter: window.NodeFilter })
const { createSignal, untrack } = await import("solid-js")
const { DialogProvider } = await import("@kilocode/kilo-ui/context/dialog")
const { ServerProvider } = await import("../../webview-ui/src/context/server")
const { ProviderProvider } = await import("../../webview-ui/src/context/provider")
const { ConfigProvider } = await import("../../webview-ui/src/context/config")
const { FullScreenDiffView } = await import("../../webview-ui/diff-viewer/FullScreenDiffView")
const { ReviewDiffItem } = await import("../../webview-ui/diff-viewer/ReviewDiffItem")
const { Accordion } = await import("@kilocode/kilo-ui/accordion")
const { createWorktreeDiffs, diffDataKey } = await import("../../webview-ui/agent-manager/worktree-diffs")
const { useVSCode } = await import("../../webview-ui/src/context/vscode")

const probe = mount(() =>
  untrack(() => {
    const state = createWorktreeDiffs(useVSCode(), () => "project")
    const id = "local#branch"
    const key = diffDataKey("project", id)
    state.onWorktreeDiff({
      type: "agentManager.worktreeDiff",
      projectId: "project",
      sessionId: id,
      diffs: [{ file: "a.ts", before: "base A", after: "next", patch: "patch A", additions: 1, deletions: 1 }],
    })
    state.onWorktreeDiffLoading({
      type: "agentManager.worktreeDiffLoading",
      projectId: "project",
      sessionId: id,
      loading: false,
      reset: true,
    })
    assert.equal(state.diffDatas()[key], undefined, "source reset must remove previous comparison details")
    state.onWorktreeDiff({
      type: "agentManager.worktreeDiff",
      projectId: "project",
      sessionId: id,
      diffs: [{ file: "a.ts", before: "", after: "", summarized: true, additions: 1, deletions: 1 }],
    })
    state.onWorktreeDiffLoading({
      type: "agentManager.worktreeDiffLoading",
      projectId: "project",
      sessionId: id,
      loading: false,
      revision: "B",
    })
    assert.equal(state.revision(id), "B")
    assert.equal(state.diffDatas()[key]?.at(0)?.before, "", "new authorization cannot retain an old base preview")
    return null
  }),
)
probe()

const original: WorktreeFileDiff = {
  file: "a.ts",
  before: "old\n",
  after: "new\n",
  additions: 1,
  deletions: 1,
  stamp: "1",
  status: "modified",
}
const [diffs, setDiffs] = createSignal([original])
const [key, setKey] = createSignal("project-a:branch")
const [allowed, setAllowed] = createSignal(true)
const [error, setError] = createSignal<string>()
const [loading, setLoading] = createSignal(false)
const [sessionReview, setSessionReview] = createSignal(false)
const reverted: string[] = []
const dispose = mount(() => (
  <DialogProvider>
    <ServerProvider>
      <ProviderProvider>
        <ConfigProvider>
          <FullScreenDiffView
            diffs={diffs()}
            sessionKey={key()}
            loading={loading()}
            sessionReview={sessionReview()}
            error={error()}
            diffStyle="unified"
            onDiffStyleChange={() => undefined}
            comments={[]}
            onCommentsChange={() => undefined}
            canRevert={allowed()}
            onRevertFile={(file) => reverted.push(file)}
            onClose={() => undefined}
          />
        </ConfigProvider>
      </ProviderProvider>
    </ServerProvider>
  </DialogProvider>
))
const button = (text: string, scope: ParentNode = root) => {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === text,
  )
  assert.ok(found, `Missing button ${text}: ${scope.textContent}`)
  return found
}
await wait()
button("Accept all").click()
assert.ok(root.querySelector('[aria-label="Accepted"]'))
assert.match(root.textContent ?? "", /1 \/ 1 accepted/)
setKey("project-b:branch")
assert.equal(root.querySelector('[aria-label="Accepted"]'), null, "review state must not cross project scopes")
setKey("project-a:branch")
assert.ok(root.querySelector('[aria-label="Accepted"]'), "returning to a scope restores its review state")
setDiffs([{ ...original, stamp: "2", after: "other\n" }])
assert.equal(root.querySelector('[aria-label="Accepted"]'), null, "changed content requires review again")
button("Accept all").click()
assert.ok(root.querySelector('[aria-label="Accepted"]'))
const revert = root.querySelector<HTMLButtonElement>('button[aria-label="Revert file"]')!
assert.ok(revert)
revert.click()
await wait()
assert.equal(reverted.length, 0, "opening confirmation cannot mutate files")
assert.match(window.document.body.textContent ?? "", /including manual and committed branch edits/)
setKey("another-source")
assert.equal(
  button("Revert file", window.document.body).disabled,
  true,
  "stale confirmation must not target another source",
)
button("Cancel", window.document.body).click()
await wait()
root.querySelector<HTMLButtonElement>('button[aria-label="Revert file"]')!.click()
await wait()
button("Revert file", window.document.body).click()
assert.deepEqual(reverted, ["a.ts"], "only explicit confirmation authorizes a revert")
await wait()
setAllowed(false)
assert.equal(root.querySelector('button[aria-label="Revert file"]'), null, "read-only sources cannot reject")
setError("Unable to fetch comparison")
assert.match(root.querySelector('[role="alert"]')?.textContent ?? "", /Unable to fetch comparison/)
setLoading(true)
assert.equal(button("Accept all").disabled, true, "cannot accept a loading comparison")
setSessionReview(true)
assert.equal(
  Array.from(root.querySelectorAll("button")).some((node) => node.textContent?.trim() === "Accept all"),
  false,
  "session review decisions belong to the chat panel",
)
assert.match(root.textContent ?? "", /Only changes recorded by file-editing tools in this chat/)
dispose()
const [status, setStatus] = createSignal<"pending" | "accepted">("pending")
const item = mount(() => (
  <Accordion>
    <ReviewDiffItem
      diff={original}
      open={() => []}
      viewport={{ ref: () => undefined, visible: () => false, intersects: () => false }}
      active={() => false}
      loading={() => false}
      comments={() => 0}
      diffStyle={() => "unified"}
      markdownRender={() => false}
      annotations={() => []}
      renderAnnotation={() => undefined}
      onGutterUtilityClick={() => undefined}
      reverting={() => false}
      canComment={() => false}
      reviewStatus={status}
      onReviewStatusChange={setStatus}
    />
  </Accordion>
))
button("Accept").click()
assert.equal(status(), "accepted", "accepting a single file uses the same state contract")
button("Accepted").click()
assert.equal(status(), "pending", "accepted files can be reopened for review")
item()
window.happyDOM.abort()
