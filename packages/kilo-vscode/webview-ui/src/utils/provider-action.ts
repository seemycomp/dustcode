import type {
  AuthorizeProviderOAuthMessage,
  CompleteProviderOAuthMessage,
  ConnectProviderMessage,
  DisconnectProviderMessage,
  ExtensionMessage,
  ProviderActionErrorMessage,
  ProviderConnectedMessage,
  ProviderDisconnectedMessage,
  ProviderOAuthReadyMessage,
  SaveCustomProviderMessage,
  WebviewMessage,
} from "../types/messages"

type ProviderRequest =
  | ConnectProviderMessage
  | AuthorizeProviderOAuthMessage
  | CompleteProviderOAuthMessage
  | DisconnectProviderMessage
  | SaveCustomProviderMessage

type ProviderRequestInput =
  | Omit<ConnectProviderMessage, "requestId">
  | Omit<AuthorizeProviderOAuthMessage, "requestId">
  | Omit<CompleteProviderOAuthMessage, "requestId">
  | Omit<DisconnectProviderMessage, "requestId">
  | Omit<SaveCustomProviderMessage, "requestId">

type Transport = {
  postMessage: (message: WebviewMessage) => void
  onMessage: (handler: (message: ExtensionMessage) => void) => () => void
}

type Handlers = {
  onOAuthReady?: (message: ProviderOAuthReadyMessage) => void
  onConnected?: (message: ProviderConnectedMessage) => void
  onDisconnected?: (message: ProviderDisconnectedMessage) => void
  onError?: (message: ProviderActionErrorMessage) => void
}

export function createProviderAction(vscode: Transport) {
  const pending = new Map<string, Handlers & { timer?: ReturnType<typeof setTimeout> }>()
  const unsubscribe = vscode.onMessage((message) => {
    if (!("requestId" in message)) return
    if (
      message.type !== "providerOAuthReady" &&
      message.type !== "providerConnected" &&
      message.type !== "providerDisconnected" &&
      message.type !== "providerActionError"
    )
      return

    const item = pending.get(message.requestId)
    if (!item) return
    clear(message.requestId)

    if (message.type === "providerOAuthReady") {
      item.onOAuthReady?.(message)
      return
    }

    if (message.type === "providerConnected") {
      item.onConnected?.(message)
      return
    }

    if (message.type === "providerDisconnected") {
      item.onDisconnected?.(message)
      return
    }

    if (message.type === "providerActionError") {
      item.onError?.(message)
    }
  })

  function send(message: ProviderRequestInput, handlers: Handlers = {}, expiry?: { timeout: number; message: string }) {
    const requestId = crypto.randomUUID()
    pending.set(requestId, handlers)
    const fail = (reason: string) => {
      const item = pending.get(requestId)
      if (!item) return
      clear(requestId)
      item.onError?.({
        type: "providerActionError",
        requestId,
        providerID: message.providerID,
        action:
          message.type === "disconnectProvider"
            ? "disconnect"
            : message.type === "authorizeProviderOAuth"
              ? "authorize"
              : "connect",
        message: reason,
      })
    }
    if (expiry && message.type === "saveCustomProvider") {
      pending.set(requestId, { ...handlers, timer: setTimeout(() => fail(expiry.message), expiry.timeout) })
    }
    try {
      vscode.postMessage({ ...message, requestId } as ProviderRequest)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
    return requestId
  }

  function clear(requestId?: string) {
    if (requestId) {
      clearTimeout(pending.get(requestId)?.timer)
      pending.delete(requestId)
      return
    }
    for (const item of pending.values()) clearTimeout(item.timer)
    pending.clear()
  }

  function dispose() {
    clear()
    unsubscribe()
  }

  return { clear, send, dispose }
}
