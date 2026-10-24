import { $ } from "bun"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const extension = path.join(root, "packages/kilo-vscode")
const pkg = await Bun.file(path.join(extension, "package.json")).json()
const env = {
  ...process.env,
  KILO_VERSION: process.env.KILO_VERSION ?? pkg.version,
  KILO_CHANNEL: process.env.KILO_CHANNEL ?? "latest",
  KILO_RELEASE: "",
}

await $`bun run build --single --skip-install`.cwd(path.join(root, "packages/opencode")).env(env)
await $`bun run package:vsix --single`.cwd(extension).env(env)
