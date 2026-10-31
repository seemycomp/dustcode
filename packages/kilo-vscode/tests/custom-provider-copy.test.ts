import { expect, it } from "bun:test"
import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { chromium, expect as check } from "@playwright/test"

it("copies only custom providers into an editable new-provider dialog without changing the source", async () => {
  const result = await build({
    entryPoints: [path.join(import.meta.dir, "fixtures/custom-provider-copy-browser.tsx")],
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
      const suffix = pathname === "/app.js" ? ".js" : pathname === "/app.css" ? ".css" : undefined
      if (suffix)
        return new Response(result.outputFiles.find((file) => file.path.endsWith(suffix))!.contents, {
          headers: { "Content-Type": suffix === ".js" ? "application/javascript" : "text/css" },
        })
      return new Response(
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><script src="/app.js"></script></body></html>',
        {
          headers: { "Content-Type": "text/html" },
        },
      )
    },
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.addInitScript(() =>
      Object.assign(window, {
        acquireVsCodeApi: () => ({
          postMessage: (message: unknown) =>
            window.dispatchEvent(new CustomEvent("fixture-outgoing", { detail: message })),
          getState: () => undefined,
          setState: () => undefined,
        }),
      }),
    )
    page.setDefaultTimeout(5000)
    for (const width of [1100, 420]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(server.url.toString())
      await check(page.getByRole("button", { name: "Copy", exact: true })).toHaveCount(2)
      const source = page
        .locator("div")
        .filter({ has: page.getByText("Custom Source", { exact: true }) })
        .filter({ has: page.getByRole("button", { name: "Edit provider", exact: true }) })
        .last()
      const copy = source.getByRole("button", { name: "Copy", exact: true })
      const bounds = await copy.boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await copy.click()
      const dialog = page.getByRole("dialog")
      await check(dialog).toBeVisible()
      const id = dialog.getByRole("textbox", { name: "Provider ID", exact: true })
      await check(id).toBeEnabled()
      await check(id).toHaveValue("custom-copy-3")
      await check(dialog.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Custom Source")
      await check(dialog.getByRole("textbox", { name: "Base URL", exact: true })).toHaveValue("https://example.com/v1")
      await check(dialog.locator('input[type="password"]')).toHaveValue("")
      for (const taken of ["custom", "custom-copy", "custom-copy-2"]) {
        await id.fill(taken)
        await dialog.getByRole("button", { name: "Submit", exact: true }).click()
        await check(id).toHaveAttribute("aria-invalid", "true")
        expect(await page.evaluate(() => document.body.dataset.saved)).toBeUndefined()
      }
      await id.fill("new-provider")
      await dialog.getByRole("button", { name: "Submit", exact: true }).click()
      await check.poll(() => page.evaluate(() => document.body.dataset.saved)).toBeTruthy()
      const saved = await page.evaluate(() => JSON.parse(document.body.dataset.saved!))
      expect(saved.providerID).toBe("new-provider")
      expect(saved.config).toEqual({
        npm: "@ai-sdk/anthropic",
        name: "Custom Source",
        options: { baseURL: "https://example.com/v1", headers: { "X-Custom": "header-value" } },
        models: {
          "model-one": {
            name: "Model One",
            reasoning: true,
            modalities: { input: ["text", "image"], output: ["text"] },
            variants: { high: { thinking: { type: "adaptive" }, customOption: true } },
          },
        },
      })
      expect(saved.apiKey).toBeUndefined()
      expect(saved.apiKeyChanged).toBe(false)
      await page.keyboard.press("Escape")
      await source.getByRole("button", { name: "Edit provider", exact: true }).click()
      await check(dialog.getByRole("textbox", { name: "Provider ID", exact: true })).toHaveValue("custom")
      await check(dialog.getByRole("textbox", { name: "Provider ID", exact: true })).toBeDisabled()
      await check(dialog.locator('input[type="password"]')).toHaveValue("********")
      await page.goto(server.url.toString())
      await page.getByRole("button", { name: "Copy", exact: true }).nth(1).click()
      await check(page.getByRole("dialog").locator('input[type="password"]')).toHaveValue("{env:CUSTOM_API_KEY}")
      await page.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }).click()
      await check.poll(() => page.evaluate(() => document.body.dataset.saved)).toBeTruthy()
      const env = await page.evaluate(() => JSON.parse(document.body.dataset.saved!))
      expect(env.providerID).toBe("env-copy")
      expect(env.config.env).toEqual(["CUSTOM_API_KEY"])
      expect(env.apiKey).toBeUndefined()
    }
  } finally {
    await browser.close()
    server.stop(true)
  }
}, 120000)
