import * as fs from "fs"
import type { Session } from "@kilocode/sdk/v2/client"
import type { HistoryMessage, HistoryOpen, HistoryRequest, HistoryRow } from "../shared/agent-history"
import type { SessionProvider } from "./host"
import type { ProjectContext, ProjectInitResult } from "./project/context"
import type { ProjectContexts } from "./project/contexts"
import type { SessionPage } from "../kilo-provider/session-page"
import { pathKey, samePath } from "./project/paths"
import { resolvePlacement } from "./project/placement"
import { Semaphore } from "./semaphore"

type Metadata = HistoryRow & { directory: string }
type Mutation = { revision: number; info?: Metadata; deleted?: boolean }
type Assigned = { id: string; info?: Session; error?: string }
type Entry = {
  key: string
  ctx: ProjectContext
  directory: string
  version: number
  backend: number
  generation: number
  request: HistoryRequest
  active: boolean
  fresh: number
  loaded: boolean
  replacing: boolean
  rows: HistoryRow[]
  candidates: Map<string, Metadata>
  checked: Set<string>
  changes: Map<string, Mutation>
  cursor?: number
  cursorID?: string
  tail?: Metadata
  more: boolean
  pending?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  scan?: boolean
  raw?: boolean
  abort: AbortController
  error?: string
  retry?: boolean
}

type Deps = {
  contexts: Pick<ProjectContexts, "resolve" | "values">
  ready: (ctx: ProjectContext, opts?: { warm?: boolean }) => Promise<ProjectInitResult>
  sessions: () => Pick<SessionProvider, "listSessionPage" | "getSessionInfo"> | undefined
  post: (message: HistoryMessage) => void
  exists?: (directory: string) => boolean
  now?: () => number
}

function order(a: HistoryRow, b: HistoryRow): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
}

function metadata(info: Session): Metadata {
  return {
    id: info.id,
    title: info.title,
    updatedAt: new Date(info.time.updated).toISOString(),
    directory: info.directory,
  }
}

// Match the backend's SQLite LIKE title filter, including its % and _ wildcards.
function matches(title: string, query: string): boolean {
  const fold = (value: string) => value.replace(/[A-Z]/g, (char) => char.toLowerCase())
  const pattern = fold(query)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".")
  return new RegExp(pattern, "su").test(fold(title))
}

function mutation(entry: Entry, id: string, info: Session | undefined, deleted: boolean, revision: number): Mutation {
  if (deleted) return { revision, deleted: true }
  const known =
    entry.candidates.has(id) ||
    entry.rows.some((row) => row.id === id) ||
    entry.ctx.sessions().some((view) => view.id === id && view.parentID === null)
  const root = info && info.time && (info.parentID === null || (info.parentID === undefined && known))
  return { revision, info: root && info.directory ? metadata(info) : undefined }
}

/** Metadata-only history, isolated from live tabs, transcripts, and managed membership. */
export class AgentHistory {
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Map<ProjectContext, () => void>()
  private readonly intents = new Map<string, { projectId: string; token: symbol }>()
  private readonly deleted = new Set<string>()
  private readonly gate = new Semaphore(2)
  private backend = 0
  private generation = 0
  private revision = 0
  private epoch = 0
  private disposed = false

  constructor(private readonly deps: Deps) {}

  async request(request: HistoryRequest): Promise<void> {
    if (this.disposed) return
    const scope = JSON.stringify([request.projectId, request.worktreeId])
    const token = Symbol()
    this.intents.set(scope, { projectId: request.projectId, token })
    this.prune()
    const ctx = this.deps.contexts.resolve(request.projectId)
    if (!ctx) return this.failure(request, "The project is unavailable.")
    if (request.active === false) {
      for (const entry of this.entries.values()) {
        if (entry.ctx !== ctx || entry.request.worktreeId !== request.worktreeId) continue
        this.stop(entry)
      }
      return
    }
    const result = await this.deps.ready(ctx, { warm: false })
    if (this.intents.get(scope)?.token !== token) return
    if (!result.current || !result.ok || this.disposed) return this.failure(request, "The project is not ready.")
    const directory = this.directory(ctx, request.worktreeId)
    if (!directory) return this.failure(request, "The history context is unavailable.")
    this.listen(ctx)
    return this.load(this.entry(ctx, directory, request))
  }

