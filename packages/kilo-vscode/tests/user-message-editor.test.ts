import { it, expect } from "bun:test"
import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { chromium, expect as browserExpect } from "@playwright/test"

it("attaches, previews, pastes and removes images in an edited prompt without losing failed edits", async () => {
  const result = await build({
    entryPoints: [path.join(import.meta.dir, "fixtures/user-message-editor-browser.tsx")],
    bundle: true,
    conditions: ["browser"],
    platform: "browser",
    format: "iife",
    outfile: "app.js",
    loader: { ".svg": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    plugins: [
      {
        name: "worker-url",
        setup(build) {
          build.onResolve({ filter: /(?:worker\.js|markdown-shiki\.worker\.ts)\?worker&url$/ }, () => ({
            path: "worker",
            namespace: "stub",
          }))
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default ''", loader: "js" }))
        },
      },
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
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const pathname = new URL(request.url).pathname
      if (pathname === "/app.js")
        return new Response(result.outputFiles.find((file) => file.path.endsWith(".js"))!.contents, {
          headers: { "Content-Type": "application/javascript" },
        })
      if (pathname === "/app.css")
        return new Response(result.outputFiles.find((file) => file.path.endsWith(".css"))!.contents, {
          headers: { "Content-Type": "text/css" },
        })
      return new Response(
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><script src="/app.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      )
    },
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      Object.assign(window, {
        acquireVsCodeApi: () => ({
          postMessage: (message: unknown) =>
            window.dispatchEvent(new CustomEvent("fixture-outgoing", { detail: message })),
          getState: () => undefined,
          setState: () => undefined,
        }),
      })
    })
    page.setDefaultTimeout(8000)
    page.on("pageerror", (error) => console.error(error))
    await page.goto(server.url.toString())
    const bubble = page.locator('[data-slot="user-message-text"]')
    await bubble.hover()
    await browserExpect(page.locator(".user-message-edit-trigger")).toHaveCount(0)
    const revert = page.locator(".user-message-revert button")
    await browserExpect(revert).toBeVisible()
    const position = await revert.boundingBox()
    const bounds = await bubble.boundingBox()
    expect(position!.x + position!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width)
    expect(bounds!.x + bounds!.width - position!.x - position!.width).toBeLessThan(16)
    await revert.click()
    await browserExpect.poll(() => page.evaluate(() => document.body.dataset.reverted)).toBe("true")
    await browserExpect(page.locator(".user-message-editor")).toHaveCount(0)
    await bubble.click()
    const editor = page.locator(".user-message-editor")
    await browserExpect(revert).toHaveCount(0)
    const field = editor.locator("textarea")
    const normal = page.locator(".prompt-input-container:not([data-inline]) textarea")
    await browserExpect(normal).toBeAttached()
    await normal.fill("Keep this draft")
    await browserExpect(field).toHaveValue("Original prompt\nwith all lines")
    for (const width of [1100, 420]) {
      await page.setViewportSize({ width, height: 900 })
      await field.fill(Array.from({ length: 10 }, (_, index) => `line ${index}`).join("\n"))
      const size = await field.evaluate((node) => ({
        height: node.clientHeight,
        line: parseFloat(getComputedStyle(node).lineHeight),
        padding: parseFloat(getComputedStyle(node).paddingTop) + parseFloat(getComputedStyle(node).paddingBottom),
        scroll: node.scrollHeight,
      }))
      expect(size.height).toBeLessThanOrEqual(size.line * 3 + size.padding + 1)
      expect(size.scroll).toBeGreaterThan(size.height)
      await browserExpect(editor.locator(".prompt-context-usage")).toHaveCount(0)
      await browserExpect(editor.getByRole("button", { name: "Compact session", exact: true })).toHaveCount(0)
      await browserExpect(editor.getByRole("button", { name: "Search chat", exact: true })).toHaveCount(0)
      await browserExpect(editor.getByRole("button", { name: "Indexing settings", exact: true })).toHaveCount(0)
    }
    await page.setViewportSize({ width: 1100, height: 900 })
    await browserExpect(editor.getByRole("button", { name: "Enhance prompt", exact: true })).toBeVisible()
    await browserExpect(editor.getByRole("button", { name: "Enable auto-approve", exact: true })).toBeVisible()
    await editor.getByRole("button", { name: "Enable auto-approve", exact: true }).click()
    await browserExpect(editor.getByRole("button", { name: "Disable auto-approve", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await field.fill("Improve this prompt")
    await editor.getByRole("button", { name: "Enhance prompt", exact: true }).click()
    await browserExpect(field).toHaveValue("Enhanced: Improve this prompt")
    await browserExpect(normal).toHaveValue("Keep this draft")
    await field.fill("/models")
    await field.press("Enter")
    await browserExpect(page.locator(".popup-selector[data-expanded]")).toHaveCount(1)
    await page.keyboard.press("Escape")
    await browserExpect(field).toBeFocused()
    await field.fill("/")
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("fixture-host", {
          detail: {
            type: "commandsLoaded",
            commands: [{ name: "kilo-config", description: "Configuration skill", source: "skill", hints: [] }],
          },
        }),
      ),
    )
    await browserExpect(editor.locator(".slash-command-name", { hasText: "/kilo-config" })).toBeVisible()
    await editor.locator(".slash-command-item", { hasText: "/kilo-config" }).click()
    await browserExpect(field).toHaveValue("/kilo-config ")
    await field.fill("@")
    await browserExpect(editor.locator(".file-mention-dropdown")).toBeVisible()
    await field.press("Escape")
    await field.fill("Revised prompt")
    await field.press("Shift+Tab")
    await field.fill("Revised prompt")
    const bytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
    await editor.evaluate((node, bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], "new.gif", { type: "image/gif" }))
      node
        .querySelector(".prompt-input-container")!
        .dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }))
    }, Array.from(bytes))
    await browserExpect(page.getByRole("img", { name: "new.gif", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Preview new.gif" }).click()
    await browserExpect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    const send = editor.locator('[data-action="resubmit-message"]')
    await send.click()
    await browserExpect(send).toBeDisabled()
    const sent = await page.evaluate(() => JSON.parse(document.body.dataset.sent!))
    expect(sent.text).toBe("Revised prompt")
    expect(sent.images).toHaveLength(1)
    expect(sent.images.at(0).dataUrl).toContain("data:image/gif;base64,")
    expect(sent.options.agent).toBe("code")
    expect(sent.options.variant).toBe("low")
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("complete", { detail: false })))
    await browserExpect(send).toBeEnabled()
    await browserExpect(field).toHaveValue("Revised prompt")
    await browserExpect(normal).toHaveValue("Keep this draft")
    await page.getByRole("button", { name: "Remove new.gif", exact: true }).click()
    await browserExpect(page.getByRole("img", { name: "new.gif", exact: true })).toHaveCount(0)
    await field.evaluate((node) => {
      const clipboard = new DataTransfer()
      clipboard.items.add(new File(["image"], "pasted.png", { type: "image/png" }))
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }))
    })
    await browserExpect(page.getByRole("img", { name: "pasted.png", exact: true })).toHaveCount(1)
    await field.fill("/kilo-config explain settings")
    await send.click()
    const command = await page.evaluate(() => JSON.parse(document.body.dataset.sent!))
    expect(command.options.command).toEqual({ name: "kilo-config", args: "explain settings" })
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("complete", { detail: true })))
    await browserExpect.poll(() => page.evaluate(() => document.body.dataset.closed)).toBe("true")
    await browserExpect(editor).toHaveCount(0)
    await browserExpect(normal).toHaveValue("Keep this draft")
    await bubble.click()
    await field.fill("Cancel this edit")
    await editor.locator('[data-action="cancel-edit"]').click()
    await browserExpect(editor).toHaveCount(0)
    await browserExpect(normal).toHaveValue("Keep this draft")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60000)
