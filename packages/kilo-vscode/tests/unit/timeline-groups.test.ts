import { describe, expect, it } from "bun:test"
import { category, groups } from "../../webview-ui/src/utils/timeline/colors"
import type { Part } from "../../webview-ui/src/types/messages"
import { tokens } from "../../webview-ui/src/utils/timeline/sizes"

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

  it("sums token weights instead of counting bars and omits zero-token categories", () => {
    expect(
      groups([
        { category: "text", tokens: 10 },
        { category: "text", tokens: 90 },
        { category: "reasoning", tokens: 20 },
        { category: "read", tokens: 200 },
        { category: "success", tokens: 0 },
      ]).map((group) => [group.key, group.tokens]),
    ).toEqual([
      ["text", 100],
      ["reasoning", 20],
      ["read", 200],
    ])
  })

  it("estimates text and reasoning content and counts nested tool input, output and errors", () => {
    expect(tokens({ id: "text", type: "text", text: "a".repeat(40) })).toBe(10)
    expect(tokens({ id: "thought", type: "reasoning", text: "a".repeat(80) })).toBe(20)
    const input = { nested: { content: "a".repeat(400) } }
    expect(
      tokens({
        id: "read",
        type: "tool",
        tool: "read",
        state: {
          status: "completed",
          input,
          output: "b".repeat(40),
          title: "read",
        },
      }),
    ).toBe(Math.ceil((JSON.stringify(input).length + 40) / 4))
    expect(tokens(parts.at(4)!)).toBeGreaterThan(tokens(parts.at(5)!))
    expect(tokens({ id: "empty", type: "text", text: "" })).toBe(0)
  })

  it("does not count whole-request step usage again as content", () => {
    expect(tokens({ id: "step", type: "step-finish", tokens: { input: 21000, output: 27 } })).toBe(0)
    expect(groups([])).toEqual([])
  })
})
