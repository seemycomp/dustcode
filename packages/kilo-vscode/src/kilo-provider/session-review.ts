import * as fs from "node:fs"
import * as path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { applyPatch, createTwoFilesPatch, parsePatch, reversePatch } from "diff"
import type { DiffFile } from "../diff/types"

type Dependencies = {
  messages(sessionID: string, directory: string): Promise<unknown[]>
  idle(sessionID: string, directory: string): Promise<boolean>
  dirtyFiles(): string[]
  store?: { read(key: string): unknown; write(key: string, value: unknown): void }
}
type Review = {
  revision: string
  files: Array<
    DiffFile & {
      reviewStatus: "pending"
      rejectable: boolean
      hunks?: Array<{ id: string; oldStart: number; oldLines: number; newStart: number; newLines: number }>
    }
  >
}
type Operation = { id: string; file: string; patch: string; kind: "add" | "update" | "delete" | "unsupported" }
type Checkpoint = { cursor: string[]; pending?: Operation }
type Action = "accept" | "reject" | "accept-all" | "reject-all" | "undo-all"
type Journal = { file: string; checkpoint: Checkpoint; before: Disk; after: string }
type State = {
  key: string
  revision: string
  fingerprint: string
  checkpoints: Map<string, Checkpoint>
  journal?: Journal
}
type Disk = { text: string | null; stamp: string; parents: string; ino?: number; dev?: number }
type Entry = { row: Review["files"][number]; token: string; active: Operation[]; disk?: Disk; before?: string | null }
const limit = 1024 * 1024
const capacity = 16 * limit
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
const text = (value: unknown) => (typeof value === "string" ? value : "")
const digest = (value: string | null) => hash(JSON.stringify(value))
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)

function target(root: string, file: string) {
  if (!file || file.includes("\0")) throw new Error("Unsafe review path")
  const segments = file.replaceAll("\\", "/").split("/")
  if (segments.some((part) => part === ".." || /^\.git$/i.test(part) || /[. ]$/.test(part))) {
    throw new Error("Unsafe review path")
  }
  const absolute = path.resolve(root, file)
  const relative = path.relative(root, absolute)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    relative.includes(":")
  ) {
    throw new Error("Review path outside directory")
  }
  return { absolute, file: relative.replaceAll("\\", "/") }
}

function contents(fd: number) {
  const stat = fs.fstatSync(fd)
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw new Error("Unsafe review file")
  const buffer = Buffer.alloc(stat.size + 1)
  let size = 0
  while (size < buffer.length) {
    const count = fs.readSync(fd, buffer, size, buffer.length - size, size)
    if (!count) break
    size += count
  }
  if (size !== stat.size) throw new Error("Review file changed while reading")
  const value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, size))
  if (value.includes("\0")) throw new Error("Binary review file")
  return { text: value, stat }
}

function inspect(root: string, file: string): Disk {
  const absolute = target(root, file).absolute
  const parents: string[] = []
  let dir = root
  for (const part of ["", ...path.relative(root, path.dirname(absolute)).split(path.sep).filter(Boolean)]) {
    dir = path.join(dir, part)
    const stat = fs.lstatSync(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir) {
      throw new Error("Unsafe review parent")
    }
    parents.push(`${stat.dev}:${stat.ino}`)
  }
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false })
  if (!stat) return { text: null, stamp: "missing", parents: parents.join("/") }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Unsafe review file")
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
  try {
    const current = contents(fd)
    if (stat.dev !== current.stat.dev || stat.ino !== current.stat.ino) throw new Error("Review file replaced")
    return {
      text: current.text,
      stamp: hash(`${stat.dev}:${stat.ino}:${stat.mode}:${current.text}`),
      parents: parents.join("/"),
      ino: stat.ino,
      dev: stat.dev,
    }
  } finally {
    fs.closeSync(fd)
  }
}

function entries(part: Record<string, unknown>, metadata: Record<string, unknown>) {
  if (part.tool === "apply_patch") return Array.isArray(metadata.files) ? metadata.files.map(record) : []
  if (part.tool === "edit" || part.tool === "write") return [record(metadata.filediff)]
  return []
}

function creation(patch: string) {
  try {
    const diffs = parsePatch(patch)
    const diff = diffs.at(0)
    return (
      diffs.length === 1 &&
      diff?.hunks.length === 1 &&
      diff.hunks.every(
        (hunk) =>
          hunk.oldStart === 1 &&
          hunk.oldLines === 0 &&
          hunk.lines.every((line) => line.startsWith("+") || line.startsWith("\\")),
      )
    )
  } catch {
    return false
  }
}

