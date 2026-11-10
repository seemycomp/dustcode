export * as SessionRunCoordinator from "./run-coordinator"

import { Deferred, Effect, Exit, Fiber, FiberSet, Scope } from "effect"

/** Serializes execution for each key while allowing different keys to run concurrently. */
export interface Coordinator<Key, E> {
  /** Snapshots keys with an execution owned by this coordinator. */
  readonly active: Effect.Effect<ReadonlySet<Key>>
  /** Starts execution while idle or joins the active execution. */
  readonly run: (key: Key) => Effect.Effect<void, E>
  /** Registers one coalesced follow-up after newly recorded work. */
  readonly wake: (key: Key) => Effect.Effect<void>
  /** Stops active execution and waits for its cleanup. */
  readonly interrupt: (key: Key) => Effect.Effect<void>
}

type Entry<E> = {
  readonly done: Deferred.Deferred<void, E>
  owner?: Fiber.Fiber<void, never>
  pendingWake: boolean
  stopping: boolean
  release: () => void // kilocode_change
}

export const make = <Key, E>(options: {
  readonly drain: (key: Key, force: boolean) => Effect.Effect<void, E>
  readonly lease?: (key: Key) => Effect.Effect<() => void> // kilocode_change
}): Effect.Effect<Coordinator<Key, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const active = new Map<Key, Entry<E>>()
    const fork = yield* FiberSet.makeRuntime<never, void, never>()

    // kilocode_change start - native runner retains admission independently of its caller
    const makeEntry = (release: () => void): Entry<E> => ({
      done: Deferred.makeUnsafe<void, E>(),
      pendingWake: false,
      stopping: false,
      release, // kilocode_change
    })
    // kilocode_change end

    const start = (key: Key, entry: Entry<E>, force: boolean, successor = false) => {
      const ready = Deferred.makeUnsafe<void>()
      const owner = fork(
        (successor ? Effect.yieldNow : Deferred.await(ready)).pipe(
          Effect.andThen(Effect.suspend(() => options.drain(key, force))),
          Effect.onExit((exit) => Effect.sync(() => settle(key, entry, exit))),
          Effect.exit,
          Effect.asVoid,
        ),
      )
      entry.owner = owner
      if (!successor) Deferred.doneUnsafe(ready, Effect.void)
    }

    const settle = (key: Key, entry: Entry<E>, exit: Exit.Exit<void, E>) => {
      if (Exit.isSuccess(exit) && !entry.stopping && entry.pendingWake) {
        entry.pendingWake = false
        start(key, entry, false, true)
        return
      }

      const successor = entry.pendingWake ? makeEntry(entry.release) : undefined // kilocode_change
      // kilocode_change start
      if (successor === undefined) {
        active.delete(key)
        entry.release()
      }
      // kilocode_change end
      else {
        active.set(key, successor)
        start(key, successor, false, true)
      }
      Deferred.doneUnsafe(entry.done, exit)
    }

    // kilocode_change start - lease admission may yield, so recheck before starting a new owner
    const run = (key: Key): Effect.Effect<void, E> =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          // kilocode_change
          const entry = active.get(key)
          if (entry !== undefined) {
            if (entry.stopping) return yield* restore(Deferred.await(entry.done).pipe(Effect.andThen(run(key)))) // kilocode_change
            return yield* restore(Deferred.await(entry.done)) // kilocode_change
          }

          // Acquire before publishing active execution or returning wake acceptance.
          const release = options.lease ? yield* options.lease(key) : () => {}
          const existing = active.get(key)
          if (existing) {
            release()
            return yield* restore(Deferred.await(existing.done))
          }
          const next = makeEntry(release)
          active.set(key, next)
          start(key, next, true)
          return yield* restore(Deferred.await(next.done)) // kilocode_change
        }),
      ) // kilocode_change

    const wake = (key: Key) =>
      Effect.gen(function* () {
        // kilocode_change
        const entry = active.get(key)
        if (entry !== undefined) {
          entry.pendingWake = true
          return
        }

        const release = options.lease ? yield* options.lease(key) : () => {}
        const existing = active.get(key)
        if (existing) {
          release()
          existing.pendingWake = true
          return
        }
        const next = makeEntry(release)
        active.set(key, next)
        start(key, next, false)
      }).pipe(Effect.uninterruptible) // kilocode_change

    // kilocode_change end

    const interrupt = (key: Key): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        if (entry?.owner === undefined) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return { active: Effect.sync(() => new Set(active.keys())), run, wake, interrupt }
  })
