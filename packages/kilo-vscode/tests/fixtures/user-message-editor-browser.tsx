import { render } from "solid-js/web"
import { StoryProviders } from "../../webview-ui/src/stories/StoryProviders"
import { PromptInput } from "../../webview-ui/src/components/chat/PromptInput"
import { post } from "../../webview-ui/src/utils/webview-message"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/src/styles/chat.css"
import { VscodeUserMessage } from "../../webview-ui/src/components/chat/VscodeUserMessage"

applyKiloTheme("kilo-vscode", applyVscodeTheme("light-modern"))
window.addEventListener("fixture-host", (event) => post((event as CustomEvent).detail))
window.addEventListener("fixture-outgoing", (event) => {
  const message = (event as CustomEvent).detail
  if (message.type === "enhancePrompt") {
    queueMicrotask(() =>
      post({ type: "enhancePromptResult", text: `Enhanced: ${message.text}`, requestId: message.requestId }),
    )
  }
  if (message.type === "toggleAutoApprove") queueMicrotask(() => post({ type: "autoApproveState", active: true }))
})

render(
  () => (
    <StoryProviders sessionID="s1" noPadding>
      <div style={{ width: "100%" }}>
        <VscodeUserMessage
          message={{ id: "m1", sessionID: "s1", role: "user", createdAt: "2026-10-27T00:00:00Z" }}
          parts={[{ id: "p1", messageID: "m1", type: "text", text: "Original prompt\nwith all lines" }]}
          onRevert={() => {
            document.body.dataset.reverted = "true"
          }}
          onResubmit={(text, images, model, options) => {
            document.body.dataset.sent = JSON.stringify({ text, images, model, options })
            const pending = Promise.withResolvers<boolean>()
            window.addEventListener("complete", (event) => pending.resolve((event as CustomEvent<boolean>).detail), {
              once: true,
            })
            return pending.promise.then((result) => {
              if (result) document.body.dataset.closed = "true"
              return result
            })
          }}
        />
      </div>
      <PromptInput boxId="fixture:normal" />
    </StoryProviders>
  ),
  document.body,
)
post({ type: "connectionState", state: "connected" })