function kind(
  part: Record<string, unknown>,
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>,
  patch: string,
): Operation["kind"] {
  const tool = part.tool
  if (entry.movePath || entry.type === "move") return "unsupported"
  if (tool === "apply_patch") {
    return entry.type === "add" || entry.type === "update" || entry.type === "delete" ? entry.type : "unsupported"
  }
  if (tool === "edit") {
    if (record(record(part.state).input).oldString === "") return creation(patch) ? "add" : "unsupported"
    return creation(patch) ? "unsupported" : "update"
  }
  if (metadata.exists === true) return "update"
  return metadata.exists === false ? "add" : "unsupported"
}

function scoped(sessionID: string, ...ids: unknown[]) {
  return ids.every((id) => id == null || id === sessionID)
}

function running(messages: unknown[], sessionID: string) {
  return messages.map(record).some((message) => {
    const info = record(message.info ?? message)
    if (!scoped(sessionID, info.sessionID, message.sessionID) || !Array.isArray(message.parts)) return false
    return message.parts.map(record).some((part) => {
      const status = record(part.state).status
      return scoped(sessionID, part.sessionID) && part.type === "tool" && (status === "running" || status === "pending")
    })
  })
}

function filename(root: string, entry: Record<string, unknown>) {
  const file = target(root, text(entry.file ?? entry.filePath ?? entry.relativePath)).file
  if (entry.relativePath != null && !entry.movePath && target(root, text(entry.relativePath)).file !== file) {
    throw new Error("Inconsistent review paths")
  }
  return file
}

function operations(messages: unknown[], sessionID: string, root: string) {
  const result: Operation[] = []
  const sorted = messages
    .map(record)
    .sort((a, b) => compare(text(record(a.info).id ?? a.id), text(record(b.info).id ?? b.id)))
  for (const message of sorted) {
    const info = record(message.info ?? message)
    if (info.role !== "assistant" || !scoped(sessionID, info.sessionID, message.sessionID)) continue
    if (!Array.isArray(message.parts)) continue
    const parts = message.parts.map(record).sort((a, b) => compare(text(a.id), text(b.id)))
    for (const part of parts) {
      const state = record(part.state)
      if (part.type !== "tool" || state.status !== "completed" || !scoped(sessionID, part.sessionID)) continue
      const metadata = record(state.metadata)
      for (const [index, entry] of entries(part, metadata).entries()) {
        const patch = text(entry.rawPatch ?? entry.patch)
        if (!patch) continue
        let file: string
        try {
          file = filename(root, entry)
        } catch {
          continue // Unsafe metadata is never exposed as an actionable filesystem path.
        }
        const type = kind(part, entry, metadata, patch)
        const id = hash(JSON.stringify([info.id, part.id, index, file, patch, type]))
        if (!result.some((op) => op.id === id)) result.push({ id, file, patch, kind: type })
      }
    }
  }
  if (result.length > 20000) throw new Error("Session review operation limit reached")
  return result
}

function exact(source: string, inverse: ReturnType<typeof parsePatch>[number]) {
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? []
  let end = 0
  let delta = 0
  for (const hunk of inverse.hunks) {
    const start = hunk.oldStart - 1
    if (!Number.isInteger(start) || start < end || start > lines.length || hunk.newStart !== hunk.oldStart + delta)
      throw new Error("Review hunk position conflict")
    let cursor = start
    let additions = 0
    for (const [index, line] of hunk.lines.entries()) {
      if (line.startsWith("+")) {
        additions++
        continue
      }
      if (line.startsWith("\\")) continue
      if (!line.startsWith(" ") && !line.startsWith("-")) throw new Error("Invalid review hunk")
      if (line.startsWith(" ")) additions++
      const suffix = hunk.lines.at(index + 1)?.startsWith("\\") ? "" : "\n"
      if (lines.at(cursor++) !== line.slice(1) + suffix) throw new Error("Review hunk content conflict")
    }
    if (cursor - start !== hunk.oldLines || additions !== hunk.newLines) throw new Error("Invalid review hunk length")
    end = cursor
    delta += hunk.newLines - hunk.oldLines
  }
}

