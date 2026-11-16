import { expect, test, type Page } from "@playwright/test"

const GLOBALS = "colorScheme:dark;theme:kilo-vscode;vscodeTheme:dark-modern"

function story(page: Page, id: string) {
  return page.goto(`/iframe.html?id=${id}&viewMode=story&globals=${GLOBALS}`, { waitUntil: "load" })
}

async function native(page: Page, id: string, automatic = true) {
  await page.addInitScript(
    ({ id, automatic }) => {
      const state: { saved: Record<string, unknown>; selections: string[] } = {
        saved: { sidebarSessionTabIDs: ["s1", "s2"], sidebarActiveSessionTabID: id, unrelated: "preserved" },
        selections: [],
      }
      Object.assign(window, {
        nativeTabState: state,
        KILO_TOP_BAR_SURFACE: "tab_title",
        KILO_NATIVE_SESSION_TAB: { sessionID: id, restore: true, context: `context:${id}` },
        acquireVsCodeApi: () => ({
          getState: () => state.saved,
          setState: (saved: Record<string, unknown>) => {
            state.saved = saved
          },
          postMessage: (message: { type: string }) => {
            if (message.type !== "webviewReady" || !automatic) return
            window.postMessage(
              { type: "ready", nativeSessionTab: { sessionID: id, restore: true, context: `context:${id}` } },
              window.origin,
            )
          },
        }),
      })
      window.addEventListener("storySessionSelection", (event) => {
        state.selections.push((event as CustomEvent<string>).detail)
      })
    },
    { id, automatic },
  )
  await story(page, "history-sessionlist--native-restore")
  await expect(page.locator('[data-slot="native-active-session"]')).toHaveText(id)
}

