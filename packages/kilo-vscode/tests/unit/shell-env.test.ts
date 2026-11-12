import { afterEach, describe, expect, it } from "bun:test"
import { realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { getShellEnvironment, execWithShellEnv, clearShellEnvCache } from "../../src/agent-manager/shell-env"

const key =
  process.platform === "win32" ? Object.keys(process.env).find((key) => key.toLowerCase() === "path")! : "PATH"

afterEach(() => {
  clearShellEnvCache()
})

describe("getShellEnvironment", () => {
  it("returns an object with PATH", async () => {
    const env = await getShellEnvironment()
    expect(env).toBeDefined()
    expect(typeof env[key]).toBe("string")
    expect(env[key]!.length).toBeGreaterThan(0)
  })

  it("returns the platform home environment", async () => {
    const env = await getShellEnvironment()
    const home = process.platform === "win32" ? "USERPROFILE" : "HOME"
    expect(typeof env[home]).toBe("string")
    if (process.platform === "win32") expect(env[home]).toBe(process.env[home])
  })

  it("caches results across calls", async () => {
    const first = await getShellEnvironment()
    const second = await getShellEnvironment()
    expect(first[key]).toBe(second[key])
  })

  it("returns a copy (mutations don't corrupt cache)", async () => {
    const first = await getShellEnvironment()
    first[key] = "/mutated"
    const second = await getShellEnvironment()
    expect(second[key]).not.toBe("/mutated")
  })

  it("handles multiline env values without corrupting PATH", async () => {
    // PATH should never contain newlines — verify it parses correctly
    // even if other env vars have multiline values (e.g. BASH_FUNC_*)
    const env = await getShellEnvironment()
    expect(env[key]).toBeDefined()
    expect(env[key]).not.toContain("\n")
  })
})

describe("execWithShellEnv", () => {
  it("executes a simple command", async () => {
    const { stdout } = await execWithShellEnv(process.execPath, ["-e", 'console.log("hello")'])
    expect(stdout.trim()).toBe("hello")
  })

  it("passes cwd option through", async () => {
    const cwd = realpathSync(tmpdir())
    const { stdout } = await execWithShellEnv(process.execPath, ["-e", "console.log(process.cwd())"], { cwd })
    expect(stdout.trim()).toBe(cwd)
  })

  it("throws on non-ENOENT errors", async () => {
    await expect(execWithShellEnv(process.execPath, ["-e", "process.exit(2)"])).rejects.toThrow()
  })

  it("concurrent calls don't reject prematurely", async () => {
    // Both calls should succeed — neither should throw due to a race
    const [a, b] = await Promise.all([
      execWithShellEnv(process.execPath, ["-e", 'console.log("first")']),
      execWithShellEnv(process.execPath, ["-e", 'console.log("second")']),
    ])
    expect(a.stdout.trim()).toBe("first")
    expect(b.stdout.trim()).toBe("second")
  })
})

describe("clearShellEnvCache", () => {
  it("forces fresh resolution on next call", async () => {
    const first = await getShellEnvironment()
    clearShellEnvCache()
    const second = await getShellEnvironment()
    // Both should succeed and contain PATH
    expect(first[key]).toBeDefined()
    expect(second[key]).toBeDefined()
  })
})