function rollback(ops: Operation[], current: string | null) {
  let value = current
  for (const op of [...ops].reverse()) {
    if (op.kind === "unsupported" || Buffer.byteLength(op.patch) > limit)
      throw new Error("Unsupported review operation")
    if ((op.kind === "delete") !== (value === null)) throw new Error("Review file existence conflict")
    const patches = parsePatch(op.patch)
    if (patches.length !== 1 || !patches[0]?.hunks.length) throw new Error("Invalid review patch")
    const inverse = reversePatch(patches[0])
    const source = value ?? ""
    exact(source, inverse)
    const result = applyPatch(source, inverse, { fuzzFactor: 0, autoConvertLineEndings: false })
    if (result === false || Buffer.byteLength(result) > limit) throw new Error("Review patch conflict")
    if (op.kind === "add" && result !== "") throw new Error("Created review file contains unrelated content")
    value = op.kind === "add" ? null : result
  }
  return value
}

function delta(file: string, before: string | null, after: string | null, context: number) {
  const patch = createTwoFilesPatch(file, file, text(before), text(after), "", "", { context, timeout: 100 })
  if (patch === undefined || Buffer.byteLength(patch) > limit) throw new Error("Review diff limit reached")
  return patch
}

function portion(source: string, patch: string, index: number, reverse: boolean) {
  const diff = parsePatch(patch).at(0)
  const hunk = diff?.hunks.at(index)
  if (!diff || !hunk) throw new Error("Review hunk not found")
  const selected = reverse ? reversePatch({ ...diff, hunks: [hunk] }) : { ...diff, hunks: [hunk] }
  // A single displayed hunk has no preceding deltas in this application.
  for (const hunk of selected.hunks) hunk.newStart = hunk.oldStart
  exact(source, selected)
  const result = applyPatch(source, selected, { fuzzFactor: 0, autoConvertLineEndings: false })
  if (result === false || Buffer.byteLength(result) > limit) throw new Error("Review hunk conflict")
  return result
}

function counts(patch: string) {
  let additions = 0
  let deletions = 0
  for (const diff of parsePatch(patch))
    for (const hunk of diff.hunks)
      for (const line of hunk.lines) {
        if (line.startsWith("+")) additions++
        if (line.startsWith("-")) deletions++
      }
  return { additions, deletions }
}

function selection(rows: Entry[], action: Action, file?: string, hunk?: string) {
  if (!["accept", "reject", "accept-all", "reject-all", "undo-all"].includes(action))
    throw new Error("Invalid review action")
  const single = action === "accept" || action === "reject"
  if (hunk !== undefined && !single) throw new Error("Hunk requires a single-file decision")
  const selected = rows.filter((item) => !single || item.row.file === file)
  if (single && selected.length !== 1) throw new Error("Review file not found")
  const index = hunk === undefined ? -1 : (selected[0]!.row.hunks?.findIndex((item) => item.id === hunk) ?? -1)
  if (hunk !== undefined && index < 0) throw new Error("Stale or unknown review hunk")
  const accept = action === "accept" || action === "accept-all"
  const exact = !accept || hunk !== undefined
  if (selected.some((item) => !item.disk || (exact && (!item.row.rejectable || item.before === undefined))))
    throw new Error("Review patch conflict or unsafe file")
  return { selected, index, accept }
}

function checkpoint(item: Entry, accept: boolean, index: number): Checkpoint {
  const cursor = item.active.map((op) => op.id)
  if (index < 0) return { cursor }
  const baseline = accept ? portion(text(item.before), item.row.patch!, index, false) : item.before!
  const after = accept ? item.disk!.text : portion(text(item.disk!.text), item.row.patch!, index, true)
  // Only a complete added/deleted file hunk can change existence.
  const before = accept && item.disk!.text === null && baseline === "" ? null : baseline
  const result = !accept && item.before === null && after === "" ? null : after
  if (!accept) item.before = result
  if (before === result) return { cursor }
  const patch = delta(item.row.file, before, result, 0)
  const kind = before === null ? "add" : result === null ? "delete" : "update"
  return { cursor, pending: { id: hash(patch), file: item.row.file, patch, kind } }
}

function residual(active: Operation[], checkpoint?: Checkpoint) {
  const cursor = checkpoint?.cursor ?? []
  if (!cursor.every((id, index) => active.at(index)?.id === id)) throw new Error("Review operation history conflict")
  return [...(checkpoint?.pending ? [checkpoint.pending] : []), ...active.slice(cursor.length)]
}

