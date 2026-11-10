import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID } from "../../src/session/schema"
import { stage } from "../../src/kilocode/session-transfer/stage"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Session.node, SessionProjector.node, Database.node, EventV2Bridge.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
  ]),
)

it.instance("Move materializes only on successful batch and retains the same session ID", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    const root = yield* sessions.create()
    const before: MessageV2.User = {
      id: MessageID.ascending(),
      sessionID: root.id,
      role: "user",
      agent: "build",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created: 1 },
    }
    const undone: MessageV2.User = { ...before, id: MessageID.ascending(), time: { created: 2 } }
    yield* sessions.updateMessage(before)
    yield* sessions.updateMessage(undone)
    const snapshot: MessageV2.Part = {
      id: PartID.ascending(),
      sessionID: root.id,
      messageID: before.id,
      type: "snapshot",
      snapshot: "source-checkpoint",
    }
    yield* sessions.updatePart(snapshot)
    yield* sessions.setRevert({
      sessionID: root.id,
      revert: { messageID: undone.id, snapshot: "redo-source" },
      summary: undefined,
    })
    const source = yield* sessions.get(root.id)
    const messages = yield* sessions.messages({ sessionID: root.id })
    const target = path.join(root.directory, "target")
    const result = yield* stage({
      action: "move",
      root: root.id,
      target,
      transcripts: [{ info: source, messages }],
      operationID: "move",
    })
    expect(yield* sessions.messages({ sessionID: root.id })).toEqual(messages)
    expect((yield* sessions.get(root.id)).revert).toEqual(source.revert)
    const rejected = yield* events.publishAll(result.entries, { check: Effect.die("injected transaction precondition") }).pipe(Effect.exit)
    expect(rejected._tag).toBe("Failure")
    expect(yield* sessions.get(root.id)).toEqual(source)
    expect(yield* sessions.messages({ sessionID: root.id })).toEqual(messages)
    yield* events.publishAll(result.entries)
    expect((yield* sessions.get(root.id)).directory).toBe(target)
    expect((yield* sessions.get(root.id)).revert).toBeUndefined()
    expect((yield* sessions.messages({ sessionID: root.id })).map((message) => message.info.id)).toEqual([before.id])
    expect((yield* sessions.messages({ sessionID: root.id })).at(0)?.parts).toEqual([])
  }),
)

it.instance("Copy clones only children referenced by effective retained task parts", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    const root = yield* sessions.create()
    const child = yield* sessions.create({ parentID: root.id, title: "retained child" })
    const excluded = yield* sessions.create({ parentID: root.id, title: "undone child" })
    const user: MessageV2.User = { id: MessageID.ascending(), sessionID: root.id, role: "user", agent: "build", model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }, time: { created: 1 } }
    const assistant: MessageV2.Assistant = { id: MessageID.ascending(), sessionID: root.id, role: "assistant", agent: "build", mode: "build", parentID: user.id, providerID: user.model.providerID, modelID: user.model.modelID, cost: 0, path: { root: root.directory, cwd: root.directory }, time: { created: 2 }, tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } }
    const undone = { ...user, id: MessageID.ascending(), time: { created: 3 } }
    yield* sessions.updateMessage(user)
    yield* sessions.updateMessage(assistant)
    yield* sessions.updateMessage(undone)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: root.id, messageID: assistant.id, type: "tool", tool: "task", callID: "kept", state: { status: "completed", input: { task_id: child.id }, metadata: { sessionId: child.id }, output: child.id, title: "task", time: { start: 1, end: 2 } } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: root.id, messageID: undone.id, type: "tool", tool: "task", callID: "undone", state: { status: "completed", input: { task_id: excluded.id }, metadata: { sessionId: excluded.id }, output: excluded.id, title: "undone", time: { start: 3, end: 4 } } })
    yield* sessions.updateMessage({ ...user, id: MessageID.ascending(), sessionID: child.id })
    yield* sessions.setRevert({ sessionID: root.id, revert: { messageID: undone.id }, summary: undefined })
    const transcripts = yield* Effect.forEach([root.id, child.id, excluded.id], (id) => Effect.all({ info: sessions.get(id), messages: sessions.messages({ sessionID: id }) }))
    const result = yield* stage({ action: "copy", root: root.id, target: path.join(root.directory, "target"), transcripts, operationID: "graph" })
    expect(result.sessions.has(excluded.id)).toBe(false)
    expect(result.sessions.has(child.id)).toBe(true)
    yield* events.publishAll(result.entries)
    const children = yield* sessions.children(result.root)
    expect(children).toHaveLength(1)
    expect(children.at(0)?.id).toBe(result.sessions.get(child.id))
    const parts = (yield* sessions.messages({ sessionID: result.root })).flatMap((message) => message.parts)
    expect(parts.find((part) => part.type === "tool" && part.tool === "task")).toMatchObject({ state: { input: { task_id: children.at(0)?.id }, metadata: { sessionId: children.at(0)?.id } } })
    expect((yield* sessions.get(child.id)).parentID).toBe(root.id)
  }),
)

it.instance("Copy creates a distinct conversation and leaves source rows unchanged", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    const root = yield* sessions.create({
      agent: "plan",
      model: { providerID: ProviderV2.ID.make("test"), id: ModelV2.ID.make("test"), variant: "high" },
      permission: [{ permission: "bash", pattern: "*", action: "deny" }],
    })
    const info: MessageV2.User = {
      id: MessageID.ascending(),
      sessionID: root.id,
      role: "user",
      agent: "plan",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created: 1 },
    }
    const part: MessageV2.TextPart = {
      id: PartID.ascending(),
      sessionID: root.id,
      messageID: info.id,
      type: "text",
      text: "retained",
    }
    yield* sessions.updateMessage(info)
    yield* sessions.updatePart(part)
    const source = yield* sessions.get(root.id)
    const messages = yield* sessions.messages({ sessionID: root.id })
    const result = yield* stage({
      action: "copy",
      root: root.id,
      target: path.join(root.directory, "target"),
      transcripts: [{ info: source, messages }],
      operationID: "copy",
    })
    yield* events.publishAll(result.entries)
    expect(result.root).not.toBe(root.id)
    const copy = yield* sessions.get(result.root)
    expect(copy.agent).toBe(source.agent)
    expect(copy.model).toEqual(source.model)
    expect(copy.permission).toEqual(source.permission)
    expect((yield* sessions.messages({ sessionID: result.root })).at(0)?.parts.at(0)).toMatchObject({
      text: "retained",
      sessionID: result.root,
    })
    expect(yield* sessions.get(root.id)).toEqual(source)
    expect(yield* sessions.messages({ sessionID: root.id })).toEqual(messages)
  }),
)
