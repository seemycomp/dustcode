import { createSignal, For, Show, onMount } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { showToast } from "@kilocode/kilo-ui/toast"
import { useLanguage } from "../../context/language"
import { useImageAttachments, type ImageAttachment } from "../../hooks/useImageAttachments"
import { ACCEPTED_IMAGE_TYPES } from "../../hooks/image-attachments-utils"
import { revertPromptState } from "../../context/session-utils"
import { useVSCode } from "../../context/vscode"
import { ModelSelectorBase } from "../shared/ModelSelector"
import { useSlashCommand, skill as isSkill } from "../../hooks/useSlashCommand"
import type { Message, ModelSelection, Part } from "../../types/messages"
import { MessageImage } from "./MessageImage"
import "./user-message-editor.css"

export function UserMessageEditor(props: {
  message: Message
  parts: Part[]
  onSubmit: (text: string, images: ImageAttachment[], model: ModelSelection | null) => Promise<boolean>
  onCancel: () => void
}) {
  const language = useLanguage()
  const vscode = useVSCode()
  const [draft, setDraft] = createSignal(revertPromptState(props.parts).text)
  const [model, setModel] = createSignal<ModelSelection | null>(
    props.message.model?.providerID && props.message.model.modelID
      ? { providerID: props.message.model.providerID, modelID: props.message.model.modelID }
      : null,
  )
  const [pending, setPending] = createSignal(false)
  const images = useImageAttachments()
  const slash = useSlashCommand(vscode, { action: () => undefined, enabled: () => false })
  let textarea: HTMLTextAreaElement | undefined
  let slashDropdown: HTMLDivElement | undefined
  onMount(() => {
    images.replace(
      props.parts.flatMap((part) =>
        part.type === "file" && part.mime.startsWith("image/") && part.source?.type !== "file"
          ? [{ id: part.id, filename: part.filename || "image", mime: part.mime, dataUrl: part.url }]
          : [],
      ),
    )
  })
  let picker: HTMLInputElement | undefined
  const attached = () =>
    images.images().length > 0 ||
    props.parts.some(
      (part) => part.type === "file" && (!part.mime.startsWith("image/") || part.source?.type === "file"),
    )
  const blocked = () => pending() || images.pending() || (!draft().trim() && !attached())
  const submit = async () => {
    if (blocked()) return
    setPending(true)
    try {
      if (await props.onSubmit(draft(), images.images(), model())) props.onCancel()
    } catch (error) {
      showToast({ variant: "error", title: language.t("common.requestFailed"), description: String(error) })
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      class="user-message-editor"
      data-dragging={images.dragging() ? "" : undefined}
      aria-busy={pending() || images.pending()}
      onPaste={(event) => {
        event.stopPropagation()
        if (!pending()) images.handlePaste(event)
      }}
      onDragOver={(event) => {
        if (!pending()) images.handleDragOver(event)
      }}
      onDragLeave={images.handleDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!pending()) images.handleDrop(event)
      }}
    >
      <Show when={images.images().length > 0}>
        <div class="user-message-editor-images">
          <For each={images.images()}>
            {(image) => (
              <div class="user-message-editor-attachment">
                <MessageImage url={image.dataUrl} filename={image.filename} />
                <IconButton
                  icon="close-small"
                  size="small"
                  variant="ghost"
                  disabled={pending()}
                  aria-label={language.t("chat.image.remove", { name: image.filename })}
                  onClick={() => images.remove(image.id)}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="user-message-editor-input">
        <Show when={slash.show()}>
          <div class="slash-command-dropdown" ref={slashDropdown}>
            <Show when={slash.results().length > 0} fallback={<div class="slash-command-empty">No commands found</div>}>
              {(() => {
                const all = slash.results()
                const actions = all.filter((cmd) => cmd.action)
                const commands = all.filter((cmd) => !cmd.action && !isSkill(cmd))
                const skills = all.filter(isSkill)
                const groups = [
                  { label: "Actions", items: actions, offset: 0 },
                  { label: "Commands", items: commands, offset: actions.length },
                  { label: "Skills", items: skills, offset: actions.length + commands.length },
                ].filter((group) => group.items.length > 0)
                return (
                  <For each={groups}>
                    {(group, groupIndex) => (
                      <>
                        <Show when={groupIndex() > 0}>
                          <div class="slash-command-separator" />
                        </Show>
                        <div class="slash-command-group-label">{group.label}</div>
                        <For each={group.items}>
                          {(cmd, index) => (
                            <div
                              class="slash-command-item"
                              classList={{ "slash-command-item--active": index() + group.offset === slash.index() }}
                              onMouseDown={(event) => {
                                event.preventDefault()
                                if (textarea) slash.select(cmd, textarea, setDraft)
                              }}
                              onMouseEnter={() => slash.setIndex(index() + group.offset)}
                            >
                              <span class="slash-command-name">/{cmd.name}</span>
                              <Show when={cmd.description}>
                                <span class="slash-command-desc">{cmd.description}</span>
                              </Show>
                            </div>
                          )}
                        </For>
                      </>
                    )}
                  </For>
                )
              })()}
            </Show>
          </div>
        </Show>
        <TextField
          ref={(element: HTMLTextAreaElement) => (textarea = element)}
          multiline
          autofocus
          label={language.t("common.edit")}
          hideLabel
          value={draft()}
          onChange={(value) => {
            setDraft(value)
            slash.onInput(value, textarea?.selectionStart ?? value.length)
          }}
          disabled={pending()}
          onKeyDown={(event: KeyboardEvent) => {
            if (slash.onKeyDown(event, textarea, setDraft)) {
              queueMicrotask(() => {
                slashDropdown
                  ?.querySelectorAll<HTMLElement>(".slash-command-item")
                  .item(slash.index())
                  ?.scrollIntoView({ block: "nearest" })
              })
              return
            }
            if (event.key === "Escape" && !pending()) {
              event.preventDefault()
              props.onCancel()
            }
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
            event.preventDefault()
            void submit()
          }}
        />
      </div>
      <input
        ref={picker}
        class="user-message-editor-picker"
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        tabIndex={-1}
        aria-label={language.t("chat.image.attach")}
        disabled={pending()}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          if (!pending()) for (const file of files) images.add(file)
          event.currentTarget.value = ""
        }}
      />
      <div class="user-message-editor-actions">
        <IconButton
          icon="plus"
          size="small"
          variant="ghost"
          disabled={pending()}
          aria-label={language.t("chat.image.attach")}
          onClick={() => picker?.click()}
        />
        <ModelSelectorBase
          value={model()}
          placement="top-end"
          blocked={pending()}
          onSelect={(providerID, modelID) => setModel({ providerID, modelID })}
        />
        <Button variant="ghost" size="small" data-action="cancel-edit" disabled={pending()} onClick={props.onCancel}>
          {language.t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          size="small"
          data-action="resubmit-message"
          disabled={blocked()}
          onClick={() => void submit()}
        >
          {language.t("prompt.action.send")}
        </Button>
      </div>
    </div>
  )
}
