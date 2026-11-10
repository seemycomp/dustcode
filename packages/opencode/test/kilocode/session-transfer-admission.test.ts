import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionAdmission } from "@opencode-ai/core/kilocode/session-admission"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionDrain } from "../../src/kilocode/session/drain"
import { InstanceRef } from "../../src/effect/instance-ref"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Session.node, SessionProjector.node, SessionAdmission.node, SessionDrain.node, Database.node]),
    [[Database.node, Database.layerFromPath(":memory:")]],
  ),
)

it.instance("a transfer refuses every public mutation before source state changes", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const gate = yield* SessionAdmission.Service
    const root = yield* sessions.create({ title: "source" })
    const message: SessionV1.User = {
      id: MessageID.ascending(),
      sessionID: root.id,
      role: "user",
      agent: "build",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created: 1 },
    }
    const part: SessionV1.TextPart = {
      id: PartID.ascending(),
      messageID: message.id,
      sessionID: root.id,
      type: "text",
      text: "retained",
    }
    yield* sessions.updateMessage(message)
    yield* sessions.updatePart(part)
    const before = yield* sessions.get(root.id)
    const transcript = yield* sessions.messages({ sessionID: root.id })
    yield* gate.reserve(
      [root.id],
      "operation",
      Effect.gen(function* () {
        const writes = [
          sessions.setTitle({ sessionID: root.id, title: "changed" }),
          sessions.setMetadata({ sessionID: root.id, metadata: { transfer: "changed" } }),
          sessions.setPermission({ sessionID: root.id, permission: [] }),
          sessions.setArchived({ sessionID: root.id, time: 100 }),
          sessions.touch(root.id),
          sessions.updateMessage({ ...message, agent: "changed" }),
          sessions.updatePart({ ...part, type: "text", text: "changed" }),
          sessions.removePart({ sessionID: root.id, messageID: message.id, partID: part.id }),
          sessions.removeMessage({ sessionID: root.id, messageID: message.id }),
          sessions.create({ parentID: root.id, title: "unexpected child" }),
          sessions.fork({ sessionID: root.id }),
          sessions.remove(root.id),
        ]
        for (const write of writes) expect(Exit.isFailure(yield* write.pipe(Effect.exit))).toBe(true)
        expect(yield* sessions.get(root.id)).toEqual(before)
        expect(yield* sessions.messages({ sessionID: root.id })).toEqual(transcript)
        expect(yield* sessions.children(root.id)).toEqual([])
      }),
    )
    yield* sessions.setTitle({ sessionID: root.id, title: "after transfer" })
    expect((yield* sessions.get(root.id)).title).toBe("after transfer")
  }),
)

it.instance("execution captured in a stale directory cannot admit work after relocation", () =>
  Effect.gen(function* () {
    yield* seedProject
    const ctx = yield* InstanceRef
    if (!ctx) return yield* Effect.die("missing test context")
    const sessions = yield* Session.Service
    const drain = yield* SessionDrain.Service
    const root = yield* sessions.create({ title: "source" })
    let ran = false
    yield* sessions.setMetadata({ sessionID: root.id, metadata: { "kilocode.transfer": { operationID: "moved" } } })
    const result = yield* drain
      .track(
        root.id,
        Effect.sync(() => {
          ran = true
        }),
      )
      .pipe(Effect.provideService(InstanceRef, { ...ctx, directory: `${ctx.directory}/other` }), Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(ran).toBe(false)
    expect((yield* sessions.get(root.id)).directory).toBe(ctx.directory)
  }),
)

it.instance("a stale source context cannot create children after relocation", () =>
  Effect.gen(function* () {
    yield* seedProject
    const ctx = yield* InstanceRef
    if (!ctx) return yield* Effect.die("missing test context")
    const sessions = yield* Session.Service
    const root = yield* sessions.create()
    yield* sessions.setMetadata({ sessionID: root.id, metadata: { "kilocode.transfer": { operationID: "moved" } } })
    const result = yield* sessions.create({ parentID: root.id }).pipe(
      Effect.provideService(InstanceRef, { ...ctx, directory: `${ctx.directory}/stale` }),
      Effect.exit,
    )
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* sessions.children(root.id)).toEqual([])
  }),
)
