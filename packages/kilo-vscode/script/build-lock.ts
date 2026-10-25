import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

type Lock = { path: string; token: string; owned: boolean; release: () => Promise<void> }

export async function receipt(lock: Pick<Lock, "path" | "token">, mark = false) {
  const value = JSON.parse(await readFile(lock.path, "utf8")) as { token?: string; pid?: number; sdk?: string }
  if (value.token !== lock.token) throw new Error(`VSIX build lock token is not valid: ${lock.path}`)
  if (!Number.isInteger(value.pid) || !value.pid || value.pid < 1)
    throw new Error(`VSIX build lock owner is not valid: ${lock.path}`)
  process.kill(value.pid, 0)
  if (mark) await writeFile(lock.path, JSON.stringify({ ...value, sdk: lock.token }) + "\n")
  return value.sdk === lock.token
}

export async function acquire(root: string, inherited?: string): Promise<Lock> {
  const dir = join(root, ".kilo")
  const path = join(dir, "vsix-build.lock")
  if (inherited) {
    const value = JSON.parse(await readFile(path, "utf8")) as { token?: string }
    if (value.token !== inherited) throw new Error(`VSIX build lock token is not valid: ${path}`)
    return { path, token: inherited, owned: false, release: async () => {} }
  }
  await mkdir(dir, { recursive: true })
  const token = randomUUID()
  try {
    await writeFile(path, JSON.stringify({ token, pid: process.pid }) + "\n", { flag: "wx" })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
    throw new Error(
      `Another VSIX build holds ${path}. Stop it before packaging; remove a stale lock only after confirming no build is active. Stop local launch/watch builds too.`,
      { cause: err },
    )
  }
  return {
    path,
    token,
    owned: true,
    release: async () => {
      try {
        const value = JSON.parse(await readFile(path, "utf8")) as { token?: string }
        if (value.token !== token) throw new Error(`VSIX build lock ownership changed: ${path}`)
        await rm(path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return
        throw err
      }
    },
  }
}

export async function withLock<T>(root: string, fn: (lock: Lock) => Promise<T>, inherited?: string) {
  const lock = await acquire(root, inherited)
  try {
    return await fn(lock)
  } finally {
    if (lock.owned) await lock.release()
  }
}
