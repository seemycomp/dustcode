import { expect, it } from "bun:test"
import path from "node:path"
import { readFileSync } from "node:fs"
import { build, type PluginBuild } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { chromium, expect as check } from "@playwright/test"

const hook = path.resolve(import.meta.dir, "../webview-ui/src/hooks/useImageAttachments.ts")
const imageTypes = path.resolve(import.meta.dir, "../webview-ui/src/hooks/image-attachments-utils.ts")

const browserFixturePlugin = {
  name: "chat-browser-fixture",
  setup(build: PluginBuild) {
    build.onResolve({ filter: /(?:worker\.js|markdown-shiki\.worker\.ts)\?worker&url$/ }, () => ({
      path: "empty-worker",
      namespace: "chat-browser-fixture",
    }))
    build.onLoad({ filter: /^empty-worker$/, namespace: "chat-browser-fixture" }, () => ({
      contents: "export default '';",
      loader: "js",
    }))
    build.onResolve({ filter: /useImageAttachments\.ts$/ }, () => ({
      path: hook,
      namespace: "chat-browser-fixture",
    }))
    build.onLoad({ filter: /useImageAttachments\.ts$/, namespace: "chat-browser-fixture" }, () => ({
      contents: `${readFileSync(hook, "utf8")}\nexport { ACCEPTED_IMAGE_TYPES } from ${JSON.stringify(imageTypes)};`,
      loader: "js",
    }))
  },
}

