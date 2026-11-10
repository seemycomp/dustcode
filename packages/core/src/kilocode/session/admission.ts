import type { SessionV2 } from "../../session"
import type { SessionAdmission } from "../session-admission"

export function admit(ops: SessionV2.Interface, gate: SessionAdmission.Interface): SessionV2.Interface {
  return {
    ...ops,
    create: (input) => (input.id ? gate.work([input.id], ops.create(input)) : ops.create(input)),
    prompt: (input) => gate.work([input.sessionID], ops.prompt(input)),
    resume: (id) => gate.work([id], ops.resume(id)),
    interrupt: (id) => gate.work([id], ops.interrupt(id)),
    compact: (input) => gate.work([input.sessionID], ops.compact(input)),
    switchAgent: (input) => gate.work([input.sessionID], ops.switchAgent(input)),
    switchModel: (input) => gate.work([input.sessionID], ops.switchModel(input)),
    revert: {
      stage: (input) => gate.work([input.sessionID], ops.revert.stage(input)),
      clear: (id) => gate.work([id], ops.revert.clear(id)),
      commit: (id) => gate.work([id], ops.revert.commit(id)),
    },
  }
}
