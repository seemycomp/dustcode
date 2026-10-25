import { afterEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createTwoFilesPatch } from "diff"
import { SessionReview } from "../../src/kilo-provider/session-review"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-review-")))
  roots.push(root)
  const state = { messages: [] as unknown[], idle: true, dirty: [] as string[] }
  const service = new SessionReview({
    messages: async () => state.messages,
    idle: async () => state.idle,
    dirtyFiles: () => state.dirty,
  })
  const write = (file: string, text: string) => fs.writeFileSync(path.join(root, file), text)
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")
  return { root, state, service, write, read }
}

function edit(id: string, file: string, before: string, after: string, sessionID = "s") {
  return {
    info: { id, role: "assistant", sessionID },
    parts: [
      {
        id: `part-${id}`,
        sessionID,
        type: "tool",
        tool: "edit",
        state: {
          status: "completed",
          metadata: {
            filediff: { file, patch: createTwoFilesPatch(file, file, before, after, "", "", { context: 0 }) },
          },
        },
      },
    ],
  }
}

function patch(
  id: string,
  files: Array<{ file: string; before: string; after: string; type: string; movePath?: string }>,
) {
  return {
    info: { id, role: "assistant", sessionID: "s" },
    parts: [
      {
        id: `p-${id}`,
        type: "tool",
        tool: "apply_patch",
        state: {
          status: "completed",
          metadata: {
            files: files.map((file) => ({
              filePath: file.file,
              relativePath: file.file,
              type: file.type,
              movePath: file.movePath,
              patch: createTwoFilesPatch(file.file, file.file, file.before, file.after, "", "", { context: 0 }),
            })),
          },
        },
      },
    ],
  }
}

