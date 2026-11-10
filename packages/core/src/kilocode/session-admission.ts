export * as SessionAdmission from "./session-admission"

import { randomUUID } from "node:crypto"
import path from "node:path"
import { eq, inArray, sql } from "drizzle-orm"
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Context, Effect, FiberSet, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionTable } from "../session/sql"
import { SessionSchema } from "../session/schema"

type Placement = { directory: string; workspaceID?: string }
const live = new Set<string>()

const Lease = sqliteTable(
  "kilo_session_lease",
  {
    session_id: text().notNull(),
    token: text().notNull(),
    pid: integer().notNull(),
    kind: text().$type<"work" | "transfer">().notNull(),
    operation: text(),
  },
  (table) => [primaryKey({ columns: [table.session_id, table.token] })],
)

export class Busy extends Schema.TaggedErrorClass<Busy>()("SessionAdmissionBusy", {
  sessionID: Schema.String,
  operation: Schema.optional(Schema.String),
}) {
  override get message() {
    return this.operation ? "A session transfer owns this conversation" : "This conversation has accepted work"
  }
}

export class Stale extends Schema.TaggedErrorClass<Stale>()("SessionAdmissionStale", {
  sessionID: Schema.String,
}) {
  override get message() {
    return "The session execution directory changed; reload it before starting work"
  }
}