test.describe("history session accessibility", () => {
  for (const activation of ["click", "Enter", "Space"] as const) {
    test(`opens a separate tab once with ${activation} without selecting the history row`, async ({ page }) => {
      await page.addInitScript(() => {
        const messages: unknown[] = []
        Object.assign(window, {
          nativeTabRequests: messages,
          acquireVsCodeApi: () => ({
            postMessage: (message: unknown) => messages.push(message),
            getState: () => undefined,
            setState: () => {},
          }),
        })
      })
      await story(page, "history-sessionlist--with-items")
      await page.getByRole("button", { name: /Add screenshot test coverage/ }).click({ button: "right" })
      const action = page.getByRole("menuitem", { name: "Open in Separate Tab", exact: true })
      if (activation === "click") await action.click()
      else {
        await action.focus()
        await page.keyboard.press(activation)
      }
      await expect(page.locator('[data-slot="selected-session"]')).toBeEmpty()
      expect(
        await page.evaluate(() =>
          (window as Window & { nativeTabRequests?: Array<{ type?: string }> }).nativeTabRequests?.filter(
            (message) => message.type === "openSessionInTab",
          ),
        ),
      ).toEqual([{ type: "openSessionInTab", sessionID: "s2" }])
    })
  }

  test("disables separate-tab actions for empty and pending composers, not a loading selection", async ({ page }) => {
    await story(page, "history-sessionlist--separate-tab-states")
    await expect(page.getByRole("button", { name: "Open in Separate Tab: Empty composer" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Open in Separate Tab: Pending composer" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Open in Separate Tab: Loading conversation" })).toBeEnabled()
  })

  test("does not add separate-tab actions to Agent Manager history", async ({ page }) => {
    await story(page, "history-sessionlist--worktree-sources")
    await expect(page.getByRole("button", { name: /^Open in Separate Tab/ })).toHaveCount(0)
    await page.getByRole("button", { name: /Refactor authentication module/ }).click({ button: "right" })
    await expect(page.getByRole("menuitem", { name: "Open in Separate Tab", exact: true })).toHaveCount(0)
  })

  test("persists accepted native selections synchronously while preserving unrelated state", async ({ page }) => {
    await native(page, "s1")
    await expect(page.locator('[data-slot="native-active-session"]')).toHaveText("s1")
    const saved = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "Select s2")
      button?.click()
      return (window as Window & { nativeTabState?: { saved: Record<string, unknown> } }).nativeTabState?.saved
    })
    expect(saved).toMatchObject({
      sidebarActiveSessionTabID: "s2",
      unrelated: "preserved",
      nativeSessionContexts: { s1: "context:s1" },
    })
  })

  test("saves host-issued context keys synchronously without accepting a webview directory", async ({ page }) => {
    await native(page, "s1")
    const saved = await page.evaluate(() => {
      const done = Promise.withResolvers<Record<string, unknown> | undefined>()
      const received = (event: MessageEvent) => {
        if (event.data?.type !== "nativeSessionContext") return
        window.removeEventListener("message", received)
        done.resolve((window as Window & { nativeTabState?: { saved: Record<string, unknown> } }).nativeTabState?.saved)
      }
      window.addEventListener("message", received)
      window.postMessage({ type: "nativeSessionContext", sessionID: "s1", context: "restored-context" }, window.origin)
      return done.promise
    })
    expect(saved).toMatchObject({ sidebarActiveSessionTabID: "s1", nativeSessionContexts: { s1: "restored-context" } })
    expect(JSON.stringify(saved)).not.toContain("directory")
  })

  test("restores independent panel states without substituting a missing active target", async ({ page, context }) => {
    await native(page, "s1")
    const second = await context.newPage()
    await native(second, "s2")
    await expect(page.locator('[data-slot="native-active-session"]')).toHaveText("s1")
    await expect(second.locator('[data-slot="native-active-session"]')).toHaveText("s2")
    await second.evaluate(() => window.postMessage({ type: "sessionsLoaded", sessions: [{ id: "s1" }] }, window.origin))
    await expect(second.locator('[data-slot="native-active-session"]')).toHaveText("s2")
    expect(
      await second.evaluate(
        () => (window as Window & { nativeTabState?: { selections: string[] } }).nativeTabState?.selections,
      ),
    ).toEqual(["s2"])
    await second.close()
  })

  test("a later webview selection wins over a delayed serializer-ready target", async ({ page }) => {
    await native(page, "s1", false)
    await page.getByRole("button", { name: "Select s2", exact: true }).click()
    await page.evaluate(() =>
      window.postMessage({ type: "ready", nativeSessionTab: { sessionID: "s1", restore: true } }, window.origin),
    )
    await expect(page.locator('[data-slot="native-active-session"]')).toHaveText("s2")
    expect(
      await page.evaluate(
        () => (window as Window & { nativeTabState?: { selections: string[] } }).nativeTabState?.selections,
      ),
    ).toEqual(["s2"])
  })

  test("opens a selected session through a standalone named row control", async ({ page }) => {
    await story(page, "history-sessionlist--with-items")

    const row = page.getByRole("button", { name: /Refactor authentication module.*Current session/ })
    await expect(row).toHaveAttribute("data-selected", "true")
    await expect(page.locator('[data-slot="list-item"] button')).toHaveCount(0)

    await row.focus()
    await page.keyboard.press("Enter")
    await expect(page.locator('[data-slot="selected-session"]')).toHaveText("s1")
  })

  test("announces the active filtered result before Enter opens it", async ({ page }) => {
    await story(page, "history-sessionlist--with-items")

    const search = page.getByPlaceholder("Search sessions...")
    await search.fill("screenshot")
    await expect(search).toBeFocused()
    await expect(page.locator('[data-slot="session-list-status"]')).toHaveText("Add screenshot test coverage")

    await page.keyboard.press("Enter")
    await expect(page.locator('[data-slot="selected-session"]')).toHaveText("s2")
  })

  test("focuses the context-menu rename editor without opening a session", async ({ page }) => {
    await story(page, "history-sessionlist--with-items")

    const selected = page.locator('[data-slot="selected-session"]')
    const row = page.getByRole("button", { name: /Add screenshot test coverage/ })
    await row.focus()
    await page.keyboard.press("Shift+F10")
    const rename = page.getByRole("menuitem", { name: "Rename", exact: true })
    await rename.focus()
    await page.keyboard.press("Enter")
    const input = page.getByRole("textbox", { name: "Rename" })
    await expect(input).toBeFocused()
    await expect(selected).toBeEmpty()

    await input.fill("Updated screenshot test coverage")
    await page.keyboard.press("Enter")
    await expect(input).toBeHidden()
    await expect(selected).toBeEmpty()

    await row.click({ button: "right" })
    await rename.click()
    await expect(input).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(input).toBeHidden()
    await expect(selected).toBeEmpty()
  })

  test("deleting does not open a session and restores focus after cancel", async ({ page }) => {
    await story(page, "history-sessionlist--with-items")

    const selected = page.locator('[data-slot="selected-session"]')
    const row = page.getByRole("button", { name: /Add screenshot test coverage/ })
    await row.focus()
    await page.keyboard.press("Shift+F10")
    const remove = page.getByRole("menuitem", { name: "Delete", exact: true })
    await remove.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "Delete session" })).toBeVisible()
    await expect(selected).toBeEmpty()

    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog", { name: "Delete session" })).toBeHidden()
    await expect(row).toBeFocused()
    await expect(selected).toBeEmpty()
  })

  test("exposes Local and Cloud as keyboard navigable selected tabs", async ({ page }) => {
    await story(page, "history-sessionlist--sources")

    const local = page.getByRole("tab", { name: "Local" })
    const cloud = page.getByRole("tab", { name: "Cloud" })
    await expect(page.getByRole("tablist", { name: "History source" })).toBeVisible()
    await expect(local).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: "Local" })).toBeVisible()

    await local.focus()
    await page.keyboard.press("ArrowRight")
    await expect(cloud).toBeFocused()
    await expect(local).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(cloud).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: "Cloud" })).toBeVisible()
    await expect(page.getByPlaceholder("Search sessions...")).toBeFocused()

    await cloud.focus()
    await page.keyboard.press("ArrowLeft")
    await expect(local).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(local).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: "Local" })).toBeVisible()
  })

  test("filters sessions to the current worktree and includes it in keyboard navigation", async ({ page }) => {
    await story(page, "history-sessionlist--worktree-sources")

    const local = page.getByRole("tab", { name: "Local" })
    const worktree = page.getByRole("tab", { name: "Worktree" })
    await expect(worktree).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: "Worktree" })).toBeVisible()

    await local.focus()
    await page.keyboard.press("End")
    await expect(worktree).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(worktree).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: "Worktree" })).toBeVisible()
    const rows = page.locator('[data-slot="list-item"]')
    await expect(rows.filter({ hasText: "Refactor authentication module" })).toBeVisible()
    await expect(rows.filter({ hasText: "Fix TypeScript errors in webview" })).toBeVisible()
    await expect(rows.filter({ hasText: "Add screenshot test coverage" })).toHaveCount(0)

    await rows.filter({ hasText: "Refactor authentication module" }).click()
    await expect(page.locator('[data-slot="selected-session"]')).toHaveText("s1")

    await worktree.focus()
    await page.keyboard.press("ArrowRight")
    await expect(local).toBeFocused()
  })
})
