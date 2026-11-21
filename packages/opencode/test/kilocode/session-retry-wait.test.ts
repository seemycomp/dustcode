import { expect } from "bun:test"
import { Clock, Deferred, Effect, Exit, Fiber } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { InstanceRef } from "@/effect/instance-ref"
import { disposeInstance } from "@/effect/instance-registry"
import { InstanceState } from "@/effect/instance-state"
import { KiloSessionRetry } from "@/kilocode/session/retry"
import { SessionID } from "@/session/schema"
import { it } from "../lib/effect"

const id = SessionID.make("ses_retry")

it.instance(
  "uses the Effect clock for automatic expiry and immediate wake",
  () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const ready = yield* Deferred.make<void>()
      const finished = yield* Deferred.make<void>()
      const input = { sessionID: id, attempt: 1, next: now + 60_000 }
      const fiber = yield* KiloSessionRetry.wait({
        ...input,
        publish: () => Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
      }).pipe(Effect.andThen(Deferred.succeed(finished, undefined)), Effect.forkChild)
      yield* Deferred.await(ready)
      yield* TestClock.adjust("59 seconds")
      expect(yield* Deferred.isDone(finished)).toBe(false)
      yield* TestClock.adjust("1 second")
      yield* Fiber.join(fiber)
      expect(yield* KiloSessionRetry.wake(input)).toBe(false)

      const next = { ...input, attempt: 2, next: now + 120_000 }
      yield* KiloSessionRetry.wait({
        ...next,
        publish: () =>
          KiloSessionRetry.wake(next).pipe(
            Effect.tap((value) => Effect.sync(() => expect(value).toBe(true))),
            Effect.asVoid,
          ),
      })
      expect(yield* Clock.currentTimeMillis).toBe(now + 60_000)
    }).pipe(Effect.provide(TestClock.layer())),
  30_000,
)

it.instance(
  "registers before status publication and consumes only the exact session wait once",
  () =>
    Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      const input = { sessionID: id, attempt: 1, next: Date.now() + 60_000 }
      yield* KiloSessionRetry.wait({
        ...input,
        publish: Effect.gen(function* () {
          expect(yield* KiloSessionRetry.wake({ ...input, attempt: 2 })).toBe(false)
          expect(yield* KiloSessionRetry.wake({ ...input, next: input.next + 1 })).toBe(false)
          expect(yield* KiloSessionRetry.wake({ ...input, sessionID: SessionID.make("ses_other") })).toBe(false)
          expect(
            yield* KiloSessionRetry.wake(input).pipe(
              Effect.provideService(InstanceRef, { ...ctx, directory: `${ctx.directory}/other` }),
            ),
          ).toBe(false)
          expect(yield* KiloSessionRetry.wake(input)).toBe(true)
          expect(yield* KiloSessionRetry.wake(input)).toBe(false)
        }),
      })
      expect(yield* KiloSessionRetry.wake(input)).toBe(false)
    }),
  30_000,
)

it.instance(
  "removes expired and interrupted waits without allowing an old wait to wake a replacement",
  () =>
    Effect.gen(function* () {
      const old = { sessionID: id, attempt: 1, next: Date.now() }
      yield* KiloSessionRetry.wait({ ...old, publish: Effect.void })
      expect(yield* KiloSessionRetry.wake(old)).toBe(false)
      const ready = yield* Deferred.make<void>()
      const input = { ...old, attempt: 2, next: Date.now() + 60_000 }
      const fiber = yield* KiloSessionRetry.wait({
        ...input,
        publish: Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
      }).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      expect(yield* KiloSessionRetry.wake(old)).toBe(false)
      yield* Fiber.interrupt(fiber)
      expect(yield* KiloSessionRetry.wake(input)).toBe(false)
    }),
  30_000,
)

it.instance(
  "disposal interrupts the wait and prevents waking the disposed instance",
  () =>
    Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      const workspace = yield* InstanceState.workspaceID
      const ready = yield* Deferred.make<void>()
      const input = { sessionID: id, attempt: 1, next: Date.now() + 60_000 }
      const fiber = yield* KiloSessionRetry.wait({
        ...input,
        publish: Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
      }).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      yield* Effect.promise(() => disposeInstance(ctx.directory, workspace))
      expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true)
      expect(yield* KiloSessionRetry.wake(input)).toBe(false)
      expect(
        Exit.isFailure(
          yield* KiloSessionRetry.wait({ ...input, publish: Effect.die("published after disposal") }).pipe(Effect.exit),
        ),
      ).toBe(true)
    }),
  30_000,
)
