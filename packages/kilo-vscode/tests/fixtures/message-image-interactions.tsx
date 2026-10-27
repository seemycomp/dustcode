import assert from "node:assert/strict"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"
import { harness } from "./comment-harness"

const { window, mount, root, node } = await harness<WebviewMessage>()
const messages: WebviewMessage[] = []
Object.assign(globalThis, {
  NodeFilter: window.NodeFilter,
  acquireVsCodeApi: () => ({
    postMessage: (message: WebviewMessage) => messages.push(message),
    getState: () => undefined,
    setState: () => undefined,
  }),
})
const style = window.getComputedStyle.bind(window)
globalThis.getComputedStyle = (element) => {
  const value = style(element)
  Object.defineProperty(value, "animationName", { configurable: true, value: "none" })
  return value
}
const { DialogProvider } = await import("@kilocode/kilo-ui/context/dialog")
const { MessageImage } = await import("../../webview-ui/src/components/chat/MessageImage")
const { decodeImageDataUrl } = await import("../../webview-ui/src/components/chat/image-data")
const { Toast, toaster } = await import("@kilocode/kilo-ui/toast")
const { createSignal } = await import("solid-js")
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNuoAAAAASUVORK5CYII="
const [url, update] = createSignal(png)
const clicks = { value: 0 }
const copies: Blob[] = []
const items: Record<string, Blob | Promise<Blob>>[] = []
Object.assign(globalThis, {
  fetch: () => {
    throw new Error("fetch must not be used for image data URLs")
  },
  ClipboardItem: class {
    constructor(value: Record<string, Blob | Promise<Blob>>) {
      items.push(value)
    }
  },
})
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    write: async () => {
      const value = items.at(-1)?.["image/png"]
      assert.ok(value)
      copies.push(await value)
    },
  },
})

const release = mount(() => (
  <DialogProvider>
    <div onClick={() => clicks.value++}>
      <MessageImage url={url()} filename="pixel.png" />
    </div>
    <Toast.Region />
  </DialogProvider>
))
const flush = async () => {
  await Bun.sleep(200)
}
const menu = async (target: Element) => {
  const event = new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })
  target.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true, "native image context menu must be suppressed")
  await flush()
  assert.deepEqual(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ["Copy Image", "Download", "Open In New Tab"],
  )
}
const select = async (label: string) => {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === label,
  )
  assert.ok(item)
  item.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }))
  item.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, button: 0 }))
  item.click()
  await flush()
}

try {
  assert.equal((await decodeImageDataUrl(png).arrayBuffer()).byteLength, 68)
  const thumbnail = node<HTMLButtonElement>("button.message-image-thumbnail")
  assert.equal(thumbnail.type, "button")
  assert.ok(thumbnail.getAttribute("aria-label"))
  thumbnail.click()
  await flush()
  assert.equal(clicks.value, 0, "image click must not enter parent message editing")
  const popup = node<HTMLImageElement>(".message-image-popup img", document)
  assert.equal(popup.src, png)
  assert.ok(document.querySelector('[role="dialog"]'))

  await menu(popup)
  await select("Copy Image")
  assert.equal(copies.length, 1)
  assert.equal(copies.at(-1)?.type, "image/png")
  assert.ok((await copies.at(-1)!.arrayBuffer()).byteLength > 0, "copy must contain actual image bytes")

  await menu(popup)
  await select("Download")
  assert.deepEqual(messages.at(-1), { type: "saveImage", dataUrl: png, filename: "pixel.png" })
  await menu(popup)
  await select("Open In New Tab")
  assert.deepEqual(messages.at(-1), { type: "previewImage", dataUrl: png, filename: "pixel.png" })

  node<HTMLButtonElement>('[data-slot="dialog-close-button"]', document).click()
  await Bun.sleep(120)
  assert.equal(document.querySelector('[role="dialog"]'), null)
  await menu(thumbnail.querySelector("img")!)
  await select("Copy Image")
  assert.equal(copies.length, 2, "thumbnail should expose the same image actions")

  const remote = "https://images.test/pixel.png"
  update(remote)
  await menu(thumbnail)
  await select("Open In New Tab")
  assert.deepEqual(messages.at(-1), { type: "openExternal", url: remote })

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write: () => Promise.reject(new Error("Clipboard denied")) },
  })
  update(png)
  await menu(thumbnail)
  await select("Copy Image")
  assert.match(document.body.textContent ?? "", /Could not copy image/)
  assert.equal(
    messages.some((message) => message.type === "copyToClipboard"),
    false,
  )
} finally {
  toaster.clear()
  release()
  root.remove()
  await window.happyDOM.cancelAsync()
}