function retained(root: string, file: string, value: unknown): Checkpoint {
  const entry = record(value)
  if (
    !Array.isArray(entry.cursor) ||
    !entry.cursor.length ||
    entry.cursor.length > 20000 ||
    !entry.cursor.every(identifier)
  )
    throw new Error("Invalid review checkpoint cursor")
  const cursor: string[] = [...entry.cursor]
  if (new Set(cursor).size !== cursor.length) throw new Error("Invalid review checkpoint cursor")
  if (entry.pending === undefined) return { cursor }
  const pending = record(entry.pending)
  if (
    pending.file !== file ||
    !identifier(pending.id) ||
    typeof pending.patch !== "string" ||
    Buffer.byteLength(pending.patch) > limit ||
    pending.id !== hash(pending.patch) ||
    !["add", "update", "delete"].includes(text(pending.kind))
  )
    throw new Error("Invalid review checkpoint patch")
  const patches = parsePatch(pending.patch)
  if (patches.length !== 1 || !patches[0]?.hunks.length) throw new Error("Invalid review checkpoint patch")
  target(root, file)
  return { cursor, pending: { id: pending.id, file, patch: pending.patch, kind: pending.kind as Operation["kind"] } }
}

function restore(root: string, key: string, value: unknown): State {
  const state: State = { key, revision: "", fingerprint: "", checkpoints: new Map() }
  if (value == null) return state
  if (Buffer.byteLength(JSON.stringify(value)) > capacity) throw new Error("Review checkpoint storage limit reached")
  const saved = record(value)
  if (saved.version !== 1 || saved.key !== key || !Array.isArray(saved.checkpoints) || saved.checkpoints.length > 20000)
    throw new Error("Invalid review checkpoint store")
  let count = 0
  for (const pair of saved.checkpoints) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      target(root, pair[0]).file !== pair[0] ||
      state.checkpoints.has(pair[0])
    )
      throw new Error("Invalid review checkpoint file")
    const checkpoint = retained(root, pair[0], pair[1])
    count += checkpoint.cursor.length
    if (count > 20000) throw new Error("Review checkpoint operation limit reached")
    state.checkpoints.set(pair[0], checkpoint)
  }
  if (saved.journal !== undefined) {
    state.journal = journal(root, saved.journal)
    const previous = state.checkpoints.get(state.journal.file)?.cursor.length ?? 0
    if (count - previous + state.journal.checkpoint.cursor.length > 20000)
      throw new Error("Review checkpoint operation limit reached")
  }
  return state
}

function journal(root: string, value: unknown): Journal {
  const entry = record(value)
  const before = record(entry.before)
  if (
    typeof entry.file !== "string" ||
    target(root, entry.file).file !== entry.file ||
    !identifier(entry.after) ||
    !(before.text === null || typeof before.text === "string") ||
    Buffer.byteLength(text(before.text)) > limit ||
    typeof before.parents !== "string" ||
    before.parents.length > 32768 ||
    !(before.stamp === "missing" || identifier(before.stamp))
  )
    throw new Error("Invalid review checkpoint journal")
  if (
    before.text !== null &&
    // Windows file IDs can exceed MAX_SAFE_INTEGER; compare the platform's numeric identity unchanged.
    ![before.ino, before.dev].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0)
  )
    throw new Error("Invalid review checkpoint identity")
  return {
    file: entry.file,
    checkpoint: retained(root, entry.file, entry.checkpoint),
    after: entry.after,
    before: {
      text: before.text,
      stamp: before.stamp,
      parents: before.parents,
      ino: before.ino as number | undefined,
      dev: before.dev as number | undefined,
    },
  }
}

function unchanged(root: string, item: Entry) {
  const disk = inspect(root, item.row.file)
  if (disk.stamp !== item.disk?.stamp || disk.parents !== item.disk?.parents)
    throw new Error("Review file changed before mutation")
}

