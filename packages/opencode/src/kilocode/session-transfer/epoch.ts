import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { SessionTable } from "@opencode-ai/core/session/sql"
import type { SessionID } from "@/session/schema"

export const name = "kilocode.transfer"
export const Epoch = Schema.Struct({
  operationID: Schema.String,
  directory: Schema.String,
  baseline: Schema.String,
})
export type Epoch = typeof Epoch.Type

export const read = Effect.fn("SessionTransfer.readEpoch")(function* (id: SessionID) {
  const { db } = yield* Database.Service
  const row = yield* db
    .select({ metadata: SessionTable.metadata })
    .from(SessionTable)
    .where(eq(SessionTable.id, id))
    .get()
    .pipe(Effect.orDie)
  const value = row?.metadata?.[name]
  if (value == null) return undefined
  return yield* Schema.decodeUnknownEffect(Epoch)(value).pipe(Effect.orDie)
})

export const diffKey = Effect.fn("SessionTransfer.diffKey")(function* (id: SessionID, base = false) {
  const epoch = yield* read(id)
  if (epoch) return [base ? "session_diff_base_epoch" : "session_diff_epoch", id, epoch.operationID]
  return [base ? "session_diff_base" : "session_diff", id]
})