  private entry(ctx: ProjectContext, directory: string, request: HistoryRequest): Entry {
    const key = JSON.stringify([ctx.id, request.worktreeId, pathKey(directory), request.query, this.backend])
    for (const entry of this.entries.values()) {
      if (entry.ctx !== ctx || entry.request.worktreeId !== request.worktreeId || entry.key === key) continue
      this.stop(entry)
      if (entry.request.query) this.entries.delete(entry.key)
    }
    const cached = this.entries.get(key)
    const entry = cached ?? this.create(key, ctx, directory, request)
    this.entries.set(key, entry)
    entry.request = request
    entry.active = true
    return entry
  }

  private load(entry: Entry): Promise<void> | undefined {
    const request = entry.request
    if (entry.abort.signal.aborted) entry.abort = new AbortController()
    const loading = entry.pending || (entry.timer && entry.scan)
    if (loading && !request.refresh) {
      this.post(entry, true)
      return entry.pending
    }
    const stale = this.now() - entry.fresh > 30_000
    if (request.refresh || entry.version !== entry.ctx.generation || (!request.more && entry.loaded && stale))
      this.reset(entry)
    this.post(entry, !entry.loaded || entry.replacing)
    if (!request.more && entry.loaded && !entry.replacing && !stale && !entry.error) return
    if (request.more && !entry.more && this.missing(entry).length === 0) return
    return this.turn(entry)
  }

  /** A lifecycle boundary, not a streamed message-part listener. */
  event(event: unknown): void {
    if (this.disposed) return
    const ev = event as { type?: string; properties?: { info?: Session; sessionID?: string } }
    if (!["session.created", "session.updated", "session.deleted"].includes(ev.type ?? "")) return
    const info = ev.properties?.info
    const id = info?.id ?? ev.properties?.sessionID
    if (!id) return
    if (ev.type === "session.deleted") this.deleted.add(id)
    if (ev.type === "session.created") this.deleted.delete(id)
    const revision = ++this.revision
    for (const entry of this.entries.values()) {
      const change = mutation(entry, id, info, ev.type === "session.deleted", revision)
      entry.changes.set(id, change)
      entry.candidates.delete(id)
      if (change.info) entry.candidates.set(id, change.info)
      const placed = change.info && resolvePlacement(entry.ctx, id, change.info.directory)
      entry.rows = entry.rows.flatMap((row) => {
        if (row.id !== id) return [row]
        if (
          !change.info ||
          placed?.worktreeId !== entry.request.worktreeId ||
          !matches(change.info.title, entry.request.query)
        )
          return []
        return [{ id, title: change.info.title, updatedAt: change.info.updatedAt }]
      })
      this.project(entry)
      this.schedule(entry, false)
    }
  }

  /** A reconnect invalidates cursors even if the same directory is still selected. */
  reconnect(): void {
    this.backend++
    this.deleted.clear()
    const entries = [...this.entries.values()]
    this.entries.clear()
    for (const entry of entries) {
      entry.backend = this.backend
      entry.key = JSON.stringify([
        entry.ctx.id,
        entry.request.worktreeId,
        pathKey(entry.directory),
        entry.request.query,
        this.backend,
      ])
      this.reset(entry)
      entry.fresh = 0
      this.entries.set(entry.key, entry)
      this.schedule(entry, true)
    }
  }

  /** Panel closure stops sparse scans; metadata caches can be reused on reopen. */
  pause(): void {
    this.epoch++
    this.intents.clear()
    for (const entry of this.entries.values()) this.stop(entry)
  }

  pauseProject(id: string): void {
    for (const [scope, intent] of this.intents) {
      if (intent.projectId === id) this.intents.delete(scope)
    }
    for (const entry of this.entries.values()) {
      if (entry.ctx.id === id) this.stop(entry)
    }
    this.prune()
  }

