import type { CustomProviderPackage } from "../../../../src/shared/provider-model"
import type { ModelEntry, VariantEntry } from "./CustomProviderModelCard"

export const PRESETS = ["low", "medium", "high", "xhigh"] as const

function preset(name: (typeof PRESETS)[number]): VariantEntry {
  return {
    name,
    raw: { reasoningEffort: name },
    reasoningEffort: name,
    enableThinking: undefined,
    thinking: undefined,
    splitReasoning: undefined,
    outputEffort: undefined,
    chatTemplateArgs: undefined,
  }
}

export function efforts(model: ModelEntry, npm: CustomProviderPackage): VariantEntry[] {
  if (model.explicit || model.variants.length || npm === "@ai-sdk/anthropic") return model.variants
  return PRESETS.map(preset)
}

export function toggle(variants: VariantEntry[], name: (typeof PRESETS)[number], checked: boolean): VariantEntry[] {
  const existing = variants.find((v) => v.name === name)
  const entry = existing ?? preset(name)
  const raw: Record<string, unknown> = { ...(entry.raw ?? {}), reasoningEffort: name }
  if (checked) delete raw.disabled
  if (!checked) Object.assign(raw, { disabled: true })
  const next = { ...entry, reasoningEffort: name, raw }
  const result = existing ? variants.map((v) => (v.name === name ? next : v)) : [...variants, next]
  // Keep an explicitly empty selection from falling back to inferred efforts.
  return [
    ...result,
    ...PRESETS.filter((key) => !result.some((v) => v.name === key)).map((key) => ({
      ...preset(key),
      raw: { reasoningEffort: key, disabled: true },
    })),
  ]
}
