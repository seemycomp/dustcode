import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Session } from "../../src/session/session"
import { SessionStatus } from "../../src/session/status"
import { InstanceStore } from "../../src/project/instance-store"
import { InstanceBootstrap } from "../../src/project/bootstrap-service"
import { Storage } from "../../src/storage/storage"
import { Wakeup } from "../../src/kilocode/wakeup"
import { family } from "../../src/kilocode/session-transfer/family"
import { idle, node } from "../../src/kilocode/session-transfer/activity"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

let boots = 0
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Session.node, SessionProjector.node, SessionStatus.node, Storage.node, Database.node, node]),
    [
      [Database.node, Database.layerFromPath(":memory:")],
      [
        InstanceStore.bootstrapNode,
        Layer.succeed(InstanceBootstrap.Service, {
          run: Effect.sync(() => {
            boots++
          }),
        }),
      ],
    ],
  ),
)

it.instance("an idle family passes without booting closed contexts", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const root = yield* sessions.create()
    const before = boots
    yield* idle([root])
    expect(boots).toBe(before)
  }),
)

it.instance("busy descendants block transfer without aborting them", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const status = yield* SessionStatus.Service
    const root = yield* sessions.create()
    const child = yield* sessions.create({ parentID: root.id })
    yield* status.set(child.id, { type: "busy" })
    const result = yield* idle((yield* family({ sessionID: root.id, projectID: root.projectID })).members).pipe(
      Effect.result,
    )
    expect(result._tag).toBe("Failure")
    expect(yield* status.get(child.id)).toEqual({ type: "busy" })
    yield* status.set(child.id, { type: "idle" })
  }),
)

it.instance("a waiting goal blocks transfer even with no active runner", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const root = yield* sessions.create({
      metadata: { "kilo.goal": { text: "deploy", status: "waiting", active: false } },
    })
    const before = yield* sessions.get(root.id)
    const result = yield* idle([before]).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(yield* sessions.get(root.id)).toEqual(before)
  }),
)

it.instance("persisted overdue work is rejected without booting or consuming it", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const storage = yield* Storage.Service
    const root = yield* sessions.create()
    const info: Wakeup.Info = {
      id: Wakeup.ID.ascending(),
      sessionID: root.id,
      directory: root.directory,
      prompt: "keep",
      created: 1,
      dueAt: 2,
    }
    const key = ["wakeup", root.id, info.id]
    yield* storage.write(key, info)
    yield* Effect.addFinalizer(() => storage.remove(key).pipe(Effect.orDie))
    const before = boots
    const result = yield* idle([root]).pipe(Effect.result)
    expect(boots).toBe(before)
    expect(result._tag).toBe("Failure")
    expect(yield* storage.read(key)).toEqual(info)
  }),
)
