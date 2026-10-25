import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Checkbox } from "@kilocode/kilo-ui/checkbox"
import { Button } from "@kilocode/kilo-ui/button"
import { For, Show } from "solid-js"
import type { CustomProviderPackage } from "../../../../src/shared/provider-model"
import { efforts, PRESETS } from "./custom-provider-efforts"
import { useLanguage } from "../../context/language"

export type Translator = ReturnType<typeof useLanguage>["t"]

// undefined = not set; true/false = enable_thinking value
export type EnableThinkingValue = undefined | boolean
export type ThinkingTypeValue = undefined | "enabled" | "disabled" | "adaptive"
export type SplitReasoningValue = undefined | boolean
export type ReasoningEffortValue = undefined | "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
export type OutputEffortValue = undefined | "low" | "medium" | "high" | "xhigh" | "max"
export type ChatTemplateArgsValue = undefined | boolean
export type Modality = "text" | "audio" | "image" | "video" | "pdf"

export type Modalities = {
  input?: Modality[]
  output?: Modality[]
}

export type VariantEntry = {
  name: string
  raw?: Record<string, unknown>
  enableThinking: EnableThinkingValue
  thinking: ThinkingTypeValue
  splitReasoning: SplitReasoningValue
  reasoningEffort: ReasoningEffortValue
  outputEffort: OutputEffortValue
  chatTemplateArgs: ChatTemplateArgsValue
}

export type ModelEntry = {
  id: string
  name: string
  reasoning: boolean
  supportsImages: boolean
  modalities: Modalities
  variants: VariantEntry[]
  explicit?: boolean
  preset?: boolean
}

type ModelCardProps = {
  m: ModelEntry
  errors: { id?: string; name?: string; variants?: Array<{ name?: string }> }
  t: Translator
  canRemove: boolean
  npm: CustomProviderPackage
  onEffort: (name: (typeof PRESETS)[number], checked: boolean) => void
  onApply: () => void
  onChangeId: (val: string) => void
  onChangeName: (val: string) => void
  onChangeReasoning: (val: boolean) => void
  onChangeSupportsImages: (val: boolean) => void
  onRemove: () => void
}

export function ModelCard(props: ModelCardProps) {
  const issue = () => props.errors.variants?.find((error) => error.name)?.name

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
        padding: "8px",
        border: "1px solid var(--border-weak-base, var(--vscode-panel-border))",
        "border-radius": "6px",
      }}
    >
      {/* Model id + name + remove */}
      <div style={{ display: "flex", gap: "8px", "align-items": "flex-end" }}>
        <div style={{ flex: 1 }}>
          <TextField
            label={props.t("provider.custom.models.id.label")}
            placeholder={props.t("provider.custom.models.id.placeholder")}
            value={props.m.id}
            onChange={props.onChangeId}
            validationState={props.errors.id ? "invalid" : undefined}
            error={props.errors.id}
          />
        </div>
        <div style={{ flex: 1 }}>
          <TextField
            label={props.t("provider.custom.models.name.label")}
            placeholder={props.t("provider.custom.models.name.placeholder")}
            value={props.m.name}
            onChange={props.onChangeName}
            validationState={props.errors.name ? "invalid" : undefined}
            error={props.errors.name}
          />
        </div>
        <IconButton
          type="button"
          icon="trash"
          variant="ghost"
          onClick={props.onRemove}
          disabled={!props.canRemove}
          aria-label={props.t("provider.custom.models.remove")}
          style={{ "margin-bottom": "4px" }}
        />
      </div>

      {/* Reasoning and Image toggles */}
      <div style={{ display: "flex", gap: "16px", "align-items": "center", "flex-wrap": "wrap" }}>
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            cursor: "pointer",
            "font-size": "var(--kilo-font-size-13)",
            color: "var(--vscode-foreground)",
          }}
        >
          <input
            type="checkbox"
            checked={props.m.reasoning}
            onChange={(e) => props.onChangeReasoning(e.currentTarget.checked)}
          />
          {props.t("provider.custom.models.reasoning.label")}
        </label>

        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            cursor: "pointer",
            "font-size": "var(--kilo-font-size-13)",
            color: "var(--vscode-foreground)",
          }}
        >
          <input
            type="checkbox"
            checked={props.m.supportsImages}
            onChange={(e) => props.onChangeSupportsImages(e.currentTarget.checked)}
          />
          {props.t("provider.custom.models.modalities.image")}
        </label>
      </div>

      <Show when={props.m.reasoning && props.npm !== "@ai-sdk/anthropic"}>
        <div class="custom-provider-efforts">
          <span>{props.t("prompt.thinking.tooltip")}</span>
          <p>{props.t("provider.custom.models.efforts.description")}</p>
          <Show when={!props.m.explicit && !props.m.variants.length && !props.m.preset}>
            <Button type="button" size="small" variant="secondary" onClick={props.onApply}>
              {props.t("provider.custom.models.efforts.apply")}
            </Button>
          </Show>
          <div class="custom-provider-efforts-options">
            <For each={PRESETS}>
              {(name) => (
                <Checkbox
                  checked={efforts(props.m, props.npm).some((v) => v.name === name && v.raw?.disabled !== true)}
                  onChange={(checked) => props.onEffort(name, checked)}
                >
                  {props.t(name === "xhigh" ? "prompt.thinking.extraHigh" : `prompt.thinking.${name}`)}
                </Checkbox>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={issue()}>
        {(error) => (
          <span
            role="alert"
            style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-errorForeground)" }}
          >
            {error()}
          </span>
        )}
      </Show>
    </div>
  )
}
