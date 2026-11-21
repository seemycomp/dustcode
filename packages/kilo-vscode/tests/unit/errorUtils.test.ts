import { describe, it, expect } from "bun:test"
import type { AssistantMessage, ToolPart } from "@kilocode/sdk/v2"
import {
  unwrapError,
  parseAssistantError,
  parseProviderAuthError,
  isUnauthorizedPaidModelError,
  isUnauthorizedPromotionLimitError,
  toolErrorCause,
} from "../../webview-ui/src/utils/errorUtils"

type AssistantError = AssistantMessage["error"]

describe("toolErrorCause", () => {
  const part = (metadata?: Record<string, unknown>): ToolPart => ({
    id: "part",
    sessionID: "session",
    messageID: "message",
    callID: "call",
    type: "tool",
    tool: "bash",
    state: { status: "error", input: {}, error: "Tool execution aborted", metadata, time: { start: 1, end: 2 } },
  })

  it("uses the captured cause rather than a later message error", () => {
    expect(
      toolErrorCause(part({ abortCause: { name: "APIError", code: "ECONNRESET", statusCode: 503 } }), {
        name: "MessageAbortedError",
        data: { message: "Aborted" },
      }),
    ).toBe("APIError / ECONNRESET / HTTP 503")
  })

  it("uses the message error for older history without captured metadata", () => {
    expect(
      toolErrorCause(part(), { name: "APIError", data: { message: "Failed", isRetryable: false, statusCode: 429 } }),
    ).toBe("APIError / HTTP 429")
    expect(
      toolErrorCause(part(), {
        name: "APIError",
        data: { message: "Failed", isRetryable: false, metadata: { code: "ETIMEDOUT" } },
      }),
    ).toBe("APIError / ETIMEDOUT")
  })

  it("does not infer user cancellation from cleanup bookkeeping", () => {
    expect(toolErrorCause(part({ interrupted: true }))).toBeUndefined()
    expect(toolErrorCause(part(), { name: "MessageAbortedError", data: { message: "Aborted" } })).toBe(
      "MessageAbortedError",
    )
  })

  it("does not expose raw messages, headers, or malformed diagnostic values", () => {
    expect(
      toolErrorCause(
        part({ abortCause: { name: "APIError", code: "Bearer secret", statusCode: 999, message: "secret" } }),
      ),
    ).toBe("APIError")
    expect(toolErrorCause(part({ abortCause: { name: "APIError", statusCode: 503.5 } }))).toBe("APIError")
  })

  it("does not attribute an ordinary tool failure to the surrounding message error", () => {
    const tool = part()
    if (tool.state.status === "error") tool.state.error = "Permission denied"
    expect(toolErrorCause(tool, { name: "MessageAbortedError", data: { message: "Aborted" } })).toBeUndefined()
  })
})

describe("unwrapError", () => {
  it("returns plain string messages unchanged", () => {
    expect(unwrapError("something went wrong")).toBe("something went wrong")
  })

  it("extracts message from JSON error object with error.message", () => {
    const input = JSON.stringify({ error: { message: "rate limit exceeded" } })
    expect(unwrapError(input)).toBe("rate limit exceeded")
  })

  it("returns original message for malformed JSON", () => {
    expect(unwrapError("{not valid json")).toBe("{not valid json")
  })

  it("strips leading 'Error: ' prefix before parsing", () => {
    const json = JSON.stringify({ message: "connection refused" })
    expect(unwrapError(`Error: ${json}`)).toBe("connection refused")
  })

  it("formats empty provider rate-limit errors", () => {
    const body = {
      type: "error",
      sequence_number: 2,
      error: { type: "tokens", code: "rate_limit_exceeded", message: "", param: null },
    }
    const input = JSON.stringify({ message: JSON.stringify(body) })

    expect(unwrapError(input)).toBe("Provider rate limit exceeded. Please try again shortly.")
  })

  it("preserves provider details when a rate-limit message is present", () => {
    const input = JSON.stringify({
      type: "error",
      error: { type: "tokens", code: "rate_limit_exceeded", message: "Try again in 30 seconds." },
    })

    expect(unwrapError(input)).toBe("tokens: Try again in 30 seconds.")
  })
})

