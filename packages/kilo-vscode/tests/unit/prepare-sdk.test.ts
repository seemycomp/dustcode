import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { prepare } from "../../script/prepare-sdk"
import { withLock } from "../../script/build-lock"
import { build } from "../../../../script/kilocode/build-vscode"
import { fingerprint } from "../../script/build-cache"

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vsix-sdk-"))
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
  await put(".gitignore", "node_modules/\ndist/\n.kilo/\n")
  await put("package.json", "{}")
  await put("bun.lock", "lock")
  await put(
    "packages/sdk/js/package.json",
    JSON.stringify({ scripts: { build: `"${process.execPath.replaceAll("\\", "/")}" build.ts` } }),
  )
  await put("packages/sdk/js/src/index.ts", "export {}")
  await put("packages/sdk/js/src/v2/index.ts", "export {}")
  await put("packages/sdk/js/src/v2/client.ts", "export {}")
  await put(
    "packages/sdk/js/build.ts",
    `
    import { mkdir, writeFile } from "node:fs/promises"
    import { dirname } from "node:path"
    if (await Bun.file("fail").exists()) throw new Error("fixture SDK failure")
    for (const path of ["index", "v2/index", "v2/client"]) {
      await mkdir(dirname("dist/" + path), { recursive: true })
      for (const ext of [".js", ".d.ts"]) await writeFile("dist/" + path + ext, "export {}")
    }
    await mkdir("src/v2/gen", { recursive: true })
    await writeFile("src/v2/gen/generated.ts", "export {}")
    await mkdir("dist/v2/gen", { recursive: true })
    for (const ext of [".js", ".d.ts"]) await writeFile("dist/v2/gen/generated" + ext, "export {}")
    const file = Bun.file("../../../count")
    await Bun.write(file, String(Number(await file.text().catch(() => "0")) + 1))
  `,
  )
  const git = Bun.spawn(["git", "init", "--quiet"], { cwd: root, stdout: "pipe", stderr: "pipe", windowsHide: true })
  expect(await git.exited).toBe(0)
  return { root, put }
}

