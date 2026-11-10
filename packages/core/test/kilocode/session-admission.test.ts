import { expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber } from "effect"
import { sql } from "drizzle-orm"
import { TransferReceipt } from "../../src/kilocode/transfer-receipt"
import { Database } from "../../src/database/database"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { SessionAdmission } from "../../src/kilocode/session-admission"
import { SessionRunCoordinator } from "../../src/session/run-coordinator"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([SessionAdmission.node, Database.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
  ]),
)

it.effect("rejects transfer immediately while accepted work holds any family member", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const release = yield* gate.hold(["child"])
    const result = yield* gate.reserve(["root", "child"], "operation", Effect.void).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    yield* release
    expect(yield* gate.reserve(["root", "child"], "operation", Effect.succeed("ready"))).toBe("ready")
  }),
)

it.effect("blocks work and overlapping transfers but permits unrelated sessions", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    yield* gate.reserve(
      ["root", "child"],
      "operation",
      Effect.gen(function* () {
        expect(Exit.isFailure(yield* gate.work(["child"], Effect.void).pipe(Effect.exit))).toBe(true)
        expect(Exit.isFailure(yield* gate.reserve(["child", "other"], "second", Effect.void).pipe(Effect.exit))).toBe(
          true,
        )
        expect(yield* gate.work(["unrelated"], Effect.succeed("ready"))).toBe("ready")
      }),
    )
    expect(yield* gate.work(["child"], Effect.succeed("released"))).toBe("released")
  }),
)

it.effect("failed overlapping acquisition does not leave a partial family reservation", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const release = yield* gate.hold(["child"])
    yield* gate.reserve(["root", "child"], "operation", Effect.void).pipe(Effect.exit)
    expect(yield* gate.reserve(["root"], "second", Effect.succeed(true))).toBe(true)
    yield* release
  }),
)

it.effect("nested normal work remains composable and every hold must release", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const first = yield* gate.hold(["root", "root"])
    const second = yield* gate.hold(["root"])
    yield* first
    yield* first
    expect(Exit.isFailure(yield* gate.reserve(["root"], "operation", Effect.void).pipe(Effect.exit))).toBe(true)
    yield* second
    expect(yield* gate.reserve(["root"], "operation", Effect.succeed(true))).toBe(true)
  }),
)

it.effect("releases reservation on defects without swallowing the failure", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const result = yield* gate.reserve(["root"], "operation", Effect.die("failure")).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* gate.work(["root"], Effect.succeed(true))).toBe(true)
  }),
)

it.effect("independently built service instances share database admission", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const first = yield* SessionAdmission.make(database.db)
    const second = yield* SessionAdmission.make(database.db)
    const release = yield* first.hold(["root"])
    expect(Exit.isFailure(yield* second.reserve(["root"], "operation", Effect.void).pipe(Effect.exit))).toBe(true)
    yield* release
    expect(yield* second.reserve(["root"], "operation", Effect.succeed(true))).toBe(true)
  }),
)

it.effect("native execution retains admission after its waiting caller is interrupted", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const started = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const coordinator = yield* SessionRunCoordinator.make({
      lease: (id: string) => gate.lease([id]),
      drain: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))),
    })
    const caller = yield* coordinator.run("native").pipe(Effect.forkChild)
    yield* Deferred.await(started)
    yield* Fiber.interrupt(caller)
    expect(Exit.isFailure(yield* gate.reserve(["native"], "operation", Effect.void).pipe(Effect.exit))).toBe(true)
    yield* Deferred.succeed(finish, undefined)
    yield* coordinator.interrupt("native")
  }),
)

it.effect("an unresolved recovery retains exclusion until its operation explicitly recovers", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    yield* gate
      .reserve(["root"], "recoverable", Effect.die("interrupted apply"), Effect.succeed(true))
      .pipe(Effect.exit)
    expect(Exit.isFailure(yield* gate.work(["root"], Effect.void).pipe(Effect.exit))).toBe(true)
    expect(Exit.isFailure(yield* gate.recover(["root"], "other", Effect.void).pipe(Effect.exit))).toBe(true)
    yield* gate.recover(["root"], "recoverable", Effect.void)
    expect(yield* gate.work(["root"], Effect.succeed(true))).toBe(true)
  }),
)

it.effect("reclaims a dead preview or pre-apply reservation without discarding applied-file ownership", () =>
  Effect.gen(function* () {
    const gate = yield* SessionAdmission.Service
    const { db } = yield* Database.Service
    const receipts = yield* TransferReceipt.make(db)
    for (const status of [undefined, "prepared", "applying", "recovery", "committed"] as const) {
      const id = status ?? "unpublished"
      if (status) {
        yield* receipts.prepare({ operationID: id, fingerprint: id, action: "move", source: "a", target: "b" })
        if (status !== "prepared") yield* receipts.update({ operationID: id, status })
      }
      yield* db.run(sql`INSERT INTO kilo_session_lease (session_id, token, pid, kind, operation) VALUES (${id}, ${id}, 2147483647, 'transfer', ${id})`).pipe(Effect.orDie)
      const result = yield* gate.work([id], Effect.succeed(true)).pipe(Effect.exit)
      expect(Exit.isSuccess(result)).toBe(status !== "applying" && status !== "recovery")
      if (status === "applying" || status === "recovery") yield* gate.recover([id], id, Effect.void)
    }
  }),
)
