import { and, eq, notInArray } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2 } from "../event"
import { SessionMessage } from "../session/message"
import { SessionInputTable, SessionMessageTable } from "../session/sql"
import type { Database } from "../database/database"
import * as Stored from "./session-message"
import { Imported, Retained } from "@opencode-ai/schema/kilocode/session-transfer"
export { Imported, Retained } from "@opencode-ai/schema/kilocode/session-transfer"


export const project = Effect.fn("SessionTransferNative.project")(function* (db: Database.Interface["db"], events: EventV2.Interface) {
  yield* events.project(Retained, (event) => Effect.gen(function* () {
    const selected = event.data.messages.length ? notInArray(SessionMessageTable.id, [...event.data.messages]) : undefined
    yield* db.delete(SessionMessageTable).where(and(eq(SessionMessageTable.session_id, event.data.sessionID), selected)).run().pipe(Effect.orDie)
    const inputs = event.data.messages.length ? notInArray(SessionInputTable.id, [...event.data.messages]) : undefined
    yield* db.delete(SessionInputTable).where(and(eq(SessionInputTable.session_id, event.data.sessionID), inputs)).run().pipe(Effect.orDie)
  }))
  yield* events.project(Imported, (event) => Effect.gen(function* () {
    if (!event.durable) return yield* Effect.die("Native transfer requires a durable event sequence")
    const encoded = Stored.encode(Schema.encodeSync(SessionMessage.Message)(event.data.message)) as typeof SessionMessage.Message.Encoded
    const { id, type, ...data } = encoded
    yield* db.insert(SessionMessageTable).values({
      id: SessionMessage.ID.make(id), type, session_id: event.data.sessionID,
      seq: event.data.sequence ?? event.durable.seq,
      data,
    }).onConflictDoUpdate({ target: SessionMessageTable.id, set: { data, type } }).run().pipe(Effect.orDie)
  }))
})
