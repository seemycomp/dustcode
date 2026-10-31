import { describe, expect, it } from "bun:test"
import { splitConfigByScope } from "../../webview-ui/src/utils/config-scope"

describe("splitConfigByScope", () => {
  it.each([true, false])("writes snapshot=%s to project config instead of the shadowed global config", (snapshot) => {
    const split = splitConfigByScope({ snapshot, retention: { enabled: true } })

    expect(split.project).toEqual({ snapshot })
    expect(split.global).toEqual({ retention: { enabled: true } })
  })

  it("keeps indexing configuration out of project config", () => {
    const split = splitConfigByScope({
      indexing: {
        enabled: true,
        provider: "ollama",
      },
    })

    expect(split.global).toEqual({ indexing: { enabled: true, provider: "ollama" } })
    expect(split.project).toEqual({})
  })

  it("writes indexing provider settings to global config", () => {
    const split = splitConfigByScope({
      indexing: {
        provider: "ollama",
      },
    })

    expect(split.global).toEqual({ indexing: { provider: "ollama" } })
    expect(split.project).toEqual({})
  })

  it("writes the speech-to-text model setting to global config", () => {
    const split = splitConfigByScope({
      experimental: {
        speech_to_text_model: "openai/gpt-4o-mini-transcribe",
      },
    })

    expect(split.global).toEqual({
      experimental: {
        speech_to_text_model: "openai/gpt-4o-mini-transcribe",
      },
    })
    expect(split.project).toEqual({})
  })

  it("writes the shared agent board setting to global config", () => {
    const split = splitConfigByScope({
      shared_agent_board: true,
    })

    expect(split.global).toEqual({
      shared_agent_board: true,
    })
    expect(split.project).toEqual({})
  })
})
