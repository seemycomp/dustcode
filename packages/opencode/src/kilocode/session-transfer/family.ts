import { createHash } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { TransferError } from "./repository"

/** Do not use Session.children: its project filter can hide invalid descendants. */
export const family = Effect.fn("SessionTransfer.family")(function* (input: { sessionID: string; projectID: string }) {
  const { db } = yield* Database.Service
  const root = yield* db
    .select()
    .from(SessionTable)
    .where(eq(SessionTable.id, SessionID.make(input.sessionID)))
    .get()
    .pipe(Effect.orDie)
  if (!root || root.parent_id != null || root.project_id !== input.projectID || root.workspace_id != null) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "Transfer requires an existing local root session in the registered project",
    })
  }
  const members = [root]
  const seen = new Set([root.id])
  let pending = [root.id]
  while (pending.length) {
    const children = yield* db
      .select()
      .from(SessionTable)
      .where(inArray(SessionTable.parent_id, pending))
      .all()
      .pipe(Effect.orDie)
    pending = []
    for (const child of children) {
      if (seen.has(child.id) || child.project_id !== input.projectID || child.workspace_id != null) {
        return yield* new TransferError({
          code: "unauthorized",
          detail: "The conversation family contains an unauthorized or invalid child",
        })
      }
      seen.add(child.id)
      members.push(child)
      pending.push(child.id)
      if (members.length > 2_048)
        return yield* new TransferError({
          code: "unsupported",
          detail: "This conversation family exceeds the supported transfer size",
        })
    }
  }
  const sequences = yield* db
    .select()
    .from(EventSequenceTable)
    .where(inArray(EventSequenceTable.aggregate_id, [...seen]))
    .all()
    .pipe(Effect.orDie)
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        members: members.toSorted((a, b) => a.id.localeCompare(b.id)),
        sequences: sequences.toSorted((a, b) => a.aggregate_id.localeCompare(b.aggregate_id)),
      }),
    )
    .digest("hex")
  return { root: Session.fromRow(root), members: members.map(Session.fromRow), revision }
})
