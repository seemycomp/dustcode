import { describe, expect, test } from "bun:test"
import { KiloProvider } from "../../src/KiloProvider"

describe("KiloProvider.openSession", () => {
  test("waits for the webview before selecting a session", async () => {
    const provider = new KiloProvider({} as never, {} as never)
    const messages: unknown[] = []
    const state = provider as unknown as {
      webview: { postMessage: (message: unknown) => Promise<boolean> }
      isWebviewReady: boolean
      readyResolvers: Array<() => void>
      sessionDirectories: Map<string, string>
    }
    state.webview = {
      postMessage: async (message) => {
        messages.push(message)
        return true
      },
    }

    const pending = provider.openSession("s1", "C:\\repo")
    expect(provider.getSelectedSessionId()).toBe("s1")
    expect(provider.getCurrentSessionId()).toBeUndefined()
    expect(messages).toEqual([])
    expect(state.sessionDirectories.get("s1")).toBe("C:\\repo")

    state.isWebviewReady = true
    state.readyResolvers.splice(0).forEach((resolve) => resolve())
    await pending

    expect(messages).toEqual([{ type: "openSession", sessionID: "s1" }])
  })

  test("a later pending open wins before readiness", async () => {
    const provider = new KiloProvider({} as never, {} as never)
    const messages: unknown[] = []
    const state = provider as unknown as {
      webview: { postMessage: (message: unknown) => Promise<boolean> }
      isWebviewReady: boolean
      readyResolvers: Array<() => void>
    }
    state.webview = {
      postMessage: async (message) => {
        messages.push(message)
        return true
      },
    }
    const first = provider.openSession("A", "/repo")
    const second = provider.openSession("B", "/repo")
    state.isWebviewReady = true
    state.readyResolvers.splice(0).forEach((resolve) => resolve())
    await Promise.all([first, second])
    expect(messages).toEqual([{ type: "openSession", sessionID: "B" }])
  })

  test("ordinary in-place navigation invalidates an open waiting for readiness", async () => {
    const provider = new KiloProvider({} as never, { registerVisible: () => {}, registerAttached: () => {} } as never)
    const messages: unknown[] = []
    const state = provider as unknown as {
      webview: { postMessage: (message: unknown) => Promise<boolean> }
      isWebviewReady: boolean
      readyResolvers: Array<() => void>
      handleLoadMessages: (id: string) => Promise<void>
    }
    state.webview = {
      postMessage: async (message) => {
        messages.push(message)
        return true
      },
    }
    const pending = provider.openSession("A", "/repo")
    await state.handleLoadMessages("B")
    state.isWebviewReady = true
    state.readyResolvers.splice(0).forEach((resolve) => resolve())
    await pending
    expect(messages).not.toContainEqual({ type: "openSession", sessionID: "A" })
    expect(provider.getSelectedSessionId()).toBe("B")
  })

  test("disposal resolves readiness without selecting, stopping, or disposing the backend", async () => {
    const calls: string[] = []
    const connection = {
      unregisterVisible: () => {},
      unregisterAttached: () => {},
      dispose: () => calls.push("dispose"),
      client: { session: { abort: () => calls.push("abort"), delete: () => calls.push("delete") } },
    }
    const provider = new KiloProvider({} as never, connection as never)
    const messages: unknown[] = []
    const state = provider as unknown as { webview: { postMessage: (message: unknown) => Promise<boolean> } }
    state.webview = {
      postMessage: async (message) => {
        messages.push(message)
        return true
      },
    }
    const pending = provider.openSession("A", "/repo")
    provider.dispose()
    await pending
    expect(messages).toEqual([])
    expect(calls).toEqual([])
    expect(provider.getSelectedSessionId()).toBeUndefined()
  })
})
