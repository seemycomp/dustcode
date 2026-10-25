import { $ } from "bun"
import path from "node:path"

// Turbo must resolve native Bun rather than an npm-generated bun.cmd shim on Windows.
const env = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
}
const result = await $`${process.execPath} turbo typecheck ${Bun.argv.slice(2)}`.env(env).nothrow()
process.exit(result.exitCode)
