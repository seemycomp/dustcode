import { expect, test, type Page } from "@playwright/test"
import { open } from "./helpers/prompt-input"

async function observe(page: Page, block = false) {
  const trace = await page.evaluateHandle((block) => {
    const events: KeyboardEvent[] = []
    const forwarded: KeyboardEvent[] = []
    window.addEventListener("keydown", (event) => {
      if (event.key.length !== 1) return
      forwarded.push(event)
      if (block) event.preventDefault()
    })
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key.length === 1) events.push(event)
      },
      true,
    )
    return { events, forwarded }
  }, block)
  return () =>
    trace.evaluate((state) => ({
      prevented: state.events.splice(0).map((event) => event.defaultPrevented),
      forwarded: state.forwarded.splice(0).map((event) => event.key),
    }))
}

async function transcript(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.addInitScript(() => {
    Object.defineProperty(window, "acquireVsCodeApi", {
      value: () => ({
        getState: () => undefined,
        setState: () => undefined,
        postMessage: async (message: { type: string; id?: string; text?: string }) => {
          if (message.type !== "copyToClipboard") return
          await navigator.clipboard.writeText(message.text ?? "")
          window.postMessage({ type: "clipboardWriteResult", id: message.id, ok: true }, window.origin)
        },
      }),
    })
  })
  await page.goto("/iframe.html?id=chat--chat-view-readable-1280&viewMode=story")
  const input = page.locator("textarea.prompt-input")
  await expect(input).toBeVisible()
  await page.evaluate(() => window.postMessage({ type: "connectionState", state: "connected" }, window.origin))
  await expect(input).toBeEnabled()
  await input.fill("Draft text")
  const message = page.locator(".chat-messages p").filter({ hasText: "The conversation stays" }).first()
  await message.click()
  const text = await message.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    return document.getSelection()!.toString()
  })
  await expect(input).not.toBeFocused()
  return { input, text }
}

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier}+C copies selected chat text without the host refocusing the prompt`, async ({ page }) => {
    const { input, text } = await transcript(page)
    await page.evaluate(() => {
      // VS Code restores the last focused input before forwarding native Copy.
      window.addEventListener("keydown", (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return
        event.preventDefault()
        ;(document.querySelector("textarea.prompt-input") as HTMLTextAreaElement).focus()
        document.execCommand("copy")
      })
      return navigator.clipboard.writeText("Old clipboard text")
    })
    const read = await observe(page)
    await page.keyboard.press(`${modifier}+c`)
    await expect(input).not.toBeFocused()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text)
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(text)
    expect(await read()).toEqual({ prevented: [true], forwarded: [] })
    await expect(input).toHaveValue("Draft text")
    await input.fill("")
    await input.press("ControlOrMeta+v")
    await expect(input).toHaveValue(text)
  })
}

for (const action of ["window focus", "restoreInput"]) {
  test(`${action} preserves selected transcript text`, async ({ page }) => {
    const { input, text } = await transcript(page)
    await page.evaluate((action) => {
      if (action === "window focus") {
        window.dispatchEvent(new Event("focus"))
        return
      }
      window.postMessage({ type: "action", action: "restoreInput" }, window.origin)
    }, action)
    // Drain host-message delivery before asserting that focus and selection survived.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    await expect(input).not.toBeFocused()
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(text)
  })
}

test("copies a triple-click selection extending past the final transcript paragraph", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { input } = await transcript(page)
  await page.locator('.chat-messages [data-part-type="tool"]').evaluate((node) => node.remove())
  const message = page.locator(".chat-messages p").filter({ hasText: "The conversation stays" }).first()
  await message.click({ clickCount: 3 })
  const text = await page.evaluate(() => {
    const selection = document.getSelection()!
    if (document.querySelector(".chat-messages")!.contains(selection.focusNode)) {
      throw new Error("Expected a real mouse selection extending outside the transcript")
    }
    return selection.toString()
  })
  expect(text).toContain("The conversation stays")
  const read = await observe(page, true)
  await page.evaluate(() => navigator.clipboard.writeText("Old clipboard text"))
  await page.keyboard.press("ControlOrMeta+c")
  expect(await read()).toEqual({ prevented: [true], forwarded: [] })
  // Windows normalizes multiline clipboard text to CRLF.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
    .toBe(text)
  await expect(input).not.toBeFocused()
})

test("undo and redo are applied locally and never reach the host", async ({ page }) => {
  const input = await open(page)
  await input.pressSequentially("Draft text")
  await expect(input).toHaveValue("Draft text")
  const read = await observe(page, true)

  await input.press("ControlOrMeta+z")
  await expect(input).toHaveValue("")
  expect(await read()).toEqual({ prevented: [true], forwarded: [] })

  await input.press("ControlOrMeta+Shift+Z")
  await expect(input).toHaveValue("Draft text")
  expect(await read()).toEqual({ prevented: [true], forwarded: [] })
})

test("non-Latin layouts match the undo chord by keyCode", async ({ page }) => {
  const input = await open(page)
  await input.pressSequentially("Draft text")
  await expect(input).toHaveValue("Draft text")
  const read = await observe(page, true)

  await input.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "ז",
      code: "KeyZ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, "keyCode", { get: () => 90 })
    element.dispatchEvent(event)
  })
  await expect(input).toHaveValue("")
  expect(await read()).toEqual({ prevented: [true], forwarded: [] })
})

test("only supported history chords are cancelled, other text shortcuts forward", async ({ page }) => {
  const input = await open(page)
  await input.pressSequentially("Draft text")
  const read = await observe(page)

  for (const modifier of ["Control", "Meta"]) {
    for (const chord of ["z", "Shift+Z", "y"]) {
      await input.press(`${modifier}+${chord}`)
      expect(await read(), `${modifier}+${chord}`).toEqual({ prevented: [true], forwarded: [] })
    }
    for (const chord of ["c", "x", "v", "Alt+z", "Alt+Shift+Z", "Alt+y", "Shift+Y"]) {
      await input.dispatchEvent("keydown", {
        key: chord.split("+").at(-1),
        ctrlKey: modifier === "Control",
        metaKey: modifier === "Meta",
        altKey: chord.includes("Alt"),
        shiftKey: chord.includes("Shift"),
      })
      expect(await read(), `${modifier}+${chord}`).toEqual({
        prevented: [false],
        forwarded: [chord.split("+").at(-1)],
      })
    }
  }
})

test("enhanced prompt undo restores the original without reaching the host", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "acquireVsCodeApi", {
      value: () => ({
        getState: () => undefined,
        setState: () => undefined,
        postMessage: (message: { type: string; requestId?: string }) => {
          if (message.type !== "enhancePrompt") return
          window.postMessage(
            { type: "enhancePromptResult", requestId: message.requestId, text: "Enhanced draft" },
            window.origin,
          )
        },
      }),
    })
  })
  const input = await open(page)
  await input.pressSequentially("Original draft")
  await page.getByRole("button", { name: "Enhance prompt", exact: true }).click()
  await expect(input).toHaveValue("Enhanced draft")
  const read = await observe(page, true)

  await input.press("ControlOrMeta+z")
  await expect(input).toHaveValue("Original draft")
  expect(await read()).toEqual({ prevented: [true], forwarded: [] })
})
