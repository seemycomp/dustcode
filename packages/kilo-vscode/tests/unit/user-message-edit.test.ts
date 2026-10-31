import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const source = fs.readFileSync(path.join(root, "webview-ui/src/components/chat/UserMessageEditor.tsx"), "utf8")
const composer = fs.readFileSync(path.join(root, "webview-ui/src/components/chat/PromptInput.tsx"), "utf8")
const message = fs.readFileSync(path.join(root, "webview-ui/src/components/chat/VscodeUserMessage.tsx"), "utf8")

describe("historical user message editing", () => {
  it("keeps edit state local until the resubmit operation succeeds", () => {
    expect(source).toContain("inline={props}")
    expect(source).toContain("SessionContext.Provider value={local}")
    expect(composer).toContain("if (accepted) props.inline.onCancel()")
    expect(composer).toContain('data-action="cancel-edit"')
    expect(composer).toContain('"resubmit-message"')
  })

  it("does not render redundant hover edit and revert controls", () => {
    expect(message).not.toContain('class="user-message-edit-trigger"')
    expect(message).not.toContain("onRevert={props.onRevert}")
  })
})
