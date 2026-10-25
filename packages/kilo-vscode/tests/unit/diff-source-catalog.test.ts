import { describe, it, expect, spyOn } from "bun:test"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import type { KiloConnectionService } from "../../src/services/cli-backend"
import { DiffSourceCatalog } from "../../src/diff/sources/catalog"
import { sessionDescriptor } from "../../src/diff/sources/session"
import { WORKSPACE_DESCRIPTOR, createWorktreeDiffSource } from "../../src/diff/sources/worktree"
import { GitOps } from "../../src/agent-manager/GitOps"
import { createTwoFilesPatch } from "diff"

// Minimal stand-in for the connection service — the catalog only holds a
// reference and passes it to the source factories, so we never exercise any
// of its methods in these tests.
const connection = {} as unknown as KiloConnectionService

function makeCatalog(): DiffSourceCatalog {
  return new DiffSourceCatalog(connection)
}

describe("DiffSourceCatalog.listAvailable", () => {
  it("returns workspace + staged + unstaged + session when both are available", () => {
    const out = makeCatalog().listAvailable({ workspaceRoot: "/repo", sessionId: "s1" })
    expect(out.map((d) => d.id)).toEqual(["workspace", "staged", "unstaged", "session:s1"])
  })

  it("returns workspace + staged + unstaged when sessionId is missing", () => {
    const out = makeCatalog().listAvailable({ workspaceRoot: "/repo" })
    expect(out.map((d) => d.id)).toEqual(["workspace", "staged", "unstaged"])
  })

  it("returns only session when workspaceRoot is missing", () => {
    const out = makeCatalog().listAvailable({ workspaceRoot: undefined, sessionId: "s1" })
    expect(out.map((d) => d.id)).toEqual(["session:s1"])
  })

  it("returns [] when the context is empty", () => {
    const out = makeCatalog().listAvailable({ workspaceRoot: undefined })
    expect(out).toEqual([])
  })

  it("returns [] when hidePicker is set, regardless of workspace/session", () => {
    const out = makeCatalog().listAvailable({ workspaceRoot: "/repo", sessionId: "s1", hidePicker: true })
    expect(out).toEqual([])
  })
})

describe("DiffSourceCatalog.defaultSourceId", () => {
  it("prefers explicit initialSourceId", () => {
    const id = makeCatalog().defaultSourceId({
      workspaceRoot: "/repo",
      sessionId: "s1",
      initialSourceId: "workspace",
    })
    expect(id).toBe("workspace")
  })

  it("prefers workspace over session when both are present", () => {
    const id = makeCatalog().defaultSourceId({ workspaceRoot: "/repo", sessionId: "s1" })
    expect(id).toBe("workspace")
  })

  it("falls back to workspace when only workspaceRoot is present", () => {
    const id = makeCatalog().defaultSourceId({ workspaceRoot: "/repo" })
    expect(id).toBe("workspace")
  })

  it("falls back to session when only sessionId is present", () => {
    const id = makeCatalog().defaultSourceId({ workspaceRoot: undefined, sessionId: "s1" })
    expect(id).toBe("session:s1")
  })

  it("returns undefined when nothing can be inferred", () => {
    const id = makeCatalog().defaultSourceId({ workspaceRoot: undefined })
    expect(id).toBeUndefined()
  })
})

