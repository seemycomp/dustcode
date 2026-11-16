import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import { addSessionToLifecycleWorktree, type LifecycleHost } from "../src/agent-manager/provider-lifecycle"
import { ProjectContext } from "../src/agent-manager/project/context"
import { WorktreeStateManager } from "../src/agent-manager/WorktreeStateManager"
import type { AgentManagerOutMessage } from "../src/agent-manager/types"
import { historyBrowser } from "./helpers/history-browser"

const messages = (page: Page) =>
  page
    .locator("body")
    .getAttribute("data-messages")
    .then(
      (value) =>
        JSON.parse(value ?? "[]") as {
          type: string
          projectId?: string
          worktreeId?: string
          requestId?: string
          sessionID?: string
        }[],
    )
const deliver = (page: Page, message: unknown) =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

// Feed production lifecycle responses into the real browser app; only the backend boundary is substituted.
const respond = async (
  page: Page,
  request: { projectId?: string; worktreeId?: string; requestId?: string },
  sessionId: string,
  error?: string,
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toolbar-lifecycle-"))
  const state = new WorktreeStateManager(root, () => undefined)
  const posted: AgentManagerOutMessage[] = []
  try {
    fs.mkdirSync(path.join(root, ".dustcode"))
    fs.writeFileSync(
      path.join(root, ".dustcode", "agent-manager.json"),
      JSON.stringify({
        worktrees: {
          [request.worktreeId!]: {
            branch: "feature",
            path: root,
            parentBranch: "main",
            createdAt: new Date().toISOString(),
          },
        },
        sessions: {},
      }),
    )
    await state.load()
    const ctx = new ProjectContext(request.projectId!, root, true, {
      state: () => state,
      log: () => undefined,
      worktrees: () => {
        throw new Error("Session addition must not create a worktree manager")
      },
    })
    ctx.stateManager()
    const host = {
      client: () =>
        ({
          session: {
            create: async () => {
              if (error) throw new Error(error)
              return { data: { id: sessionId, directory: root } }
            },
          },
        }) as unknown as KiloClient,
      metadata: async () => ({}),
      post: (message: AgentManagerOutMessage) => posted.push(message),
      register: () => undefined,
      push: () => undefined,
      sessions: { register: () => undefined },
      capture: () => undefined,
      log: () => undefined,
    } as LifecycleHost
    await addSessionToLifecycleWorktree(ctx, host, request.worktreeId!, undefined, request.requestId)
    for (const message of posted) await deliver(page, message)
    return posted
  } finally {
    await state.flush()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

it.each([240, 300])(
  "creates a native chat from the clicked worktree toolbar at %spx",
  async (width) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    const creation = async () =>
      (await messages(page)).filter((msg) =>
        [
          "agentManager.addSessionToWorktree",
          "agentManager.openSessionInTab",
          "agentManager.openDraftInTab",
          "agentManager.activateSelection",
          "createSession",
          "agentManager.createWorktree",
        ].includes(msg.type),
      )
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-history-context="b:w"] .am-history-tools')).toBeVisible()
      expect(await creation()).toEqual([])
      // Both projects use worktree ID w; A remains active while B's toolbar is clicked.
      for (const [projectId, worktreeId] of [
        ["b", "w"],
        ["a", "w"],
        ["b", null],
        ["a", null],
        ["b", "w"],
      ]) {
        const tools = page.locator(`[data-history-context="${projectId}:${worktreeId ?? "local"}"] .am-history-tools`)
        const button = tools.getByRole("button", { name: "New Session", exact: true })
        await check(button).toBeEnabled()
        await check(button).toHaveAttribute("title", "New Session")
        await check(button.locator('[data-component="icon"] svg')).toHaveCount(1)
        const bounds = await tools.evaluate((el) =>
          [...el.children].map((child) => {
            const rect = child.getBoundingClientRect()
            return { left: rect.left, right: rect.right, width: rect.width }
          }),
        )
        expect(bounds.every((rect) => rect.left >= 0 && rect.right <= width && rect.width > 0)).toBe(true)
        await deliver(page, "clear")
        await button.click()
        expect(await creation()).toEqual([{ type: "agentManager.openDraftInTab", projectId, worktreeId }])
        await check(page.locator(".am-detail")).toBeHidden()
        expect((await messages(page)).filter((msg) => ["loadMessages", "createSession"].includes(msg.type))).toEqual([])
        await check(page.locator(`[data-tab-id="${projectId}-new"]`)).toHaveCount(0)
        await check(page.locator(".am-detail")).toBeHidden()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await deliver(page, "clear")
      await deliver(page, { type: "agentManager.worktreeDeleted", projectId: "b", worktreeId: "w" })
      const completed = page.locator('[data-history-context="b:w"] .am-history-tools button[title="New Session"]')
      await check(completed).toBeDisabled()
      await completed.evaluate((el) => (el as HTMLButtonElement).click())
      expect(await creation()).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("keeps exact legacy menu correlation isolated from immediate toolbar drafts", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 900 } })
  const opens = async () => (await messages(page)).filter((msg) => msg.type === "agentManager.openSessionInTab")
  const request = async () =>
    (await messages(page)).filter((msg) => msg.type === "agentManager.addSessionToWorktree").at(-1)!
  const menu = async () => {
    await page.locator('[data-history-context="a:w"] [data-history-session="a-worktree"]').click({ button: "right" })
    await page.getByRole("menuitem", { name: "New Session", exact: true }).click()
    return request()
  }
  try {
    await page.goto(server.url.toString())
    const tools = page.locator('[data-history-context="a:w"] .am-history-tools')
    const toolbar = tools.getByRole("button", { name: "New Session", exact: true })
    await check(toolbar).toBeVisible()
    await deliver(page, "clear")
    const failed = await menu()
    await respond(page, failed, "rejected", "Rejected")
    expect(await opens()).toEqual([])
    const first = await menu()
    await toolbar.click()
    const second = await menu()
    expect(new Set([failed.requestId, first.requestId, second.requestId]).size).toBe(3)
    expect((await messages(page)).filter((msg) => msg.type === "agentManager.openDraftInTab")).toEqual([
      { type: "agentManager.openDraftInTab", projectId: "a", worktreeId: "w" },
    ])
    await respond(page, second, "second")
    await respond(page, first, "first")
    await deliver(page, { type: "connectionState", state: "connected" })
    await check.poll(opens).toEqual([
      { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "second" },
      { type: "agentManager.openSessionInTab", projectId: "a", sessionId: "first" },
    ])
    await check
      .poll(async () => (await messages(page)).some((msg) => msg.type === "loadMessages" && msg.sessionID === "first"))
      .toBe(true)
    await respond(page, failed, "late-failed")
    expect(await opens()).toHaveLength(2)
    expect((await messages(page)).some((msg) => msg.type === "agentManager.activateSelection")).toBe(false)
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)
