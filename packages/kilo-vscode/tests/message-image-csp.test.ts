import { expect, it } from "bun:test"
import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { chromium, expect as browserExpect } from "@playwright/test"
import { buildCspString } from "../src/webview-html-utils"

it("copies PNG and GIF attachments under the production CSP in Chromium", async () => {
  const result = await build({
    entryPoints: [path.join(import.meta.dir, "fixtures/message-image-browser.tsx")],
    bundle: true,
    conditions: ["browser"],
    platform: "browser",
    format: "iife",
    loader: { ".css": "empty", ".svg": "dataurl", ".woff2": "dataurl" },
    plugins: [solidPlugin()],
    write: false,
  })
  const script = result.outputFiles.at(0)!.contents
  const nonce = crypto.randomUUID()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/app.js"
        ? new Response(script, { headers: { "Content-Type": "application/javascript" } })
        : new Response(
            `<!doctype html><html><head><meta charset="utf-8"></head><body><script nonce="${nonce}" src="/app.js"></script></body></html>`,
            {
              headers: { "Content-Type": "text/html", "Content-Security-Policy": buildCspString("'self'", nonce) },
            },
          ),
  })
  try {
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })
      const page = await context.newPage()
      const violations: string[] = []
      page.on("console", (event) => {
        if (event.text().includes("Content Security Policy")) violations.push(event.text())
      })
      for (const format of ["png", "gif"]) {
        await page.goto(`${server.url}?${format}`)
        await page.evaluate(() => navigator.clipboard.writeText(""))
        await page.locator("button.message-image-thumbnail").click({ button: "right" })
        await page.getByRole("menuitem", { name: "Copy Image", exact: true }).click()
        await browserExpect
          .poll(async () =>
            page.evaluate(async () => {
              const item = (await navigator.clipboard.read()).at(0)
              if (!item?.types.includes("image/png")) return 0
              return (await item.getType("image/png")).size
            }),
          )
          .toBeGreaterThan(0)
        await page.locator("button.message-image-thumbnail").click()
        await browserExpect(page.getByRole("dialog")).toBeVisible()
      }
      expect(violations).toEqual([])
    } finally {
      await browser.close()
    }
  } finally {
    await server.stop(true)
  }
}, 60000)
