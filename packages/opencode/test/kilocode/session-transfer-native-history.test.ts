import { expect } from "bun:test"
import { DateTime, Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import path from "node:path"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionMessageTable } from "@opencode-ai/core/session/sql"
import { Session } from "../../src/session/session"
import { MessageID } from "../../src/session/schema"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { stage } from "../../src/kilocode/session-transfer/stage"
import { effective } from "../../src/kilocode/session-transfer/native"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Session.node, SessionProjector.node, EventV2Bridge.node, Database.node]), [[Database.node, Database.layerFromPath(":memory:")]]))

it.instance("copies native history through durable imports without carrying source checkpoints", () => Effect.gen(function* () {
  yield* seedProject
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const { db } = yield* Database.Service
  const root = yield* sessions.create()
  const time = { created: DateTime.makeUnsafe(1) }
  const user: SessionMessage.User = { type: "user", id: SessionMessage.ID.create(), text: "retained native prompt", time }
  const assistant: SessionMessage.Assistant = { type: "assistant", id: SessionMessage.ID.create(), agent: "build", model: { providerID: ProviderV2.ID.make("test"), id: ModelV2.ID.make("test") }, content: [{ type: "text", id: "text", text: "native result" }], cost: 3, snapshot: { start: "source-only", end: "source-end" }, time }
  const source = { info: root, messages: [], native: [{ sequence: 1, message: user }, { sequence: 2, message: assistant }] }
  const result = yield* stage({ action: "copy", root: root.id, target: path.join(root.directory, "target"), transcripts: [source], operationID: "native" })
  yield* events.publishAll(result.entries)
  const rows = yield* db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, result.root)).all().pipe(Effect.orDie)
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.seq != null)).toBe(true)
  expect(rows.map((row) => row.id)).not.toContain(user.id)
  expect(rows.find((row) => row.type === "assistant")?.data).toMatchObject({ cost: 0 })
  expect(rows.find((row) => row.type === "assistant")?.data).not.toHaveProperty("snapshot")
  expect(source.native.at(1)?.message).toHaveProperty("snapshot")
}))

it.instance("preserves opaque native tool input and output while copying", () => Effect.gen(function* () {
  yield* seedProject
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const { db } = yield* Database.Service
  const root = yield* sessions.create()
  const time = { created: DateTime.makeUnsafe(1) }
  const state = { status: "completed" as const, input: { content: root.id, background: true }, content: [{ type: "text" as const, text: `reference ${root.id}` }], structured: { jobId: root.id }, result: { value: root.id } }
  const assistant: SessionMessage.Assistant = { type: "assistant", id: SessionMessage.ID.create(), agent: "build", model: { providerID: ProviderV2.ID.make("test"), id: ModelV2.ID.make("test") }, content: [{ type: "tool", id: "write", name: "write", state, time }], time }
  const result = yield* stage({ action: "copy", root: root.id, target: path.join(root.directory, "target"), transcripts: [{ info: root, messages: [], native: [{ sequence: 1, message: assistant }] }], operationID: "opaque" })
  yield* events.publishAll(result.entries)
  const row = yield* db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, result.root)).get().pipe(Effect.orDie)
  expect(row?.data).toMatchObject({ content: [{ state }] })
}))

it.instance("rejects a native Undo boundary that cannot be resolved", () => Effect.gen(function* () {
  yield* seedProject
  const sessions = yield* Session.Service
  const root = yield* sessions.create()
  const result = yield* effective({ ...root, revert: { messageID: MessageID.ascending() } }, [], true).pipe(Effect.exit)
  expect(Exit.isFailure(result)).toBe(true)
}))