it("keeps prompts in the readable lane, clamps display, and pins live and virtual turns", async () => {
  const bundle = await build({
    entryPoints: [path.join(import.meta.dir, "fixtures/chat-prompt-browser.tsx")],
    bundle: true,
    conditions: ["browser"],
    platform: "browser",
    format: "iife",
    outfile: "app.js",
    loader: { ".svg": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    plugins: [
      browserFixturePlugin,
      {
        name: "css-packages",
        setup(build) {
          build.onResolve({ filter: /^@/ }, (args) =>
            args.kind === "import-rule"
              ? build.resolve(args.path, { kind: "import-statement", resolveDir: args.resolveDir })
              : undefined,
          )
        },
      },
      solidPlugin(),
    ],
    write: false,
  })
  const script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.contents
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))!.contents
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/app.js")
        return new Response(script, { headers: { "Content-Type": "application/javascript" } })
      if (url.pathname === "/app.css") return new Response(css, { headers: { "Content-Type": "text/css" } })
      return new Response(
        '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><script src="/app.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      )
    },
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const activity = await browser.newPage()
    await activity.goto(`${server.url}?activity`)
    for (const state of ["idle", "busy", "retry", "waiting", "error", "done", "scheduled"]) {
      const icons = activity.getByTestId(`activity-${state}`).locator('[data-component="icon"]')
      await check(icons).toHaveCount(3)
      const selected = await icons.evaluateAll((nodes) =>
        nodes.map((node) => ({
          glyph: node.querySelector("use")?.getAttribute("href"),
          background: getComputedStyle(node).backgroundColor,
        })),
      )
      await activity.getByTestId(`activity-${state}`).evaluate((node) => {
        node.querySelector(".am-local-item")!.classList.remove("am-local-item-active")
        node.querySelector(".am-worktree-item")!.classList.remove("am-worktree-item-active")
        node.querySelector(".am-history-row")!.removeAttribute("aria-current")
      })
      const idle = await icons.evaluateAll((nodes) =>
        nodes.map((node) => ({
          glyph: node.querySelector("use")?.getAttribute("href"),
          background: getComputedStyle(node).backgroundColor,
        })),
      )
      expect(selected.map((icon) => icon.glyph)).toEqual(idle.map((icon) => icon.glyph))
      if (state === "busy" || state === "retry") {
        expect(selected).toEqual(idle)
        expect(selected.every((icon) => icon.glyph?.includes("dot-grid"))).toBe(true)
        expect(selected.every((icon) => icon.background === "rgba(0, 0, 0, 0)")).toBe(true)
      }
    }
    await activity.close()
    for (const width of [1300, 420]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } })
      page.on("pageerror", (error) => console.error(error))
      await page.goto(server.url.toString())
      const list = page.locator(".message-list")
      const sticky = page.locator("[data-sticky-prompt]")
      await check(list).toBeVisible()
      await page.waitForTimeout(100)
      await list.hover()
      await page.mouse.wheel(0, -1)
      await page.mouse.wheel(0, 1)
      await check(sticky).toHaveAttribute("data-sticky-prompt", "user-30")
      const live = list.locator('[data-message="assistant-30"]').first()
      await check(live).toBeAttached()
      await live.evaluate((row) =>
        window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: row.dataset.message } })),
      )
      await check(sticky).toHaveAttribute("data-sticky-prompt", "user-30")
      const bubble = sticky.locator('[data-slot="user-message-text"]')
      const prose = live.locator('[data-component="markdown"]').first()
      const bounds = await bubble.boundingBox()
      const lane = await prose.boundingBox()
      await check(sticky.locator(".message-image-thumbnail")).toHaveCount(2)
      const thumbnail = await sticky.locator(".message-image-thumbnail").first().boundingBox()
      expect(bounds).not.toBeNull()
      expect(lane).not.toBeNull()
      expect(thumbnail!.width).toBe(32)
      expect(thumbnail!.height).toBe(32)
      expect(Math.abs(bounds!.width - lane!.width)).toBeLessThanOrEqual(3)
      expect(Math.abs(bounds!.x - lane!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(bounds!.x + bounds!.width - lane!.x - lane!.width)).toBeLessThanOrEqual(1)
      await page.mouse.move(0, 0)
      const actions = sticky.locator('[data-slot="user-message-copy-wrapper"]')
      await check(actions).toBeVisible()
      await check(actions).toHaveCSS("opacity", "1")
      await check(actions).toHaveCSS("pointer-events", "auto")
      const card = (await sticky.locator('[data-slot="user-message-card"]').boundingBox())!
      const content = (await bubble.locator('[data-slot="user-message-content"]').boundingBox())!
      expect(thumbnail!.x).toBeGreaterThan(card.x)
      expect(thumbnail!.y).toBeGreaterThan(card.y)
      expect(thumbnail!.y + thumbnail!.height).toBeLessThanOrEqual(content.y)
      expect(
        await sticky
          .locator(".message-image-thumbnail img")
          .first()
          .evaluate((el) => getComputedStyle(el).objectFit),
      ).toBe("contain")
      const chrome = await sticky.evaluate((el) => {
        const style = getComputedStyle(el)
        return { padding: style.paddingBottom, border: style.borderBottomWidth, shadow: style.boxShadow }
      })
      expect(chrome).toEqual({ padding: "0px", border: "0px", shadow: "none" })
      const clamp = await bubble.locator('[data-slot="user-message-content"]').evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          whitespace: style.whiteSpace,
          height: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
          line: parseFloat(style.lineHeight),
          text: el.textContent,
        }
      })
      expect(clamp.whitespace).toBe("nowrap")
      expect(Math.abs(clamp.height - clamp.line)).toBeLessThanOrEqual(1)
      expect((await sticky.boundingBox())!.height).toBeLessThan(140)
      expect(clamp.text).toContain("Prompt line 8")
      await bubble.click()
      const editor = sticky.locator("textarea")
      await check(editor).toHaveValue(/Prompt line 8/)
      await editor.fill("Unsaved sticky draft")
      await editor.fill(Array.from({ length: 10 }, (_, index) => `sticky line ${index}`).join("\n"))
      const stickySize = await editor.evaluate((node) => ({
        height: node.clientHeight,
        line: parseFloat(getComputedStyle(node).lineHeight),
        padding: parseFloat(getComputedStyle(node).paddingTop) + parseFloat(getComputedStyle(node).paddingBottom),
        scroll: node.scrollHeight,
      }))
      expect(stickySize.height).toBeGreaterThan(stickySize.line * 3 + stickySize.padding)
      expect(stickySize.height).toBeLessThanOrEqual(200)
      await editor.fill("Unsaved sticky draft")
      await page.getByTestId("refresh-parts").click()
      await check(editor).toHaveValue("Unsaved sticky draft")
      await editor.press("Escape")

      for (const id of [15, 16, 15]) {
        await page.evaluate(
          (id) => window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: `assistant-${id}` } })),
          id,
        )
        const row = list.locator(`[data-message="assistant-${id}"]`).first()
        await check(row).toBeAttached()
        await row.evaluate((row) => {
          const list = row.closest(".message-list")!
          list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top + 16
        })
        await check(sticky).toHaveAttribute("data-sticky-prompt", `user-${id}`)
      }
      const user = list.locator('[data-message="user-15"]').first()
      await check(user).toBeAttached()
      await user.evaluate((row) => {
        const list = row.closest(".message-list")!
        list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top
      })
      await check(sticky).toBeHidden()
      await page.mouse.move(0, 0)
      await check(user.locator('[data-slot="user-message-copy-wrapper"]')).toHaveCSS("opacity", "1")
      await check(user.locator(".user-message-revert button")).toBeDisabled()
      const normal = (await user.locator('[data-slot="user-message-card"]').boundingBox())!
      expect(Math.abs(normal.x - card.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(normal.width - card.width)).toBeLessThanOrEqual(1)
      const assistant = list.locator('[data-message="assistant-15"] [data-slot="assistant-copy-wrapper"]').first()
      await check(assistant).toHaveCSS("opacity", "1")
      await check(assistant.locator("button").first()).toBeVisible()
      const clipped = await user.locator('[data-slot="user-message-content"]').evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          height: el.clientHeight,
          line: parseFloat(style.lineHeight),
          padding: style.paddingBottom,
          overflow: style.overflow,
          clamp: style.webkitLineClamp,
        }
      })
      expect(clipped.clamp).toBe("3")
      expect(clipped.padding).toBe("0px")
      expect(clipped.overflow).toBe("hidden")
      expect(Math.abs(clipped.height - clipped.line * 3)).toBeLessThanOrEqual(1)
      expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

      await page.goto(`${server.url}?internal`)
      await check(list).toBeVisible()
      for (const id of [30, 15]) {
        await page.evaluate(
          (id) => window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: `continuation-${id}` } })),
          id,
        )
        const row = list.locator(`[data-message="continuation-${id}"]`).first()
        await check(row).toBeAttached()
        await row.evaluate((row) => {
          const list = row.closest(".message-list")!
          list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top + 16
        })
        await check(list.locator(`[data-message="internal-${id}"]`)).toHaveCount(0)
        await check(sticky).toHaveAttribute("data-sticky-prompt", `user-${id}`)
        await check(sticky).toContainText("Prompt line 1")
      }

      await page.goto(`${server.url}?composer`)
      const input = page.locator("textarea.prompt-input")
      await check(input).toBeVisible()
      const spacing = await input.evaluate((el) => {
        const style = getComputedStyle(el)
        const toolbar = el.closest(".prompt-input-container")!.querySelector(".prompt-input-hint")!
        return {
          height: el.clientHeight,
          line: parseFloat(style.lineHeight),
          padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
          gap: toolbar.getBoundingClientRect().top - el.getBoundingClientRect().bottom,
        }
      })
      expect(Math.abs(spacing.height - spacing.line - spacing.padding)).toBeLessThanOrEqual(2)
      expect(Math.abs(spacing.gap)).toBeLessThanOrEqual(1)
      await expect(
        page.locator(".session-changes-header").evaluate((el) => getComputedStyle(el).padding),
      ).resolves.toBe("0px")
      await check(page.locator('[data-component="task-header"]')).toHaveCount(0)
      await check(page.getByRole("button", { name: "Context Usage", exact: true })).toHaveText("25,533")
      const usage = page.getByRole("button", { name: "Context Usage", exact: true })
      const panel = page.getByRole("region", { name: "Context Usage", exact: true })
      const composer = page.locator(".prompt-input-container")
      const before = await composer.boundingBox()
      await usage.click()
      await check(panel).toBeVisible()
      expect(await panel.evaluate((el) => el.closest(".prompt-input-container") == null)).toBe(true)
      expect(await composer.boundingBox()).toEqual(before)
      const overlay = (await panel.boundingBox())!
      expect(overlay.x).toBeGreaterThanOrEqual(0)
      expect(overlay.x + overlay.width).toBeLessThanOrEqual(width)
      await page.keyboard.press("Escape")
      await check(panel).toBeHidden()
      await check(composer.locator(":focus")).toHaveCount(1)
      await usage.click()
      await panel.getByRole("button", { name: "Hide context usage", exact: true }).click()
      await check(panel).toBeHidden()
      const compact = page.getByRole("button", { name: "Compact session", exact: true })
      const confirm = page.getByRole("dialog", { name: "Compact session", exact: true })
      await compact.click()
      await check(confirm).toBeVisible()
      await check(page.locator("body")).not.toHaveAttribute("data-compacted", "true")
      await confirm.getByRole("button", { name: "No", exact: true }).click()
      await check(confirm).toBeHidden()
      await compact.click()
      await page.keyboard.press("Escape")
      await check(confirm).toBeHidden()
      await check(composer.locator(":focus")).toHaveCount(1)
      for (const name of ["Compact session", "Search chat"]) {
        const button = page.getByRole("button", { name, exact: true })
        if (await button.isVisible()) await button.click()
        else {
          await page.getByRole("button", { name: "More actions", exact: true }).click()
          await page.getByRole("menuitem", { name, exact: true }).click()
        }
        if (name === "Compact session") {
          await check(confirm).toBeVisible()
          await confirm.getByRole("button", { name: "Yes", exact: true }).click()
        }
      }
      await check(page.locator("body")).toHaveAttribute("data-compacted", "true")
      await check(page.locator('[data-component="task-header-search"]')).toBeVisible()
      await page.locator('[data-component="task-header-search"] input').press("Escape")
      await check(page.locator('[data-component="task-header-search"]')).toHaveCount(0)
      await check(input).toBeFocused()
      await page.evaluate(() => window.dispatchEvent(new Event("focusTranscriptSearch")))
      await check(page.locator('[data-component="task-header-search"]')).toBeVisible()
      await page.evaluate(() => window.dispatchEvent(new Event("focusTranscriptSearch")))
      await check(page.locator('[data-component="task-header-search"]')).toHaveCount(0)
      await input.evaluate((el) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        canvas.toBlob((blob) => {
          const data = new DataTransfer()
          data.items.add(new File([blob!], "pixel.png", { type: "image/png" }))
          el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }))
        })
      })
      const image = page.locator(".image-attachment .message-image-thumbnail")
      await check(image).toBeVisible()
      await image.click()
      await check(page.getByRole("dialog")).toBeVisible()
      await page.keyboard.press("Escape")
      await check(page.getByRole("dialog")).toHaveCount(0)
      expect(await page.locator(".prompt-input-hint").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.close()
    }

    const tabs = await browser.newPage({ viewport: { width: 600, height: 850 } })
    await tabs.goto(`${server.url}?composer&tabs`)
    const other = tabs.getByRole("tab", { name: /Other session/ })
    await check(other).toBeVisible()
    await other.click({ button: "right" })
    await check(tabs.getByRole("menuitem", { name: "New Session", exact: true })).toBeVisible()
    await tabs.getByRole("menuitem", { name: "Fork Session", exact: true }).click()
    await check(tabs.locator("body")).toHaveAttribute("data-forked", "other-session")
    await check(tabs.getByRole("tab", { name: /Active session/ })).toHaveAttribute("aria-selected", "true")
    await other.click({ button: "right" })
    await tabs.getByRole("menuitem", { name: "Move to Worktree", exact: true }).click()
    await check(tabs.locator("body")).toHaveAttribute("data-moved", "other-session")
    await other.click({ button: "right" })
    await tabs.getByRole("menuitem", { name: "New Session", exact: true }).click()
    await check(tabs.getByRole("tab")).toHaveCount(3)
    await tabs.goto(`${server.url}?composer&tabs-busy`)
    await other.click({ button: "right" })
    await check(tabs.getByRole("menuitem", { name: "Fork Session", exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await check(tabs.getByRole("menuitem", { name: "Move to Worktree", exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await tabs.close()

    const todos = await browser.newPage({ viewport: { width: 420, height: 850 } })
    await todos.goto(`${server.url}?todos`)
    const todoList = todos.locator(".message-list")
    await todoList.hover()
    await todos.mouse.wheel(0, -1)
    const sticky = todos.locator("[data-sticky-prompt]")
    const tracker = sticky.locator(".turn-todos-toggle")
    await check(sticky).toBeVisible()
    await check(tracker).toBeVisible()
    await check(tracker).toHaveText("1 of 3 To-dos Completed")
    const measure = () =>
      todoList.evaluate((el) => ({
        height: el.scrollHeight,
        top: el.scrollTop,
        box: el.getBoundingClientRect().height,
      }))
    const before = await measure()
    await tracker.click()
    const panel = sticky.locator(".turn-todos-list")
    await check(panel).toBeVisible()
    await check(tracker).toHaveAttribute("aria-expanded", "true")
    expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe("absolute")
    expect(await measure()).toEqual(before)
    expect((await tracker.boundingBox())!.y).toBeGreaterThan((await sticky.boundingBox())!.y)
    await tracker.press("Escape")
    await check(panel).toBeHidden()
    await check(tracker).toBeFocused()
    await todos.evaluate(() => window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: "user-30" } })))
    const inline = todoList.locator('[data-message="user-30"] .turn-todos')
    await check(inline).toBeVisible()
    await check(inline.locator(".turn-todos-list")).toBeVisible()
    expect(await inline.locator(".turn-todos-list").evaluate((el) => getComputedStyle(el).position)).toBe("static")
    const message = todoList.locator('[data-message="user-30"] .vscode-user-message')
    const card = message.locator('[data-slot="user-message-card"]')
    const actions = message.locator('[data-slot="user-message-copy-wrapper"]')
    expect(await card.locator('[data-slot="user-message-copy-wrapper"]').count()).toBe(0)
    const frame = (await card.boundingBox())!
    const toolbar = (await actions.boundingBox())!
    const plan = (await inline.boundingBox())!
    expect(plan.y + plan.height).toBeLessThanOrEqual(frame.y + frame.height)
    expect(toolbar.y).toBeGreaterThanOrEqual(frame.y + frame.height)
    expect(toolbar.y - plan.y - plan.height).toBeLessThanOrEqual(10)
    await inline.locator("button").click()
    await check(inline.locator(".turn-todos-list")).toBeHidden()
    await check(todoList.locator('[data-message="user-29"] .turn-todos')).toHaveCount(0)
    for (const query of ["", "&internal", "&internal&background", "&internal&compaction"]) {
      await todos.goto(`${server.url}?todos&updates${query}`)
      await todoList.hover()
      await todos.mouse.wheel(0, -1)
      await check(tracker).toHaveText("1 of 3 To-dos Completed")
      await todos.getByTestId("finish-todos").click()
      await check(tracker).toHaveText("3 of 3 To-dos Completed")
      await tracker.click()
      await check(panel.locator('.turn-todos-row[data-status="completed"]')).toHaveCount(3)
      for (const item of await panel.locator(".turn-todos-row > span").all()) {
        expect(await item.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("line-through")
      }
      await tracker.press("Escape")
      await todos.evaluate(() =>
        window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: "assistant-30" } })),
      )
      await check(inline.locator("button")).toHaveText("3 of 3 To-dos Completed")
      await check(inline.locator('.turn-todos-row[data-status="completed"]')).toHaveCount(3)
      await todos.evaluate(() =>
        window.dispatchEvent(new CustomEvent("scrollToMessage", { detail: { id: "assistant-29" } })),
      )
      const previous = todoList.locator('[data-message="user-29"] .turn-todos')
      await check(previous.locator("button")).toHaveText("0 of 1 To-dos Completed")
      await check(previous.locator('.turn-todos-row[data-status="pending"]')).toHaveText("Previous independent plan")
    }
    await todos.setViewportSize({ width: 1000, height: 850 })
    await todos.goto(`${server.url}?todos&complete`)
    await todoList.hover()
    await todos.mouse.wheel(0, -1)
    await check(tracker).toHaveText("1 of 1 To-dos Completed")
    await check(tracker).toHaveAttribute("aria-expanded", "false")
    await tracker.click()
    await check(panel).toContainText("Create test.txt with content test")
    const completed = panel.locator('.turn-todos-row[data-status="completed"] > span')
    expect(await completed.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("line-through")
    const box = (await panel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(1000)
    await todos.getByTestId("refresh-parts").click()
    await check(panel).toBeHidden()
    await todos.close()
    for (const width of [420, 1000]) {
      const work = await browser.newPage({ viewport: { width, height: 850 } })
      await work.goto(`${server.url}?working&disclosure`)
      const transcript = work.locator(".message-list")
      const disclosure = transcript.locator('[data-row="work"][data-turn="user-30"] button')
      await check(transcript.getByText("Intermediate progress 30", { exact: true })).toBeVisible()
      await check(disclosure).toHaveCount(0)
      await work.evaluate(() => window.dispatchEvent(new CustomEvent("fixtureStatus", { detail: { type: "idle" } })))
      await check(disclosure).toHaveText("Worked for 4s")
      await check(disclosure).toHaveAttribute("aria-expanded", "false")
      await check(transcript.getByText("Intermediate progress 30", { exact: true })).toHaveCount(0)
      const conclusion = transcript.getByText("Final conclusion 30", { exact: true })
      await check(conclusion).toBeVisible()
      await disclosure.click()
      await check(disclosure).toHaveAttribute("aria-expanded", "true")
      await check(transcript.getByText("Intermediate progress 30", { exact: true })).toBeVisible()
      await check(conclusion).toBeVisible()
      await disclosure.press("Enter")
      await check(disclosure).toHaveAttribute("aria-expanded", "false")
      await check(conclusion).toBeVisible()
      // A timeline jump must reveal the hidden process, including virtual history.
      for (const i of [29, 30]) {
        await work.evaluate(
          (i) =>
            window.dispatchEvent(
              new CustomEvent("scrollToMessage", { detail: { id: `assistant-${i}`, partId: `progress-${i}` } }),
            ),
          i,
        )
        await check(transcript.getByText(`Intermediate progress ${i}`, { exact: true })).toBeInViewport()
        await check(transcript.locator(`[data-row="work"][data-turn="user-${i}"] button`)).toHaveAttribute(
          "aria-expanded",
          "true",
        )
      }
      const trigger = (await disclosure.boundingBox())!
      expect(trigger.x).toBeGreaterThanOrEqual(0)
      expect(trigger.x + trigger.width).toBeLessThanOrEqual(width)
      await disclosure.click()
      await check(disclosure).toHaveAttribute("aria-expanded", "false")
      await work.evaluate(() => window.dispatchEvent(new CustomEvent("focusTranscriptSearch")))
      await work.locator('[data-slot="transcript-search-input"]').fill("Intermediate progress 30")
      await check(work.locator('[data-slot="transcript-search-counter"]')).toHaveText("1 / 1")
      await check(disclosure).toHaveAttribute("aria-expanded", "true")
      await check(transcript.getByText("Intermediate progress 30", { exact: true })).toBeInViewport()
      await work.close()

      const page = await browser.newPage({ viewport: { width, height: 850 } })
      await page.goto(`${server.url}?working`)
      const list = page.locator(".message-list")
      const status = list.locator('[data-slot="message-list-working"]')
      const label = status.locator('.working-status-line:not([data-old]) [data-component="text-shimmer"]')
      await check(status).toBeVisible()
      await check(label).toHaveAttribute("aria-label", "Thinking")
      await check(status.locator(".working-elapsed")).toContainText(/\d+s/)
      await check(page.locator(".session-dock")).toHaveCount(0)
      const last = list.locator('[data-message="assistant-30"]').last()
      const bounds = (await status.boundingBox())!
      expect(bounds.y).toBeGreaterThanOrEqual((await last.boundingBox())!.y + (await last.boundingBox())!.height)
      const prose = last.locator('[data-component="markdown"]').first()
      expect(Math.abs(bounds.x - (await prose.boundingBox())!.x)).toBeLessThanOrEqual(5)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      const change = async (detail: { type?: string; label?: string; submitting?: boolean; blocked?: boolean }) => {
        await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("fixtureStatus", { detail })), detail)
      }
      await change({ label: "Running command" })
      await check(label).toHaveAttribute("aria-label", "Running command")
      await list.hover()
      await page.mouse.wheel(0, -500)
      await check
        .poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
        .toBeGreaterThan(100)
      await check(page.locator(".scroll-to-bottom-button")).toBeVisible()
      await change({ label: "Reading files" })
      await check(label).toHaveAttribute("aria-label", "Reading files")
      await check
        .poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
        .toBeGreaterThan(100)
      await check(status).not.toBeInViewport()
      await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click()
      await check.poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(3)
      await change({ type: "retry", label: "Retrying request" })
      await check(label).toHaveAttribute("aria-label", "Retrying request")
      await check(status.getByRole("button", { name: "Cancel", exact: true })).toBeVisible()
      await check(status.locator(".working-count")).toContainText(/\d+s/)
      await change({ type: "offline", label: "Reconnecting" })
      await check(label).toHaveAttribute("aria-label", "Reconnecting")
      await check(status.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0)
      await change({ type: "busy", blocked: true })
      await check(status).toHaveCount(0)
      await change({ type: "idle", blocked: false })
      await check(status).toHaveCount(0)
      await change({ submitting: true, label: "Submitting" })
      await check(label).toHaveAttribute("aria-label", "Submitting")
      await change({ submitting: false })
      await check(status).toHaveCount(0)
      await page.close()
    }
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 180000)
