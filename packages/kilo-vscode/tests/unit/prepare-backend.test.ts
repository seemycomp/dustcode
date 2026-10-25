import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { prepare } from "../../script/prepare-backend"

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vsix-backend-"))
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
  await put(".gitignore", "node_modules/\ndist/\n")
  await put("package.json", JSON.stringify({ workspaces: ["packages/*", "packages/sdk/js"] }))
  await put("bun.lock", "lock")
  await put(
    "script/kilocode/bun.json",
    JSON.stringify({ runtime: Bun.version, revision: Bun.revision, version: Bun.version }),
  )
  for (const name of ["kilo-console", "script", "dep", "sdk/js"]) {
    await put(`packages/${name}/package.json`, JSON.stringify({ name, dependencies: { dep: "workspace:*" } }))
  }
  await put(
    "packages/opencode/package.json",
    JSON.stringify({
      name: "cli",
      dependencies: { dep: "workspace:*" },
      scripts: { build: `"${process.execPath.replaceAll("\\", "/")}" build.ts` },
    }),
  )
  await put("packages/opencode/source.ts", "original")
  const target = `@kilocode/cli-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  const dir = `packages/opencode/dist/${target}`
  const cache = "packages/kilo-vscode/node_modules/.cache/vsix-backend.json"
  const model = "packages/opencode/node_modules/.cache/models-dev-api.json"
  await put(model, "old models")
  await put(
    "packages/opencode/build.ts",
    `
    import { mkdir, writeFile, rm } from "node:fs/promises"
    import { dirname } from "node:path"
    if (!process.argv.includes("--without-console")) throw new Error("VSIX build must skip Console")
    if (process.env.FIXTURE_FAIL) throw new Error("native smoke failed")
    const root = ${JSON.stringify(root)}
    const dir = ${JSON.stringify(dir)}
    await rm(root + "/" + dir, { recursive: true, force: true })
    for (const path of ["package.json", "bin/console/index.html", "bin/tree-sitter/tree-sitter.wasm", "bin/tree-sitter/typescript.wasm", "bin/kilo-sandbox-mutation-worker.js", "bin/licenses/runtime/LICENSE", "LICENSE", "bin/kilo-sandbox-network-relay.js", "bin/kilo-sandbox-seccomp", "bin/licenses/sandbox-runtime/LICENSE", "bin/bwrap", "bin/licenses/bubblewrap/NOTICE", "bin/licenses/bubblewrap/COPYING", "bin/licenses/bubblewrap/MUSL-COPYRIGHT", "bin/licenses/bubblewrap/build.ts", "bin/licenses/bubblewrap/bubblewrap-fixture.tar.gz"]) {
      if (path.startsWith("bin/console/")) continue
      await mkdir(dirname(root + "/" + dir + "/" + path), { recursive: true })
      await writeFile(root + "/" + dir + "/" + path, "artifact")
    }
    await writeFile(root + "/" + dir + "/bin/" + (process.platform === "win32" ? "kilo.exe" : "kilo"), Buffer.from("7f454c4601020304", "hex"))
    if (process.env.FIXTURE_REFRESH) await writeFile("node_modules/.cache/models-dev-api.json", "fresh models")
    if (process.env.FIXTURE_MUTATE) await writeFile("source.ts", "mutated during build")
    const file = Bun.file(root + "/count")
    await Bun.write(file, String(Number(await file.text().catch(() => "0")) + 1))
  `,
  )
  const git = Bun.spawn(["git", "init", "--quiet"], { cwd: root, stdout: "pipe", stderr: "pipe", windowsHide: true })
  expect(await git.exited).toBe(0)
  const env = { KILO_VERSION: "1.2.3", KILO_CHANNEL: "latest", KILO_RELEASE: "" }
  return { root, put, env, dir, cache, model }
}

test("backend verifies source closure, native output, model refresh and clean force/CI rebuilds", async () => {
  const { root, put, env, dir, cache, model } = await fixture()
  try {
    expect(await prepare(root, env)).toBe(false)
    expect(await prepare(root, env)).toBe(true)
    await put(".envrc", "# direnv configuration is not loaded by Bun")
    expect(await prepare(root, env)).toBe(true)
    await put(".env.production", "CACHE_TEST=1")
    expect(await prepare(root, env)).toBe(false)
    expect(await prepare(root, env)).toBe(false)
    await rm(join(root, ".env.production"))
    expect(await prepare(root, env)).toBe(false)
    expect(await prepare(root, env)).toBe(true)
    await put("packages/kilo-vscode/webview-ui/src/view.tsx", "webview only")
    expect(await prepare(root, env)).toBe(true)
    await put("packages/kilo-console/dist/index.html", "existing console output")
    await put("packages/kilo-console/src/view.tsx", "console-only edit")
    expect(await prepare(root, env)).toBe(true)
    expect(await Bun.file(join(root, dir, "bin/console/index.html")).exists()).toBe(false)
    for (const path of [
      "packages/dep/src/transitive.ts",
      "bun.lock",
      "patches/runtime.patch",
      "packages/sdk/js/src/client.ts",
      "script/kilocode/build-vscode.ts",
    ]) {
      await put(path, `changed ${path}`)
      expect(await prepare(root, env)).toBe(false)
      expect(await prepare(root, env)).toBe(true)
    }
    for (const path of ["package.json", "bin/tree-sitter/typescript.wasm", "bin/licenses/runtime/LICENSE"]) {
      await rm(join(root, dir, path))
      expect(await prepare(root, env)).toBe(false)
    }
    await put(`${dir}/bin/extra.js`, "extra runtime")
    expect(await prepare(root, env)).toBe(false)
    await put(`${dir}/bin/kilo${process.platform === "win32" ? ".exe" : ""}`, "#!/bin/sh\nexec bun src/index.ts")
    expect(await prepare(root, env)).toBe(false)
    if (process.platform !== "win32") {
      await chmod(join(root, dir, "bin/kilo"), 0o700)
      expect(await prepare(root, env)).toBe(false)
    }
    expect(await prepare(root, env, true)).toBe(false)
    expect(await Bun.file(join(root, "packages/kilo-console/dist/index.html")).text()).toBe("existing console output")
    expect(await prepare(root, { ...env, CI: "1" })).toBe(false)
    expect(await prepare(root, { ...env, GITHUB_ACTIONS: "true" })).toBe(false)
    expect(await prepare(root, { ...env, CI: "false" })).toBe(true)
    expect(await prepare(root, { ...env, KILO_VERSION: "1.2.4" })).toBe(false)
    expect(await prepare(root, { ...env, KILO_CHANNEL: "rc", KILO_PRE_RELEASE: "true" })).toBe(false)
    expect(await prepare(root, env)).toBe(false)
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000 - 1000)
    await utimes(join(root, model), old, old)
    expect(await prepare(root, { ...env, FIXTURE_REFRESH: "1" })).toBe(false)
    expect(await prepare(root, env)).toBe(true)
    const record = JSON.parse(await readFile(join(root, cache), "utf8"))
    expect(record.model).toBe(new Bun.CryptoHasher("sha256").update("fresh models").digest("hex"))
    await utimes(join(root, model), old, old)
    expect(await prepare(root, env)).toBe(false)
    expect(await Bun.file(join(root, cache)).exists()).toBe(false)
    expect(await prepare(root, env)).toBe(false)
    await put(model, "refreshed")
    await put(cache, "invalid metadata")
    expect(await prepare(root, env)).toBe(false)
    await put(
      "script/kilocode/bun.json",
      JSON.stringify({ runtime: Bun.version, revision: "wrong", version: Bun.version }),
    )
    await expect(prepare(root, env)).rejects.toThrow("Build requires Bun")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 120000)

test("backend never certifies failed builds, mid-build edits or unreadable explicit snapshots", async () => {
  const { root, put, env, cache } = await fixture()
  try {
    await prepare(root, env)
    await expect(prepare(root, { ...env, FIXTURE_FAIL: "1" }, true)).rejects.toThrow()
    expect(await Bun.file(join(root, cache)).exists()).toBe(false)
    await expect(prepare(root, { ...env, FIXTURE_MUTATE: "1" })).rejects.toThrow("source changed during build")
    expect(await Bun.file(join(root, cache)).exists()).toBe(false)
    await expect(prepare(root, { ...env, MODELS_DEV_API_JSON: "missing.json" })).rejects.toThrow()
    await put("snapshot.json", "explicit")
    expect(await prepare(root, { ...env, MODELS_DEV_API_JSON: join(root, "snapshot.json") })).toBe(false)
    expect(await prepare(root, { ...env, MODELS_DEV_API_JSON: join(root, "snapshot.json") })).toBe(true)
    await put("snapshot.json", "changed explicit")
    expect(await prepare(root, { ...env, MODELS_DEV_API_JSON: join(root, "snapshot.json") })).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
