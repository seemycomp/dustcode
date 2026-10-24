import { expect, test } from "bun:test"
import path from "path"
import os from "os"
import { tmpdir } from "../fixture/tmpdir"

async function inspect(root?: string, config = false) {
  await using tmp = await tmpdir()
  const env = { ...process.env }
  delete env.DUSTCODE_HOME
  delete env.KILO_TEST_HOME
  delete env.KILO_CONFIG_DIR
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
      const { Profile } = await import(${JSON.stringify(new URL("../../src/kilocode/profile.ts", import.meta.url).href)});
      const { Global } = await import(${JSON.stringify(new URL("../../src/global.ts", import.meta.url).href)});
      let documents;
      if (${config}) {
        const fs = await import("fs/promises");
        const path = await import("path");
        const { Effect, Layer } = await import("effect");
        const { Config } = await import("./src/config");
        const { AppNodeBuilder } = await import("./src/effect/app-node-builder");
        const { LayerNode } = await import("./src/effect/layer-node");
        const { Location } = await import("./src/location");
        const { Policy } = await import("./src/policy");
        const { AbsolutePath } = await import("./src/schema");
        const { location } = await import("./test/fixture/location");
        const dir = path.join(Profile.root, "project");
        for (const name of [".dustcode", ".kilo", ".kilocode"]) await fs.mkdir(path.join(dir, name), { recursive: true });
        for (const name of ["kilo.json", "opencode.json"]) await fs.writeFile(path.join(dir, name), JSON.stringify({ model: "ignored/root" }));
        for (const name of [".kilo", ".kilocode"]) await fs.writeFile(path.join(dir, name, "kilo.jsonc"), JSON.stringify({ model: "ignored/legacy" }));
        await fs.writeFile(path.join(Global.Path.config, "kilo.jsonc"), JSON.stringify({ model: "fork/global" }));
        await fs.writeFile(path.join(dir, ".dustcode", "kilo.jsonc"), JSON.stringify({ model: "fork/project" }));
        const layer = AppNodeBuilder.build(LayerNode.group([Config.node, Policy.node]), [
          [Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(dir) })))],
        ]);
        documents = await Effect.runPromise(Config.Service.use(c => c.entries()).pipe(Effect.provide(layer), Effect.scoped));
      }
      console.log(JSON.stringify({ enabled: Profile.enabled, root: Profile.root, dir: Profile.dir(), dirs: Profile.dirs(), files: Profile.files(), paths: Global.Path, config: Global.make().config, documents }));
      process.exit(0);
    `,
    ],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: {
        ...env,
        XDG_DATA_HOME: path.join(tmp.path, "xdg-data"),
        XDG_CACHE_HOME: path.join(tmp.path, "xdg-cache"),
        XDG_CONFIG_HOME: path.join(tmp.path, "xdg-config"),
        XDG_STATE_HOME: path.join(tmp.path, "xdg-state"),
        ...(root === undefined ? {} : { DUSTCODE_HOME: root, KILO_CONFIG_DIR: path.join(tmp.path, "original") }),
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
  expect(err).toBe("")
  expect(code).toBe(0)
  return JSON.parse(out)
}

test("Dustcode isolates every global root without replacing the real home", async () => {
  await using tmp = await tmpdir()
  const result = await inspect(tmp.path)
  expect(result.enabled).toBe(true)
  expect(result.root).toBe(tmp.path)
  expect(result.dir).toBe(".dustcode")
  expect(result.dirs).toEqual([".dustcode"])
  expect(result.files).toEqual(["kilo.json", "kilo.jsonc"])
  for (const name of ["data", "cache", "config", "state", "tmp"]) {
    expect(result.paths[name]).toBe(path.join(tmp.path, name))
  }
  expect(result.config).toBe(path.join(tmp.path, "config"))
  expect(result.paths.home).toBe(os.homedir().trim())
})

test("Kilo retains its original paths without a Dustcode profile", async () => {
  const result = await inspect()
  expect(result.enabled).toBe(false)
  expect(result.dir).toBe(".kilo")
  expect(result.dirs).toEqual([".kilocode", ".kilo"])
  expect(result.files).toEqual(["kilo.json", "kilo.jsonc", "opencode.json", "opencode.jsonc"])
  expect(result.paths.tmp).toBe(path.join(os.tmpdir(), "kilo"))
  expect(path.basename(result.paths.data)).toBe("kilo")
})

test("core config loads only isolated global and .dustcode project files", async () => {
  await using tmp = await tmpdir()
  const result = await inspect(tmp.path, true)
  expect(
    result.documents
      .filter((entry: { type: string }) => entry.type === "document")
      .map((entry: { info: { model: string } }) => entry.info.model),
  ).toEqual(["fork/global", "fork/project"])
  expect(
    result.documents
      .filter((entry: { type: string }) => entry.type === "directory")
      .map((entry: { path: string }) => entry.path),
  ).toEqual([path.join(tmp.path, "config"), path.join(tmp.path, "project", ".dustcode")])
}, 30_000)
