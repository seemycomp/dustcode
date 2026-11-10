import { Context, Effect, Exit, Layer, Schema } from "effect"
import { eq, asc, and, desc } from "drizzle-orm"
import { EventTable } from "@opencode-ai/core/event/sql"
import { createHash } from "node:crypto"
import { Database } from "@opencode-ai/core/database/database"
import { TransferReceipt } from "@opencode-ai/core/kilocode/transfer-receipt"
import { SessionAdmission } from "@opencode-ai/core/kilocode/session-admission"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Session } from "@/session/session"
import { SessionTable, SessionMessageTable } from "@opencode-ai/core/session/sql"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { normalize } from "@opencode-ai/core/kilocode/session-message"
import { SessionID } from "@/session/schema"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Config } from "@/config/config"
import { Snapshot } from "@/snapshot"
import { InstanceRef } from "@/effect/instance-ref"
import { EventV2Bridge } from "@/event-v2-bridge"
import * as SandboxPolicy from "@/kilocode/sandbox/policy"
import { SandboxStore } from "@/kilocode/sandbox/store"
import { InstanceState } from "@/effect/instance-state"
import { TransferError, inspect, identity, key } from "./repository"
import { family } from "./family"
import * as Activity from "./activity"
import { capture, prepare, write, restore, verify, type Capture, type Journal, FileConflict } from "./files"
import { effective } from "./projection"
import { stage } from "./stage"
import * as Epoch from "./epoch"

export const Action = Schema.Literals(["move", "copy"])
export const PreviewInput = Schema.Struct({
  operationID: Schema.String,
  action: Action,
  projectID: Schema.String,
  sourceSessionID: Schema.String,
  sourceDirectory: Schema.String,
  targetDirectory: Schema.String,
  selectedFiles: Schema.optional(Schema.Array(Schema.String)),
})
export type PreviewInput = typeof PreviewInput.Type
export const CommitInput = Schema.Struct({
  operationID: Schema.String,
  action: Schema.optional(Action),
  projectID: Schema.optional(Schema.String),
  sourceSessionID: Schema.optional(Schema.String),
  sourceDirectory: Schema.optional(Schema.String),
  targetDirectory: Schema.optional(Schema.String),
  selectedFiles: Schema.optional(Schema.Array(Schema.String)),
  revision: Schema.optional(Schema.String),
  fingerprint: Schema.optional(Schema.String),
})
export type CommitInput = typeof CommitInput.Type

export class NotReady extends Schema.TaggedErrorClass<NotReady>()("SessionTransferNotReady", {
  detail: Schema.String,
}) {
  override get message() {
    return this.detail
  }
}

export type Preview = {
  operationID: string
  action: "move" | "copy"
  sourceSessionID: string
  sourceDirectory: string
  targetDirectory: string
  revision: string
  fingerprint: string
  files: Capture["files"]
}
export type Result = {
  operationID: string
  sourceSessionID: string
  sessionID: string
  action: "move" | "copy"
  directory: string
}
type Failure = TransferError | TransferReceipt.Conflict | FileConflict | NotReady

export interface Interface {
  readonly preview: (input: PreviewInput) => Effect.Effect<Preview, Failure>
  readonly commit: (input: CommitInput) => Effect.Effect<Result, Failure>
  readonly status: (operationID: string) => Effect.Effect<Result | undefined, Failure>
}

