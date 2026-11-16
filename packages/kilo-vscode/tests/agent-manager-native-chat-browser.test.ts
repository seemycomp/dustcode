import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import { historyBrowser } from "./helpers/history-browser"

const messages = (page: Page) =>
  page
    .locator("body")
    .getAttribute("data-messages")
    .then(
      (value) =>
        JSON.parse(value ?? "[]") as { type: string; projectId?: string; sessionId?: string; requestId?: string }[],
    )
const clear = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new CustomEvent("native-fixture", { detail: "clear" })))
const deliver = (page: Page, message: unknown) =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

it("opens native chats through production manager activation without opening on inspection or background events", async () => {
  const server = await historyBrowser("agent-manager-native-chat")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const opens = async () => (await messages(page)).filter((message) => message.type === "agentManager.openSessionInTab")
  try {
    await page.goto(server.url.toString())
    const local = page.locator('[data-history-context="a:local"] [data-history-session="a-local"]')
    await check(local).toBeVisible()
    expect(await opens()).toEqual([])
    await clear(page)
    await page.locator('[data-sidebar-id="a:local"]').click()
    expect(await opens()).toEqual([])
    // Project/worktree inspection and automatic updates must remain management-only.
    await deliver(page, { type: "agentManager.revealSession", projectId: "a", sessionId: "a-local" })
    await deliver(page, {
      type: "sessionCreated",
      projectId: "a",
      session: {
        id: "background",
        title: "Background",
        parentID: null,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
      },
    })
    await deliver(page, {
      type: "agentManager.sessionForked",
      projectId: "b",
      sessionId: "background-fork",
      forkedFromId: "b-local",
    })
    await deliver(page, {
      type: "agentManager.worktreeSetup",
      projectId: "b",
      status: "ready",
      sessionId: "background-worktree",
      worktreeId: "background",
      message: "Ready",
    })
    await deliver(page, { type: "action", action: "toggleDiff" })
    await deliver(page, { type: "action", action: "showTerminal" })
    expect(await opens()).toEqual([])
    await local.click({ button: "right" })
    await page.getByRole("menuitem").filter({ hasText: /^Pin/ }).click()
    expect(await opens()).toEqual([])
    await clear(page)
    await local.click()
    await check.poll(opens).toMatchObject([{ projectId: "a", sessionId: "a-local" }])
    await check(local).toBeVisible()
    const tab = page.locator('[data-tab-id="a-local"] [role="tab"]')
    await check(tab).toBeVisible()
    await clear(page)
    await tab.click()
    await check.poll(opens).toEqual([{ type: "agentManager.openSessionInTab", projectId: "a", sessionId: "a-local" }])
    await clear(page)
    await tab.press("Enter")
    await check.poll(opens).toEqual([{ type: "agentManager.openSessionInTab", projectId: "a", sessionId: "a-local" }])
    await clear(page)
    // Local New Session stays a draft until its owned real-ID response arrives.
    await deliver(page, { type: "action", action: "newTab" })
    const draft = page.locator('[data-tab-id^="pending:"] [role="tab"][aria-selected="true"]')
    await check(draft).toBeVisible()
    const pending = await draft.evaluate((el) => el.closest("[data-tab-id]")!.getAttribute("data-tab-id"))
    expect(await opens()).toEqual([])
    await deliver(page, {
      type: "sessionCreated",
      projectId: "a",
      draftID: pending,
      session: {
        id: "created-local",
        parentID: null,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
      },
    })
    await check
      .poll(opens)
      .toEqual([{ type: "agentManager.openSessionInTab", projectId: "a", sessionId: "created-local" }])
    await deliver(page, {
      type: "sessionCreated",
      projectId: "a",
      session: {
        id: "created-local",
        parentID: null,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
      },
    })
    expect((await opens()).length).toBe(1)
    await clear(page)
    const source = page.locator('[data-tab-id="created-local"] [role="tab"]')
    await check(source).toBeVisible()
    const start = (await source.boundingBox())!
    const end = (await tab.boundingBox())!
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 })
    await page.mouse.up()
    expect(await opens()).toEqual([])
    await check(source).toBeVisible()
    await clear(page)
    const inactive = page.locator('[data-history-context="b:w"] [data-history-session="b-worktree"]')
    await inactive.focus()
    await inactive.press("Enter")
    await check.poll(opens).toMatchObject([{ projectId: "b", sessionId: "b-worktree" }])
    await check(inactive).toBeVisible()
    await clear(page)
    // An explicit fork is correlated to its source, not to every fork event.
    await inactive.click({ button: "right" })
    await page.getByRole("menuitem", { name: "Fork Session", exact: true }).click()
    expect(await opens()).toEqual([])
    await deliver(page, {
      type: "agentManager.sessionForked",
      projectId: "b",
      sessionId: "fork",
      forkedFromId: "b-worktree",
      worktreeId: "w",
    })
    await check.poll(opens).toEqual([{ type: "agentManager.openSessionInTab", projectId: "b", sessionId: "fork" }])
    await deliver(page, {
      type: "agentManager.sessionForked",
      projectId: "b",
      sessionId: "fork",
      forkedFromId: "b-worktree",
      worktreeId: "w",
    })
    expect((await opens()).length).toBe(1)
    await clear(page)
    await inactive.click({ button: "right" })
    await page.getByRole("menuitem", { name: "New Session", exact: true }).click()
    expect(await opens()).toEqual([])
    const request = (await messages(page)).find((msg) => msg.type === "agentManager.addSessionToWorktree")!
    await deliver(page, {
      type: "agentManager.sessionAdded",
      requestId: request.requestId,
      projectId: "b",
      sessionId: "new-worktree-chat",
      worktreeId: "w",
    })
    await check
      .poll(opens)
      .toEqual([{ type: "agentManager.openSessionInTab", projectId: "b", sessionId: "new-worktree-chat" }])
    await deliver(page, {
      type: "agentManager.sendInitialMessage",
      projectId: "b",
      sessionId: "new-worktree-chat",
      worktreeId: "w",
      text: "Exactly one initial prompt",
    })
    const sends = (await messages(page)).filter((message) => message.type === "sendMessage")
    expect(sends).toHaveLength(1)
    expect(
      (await messages(page)).filter((message) => message.type === "agentManager.addSessionToWorktree"),
    ).toHaveLength(1)
    expect((await opens()).length).toBe(1)
    await clear(page)
    await deliver(page, { type: "action", action: "quickWorktree" })
    expect(await opens()).toEqual([])
    await deliver(page, {
      type: "agentManager.worktreeSetup",
      projectId: "b",
      status: "creating",
      worktreeId: "new-tree",
      message: "Creating",
    })
    expect(await opens()).toEqual([])
    await deliver(page, {
      type: "agentManager.worktreeSetup",
      projectId: "b",
      status: "ready",
      worktreeId: "new-tree",
      sessionId: "initial-chat",
      message: "Ready",
    })
    await check
      .poll(opens)
      .toEqual([{ type: "agentManager.openSessionInTab", projectId: "b", sessionId: "initial-chat" }])
    await deliver(page, {
      type: "agentManager.sendInitialMessage",
      projectId: "b",
      worktreeId: "new-tree",
      sessionId: "initial-chat",
      text: "Initial worktree prompt",
    })
    expect((await messages(page)).filter((message) => message.type === "sendMessage")).toHaveLength(1)
    expect((await messages(page)).filter((message) => message.type === "agentManager.createWorktree")).toHaveLength(1)
    expect((await opens()).length).toBe(1)
    expect((await messages(page)).some((message) => message.type === "agentManager.closeSession")).toBe(false)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)
