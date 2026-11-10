import { expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "../../src/database/database"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { TransferReceipt } from "../../src/kilocode/transfer-receipt"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([TransferReceipt.node, Database.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
  ]),
)

it.effect("retries the same operation without creating another receipt", () =>
  Effect.gen(function* () {
    const receipt = yield* TransferReceipt.Service
    const input = {
      operationID: "op-1",
      fingerprint: "fp",
      action: "copy" as const,
      source: "source",
      target: "target",
    }
    const first = yield* receipt.prepare(input)
    const second = yield* receipt.prepare(input)
    expect(second).toEqual(first)
    expect(
      (yield* receipt.update({ operationID: input.operationID, status: "committed", result: "session" })).status,
    ).toBe("committed")
    expect((yield* receipt.get(input.operationID))?.result).toBe("session")
  }),
)

it.effect("rejects an operation ID reused for different transfer bytes", () =>
  Effect.gen(function* () {
    const receipt = yield* TransferReceipt.Service
    yield* receipt.prepare({
      operationID: "op-2",
      fingerprint: "one",
      action: "copy",
      source: "source",
      target: "target",
    })
    const result = yield* receipt
      .prepare({ operationID: "op-2", fingerprint: "two", action: "copy", source: "source", target: "target" })
      .pipe(Effect.result)
    expect(result._tag).toBe("Failure")
  }),
)

it.effect("concurrent retries converge and a committed receipt cannot be downgraded", () =>
  Effect.gen(function* () {
    const receipt = yield* TransferReceipt.Service
    const input = {
      operationID: "op-concurrent",
      fingerprint: "same",
      action: "copy" as const,
      source: "source",
      target: "target",
    }
    const results = yield* Effect.all([receipt.prepare(input), receipt.prepare(input)], { concurrency: 2 })
    expect(results.at(0)).toEqual(results.at(1))
    yield* receipt.update({ operationID: input.operationID, status: "committed", result: "original" })
    const update = yield* receipt
      .update({ operationID: input.operationID, status: "applying", result: "replacement" })
      .pipe(Effect.exit)
    expect(update._tag).toBe("Failure")
    expect((yield* receipt.get(input.operationID))?.result).toBe("original")
  }),
)
