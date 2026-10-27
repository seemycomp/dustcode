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
      expect(bounds).not.toBeNull()
      expect(lane).not.toBeNull()
      expect(Math.abs(bounds!.width - lane!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(bounds!.x - lane!.x)).toBeLessThanOrEqual(5)
      const clamp = await bubble.evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          lines: style.webkitLineClamp,
          height: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
          line: parseFloat(style.lineHeight),
          text: el.textContent,
        }
      })
      expect(clamp.lines).toBe("3")
      expect(Math.abs(clamp.height - clamp.line * 3)).toBeLessThanOrEqual(1)
      expect(clamp.text).toContain("Prompt line 8")
      await bubble.click()
      const editor = sticky.locator("textarea")
      await check(editor).toHaveValue(/Prompt line 8/)
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
      expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.close()
    }
  } finally {
    await browser.close()
    await server.stop(true)
  }
}, 120000)
