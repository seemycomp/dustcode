import { expect } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionAdmission } from "@opencode-ai/core/kilocode/session-admission"
import { EventV2 } from "@opencode-ai/core/event"
import { Wakeup } from "../../src/kilocode/wakeup"
import { Storage } from "../../src/storage/storage"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Wakeup.layer.pipe(
    Layer.provide(Layer.succeed(Wakeup.Fire, { run: () => Effect.die("must not fire during transfer") })),
    Layer.provide(
      Layer.mock(EventV2Bridge.Service, {
        publish: (definition, data) => Effect.succeed({ id: EventV2.ID.create(), type: definition.type, data }),
      }),
    ),
    Layer.provideMerge(
      AppNodeBuilder.build(LayerNode.group([Storage.node, SessionAdmission.node]), [
        [Database.node, Database.layerFromPath(":memory:")],
      ]),
    ),
  ),
)

it.instance("a refused timer fire does not consume its persisted wakeup", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const wake = yield* Wakeup.Service
    const storage = yield* Storage.Service
    const info: Wakeup.Info = {
      id: Wakeup.ID.ascending(),
      sessionID: SessionID.descending(),
      directory: "/transfer",
      prompt: "retained",
      created: Date.now() - 2_000,
      dueAt: Date.now() - 1_000,
    }
    const key = ["wakeup", info.sessionID, info.id]
    yield* storage.write(key, info)
    yield* Effect.addFinalizer(() => storage.remove(key).pipe(Effect.orDie))
    yield* gate.reserve(
      [info.sessionID],
      "operation",
      Effect.gen(function* () {
        const result = yield* wake.adopt(info.directory).pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* storage.read(key)).toEqual(info)
        expect(
          Exit.isFailure(
            yield* wake
              .schedule({ sessionID: info.sessionID, directory: info.directory, prompt: "new work", delay: "1m" })
              .pipe(Effect.exit),
          ),
        ).toBe(true)
      }),
    )
  }),
)
