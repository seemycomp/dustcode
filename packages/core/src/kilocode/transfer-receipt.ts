import { Context, Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"

export * as TransferReceipt from "./transfer-receipt"

export const ReceiptTable = sqliteTable(
  "kilo_session_transfer_receipt",
  {
    operation_id: text().notNull(),
    fingerprint: text().notNull(),
    status: text().$type<"prepared" | "applying" | "committed" | "recovery">().notNull(),
    action: text().$type<"move" | "copy">().notNull(),
    source: text().notNull(),
    target: text().notNull(),
    result: text(),
    preimage: text(),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.operation_id] })],
)

export class Conflict extends Schema.TaggedErrorClass<Conflict>()("TransferReceiptConflict", {
  operationID: Schema.String,
}) {}

export interface Info {
  operationID: string
  fingerprint: string
  action: "move" | "copy"
  source: string
  target: string
  status: "prepared" | "applying" | "committed" | "recovery"
  result?: string
  preimage?: string
}

export interface Interface {
  readonly get: (operationID: string) => Effect.Effect<Info | undefined>
  readonly prepare: (input: Omit<Info, "status">) => Effect.Effect<Info, Conflict>
  readonly update: (input: {
    operationID: string
    status: Info["status"]
    result?: string
    preimage?: string
  }) => Effect.Effect<Info>
}

export class Service extends Context.Service<Service, Interface>()("@kilocode/TransferReceipt") {}

export const make = Effect.fn("TransferReceipt.make")(function* (db: Database.Interface["db"]) {
  yield* db
    .run(
      "CREATE TABLE IF NOT EXISTS kilo_session_transfer_receipt (operation_id text PRIMARY KEY NOT NULL, fingerprint text NOT NULL, status text NOT NULL, action text NOT NULL, source text NOT NULL, target text NOT NULL, result text, preimage text, created_at integer NOT NULL, updated_at integer NOT NULL)",
    )
    .pipe(Effect.orDie)
  const get = Effect.fn("TransferReceipt.get")(function* (operationID: string) {
    const row = yield* db
      .select()
      .from(ReceiptTable)
      .where(eq(ReceiptTable.operation_id, operationID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return {
      operationID: row.operation_id,
      fingerprint: row.fingerprint,
      action: row.action,
      source: row.source,
      target: row.target,
      status: row.status,
      ...(row.result == null ? {} : { result: row.result }),
      ...(row.preimage == null ? {} : { preimage: row.preimage }),
    } satisfies Info
  })
  const prepare = (input: Omit<Info, "status">) =>
    db
      .transaction(
        () =>
          Effect.gen(function* () {
            const current = yield* get(input.operationID)
            if (current) {
              if (
                current.fingerprint !== input.fingerprint ||
                current.action !== input.action ||
                current.source !== input.source ||
                current.target !== input.target
              )
                return yield* new Conflict({ operationID: input.operationID })
              return current
            }
            const now = Date.now()
            yield* db
              .insert(ReceiptTable)
              .values({
                operation_id: input.operationID,
                fingerprint: input.fingerprint,
                status: "prepared",
                action: input.action,
                source: input.source,
                target: input.target,
                result: input.result,
                preimage: input.preimage,
                created_at: now,
                updated_at: now,
              })
              .run()
              .pipe(Effect.orDie)
            const created = yield* get(input.operationID)
            if (!created) return yield* Effect.die(`Missing transfer receipt: ${input.operationID}`)
            return created
          }),
        { behavior: "immediate" },
      )
      .pipe(Effect.catchTag("SqlError", Effect.die))
  const update = (input: { operationID: string; status: Info["status"]; result?: string; preimage?: string }) =>
    db
      .transaction(
        () =>
          Effect.gen(function* () {
            const current = yield* get(input.operationID)
            if (!current) return yield* Effect.die(`Missing transfer receipt: ${input.operationID}`)
            if (current.status === "committed") {
              if (input.status !== "committed" || (input.result != null && input.result !== current.result))
                return yield* Effect.die(new Conflict({ operationID: input.operationID }))
              return current
            }
            yield* db
              .update(ReceiptTable)
              .set({ status: input.status, result: input.result, preimage: input.preimage, updated_at: Date.now() })
              .where(eq(ReceiptTable.operation_id, input.operationID))
              .run()
              .pipe(Effect.orDie)
            const next = yield* get(input.operationID)
            if (!next) return yield* Effect.die(`Missing transfer receipt: ${input.operationID}`)
            return next
          }),
        { behavior: "immediate" },
      )
      .pipe(Effect.orDie)
  return Service.of({ get, prepare, update })
})

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.flatMap(Database.Service, (database) => make(database.db)),
  ),
  deps: [Database.node],
})
