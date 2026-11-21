import { describe, expect, it } from "bun:test"
import { compacting } from "../../webview-ui/src/context/session-compaction"
import type { Message, Part } from "../../webview-ui/src/types/messages"

const user: Message = { id: "u", sessionID: "s", role: "user", createdAt: "" }
const summary: Message = { id: "a", sessionID: "s", role: "assistant", parentID: "u", summary: true, createdAt: "" }
const parts = (id: string): Part[] => (id === "u" ? [{ id: "p", messageID: "u", type: "compaction", auto: true }] : [])

describe("compacting", () => {
  it("detects pending manual or automatic compaction, including queued prompts", () => {
    expect(compacting([user], parts)).toBe(true)
    expect(compacting([user, summary, { ...user, id: "queued" }], parts)).toBe(true)
    expect(compacting([summary], () => [])).toBe(false)
  })
  it("stops after completion, failure, or normal assistant continuation", () => {
    expect(compacting([user, { ...summary, time: { created: 1, completed: 2 } }], parts)).toBe(false)
    expect(compacting([user, { ...summary, error: { name: "ProviderError" } }], parts)).toBe(false)
    expect(compacting([user, summary, { ...summary, id: "continued", summary: false }], parts)).toBe(false)
    expect(compacting([{ ...user, id: "normal" }], parts)).toBe(false)
    expect(compacting([], parts)).toBe(false)
  })
})
