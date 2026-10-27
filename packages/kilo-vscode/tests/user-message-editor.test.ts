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
    loader: { ".css": "empty", ".svg": "dataurl", ".woff2": "dataurl" },
    plugins: [solidPlugin()],
    write: false,
  })
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) =>
      new URL(request.url).pathname === "/app.js"
        ? new Response(result.outputFiles.at(0)!.contents, { headers: { "Content-Type": "application/javascript" } })
        : new Response('<!doctype html><html><body><script src="/app.js"></script></body></html>', {
            headers: { "Content-Type": "text/html" },
          }),
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(server.url.toString())
    const field = page.locator("textarea")
    await browserExpect(field).toHaveValue("Original prompt\nwith all lines")
    await field.fill("Revised prompt")
    const picker = page.locator('input[type="file"]')
    const bytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
    await picker.setInputFiles({ name: "new.gif", mimeType: "image/gif", buffer: bytes })
    await browserExpect(page.getByRole("img", { name: "new.gif", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Preview new.gif" }).click()
    await browserExpect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Preview new.gif" }).click({ button: "right" })
    await browserExpect(page.getByRole("menuitem", { name: "Open Image", exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    const send = page.locator('[data-action="resubmit-message"]')
    await send.click({ force: true })
    await browserExpect(send).toBeDisabled()
    const sent = await page.evaluate(() => JSON.parse(document.body.dataset.sent!))
    expect(sent.text).toBe("Revised prompt")
    expect(sent.images).toHaveLength(1)
    expect(sent.images.at(0).dataUrl).toContain("data:image/gif;base64,")
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("complete", { detail: false })))
    await browserExpect(send).toBeEnabled()
    await browserExpect(field).toHaveValue("Revised prompt")
    await page.getByRole("button", { name: "Remove new.gif", exact: true }).click()
    await browserExpect(page.getByRole("img", { name: "new.gif", exact: true })).toHaveCount(0)
    await field.evaluate((node) => {
      const clipboard = new DataTransfer()
      clipboard.items.add(new File(["image"], "pasted.png", { type: "image/png" }))
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }))
    })
    await browserExpect(page.getByRole("img", { name: "pasted.png", exact: true })).toHaveCount(1)
    await send.click()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("complete", { detail: true })))
    await browserExpect.poll(() => page.evaluate(() => document.body.dataset.closed)).toBe("true")
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 60000)
