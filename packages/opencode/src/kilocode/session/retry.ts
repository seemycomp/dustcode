import { Clock, Deferred, Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { isDisposing, registerBeforeDisposer } from "@/kilocode/effect/instance-registry"
import type { InstanceContext } from "@/kilocode/instance"
import type { SessionID } from "@/session/schema"

type Entry = { attempt: number; next: number; done: Deferred.Deferred<void> }
const instances = new WeakMap<InstanceContext, Map<SessionID, Entry>>()
const closed = new WeakSet<InstanceContext>()

export const wait = Effect.fn("KiloSessionRetry.wait")(function* (input: {
  sessionID: SessionID
  attempt: number
  next: number
  publish: Effect.Effect<void> | (() => Effect.Effect<void>)
}) {
  const ctx = yield* InstanceState.context
  const workspace = yield* InstanceState.workspaceID
  if (closed.has(ctx) || isDisposing(ctx.directory)) return yield* Effect.interrupt
  const entries = instances.get(ctx) ?? new Map<SessionID, Entry>()
  instances.set(ctx, entries)
  const entry: Entry = { attempt: input.attempt, next: input.next, done: Deferred.makeUnsafe<void>() }
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      entries.set(input.sessionID, entry)
      const off = registerBeforeDisposer((directory, id) => {
        if (directory !== ctx.directory || id !== workspace) return undefined
        closed.add(ctx)
        instances.delete(ctx)
        entries.clear()
        Deferred.doneUnsafe(entry.done, Effect.interrupt)
        return undefined
      })
      return yield* restore(
        Effect.suspend(() => (typeof input.publish === "function" ? input.publish() : input.publish)).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const now = yield* Clock.currentTimeMillis
              if (input.next <= now) return
              yield* Effect.raceFirst(Effect.sleep(Math.max(0, input.next - now)), Deferred.await(entry.done))
            }),
          ),
        ),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            off()
            if (entries.get(input.sessionID) === entry) entries.delete(input.sessionID)
          }),
        ),
      )
    }),
  )
})

export const wake = Effect.fn("KiloSessionRetry.wake")(function* (input: {
  sessionID: SessionID
  attempt: number
  next: number
}) {
  const ctx = yield* InstanceState.context
  return yield* Effect.sync(() => {
    if (closed.has(ctx) || isDisposing(ctx.directory)) return false
    const entries = instances.get(ctx)
    if (!entries) return false
    const entry = entries.get(input.sessionID)
    if (!entry || entry.attempt !== input.attempt || entry.next !== input.next) return false
    entries.delete(input.sessionID)
    return Deferred.doneUnsafe(entry.done, Effect.void)
  })
})

export * as KiloSessionRetry from "./retry"
