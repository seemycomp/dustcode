import { Effect, Schema } from "effect"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Imported, Retained } from "@opencode-ai/core/kilocode/session-transfer-native"
import { Revert } from "@opencode-ai/schema/revert"
import type { DeepMutable } from "@opencode-ai/core/schema"
import type { EventV2 } from "@opencode-ai/core/event"
import type { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { TransferError } from "./repository"

export type Native = { sequence: number; message: SessionMessage.Message }

export const effective = Effect.fn("SessionTransfer.nativeEffective")(function* (session: Session.Info, messages: readonly Native[], inclusive = true) {
  const boundary = session.revert
  if (!boundary) return [...messages]
  const row = messages.find((row) => String(row.message.id) === boundary.messageID)
  if (!row) return yield* new TransferError({ code: "stale", detail: "The native Undo boundary is no longer present" })
  const revert = yield* Schema.decodeUnknownEffect(Revert.State)(boundary).pipe(Effect.mapError(() => new TransferError({ code: "stale", detail: "The native Undo boundary is invalid" })))
  if (revert.partID) return yield* new TransferError({ code: "unsupported", detail: "Part-level native Undo requires an explicit content boundary" })
  return messages.filter((value) => inclusive ? value.sequence <= row.sequence : value.sequence < row.sequence)
})

export function references(messages: readonly Native[]) {
  return messages.flatMap((row) => row.message.type !== "assistant" ? [] : row.message.content.flatMap((part) => {
    if (part.type !== "tool" || part.name !== "task" || part.state.status === "pending") return []
    const values = [part.state.input.task_id, part.state.structured.sessionId, part.state.structured.sessionID]
    return [...new Set(values.filter((value): value is string => typeof value === "string" && value !== ""))]
  }))
}

export function entries(input: { session: SessionID; messages: readonly Native[]; action: "move" | "copy"; sessions: ReadonlyMap<string, string> }) {
  const text = (value: string) => [...input.sessions].reduce((value, [from, to]) => value.replaceAll(from, to), value)
  const record = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value)
    .filter(([name]) => !["jobId", "background"].includes(name))
    .map(([name, value]) => [name, ["task_id", "sessionId", "sessionID", "parentSessionId", "parentSessionID"].includes(name) && typeof value === "string" ? input.sessions.get(value) ?? value : value]))
  const uri = (value: string) => value.startsWith("session:") && input.sessions.has(value.slice(8)) ? `session:${input.sessions.get(value.slice(8))}` : value
  const result: Parameters<EventV2.Interface["publishAll"]>[0][number][] = []
  if (input.action === "move") result.push({ definition: Retained, data: { sessionID: input.session, messages: input.messages.filter((row) => row.message.type !== "system").map((row) => row.message.id) } })
  for (const row of input.messages) {
    const message = Schema.decodeUnknownSync(SessionMessage.Message)(Schema.encodeSync(SessionMessage.Message)(row.message)) as DeepMutable<SessionMessage.Message>
    if (message.type === "system") continue
    if (input.action === "copy") message.id = SessionMessage.ID.create()
    if (message.type === "synthetic") message.sessionID = input.session
    if (input.action === "copy" && message.type === "user" && message.files) message.files = message.files.map((file) => ({ ...file, uri: uri(file.uri) }))
    if (message.type === "assistant") {
      delete message.snapshot
      if (input.action === "copy") {
        message.cost = 0
        message.content = message.content.map((part) => {
          const value = { ...part }
          value.id = crypto.randomUUID()
          if (value.type === "tool" && value.state.status === "completed" && value.state.attachments) value.state.attachments = value.state.attachments.map((file) => ({ ...file, uri: uri(file.uri) }))
          if (value.type === "tool" && value.name === "task" && value.state.status !== "pending") {
            value.state.input = record(value.state.input)
            value.state.structured = record(value.state.structured)
            value.state.content = value.state.content.map((part) => part.type === "text" ? { ...part, text: text(part.text) } : part)
            if (value.state.status === "error") value.state.error.message = text(value.state.error.message)
          }
          return value
        })
      }
    }
    result.push({ definition: Imported, data: { sessionID: input.session, message, ...(input.action === "move" ? { sequence: row.sequence } : {}) } })
  }
  return result
}
