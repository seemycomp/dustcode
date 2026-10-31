import assert from "node:assert/strict"
import { Window } from "happy-dom"

const window = new Window({ url: "http://localhost" })
Object.defineProperty(window, "origin", { value: window.location.origin })
const sent: string[] = []
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  MessageEvent: window.MessageEvent,
  acquireVsCodeApi: () => ({
    postMessage: (message: { type: string }) => sent.push(message.type),
    getState: () => undefined,
    setState: () => {},
  }),
})

const { render } = await import("solid-js/web")
const { Show, createSignal } = await import("solid-js")
const { VSCodeProvider } = await import("../../webview-ui/src/context/vscode")
const { ImageModelsProvider, useImageModels } = await import("../../webview-ui/src/context/image-models")
const { KiloEmbeddingModelsProvider, useKiloEmbeddingModels } = await import(
  "../../webview-ui/src/context/kilo-embedding-models"
)
const { EMPTY_KILO_EMBEDDING_MODEL_CATALOG } = await import("@kilocode/kilo-indexing/embedding-models")
const { post } = await import("../../webview-ui/src/utils/webview-message")
const timers = new Set<() => void>()
const original = { setTimeout, clearTimeout }
Object.assign(globalThis, {
  setTimeout: (fn: () => void) => {
    timers.add(fn)
    return fn
  },
  clearTimeout: (fn: () => void) => timers.delete(fn),
})
const [visible, show] = createSignal(false)
const Consumer = () => {
  const image = useImageModels()
  const embeds = useKiloEmbeddingModels()
  useImageModels()
  useKiloEmbeddingModels()
  return (
    <span>
      {image.models().length}:{embeds.catalog().models.length}
    </span>
  )
}
const container = document.createElement("div")
document.body.append(container)
const dispose = render(
  () => (
    <VSCodeProvider>
      <KiloEmbeddingModelsProvider>
        <ImageModelsProvider>
          <Show when={visible()}>
            <Consumer />
          </Show>
        </ImageModelsProvider>
      </KiloEmbeddingModelsProvider>
    </VSCodeProvider>
  ),
  container,
)
try {
  const catalogs = () => sent.filter((type) => type === "requestImageModels" || type === "requestKiloEmbeddingModels")
  assert.deepEqual(catalogs(), [])
  assert.equal(timers.size, 0)
  show(true)
  assert.deepEqual(catalogs().sort(), ["requestImageModels", "requestKiloEmbeddingModels"])
  assert.equal(timers.size, 1)
  post({ type: "imageModelsLoaded", models: [] })
  post({ type: "kiloEmbeddingModelsLoaded", catalog: EMPTY_KILO_EMBEDDING_MODEL_CATALOG })
  assert.equal(timers.size, 0)
  show(false)
  show(true)
  assert.equal(catalogs().length, 2)
  dispose()
  show(false)
  const cached = render(
    () => (
      <VSCodeProvider>
        <KiloEmbeddingModelsProvider>
          <ImageModelsProvider>
            <Show when={visible()}>
              <Consumer />
            </Show>
          </ImageModelsProvider>
        </KiloEmbeddingModelsProvider>
      </VSCodeProvider>
    ),
    container,
  )
  try {
    post({ type: "imageModelsLoaded", models: [] })
    post({ type: "kiloEmbeddingModelsLoaded", catalog: EMPTY_KILO_EMBEDDING_MODEL_CATALOG })
    show(true)
    assert.equal(catalogs().length, 2)
    assert.equal(timers.size, 0)
  } finally {
    cached()
  }
} finally {
  dispose()
  Object.assign(globalThis, original)
  await window.happyDOM.close()
}
