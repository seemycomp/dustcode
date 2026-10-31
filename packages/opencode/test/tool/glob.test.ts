import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { describe, expect } from "bun:test"
import path from "path"
// kilocode_change start
import fs from "fs/promises"
import os from "os"
// kilocode_change end
import { Cause, Effect, Exit, Layer } from "effect"
import { GlobTool } from "../../src/tool/glob"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { Filesystem } from "@/util/filesystem"
import { Config } from "@/config/config" // kilocode_change
import { systemError } from "effect/PlatformError" // kilocode_change

const toolLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Layer.mergeAll(
    AppNodeBuilder.build(CrossSpawnSpawner.node),
    AppNodeBuilder.build(FSUtil.node),
    AppNodeBuilder.build(Ripgrep.node),
    AppNodeBuilder.build(Truncate.node),
    AppNodeBuilder.build(Agent.node),
    AppNodeBuilder.build(Git.node),
    AppNodeBuilder.build(Config.node), // kilocode_change
  )

const it = testEffect(toolLayer())
const full = (p: string) => (process.platform === "win32" ? Filesystem.normalizePath(p) : p)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

// kilocode_change start - skip on windows: address windows ci failures #9496
const unixInstance = process.platform !== "win32" ? it.instance : it.instance.skip
// kilocode_change end

describe("tool.glob", () => {
  // kilocode_change start - missing optional directories must not reach ripgrep spawn
  for (const kind of ["relative", "absolute", "pattern"] as const) {
    it.instance(`returns no files for a missing ${kind} directory`, () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const dir = path.join(test.directory, ".compound-engineering")
        const info = yield* GlobTool
        const glob = yield* info.init()
        const result = yield* glob.execute(
          kind === "pattern"
            ? { pattern: path.join(dir, "**/*.yaml") }
            : { pattern: "**/*.yaml", path: kind === "relative" ? ".compound-engineering" : dir },
          ctx,
        )
        expect(result.metadata).toEqual({ count: 0, truncated: false })
        expect(result.output.replaceAll("\\", "/")).toBe(
          `No files found. Search directory does not exist: ${dir.replaceAll("\\", "/")}`,
        )
      }),
    )
  }

  it.instance("preserves permission errors instead of searching an inaccessible directory", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const dir = path.join(test.directory, "restricted")
      yield* Effect.promise(() => fs.mkdir(dir))
      const fsys = yield* FSUtil.Service
      const denied = systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "stat",
        pathOrDescriptor: dir,
      })
      const info = yield* GlobTool.pipe(
        Effect.provideService(FSUtil.Service, {
          ...fsys,
          stat: (file) => (file === dir ? Effect.fail(denied) : fsys.stat(file)),
        }),
      )
      const glob = yield* info.init()
      const exit = yield* glob.execute({ pattern: "*", path: dir }, ctx).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(denied)
    }),
  )
  // kilocode_change end

  // kilocode_change start - skip on windows: address windows ci failures #9496
  unixInstance("matches files from a directory path", () =>
    // kilocode_change end
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "a.ts"), "export const a = 1\n"))
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "b.txt"), "hello\n"))
      const info = yield* GlobTool
      const glob = yield* info.init()
      const result = yield* glob.execute(
        {
          pattern: "*.ts",
          path: test.directory,
        },
        ctx,
      )
      expect(result.metadata.count).toBe(1)
      expect(result.output).toContain(path.join(test.directory, "a.ts"))
      expect(result.output).not.toContain(path.join(test.directory, "b.txt"))
    }),
  )

  it.instance("rejects exact file paths", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "a.ts")
      yield* Effect.promise(() => Bun.write(file, "export const a = 1\n"))
      const info = yield* GlobTool
      const glob = yield* info.init()
      const exit = yield* glob
        .execute(
          {
            pattern: "*.ts",
            path: file,
          },
          ctx,
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err instanceof Error ? err.message : String(err)).toContain("glob path must be a directory")
      }
    }),
  )
  // kilocode_change start - absolute glob patterns outside the project
  unixInstance(
    "supports absolute glob patterns outside the project",
    () =>
      Effect.gen(function* () {
        const outer = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "glob-outer-")))
        yield* Effect.promise(() => Bun.write(path.join(outer, "one.md"), "one"))
        yield* Effect.promise(() => Bun.write(path.join(outer, "two.md"), "two"))
        yield* Effect.promise(() => Bun.write(path.join(outer, "three.txt"), "three"))
        const info = yield* GlobTool
        const glob = yield* info.init()
        const result = yield* glob.execute(
          {
            pattern: path.join(outer, "*.md"),
          },
          ctx,
        )
        expect(result.output).toContain(path.join(outer, "one.md"))
        expect(result.output).toContain(path.join(outer, "two.md"))
        expect(result.output).not.toContain(path.join(outer, "three.txt"))
      }),
    { git: true },
  )
  // kilocode_change end
})
