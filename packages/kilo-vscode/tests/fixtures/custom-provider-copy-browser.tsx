import { render } from "solid-js/web"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { StoryProviders } from "../../webview-ui/src/stories/StoryProviders"
import { ProviderProvider } from "../../webview-ui/src/context/provider"
import ProvidersTab from "../../webview-ui/src/components/settings/ProvidersTab"
import { post } from "../../webview-ui/src/utils/webview-message"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"

const config = {
  disabled_providers: ["custom-copy-2"],
  provider: {
    custom: {
      npm: "@ai-sdk/anthropic",
      name: "Custom Source",
      options: { baseURL: "https://example.com/v1", headers: { "X-Custom": "header-value" } },
      models: {
        "model-one": {
          name: "Model One",
          reasoning: true,
          modalities: { input: ["text", "image"], output: ["text"] },
          variants: { high: { thinking: { type: "adaptive" }, customOption: true } },
        },
      },
    },
    "custom-copy": { npm: "@ai-sdk/openai-compatible", models: {} },
    "custom-copy-2": { npm: "@ai-sdk/openai-compatible", models: {} },
    env: {
      npm: "@ai-sdk/anthropic",
      name: "Environment Source",
      env: ["CUSTOM_API_KEY"],
      options: { baseURL: "https://example.com/v1" },
      models: { "model-env": { name: "Env Model" } },
    },
  },
}

applyKiloTheme("kilo-vscode", applyVscodeTheme("light-modern"))
window.addEventListener("fixture-outgoing", (event) => {
  const message = (event as CustomEvent).detail
  if (message.type === "saveCustomProvider") document.body.dataset.saved = JSON.stringify(message)
})

render(
  () => (
    <StoryProviders config={config}>
      <ProviderProvider>
        <DialogProvider>
          <ProvidersTab />
        </DialogProvider>
      </ProviderProvider>
    </StoryProviders>
  ),
  document.body,
)
post({
  type: "providersLoaded",
  providers: Object.fromEntries(
    [
      ["custom", "Custom Source"],
      ["env", "Environment Source"],
      ["openai", "OpenAI"],
    ].map(([id, name]) => [id, { id, name, source: "config", env: [], models: {} }]),
  ),
  connected: ["custom", "env", "openai"],
  defaults: {},
  defaultSelection: { providerID: "custom", modelID: "model-one" },
  authMethods: {},
  authStates: { custom: "api" },
})
