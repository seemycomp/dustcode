import { render } from "solid-js/web"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { VSCodeProvider } from "../../webview-ui/src/context/vscode"
import { LanguageProvider } from "../../webview-ui/src/context/language"
import { MessageImage } from "../../webview-ui/src/components/chat/MessageImage"

const canvas = document.createElement("canvas")
canvas.width = canvas.height = 1
canvas.getContext("2d")!.fillRect(0, 0, 1, 1)
const url = location.search.includes("gif")
  ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  : canvas.toDataURL("image/png")

render(
  () => (
    <VSCodeProvider>
      <LanguageProvider>
        <DialogProvider>
          <MessageImage url={url} filename="pixel" />
        </DialogProvider>
      </LanguageProvider>
    </VSCodeProvider>
  ),
  document.body,
)
