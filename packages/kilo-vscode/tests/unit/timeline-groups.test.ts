import { describe, expect, it } from "bun:test"
import { category, groups } from "../../webview-ui/src/utils/timeline/colors"
import type { Part } from "../../webview-ui/src/types/messages"

describe("timeline categories", () => {
  const parts: Part[] = [
    { id: "text", type: "text", text: "Reply" },
    { id: "reasoning", type: "reasoning", text: "Thinking" },
    {
      id: "read",
      type: "tool",
      tool: "read",
      state: { status: "completed", input: {}, output: "File", title: "read" },
    },
    { id: "write", type: "tool", tool: "apply_patch", state: { status: "running", input: {} } },
    { id: "error", type: "tool", tool: "read", state: { status: "error", input: {}, error: "Failed" } },
    { id: "tool", type: "tool", tool: "bash", state: { status: "pending", input: {} } },
    { id: "step", type: "step-finish", reason: "stop" },
  ]

  it("separates text, reasoning, file operations, other tools and errors", () => {
    expect(parts.map(category)).toEqual(["text", "reasoning", "read", "write", "error", "tool", "success"])
  })

  it("summarizes categories without merging identically colored text and reasoning", () => {
    const bars = [...parts, parts[0]!].map((part) => ({ category: category(part), partId: part.id }))
    expect(groups(bars).map((group) => [group.key, group.count])).toEqual([
      ["text", 2],
      ["reasoning", 1],
      ["read", 1],
      ["write", 1],
      ["error", 1],
      ["tool", 1],
      ["success", 1],
    ])
    expect(bars.filter((bar) => bar.category === "read").map((bar) => bar.partId)).toEqual(["read"])
  })
})
