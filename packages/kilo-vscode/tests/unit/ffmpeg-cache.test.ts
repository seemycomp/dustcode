import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureFfmpegForTarget, packages } from "../../script/ffmpeg-helper"

test("FFmpeg cache restores clean staging, repairs corruption and invalidates package specs", async () => {
  const root = await mkdtemp(join(tmpdir(), "ffmpeg-cache-"))
  const bin = join(root, "bin")
  const source = join(root, "source")
  const prior = packages["win32-x64"]
  try {
    await mkdir(source)
    await Bun.write(join(source, "package.json"), JSON.stringify({ name: "ffmpeg-fixture", version: "1.0.0" }))
    await Bun.write(join(source, "ffmpeg.exe"), "version-one")
    packages["win32-x64"] = source
    await ensureFfmpegForTarget("win32-x64", bin)
    expect(await Bun.file(join(bin, "ffmpeg.exe")).text()).toBe("version-one")
    await rm(source, { recursive: true })
    await rm(bin, { recursive: true })
    // No source package remains: this call must restore without npm/extraction.
    await ensureFfmpegForTarget("win32-x64", bin)
    expect(await Bun.file(join(bin, "ffmpeg.exe")).text()).toBe("version-one")
    const cache = join(root, "node_modules", ".cache", "ffmpeg")
    const entry = (await readdir(cache)).at(0)!
    await Bun.write(join(cache, entry, "ffmpeg.exe"), "corrupt")
    await mkdir(source)
    await Bun.write(join(source, "package.json"), JSON.stringify({ name: "ffmpeg-fixture", version: "1.0.0" }))
    await Bun.write(join(source, "ffmpeg.exe"), "repaired")
    await ensureFfmpegForTarget("win32-x64", bin)
    expect(await Bun.file(join(bin, "ffmpeg.exe")).text()).toBe("repaired")
    const next = join(root, "next")
    await mkdir(next)
    await Bun.write(join(next, "package.json"), JSON.stringify({ name: "ffmpeg-fixture", version: "2.0.0" }))
    await Bun.write(join(next, "ffmpeg.exe"), "version-two")
    packages["win32-x64"] = next
    await ensureFfmpegForTarget("win32-x64", bin)
    expect(await Bun.file(join(bin, "ffmpeg.exe")).text()).toBe("version-two")
    await ensureFfmpegForTarget("win32-arm64", bin)
    expect(await Bun.file(join(bin, "ffmpeg.exe")).exists()).toBe(false)
    packages["win32-x64"] = join(root, "missing")
    await expect(ensureFfmpegForTarget("win32-x64", bin)).rejects.toThrow()
    expect((await readdir(bin)).some((name) => name.startsWith(".ffmpeg-tmp"))).toBe(false)
  } finally {
    packages["win32-x64"] = prior
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