test("SDK validates every compiled/generated file, source and toolchain inputs; nested preparation hits", async () => {
  const { root, put } = await fixture()
  try {
    expect(await prepare(root, {})).toBe(false)
    expect(await prepare(root, {})).toBe(true)
    await withLock(root, async (lock) => {
      expect(await prepare(root, { VSIX_BUILD_LOCK: lock.token })).toBe(true)
    })
    expect(await readFile(join(root, "count"), "utf8")).toBe("1")
    for (const path of ["packages/sdk/js/dist/v2/client.d.ts", "packages/sdk/js/dist/v2/gen/generated.js"]) {
      await rm(join(root, path))
      expect(await prepare(root, {})).toBe(false)
    }
    await put("packages/sdk/js/src/v2/gen/generated.ts", "changed generated output")
    expect(await prepare(root, {})).toBe(false)
    await put("packages/opencode/src/api.ts", "changed API")
    expect(await prepare(root, {})).toBe(false)
    for (const workspace of ["protocol", "schema"]) {
      expect(await prepare(root, {})).toBe(true)
      await put(`packages/${workspace}/src/api.ts`, "changed API contract")
      expect(await prepare(root, {})).toBe(false)
    }
    await put("bun.lock", "new dependency")
    expect(await prepare(root, {})).toBe(false)
    await put("packages/sdk/js/dist/v2/client.js", "corrupt")
    expect(await prepare(root, {})).toBe(false)
    await put("packages/sdk/js/fail", "fail")
    await expect(prepare(root, {})).rejects.toThrow()
    expect(await Bun.file(join(root, "packages/kilo-vscode/node_modules/.cache/sdk-build.json")).exists()).toBe(false)
    expect(await Bun.file(join(root, ".kilo/vsix-build.lock")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)

test("fingerprinting covers staged, unstaged, untracked and deleted files but excludes build output", async () => {
  const { root, put } = await fixture()
  try {
    await put("packages/opencode/source.ts", "original")
    const proc = Bun.spawn(["git", "add", "packages/opencode/source.ts"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    })
    expect(await proc.exited).toBe(0)
    const before = await fingerprint(root, ["packages/opencode"])
    await put("packages/opencode/source.ts", "unstaged")
    expect(await fingerprint(root, ["packages/opencode"])).not.toBe(before)
    await put("packages/opencode/source.ts", "original")
    await put("packages/opencode/new.ts", "untracked")
    expect(await fingerprint(root, ["packages/opencode"])).not.toBe(before)
    await rm(join(root, "packages/opencode/new.ts"))
    await put("packages/opencode/dist/output", "ignored output")
    expect(await fingerprint(root, ["packages/opencode"])).toBe(before)
    await rm(join(root, "packages/opencode/source.ts"))
    expect(await fingerprint(root, ["packages/opencode"])).not.toBe(before)
    await rm(join(root, ".git"), { recursive: true, force: true })
    expect(await fingerprint(root, ["packages/opencode"])).toBeUndefined()
    expect(await prepare(root, {})).toBe(false)
    expect(await prepare(root, {})).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)

test("SDK preparation receipts skip nested validation only for the same live lock", async () => {
  const { root, put } = await fixture()
  try {
    for (const cached of [false, true]) {
      await withLock(root, async (lock) => {
        const env = { VSIX_BUILD_LOCK: lock.token }
        expect(await prepare(root, env)).toBe(cached)
        expect(JSON.parse(await readFile(lock.path, "utf8")).sdk).toBe(lock.token)
        // Removing Git makes fingerprinting fail; a nested receipt must avoid it entirely.
        await rm(join(root, ".git"), { recursive: true, force: true })
        expect(await prepare(root, env)).toBe(true)
        const git = Bun.spawn(["git", "init", "--quiet"], {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          windowsHide: true,
        })
        expect(await git.exited).toBe(0)
      })
    }
    expect(await readFile(join(root, "count"), "utf8")).toBe("1")
    await put("packages/sdk/js/dist/v2/client.js", "corrupt")
    await put("packages/sdk/js/fail", "fail")
    await withLock(root, async (lock) => {
      const env = { VSIX_BUILD_LOCK: lock.token }
      await expect(prepare(root, env)).rejects.toThrow()
      expect(JSON.parse(await readFile(lock.path, "utf8")).sdk).toBeUndefined()
      await rm(join(root, "packages/sdk/js/fail"))
      expect(await prepare(root, env)).toBe(false)
      expect(JSON.parse(await readFile(lock.path, "utf8")).sdk).toBe(lock.token)
    })
    expect(await readFile(join(root, "count"), "utf8")).toBe("2")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)

test("root resolves external artifacts from invocation cwd, prepares SDK once and preserves lock through packaging", async () => {
  const { root, put } = await fixture()
  try {
    const helper = new URL("../../script/prepare-sdk.ts", import.meta.url).href
    const lock = new URL("../../script/build-lock.ts", import.meta.url).href
    await put(
      "packages/kilo-vscode/package.json",
      JSON.stringify({
        version: "1.2.3",
        scripts: { "package:vsix": `"${process.execPath.replaceAll("\\", "/")}" package.ts` },
      }),
    )
    await put(
      "packages/kilo-vscode/package.ts",
      `
      import { prepare } from ${JSON.stringify(helper)}
      import { acquire } from ${JSON.stringify(lock)}
      const root = ${JSON.stringify(root)}
      await Bun.write(root + "/packages/sdk/js/dist/v2/client.js", "changed after root verification")
      if (!await prepare(root)) throw new Error("SDK was generated twice")
      const lock = await acquire(root, process.env.VSIX_BUILD_LOCK)
      if (lock.owned) throw new Error("child acquired another lock")
      await Bun.write(root + "/external", process.env.CLI_DIST_DIR!)
    `,
    )
    await build(root, [], { CLI_DIST_DIR: "artifacts" }, join(root, "invocation"))
    expect(await readFile(join(root, "external"), "utf8")).toBe(join(root, "invocation/artifacts"))
    expect(await readFile(join(root, "count"), "utf8")).toBe("1")
    await expect(build(root, ["--force"], { CLI_DIST_DIR: "artifacts" }, root)).rejects.toThrow("cannot be combined")
    await expect(build(root, ["--help", "--unknown"], {}, root)).rejects.toThrow("Unknown")
    await build(root, ["--help"], {}, root)
    await put("packages/kilo-vscode/package.ts", "throw new Error('validation failed')")
    await expect(build(root, [], { CLI_DIST_DIR: "artifacts" }, root)).rejects.toThrow()
    expect(await Bun.file(join(root, "packages/kilo-vscode/node_modules/.cache/sdk-build.json")).exists()).toBe(true)
    expect(await Bun.file(join(root, ".kilo/vsix-build.lock")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
