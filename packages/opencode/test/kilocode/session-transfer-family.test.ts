import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Session } from "../../src/session/session"
import { SessionID } from "../../src/session/schema"
import { family } from "../../src/kilocode/session-transfer/family"
import { seedProject } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Session.node, SessionProjector.node, Database.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
  ]),
)

it.instance("includes the full persisted family, including different-context descendants", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const { db } = yield* Database.Service
    const root = yield* sessions.create({ title: "root" })
    const child = yield* sessions.create({ parentID: root.id, title: "child" })
    const nested = yield* sessions.create({ parentID: child.id, title: "nested" })
    yield* db
      .update(SessionTable)
      .set({ directory: path.join(root.directory, "other") })
      .where(eq(SessionTable.id, nested.id))
      .run()
      .pipe(Effect.orDie)
    const result = yield* family({ sessionID: root.id, projectID: root.projectID })
    expect(result.members.map((session) => session.id).sort()).toEqual([root.id, child.id, nested.id].sort())
    expect(result.members.find((session) => session.id === nested.id)?.directory).toBe(
      path.join(root.directory, "other"),
    )
    const previous = result.revision
    yield* sessions.setTitle({ sessionID: child.id, title: "changed" })
    expect((yield* family({ sessionID: root.id, projectID: root.projectID })).revision).not.toBe(previous)
  }),
)

it.instance("refuses deleted, nonroot and mismatched-project sources", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const root = yield* sessions.create()
    const child = yield* sessions.create({ parentID: root.id })
    for (const input of [
      { sessionID: SessionID.make("ses_missing"), projectID: root.projectID },
      { sessionID: child.id, projectID: root.projectID },
      { sessionID: root.id, projectID: "forged" },
    ]) {
      const result = yield* family(input).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.code).toBe("unauthorized")
    }
  }),
)

it.instance("does not silently omit malformed cross-project descendants", () =>
  Effect.gen(function* () {
    yield* seedProject
    const sessions = yield* Session.Service
    const { db } = yield* Database.Service
    const root = yield* sessions.create()
    const child = yield* sessions.create({ parentID: root.id })
    const project = ProjectV2.ID.make("other-project")
    yield* db
      .insert(ProjectTable)
      .values({ id: project, worktree: AbsolutePath.make(root.directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .update(SessionTable)
      .set({ project_id: project })
      .where(eq(SessionTable.id, child.id))
      .run()
      .pipe(Effect.orDie)
    const result = yield* family({ sessionID: root.id, projectID: root.projectID }).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("unauthorized")
  }),
)
