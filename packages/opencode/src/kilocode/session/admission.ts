import type { SessionAdmission } from "@opencode-ai/core/kilocode/session-admission"
import type { Session } from "@/session/session"
import { Effect } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceState } from "@/effect/instance-state"
import { capture } from "@/kilocode/instance"

/** Fence the complete public mutation, including reads and cleanup before its events. */
export function admit(ops: Session.Interface, gate: SessionAdmission.Interface): Session.Interface {
  const write = <A, E, R>(id: string, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const ctx = (yield* InstanceRef) ?? capture()
      return yield* gate.work(
        [id],
        effect,
        ctx ? { directory: ctx.directory, workspaceID: yield* InstanceState.workspaceID } : undefined,
      )
    })
  return {
    ...ops,
    create: (input) => input?.parentID ? write(input.parentID, ops.create(input)) : ops.create(input),
    fork: (input) => write(input.sessionID, ops.fork(input)),
    touch: (id) => write(id, ops.touch(id)),
    setTitle: (input) => write(input.sessionID, ops.setTitle(input)),
    setArchived: (input) => write(input.sessionID, ops.setArchived(input)),
    setMetadata: (input) => write(input.sessionID, ops.setMetadata(input)),
    setAgentModel: (input) => write(input.sessionID, ops.setAgentModel(input)),
    setPermission: (input) => write(input.sessionID, ops.setPermission(input)),
    setRevert: (input) => write(input.sessionID, ops.setRevert(input)),
    clearRevert: (id) => write(id, ops.clearRevert(id)),
    setSummary: (input) => write(input.sessionID, ops.setSummary(input)),
    setShare: (input) => write(input.sessionID, ops.setShare(input)),
    setWorkspace: (input) => write(input.sessionID, ops.setWorkspace(input)),
    remove: (id) => write(id, ops.remove(id)),
    updateMessage: (message) => write(message.sessionID, ops.updateMessage(message)),
    removeMessage: (input) => write(input.sessionID, ops.removeMessage(input)),
    removePart: (input) => write(input.sessionID, ops.removePart(input)),
    updatePart: (part) => write(part.sessionID, ops.updatePart(part)),
  }
}