export class Service extends Context.Service<Service, Interface>()("@kilocode/SessionTransfer") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const receipts = yield* TransferReceipt.Service
    const admission = yield* SessionAdmission.Service
    const activity = yield* Activity.Service
    const database = yield* Database.Service
    const process = yield* AppProcess.Service
    const snapshot = yield* Snapshot.Service
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service

    const load = Effect.fn("SessionTransfer.load")(function* (input: PreviewInput) {
      if (!/^[\w-]{1,160}$/.test(input.operationID))
        return yield* new TransferError({ code: "unauthorized", detail: "Invalid transfer operation ID" })
      const found = yield* family({ sessionID: input.sourceSessionID, projectID: input.projectID }).pipe(
        Effect.provideService(Database.Service, database),
      )
      const ctx = yield* InstanceState.context
      if (
        (yield* InstanceState.workspaceID) != null ||
        ctx.project.id !== found.root.projectID ||
        !input.sourceDirectory
      ) {
        return yield* new TransferError({
          code: "unauthorized",
          detail: "The transfer source does not belong to this project context",
        })
      }
      if (found.root.metadata?.[Epoch.name] != null && key(input.sourceDirectory) !== key(found.root.directory)) {
        return yield* new TransferError({ code: "stale", detail: "The conversation execution directory changed; refresh its placement" })
      }
      const repo = yield* inspect({
        root: ctx.worktree,
        source: input.sourceDirectory,
        target: input.targetDirectory,
      }).pipe(Effect.provideService(AppProcess.Service, process))
      for (const directory of new Set(found.members.map((member) => member.directory))) {
        if (key(directory) === key(repo.source.directory)) continue
        yield* inspect({
          root: ctx.worktree,
          source: directory,
          target: input.targetDirectory,
          allowCurrent: true,
        }).pipe(Effect.provideService(AppProcess.Service, process))
      }
      yield* activity.check(found.members)
      const transcripts = yield* Effect.forEach(found.members, (info) => Effect.gen(function* () {
        const messages = yield* sessions.messages({ sessionID: info.id }).pipe(Effect.orDie)
        const rows = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, info.id)).orderBy(asc(SessionMessageTable.seq)).all().pipe(Effect.orDie)
        const native = yield* Effect.forEach(rows, (row) => Effect.gen(function* () {
          if (row.seq == null) return yield* new TransferError({ code: "unsupported", detail: "Unsequenced native history cannot be safely transferred" })
          const message = yield* Schema.decodeUnknownEffect(SessionMessage.Message)(normalize({ ...row.data, id: row.id, type: row.type })).pipe(Effect.mapError(() => new TransferError({ code: "unsupported", detail: "Native history could not be decoded" })))
          return { sequence: row.seq, message }
        }))
        const event = info.revert && native.length ? yield* database.db.select({ data: EventTable.data }).from(EventTable).where(and(eq(EventTable.aggregate_id, info.id), eq(EventTable.type, "session.revert.staged@1"))).orderBy(desc(EventTable.seq)).get().pipe(Effect.orDie) : undefined
        const nativeRevert = !!event && "revert" in event.data && event.data.revert != null && typeof event.data.revert === "object" && "messageID" in event.data.revert && event.data.revert.messageID === info.revert?.messageID
        return { info, messages, native, nativeRevert }
      }))
      yield* stage({ action: input.action, root: found.root.id, target: repo.target.directory, transcripts, operationID: input.operationID })
      const files = input.selectedFiles?.length
        ? yield* capture({ source: repo.source.directory, files: input.selectedFiles }).pipe(
            Effect.provideService(AppProcess.Service, process),
          )
        : undefined
      const journal = files
        ? yield* prepare({ target: repo.target.directory, capture: files }).pipe(
            Effect.provideService(AppProcess.Service, process),
          )
        : undefined
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            action: input.action,
            projectID: input.projectID,
            source: repo.source,
            target: repo.target,
            revision: found.revision,
            files: files?.fingerprint ?? null,
            journal: journal ?? null,
          }),
        )
        .digest("hex")
      return { found, repo, transcripts, files, journal, fingerprint }
    }, Effect.scoped)

    const preview = Effect.fn("SessionTransfer.preview")(function* (input: PreviewInput) {
      const initial = yield* load(input)
      return yield* admission.reserve(
        initial.found.members.map((member) => member.id),
        input.operationID,
        Effect.gen(function* () {
          const result = yield* load(input)
          if (result.found.revision !== initial.found.revision)
            return yield* new TransferError({ code: "stale", detail: "The conversation changed during preview" })
          yield* receipts.prepare({
            operationID: input.operationID,
            fingerprint: result.fingerprint,
            action: input.action,
            source: result.repo.source.directory,
            target: result.repo.target.directory,
          preimage: JSON.stringify({ input, revision: result.found.revision, repository: result.repo.root.common }),
          })
          return {
            operationID: input.operationID,
            action: input.action,
            sourceSessionID: input.sourceSessionID,
            sourceDirectory: result.repo.source.directory,
            targetDirectory: result.repo.target.directory,
            revision: result.found.revision,
            fingerprint: result.fingerprint,
            files: result.files?.files ?? [],
          } satisfies Preview
        }),
      )
    })

    const retained = (operationID: string) =>
      receipts
        .get(operationID)
        .pipe(Effect.map((receipt) => receipt?.status === "applying" || receipt?.status === "recovery"))
    const decode = (receipt: TransferReceipt.Info) =>
      Effect.try({
        try: () => JSON.parse(receipt.preimage ?? "null") as { ids: string[]; journal?: Journal; sandboxDirectory?: string; sandbox?: Array<[string, SandboxStore.Snapshot | null]> },
        catch: () => new TransferError({ code: "recovery", detail: "The transfer recovery journal cannot be decoded" }),
      })
    const recover = Effect.fn("SessionTransfer.recover")(function* (receipt: TransferReceipt.Info) {
      if (receipt.status === "committed") return yield* admission.settle(receipt.operationID).pipe(Effect.as(receipt))
      const stored = yield* decode(receipt)
      if (!stored || !Array.isArray(stored.ids) || !stored.ids.every((id) => typeof id === "string"))
        return yield* new TransferError({
          code: "recovery",
          detail: "The transfer recovery journal is missing ownership",
        })
      return yield* admission.recover(
        stored.ids,
        receipt.operationID,
        Effect.gen(function* () {
          const current = yield* receipts.get(receipt.operationID)
          if (!current) return yield* new TransferError({ code: "recovery", detail: "The transfer receipt disappeared during recovery" })
          if (current.status === "committed" || current.status === "prepared") return current
          const latest = yield* decode(current)
          if (latest.journal) yield* restore(latest.journal).pipe(Effect.provideService(AppProcess.Service, process))
          if (latest.sandboxDirectory && latest.sandbox) {
            for (const [sessionID, snapshot] of latest.sandbox) {
              if (snapshot) yield* Effect.promise(() => SandboxStore.write(latest.sandboxDirectory!, sessionID as SessionID, snapshot))
              else yield* Effect.promise(() => SandboxStore.remove(latest.sandboxDirectory!, sessionID as SessionID))
            }
          }
          return yield* receipts.update({ operationID: receipt.operationID, status: "prepared" })
        }),
        retained(receipt.operationID),
      )
    })

    const commit = Effect.fn("SessionTransfer.commit")(function* (request: CommitInput) {
      const context = yield* InstanceState.context
      const receipt = yield* receipts.get(request.operationID)
      if (!receipt)
        return yield* new TransferError({
          code: "stale",
          detail: "The transfer operation does not match its immutable preview",
        })
      const frozen = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(Schema.Struct({ input: PreviewInput, revision: Schema.String, repository: Schema.String }))(JSON.parse(receipt.preimage!)),
        catch: () =>
          new TransferError({ code: "recovery", detail: "The immutable transfer request cannot be decoded" }),
      })
      const input = { ...frozen.input, revision: frozen.revision, fingerprint: receipt.fingerprint }
      if (context.project.id !== input.projectID || (yield* InstanceState.workspaceID) != null) return yield* new TransferError({ code: "unauthorized", detail: "This transfer does not belong to the current project" })
      const owner = yield* identity(context.worktree).pipe(Effect.provideService(AppProcess.Service, process))
      if (key(owner.common) !== key(frozen.repository)) return yield* new TransferError({ code: "unauthorized", detail: "This transfer belongs to another canonical repository" })
      if (Object.entries(request).some(([name, value]) => value !== undefined && JSON.stringify(value) !== JSON.stringify(input[name as keyof typeof input])))
        return yield* new TransferError({ code: "stale", detail: "The transfer request changed after preview" })
      const current = receipt.status === "applying" || receipt.status === "recovery" ? yield* recover(receipt) : receipt
      if (current.status === "committed") {
        yield* admission.settle(current.operationID)
        return yield* Effect.try({
          try: () => JSON.parse(current.result!) as Result,
          catch: () => new TransferError({ code: "recovery", detail: "The transfer result cannot be decoded" }),
        })
      }
      yield* admission.settle(current.operationID)
      const initial = yield* load(input)
      const ids = [...initial.found.members.map((member) => member.id), `target:${key(initial.repo.target.directory)}`]
      return yield* admission.reserve(
        ids,
        input.operationID,
        Effect.gen(function* () {
          const result = yield* load(input)
          if (result.found.revision !== input.revision || result.fingerprint !== input.fingerprint)
            return yield* new TransferError({
              code: "stale",
              detail: "The preview is stale; review the transfer again",
            })
          const staged = yield* stage({
            action: input.action,
            root: result.found.root.id,
            target: result.repo.target.directory,
            transcripts: result.transcripts,
            operationID: input.operationID,
          })
          const ctx = yield* InstanceState.context
          const target = { ...ctx, directory: result.repo.target.directory, worktree: result.repo.target.directory }
           const policies = new Map<SessionID, SandboxPolicy.Snapshot>()
            const previous = new Map<SessionID, SandboxStore.Snapshot | undefined>()
          for (const [from, to] of staged.sessions) {
            const member = result.found.members.find((member) => member.id === from)!
          const directory = key(member.directory) === key(result.found.root.directory) ? result.repo.source.directory : member.directory
          const policy = yield* SandboxPolicy.capture(directory, from, member.directory).pipe(
            Effect.provideService(InstanceRef, { ...ctx, directory, worktree: directory }),
              Effect.provideService(Database.Service, database),
              Effect.provideService(Config.Service, config),
            )
              policies.set(to, policy)
              previous.set(to, yield* Effect.promise(() => SandboxStore.read(target.directory, to)))
            }
          yield* receipts.update({
            operationID: input.operationID,
            status: "applying",
            preimage: JSON.stringify({ input: frozen.input, revision: frozen.revision, repository: frozen.repository, ids, journal: result.journal, sandboxDirectory: target.directory, sandbox: [...previous].map(([sessionID, snapshot]) => [sessionID, snapshot ?? null]) }),
          })
          return yield* Effect.gen(function* () {
            if (result.journal) yield* write(result.journal).pipe(Effect.provideService(AppProcess.Service, process))
            const baseline = yield* snapshot
              .track({ snapshotInitialization: "wait" })
              .pipe(Effect.provideService(InstanceRef, target))
            if (!baseline)
              return yield* new NotReady({ detail: "A destination checkpoint baseline could not be established" })
            const identity = yield* inspect({
              root: ctx.worktree,
              source: result.repo.source.directory,
              target: result.repo.target.directory,
            }).pipe(Effect.provideService(AppProcess.Service, process))
            if (identity.source.head !== result.repo.source.head || identity.target.head !== result.repo.target.head)
              return yield* new TransferError({ code: "stale", detail: "A worktree HEAD changed during transfer" })
            if (result.files) {
              const latest = yield* capture({
                source: result.repo.source.directory,
                files: input.selectedFiles ?? [],
              }).pipe(Effect.provideService(AppProcess.Service, process))
              if (latest.fingerprint !== result.files.fingerprint)
                return yield* new TransferError({
                  code: "stale",
                  detail: "Selected source changes changed during transfer",
                })
            }
            if (result.journal) yield* verify(result.journal).pipe(Effect.provideService(AppProcess.Service, process))
            for (const member of staged.members) {
              const policy = policies.get(member.id)!
              yield* SandboxPolicy.relocate(target.directory, member.id, { ...policy, version: policy.version + 1 }, input.operationID)
              const epoch: Epoch.Epoch = {
                operationID: input.operationID,
                directory: target.directory,
                baseline,
              }
              member.metadata = { ...member.metadata, [Epoch.name]: epoch }
            }
            const output: Result = {
              operationID: input.operationID,
              sourceSessionID: input.sourceSessionID,
              sessionID: staged.root,
              action: input.action,
              directory: target.directory,
            }
            let count = 0
            yield* events.publishAll(staged.entries, {
              location: { directory: AbsolutePath.make(target.directory) },
              check: family({ sessionID: input.sourceSessionID, projectID: input.projectID }).pipe(
                Effect.provideService(Database.Service, database),
                Effect.flatMap((latest) =>
                  latest.revision === input.revision
                    ? Effect.void
                    : Effect.die(
                        new TransferError({ code: "stale", detail: "Session ownership changed before commit" }),
                      ),
                ),
                Effect.orDie,
              ),
              commit: () =>
                Effect.gen(function* () {
                  count++
                  if (count !== staged.entries.length) return
                  for (const member of staged.members)
                    yield* database.db
                      .update(SessionTable)
                      .set({ path: null, time_compacting: null })
                      .where(eq(SessionTable.id, member.id))
                      .run()
                      .pipe(Effect.orDie)
                  yield* receipts.update({
                    operationID: input.operationID,
                    status: "committed",
                    result: JSON.stringify(output),
                  })
                }),
            })
            return output
          }).pipe(
            Effect.onExit((exit) =>
              Effect.gen(function* () {
                if (Exit.isSuccess(exit) || (yield* receipts.get(input.operationID))?.status === "committed") return
                const restored = result.journal
                  ? yield* restore(result.journal).pipe(Effect.provideService(AppProcess.Service, process), Effect.exit)
                  : Exit.succeed(undefined)
                yield* receipts.update({
                  operationID: input.operationID,
                  status: Exit.isSuccess(restored) ? "prepared" : "recovery",
                })
                if (Exit.isFailure(restored))
                  yield* Effect.logError("Session transfer requires file recovery", restored.cause)
              }),
            ),
          )
        }),
        retained(input.operationID),
      )
    })
    const status = Effect.fn("SessionTransfer.status")(function* (operationID: string) {
      const receipt = yield* receipts.get(operationID)
      if (!receipt) return undefined
      const context = yield* InstanceState.context
      const frozen = yield* Effect.try({ try: () => Schema.decodeUnknownSync(Schema.Struct({ input: PreviewInput, revision: Schema.String, repository: Schema.String }))(JSON.parse(receipt.preimage!)), catch: () => new TransferError({ code: "recovery", detail: "The immutable transfer request cannot be decoded" }) })
      if (context.project.id !== frozen.input.projectID || (yield* InstanceState.workspaceID) != null) return yield* new TransferError({ code: "unauthorized", detail: "This transfer does not belong to the current project" })
      const owner = yield* identity(context.worktree).pipe(Effect.provideService(AppProcess.Service, process))
      if (key(owner.common) !== key(frozen.repository)) return yield* new TransferError({ code: "unauthorized", detail: "This transfer belongs to another canonical repository" })
      const current = receipt.status === "applying" || receipt.status === "recovery" ? yield* recover(receipt) : receipt
      yield* admission.settle(operationID)
      if (current.status !== "committed" || !current.result) return undefined
      return yield* Effect.try({
        try: () => JSON.parse(current.result!) as Result,
        catch: () => new TransferError({ code: "recovery", detail: "Transfer receipt cannot be decoded" }),
      })
    })
    return Service.of({ preview, commit, status })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [
    Session.node,
    TransferReceipt.node,
    SessionAdmission.node,
    Activity.node,
    AppProcess.node,
    Database.node,
    Snapshot.node,
    Config.node,
    EventV2Bridge.node,
  ],
})
