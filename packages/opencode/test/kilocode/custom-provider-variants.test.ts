import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect } from "effect"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node])))

it.instance(
  "uses configured variants instead of inferred reasoning efforts",
  () =>
    Effect.gen(function* () {
      const providers = yield* Provider.use.list()
      const model = providers[ProviderV2.ID.make("custom")]?.models["gpt-6.1-sol"]

      expect(Object.keys(model?.variants ?? {})).toEqual(["custom", "xhigh"])
      expect(model?.variants?.high).toBeUndefined()
      expect(model?.variants?.custom).toEqual({ reasoningEffort: "custom" })
      expect(model?.variants?.xhigh).toEqual({ reasoningEffort: "xhigh" })
      expect(providers[ProviderV2.ID.make("custom")]?.models["empty"]?.variants).toEqual({})
    }),
  {
    config: {
      provider: {
        custom: {
          name: "Custom",
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "test" },
          models: {
            empty: {
              name: "Empty selection",
              reasoning: true,
              limit: { context: 128_000, output: 16_000 },
              variants: {
                low: { disabled: true },
                medium: { disabled: true },
                high: { disabled: true },
                xhigh: { disabled: true },
              },
            },
            "gpt-6.1-sol": {
              name: "GPT 6.1 Sol",
              reasoning: true,
              limit: { context: 128_000, output: 16_000 },
              variants: {
                high: { disabled: true },
                custom: { reasoningEffort: "custom" },
                xhigh: { reasoningEffort: "xhigh" },
              },
            },
          },
        },
      },
    },
  },
)
