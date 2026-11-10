import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { Database } from "../../src/database/database"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { SessionAdmission } from "../../src/kilocode/session-admission"
import { ProjectV2 } from "../../src/project"
import { ProjectTable } from "../../src/project/sql"
import { AbsolutePath } from "../../src/schema"
import { SessionV2 } from "../../src/session"
import { SessionExecution } from "../../src/session/execution"
import { SessionInputTable, SessionTable } from "../../src/session/sql"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, SessionV2.node, SessionAdmission.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
    [SessionExecution.node, SessionExecution.noopLayer],
  ]),
)

it.effect("transfer excludes native durable input, including resume:false", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const gate = yield* SessionAdmission.Service
    const sessions = yield* SessionV2.Service
    const id = SessionV2.ID.make("ses_native_transfer")
    yield* db
      .insert(ProjectTable)
      .values({ id: ProjectV2.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id,
        project_id: ProjectV2.ID.global,
        slug: "native",
        directory: "/project",
        title: "source",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    yield* gate.reserve(
      [id],
      "operation",
      Effect.gen(function* () {
        const result = yield* sessions
          .prompt({ sessionID: id, prompt: { text: "must not be admitted" }, resume: false })
          .pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual([])
      }),
    )
    yield* sessions.prompt({ sessionID: id, prompt: { text: "admitted after reservation" }, resume: false })
    expect(yield* db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toHaveLength(1)
  }),
)
