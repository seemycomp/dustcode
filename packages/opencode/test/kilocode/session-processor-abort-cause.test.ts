import { describe, expect, test } from "bun:test"
import { KiloSessionProcessor } from "../../src/kilocode/session/processor"
import type { MessageV2 } from "../../src/session/message-v2"

describe("session processor abort cause", () => {
  test("omits the cause when no assistant error exists", () => {
    expect(KiloSessionProcessor.abortCause(undefined)).toBeUndefined()
  })

  test.each(["MessageAbortedError", "ContextOverflowError"] as const)("keeps only the %s name", (name) => {
    expect(KiloSessionProcessor.abortCause({ name, data: { message: "secret" } })).toEqual({ name })
  })

  test("projects only allowlisted diagnostic fields", () => {
    const error = {
      name: "APIError",
      data: {
        message: "secret message",
        isRetryable: false,
        statusCode: 429,
        responseHeaders: { authorization: "secret header" },
        responseBody: "secret body",
        metadata: { code: "provider.rate_limit-1", token: "secret token", stack: "secret stack" },
      },
      stack: "secret stack",
    } satisfies MessageV2.Assistant["error"] & { stack: string }
    expect(KiloSessionProcessor.abortCause(error)).toEqual({
      name: "APIError",
      code: "provider.rate_limit-1",
      statusCode: 429,
    })
  })

  test.each(["", "x".repeat(101), "secret value", "Bearer token", "bad/code", "bad\n", "bad\r"])(
    "omits unsafe or unbounded code %j",
    (code) => {
      expect(
        KiloSessionProcessor.abortCause({
          name: "APIError",
          data: { message: "secret", isRetryable: false, metadata: { code } },
        }),
      ).toEqual({ name: "APIError" })
    },
  )

  test.each(["x", "x".repeat(100)])("accepts bounded safe code %j", (code) => {
    expect(
      KiloSessionProcessor.abortCause({
        name: "APIError",
        data: { message: "secret", isRetryable: false, metadata: { code } },
      }),
    ).toEqual({ name: "APIError", code })
  })

  test.each([NaN, Infinity, -Infinity, 99, 600, 429.5])("omits invalid HTTP status %s", (statusCode) => {
    expect(
      KiloSessionProcessor.abortCause({
        name: "APIError",
        data: { message: "secret", isRetryable: false, statusCode },
      }),
    ).toEqual({ name: "APIError" })
  })

  test.each([100, 599])("accepts HTTP status boundary %s", (statusCode) => {
    expect(
      KiloSessionProcessor.abortCause({
        name: "APIError",
        data: { message: "secret", isRetryable: false, statusCode },
      }),
    ).toEqual({ name: "APIError", statusCode })
  })
})
