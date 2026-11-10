import { DateTime, Effect } from "effect"
import { Slug } from "@opencode-ai/core/util/slug"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionEvent } from "@opencode-ai/core/session/event"
import type { EventV2 } from "@opencode-ai/core/event"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Session } from "@/session/session"
import type { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { effective, remap, type Effective } from "./projection"
import { key, TransferError } from "./repository"
import * as Native from "./native"

export type Transcript = { info: Session.Info; messages: MessageV2.WithParts[]; native?: Native.Native[]; nativeRevert?: boolean }

export const stage = Effect.fn("SessionTransfer.stage")(function* (input: {
  action: "move" | "copy"
  root: SessionID
  target: string
  transcripts: Transcript[]
  operationID: string
}) {
  const root = input.transcripts.find((item) => item.info.id === input.root)
  if (!root || root.info.parentID != null)
    return yield* new TransferError({ code: "unauthorized", detail: "Transfer root is unavailable" })
  const sources = new Map(input.transcripts.map((item) => [item.info.id, item]))
  const projected = new Map<SessionID, Effective>()
  const native = new Map<SessionID, Native.Native[]>()
  const pending = [input.root]
  const visited = new Set<SessionID>()
  if (input.action === "move")
    pending.push(
      ...input.transcripts
        .filter((item) => item.info.id !== input.root && key(item.info.directory) === key(root.info.directory))
        .map((item) => item.info.id),
    )
  while (pending.length) {
    const id = pending.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    const source = sources.get(id)
    if (!source) return yield* new TransferError({ code: "stale", detail: "A retained child conversation is missing" })
    const undo = source.info.revert
    const boundary = undo && source.native?.find((row) => String(row.message.id) === undo.messageID)
    const legacy = undo && source.messages.find((row) => row.info.id === undo.messageID)
    if (undo && !boundary && !legacy) return yield* new TransferError({ code: "stale", detail: "The effective Undo boundary no longer exists" })
    const current = !!boundary && (!legacy || source.nativeRevert === true)
    const v1 = current && undo ? source.messages.filter((row) => row.info.id === undo.messageID || row.info.time.created < DateTime.toEpochMillis(boundary.message.time.created)) : source.messages
    const result = yield* effective({ session: current ? { ...source.info, revert: undefined } : source.info, messages: v1, action: input.action })
    const retained = undo && !boundary && legacy ? (source.native ?? []).filter((row) => DateTime.toEpochMillis(row.message.time.created) < legacy.info.time.created) : source.native ?? []
    const rows = yield* Native.effective(source.info, retained, current)
    native.set(id, rows)
    projected.set(id, result)
    if (input.action === "move") continue
    for (const ref of Native.references(rows)) {
      const child = sources.get(SessionID.make(ref))
      if (!child || child.info.parentID !== id) return yield* new TransferError({ code: "unauthorized", detail: "A native task references an unauthorized private child" })
      if (!visited.has(child.info.id)) pending.push(child.info.id)
    }
    for (const message of result.messages) {
      for (const part of message.parts) {
        if (part.type !== "tool" || part.tool !== "task") continue
        const state = part.state.status === "pending" ? undefined : part.state.metadata
        const refs = [
          ...new Set(
            [
              state?.sessionId,
              state?.sessionID,
              part.metadata?.sessionId,
              part.metadata?.sessionID,
              part.state.input.task_id,
            ].filter((value): value is string => typeof value === "string" && value !== ""),
          ),
        ]
        if (!refs.length) continue
        const child = refs.length === 1 ? sources.get(SessionID.make(refs.at(0)!)) : undefined
        if (
          !child ||
          child.info.parentID !== id ||
          child.info.projectID !== root.info.projectID ||
          child.info.workspaceID != null
        )
          return yield* new TransferError({
            code: "unauthorized",
            detail: "A retained task references a missing or unauthorized private child",
          })
        if (!visited.has(child.info.id)) pending.push(child.info.id)
      }
    }
  }
  const sessions = new Map([...projected.keys()].map((id) => [id, input.action === "copy" ? SessionID.create() : id]))
  const messages = new Map(
    [...projected.values()].flatMap((item) =>
      item.messages.map(
        (message) => [message.info.id, input.action === "copy" ? MessageID.ascending() : message.info.id] as const,
      ),
    ),
  )
  const parts = new Map<string, string>()
  for (const item of projected.values()) {
    for (const message of item.messages) {
      if (message.info.role === "assistant" && !messages.has(message.info.parentID))
        return yield* new TransferError({
          code: "stale",
          detail: "A retained assistant has no retained parent message",
        })
      for (const part of message.parts) {
        parts.set(part.id, input.action === "copy" ? PartID.ascending() : part.id)
        if (part.type === "tool" && part.state.status === "completed") {
          for (const attachment of part.state.attachments ?? [])
            if (!parts.has(attachment.id))
              parts.set(attachment.id, input.action === "copy" ? PartID.ascending() : attachment.id)
        }
      }
    }
  }
  const entries: Parameters<EventV2.Interface["publishAll"]>[0][number][] = []
  const timestamp = yield* DateTime.now
  const now = DateTime.toEpochMillis(timestamp)
  const members: Session.Info[] = []
  for (const [id, value] of projected) {
    const source = sources.get(id)!
    const mapped = input.action === "copy" ? remap(value, sessions, messages, parts) : value
    const metadata = { ...mapped.info.metadata }
    delete metadata["kilo.goal"]
    const info: Session.Info = {
      ...mapped.info,
      id: sessions.get(id)!,
      directory: input.target,
      path: undefined,
      workspaceID: undefined,
      parentID: id === input.root && input.action === "copy" ? undefined : mapped.info.parentID,
      ...(input.action === "copy"
        ? {
            slug: Slug.create(),
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            share: undefined,
          }
        : {}),
      metadata,
      time: { created: input.action === "copy" ? now : mapped.info.time.created, updated: now },
    }
    members.push(info)
    entries.push({
      definition: input.action === "copy" ? SessionV1.Event.Created : SessionV1.Event.Updated,
      data: { sessionID: info.id, info },
    })
    if (input.action === "move") {
      const retained = new Map(value.messages.map((message) => [message.info.id, message]))
      for (const message of source.messages) {
        const next = retained.get(message.info.id)
        if (!next) {
          entries.push({
            definition: SessionV1.Event.MessageRemoved,
            data: { sessionID: id, messageID: message.info.id },
          })
          continue
        }
        const kept = new Set(next.parts.map((part) => part.id))
        for (const part of message.parts)
          if (!kept.has(part.id))
            entries.push({
              definition: SessionV1.Event.PartRemoved,
              data: { sessionID: id, messageID: message.info.id, partID: part.id },
            })
      }
    }
    for (const message of mapped.messages) {
      if (message.info.role === "assistant") message.info.path = { cwd: input.target, root: input.target }
      entries.push({ definition: SessionV1.Event.MessageUpdated, data: { sessionID: info.id, info: message.info } })
      for (const part of message.parts)
        entries.push({ definition: SessionV1.Event.PartUpdated, data: { sessionID: info.id, part, time: now } })
    }
    entries.push(...Native.entries({ session: info.id, messages: native.get(id) ?? [], action: input.action, sessions }))
    if (input.action === "move")
      entries.push({
        definition: SessionEvent.Moved,
        data: { sessionID: info.id, timestamp, location: { directory: AbsolutePath.make(input.target) } },
      })
  }
  return { entries, members, sessions, root: sessions.get(input.root)! }
})
