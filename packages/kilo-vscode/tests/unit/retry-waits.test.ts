import { describe, expect, it } from "bun:test"
import { RetryWaits } from "../../src/util/retry"

describe("RetryWaits", () => {
  it("wakes only the matching session wait once, including during status publication", async () => {
    const waits = new RetryWaits()
    const signal = new AbortController().signal
    const info = { attempt: 1, next: Date.now() + 120_000 }
    await waits.wait("a", info, signal, () => {
      expect(waits.retry("b", info)).toBe(false)
      expect(waits.retry("a", { ...info, next: info.next - 1 })).toBe(false)
      expect(waits.retry("a", info)).toBe(true)
      expect(waits.retry("a", info)).toBe(false)
    })
    expect(waits.retry("a", info)).toBe(false)
  })

  it("removes cancelled waits without consuming a later backoff", async () => {
    const waits = new RetryWaits()
    const controller = new AbortController()
    const info = { attempt: 1, next: Date.now() + 120_000 }
    await waits.wait("a", info, controller.signal, () => controller.abort())
    expect(waits.retry("a", info)).toBe(false)
    const next = { attempt: 2, next: info.next + 1000 }
    await waits.wait("a", next, new AbortController().signal, () => {
      expect(waits.retry("a", info)).toBe(false)
      expect(waits.retry("a", next)).toBe(true)
    })
  })

  it("keeps automatic expiry and handles an already cancelled signal", async () => {
    const waits = new RetryWaits()
    const info = { attempt: 1, next: Date.now() }
    await waits.wait("a", info, new AbortController().signal, () => undefined)
    expect(waits.retry("a", info)).toBe(false)
    await waits.wait("a", { ...info, next: Date.now() + 120_000 }, AbortSignal.abort(), () => undefined)
    expect(waits.retry("a", info)).toBe(false)
  })
})
