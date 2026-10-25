import { $ } from "bun"
import { createHash, randomUUID } from "node:crypto"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, lstatSync } from "node:fs"
import { join } from "node:path"

/** Exported so SBOM generation can model the exact helper each VSIX ships. */
export const packages: Record<string, string> = {
  "darwin-x64": "@ffmpeg-installer/darwin-x64@4.1.0",
  "darwin-arm64": "@ffmpeg-installer/darwin-arm64@4.1.5",
  "linux-x64": "@ffmpeg-installer/linux-x64@4.1.0",
  "linux-arm64": "@ffmpeg-installer/linux-arm64@4.1.4",
  "alpine-x64": "@ffmpeg-installer/linux-x64@4.1.0",
  "alpine-arm64": "@ffmpeg-installer/linux-arm64@4.1.4",
  "win32-x64": "@ffmpeg-installer/win32-x64@4.1.0",
}

function cache(bin: string, target: string, spec: string) {
  const key = createHash("sha256").update(`${target}\0${spec}`).digest("hex").slice(0, 24)
  return join(bin, "..", "node_modules", ".cache", "ffmpeg", `${target}-${key}`)
}

function digest(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

function restore(dir: string, exe: string, dest: string) {
  const source = join(dir, exe)
  const stamp = join(dir, "sha256")
  try {
    if (!lstatSync(source).isFile()) return false
    const expected = readFileSync(stamp, "utf8").trim()
    if (!/^[a-f0-9]{64}$/.test(expected) || digest(source) !== expected) return false
    copyFileSync(source, dest)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[ffmpeg] cache unavailable", err)
    return false
  }
}

export async function ensureFfmpegForTarget(target: string, bin: string): Promise<void> {
  if (target === "win32-arm64") {
    rmSync(join(bin, "ffmpeg.exe"), { force: true })
    rmSync(join(bin, "ffmpeg"), { force: true })
    console.warn("No Windows ARM64 FFmpeg helper package is available; speech input will use system FFmpeg.")
    return
  }

  const spec = packages[target]
  if (!spec) throw new Error(`No FFmpeg helper package configured for target ${target}`)

  const exe = target.startsWith("win32") ? "ffmpeg.exe" : "ffmpeg"
  const dest = join(bin, exe)
  mkdirSync(bin, { recursive: true })
  rmSync(join(bin, exe === "ffmpeg" ? "ffmpeg.exe" : "ffmpeg"), { force: true })

  const dir = cache(bin, target, spec)
  mkdirSync(dir, { recursive: true })
  if (restore(dir, exe, dest)) {
    if (!target.startsWith("win32")) chmodSync(dest, 0o755)
    console.log(`[ffmpeg] restored ${target} from cache`)
    return
  }

  const tmp = join(bin, `.ffmpeg-tmp-${randomUUID()}`)
  const staging = `${dir}.tmp-${randomUUID()}`
  mkdirSync(tmp, { recursive: true })

  try {
    const packed = await $`npm pack ${spec} --pack-destination ${tmp}`.quiet()
    const name = packed.text().trim().split(/\s+/).pop()
    if (!name) throw new Error(`npm pack did not return a tarball for ${spec}`)

    const tar =
      process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar"
    await $`${tar} -xzf ${join(tmp, name)} -C ${tmp}`.quiet()
    const source = join(tmp, "package", exe)
    if (!existsSync(source)) throw new Error(`FFmpeg executable not found in ${spec}`)
    copyFileSync(source, dest)
    if (!target.startsWith("win32")) chmodSync(dest, 0o755)
    mkdirSync(staging, { recursive: true })
    copyFileSync(source, join(staging, exe))
    await Bun.write(join(staging, "sha256"), `${digest(source)}\n`)
    rmSync(dir, { recursive: true, force: true })
    renameSync(staging, dir)
    console.log(`[ffmpeg] cached ${target}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

export function currentFfmpegTarget(): string {
  const os = process.platform === "win32" ? "win32" : process.platform
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch
  return `${os}-${arch}`
}
