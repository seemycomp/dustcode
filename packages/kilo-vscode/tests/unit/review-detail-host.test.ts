import { afterEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createTwoFilesPatch } from "diff"
import { DiffViewerProvider } from "../../src/diff/DiffViewerProvider"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function harness() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "review-detail-")))
  roots.push(directory)
  const messages: unknown[] = []
  const posted: Array<Record<string, unknown>> = []
  const ctx = { dir: directory, sessionId: "chat" }
  const state = { source: "session:chat" }
  const connection = {
    getClient: () => ({
      session: {
        messages: async () => ({ data: messages }),
        status: async () => ({ data: { chat: { type: "idle" } } }),
      },
    }),
  }
  // Exercise the provider's real protocol handler without starting unrelated panels or pollers.
  const provider = Object.assign(Object.create(DiffViewerProvider.prototype), {
    connection,
    ctx,
    panel: {
      webview: {
        postMessage: async (message: Record<string, unknown>) => {
          posted.push(message)
          return true
        },
      },
    },
    openGeneration: 1,
    controller: {
      get currentId() {
        return state.source
      },
      refresh: async () => undefined,
    },
  }) as {
    review(message: Record<string, unknown>): Promise<void>
  }
  const edit = (id: string, before: string, after: string) =>
    messages.push({
      info: { id, role: "assistant", sessionID: "chat" },
      parts: [
        {
          id,
          type: "tool",
          tool: "edit",
          state: {
            status: "completed",
            input: { oldString: before },
            metadata: { filediff: { file: "a.txt", rawPatch: createTwoFilesPatch("a.txt", "a.txt", before, after) } },
          },
        },
      ],
    })
  return { directory, messages, posted, provider, state, edit }
}

describe("detailed session review host", () => {
  it("loads full context and keeps the baseline for the next patch", async () => {
    const h = harness()
    fs.writeFileSync(path.join(h.directory, "a.txt"), "B\n")
    h.edit("msg_172bd9309001", "A\n", "B\n")
    await h.provider.review({ type: "diffViewer.review.load", requestId: "load" })
    const loaded = h.posted.at(-1)!
    expect(loaded.error).toBeUndefined()
    const files = loaded.diffs as Array<{ file: string; before: string; after: string; hunks: Array<{ id: string }> }>
    expect(files.at(0)).toMatchObject({ file: "a.txt", before: "A\n", after: "B\n" })
    expect(files.at(0)?.hunks.at(0)?.id).toBeTruthy()
    await h.provider.review({
      type: "diffViewer.review.decide",
      requestId: "keep",
      revision: loaded.revision,
      action: "accept",
      file: "a.txt",
    })
    expect(h.posted.at(-1)?.diffs).toEqual([])
    expect(fs.readFileSync(path.join(h.directory, "a.txt"), "utf8")).toBe("B\n")
    fs.writeFileSync(path.join(h.directory, "a.txt"), "C\n")
    h.edit("msg_172bd930a001", "B\n", "C\n")
    await h.provider.review({ type: "diffViewer.review.load", requestId: "next" })
    expect((h.posted.at(-1)?.diffs as unknown[]).at(0)).toMatchObject({ before: "B\n", after: "C\n" })
    await h.provider.review({
      type: "diffViewer.review.decide",
      requestId: "stale",
      revision: loaded.revision,
      action: "reject",
      file: "a.txt",
    })
    expect(h.posted.at(-1)?.error).toContain("Stale")
    expect(fs.readFileSync(path.join(h.directory, "a.txt"), "utf8")).toBe("C\n")
  })

  it("refuses session decisions from a workspace or changed source", async () => {
    const h = harness()
    fs.writeFileSync(path.join(h.directory, "a.txt"), "B\n")
    h.state.source = "workspace"
    await h.provider.review({
      type: "diffViewer.review.decide",
      requestId: "wrong",
      revision: "r",
      action: "reject",
      file: "a.txt",
    })
    expect(h.posted.at(-1)?.error).toContain("source changed")
    expect(fs.readFileSync(path.join(h.directory, "a.txt"), "utf8")).toBe("B\n")
  })
})
