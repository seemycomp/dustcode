import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { afterEach, expect } from "bun:test"
import { Deferred, Effect, Fiber, Layer, Queue, Schema } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Question } from "../../src/question"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { QuestionID } from "../../src/question/schema"
import { MessageID, SessionID } from "../../src/session/schema"
import { KiloSnapshotTrack } from "../../src/kilocode/snapshot/track"
import { InstanceRef } from "../../src/effect/instance-ref"
import { disposeAllInstances, requireInstance } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"

const events = AppNodeBuilder.build(EventV2Bridge.node)
const it = testEffect(
  Layer.mergeAll(Question.layer.pipe(Layer.provide(events)), events, AppNodeBuilder.build(CrossSpawnSpawner.node)),
)

afterEach(async () => {
  await disposeAllInstances()
})

for (const outcome of ["hash", "empty", "defect", "abort", "deadline"] as const) {
  it.instance(
    `snapshot ${outcome} completion cancels its actual Question without dismissing another`,
    () =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const bridge = yield* EventV2Bridge.Service
        const ctx = yield* requireInstance
        const asked = yield* Queue.unbounded<Question.Request>()
        const rejected: QuestionID[] = []
        const off = yield* bridge.listen((event) => {
          if (event.type === Question.Event.Asked.type && Schema.is(Question.Request)(event.data)) {
            Queue.offerUnsafe(asked, event.data)
          }
          if (event.type === Question.Event.Rejected.type && Schema.is(Question.Rejected)(event.data)) {
            rejected.push(event.data.requestID)
          }
          return Effect.void
        })
        yield* Effect.addFinalizer(() => off)
        const session = SessionID.make("ses_test")
        const unrelated = yield* question
          .ask({ sessionID: session, questions: [{ header: "Other", question: "Unrelated?", options: [] }] })
          .pipe(Effect.forkChild)
        const other = yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))
        const gate = yield* Deferred.make<void>()
        const started = Promise.withResolvers<void>()
        const state = KiloSnapshotTrack.makeState()
        let persisted = false
        let ended = false
        const hooks: KiloSnapshotTrack.Hooks = {
          ask: (input, signal) =>
            Effect.runPromise(
              question
                .ask({
                  ...input,
                  questions: [{ header: "Snapshot", question: "Keep waiting?", options: [] }],
                })
                .pipe(Effect.provideService(InstanceRef, ctx)),
              { signal },
            ).then(
              () => "continue" as const,
              () => "dismissed" as const,
            ),
          async persistDisable() {
            persisted = true
          },
          async startProgress() {
            started.resolve()
          },
          async updateProgress() {},
          async endProgress() {
            ended = true
          },
        }
        const fiber = yield* KiloSnapshotTrack.protect({
          inner: KiloSnapshotTrack.wrap({
            inner: Deferred.await(gate).pipe(
              Effect.andThen(
                outcome === "defect"
                  ? Effect.die(new Error("reconciliation failed"))
                  : Effect.succeed(outcome === "hash" ? "snapshot-hash" : undefined),
              ),
            ),
            state,
            sessionID: session,
            messageID: MessageID.make("msg_test"),
            hooks,
            timeoutMs: 10,
            progressDelayMs: 1,
          }),
          state,
          fallback: undefined,
          operation: "track",
          timeoutMs: outcome === "deadline" ? 100 : 5_000,
        }).pipe(Effect.forkChild)
        const request = yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))
        yield* awaitWithTimeout(
          Effect.promise(() => started.promise),
          "snapshot progress was not started",
        )
        if (outcome === "abort") yield* Fiber.interrupt(fiber)
        if (outcome !== "abort" && outcome !== "deadline") yield* Deferred.succeed(gate, undefined)
        if (outcome !== "abort") {
          expect(yield* awaitWithTimeout(Fiber.join(fiber), "snapshot waited for an obsolete question")).toBe(
            outcome === "hash" ? "snapshot-hash" : undefined,
          )
        }
        yield* pollWithTimeout(
          question.list().pipe(Effect.map((requests) => (requests.length === 1 && ended ? true : undefined))),
          "snapshot question or progress survived completion",
        )
        expect((yield* question.list()).map((request) => request.id)).toEqual([other.id])
        expect(rejected).toEqual([request.id])
        expect(persisted).toBe(false)
        expect(state.disabledForSession).toBe(outcome === "defect" || outcome === "deadline")
        expect(state.asked).toBe(outcome !== "hash")
        expect(state.owner).toBeUndefined()
        const reply = yield* question
          .reply({ requestID: request.id, answers: [[KiloSnapshotTrack.ANSWER_DISABLE]] })
          .pipe(Effect.flip)
        expect(reply).toBeInstanceOf(Question.NotFoundError)
        expect(persisted).toBe(false)
        yield* Fiber.interrupt(unrelated)
        expect(rejected).toEqual([request.id, other.id])
      }),
    { git: true },
    20_000,
  )
}

