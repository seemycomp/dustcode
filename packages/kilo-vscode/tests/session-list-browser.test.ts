import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import { historyBrowser } from "./helpers/history-browser"

const messages = (page: Page, type: string) =>
  page
    .locator("body")
    .getAttribute("data-messages")
    .then((value) => (JSON.parse(value ?? "[]") as Array<{ type: string }>).filter((message) => message.type === type))

it("renders history rows without an action gutter and exposes every action as a labeled icon menu item", async () => {
  const server = await historyBrowser("session-list")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const action = (name: string) => page.getByRole("menuitem", { name, exact: true })
  try {
    await page.goto(server.url.toString())
    const row = page.getByRole("button", { name: /^saved conversation/ })
    await check(row).toBeVisible()
    await row.hover()
    await check(page.locator('[data-slot="session-row-action"]')).toHaveCount(0)
    await check(page.locator(".session-row").first().getByRole("button")).toHaveCount(1)
    const geometry = await row.evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      parent: el.parentElement!.getBoundingClientRect().width,
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }))
    expect(geometry.parent - geometry.width).toBeLessThanOrEqual(1)
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client)
    await row.click({ button: "right" })
    for (const label of [
      "Rename",
      "Export session transcript",
      "Open in Separate Tab",
      "Open in worktree",
      "Open locally",
      "Delete",
    ]) {
      await check(action(label)).toBeVisible()
      await check(action(label).locator('[data-component="icon"]')).toHaveCount(1)
    }
    for (const activation of ["click", "Enter", "Space"]) {
      if (activation !== "click") await row.click({ button: "right" })
      await (activation === "click"
        ? action("Open in Separate Tab").click()
        : action("Open in Separate Tab").press(activation))
    }
    expect(await messages(page, "openSessionInTab")).toEqual(
      Array.from({ length: 3 }, () => ({ type: "openSessionInTab", sessionID: "saved" })),
    )
    await check(page.locator("body")).not.toHaveAttribute("data-selected")
    await row.click({ button: "right" })
    await action("Export session transcript").click()
    expect(await messages(page, "exportSessionTranscript")).toEqual([
      { type: "exportSessionTranscript", sessionID: "saved" },
    ])
    for (const [label, attribute] of [
      ["Open in worktree", "data-promote"],
      ["Open locally", "data-local"],
    ] as const) {
      await row.click({ button: "right" })
      await action(label).click()
      await check(page.locator("body")).toHaveAttribute(attribute, "saved")
    }
    for (const id of ["sidebar-pending:draft", "cloud:preview"]) {
      await page.getByRole("button", { name: `${id} conversation`, exact: false }).click({ button: "right" })
      await check(action("Open in Separate Tab")).toBeDisabled()
      await action("Open in Separate Tab").press("Enter")
      await page.keyboard.press("Escape")
    }
    expect(await messages(page, "openSessionInTab")).toHaveLength(3)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("keeps keyboard selection separate from menu rename and confirmed deletion", async () => {
  const server = await historyBrowser("session-list")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const action = (name: string) => page.getByRole("menuitem", { name, exact: true })
  try {
    await page.goto(server.url.toString())
    const row = page.getByRole("button", { name: /^saved conversation/ })
    await row.focus()
    await page.keyboard.press("Shift+F10")
    await check(action("Rename")).toBeVisible()
    await action("Rename").focus()
    await page.keyboard.press("Enter")
    const input = page.getByRole("textbox", { name: "Rename", exact: true })
    await check(input).toBeFocused()
    await check(page.locator("body")).not.toHaveAttribute("data-selected")
    await input.fill("Updated conversation")
    await input.press("Enter")
    expect(await messages(page, "renameSession")).toEqual([
      { type: "renameSession", sessionID: "saved", title: "Updated conversation" },
    ])
    await row.click({ button: "right" })
    await action("Rename").click()
    await check(input).toBeFocused()
    await input.press("Escape")
    await check(input).toBeHidden()
    await row.click({ button: "right" })
    await action("Delete").click()
    await check(page.getByRole("dialog", { name: "Delete session" })).toBeVisible()
    expect(await messages(page, "deleteSession")).toEqual([])
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await check(row).toBeFocused()
    await row.press("Shift+F10")
    await action("Delete").click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete session", exact: true }).click()
    expect(await messages(page, "deleteSession")).toEqual([{ type: "deleteSession", sessionID: "saved" }])
    await check(page.locator("body")).not.toHaveAttribute("data-selected")
    const search = page.getByPlaceholder("Search sessions...")
    await search.fill("sidebar-pending")
    await search.press("Enter")
    await check(page.locator("body")).toHaveAttribute("data-selected", "sidebar-pending:draft")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)
