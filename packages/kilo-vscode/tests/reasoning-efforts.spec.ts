import { expect, test } from "@playwright/test"

test("custom efforts survive save and reopen without changing other models", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      acquireVsCodeApi: () => ({
        getState: () => undefined,
        setState: () => {},
        postMessage: (message: { type: string; requestId?: string; config?: unknown }) => {
          if (message.type !== "saveCustomProvider") return
          localStorage.setItem("storybook-custom-efforts", JSON.stringify(message.config))
          window.postMessage(
            { type: "providerConnected", providerID: "custom", requestId: message.requestId },
            window.origin,
          )
        },
      }),
    })
  })
  await page.goto("/iframe.html?id=settings--custom-provider-efforts&viewMode=story")
  const labels = page.locator("[data-slot='checkbox-checkbox-label']")
  await expect(page.getByRole("checkbox", { name: "Extra High", exact: true }).first()).not.toBeChecked()
  await labels
    .filter({ hasText: /^Extra High$/ })
    .first()
    .click()
  await labels
    .filter({ hasText: /^High$/ })
    .first()
    .click()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("storybook-custom-efforts")!).models)).toEqual({
    "gpt-6.1-sol": {
      name: "GPT 6.1 Sol",
      reasoning: true,
      variants: {
        low: { reasoningEffort: "low" },
        medium: { reasoningEffort: "medium" },
        high: { reasoningEffort: "high", custom: 42, disabled: true },
        xhigh: { reasoningEffort: "xhigh" },
      },
    },
    other: { name: "Other", reasoning: true, variants: { custom: { thinking: { type: "adaptive" } } } },
  })
  await page.reload()
  await expect(page.getByRole("checkbox", { name: "Extra High", exact: true }).first()).toBeChecked()
  await expect(page.getByRole("checkbox", { name: "High", exact: true }).first()).not.toBeChecked()
})

for (const width of [420, 1200]) {
  test(`Extra High supports typeahead and preserves its wire key at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto("/iframe.html?id=shared--reasoning-efforts&viewMode=story")
    const trigger = page.getByRole("button", { name: "Reasoning effort", exact: true })
    await trigger.click()
    await page.keyboard.type("Extra")
    await expect(page.getByRole("option", { name: "Extra High", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(trigger).toHaveText("Extra High")
    await expect(page.getByLabel("Selected variant")).toHaveText("xhigh")
    await trigger.click()
    await page.getByRole("option", { name: "Default", exact: true }).click()
    await expect(page.getByLabel("Selected variant")).toHaveText("unset")
  })

  test(`custom model efforts can be disabled and restored at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto("/iframe.html?id=settings--custom-provider-edit-dialog&viewMode=story")
    const extra = page.getByRole("checkbox", { name: "Extra High", exact: true })
    await expect(extra).toBeChecked()
    await page.getByRole("button", { name: "Apply suggested efforts", exact: true }).click()
    await expect(page.getByRole("button", { name: "Apply suggested efforts", exact: true })).toHaveCount(0)
    await page
      .locator("[data-slot='checkbox-checkbox-label']")
      .filter({ hasText: /^Extra High$/ })
      .click()
    await expect(extra).not.toBeChecked()
    await extra.focus()
    await page.keyboard.press("Space")
    await expect(extra).toBeChecked()
  })
}
