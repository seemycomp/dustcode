import { ContextMenu } from "@kilocode/kilo-ui/context-menu"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { Button } from "@kilocode/kilo-ui/button"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { showToast } from "@kilocode/kilo-ui/toast"
import { Show } from "solid-js"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { decodeImageDataUrl } from "./image-data"
import "./MessageImage.css"

export function MessageImage(props: { url: string; filename?: string }) {
  const language = useLanguage()
  const vscode = useVSCode()
  const dialog = useDialog()
  const name = () => props.filename || "image"
  const alt = () => props.filename || language.t("chat.image.alt")
  const failure = (key: "chat.image.copyFailed" | "chat.image.downloadFailed" | "chat.image.openFailed") =>
    showToast({ variant: "error", title: language.t(key) })

  const data = () => {
    try {
      return decodeImageDataUrl(props.url)
    } catch {
      return undefined
    }
  }

  const png = async () => {
    const file = data()
    if (!file) throw new Error("Image data is unavailable")
    if (file.type === "image/png") return file
    const image = new Image()
    const loaded = Promise.withResolvers<void>()
    image.onload = () => loaded.resolve()
    image.onerror = () => loaded.reject(new Error("Image could not be decoded"))
    image.src = props.url
    await loaded.promise
    const canvas = document.createElement("canvas")
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image conversion is unavailable")
    context.drawImage(image, 0, 0)
    const result = Promise.withResolvers<Blob>()
    canvas.toBlob(
      (value) => (value ? result.resolve(value) : result.reject(new Error("Image conversion failed"))),
      "image/png",
    )
    return result.promise
  }

  const copy = async () => {
    try {
      // Supply a promise while the menu gesture is still active; never copy a URL as text.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png() })])
    } catch {
      failure("chat.image.copyFailed")
    }
  }

  const download = async () => {
    if (data()) {
      vscode.postMessage({ type: "saveImage", dataUrl: props.url, filename: name() })
      return
    }
    failure("chat.image.downloadFailed")
  }

  const open = () => {
    if (data()) {
      vscode.postMessage({ type: "previewImage", dataUrl: props.url, filename: name() })
      return
    }
    if (/^https?:\/\//i.test(props.url)) {
      vscode.postMessage({ type: "openExternal", url: props.url })
      return
    }
    failure("chat.image.openFailed")
  }

  const image = (popup: boolean) => (
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        class={popup ? "message-image-popup" : "message-image-trigger"}
        data-vscode-context='{"preventDefaultContextMenuItems":true}'
        onContextMenu={(event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        <Show
          when={popup}
          fallback={
            <Button
              type="button"
              variant="ghost"
              class="message-image-thumbnail"
              aria-label={language.t("chat.image.preview", { name: alt() })}
              aria-haspopup="dialog"
              onClick={(event: MouseEvent) => {
                event.stopPropagation()
                dialog.show(() => (
                  <Dialog title={alt()} size="x-large" fit class="message-image-dialog">
                    {image(true)}
                  </Dialog>
                ))
              }}
            >
              <img src={props.url} alt={alt()} draggable={false} />
            </Button>
          }
        >
          <img src={props.url} alt={alt()} draggable={false} />
        </Show>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content onClick={(event: MouseEvent) => event.stopPropagation()}>
          <ContextMenu.Item onSelect={() => void copy()}>
            <ContextMenu.ItemLabel>{language.t("chat.image.copy")}</ContextMenu.ItemLabel>
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => void download()}>
            <ContextMenu.ItemLabel>{language.t("chat.image.download")}</ContextMenu.ItemLabel>
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={open}>
            <ContextMenu.ItemLabel>{language.t("chat.image.open")}</ContextMenu.ItemLabel>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )

  return image(false)
}
