import { expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import "@opencode-ai/core/filesystem"
import { FileSystemSearch } from "@opencode-ai/core/filesystem/search"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Location } from "@opencode-ai/core/location"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { it } from "../lib/effect"

it.live("finds hidden files and folders without indexing ignored files or git metadata", () =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(tmp.path, ".git"))
          await fs.mkdir(path.join(tmp.path, ".dustcode", ".nested"), { recursive: true })
          await fs.writeFile(path.join(tmp.path, ".git", "config"), "")
          await fs.writeFile(path.join(tmp.path, ".gitignore"), ".dustcode/ignored.md\n")
          await fs.writeFile(path.join(tmp.path, ".dustcode", "config.json"), "{}")
          await fs.writeFile(path.join(tmp.path, ".dustcode", ".nested", "notes.md"), "")
          await fs.writeFile(path.join(tmp.path, ".dustcode", "ignored.md"), "")
          await fs.writeFile(path.join(tmp.path, "visible.txt"), "")
        })
        const layer = FileSystemSearch.ripgrepLayer.pipe(
          Layer.provide(
            Layer.merge(
              LayerNode.compile(LayerNode.group([FSUtil.node, Ripgrep.node])),
              Layer.succeed(
                Location.Service,
                Location.Service.of(location({ directory: AbsolutePath.make(tmp.path) })),
              ),
            ),
          ),
        )
        yield* Effect.gen(function* () {
          const search = yield* FileSystemSearch.Service
          // The fallback populates its index in a scoped background fiber.
          for (let attempt = 0; attempt < 100; attempt++) {
            const files = yield* search.find({ query: ".dustcode", type: "file", limit: 50 })
            if (files.some((entry) => entry.path === ".dustcode/.nested/notes.md")) break
            yield* Effect.sleep("20 millis")
          }
          const visible = yield* search.find({ query: "visible", type: "file", limit: 50 })
          const files = (yield* search.find({ query: ".dustcode", type: "file", limit: 50 })).map((entry) =>
            String(entry.path),
          )
          const metadata = yield* search.find({ query: ".git/config", type: "file", limit: 50 })
          const folders = (yield* search.find({ query: ".dustcode", type: "directory", limit: 50 })).map((entry) =>
            entry.path.replaceAll("\\", "/"),
          )
          expect(visible.map((entry) => String(entry.path))).toContain("visible.txt")
          expect(files).toContain(".dustcode/config.json")
          expect(files).toContain(".dustcode/.nested/notes.md")
          expect(folders).toContain(".dustcode/")
          expect(folders).toContain(".dustcode/.nested/")
          expect(files).not.toContain(".dustcode/ignored.md")
          expect(metadata).toEqual([])
        }).pipe(Effect.provide(layer))
      }),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ),
)
