import { afterEach, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Flag } from "@opencode-ai/core/flag/flag"
import { InstanceStore } from "@/project/instance-store"
import { Provider } from "@/provider/provider"
import { Server } from "@/server/server"
import { Session } from "@/session/session"
import { SessionProcessor } from "@/session/processor"
import { MessageID, PartID } from "@/session/schema"
import { SessionStatus } from "@/session/status"
import { disposeAllInstances, provideInstanceEffect, tmpdirScoped } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"
import { awaitWithTimeout, pollWithTimeout, testEffectShared } from "../lib/effect"

const it = testEffectShared(
  AppNodeBuilderV1.build(
    LayerNode.group([
      Session.node,
      SessionProcessor.node,
      Provider.node,
      SessionStatus.node,
      InstanceStore.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
    ]),
  ),
)
const password = Flag.KILO_SERVER_PASSWORD

afterEach(async () => {
  Flag.KILO_SERVER_PASSWORD = password
  await disposeAllInstances()
  await resetDatabase()
})

it.live(
  "HTTP retry wakes the current provider wait without replacing the turn",
  () =>
    Effect.gen(function* () {
      Flag.KILO_SERVER_PASSWORD = undefined
      const calls: unknown[] = []
      const gate = Promise.withResolvers<void>()
      const provider = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        async fetch(request) {
          calls.push(await request.json())
          if (calls.length === 1)
            return Response.json(
              { error: { message: "Rate limited" } },
              { status: 429, headers: { "retry-after": "60" } },
            )
          await gate.promise
          const events = [{ delta: { role: "assistant", content: "Recovered" } }, { delta: {}, finish_reason: "stop" }]
          return new Response(
            events.map((choice) => `data: ${JSON.stringify({ id: "test", choices: [choice] })}\n\n`).join("") +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } },
          )
        },
      })
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          gate.resolve()
          await provider.stop(true)
        }),
      )
      const dir = yield* tmpdirScoped({
        config: {
          model: "test/test-model",
          enabled_providers: ["test"],
          formatter: false,
          lsp: false,
          snapshot: false,
          provider: {
            test: {
              name: "Test",
              npm: "@ai-sdk/openai-compatible",
              options: { apiKey: "test-key", baseURL: `${provider.url.origin}/v1` },
              models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
            },
          },
        },
      })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const processors = yield* SessionProcessor.Service
        const status = yield* SessionStatus.Service
        const model = yield* (yield* Provider.Service).getModel(
          ProviderV2.ID.make("test"),
          ModelV2.ID.make("test-model"),
        )
        const chat = yield* sessions.create({ title: "Retry regression" })
        const user = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "user",
          agent: "code",
          model: { providerID: model.providerID, modelID: model.id },
          time: { created: Date.now() },
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: chat.id,
          messageID: user.id,
          type: "text",
          text: "Keep this context",
        })
        const msg = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "assistant",
          parentID: user.id,
          agent: "code",
          mode: "code",
          modelID: model.id,
          providerID: model.providerID,
          path: { cwd: dir, root: dir },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: Date.now() },
        })
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model })
        const api = Server.Default().app
        const fiber = yield* handle
          .process({
            user,
            sessionID: chat.id,
            model,
            agent: { name: "code", mode: "primary", options: {}, permission: [] },
            system: ["Preserve system context"],
            messages: [{ role: "user", content: "Keep this context" }],
            tools: {},
          })
          .pipe(Effect.forkChild)
        const retry = yield* pollWithTimeout(
          status.get(chat.id).pipe(Effect.map((info) => (info.type === "retry" ? info : undefined))),
          "retry status was not published",
        )
        expect(calls).toHaveLength(1)
        expect(retry.next - Date.now()).toBeGreaterThan(50_000)
        const wake = (payload: { attempt: number; next: number }, id = chat.id) =>
          Effect.promise(async () => {
            const response = await api.request(`/kilocode/session/${id}/retry`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-kilo-directory": dir },
              body: JSON.stringify(payload),
            })
            expect(response.status).toBe(200)
            return response.json()
          })
        expect(yield* wake({ attempt: retry.attempt + 1, next: retry.next })).toBe(false)
        expect(yield* wake({ attempt: retry.attempt, next: retry.next + 1 })).toBe(false)
        const other = yield* sessions.create({})
        expect(yield* wake(retry, other.id)).toBe(false)
        const started = Date.now()
        expect(yield* wake(retry)).toBe(true)
        expect(yield* wake(retry)).toBe(false)
        yield* pollWithTimeout(
          Effect.sync(() => (calls.length === 2 ? true : undefined)),
          "wake did not issue the next request",
          "1 second",
        )
        expect(Date.now() - started).toBeLessThan(1_000)
        expect(calls.at(1)).toEqual(calls.at(0))
        gate.resolve()
        expect(yield* awaitWithTimeout(Fiber.join(fiber), "processor did not complete")).toBe("continue")
        const messages = yield* sessions.messages({ sessionID: chat.id })
        expect(messages.map((item) => item.info.id)).toEqual([user.id, msg.id])
        expect(messages.at(-1)?.parts.some((part) => part.type === "text" && part.text === "Recovered")).toBe(true)
        expect(handle.message.parentID).toBe(user.id)
        expect(yield* wake(retry)).toBe(false)
        const missing = yield* Effect.promise(() =>
          Promise.resolve(
            api.request(`/kilocode/session/ses_missing_retry/retry`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-kilo-directory": dir },
              body: JSON.stringify(retry),
            }),
          ),
        )
        expect(missing.status).toBe(404)
        expect(calls).toHaveLength(2)
      }).pipe(provideInstanceEffect(dir))
    }),
  30_000,
)
