import { expect, it } from "bun:test"
import { chromium, expect as check } from "@playwright/test"
import { historyBrowser } from "./helpers/history-browser"

it("opens one project-scoped chooser, defaults to chat-only, and commits only after confirmation", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(`${server.url}?transfer`)
    const row = page.locator('[data-history-context="a:w-0"] [data-history-session="history-00000"]')
    await check(row).toBeVisible()
    await row.click({ button: "right" })
    await page.getByRole("menuitem", { name: /Copy to worktree/ }).hover()
    await page.getByRole("menuitem", { name: "Existing Worktree...", exact: true }).click()
    await check(page.getByRole("dialog")).toBeVisible()
    await check(page.locator("body")).toHaveAttribute("data-history-opens", "0")
    await page.getByRole("button", { name: /Other worktree/ }).click()
    await page.getByRole("button", { name: /Other worktree/ }).press("Enter")
    await page.getByRole("button", { name: "Review transfer", exact: true }).click()
    await check(page.getByText("Chat only. No files will be copied.", { exact: true })).toBeVisible()
    const preview = JSON.parse((await page.locator("body").getAttribute("data-history-transfer"))!)
    expect(preview).toMatchObject({
      phase: "preview",
      projectId: "a",
      sourceWorktreeId: "w-0",
      sourceSessionId: "history-00000",
      targetWorktreeId: "w-1",
      action: "copy",
      selectedFiles: [],
    })
    expect(await page.locator("body").getAttribute("data-history-transferred")).toBeNull()
    await page.getByRole("button", { name: "Copy conversation", exact: true }).click()
    await check(page.getByRole("dialog")).toHaveCount(0)
    await check(page.locator("body")).toHaveAttribute("data-history-transferred", "copied-session")
    const commit = JSON.parse((await page.locator("body").getAttribute("data-history-transfer"))!)
    expect(commit.operationID).toBe(preview.operationID)
    expect(commit).toMatchObject({ phase: "commit", revision: "revision", fingerprint: "fingerprint" })
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60_000)

it("requires explicit file opt-in and sends only selected paths", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  try {
    await page.goto(`${server.url}?transfer`)
    await page
      .locator('[data-history-context="a:w-0"] [data-history-session="history-00000"]')
      .click({ button: "right" })
    await page.getByRole("menuitem", { name: /Copy to worktree/ }).hover()
    await page.getByRole("menuitem", { name: "Existing Worktree...", exact: true }).click()
    await page.getByRole("button", { name: /Other worktree/ }).click()
    await page.getByText("Copy selected file changes", { exact: true }).click()
    await page.getByText("selected.ts", { exact: true }).click()
    await page.getByRole("button", { name: "Review transfer", exact: true }).click()
    await check(page.getByText("1 selected files will be applied as unstaged changes.", { exact: true })).toBeVisible()
    const preview = JSON.parse((await page.locator("body").getAttribute("data-history-transfer"))!)
    expect(preview.selectedFiles).toEqual(["selected.ts"])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60_000)

it("keeps new-worktree provisioning scoped to the transfer operation", async () => {
  const server = await historyBrowser()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  try {
    await page.goto(`${server.url}?transfer`)
    await page
      .locator('[data-history-context="a:w-0"] [data-history-session="history-00000"]')
      .click({ button: "right" })
    await page.getByRole("menuitem", { name: /Copy to worktree/ }).hover()
    await page.getByRole("menuitem", { name: "New Worktree...", exact: true }).click()
    await page.getByRole("button", { name: "Create Worktree", exact: true }).click()
    const preview = JSON.parse((await page.locator("body").getAttribute("data-history-transfer"))!)
    expect(preview).toMatchObject({ phase: "preview", create: true, action: "copy", selectedFiles: [] })
    await page.getByRole("button", { name: "Copy conversation", exact: true }).click()
    await check(page.locator("body")).toHaveAttribute("data-history-transferred", "copied-session")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60_000)
