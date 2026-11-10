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
