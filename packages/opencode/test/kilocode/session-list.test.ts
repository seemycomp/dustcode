import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Session } from "../../src/session/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Database } from "@opencode-ai/core/database/database"
import { eq } from "drizzle-orm"
import { InstanceRef } from "../../src/effect/instance-ref"
import { AbsolutePath } from "@opencode-ai/core/schema"
import * as Log from "@opencode-ai/core/util/log"

Log.init({ print: false })
const layer = LayerNode.compile(LayerNode.group([Session.node, SessionProjector.node, Database.node]))
const it = testEffect(layer)

describe("Kilo Session.list", () => {
  it.instance("walks tied timestamps with paired cursors in descending order", () =>
    Effect.gen(function* () {
      yield* seedProject
      const ctx = yield* InstanceRef
      if (!ctx) return yield* Effect.die(new Error("missing test instance"))
      const sessions = yield* Session.Service
      const { db } = yield* Database.Service
      const rows: Session.Info[] = []
      for (const updated of [30, 20, 20, 20, 20, 20, 20, 20, 10]) {
        const session = yield* sessions.create({ title: "history" })
        yield* db.update(SessionTable).set({ time_updated: updated }).where(eq(SessionTable.id, session.id))
        rows.push({ ...session, time: { ...session.time, updated } })
      }
      const expected = rows.toSorted((a, b) => b.time.updated - a.time.updated || (a.id < b.id ? 1 : -1))
      const ids: string[] = []
      const sizes: number[] = []
      let cursor: { cursor?: number; cursorID?: string } = {}
      for (let n = 0; n < 6; n++) {
        const page = yield* sessions.listGlobal({ directory: ctx.directory, limit: 2, ...cursor })
        sizes.push(page.length)
        ids.push(...page.map((item) => item.id))
        const tail = page.at(-1)
        if (!tail) break
        cursor = { cursor: tail.time.updated, cursorID: tail.id }
      }
      expect(ids).toEqual(expected.map((item) => item.id))
      expect(new Set(ids).size).toBe(rows.length)
      expect(sizes).toEqual([2, 2, 2, 2, 1, 0])
      const legacy = yield* sessions.listGlobal({ directory: ctx.directory, cursor: 20 })
      expect(legacy.map((item) => item.id)).toEqual([rows.at(-1)!.id])
    }),
  )

  it.instance("preserves root, archive, exact-directory and title-search boundaries", () =>
    Effect.gen(function* () {
      yield* seedProject
      const ctx = yield* InstanceRef
      if (!ctx) return yield* Effect.die(new Error("missing test instance"))
      const sessions = yield* Session.Service
      const { db } = yield* Database.Service
      const root = yield* sessions.create({ title: "History Match" })
      const archived = yield* sessions.create({ title: "history match archived" })
      const child = yield* sessions.create({ title: "history match child", parentID: root.id })
      const nested = yield* sessions.create({ title: "history match nested" })
      const other = yield* sessions.create({ title: "different title" })
      for (const session of [root, archived, child, nested, other]) {
        yield* db.update(SessionTable).set({ time_updated: 20 }).where(eq(SessionTable.id, session.id))
      }
      yield* db
        .update(SessionTable)
        .set({ time_archived: 10, time_updated: 20 })
        .where(eq(SessionTable.id, archived.id))
      yield* db
        .update(SessionTable)
        .set({ directory: path.join(ctx.directory, "nested") })
        .where(eq(SessionTable.id, nested.id))
      const input = { directory: ctx.directory, roots: true, archived: true, search: "history match", limit: 1 }
      const expected = [root.id, archived.id].sort().reverse()
      const first = yield* sessions.listGlobal(input)
      expect(first.map((item) => item.id)).toEqual(expected.slice(0, 1))
      const tail = first.at(-1)!
      const next = yield* sessions.listGlobal({ ...input, cursor: tail.time.updated, cursorID: tail.id })
      expect(next.map((item) => item.id)).toEqual(expected.slice(1))
      expect((yield* sessions.listGlobal({ ...input, archived: false })).map((item) => item.id)).toEqual([root.id])
      expect((yield* sessions.listGlobal({ ...input, search: "different" })).map((item) => item.id)).toEqual([other.id])
      expect(yield* sessions.listGlobal({ ...input, search: "no match" })).toEqual([])
      const all = yield* sessions.listGlobal({ ...input, roots: false, limit: 10 })
      expect(all.map((item) => item.id).sort()).toEqual([root.id, archived.id, child.id].sort())
    }),
  )

  it.instance(
    "includes directory matches from legacy project ids",
    () =>
      Effect.gen(function* () {
        yield* seedProject
        const ctx = yield* InstanceRef
        if (!ctx) return yield* Effect.die(new Error("missing test instance"))
        const sessions = yield* Session.Service
        const { db } = yield* Database.Service
        const session = yield* sessions.create({ title: "legacy-session" })
        const project = ProjectV2.ID.make("legacy-project")
        yield* db.insert(ProjectTable).values({
          id: project,
          worktree: AbsolutePath.make(ctx.directory),
          vcs: "git",
          time_created: Date.now(),
          time_updated: Date.now(),
          sandboxes: [],
        })
        yield* db.update(SessionTable).set({ project_id: project }).where(eq(SessionTable.id, session.id))
        const list = yield* sessions.list({ directory: ctx.directory })
        expect(list.map((item) => item.id)).toContain(session.id)
      }),
  )

  it.instance(
    "matches legacy project ids through active sandboxes",
    () =>
      Effect.gen(function* () {
        yield* seedProject
        const ctx = yield* InstanceRef
        if (!ctx) return yield* Effect.die(new Error("missing test instance"))
        const sessions = yield* Session.Service
        const { db } = yield* Database.Service
        const session = yield* sessions.create({ title: "sandbox-session" })
        const project = ProjectV2.ID.make(`sandbox-project-${Date.now()}`)
        yield* db.insert(ProjectTable).values({
          id: project,
          worktree: AbsolutePath.make(path.join(ctx.directory, "removed-worktree")),
          vcs: "git",
          time_created: Date.now(),
          time_updated: Date.now(),
          sandboxes: [AbsolutePath.make(ctx.directory)],
        })
        yield* db.update(SessionTable).set({ project_id: project }).where(eq(SessionTable.id, session.id))
        const list = yield* Session.listGlobal({
          projectID: ctx.project.id,
          directories: [ctx.directory],
          roots: true,
        })
        expect(list.map((item) => item.id)).toContain(session.id)
      }),
  )
})