it.instance(
  "publishes rejection when a pending question is interrupted",
  () =>
    Effect.gen(function* () {
      const question = yield* Question.Service
      const bridge = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<{ properties: Question.Request }>()
      const rejected = yield* Queue.unbounded<{
        properties: { sessionID: SessionID; requestID: QuestionID }
      }>()
      const off = yield* bridge.listen((event) => {
        if (event.type === Question.Event.Asked.type)
          Queue.offerUnsafe(asked, { properties: event.data as Question.Request })
        if (event.type === Question.Event.Rejected.type)
          Queue.offerUnsafe(rejected, {
            properties: event.data as { sessionID: SessionID; requestID: QuestionID },
          })
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const fiber = yield* question
        .ask({
          sessionID: SessionID.make("ses_test"),
          questions: [
            {
              header: "Snapshot",
              question: "Keep waiting?",
              options: [{ label: "Continue", description: "Keep waiting" }],
            },
          ],
        })
        .pipe(Effect.forkChild)
      const request = yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))

      yield* Fiber.interrupt(fiber)

      const event = yield* Queue.take(rejected).pipe(Effect.timeout("2 seconds"))
      expect(event.properties).toEqual({
        sessionID: request.properties.sessionID,
        requestID: request.properties.id,
      })
      expect(yield* question.list()).toEqual([])
    }),
  { git: true },
)

it.instance(
  "cleans up interruption during Asked publication without rejecting an unrelated question",
  () =>
    Effect.gen(function* () {
      const question = yield* Question.Service
      const bridge = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<Question.Request>()
      const rejected = yield* Queue.unbounded<QuestionID>()
      const off = yield* bridge.listen((event) => {
        if (event.type === Question.Event.Rejected.type && Schema.is(Question.Rejected)(event.data)) {
          Queue.offerUnsafe(rejected, event.data.requestID)
        }
        if (event.type !== Question.Event.Asked.type || !Schema.is(Question.Request)(event.data)) return Effect.void
        const request = event.data
        Queue.offerUnsafe(asked, request)
        return request.questions.at(0)?.header === "Stalled" ? Effect.never : Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const session = SessionID.make("ses_test")
      const unrelated = yield* question
        .ask({
          sessionID: session,
          questions: [{ header: "Other", question: "Unrelated?", options: [] }],
        })
        .pipe(Effect.forkChild)
      const other = yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))
      const fiber = yield* question
        .ask({
          sessionID: session,
          questions: [{ header: "Stalled", question: "Keep waiting?", options: [] }],
        })
        .pipe(Effect.forkChild)
      const request = yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))

      yield* Fiber.interrupt(fiber)

      expect((yield* question.list()).map((request) => request.id)).toEqual([other.id])
      expect(yield* Queue.take(rejected).pipe(Effect.timeout("2 seconds"))).toBe(request.id)
      expect(yield* Queue.size(rejected)).toBe(0)
      yield* Fiber.interrupt(unrelated)
      expect(yield* Queue.take(rejected).pipe(Effect.timeout("2 seconds"))).toBe(other.id)
      expect(yield* Queue.size(rejected)).toBe(0)
      expect(yield* question.list()).toEqual([])
    }),
  { git: true },
)
