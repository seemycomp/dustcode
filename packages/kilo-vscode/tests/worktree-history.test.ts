import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { historyBrowser } from "./helpers/history-browser"

const context = (page: Page, scope = "a:local") => page.locator(`[data-history-context="${scope}"]`)
const command = (page: Page, action: string) =>
  page.evaluate((action) => window.dispatchEvent(new CustomEvent("history-fixture", { detail: { action } })), action)

it("reuses chat tab menus for closed and open history rows without selecting on right click", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const action = (name: string) => page.getByRole("menuitem", { name, exact: true })
  const message = () =>
    page
      .locator("body")
      .getAttribute("data-history-menu")
      .then((value) => JSON.parse(value!))
  try {
    await page.goto(`${server.url}?total=75`)
    const worktree = context(page, "a:w-0")
    const row = worktree.locator('[data-history-session="history-00000"]')
    await check(row).toBeVisible()
    await row.click({ button: "right" })
    await check(page.getByRole("menu")).toBeVisible()
    await check(action("Fork Session")).toBeEnabled()
    await check(action("Close")).toHaveCount(0)
    await check(action("Close Others")).toHaveCount(0)
    await check(page.locator("body")).toHaveAttribute("data-history-opens", "0")
    await action("Fork Session").click()
    expect(await message()).toEqual({
      type: "agentManager.forkSession",
      projectId: "a",
      worktreeId: "w-0",
      sessionId: "history-00000",
    })
    await row.click({ button: "right" })
    await action("New Session").click()
    expect(await message()).toEqual({ type: "agentManager.addSessionToWorktree", projectId: "a", worktreeId: "w-0" })

    const local = context(page).locator('[data-history-session="history-00000"]')
    await local.click({ button: "right" })
    await action("Move to Worktree").click()
    expect(await message()).toEqual({ type: "agentManager.promoteSession", projectId: "a", sessionId: "history-00000" })
    await local.click({ button: "right" })
    await action("Fork Session").click()
    expect(await message()).toEqual({ type: "agentManager.forkSession", projectId: "a", sessionId: "history-00000" })
    await local.click({ button: "right" })
    await action("New Session").click()
    expect(await message()).toEqual({ type: "newLocalDraft", projectId: "a" })
    await command(page, "menu-tabs")
    const pinned = worktree.locator('[data-history-session="history-00002"]')
    await pinned.click({ button: "right" })
    await check(action("Close to the Right")).toBeVisible()
    await page.keyboard.press("Escape")
    await row.click({ button: "right" })
    await check(action("Close")).toBeVisible()
    await check(action("Close to the Right")).toBeVisible()
    await action("Close to the Right").click()
    expect(await message()).toEqual({ type: "agentManager.closeSession", projectId: "a", sessionId: "history-00001" })
    await row.click({ button: "right" })
    await check(action("Close to the Right")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await check(row).toBeFocused()
    await row.press("Shift+F10")
    await check(page.getByRole("menu")).toBeVisible()
    await page.getByRole("menuitem").filter({ hasText: /^Pin/ }).click()
    expect(await message()).toEqual({
      type: "agentManager.setPinnedTabs",
      projectId: "a",
      key: "w-0",
      ids: ["history-00002", "history-00000"],
    })
    await row.click({ button: "right" })
    await action("Close").click()
    expect(await message()).toEqual({ type: "agentManager.closeSession", projectId: "a", sessionId: "history-00000" })
    await check(row).toBeVisible()
    await row.click({ button: "right" })
    await check(action("Close")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await command(page, "menu-busy")
    const status = row.locator(".am-history-status")
    await check(status).toHaveAttribute("data-activity", "busy")
    await check(status.locator("use")).toHaveAttribute("href", /dot-grid$/)
    await command(page, "menu-waiting")
    await check(status).toHaveAttribute("data-activity", "waiting")
    await check(status.locator("use")).toHaveAttribute("href", /help$/)
    await command(page, "menu-error")
    await check(status.locator("use")).toHaveAttribute("href", /warning$/)
    await command(page, "menu-idle")
    await check(status).toHaveCount(0)
    await command(page, "menu-busy")
    await page.setViewportSize({ width: 360, height: 850 })
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await row.click({ button: "right" })
    await check(action("Fork Session")).toBeDisabled()
    await page.keyboard.press("Escape")
    await check(page.locator("body")).toHaveAttribute("data-history-opens", "0")

    await page.goto(`${server.url}?total=75`)
    await row.click({ button: "right" })
    await page.getByRole("menuitem").filter({ hasText: /^Pin/ }).click()
    expect(await message()).toEqual({
      type: "agentManager.setPinnedTabs",
      projectId: "a",
      key: "w-0",
      ids: ["history-00000"],
    })
    await check(page.locator("body")).toHaveAttribute("data-history-opens", "1")
    await check(row).toHaveAttribute("aria-current", "page")
    await command(page, "menu-tabs")
    await row.click({ button: "right" })
    await action("Close Others").click()
    expect(await message()).toEqual({ type: "agentManager.closeSession", projectId: "a", sessionId: "history-00001" })
    await row.click({ button: "right" })
    await check(action("Close to the Right")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await page.goto(`${server.url}?total=6&transfer`)
    await context(page).locator('[data-history-session="history-00000"]').click({ button: "right" })
    await check(action("Move to Worktree")).toBeVisible()
    await check(page.getByText("session.menu.moveToWorktree", { exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("renders real six-row geometry, scoped events/search, remount state and bounded virtual keyboard navigation", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const browserContext = await browser.newContext({ viewport: { width: 1000, height: 850 } })
  const page = await browserContext.newPage()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    for (const total of [0, 1, 6, 7]) {
      await page.goto(`${server.url}?total=${total}&width=200`)
      const local = context(page)
      await check(local.locator(".am-history-row")).toHaveCount(total)
      const viewport = local.locator(".am-history-viewport")
      const geometry = await viewport.evaluate((el) => ({
        height: el.clientHeight,
        width: el.clientWidth,
        scroll: el.scrollWidth,
      }))
      if (total) expect(geometry.height).toBe(Math.min(total, 6) * 28)
      else expect(geometry.height).toBeLessThan(168)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
      if (total > 0) {
        const row = local.locator(".am-history-row").first()
        const title = row.locator(".am-history-title")
        await check(title).toHaveAttribute("dir", "auto")
        expect(await row.getAttribute("title")).toContain("Lịch sử trò chuyện")
        expect(await row.locator("time").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(20)
        expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        if (total >= 6) {
          const box = (await viewport.boundingBox())!
          const sixth = (await local.locator(".am-history-row").nth(5).boundingBox())!
          expect(sixth.y + sixth.height).toBeLessThanOrEqual(box.y + box.height + 1)
        }
      }
      if (total === 0) await check(local.getByRole("status")).toHaveText("No conversations yet.")
      if (total === 7) {
        await viewport.hover()
        await page.mouse.wheel(0, 200)
        await check.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      }
    }

    await page.goto(`${server.url}?legacy&total=75`)
    await check(page.locator(".am-history")).toHaveCount(0)
    await command(page, "ack")
    await check(context(page, "b:w-0").locator(".am-history-row")).toHaveCount(30)
    await check(page.locator(".am-history")).toHaveCount(1)
    const disclosure = context(page, "b:w-0").getByRole("button", {
      name: "Toggle chat history for Task 0",
      exact: true,
    })
    await disclosure.click()
    await command(page, "ack")
    await check(disclosure).toHaveAttribute("aria-expanded", "false")
    await disclosure.press("Enter")
    await check(disclosure).toHaveAttribute("aria-expanded", "true")

    await page.goto(`${server.url}?total=5000`)
    const local = context(page)
    await check(local.locator(".am-history-row")).toHaveCount(30)
    await local.getByRole("button", { name: "Search chat history for local", exact: true }).click()
    const input = local.getByRole("textbox", { name: "Search chat history for local", exact: true })
    await input.fill("Needle")
    await check(local.locator(".am-history-row")).toHaveCount(1)
    await check(local.locator(".am-history-row")).toContainText("Needle beyond discovery limit")
    await input.fill("old")
    await page.waitForTimeout(220)
    await input.fill("Conversation 00010")
    await check(local.locator(".am-history-row")).toHaveCount(1)
    await check(local.locator(".am-history-row")).toContainText("Conversation 00010")
    await page.waitForTimeout(400)
    await check(local.locator(".am-history-row")).toContainText("Conversation 00010")
    await input.fill("nothing matches this")
    await check(local.getByRole("status")).toHaveText("No matching conversations.")
    await input.press("Escape")
    await check(input).toHaveCount(0)
    await check(local.getByRole("button", { name: "Search chat history for local", exact: true })).toBeFocused()
    await check(local.locator(".am-history-row")).toHaveCount(30)
    await command(page, "next-fail")
    await local.getByRole("button", { name: "Load older conversations", exact: true }).click()
    await check(local.getByRole("alert")).toContainText("Could not load older conversations.")
    await check(local.locator(".am-history-row")).toHaveCount(30)
    await local.getByRole("button", { name: "Retry", exact: true }).click()
    await check(local.getByRole("alert")).toHaveCount(0)
    expect(await local.locator(".am-history-row").count()).toBeLessThan(31)
    const first = local.locator(".am-history-row").first()
    await first.evaluate((el) => (el as HTMLElement).focus())
    await check(first).toBeFocused()
    for (let index = 0; index < 35; index++) await page.keyboard.press("ArrowDown", { delay: 20 })
    await check(local.locator('[data-history-session="history-00035"]')).toBeFocused()
    const top = await local.locator(".am-history-viewport").evaluate((el) => el.scrollTop)
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-history-session"))
    await command(page, "rename")
    await local
      .getByRole("button", { name: "Refresh chat history for local", exact: true })
      .evaluate((el) => (el as HTMLButtonElement).click())
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-history-session"))).toBe(focused)
    expect(await local.locator(".am-history-viewport").evaluate((el) => el.scrollTop)).toBe(top)

    const worktree = context(page, "a:w-0")
    await worktree.getByRole("button", { name: "Search chat history for Task 0", exact: true }).click()
    await worktree.getByRole("textbox").fill("Conversation")
    await check(worktree.locator(".am-history-row")).toHaveCount(30)
    for (const action of ["pin", "section", "accordion", "accordion"]) await command(page, action)
    await check(worktree.getByRole("textbox")).toHaveValue("Conversation")
    await check(worktree.getByRole("button", { name: "Toggle chat history for Task 0", exact: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    const pins = await page.locator("body").getAttribute("data-history-pins")
    await worktree
      .locator(".am-history-row")
      .first()
      .click({ modifiers: ["Shift"] })
    await check(page.locator("body")).toHaveAttribute("data-history-opens", "1")
    expect(await page.locator("body").getAttribute("data-history-pins")).toBe(pins)
    expect(await page.locator("body").evaluate((el) => el.classList.contains("am-wt-dragging-active"))).toBe(false)
    await check.poll(() => worktree.locator('.am-history-row[aria-current="page"]').count()).toBe(1)
    await check(context(page, "b:w-0").locator('.am-history-row[aria-current="page"]')).toHaveCount(0)
    await worktree.locator(".am-history-row").first().click({ button: "right" })
    await check(page.getByRole("menu")).toHaveCount(1)
    await check(page.getByRole("menuitem", { name: "Fork Session", exact: true })).toBeVisible()
    await check(page.getByRole("menuitem", { name: "Delete worktree", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")

    await page.goto(`${server.url}?collapsed&total=75`)
    await command(page, "initial-fail")
    const collapsed = context(page)
    await collapsed.getByRole("button", { name: "Toggle chat history for local", exact: true }).click()
    await check(collapsed.getByRole("alert")).toContainText("Could not load history.")
    await command(page, "recover")
    await collapsed.getByRole("button", { name: "Retry", exact: true }).click()
    await check(collapsed.locator(".am-history-row")).toHaveCount(30)
    expect(errors).toEqual([])
  } finally {
    await browserContext.close()
    await browser.close()
    await server.stop(true)
  }
}, 180000)

it.serial(
  "keeps 200 collapsed worktrees lazy and 5000 cached rows bounded with sub-100ms p95 interactions",
  async () => {
    const server = await historyBrowser()
    const browser = await chromium.launch({ headless: true })
    const browserContext = await browser.newContext({ viewport: { width: 1000, height: 850 } })
    const page = await browserContext.newPage()
    try {
      await page.goto(`${server.url}?collapsed&worktrees=200&total=5000&bulk`)
      await check(page.locator(".am-worktree-item")).toHaveCount(202)
      await check(page.locator("body")).toHaveAttribute("data-history-requests", "0")
      const local = context(page)
      const toggle = local.getByRole("button", { name: "Toggle chat history for local", exact: true })
      await toggle.click()
      await check(local.locator(".am-history-row").first()).toBeVisible()
      expect(await local.locator(".am-history-row").count()).toBeLessThan(31)
      expect(Number(await page.locator("body").getAttribute("data-history-requests"))).toBeLessThanOrEqual(2)
      const last = local.locator('[data-history-session="history-00029"]')
      await last.focus()
      await check(last).toBeFocused()
      expect(await local.locator(".am-history-row").count()).toBeLessThan(31)
      await toggle.click()
      await toggle.click()
      await check(local.locator(".am-history-row").first()).toBeVisible()
      const samples = await toggle.evaluate(async (el) => {
        const samples: number[] = []
        for (let index = 0; index < 20; index++) {
          const start = performance.now()
          ;(el as HTMLButtonElement).click()
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          samples.push(performance.now() - start)
        }
        return samples.sort((a, b) => a - b)
      })
      const p95 = samples.at(Math.ceil(samples.length * 0.95) - 1)!
      console.log(
        `History fixture: 200 collapsed worktrees, 5000 rows, disclosure p95=${p95.toFixed(1)}ms; samples=${samples.map((value) => value.toFixed(1)).join(",")}; rendered=${await local.locator(".am-history-row").count()}`,
      )
      expect(p95).toBeLessThan(100)
      await check(page.locator("body")).toHaveAttribute("data-history-opens", "0")
      for (const theme of ["light-modern", "dark-modern", "hc-light", "hc-black"]) {
        await page.goto(`${server.url}?total=7&width=200&theme=${theme}`)
        await check(context(page).locator(".am-history-row")).toHaveCount(7)
        const result = await new AxeBuilder({ page })
          .include(".am-history")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
        expect(result.violations.map((row) => ({ id: row.id, targets: row.nodes.map((node) => node.target) }))).toEqual(
          [],
        )
      }
    } finally {
      await browserContext.close()
      await browser.close()
      await server.stop(true)
    }
  },
  180000,
)
