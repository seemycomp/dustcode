import { expect, it } from "bun:test"
import { unlinkSync } from "node:fs"
import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

it("loads settings-only catalogs on demand and accepts empty responses", async () => {
  const root = path.resolve(import.meta.dir, "../..")
  const solid = path.dirname(Bun.resolveSync("solid-js/package.json", root))
  const result = await build({
    entryPoints: [path.join(root, "tests/fixtures/lazy-catalogs.tsx")],
    bundle: true,
    conditions: ["browser"],
    external: ["happy-dom"],
    format: "esm",
    platform: "node",
    alias: {
      "solid-js": path.join(solid, "dist/solid.js"),
      "solid-js/web": path.join(solid, "web/dist/web.js"),
      "solid-js/store": path.join(solid, "store/dist/store.js"),
    },
    plugins: [solidPlugin()],
    write: false,
  })
  const file = path.join(root, `.lazy-catalogs-${crypto.randomUUID()}.mjs`)
  await Bun.write(file, result.outputFiles.at(0)!.contents)
  try {
    const child = Bun.spawnSync(["bun", file], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
  } finally {
    unlinkSync(file)
  }
}, 60_000)
