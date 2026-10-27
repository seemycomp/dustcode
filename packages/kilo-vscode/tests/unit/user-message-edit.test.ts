import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const source = fs.readFileSync(path.join(root, "webview-ui/src/components/chat/VscodeUserMessage.tsx"), "utf8")

describe("historical user message editing", () => {
  it("keeps edit state local until the resubmit operation succeeds", () => {
    expect(source).toContain("if (await props.onResubmit(draft())) setEditing(false)")
    expect(source).toContain('data-action="cancel-edit"')
    expect(source).toContain('data-action="resubmit-message"')
  })
})
