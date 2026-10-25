import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquire, receipt, withLock } from "../../script/build-lock"

test("checkout lock excludes competing builds, verifies child tokens and releases after failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "vsix-lock-"))
  try {
    await expect(
      withLock(root, async (lock) => {
        const value = JSON.parse(await readFile(lock.path, "utf8"))
        expect(value.token).toBe(lock.token)
        await expect(acquire(root)).rejects.toThrow("Another VSIX build")
        await expect(acquire(root, "not-the-owner")).rejects.toThrow("token is not valid")
        await withLock(
          root,
          async (child) => {
            expect(child.owned).toBe(false)
          },
          lock.token,
        )
        await expect(acquire(root)).rejects.toThrow("Another VSIX build")
        throw new Error("build failed")
      }),
    ).rejects.toThrow("build failed")
    const next = await acquire(root)
    await next.release()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("SDK receipts require the current token and a live owner, and expire with the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "vsix-lock-"))
  try {
    await withLock(root, async (lock) => {
      expect(await receipt(lock)).toBe(false)
      await receipt(lock, true)
      const child = await acquire(root, lock.token)
      expect(await receipt(child)).toBe(true)
      for (const mark of [false, true])
        await expect(receipt({ ...lock, token: "not-the-owner" }, mark)).rejects.toThrow("token is not valid")
      await writeFile(lock.path, JSON.stringify({ token: lock.token, pid: process.pid, sdk: "another-token" }))
      expect(await receipt(lock)).toBe(false)
      const proc = Bun.spawn([process.execPath, "-e", ""], { stdout: "pipe", stderr: "pipe", windowsHide: true })
      expect(await proc.exited).toBe(0)
      await writeFile(lock.path, JSON.stringify({ token: lock.token, pid: proc.pid, sdk: lock.token }))
      await expect(receipt(child)).rejects.toThrow()
      await expect(receipt(child, true)).rejects.toThrow()
    })
    await withLock(root, async (lock) => {
      expect(await receipt(lock)).toBe(false)
      await lock.release()
      await expect(receipt(lock, true)).rejects.toThrow()
      expect(await Bun.file(lock.path).exists()).toBe(false)
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
