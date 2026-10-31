import { afterEach, describe, expect, test } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { watch } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"

const source = resolve(import.meta.dir, "../../../..")
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function fixture() {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "kilo-launch-")))
  dirs.push(repo)
  for (const path of ["", "packages/kilo-vscode", "packages/opencode", "packages/sdk/js"]) {
    const dir = join(repo, path)
    mkdirSync(dir, { recursive: true })
    symlinkSync(join(source, path, "node_modules"), join(dir, "node_modules"), "junction")
  }
  const root = join(repo, "packages/kilo-vscode")
  mkdirSync(join(root, "script"))
  cpSync(join(source, "packages/kilo-vscode/script/launch.ts"), join(root, "script/launch.ts"))
  await Bun.write(join(root, "package.json"), JSON.stringify({ scripts: { "build:launch": "bun build.ts" } }))
  await Bun.write(join(root, "build.ts"), 'await Bun.write("dist/extension.js", "built")')
  const workspace = join(repo, "workspace")
  await Bun.write(join(workspace, "package.json"), JSON.stringify({ main: "index.ts" }))
  await Bun.write(join(workspace, "index.ts"), 'await Bun.write("opened.json", JSON.stringify(process.argv.slice(2)))')
  return {
    root,
    workspace,
    run: (args: string[] = ["--no-build"], app = process.execPath, env: NodeJS.ProcessEnv = {}) =>
      Bun.spawnSync(
        [
          process.execPath,
          join(root, "script/launch.ts"),
          "--isolated",
          "--wait",
          "--app-path",
          app,
          "--workspace",
          workspace,
          ...args,
        ],
        {
          cwd: repo,
          env: { ...process.env, PATH: [dirname(process.execPath), process.env.PATH].join(delimiter), ...env },
          stdout: "pipe",
          stderr: "pipe",
        },
      ),
  }
}

describe("extension launch build", () => {
  test("does not forward Node debug options to the editor process", async () => {
    const item = await fixture()
    await Bun.write(join(item.root, "dist/extension.js"), "previous")
    await Bun.write(
      join(item.workspace, "index.ts"),
      'await Bun.write("environment.json", JSON.stringify({ options: process.env.NODE_OPTIONS ?? null, project: process.env.DUSTCODE_LAUNCH_TEST }))',
    )
    expect(
      item.run(["--no-build"], process.execPath, {
        NODE_OPTIONS: "--trace-warnings",
        DUSTCODE_LAUNCH_TEST: "preserved",
      }).exitCode,
    ).toBe(0)
    expect(await Bun.file(join(item.workspace, "environment.json")).json()).toEqual({
      options: null,
      project: "preserved",
    })
  })

  test("reports the editor exit code to the caller", async () => {
    const item = await fixture()
    await Bun.write(join(item.root, "dist/extension.js"), "previous")
    await Bun.write(join(item.workspace, "index.ts"), "process.exit(7)")
    const result = item.run()
    expect(result.exitCode).toBe(7)
    expect(result.stdout.toString()).toContain("VS Code exited (code 7)")
  })

  test("keeps the app running after launch exits when the executable path contains spaces", async () => {
    const item = await fixture()
    const app = join(item.root, process.platform === "win32" ? "Bun Runtime.exe" : "Bun Runtime")
    cpSync(process.execPath, app)
    await Bun.write(join(item.root, "dist/extension.js"), "previous")
    const controller = new AbortController()
    const events = watch(item.workspace, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
    const opened = (async () => {
      for await (const event of events) {
        if (event.filename === "opened.json") return
      }
    })()
    try {
      expect(item.run(["--no-build", "--no-wait"], app).exitCode).toBe(0)
      await opened
      expect(await Bun.file(join(item.workspace, "opened.json")).exists()).toBe(true)
    } finally {
      controller.abort()
    }
  }, 10000)

  test("builds a fresh worktree before launching even with --no-build", async () => {
    const item = await fixture()
    const result = item.run()
    expect(result.exitCode).toBe(0)
    expect(await Bun.file(join(item.root, "dist/extension.js")).text()).toBe("built")
    expect(await Bun.file(join(item.workspace, "opened.json")).json()).toContain(
      `--extensionDevelopmentPath=${item.root}`,
    )
  })

  test("reuses an existing bundle with --no-build", async () => {
    const item = await fixture()
    await Bun.write(join(item.root, "dist/extension.js"), "previous")
    expect(item.run().exitCode).toBe(0)
    expect(await Bun.file(join(item.root, "dist/extension.js")).text()).toBe("previous")
    expect(await Bun.file(join(item.workspace, "opened.json")).exists()).toBe(true)
  })

  test("rebuilds an existing bundle by default", async () => {
    const item = await fixture()
    await Bun.write(join(item.root, "dist/extension.js"), "previous")
    expect(item.run([]).exitCode).toBe(0)
    expect(await Bun.file(join(item.root, "dist/extension.js")).text()).toBe("built")
  })

  test("does not launch when the required build fails", async () => {
    const item = await fixture()
    await Bun.write(join(item.root, "build.ts"), "process.exit(1)")
    expect(item.run().exitCode).toBe(1)
    expect(await Bun.file(join(item.workspace, "opened.json")).exists()).toBe(false)
  })
})
