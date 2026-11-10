import { describe, expect } from "bun:test"
import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { apply, capture, prepare, write, restore, FileConflict } from "../../src/kilocode/session-transfer/files"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node, CrossSpawnSpawner.node])))
const run = Effect.fn(function* (dir: string, ...args: string[]) {
  const result = yield* (yield* AppProcess.Service).run(ChildProcess.make("git", args, { cwd: dir }))
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)
  return result.stdout.toString("utf8")
})
import { ChildProcess } from "effect/unstable/process"

describe("session transfer files", () => {
  it.live("rejects a selected path aliasing differently cased target bytes", () => Effect.gen(function* () {
    const source = yield* tmpdirScoped({ git: true })
    const target = yield* tmpdirScoped({ git: true })
    yield* Effect.promise(() => writeFile(path.join(source, "readme.txt"), "source\n"))
    yield* Effect.promise(() => writeFile(path.join(target, "README.txt"), "keep target\n"))
    const found = yield* capture({ source, files: ["readme.txt"] })
    const result = yield* apply({ target, capture: found }).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(yield* Effect.promise(() => readFile(path.join(target, "README.txt"), "utf8"))).toBe("keep target\n")
  }), 60_000)

  it.live(
    "captures the net staged/unstaged result and applies it unstaged without changing the target index",
    () =>
      Effect.gen(function* () {
        const source = yield* tmpdirScoped({ git: true })
        const target = yield* tmpdirScoped({ git: true })
        yield* Effect.promise(() => writeFile(path.join(source, "tracked.txt"), "base\n"))
        yield* run(source, "add", ".")
        yield* run(source, "commit", "-m", "base")
        yield* Effect.promise(() => writeFile(path.join(target, "tracked.txt"), "base\n"))
        yield* run(target, "add", ".")
        yield* run(target, "commit", "-m", "base")
        yield* Effect.promise(() => writeFile(path.join(source, "tracked.txt"), "changed\n"))
        yield* run(source, "add", "tracked.txt")
        yield* Effect.promise(() => writeFile(path.join(source, "tracked.txt"), "final\n"))
        const binary = path.join(source, "binary.bin")
        yield* Effect.promise(() => writeFile(binary, Buffer.from([0, 1, 2, 255])))
        const untracked = path.join(source, "new dir", "space.bin")
        yield* Effect.promise(() => mkdir(path.dirname(untracked), { recursive: true }))
        yield* Effect.promise(() => writeFile(untracked, Buffer.from([5, 0, 4])))
        const found = yield* capture({ source, files: ["tracked.txt", "binary.bin", "new dir/space.bin"] })
        expect(found.patch).toContain("final")
        yield* Effect.promise(() => writeFile(path.join(target, "unrelated.txt"), "keep staged\n"))
        yield* run(target, "add", "unrelated.txt")
        const before = yield* run(target, "ls-files", "--stage")
        const index = yield* Effect.promise(() => readFile(path.join(target, ".git", "index")))
        const sourceIndex = yield* Effect.promise(() => readFile(path.join(source, ".git", "index")))
        yield* apply({ target, capture: found })
        expect(yield* Effect.promise(() => readFile(path.join(target, "tracked.txt"), "utf8"))).toContain("final")
        expect([...(yield* Effect.promise(() => readFile(path.join(target, "binary.bin"))))]).toEqual([0, 1, 2, 255])
        expect(yield* Effect.promise(() => readFile(path.join(target, "new dir", "space.bin")))).toEqual(
          Buffer.from([5, 0, 4]),
        )
        expect(yield* run(target, "ls-files", "--stage")).toBe(before)
        expect(yield* Effect.promise(() => readFile(path.join(target, ".git", "index")))).toEqual(index)
        expect(yield* Effect.promise(() => readFile(path.join(source, ".git", "index")))).toEqual(sourceIndex)
      }),
    60_000,
  )

  it.live(
    "restores only transfer-owned bytes and reports user-modified recovery paths",
    () =>
      Effect.gen(function* () {
        const source = yield* tmpdirScoped({ git: true })
        const target = yield* tmpdirScoped({ git: true })
        yield* Effect.promise(() => writeFile(path.join(source, "new.txt"), "copied\n"))
        const found = yield* capture({ source, files: ["new.txt"] })
        const journal = yield* prepare({ target, capture: found })
        yield* write(journal)
        expect(yield* Effect.promise(() => readFile(path.join(target, "new.txt"), "utf8"))).toContain("copied")
        yield* Effect.promise(() => writeFile(path.join(target, "new.txt"), "user edit\n"))
        const blocked = yield* restore(journal).pipe(Effect.result)
        expect(blocked._tag).toBe("Failure")
        if (blocked._tag === "Failure") expect(blocked.failure.paths).toContain("new.txt")
        expect(yield* Effect.promise(() => readFile(path.join(target, "new.txt"), "utf8"))).toBe("user edit\n")
        yield* Effect.promise(() => writeFile(path.join(target, "new.txt"), "copied\n"))
        yield* restore(journal)
        expect(yield* Effect.promise(() => Bun.file(path.join(target, "new.txt")).exists())).toBe(false)
        yield* restore(journal)
      }),
    60_000,
  )

  it.live(
    "rejects path traversal and net-zero staged additions",
    () =>
      Effect.gen(function* () {
        const source = yield* tmpdirScoped({ git: true })
        expect((yield* capture({ source, files: ["../outside"] }).pipe(Effect.result))._tag).toBe("Failure")
        yield* Effect.promise(() => writeFile(path.join(source, "gone.txt"), "staged\n"))
        yield* run(source, "add", "gone.txt")
        yield* Effect.promise(() => rm(path.join(source, "gone.txt")))
        const found = yield* capture({ source, files: ["gone.txt"] })
        expect(found.patch).toBe("")
        expect(found.files).toEqual([])
      }),
    60_000,
  )

  it.live(
    "rejects dirty selected targets before writing and allows unrelated dirty paths",
    () =>
      Effect.gen(function* () {
        const source = yield* tmpdirScoped({ git: true })
        const target = yield* tmpdirScoped({ git: true })
        yield* Effect.promise(() => writeFile(path.join(source, "README.md"), "base\n"))
        yield* run(source, "add", ".")
        yield* run(source, "commit", "-m", "base")
        yield* Effect.promise(() => writeFile(path.join(target, "README.md"), "base\n"))
        yield* run(target, "add", ".")
        yield* run(target, "commit", "-m", "base")
        yield* Effect.promise(() => writeFile(path.join(source, "README.md"), "source edit\n"))
        const found = yield* capture({ source, files: ["README.md"] })
        yield* Effect.promise(() => writeFile(path.join(target, "README.md"), "unrelated\n"))
        const result = yield* apply({ target, capture: found }).pipe(Effect.result)
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(FileConflict)
        expect(yield* Effect.promise(() => readFile(path.join(target, "README.md"), "utf8"))).toBe("unrelated\n")
      }),
    60_000,
  )
})
