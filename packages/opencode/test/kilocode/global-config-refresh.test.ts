import { afterEach, describe, expect, test } from "bun:test"
import { createKiloClient } from "@kilocode/sdk/v2"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Permission } from "../../src/permission"
import { GlobalBus } from "../../src/bus/global"
import { Server } from "../../src/server/server"
import { registerDisposer } from "../../src/effect/instance-registry"
import * as Log from "@opencode-ai/core/util/log"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

void Log.init({ print: false })

const root = Global.Path.config

function app() {
  return Server.Default().app
}

async function update(target: ReturnType<typeof app>, provider: "kilo" | "openrouter") {
  return target.request("/global/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ indexing: { provider } }),
  })
}

async function provider(target: ReturnType<typeof app>, directory: string) {
  const response = await target.request("/config", { headers: { "x-kilo-directory": directory } })
  return (await response.json()).indexing?.provider as string | undefined
}

async function config(dir: string, value: object) {
  await Bun.write(path.join(dir, "kilo.json"), JSON.stringify(value))
}

async function edit(target: ReturnType<typeof app>, directory: string) {
  const response = await target.request("/config", { headers: { "x-kilo-directory": directory } })
  const body = (await response.json()) as { permission?: unknown }
  return Permission.evaluate(
    "edit",
    "*",
    Permission.fromConfig((body.permission ?? {}) as Parameters<typeof Permission.fromConfig>[0]),
  ).action
}

afterEach(async () => {
  ;(Global.Path as { config: string }).config = root
  await disposeAllInstances()
  await resetDatabase()
})