describe("SessionReview", () => {
  it("retains Keep baselines across recreated services and rejects only subsequent patches", async () => {
    const f = fixture()
    const values = new Map<string, unknown>()
    const checkpoints = {
      read: (key: string) => values.get(key),
      write: (key: string, value: unknown) => {
        values.set(key, structuredClone(value))
      },
    }
    const service = () =>
      new SessionReview({
        messages: async () => f.state.messages,
        idle: async () => true,
        dirtyFiles: () => [],
        store: checkpoints,
      })
    f.write("a", "B\n")
    f.state.messages = [edit("m1", "a", "A\n", "B\n")]
    const first = service()
    const initial = await first.load("s", f.root)
    await first.decide("s", f.root, initial.revision, "accept-all")
    expect([...values.keys()]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)])
    const second = service()
    const restored = await second.load("s", f.root)
    expect(restored.files).toEqual([])
    await expect(second.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("Stale")
    await second.decide("s", f.root, restored.revision, "undo-all")
    expect(f.read("a")).toBe("B\n")
    f.write("a", "C\n")
    f.state.messages.push(edit("m2", "a", "B\n", "C\n"))
    const next = await second.load("s", f.root)
    expect(next.files[0]?.before).toBe("B\n")
    await second.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("a")).toBe("B\n")
    expect((await service().load("s", f.root)).files).toEqual([])
  })

  it("refuses Keep and Undo without changing memory or disk when persistence is unwritable", async () => {
    for (const action of ["accept-all", "undo-all"] as const) {
      const f = fixture()
      f.write("a", "B\n")
      f.state.messages = [edit("m1", "a", "A\n", "B\n")]
      const service = new SessionReview({
        messages: async () => f.state.messages,
        idle: async () => true,
        dirtyFiles: () => [],
        store: {
          read: () => undefined,
          write: () => {
            throw new Error("store unwritable")
          },
        },
      })
      const initial = await service.load("s", f.root)
      await expect(service.decide("s", f.root, initial.revision, action)).rejects.toThrow("store unwritable")
      expect(f.read("a")).toBe("B\n")
      expect(await service.load("s", f.root)).toEqual(initial)
    }
  })

  it("records each completed batch file when a later outside edit prevents the remaining writes", async () => {
    for (const durable of [false, true]) {
      const f = fixture()
      f.write("a", "A\n")
      f.write("b", "B\n")
      f.state.messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
      const values = new Map<string, unknown>()
      const deps = {
        messages: async () => f.state.messages,
        idle: async () => true,
        dirtyFiles: () => {
          if (f.read("a") === "a\n") f.write("b", "OUTSIDE\n")
          return []
        },
        store: durable
          ? {
              read: (key: string) => values.get(key),
              write: (key: string, value: unknown) => {
                values.set(key, structuredClone(value))
              },
            }
          : undefined,
      }
      const service = new SessionReview(deps)
      const initial = await service.load("s", f.root)
      await expect(service.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("changed")
      expect(f.read("a")).toBe("a\n")
      expect(f.read("b")).toBe("OUTSIDE\n")
      const next = await (durable ? new SessionReview(deps) : service).load("s", f.root)
      expect(next.files.map((row) => row.file)).toEqual(["b"])
      expect(next.files[0]?.rejectable).toBe(false)
      expect(f.read("b")).toBe("OUTSIDE\n")
    }
  })

  it("persists partial Keep residuals across recreation without reviving accepted hunks", async () => {
    const f = fixture()
    const gap = "gap\n".repeat(12)
    const values = new Map<string, unknown>()
    const deps = {
      messages: async () => f.state.messages,
      idle: async () => true,
      dirtyFiles: () => [],
      store: {
        read: (key: string) => values.get(key),
        write: (key: string, value: unknown) => {
          values.set(key, structuredClone(value))
        },
      },
    }
    f.write("a", `A\ninserted\n${gap}B\n`)
    f.state.messages = [edit("m1", "a", `a\n${gap}b\n`, f.read("a"))]
    const first = new SessionReview(deps)
    const initial = await first.load("s", f.root)
    await first.decide("s", f.root, initial.revision, "accept", "a", initial.files[0]!.hunks![0]!.id)
    const second = new SessionReview(deps)
    const next = await second.load("s", f.root)
    expect(next.files[0]?.hunks).toHaveLength(1)
    expect(next.files[0]?.before).toBe(`A\ninserted\n${gap}b\n`)
    await second.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("a")).toBe(`A\ninserted\n${gap}b\n`)
    expect((await new SessionReview(deps).load("s", f.root)).files).toEqual([])
  })

  it("recovers a completed rejection from its durable journal when final persistence fails", async () => {
    const f = fixture()
    f.write("a", "B\n")
    f.state.messages = [edit("m1", "a", "A\n", "B\n")]
    const state = { saved: undefined as unknown, fail: true }
    const deps = {
      messages: async () => f.state.messages,
      idle: async () => true,
      dirtyFiles: () => [],
      store: {
        read: () => structuredClone(state.saved),
        write: (_key: string, value: unknown) => {
          if (f.read("a") === "A\n" && state.fail) throw new Error("final persistence failed")
          state.saved = structuredClone(value)
        },
      },
    }
    const first = new SessionReview(deps)
    const initial = await first.load("s", f.root)
    await expect(first.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("final persistence failed")
    expect(f.read("a")).toBe("A\n")
    await expect(first.load("s", f.root)).rejects.toThrow("final persistence failed")
    state.fail = false
    expect((await new SessionReview(deps).load("s", f.root)).files).toEqual([])
    expect(f.read("a")).toBe("A\n")
  })

  it("keeps the completed prefix durable if staging the next file fails", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.write("b", "B\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
    const state = { saved: undefined as unknown, fail: true }
    const deps = {
      messages: async () => f.state.messages,
      idle: async () => true,
      dirtyFiles: () => [],
      store: {
        read: () => state.saved,
        write: (_key: string, value: unknown) => {
          const journal = (value as { journal?: { file: string } }).journal
          if (journal?.file === "b" && state.fail) throw new Error("stage persistence failed")
          state.saved = structuredClone(value)
        },
      },
    }
    const first = new SessionReview(deps)
    const initial = await first.load("s", f.root)
    await expect(first.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("stage persistence failed")
    expect(f.read("a")).toBe("a\n")
    expect(f.read("b")).toBe("B\n")
    state.fail = false
    const second = new SessionReview(deps)
    const next = await second.load("s", f.root)
    expect(next.files.map((row) => row.file)).toEqual(["b"])
    await second.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("b")).toBe("b\n")
  })

  it("recovers journaled file creation and deletion without replaying either mutation", async () => {
    for (const type of ["add", "delete"] as const) {
      const f = fixture()
      if (type === "add") f.write("a", "new\n")
      f.state.messages = [
        patch("m1", [{ file: "a", before: type === "add" ? "" : "old\n", after: type === "add" ? "new\n" : "", type }]),
      ]
      const state = { saved: undefined as unknown, fail: true }
      const deps = {
        messages: async () => f.state.messages,
        idle: async () => true,
        dirtyFiles: () => [],
        store: {
          read: () => state.saved,
          write: (_key: string, value: unknown) => {
            const complete = fs.existsSync(path.join(f.root, "a")) === (type === "delete")
            if (complete && state.fail) throw new Error("final persistence failed")
            state.saved = structuredClone(value)
          },
        },
      }
      const first = new SessionReview(deps)
      const initial = await first.load("s", f.root)
      await expect(first.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("final persistence failed")
      state.fail = false
      expect((await new SessionReview(deps).load("s", f.root)).files).toEqual([])
      expect(fs.existsSync(path.join(f.root, "a"))).toBe(type === "delete")
      if (type === "delete") expect(f.read("a")).toBe("old\n")
    }
  })

  it("discards a staged journal only for its exact preimage and blocks ambiguous recovery", async () => {
    for (const outside of [false, true]) {
      const f = fixture()
      f.write("a", "B\n")
      f.state.messages = [edit("m1", "a", "A\n", "B\n")]
      const state = { saved: undefined as unknown, staged: undefined as unknown }
      const deps = {
        messages: async () => f.state.messages,
        idle: async () => true,
        dirtyFiles: () => [],
        store: {
          read: () => structuredClone(state.saved),
          write: (_key: string, value: unknown) => {
            state.saved = structuredClone(value)
            if (f.read("a") === "B\n") state.staged = structuredClone(value)
          },
        },
      }
      const first = new SessionReview(deps)
      const initial = await first.load("s", f.root)
      await first.decide("s", f.root, initial.revision, "undo-all")
      state.saved = state.staged
      f.write("a", outside ? "OUTSIDE\n" : "B\n")
      const second = new SessionReview(deps)
      if (outside) {
        await expect(second.load("s", f.root)).rejects.toThrow("recovery content conflict")
        expect(f.read("a")).toBe("OUTSIDE\n")
        continue
      }
      const restored = await second.load("s", f.root)
      expect(restored.files[0]?.rejectable).toBe(true)
      await second.decide("s", f.root, restored.revision, "undo-all")
      expect(f.read("a")).toBe("A\n")
    }
  })

  it("isolates durable checkpoint keys by canonical directory and session", async () => {
    const f = fixture()
    const other = fixture()
    f.write("a", "B\n")
    other.write("a", "B\n")
    const values = new Map<string, unknown>()
    const deps = {
      messages: async (session: string) => [edit("m1", "a", "A\n", "B\n", session)],
      idle: async () => true,
      dirtyFiles: () => [],
      store: {
        read: (key: string) => values.get(key),
        write: (key: string, value: unknown) => {
          values.set(key, structuredClone(value))
        },
      },
    }
    const service = new SessionReview(deps)
    const initial = await service.load("s", f.root)
    await service.decide("s", f.root, initial.revision, "accept-all")
    const restored = new SessionReview(deps)
    expect((await restored.load("s", path.join(f.root, "."))).files).toEqual([])
    expect((await restored.load("other", f.root)).files).toHaveLength(1)
    expect((await restored.load("s", other.root)).files).toHaveLength(1)
    const copied = new SessionReview({
      ...deps,
      store: { read: () => [...values.values()][0], write: () => undefined },
    })
    await expect(copied.load("other", f.root)).rejects.toThrow("Invalid review checkpoint store")
  })

  it("rejects malformed and oversized persisted checkpoint cursors and residuals", async () => {
    const f = fixture()
    f.write("a", "B\n")
    f.state.messages = [edit("m1", "a", "A\n", "B\n")]
    const deps = { messages: async () => f.state.messages, idle: async () => true, dirtyFiles: () => [] }
    const saved: unknown[] = []
    const service = new SessionReview({
      ...deps,
      store: {
        read: () => undefined,
        write: (_key, value) => {
          saved.push(structuredClone(value))
        },
      },
    })
    const initial = await service.load("s", f.root)
    await service.decide("s", f.root, initial.revision, "accept-all")
    const valid = saved[0] as {
      version: number
      key: string
      checkpoints: Array<[string, { cursor: string[]; pending?: unknown }]>
    }
    const invalid: unknown[] = [
      {},
      { ...valid, version: 2 },
      { ...valid, key: "0".repeat(64) },
      { ...valid, checkpoints: [["../outside", valid.checkpoints[0]![1]]] },
      { ...valid, checkpoints: [["a", { cursor: ["not-an-id"] }]] },
      { ...valid, checkpoints: [["a", { cursor: Array(20001).fill("a".repeat(64)) }]] },
      {
        ...valid,
        checkpoints: [
          [
            "a",
            {
              cursor: valid.checkpoints[0]![1].cursor,
              pending: { file: "a", id: "a".repeat(64), kind: "update", patch: "x".repeat(1024 * 1024 + 1) },
            },
          ],
        ],
      },
      { ...valid, junk: "x".repeat(16 * 1024 * 1024) },
    ]
    for (const value of invalid) {
      const restored = new SessionReview({ ...deps, store: { read: () => value, write: () => undefined } })
      await expect(restored.load("s", f.root)).rejects.toThrow()
      expect(f.read("a")).toBe("B\n")
    }
  })

  it("Keep All retires pending additions and later Undo preserves the existing kept file", async () => {
    const f = fixture()
    f.write("new", "kept\n")
    f.write("a", "B\n")
    f.state.messages = [
      patch("m1", [{ file: "new", before: "", after: "kept\n", type: "add" }]),
      edit("m2", "a", "A\n", "B\n"),
    ]
    const initial = await f.service.load("s", f.root)
    const stat = fs.statSync(path.join(f.root, "new"))
    const kept = await f.service.decide("s", f.root, initial.revision, "accept-all")
    expect(kept.files).toEqual([])
    expect(fs.statSync(path.join(f.root, "new")).mtimeMs).toBe(stat.mtimeMs)
    f.write("new", "next\n")
    f.state.messages.push(edit("m3", "new", "kept\n", "next\n"))
    const next = await f.service.load("s", f.root)
    expect(next.files[0]).toMatchObject({ status: "modified", before: "kept\n", after: "next\n" })
    await f.service.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("new")).toBe("kept\n")
    expect(f.read("a")).toBe("B\n")
  })

  it("decides only the selected displayed hunk with line-count shifts in either decision order", async () => {
    const gap = Array.from({ length: 12 }, (_, index) => `gap${index}\n`).join("")
    for (const first of ["accept", "reject"] as const) {
      for (const index of [0, 1]) {
        const f = fixture()
        const before = `old\n${gap}tail\n`
        const after = `new\ninserted\n${gap}TAIL\nextra\n`
        f.write("a", after)
        f.state.messages = [edit("m1", "a", before, after)]
        const initial = await f.service.load("s", f.root)
        expect(initial.files[0]?.hunks).toHaveLength(2)
        const id = initial.files[0]!.hunks![index]!.id
        const next = await f.service.decide("s", f.root, initial.revision, first, "a", id)
        expect(next.files[0]?.hunks).toHaveLength(1)
        const kept = index === 0 ? `new\ninserted\n${gap}tail\n` : `old\n${gap}TAIL\nextra\n`
        const undone = index === 0 ? `old\n${gap}TAIL\nextra\n` : `new\ninserted\n${gap}tail\n`
        expect(f.read("a")).toBe(first === "accept" ? after : undone)
        const result = await f.service.decide(
          "s",
          f.root,
          next.revision,
          first === "accept" ? "reject" : "accept",
          "a",
          next.files[0]!.hunks![0]!.id,
        )
        expect(result.files).toEqual([])
        expect(f.read("a")).toBe(first === "accept" ? kept : undone)
        await f.service.decide("s", f.root, result.revision, "undo-all")
        expect(f.read("a")).toBe(first === "accept" ? kept : undone)
      }
    }
  })

  it("keeps hunk IDs stable when polling and rejects old IDs even with a refreshed revision", async () => {
    const f = fixture()
    const gap = "context\n".repeat(12)
    f.write("a", `A\n${gap}B\n`)
    f.state.messages = [edit("m1", "a", `a\n${gap}b\n`, `A\n${gap}B\n`)]
    const initial = await f.service.load("s", f.root)
    const polled = await f.service.load("s", f.root)
    expect(polled).toEqual(initial)
    const id = initial.files[0]!.hunks![0]!.id
    const next = await f.service.decide("s", f.root, initial.revision, "accept", "a", id)
    await expect(f.service.decide("s", f.root, initial.revision, "reject", "a", id)).rejects.toThrow("Stale")
    await expect(f.service.decide("s", f.root, next.revision, "reject", "a", id)).rejects.toThrow("hunk")
    await expect(
      f.service.decide("s", f.root, next.revision, "undo-all", undefined, next.files[0]!.hunks![0]!.id),
    ).rejects.toThrow("single-file")
    expect(f.read("a")).toBe(`A\n${gap}B\n`)
  })

  it("aggregates new operations after partial Keep without reintroducing the kept hunk", async () => {
    const f = fixture()
    const gap = "context\n".repeat(12)
    const before = `a\n${gap}b\n`
    const after = `A\nadded\n${gap}B\n`
    f.write("a", after)
    f.state.messages = [edit("m1", "a", before, after)]
    const initial = await f.service.load("s", f.root)
    await f.service.decide("s", f.root, initial.revision, "accept", "a", initial.files[0]!.hunks![0]!.id)
    const latest = `A\nadded\n${gap}C\n`
    f.write("a", latest)
    f.state.messages.push(edit("m2", "a", after, latest))
    const next = await f.service.load("s", f.root)
    expect(next.files[0]?.hunks).toHaveLength(1)
    expect(next.files[0]?.patch).toContain("-b")
    expect(next.files[0]?.patch).toContain("+C")
    expect(next.files[0]?.patch).not.toContain("+added")
    await f.service.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("a")).toBe(`A\nadded\n${gap}b\n`)
  })

  it("uses post-reject offsets for subsequent raw patches and keeps only their new residual", async () => {
    const f = fixture()
    const gap = "context\n".repeat(12)
    const before = `a\n${gap}b\n`
    const after = `A\nadded\n${gap}B\n`
    f.write("a", after)
    f.state.messages = [edit("m1", "a", before, after)]
    const initial = await f.service.load("s", f.root)
    await f.service.decide("s", f.root, initial.revision, "reject", "a", initial.files[0]!.hunks![0]!.id)
    const residual = `a\n${gap}B\n`
    expect(f.read("a")).toBe(residual)
    const latest = `a\n${gap}C\n`
    f.write("a", latest)
    f.state.messages.push(edit("m2", "a", residual, latest))
    const next = await f.service.load("s", f.root)
    expect(next.files[0]?.before).toBe(before)
    const kept = await f.service.decide("s", f.root, next.revision, "accept-all")
    expect(kept.files).toEqual([])
    expect((await f.service.load("s", f.root)).files).toEqual([])
    await f.service.decide("s", f.root, kept.revision, "undo-all")
    expect(f.read("a")).toBe(latest)
  })

  it("preserves outside edits across residual polling and fails closed on overlapping or shifted content", async () => {
    for (const conflict of [false, true]) {
      const f = fixture()
      const gap = "context\n".repeat(12)
      const after = `A\n${gap}B\nuser\n`
      f.write("a", after)
      f.state.messages = [edit("m1", "a", `a\n${gap}b\nuser\n`, after)]
      const initial = await f.service.load("s", f.root)
      await f.service.decide("s", f.root, initial.revision, "accept", "a", initial.files[0]!.hunks![0]!.id)
      f.write("a", conflict ? `inserted\n${after}` : `A\n${gap}B\nOUTSIDE\n`)
      const next = await f.service.load("s", f.root)
      if (conflict) {
        expect(next.files[0]?.rejectable).toBe(false)
        await expect(f.service.decide("s", f.root, next.revision, "undo-all")).rejects.toThrow("conflict")
        expect(f.read("a")).toBe(`inserted\n${after}`)
        continue
      }
      expect(next.files[0]?.rejectable).toBe(true)
      await f.service.decide("s", f.root, next.revision, "undo-all")
      expect(f.read("a")).toBe(`A\n${gap}b\nOUTSIDE\n`)
    }
  })

  it("preflights Keep All and Undo All after a partial decision before touching another file", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.write("b", "B\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
    const initial = await f.service.load("s", f.root)
    f.state.dirty = [path.join(f.root, "b")]
    await expect(f.service.decide("s", f.root, initial.revision, "accept-all")).rejects.toThrow("dirty")
    expect((await f.service.load("s", f.root)).files).toHaveLength(2)
    f.state.dirty = []
    const next = await f.service.decide("s", f.root, initial.revision, "accept", "a", initial.files[0]!.hunks![0]!.id)
    f.write("b", "outside\n")
    const stale = await f.service.load("s", f.root)
    await expect(f.service.decide("s", f.root, stale.revision, "undo-all")).rejects.toThrow("conflict")
    expect(f.read("a")).toBe("A\n")
    await expect(f.service.decide("s", f.root, next.revision, "undo-all")).rejects.toThrow("Stale")
  })

  it("handles isolated insertion and deletion hunks, CRLF, and a missing final newline", async () => {
    for (const newline of ["\n", "\r\n"]) {
      for (const first of ["accept", "reject"] as const) {
        for (const index of [0, 1]) {
          const f = fixture()
          const gap = Array.from({ length: 14 }, (_, index) => `gap${index}${newline}`).join("")
          const before = `${gap}removed${newline}last`
          const after = `inserted${newline}${gap}last`
          f.write("a", after)
          f.state.messages = [edit("m1", "a", before, after)]
          const initial = await f.service.load("s", f.root)
          expect(initial.files[0]?.hunks).toHaveLength(2)
          const next = await f.service.decide(
            "s",
            f.root,
            initial.revision,
            first,
            "a",
            initial.files[0]!.hunks![index]!.id,
          )
          expect(next.files[0]?.hunks).toHaveLength(1)
          const result = await f.service.decide(
            "s",
            f.root,
            next.revision,
            first === "accept" ? "reject" : "accept",
            "a",
            next.files[0]!.hunks![0]!.id,
          )
          expect(result.files).toEqual([])
          const insertion = `${index === 0 ? `inserted${newline}` : ""}${gap}${index === 0 ? `removed${newline}` : ""}last`
          const deletion = `${index === 0 ? "" : `inserted${newline}`}${gap}${index === 0 ? "" : `removed${newline}`}last`
          expect(f.read("a")).toBe(first === "accept" ? insertion : deletion)
        }
      }
    }
  })

  it("keeps a selected hunk in place without writing and never confuses identical repeated hunks", async () => {
    const f = fixture()
    const gap = "same\n".repeat(14)
    const before = `old\n${gap}old\n`
    const after = `NEW\n${gap}NEW\n`
    f.write("a", after)
    f.state.messages = [edit("m1", "a", before, after)]
    const initial = await f.service.load("s", f.root)
    expect(new Set(initial.files[0]!.hunks!.map((hunk) => hunk.id)).size).toBe(2)
    const stat = fs.statSync(path.join(f.root, "a"))
    const next = await f.service.decide("s", f.root, initial.revision, "accept", "a", initial.files[0]!.hunks![1]!.id)
    expect(fs.statSync(path.join(f.root, "a")).mtimeMs).toBe(stat.mtimeMs)
    expect(f.read("a")).toBe(after)
    await f.service.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("a")).toBe(`old\n${gap}NEW\n`)
  })

  it("fails closed if consumed tool history disappears or is rewritten", async () => {
    for (const rewrite of [false, true]) {
      const f = fixture()
      f.write("a", "B\n")
      f.state.messages = [edit("m1", "a", "A\n", "B\n")]
      const initial = await f.service.load("s", f.root)
      await f.service.decide("s", f.root, initial.revision, "accept", "a")
      f.state.messages = rewrite ? [edit("m1", "a", "outside\n", "B\n")] : []
      await expect(f.service.load("s", f.root)).rejects.toThrow("history conflict")
      await expect(f.service.decide("s", f.root, initial.revision, "undo-all")).rejects.toThrow("history conflict")
      expect(f.read("a")).toBe("B\n")
    }
  })

  it("applies hunk decisions with exact added, deleted, and empty-file existence semantics", async () => {
    for (const action of ["accept", "reject"] as const) {
      const f = fixture()
      f.write("added", "NEW\n")
      f.write("empty", "")
      f.state.messages = [
        patch("m1", [
          { file: "added", before: "", after: "NEW\n", type: "add" },
          { file: "deleted", before: "old\n", after: "", type: "delete" },
          { file: "empty", before: "old\n", after: "", type: "update" },
        ]),
      ]
      let view = await f.service.load("s", f.root)
      for (const file of ["added", "deleted", "empty"]) {
        const row = view.files.find((row) => row.file === file)!
        view = await f.service.decide("s", f.root, view.revision, action, file, row.hunks![0]!.id)
      }
      expect(view.files).toEqual([])
      expect(fs.existsSync(path.join(f.root, "added"))).toBe(action === "accept")
      expect(fs.existsSync(path.join(f.root, "deleted"))).toBe(action === "reject")
      expect(f.read("empty")).toBe(action === "accept" ? "" : "old\n")
      if (action === "reject") continue
      f.write("added", "later\n")
      f.state.messages.push(edit("m2", "added", "NEW\n", "later\n"))
      const next = await f.service.load("s", f.root)
      await f.service.decide("s", f.root, next.revision, "undo-all")
      expect(f.read("added")).toBe("NEW\n")
    }
  })

  it("does not advance Keep checkpoints when a dirty-buffer race changes selected disk content", async () => {
    const f = fixture()
    f.write("a", "A\n")
    let calls = 0
    const service = new SessionReview({
      messages: async () => [edit("m1", "a", "a\n", "A\n")],
      idle: async () => true,
      dirtyFiles: () => {
        if (++calls === 2) f.write("a", "outside\n")
        return []
      },
    })
    const initial = await service.load("s", f.root)
    await expect(service.decide("s", f.root, initial.revision, "accept-all")).rejects.toThrow("changed")
    f.write("a", "A\n")
    const next = await service.load("s", f.root)
    expect(next.files).toHaveLength(1)
    await service.decide("s", f.root, next.revision, "undo-all")
    expect(f.read("a")).toBe("a\n")
  })
  it("keeps pending changes visible when they cancel an accepted prefix", async () => {
    const f = fixture()
    f.write("a", "B\n")
    f.state.messages = [edit("m1", "a", "A\n", "B\n")]
    const initial = await f.service.load("s", f.root)
    await f.service.decide("s", f.root, initial.revision, "accept", "a")
    f.write("a", "A\n")
    f.state.messages.push(edit("m2", "a", "B\n", "A\n"))
    const pending = await f.service.load("s", f.root)
    expect(pending.files.at(0)).toMatchObject({ reviewStatus: "pending", additions: 1, deletions: 1 })
    expect(pending.files.at(0)?.patch).toContain("+A")
    await f.service.decide("s", f.root, pending.revision, "reject-all")
    expect(f.read("a")).toBe("B\n")
  })
  it("omits files when the session's net changes cancel out", async () => {
    const f = fixture()
    f.write("a", "base\n")
    f.state.messages = [edit("m1", "a", "base\n", "next\n"), edit("m2", "a", "next\n", "base\n")]
    expect((await f.service.load("s", f.root)).files).toEqual([])
  })
  it("reviews only this session's completed assistant file tools and preserves unrelated changes", async () => {
    const f = fixture()
    f.write("a.txt", "agent\nuser\n")
    f.write("other.txt", "other session\n")
    f.state.messages = [
      edit("m1", "a.txt", "old\nkeep\n", "agent\nkeep\n"),
      edit("m2", "other.txt", "old\n", "other session\n", "other"),
      { ...edit("m3", "other.txt", "old\n", "other session\n"), info: { id: "m3", role: "user" } },
      { info: { id: "m4", role: "assistant" }, parts: [{ type: "step-finish", snapshot: "ignored" }] },
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files.map((file) => file.file)).toEqual(["a.txt"])
    expect(view.files[0]).toMatchObject({
      before: "old\nuser\n",
      after: "agent\nuser\n",
      reviewStatus: "pending",
      rejectable: true,
    })
    expect(view.files[0]?.patch).not.toContain("+user")
    expect(view.files[0]?.patch).not.toContain("-user")
    await f.service.decide("s", f.root, view.revision, "reject", "a.txt")
    expect(f.read("a.txt")).toBe("old\nuser\n")
    expect(f.read("other.txt")).toBe("other session\n")
    expect((await f.service.load("s", f.root)).files).toEqual([])
  })

  it("reverses binary-ordered hexadecimal operations and parts while preserving intervening outside lines", async () => {
    const f = fixture()
    f.write("a.txt", "three\nuser\nTHREE\n")
    const first = edit("msg_172bd9309001abcdef", "a.txt", "one\nkeep\nONE\n", "two\nkeep\nONE\n")
    const last = edit("msg_172bd930a001abcdef", "a.txt", "two\nuser\nTWO\n", "three\nuser\nTHREE\n")
    const middle = edit(first.info.id, "a.txt", "two\nuser\nONE\n", "two\nuser\nTWO\n")
    first.parts[0]!.id = "prt_172bd9309001abcdef"
    middle.parts[0]!.id = "prt_172bd930a001abcdef"
    first.parts = [...middle.parts, ...first.parts]
    f.state.messages = [last, first]
    const view = await f.service.load("s", f.root)
    expect(view.files[0]?.rejectable).toBe(true)
    await f.service.decide("s", f.root, view.revision, "reject-all")
    expect(f.read("a.txt")).toBe("one\nuser\nONE\n")
  })

  it("keeps without writing, removes kept rows, and Undo All removes only pending patches", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.write("b", "B\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
    const initial = await f.service.load("s", f.root)
    const accepted = await f.service.decide("s", f.root, initial.revision, "accept", "a")
    expect(accepted.files.map((row) => row.file)).toEqual(["b"])
    expect(f.read("a")).toBe("A\n")
    await expect(f.service.decide("s", f.root, accepted.revision, "reject", "a")).rejects.toThrow("not found")
    const rejected = await f.service.decide("s", f.root, accepted.revision, "reject-all")
    expect(f.read("b")).toBe("b\n")
    expect(f.read("a")).toBe("A\n")
    const undone = await f.service.decide("s", f.root, rejected.revision, "undo-all")
    expect(undone.files).toEqual([])
    expect(f.read("a")).toBe("A\n")
    f.write("a", "NEW\n")
    f.state.messages.push(edit("m3", "a", "A\n", "NEW\n"))
    const next = await f.service.load("s", f.root)
    expect(next.files[0]?.reviewStatus).toBe("pending")
    await f.service.decide("s", f.root, next.revision, "reject", "a")
    expect(f.read("a")).toBe("A\n")
  })

  it("invalidates pending revisions on operation changes and omits kept files after outside edits", async () => {
    const f = fixture()
    f.write("a", "A\nkeep\n")
    f.state.messages = [edit("m1", "a", "a\nkeep\n", "A\nkeep\n")]
    const initial = await f.service.load("s", f.root)
    expect((await f.service.load("s", path.join(f.root, "."))).revision).toBe(initial.revision)
    f.write("unrelated", "user\n")
    expect((await f.service.load("s", f.root)).revision).toBe(initial.revision)
    const accepted = await f.service.decide("s", f.root, initial.revision, "accept", "a")
    f.write("a", "A\nuser\n")
    const changed = await f.service.load("s", f.root)
    expect(changed.files).toEqual([])
    await f.service.decide("s", f.root, accepted.revision, "undo-all")
    expect(f.read("a")).toBe("A\nuser\n")
    f.state.messages.push(edit("m2", "a", "A\nuser\n", "A\nUSER\n"))
    f.write("a", "A\nUSER\n")
    await expect(f.service.decide("s", f.root, changed.revision, "reject-all")).rejects.toThrow("Stale")
  })

  it("shows and rejects only new pending operations after Keep, including Undo All", async () => {
    for (const action of ["reject", "reject-all", "undo-all"] as const) {
      const f = fixture()
      f.write("a", "B\n")
      f.state.messages = [edit("m1", "a", "A\n", "B\n")]
      const initial = await f.service.load("s", f.root)
      await f.service.decide("s", f.root, initial.revision, "accept", "a")
      f.write("a", "C\n")
      f.state.messages.push(edit("m2", "a", "B\n", "C\n"))
      const next = await f.service.load("s", f.root)
      expect(next.files[0]?.reviewStatus).toBe("pending")
      expect(next.files[0]?.patch).toContain("-B")
      expect(next.files[0]?.patch).not.toContain("-A")
      expect(next.files[0]?.patch).toContain("+C")
      const result = await f.service.decide("s", f.root, next.revision, action, action === "reject" ? "a" : undefined)
      expect(f.read("a")).toBe("B\n")
      expect(result.files).toEqual([])
      await f.service.decide("s", f.root, result.revision, "undo-all")
      expect(f.read("a")).toBe("B\n")
    }
  })

  it("repeated per-file Keep retires every active operation from later Undo All", async () => {
    const f = fixture()
    f.write("a", "B\n")
    f.state.messages = [edit("m1", "a", "A\n", "B\n")]
    const initial = await f.service.load("s", f.root)
    await f.service.decide("s", f.root, initial.revision, "accept", "a")
    f.write("a", "C\n")
    f.state.messages.push(edit("m2", "a", "B\n", "C\n"))
    const next = await f.service.load("s", f.root)
    const accepted = await f.service.decide("s", f.root, next.revision, "accept", "a")
    const unchanged = await f.service.decide("s", f.root, accepted.revision, "reject-all")
    expect(f.read("a")).toBe("C\n")
    await f.service.decide("s", f.root, unchanged.revision, "undo-all")
    expect(f.read("a")).toBe("C\n")
  })

  it("recognizes edit creation only with explicit empty oldString and an all-addition patch", async () => {
    const f = fixture()
    f.write("created", "new\n")
    f.write("ambiguous", "new\n")
    f.write("inconsistent", "NEW\n")
    const created = edit("m1", "created", "", "new\n")
    const inconsistent = edit("m3", "inconsistent", "old\n", "NEW\n")
    f.state.messages = [
      {
        ...created,
        parts: created.parts.map((part) => ({ ...part, state: { ...part.state, input: { oldString: "" } } })),
      },
      edit("m2", "ambiguous", "", "new\n"),
      {
        ...inconsistent,
        parts: inconsistent.parts.map((part) => ({ ...part, state: { ...part.state, input: { oldString: "" } } })),
      },
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files.find((row) => row.file === "created")).toMatchObject({ status: "added", rejectable: true })
    expect(view.files.find((row) => row.file === "ambiguous")?.rejectable).toBe(false)
    expect(view.files.find((row) => row.file === "inconsistent")?.rejectable).toBe(false)
    await f.service.decide("s", f.root, view.revision, "reject", "created")
    expect(fs.existsSync(path.join(f.root, "created"))).toBe(false)
    expect(f.read("ambiguous")).toBe("new\n")
  })

  it("prefers exact rawPatch for indented edit, write and apply_patch metadata; legacy trimmed patches stay read-only", async () => {
    const f = fixture()
    const before = "    old\n"
    const after = "    new\n"
    const raw = createTwoFilesPatch("a", "a", before, after, "", "", { context: 0 })
    const trimmed = raw.replace("-    old", "-old").replace("+    new", "+new")
    for (const file of ["edit", "write", "apply", "legacy"]) f.write(file, after)
    const message = edit("m1", "edit", before, after)
    const part = message.parts[0]!
    f.state.messages = [
      {
        ...message,
        parts: [
          {
            ...part,
            id: "p1",
            state: { ...part.state, metadata: { filediff: { file: "edit", patch: trimmed, rawPatch: raw } } },
          },
          {
            ...part,
            id: "p2",
            tool: "write",
            state: {
              ...part.state,
              metadata: { exists: true, filediff: { file: "write", patch: trimmed, rawPatch: raw } },
            },
          },
          {
            ...part,
            id: "p3",
            tool: "apply_patch",
            state: {
              ...part.state,
              metadata: { files: [{ filePath: "apply", type: "update", patch: trimmed, rawPatch: raw }] },
            },
          },
          { ...part, id: "p4", state: { ...part.state, metadata: { filediff: { file: "legacy", patch: trimmed } } } },
        ],
      },
    ]
    let view = await f.service.load("s", f.root)
    expect(view.files.find((row) => row.file === "legacy")?.rejectable).toBe(false)
    for (const file of ["edit", "write", "apply"]) {
      expect(view.files.find((row) => row.file === file)?.rejectable).toBe(true)
      view = await f.service.decide("s", f.root, view.revision, "reject", file)
      expect(f.read(file)).toBe(before)
    }
    expect(f.read("legacy")).toBe(after)
  })

  it("refuses exact-position conflicts rather than finding a matching hunk elsewhere; preflights batches", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.write("b", "inserted\nB\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
    const view = await f.service.load("s", f.root)
    expect(view.files.find((row) => row.file === "b")).toMatchObject({ rejectable: false, additions: 1, deletions: 1 })
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("conflict")
    expect(f.read("a")).toBe("A\n")
    expect(f.read("b")).toBe("inserted\nB\n")
    f.write("b", "user\n")
    const conflict = await f.service.load("s", f.root)
    await expect(f.service.decide("s", f.root, conflict.revision, "reject", "b")).rejects.toThrow("conflict")
    expect(f.read("b")).toBe("user\n")
  })

  it("handles tool-created, deleted, empty, and no-final-newline files with existence checks", async () => {
    const f = fixture()
    f.write("created", "new\n")
    f.write("empty", "")
    f.write("eof", "NEW")
    f.state.messages = [
      patch("m1", [
        { file: "created", before: "", after: "new\n", type: "add" },
        { file: "deleted", before: "old\n", after: "", type: "delete" },
        { file: "empty", before: "old\n", after: "", type: "update" },
        { file: "eof", before: "old", after: "NEW", type: "update" },
      ]),
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files.every((row) => row.rejectable)).toBe(true)
    await f.service.decide("s", f.root, view.revision, "reject-all")
    expect(fs.existsSync(path.join(f.root, "created"))).toBe(false)
    expect(f.read("deleted")).toBe("old\n")
    expect(f.read("empty")).toBe("old\n")
    expect(f.read("eof")).toBe("old")
  })

  it("does not remove tool-created files containing additional user content", async () => {
    const f = fixture()
    f.write("a", "new\nuser\n")
    f.state.messages = [patch("m1", [{ file: "a", before: "", after: "new\n", type: "add" }])]
    const view = await f.service.load("s", f.root)
    expect(view.files[0]?.rejectable).toBe(false)
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow()
    expect(f.read("a")).toBe("new\nuser\n")
  })

  it("uses write existence metadata and excludes shell, MCP, unfinished tools, and foreign parts", async () => {
    const f = fixture()
    f.write("new", "new\n")
    const message = edit("m1", "new", "", "new\n")
    const part = message.parts[0]!
    f.state.messages = [
      {
        ...message,
        parts: [
          { ...part, tool: "write", state: { ...part.state, metadata: { ...part.state.metadata, exists: false } } },
          { ...part, id: "shell", tool: "bash" },
          { ...part, id: "mcp", tool: "mcp__edit" },
          { ...part, id: "running", state: { ...part.state, status: "running" } },
          { ...part, id: "foreign", sessionID: "other" },
        ],
      },
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files).toHaveLength(1)
    f.state.messages = [
      {
        ...message,
        parts: [
          { ...part, tool: "write", state: { ...part.state, metadata: { ...part.state.metadata, exists: false } } },
        ],
      },
    ]
    await f.service.decide("s", f.root, view.revision, "reject-all")
    expect(fs.existsSync(path.join(f.root, "new"))).toBe(false)
  })

  it("omits traversal and Git paths, and keeps moves, directories and hardlinks read-only", async () => {
    const f = fixture()
    f.write("a", "A\n")
    fs.linkSync(path.join(f.root, "a"), path.join(f.root, "linked"))
    fs.mkdirSync(path.join(f.root, "directory"))
    f.state.messages = [
      edit("m1", "../escape", "a\n", "A\n"),
      edit("m2", ".git/index", "a\n", "A\n"),
      edit("m3", path.dirname(f.root), "a\n", "A\n"),
      edit("m4", "directory", "a\n", "A\n"),
      edit("m5", "a", "a\n", "A\n"),
      patch("m6", [{ file: "move", before: "a\n", after: "A\n", type: "move", movePath: "destination" }]),
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files.map((row) => row.file)).toEqual(["directory", "a", "move"])
    expect(view.files.every((row) => !row.rejectable)).toBe(true)
    await expect(f.service.decide("s", f.root, view.revision, "undo-all")).rejects.toThrow()
    expect(f.read("linked")).toBe("A\n")
  })

  it("refuses symlink files and symlink parents", async () => {
    const f = fixture()
    const outside = fixture()
    outside.write("a", "A\n")
    fs.symlinkSync(outside.root, path.join(f.root, "link"), process.platform === "win32" ? "junction" : "dir")
    f.state.messages = [edit("m1", "link/a", "a\n", "A\n")]
    const view = await f.service.load("s", f.root)
    expect(view.files[0]?.rejectable).toBe(false)
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow()
    expect(outside.read("a")).toBe("A\n")
  })

  it("refuses invalid UTF-8, binary, oversized and missing update files", async () => {
    const f = fixture()
    fs.writeFileSync(path.join(f.root, "invalid"), Buffer.from([0xff]))
    f.write("binary", "a\0b")
    f.write("large", "x".repeat(1024 * 1024 + 1))
    f.state.messages = ["invalid", "binary", "large", "missing"].map((file, index) =>
      edit(`m${index}`, file, "a\n", "A\n"),
    )
    const view = await f.service.load("s", f.root)
    expect(view.files).toHaveLength(4)
    expect(view.files.every((row) => !row.rejectable)).toBe(true)
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow()
  })

  it("blocks dirty documents and running sessions for accept and reject", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n")]
    const view = await f.service.load("s", f.root)
    f.state.dirty = [path.join(f.root, "a")]
    await expect(f.service.decide("s", f.root, view.revision, "accept", "a")).rejects.toThrow("dirty")
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("dirty")
    f.state.dirty = []
    f.state.idle = false
    await expect(f.service.decide("s", f.root, view.revision, "accept", "a")).rejects.toThrow("idle")
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("idle")
    expect(f.read("a")).toBe("A\n")
  })

  it("refuses concurrent decisions across sessions in the same canonical directory", async () => {
    const f = fixture()
    f.write("a", "A\n")
    const gate = Promise.withResolvers<boolean>()
    const service = new SessionReview({
      messages: async () => [edit("m1", "a", "a\n", "A\n")],
      idle: () => gate.promise,
      dirtyFiles: () => [],
    })
    const view = await service.load("s", f.root)
    const decision = service.decide("s", f.root, view.revision, "reject-all")
    await expect(service.decide("other", f.root, view.revision, "reject-all")).rejects.toThrow("busy")
    await expect(service.load("s", f.root)).rejects.toThrow("busy")
    gate.resolve(true)
    await decision
    expect(f.read("a")).toBe("a\n")
  })

  it("rechecks dirty buffers and disk digests before mutating any file", async () => {
    const f = fixture()
    f.write("a", "A\n")
    f.write("b", "B\n")
    const messages = [edit("m1", "a", "a\n", "A\n"), edit("m2", "b", "b\n", "B\n")]
    let calls = 0
    const service = new SessionReview({
      messages: async () => messages,
      idle: async () => true,
      dirtyFiles: () => {
        if (++calls === 2) f.write("b", "user\n")
        return []
      },
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("changed")
    expect(f.read("a")).toBe("A\n")
    expect(f.read("b")).toBe("user\n")
  })

  it("refuses inode replacements before writes even if replacement content matches", async () => {
    const f = fixture()
    f.write("a", "A\n")
    const messages = [edit("m1", "a", "a\n", "A\n")]
    let calls = 0
    const service = new SessionReview({
      messages: async () => messages,
      idle: async () => true,
      dirtyFiles: () => {
        if (++calls === 2) {
          fs.renameSync(path.join(f.root, "a"), path.join(f.root, "original"))
          f.write("a", "A\n")
        }
        return []
      },
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("changed")
    expect(f.read("a")).toBe("A\n")
    expect(f.read("original")).toBe("A\n")
  })

  it("keeps decisions isolated by session and canonical directory", async () => {
    const f = fixture()
    const other = fixture()
    f.write("a", "A\n")
    other.write("a", "A\n")
    const service = new SessionReview({
      messages: async (sessionID) => [edit("m1", "a", "a\n", "A\n", sessionID)],
      idle: async () => true,
      dirtyFiles: () => [],
    })
    const view = await service.load("s", f.root)
    await service.decide("s", f.root, view.revision, "accept", "a")
    expect((await service.load("other", f.root)).files[0]?.reviewStatus).toBe("pending")
    expect((await service.load("s", other.root)).files[0]?.reviewStatus).toBe("pending")
    expect((await service.load("s", path.join(f.root, "."))).files).toEqual([])
  })

  it("makes missing updates and reappeared deleted files read-only rather than recreating or overwriting", async () => {
    const f = fixture()
    f.write("deleted", "user\n")
    f.state.messages = [
      patch("m1", [
        { file: "deleted", before: "old\n", after: "", type: "delete" },
        { file: "missing", before: "old\n", after: "new\n", type: "update" },
      ]),
    ]
    const view = await f.service.load("s", f.root)
    expect(view.files.every((row) => !row.rejectable)).toBe(true)
    await expect(f.service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow()
    expect(f.read("deleted")).toBe("user\n")
    expect(fs.existsSync(path.join(f.root, "missing"))).toBe(false)
  })

  it("rejects operations that complete while the idle check is pending", async () => {
    const f = fixture()
    f.write("a", "A\n")
    const messages = [edit("m1", "a", "a\n", "A\n")]
    const service = new SessionReview({
      messages: async () => [...messages],
      dirtyFiles: () => [],
      idle: async () => {
        messages.push(edit("m2", "a", "A\n", "NEW\n"))
        f.write("a", "NEW\n")
        return true
      },
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("Stale")
    expect(f.read("a")).toBe("NEW\n")
  })

  it("refuses a running tool introduced by the final message fetch even when idle reports true", async () => {
    const f = fixture()
    f.write("a", "A\n")
    const completed = edit("m1", "a", "a\n", "A\n")
    const started = edit("m2", "a", "A\n", "NEW\n")
    let calls = 0
    const service = new SessionReview({
      messages: async () =>
        ++calls < 3
          ? [completed]
          : [
              completed,
              {
                ...started,
                parts: started.parts.map((part) => ({ ...part, state: { ...part.state, status: "running" } })),
              },
            ],
      idle: async () => true,
      dirtyFiles: () => [],
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("idle")
    expect(f.read("a")).toBe("A\n")
  })

  it("rechecks idle after the final message fetch and refuses a newly running session", async () => {
    const f = fixture()
    f.write("a", "A\n")
    let calls = 0
    const service = new SessionReview({
      messages: async () => [edit("m1", "a", "a\n", "A\n")],
      idle: async () => ++calls === 1,
      dirtyFiles: () => [],
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("idle")
    expect(calls).toBe(2)
    expect(f.read("a")).toBe("A\n")
  })

  it("revalidates disk revisions after the final asynchronous idle check", async () => {
    const f = fixture()
    f.write("a", "A\nkeep\n")
    let calls = 0
    const service = new SessionReview({
      messages: async () => [edit("m1", "a", "a\nkeep\n", "A\nkeep\n")],
      idle: async () => {
        if (++calls === 2) f.write("a", "A\nuser\n")
        return true
      },
      dirtyFiles: () => [],
    })
    const view = await service.load("s", f.root)
    await expect(service.decide("s", f.root, view.revision, "reject-all")).rejects.toThrow("Stale")
    expect(f.read("a")).toBe("A\nuser\n")
  })

  it("does not touch the Git index", async () => {
    const f = fixture()
    f.write("a", "a\n")
    for (const args of [["init"], ["add", "a"]]) {
      const result = Bun.spawnSync({ cmd: ["git", ...args], cwd: f.root, stdout: "pipe", stderr: "pipe" })
      expect(result.exitCode).toBe(0)
    }
    const index = fs.readFileSync(path.join(f.root, ".git", "index"))
    f.write("a", "A\n")
    f.state.messages = [edit("m1", "a", "a\n", "A\n")]
    const view = await f.service.load("s", f.root)
    await f.service.decide("s", f.root, view.revision, "reject-all")
    expect(fs.readFileSync(path.join(f.root, ".git", "index"))).toEqual(index)
  })
})
