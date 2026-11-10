import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { MessageV2 } from "../../src/session/message-v2"
import { effective, remap } from "../../src/kilocode/session-transfer/projection"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const id = SessionID.make("ses_projection")
const message = MessageID.make("msg_projection")
const part = PartID.make("prt_boundary")
const session: Session.Info = {
  id,
  projectID: ProjectV2.ID.global,
  slug: "source",
  directory: "/repo",
  title: "source",
  version: "1",
  time: { created: 1, updated: 2 },
  revert: { messageID: message, partID: part, snapshot: "old", diff: "old" },
}
const info: MessageV2.Assistant = {
  id: message,
  sessionID: id,
  role: "assistant",
  parentID: MessageID.make("msg_parent"),
  agent: "build",
  mode: "build",
  path: { cwd: "/repo", root: "/repo" },
  modelID: ModelV2.ID.make("model"),
  providerID: ProviderV2.ID.make("provider"),
  cost: 2,
  tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1 },
}
const parts: MessageV2.Part[] = [
  { id: PartID.make("prt_before"), sessionID: id, messageID: message, type: "text", text: "before" },
  { id: part, sessionID: id, messageID: message, type: "snapshot", snapshot: "secret" },
  { id: PartID.make("prt_after"), sessionID: id, messageID: message, type: "text", text: "undone" },
]

it.effect("effective projection honors the part boundary before stripping checkpoints", () =>
  Effect.gen(function* () {
    const input = { session, messages: [{ info, parts }] }
    const original = structuredClone(input)
    const result = yield* effective(input)
    expect(result.messages.at(0)?.parts).toHaveLength(1)
    expect(result.messages.at(0)?.parts.at(0)?.type).toBe("text")
    expect(result.info.revert).toBeUndefined()
    const first = result.messages.at(0)?.info
    expect(first?.role === "assistant" && first.cost).toBe(0)
    expect(input).toEqual(original)
  }),
)

it.effect("effective projection fails closed for missing message and part boundaries", () =>
  Effect.gen(function* () {
    for (const revert of [
      { messageID: MessageID.make("msg_missing") },
      { messageID: message, partID: PartID.make("prt_missing") },
    ]) {
      const result = yield* effective({ session: { ...session, revert }, messages: [{ info, parts }] }).pipe(
        Effect.result,
      )
      expect(result._tag).toBe("Failure")
    }
  }),
)

it.effect("Move preserves retained costs while Copy resets both assistant and step costs", () =>
  Effect.gen(function* () {
    const finish: MessageV2.StepFinishPart = {
      id: PartID.make("prt_finish"),
      sessionID: id,
      messageID: message,
      type: "step-finish",
      reason: "stop",
      cost: 2,
      tokens: info.tokens,
      snapshot: "old",
    }
    for (const action of ["move", "copy"] as const) {
      const result = yield* effective({
        session: { ...session, revert: undefined },
        messages: [{ info, parts: [finish] }],
        action,
      })
      const message = result.messages.at(0)
      expect(message?.info.role === "assistant" && message.info.cost).toBe(action === "move" ? 2 : 0)
      expect(message?.parts.at(0)).toMatchObject({ type: "step-finish", cost: action === "move" ? 2 : 0 })
      expect(message?.parts.at(0)).not.toHaveProperty("snapshot")
    }
  }),
)

it.effect("Copy remaps nested attachments, compaction and private session URLs", () =>
  Effect.gen(function* () {
    const attachment: MessageV2.FilePart = {
      id: PartID.make("prt_attachment"),
      sessionID: id,
      messageID: message,
      type: "file",
      mime: "text/plain",
      url: `session:${id}`,
    }
    const tool: MessageV2.ToolPart = {
      id: PartID.make("prt_tool"),
      sessionID: id,
      messageID: message,
      type: "tool",
      callID: "call",
      tool: "read",
      state: {
        status: "completed",
        input: {},
        output: "done",
        title: "read",
        metadata: {},
        time: { start: 1, end: 2 },
        attachments: [attachment],
      },
    }
    const projected = yield* effective({
      session: { ...session, revert: undefined },
      messages: [{ info, parts: [tool, attachment] }],
    })
    const result = remap(
      projected,
      new Map([[id, "ses_new"]]),
      new Map([
        [message, "msg_new"],
        [info.parentID, "msg_new_parent"],
      ]),
      new Map([
        [tool.id, "prt_new_tool"],
        [attachment.id, "prt_new_attachment"],
      ]),
    )
    const next = result.messages.at(0)?.parts.at(0)
    expect(next?.type === "tool" && next.state.status === "completed" && next.state.attachments?.at(0)).toMatchObject({
      id: "prt_new_attachment",
      messageID: "msg_new",
      sessionID: "ses_new",
      url: "session:ses_new",
    })
    expect(result.messages.at(0)?.parts.at(1)).toMatchObject({ url: "session:ses_new" })
  }),
)