describe("parseAssistantError", () => {
  it("returns null for null input", () => {
    expect(parseAssistantError(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(parseAssistantError(undefined)).toBeNull()
  })

  it("returns null for non-APIError (e.g. MessageAbortedError)", () => {
    const error: AssistantError = { name: "MessageAbortedError", data: { message: "aborted" } }
    expect(parseAssistantError(error)).toBeNull()
  })

  it("returns null when APIError has no data", () => {
    // Simulate a malformed error where data is missing at runtime
    const error = { name: "APIError" } as unknown as AssistantError
    expect(parseAssistantError(error)).toBeNull()
  })

  it("extracts statusCode and message from APIError data", () => {
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 401, message: "Unauthorized", isRetryable: false },
    }
    const result = parseAssistantError(error)
    expect(result).toEqual({ statusCode: 401, code: undefined, message: "Unauthorized" })
  })

  it("extracts code from responseBody JSON with error.code", () => {
    const responseBody = JSON.stringify({ error: { code: "PAID_MODEL_AUTH_REQUIRED" } })
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 401, message: "Unauthorized", isRetryable: false, responseBody },
    }
    const result = parseAssistantError(error)
    expect(result).toEqual({ statusCode: 401, code: "PAID_MODEL_AUTH_REQUIRED", message: "Unauthorized" })
  })

  it("extracts code from responseBody JSON with top-level code", () => {
    const responseBody = JSON.stringify({ code: "PROMOTION_MODEL_LIMIT_REACHED" })
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 429, message: "Too Many Requests", isRetryable: false, responseBody },
    }
    const result = parseAssistantError(error)
    expect(result).toEqual({ statusCode: 429, code: "PROMOTION_MODEL_LIMIT_REACHED", message: "Too Many Requests" })
  })

  it("handles invalid responseBody JSON gracefully", () => {
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 500, message: "Server Error", isRetryable: false, responseBody: "not json" },
    }
    const result = parseAssistantError(error)
    expect(result).toEqual({ statusCode: 500, code: undefined, message: "Server Error" })
  })

  it("handles missing responseBody", () => {
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 403, message: "Forbidden", isRetryable: false },
    }
    const result = parseAssistantError(error)
    expect(result).toEqual({ statusCode: 403, code: undefined, message: "Forbidden" })
  })
})

describe("parseProviderAuthError", () => {
  it("extracts provider auth errors", () => {
    const error: AssistantError = {
      name: "ProviderAuthError",
      data: { providerID: "openai", message: "Sign in again" },
    }

    expect(parseProviderAuthError(error)).toEqual({ providerID: "openai", message: "Sign in again" })
  })

  it("returns null for non-provider-auth errors", () => {
    const error: AssistantError = {
      name: "APIError",
      data: { statusCode: 401, message: "Unauthorized", isRetryable: false },
    }

    expect(parseProviderAuthError(error)).toBeNull()
  })
})

describe("isUnauthorizedPaidModelError", () => {
  it("returns true for 401 + PAID_MODEL_AUTH_REQUIRED", () => {
    expect(isUnauthorizedPaidModelError({ statusCode: 401, code: "PAID_MODEL_AUTH_REQUIRED" })).toBe(true)
  })

  it("returns false for 401 + different code", () => {
    expect(isUnauthorizedPaidModelError({ statusCode: 401, code: "SOMETHING_ELSE" })).toBe(false)
  })

  it("returns false for null input", () => {
    expect(isUnauthorizedPaidModelError(null)).toBe(false)
  })
})

describe("isUnauthorizedPromotionLimitError", () => {
  it("returns true for 401 + PROMOTION_MODEL_LIMIT_REACHED", () => {
    expect(isUnauthorizedPromotionLimitError({ statusCode: 401, code: "PROMOTION_MODEL_LIMIT_REACHED" })).toBe(true)
  })

  it("returns true for 429 + PROMOTION_MODEL_LIMIT_REACHED", () => {
    expect(isUnauthorizedPromotionLimitError({ statusCode: 429, code: "PROMOTION_MODEL_LIMIT_REACHED" })).toBe(true)
  })

  it("returns false for null input", () => {
    expect(isUnauthorizedPromotionLimitError(null)).toBe(false)
  })
})