describe("DiffSourceCatalog.build", () => {
  it("loads only recorded chat patches, never workspace or session snapshots", async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "session-catalog-")))
    try {
      await fs.writeFile(path.join(root, "chat.txt"), "chat\n")
      await fs.writeFile(path.join(root, "outside.txt"), "outside\n")
      const backend = {
        getClient: () => ({
          session: {
            messages: async () => ({
              data: [
                {
                  info: { id: "msg_172bd9309001", sessionID: "chat", role: "assistant" },
                  parts: [
                    {
                      id: "prt_172bd9309001",
                      type: "tool",
                      tool: "edit",
                      state: {
                        status: "completed",
                        input: { oldString: "old" },
                        metadata: {
                          filediff: {
                            file: "chat.txt",
                            patch: createTwoFilesPatch("chat.txt", "chat.txt", "old\n", "chat\n"),
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            }),
          },
        }),
      } as unknown as KiloConnectionService
      const source = new DiffSourceCatalog(backend).build("session:chat", {
        workspaceRoot: root,
        sessionId: "chat",
        hidePicker: true,
      })
      const result = await source.fetch()
      expect(result.diffs.map((diff) => diff.file)).toEqual(["chat.txt"])
      expect(result.diffs.at(0)?.patch).toContain("+chat")
      expect(result.diffs.at(0)?.patch).not.toContain("outside")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
  it("builds a workspace source for 'workspace'", () => {
    const src = makeCatalog().build("workspace", { workspaceRoot: "/repo" })
    expect(src.descriptor.id).toBe("workspace")
    expect(src.descriptor.type).toBe("workspace")
    expect(src.revert).toBeDefined()
    expect(src.fetchFile).toBeDefined()
    src.dispose?.()
  })

  it("builds a session source for 'session:<id>'", () => {
    const src = makeCatalog().build("session:s1", { workspaceRoot: "/repo", sessionId: "s1" })
    expect(src.descriptor.id).toBe("session:s1")
    expect(src.descriptor.type).toBe("session")
    expect(src.revert).toBeUndefined()
    src.dispose?.()
  })

  it("builds a turn source for 'turn:<sessionId>:<messageId>'", () => {
    const src = makeCatalog().build("turn:sess:msg", { workspaceRoot: "/repo" })
    expect(src.descriptor.id).toBe("turn:sess:msg")
    expect(src.descriptor.type).toBe("turn")
    expect(src.revert).toBeUndefined()
    src.dispose?.()
  })

  it("throws on a malformed turn id", () => {
    expect(() => makeCatalog().build("turn:sess", { workspaceRoot: "/repo" })).toThrow(/malformed turn id/)
    expect(() => makeCatalog().build("turn:", { workspaceRoot: "/repo" })).toThrow(/malformed turn id/)
  })

  it("throws on an empty session id", () => {
    expect(() => makeCatalog().build("session:", { workspaceRoot: "/repo" })).toThrow(/empty session id/)
  })

  it("throws on an unknown source id", () => {
    expect(() => makeCatalog().build("bogus", { workspaceRoot: "/repo" })).toThrow(/unknown source id/)
  })
})

// The webview composes i18n keys from `type`. Keep the type values stable
// so a rename here doesn't silently break existing translation dicts.
describe("descriptor types", () => {
  it("workspace descriptor has type 'workspace'", () => {
    expect(WORKSPACE_DESCRIPTOR.type).toBe("workspace")
  })

  it("session descriptor has type 'session'", () => {
    expect(sessionDescriptor("s1").type).toBe("session")
  })
})

describe("initial worktree preview", () => {
  it("starts only two text previews without waiting for their content", async () => {
    const git = new GitOps({ log: () => undefined })
    const calls: string[] = []
    const source = createWorktreeDiffSource({
      git,
      log: () => undefined,
      dir: () => "/repo",
      baseBranch: "main",
      summary: async () =>
        Array.from({ length: 20 }, (_, index) => ({
          file: `file-${index}.ts`,
          before: "",
          after: "",
          patch: "",
          additions: 1,
          deletions: 0,
          summarized: true,
          tracked: true,
          generatedLike: false,
          status: "modified" as const,
        })),
      file: async (_dir, _base, file) => {
        calls.push(file)
        return null
      },
    })
    expect((await source.fetch()).diffs).toHaveLength(20)
    expect(calls).toEqual(["file-0.ts", "file-1.ts"])
    await source.fetch()
    expect(calls).toHaveLength(2)
    source.dispose?.()
    git.dispose()
  })
})

describe("DiffSourceCatalog.dispose", () => {
  it("disposes without throwing when no branch resources were created", () => {
    const cat = makeCatalog()
    expect(() => cat.dispose()).not.toThrow()
  })
})

describe("Git source revisions", () => {
  it.each(["staged", "unstaged"])("invalidates equal-count %s text edits with coherent lazy detail", async (id) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "diff-source-test-"))
    const git = new GitOps({ log: () => undefined })
    const cat = makeCatalog()
    const source = cat.build(id, { workspaceRoot: dir, dir, git, log: () => undefined })
    const file = path.join(dir, "file.txt")
    const run = async (...args: string[]) => {
      const result = await git.execGit(args, dir)
      expect(result.code).toBe(0)
    }
    const calls = spyOn(git, "execGit")
    try {
      await run("init")
      await fs.writeFile(file, "base\n")
      await run("add", "file.txt")
      await run(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "seed",
      )
      await fs.writeFile(file, "index\n")
      await run("add", "file.txt")
      await fs.writeFile(file, "first\n")
      if (id === "staged") await run("add", "file.txt")

      calls.mockClear()
      const first = (await source.fetch()).diffs.at(0)!
      expect(first).toMatchObject({
        file: "file.txt",
        additions: 1,
        deletions: 1,
        summarized: true,
        before: "",
        after: "",
      })
      expect(calls.mock.calls.some(([args]) => args[0] === "show" || args[0] === "cat-file")).toBe(false)
      const detail = await source.fetchFile!("file.txt")
      expect(detail).toMatchObject({
        stamp: first.stamp,
        before: id === "staged" ? "base\n" : "index\n",
        after: "first\n",
      })

      const stat = await fs.stat(file)
      await fs.writeFile(file, "other\n")
      await fs.utimes(file, stat.atime, new Date(stat.mtimeMs + 1000))
      if (id === "staged") await run("add", "file.txt")
      const second = (await source.fetch()).diffs.at(0)!
      expect(second).toMatchObject({ additions: first.additions, deletions: first.deletions })
      expect(second.stamp).not.toBe(first.stamp)
      expect(await source.fetchFile!("file.txt")).toMatchObject({ stamp: second.stamp, after: "other\n" })

      if (id === "unstaged") {
        const stat = await fs.stat(file)
        await fs.writeFile(file, "third\n")
        await run("add", "file.txt")
        await fs.writeFile(file, "other\n")
        await fs.utimes(file, stat.atimeMs / 1000, stat.mtimeMs / 1000)
        expect(await fs.stat(file)).toMatchObject({ size: stat.size, mtimeMs: stat.mtimeMs })
        const third = (await source.fetch()).diffs.at(0)!
        expect(third).toMatchObject({ additions: second.additions, deletions: second.deletions })
        expect(third.stamp).not.toBe(second.stamp)
        expect(await source.fetchFile!("file.txt")).toMatchObject({
          stamp: third.stamp,
          before: "third\n",
          after: "other\n",
        })
      }
    } finally {
      calls.mockRestore()
      source.dispose?.()
      cat.dispose()
      git.dispose()
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
