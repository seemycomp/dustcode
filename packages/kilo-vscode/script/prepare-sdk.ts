#!/usr/bin/env bun
import { $ } from "bun"
import { rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fingerprint, inventory, load, publish, timed } from "./build-cache"
import { receipt, withLock } from "./build-lock"

const inputs = [
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "patches",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierignore",
  "script/kilocode/bun.ts",
  "script/kilocode/bun.json",
  "packages/opencode",
  "packages/core",
  "packages/effect-drizzle-sqlite",
  "packages/effect-sqlite-node",
  "packages/kilo-gateway",
  "packages/kilo-indexing",
  "packages/kilo-memory",
  "packages/kilo-sandbox",
  "packages/kilo-telemetry",
  "packages/llm",
  "packages/plugin",
  "packages/plugin-atomic-chat",
  "packages/protocol",
  "packages/schema",
  "packages/server",
  "packages/util",
  "packages/sdk/js",
  "packages/script",
  "packages/kilo-vscode/script/prepare-sdk.ts",
  "packages/kilo-vscode/script/build-cache.ts",
  "packages/kilo-vscode/script/build-lock.ts",
]
const generated = ["packages/sdk/js/src/gen", "packages/sdk/js/src/v2/gen"]

async function output(root: string) {
  const src = await inventory(join(root, "src"))
  const dist = await inventory(join(root, "dist"))
  const files = new Set(dist.map((entry) => entry.path))
  if (!files.has("index.js") || !files.has("v2/index.js")) throw new Error("SDK compiled entrypoints are missing")
  for (const entry of src) {
    if (!entry.path.endsWith(".ts") || entry.path.endsWith(".d.ts")) continue
    const base = entry.path.slice(0, -3)
    if (!files.has(`${base}.js`) || !files.has(`${base}.d.ts`))
      throw new Error(`SDK compiled output missing for ${entry.path}`)
  }
  return { src, dist }
}

export async function prepare(root: string, env: NodeJS.ProcessEnv = process.env) {
  return withLock(
    root,
    (lock) =>
      timed("SDK preparation", async () => {
        if (await receipt(lock)) {
          console.log("[prepare-sdk] already verified under this build lock")
          return true
        }
        const sdk = join(root, "packages/sdk/js")
        const cache = join(root, "packages/kilo-vscode/node_modules/.cache/sdk-build.json")
        const source = await fingerprint(root, inputs, generated)
        const input = JSON.stringify({
          source,
          bun: Bun.version,
          revision: Bun.revision,
          platform: process.platform,
          arch: process.arch,
        })
        const prior = await load(cache)
        const current = await output(sdk).catch((err) => {
          console.log(`[prepare-sdk] output cache miss: ${err.message}`)
        })
        if (source && current && JSON.stringify(prior) === JSON.stringify({ schema: 2, input, output: current })) {
          console.log("[prepare-sdk] cache hit: verified generated and compiled output")
          await receipt(lock, true)
          return true
        }
        console.log("[prepare-sdk] cache miss: inputs, metadata or output changed")
        await rm(cache, { force: true })
        await $`${process.execPath} run build`.cwd(sdk).env(env)
        if (source !== (await fingerprint(root, inputs, generated)))
          throw new Error("SDK source changed during preparation")
        const next = await output(sdk)
        if (source) await publish(cache, { schema: 2, input, output: next })
        await receipt(lock, true)
        return false
      }),
    env.VSIX_BUILD_LOCK,
  )
}

if (import.meta.main) await prepare(resolve(import.meta.dir, "../../.."))