function mutate(
  root: string,
  selected: Entry[],
  dirty: () => void,
  stage: (item: Entry) => void,
  done: (item: Entry) => void,
) {
  const opened = new Map<string, number>()
  try {
    // Preflight the whole batch before the first write; never yield to the host event loop.
    for (const item of selected) {
      if (item.disk!.text === null) continue
      const fd = fs.openSync(target(root, item.row.file).absolute, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0))
      opened.set(item.row.file, fd)
      const stat = fs.fstatSync(fd)
      if (stat.ino !== item.disk!.ino || stat.dev !== item.disk!.dev || stat.nlink !== 1)
        throw new Error("Review file replaced")
    }
    dirty()
    for (const item of selected) unchanged(root, item)
    for (const item of selected) {
      dirty()
      unchanged(root, item)
      stage(item)
      unchanged(root, item)
      const absolute = target(root, item.row.file).absolute
      if (item.before === null) {
        fs.unlinkSync(absolute)
        done(item)
        continue
      }
      if (item.disk!.text === null) {
        fs.writeFileSync(absolute, item.before!, { flag: "wx" })
        done(item)
        continue
      }
      const fd = opened.get(item.row.file)!
      const current = contents(fd)
      if (
        current.text !== item.disk!.text ||
        current.stat.ino !== item.disk!.ino ||
        current.stat.dev !== item.disk!.dev
      )
        throw new Error("Review descriptor changed")
      const buffer = Buffer.from(item.before!, "utf8")
      let offset = 0
      while (offset < buffer.length) {
        const count = fs.writeSync(fd, buffer, offset, buffer.length - offset, offset)
        if (!count) throw new Error("Review write made no progress")
        offset += count
      }
      fs.ftruncateSync(fd, buffer.length)
      done(item)
    }
  } finally {
    for (const fd of opened.values()) fs.closeSync(fd)
  }
}

/** Checkpoint cursors never evict consumed IDs; an optional atomic store retains them across host reloads. */
export class SessionReview {
  private readonly states = new Map<string, State>()
  private readonly busy = new Set<string>()

  constructor(private readonly deps: Dependencies) {}

  private state(root: string, sessionID: string) {
    const key = hash(JSON.stringify([root, sessionID]))
    const existing = this.states.get(key)
    if (existing) {
      this.reconcile(root, existing)
      return existing
    }
    if (this.states.size >= 128) throw new Error("Session review lifetime limit reached; recreate the host service")
    const state = restore(root, key, this.deps.store?.read(key))
    this.reconcile(root, state)
    this.states.set(key, state)
    return state
  }

  private save(state: State, checkpoints: Map<string, Checkpoint>, journal?: Journal) {
    const value = { version: 1, key: state.key, checkpoints: [...checkpoints], ...(journal ? { journal } : {}) }
    if (Buffer.byteLength(JSON.stringify(value)) > capacity) throw new Error("Review checkpoint storage limit reached")
    this.deps.store?.write(state.key, value)
    state.checkpoints = checkpoints
    state.journal = journal
  }

  private reconcile(root: string, state: State) {
    const journal = state.journal
    if (!journal) return
    const disk = inspect(root, journal.file)
    if (disk.parents !== journal.before.parents) throw new Error("Review checkpoint recovery parent conflict")
    if (disk.stamp === journal.before.stamp) {
      this.save(state, state.checkpoints)
      return
    }
    if (digest(disk.text) !== journal.after) throw new Error("Review checkpoint recovery content conflict")
    if (
      disk.text !== null &&
      journal.before.text !== null &&
      (disk.ino !== journal.before.ino || disk.dev !== journal.before.dev)
    )
      throw new Error("Review checkpoint recovery identity conflict")
    const checkpoints = new Map(state.checkpoints)
    checkpoints.set(journal.file, journal.checkpoint)
    this.save(state, checkpoints)
  }

  private scan(root: string, state: State, ops: Operation[]) {
    const groups = new Map<string, Operation[]>()
    for (const op of ops) {
      const group = groups.get(op.file) ?? []
      group.push(op)
      groups.set(op.file, group)
    }
    for (const file of state.checkpoints.keys()) if (!groups.has(file)) groups.set(file, [])
    const rows: Entry[] = [...groups]
      .map(([file, active]): Entry | undefined => {
        const checkpoint = state.checkpoints.get(file)
        const pending = residual(active, checkpoint)
        if (!pending.length) return undefined
        let disk: Disk | undefined
        let before: string | null | undefined
        let patch = pending.at(-1)?.patch ?? ""
        let safe = false
        let error = ""
        try {
          disk = inspect(root, file)
          before = rollback(pending, disk.text)
          patch = delta(file, before, disk.text, 3)
          safe = true
        } catch (err) {
          error = String(err)
        }
        if (Buffer.byteLength(patch) > limit) patch = ""
        let stats = { additions: 0, deletions: 0 }
        try {
          stats = counts(patch)
        } catch {
          safe = false // Malformed tool patches remain read-only.
        }
        const token = hash(JSON.stringify([active.map((op) => op.id), checkpoint, disk?.stamp, disk?.parents, error]))
        const row: Review["files"][number] = {
          file,
          before: safe ? text(before) : "",
          after: safe ? text(disk?.text) : "",
          patch,
          ...stats,
          status: before === null ? "added" : disk?.text === null ? "deleted" : "modified",
          reviewStatus: "pending",
          rejectable: safe,
          stamp: token,
        }
        if (safe && before === disk?.text) return undefined
        return { row, token, active, disk, before }
      })
      .filter((item): item is Entry => item !== undefined)
    const fingerprint = hash(
      JSON.stringify([ops.map((op) => op.id), rows.map((row) => row.token), [...state.checkpoints]]),
    )
    if (state.fingerprint !== fingerprint) {
      state.fingerprint = fingerprint
      state.revision = randomUUID()
    }
    for (const item of rows) {
      if (!item.row.rejectable) continue
      item.row.hunks = parsePatch(item.row.patch!).flatMap((diff) =>
        diff.hunks.map((hunk) => ({
          id: hash(JSON.stringify([state.revision, item.row.file, hunk])),
          oldStart: hunk.oldStart,
          oldLines: hunk.oldLines,
          newStart: hunk.newStart,
          newLines: hunk.newLines,
        })),
      )
    }
    return { rows, view: { revision: state.revision, files: rows.map((item) => item.row) } }
  }

