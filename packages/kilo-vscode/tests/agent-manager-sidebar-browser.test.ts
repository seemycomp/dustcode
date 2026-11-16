import { expect, it } from "bun:test"
import { chromium, expect as check, type Page } from "@playwright/test"
import type { AgentManagerStateMessage, ExtensionMessage } from "../webview-ui/src/types/messages"
import { historyBrowser } from "./helpers/history-browser"

const deliver = (page: Page, message: ExtensionMessage | "clear" | "initialize") =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("native-fixture", { detail })), message)

it("uses a full-width manager navigator at 300px and opens sessions as native tabs", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.goto(server.url.toString())
    const layout = page.locator('.am-layout[data-presentation="sidebar"]')
    await check(layout).toBeVisible()
    await check(page.locator(".am-presentation-toolbar")).toBeHidden()
    await check(page.locator(".am-detail")).toBeHidden()
    const sidebar = page.locator(".am-sidebar")
    await check(sidebar).toBeVisible()
    expect((await sidebar.boundingBox())?.width).toBe(300)
    const local = page.locator('[data-history-context="a:local"] [data-history-session="a-local"]')
    const worktree = page.locator('[data-history-context="b:w"] [data-history-session="b-worktree"]')
    await check(local).toBeVisible()
    await check(worktree).toBeVisible()
    await local.click()
    await worktree.focus()
    await worktree.press("Enter")
    await check
      .poll(async () =>
        JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]").filter(
          (msg: { type: string }) => msg.type === "agentManager.openSessionInTab",
        ),
      )
      .toMatchObject([
        { projectId: "a", sessionId: "a-local" },
        { projectId: "b", sessionId: "b-worktree" },
      ])
    await check(
      page.locator(".am-worktree-item-active, .am-local-item-active, .am-history-row[aria-current]"),
    ).toHaveCount(0)
    await deliver(page, { type: "action", action: "focusInput" })
    await check(page.locator(".am-detail")).toBeVisible()
    await check(sidebar).toBeHidden()
    await page.getByRole("button", { name: "Projects and sessions", exact: true }).click()
    await check(sidebar).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(300)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it.each([
  { action: "focusInput", draft: false },
  { action: "focusInput", draft: true },
  { action: "focusSearch", draft: false },
  { action: "appendChatBoxMessage", draft: false },
  { action: "appendChatBoxMessage", draft: true },
] as const)(
  "reveals and focuses $action from the compact navigator (draft: $draft)",
  async ({ action, draft }) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
      await deliver(page, { type: "connectionState", state: "connected" })
      if (draft) {
        await deliver(page, { type: "agentManager.revealSession", projectId: "a", sessionId: "a-local" })
        await deliver(page, { type: "action", action: "newTab" })
      }
      if (!draft) {
        await page.locator('[data-history-context="b:w"] [data-history-session="b-worktree"]').click()
        await deliver(page, { type: "action", action: "focusInput" })
      }
      const input = page.locator("textarea.prompt-input")
      await check(input).toBeVisible()
      await input.fill("Preserved draft")
      const tab = page.locator('[data-tab-id] [role="tab"][aria-selected="true"]')
      const id = await tab.evaluate((el) => el.closest("[data-tab-id]")!.getAttribute("data-tab-id"))
      expect(draft ? id?.startsWith("pending:") : id === "b-worktree").toBe(true)
      await page.getByRole("button", { name: "Projects and sessions", exact: true }).click()
      await check(page.locator(".am-detail")).toBeHidden()
      await check(page.locator(".am-sidebar")).toBeVisible()
      await deliver(page, "clear")
      await deliver(
        page,
        action === "appendChatBoxMessage"
          ? { type: "appendChatBoxMessage", text: "Terminal context" }
          : { type: "action", action },
      )
      await check(page.locator(".am-detail")).toBeVisible()
      await check(page.locator(".am-sidebar")).toBeHidden()
      await check(input).toHaveValue(
        action === "appendChatBoxMessage" ? "Preserved draft\n\nTerminal context" : "Preserved draft",
      )
      await check(
        action === "focusSearch" ? page.locator('[data-slot="transcript-search-input"]') : input,
      ).toBeFocused()
      if (action === "appendChatBoxMessage") {
        await page.getByRole("button", { name: "Projects and sessions", exact: true }).click()
        // Terminal Add to Context sends these two protocol messages in order.
        await page.evaluate(() => {
          for (const detail of [
            { type: "appendChatBoxMessage", text: "More terminal context" },
            { type: "action", action: "focusInput" },
          ])
            window.dispatchEvent(new CustomEvent("native-fixture", { detail }))
        })
        await check(page.locator(".am-detail")).toBeVisible()
        await check(input).toBeFocused()
        await check(input).toHaveValue("Preserved draft\n\nTerminal context\n\nMore terminal context")
      }
      await check(page.locator(`[data-tab-id="${id}"] [role="tab"]`)).toHaveAttribute("aria-selected", "true")
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
      }[]
      expect(
        messages.filter((msg) =>
          [
            "sendMessage",
            "createSession",
            "agentManager.createWorktree",
            "agentManager.addSessionToWorktree",
            "agentManager.openSessionInTab",
          ].includes(msg.type),
        ),
      ).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it.each([240, 300])(
  "keeps New Worktree usable in-place at %dpx without opening an editor or creating anything",
  async (width) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width, height: 600 } })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
      await deliver(page, "clear")
      await page.getByRole("button", { name: "New Worktree", exact: true }).first().click()
      const dialog = page.getByRole("dialog", { name: "New Worktree", exact: true })
      await check(dialog).toBeVisible()
      const fits = async () => {
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600)
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        expect(
          await dialog
            .locator(
              ".am-nv-dialog-content, .am-nv-dialog-footer, .am-nv-start, .am-nv-origin, .am-nv-name-row, .am-prompt-input-container, .prompt-input-hint, .am-import-tab",
            )
            .evaluateAll((list) => list.every((el) => el.scrollWidth <= el.clientWidth)),
        ).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      }
      await fits()
      await dialog.locator(".am-nv-name-input").fill("Narrow sidebar worktree")
      await dialog.locator(".am-nv-branch-input").fill("feature/sidebar-popup")
      await dialog.locator("textarea").fill("Preserve this draft while choosing a project and branch.")
      await dialog.locator(".am-nv-origin-project").click()
      const projects = page.locator(".am-nv-origin-projects")
      await check(projects).toBeVisible()
      const rect = await projects.boundingBox()
      expect(rect!.x).toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
      expect(await projects.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await projects.getByText("Project B", { exact: true }).click()
      await deliver(page, {
        type: "agentManager.branches",
        projectId: "b",
        defaultBranch: "main",
        branches: [
          { name: "main", isRemote: false, isCheckedOut: false },
          { name: "feature/" + "long-branch-".repeat(12), isRemote: false, isCheckedOut: false },
        ],
      })
      await dialog.locator(".am-nv-origin-branch").click()
      const branches = page.locator(".am-nv-origin-dropdown")
      await check(branches).toBeVisible()
      const bounds = await branches.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await branches.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await branches.locator("input").fill("main")
      await branches.locator(".am-branch-item").first().click()
      await check(dialog.locator("textarea")).toHaveValue("Preserve this draft while choosing a project and branch.")
      await dialog.locator(".am-nv-pill").filter({ hasText: /^4$/ }).click()
      await check(dialog.locator(".am-nv-pill-active")).toHaveText("4")
      await dialog.locator(".am-nv-submit").scrollIntoViewIfNeeded()
      await check(dialog.locator(".am-nv-submit")).toBeInViewport({ ratio: 1 })
      await fits()
      await dialog.locator(".am-nv-pill-compare").click()
      await dialog.locator(".am-nv-compare-section .am-selector-trigger").click()
      const models = page.locator(".am-compare-popover")
      await check(models).toBeVisible()
      const box = await models.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(await models.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await dialog.locator(".am-nv-compare-section .am-selector-trigger").click()
      await dialog.locator(".am-nv-pill-back").click()
      await fits()
      await dialog.getByRole("tab", { name: "Import", exact: true }).click()
      await check(dialog.locator(".am-pr-input")).toBeVisible()
      await dialog.locator(".am-pr-input").fill("https://example.invalid/pull/1")
      await fits()
      await dialog.getByRole("button", { name: "Close", exact: true }).click()
      await check(dialog).toHaveCount(0)
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
      }[]
      expect(
        messages.filter((msg) =>
          [
            "agentManager.openDialog",
            "agentManager.openSessionInTab",
            "createSession",
            "sendMessage",
            "agentManager.createWorktree",
            "agentManager.createMultiVersion",
            "agentManager.importFromPR",
            "agentManager.importFromBranch",
          ].includes(msg.type),
        ),
      ).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it.each([240, 300])(
  "keeps Keyboard Shortcuts local and scrollable from the menu and host at %dpx",
  async (width) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width, height: 400 } })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    try {
      await page.goto(server.url.toString())
      await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
      await deliver(page, "clear")
      for (const action of ["menu", "host"] as const) {
        if (action === "menu") await page.getByRole("button", { name: "Keyboard Shortcuts", exact: true }).click()
        if (action === "host") await deliver(page, { type: "action", action: "showShortcuts" })
        const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts", exact: true })
        await check(dialog).toBeVisible()
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400)
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        expect(
          await dialog
            .locator('[data-slot="dialog-header"], .am-shortcuts, .am-shortcuts-row, .am-shortcuts-keys')
            .evaluateAll((list) => list.every((el) => el.scrollWidth <= el.clientWidth)),
        ).toBe(true)
        const list = dialog.locator(".am-shortcuts")
        expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
        const last = dialog.locator(".am-shortcuts-row").last()
        await last.scrollIntoViewIfNeeded()
        await check(last).toBeInViewport({ ratio: 1 })
        expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await dialog.getByRole("button", { name: "Close", exact: true }).click()
        await check(dialog).toHaveCount(0)
      }
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
      }[]
      expect(
        messages.filter((msg) =>
          [
            "agentManager.openDialog",
            "agentManager.openSessionInTab",
            "createSession",
            "sendMessage",
            "agentManager.createWorktree",
            "agentManager.createMultiVersion",
            "agentManager.addSessionToWorktree",
          ].includes(msg.type),
        ),
      ).toEqual([])
      await check(page.locator(".am-sidebar")).toBeVisible()
      await check(page.locator(".am-detail")).toBeHidden()
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("still routes other large sidebar dialogs to the editor without creating a session or worktree", async () => {
  const server = await historyBrowser("agent-manager-sidebar")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 300, height: 800 } })
  try {
    await page.goto(server.url.toString())
    await check(page.locator('[data-sidebar-id="a:local"]')).toBeVisible()
    await deliver(page, "clear")
    await page.locator(".am-project-create").click()
    await check.poll(() => page.locator("body").getAttribute("data-messages")).toContain("agentManager.openDialog")
    const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")
    expect(messages.filter((msg: { type: string }) => msg.type === "agentManager.openDialog")).toEqual([
      { type: "agentManager.openDialog", dialog: "project" },
    ])
    expect(
      messages.some((msg: { type: string }) => ["createSession", "agentManager.createWorktree"].includes(msg.type)),
    ).toBe(false)
    await check(page.getByRole("dialog")).toHaveCount(0)
    await check(page.locator(".am-sidebar")).toBeVisible()
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it.each(["agent-manager-sidebar", "agent-manager-native-chat"])(
  "shows the worktree name and recorded base instead of its chat title in %s",
  async (fixture) => {
    const server = await historyBrowser(fixture)
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: fixture.endsWith("sidebar") ? 300 : 1200, height: 900 } })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    try {
      await page.goto(server.url.toString())
      const row = page.locator('[data-sidebar-id="a:w"]')
      const local = page.locator('[data-sidebar-id="a:local"]')
      await check(row.locator(".am-wt-name")).toHaveText("feature/a")
      await check(row.locator(".am-worktree-name")).toHaveText("origin/main")
      await check(row).not.toContainText("a-worktree chat")
      await check(page.locator('[data-history-context="a:w"] [data-history-session="a-worktree"]')).toContainText(
        "a-worktree chat",
      )
      await deliver(page, {
        type: "agentManager.localStats",
        projectId: "a",
        stats: { branch: "local-development", files: 1, additions: 7, deletions: 2, ahead: 0, behind: 0 },
      })
      await check(local.locator(".am-local-label")).toHaveText("local")
      await check(local.locator(".am-local-branch")).toHaveText("local-development")
      await check(local.locator(".am-worktree-stats")).toContainText("+7")
      const handle = await row.elementHandle()
      const meta = await row.locator(".am-worktree-meta").elementHandle()
      const state: AgentManagerStateMessage = {
        type: "agentManager.state",
        projectId: "a",
        isGitRepo: true,
        worktrees: [
          {
            id: "w",
            label: "New session - 2026-11-14T07:37:13.511Z",
            branch: "comet-garage",
            path: "/repos/a/w",
            parentBranch: "main",
            remote: "origin",
            createdAt: "2026-11-01T00:00:00Z",
          },
        ],
        sessions: [{ id: "a-worktree", worktreeId: "w", createdAt: "2026-11-01T00:00:00Z" }],
        historyInitialized: true,
        historyExpanded: { local: true, w: true },
      }
      await deliver(page, state)
      await check(row.locator(".am-wt-name")).toHaveText("comet-garage")
      await check(row.locator(".am-worktree-name")).toHaveText("origin/main")
      await row.locator(".am-wt-name").dblclick()
      const rename = row.locator(".am-worktree-rename-input")
      await check(rename).toHaveValue("comet-garage")
      await rename.fill("Renamed worktree")
      await rename.press("Enter")
      await check
        .poll(() => page.locator("body").getAttribute("data-messages"))
        .toContain(
          JSON.stringify({
            type: "agentManager.renameWorktree",
            worktreeId: "w",
            label: "Renamed worktree",
            projectId: "a",
          }),
        )
      state.worktrees.at(0)!.label = "Renamed worktree"
      await deliver(page, state)
      await check(row.locator(".am-wt-name")).toHaveText("comet-garage")
      await check(row.locator(".am-worktree-name")).toHaveText("origin/main")
      state.worktrees.at(0)!.parentBranch = "release/next"
      state.worktrees.at(0)!.remote = "upstream"
      await deliver(page, state)
      await check(row.locator(".am-worktree-name")).toHaveText("upstream/release/next")
      await check(row.locator(".am-worktree-name")).toHaveAttribute("title", "upstream/release/next")
      delete state.worktrees.at(0)!.remote
      await deliver(page, state)
      await check(row.locator(".am-worktree-name")).toHaveText("release/next")
      Reflect.deleteProperty(state.worktrees.at(0)!, "parentBranch")
      state.worktrees.at(0)!.remote = "origin"
      await deliver(page, state)
      await check(row.locator(".am-worktree-name")).toBeEmpty()
      await check(row).not.toContainText("origin/")
      await check(row.locator(".am-wt-name")).toHaveText("comet-garage")
      await check(row).not.toContainText("a-worktree chat")
      await check(row.locator(".am-worktree-base, .am-worktree-separator, .am-worktree-subtitle")).toHaveCount(0)
      await check(row.locator(".am-worktree-meta")).toHaveCount(1)
      await check(row.locator(".am-worktree-status")).toHaveCount(1)
      expect((await row.locator(".am-worktree-status").boundingBox())!.height).toBeGreaterThanOrEqual(15)
      expect(await handle!.evaluate((el) => el.isConnected)).toBe(true)
      expect(await meta!.evaluate((el) => el.isConnected)).toBe(true)
      await check(local.locator(".am-local-label")).toHaveText("local")
      await check(local.locator(".am-local-branch")).toHaveText("local-development")
      await check(local.locator("time")).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it.each([240, 300].flatMap((width) => ["light-modern", "dark-modern"].map((theme) => ({ width, theme }))))(
  "keeps inline worktree metadata, health actions and menus inside a $width px $theme sidebar",
  async ({ width, theme }) => {
    const server = await historyBrowser("agent-manager-sidebar")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    await page.clock.install()
    try {
      await page.goto(`${server.url}?theme=${theme}`)
      await page.evaluate(() =>
        document.documentElement.style.setProperty("--vscode-editorWarning-foreground", "rgb(255, 193, 7)"),
      )
      await check(page.locator('[data-sidebar-id="a:w"]')).toBeVisible()
      const state: AgentManagerStateMessage = {
        type: "agentManager.state",
        projectId: "a",
        isGitRepo: true,
        worktrees: [
          {
            id: "w",
            label: "Worktree title " + "long-title-".repeat(12),
            branch: "feature/" + "long-branch-".repeat(12),
            path: "/repo/" + "long-path-".repeat(12),
            parentBranch: "release/" + "long-base-".repeat(12),
            remote: "origin",
            createdAt: "2026-11-01T00:00:00Z",
          },
        ],
        sessions: [{ id: "a-worktree", worktreeId: "w", createdAt: "2026-11-01T00:00:00Z" }],
        worktreeHealth: { w: "absent-restorable" },
        historyInitialized: true,
        historyExpanded: { local: true, w: true },
      }
      await deliver(page, state)
      const row = page.locator('[data-sidebar-id="a:w"]')
      await row.locator(".am-wt-content").hover()
      await check(page.locator(".am-worktree-hover-card, [data-component='hover-card']")).toHaveCount(0)
      const card = row
      await check(card).toBeVisible()
      const bounds = await card.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800)
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await check(row.locator(".am-wt-name")).toHaveText(state.worktrees.at(0)!.label!)
      await check(row.locator(".am-worktree-meta > span")).toHaveText([`origin/${state.worktrees.at(0)!.parentBranch}`])
      await check(row.locator(".am-worktree-base, .am-worktree-separator")).toHaveCount(0)
      await check(row.locator(".am-worktree-meta time")).toHaveCount(0)
      await check(row.locator(".am-worktree-date")).toHaveCount(1)
      await check(row.locator(".am-worktree-subtitle")).toHaveCount(0)
      await check(row).not.toContainText(/Worktree:|Sessions:|Files:|Base:|Ctrl\+Alt/)
      await check(row.locator(".am-worktree-close")).toHaveCount(0)
      await check(row.locator('.am-wt-hover-actions button[aria-label="Delete worktree"]')).toHaveCount(0)
      const local = page.locator('[data-sidebar-id="a:local"]')
      for (const content of [row.locator(".am-wt-content"), local.locator(".am-local-text")]) {
        expect(await content.evaluate((el) => el.lastElementChild?.className)).toBe("am-worktree-status")
        await check(content.locator(".am-worktree-status")).toBeEmpty()
        expect((await content.locator(".am-worktree-status").boundingBox())!.height).toBeGreaterThanOrEqual(15)
      }
      await check(row).not.toContainText("Double-click to rename")
      await check(row).not.toContainText("Shift+click")
      const handle = await row.elementHandle()
      const meta = await row.locator(".am-worktree-meta").elementHandle()
      const date = await row.locator(".am-worktree-date").elementHandle()
      const age = await row.locator(".am-worktree-meta").innerText()
      state.worktrees.at(0)!.path = "/repo/updated-tree"
      state.worktrees.at(0)!.branch = "comet-garage"
      state.worktrees.at(0)!.parentBranch = "release"
      state.worktrees.at(0)!.createdAt = new Date().toISOString()
      state.sessions.push({ id: "second-chat", worktreeId: "w", createdAt: new Date().toISOString() })
      await deliver(page, state)
      await deliver(page, {
        type: "agentManager.worktreeStats",
        projectId: "a",
        stats: [{ worktreeId: "w", files: 3, additions: 12, deletions: 4, ahead: 1, behind: 2 }],
      })
      await check(row.locator(".am-worktree-meta > span")).toHaveText(["origin/release"])
      await check(row).not.toContainText(/Worktree:|Sessions:|Files:|Base:|updated-tree/)
      await check(row.locator(".am-worktree-stats")).toContainText("+12")
      await check(row.locator(".am-worktree-stats")).toContainText("−4")
      expect(await row.locator(".am-worktree-meta").innerText()).not.toBe(age)
      expect(await handle!.evaluate((el) => el.isConnected)).toBe(true)
      expect(await meta!.evaluate((el) => el.isConnected)).toBe(true)
      expect(await date!.evaluate((el) => el.isConnected)).toBe(true)
      const ageText = await row.locator(".am-worktree-date").innerText()
      await page.clock.fastForward(120_000)
      await check(row.locator(".am-worktree-date")).not.toHaveText(ageText)
      expect(await handle!.evaluate((el) => el.isConnected)).toBe(true)
      {
        await page.mouse.move(0, 0)
        await check(row.locator(".am-worktree-stats")).toBeVisible()
        expect(await row.locator(".am-worktree-date").evaluate((el) => getComputedStyle(el).textAlign)).toBe("right")
        const title = (await row.locator(".am-wt-row1").boundingBox())!
        const branch = (await row.locator(".am-worktree-meta").boundingBox())!
        const date = (await row.locator(".am-worktree-date").boundingBox())!
        const stats = (await row.locator(".am-worktree-stats").boundingBox())!
        const status = (await row.locator(".am-worktree-status").boundingBox())!
        const content = (await row.locator(".am-wt-content").boundingBox())!
        expect(title.y).toBeLessThan(branch.y)
        expect(date.y + date.height).toBeLessThanOrEqual(stats.y)
        expect(Math.abs(date.x + date.width - stats.x - stats.width)).toBeLessThan(1)
        expect(status.y).toBeGreaterThanOrEqual(branch.y + branch.height)
        expect(status.width).toBe(content.width)
        expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        expect(await local.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        await check(local.locator("time")).toHaveCount(0)
        await check(row.locator(".am-worktree-name")).toHaveText("origin/release")
      }
      state.worktrees.at(0)!.label = "comet-garage"
      await deliver(page, state)
      await check(row.locator(".am-wt-name")).toHaveText("comet-garage")
      await check(row.locator(".am-worktree-name")).toHaveText("origin/release")
      expect((await row.locator(".am-worktree-meta").boundingBox())!.height).toBeGreaterThanOrEqual(15)
      await row.locator(".am-wt-name").dblclick()
      const rename = row.locator(".am-worktree-rename-input")
      await check(rename).toHaveValue("comet-garage")
      await rename.fill("Cancelled title")
      await rename.press("Escape")
      await check(row.locator(".am-wt-name")).toHaveText("comet-garage")
      expect(await handle!.evaluate((el) => el.isConnected)).toBe(true)
      // Selecting during double-click replays the fixture's original catalog.
      await deliver(page, state)
      const requests = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
        projectId?: string
        worktreeId?: string | null
        requestId?: string
      }[]
      const request = (id: string | null) =>
        requests.findLast(
          (msg) => msg.type === "agentManager.requestHistory" && msg.projectId === "a" && msg.worktreeId === id,
        )!.requestId!
      for (const worktreeId of ["w", null]) {
        await deliver(page, {
          type: "agentManager.history",
          projectId: "a",
          worktreeId,
          requestId: request(worktreeId),
          query: "",
          generation: 2,
          loading: true,
          more: false,
          rows: [],
        })
      }
      for (const item of [row, local]) {
        await check(item.locator(".am-worktree-status [role='status']")).toContainText("Loading")
        expect(await item.locator(".am-worktree-status").evaluate((el) => el.nextElementSibling)).toBeNull()
      }
      await deliver(page, {
        type: "agentManager.history",
        projectId: "a",
        worktreeId: "w",
        requestId: request("w"),
        query: "",
        generation: 3,
        loading: false,
        more: false,
        rows: [],
        error: "History unavailable",
      })
      await check(row.locator(".am-worktree-status [role='alert']")).toBeVisible()
      expect(await row.locator(".am-worktree-status [role='alert']").evaluate((el) => getComputedStyle(el).color)).toBe(
        "rgb(255, 193, 7)",
      )
      expect(await row.locator(".am-worktree-meta").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await row.locator(".am-worktree-stale-badge").hover()
      await page.clock.runFor(450)
      const tooltip = page.locator('[data-component="tooltip"]:visible')
      await check(tooltip).toBeVisible()
      const tip = await tooltip.boundingBox()
      expect(tip!.x).toBeGreaterThanOrEqual(0)
      expect(tip!.x + tip!.width).toBeLessThanOrEqual(width)
      await deliver(page, "clear")
      const restore = card.getByRole("button", { name: /^Restore/ })
      await restore.hover()
      await page.mouse.down()
      await page.clock.runFor(350)
      await check(page.locator("body")).not.toHaveClass(/am-wt-dragging-active/)
      await page.mouse.up()
      await check
        .poll(() => page.locator("body").getAttribute("data-messages"))
        .toContain("agentManager.restoreWorktree")
      expect(JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")).toContainEqual({
        type: "agentManager.restoreWorktree",
        projectId: "a",
        worktreeId: "w",
      })
      const remove = card.getByRole("button", { name: /^Remove/ })
      await remove.hover()
      await page.mouse.down()
      await page.clock.runFor(350)
      await check(page.locator("body")).not.toHaveClass(/am-wt-dragging-active/)
      await page.mouse.up()
      const actions = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]") as {
        type: string
      }[]
      expect(actions.filter((msg) => msg.type === "agentManager.restoreWorktree")).toHaveLength(1)
      expect(actions.filter((msg) => msg.type === "agentManager.removeStaleWorktree")).toHaveLength(1)
      expect(
        actions.filter((msg) => ["agentManager.moveToSection", "agentManager.setWorktreeOrder"].includes(msg.type)),
      ).toEqual([])
      await row.click({ button: "right" })
      const menu = page.locator('[data-component="context-menu-content"]')
      await check(menu).toBeVisible()
      const rect = await menu.boundingBox()
      expect(rect!.x).toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
      await menu.getByRole("menuitem", { name: /^Delete worktree/ }).click()
      await check(row.locator(".am-worktree-delete-hint")).toBeVisible()
      await page.keyboard.press("Escape")
      await check(row.locator(".am-worktree-delete-hint")).toHaveCount(0)
      await row.click({ button: "right" })
      await menu.getByRole("menuitem", { name: /^Delete worktree/ }).click()
      await row.locator(".am-worktree-delete-hint").click()
      await check
        .poll(() => page.locator("body").getAttribute("data-messages"))
        .toContain("agentManager.deleteWorktree")
      await page.keyboard.press("Escape")
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)

