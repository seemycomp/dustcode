import { expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"

test("fork config discovery and overlay targets exclude original Kilo configuration", async () => {
  await using tmp = await tmpdir()
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import path from "path"
    import { Effect } from "effect"
    import { FSUtil } from "@opencode-ai/core/fs-util"
    import { LayerNode } from "@opencode-ai/core/effect/layer-node"
    import { Global } from "@opencode-ai/core/global"
    import { ConfigPaths } from "./src/config/paths"
    import { ConfigManaged } from "./src/config/managed"
    import { KilocodeConfig } from "./src/kilocode/config/config"
    import { KilocodeConfigOverlay } from "./src/kilocode/config/overlay"
    import { KilocodeConfigSources } from "./src/kilocode/config/sources"
    const dir = process.env.TEST_DIRECTORY
    const legacy = path.join(dir, ".kilo", "kilo.jsonc")
    const original = JSON.stringify({ model: "original/model" })
    await Bun.write(legacy, original)
    await Bun.write(path.join(dir, "kilo.jsonc"), original)
    await Bun.write(path.join(dir, ".kilocodemodes"), "invalid legacy yaml")
    await Bun.write(path.join(dir, ".dustcode", "kilo.jsonc"), JSON.stringify({ model: "fork/model" }))
    const input = { directory: dir, worktree: dir }
    const found = await Effect.runPromise(Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      return { files: yield* KilocodeConfig.projectConfigFiles({ ...input, fs }), dirs: yield* ConfigPaths.directories(dir, dir), roots: yield* ConfigPaths.files("kilo", dir, dir) }
    }).pipe(Effect.provide(LayerNode.compile(FSUtil.node))))
    const overlay = await KilocodeConfigOverlay.project(input)
    const sources = await KilocodeConfigSources.list(input)
    const target = await KilocodeConfigOverlay.projectTarget(input)
    const global = KilocodeConfigOverlay.globalTarget()
    const migrated = await KilocodeConfig.loadLegacyConfigs({ projectDir: dir, merge: () => { throw new Error("legacy merge") } })
    await Bun.write(path.join(dir, ".kilocodeignore"), "secrets/*")
    const ignored = await KilocodeConfig.loadLegacyConfigs({ projectDir: dir, merge: () => { throw new Error("legacy merge") } })
    console.log(JSON.stringify({ found, overlay, sources, target, global, migrated, ignored, managed: ConfigManaged.managedConfigDir(), preferences: await ConfigManaged.readManagedPreferences(), original: await Bun.file(legacy).text(), config: Global.Path.config }))
    process.exit(0)
  `,
    ],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        DUSTCODE_HOME: path.join(tmp.path, "profile"),
        TEST_DIRECTORY: tmp.path,
        KILO_CONFIG: path.join(tmp.path, "kilo.jsonc"),
        KILO_CONFIG_DIR: path.join(tmp.path, ".kilo"),
        KILO_DB: ":memory:",
      },
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    },
  )
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(err).not.toContain("error:")
  expect(code).toBe(0)
  const result = JSON.parse(out.trim().split("\n").at(-1)!)
  const dir = path.join(tmp.path, ".dustcode")
  expect(result.found.files).toEqual([path.join(dir, "kilo.jsonc"), path.join(dir, "kilo.json")])
  expect(result.found.dirs).toEqual([result.config, dir])
  expect(result.found.roots).toEqual([])
  expect(result.overlay.model).toBe("fork/model")
  expect(result.target).toBe(path.join(dir, "kilo.jsonc"))
  expect(result.global).toBe(path.join(result.config, "kilo.jsonc"))
  expect(result.migrated).toEqual({ config: {}, warnings: [] })
  expect(result.ignored.config.permission.read["secrets/*"]).toBe("deny")
  expect(result.ignored.config.permission.edit["secrets/*"]).toBe("deny")
  expect(result.managed).toBeUndefined()
  expect(result.preferences).toBeUndefined()
  expect(result.original).toBe(JSON.stringify({ model: "original/model" }))
  expect(
    result.sources.sources.some((source: { path?: string }) => source.path?.includes(`${path.sep}.kilo${path.sep}`)),
  ).toBe(false)
  expect(
    result.sources.sources.some(
      (source: { kind: string }) =>
        source.kind.startsWith("managed") || source.kind === "env-file" || source.kind === "project-file",
    ),
  ).toBe(false)
}, 120_000)