  /** Fresh metadata proves root status/existence; placement, never global lookup, authorizes ownership. */
  async validate(request: HistoryOpen): Promise<{ ctx: ProjectContext; info: Session; directory: string }> {
    const ctx = this.deps.contexts.resolve(request.projectId)
    if (!ctx) throw new Error("The project is unavailable.")
    const result = await this.deps.ready(ctx, { warm: false })
    if (!result.ok || !result.current || this.disposed) throw new Error("The project is not ready.")
    const version = ctx.generation
    const backend = this.backend
    const epoch = this.epoch
    const directory = this.directory(ctx, request.worktreeId)
    if (!directory || !this.healthy(ctx, request.worktreeId, directory))
      throw new Error(
        "The history context is missing or stale. Restore or refresh it before opening this conversation.",
      )
    const source = this.deps.sessions()
    const info = await this.gate.run(async () => {
      if (epoch !== this.epoch || this.disposed) return
      return source?.getSessionInfo?.(request.sessionId, directory)
    })
    if (!ctx.isCurrent(version) || backend !== this.backend || epoch !== this.epoch || this.disposed)
      throw new Error("The project changed while opening this conversation.")
    if (
      this.deleted.has(request.sessionId) ||
      !info ||
      info.id !== request.sessionId ||
      !info.time ||
      info.parentID != null
    )
      throw new Error("This root conversation is no longer available.")
    const placement = resolvePlacement(ctx, info.id, info.directory)
    if (!placement || placement.worktreeId !== request.worktreeId || !samePath(placement.directory, directory))
      throw new Error("This conversation does not belong to the requested project and context.")
    if (!this.healthy(ctx, request.worktreeId, directory)) throw new Error("The history context is missing or stale.")
    return { ctx, info, directory }
  }

