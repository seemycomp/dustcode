import { it } from "bun:test"
import { chromium, expect } from "@playwright/test"
import { historyBrowser } from "./helpers/history-browser"

it("keeps selected sidebar cards and history readable while hovered in light and dark themes", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    for (const theme of ["light-vs", "light-modern", "dark-modern"]) {
      await page.goto(`${server.url}?theme=${theme}&total=6`)
      const colors = await page.evaluate(() => {
        const probe = document.createElement("div")
        probe.style.cssText =
          "background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)"
        document.body.append(probe)
        const style = getComputedStyle(probe)
        const colors = { background: style.backgroundColor, foreground: style.color }
        probe.remove()
        return colors
      })
      for (const scope of ["local", "w-0"]) {
        const context = page.locator(`[data-history-context="a:${scope}"]`)
        const card = context.locator(scope === "local" ? ".am-local-item" : ".am-worktree-item")
        await page.mouse.move(900, 800)
        await expect(card).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
        await card.click()
        await page.mouse.move(900, 800)
        await expect(card).toHaveCSS("background-color", colors.background)
        await expect(card).toHaveCSS("color", colors.foreground)
        await card.hover()
        await expect(card).toHaveCSS("background-color", colors.background)
        await expect(card.locator(".am-shortcut-badge")).toHaveCSS("color", colors.foreground)
        if (scope === "local") {
          await expect(card.locator('[data-slot="icon-svg"]').first()).toHaveCSS("color", colors.foreground)
        }
        const row = context.locator(".am-history-row").first()
        await row.click()
        await expect(row).toHaveAttribute("aria-current", "page")
        await expect(row).toHaveCSS("background-color", colors.background)
        await expect(row).toHaveCSS("color", colors.foreground)
        await expect(row.locator("time")).toHaveCSS("color", colors.foreground)
        await row.focus()
        await expect(row).toHaveCSS("background-color", colors.background)
      }
    }
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60000)

it("uses the selected foreground for worktree base and date in Dark Modern", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`${server.url}?theme=dark-modern&total=6`)
    const card = page.locator('[data-history-context="a:w-0"] .am-worktree-item')
    await card.click()
    await page.mouse.move(900, 800)
    await expect(card).toHaveCSS("background-color", "rgb(0, 120, 212)")
    await expect(card).toHaveCSS("color", "rgb(255, 255, 255)")
    await expect(card.locator(".am-wt-name")).toHaveText("Task 0")
    await expect(card.locator(".am-worktree-name")).toHaveText("main")
    await expect(card.locator(".am-worktree-date")).not.toBeEmpty()
    for (const selector of [".am-worktree-meta", ".am-worktree-name", ".am-worktree-date"]) {
      await expect(card.locator(selector)).toHaveCSS("color", "rgb(255, 255, 255)")
    }
    await card.hover()
    await expect(card.locator(".am-worktree-name")).toHaveCSS("color", "rgb(255, 255, 255)")
    await expect(card.locator(".am-worktree-date")).toHaveCSS("color", "rgb(255, 255, 255)")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60000)
