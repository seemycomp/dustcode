import { $ } from "bun"
import { join, resolve } from "node:path"
import { withLock } from "../../packages/kilo-vscode/script/build-lock"
import { timed } from "../../packages/kilo-vscode/script/build-cache"
import { prepare as sdk } from "../../packages/kilo-vscode/script/prepare-sdk"
import { prepare as backend } from "../../packages/kilo-vscode/script/prepare-backend"

export async function build(root: string, args: string[], inherited: NodeJS.ProcessEnv, cwd: string) {
  const unknown = args.find((arg) => !["--force", "--help"].includes(arg))
  if (unknown) throw new Error(`Unknown build:vscode option: ${unknown}`)
  const force = args.includes("--force")
  if (force && inherited.CLI_DIST_DIR) throw new Error("--force cannot be combined with CLI_DIST_DIR")
  if (args.includes("--help")) {
    console.log("Usage: bun run build:vscode [--force] [--help]")
    console.log("  --force  Rebuild the local backend; keep validation and SDK/helper caches enabled.")
    console.log("  VSIX builds omit the deprecated browser Console; VS Code webviews are unchanged.")
    console.log("  CLI_DIST_DIR  Package caller-provided CLI artifacts instead of building a local backend.")
    console.log("  CI builds always compile a fresh local backend. --force cannot be combined with CLI_DIST_DIR.")
    return
  }
  const extension = join(root, "packages/kilo-vscode")
  const pkg = await Bun.file(join(extension, "package.json")).json()
  const external = inherited.CLI_DIST_DIR ? resolve(cwd, inherited.CLI_DIST_DIR) : undefined
  await withLock(
    root,
    (lock) =>
      timed("VSIX build", async () => {
        const env = {
          ...inherited,
          ...(external ? { CLI_DIST_DIR: external } : {}),
          VSIX_BUILD_LOCK: lock.token,
          KILO_VERSION: inherited.KILO_VERSION ?? pkg.version,
          KILO_CHANNEL: inherited.KILO_CHANNEL ?? "latest",
          KILO_RELEASE: "",
        }
        await sdk(root, env)
        if (!external) await backend(root, env, force)
        if (external) console.log(`[build] caller-managed CLI_DIST_DIR: ${external}; skipping local backend`)
        await timed("Extension packaging", async () => {
          await $`${process.execPath} run package:vsix --single`.cwd(extension).env(env)
        })
      }),
    inherited.VSIX_BUILD_LOCK,
  )
}

if (import.meta.main) await build(resolve(import.meta.dir, "../.."), process.argv.slice(2), process.env, process.cwd())
