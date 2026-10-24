import os from "node:os"
import path from "node:path"

/** Keep fork state outside Kilo's user directories without changing the host environment. */
export function home(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share"), "dustcode")
}

export function environment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(KILO|KILOCODE|OPENCODE|DUSTCODE)_/i.test(key)),
  )
  return {
    ...clean,
    DUSTCODE_HOME: home(env),
    KILO_DISABLE_AUTOUPDATE: "true",
    KILO_DISABLE_CHANNEL_DB: "true",
    KILO_DISABLE_CLAUDE_CODE: "true",
    KILO_TELEMETRY_LEVEL: "off",
  }
}
