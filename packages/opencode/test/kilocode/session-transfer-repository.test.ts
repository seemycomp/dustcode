import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import * as Repository from "../../src/kilocode/session-transfer/repository"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node, CrossSpawnSpawner.node])))
const git = Effect.fn(function* (dir: string, ...args: string[]) {
  return yield* (yield* AppProcess.Service)
    .run(ChildProcess.make("git", args, { cwd: dir }))
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
})

describe("session transfer repository identity", () => {
  it.live(
    "accepts Local and linked worktree sources in one canonical repository",
    () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped({ git: true })
        const a = path.join(dir, "a")
        const b = path.join(dir, "b")
        yield* git(dir, "worktree", "add", "--detach", a, "HEAD")
        yield* git(dir, "worktree", "add", "--detach", b, "HEAD")
        const local = yield* Repository.inspect({ root: dir, source: dir, target: a })
        expect(local.source.directory).toBe(dir)
        expect(local.target.directory).toBe(a)
        expect(local.source.common).toBe(local.target.common)
        expect(local.source.head).toBe(local.target.head)
        const linked = yield* Repository.inspect({ root: dir, source: a, target: b })
        expect(linked.source.directory).toBe(a)
        expect(linked.target.directory).toBe(b)
      }),
    60_000,
  )

  it.live(
    "rejects a separate clone even when its remote and HEAD match",
    () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped({ git: true })
        const other = yield* tmpdirScoped()
        yield* git(dir, "remote", "add", "origin", "https://example.invalid/team/repo.git")
        yield* git(other, "clone", "--no-local", dir, "clone")
        const clone = path.join(other, "clone")
        yield* git(clone, "remote", "set-url", "origin", "https://example.invalid/team/repo.git")
        const result = yield* Repository.inspect({ root: dir, source: dir, target: clone }).pipe(Effect.result)
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") expect(result.failure.code).toBe("unauthorized")
      }),
    60_000,
  )

  it.live(
    "rejects nested directories, Local destinations and the current context",
    () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped({ git: true })
        const target = path.join(dir, "target")
        yield* git(dir, "worktree", "add", "--detach", target, "HEAD")
        const nested = path.join(target, "nested")
        yield* Effect.promise(() => mkdir(nested))
        for (const input of [
          { root: dir, source: dir, target: nested },
          { root: dir, source: target, target: dir },
          { root: dir, source: target, target },
        ]) {
          const result = yield* Repository.inspect(input).pipe(Effect.result)
          expect(result._tag).toBe("Failure")
        }
      }),
    60_000,
  )

  it.live(
    "does not accept a missing or deregistered target",
    () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped({ git: true })
        const target = path.join(dir, "target")
        yield* git(dir, "worktree", "add", "--detach", target, "HEAD")
        yield* Repository.inspect({ root: dir, source: dir, target })
        yield* git(dir, "worktree", "remove", target)
        const result = yield* Repository.inspect({ root: dir, source: dir, target }).pipe(Effect.result)
        expect(result._tag).toBe("Failure")
      }),
    60_000,
  )
})