it("opens forwarded dialogs in the editor for the requested project without changing its selection", async () => {
  const server = await historyBrowser("agent-manager-native-chat")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  try {
    await page.goto(server.url.toString())
    await check(page.locator('[data-sidebar-id="a:local"]')).toHaveClass(/am-local-item-active/)
    await deliver(page, "clear")
    await deliver(page, { type: "agentManager.openDialog", dialog: "worktree", projectId: "b" })
    await check(page.getByRole("dialog")).toBeVisible()
    await check.poll(() => page.locator("body").getAttribute("data-messages")).toContain('"projectId":"b"')
    const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")
    expect(messages).toContainEqual({ type: "agentManager.requestBranches", projectId: "b" })
    expect(
      messages.some((msg: { type: string }) =>
        [
          "createSession",
          "agentManager.createWorktree",
          "agentManager.activateSelection",
          "agentManager.openSessionInTab",
        ].includes(msg.type),
      ),
    ).toBe(false)
    await check(page.locator('[data-sidebar-id="a:local"]')).toHaveClass(/am-local-item-active/)
    await page.keyboard.press("Escape")
    await check(page.getByRole("dialog")).toHaveCount(0)
    await deliver(page, { type: "agentManager.openDialog", dialog: "apply", projectId: "b", worktreeId: "w" })
    await check(page.getByRole("dialog")).toBeVisible()
    await deliver(page, {
      type: "agentManager.worktreeDiff",
      projectId: "b",
      sessionId: "w#branch",
      diffs: [{ file: "example.ts", before: "old", after: "new", additions: 1, deletions: 1 }],
    })
    await check(page.getByRole("dialog").getByText("example.ts", { exact: true })).toBeVisible()
    await check(page.locator('[data-sidebar-id="a:local"]')).toHaveClass(/am-local-item-active/)
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120_000)

it.each(["worktree", "apply", "orphans"] as const)(
  "retains an early %s dialog until the editor project state arrives",
  async (kind) => {
    const server = await historyBrowser("agent-manager-native-chat")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    try {
      const url = new URL(server.url)
      url.searchParams.set("cold", "true")
      await page.goto(url.toString())
      await check(page.locator('.am-layout[data-presentation="editor"]')).toBeVisible()
      await deliver(page, "clear")
      await deliver(
        page,
        kind === "apply"
          ? { type: "agentManager.openDialog", dialog: kind, projectId: "b", worktreeId: "w" }
          : { type: "agentManager.openDialog", dialog: kind, projectId: "b" },
      )
      await check(page.getByRole("dialog")).toHaveCount(0)
      await deliver(page, "initialize")
      await check(page.getByRole("dialog")).toBeVisible()
      const messages = JSON.parse((await page.locator("body").getAttribute("data-messages")) ?? "[]")
      if (kind === "worktree")
        expect(messages.filter((msg: { type: string }) => msg.type === "agentManager.requestBranches")).toEqual([
          { type: "agentManager.requestBranches", projectId: "b" },
        ])
      expect(
        messages.some((msg: { type: string }) =>
          [
            "createSession",
            "agentManager.createWorktree",
            "agentManager.activateSelection",
            "agentManager.openSessionInTab",
          ].includes(msg.type),
        ),
      ).toBe(false)
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      await server.stop(true)
    }
  },
  120_000,
)