describe("global config refresh", () => {
  test("adding a custom provider model persists across global reload without losing existing settings", async () => {
    await using global = await tmpdir()
    ;(Global.Path as { config: string }).config = global.path
    const existing = {
      npm: "@ai-sdk/openai-compatible",
      name: "Custom",
      options: { baseURL: "https://example.com/v1", headers: { "X-Custom": "test-only" } },
      models: { original: { name: "Original" } },
    }
    await config(global.path, { provider: { custom: existing, sibling: existing } })
    await disposeAllInstances()
    const target = app()
    const client = createKiloClient({
      baseUrl: "http://localhost",
      fetch: Object.assign(async (request: Parameters<typeof fetch>[0]) => target.request(new Request(request)), {
        preconnect: fetch.preconnect,
      }),
    })
    const started = performance.now()
    const current = (await client.global.config.get({ throwOnError: true })).data?.provider?.custom
    expect(current).toMatchObject(existing)
    const expected = { ...existing, models: { ...existing.models, added: { name: "Added" } } }
    const response = await client.global.config.update(
      { dispose: false, config: { provider: { custom: expected } } },
      { throwOnError: true },
    )
    expect(response.response.status).toBe(200)
    expect(await Bun.file(path.join(global.path, "kilo.json")).json()).toMatchObject({
      provider: { custom: expected, sibling: existing },
    })
    expect((await client.global.dispose({ throwOnError: true })).response.status).toBe(200)
    const reloaded = await client.global.config.get({ throwOnError: true })
    expect(reloaded.data).toMatchObject({ provider: { custom: expected, sibling: existing } })
    expect(performance.now() - started).toBeLessThan(30_000)
  })

  test("persistence-only update writes and invalidates config without disposing instances", async () => {
    await using global = await tmpdir()
    await using workspace = await tmpdir({ config: { formatter: false, lsp: false } })
    ;(Global.Path as { config: string }).config = global.path
    await config(global.path, { indexing: { provider: "openrouter" } })
    await disposeAllInstances()
    const target = app()
    expect(await provider(target, workspace.path)).toBe("openrouter")
    const disposed: string[] = []
    const off = registerDisposer(async (directory) => {
      disposed.push(directory)
    })
    try {
      const response = await target.request("/global/config?dispose=false", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ indexing: { provider: "kilo" } }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ indexing: { provider: "kilo" } })
      expect(await Bun.file(path.join(global.path, "kilo.json")).json()).toMatchObject({
        indexing: { provider: "kilo" },
      })
      const persisted = await target.request("/global/config")
      expect(await persisted.json()).toMatchObject({ indexing: { provider: "kilo" } })
      expect(disposed).toEqual([])
      const cleanup = await target.request("/global/dispose", { method: "POST" })
      expect(cleanup.status).toBe(200)
      expect(disposed).toContain(workspace.path)
      expect(await provider(target, workspace.path)).toBe("kilo")
    } finally {
      off()
    }
  })

  for (const method of ["PUT", "DELETE"]) {
    test(`default auth ${method} waits for disposal before responding`, async () => {
      await using workspace = await tmpdir({ config: { formatter: false, lsp: false } })
      const target = app()
      await provider(target, workspace.path)
      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const off = registerDisposer(async (directory) => {
        if (directory !== workspace.path) return
        started.resolve()
        await release.promise
      })
      try {
        const pending = target.request("/auth/save-latency-default", {
          method,
          ...(method === "PUT"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "api", key: "test-only" }),
              }
            : {}),
        })
        await started.promise
        const early = await Promise.race([Promise.resolve(pending).then(() => true), Bun.sleep(10).then(() => false)])
        expect(early).toBe(false)
        release.resolve()
        expect((await pending).status).toBe(200)
      } finally {
        release.resolve()
        off()
      }
    })

    test(`persistence-only auth ${method} acknowledges disk persistence without disposing instances`, async () => {
      await using workspace = await tmpdir({ config: { formatter: false, lsp: false } })
      const target = app()
      await provider(target, workspace.path)
      const file = path.join(Global.Path.data, "auth.json")
      const id = "save-latency-test"
      if (method === "DELETE") {
        const response = await target.request(`/auth/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "api", key: "test-only" }),
        })
        expect(response.status).toBe(200)
        await provider(target, workspace.path)
      }
      const disposed: string[] = []
      const off = registerDisposer(async (directory) => {
        disposed.push(directory)
      })
      try {
        const response = await target.request(`/auth/${id}?dispose=false`, {
          method,
          ...(method === "PUT"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "api", key: "test-only" }),
              }
            : {}),
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toBe(true)
        const saved = await Bun.file(file).json()
        expect(saved[id]).toEqual(method === "PUT" ? { type: "api", key: "test-only" } : undefined)
        expect(disposed).toEqual([])
      } finally {
        off()
      }
    })
  }

  for (const [method, url, body] of [
    ["PATCH", "/global/config", { indexing: { provider: "kilo" } }],
    ["PUT", "/auth/save-latency-invalid", { type: "api", key: "test-only" }],
    ["DELETE", "/auth/save-latency-invalid", undefined],
  ] as const) {
    test(`${method} ${url} rejects an invalid disposal query`, async () => {
      const response = await app().request(`${url}?dispose=invalid`, {
        method,
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      })
      expect(response.status).toBe(400)
    })
  }

  test("update reloads existing instance before responding", async () => {
    await using config = await tmpdir()
    await using workspace = await tmpdir({ config: { formatter: false, lsp: false } })
    ;(Global.Path as { config: string }).config = config.path
    await disposeAllInstances()
    const target = app()

    expect((await update(target, "openrouter")).status).toBe(200)
    expect(await provider(target, workspace.path)).toBe("openrouter")

    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const unregister = registerDisposer(async (directory) => {
      if (directory !== workspace.path) return
      started.resolve()
      await release.promise
    })
    try {
      const pending = update(target, "kilo")
      await started.promise
      const early = await Promise.race([pending.then(() => true), Bun.sleep(10).then(() => false)])
      expect(early).toBe(false)
      release.resolve()
      expect((await pending).status).toBe(200)
      expect(await provider(target, workspace.path)).toBe("kilo")
    } finally {
      release.resolve()
      unregister()
    }
  })

  test("update ignores disposal notification failures", async () => {
    await using config = await tmpdir()
    ;(Global.Path as { config: string }).config = config.path
    await disposeAllInstances()
    const target = app()
    const listener = () => {
      throw new Error("listener failed")
    }
    GlobalBus.on("event", listener)
    try {
      expect((await update(target, "kilo")).status).toBe(200)
    } finally {
      GlobalBus.off("event", listener)
    }
  })

  test("detects external global config edits", async () => {
    await using global = await tmpdir()
    await using workspace = await tmpdir({ config: { formatter: false, lsp: false } })
    ;(Global.Path as { config: string }).config = global.path
    await config(global.path, { permission: { edit: "ask" } })
    await disposeAllInstances()
    const target = app()

    expect(await edit(target, workspace.path)).toBe("ask")

    await config(global.path, { permission: { edit: { "*": "allow" } } })

    expect(await edit(target, workspace.path)).toBe("allow")
  })
})
