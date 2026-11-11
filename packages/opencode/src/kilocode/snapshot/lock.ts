// EffectFlock serializes the whole snapshot repository across the CLI and extension processes.
// Never remove an index lock whose writer is unknown, even while holding our own flock.
import { Data, Effect } from "effect"
import path from "path"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import type { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import * as Log from "@opencode-ai/core/util/log"

export namespace KiloSnapshotLock {
  const log = Log.create({ service: "snapshot.lock" })
  export class Failure extends Data.TaggedError("SnapshotError")<{
    gitdir: string
    phase: string
    code?: number
    stderr?: string
  }> {
    override get message() {
      const detail =
        this.phase === "index.lock"
          ? "An unknown writer holds index.lock. Stop all snapshot writers before recovering the private lock, then restart the backend."
          : this.stderr?.trim() || "Snapshot reconciliation did not complete."
      return `Snapshot ${this.phase} failed in ${this.gitdir}: ${detail}`
    }
  }

  // A defect survives the slow-question wrapper's typed-error fallback and opens
  // the existing turn-facing circuit instead of publishing a stale checkpoint.
  export const fail = (gitdir: string, phase: string, result?: { code: number; stderr: string }) => {
    const error = new Failure({ gitdir, phase, code: result?.code, stderr: result?.stderr })
    return Effect.sync(() => log.warn(error.message)).pipe(Effect.andThen(Effect.die(error)))
  }

  export const check = (gitdir: string, phase: string, result: { code: number; stderr: string }) =>
    result.code === 0 ? Effect.void : fail(gitdir, phase, result)

  /** Called only under the snapshot locks, before enumerating or statting the worktree. */
  export const preflight = Effect.fnUntraced(function* (fs: FSUtil.Interface, gitdir: string) {
    if (yield* fs.exists(path.join(gitdir, "index.lock")).pipe(Effect.orDie)) {
      yield* fail(gitdir, "index.lock")
    }
  })

  /**
   * Treat a failure to take the cross-process snapshot lock as a defect, while leaving the body's
   * own errors in the error channel for callers that report them.
   */
  export const dieOnLockError = <A, E, R>(fx: Effect.Effect<A, E | EffectFlock.LockError, R>) =>
    fx.pipe(Effect.catchTag("LockTimeoutError", Effect.die), Effect.catchTag("LockCompromisedError", Effect.die))
}
