import { createRoot } from "solid-js"
import { describe, expect, it } from "bun:test"
import { createResubmitter } from "../../webview-ui/src/context/session-resubmit"
import type { ExtensionMessage } from "../../webview-ui/src/types/messages"

function setup() {
  const sent: Array<{
    type: "resubmitMessage"
    sessionID: string
    messageID: string
    text: string
    requestID: string
  }> = []
  const failed: Array<string | undefined> = []
  const handlers: Array<(message: ExtensionMessage) => void> = []
  let session = "session-original"
  let unsubscribed = 0
  let dispose: (() => void) | undefined

  const resubmitter = createRoot((root) => {
    dispose = root
    return createResubmitter({
      post: (message) => sent.push(message),
      current: () => session,
      connected: () => true,
      fail: (error) => failed.push(error),
      listen: (handler) => {
        handlers.push(handler)
        return () => {
          unsubscribed++
        }
      },
    })
  })

  return {
    resubmitter,
    sent,
    failed,
    dispatch: (message: ExtensionMessage) => handlers.forEach((handler) => handler(message)),
    switchSession: (value: string) => {
      session = value
    },
    dispose: () => {
      resubmitter.dispose()
      dispose?.()
    },
    unsubscribed: () => unsubscribed,
  }
}

describe("session resubmitter", () => {
  it("routes a result to the original session after switching drafts", async () => {
    const state = setup()
    const pending = state.resubmitter.send("message-1", "edited")
    const request = state.sent[0]

    state.switchSession("draft-switched")
    state.dispatch({
      type: "resubmitMessageResult",
      sessionID: request.sessionID,
      messageID: request.messageID,
      requestID: request.requestID,
      success: true,
    })

    expect(await pending).toBe(true)
    expect(state.sent[0]).toMatchObject({ sessionID: "session-original", messageID: "message-1", text: "edited" })
    expect(state.failed).toEqual([])
    state.dispose()
  })

  it("resolves failures and reports the host error", async () => {
    const state = setup()
    const pending = state.resubmitter.send("message-1", "edited")
    const request = state.sent[0]

    state.dispatch({
      type: "resubmitMessageResult",
      sessionID: request.sessionID,
      messageID: request.messageID,
      requestID: request.requestID,
      success: false,
      error: "resubmit failed",
    })

    expect(await pending).toBe(false)
    expect(state.failed).toEqual(["resubmit failed"])
    state.dispose()
  })

  it("ignores a result for another session and cleans pending work on dispose", async () => {
    const state = setup()
    const pending = state.resubmitter.send("message-1", "edited")
    const request = state.sent[0]
    let settled = false
    void pending.then(() => {
      settled = true
    })

    state.dispatch({
      type: "resubmitMessageResult",
      sessionID: "another-session",
      messageID: request.messageID,
      requestID: request.requestID,
      success: true,
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    state.dispose()
    expect(await pending).toBe(false)
    expect(state.unsubscribed()).toBe(1)
    expect(state.failed).toEqual([])
  })
})
