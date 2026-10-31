import { createContext, createSignal, onCleanup, useContext, type Accessor, type ParentComponent } from "solid-js"
import { useVSCode } from "./vscode"
import type { ExtensionMessage } from "../types/messages"

export type ImageModel = {
  id: string
  name: string
  description?: string
}

type ImageModelsContextValue = {
  models: Accessor<ImageModel[]>
}

export const ImageModelsContext = createContext<ImageModelsContextValue>()

export const ImageModelsProvider: ParentComponent = (props) => {
  const vscode = useVSCode()
  const [models, setModels] = createSignal<ImageModel[]>([])
  let loaded = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const load = () => {
    if (loaded) return
    loaded = true
    vscode.postMessage({ type: "requestImageModels" })
    retry = setTimeout(() => {
      retry = undefined
      vscode.postMessage({ type: "requestImageModels" })
    }, 3000)
  }

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "imageModelsLoaded") return
    loaded = true
    if (retry) clearTimeout(retry)
    retry = undefined
    setModels(message.models)
  })

  onCleanup(() => {
    if (retry) clearTimeout(retry)
  })

  onCleanup(unsubscribe)

  return (
    <ImageModelsContext.Provider
      value={{
        models: () => {
          load()
          return models()
        },
      }}
    >
      {props.children}
    </ImageModelsContext.Provider>
  )
}

export function useImageModels(): ImageModelsContextValue {
  const context = useContext(ImageModelsContext)
  if (!context) {
    throw new Error("useImageModels must be used within an ImageModelsProvider")
  }
  return context
}
