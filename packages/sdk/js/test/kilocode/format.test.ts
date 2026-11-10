import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { format } from "../../script/kilocode/format"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "sdk-format-"))
  dirs.push(dir)
  await Bun.write(join(dir, ".prettierrc.json"), JSON.stringify({ semi: false, singleQuote: false }))
  return dir
}

test("formats legacy, generated and handwritten v2 files and leaves other sources alone", async () => {
  const dir = await fixture()
  const files = ["src/gen/types.gen.ts", "src/v2/gen/types.gen.ts", "src/v2/client.ts", "src/v2/server.ts"]
  for (const file of [...files, "src/index.ts"]) await Bun.write(join(dir, file), "export const value = 'test';\n")
  await format(dir)
  for (const file of files) expect(await Bun.file(join(dir, file)).text()).toBe('export const value = "test"\n')
  expect(await Bun.file(join(dir, "src/index.ts")).text()).toBe("export const value = 'test';\n")
  const prior = await stat(join(dir, files[0]!))
  await format(dir)
  expect((await stat(join(dir, files[0]!))).mtimeMs).toBe(prior.mtimeMs)
})

test("finishes writing large generated types before returning", async () => {
  const dir = await fixture()
  const file = join(dir, "src/v2/gen/types.gen.ts")
  await Bun.write(file, "export type Model = 'model';\n".repeat(10000))
  await format(dir)
  expect(await Bun.file(file).text()).toBe('export type Model = "model"\n'.repeat(10000))
})

test("propagates parser errors without reporting a successful format", async () => {
  const dir = await fixture()
  const file = join(dir, "src/v2/gen/types.gen.ts")
  await Bun.write(file, "export type Broken = {;")
  await expect(format(dir)).rejects.toThrow()
  expect(await Bun.file(file).text()).toBe("export type Broken = {;")
})

test("respects formatter ignores and skips unsupported files", async () => {
  const dir = await fixture()
  await Bun.write(join(dir, ".prettierignore"), "src/v2/ignored.ts\n")
  await Bun.write(join(dir, "src/v2/ignored.ts"), "not valid TypeScript !!!")
  await Bun.write(join(dir, "src/v2/asset.bin"), new Uint8Array([0, 255, 1]))
  await format(dir)
  expect(await Bun.file(join(dir, "src/v2/ignored.ts")).text()).toBe("not valid TypeScript !!!")
  expect(await Bun.file(join(dir, "src/v2/asset.bin")).bytes()).toEqual(new Uint8Array([0, 255, 1]))
})

async function lock(file: string) {
  const { dlopen } = await import("bun:ffi")
  const lib = dlopen("kernel32.dll", {
    CreateFileW: { args: ["ptr", "u32", "u32", "ptr", "u32", "u32", "u64"], returns: "u64" },
    CloseHandle: { args: ["u64"], returns: "i32" },
  })
  // Allow readers, but deny writes while the native handle is held.
  const handle = lib.symbols.CreateFileW(Buffer.from(file + "\0", "utf16le"), 0x80000000, 1, null, 3, 0, 0n)
  if (handle === 0xffffffffffffffffn) {
    lib.close()
    throw new Error("could not lock generated file")
  }
  let open = true
  return () => {
    if (!open) return
    open = false
    lib.symbols.CloseHandle(handle)
    lib.close()
  }
}

test.skipIf(process.platform !== "win32")("retries a transient Windows write lock", async () => {
  const dir = await fixture()
  const file = join(dir, "src/v2/gen/types.gen.ts")
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, "export const value = 'test';\n")
  const release = await lock(file)
  const timer = setTimeout(release, 150)
  try {
    await format(dir)
  } finally {
    clearTimeout(timer)
    release()
  }
  expect(await Bun.file(file).text()).toBe('export const value = "test"\n')
})

test.skipIf(process.platform !== "win32")("fails when a Windows write lock never clears", async () => {
  const dir = await fixture()
  const file = join(dir, "src/v2/gen/types.gen.ts")
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, "export const value = 'test';\n")
  const release = await lock(file)
  try {
    await expect(format(dir)).rejects.toThrow()
  } finally {
    release()
  }
  expect(await Bun.file(file).text()).toBe("export const value = 'test';\n")
})
