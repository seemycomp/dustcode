import assert from "node:assert/strict"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createKiloClient } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../src/agent-manager/history"
import { ProjectContexts } from "../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../src/agent-manager/project/registry"
import { WorktreeStateManager } from "../src/agent-manager/WorktreeStateManager"
import { handleProjectMessage, type ProjectMessageDeps } from "../src/agent-manager/project/messages"
import type { SidebarTarget } from "../src/agent-manager/project/route"
import { fetchSessionPage } from "../src/kilo-provider/session-page"
import { isNotFoundError } from "../src/kilo-provider/handlers/not-found"
import { sessionToWebview } from "../src/kilo-provider-utils"
import type { HistoryMessage } from "../src/shared/agent-history"

// Run against a disposable development server with KILO_DB=:memory:, never the user's profile.
const url = process.env.HISTORY_URL
assert(url, "HISTORY_URL must point to an isolated bun dev serve backend")
const parent = process.env.HISTORY_TMP
assert(parent, "HISTORY_TMP must name an existing temporary parent directory")
const root = await fs.mkdtemp(path.join(parent, "history-integration-"))
const a = path.join(root, "a")
const b = path.join(root, "b")
const dir = path.join(b, "worktree")
await Promise.all([fs.mkdir(a), fs.mkdir(dir, { recursive: true })])
const counts = { transcripts: 0, pages: 0 }
const lookups = new Map<string, number>()
const client = createKiloClient({
  baseUrl: url,
  headers: { Authorization: `Basic ${Buffer.from(`kilo:${process.env.HISTORY_PASSWORD ?? ""}`).toString("base64")}` },
  fetch: (request) => {
    const target = new URL(request instanceof Request ? request.url : String(request))
    if (/\/message(?:\/|$)/.test(target.pathname)) counts.transcripts++
    if (target.pathname === "/experimental/session") counts.pages++
    const id = target.pathname.match(/^\/session\/([^/]+)$/)?.at(1)
    if (id && request instanceof Request && request.method === "GET") lookups.set(id, (lookups.get(id) ?? 0) + 1)
    return fetch(request)
  },
})
let saved: unknown
const registry = new ProjectRegistry({
  read: () => saved,
  write: (value) => {
    saved = value
  },
})
await registry.add({ id: "project-b", root: b })
const contexts = new ProjectContexts({ workspaceRoot: () => a, registry, deps: { log: () => {} } })
const local = contexts.active()!
const ctx = contexts.expand("project-b")!
const ready: ProjectMessageDeps["ready"] = (ctx) => {
  ctx.stateManager()
  return ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
}
await Promise.all([ready(local), ready(ctx)])
const state = ctx.stateManager()
const wt = state.addWorktree({ branch: "smoke", path: dir, parentBranch: "main" })
const messages: HistoryMessage[] = []
const history = new AgentHistory({
  contexts,
  ready,
  sessions: () => ({
    listSessionPage: ({ directory, ...input }) => fetchSessionPage(client, { dir: directory, ...input }),
    getSessionInfo: async (sessionID, directory) =>
      client.session
        .get({ sessionID, directory }, { throwOnError: true })
        .then((result) => result.data)
        .catch((error: unknown) => {
          if (isNotFoundError(error)) return undefined
          throw error
        }),
  }),
  post: (message) => messages.push(message),
})
const create = async (title: string, directory = dir, parentID?: string) =>
  (await client.session.create({ directory, title, parentID }, { throwOnError: true })).data

