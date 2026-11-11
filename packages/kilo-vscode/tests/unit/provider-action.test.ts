import { describe, expect, it } from "bun:test"
import { createProviderAction } from "../../webview-ui/src/utils/provider-action"
import type { ExtensionMessage, WebviewMessage } from "../../webview-ui/src/types/messages"

function createTransport() {
  const sent: WebviewMessage[] = []
  let handler: ((message: ExtensionMessage) => void) | undefined

  return {
    sent,
    receive(message: ExtensionMessage) {
      handler?.(message)
    },
    postMessage(message: WebviewMessage) {
      sent.push(message)
    },
    onMessage(next: (message: ExtensionMessage) => void) {
      handler = next
      return () => {
        if (handler === next) {
          handler = undefined
        }
      }
    },
  }
}

describe("createProviderAction", () => {
  it("routes terminal provider messages by request id", () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []

    action.send(
      {
        type: "connectProvider",
        providerID: "openai",
        apiKey: "sk-test",
      },
      {
        onConnected: (message) => seen.push(`connected:${message.providerID}`),
      },
    )

    const sent = transport.sent[0]
    expect(sent?.type).toBe("connectProvider")
    expect("requestId" in (sent ?? {}) ? sent.requestId : "").toBeString()

    const requestId = "requestId" in (sent ?? {}) ? sent.requestId : ""
    transport.receive({
      type: "providerConnected",
      requestId,
      providerID: "openai",
    })
    transport.receive({
      type: "providerConnected",
      requestId,
      providerID: "openai",
    })

    expect(seen).toEqual(["connected:openai"])
    action.dispose()
  })

  it("keeps concurrent requests isolated", () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []

    action.send(
      {
        type: "authorizeProviderOAuth",
        providerID: "anthropic",
        method: 0,
      },
      {
        onOAuthReady: (message) => seen.push(`oauth:${message.authorization.method}`),
      },
    )
    action.send(
      {
        type: "disconnectProvider",
        providerID: "openai",
      },
      {
        onDisconnected: (message) => seen.push(`disconnect:${message.providerID}`),
      },
    )

    const oauth = transport.sent[0]
    const disconnect = transport.sent[1]
    const oauthId = "requestId" in (oauth ?? {}) ? oauth.requestId : ""
    const disconnectId = "requestId" in (disconnect ?? {}) ? disconnect.requestId : ""

    transport.receive({
      type: "providerDisconnected",
      requestId: disconnectId,
      providerID: "openai",
    })
    transport.receive({
      type: "providerOAuthReady",
      requestId: oauthId,
      providerID: "anthropic",
      authorization: { url: "https://example.com", method: "code", instructions: "Code: 1234" },
    })

    expect(seen).toEqual(["disconnect:openai", "oauth:code"])
    action.dispose()
  })

  it("carries oauth prompt inputs on the authorize request", () => {
    const transport = createTransport()
    const action = createProviderAction(transport)

    action.send({
      type: "authorizeProviderOAuth",
      providerID: "azure",
      method: 1,
      inputs: { endpointType: "baseURL", baseURL: "https://custom.openai.azure.com/openai" },
    })

    expect(transport.sent[0]).toMatchObject({
      type: "authorizeProviderOAuth",
      providerID: "azure",
      method: 1,
      inputs: { endpointType: "baseURL", baseURL: "https://custom.openai.azure.com/openai" },
    })
    action.dispose()
  })

  it("can drop stale requests", () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []

    const requestId = action.send(
      {
        type: "saveCustomProvider",
        providerID: "myprovider",
        config: {
          name: "My Provider",
          options: { baseURL: "https://example.com/v1" },
          models: { "model-1": { name: "Model One" } },
        },
      },
      {
        onError: (message) => seen.push(message.message),
      },
    )

    action.clear(requestId)
    transport.receive({
      type: "providerActionError",
      requestId,
      providerID: "myprovider",
      action: "connect",
      message: "boom",
    })

    expect(seen).toEqual([])
    action.dispose()
  })

  it("does not consume a save when an unrelated response has the same request id", () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []
    const requestId = action.send(
      { type: "saveCustomProvider", providerID: "custom", config: {} },
      { onConnected: () => seen.push("saved") },
    )
    transport.receive({ type: "customProviderModelsFetched", requestId, models: [] })
    transport.receive({ type: "providerConnected", requestId, providerID: "custom" })
    expect(seen).toEqual(["saved"])
    action.dispose()
  })

  it("expires a missing save response once and ignores it after a retry", async () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []
    const requestId = action.send(
      { type: "saveCustomProvider", providerID: "custom", config: {} },
      { onConnected: () => seen.push("stale"), onError: (message) => seen.push(message.message) },
      { timeout: 10, message: "Save unconfirmed" },
    )
    await Bun.sleep(30)
    expect(seen).toEqual(["Save unconfirmed"])
    const retry = action.send(
      { type: "saveCustomProvider", providerID: "custom", config: {} },
      { onConnected: () => seen.push("saved"), onError: () => seen.push("failed") },
      { timeout: 10, message: "Retry expired" },
    )
    transport.receive({ type: "providerConnected", requestId, providerID: "custom" })
    transport.receive({
      type: "providerActionError",
      requestId,
      providerID: "custom",
      action: "connect",
      message: "Late error",
    })
    transport.receive({ type: "providerConnected", requestId: retry, providerID: "custom" })
    await Bun.sleep(30)
    expect(seen).toEqual(["Save unconfirmed", "saved"])
    action.dispose()
  })

  it("does not apply the save deadline to interactive OAuth", async () => {
    const transport = createTransport()
    const action = createProviderAction(transport)
    const seen: string[] = []
    const requestId = action.send(
      { type: "authorizeProviderOAuth", providerID: "custom", method: 0 },
      { onOAuthReady: () => seen.push("ready"), onError: () => seen.push("expired") },
      { timeout: 10, message: "Save unconfirmed" },
    )
    await Bun.sleep(30)
    transport.receive({
      type: "providerOAuthReady",
      requestId,
      providerID: "custom",
      authorization: { url: "https://example.com", method: "code", instructions: "Enter code" },
    })
    expect(seen).toEqual(["ready"])
    action.dispose()
  })

  it("cancels expiration on error, clear, disposal, and synchronous send failure", async () => {
    for (const mode of ["error", "clear", "dispose", "throw"] as const) {
      const transport = createTransport()
      if (mode === "throw")
        transport.postMessage = () => {
          throw new Error("Transport unavailable")
        }
      const action = createProviderAction(transport)
      const seen: string[] = []
      const requestId = action.send(
        { type: "saveCustomProvider", providerID: "custom", config: {} },
        { onError: (message) => seen.push(message.message) },
        { timeout: 10, message: "Expired" },
      )
      if (mode === "error")
        transport.receive({
          type: "providerActionError",
          requestId,
          providerID: "custom",
          action: "connect",
          message: "Failed",
        })
      if (mode === "clear") action.clear(requestId)
      if (mode === "dispose") action.dispose()
      await Bun.sleep(30)
      expect(seen).toEqual(mode === "error" ? ["Failed"] : mode === "throw" ? ["Transport unavailable"] : [])
      action.dispose()
    }
  })
})
