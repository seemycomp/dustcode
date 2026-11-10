import { expect, test } from "@playwright/test"

test("nested history keeps six rows and searches beyond the loaded page", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=agentmanager--worktree-history&viewMode=story&globals=theme:kilo-vscode;vscodeTheme:dark-modern",
  )
  const local = page.locator('[data-history-context="a:local"]')
  const viewport = local.locator(".am-history-viewport")
  await expect(local.locator(".am-history-row")).toHaveCount(30)
  expect(await viewport.evaluate((el) => el.clientHeight)).toBe(168)
  await local.getByRole("button", { name: "Search chat history for local", exact: true }).click()
  const input = local.getByRole("textbox", { name: "Search chat history for local", exact: true })
  await input.fill("Needle")
  await expect(local.locator(".am-history-row")).toHaveCount(1)
  await expect(local.locator(".am-history-row")).toContainText("Needle beyond discovery limit")
  await input.press("Escape")
  await expect(input).toHaveCount(0)
  await expect(local.getByRole("button", { name: "Search chat history for local", exact: true })).toBeFocused()
  await expect(local.locator(".am-history-row")).toHaveCount(30)
})

test("history remains outside Shift pinning, menus and drag controls", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=agentmanager--worktree-history&viewMode=story&globals=theme:kilo-vscode;vscodeTheme:dark-modern",
  )
  const worktree = page.locator('[data-history-context="a:w-0"]')
  const row = worktree.locator(".am-history-row").first()
  await expect(row).toBeVisible()
  await row.click({ modifiers: ["Shift"] })
  await expect(row).toHaveAttribute("aria-current", "page")
  await expect(worktree.locator(".am-worktree-item")).not.toHaveAttribute("data-pinned", "true")
  await row.click({ button: "right" })
  await expect(page.getByRole("menu")).toHaveCount(0)
  expect(await page.locator("body").evaluate((el) => el.classList.contains("am-wt-dragging-active"))).toBe(false)
})
