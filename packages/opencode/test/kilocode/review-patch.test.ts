import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { describe, expect, test } from "bun:test"
import { applyPatch, parsePatch, reversePatch } from "diff"
import { Effect, Layer } from "effect"
import path from "node:path"
import { Agent } from "../../src/agent/agent"
import { Bus } from "../../src/bus"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Format } from "../../src/format"
import { LSP } from "../../src/lsp/lsp"
import { MessageID, SessionID } from "../../src/session/schema"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { EditTool } from "../../src/tool/edit"
import type * as Tool from "../../src/tool/tool"
import { Truncate } from "../../src/tool/truncate"
import { WriteTool } from "../../src/tool/write"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reviewPatch } from "../../src/kilocode/tool/review-patch"

const it = testEffect(
  Layer.mergeAll(
    AppNodeBuilder.build(Agent.node),
    AppNodeBuilder.build(FSUtil.node),
    Bus.layer,
    AppNodeBuilder.build(Format.node),
    AppNodeBuilder.build(LSP.node),
    AppNodeBuilder.build(Truncate.node),
    AppNodeBuilder.build(EventV2Bridge.node),
  ),
)

function roundtrip(patch: unknown, before: string, after: string) {
  expect(typeof patch).toBe("string")
  if (typeof patch !== "string") throw new Error("Missing rawPatch")
  expect(applyPatch(before, patch, { autoConvertLineEndings: false })).toBe(after)
  expect(applyPatch(after, reversePatch(parsePatch(patch).at(0)!), { autoConvertLineEndings: false })).toBe(before)
}

function entry(metadata: unknown) {
  const value = metadata as {
    files?: Array<{ rawPatch?: string; patch?: string }>
    filediff?: { rawPatch?: string; patch?: string }
  }
  return value?.files?.at(0) ?? value?.filediff
}

describe("tool review rawPatch metadata", () => {
  test("bounds machine patches without trimming their content", () => {
    expect(reviewPatch("large.txt", "a".repeat(1024 * 1024), "b")).toBe("")
    const patch = reviewPatch("small.txt", "    before\r\n", "    after\r\n")
    roundtrip(patch, "    before\r\n", "    after\r\n")
  })
  for (const name of ["apply_patch", "edit", "write"] as const) {
    for (const formatted of [false, true]) {
      it.instance(
        `${name} round-trips indented CRLF content${formatted ? " after formatting" : ""}`,
        () =>
          Effect.gen(function* () {
            const tmp = yield* TestInstance
            const file = path.join(tmp.directory, "review.txt")
            const before = "    first\r\n    before\r\n    last\r\n"
            const next = "    first\r\n    unformatted\r\n    last\r\n"
            yield* Effect.promise(() => Bun.write(file, before))
            const requests: Array<Parameters<Tool.Context["ask"]>[0]> = []
            const updates: Array<Parameters<Tool.Context["metadata"]>[0]> = []
            const ctx: Tool.Context = {
              sessionID: SessionID.make("ses_review"),
              messageID: MessageID.make("msg_review"),
              agent: "code",
              abort: AbortSignal.any([]),
              messages: [],
              ask: (req) => Effect.sync(() => void requests.push(structuredClone(req))),
              metadata: (req) => Effect.sync(() => void updates.push(structuredClone(req))),
            }
            const result = yield* Effect.gen(function* () {
              if (name === "edit") {
                const info = yield* EditTool
                const tool = yield* info.init()
                return yield* tool.execute({ filePath: file, oldString: "before", newString: "unformatted" }, ctx)
              }
              if (name === "write") {
                const info = yield* WriteTool
                const tool = yield* info.init()
                return yield* tool.execute({ filePath: file, content: next }, ctx)
              }
              const info = yield* ApplyPatchTool
              const tool = yield* info.init()
              return yield* tool.execute(
                {
                  patchText: `*** Begin Patch\n*** Update File: ${file}\n@@\n-    before\n+    unformatted\n*** End Patch`,
                },
                ctx,
              )
            })
            const after = yield* Effect.promise(() => Bun.file(file).text())
            expect(after).toContain(formatted ? "    formatted" : "    unformatted")
            const permission = requests.find((req) => req.permission === "edit")?.metadata
            const proposed = entry(permission)
            const completed = entry(result.metadata)
            roundtrip(
              proposed?.rawPatch,
              before,
              name === "apply_patch" ? before.replace("before\r\n", "unformatted\n") : next,
            )
            roundtrip(completed?.rawPatch, before, after)
            if (name === "apply_patch") expect(completed?.rawPatch).not.toBe(completed?.patch)
            if (name === "edit") roundtrip(updates.at(-1)?.metadata?.filediff.rawPatch, before, after)
          }),
        {
          config: {
            formatter: formatted
              ? {
                  review: {
                    extensions: [".txt"],
                    command: [
                      process.execPath,
                      "-e",
                      "const fs = require('node:fs'); const p = process.argv.at(-1); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('unformatted', 'formatted'))",
                      "$FILE",
                    ],
                  },
                }
              : false,
            lsp: false,
          },
        },
        30_000,
      )
    }
  }
})
