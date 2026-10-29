import type { ExtensionMessage } from "../types/messages"
import { onCleanup } from "solid-js"
import { showToast } from "@kilocode/kilo-ui/toast"
import { useLanguage } from "./language"
import type { ImageAttachment } from "../hooks/useImageAttachments"
import type { ModelSelection } from "../types/messages"

type Input = {
  post: (message: {
    type: "resubmitMessage"
    sessionID: string
    messageID: string
    text: string
    images?: ImageAttachment[]
    requestID: string
    providerID?: string
    modelID?: string
  }) => void
  current: () => string | undefined
  connected: () => boolean
  fail: (error?: string) => void
  listen?: (handler: (message: ExtensionMessage) => void) => () => void
}

export function sessionResubmitter(
  transport: { postMessage: Input["post"]; onMessage: NonNullable<Input["listen"]> },
  current: Input["current"],
  connected: Input["connected"],
) {
  const language = useLanguage()
  const controller = createResubmitter({
    post: transport.postMessage,
    listen: transport.onMessage,
    current,
    connected,
    fail: (error) => showToast({ variant: "error", title: language.t("common.requestFailed"), description: error }),
  })
  onCleanup(controller.dispose)
  return controller
}

export function createResubmitter(input: Input) {
  const pending = new Map<string, { sessionID: string; messageID: string; resolve: (value: boolean) => void }>()
  const handle = (message: ExtensionMessage) => {
    if (message.type !== "resubmitMessageResult") return false
    const result = pending.get(message.requestID)
    if (!result) return true
    if (result.sessionID !== message.sessionID || result.messageID !== message.messageID) return true
    pending.delete(message.requestID)
    if (!message.success) input.fail(message.error)
    result.resolve(message.success)
    return true
  }
  const send = async (
    messageID: string,
    text: string,
    images?: ImageAttachment[],
    model?: ModelSelection | null,
  ): Promise<boolean> => {
    const sessionID = input.current()
    if (!sessionID || !input.connected()) return false
    const requestID = crypto.randomUUID()
    const result = Promise.withResolvers<boolean>()
    pending.set(requestID, { sessionID, messageID, resolve: result.resolve })
    input.post({
      type: "resubmitMessage",
      sessionID,
      messageID,
      text,
      requestID,
      ...(images !== undefined ? { images } : {}),
      ...(model?.providerID && model.modelID ? { providerID: model.providerID, modelID: model.modelID } : {}),
    })
    return result.promise
  }
  const unsubscribe = input.listen?.(handle)
  const dispose = () => {
    unsubscribe?.()
    for (const result of pending.values()) result.resolve(false)
    pending.clear()
  }
  return { handle, send, dispose }
}