try {
  const older = await create("Original older closed conversation")
  await create("Child must stay hidden", dir, older.id)
  for (let start = 0; start < 130; start += 10) {
    await Promise.all(Array.from({ length: 10 }, (_, i) => create(`Newer conversation ${start + i}`)))
  }
  const assigned = await create("Promoted from root", b)
  state.addSession(assigned.id, wt.id)
  state.closeSession(assigned.id, wt.id)
  state.removeSession(assigned.id)
  const discovery = (await client.session.list({ directory: dir, limit: 100 }, { throwOnError: true })).data
  assert(!discovery.some((item) => item.id === older.id), "fixture must be older than initial discovery")
  const started = performance.now()
  await history.request({
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: wt.id,
    query: "",
    requestId: "first",
  })
  const cold = performance.now() - started
  let page = messages.at(-1)!
  while (page.more) {
    await history.request({
      type: "agentManager.requestHistory",
      projectId: ctx.id,
      worktreeId: wt.id,
      query: "",
      requestId: "more",
      more: true,
    })
    page = messages.at(-1)!
    assert(!page.error, page.error)
  }
  assert.equal(page.rows.length, 132)
  assert(page.rows.some((row) => row.id === older.id))
  assert(page.rows.some((row) => row.id === assigned.id))
  assert(!page.rows.some((row) => row.title === "Child must stay hidden"))
  const cached = performance.now()
  await history.request({
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: wt.id,
    query: "",
    requestId: "cached",
  })
  const reopen = performance.now() - cached
  const searched = performance.now()
  await history.request({
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: wt.id,
    query: "Original older",
    requestId: "search",
  })
  const search = performance.now() - searched
  assert.deepEqual(
    messages.at(-1)!.rows.map((row) => row.id),
    [older.id],
  )
  await history.request({
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: null,
    query: "",
    requestId: "local",
  })
  assert(!messages.at(-1)!.rows.some((row) => row.id === assigned.id))
  const selected: SidebarTarget[] = []
  const order: string[] = []
  const deps: ProjectMessageDeps = {
    history,
    contexts,
    registry,
    ready,
    pickFolder: async () => undefined,
    onboarding: {} as ProjectMessageDeps["onboarding"],
    activate: () => {},
    expand: () => {},
    push: () => {},
    openSettings: () => {},
    log: () => {},
    post: (message) => assert.notEqual(message.type, "agentManager.historyOpenFailed", JSON.stringify(message)),
    error: (message) => assert.fail(message),
    routeSession: (_project, id, directory) => {
      assert.equal(id, older.id)
      assert.equal(directory, dir)
    },
    pushState: () => order.push("state"),
    selected: (target) => {
      order.push("selection")
      selected.push(target)
    },
  }
  const open = {
    type: "agentManager.openHistorySession",
    projectId: ctx.id,
    worktreeId: wt.id,
    sessionId: older.id,
    requestId: "open",
  } as const
  await handleProjectMessage(open, deps)
  await handleProjectMessage({ ...open, requestId: "again" }, deps)
  assert.equal(state.getSession(older.id)?.worktreeId, wt.id)
  assert.equal(state.getSessions().filter((item) => item.id === older.id).length, 1)
  assert.deepEqual(selected.at(-1), { projectId: ctx.id, kind: "session", sessionId: older.id })
  assert.equal(order.at(0), "state")
  assert.equal(counts.transcripts, 0)
  assert.equal(
    (await client.session.get({ sessionID: older.id, directory: dir }, { throwOnError: true })).data.directory,
    dir,
  )
  assert.equal(
    (await client.session.get({ sessionID: assigned.id, directory: dir }, { throwOnError: true })).data.directory,
    b,
  )
  await state.flush()
  const restored = new WorktreeStateManager(b, () => {})
  await restored.load()
  assert.equal(restored.getSession(older.id)?.worktreeId, wt.id)
  assert.deepEqual(restored.getActiveTarget(), selected.at(-1))
  const external = await create("Created outside the history lifecycle")
  await history.request({
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: wt.id,
    query: "",
    requestId: "external-refresh",
    refresh: true,
  })
  assert(messages.at(-1)!.rows.some((row) => row.id === external.id))
  ctx.upsertSession({ ...sessionToWebview(assigned), worktreeId: wt.id })
  const title = "Assigned-only renamed outside history"
  await client.session.update({ sessionID: assigned.id, directory: b, title }, { throwOnError: true })
  const request = {
    type: "agentManager.requestHistory",
    projectId: ctx.id,
    worktreeId: wt.id,
    query: title,
    requestId: "assigned-refresh",
    refresh: true,
  } as const
  await history.request(request)
  assert.deepEqual(
    messages.at(-1)!.rows.map((row) => row.title),
    [title],
  )
  assert.equal(ctx.sessions().find((row) => row.id === assigned.id)?.title, assigned.title)
  await client.session.delete({ sessionID: assigned.id, directory: b }, { throwOnError: true })
  const before = lookups.get(assigned.id) ?? 0
  await history.request(request)
  assert.deepEqual(messages.at(-1)!.rows, [])
  assert.equal(messages.at(-1)!.loading, false)
  assert.equal(messages.at(-1)!.more, false)
  assert.equal(messages.at(-1)!.error, undefined)
  await Bun.sleep(25)
  await history.request({ ...request, refresh: false })
  assert.equal(lookups.get(assigned.id), before + 1)
  assert.equal(state.sessionPlacement(assigned.id), wt.id)
  assert.equal(counts.transcripts, 0)
  console.log(
    JSON.stringify(
      {
        rows: page.rows.length,
        olderBeyond100: true,
        restoredInWorktree: true,
        externalRefresh: true,
        assignedRefresh: true,
        missingAssignmentSettled: true,
        pages: counts.pages,
        transcriptRequests: counts.transcripts,
        coldMs: cold,
        cachedMs: reopen,
        searchMs: search,
        selected: selected.at(-1),
      },
      null,
      2,
    ),
  )
} finally {
  history.dispose()
  await contexts.dispose()
  await fs.rm(root, { recursive: true, force: true })
}