export interface Interface {
  readonly hold: (ids: readonly string[], placement?: Placement) => Effect.Effect<Effect.Effect<void>>
  readonly lease: (ids: readonly string[], placement?: Placement) => Effect.Effect<() => void>
  readonly work: <A, E, R>(
    ids: readonly string[],
    effect: Effect.Effect<A, E, R>,
    placement?: Placement,
  ) => Effect.Effect<A, E, R>
  readonly reserve: <A, E, R>(
    ids: readonly string[],
    operation: string,
    effect: Effect.Effect<A, E, R>,
    retain?: Effect.Effect<boolean>,
  ) => Effect.Effect<A, E, R>
  readonly recover: Interface["reserve"]
  readonly settle: (operation: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@kilocode/SessionAdmission") {}

function dead(pid: number) {
  try {
    process.kill(pid, 0)
    return false
  } catch (err) {
    return err instanceof Error && "code" in err && err.code === "ESRCH"
  }
}

export const make = Effect.fn("SessionAdmission.make")(function* (db: Database.Interface["db"]) {
  // Keep leases in the same database as session ownership. Separate listeners and
  // backend processes must see each other's admitted work, not just transfer locks.
  yield* db
    .run(
      "CREATE TABLE IF NOT EXISTS kilo_session_lease (session_id text NOT NULL, token text NOT NULL, pid integer NOT NULL, kind text NOT NULL, operation text, PRIMARY KEY (session_id, token))",
    )
    .pipe(Effect.orDie)
  const owned = new Set<string>()
  const fork = yield* FiberSet.makeRuntime<never, void, never>()
  yield* Effect.addFinalizer(() =>
    Effect.forEach(
      owned,
      (token) =>
        db
          .delete(Lease)
          .where(eq(Lease.token, token))
          .run()
          .pipe(
            Effect.orDie,
            Effect.tap(() => Effect.sync(() => live.delete(token))),
          ),
      {
        discard: true,
      },
    ),
  )

  const acquire = Effect.fn("SessionAdmission.acquire")(function* (
    ids: readonly string[],
    kind: "work" | "transfer",
    operation?: string,
    placement?: Placement,
    recovery = false,
  ) {
    const unique = [...new Set(ids)].sort()
    if (unique.length === 0) return { release: Effect.void, retain: Effect.void }
    const token = randomUUID()
    yield* db
      .transaction(
        () =>
          Effect.gen(function* () {
            const rows = yield* db.select().from(Lease).where(inArray(Lease.session_id, unique)).all()
            for (const row of rows) {
              // A dead worker cannot still execute. An interrupted transfer may
              // own user-file writes, so only receipt recovery can release it.
              if (row.kind === "work" && dead(row.pid)) {
                yield* db.delete(Lease).where(eq(Lease.token, row.token)).run()
                continue
              }
              if (row.kind === "transfer" && dead(row.pid)) {
                const table = yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kilo_session_transfer_receipt'`)
                const receipt = table && row.operation
                  ? yield* db.get<{ status: string }>(sql`SELECT status FROM kilo_session_transfer_receipt WHERE operation_id = ${row.operation}`)
                  : undefined
                // No file mutation can precede the durable applying receipt. A
                // dead preview/pre-apply owner is safe to reclaim without undo.
                if (receipt?.status !== "applying" && receipt?.status !== "recovery") {
                  yield* db.delete(Lease).where(eq(Lease.token, row.token)).run()
                  continue
                }
              }
              if (
                recovery &&
                row.kind === "transfer" &&
                row.operation === operation &&
                (dead(row.pid) || (row.pid === process.pid && !live.has(row.token)))
              ) {
                yield* db.delete(Lease).where(eq(Lease.token, row.token)).run()
                continue
              }
              if (kind === "transfer" || row.kind === "transfer") {
                return yield* Effect.die(new Busy({ sessionID: row.session_id, operation: row.operation ?? undefined }))
              }
            }
            if (placement) {
              const sessions = yield* db
                .select()
                .from(SessionTable)
                .where(
                  inArray(
                    SessionTable.id,
                    unique.map((id) => SessionSchema.ID.make(id)),
                  ),
                )
                .all()
              const key = (dir: string) =>
                process.platform === "win32" ? path.resolve(dir).toLowerCase() : path.resolve(dir)
              for (const session of sessions) {
                if (
                  (session.metadata?.["kilocode.transfer"] != null && key(session.directory) !== key(placement.directory)) ||
                  (session.workspace_id ?? undefined) !== placement.workspaceID
                ) {
                  return yield* Effect.die(new Stale({ sessionID: session.id }))
                }
              }
            }
            yield* db
              .insert(Lease)
              .values(unique.map((id) => ({ session_id: id, token, pid: process.pid, kind, operation })))
          }),
        { behavior: "immediate" },
      )
      .pipe(Effect.orDie, Effect.uninterruptible)
    owned.add(token)
    live.add(token)
    let released = false
    const release = Effect.suspend(() => {
      if (released) return Effect.void
      return db
        .delete(Lease)
        .where(eq(Lease.token, token))
        .run()
        .pipe(
          Effect.orDie,
          Effect.tap(() =>
            Effect.sync(() => {
              released = true
              owned.delete(token)
              live.delete(token)
            }),
          ),
          Effect.asVoid,
          Effect.uninterruptible,
        )
    })
    return {
      release,
      retain: Effect.sync(() => {
        owned.delete(token)
        live.delete(token)
      }),
    }
  })

  const hold = (ids: readonly string[], placement?: Placement) =>
    acquire(ids, "work", undefined, placement).pipe(Effect.map((value) => value.release))
  // Runner observers are synchronous. Run only their release in this service's
  // scope; until deletion completes, the durable lease still excludes transfer.
  const lease = (ids: readonly string[], placement?: Placement) =>
    hold(ids, placement).pipe(
      Effect.map((release) => () => {
        fork(release.pipe(Effect.catchCause((cause) => Effect.logError("Session admission release failed", cause))))
      }),
    )
  const work: Interface["work"] = (ids, effect, placement) =>
    Effect.acquireUseRelease(
      hold(ids, placement),
      () => effect,
      (release) => release,
    )
  const exclusive = <A, E, R>(
    ids: readonly string[],
    operation: string,
    effect: Effect.Effect<A, E, R>,
    retain: Effect.Effect<boolean> | undefined,
    recovery: boolean,
  ) =>
    Effect.acquireUseRelease(
      acquire(ids, "transfer", operation, undefined, recovery),
      () => effect,
      (lease) =>
        retain ? retain.pipe(Effect.flatMap((keep) => (keep ? lease.retain : lease.release))) : lease.release,
    )
  const reserve: Interface["reserve"] = (ids, operation, effect, retain) =>
    exclusive(ids, operation, effect, retain, false)
  const recover: Interface["recover"] = (ids, operation, effect, retain) =>
    exclusive(ids, operation, effect, retain, true)
  const settle = (operation: string) => db.transaction(() => Effect.gen(function* () {
    const rows = yield* db.select().from(Lease).where(eq(Lease.operation, operation)).all()
    for (const row of rows) {
      if (dead(row.pid) || (row.pid === process.pid && !live.has(row.token))) yield* db.delete(Lease).where(eq(Lease.token, row.token)).run()
    }
  }), { behavior: "immediate" }).pipe(Effect.orDie)
  return Service.of({ hold, lease, work, reserve, recover, settle })
})

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.flatMap(Database.Service, (database) => make(database.db)),
  ),
  deps: [Database.node],
})
