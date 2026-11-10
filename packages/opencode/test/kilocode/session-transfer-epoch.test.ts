import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Session } from "../../src/session/session"
import { SessionSummary } from "../../src/session/summary"
import { Config } from "../../src/config/config"
import { Storage } from "../../src/storage/storage"
import * as SandboxPolicy from "../../src/kilocode/sandbox/policy"
import { SandboxStore } from "../../src/kilocode/sandbox/store"
import * as Epoch from "../../src/kilocode/session-transfer/epoch"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Session.node,
      SessionProjector.node,
      SessionSummary.node,
      Storage.node,
      Config.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(":memory:")]],
  ),
)

it.instance("committed epoch ignores stale directory confinement and legacy cumulative diffs", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const storage = yield* Storage.Service
    const summary = yield* SessionSummary.Service
    const root = yield* sessions.create()
    yield* Effect.promise(() =>
      SandboxStore.write(root.directory, root.id, {
        enabled: false,
        mode: "allow",
        allowedHosts: [],
        writablePaths: [root.directory],
        version: 999,
      }),
    )
    yield* Effect.addFinalizer(() => Effect.promise(() => SandboxStore.dispose(root.id)))
    yield* storage.write(["session_diff", root.id], [{ file: "source-only", additions: 5, deletions: 0 }])
    const epoch: Epoch.Epoch = {
      operationID: "operation",
      directory: root.directory,
      baseline: "destination-snapshot",
    }
    yield* Effect.promise(() => SandboxStore.write(root.directory, root.id, { enabled: true, mode: "deny", allowedHosts: [], writablePaths: [], version: 1, epoch: "operation" }))
    yield* sessions.setMetadata({ sessionID: root.id, metadata: { [Epoch.name]: epoch } })
    const policy = yield* SandboxPolicy.peek(root.directory, root.id)
    expect(policy).toMatchObject({ enabled: true, mode: "deny", writablePaths: [], epoch: "operation" })
    expect(yield* summary.diff({ sessionID: root.id })).toEqual([])
    expect(yield* storage.read(["session_diff", root.id])).toEqual([
      { file: "source-only", additions: 5, deletions: 0 },
    ])
    yield* storage.write(yield* Epoch.diffKey(root.id), [{ file: "new-change", additions: 1, deletions: 0 }])
    expect(yield* summary.diff({ sessionID: root.id })).toEqual([{ file: "new-change", additions: 1, deletions: 0 }])
  }),
)

it.instance("forged epoch metadata cannot disable protected sandbox authority", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const root = yield* sessions.create()
    yield* Effect.addFinalizer(() => Effect.promise(() => SandboxStore.dispose(root.id)))
    yield* Effect.promise(() => SandboxStore.write(root.directory, root.id, { enabled: true, mode: "deny", allowedHosts: [], writablePaths: [], version: 1 }))
    yield* sessions.setMetadata({ sessionID: root.id, metadata: { [Epoch.name]: { operationID: "forged", directory: root.directory, baseline: "fake", sandbox: { enabled: false, mode: "allow", allowedHosts: [], writablePaths: ["/"], version: 100, epoch: "forged" } } } })
    const result = yield* SandboxPolicy.peek(root.directory, root.id).pipe(Effect.exit)
    expect(Exit.isFailure(result) || (Exit.isSuccess(result) && result.value?.enabled === true)).toBe(true)
  }),
)
