import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import type { AgentManagerStateMessage, ExtensionMessage } from "../webview-ui/src/types/messages"
import { historyBrowser } from "./helpers/history-browser"

const deliver = (page: Page, message: ExtensionMessage | "clear") =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

const snapshot = (id = "a"): AgentManagerStateMessage => ({
  type: "agentManager.state",
  projectId: id,
  isGitRepo: true,
  worktrees: [{ id: "w", branch: `feature/${id}`, path: `/repos/${id}/w`, createdAt: "2026-11-01T00:00:00Z" }],
  sessions: [
    { id: `${id}-local`, worktreeId: null, createdAt: "2026-11-01T00:00:00Z" },
    { id: `${id}-worktree`, worktreeId: "w", createdAt: "2026-11-01T00:00:00Z" },
  ],
  sections: [],
  historyInitialized: true,
  historyExpanded: { local: true, w: true },
})

it("preserves worktree DOM, focused history search and subscriptions across equivalent snapshots", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 320, height: 1100 } })
  try {
    await page.goto(server.url.toString())
    const context = page.locator('[data-history-context="a:w"]')
    await check(context.locator('[data-history-session="a-worktree"]')).toBeVisible()
    const input = context.getByRole("textbox")
    await input.fill("needle")
    await check.poll(() => page.locator("body").getAttribute("data-messages")).toContain('"query":"needle"')
    const row = await page.locator('[data-sidebar-id="a:w"]').elementHandle()
    const field = await input.elementHandle()
    await deliver(page, "clear")
    for (let i = 0; i < 10; i++) {
      await deliver(page, {
        type: "agentManager.projects",
        projects: ["a", "b"].map((id) => ({
          id,
          root: `/repos/${id}`,
          label: id.toUpperCase(),
          pinned: id === "a",
          expanded: true,
          active: id === "a",
          missing: false,
        })),
      })
      await deliver(page, snapshot())
    }
    expect(await row!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await field!.evaluate((el) => el.isConnected)).toBe(true)
    await check(input).toBeFocused()
    await check(input).toHaveValue("needle")
    const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
      type: string
    }[]
    expect(messages.filter((message) => message.type === "agentManager.requestHistory")).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it("keeps section and pinned rows stable while applying membership, collapse and deletion changes", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 320, height: 1100 } })
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  try {
    await page.goto(server.url.toString())
    await check(page.locator('[data-sidebar-id="a:w"]')).toBeVisible()
    const state = snapshot()
    state.sections = [{ id: "s", name: "Group", collapsed: false, color: null }]
    state.worktrees.at(0)!.sectionId = "s"
    state.worktrees.push({
      id: "p",
      branch: "pinned",
      path: "/repos/a/p",
      createdAt: "2026-11-02T00:00:00Z",
      pinned: true,
    })
    await deliver(page, state)
    const group = page.locator('[data-project-body="a"] .am-section-group')
    const pinned = page.locator('[data-sidebar-id="a:p"]')
    const member = page.locator('[data-sidebar-id="a:w"]')
    await check(member).toBeVisible()
    await check(pinned).toBeVisible()
    const header = await group.locator(".am-section-group-header").elementHandle()
    const card = await member.elementHandle()
    const pin = await pinned.elementHandle()
    await deliver(page, "clear")
    state.sections.at(0)!.name = "Renamed group"
    state.worktrees.at(1)!.label = "Pinned update"
    await deliver(page, state)
    await check(group).toContainText("Renamed group")
    await check(pinned).toContainText("Pinned update")
    expect(await header!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await card!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await pin!.evaluate((el) => el.isConnected)).toBe(true)
    const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
      type: string
    }[]
    expect(messages.filter((message) => message.type === "agentManager.requestHistory")).toEqual([])
    state.sections.at(0)!.collapsed = true
    await deliver(page, state)
    await check(group.locator('[data-sidebar-id="a:w"]')).toHaveCount(0)
    state.sections.at(0)!.collapsed = false
    await deliver(page, state)
    await check(group.locator('[data-sidebar-id="a:w"]')).toBeVisible()
    state.worktrees = []
    state.sections = []
    state.sessions = state.sessions.filter((session) => session.worktreeId === null)
    await deliver(page, state)
    await check(member).toHaveCount(0)
    await check(pinned).toHaveCount(0)
    await check(group).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it("updates worktree labels and order without replacing existing rows or reloading history", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 320, height: 1100 } })
  try {
    await page.goto(server.url.toString())
    await check(page.locator('[data-history-session="a-worktree"]')).toBeVisible()
    const state = snapshot()
    state.worktrees.push({ id: "u", branch: "another", path: "/repos/a/u", createdAt: "2026-11-02T00:00:00Z" })
    await deliver(page, state)
    const card = page.locator('[data-sidebar-id="a:w"]')
    const sibling = page.locator('[data-sidebar-id="a:u"]')
    await check(sibling).toBeVisible()
    const row = await card.elementHandle()
    const other = await sibling.elementHandle()
    const history = await page.locator('[data-history-session="a-worktree"]').elementHandle()
    await deliver(page, "clear")
    state.worktrees.at(0)!.label = "Renamed worktree"
    state.worktreeOrder = ["u", "w"]
    await deliver(page, state)
    await check(card).toContainText("Renamed worktree")
    expect(await row!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await other!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await history!.evaluate((el) => el.isConnected)).toBe(true)
    expect(
      await page
        .locator('[data-project-body="a"] .am-wt-sortable [data-sidebar-id]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-sidebar-id"))),
    ).toEqual(["a:u", "a:w"])
    const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
      type: string
    }[]
    expect(messages.filter((message) => message.type === "agentManager.requestHistory")).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)
