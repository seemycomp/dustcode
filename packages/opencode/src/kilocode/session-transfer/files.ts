import { createHash, randomUUID } from "node:crypto"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { TransferError, git } from "./repository"

const MAX = 32 * 1024 * 1024
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex")
const missing = (err: unknown) => err instanceof Error && "code" in err && err.code === "ENOENT"

export class FileConflict extends Schema.TaggedErrorClass<FileConflict>()("SessionTransferFileConflict", {
  paths: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Target paths are already dirty: ${this.paths.join(", ")}`
  }
}

export type Change = { path: string; kind: "modified" | "added" | "deleted"; sourceHash: string }
export type Capture = {
  source: string
  head: string
  index: string
  patch: string
  files: Change[]
  fingerprint: string
}
export type Image = { hash: string; bytes: string; mode: number } | null
export type Journal = {
  target: string
  head: string
  index: string
  paths: Array<{ path: string; before: Image; after: Image }>
  directories: string[]
}

const io = <A>(work: () => Promise<A>, detail: string) =>
  Effect.tryPromise({
    try: work,
    catch: (err) => (err instanceof TransferError ? err : new TransferError({ code: "unsupported", detail })),
  })

const paths = (files: readonly string[]) => {
  const result = [...new Set(files)].sort()
  for (const file of result) {
    const parts = file.split("/")
    if (
      !file ||
      path.isAbsolute(file) ||
      /[\\:\0\r\n]/.test(file) ||
      parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git" || (process.platform === "win32" && (/[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))))
    ) {
      throw new TransferError({
        code: "unauthorized",
        detail: "Selected paths must be literal files inside the worktree",
        paths: [file],
      })
    }
  }
  if (
    new Set(result.map((file) => (process.platform === "win32" ? file.toLowerCase() : file))).size !== result.length
  ) {
    throw new TransferError({ code: "unsupported", detail: "Selected paths have conflicting case" })
  }
  return result
}

/** Reject every existing symlink/junction ancestor, not just the final file. */
async function image(root: string, file: string): Promise<Image> {
  paths([file])
  const parts = file.split("/")
  for (const [index, part] of parts.entries()) {
    const names = await readdir(path.join(root, ...parts.slice(0, index))).catch((err: unknown) => {
      if (missing(err)) return []
      throw err
    })
    if (names.some((name) => name !== part && name.normalize("NFC").toLowerCase() === part.normalize("NFC").toLowerCase())) {
      throw new TransferError({ code: "unsupported", detail: "Selected paths alias differently cased or normalized worktree entries", paths: [file] })
    }
    const name = path.join(root, ...parts.slice(0, index), part)
    const stat = await lstat(name).catch((err: unknown) => {
      if (missing(err)) return undefined
      throw err
    })
    if (!stat) return null
    if (
      stat.isSymbolicLink() ||
      (index < parts.length - 1 && !stat.isDirectory()) ||
      (index === parts.length - 1 && !stat.isFile())
    ) {
      throw new TransferError({
        code: "unsupported",
        detail: "Symlinks, special files and directory obstructions cannot be transferred",
        paths: [file],
      })
    }
    if (index < parts.length - 1) continue
    if (stat.nlink !== 1) throw new TransferError({ code: "unsupported", detail: "Hard-linked selected files cannot be transferred", paths: [file] })
    if (stat.size > MAX)
      throw new TransferError({
        code: "unsupported",
        detail: "Selected file exceeds the transfer size limit",
        paths: [file],
      })
    const bytes = await readFile(name)
    return { hash: hash(bytes), bytes: bytes.toString("base64"), mode: stat.mode & 0o777 }
  }
  return null
}

const output = Effect.fn("SessionTransfer.fileOutput")(function* (
  dir: string,
  args: readonly string[],
  stdin?: string,
  env?: Record<string, string>,
  diff = false,
) {
  const result = yield* git(dir, args, stdin, env)
  if (result.exitCode !== 0 && !(diff && result.exitCode === 1))
    return yield* new TransferError({
      code: "unsupported",
      detail: result.stderr.toString("utf8").trim() || "Git file operation failed",
    })
  return result.stdout
})

const state = Effect.fn("SessionTransfer.fileState")(function* (dir: string) {
  const head = (yield* output(dir, ["rev-parse", "--verify", "HEAD"])).toString().trim()
  const entries = yield* output(dir, ["ls-files", "--stage", "-z"])
  return { head, index: hash(entries) }
})

/** Capture HEAD-to-working-tree once; staging state never becomes a second patch. */
export const capture = Effect.fn("SessionTransfer.captureFiles")(function* (input: {
  source: string
  files: readonly string[]
}) {
  const source = yield* io(() => realpath(input.source), "Source worktree is unavailable")
  const files = yield* Effect.try({ try: () => paths(input.files), catch: (err) => err as TransferError })
  const before = yield* state(source)
  if ((yield* output(source, ["ls-files", "--unmerged", "-z"])).length) return yield* new TransferError({ code: "unsupported", detail: "Resolve source merge conflicts before copying selected files" })
  if (!files.length)
    return { source, ...before, patch: "", files: [], fingerprint: hash(JSON.stringify(before)) } satisfies Capture
  const stages = (yield* output(source, ["ls-files", "--stage", "-z", "--", ...files]))
    .toString()
    .split("\0")
    .filter(Boolean)
  for (const row of stages) {
    if (!/^100(?:644|755) [0-9a-f]+ 0\t/.test(row))
      return yield* new TransferError({
        code: "unsupported",
        detail: "Conflicted, submodule or special-file entries cannot be transferred",
      })
  }
  const untracked = (yield* output(source, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...files]))
    .toString()
    .split("\0")
    .filter(Boolean)
  const changed = (yield* output(source, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--name-only",
    "-z",
    "HEAD",
    "--",
    ...files,
  ]))
    .toString()
    .split("\0")
    .filter(Boolean)
  const active = new Set([...changed, ...untracked])
  const selected = files.filter((file) => active.has(file))
  if (active.size !== selected.length)
    return yield* new TransferError({
      code: "unsupported",
      detail: "Select individual changed files, not directory prefixes",
    })
  const entries: Change[] = []
  let size = 0
  for (const file of selected) {
    const value = yield* io(() => image(source, file), "Cannot capture selected source path")
    size += value?.bytes.length ?? 0
    if (size > MAX)
      return yield* new TransferError({
        code: "unsupported",
        detail: "Selected changes exceed the transfer size limit",
      })
    entries.push({
      path: file,
      kind: value == null ? "deleted" : untracked.includes(file) ? "added" : "modified",
      sourceHash: value?.hash ?? "missing",
    })
  }
  const patch = selected.length
    ? (yield* output(source, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--binary",
        "--full-index",
        "HEAD",
        "--",
        ...selected,
      ])).toString()
    : ""
  const extras = yield* Effect.forEach(untracked, (file) =>
    output(
      source,
      [
        "diff",
        "--no-ext-diff",
        "--binary",
        "--no-index",
        "--",
        process.platform === "win32" ? "NUL" : "/dev/null",
        file,
      ],
      undefined,
      undefined,
      true,
    ).pipe(Effect.map((data) => data.toString())),
  )
  const body = [patch, ...extras].join("")
  if (Buffer.byteLength(body) > MAX)
    return yield* new TransferError({ code: "unsupported", detail: "Selected patch exceeds the transfer size limit" })
  const after = yield* state(source)
  if (JSON.stringify(before) !== JSON.stringify(after))
    return yield* new TransferError({ code: "stale", detail: "The source HEAD or index changed during capture" })
  for (const file of entries) {
    const value = yield* io(() => image(source, file.path), "Cannot revalidate source path")
    if ((value?.hash ?? "missing") !== file.sourceHash)
      return yield* new TransferError({
        code: "stale",
        detail: "Selected source bytes changed during capture",
        paths: [file.path],
      })
  }
  return {
    source,
    ...after,
    patch: body,
    files: entries,
    fingerprint: hash(JSON.stringify({ ...after, entries, body })),
  } satisfies Capture
})

export const checkTarget = Effect.fn("SessionTransfer.checkTargetFiles")(function* (input: {
  target: string
  files: readonly string[]
}) {
  const target = yield* io(() => realpath(input.target), "Target worktree is unavailable")
  if ((yield* output(target, ["ls-files", "--unmerged", "-z"])).length) return yield* new TransferError({ code: "unsupported", detail: "Resolve target merge conflicts before copying selected files" })
  const files = yield* Effect.try({ try: () => paths(input.files), catch: (err) => err as TransferError })
  for (const file of files) yield* io(() => image(target, file), "Cannot inspect target path")
  if (files.length) {
    const status = (yield* output(target, [
      "status",
      "--porcelain=v1",
      "--ignored=matching",
      "-z",
      "--",
      ...files,
    ])).toString()
    if (status) return yield* new FileConflict({ paths: files })
  }
  return { target, files, ...(yield* state(target)) }
})

/** Stage into an isolated index to compute postimages without touching target files/index. */
export const prepare = Effect.fn("SessionTransfer.prepareFiles")(function* (input: {
  target: string
  capture: Capture
}) {
  const target = yield* checkTarget({ target: input.target, files: input.capture.files.map((file) => file.path) })
  const dir = yield* Effect.acquireRelease(
    io(() => mkdtemp(path.join(tmpdir(), "dustcode-transfer-")), "Cannot prepare transfer storage"),
    (dir) =>
      io(() => rm(dir, { recursive: true, force: true }), "Cannot remove transfer staging storage").pipe(Effect.orDie),
  )
  const env = { GIT_INDEX_FILE: path.join(dir, "index") }
  yield* output(target.target, ["read-tree", "HEAD"], undefined, env)
  if (input.capture.patch) {
    yield* output(target.target, ["apply", "--cached", "--check", "--whitespace=nowarn", "-"], input.capture.patch, env)
    yield* output(target.target, ["apply", "--cached", "--whitespace=nowarn", "-"], input.capture.patch, env)
  }
  const journal: Journal = { target: target.target, head: target.head, index: target.index, paths: [], directories: [] }
  for (const file of target.files) {
    const before = yield* io(() => image(target.target, file), "Cannot capture target preimage")
    const entry = (yield* output(target.target, ["ls-files", "--stage", "-z", "--", file], undefined, env))
      .toString()
      .split("\0")
      .filter(Boolean)
    const row = entry.at(0)
    if (row && (entry.length !== 1 || !/^100(?:644|755) [0-9a-f]+ 0\t/.test(row)))
      return yield* new TransferError({ code: "unsupported", detail: "Unsupported target mode", paths: [file] })
    const mode = row ? Number.parseInt(row.slice(0, 6), 8) & 0o777 : 0
    if (before && row && process.platform !== "win32" && mode !== before.mode)
      return yield* new TransferError({
        code: "unsupported",
        detail: "Executable-bit changes are not supported",
        paths: [file],
      })
    const data = row
      ? yield* output(target.target, ["cat-file", "blob", row.split(" ").at(1)!], undefined, env)
      : undefined
    const after: Image = data ? { bytes: data.toString("base64"), hash: hash(data), mode: before?.mode ?? mode } : null
    journal.paths.push({ path: file, before, after })
    for (let parent = path.posix.dirname(file); parent !== "."; parent = path.posix.dirname(parent)) {
      const exists = yield* io(
        () =>
          lstat(path.join(target.target, parent))
            .then(() => true)
            .catch((err: unknown) => {
              if (missing(err)) return false
              throw err
            }),
        "Cannot inspect target directories",
      )
      if (!exists && !journal.directories.includes(parent)) journal.directories.push(parent)
    }
  }
  const after = yield* state(target.target)
  if (after.head !== target.head || after.index !== target.index)
    return yield* new TransferError({ code: "stale", detail: "The target HEAD or index changed during preview" })
  return journal
})

const equal = (left: Image, right: Image) =>
  left?.hash === right?.hash && (process.platform === "win32" || left?.mode === right?.mode)
const put = async (root: string, file: string, value: Image) => {
  if (value == null) return rm(path.join(root, file), { force: true })
  await mkdir(path.dirname(path.join(root, file)), { recursive: true })
  const temp = path.join(path.dirname(path.join(root, file)), `.dustcode-transfer-${randomUUID()}`)
  try {
    await writeFile(temp, Buffer.from(value.bytes, "base64"), { flag: "wx" })
    if (process.platform !== "win32") await chmod(temp, value.mode)
    await rename(temp, path.join(root, file))
  } finally {
    await rm(temp, { force: true })
  }
}

/** Caller durably persists the journal before invoking this function. */
export const write = Effect.fn("SessionTransfer.writeFiles")(function* (journal: Journal) {
  const current = yield* state(journal.target)
  if (current.head !== journal.head || current.index !== journal.index)
    return yield* new TransferError({ code: "stale", detail: "The target HEAD or index changed before transfer" })
  for (const file of journal.paths) {
    if (!equal(yield* io(() => image(journal.target, file.path), "Cannot revalidate target preimage"), file.before))
      return yield* new TransferError({
        code: "conflict",
        detail: "Target bytes changed after preview",
        paths: [file.path],
      })
  }
  for (const file of journal.paths)
    yield* io(() => put(journal.target, file.path, file.after), "Unable to apply selected files; recovery is required").pipe(Effect.uninterruptible)
})

export const verify = Effect.fn("SessionTransfer.verifyFiles")(function* (journal: Journal) {
  const current = yield* state(journal.target)
  const paths: string[] = []
  if (current.head !== journal.head || current.index !== journal.index)
    return yield* new TransferError({ code: "stale", detail: "The target HEAD or index changed during transfer" })
  for (const file of journal.paths) {
    if (!equal(yield* io(() => image(journal.target, file.path), "Cannot verify target postimage"), file.after))
      paths.push(file.path)
  }
  if (paths.length)
    return yield* new TransferError({ code: "stale", detail: "Selected target bytes changed during transfer", paths })
})

/** Idempotent compare-and-restore. Never overwrite an edit made after transfer. */
export const restore = Effect.fn("SessionTransfer.restoreFiles")(function* (journal: Journal) {
  const current = yield* state(journal.target)
  if (current.head !== journal.head || current.index !== journal.index) return yield* new TransferError({ code: "recovery", detail: "The target HEAD or staging changed after application; recovery bytes were retained", paths: journal.paths.map((file) => file.path) })
  const conflicts: string[] = []
  for (const file of journal.paths.toReversed()) {
    const current = yield* io(() => image(journal.target, file.path), "Cannot inspect recovery path")
    if (equal(current, file.before)) continue
    if (!equal(current, file.after)) {
      conflicts.push(file.path)
      continue
    }
    yield* io(() => put(journal.target, file.path, file.before), "Cannot restore transfer preimage").pipe(Effect.uninterruptible)
  }
  for (const dir of journal.directories.toSorted((a, b) => b.length - a.length)) {
    yield* io(
      () =>
        rmdir(path.join(journal.target, dir)).catch((err: unknown) => {
          if (missing(err) || (err instanceof Error && "code" in err && err.code === "ENOTEMPTY")) return
          throw err
        }),
      "Cannot restore transfer-created directory",
    )
  }
  if (conflicts.length)
    return yield* new TransferError({
      code: "recovery",
      detail: "Some target paths changed after transfer and were left untouched",
      paths: conflicts,
    })
})

export const apply = Effect.fn("SessionTransfer.applyFiles")(function* (input: { target: string; capture: Capture }) {
  const journal = yield* prepare(input)
  yield* write(journal)
  return journal
})
