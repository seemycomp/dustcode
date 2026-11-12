import { expect, it } from "bun:test"
import { deadline } from "../fixtures/deadline"

it("settles the complete operation after cancellation before rejecting its deadline", async () => {
  const gate = Promise.withResolvers<void>()
  const settled = Promise.withResolvers<void>()
  const calls: string[] = []
  const pending = deadline(
    async () => {
      await gate.promise
      calls.push("cancelled")
      await settled.promise
      calls.push("settled")
    },
    () => {
      calls.push("stop")
      gate.resolve()
    },
    10,
  ).finally(() => calls.push("returned"))
  const rejected = pending.then(
    () => undefined,
    (err: unknown) => err,
  )
  await gate.promise
  expect(calls).toEqual(["stop", "cancelled"])
  settled.resolve()
  const err = await rejected
  expect(err).toBeInstanceOf(Error)
  expect((err as Error).message).toContain("Fixture deadline exceeded")
  expect(calls).toEqual(["stop", "cancelled", "settled", "returned"])
})

it("clears the deadline when an operation fails without replacing its error", async () => {
  const err = new Error("operation failed")
  const pending = deadline(
    async () => {
      throw err
    },
    () => {
      throw new Error("unexpected cancellation")
    },
    10,
  )
  await expect(pending).rejects.toBe(err)
})
