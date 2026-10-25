import { $ } from "bun"
import { readFile, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { digest, fingerprint, inventory, load, publish, timed } from "./build-cache"

type Package = {
  name?: string
  workspaces?: string[] | { packages?: string[] }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

async function inputs(root: string) {
  const pkg: Package = await Bun.file(join(root, "package.json")).json()
  const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages ?? [])
  const files = (
    await Promise.all(
      patterns.map((pattern) =>
        Array.fromAsync(new Bun.Glob(`${pattern}/package.json`).scan({ cwd: root, onlyFiles: true })),
      ),
    )
  ).flat()
  const entries = await Promise.all(
    files.map(async (file) => ({ file, pkg: (await Bun.file(join(root, file)).json()) as Package })),
  )
  const packages = new Map(entries.flatMap((entry) => (entry.pkg.name ? [[entry.pkg.name, entry] as const] : [])))
  const dirs = new Set<string>()
  function visit(name: string) {
    const entry = packages.get(name)
    if (!entry) return
    const dir = dirname(entry.file).replaceAll("\\", "/")
    if (dirs.has(dir)) return
    dirs.add(dir)
    for (const dep of Object.keys({
      ...entry.pkg.dependencies,
      ...entry.pkg.devDependencies,
      ...entry.pkg.optionalDependencies,
      ...entry.pkg.peerDependencies,
    }))
      visit(dep)
  }
  for (const dir of ["packages/opencode", "packages/script", "packages/sdk/js"]) {
    const pkg: Package = await Bun.file(join(root, dir, "package.json")).json()
    if (!pkg.name) throw new Error(`Build workspace has no name: ${dir}`)
    visit(pkg.name)
    dirs.add(dir)
  }
  return [
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
    "patches",
    "LICENSE",
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    "script/kilocode",
    ...dirs,
    "packages/kilo-vscode/script/build-cache.ts",
    "packages/kilo-vscode/script/build-lock.ts",
    "packages/kilo-vscode/script/prepare-sdk.ts",
    "packages/kilo-vscode/script/prepare-backend.ts",
  ]
}

async function model(root: string, env: NodeJS.ProcessEnv) {
  const explicit = env.MODELS_DEV_API_JSON
  const path = explicit
    ? resolve(root, "packages/opencode", explicit)
    : join(root, "packages/opencode/node_modules/.cache/models-dev-api.json")
  try {
    const info = await stat(path)
    return {
      hash: digest(await readFile(path)),
      fresh: Boolean(explicit) || (Date.now() - info.mtimeMs < 6 * 60 * 60 * 1000 && info.mtimeMs <= Date.now()),
    }
  } catch (err) {
    if (explicit || (err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    return undefined
  }
}

async function artifacts(dir: string, env: NodeJS.ProcessEnv) {
  const entries = await inventory(dir)
  const binary = join(dir, "bin", process.platform === "win32" ? "kilo.exe" : "kilo")
  const bytes = await Bun.file(binary).slice(0, 4).arrayBuffer()
  const magic = Buffer.from(bytes).toString("hex")
  if (!(magic.startsWith("4d5a") || ["7f454c46", "cffaedfe", "feedfacf", "cafebabe"].includes(magic)))
    throw new Error("Backend is not a native executable")
  const files = new Set(entries.map((entry) => entry.path))
  for (const path of ["package.json", "bin/tree-sitter/tree-sitter.wasm", "bin/kilo-sandbox-mutation-worker.js"]) {
    if (!files.has(path)) throw new Error(`Backend artifact missing: ${path}`)
  }
  if (process.platform === "linux") {
    for (const path of [
      "LICENSE",
      "bin/kilo-sandbox-network-relay.js",
      "bin/kilo-sandbox-seccomp",
      "bin/licenses/sandbox-runtime/LICENSE",
      ...(env.KILO_SKIP_BUNDLED_BWRAP === "1"
        ? []
        : [
            "bin/bwrap",
            "bin/licenses/bubblewrap/NOTICE",
            "bin/licenses/bubblewrap/COPYING",
            "bin/licenses/bubblewrap/MUSL-COPYRIGHT",
            "bin/licenses/bubblewrap/build.ts",
          ]),
    ]) {
      if (!files.has(path)) throw new Error(`Backend artifact missing: ${path}`)
    }
    if (
      env.KILO_SKIP_BUNDLED_BWRAP !== "1" &&
      !entries.some((entry) => /^bin\/licenses\/bubblewrap\/bubblewrap-.+\.tar\.gz$/.test(entry.path))
    )
      throw new Error("Bubblewrap source archive is missing")
  }
  return entries
}

export async function prepare(root: string, env: NodeJS.ProcessEnv, force = false) {
  return timed("Backend preparation", async () => {
    const pin = (await Bun.file(join(root, "script/kilocode/bun.json")).json()) as {
      runtime: string
      revision: string
      version: string
    }
    if (Bun.revision !== pin.revision || Bun.version !== pin.runtime)
      throw new Error(`Build requires Bun ${pin.version} (${pin.revision}), not ${Bun.version}/${Bun.revision}`)
    const paths = await inputs(root)
    const source = () => fingerprint(root, paths)
    const before = await source()
    const dotenv = (
      await Promise.all(
        ["", ...paths.filter((path) => path.startsWith("packages/"))].map(async (dir) => {
          const matches = await Array.fromAsync(
            new Bun.Glob(`${dir ? `${dir}/` : ""}.env*`).scan({ cwd: root, onlyFiles: true, dot: true }),
          )
          return matches.some((path) =>
            /(?:^|\/)\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(path.replaceAll("\\", "/")),
          )
        }),
      )
    ).some(Boolean)
    const settings = Object.fromEntries(
      [
        "KILO_VERSION",
        "KILO_CHANNEL",
        "KILO_PRE_RELEASE",
        "KILO_BUMP",
        "KILO_RELEASE",
        "KILO_SKIP_BUNDLED_BWRAP",
        "KILO_MODELS_URL",
        "NODE_ENV",
        "BUN_OPTIONS",
        "NODE_OPTIONS",
        ...Object.keys(env).filter((key) => key.startsWith("VITE_") || key.startsWith("BUN_FEATURE_FLAG_")),
      ]
        .sort()
        .map((key) => [key, env[key] ?? ""]),
    )
    const zig = env.ZIG
      ? Bun.which(env.ZIG, { cwd: join(root, "packages/opencode"), PATH: env.PATH })
      : Bun.which("zig", { PATH: env.PATH })
    if (env.ZIG && !zig) throw new Error(`Zig compiler not found: ${env.ZIG}`)
    const compiler = zig ? digest(await readFile(zig)) : ""
    const identity = {
      settings,
      compiler,
      bun: Bun.version,
      revision: Bun.revision,
      platform: process.platform,
      arch: process.arch,
    }
    const ci = env.GITHUB_ACTIONS === "true" || Boolean(env.CI && !["0", "false"].includes(env.CI.toLowerCase()))
    // Nix patches the runtime interpreter; its external toolchain is not certified by this local cache.
    const reusable =
      !env.NIX_BUILD_TOP &&
      !env.BUN_OPTIONS &&
      !env.NODE_OPTIONS &&
      !dotenv &&
      Boolean(env.KILO_VERSION && env.KILO_CHANNEL) &&
      !env.KILO_RELEASE
    const cache = join(root, "packages/kilo-vscode/node_modules/.cache/vsix-backend.json")
    const target = `@kilocode/cli-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
    const dir = join(root, "packages/opencode/dist", target)
    const snap = await model(root, env)
    const prior = await load(cache)
    const entries = await artifacts(dir, env).catch((err) => {
      console.log(`[prepare-backend] artifact cache miss: ${err.message}`)
    })
    const record = { schema: 2, source: before, identity, model: snap?.hash, target, entries }
    if (
      !force &&
      !ci &&
      reusable &&
      before &&
      snap?.fresh &&
      entries &&
      JSON.stringify(prior) === JSON.stringify(record)
    ) {
      console.log("[prepare-backend] cache hit: verified native artifact inventory")
      return true
    }
    console.log(
      `[prepare-backend] cache miss: ${force ? "forced" : ci ? "CI requires fresh backend" : !reusable ? "nonstandard build environment" : !snap?.fresh ? "missing or expired model snapshot" : "inputs, metadata or artifacts changed"}`,
    )
    await rm(cache, { force: true })
    await $`${process.execPath} run build --single --skip-install --without-console`
      .cwd(join(root, "packages/opencode"))
      .env(env)
    if (before !== (await source())) throw new Error("Backend source changed during build; cache not published")
    const fresh = await model(root, env)
    if (env.MODELS_DEV_API_JSON && snap?.hash !== fresh?.hash)
      throw new Error("Explicit model snapshot changed during build; cache not published")
    const output = await artifacts(dir, env)
    if (before !== (await source()))
      throw new Error("Backend source changed during artifact validation; cache not published")
    if (before && reusable && fresh?.fresh) await publish(cache, { ...record, model: fresh.hash, entries: output })
    return false
  })
}
