import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import { createKiloClient, type Session } from "@kilocode/sdk/v2/client"
import { AgentHistory } from "../src/agent-manager/history"
import { ProjectContexts } from "../src/agent-manager/project/contexts"
import { ProjectRegistry } from "../src/agent-manager/project/registry"
import { handleProjectMessage, type ProjectMessageDeps } from "../src/agent-manager/project/messages"
import { WorktreeStateManager } from "../src/agent-manager/WorktreeStateManager"
import type { ExtensionMessage, WebviewMessage } from "../webview-ui/src/types/messages"
import { historyBrowser } from "./helpers/history-browser"

const deliver = (page: Page, message: ExtensionMessage | "clear") =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

it.each(["local", "worktree"] as const)(
  "deletes %s history only after native confirmation and backend success",
  async (kind) => {
    const server = await historyBrowser("history-delete")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 300, height: 900 } })
    const registry = new ProjectRegistry({
      read: () => ({ version: 1, projects: [{ id: "b", root: "/repos/b", order: 0, addedAt: "now" }] }),
      write: () => {},
    })
    const contexts = new ProjectContexts({
      registry,
      workspaceRoot: () => "/repos/a",
      deps: {
        log: () => {},
        exists: () => true,
        state: (root, log) => {
          const state = new WorktreeStateManager(root, log)
          state.save = async () => {}
          return state
        },
      },
    })
    const active = contexts.active()
    const ctx = contexts.resolve("b")!
    const tree = ctx.stateManager().addWorktree({ path: "/repos/b/w", branch: "feature/b", parentBranch: "main" })
    const id = `b-${kind}`
    const placement = kind === "local" ? null : tree.id
    ctx.stateManager().addSession(id, placement)
    const info: Session = {
      id,
      slug: id,
      title: `${id} chat`,
      projectID: "backend",
      directory: kind === "local" ? ctx.root : tree.path,
      version: "1",
      time: { created: 1, updated: 2 },
    }
    const requests: Array<{ method: string; path: string; directory: string | null }> = []
    let failure = false
    const backend = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        requests.push({ method: request.method, path: url.pathname, directory: url.searchParams.get("directory") })
        if (request.method === "DELETE")
          return failure ? Response.json({ message: "Deletion rejected" }, { status: 500 }) : Response.json(true)
        return Response.json(info)
      },
    })
    const client = createKiloClient({ baseUrl: backend.url.href })
    const ready: ProjectMessageDeps["ready"] = (ctx) => ctx.ensureReady(async () => ({ ok: true, refsFixed: 0 }))
    const history = new AgentHistory({
      contexts,
      ready,
      exists: () => true,
      sessions: () => ({
        getSessionInfo: async (sessionID, directory) =>
          (await client.session.get({ sessionID, directory }, { throwOnError: true })).data,
      }),
      post: () => {},
    })
    const posts: Promise<unknown>[] = []
    const deps: ProjectMessageDeps = {
      registry,
      contexts,
      history,
      ready,
      deletion: {
        client: async () => client,
        sessions: () => undefined,
        confirm: (message) => page.evaluate((text) => window.confirm(text), message),
      },
      pickFolder: async () => undefined,
      onboarding: {
        input: async () => undefined,
        confirm: async () => false,
        cloneRepository: async () => undefined,
        isTrusted: () => true,
        notify: () => {},
      },
      activate: () => {
        throw new Error("Must not activate background project")
      },
      expand: () => {},
      push: () => {},
      selected: () => {
        throw new Error("Must not select deleted session")
      },
      post: (message) => {
        posts.push(deliver(page, message))
      },
      error: (message) => {
        posts.push(
          page.evaluate((text) => {
            document.body.dataset.hostError = text
          }, message),
        )
      },
      openSettings: () => {},
      log: () => {},
    }
    let completed = 0
    await page.exposeFunction("deleteHistory", async (message: WebviewMessage) => {
      if (message.type !== "deleteSession") throw new Error("Unexpected deletion message")
      await handleProjectMessage(message, deps)
      await Promise.all(posts.splice(0))
      completed++
    })
    try {
      await page.goto(`${server.url.href}?wt=${tree.id}`)
      await check(page.locator("body")).toHaveAttribute("data-deletion-ready", "true")
      await deliver(page, {
        type: "agentManager.state",
        projectId: "b",
        isGitRepo: true,
        worktrees: [{ ...tree }],
        sessions: [
          { id: "b-local", worktreeId: null, createdAt: "2026-11-01T00:00:00Z" },
          { id: "b-worktree", worktreeId: tree.id, createdAt: "2026-11-01T00:00:00Z" },
        ],
        historyExpanded: { local: true, [tree.id]: true },
        historyInitialized: true,
      })
      const scope = page.locator(`[data-history-context="b:${kind === "local" ? "local" : tree.id}"]`)
      const row = scope.locator(".am-history-row").filter({ hasText: `${id} chat` })
      await check(row).toBeVisible()
      await deliver(page, { type: "sessionStatus", sessionID: id, status: "busy" })
      await row.click({ button: "right" })
      await check(page.getByRole("menuitem", { name: /^Delete Session$/i })).toHaveAttribute("aria-disabled", "true")
      await page.keyboard.press("Escape")
      await deliver(page, { type: "sessionStatus", sessionID: id, status: "idle" })
      await deliver(page, "clear")
      const choose = async (confirm: boolean) => {
        await row.click({ button: "right" })
        const item = page.getByRole("menuitem", { name: /^Delete Session$/i })
        await check(item.locator('[data-component="icon"]')).toHaveCount(1)
        await Promise.all([
          page.waitForEvent("dialog").then(async (warning) => {
            expect(warning.message()).toContain(`${id} chat`)
            expect(warning.message()).toContain("cannot be undone")
            if (confirm) await warning.accept()
            else await warning.dismiss()
          }),
          item.click(),
        ])
      }
      await choose(false)
      await check.poll(() => completed).toBe(1)
      await check(row).toBeVisible()
      expect(requests.filter((request) => request.method === "DELETE")).toEqual([])
      failure = true
      await choose(true)
      await check.poll(() => completed).toBe(2)
      await check(row).toBeVisible()
      await check(page.locator("body")).toHaveAttribute("data-host-error", /Failed to delete session/)
      failure = false
      await choose(true)
      await check.poll(() => completed).toBe(3)
      await check(row).toHaveCount(0)
      expect(requests.filter((request) => request.method === "DELETE")).toEqual([
        { method: "DELETE", path: `/session/${id}`, directory: info.directory },
        { method: "DELETE", path: `/session/${id}`, directory: info.directory },
      ])
      const messages = JSON.parse(
        (await page.locator("body").getAttribute("data-messages")) ?? "[]",
      ) as WebviewMessage[]
      expect(messages.filter((message) => message.type === "deleteSession")).toEqual(
        Array.from({ length: 3 }, () => ({
          type: "deleteSession",
          sessionID: id,
          projectId: "b",
          worktreeId: placement,
        })),
      )
      expect(
        messages.filter((message) =>
          [
            "agentManager.activateSelection",
            "agentManager.openSessionInTab",
            "agentManager.deleteWorktree",
            "agentManager.closeSession",
          ].includes(message.type),
        ),
      ).toEqual([])
      expect(ctx.peekState()?.getWorktree(tree.id)).toBeDefined()
      expect(contexts.active()).toBe(active)
      await check(page.locator('[data-history-context="a:local"] .am-history-row')).toHaveCount(1)
      // A stale page response or switching back from a filtered query cannot resurrect a deletion.
      await scope.getByRole("button", { name: /Refresh chat history/ }).click()
      await check(row).toHaveCount(0)
    } finally {
      history.dispose()
      backend.stop(true)
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("clears a deleted native tab's selected session and persisted tab ids through the existing listener", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  try {
    await page.goto(`${server.url.href}?deletion`)
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-tabs")
          .then((raw) => JSON.parse(raw ?? "{}").active),
      )
      .toBe("s1")
    const editor = page.locator("textarea.prompt-input").first()
    await editor.fill("Keep this draft in Project A")
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("scope-message", { detail: { type: "sessionDeleted", projectId: "b", sessionID: "s1" } }),
      ),
    )
    await check(editor).toHaveValue("Keep this draft in Project A")
    expect(JSON.parse((await page.locator("body").getAttribute("data-tabs")) ?? "{}").active).toBe("s1")
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("scope-message", { detail: { type: "sessionDeleted", projectId: "a", sessionID: "s1" } }),
      ),
    )
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").sidebarSessionTabIDs),
      )
      .toEqual([])
    const saved = JSON.parse((await page.locator("body").getAttribute("data-saved")) ?? "{}")
    expect(saved.sidebarActiveSessionTabID).toBe("")
    expect(saved.nativeSessionContext).toBe("opaque-original")
    expect(JSON.parse((await page.locator("body").getAttribute("data-tabs")) ?? "{}").active).not.toBe("s1")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)
