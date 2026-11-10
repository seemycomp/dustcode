import { expect } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppProcess } from "@opencode-ai/core/process"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionAdmission } from "@opencode-ai/core/kilocode/session-admission"
import { TransferReceipt } from "@opencode-ai/core/kilocode/transfer-receipt"
import { Snapshot } from "../../src/snapshot"
import { Session } from "../../src/session/session"
import { MessageID, PartID } from "../../src/session/schema"
import { Service, node } from "../../src/kilocode/session-transfer/service"
import { InstanceStore } from "../../src/project/instance-store"
import { InstanceBootstrap } from "../../src/project/bootstrap-service"
import { InstanceState } from "../../src/effect/instance-state"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([node, Session.node, SessionProjector.node, Database.node, AppProcess.node, SessionAdmission.node, TransferReceipt.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
    [InstanceStore.bootstrapNode, Layer.succeed(InstanceBootstrap.Service, { run: Effect.void })],
  ]),
)
const blocked = testEffect(AppNodeBuilder.build(LayerNode.group([node, Session.node, SessionProjector.node, Database.node, AppProcess.node, SessionAdmission.node, TransferReceipt.node]), [
  [Database.node, Database.layerFromPath(":memory:")],
  [InstanceStore.bootstrapNode, Layer.succeed(InstanceBootstrap.Service, { run: Effect.void })],
  [Snapshot.node, Layer.mock(Snapshot.Service, { track: () => Effect.succeed(undefined) })],
]))

it.instance(
  "Copy commits readable history once and leaves source ownership/transcript unchanged",
  () =>
    Effect.gen(function* () {
      yield* seedProject
      const ctx = yield* InstanceState.context
      const sessions = yield* Session.Service
      const transfer = yield* Service
      const process = yield* AppProcess.Service
      const target = path.join(ctx.directory, "target")
      yield* process
        .run(ChildProcess.make("git", ["worktree", "add", "--detach", target, "HEAD"], { cwd: ctx.directory }))
        .pipe(Effect.flatMap(AppProcess.requireSuccess))
      const root = yield* sessions.create()
      const info = {
        id: MessageID.ascending(),
        sessionID: root.id,
        role: "user" as const,
        agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: 1 },
      }
      yield* sessions.updateMessage(info)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: info.id,
        sessionID: root.id,
        type: "text",
        text: "effective conversation",
      })
      const before = yield* sessions.get(root.id)
      const messages = yield* sessions.messages({ sessionID: root.id })
      const input = {
        operationID: "copy-once",
        action: "copy" as const,
        projectID: root.projectID,
        sourceSessionID: root.id,
        sourceDirectory: ctx.directory,
        targetDirectory: target,
      }
      const preview = yield* transfer.preview(input)
      const result = yield* transfer.commit({ ...input, revision: preview.revision, fingerprint: preview.fingerprint })
      expect(result.sessionID).not.toBe(root.id)
      expect((yield* sessions.get(result.sessionID as typeof root.id)).directory).toBe(target)
      expect(yield* sessions.get(root.id)).toEqual(before)
      expect(yield* sessions.messages({ sessionID: root.id })).toEqual(messages)
      const retry = yield* transfer.commit({ ...input, revision: preview.revision, fingerprint: preview.fingerprint })
      expect(retry).toEqual(result)
      const gate = yield* SessionAdmission.Service
      const release = yield* gate.hold([result.sessionID])
      expect(yield* transfer.commit({ operationID: input.operationID })).toEqual(result)
      expect(yield* transfer.status(input.operationID)).toEqual(result)
      yield* release
    }),
  { git: true },
  120_000,
)

blocked.instance("file application rolls back when the destination baseline cannot be established", () => Effect.gen(function* () {
  yield* seedProject
  const ctx = yield* InstanceState.context
  const sessions = yield* Session.Service
  const transfer = yield* Service
  const process = yield* AppProcess.Service
  const receipts = yield* TransferReceipt.Service
  const target = path.join(ctx.directory, "target")
  yield* process.run(ChildProcess.make("git", ["worktree", "add", "--detach", target, "HEAD"], { cwd: ctx.directory })).pipe(Effect.flatMap(AppProcess.requireSuccess))
  yield* Effect.promise(() => Bun.write(path.join(ctx.directory, "selected.txt"), "source bytes\n"))
  const root = yield* sessions.create()
  const input = { operationID: "rollback", action: "copy" as const, projectID: root.projectID, sourceSessionID: root.id, sourceDirectory: ctx.directory, targetDirectory: target, selectedFiles: ["selected.txt"] }
  const preview = yield* transfer.preview(input)
  const result = yield* transfer.commit({ ...input, revision: preview.revision, fingerprint: preview.fingerprint }).pipe(Effect.exit)
  expect(result._tag).toBe("Failure")
  expect(yield* Effect.promise(() => Bun.file(path.join(target, "selected.txt")).exists())).toBe(false)
  expect(yield* Effect.promise(() => Bun.file(path.join(ctx.directory, "selected.txt")).text())).toBe("source bytes\n")
  expect((yield* receipts.get(input.operationID))?.status).toBe("prepared")
  expect(yield* sessions.get(root.id)).toEqual(root)
}), { git: true }, 120_000)

