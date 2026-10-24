import { describe, expect, test } from "bun:test"
import path from "node:path"
import { environment, home } from "../../src/isolation"

describe("Dustcode process isolation", () => {
  test("does not inherit Kilo config, database, credentials or backend settings", () => {
    const original = {
      PATH: "tools",
      HOME: "real-home",
      USERPROFILE: "real-home",
      KILO_DB: "production.db",
      KILO_CONFIG: "production.json",
      KILO_CONFIG_CONTENT: '{"permission":"allow"}',
      KILO_AUTH_CONTENT: '{"kilo":"secret"}',
      KILO_SERVER_PASSWORD: "original",
      KILOCODE_TOKEN: "original",
      OPENCODE_CONFIG: "original.json",
      DUSTCODE_HOME: "untrusted",
      XDG_DATA_HOME: path.resolve("fork-test-data"),
      HTTPS_PROXY: "http://proxy",
    }
    const env = environment(original)
    expect(env.DUSTCODE_HOME).toBe(path.join(original.XDG_DATA_HOME, "dustcode"))
    expect(env.PATH).toBe(original.PATH)
    expect(env.HOME).toBe(original.HOME)
    expect(env.USERPROFILE).toBe(original.USERPROFILE)
    expect(env.HTTPS_PROXY).toBe(original.HTTPS_PROXY)
    for (const key of [
      "KILO_DB",
      "KILO_CONFIG",
      "KILO_CONFIG_CONTENT",
      "KILO_AUTH_CONTENT",
      "KILO_SERVER_PASSWORD",
      "KILOCODE_TOKEN",
      "OPENCODE_CONFIG",
    ]) {
      expect(env[key]).toBeUndefined()
    }
    expect(env.KILO_DISABLE_AUTOUPDATE).toBe("true")
    expect(env.KILO_TELEMETRY_LEVEL).toBe("off")
    expect(original.KILO_DB).toBe("production.db")
    expect(original.DUSTCODE_HOME).toBe("untrusted")
  })

  test("has a stable root distinct from Kilo without an XDG override", () => {
    expect(path.basename(home({}))).toBe("dustcode")
    expect(path.isAbsolute(home({}))).toBe(true)
  })
})