  dispose(): void {
    this.disposed = true
    this.pause()
    this.entries.clear()
    for (const dispose of this.listeners.values()) dispose()
    this.listeners.clear()
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private directory(ctx: ProjectContext, id: string | null): string | undefined {
    return id === null ? ctx.root : ctx.peekState()?.getWorktree(id)?.path || undefined
  }

  private healthy(ctx: ProjectContext, id: string | null, directory: string): boolean {
    if (ctx.missing() || !(this.deps.exists ?? fs.existsSync)(directory)) return false
    if (id === null) return true
    const health = ctx.report?.entries.find((entry) => entry.id === id)?.health
    return !ctx.stale.has(id) && health !== "absent-restorable" && health !== "absent-gone" && health !== "unregistered"
  }

  private create(key: string, ctx: ProjectContext, directory: string, request: HistoryRequest): Entry {
    return {
      key,
      ctx,
      directory,
      request,
      version: ctx.generation,
      backend: this.backend,
      generation: ++this.generation,
      active: true,
      fresh: 0,
      loaded: false,
      replacing: true,
      rows: [],
      candidates: new Map(),
      checked: new Set(),
      changes: new Map(),
      more: true,
      abort: new AbortController(),
    }
  }

  private reset(entry: Entry): void {
    entry.abort.abort()
    entry.abort = new AbortController()
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = undefined
    entry.scan = false
    entry.raw = false
    entry.pending = undefined
    entry.generation = ++this.generation
    entry.version = entry.ctx.generation
    entry.candidates.clear()
    entry.checked.clear()
    entry.changes.clear()
    entry.cursor = undefined
    entry.cursorID = undefined
    entry.tail = undefined
    entry.more = true
    entry.replacing = true
    entry.error = undefined
    entry.retry = undefined
  }

  private stop(entry: Entry): void {
    entry.active = false
    entry.abort.abort()
    entry.pending = undefined
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = undefined
    entry.scan = false
    entry.raw = false
  }

  private current(entry: Entry, generation = entry.generation): boolean {
    return (
      !this.disposed &&
      entry.active &&
      this.entries.get(entry.key) === entry &&
      entry.generation === generation &&
      entry.backend === this.backend &&
      entry.ctx.isCurrent(entry.version)
    )
  }

  private missing(entry: Entry): string[] {
    const placements = entry.ctx.peekState()?.sessionPlacements() ?? new Map<string, string | null>()
    const views = new Map(entry.ctx.sessions().map((view) => [view.id, view]))
    const rows = new Map(entry.rows.map((row) => [row.id, row]))
    const missing: string[] = []
    for (const [id, placement] of placements) {
      if (placement !== entry.request.worktreeId || entry.checked.has(id) || entry.changes.has(id)) continue
      const view = views.get(id)
      // Cached views seed display, but do not validate an assignment for this generation.
      const row =
        rows.get(id) ??
        (view?.parentID === null ? { id, title: view.title ?? "", updatedAt: view.updatedAt } : undefined)
      if (row && !entry.candidates.has(id)) entry.candidates.set(id, { ...row, directory: entry.directory })
      missing.push(id)
    }
    return missing
  }

  private assigned(
    entry: Entry,
    ids: string[],
    source: Pick<SessionProvider, "getSessionInfo"> | undefined,
    generation: number,
    signal: AbortSignal,
  ): Promise<Assigned[]> {
    return Promise.all(
      ids.map((id) =>
        this.gate
          .run(async () => {
            if (!this.current(entry, generation) || signal.aborted) return
            if (!source?.getSessionInfo) throw new Error("Assigned history metadata is unavailable.")
            return source.getSessionInfo(id, entry.directory)
          }, signal)
          .then((info) => ({ id, info }))
          .catch((err: unknown) => ({
            id,
            error: err instanceof Error ? err.message : "Could not load history metadata.",
          })),
      ),
    )
  }

  private page(
    entry: Entry,
    source: Pick<SessionProvider, "listSessionPage"> | undefined,
    generation: number,
    signal: AbortSignal,
  ): Promise<SessionPage | undefined> {
    return this.gate.run(async () => {
      if (!this.current(entry, generation) || signal.aborted) return
      if (!source?.listSessionPage) throw new Error("History metadata is unavailable.")
      return source.listSessionPage({
        directory: entry.directory,
        cursor: entry.cursor,
        cursorID: entry.cursorID,
        limit: 30,
        search: entry.request.query || undefined,
      })
    }, signal)
  }

  private applyAssigned(entry: Entry, fetched: Assigned[], revision: number): string | undefined {
    for (const result of fetched) {
      if (result.error) continue
      entry.checked.add(result.id)
      const change = entry.changes.get(result.id)
      if (change && change.revision > revision) continue
      entry.candidates.delete(result.id)
      if (result.info?.time && result.info.parentID == null) this.merge(entry, metadata(result.info), revision)
    }
    return fetched.find((result) => result.error)?.error
  }

  private apply(
    entry: Entry,
    page: SessionPage | undefined,
    fetched: Assigned[],
    revision: number,
    replacing: boolean,
    before: string,
  ): void {
    if (page) {
      entry.tail = page.sessions.at(-1) ? metadata(page.sessions.at(-1)!) : entry.tail
      entry.cursor = page.cursor
      entry.cursorID = page.nextCursorID
      entry.more = page.cursor !== undefined
      for (const info of page.sessions) {
        if (info.parentID != null) continue
        entry.checked.add(info.id)
        this.merge(entry, metadata(info), revision)
      }
    }
    const error = this.applyAssigned(entry, fetched, revision)
    entry.loaded = true
    entry.fresh = this.now()
    entry.error = error
    entry.retry = error ? false : undefined
    this.project(entry)
    const missing = this.missing(entry).length > 0
    const sparse =
      Boolean(page) &&
      entry.more &&
      (replacing ? entry.replacing : entry.rows.map((row) => row.id).join("\0") === before)
    this.post(entry, error ? false : missing || sparse)
    if (!error && (missing || sparse)) this.schedule(entry, true, sparse)
  }

  private async turn(entry: Entry, raw = entry.retry ?? true): Promise<void> {
    if (!this.current(entry) || entry.pending) return entry.pending
    const generation = entry.generation
    const revision = this.revision
    const signal = entry.abort.signal
    const source = this.deps.sessions()
    const replacing = entry.replacing
    const before = entry.rows.map((row) => row.id).join("\0")
    this.post(entry, true)
    const run = async () => {
      const assigned = this.missing(entry)
      const results = await Promise.all([
        entry.more && raw ? this.page(entry, source, generation, signal) : undefined,
        assigned.length ? this.assigned(entry, assigned, source, generation, signal) : [],
      ])
      if (!this.current(entry, generation) || signal.aborted) return
      this.apply(entry, results[0], results[1], revision, replacing, before)
    }
    const pending = run()
      .catch((err: unknown) => {
        if (!this.current(entry, generation) || signal.aborted) return
        entry.error = err instanceof Error ? err.message : "Could not load history."
        entry.retry = raw
        this.post(entry, false)
      })
      .finally(() => {
        if (entry.pending === pending) entry.pending = undefined
      })
    entry.pending = pending
    return pending
  }

  private merge(entry: Entry, info: Metadata, revision: number): void {
    const change = entry.changes.get(info.id)
    if (change && change.revision > revision) return
    entry.candidates.set(info.id, info)
  }

  private project(entry: Entry): void {
    for (const [id, change] of entry.changes) {
      entry.candidates.delete(id)
      if (change.info) entry.candidates.set(id, change.info)
    }
    const rows = [...entry.candidates.values()]
      .filter((info) => {
        if (this.deleted.has(info.id)) return false
        const placement = resolvePlacement(entry.ctx, info.id, info.directory)
        return (
          placement?.worktreeId === entry.request.worktreeId &&
          matches(info.title, entry.request.query) &&
          (!entry.more || (entry.tail && order(info, entry.tail) <= 0))
        )
      })
      .sort(order)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    if (entry.replacing && rows.length === 0 && (entry.more || this.missing(entry).length > 0)) return
    entry.replacing = false
    entry.rows = rows
  }

  private schedule(entry: Entry, scan: boolean, raw = true): void {
    entry.scan ||= scan
    entry.raw ||= scan && raw
    if (!this.current(entry) || entry.timer) return
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      if (!this.current(entry)) return
      const scan = entry.scan
      const raw = entry.raw
      entry.scan = false
      entry.raw = false
      if (scan) void this.turn(entry, raw)
      else this.post(entry, Boolean(entry.pending))
    }, 0)
  }

  private listen(ctx: ProjectContext): void {
    if (this.listeners.has(ctx)) return
    const state = ctx.peekState()
    if (!state) return
    this.listeners.set(
      ctx,
      state.onDidChangePlacement(() => {
        this.prune()
        for (const entry of this.entries.values()) {
          if (entry.ctx !== ctx) continue
          entry.rows = entry.rows.filter(
            (row) =>
              resolvePlacement(ctx, row.id, entry.candidates.get(row.id)?.directory)?.worktreeId ===
              entry.request.worktreeId,
          )
          entry.fresh = 0
          this.project(entry)
          if (!entry.active) continue
          this.reset(entry)
          this.schedule(entry, true)
        }
      }),
    )
  }

  private prune(): void {
    for (const entry of this.entries.values()) {
      const ctx = this.deps.contexts.resolve(entry.ctx.id)
      const directory = ctx && this.directory(ctx, entry.request.worktreeId)
      if (
        ctx === entry.ctx &&
        ctx.lifecycle !== "disposed" &&
        ctx.lifecycle !== "disposing" &&
        directory &&
        samePath(directory, entry.directory)
      )
        continue
      this.stop(entry)
      this.entries.delete(entry.key)
    }
    for (const [ctx, dispose] of this.listeners) {
      if (this.deps.contexts.resolve(ctx.id) === ctx && ctx.lifecycle !== "disposed") continue
      dispose()
      this.listeners.delete(ctx)
    }
  }

  private post(entry: Entry, loading: boolean): void {
    if (!this.current(entry)) return
    this.deps.post({
      type: "agentManager.history",
      projectId: entry.ctx.id,
      worktreeId: entry.request.worktreeId,
      query: entry.request.query,
      requestId: entry.request.requestId,
      generation: entry.generation,
      rows: entry.rows,
      more: entry.more || this.missing(entry).length > 0,
      loading,
      ...(entry.error ? { error: entry.error } : {}),
    })
  }

  private failure(request: HistoryRequest, error: string): void {
    if (this.disposed || request.active === false) return
    this.deps.post({
      type: "agentManager.history",
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      query: request.query,
      requestId: request.requestId,
      generation: ++this.generation,
      rows: [],
      more: false,
      loading: false,
      error,
    })
  }
}
