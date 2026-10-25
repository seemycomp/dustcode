import { $ } from "bun"
import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readdir, readFile, readlink, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export async function inventory(dir: string) {
  const entries: { path: string; hash: string; mode: number }[] = []
  async function visit(base: string) {
    for (const name of (await readdir(join(dir, base))).sort()) {
      const file = base ? `${base}/${name}` : name
      const path = join(dir, file)
      const stat = await lstat(path)
      if (stat.isDirectory()) {
        await visit(file)
        continue
      }
      if (!stat.isFile()) throw new Error(`Build output is not a regular file: ${path}`)
      entries.push({ path: file, hash: digest(await readFile(path)), mode: stat.mode & 0o777 })
    }
  }
  await visit("")
  return entries
}

export async function fingerprint(root: string, paths: string[], exclude: string[] = []) {
  const result = await $`git ls-files --cached --others --exclude-standard -z -- ${paths}`.cwd(root).quiet().nothrow()
  if (result.exitCode !== 0) {
    console.log("[build-cache] git fingerprint unavailable; rebuilding without caching")
    return undefined
  }
  const files = [...new Set(result.text().split("\0").filter(Boolean))].sort()
  const hash = createHash("sha256")
  for (const file of files) {
    if (/(^|\/)(node_modules|dist|out|coverage|test-results|playwright-report|\.cache|\.turbo)(\/|$)/.test(file))
      continue
    if (file.endsWith(".tsbuildinfo") || file === "packages/sdk/js/openapi.json") continue
    if (exclude.some((path) => file === path || file.startsWith(`${path}/`))) continue
    const path = join(root, file)
    const stat = await lstat(path).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err
      return undefined
    })
    hash.update(JSON.stringify([file, stat?.mode ?? "deleted"]))
    if (!stat) continue
    hash.update(stat.isSymbolicLink() ? await readlink(path) : await readFile(path))
  }
  return hash.digest("hex")
}

export async function load(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (err) {
    console.log(`[build-cache] cache miss (${path}): ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

export async function publish(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const part = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(part, JSON.stringify(value) + "\n", { flag: "wx" })
    await rename(part, path)
  } finally {
    await rm(part, { force: true })
  }
}

export async function timed<T>(name: string, fn: () => Promise<T>) {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    console.log(`[build] ${name}: ${((performance.now() - start) / 1000).toFixed(2)}s`)
  }
}
