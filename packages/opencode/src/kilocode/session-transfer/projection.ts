import { Effect } from "effect"
import type { MessageV2 } from "@/session/message-v2"
import type { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { TransferError } from "./repository"

export type Effective = {
  info: Session.Info
  messages: MessageV2.WithParts[]
}

const strip = (part: MessageV2.Part): MessageV2.Part | undefined => {
  if (part.type === "snapshot" || part.type === "patch") return undefined
  if (part.type === "step-start" || part.type === "step-finish") {
    const next = structuredClone(part)
    delete next.snapshot
    return next
  }
  return structuredClone(part)
}

/** Purely projects a readable V1 conversation; it never calls source cleanup/revert. */
export const effective = Effect.fn("SessionTransfer.effective")(function* (input: {
  session: Session.Info
  messages: readonly MessageV2.WithParts[]
  action?: "move" | "copy"
}) {
  const boundary = input.session.revert
  let source = input.messages.map((message) => ({
    info: structuredClone(message.info),
    parts: message.parts.map((part) => structuredClone(part)),
  }))
  if (boundary) {
    const index = source.findIndex((message) => message.info.id === boundary.messageID)
    if (index < 0)
      return yield* new TransferError({ code: "stale", detail: "The session Undo boundary no longer exists" })
    if (!boundary.partID) {
      source = source.slice(0, index)
    } else {
      const message = source[index]
      if (!message)
        return yield* new TransferError({ code: "stale", detail: "The session Undo message no longer exists" })
      const part = message.parts.findIndex((value) => value.id === boundary.partID)
      if (part < 0) return yield* new TransferError({ code: "stale", detail: "The session Undo part no longer exists" })
      message.parts = message.parts.slice(0, part)
      source = source.slice(0, index + 1)
      if (message.info.role === "assistant" && message.info.error) delete message.info.error
    }
  }
  const messages = source.flatMap((message) => {
    const parts = message.parts.flatMap((part) => {
      const next = strip(part)
      if (!next) return []
      if (next.type === "text" && next.metadata?.["kilocode.lifecycle"] === "transient") return []
      if (input.action !== "move" && next.type === "step-finish") next.cost = 0
      if (
        next.type === "compaction" &&
        next.tail_start_id &&
        !source.some((item) => item.info.id === next.tail_start_id)
      )
        return []
      return [next]
    })
    const info = structuredClone(message.info)
    if (info.role === "user" && info.summary) info.summary.diffs = []
    if (info.role === "assistant" && input.action !== "move") {
      info.cost = 0
    }
    return [{ info, parts }]
  })
  return {
    info: {
      ...structuredClone(input.session),
      revert: undefined,
      summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
    },
    messages,
  } satisfies Effective
})

export const remap = (
  input: Effective,
  sessions: ReadonlyMap<string, string>,
  messages: ReadonlyMap<string, string>,
  parts: ReadonlyMap<string, string>,
): Effective => {
  const text = (value: string) => [...sessions].reduce((result, [from, to]) => result.replaceAll(from, to), value)
  const mapRecord = (value: Record<string, unknown> | undefined) => {
    if (!value) return value
    const next = { ...value }
    delete next.background
    delete next.jobId
    for (const name of ["sessionId", "sessionID", "parentSessionId", "parentSessionID", "task_id"]) {
      if (typeof next[name] === "string" && sessions.has(next[name])) next[name] = sessions.get(next[name])
    }
    return next
  }
  const attachment = (part: MessageV2.FilePart): MessageV2.FilePart => ({
    ...structuredClone(part),
    id: PartID.make(parts.get(part.id) ?? part.id),
    messageID: MessageID.make(messages.get(part.messageID) ?? part.messageID),
    sessionID: SessionID.make(sessions.get(part.sessionID) ?? part.sessionID),
    url:
      part.url.startsWith("session:") && sessions.has(part.url.slice(8))
        ? `session:${sessions.get(part.url.slice(8))}`
        : part.url,
  })
  return {
    info: {
      ...structuredClone(input.info),
      id: SessionID.make(sessions.get(input.info.id) ?? input.info.id),
      parentID:
        input.info.parentID && sessions.has(input.info.parentID)
          ? SessionID.make(sessions.get(input.info.parentID)!)
          : undefined,
    },
    messages: input.messages.map((message) => ({
      info: {
        ...structuredClone(message.info),
        id: MessageID.make(messages.get(message.info.id) ?? message.info.id),
        sessionID: SessionID.make(sessions.get(message.info.sessionID) ?? message.info.sessionID),
        ...(message.info.role === "assistant"
          ? { parentID: MessageID.make(messages.get(message.info.parentID) ?? message.info.parentID) }
          : {}),
      },
      parts: message.parts.map((part) => {
        if (part.type === "file") return attachment(part)
        const next = structuredClone(part)
        next.id = PartID.make(parts.get(part.id) ?? part.id)
        next.messageID = MessageID.make(messages.get(part.messageID) ?? part.messageID)
        next.sessionID = SessionID.make(sessions.get(part.sessionID) ?? part.sessionID)
        if (next.type === "compaction" && next.tail_start_id)
          next.tail_start_id = MessageID.make(messages.get(next.tail_start_id) ?? next.tail_start_id)
        if (next.type === "tool" && next.state.status === "completed" && next.state.attachments) {
          next.state.attachments = next.state.attachments.map(attachment)
        }
        if (next.type === "tool" && next.tool === "task") {
          next.metadata = mapRecord(next.metadata)
          next.state.input = mapRecord(next.state.input) ?? next.state.input
          if (next.state.status !== "pending") next.state.metadata = mapRecord(next.state.metadata)
          if (next.state.status === "completed") next.state.output = text(next.state.output)
          if (next.state.status === "error") next.state.error = text(next.state.error)
        }
        return next
      }),
    })),
  }
}
