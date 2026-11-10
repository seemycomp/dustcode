import { afterEach, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Session } from "../../src/session/session"
import { Database } from "@opencode-ai/core/database/database"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"
import { TestInstance, disposeAllInstances } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"

const it = testEffect(Layer.mergeAll(LayerNode.compile(LayerNode.group([Session.node, Database.node])), httpApiLayer))
afterEach(async () => { await disposeAllInstances(); await resetDatabase() })

it.instance("HTTP preview rejects missing and child roots without changing source conversation", () => Effect.gen(function* () {
  const dir = (yield* TestInstance).directory
  const sessions = yield* Session.Service
  const root = yield* sessions.create()
  const child = yield* sessions.create({ parentID: root.id })
  for (const sourceSessionID of ["ses_missing", child.id]) {
    const response = yield* requestInDirectory("/kilocode/session-transfer/preview", dir, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationID: "unauthorized", action: "copy", projectID: root.projectID, sourceSessionID, sourceDirectory: dir, targetDirectory: dir }) })
    expect(response.status).toBe(409)
    expect(yield* response.json).toMatchObject({ code: "unauthorized" })
  }
  expect(yield* sessions.get(root.id)).toEqual(root)
  expect(yield* sessions.children(root.id)).toHaveLength(1)
}), { timeout: 60_000 })

it.instance("HTTP commit and status refuse nonexistent operation receipts", () => Effect.gen(function* () {
  const dir = (yield* TestInstance).directory
  const response = yield* requestInDirectory("/kilocode/session-transfer/commit", dir, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationID: "missing" }) })
  expect(response.status).toBe(409)
  const status = yield* requestInDirectory("/kilocode/session-transfer/status/missing", dir)
  expect(status.status).toBe(409)
}), { timeout: 60_000 })
