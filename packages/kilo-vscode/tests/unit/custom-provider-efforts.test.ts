import { describe, expect, it } from "bun:test"
import { efforts, toggle } from "../../webview-ui/src/components/settings/custom-provider-efforts"
import type { ModelEntry } from "../../webview-ui/src/components/settings/CustomProviderModelCard"

const model = (): ModelEntry => ({
  id: "gpt-6.1-sol",
  name: "Sol",
  reasoning: true,
  supportsImages: false,
  modalities: {},
  variants: [],
})

describe("custom provider efforts", () => {
  it("disables absent inferred presets when the last explicit effort is removed", () => {
    const high = efforts(model(), "@ai-sdk/openai").filter((v) => v.name === "high")
    expect(toggle(high, "high", false).map((v) => [v.name, v.raw?.disabled])).toEqual([
      ["high", true],
      ["low", true],
      ["medium", true],
      ["xhigh", true],
    ])
  })
  it("offers four presets only for OpenAI transports without explicit variants", () => {
    expect(efforts(model(), "@ai-sdk/openai-compatible").map((v) => v.name)).toEqual(["low", "medium", "high", "xhigh"])
    expect(efforts(model(), "@ai-sdk/openai").at(-1)?.raw).toEqual({ reasoningEffort: "xhigh" })
    expect(efforts(model(), "@ai-sdk/anthropic")).toEqual([])
    expect(efforts({ ...model(), explicit: true }, "@ai-sdk/openai")).toEqual([])
  })

  it("disables inferred efforts and preserves raw options when reenabled", () => {
    const raw = { reasoningEffort: "high", include: ["reasoning.encrypted_content"], custom: 42 }
    const m = { ...model(), explicit: true, variants: [{ ...efforts(model(), "@ai-sdk/openai")[2]!, raw }] }
    const disabled = toggle(m.variants, "high", false)
    expect(disabled[0]?.raw).toEqual({ ...raw, disabled: true })
    expect(toggle(disabled, "high", true)[0]?.raw).toEqual(raw)
    expect(toggle([], "xhigh", true)[0]?.raw).toEqual({ reasoningEffort: "xhigh" })
    expect(efforts(m, "@ai-sdk/openai")).toEqual(m.variants)
  })
})
