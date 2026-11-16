import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import type { ExtensionMessage } from "../webview-ui/src/types/messages"
import { historyBrowser } from "./helpers/history-browser"

const deliver = (page: Page, message: ExtensionMessage | "clear") =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

it.each([false, true])(
  "shows only history and returns to the manager navigator (detail: %s)",
  async (detail) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
      if (detail) {
        await deliver(page, { type: "action", action: "focusInput" })
        await check(page.locator(".am-detail")).toBeVisible()
      }
      await deliver(page, "clear")
      await deliver(page, { type: "navigate", view: "history" })
      await check(page.locator(".history-view")).toBeVisible()
      await check(page.locator(".history-view [data-slot='list-item-title']").first()).toBeVisible()
      await check(page.locator(".am-tab-bar")).toBeHidden()
      await check(page.locator(".am-presentation-toolbar")).toBeHidden()
      await page.locator(".history-view-header").getByRole("button", { name: /back/i }).click()
      await check(page.locator(".history-view")).toHaveCount(0)
      await check(page.locator(".am-sidebar")).toBeVisible()
      await check(page.locator(".am-detail")).toBeHidden()
      await check(page.locator(".am-presentation-toolbar")).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(300)
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
      }[]
      expect(
        messages.filter((msg) =>
          [
            "agentManager.openSessionInTab",
            "openSessionInTab",
            "createSession",
            "agentManager.createWorktree",
          ].includes(msg.type),
        ),
      ).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("restores the existing editor tabs after leaving its history list", async () => {
  const server = await historyBrowser("agent-manager-native-chat")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  try {
    await page.goto(server.url.toString())
    await check(page.locator(".am-tab-bar")).toBeVisible()
    const tabs = await page
      .locator(".am-tab-list [data-tab-id]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-tab-id")))
    await deliver(page, { type: "navigate", view: "history" })
    await check(page.locator(".history-view")).toBeVisible()
    await check(page.locator(".am-tab-bar")).toBeHidden()
    await page.locator(".history-view-header").getByRole("button", { name: /back/i }).click()
    await check(page.locator(".history-view")).toHaveCount(0)
    await check(page.locator(".am-tab-bar")).toBeVisible()
    expect(
      await page
        .locator(".am-tab-list [data-tab-id]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-tab-id"))),
    ).toEqual(tabs)
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it.each(["worktree", "local"] as const)(
  "opens the %s history action from its labeled context menu",
  async (kind) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
      await deliver(page, { type: "navigate", view: "history" })
      const row = page.locator(".history-view .session-row").filter({ hasText: "a-local chat" })
      await check(row).toBeVisible()
      await row.hover()
      await check(row.locator('[data-slot="session-row-action"]')).toHaveCount(0)
      await deliver(page, "clear")
      await row.click({ button: "right" })
      const menu = page.locator(".session-list-menu")
      await check(menu).toBeVisible()
      await check(menu.getByRole("menuitem")).toHaveCount(5)
      for (const item of await menu.getByRole("menuitem").all())
        await check(item.locator('[data-component="icon"]')).toHaveCount(1)
      await menu.getByRole("menuitem", { name: kind === "worktree" ? /worktree/i : /locally/i }).click()
      await check
        .poll(() => page.locator("body").getAttribute("data-messages"))
        .toContain(kind === "worktree" ? "agentManager.promoteSession" : "agentManager.openLocally")
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")
      expect(messages).toContainEqual({
        type: kind === "worktree" ? "agentManager.promoteSession" : "agentManager.openLocally",
        sessionId: "a-local",
      })
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("keeps the sidebar History list open after opening a native chat tab", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  try {
    await page.goto(server.url.toString())
    await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
    await deliver(page, { type: "navigate", view: "history" })
    const row = page.locator(".history-view .session-row").filter({ hasText: "a-local chat" })
    await check(row).toBeVisible()
    await deliver(page, "clear")
    await row.click()
    await check
      .poll(() => page.locator("body").getAttribute("data-messages"))
      .toContain("agentManager.openSessionInTab")
    expect(JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")).toContainEqual({
      type: "agentManager.openSessionInTab",
      projectId: "a",
      sessionId: "a-local",
    })
    await check(page.locator(".history-view")).toBeVisible()
    await check(page.locator(".am-tab-bar")).toBeHidden()
    await check(page.locator(".am-presentation-toolbar")).toBeHidden()
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)
