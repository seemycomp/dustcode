import { Context, Effect, Layer } from "effect"
import { and, inArray, isNull } from "drizzle-orm"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionInputTable } from "@opencode-ai/core/session/sql"
import { BackgroundJob } from "@/background/job"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceState } from "@/effect/instance-state"
import { BackgroundProcess } from "@/kilocode/background-process"
import * as Notebook from "@/kilocode/notebook/service"
import * as Manager from "@/kilocode/agent-manager/service"
import { GoalState } from "@/kilocode/session/goal/state"
import { GoalLink } from "@/kilocode/session/goal/link"
import { Suggestion } from "@/kilocode/suggestion"
import { Permission } from "@/permission"
import { Question } from "@/question"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Storage } from "@/storage/storage"
import { TransferError, key } from "./repository"

export class Service extends Context.Service<
  Service,
  {
    check: (members: readonly Session.Info[]) => Effect.Effect<void, TransferError>
  }
>()("@kilocode/SessionTransferActivity") {}

export const idle = (members: readonly Session.Info[]) => Service.use((service) => service.check(members))

export const node = LayerNode.make({
  service: Service,
  deps: [
    Database.node,
    BackgroundJob.node,
    Notebook.node,
    Manager.node,
    Permission.node,
    Question.node,
    Storage.node,
    InstanceStore.node,
  ],
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const jobs = yield* BackgroundJob.Service
      const notebooks = yield* Notebook.Service
      const manager = yield* Manager.Service
      const permission = yield* Permission.Service
      const question = yield* Question.Service
      const instances = yield* InstanceStore.Service
      const storage = yield* Storage.Service

      const check = Effect.fn("SessionTransfer.idle")(function* (members: readonly Session.Info[]) {
        const ids = new Set<string>(members.map((session) => session.id))
        const busy = () =>
          new TransferError({ code: "busy", detail: "The conversation or a child has running or waiting work" })
        const states = yield* SessionStatus.busyAll()
        for (const member of members) {
          const goal = GoalState.read(member.metadata)
          if (
            states.has(member.id) ||
            GoalState.hold(member.id) ||
            GoalState.queued(member.id) || GoalLink.get(member.id) ||
            goal?.status === "active" ||
            goal?.status === "waiting" ||
            goal?.wait
          )
            return yield* busy()
          for (const prefix of ["wakeup", "cron"]) {
            const keys = yield* storage.list([prefix, member.id]).pipe(Effect.mapError(() => busy()))
            // Any persisted wait is a blocker, including malformed or overdue records.
            if (keys.length > 0) return yield* busy()
          }
        }
        const inputs = yield* db
          .select({ id: SessionInputTable.id })
          .from(SessionInputTable)
          .where(
            and(
              inArray(
                SessionInputTable.session_id,
                members.map((member) => member.id),
              ),
              isNull(SessionInputTable.promoted_seq),
            ),
          )
          .limit(1)
          .all()
          .pipe(Effect.orDie)
        if (
          inputs.length > 0 ||
          (yield* Effect.promise(() => Suggestion.list())).some((request) => ids.has(request.sessionID))
        )
          return yield* busy()

        // list() never loads/boots a closed context or adopts its persisted timers.
        const current = yield* InstanceState.context
        const processes = yield* BackgroundProcess.inspect(current).pipe(Effect.mapError(() => busy()))
        if (processes.some((proc) => ids.has(proc.sessionID) && !["exited", "failed", "stopped"].includes(proc.status))) return yield* busy()
        const loaded = yield* instances.list()
        const contexts = new Map([...loaded, current].map((ctx) => [key(ctx.directory), ctx]))
        for (const ctx of contexts.values()) {
          const resources = yield* Effect.all({
            jobs: jobs.list(),
            notebooks: notebooks.list(),
            manager: manager.list(),
            permissions: permission.list(),
            questions: question.list(),
          }).pipe(Effect.provideService(InstanceRef, ctx))
          if (
            resources.jobs.some(
              (job) =>
                job.status === "running" &&
                (ids.has(job.id) ||
                  (typeof job.metadata?.sessionId === "string" && ids.has(job.metadata.sessionId)) ||
                  (typeof job.metadata?.parentSessionId === "string" && ids.has(job.metadata.parentSessionId))),
            )
          )
            return yield* busy()
          if (
            [...resources.notebooks, ...resources.manager, ...resources.permissions, ...resources.questions].some(
              (request) => ids.has(request.sessionID),
            )
          )
            return yield* busy()
        }
      })
      return { check }
    }),
  ),
})