  async load(sessionID: string, directory: string): Promise<Review> {
    const root = fs.realpathSync(directory)
    if (this.busy.has(root)) throw new Error("Session review busy")
    this.busy.add(root)
    try {
      const messages = await this.deps.messages(sessionID, root)
      return this.scan(root, this.state(root, sessionID), operations(messages, sessionID, root)).view
    } finally {
      this.busy.delete(root)
    }
  }

  private async prepare(sessionID: string, root: string) {
    const messages = await this.deps.messages(sessionID, root)
    if (!(await this.deps.idle(sessionID, root))) throw new Error("Session must be idle for review decisions")
    const ops = operations(messages, sessionID, root)
    const final = await this.deps.messages(sessionID, root)
    const idle = await this.deps.idle(sessionID, root)
    if (!idle || running(final, sessionID)) throw new Error("Session must be idle for review decisions")
    const latest = operations(final, sessionID, root)
    if (JSON.stringify(ops) !== JSON.stringify(latest)) throw new Error("Stale session review operations")
    return latest
  }

  async decide(
    sessionID: string,
    directory: string,
    revision: string,
    action: Action,
    file?: string,
    hunk?: string,
  ): Promise<Review> {
    const root = fs.realpathSync(directory)
    if (this.busy.has(root)) throw new Error("Session review busy")
    this.busy.add(root)
    try {
      const state = this.state(root, sessionID)
      const ops = await this.prepare(sessionID, root)
      const current = this.scan(root, state, ops)
      if (!revision || current.view.revision !== revision) throw new Error("Stale session review revision")
      const { selected, index, accept } = selection(current.rows, action, file, hunk)
      const dirty = () => {
        const documents = this.deps.dirtyFiles().map((name) => path.resolve(root, name).toLowerCase())
        if (selected.some((item) => documents.includes(path.resolve(root, item.row.file).toLowerCase())))
          throw new Error("Review file has dirty documents")
      }
      dirty()
      const count = [...state.checkpoints].reduce(
        (count, [file, checkpoint]) =>
          count + (selected.some((item) => item.row.file === file) ? 0 : checkpoint.cursor.length),
        0,
      )
      if (count + selected.reduce((count, item) => count + item.active.length, 0) > 20000)
        throw new Error("Session review lifetime operation limit reached")
      const checkpoints = new Map<string, Checkpoint>()
      for (const item of selected) checkpoints.set(item.row.file, checkpoint(item, accept, index))
      if (!accept)
        mutate(
          root,
          selected,
          dirty,
          (item) =>
            this.save(state, state.checkpoints, {
              file: item.row.file,
              checkpoint: checkpoints.get(item.row.file)!,
              before: item.disk!,
              after: digest(item.before!),
            }),
          (item) => {
            const next = new Map(state.checkpoints)
            next.set(item.row.file, checkpoints.get(item.row.file)!)
            this.save(state, next)
          },
        )
      if (accept) {
        dirty()
        for (const item of selected) unchanged(root, item)
        this.save(state, new Map([...state.checkpoints, ...checkpoints]))
      }
      return this.scan(root, state, ops).view
    } finally {
      this.busy.delete(root)
    }
  }
}
