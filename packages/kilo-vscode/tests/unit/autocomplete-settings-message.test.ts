import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { buildAutocompleteSettingsMessage, validAutocompleteSetting } from "../../src/services/autocomplete/settings"
import { ensureBackendForAutocomplete } from "../../src/services/autocomplete/ensure-backend"
import type { KiloConnectionService } from "../../src/services/cli-backend"

type Stub = {
  getConfiguration: (section?: string) => {
    get: <T>(key: string, fallback?: T) => T | undefined
    update?: (key: string, value: unknown) => Promise<void>
  }
}

const original = vscode.workspace.getConfiguration

function stubConfig(state: Map<string, unknown>) {
  ;(vscode.workspace as unknown as Stub).getConfiguration = (section?: string) => {
    if (section !== "dustcode.autocomplete") {
      return { get: <T>(_key: string, fallback?: T) => fallback }
    }
    return {
      get: <T>(key: string, fallback?: T) => (state.has(key) ? (state.get(key) as T) : fallback),
    }
  }
}

afterEach(() => {
  ;(vscode.workspace as unknown as Stub).getConfiguration = original as Stub["getConfiguration"]
})

describe("buildAutocompleteSettingsMessage", () => {
  let state: Map<string, unknown>

  beforeEach(() => {
    state = new Map()
    stubConfig(state)
  })

  it("returns null for both keys when nothing is set so the webview renders 'Not set'", () => {
    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBeNull()
    expect(msg.settings.model).toBeNull()
    expect(msg.settings.enableAutoTrigger).toBe(false)
  })

  it("preserves an explicit autocomplete opt-in", () => {
    state.set("enableAutoTrigger", true)
    expect(buildAutocompleteSettingsMessage().settings.enableAutoTrigger).toBe(true)
  })

  it("starts no backend without explicit autocomplete opt-in", () => {
    const calls: string[] = []
    const connection = {
      connect: async (dir: string) => {
        calls.push(dir)
      },
    } as unknown as KiloConnectionService
    ensureBackendForAutocomplete(connection)
    expect(calls).toEqual([])
    state.set("enableAutoTrigger", true)
    ensureBackendForAutocomplete(connection)
    expect(calls).toEqual(["/repo"])
  })

  it("passes an explicit BYOK selection through verbatim", () => {
    state.set("provider", "inception")
    state.set("model", "mercury-edit-2")

    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBe("inception")
    expect(msg.settings.model).toBe("mercury-edit-2")
  })

  it("does not coerce a bare model setting to a default — let the webview see what was stored", () => {
    state.set("model", "mercury-edit-2")

    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBeNull()
    expect(msg.settings.model).toBe("mercury-edit-2")
  })
})

describe("validAutocompleteSetting", () => {
  it("accepts null/undefined for provider and model so the user can clear back to the default", () => {
    expect(validAutocompleteSetting("provider", null)).toBe(true)
    expect(validAutocompleteSetting("provider", undefined)).toBe(true)
    expect(validAutocompleteSetting("model", null)).toBe(true)
    expect(validAutocompleteSetting("model", undefined)).toBe(true)
  })

  it("accepts known providers and models", () => {
    expect(validAutocompleteSetting("provider", "inception")).toBe(true)
    expect(validAutocompleteSetting("model", "mercury-edit-2")).toBe(true)
  })

  it("rejects unknown providers and models", () => {
    expect(validAutocompleteSetting("provider", "openrouter")).toBe(false)
    expect(validAutocompleteSetting("model", "gpt-5")).toBe(false)
  })

  it("rejects non-boolean toggle updates", () => {
    expect(validAutocompleteSetting("enableAutoTrigger", "true")).toBe(false)
  })
})
