import { describe, expect, it } from "bun:test"
import { mergeMessages, sameReconcileShape } from "../../webview-ui/src/context/session-merge"
import { messageTurns } from "../../webview-ui/src/context/session-queue"
import { disclosedRows, transcriptRows } from "../../webview-ui/src/context/transcript-rows"
import type { Message } from "../../webview-ui/src/types/messages"

const msg = (cost: number): Message => ({
  id: "message",
  sessionID: "session",
  role: "assistant",
  createdAt: "2026-09-23T00:00:00.000Z",
  cost,
  parts: [],
})

describe("cost reconciliation", () => {
  it("applies a cost-only update missed during a backend restart", () => {
    const current = [msg(0.1)]
    const incoming = [msg(0.3)]
    expect(sameReconcileShape(current, incoming, () => undefined)).toBe(false)
    expect(mergeMessages(current, incoming, "reconcile").at(0)?.cost).toBe(0.3)
  })

  it("skips an unchanged snapshot", () => {
    expect(sameReconcileShape([msg(0.3)], [msg(0.3)], () => undefined)).toBe(true)
  })
})

describe("completion reconciliation", () => {
  it("heals a missed completion event so completed tool activity can collapse", () => {
    const prompt: Message = {
      ...msg(0),
      id: "prompt",
      role: "user",
      time: { created: 1_000 },
      parts: [{ id: "question", messageID: "prompt", type: "text", text: "Explain compaction" }],
    }
    const pending: Message = {
      ...msg(0.3),
      parentID: prompt.id,
      time: { created: 1_100 },
      parts: [
        {
          id: "read",
          messageID: "message",
          type: "tool",
          tool: "read",
          callID: "read",
          state: { status: "completed", input: {}, output: "file" },
        },
        { id: "answer", messageID: "message", type: "text", text: "Compaction summary" },
      ],
    }
    const complete = { ...pending, finish: "stop", time: { created: 1_100, completed: 5_000 } }
    const current = [prompt, pending]
    const incoming = [prompt, complete]
    const same = sameReconcileShape(current, incoming, () => undefined)
    expect(same).toBe(false)
    const merged = same ? current : mergeMessages(current, incoming, "reconcile")
    const rows = transcriptRows(messageTurns(merged), (id) => merged.find((msg) => msg.id === id)?.parts ?? [])
    expect(disclosedRows(rows, new Set()).map((row) => row.type)).toEqual(["user", "work", "assistant"])
    expect(sameReconcileShape(incoming, [prompt, { ...complete, time: { ...complete.time } }], () => undefined)).toBe(
      true,
    )
  })
})
