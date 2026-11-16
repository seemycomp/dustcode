import { expect, it } from "bun:test"
import { chromium, expect as check } from "@playwright/test"
import { historyBrowser } from "./helpers/history-browser"
import type { WebviewMessage } from "../webview-ui/src/types/messages"

it("opens a native session without a phantom draft or internal top bar", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 240, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    for (const query of ["", "?stale=1", "?deferred=1"]) {
      await page.goto(new URL(query, server.url).toString())
      expect(errors).toEqual([])
      await check(page.locator(".chat-view")).toBeVisible()
      if (query.includes("deferred")) {
        await check(page.getByRole("tablist")).toHaveCount(0)
        await page.evaluate(() => window.dispatchEvent(new CustomEvent("scope-ready")))
      }
      await check
        .poll(() =>
          page
            .locator("body")
            .getAttribute("data-tabs")
            .then((raw) => JSON.parse(raw ?? "{}")),
        )
        .toEqual({ ids: ["s1"], active: "s1" })
      await check(page.getByRole("tablist")).toHaveCount(0)
      await check(page.locator('[data-component="task-header-scope"]')).toHaveCount(0)
      await check(page.locator('[data-component="task-header-actions"]')).toHaveCount(0)
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("scope-open")))
      await check
        .poll(() =>
          page
            .locator("body")
            .getAttribute("data-tabs")
            .then((raw) => JSON.parse(raw ?? "{}").active),
        )
        .toBe("s2")
      await check(page.getByRole("tablist")).toHaveCount(0)
      await check(page.locator('[data-component="task-header-actions"]')).toHaveCount(0)
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("focusTranscriptSearch")))
      await check(page.locator('[data-component="task-header-search"]')).toBeVisible()
    }
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("retains opaque scope and blank New Task without restoring hidden native chrome", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 240, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(server.url.toString())
    expect(errors).toEqual([])
    await check(page.locator(".chat-view")).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("scope-new")))
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").sidebarActiveSessionTabID),
      )
      .toBe("")
    const saved = await page
      .locator("body")
      .getAttribute("data-saved")
      .then((raw) => JSON.parse(raw ?? "{}"))
    expect(saved.nativeSessionContext).toBe("opaque-original")
    expect(saved.nativeSessionContexts).toEqual({ s1: "opaque-original" })
    expect(JSON.stringify(saved)).not.toContain("projectId")
    expect(JSON.stringify(saved)).not.toContain("directory")
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("scope-ready")))
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").sidebarActiveSessionTabID),
      )
      .toBe("")
    await check(page.getByRole("tablist")).toHaveCount(0)
    await check(page.locator('[data-component="task-header-scope"]')).toHaveCount(0)
    await check(page.locator('[data-component="task-header-actions"]')).toHaveCount(0)
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("scope-message", {
          detail: { type: "nativeSessionContext", sessionID: "s2", context: "opaque-new" },
        }),
      ),
    )
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").nativeSessionContext),
      )
      .toBe("opaque-new")
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("keeps the internal tab strip for non-native shared chat surfaces", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(new URL("?surface=sidebar", server.url).toString())
    expect(errors).toEqual([])
    await check(page.getByRole("tablist")).toBeVisible()
    await check(page.getByRole("tab")).toHaveCount(2)
    await check(page.locator('[data-component="task-header-actions"]')).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("hides native application chrome even when the host enables its top bar", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 240, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(new URL("?app=1", server.url).toString())
    expect(errors).toEqual([])
    await check(page.locator(".chat-view")).toBeVisible()
    await check(page.locator(".sidebar-top-bar")).toHaveCount(0)
    await check(page.getByRole("tablist")).toHaveCount(0)
    await check(page.locator('[data-component="task-header-scope"]')).toHaveCount(0)
    await check(page.locator('[data-component="task-header-actions"]')).toHaveCount(0)
    await page.goto(new URL("?app=1&surface=sidebar", server.url).toString())
    await check(page.locator(".chat-view")).toBeVisible()
    await check(page.locator(".sidebar-top-bar")).toBeVisible()
    await check(page.getByRole("tablist")).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)

it("preserves a real App New Task draft before the first restoring ready", async () => {
  const server = await historyBrowser("native-chat-scope")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(new URL("?app=1&restore=1&deferred=1", server.url).toString())
    expect(errors).toEqual([])
    const editor = page.getByRole("textbox")
    await check(editor).toBeVisible()
    await editor.fill("Keep this draft before the first ready")
    await check(editor).toHaveValue("Keep this draft before the first ready")
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("scope-message", {
          detail: { type: "action", action: "plusButtonClicked" },
        }),
      ),
    )
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").sidebarActiveSessionTabID),
      )
      .toBe("")
    await check(editor).toHaveValue("Keep this draft before the first ready")
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("scope-ready")))
    await check
      .poll(() =>
        page
          .locator("body")
          .getAttribute("data-saved")
          .then((raw) => JSON.parse(raw ?? "{}").sidebarActiveSessionTabID),
      )
      .toBe("")
    await check(editor).toHaveValue("Keep this draft before the first ready")
    const messages = await page
      .locator("body")
      .getAttribute("data-messages")
      .then((raw) => JSON.parse(raw ?? "[]") as WebviewMessage[])
    expect(messages.filter((message) => message.type === "loadMessages" && message.sessionID === "s1")).toEqual([])
    await check(page.locator(".sidebar-top-bar")).toHaveCount(0)
    await check(page.getByRole("tablist")).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)
