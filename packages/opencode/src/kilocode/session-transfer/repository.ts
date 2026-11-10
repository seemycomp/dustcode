import { realpath } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@opencode-ai/core/process"

export class TransferError extends Schema.TaggedErrorClass<TransferError>()("SessionTransferError", {
  code: Schema.Literals(["unauthorized", "stale", "busy", "conflict", "unsupported", "recovery"]),
  detail: Schema.String,
  paths: Schema.optional(Schema.Array(Schema.String)),
}) {
  override get message() {
    return this.detail
  }
}

export function key(dir: string) {
  return process.platform === "win32" ? path.normalize(dir).toLowerCase() : path.normalize(dir)
}

const canonical = (dir: string) =>
  Effect.tryPromise({
    try: () => realpath(dir),
    catch: () => new TransferError({ code: "unauthorized", detail: "A transfer directory is missing or unreadable" }),
  })

export const git = Effect.fn("SessionTransfer.git")(function* (
  dir: string,
  args: readonly string[],
  stdin?: string,
  env?: Record<string, string>,
) {
  const proc = yield* AppProcess.Service
  const result = yield* proc
    .run(
      ChildProcess.make("git", ["--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false", ...args], {
        cwd: dir,
        extendEnv: true,
        env,
      }),
      { stdin, maxOutputBytes: 32 * 1024 * 1024, maxErrorBytes: 8192 },
    )
    .pipe(
      Effect.mapError(() => new TransferError({ code: "unsupported", detail: "Unable to inspect the Git worktree" })),
    )
  if (result.stdoutTruncated || result.stderrTruncated) {
    return yield* new TransferError({ code: "unsupported", detail: "Git transfer data exceeds the supported size" })
  }
  return result
})

const output = Effect.fn("SessionTransfer.gitOutput")(function* (dir: string, args: readonly string[]) {
  const result = yield* git(dir, args)
  if (result.exitCode !== 0) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "A transfer context is not a healthy Git worktree",
    })
  }
  return result.stdout.toString("utf8").trim()
})

export const identity = Effect.fn("SessionTransfer.identity")(function* (dir: string) {
  if (!path.isAbsolute(dir) || /[\r\n\0]/.test(dir)) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "Transfer contexts require absolute worktree roots",
    })
  }
  const directory = yield* canonical(dir)
  const root = yield* output(directory, ["rev-parse", "--path-format=absolute", "--show-toplevel"])
  if (key(yield* canonical(root)) !== key(directory)) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "A transfer context must be the exact worktree root",
    })
  }
  const common = yield* canonical(yield* output(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]))
  const head = yield* output(directory, ["rev-parse", "--verify", "HEAD"])
  return { directory, common, head }
})

/** Disk/Git authority is independent of remote-derived backend project IDs. */
export const inspect = Effect.fn("SessionTransfer.repository")(function* (input: {
  root: string
  source: string
  target: string
  allowCurrent?: boolean
}) {
  const root = yield* identity(input.root)
  const source = key(input.source) === key(input.root) ? root : yield* identity(input.source)
  const target = key(input.target) === key(input.root) ? root : key(input.target) === key(input.source) ? source : yield* identity(input.target)
  if (key(root.common) !== key(source.common) || key(root.common) !== key(target.common)) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "Transfer contexts must share the same Git repository",
    })
  }
  if (
    (!input.allowCurrent && key(source.directory) === key(target.directory)) ||
    key(root.directory) === key(target.directory)
  ) {
    return yield* new TransferError({ code: "unauthorized", detail: "Choose a different worktree, not Local" })
  }
  const list = yield* output(root.directory, ["worktree", "list", "--porcelain", "-z"])
  const registered = yield* Effect.forEach(list.split("\0\0").filter(Boolean), (entry) =>
    Effect.gen(function* () {
      const fields = entry.split("\0")
      const dir = fields.find((field) => field.startsWith("worktree "))?.slice(9)
      if (!dir || fields.some((field) => field === "bare" || field.startsWith("prunable"))) return undefined
      return yield* canonical(dir).pipe(
        Effect.map(key),
        Effect.catch(() => Effect.succeed(undefined)),
      )
    }),
  )
  if (!registered.includes(key(source.directory)) || !registered.includes(key(target.directory))) {
    return yield* new TransferError({
      code: "unauthorized",
      detail: "A transfer context is no longer a registered worktree",
    })
  }
  return { root, source, target }
})
