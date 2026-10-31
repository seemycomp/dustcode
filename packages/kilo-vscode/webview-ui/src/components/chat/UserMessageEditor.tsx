import { createSignal } from "solid-js"
import { SessionContext, useSession } from "../../context/session"
import { useProvider } from "../../context/provider"
import type { ImageAttachment } from "../../hooks/useImageAttachments"
import type { Message, ModelSelection, Part, ResubmitMessageRequest } from "../../types/messages"
import { PromptInput } from "./PromptInput"
import "./user-message-editor.css"

export function UserMessageEditor(props: {
  message: Message
  parts: Part[]
  expanded?: boolean
  onSubmit: (
    text: string,
    images: ImageAttachment[],
    model: ModelSelection | null,
    options: Pick<ResubmitMessageRequest, "agent" | "variant" | "files" | "command">,
  ) => Promise<boolean>
  onCancel: () => void
}) {
  const session = useSession()
  const provider = useProvider()
  const [model, setModel] = createSignal<ModelSelection | null>(props.message.model ?? session.selected())
  const [agent, setAgent] = createSignal(props.message.agent ?? session.selectedAgent())
  const [variant, setVariant] = createSignal(props.message.model?.variant ?? props.message.variant)
  // Editing must not mutate the live composer's picks before the user sends.
  const local = {
    ...session,
    selected: model,
    selectedAgent: agent,
    currentVariant: variant,
    variantList: () => Object.keys(provider.findModel(model())?.variants ?? {}),
    selectModel: (providerID: string, modelID: string) => {
      setModel({ providerID, modelID })
      setVariant(undefined)
    },
    selectAgent: (name: string) => {
      setAgent(name)
      setModel(session.modelForAgent(name) ?? model())
      setVariant(session.variantForAgent(name, model()))
    },
    selectVariant: (value: string | undefined) => setVariant(value),
  }

  return (
    <div class="user-message-editor" data-expanded={props.expanded ? "" : undefined}>
      <SessionContext.Provider value={local}>
        <PromptInput boxId={`edit:${props.message.id}`} inline={props} />
      </SessionContext.Provider>
    </div>
  )
}