it.instance("Move preserves source files and persisted ownership follows a later B-to-C Move", () => Effect.gen(function* () {
  yield* seedProject
  const ctx = yield* InstanceState.context
  const sessions = yield* Session.Service
  const transfer = yield* Service
  const process = yield* AppProcess.Service
  const b = path.join(ctx.directory, "b")
  const c = path.join(ctx.directory, "c")
  for (const target of [b, c]) yield* process.run(ChildProcess.make("git", ["worktree", "add", "--detach", target, "HEAD"], { cwd: ctx.directory })).pipe(Effect.flatMap(AppProcess.requireSuccess))
  const root = yield* sessions.create()
  yield* Effect.promise(() => Bun.write(path.join(ctx.directory, "selected.txt"), "source bytes\n"))
  const first = { operationID: "move-ab", action: "move" as const, projectID: root.projectID, sourceSessionID: root.id, sourceDirectory: ctx.directory, targetDirectory: b, selectedFiles: ["selected.txt"] }
  const preview = yield* transfer.preview(first)
  const result = yield* transfer.commit({ operationID: first.operationID, fingerprint: preview.fingerprint })
  expect(result.sessionID).toBe(root.id)
  expect((yield* sessions.get(root.id)).directory).toBe(b)
  expect((yield* sessions.create({ parentID: root.id }).pipe(Effect.exit))._tag).toBe("Failure")
  expect(yield* sessions.children(root.id)).toEqual([])
  expect(yield* Effect.promise(() => Bun.file(path.join(ctx.directory, "selected.txt")).text())).toBe("source bytes\n")
  expect(yield* Effect.promise(() => Bun.file(path.join(b, "selected.txt")).text())).toBe("source bytes\n")
  const second = { ...first, operationID: "move-bc", sourceDirectory: b, targetDirectory: c, selectedFiles: [] }
  yield* transfer.preview(second)
  yield* transfer.commit({ operationID: second.operationID })
  expect((yield* sessions.get(root.id)).directory).toBe(c)
  expect((yield* transfer.status(first.operationID))?.sessionID).toBe(root.id)
  expect((yield* sessions.get(root.id)).directory).toBe(c)
}), { git: true }, 180_000)

it.instance("covers Move and Copy with chat-only and selected-file payloads", () => Effect.gen(function* () {
  yield* seedProject
  const ctx = yield* InstanceState.context
  const sessions = yield* Session.Service
  const transfer = yield* Service
  const process = yield* AppProcess.Service
  for (const [index, action] of (["move", "copy"] as const).entries()) {
    for (const [selected, files] of [[false, []], [true, [`matrix-${index}.txt`]]] as const) {
      const target = path.join(ctx.directory, `matrix-${index}-${selected ? "files" : "chat"}`)
      yield* process.run(ChildProcess.make("git", ["worktree", "add", "--detach", target, "HEAD"], { cwd: ctx.directory })).pipe(Effect.flatMap(AppProcess.requireSuccess))
      const root = yield* sessions.create()
      if (selected) yield* Effect.promise(() => Bun.write(path.join(ctx.directory, files[0]), `payload-${index}\n`))
      const input = { operationID: `matrix-${index}-${selected}`, action, projectID: root.projectID, sourceSessionID: root.id, sourceDirectory: ctx.directory, targetDirectory: target, selectedFiles: files }
      const preview = yield* transfer.preview(input)
      const result = yield* transfer.commit({ operationID: input.operationID, revision: preview.revision, fingerprint: preview.fingerprint })
      expect(result.action).toBe(action)
      expect((yield* sessions.get(result.sessionID as typeof root.id)).directory).toBe(target)
      if (selected) {
        expect(yield* Effect.promise(() => Bun.file(path.join(target, files[0])).text())).toBe(`payload-${index}\n`)
        expect(yield* Effect.promise(() => Bun.file(path.join(ctx.directory, files[0])).text())).toBe(`payload-${index}\n`)
      }
    }
  }
}), { git: true }, 300_000)
