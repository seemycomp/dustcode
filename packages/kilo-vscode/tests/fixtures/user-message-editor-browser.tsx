import { render } from "solid-js/web"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { VSCodeProvider } from "../../webview-ui/src/context/vscode"
import { LanguageProvider } from "../../webview-ui/src/context/language"
import { UserMessageEditor } from "../../webview-ui/src/components/chat/UserMessageEditor"

render(
  () => (
    <VSCodeProvider>
      <LanguageProvider>
        <DialogProvider>
          <UserMessageEditor
            message={{ id: "m1", sessionID: "s1", role: "user", createdAt: "2026-10-27T00:00:00Z" }}
            parts={[{ id: "p1", messageID: "m1", type: "text", text: "Original prompt\nwith all lines" }]}
            onSubmit={(text, images) => {
              document.body.dataset.sent = JSON.stringify({ text, images })
              const pending = Promise.withResolvers<boolean>()
              window.addEventListener("complete", (event) => pending.resolve((event as CustomEvent<boolean>).detail), {
                once: true,
              })
              return pending.promise
            }}
            onCancel={() => {
              document.body.dataset.closed = "true"
            }}
          />
        </DialogProvider>
      </LanguageProvider>
    </VSCodeProvider>
  ),
  document.body,
)
