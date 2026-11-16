import { expect, it } from "bun:test"
import path from "node:path"

it("removes deleted sessions from every cached query and manager reference in only the owning project", () => {
  const child = Bun.spawnSync([process.execPath, "--conditions=browser", "tests/fixtures/history-delete-state.ts"], {
    cwd: path.resolve(import.meta.dir, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
})
