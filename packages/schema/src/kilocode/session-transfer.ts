import { Schema } from "effect"
import { Event } from "../event"
import { Session } from "../session"
import { SessionMessage } from "../session-message"
import { optional } from "../schema"

export const Retained = Event.define({
  type: "session.kilocode.transfer.retained",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { sessionID: Session.ID, messages: Schema.Array(SessionMessage.ID) },
})

export const Imported = Event.define({
  type: "session.kilocode.transfer.imported",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { sessionID: Session.ID, message: SessionMessage.Message, sequence: Schema.Int.pipe(optional) },
})
