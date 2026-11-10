import { expect, test } from "@playwright/test"

for (const width of [420, 1280]) {
  test(`Context Usage opens from embedded Agent Manager chat at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/iframe.html?id=agentmanager--readable-chat-1280&viewMode=story")

    const trigger = page.getByRole("button", { name: "Context Usage", exact: true })
    const panel = page.getByRole("region", { name: "Context Usage", exact: true })
    await expect(trigger).toBeVisible({ timeout: 30_000 })
    await expect(panel).toHaveCount(0)
    const input = page.locator(".prompt-input-container")
    const before = await input.boundingBox()
    await trigger.click()
    await expect(panel).toBeVisible()
    await expect(panel.locator(".context-usage-group-label")).toHaveText("Session activity · estimated tokens")
    await expect(panel.locator(".context-usage-group-count").first()).toHaveText(/[\d.,]+[KMB]? tokens/)
    await expect(panel.getByRole("button", { name: /Completed steps/ })).toHaveCount(0)
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(panel).toHaveCSS("box-sizing", "border-box")
    await expect
      .poll(async () => {
        const panelBox = await panel.boundingBox()
        if (!panelBox) return false
        return panelBox.x >= 0 && panelBox.x + panelBox.width <= width && panelBox.y >= 0
      })
      .toBe(true)
    expect(await input.boundingBox()).toEqual(before)
    expect(await panel.evaluate((el) => !!el.closest('[data-component="popover-content"]'))).toBe(true)
    await expect(page.locator(".session-dock")).toHaveCount(0)
    await expect(panel.getByRole("slider")).toHaveCount(0)

    const group = panel.getByRole("button", { name: /Other tools/ })
    await group.click()
    await expect(panel.getByRole("slider")).toBeVisible()
    await group.click()
    await expect(panel.getByRole("slider")).toHaveCount(0)

    await trigger.click()
    await expect(panel).toHaveCount(0)
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await trigger.click()
    await expect(panel).toBeVisible()
    await panel.getByRole("button", { name: "Hide context usage", exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  })
}
