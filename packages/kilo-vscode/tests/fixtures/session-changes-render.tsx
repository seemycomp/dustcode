import assert from "node:assert/strict"
import { harness } from "./comment-harness"

const { root, window, mount, wait, node } = await harness()
const style = window.document.createElement("style")
style.textContent = await Bun.file("src/styles/session-changes.css").text()
window.document.head.append(style)
const { createSignal } = await import("solid-js")
const { LanguageContext, useLanguage } = await import("../../webview-ui/src/context/language")
const { SessionChanges } = await import("../../webview-ui/src/components/chat/SessionChanges")
const labels: Record<string, string> = {
  "review.sessionFiles": "{{count}} files",
  "review.undoAll": "Undo All",
  "review.keepAll": "Keep All",
  "review.keep": "Keep",
  "review.undo": "Undo",
  "review.pending": "Pending",
  "review.rejected": "Rejected",
  "review.sessionScope": "Changes made by this session only",
}
const [files, setFiles] = createSignal<Parameters<typeof SessionChanges>[0]["files"]>([
  { file: "src/chat/Panel.tsx", additions: 12, deletions: 3 },
  { file: "C:\\project\\accepted.ts", additions: 2, deletions: 0, status: "accepted" },
  { file: "src/rejected.ts", additions: 0, deletions: 4, status: "rejected" },
  { file: "src/readonly.ts", additions: 1, deletions: 0, rejectable: false },
])
const [loading, setLoading] = createSignal(false)
const [busy, setBusy] = createSignal(false)
const [disabled, setDisabled] = createSignal(false)
const [error, setError] = createSignal<string>()
const calls: Array<[string, string?]> = []
const dispose = mount(() => {
  const language = useLanguage()
  return (
    <LanguageContext.Provider
      value={{
        ...language,
        t: (key, params) => labels[key]?.replace("{{count}}", String(params?.count)) ?? language.t(key, params),
      }}
    >
      <SessionChanges
        files={files()}
        loading={loading()}
        busy={busy()}
        disabled={disabled()}
        error={error()}
        onAccept={(file) => calls.push(["accept", file])}
        onReject={(file) => calls.push(["reject", file])}
        onKeepAll={() => calls.push(["keepAll"])}
        onUndoAll={() => calls.push(["undoAll"])}
        onReview={(file) => calls.push(["review", file])}
        onRetry={() => calls.push(["retry"])}
      />
    </LanguageContext.Provider>
  )
})
const button = (text: string) => {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent?.trim() === text,
  )
  assert.ok(found, `Missing button: ${text}`)
  return found
}
const action = (label: string) => node<HTMLButtonElement>(`button[aria-label="${label}"]`)
await wait()
assert.equal(node("section").title, labels["review.sessionScope"])
assert.match(root.textContent ?? "", /4 files/)
assert.equal(node(".session-changes-name").textContent, "Panel.tsx")
assert.equal(root.querySelectorAll(".session-changes-name").item(1)?.textContent, "accepted.ts")
assert.notEqual(window.getComputedStyle(node(".session-changes-counts")).marginInlineStart, "auto")
assert.match(root.textContent ?? "", /\+12-3/)
assert.doesNotMatch(root.textContent ?? "", /Pending/)
assert.equal(root.querySelector('[data-status="pending"] .session-changes-status'), null)
assert.match(root.textContent ?? "", /Accepted/)
assert.match(root.textContent ?? "", /Rejected/)
assert.match(button("Undo All").title, /session only.*Pending/)
assert.doesNotMatch(button("Undo All").title, /Accepted/)
assert.match(button("Keep All").title, /session only.*Pending/)
assert.equal(root.querySelector('button[aria-label="Undo: src/readonly.ts"]'), null)
assert.equal(root.querySelector('button[aria-label="Keep: src/rejected.ts"]'), null)
const file = action("Review: src/chat/Panel.tsx")
assert.equal(file.title, "src/chat/Panel.tsx")
assert.equal(file.querySelector("button"), null, "row actions must not be nested buttons")
assert.equal(
  file.querySelector(".session-changes-name")?.nextElementSibling,
  file.querySelector(".session-changes-counts"),
)
file.click()
action("Keep: src/chat/Panel.tsx").click()
action("Undo: src/chat/Panel.tsx").click()
button("Review").click()
button("Keep All").click()
button("Undo All").click()
assert.deepEqual(
  calls,
  [
    ["review", "src/chat/Panel.tsx"],
    ["accept", "src/chat/Panel.tsx"],
    ["reject", "src/chat/Panel.tsx"],
    ["review", undefined],
    ["keepAll"],
    ["undoAll"],
  ],
  "actions delegate exactly once without opening a separate diff or confirming locally",
)
assert.ok(root.querySelector('[data-status="pending"]'), "host owns status updates")
const toggle = node<HTMLButtonElement>("button[aria-expanded]")
toggle.focus()
assert.equal(window.document.activeElement, toggle)
assert.equal(toggle.getAttribute("aria-controls"), node(".session-changes-body").id)
toggle.click()
assert.equal(toggle.getAttribute("aria-expanded"), "false")
assert.equal(node<HTMLElement>(".session-changes-body").hidden, true)
toggle.click()
assert.equal(node<HTMLElement>(".session-changes-body").hidden, false)
action("Keep: src/chat/Panel.tsx").focus()
assert.equal(window.document.activeElement, action("Keep: src/chat/Panel.tsx"))
for (const update of [setBusy, setDisabled, setLoading]) {
  update(true)
  for (const item of root.querySelectorAll<HTMLButtonElement>("button:not([aria-expanded])")) {
    assert.equal(item.disabled, true, "unavailable operations cannot be activated")
    item.click()
  }
  assert.equal(calls.length, 6)
  update(false)
}
setLoading(true)
assert.ok(root.querySelector('[role="status"] [data-component="spinner"]'))
setLoading(false)
setError("Unable to load session changes")
assert.match(node('[role="alert"]').textContent ?? "", /Unable to load session changes/)
assert.equal(button("Undo All").disabled, true)
assert.equal(button("Keep All").disabled, true)
button("Retry").click()
assert.deepEqual(calls.at(-1), ["retry"])
setError(undefined)
setFiles([{ file: "accepted.ts", additions: 1, deletions: 1, status: "accepted" }])
assert.equal(button("Keep All").disabled, true, "Keep All must target pending files only")
assert.equal(button("Undo All").disabled, true, "kept files are the committed baseline")
setFiles([{ file: "conflict.ts", additions: 1, deletions: 1, rejectable: false }])
assert.equal(button("Undo All").disabled, true, "Undo All requires a pending rejectable file")
assert.equal(button("Keep All").disabled, false, "conflicts do not prevent keeping pending files")
assert.equal(action("Keep: conflict.ts").disabled, false)
button("Keep All").click()
assert.deepEqual(calls.at(-1), ["keepAll"])
setFiles([{ file: "rejected.ts", additions: 1, deletions: 1, status: "rejected" }])
assert.equal(button("Undo All").disabled, true)
assert.equal(button("Keep All").disabled, true)
setFiles([])
assert.equal(button("Review").disabled, true)
assert.equal(button("Undo All").disabled, true)
assert.equal(button("Keep All").disabled, true)
assert.ok(root.querySelector('[role="status"]'))
assert.equal(root.querySelector(".session-changes-list"), null)
dispose()
style.remove()
window.happyDOM.abort()
