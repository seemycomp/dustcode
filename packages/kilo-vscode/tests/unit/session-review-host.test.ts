import { describe, expect, it } from "bun:test"
import { handleSessionReview } from "../../src/kilo-provider/session-review-host"
import type { KiloConnectionService } from "../../src/services/cli-backend"

describe("session review host route", () => {
  it("rejects stale sessions and ambiguous directories before accessing the backend", async () => {
    const posted: unknown[] = []
    const ctx = {
      connection: {} as KiloConnectionService,
      sessionID: "active",
      directory: () => null,
      post: (message: unknown) => {
        posted.push(message)
      },
    }
    await handleSessionReview({ type: "sessionReview.load", sessionID: "old", requestId: "stale" }, ctx)
    expect(posted.at(-1)).toMatchObject({
      type: "sessionReview.result",
      sessionID: "old",
      requestId: "stale",
      error: expect.stringContaining("active session"),
    })
    await handleSessionReview(
      {
        type: "sessionReview.decide",
        sessionID: "active",
        requestId: "ambiguous",
        revision: "x",
        action: "undo-all",
      },
      ctx,
    )
    expect(posted.at(-1)).toMatchObject({ requestId: "ambiguous", error: expect.stringContaining("ambiguous") })
  })

  it("ignores malformed and unrelated messages", async () => {
    const posted: unknown[] = []
    const ctx = {
      connection: {} as KiloConnectionService,
      sessionID: "active",
      directory: () => "/repo",
      post: (message: unknown) => {
        posted.push(message)
      },
    }
    expect(await handleSessionReview({ type: "other" }, ctx)).toBe(false)
    expect(await handleSessionReview({ type: "sessionReview.load", sessionID: 1 }, ctx)).toBe(true)
    expect(posted).toEqual([])
  })
})
